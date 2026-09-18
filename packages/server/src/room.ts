// ================================================================
// Durable Object: ChannelActor（一个频道 = 一个 DO 实例）
//
// 依据 Cloudflare DO 官方文档（2026）实现的实时通道：
//   - id 稳定路由：ROOM_ACTOR.idFromName(channelId)，每个频道独立实例，
//     广播只发生在实例内扇出，天然水平扩展（官方聊天模型）。
//   - 新基类 `DurableObject<Env>`（cloudflare:workers）：this.ctx / this.env，
//     REST 写入成功后直接**类型化 RPC** 调 `stub.broadcast(frame)` 广播。
//   - Hibernation WebSocket API：ctx.acceptWebSocket + webSocketMessage/Close
//     + serializeAttachment 跨休眠恢复 + 运行时自动 ping/pong。
//   - DO 私有 SQLite（ctx.storage.sql）：只存**本频道生命周期内的房间私有态**
//     ——在线 presence 名单；对象只在该频道有人在线时存在，全部断开即 deleteAll 释放。
//
// 数据隔离（与业务 D1 的边界）：
//   - 业务 D1（跨频道/长期/需聚合与外部工具）：社区/频道/成员/消息/未读/用户(Better Auth)
//   - 本 DO SQLite：presence 等只属于这一个房间、无跨频道聚合需求的热状态
//   - 鉴权：连接时用 D1 校验「频道存在 + 调用方是社区成员」再 accept；
//     此后把消息写入仍走 REST（权限唯一来源），DO 只做扇出。
// ================================================================

import { DurableObject } from "cloudflare:workers";
import { type ID, Permission } from "@dsh-guild/types/entities";
import type { ServerFrame } from "@dsh-guild/types/ws";
import { and, eq } from "drizzle-orm";
import { createDbForWorker, type Db } from "./db";
import { channels, threadMembers, threads } from "./db/schema";
import { resolveChannelPermissions, resolveCommunityPermissions } from "./lib/permissions";
import type { Env } from "./types";

/** 持久化到每个 WebSocket 连接的会话档案（跨休眠恢复用，≤16KB） */
interface Session {
  connectionId: string;
  userId: ID;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  presence: "online" | "away" | "offline";
}

/** DO 私有 SQLite 里的在线成员行 */
type PresenceRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  kind: "online" | "away" | "offline";
  last_seen: number;
} & Record<string, string | number | null>;

const PRESENCE_DDL = `
  CREATE TABLE IF NOT EXISTS presence (
    user_id     TEXT PRIMARY KEY,
    handle      TEXT NOT NULL,
    display_name TEXT,
    avatar_url  TEXT,
    kind        TEXT NOT NULL DEFAULT 'online',
    last_seen   INTEGER NOT NULL
  )
`;

/** 输入态有效期：客户端至少每 3s 重发一次，服务端按此 TTL 让接收端自行过期 */
const TYPING_TTL_MS = 6000;

export class ChannelActor extends DurableObject<Env> {
  /** 本实例负责的频道 id（握手时由 Worker 的 X-Channel-Id 头注入；RPC/广播不依赖它） */
  private channelId = "";
  /** ws -> 会话（内存索引；休眠唤醒后由 attachment 重建） */
  private sessions = new Map<WebSocket, Session>();
  private presenceReady = false;

