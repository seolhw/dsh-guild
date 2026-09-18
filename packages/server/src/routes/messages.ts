// ================================================================
// /api/channels/:id/*（消息/未读）与 /api/messages/:id（改/删）
// 权限模型（Discord 式通道权限位，详见 lib/permissions.ts）：
//   - 身份：Better Auth 会话（Bearer）
//   - 看历史/未读/在线：需频道的 VIEW_CHANNEL 位
//   - 发消息：需频道的 SEND_MESSAGES 位（公告频道的只读由 @everyone overwrite 实现）
//   - 改/删消息：作者本人，或持有社区 MANAGE_MESSAGES 位
//   - 删/撤回消息：作者本人（仅发送 2 分钟内可撤回）；超时后作者只能编辑，不能撤回
//   - 表情回应：能看到该频道（+ 能进入该讨论组）即可切换；同一人同一 emoji 再调一次 = 取消
//   - 置顶：/api/messages/:id/pin（POST 置顶 / DELETE 取消，社区 MANAGE_MESSAGES 位）；
//     /api/channels/:id/pins 按房间（主频道或 ?threadId= 讨论组）列出置顶消息
//   - 附件：先 PUT /api/r2/objects 上传拿 r2Key，随消息提交；分享卡片引用 /api/shares 登记的分享
//   - 搜索：GET /api/messages/search?communityId=&q= 社区成员可用
// ================================================================

import type { D1Database } from "@cloudflare/workers-types";
import type {
  CreateMessageRequest,
  GetChannelOnlineResponse,
  ListMessagesQuery,
  ListPinsResponse,
  SearchMessageResult,
  ToggleMessageReactionRequest,
  ToggleMessageReactionResponse,
  UpdateMessageRequest,
  UpdateReadStateRequest,
} from "@dsh-guild/types/api";
import {
  type ChannelReadState,
  MESSAGE_RETRACT_MS,
  type Message,
  type MessageAttachment,
  type MessageReaction,
  Permission,
  type User,
} from "@dsh-guild/types/entities";
import type {
  EvtMessageDeleted,
  EvtMessageNew,
  EvtMessageReactions,
  EvtMessageUpdated,
} from "@dsh-guild/types/ws";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, sql } from "drizzle-orm";
import { compact, uniq } from "es-toolkit/array";
import { clamp } from "es-toolkit/math";
import { type Context, Hono } from "hono";
import { MAX_ATTACHMENT_NAME, MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH } from "../constants";
import {
  type ChannelRow,
  channelReadStates,
  channels,
  communityMembers,
  type MessageRow,
  messageReactions,
  messages,
  shares,
  type ThreadRow,
  threads,
} from "../db/schema";
import { requireMember } from "../lib/access";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { loadChannelRow } from "../lib/channels";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { requireChannelPermission, requireCommunityPermission } from "../lib/permissions";
import {
  hasMyReaction,
  loadMessageReactions,
  loadReactionsByMessage,
  MAX_REACTION_EMOJI_LENGTH,
} from "../lib/reactions";
import { broadcastToChannel } from "../lib/realtime";
import { emptyOk, jsonBody, mustRow, parseJson, publicOrigin } from "../lib/response";
import { canEnterThread } from "../lib/threads";
import { fetchUsersByIds, requireUserById, resolveUserIdsByHandles } from "../lib/users";
import type { Env, HonoAppVariables } from "../types";

