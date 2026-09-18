// ================================================================
// Better Auth 装配 + 应用鉴权中间件（Bearer Token 会话）
//
// 以 Better Auth 作为整个应用的身份/认证/授权地基：
//   - emailAndPassword：邮箱 + 密码
//   - username 插件：用户名 + 密码（注册时邮箱必填、用户名可选）
//   - bearer 插件：纯 API/桌面端通过 Authorization: Bearer <session token>
//     认证；登录成功响应头 set-auth-token 即会话 token
//   - emailVerification / sendResetPassword：邮箱验证 + 忘记密码（Resend 发送）
//   - database: env.DB（Cloudflare D1 原生适配，Kysely 内建）
// 认证表（user/session/account/verification）由 better-auth/db/migration
// 程序化迁移创建，见 ensureAuthSchema()。
// ================================================================

import type { User as AppUser, ID } from "@dsh-guild/types/entities";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer, emailOTP, username } from "better-auth/plugins";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env, HonoAppVariables } from "../types";
import {
  dispatchResetPasswordEmail,
  dispatchVerificationEmail,
  dispatchVerificationOTPEmail,
} from "./email";
import { HttpApiError } from "./errors";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  uniqueUsernameForEmail,
} from "./users";

// better-auth 选项类型（不显式 import，避免与实例泛型不一致）
type BetterAuthOptions = Parameters<typeof betterAuth>[0];

// ================================================================
// Better Auth 实例装配 & 缓存（每个 isolate 惰性构建一次）
// ================================================================

// 未配置 BETTER_AUTH_URL 时，按请求 Host 从该白名单挑 base（本地 + workers/pages 预览）。
// 生产建议直接设 BETTER_AUTH_URL，此处白名单便不再参与。
const AUTH_ALLOWED_HOSTS = [
  "localhost:8787",
  "127.0.0.1:8787",
  "*.workers.dev",
  "*.pages.dev",
] as const;

// Bearer-only 会话（无 cookie CSRF 面），为本地 DSH web shell / 前端 dev server
// 放行跨源调用；生产用 BETTER_AUTH_URL 域名（该域名永远在允许名单里）。
const AUTH_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3080",
  "http://127.0.0.1:3080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

// ---- 用户名规则（详见 lib/users.ts 的 assertUsernameChangeAllowed）----

function buildAuthOptions(env: Env): BetterAuthOptions {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "[auth] BETTER_AUTH_SECRET 未配置或过短（需 ≥32 字符）。" +
        "本地：写入 packages/server/.dev.vars（或根 .env 由 predev 同步）；生产：wrangler secret put BETTER_AUTH_SECRET",
    );
  }

  // baseURL：配了 BETTER_AUTH_URL 就用它（邮箱验证 / 重置链接都基于此地址）；
  // 没配则按请求 Host 从白名单推导（适合本地 dev）
  const authUrl = env.BETTER_AUTH_URL?.trim();
  const baseURL: BetterAuthOptions["baseURL"] = authUrl
    ? authUrl
    : { allowedHosts: [...AUTH_ALLOWED_HOSTS] };

  return {
    appName: "DSH-Guild",
    baseURL,
    secret,
    database: env.DB,
    // 邮箱/密码是主体登录方式；忘记密码的邮件发送挂在 emailAndPassword
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // 强制邮箱验证：未验证用户无法登录（sign-in 抛 EMAIL_NOT_VERIFIED），
      // 且注册成功不会自动登录（需要先走验证码流程）。验证由 emailOTP 插件承担。
      requireEmailVerification: true,
      // 不 await，交给 runDetached -> waitUntil（Cloudflare 响应返回后仍继续投递）
      sendResetPassword: async ({ user, url }, request) => {
        dispatchResetPasswordEmail(env, request, user, url);
      },
    },
    emailVerification: {
      // 验证码走 emailOTP 插件（注册后发送 6 位数字码），不再发验证链接
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        dispatchVerificationEmail(env, request, user, url);
      },
    },
    // 扩展 user 表：仅服务端维护的「上次修改用户名时间」，用于每周一次的限制。
    // input:false 表示客户端不能提交该字段（避免伪造时间戳绕过冷却）。
    user: {
      additionalFields: {
        usernameChangedAt: { type: "number", required: false, input: false },
      },
    },
    plugins: [
      // 用户名只允许大小写字母和数字；长度 4..16（与前端提示一致）
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        usernameValidator: (value) => USERNAME_PATTERN.test(value),
      }),
      // 纯 API / 桌面端认证：登录响应头 set-auth-token 即会话 token，
      // 之后所有请求带 Authorization: Bearer <token> 即等价于带 session cookie
      bearer(),
      // 6 位数字验证码邮箱验证：注册即发送验证码，验证成功自动登录；
      // forget-password 类型供「忘记密码」走同一条 OTP 通道（见 email.ts 文案）
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        sendVerificationOnSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          const request = ctx?.request as Request | undefined;
          dispatchVerificationOTPEmail(env, request, email, otp, type);
        },
      }),
    ],
    advanced: {
      // 与默认 /api/auth 一致即可；前缀定短一点避免与业务混淆
      cookiePrefix: "dsh_guild",
    },
    // 注册时客户端不提交用户名：由这里在 user.create.before 从邮箱 @ 前缀派生，
    // 并在前缀被占用时自动生成随机后缀，保证用户名唯一。
    // 该钩子在 username 插件钩子之后执行（runPluginInit 把顶层 databaseHooks 排在最后）。
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const u = user as { email?: string; username?: string | null };
            const email = u.email ?? "";
            const existingUsername = u.username ?? null;
            if (!email || existingUsername) return { data: user };
            const username = await uniqueUsernameForEmail(env.DB, email);
            return { data: { ...user, username } };
          },
        },
        update: {
          // 用户名真的变化时记录时间戳（字段 input:false，客户端无法自行写入）。
          // 只返回要写入的字段，避免覆盖 username 插件已做的归一化。
          before: async (data) => {
            const incoming = (data as { username?: unknown }).username;
            if (typeof incoming !== "string" || incoming.trim().length === 0) return;
            return { data: { usernameChangedAt: Date.now() } as typeof data };
          },
        },
      },
    },
    // 信任的跨源调用方（本插件是纯 Bearer 会话，无 cookie，CSRF 面小）；
    // 本地 DSH web shell / 前端 dev server 用。BETTER_AUTH_URL 域名始终在允许名单。
    trustedOrigins: [...AUTH_TRUSTED_ORIGINS],
  };
}

