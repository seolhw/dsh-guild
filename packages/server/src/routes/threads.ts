// ================================================================
// 讨论组（thread）生命周期 + 可见性/成员 REST：
//   - /api/channels/:channelId/threads   GET 列表(active/archived) / POST 创建
//   - /api/threads/:id                   GET 详情 / PATCH 改名·改可见性·改密码 / DELETE 删除
//   - /api/threads/:id/archive | reopen  手动归档 / 恢复
//   - /api/threads/:id/join              凭密码进入私密组
//   - /api/threads/:id/members           成员名单 / 直接拉人 / 移除（自己即退出）
//   - /api/threads/:id/candidates        可邀请的人（社区成员中尚未在组内）
//   - /api/threads/:id/read-state        GET/POST 讨论组已读
// 讨论内的消息读写复用 /api/channels/:id/messages（?threadId= / body.threadId）。
//
// 可见性：public = 社区成员自由进出；private = 可见但加锁，仅成员/发起人/社区管理员可进；
//   私密组设了密码可自行进入，未设密码只能被组内成员邀请（候选池 = 社区成员）。
// ================================================================

import type {
  AddThreadMemberRequest,
  CreateThreadRequest,
  JoinThreadRequest,
  ListThreadCandidatesResponse,
  ListThreadMembersResponse,
  ListThreadsResponse,
  ThreadMemberItem,
  UpdateThreadReadStateRequest,
  UpdateThreadRequest,
} from "@dsh-guild/types/api";
import {
  Permission,
  type ThreadReadState,
  type ThreadVisibility,
  type User,
} from "@dsh-guild/types/entities";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { THREAD_NAME_MAX, THREAD_STARTER_SNIPPET_MAX } from "../constants";
import {
  type ChannelRow,
  communityMembers,
  messages,
  type NewThread,
  type ThreadRow,
  threadMembers,
  threadReadStates,
  threads,
} from "../db/schema";
import { getMembership, requireMember } from "../lib/access";
import { createBearerAuth, requireCurrentUser, requireUserId } from "../lib/auth";
import { loadChannelRow } from "../lib/channels";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { hashPasscode, PASSCODE_MAX, PASSCODE_MIN, verifyPasscode } from "../lib/passcode";
import { requireChannelPermission, requireCommunityPermission } from "../lib/permissions";
import { emptyOk, jsonBody } from "../lib/response";
import {
  canEnterThread,
  getThreadSummary,
  isThreadMember,
  listThreadSummaries,
} from "../lib/threads";
import { fetchUserById } from "../lib/users";
import type { Env, HonoAppVariables } from "../types";

async function loadThreadRow(db: ReturnType<typeof dbOf>, threadId: string): Promise<ThreadRow> {
  const row = (await db.select().from(threads).where(eq(threads.id, threadId)).limit(1))[0];
  if (!row) throw HttpApiError.notFound("thread not found");
  return row;
}

/** 讨论组/话题支持范围：text / forum（公告频道保持只读整洁） */
function assertThreadable(kind: ChannelRow["kind"]): void {
  if (kind !== "text" && kind !== "forum")
    throw HttpApiError.badRequest("该频道类型不支持讨论组/话题（仅文字/话题频道）");
}

function assertThreadName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > THREAD_NAME_MAX)
    throw HttpApiError.badRequest(`讨论组名称需为 1~${THREAD_NAME_MAX} 字符`);
  return trimmed;
}

/** 密码长度校验（去掉首尾空白后） */
function assertPasscode(passcode: string): string {
  const trimmed = passcode.trim();
  if (trimmed.length < PASSCODE_MIN || trimmed.length > PASSCODE_MAX)
    throw HttpApiError.badRequest(`密码需为 ${PASSCODE_MIN}~${PASSCODE_MAX} 字符`);
  return trimmed;
}

function normalizeVisibility(raw: unknown): ThreadVisibility {
  return raw === "private" ? "private" : "public";
}

/** 幂等写入成员行（发起人自加 / 邀请 / 凭密码进入 都用它） */
async function addThreadMember(
  db: ReturnType<typeof dbOf>,
  threadId: string,
  userId: string,
  addedBy: string,
): Promise<void> {
  await db
    .insert(threadMembers)
    .values({ threadId, userId, addedBy, createdAt: Date.now() })
    .onConflictDoNothing();
}

/** 能否进入该讨论组内容；不能则 403 */
async function requireThreadAccess(
  db: ReturnType<typeof dbOf>,
  row: ThreadRow,
  userId: string,
): Promise<void> {
  if (!(await canEnterThread(db, row, userId))) {
    throw HttpApiError.forbidden("这是私密讨论组，需要被邀请或用密码进入");
  }
}

