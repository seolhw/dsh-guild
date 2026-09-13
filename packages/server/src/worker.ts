// ================================================================
// DSH-Talk Server Worker 入口
//   身份认证：Better Auth 挂载在 /api/auth/*（承载全应用登录/注册/
//             邮箱验证/改密/找回密码/会话；Bearer token 会话）
//   业务 REST：/api/communities|channels|messages|shares|r2（用 Better Auth 会话鉴权）
//   /ws：WebSocket upgrade -> 该频道的 ChannelActor (DO)
// 部署方式：pnpm deploy (wrangler deploy)
// 本地：pnpm dev (wrangler dev --port 8787)
// ================================================================

import type { ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { logger } from "hono/logger";
import {
  createBearerAuth,
  ensureAuthSchema,
  getAuth,
  requireCurrentUser,
  requireUserId,
} from "./lib/auth";
import { bindExecutionCtx, unbindExecutionCtx } from "./lib/email";
import { HttpApiError } from "./lib/errors";
import { applyGlobalMiddleware } from "./lib/middleware";
import { assertUsernameChangeAllowed } from "./lib/users";
import { adminRoutes } from "./routes/admin";
import { channelsRoutes, communitiesRoutes } from "./routes/communities";
import { invitesRoutes } from "./routes/invites";
import { channelMessagesRoutes, messagesRoutes } from "./routes/messages";
import { notificationsRoutes } from "./routes/notifications";
import { r2ObjectReadRoutes, r2UploadRoutes } from "./routes/r2";
import { sharesRoutes } from "./routes/shares";
import { channelThreadsRoutes, threadRoutes } from "./routes/threads";
import type { Env, HonoAppVariables } from "./types";

// ChannelActor DO 类在同脚本里（wrangler 经 durable_objects binding + exports 找到）
export { ChannelActor } from "./room";

const app = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

applyGlobalMiddleware(app);
app.use("*", logger());

// ----------------- 首页 / 根路径提示（避免被当作 404 报错） -----------------
app.get("/", (c) =>
  c.json({
    name: "dsh-talk-server",
    message: "这是 DSH-Talk 项目的 API 端口",
    endpoints: {
      healthz: "/healthz",
      auth: "/api/auth/*",
      api: "/api/communities|channels|messages|shares|r2",
      ws: "/ws?token=<sessionToken>&channelId=<id>",
    },
  }),
);

// ----------------- 健康检查 -----------------
app.get("/healthz", (c) =>
  c.json({
    ok: true,
    ts: Date.now(),
    env: { DB: !!c.env.DB, R2: !!c.env.R2, ROOM: !!c.env.ROOM_ACTOR },
  }),
);

// ----------------- 改用户名前置校验（字符集 / 长度 / 每周一次 / 唯一） -----------------
// Better Auth 的 hooks.before 阶段解析不了 Bearer 会话（bearer 插件在它之后才把
// Authorization 转成会话 Cookie），所以在挂载 auth 之前用应用自身的 Bearer 鉴权拦截，
// 通过后再交给 Better Auth 落库（用户名插件会再校验一遍字符集与长度）。
app.post("/api/auth/update-user", createBearerAuth("required"), async (c) => {
  const request = c.req.raw.clone();
  const body = (await c.req.raw.json().catch(() => null)) as { username?: unknown } | null;
  const raw = body?.username;
  if (typeof raw === "string" && raw.trim().length > 0) {
    await assertUsernameChangeAllowed(c.env.DB, requireUserId(c), raw);
  }
  return getAuth(c.env).handler(request);
});

// ----------------- Better Auth（/api/auth/*，接管身份/会话/注册/找回密码） -----------------
app.all("/api/auth/*", async (c) => {
  // 认证表（user/session/account/verification…）首访自举创建（幂等、按 isolate 只跑一次）
  await ensureAuthSchema(c.env);
  return getAuth(c.env).handler(c.req.raw);
});

// ----------------- 业务 REST API 分组 (/api/*) -----------------
app.route("/api/communities", communitiesRoutes);
app.route("/api/channels", channelMessagesRoutes); // /api/channels/:id/messages ...
app.route("/api/channels", channelsRoutes); // /api/channels/:id PATCH/DELETE 叠加
app.route("/api/channels", channelThreadsRoutes); // /api/channels/:channelId/threads（讨论组创建/列表）
app.route("/api/threads", threadRoutes); // /api/threads/:id 讨论组生命周期/已读
app.route("/api/messages", messagesRoutes);
app.route("/api/shares", sharesRoutes);
app.route("/api/invites", invitesRoutes); // /api/invites/:id/accept|decline
app.route("/api/notifications", notificationsRoutes); // /api/notifications（站内信）
app.route("/api/r2", r2ObjectReadRoutes); // GET /api/r2/objects/:key（公开读取）
app.route("/api/r2", r2UploadRoutes); // PUT /api/r2/objects（Bearer 鉴权）
app.route("/api/admin", adminRoutes); // POST /api/admin/seed-official（Bearer + X-Admin-Token）

// ----------------- WebSocket Upgrade (/ws) -----------------
// 浏览器 WS 无法自定义 Header，用 ?token=<session token>&channelId=<id>：
//   - Worker：Bearer 鉴权（Better Auth 会话）
//   - 路由到该频道的 ChannelActor（ROOM_ACTOR.idFromName(channelId)），
//     DO 再校验「频道存在 + 调用方是社区成员」后 accept（见 room.ts handleConnect）
app.get("/ws", createBearerAuth("required"), async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    throw HttpApiError.badRequest("expected Upgrade: websocket");
  }
  const channelId = c.req.query("channelId");
  if (!channelId) {
    throw HttpApiError.badRequest("missing channelId query param");
  }
  const uid = requireUserId(c);
  const user = requireCurrentUser(c);

  // 每个频道一个 DO 实例（稳定名字路由，广播只在实例内扇出）
  const stub = c.env.ROOM_ACTOR.get(c.env.ROOM_ACTOR.idFromName(channelId));

  // 把子请求转发到 DO（带上 Upgrade 的原始 Request + 用户身份头）
  const url = new URL(c.req.url);
  url.pathname = "/ws/actor/connect";
  const forwardReq = new Request(url.toString(), c.req.raw as unknown as Request);
  forwardReq.headers.set("X-User-Id", uid);
  forwardReq.headers.set("X-Channel-Id", channelId);
  forwardReq.headers.set("X-Conn-Id", crypto.randomUUID());
  forwardReq.headers.set("X-Handle", user.handle);
  if (user.displayName) forwardReq.headers.set("X-Display-Name", user.displayName);
  if (user.avatarUrl) forwardReq.headers.set("X-Avatar", user.avatarUrl);

  return stub.fetch(forwardReq) as Promise<Response>;
});

// ----------------- Worker 模块入口（绑定 waitUntil 供邮件后台投递） -----------------
export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    bindExecutionCtx(request, executionCtx);
    try {
      return await app.fetch(request, env, executionCtx);
    } finally {
      unbindExecutionCtx(request);
    }
  },
};
