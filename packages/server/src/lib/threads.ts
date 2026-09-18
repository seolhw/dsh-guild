// ================================================================
// 讨论组（thread）共享逻辑：行 → Thread 实体、可见性/成员访问判定、
// 惰性自动归档、按用户汇总未读。路由（REST/WS）与社区详情复用这里。
//
// 可见性：public = 社区成员自由进出；private = 仅成员可进出，非成员可见但加锁。
//   可进入 = 发起人 / 成员名单 / 持有社区 MANAGE_THREADS 权限者（管理员保留管理能力）。
// ================================================================

import type { ThreadSummary } from "@dsh-guild/types/api";
import { Permission, type Thread } from "@dsh-guild/types/entities";
import { and, desc, eq, gt, inArray, ne, type SQL, sql } from "drizzle-orm";
import { uniq } from "es-toolkit/array";
import { THREAD_AUTO_ARCHIVE_MS } from "../constants";
import { messages, type ThreadRow, threadMembers, threadReadStates, threads } from "../db/schema";
import type { db as dbOf } from "./db";
import { resolveCommunityPermissions } from "./permissions";

type Db = ReturnType<typeof dbOf>;

/** threads 行 → Thread 实体（passcodeHash 只暴露「有没有」） */
function toThread(row: ThreadRow, archived: boolean, archivedAt: number | null): Thread {
  return {
    id: row.id,
    communityId: row.communityId,
    channelId: row.channelId,
    name: row.name,
    starterMessageId: row.starterMessageId,
    createdBy: row.createdBy,
    creatorHandle: row.creatorHandle,
    creatorDisplayName: row.creatorDisplayName,
    creatorAvatarUrl: row.creatorAvatarUrl,
    starterSnippet: row.starterSnippet,
    status: archived ? "archived" : "active",
    visibility: row.visibility,
    hasPasscode: row.passcodeHash !== null,
    messageCount: row.messageCount,
    lastMessageId: row.lastMessageId,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt,
  };
}

/** 我是否在成员名单里（只有私密组会真的写入成员行） */
export async function isThreadMember(db: Db, threadId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: threadMembers.userId })
    .from(threadMembers)
    .where(and(eq(threadMembers.threadId, threadId), eq(threadMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** 我是否能管理该社区的讨论组（MANAGE_THREADS；owner/管理员含在内） */
export async function isThreadModerator(
  db: Db,
  communityId: string,
  userId: string,
): Promise<boolean> {
  const access = await resolveCommunityPermissions(db, communityId, userId);
  return access.isOwner || (access.permissions & Permission.MANAGE_THREADS) !== 0;
}

/**
 * 能否进入该讨论组（读消息 / 发消息 / 连 WS / 看成员名单）。
 * 公开组恒 true（社区成员资格由调用方先校验）；私密组 = 发起人 / 成员 / 讨论组管理员。
 */
export async function canEnterThread(db: Db, row: ThreadRow, userId: string): Promise<boolean> {
  if (row.visibility === "public") return true;
  if (row.createdBy === userId) return true;
  if (await isThreadMember(db, row.id, userId)) return true;
  return isThreadModerator(db, row.communityId, userId);
}

/** 对若干 threads 行补「我」的未读与锁态（私有组一次性取成员/角色，避免逐条查询） */
async function enrichWithUnread(
  db: Db,
  rows: ThreadRow[],
  userId: string,
): Promise<ThreadSummary[]> {
  const out: ThreadSummary[] = [];
  if (rows.length === 0) return out;

  const ids = rows.map((r) => r.id);
  const memberRows = await db
    .select({ threadId: threadMembers.threadId })
    .from(threadMembers)
    .where(and(eq(threadMembers.userId, userId), inArray(threadMembers.threadId, ids)));
  const memberSet = new Set(memberRows.map((r) => r.threadId));

  const communityIds = uniq(rows.map((r) => r.communityId));
  const modSet = new Set<string>();
  for (const communityId of communityIds) {
    if (await isThreadModerator(db, communityId, userId)) modSet.add(communityId);
  }

  for (const row of rows) {
    const archived = row.status === "archived";
    const entity = toThread(row, archived, row.archivedAt);
    const isMember =
      row.visibility === "public" ||
      row.createdBy === userId ||
      memberSet.has(row.id) ||
      modSet.has(row.communityId);
    const locked = row.visibility === "private" && !isMember;

    // 进不去的私密组不返回未读（既不亮角标也不泄露活跃度）
    let unreadCount = 0;
    let unreadMentions = 0;
    if (!locked) {
      const read = (
        await db
          .select()
          .from(threadReadStates)
          .where(and(eq(threadReadStates.threadId, row.id), eq(threadReadStates.userId, userId)))
          .limit(1)
      )[0];
      const lastReadAt = read?.lastReadAt ?? 0;
      const agg = await db
        .select({
          unread: sql<number>`COUNT(*)`,
          mentions: sql<number>`COALESCE(SUM(CASE WHEN instr(${messages.mentions}, ${`"${userId}"`}) > 0 THEN 1 ELSE 0 END), 0)`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.threadId, row.id),
            gt(messages.createdAt, lastReadAt),
            // 自己发的消息不算未读（同频道规则；否则发完就在列表里给自己亮角标）
            ne(messages.authorId, userId),
          ),
        );
      unreadCount = Number(agg[0]?.unread ?? 0);
      unreadMentions = Number(agg[0]?.mentions ?? 0);
    }

    out.push({
      ...entity,
      unreadCount,
      unreadMentions,
      isMember,
      locked,
    });
  }
  return out;
}

/**
 * 惰性自动归档 + 汇总列表：若某讨论组超过 24h 无活跃，先把状态刷成 archived
 * 再返回 ThreadSummary[]（按最近活跃倒序）。私密组对进不去的人只给锁态元数据。
 */
export async function listThreadSummaries(
  db: Db,
  scope: { communityId?: string; channelId?: string },
  userId: string,
): Promise<ThreadSummary[]> {
  const conds: SQL[] = [];
  if (scope.communityId) conds.push(eq(threads.communityId, scope.communityId));
  if (scope.channelId) conds.push(eq(threads.channelId, scope.channelId));
  const rows = await db
    .select()
    .from(threads)
    .where(and(...conds))
    .orderBy(desc(threads.lastActivityAt));

  // 惰性自动归档（本地无定时器，靠读写路径触发）
  const now = Date.now();
  const idleIds = rows
    .filter((r) => r.status === "active" && now - r.lastActivityAt > THREAD_AUTO_ARCHIVE_MS)
    .map((r) => r.id);
  if (idleIds.length > 0) {
    await db
      .update(threads)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(inArray(threads.id, idleIds));
  }

  const summaries = await enrichWithUnread(db, rows, userId);
  // 已被本次惰性归档的，返回实体时也反映为 archived
  const idle = new Set(idleIds);
  for (const s of summaries) {
    if (s.status === "active" && idle.has(s.id)) {
      s.status = "archived";
      s.archivedAt = now;
    }
  }
  return summaries;
}

/** 单条讨论组详情（含我未读与锁态）；不存在返回 null */
export async function getThreadSummary(
  db: Db,
  threadId: string,
  userId: string,
): Promise<ThreadSummary | null> {
  const row = (await db.select().from(threads).where(eq(threads.id, threadId)).limit(1))[0];
  if (!row) return null;
  const [summary] = await enrichWithUnread(db, [row], userId);
  return summary ?? null;
}