// ================================================================
// 频道维度：/api/channels/:channelId/threads
// ================================================================

const channelThreadsApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();
export const channelThreadsRoutes = channelThreadsApi;
channelThreadsApi.use("*", createBearerAuth("required"));

// --- GET /:channelId/threads —— 该频道讨论组（默认活跃；?archived=all 附已归档） ---
channelThreadsApi.get("/:channelId/threads", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("channelId");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(db, channel, userId, Permission.VIEW_CHANNEL, "无权查看该频道");

  const all = (c.req.query("archived") ?? "").trim() === "all";
  const items = await listThreadSummaries(db, { channelId }, userId);
  const body: ListThreadsResponse = {
    active: items.filter((t) => t.status === "active"),
    archived: all ? items.filter((t) => t.status === "archived") : [],
  };
  return c.json(body);
});

// --- POST /:channelId/threads —— 创建讨论组（可带起点消息 + 可见性 + 可选密码） ---
channelThreadsApi.post("/:channelId/threads", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const channelId = c.req.param("channelId");
  const channel = await loadChannelRow(db, channelId);
  await requireChannelPermission(
    db,
    channel,
    userId,
    Permission.CREATE_THREAD,
    "无权在该频道创建讨论组",
  );
  assertThreadable(channel.kind);

  const body = await jsonBody<CreateThreadRequest>(c);
  const name = assertThreadName(body.name ?? "");
  const user = requireCurrentUser(c);

  const visibility = normalizeVisibility(body.visibility);
  const rawPasscode = typeof body.passcode === "string" ? body.passcode.trim() : "";
  const passcodeHash =
    visibility === "private" && rawPasscode.length > 0
      ? await hashPasscode(assertPasscode(rawPasscode))
      : null;

  // 起点消息必须存在于本频道且不在任何讨论组里
  let starterSnippet: string | null = null;
  if (body.starterMessageId) {
    const starter = (
      await db.select().from(messages).where(eq(messages.id, body.starterMessageId)).limit(1)
    )[0];
    if (!starter || starter.channelId !== channelId || starter.threadId !== null)
      throw HttpApiError.badRequest("starterMessageId 无效（不存在、不在本频道或在讨论组内）");
    const raw = starter.content.replace(/\s+/g, " ").trim();
    starterSnippet =
      raw.length === 0
        ? (starter.attachments?.length ?? 0) > 0
          ? "[附件]"
          : null
        : raw.length > THREAD_STARTER_SNIPPET_MAX
          ? `${raw.slice(0, THREAD_STARTER_SNIPPET_MAX)}…`
          : raw;
  }

  const now = Date.now();
  const threadId = newId();
  await db.insert(threads).values({
    id: threadId,
    communityId: channel.communityId,
    channelId,
    name,
    starterMessageId: body.starterMessageId ?? null,
    createdBy: userId,
    creatorHandle: user.handle,
    creatorDisplayName: user.displayName,
    creatorAvatarUrl: user.avatarUrl,
    starterSnippet,
    status: "active",
    visibility,
    passcodeHash,
    messageCount: 0,
    lastMessageId: null,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
  // 私密组把发起人写进成员表（公开组无成员概念）
  if (visibility === "private") {
    await addThreadMember(db, threadId, userId, userId);
  }
  const summary = await getThreadSummary(db, threadId, userId);
  if (!summary) throw HttpApiError.internal("thread row not found");
  return c.json(summary, 201);
});

// ================================================================
// 讨论组维度：/api/threads/:id
// ================================================================

const threadsApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();
export const threadRoutes = threadsApi;
threadsApi.use("*", createBearerAuth("required"));

async function assertCanManage(
  db: ReturnType<typeof dbOf>,
  row: ThreadRow,
  userId: string,
): Promise<void> {
  if (row.createdBy === userId) return;
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_THREADS,
    "无权管理讨论组",
  );
}

async function summaryOrThrow(db: ReturnType<typeof dbOf>, threadId: string, userId: string) {
  const summary = await getThreadSummary(db, threadId, userId);
  if (!summary) throw HttpApiError.internal("thread row not found");
  return summary;
}

// --- GET /:id —— 单条详情（含我未读与锁态；私密组非成员只能拿到锁态元数据） ---
threadsApi.get("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  return c.json(await summaryOrThrow(db, row.id, userId));
});