/** 频道消息行 -> Message 实体（JSON 字段解码；reactions 由调用方聚合后传入） */
function rowToMessage(row: MessageRow, reactions: MessageReaction[] = []): Message {
  return {
    id: row.id,
    channelId: row.channelId,
    communityId: row.communityId,
    authorId: row.authorId,
    content: row.content,
    attachments: parseJson(row.attachments) ?? [],
    mentions: parseJson<string[]>(row.mentions) ?? [],
    shareCard: parseJson(row.shareCard),
    replyToId: row.replyToId,
    threadId: row.threadId,
    reactions,
    pinnedAt: row.pinnedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 组装一条对外消息（带 author，可能带 replyTo 及其中层 author） */
async function messageItem(
  db: ReturnType<typeof dbOf>,
  d1: D1Database,
  row: MessageRow,
  reactions: MessageReaction[] = [],
): Promise<Message & { author: User; replyTo?: (Message & { author: User }) | null }> {
  const base = rowToMessage(row, reactions);
  const author = await requireUserById(d1, row.authorId);
  let replyTo: (Message & { author: User }) | null = null;
  if (row.replyToId) {
    const parent = (
      await db.select().from(messages).where(eq(messages.id, row.replyToId)).limit(1)
    )[0];
    if (parent) {
      replyTo = { ...rowToMessage(parent), author: await requireUserById(d1, parent.authorId) };
    }
  }
  return { ...base, author, replyTo };
}
// ================================================================
// 频道维度：/api/channels/:id/messages + read-state
// ================================================================

const channelMessagesApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const channelMessagesRoutes = channelMessagesApi;

channelMessagesApi.use("*", createBearerAuth("required"));

/** 校验讨论组（thread）属于该频道且我有权进入（私密组）；用于列表 ?threadId / 发消息 body.threadId */
async function loadThreadInChannel(
  db: ReturnType<typeof dbOf>,
  channel: ChannelRow,
  threadId: string,
  userId: string,
): Promise<ThreadRow> {
  const thread = (await db.select().from(threads).where(eq(threads.id, threadId)).limit(1))[0];
  if (!thread || thread.channelId !== channel.id || thread.communityId !== channel.communityId)
    throw HttpApiError.badRequest("threadId 无效（不存在或不属于该频道）");
  if (!(await canEnterThread(db, thread, userId))) {
    throw HttpApiError.forbidden("这是私密讨论组，需要被邀请或用密码进入");
  }
  return thread;
}

// --- GET /:id/messages —— 历史消息（默认倒序 + 游标） ---
channelMessagesApi.get("/:id/messages", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  const d1 = c.env.DB;
  const q = c.req.query() as ListMessagesQuery;
  const rawLimit = c.req.query("limit") ?? "";
  const limit = clamp(Number.parseInt(rawLimit, 10) || 50, 1, 100);
  const direction: "desc" | "asc" = q.direction === "asc" ? "asc" : "desc";
  const cursor = q.cursor && q.cursor.trim().length > 0 ? Number.parseInt(q.cursor, 10) : null;

  // 主频道列表只看直接消息（thread_id IS NULL）；传 ?threadId= 则看该讨论组
  const rawThread = (q.threadId ?? "").trim();
  const conds = [eq(messages.channelId, channelId)];
  if (rawThread.length > 0) {
    const thread = await loadThreadInChannel(db, channel, rawThread, userId);
    conds.push(eq(messages.threadId, thread.id));
  } else {
    conds.push(isNull(messages.threadId));
  }
  if (cursor !== null && Number.isFinite(cursor)) {
    conds.push(
      direction === "desc" ? lt(messages.createdAt, cursor) : gt(messages.createdAt, cursor),
    );
  }
  const order = direction === "desc" ? desc(messages.createdAt) : asc(messages.createdAt);
  const take = limit + 1; // 多取一条判断是否还有更多
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(order)
    .limit(take);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const items: Array<Message & { author: User; replyTo?: (Message & { author: User }) | null }> =
    [];
  const reactionsByMessage = await loadReactionsByMessage(
    db,
    page.map((row) => row.id),
    userId,
  );
  for (const row of page) {
    items.push(await messageItem(db, d1, row, reactionsByMessage.get(row.id) ?? []));
  }

  return c.json({
    items,
    nextCursor: hasMore && last ? String(last.createdAt) : null,
    count: page.length,
  });
});

// --- POST /:id/messages —— 发消息 ---
channelMessagesApi.post("/:id/messages", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(
    db,
    channel,
    userId,
    Permission.SEND_MESSAGES,
    "无权在该频道发送消息",
  );

  const body = await jsonBody<CreateMessageRequest>(c);
  const d1 = c.env.DB;
  // 目标讨论组：body.threadId 可选；必须依附本频道（公告频道无讨论组，自然不命中）
  const thread =
    body.threadId !== undefined && body.threadId !== null
      ? await loadThreadInChannel(db, channel, body.threadId, userId)
      : null;
  // 话题（forum）频道不在频道内直接聊天，必须先进入某个话题（thread）
  if (channel.kind === "forum" && !thread)
    throw HttpApiError.badRequest("话题频道请先进入某个话题再发言");
  const roomId = thread?.id ?? channelId;
  const content = (body.content ?? "").trim();
  if (content.length > MAX_MESSAGE_LENGTH)
    throw HttpApiError.badRequest(`content 超过 ${MAX_MESSAGE_LENGTH} 字符上限`);

  // 附件：r2Key -> R2 实际对象。只允许引用「自己刚上传、尚未被消费」的对象；
  // 落库前以 R2 对象为准回填 name/size/mime（客户端声明仅作预检）。
  const puts = body.attachments ?? [];
  if (puts.length > MAX_ATTACHMENTS_PER_MESSAGE)
    throw HttpApiError.badRequest(`一条消息最多携带 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`);
  const origin = publicOrigin(c);
  const attachments: MessageAttachment[] = [];
  for (const a of puts) {
    if (typeof a.r2Key !== "string" || !a.r2Key.startsWith("att"))
      throw HttpApiError.badRequest("附件 r2Key 无效");
    const name = typeof a.name === "string" ? a.name.trim() : "";
    if (!name || name.length > MAX_ATTACHMENT_NAME)
      throw HttpApiError.badRequest("附件名缺失或超过 200 字符");
    if (!Number.isInteger(a.size) || a.size <= 0) throw HttpApiError.badRequest("附件 size 无效");

    const object = await c.env.R2.get(a.r2Key);
    if (!object) throw HttpApiError.badRequest(`附件「${name}」尚未上传完成或已不存在`);
    if (object.customMetadata?.u !== userId) throw HttpApiError.forbidden("只能引用自己上传的附件");

    const mimeType = object.httpMetadata?.contentType ?? null;
    attachments.push({
      kind: mimeType?.startsWith("image/") ? "image" : "file",
      url: `${origin}/api/r2/objects/${a.r2Key}`,
      name,
      size: object.size,
      mimeType,
      width: typeof a.width === "number" ? a.width : null,
      height: typeof a.height === "number" ? a.height : null,
    });
  }
  // 正文可为空：附件或分享卡片至少要有一样（分享卡片是「卡片即消息」的分享形式）
  if (content.length === 0 && attachments.length === 0 && !body.shareId)
    throw HttpApiError.badRequest("content 不能为空（附件或分享卡片至少要有一样）");

  // mentions：@handle -> userId。解析不到的 handle 不当错误：正文里的 @ 本来就是
  // 用户打进去的普通字符（如「价格 @ 100」、@一个不存在的人），原样留在正文里，
  // 只是不构成提及。
  const mentions: string[] = [];
  if (body.mentionHandles && body.mentionHandles.length > 0) {
    const resolved = await resolveUserIdsByHandles(d1, body.mentionHandles);
    const resolvedIds = compact(body.mentionHandles.map((h) => resolved.get(h.trim())));
    mentions.push(...uniq(resolvedIds));
  }
  // @everyone：展开成社区全体成员（自己除外），与逐个 @handle 的结果合并去重
  if (body.mentionEveryone) {
    const members = await db
      .select({ userId: communityMembers.userId })
      .from(communityMembers)
      .where(eq(communityMembers.communityId, channel.communityId));
    mentions.push(...members.map((m) => m.userId).filter((id) => id !== userId));
  }
  const mentionIds = uniq(mentions);

  // replyTo：必须与被回复消息在同一个房间（主频道对主频道 / 同一讨论组内）
  if (body.replyToId) {
    const parent = (
      await db.select().from(messages).where(eq(messages.id, body.replyToId)).limit(1)
    )[0];
    const parentThread = parent?.threadId ?? null;
    const targetThread = thread?.id ?? null;
    if (
      !parent ||
      parent.channelId !== channelId ||
      parent.communityId !== channel.communityId ||
      parentThread !== targetThread
    ) {
      throw HttpApiError.badRequest("replyToId 无效（不存在、不在本频道或不在本讨论组）");
    }
  }

  // shareCard：引用一条已登记的分享（来自 /api/shares），卡片随消息一同展示/删除
  let shareCard: Message["shareCard"] = null;
  if (body.shareId) {
    const share = (await db.select().from(shares).where(eq(shares.id, body.shareId)).limit(1))[0];
    if (!share) throw HttpApiError.badRequest("shareId 无效（分享不存在）");
    shareCard = {
      shareId: share.id,
      kind: share.kind,
      title: share.title,
      summary: share.summary,
      coverUrl: share.coverUrl,
    };
  }

  const now = Date.now();
  const messageId = newId();
  await db.insert(messages).values({
    id: messageId,
    channelId,
    communityId: channel.communityId,
    authorId: userId,
    content,
    attachments: JSON.stringify(attachments),
    mentions: JSON.stringify(mentionIds),
    shareCard: shareCard ? JSON.stringify(shareCard) : null,
    replyToId: body.replyToId ?? null,
    threadId: thread?.id ?? null,
    createdAt: now,
    updatedAt: null,
  });
  const created = await mustRow(
    db.select().from(messages).where(eq(messages.id, messageId)).limit(1),
    "message",
  );
  const item = await messageItem(db, d1, created);
  // 讨论组消息：推进计数/最后活跃；若此前已归档则自动恢复为活跃
  if (thread) {
    await db
      .update(threads)
      .set({
        messageCount: thread.messageCount + 1,
        lastMessageId: messageId,
        lastActivityAt: now,
        status: "active",
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(threads.id, thread.id));
  }
  const evt: EvtMessageNew = {
    type: "evt.message.new",
    ts: Date.now(),
    payload: { channelId: roomId, message: item, mentionMe: false },
  };
  await broadcastToChannel(c.env, roomId, evt);
  return c.json(item, 201);
});

// --- GET /:id/pins —— 该房间的置顶消息（?threadId= 取讨论组内的，缺省为主频道） ---
channelMessagesApi.get("/:id/pins", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  const rawThread = (c.req.query("threadId") ?? "").trim();
  const conds = [eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)];
  if (rawThread.length > 0) {
    const thread = await loadThreadInChannel(db, channel, rawThread, userId);
    conds.push(eq(messages.threadId, thread.id));
  } else {
    conds.push(isNull(messages.threadId));
  }
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.pinnedAt))
    .limit(50);
  const reactionsByMessage = await loadReactionsByMessage(
    db,
    rows.map((row) => row.id),
    userId,
  );
  const items: Array<Message & { author: User }> = [];
  for (const row of rows) {
    items.push(await messageItem(db, c.env.DB, row, reactionsByMessage.get(row.id) ?? []));
  }
  return c.json({ items } satisfies ListPinsResponse);
});

