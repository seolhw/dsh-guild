// ================================================================
// DSH-Guild host（Node.js）
//  1. 注册 `guild` 配置命名空间（ctx.settings）：serverUrl / handle / token …
//  2. 挂本地接口 GET|POST /api/guild/config，供浏览器端（client）同源调用
//     语义与 @dsh-guild/types/rpc 的 GuildSettings 一致（GET 读 / POST patch）
// ================================================================

import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import type { SettingsScope } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import type {
  AgentSessionPackage,
  HostCloneResult,
  HostSessionsStatus,
  LocalSessionSummary,
  GuildSettings,
} from "@dsh-guild/types/rpc";
import { orderBy } from "es-toolkit/array";
import { isPlainObject } from "es-toolkit/predicate";

export const name = "dsh-guild";

/** 需要 DSH 内置 service 就绪后才启动（会话分享依赖 sessions / sessionPersistence）。 */
export const inject = ["settings", "webServer", "sessions", "sessionPersistence"];

/** settings 命名空间：0.1.5 起 register() 直接收小写连字符字符串，不再需要 brand 包装 */
const GUILD_NS = "guild";

// ---------- guild 配置 schema（默认值 + 用户层覆盖） ----------

/**
 * 发布版默认后端：插件的兜底指向（作者部署的公共 Server）。用户改成自己的
 * 自托管地址只需改 settings 文档（~/.dsh/settings.yaml 的 guild 段）或设置页。
 */
const PRODUCTION_SERVER_URL = "https://dsh-guild-api.huiwang.fun";

/**
 * schema 默认值：本地开发用仓库根 .env 的 BETTER_AUTH_URL（`dsh web` 启动时已载入），
 * 否则指向生产地址。schema 默认值只是兜底，用户层里写了就以用户为准。
 */
const DEFAULT_SERVER_URL = process.env.BETTER_AUTH_URL?.trim() || PRODUCTION_SERVER_URL;

/** 显式标注成 GuildSettings：register() 的 T 由 schema 推导，标注后与下游 scope 类型一致 */
const guildSettingsSchema: z<GuildSettings> = z.object({
  serverUrl: z.string().default(DEFAULT_SERVER_URL),
  handle: z.string().default(""),
  /** secret：settings 文档 redact 时会被剥掉，不会随描述接口外泄 */
  token: z.string().role("secret").default(""),
  autoReconnect: z.boolean().default(true),
  share: z.object({
    maxSizeMb: z.number().default(50),
  }),
});

// ---------- HTTP 小工具（node:http 原始 req/res） ----------

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const errorOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 允许客户端 patch 的字段（白名单 + 粗校验，防止把 settings 文档写坏）
function sanitizePatch(raw: unknown): Partial<GuildSettings> {
  if (!isPlainObject(raw)) return {};
  const patch: Partial<GuildSettings> = {};
  const { serverUrl, handle, token, autoReconnect, share } = raw;
  if (typeof serverUrl === "string" && serverUrl.length > 0) patch.serverUrl = serverUrl;
  if (typeof handle === "string") patch.handle = handle;
  if (typeof token === "string") patch.token = token;
  if (typeof autoReconnect === "boolean") patch.autoReconnect = autoReconnect;
  if (isPlainObject(share)) {
    const maxSizeMb = share.maxSizeMb;
    if (typeof maxSizeMb === "number" && maxSizeMb > 0) {
      patch.share = { maxSizeMb };
    }
  }
  return patch;
}

// ---------- 生效配置：settings 文档为主，BETTER_AUTH_URL 为本地开发覆盖 ----------

/**
 * BETTER_AUTH_URL 只在本地开发/自托管里出现：`dsh web` 从仓库根 .env 载入它，
 * 于是 dev 不必把自己的地址写进 settings 文档（那是全局共享的）。设置了它就
 * 优先于 settings 里的 serverUrl；发布版安装（无 .env）则以 settings 文档为准。
 */