// --- PATCH /:id —— 改名 / 改可见性 / 改密码（发起人或 owner/admin） ---
threadsApi.patch("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await assertCanManage(db, row, userId);

  const body = await jsonBody<UpdateThreadRequest>(c);
  const patch: Partial<NewThread> = { updatedAt: Date.now() };
  if (body.name !== undefined) patch.name = assertThreadName(body.name);
  if (body.visibility !== undefined) patch.visibility = normalizeVisibility(body.visibility);

  const nextVisibility = patch.visibility ?? row.visibility;
  if (body.passcode !== undefined) {
    const raw = typeof body.passcode === "string" ? body.passcode.trim() : "";
    patch.passcodeHash = raw.length === 0 ? null : await hashPasscode(assertPasscode(raw));
  }
  // 转公开后密码无意义，一并清掉
  if (nextVisibility === "public") patch.passcodeHash = null;

  await db.update(threads).set(patch).where(eq(threads.id, row.id));
  // 转私密时保证发起人在成员表里
  if (nextVisibility === "private") {
    await addThreadMember(db, row.id, row.createdBy, row.createdBy);
  }
  return c.json(await summaryOrThrow(db, row.id, userId));
});

// --- POST /:id/archive —— 手动归档（发起人或 owner/admin） ---
threadsApi.post("/:id/archive", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await assertCanManage(db, row, userId);
  const now = Date.now();
  await db
    .update(threads)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(eq(threads.id, row.id));
  return c.json(await summaryOrThrow(db, row.id, userId));
});

// --- POST /:id/reopen —— 恢复活跃（可进入者；后续发言也会自动恢复） ---
threadsApi.post("/:id/reopen", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await requireThreadAccess(db, row, userId);
  const now = Date.now();
  await db
    .update(threads)
    .set({ status: "active", archivedAt: null, updatedAt: now, lastActivityAt: now })
    .where(eq(threads.id, row.id));
  return c.json(await summaryOrThrow(db, row.id, userId));
});

// --- DELETE /:id —— 删除讨论组（级联消息/成员/已读；发起人或 owner/admin） ---
threadsApi.delete("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await assertCanManage(db, row, userId);
  // D1 外键默认可能不强制，显式清理
  await db.delete(messages).where(eq(messages.threadId, row.id));
  await db.delete(threadReadStates).where(eq(threadReadStates.threadId, row.id));
  await db.delete(threadMembers).where(eq(threadMembers.threadId, row.id));
  await db.delete(threads).where(eq(threads.id, row.id));
  return emptyOk(c);
});

// --- POST /:id/join —— 凭密码进入私密讨论组（公开组幂等返回） ---
threadsApi.post("/:id/join", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);

  if (row.visibility === "public") {
    return c.json(await summaryOrThrow(db, row.id, userId));
  }
  if (row.createdBy === userId || (await isThreadMember(db, row.id, userId))) {
    return c.json(await summaryOrThrow(db, row.id, userId));
  }
  if (row.passcodeHash === null) {
    throw HttpApiError.forbidden("这是仅邀请可加入的私密讨论组");
  }
  const body = await jsonBody<JoinThreadRequest>(c).catch(() => ({}) as JoinThreadRequest);
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!(await verifyPasscode(passcode, row.passcodeHash))) {
    throw HttpApiError.forbidden("密码不正确");
  }
  await addThreadMember(db, row.id, userId, userId);
  return c.json(await summaryOrThrow(db, row.id, userId));
});

// --- GET /:id/members —— 成员名单（需可进入；公开组只返回发起人） ---
threadsApi.get("/:id/members", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await requireThreadAccess(db, row, userId);

  const rows = await db.select().from(threadMembers).where(eq(threadMembers.threadId, row.id));
  const items: ThreadMemberItem[] = [];
  for (const m of rows) {
    const user = await fetchUserById(c.env.DB, m.userId);
    if (user) {
      items.push({
        threadId: m.threadId,
        userId: m.userId,
        addedBy: m.addedBy,
        createdAt: m.createdAt,
        user,
      });
    }
  }
  // 发起人补在首位（老数据或公开组可能没有成员行）
  if (!items.some((m) => m.userId === row.createdBy)) {
    const creator = await fetchUserById(c.env.DB, row.createdBy);
    if (creator) {
      items.unshift({
        threadId: row.id,
        userId: row.createdBy,
        addedBy: row.createdBy,
        createdAt: row.createdAt,
        user: creator,
      });
    }
  }
  const body: ListThreadMembersResponse = { items };
  return c.json(body);
});