// --- GET /:id/read-state —— 未读状态 ---
channelMessagesApi.get("/:id/read-state", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  const row = (
    await db
      .select()
      .from(channelReadStates)
      .where(and(eq(channelReadStates.userId, userId), eq(channelReadStates.channelId, channelId)))
      .limit(1)
  )[0];
  const lastMessageRow = await db
    .select({ value: sql<number | null>`MAX(created_at)` })
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNull(messages.threadId)));
  const lastMessageAt = lastMessageRow[0]?.value ?? null;

  // 未读 @ 计数按 messages.mentions 现算（channel_read_states.unread_mentions 是遗留列，不再作为来源）
  const mentionRow = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.channelId, channelId),
        isNull(messages.threadId),
        ne(messages.authorId, userId),
        gt(messages.createdAt, row?.lastReadAt ?? 0),
        like(messages.mentions, `%"${userId}"%`),
      ),
    );

  const state: ChannelReadState = row
    ? {
        userId,
        channelId,
        lastReadMessageId: row.lastReadMessageId,
        lastReadAt: row.lastReadAt,
        unreadMentions: Number(mentionRow[0]?.value ?? 0),
      }
    : { userId, channelId, lastReadMessageId: null, lastReadAt: null, unreadMentions: 0 };
  return c.json({ ...state, lastMessageAt });
});

