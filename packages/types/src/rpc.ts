// ===============================================================
// DSH 插件：host（Node.js）本地 HTTP 接口契约
//
// 说明：client（浏览器）与 host（Node.js）之间**不走 remote RPC**。
// host 在 `ctx.webServer` 注册同源 HTTP 接口，client 用 fetch 调用：
//
//   GET  /api/talk/config           → TalkSettings（读；BETTER_AUTH_URL 优先）
//   POST /api/talk/config           → TalkSettings（body = Partial<TalkSettings> patch）
//   GET  /api/talk/sessions         → HostSessionsStatus（本机可分享的 DSH 会话）
//   GET  /api/talk/session-package  → AgentSessionPackage（?sessionId=，application/json）
//   POST /api/talk/clone            → HostCloneResult（body = HostCloneRequest）
//
// 实际实现在 packages/host/src/index.ts，client 侧封装在
// packages/client/src/config.ts。请求 / 响应类型在此定义供两端共享。
// ===============================================================

// ---------- 1. 配置读写（GET|POST /api/talk/config） ----------

export interface TalkSettings {
  serverUrl: string;
  /** Better Auth username 的本地回显缓存（@handle），不再参与认证 */
  handle: string;
  /** Better Auth 会话 token（secret）：登录成功 set-auth-token 得到，client 请求 Server 时带 Bearer */
  token: string;
  autoReconnect: boolean;
  share: {
    maxSizeMb: number;
  };
}

// ---------- 2. 本地克隆（POST /api/talk/clone） ----------

/** POST /api/talk/clone —— 让 host 下载分享包；DSH 会话包会直接还原成本地会话 */
export interface HostCloneRequest {
  /** 分享包下载地址（share 的 downloadUrl，GET /api/r2/objects/…?download=1） */
  downloadUrl: string;
  /** 还原会话用的工作区绝对路径；缺省用用户主目录下的 DSH-Talk（不存在时自动创建，并归入同名工作区） */
  cwd?: string;
}

export interface HostCloneResult {
  bytes: number;
  elapsedMs: number;
  /** 会话包还原出的新会话 id */
  sessionId?: string;
}

// ---------- 3. 本地 DSH 会话（GET /api/talk/sessions + /api/talk/session-package） ----------

/** 可供分享的本机会话（来自 DSH 会话持久化层的 header） */
export interface LocalSessionSummary {
  id: string;
  /** 会话创建时的工作区绝对路径 */
  cwd?: string;
  createdAt: number;
  /** seed 来源会话（fork / 克隆谱系） */
  parentSession?: string;
}

/** GET /api/talk/sessions —— 本机可分享的会话列表 */
export interface HostSessionsStatus {
  sessions: LocalSessionSummary[];
}

/** 会话包 manifest 快照（随 share 存库，供卡片展示与克隆校验） */
export interface AgentSessionPackageManifest {
  /** JSON 袋：可直接透传给 Share.manifest（Record<string, unknown>） */
  [key: string]: unknown;
  /** 包格式版本 */
  packageVersion: number;
  /** 来源机器上的 DSH 会话 id */
  sessionId: string;
  /** 来源工作区绝对路径 */
  cwd?: string;
  /** DSH 会话 header 的格式版本 */
  sessionVersion: number;
  eventCount: number;
  createdAt: number;
}

/** GET /api/talk/session-package?sessionId=… 返回的包体（application/json） */
export interface AgentSessionPackage {
  /** 包类型标记：host 据此把下载到的包识别为会话包并还原 */
  kind: "agent-session";
  manifest: AgentSessionPackageManifest;
  /** DSH 会话 header 快照（保留 lineage） */
  header: {
    version: number;
    id: string;
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    /** 是否含 fork 继承的事件前缀 */
    isSeeded?: boolean;
    /** fork 继承的事件前缀长度 */
    inheritedEventCount?: number;
  };
  /** 会话事件（append-only、lossless JSON） */
  events: unknown[];
}