export function createAuth(env: Env) {
  return betterAuth(buildAuthOptions(env));
}

/** 装配好的 Better Auth 实例类型（含 username/bearer 插件的推断） */
export type Auth = ReturnType<typeof createAuth>;

/** 当前 isolate 内按 Env 缓存 Better Auth 实例（弱引用，测试多实例安全） */
const authCache = new WeakMap<object, Auth>();

export function getAuth(env: Env): Auth {
  const cached = authCache.get(env);
  if (cached) return cached;
  const auth = createAuth(env);
  authCache.set(env, auth);
  return auth;
}

// ================================================================
// D1 认证表程序化迁移（Cloudflare 无法直接跑 CLI）
// 每次 isolate 首次访问时把 user/session/account/verification（含插件字段）建出来，
// 幂等；如需在生产关闭自动迁移，把这里改为 return Promise.resolve() 并人工执行迁移。
// ================================================================

const schemaReady = new WeakMap<object, Promise<void>>();

export function ensureAuthSchema(env: Env): Promise<void> {
  let ready = schemaReady.get(env);
  if (!ready) {
    ready = (async () => {
      const auth = getAuth(env);
      const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
      if (toBeCreated.length > 0 || toBeAdded.length > 0) {
        console.info(
          `[auth] 创建认证表：created=${toBeCreated.map((t) => t.table).join(",") || "-"} ` +
            `added=${toBeAdded.map((t) => t.table).join(",") || "-"}`,
        );
        await runMigrations();
      }
    })();
    schemaReady.set(env, ready);
  }
  return ready;
}

// ================================================================
// Session -> 应用 User 实体映射
// ================================================================

interface BetterAuthUserLike {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  username?: string | null;
  createdAt?: unknown;
}

function toAppUser(user: BetterAuthUserLike): AppUser {
  const emailPrefix = user.email.split("@")[0] || user.id;
  const createdAt =
    typeof user.createdAt === "number"
      ? user.createdAt
      : user.createdAt instanceof Date
        ? user.createdAt.getTime()
        : typeof user.createdAt === "string"
          ? Date.parse(user.createdAt)
          : Date.now();
  return {
    id: user.id as ID,
    handle: user.username?.trim() || emailPrefix,
    displayName: user.name || null,
    avatarUrl: user.image ?? null,
    createdAt,
  };
}

export { toAppUser };

export type AuthSessionUser = ReturnType<typeof toAppUser>;

/** better-auth getSession 的返回形态（粗略，够中间件用） */
interface ResolvedSession {
  session: { id: string; token: string; expiresAt: Date };
  user: BetterAuthUserLike;
}

// ================================================================
// Bearer / 会话鉴权中间件（替换旧的 tokenHash 鉴权）
// ================================================================

type HonoContext = Context<{ Bindings: Env; Variables: HonoAppVariables }>;

/** 从请求里取会话 token：优先 Authorization 头，其次 ?token=（WS/桌面端） */
export function extractSessionToken(c: HonoContext): string | null {
  const authHeader = c.req.header("Authorization") ?? c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (match?.[1]) return match[1].trim();
  const queryToken = c.req.query("token");
  if (queryToken) return queryToken.trim();
  return null;
}

export type BearerStrategy = "required" | "optional";

export function createBearerAuth(strategy: BearerStrategy = "required") {
  return createMiddleware<{ Bindings: Env; Variables: HonoAppVariables }>(async (c, next) => {
    const token = extractSessionToken(c);
    // 认证表必须已就绪，否则 getSession 会因表缺失而 500
    await ensureAuthSchema(c.env);

    // raw headers 里含 Cookie；把 header/query 里的 bearer 合成进去再验
    const headers = new Headers(c.req.raw.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const session = (await getAuth(c.env).api.getSession({ headers })) as ResolvedSession | null;

    if (session) {
      c.set("userId", session.user.id as ID);
      c.set("currentUser", toAppUser(session.user));
      return next();
    }

    if (strategy === "optional" && !token) {
      return next();
    }
    throw HttpApiError.unauthorized("invalid or missing session token");
  });
}

/** 通过鉴权后直接从 ctx 取 userId（保证非空） */
export function requireUserId(c: Context<{ Bindings: Env; Variables: HonoAppVariables }>): ID {
  const id = c.var.userId;
  if (!id) throw HttpApiError.unauthorized("no user");
  return id;
}

/** 取当前登录用户实体（非空；等价 requireUserId 但拿完整资料） */
export function requireCurrentUser(
  c: Context<{ Bindings: Env; Variables: HonoAppVariables }>,
): AppUser {
  const user = c.var.currentUser;
  if (!user) throw HttpApiError.unauthorized("no user");
  return user;
}