// --- POST /:id/read-state —— 上报已读 ---
channelMessagesApi.post("/:id/read-state", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  const body = await jsonBody<UpdateReadStateRequest>(c);
  const msg = (
    await db.select().from(messages).where(eq(messages.id, body.lastReadMessageId)).limit(1)
  )[0];
  if (!msg || msg.channelId !== channelId)
    throw HttpApiError.badRequest("lastReadMessageId 不存在或不在本频道");

  const now = Date.now();
  await db
    .insert(channelReadStates)
    .values({
      userId,
      channelId,
      lastReadMessageId: body.lastReadMessageId,
      lastReadAt: now,
      unreadMentions: 0,
    })
    .onConflictDoUpdate({
      target: [channelReadStates.userId, channelReadStates.channelId],
      set: { lastReadMessageId: body.lastReadMessageId, lastReadAt: now, unreadMentions: 0 },
    });
  const row = await mustRow(
    db
      .select()
      .from(channelReadStates)
      .where(and(eq(channelReadStates.userId, userId), eq(channelReadStates.channelId, channelId)))
      .limit(1),
    "read state",
  );
  return c.json({
    userId: row.userId,
    channelId: row.channelId,
    lastReadMessageId: row.lastReadMessageId,
    lastReadAt: row.lastReadAt,
    unreadMentions: row.unreadMentions,
  } satisfies ChannelReadState);
});