function envServerUrl(): string | undefined {
  const value = process.env.BETTER_AUTH_URL?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** settings 与 BETTER_AUTH_URL 合并后的生效配置：环境变量优先。 */
function effectiveSettings(scope: SettingsScope<GuildSettings>): GuildSettings {
  const current = scope.get();
  const serverUrl = envServerUrl();
  return serverUrl ? { ...current, serverUrl } : current;
}

/**
 * 首次运行把默认 serverUrl 落进 settings 文档（~/.dsh/settings.yaml 的 guild 段）：
 * 用户在设置页或该文件里就能看到并改成任意后端，而不用去猜一个隐式默认值。
 * 只在用户层没有该键时写一次（改过的值不会被覆盖）；由 BETTER_AUTH_URL 指定的
 * 本地开发地址不写文档，避免把 loopback 地址污染进全局配置。
 */
function seedServerUrl(ctx: Context, scope: SettingsScope<GuildSettings>): void {
  if (envServerUrl()) return;
  const descriptor = ctx.settings.describe().find((entry) => entry.ns === GUILD_NS);
  if (descriptor?.user !== undefined && "serverUrl" in (descriptor.user as object)) return;
  scope.update({ serverUrl: DEFAULT_SERVER_URL }).catch((error: unknown) => {
    console.warn(`[dsh-guild] 写入默认 serverUrl 失败: ${errorOf(error)}`);
  });
}

// ---------- 本地 DSH 会话：服务取用 + 打包 / 还原 ----------

/** DSH 会话 header 的最小结构面（不引入 @deepseek-ai/dsh-session 类型包依赖） */
interface SessionHeaderLike {
  version: number;
  id: string;
  createdAt: number;
  cwd?: string;
  parentSession?: string;
  /** 是否含 fork 继承的事件前缀 */
  isSeeded?: boolean;
}

/** 已打开的会话读写句柄（read 只取事件，close 释放句柄与写所有权） */
interface SessionHandleLike {
  readonly header: SessionHeaderLike;
  /** fork 继承的事件前缀长度（0 = 全新会话） */
  readonly inheritedEventCount: number;
  read(offset?: number, length?: number): Promise<{ events: readonly unknown[] }>;
  close(): Promise<void>;
}

interface SessionPersistenceLike {
  list(options?: { signal?: AbortSignal }): Promise<readonly { header: SessionHeaderLike }[]>;
  open(
    id: string,
    access: "read" | "write",
    options?: { signal?: AbortSignal },
  ): Promise<SessionHandleLike>;
}

interface SessionStoreLike {
  create(
    id?: string,
    options?: { seed?: readonly unknown[]; meta?: Record<string, unknown> },
  ): { id: string };
  flush(session: { id: string }): Promise<boolean>;
}

/** 会话包格式版本（host ↔ host；服务端只透传 manifest） */
const SESSION_PACKAGE_VERSION = 1;

function serviceOf<T>(ctx: Context, key: string): T | undefined {
  return ctx.get(key) as T | undefined;
}

/** 解析下载到的字节：是本机会话包则返回，否则 null */
function parseAgentSessionPackage(bytes: Buffer): AgentSessionPackage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const pack = parsed as Partial<AgentSessionPackage>;
  if (pack.kind !== "agent-session") return null;
  if (!Array.isArray(pack.events)) return null;
  if (typeof pack.header !== "object" || pack.header === null) return null;
  return pack as AgentSessionPackage;
}

/** 克隆会话的落地工作区名（用户主目录下的同名目录 + 工作区标题） */
const CLONE_WORKSPACE_NAME = "DSH-Guild";

/**
 * 克隆会话的默认落地目录：用户主目录下的 DSH-Guild，不存在则新建。
 * 不写死绝对路径 —— 每个用户的家目录不同，用 homedir() 现算。
 */