  constructor(ctx: ConstructorParameters<typeof DurableObject<Env>>[0], env: Env) {
    super(ctx, env);

    // 休眠唤醒（或首次创建）时，从每个存活连接的 attachment 恢复会话索引
    for (const ws of this.ctx.getWebSockets()) {
      const session = ws.deserializeAttachment() as Session | null;
      if (session) this.sessions.set(ws, session);
    }

    // 协议层 ping/pong 由运行时应答，连接保持活跃但不唤醒本对象
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------------- Worker 代理的升级请求（鉴权后路由到本 DO） ----------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/connect")) {
      return this.handleConnect(request);
    }
    return Response.json({ ok: true, message: "channel actor ok" });
  }

  private async handleConnect(req: Request): Promise<Response> {
    const upgradeHeader = req.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("expected websocket upgrade", { status: 400 });
    }
    const channelId = req.headers.get("X-Channel-Id") ?? this.channelId;
    const userId = req.headers.get("X-User-Id");
    if (!channelId || !userId) {
      return new Response("missing channel or user", { status: 400 });
    }
    this.channelId = channelId;

    // 鉴权唯一入口：房间存在 + 调用方在该房间持有 VIEW_CHANNEL（D1 权限为准）。
    // roomId 既可能是主频道，也可能是讨论组（thread）——两者都按父频道的权限位判定。
    // 讨论组隐私：public 社区成员可连；private 仅发起人 / 成员名单 / 持有 MANAGE_THREADS 者。
    const db = createDbForWorker(this.env.DB);
    if (!(await this.canConnect(db, this.channelId, userId))) {
      return Response.json(
        { code: "FORBIDDEN", message: "not allowed to connect this room" },
        { status: 403 },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const connectionId = req.headers.get("X-Conn-Id") ?? crypto.randomUUID();
    const handle = req.headers.get("X-Handle") ?? userId;
    const displayName = req.headers.get("X-Display-Name");
    const avatarUrl = req.headers.get("X-Avatar");

    const session: Session = {
      connectionId,
      userId: userId as ID,
      handle,
      displayName: displayName && displayName.length > 0 ? displayName : null,
      avatarUrl: avatarUrl && avatarUrl.length > 0 ? avatarUrl : null,
      presence: "online",
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(session);
    this.sessions.set(server, session);
    await this.upsertPresence(session);
    // 上线即时扇出：本人与其他在线成员无需等 REST 轮询就能看到「已在线」
    this.fanoutPresence(session, session.presence);

    this.send(server, {
      type: "evt.hello",
      ts: Date.now(),
      payload: {
        connectionId,
        channelId: this.channelId,
        user: {
          id: userId,
          handle,
          displayName: session.displayName,
          avatarUrl: session.avatarUrl,
          createdAt: 0,
          tokenIat: Date.now(),
        },
        serverTime: Date.now(),
        heartbeatIntervalSec: 30,
        onlineCount: this.onlineUserCount(),
      },
    } as unknown as ServerFrame);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * 能否连接该房间：主频道要求父频道 VIEW_CHANNEL；
   * 讨论组在此基础上再叠加讨论组自身的可见性（public / 发起人 / 成员 / MANAGE_THREADS）。
   */
  private async canConnect(db: Db, roomId: string, userId: string): Promise<boolean> {
    const channelRow = (
      await db.select().from(channels).where(eq(channels.id, roomId)).limit(1)
    )[0];
    if (channelRow) {
      const perms = await resolveChannelPermissions(db, channelRow, userId);
      return (perms & Permission.VIEW_CHANNEL) !== 0;
    }

    const threadRow = (await db.select().from(threads).where(eq(threads.id, roomId)).limit(1))[0];
    if (!threadRow) return false;
    const parent = (
      await db.select().from(channels).where(eq(channels.id, threadRow.channelId)).limit(1)
    )[0];
    if (!parent) return false;
    if ((await resolveChannelPermissions(db, parent, userId)) & Permission.VIEW_CHANNEL) {
      // 父频道可见；再按讨论组可见性判定
      if (threadRow.visibility === "public") return true;
      if (threadRow.createdBy === userId) return true;
      const member = await db
        .select({ userId: threadMembers.userId })
        .from(threadMembers)
        .where(and(eq(threadMembers.threadId, threadRow.id), eq(threadMembers.userId, userId)))
        .limit(1);
      if (member.length > 0) return true;
      const access = await resolveCommunityPermissions(db, threadRow.communityId, userId);
      return access.isOwner || (access.permissions & Permission.MANAGE_THREADS) !== 0;
    }
    return false;
  }

  // ---------------- Hibernation 事件处理器 ----------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const frame = parseFrame(message);
    if (!frame) return;
    const session = this.sessions.get(ws);
    if (!session) return;
    const id = frame.id ?? null;

    switch (frame.type) {
      case "ping":
        this.respondOk(ws, id, {
          serverTime: Date.now(),
          echoClientTime: Number(frame.payload?.clientTime ?? 0),
        });
        return;
      case "presence.set": {
        const kind = frame.payload?.kind;
        if (kind !== "online" && kind !== "away" && kind !== "offline") {
          this.respondError(ws, id, "BAD_REQUEST", "invalid presence kind");
          return;
        }
        session.presence = kind;
        ws.serializeAttachment(session);
        await this.upsertPresence(session);
        this.fanoutPresence(session, kind);
        this.respondOk(ws, id, { kind: session.presence });
        return;
      }
      case "typing":
        // 输入态是房间私有热态：不落库、不应答，只扇出给同房间的其他人
        this.fanoutTyping(session);
        return;
      default:
        this.respondError(ws, id, "BAD_REQUEST", `unsupported frame type: ${frame.type}`);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.unregister(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.unregister(ws);
  }

  // ================================================================
  // RPC（Worker/REST 侧类型化调用；每个 RPC 会话 = 1 次 DO 请求计费）
  // ================================================================

  /** REST 写库成功后广播一帧给本频道所有在线连接；evt.message.new 按接收者算 mentionMe */
  async broadcast(frame: ServerFrame): Promise<void> {
    const newFrame = frame as unknown as {
      type: string;
      payload?: { message?: { mentions?: string[] }; mentionMe?: boolean };
    };

    for (const ws of [...this.sessions.keys()]) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (newFrame.type === "evt.message.new") {
        const session = this.sessions.get(ws);
        const mentionMe =
          session !== undefined &&
          (newFrame.payload?.message?.mentions?.includes(session.userId) ?? false);
        this.send(ws, {
          ...frame,
          payload: { ...newFrame.payload, mentionMe },
        } as unknown as ServerFrame);
      } else {
        this.send(ws, frame);
      }
    }
  }

  /**
   * 社区权限配置变更：重校验本房间每条在线连接，失去可见性者主动断开（1008），
   * 其余推送 evt.community.access.changed 让前端重拉社区详情。
   * 每个用户只解析一次权限（同一人多端）。
   */
  async accessChanged(payload: { communityId: string; roomId?: string }): Promise<void> {
    const roomId = payload.roomId ?? this.channelId;
    if (!roomId) return;
    const db = createDbForWorker(this.env.DB);
    const frame: ServerFrame = {
      type: "evt.community.access.changed",
      ts: Date.now(),
      payload: { communityId: payload.communityId },
    };

    const allowedByUser = new Map<string, boolean>();
    for (const [ws, session] of [...this.sessions.entries()]) {
      let allowed = allowedByUser.get(session.userId);
      if (allowed === undefined) {
        allowed = await this.canConnect(db, roomId, session.userId);
        allowedByUser.set(session.userId, allowed);
      }
      if (!allowed) {
        try {
          ws.close(1008, "access revoked");
        } catch {
          // 连接已坏，交给 close/error 事件收尾
        }
        continue;
      }
      if (ws.readyState === WebSocket.OPEN) this.send(ws, frame);
    }
  }

  /**
   * 当前频道在线成员快照。
   * 以「仍保持连接的会话」为准（按用户去重），presence 表只用来补 last_seen。
   * 断连用户遗留的 presence 行不算数，保证与 hello 的 onlineCount 口径一致。
   */
  async online(): Promise<{ count: number; members: PresenceRow[] }> {
    this.ensurePresenceTable();
    const lastSeenByUser = new Map(
      this.ctx.storage.sql
        .exec<PresenceRow>("SELECT user_id, last_seen FROM presence")
        .toArray()
        .map((r) => [r.user_id, r.last_seen] as const),
    );
    const byUser = new Map<string, PresenceRow>();
    for (const session of this.sessions.values()) {
      byUser.set(session.userId, {
        user_id: session.userId,
        handle: session.handle,
        display_name: session.displayName,
        avatar_url: session.avatarUrl,
        kind: session.presence,
        last_seen: lastSeenByUser.get(session.userId) ?? Date.now(),
      });
    }
    const members = [...byUser.values()].sort((a, b) => b.last_seen - a.last_seen);
    return { count: members.length, members };
  }

  // ---------------- 连接/会话维护 ----------------

  /**
   * 在线人数：按用户去重。
   * 同一用户可能短时存在多条连接（重连竞态、休眠恢复、多标签），
   * 直接数连接会把同一个人算成两人；口径与 online() 的成员名单保持一致。
   */
  private onlineUserCount(): number {
    const users = new Set<string>();
    for (const session of this.sessions.values()) users.add(session.userId);
    return users.size;
  }

  private async unregister(ws: WebSocket): Promise<void> {
    // 休眠唤醒后构造函数重建 sessions 时，正在关闭的 socket 可能已不在 getWebSockets() 里；
    // 此时从 attachment 兜底取回会话，否则会漏删 presence 行、留下“幽灵在线”。
    const session =
      this.sessions.get(ws) ?? (ws.deserializeAttachment() as Session | null) ?? undefined;
    this.sessions.delete(ws);
    if (!session) return;

    // 同用户还有其他连接在线 => 保留 presence；否则从名单移除并扇出离线
    const stillOnline = [...this.sessions.values()].some((s) => s.userId === session.userId);
    if (!stillOnline) {
      this.ensurePresenceTable();
      this.ctx.storage.sql.exec("DELETE FROM presence WHERE user_id = ?", session.userId);
      this.fanoutPresence(session, "offline");
    }

    // 频道里已无人连接：清空整个 DO 私有库，让实例随空闲被系统回收（不堆积）
    if (this.sessions.size === 0) {
      await this.ctx.storage.deleteAll();
      this.presenceReady = false;
    }
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // 发送失败（连接已坏）交给 close/error 事件收尾
    }
  }

  /**
   * 把某成员的在线状态变化扇出给本房间全部连接（含本人）。
   * presence 是房间私有热状态：只在本实例内扇出，不做跨房间聚合
   * ——社区级在线名单仍由 REST 聚合各房间快照（见 lib/realtime.ts）。
   */
  private fanoutPresence(session: Session, kind: Session["presence"]): void {
    const now = Date.now();
    const frame = {
      type: "evt.presence.update",
      ts: now,
      payload: {
        channelId: this.channelId,
        member: {
          userId: session.userId,
          handle: session.handle,
          displayName: session.displayName,
          avatarUrl: session.avatarUrl,
          presence: kind,
          lastSeen: now,
        },
      },
    } as unknown as ServerFrame;
    for (const ws of [...this.sessions.keys()]) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      this.send(ws, frame);
    }
  }

  /**
   * 把「正在输入」扇出给本房间的其他人（按 userId 排除发送者本身及其多端连接）。
   * 输入态是房间私有热状态：只在本实例内扇出，不落库、不跨房间聚合。
   */
  private fanoutTyping(session: Session): void {
    const now = Date.now();
    const frame = {
      type: "evt.typing",
      ts: now,
      payload: {
        channelId: this.channelId,
        member: {
          userId: session.userId,
          handle: session.handle,
          displayName: session.displayName,
          avatarUrl: session.avatarUrl,
        },
        expiresAt: now + TYPING_TTL_MS,
      },
    } as unknown as ServerFrame;
    for (const [ws, other] of [...this.sessions.entries()]) {
      if (other.userId === session.userId || ws.readyState !== WebSocket.OPEN) continue;
      this.send(ws, frame);
    }
  }

  private respondOk(ws: WebSocket, id: string | null, payload: unknown): void {
    if (!id) return;
    this.send(ws, { type: "ok", id, payload } as unknown as ServerFrame);
  }

  private respondError(ws: WebSocket, id: string | null, code: string, message: string): void {
    if (!id) return;
    this.send(ws, { type: "error", id, payload: { code, message } } as unknown as ServerFrame);
  }

  // ---------------- DO 私有 SQLite：presence ----------------

  private ensurePresenceTable(): void {
    if (this.presenceReady) return;
    this.ctx.storage.sql.exec(PRESENCE_DDL);
    this.presenceReady = true;
  }

  private async upsertPresence(session: Session): Promise<void> {
    this.ensurePresenceTable();
    this.ctx.storage.sql.exec(
      `INSERT INTO presence (user_id, handle, display_name, avatar_url, kind, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         handle = excluded.handle,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         kind = excluded.kind,
         last_seen = excluded.last_seen`,
      session.userId,
      session.handle,
      session.displayName,
      session.avatarUrl,
      session.presence,
      Date.now(),
    );
  }
}

type AnyFrame = {
  type: string;
  payload: Record<string, unknown> | null;
  id?: string;
};

function parseFrame(message: string): AnyFrame | null {
  try {
    const raw = JSON.parse(message) as Partial<AnyFrame>;
    if (typeof raw.type !== "string") return null;
    const payload = (raw.payload as Record<string, unknown> | null | undefined) ?? null;
    return {
      type: raw.type,
      payload,
      ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    };
  } catch {
    return null;
  }
}