// --- GET /:id/online —— 当前在线成员（读频道 DO 的 presence 快照，尽力而为） ---
channelMessagesApi.get("/:id/online", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("id");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  // DO 的 presence 只统计当前保持连接的会话；实例被回收/无人在线时返回空快照
  const stub = c.env.ROOM_ACTOR.get(c.env.ROOM_ACTOR.idFromName(channelId));
  const res = (await stub.online()) as unknown as {
    count: number;
    members: Array<{
      user_id: string;
      handle: string;
      display_name: string | null;
      avatar_url: string | null;
      kind: "online" | "away" | "offline";
      last_seen: number;
    }>;
  };
  const body: GetChannelOnlineResponse = {
    count: res.count,
    members: res.members.map((m) => ({
      userId: m.user_id,
      handle: m.handle,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      presence: m.kind,
      lastSeen: m.last_seen,
    })),
  };
  return c.json(body);
});

// ================================================================
// 消息维度：/api/messages/:id（改/删/解决）
// ================================================================

const messagesApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const messagesRoutes = messagesApi;

messagesApi.use("*", createBearerAuth("required"));

async function loadMessageRow(db: ReturnType<typeof dbOf>, messageId: string): Promise<MessageRow> {
  const row = (await db.select().from(messages).where(eq(messages.id, messageId)).limit(1))[0];
  if (!row) throw HttpApiError.notFound("message not found");
  return row;
}

/** 谁能改消息：作者本人 or 持有社区 MANAGE_MESSAGES 位 */
async function assertCanEditMessage(
  db: ReturnType<typeof dbOf>,
  row: MessageRow,
  userId: string,
): Promise<void> {
  if (row.authorId === userId) return;
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_MESSAGES,
    "无权管理消息",
  );
}

/** 谁能删/撤回：作者仅在发送后 2 分钟内可撤回；持有 MANAGE_MESSAGES 位可随时删 */
async function assertCanRetractMessage(
  db: ReturnType<typeof dbOf>,
  row: MessageRow,
  userId: string,
): Promise<void> {
  if (row.authorId === userId) {
    if (Date.now() - row.createdAt > MESSAGE_RETRACT_MS) {
      throw new HttpApiError(403, "RETRACT_EXPIRED", "消息已发送超过 2 分钟，只能编辑，不能撤回");
    }
    return;
  }
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_MESSAGES,
    "无权管理消息",
  );
}

// --- PATCH /:id —— 改消息（作者或 owner/admin） ---
messagesApi.patch("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadMessageRow(db, c.req.param("id"));
  await assertCanEditMessage(db, row, userId);
  const body = await jsonBody<UpdateMessageRequest>(c);
  if (body.content === undefined) throw HttpApiError.badRequest("content required");
  const content = body.content.trim();
  if (content.length === 0) throw HttpApiError.badRequest("content 不能为空");
  if (content.length > MAX_MESSAGE_LENGTH) throw HttpApiError.badRequest("content 超长");
  await db.update(messages).set({ content, updatedAt: Date.now() }).where(eq(messages.id, row.id));
  const updated = await mustRow(
    db.select().from(messages).where(eq(messages.id, row.id)).limit(1),
    "message",
  );
  const item = await messageItem(
    db,
    c.env.DB,
    updated,
    await loadMessageReactions(db, updated.id, userId),
  );
  const roomId = row.threadId ?? row.channelId;
  const evt: EvtMessageUpdated = {
    type: "evt.message.updated",
    ts: Date.now(),
    payload: { channelId: roomId, message: item },
  };
  await broadcastToChannel(c.env, roomId, evt);
  return c.json(item);
});