function ensureCloneWorkspaceDir(): string {
  const dir = join(homedir(), CLONE_WORKSPACE_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** DSH 工作区注册表的最小结构面（不引入 @deepseek-ai/dsh-workspace 类型包依赖） */
interface WorkspaceRegistryLike {
  create(path: string, title?: string): Promise<WorkspaceLike>;
}

interface WorkspaceLike {
  readonly title: string;
  attachSession(sessionId: string): Promise<void>;
}

/**
 * 把刚还原的会话挂进「DSH-Guild」工作区。工作区按目录注册：同一目录已注册时
 * 直接复用那条记录（标题保持不变），因此重复克隆都落在同一个工作区里。
 * 注册表不可用或挂载失败时静默跳过（会话照常可用，只是留在「未分组」）。
 */
async function attachToCloneWorkspace(ctx: Context, sessionId: string, cwd: string): Promise<void> {
  const registry = serviceOf<WorkspaceRegistryLike>(ctx, "workspaceRegistry");
  if (!registry) return;
  try {
    const workspace = await registry.create(cwd, CLONE_WORKSPACE_NAME);
    await workspace.attachSession(sessionId);
  } catch {
    // 尽力而为：工作区归属失败不该让克隆失败
  }
}

function buildSessionPackage(
  meta: SessionHeaderLike,
  events: readonly unknown[],
  inheritedEventCount: number,
): AgentSessionPackage {
  return {
    kind: "agent-session",
    manifest: {
      packageVersion: SESSION_PACKAGE_VERSION,
      sessionId: meta.id,
      ...(meta.cwd ? { cwd: meta.cwd } : {}),
      sessionVersion: meta.version,
      eventCount: events.length,
      createdAt: meta.createdAt,
    },
    header: {
      version: meta.version,
      id: meta.id,
      createdAt: meta.createdAt,
      ...(meta.cwd ? { cwd: meta.cwd } : {}),
      ...(meta.parentSession ? { parentSession: meta.parentSession } : {}),
      ...(meta.isSeeded ? { isSeeded: true } : {}),
      ...(inheritedEventCount > 0 ? { inheritedEventCount } : {}),
    },
    events: [...events],
  };
}

/** 取会话持久化服务；不可用时就地回 503 并返回 null */
function persistenceOr503(ctx: Context, res: ServerResponse): SessionPersistenceLike | null {
  const persistence = serviceOf<SessionPersistenceLike>(ctx, "sessionPersistence");
  if (!persistence) {
    sendJson(res, 503, { code: "INTERNAL", message: "会话持久化服务不可用" });
    return null;
  }
  return persistence;
}

// ---------- /api/guild/sessions + /api/guild/session-package 路由 ----------

function sessionRoutes(ctx: Context, scope: SettingsScope<GuildSettings>): WebRoute[] {
  return [
    {
      kind: "exact",
      path: "/api/guild/sessions",
      handler: async (_req, res) => {
        const persistence = persistenceOr503(ctx, res);
        if (!persistence) return;
        try {
          const snapshots = await persistence.list();
          const sessions = orderBy(snapshots, [(s) => s.header.createdAt], ["desc"])
            .slice(0, 200)
            .map((snapshot): LocalSessionSummary => {
              const header = snapshot.header;
              return {
                id: header.id,
                createdAt: header.createdAt,
                ...(header.cwd ? { cwd: header.cwd } : {}),
                ...(header.parentSession ? { parentSession: header.parentSession } : {}),
              };
            });
          sendJson(res, 200, { sessions } satisfies HostSessionsStatus);
        } catch (error) {
          sendJson(res, 500, { code: "INTERNAL", message: errorOf(error) });
        }
      },
    },
    {
      kind: "exact",
      path: "/api/guild/session-package",
      handler: async (req, res) => {
        const persistence = persistenceOr503(ctx, res);
        if (!persistence) return;
        const sessionId = new URL(req.url ?? "", "http://localhost").searchParams
          .get("sessionId")
          ?.trim();
        if (!sessionId) {
          sendJson(res, 400, { code: "BAD_REQUEST", message: "缺少 sessionId" });
          return;
        }
        try {
          // 只读句柄：open('read') 不抢写所有权，读完 close 释放
          const handle = await persistence.open(sessionId, "read");
          try {
            const { events } = await handle.read(0);
            const body = Buffer.from(
              JSON.stringify(
                buildSessionPackage(handle.header, events, handle.inheritedEventCount),
              ),
              "utf8",
            );
            const maxBytes = scope.get().share.maxSizeMb * 1024 * 1024;
            if (body.byteLength > maxBytes) {
              const mb = Math.round(maxBytes / 1024 / 1024);
              sendJson(res, 413, {
                code: "PAYLOAD_TOO_LARGE",
                message: `会话包超过 ${mb} MiB 上限`,
              });
              return;
            }
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "content-length": String(body.byteLength),
            });
            res.end(body);
          } finally {
            await handle.close();
          }
        } catch (error) {
          sendJson(res, 500, { code: "INTERNAL", message: errorOf(error) });
        }
      },
    },
  ];
}