// --- GET /:id/candidates —— 可邀请的人（社区成员中尚未在组内的） ---
threadsApi.get("/:id/candidates", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await requireThreadAccess(db, row, userId);

  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const members = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, row.communityId));
  const inThread = new Set(
    (
      await db
        .select({ userId: threadMembers.userId })
        .from(threadMembers)
        .where(eq(threadMembers.threadId, row.id))
    ).map((r) => r.userId),
  );

  const items: User[] = [];
  for (const m of members) {
    if (inThread.has(m.userId)) continue;
    const user = await fetchUserById(c.env.DB, m.userId);
    if (!user) continue;
    if (q.length > 0 && !`${user.handle} ${user.displayName ?? ""}`.toLowerCase().includes(q)) {
      continue;
    }
    items.push(user);
    if (items.length >= 50) break;
  }
  const body: ListThreadCandidatesResponse = { items };
  return c.json(body);
});

// --- POST /:id/members —— 直接把社区成员拉入（仅组内成员/发起人/管理员） ---
threadsApi.post("/:id/members", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  if (row.visibility === "public") {
    throw HttpApiError.badRequest("公开讨论组无需邀请，社区成员可直接进入");
  }
  const mine = row.createdBy === userId || (await isThreadMember(db, row.id, userId));
  if (!mine) {
    await requireCommunityPermission(
      db,
      row.communityId,
      userId,
      Permission.MANAGE_THREADS,
      "无权邀请成员进入讨论组",
    );
  }

  const body = await jsonBody<AddThreadMemberRequest>(c);
  const targetId = (body.userId ?? "").trim();
  if (targetId.length === 0) throw HttpApiError.badRequest("userId 必填");
  if (!(await getMembership(db, row.communityId, targetId))) {
    throw HttpApiError.badRequest("对方不是本社区成员");
  }
  await addThreadMember(db, row.id, targetId, userId);
  const user = await fetchUserById(c.env.DB, targetId);
  if (!user) throw HttpApiError.internal("user not found");
  const item: ThreadMemberItem = {
    threadId: row.id,
    userId: targetId,
    addedBy: userId,
    createdAt: Date.now(),
    user,
  };
  return c.json(item, 201);
});

// --- DELETE /:id/members/:userId —— 移除成员；移除自己 = 退出讨论组 ---
threadsApi.delete("/:id/members/:userId", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  const targetId = c.req.param("userId");
  if (targetId !== userId) await assertCanManage(db, row, userId);
  if (targetId === row.createdBy) throw HttpApiError.badRequest("发起人不能被移出讨论组");
  await db
    .delete(threadMembers)
    .where(and(eq(threadMembers.threadId, row.id), eq(threadMembers.userId, targetId)));
  return emptyOk(c);
});

// --- GET /:id/read-state —— 我在这条讨论组的已读 ---
threadsApi.get("/:id/read-state", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await requireThreadAccess(db, row, userId);

  const read = (
    await db
      .select()
      .from(threadReadStates)
      .where(and(eq(threadReadStates.threadId, row.id), eq(threadReadStates.userId, userId)))
      .limit(1)
  )[0];
  const lastRow = await db
    .select({ value: sql<number | null>`MAX(created_at)` })
    .from(messages)
    .where(eq(messages.threadId, row.id));
  const lastMessageAt = lastRow[0]?.value ?? null;
  const state: ThreadReadState = read
    ? {
        userId: read.userId,
        threadId: read.threadId,
        lastReadMessageId: read.lastReadMessageId,
        lastReadAt: read.lastReadAt,
      }
    : { userId, threadId: row.id, lastReadMessageId: null, lastReadAt: null };
  return c.json({ ...state, lastMessageAt });
});

// --- POST /:id/read-state —— 上报读到哪条（必须是本讨论组内的消息） ---
threadsApi.post("/:id/read-state", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadThreadRow(db, c.req.param("id"));
  await requireMember(db, row.communityId, userId);
  await requireThreadAccess(db, row, userId);

  const body = await jsonBody<UpdateThreadReadStateRequest>(c);
  const msg = (
    await db.select().from(messages).where(eq(messages.id, body.lastReadMessageId)).limit(1)
  )[0];
  if (!msg || msg.threadId !== row.id)
    throw HttpApiError.badRequest("lastReadMessageId 不存在或不在本讨论组");
  const now = Date.now();
  await db
    .insert(threadReadStates)
    .values({
      userId,
      threadId: row.id,
      lastReadMessageId: msg.id,
      lastReadAt: now,
    })
    .onConflictDoUpdate({
      target: [threadReadStates.userId, threadReadStates.threadId],
      set: { lastReadMessageId: msg.id, lastReadAt: now },
    });
  return c.json({
    userId,
    threadId: row.id,
    lastReadMessageId: msg.id,
    lastReadAt: now,
  });
});