// --- DELETE /:id —— 撤回消息（作者限 2 分钟内；owner/admin 不受限） ---
messagesApi.delete("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadMessageRow(db, c.req.param("id"));
  await assertCanRetractMessage(db, row, userId);
  await db.delete(messages).where(eq(messages.id, row.id));
  // 卡片即消息：撤回带分享卡片的消息时，一并清掉它引用的分享（先删 R2 包体再删登记行）
  const shareCard = parseJson<Message["shareCard"]>(row.shareCard);
  if (shareCard?.shareId) {
    const share = (
      await db.select().from(shares).where(eq(shares.id, shareCard.shareId)).limit(1)
    )[0];
    if (share) {
      await c.env.R2.delete(share.r2Key).catch(() => undefined);
      await db.delete(shares).where(eq(shares.id, share.id));
    }
  }
  // 讨论组消息被删除时回退计数
  if (row.threadId) {
    await db
      .update(threads)
      .set({ messageCount: sql`MAX(0, ${threads.messageCount} - 1)`, updatedAt: Date.now() })
      .where(eq(threads.id, row.threadId));
  }
  const roomId = row.threadId ?? row.channelId;
  const evt: EvtMessageDeleted = {
    type: "evt.message.deleted",
    ts: Date.now(),
    payload: { channelId: roomId, messageId: row.id, deletedBy: userId },
  };
  await broadcastToChannel(c.env, roomId, evt);
  return emptyOk(c);
});

/**
 * 写入 / 清除置顶并广播。置顶是消息的元数据变更，复用 evt.message.updated
 * （客户端按消息 id 整条替换，顺带拿到新的 pinnedAt）。
 */
async function applyPinned(
  c: Context<{ Bindings: Env; Variables: HonoAppVariables }>,
  row: MessageRow,
  pinnedAt: number | null,
): Promise<Message & { author: User }> {
  const db = dbOf(c);
  const userId = requireUserId(c);
  await db.update(messages).set({ pinnedAt }).where(eq(messages.id, row.id));
  const updated = await mustRow(
    db.select().from(messages).where(eq(messages.id, row.id)).limit(1),
    "message",
  );
  const item = await messageItem(
    db,
    c.env.DB,
    updated,
    await loadMessageReactions(db, updated.id, userId),
  );
  const roomId = updated.threadId ?? updated.channelId;
  const evt: EvtMessageUpdated = {
    type: "evt.message.updated",
    ts: Date.now(),
    payload: { channelId: roomId, message: item },
  };
  await broadcastToChannel(c.env, roomId, evt);
  return item;
}

// --- POST /:id/pin —— 置顶消息（社区 MANAGE_MESSAGES 位） ---
messagesApi.post("/:id/pin", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadMessageRow(db, c.req.param("id"));
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_MESSAGES,
    "无权置顶消息",
  );
  return c.json(await applyPinned(c, row, Date.now()));
});

// --- DELETE /:id/pin —— 取消置顶 ---
messagesApi.delete("/:id/pin", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadMessageRow(db, c.req.param("id"));
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_MESSAGES,
    "无权取消置顶",
  );
  return c.json(await applyPinned(c, row, null));
});

// --- POST /:id/reactions —— 切换表情回应（已回应过则取消）；返回最新聚合并广播 ---
messagesApi.post("/:id/reactions", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadMessageRow(db, c.req.param("id"));
  const channel = await loadChannelRow(db, row.channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");
  // 讨论组内的消息：还要能进入该讨论组（私密组需被邀请或持密码）
  if (row.threadId) {
    const thread = (
      await db.select().from(threads).where(eq(threads.id, row.threadId)).limit(1)
    )[0];
    if (!thread || !(await canEnterThread(db, thread, userId))) {
      throw HttpApiError.forbidden("这是私密讨论组，需要被邀请或用密码进入");
    }
  }

  const body = await jsonBody<ToggleMessageReactionRequest>(c);
  const emoji = (body.emoji ?? "").trim();
  if (emoji.length === 0) throw HttpApiError.badRequest("emoji 不能为空");
  if (emoji.length > MAX_REACTION_EMOJI_LENGTH) {
    throw HttpApiError.badRequest(`emoji 超过 ${MAX_REACTION_EMOJI_LENGTH} 字符上限`);
  }

  if (await hasMyReaction(db, row.id, userId, emoji)) {
    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, row.id),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji),
        ),
      );
  } else {
    await db
      .insert(messageReactions)
      .values({ messageId: row.id, userId, emoji, createdAt: Date.now() })
      .onConflictDoNothing();
  }

  const reactions = await loadMessageReactions(db, row.id, userId);
  const roomId = row.threadId ?? row.channelId;
  const evt: EvtMessageReactions = {
    type: "evt.message.reactions",
    ts: Date.now(),
    payload: { channelId: roomId, messageId: row.id, reactions },
  };
  await broadcastToChannel(c.env, roomId, evt);
  return c.json({ messageId: row.id, reactions } satisfies ToggleMessageReactionResponse);
});