// ---------- /api/guild/config + /api/guild/clone 路由 ----------

function guildRoutes(ctx: Context, scope: SettingsScope<GuildSettings>): WebRoute[] {
  return [
    {
      kind: "exact",
      path: "/api/guild/config",
      handler: async (req, res) => {
        if (req.method === "GET") {
          sendJson(res, 200, effectiveSettings(scope));
          return;
        }
        if (req.method === "POST") {
          try {
            const patch = sanitizePatch(await readJsonBody(req));
            if (Object.keys(patch).length === 0) {
              sendJson(res, 400, { code: "BAD_REQUEST", message: "empty patch" });
              return;
            }
            await scope.update(patch);
            sendJson(res, 200, effectiveSettings(scope));
          } catch (error) {
            sendJson(res, 500, { code: "INTERNAL", message: errorOf(error) });
          }
          return;
        }
        sendJson(res, 405, { code: "BAD_REQUEST", message: "method not allowed" });
      },
    },
    {
      kind: "exact",
      path: "/api/guild/clone",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { code: "BAD_REQUEST", message: "method not allowed" });
          return;
        }
        try {
          const body = (await readJsonBody(req)) as { downloadUrl?: unknown; cwd?: unknown };
          const downloadUrl = typeof body.downloadUrl === "string" ? body.downloadUrl : "";
          const wantedCwd =
            typeof body.cwd === "string" && isAbsolute(body.cwd) ? body.cwd : undefined;
          let url: URL;
          try {
            url = new URL(downloadUrl);
          } catch {
            sendJson(res, 400, { code: "BAD_REQUEST", message: "downloadUrl 无效" });
            return;
          }
          // 只允许从生效的 serverUrl 同源下载，避免 host 被当成任意 URL 代理
          const allowed = new URL(effectiveSettings(scope).serverUrl).host;
          if (url.host !== allowed) {
            sendJson(res, 400, { code: "BAD_REQUEST", message: `只允许从 ${allowed} 下载` });
            return;
          }

          const started = Date.now();
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            sendJson(res, 502, { code: "INTERNAL", message: `下载失败 HTTP ${response.status}` });
            return;
          }
          const bytes = Buffer.from(await response.arrayBuffer());

          // 仅处理 DSH 会话包：用官方 sessions 服务按 seed 还原成本地会话
          const pack = parseAgentSessionPackage(bytes);
          if (!pack) {
            sendJson(res, 422, {
              code: "MANIFEST_INVALID",
              message: "仅支持 DSH 会话包，无法还原该分享",
            });
            return;
          }
          const store = serviceOf<SessionStoreLike>(ctx, "sessions");
          if (!store) {
            sendJson(res, 503, { code: "INTERNAL", message: "会话服务不可用" });
            return;
          }
          // 落地目录：显式传入优先；默认用户主目录下的 DSH-Guild（不存在则新建）
          const cwd = wantedCwd ?? ensureCloneWorkspaceDir();
          const session = store.create(undefined, { seed: pack.events, meta: { cwd } });
          await store.flush(session);
          // 归入「DSH-Guild」工作区（同目录已注册则复用同一工作区）；失败不影响克隆
          await attachToCloneWorkspace(ctx, session.id, cwd);
          sendJson(res, 200, {
            bytes: bytes.byteLength,
            elapsedMs: Date.now() - started,
            sessionId: session.id,
          } satisfies HostCloneResult);
        } catch (error) {
          sendJson(res, 500, { code: "INTERNAL", message: errorOf(error) });
        }
      },
    },
    ...sessionRoutes(ctx, scope),
  ];
}

export function apply(ctx: Context): void {
  const scope = ctx.settings.register(GUILD_NS, guildSettingsSchema, {
    applies: "live",
  });
  // 首次运行把默认后端写进 settings 文档，用户随后可在设置页 / settings.yaml 里改
  seedServerUrl(ctx, scope);

  const disposers: Array<() => void> = [];
  for (const route of guildRoutes(ctx, scope)) {
    disposers.push(ctx.webServer.register(route));
  }

  ctx.effect(
    () => () => {
      for (const dispose of disposers) dispose();
    },
    "dsh-guild: config api",
  );
}