// --- GET /search —— 社区内消息搜索（成员可用；关键词 + 频道/作者/时间范围/@我，倒序 + cursor 分页） ---
messagesApi.get("/search", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = (c.req.query("communityId") ?? "").trim();
  const q = (c.req.query("q") ?? "").trim();
  if (!communityId) throw HttpApiError.badRequest("communityId required");

  // 可选筛选：频道 / 作者 / 时间范围（含端点）/ 只看提及我的
  const channelId = (c.req.query("channelId") ?? "").trim();
  const authorId = (c.req.query("authorId") ?? "").trim();
  const rawFrom = Number.parseInt(c.req.query("from") ?? "", 10);
  const rawTo = Number.parseInt(c.req.query("to") ?? "", 10);
  const from = Number.isFinite(rawFrom) ? rawFrom : null;
  const to = Number.isFinite(rawTo) ? rawTo : null;
  const mentionsMe = (c.req.query("mentionsMe") ?? "") === "true";

  // 关键词与筛选全空时不返回全量（避免一次拉光社区消息）
  if (q.length === 0 && !channelId && !authorId && from === null && to === null && !mentionsMe) {
    return c.json({ items: [], nextCursor: null, count: 0 });
  }
  await requireMember(db, communityId, userId);

  const rawLimit = c.req.query("limit") ?? "";
  const limit = clamp(Number.parseInt(rawLimit, 10) || 20, 1, 50);
  const rawCursor = c.req.query("cursor") ?? "";
  const cursor = rawCursor.trim().length > 0 ? Number.parseInt(rawCursor, 10) : null;

  const conds = [eq(messages.communityId, communityId)];
  if (q.length > 0) conds.push(like(messages.content, `%${q}%`));
  if (channelId) conds.push(eq(messages.channelId, channelId));
  if (authorId) conds.push(eq(messages.authorId, authorId));
  if (from !== null) conds.push(gte(messages.createdAt, from));
  if (to !== null) conds.push(lte(messages.createdAt, to));
  // mentions 存的是 JSON 字符串数组，用带引号的子串匹配，避免 userId 前缀误命中
  if (mentionsMe) conds.push(like(messages.mentions, `%"${userId}"%`));
  if (cursor !== null && Number.isFinite(cursor)) conds.push(lt(messages.createdAt, cursor));
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const users = await fetchUsersByIds(c.env.DB, uniq(page.map((r) => r.authorId)));
  const userById = new Map(users.map((u) => [u.id, u]));
  const channelRows = page.length
    ? await db
        .select()
        .from(channels)
        .where(
          inArray(
            channels.id,
            page.map((r) => r.channelId),
          ),
        )
    : [];
  const channelById = new Map(channelRows.map((ch) => [ch.id, ch]));

  // 命中在讨论组里的消息：带上讨论组摘要便于客户端跳到对应房间
  const threadIds = uniq(compact(page.map((r) => r.threadId)));
  const threadRows = threadIds.length
    ? await db.select().from(threads).where(inArray(threads.id, threadIds))
    : [];
  const threadById = new Map(threadRows.map((t) => [t.id, t]));

  const items: SearchMessageResult[] = [];
  for (const row of page) {
    const author = userById.get(row.authorId);
    const channel = channelById.get(row.channelId);
    if (!author || !channel) continue;
    const thread = row.threadId ? threadById.get(row.threadId) : undefined;
    items.push({
      ...rowToMessage(row),
      author,
      channel: { id: channel.id, name: channel.name, kind: channel.kind },
      thread: thread ? { id: thread.id, name: thread.name } : null,
    });
  }
  const last = page[page.length - 1];
  return c.json({
    items,
    nextCursor: hasMore && last ? String(last.createdAt) : null,
    count: page.length,
  });
});
