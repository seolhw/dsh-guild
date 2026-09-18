// ================================================================
// /api/communities/* 与 /api/channels/*（社区管理、频道、角色、权限覆盖、成员）
// 权限模型（Discord 式，见 lib/permissions.ts）：
//   - 身份由 Better Auth 会话（Bearer）保证，见 lib/auth.ts
//   - communities.owner_id 为 owner，恒定全权限；每个社区一个 @everyone 角色
//   - 自定义角色自带权限位；频道用 overwrite（@everyone/角色/成员）叠加 allow/deny
//   - 管理类操作按位判定：MANAGE_CHANNEL（频道、频道覆盖）、MANAGE_COMMUNITY（社区资料）、
//     MANAGE_ROLES（角色与成员角色）、INVITE_MEMBERS / KICK_MEMBERS / BAN_MEMBERS
//   - 角色操作受**层级**严格限制：只能操作层级低于自己的角色/成员，不能授予自己没有的
//     权限位；层级只能通过 PUT /roles/order 整体重排；删社区/转让需 owner
//   - 权限配置变更后经 lib/realtime.ts 通知相关频道 DO，断开失去可见性的在线连接
// ================================================================

import type {
  BanCommunityMemberRequest,
  ChannelAccess,
  CommunityMemberItem,
  CreateChannelRequest,
  CreateCommunityRequest,
  CreateInviteRequest,
  CreateRoleRequest,
  DiscoverCommunitiesQuery,
  DiscoverCommunityItem,
  GetCommunityOnlineResponse,
  GetMyCommunitiesResponse,
  ListMembersQuery,
  ReorderRolesRequest,
  SetChannelOverwriteRequest,
  SetMemberRolesRequest,
  TransferOwnerRequest,
  UpdateChannelRequest,
  UpdateCommunityRequest,
  UpdateRoleRequest,
} from "@dsh-guild/types/api";
import {
  ALL_PERMISSIONS,
  type CommunityMember,
  type CommunityRole,
  EVERYONE_TARGET_ID,
  type OverwriteTargetType,
  Permission,
  type PermissionFlags,
  type User,
} from "@dsh-guild/types/entities";
import { and, count, desc, eq, gt, gte, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  COMMUNITY_CREATE_DAILY_LIMIT,
  MAX_COMMUNITIES_PER_USER,
  NEW_COMMUNITY_GUIDE,
} from "../constants";
import {
  type ChannelOverwriteRow,
  type ChannelRow,
  type CommunityMemberRow,
  type CommunityRoleRow,
  type CommunityRow,
  channelOverwrites,
  channelReadStates,
  channels,
  communities,
  communityBans,
  communityMembers,
  communityRoles,
  memberRoles,
  messages,
  threads,
} from "../db/schema";
import { getMembership, isCommunityBanned, requireMember, requireNotBanned } from "../lib/access";
import { createBearerAuth, requireCurrentUser, requireUserId } from "../lib/auth";
import {
  ANNOUNCEMENT_READONLY_DENY,
  grantAnnouncementReadOnly,
  loadChannelRow,
} from "../lib/channels";
import { mapCommunity } from "../lib/communities";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { newId, newInviteCode, newSlug } from "../lib/ids";
import { createCommunityInvite, finalizePendingInvites } from "../lib/invites";
import { insertPinnedGuide } from "../lib/messages";
import { isOfficialCommunity, officialFirstOrder } from "../lib/official";
import {
  assertCanManageMember,
  assertCanManageRole,
  assertGrantablePermissions,
  assertMemberRolesEditable,
  assertOverwritePermissions,
  createDefaultAdminRole,
  ensureEveryoneRole,
  getEveryoneRole,
  highestHeldPosition,
  isCommunityOwner,
  listChannelAccess,
  loadMemberRoleIds,
  loadRoleIdsByMember,
  loadRoles,
  planRoleReorder,
  requireChannelPermission,
  requireCommunityOwner,
  requireCommunityPermission,
  resolveChannelPermissions,
  resolveCommunityPermissions,
} from "../lib/permissions";
import {
  loadCommunityOnline,
  notifyCommunityAccessChanged,
  notifyRoomsAccessChanged,
} from "../lib/realtime";
import {
  type AppCtx,
  emptyOk,
  firstOr404,
  jsonBody,
  mustRow,
  parseLimitOffset,
} from "../lib/response";
import { listThreadSummaries } from "../lib/threads";
import { fetchUserById, fetchUsersByIds, findAuthUserByHandleOrEmail } from "../lib/users";
import type { Env, HonoAppVariables } from "../types";

// ---------------- 小工具 ----------------

/** 按 id 取社区；不存在 404 */
function communityById(db: ReturnType<typeof dbOf>, communityId: string): Promise<CommunityRow> {
  return firstOr404(
    db.select().from(communities).where(eq(communities.id, communityId)).limit(1),
    "community not found",
  );
}

/** 验证社区名 */
function validateCommunityName(name: string): void {
  const n = name.trim();
  if (n.length < 1 || n.length > 50) throw HttpApiError.badRequest("name 长度需在 1~50 之间");
}

/** 角色行 → 对外实体 */
function mapRole(row: CommunityRoleRow): CommunityRole {
  return row;
}

/** 频道行 + 权限位 → 对外 ChannelAccess */
function channelAccess(row: ChannelRow, permissions: PermissionFlags): ChannelAccess {
  return { ...row, permissions };
}

const OVERWRITE_TARGET_TYPES: readonly OverwriteTargetType[] = ["everyone", "role", "member"];

/** 校验路径里的覆盖目标，并确认目标确实属于该社区 */
async function validateOverwriteTarget(
  db: ReturnType<typeof dbOf>,
  communityId: string,
  targetType: string,
  targetId: string,
): Promise<{ targetType: OverwriteTargetType; targetId: string }> {
  if (!OVERWRITE_TARGET_TYPES.includes(targetType as OverwriteTargetType)) {
    throw HttpApiError.badRequest("targetType 只能是 everyone / role / member");
  }
  const type = targetType as OverwriteTargetType;
  const id = type === "everyone" ? EVERYONE_TARGET_ID : targetId;
  if (type === "role") {
    const rows = await db
      .select({ id: communityRoles.id })
      .from(communityRoles)
      .where(and(eq(communityRoles.id, id), eq(communityRoles.communityId, communityId)))
      .limit(1);
    if (rows.length === 0) throw HttpApiError.notFound("role not found in this community");
  }
  if (type === "member") {
    const member = await getMembership(db, communityId, id);
    if (!member) throw HttpApiError.notFound("user is not a member of this community");
  }
  return { targetType: type, targetId: id };
}

// ================================================================
// 社区路由
// ================================================================

const communitiesApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const communitiesRoutes = communitiesApi;

// 身份由 Better Auth 会话（Bearer）解析并注入 userId；入口再判断成员/权限位
communitiesApi.use("*", createBearerAuth("required"));

// --- GET /discover —— 公开社区目录（带活跃度概览；官方社区置顶） ---
communitiesApi.get("/discover", async (c) => {
  const db = dbOf(c);
  const q = c.req.query() as DiscoverCommunitiesQuery;
  const { limit, offset } = parseLimitOffset(c.req.query());
  const keyword = q.q?.trim();
  const conds = [eq(communities.privacy, "public")];
  if (keyword) {
    conds.push(
      or(
        like(communities.name, `%${keyword}%`),
        like(communities.description, `%${keyword}%`),
      ) as never,
    );
  }
  const totalRows = await db
    .select({ value: count() })
    .from(communities)
    .where(and(...conds));
  const total = totalRows[0]?.value ?? 0;
  // active 排序要按「该社区最后一条消息时间」，必须由 SQL 排序（先分页再排会错）。
  // 只在真的选 active 时才会执行这个关联子查询。
  const lastMessageAtSql = sql<number | null>`(
    SELECT MAX(${messages.createdAt}) FROM ${messages} WHERE ${messages.communityId} = ${communities.id}
  )`;
  const order =
    q.sort === "newest"
      ? desc(communities.createdAt)
      : q.sort === "active"
        ? desc(sql`COALESCE(${lastMessageAtSql}, 0)`)
        : desc(communities.memberCount);
  // 官方社区置顶；带搜索词时保持原顺序，避免干扰搜索结果
  const officialFirst = keyword ? [] : officialFirstOrder();
  const rows = await db
    .select()
    .from(communities)
    .where(and(...conds))
    .orderBy(...officialFirst, order, desc(communities.createdAt))
    .limit(limit)
    .offset(offset);
  const activity = await communityActivity(
    db,
    rows.map((r) => r.id),
  );
  const items: DiscoverCommunityItem[] = rows.map((row) => {
    const stat = activity.get(row.id);
    return {
      ...mapCommunity(row),
      isOfficial: isOfficialCommunity(row.id),
      lastMessageAt: stat?.lastMessageAt ?? null,
      recentMessages: stat?.recentMessages ?? 0,
    };
  });
  return c.json({ items, total, offset, limit });
});

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** 本页社区的活跃度概览：最后一条消息时间 + 近 7 天消息数（含讨论组消息） */
async function communityActivity(
  db: ReturnType<typeof dbOf>,
  communityIds: string[],
): Promise<Map<string, { lastMessageAt: number | null; recentMessages: number }>> {
  const result = new Map<string, { lastMessageAt: number | null; recentMessages: number }>();
  if (communityIds.length === 0) return result;
  const since = Date.now() - ACTIVITY_WINDOW_MS;
  const rows = await db
    .select({
      communityId: messages.communityId,
      lastMessageAt: sql<number | null>`MAX(${messages.createdAt})`,
      recentMessages: sql<
        number | null
      >`SUM(CASE WHEN ${messages.createdAt} >= ${since} THEN 1 ELSE 0 END)`,
    })
    .from(messages)
    .where(inArray(messages.communityId, communityIds))
    .groupBy(messages.communityId);
  for (const row of rows) {
    result.set(row.communityId, {
      lastMessageAt: row.lastMessageAt ?? null,
      recentMessages: Number(row.recentMessages ?? 0),
    });
  }
  return result;
}

// --- GET /mine —— 我加入的社区 ---
communitiesApi.get("/mine", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const rows = await db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId));
  const result: GetMyCommunitiesResponse = [];
  for (const m of rows) {
    const communityRow = (
      await db.select().from(communities).where(eq(communities.id, m.communityId)).limit(1)
    )[0];
    if (!communityRow) continue;
    const access = await resolveCommunityPermissions(db, communityRow.id, userId);
    // 该社区有未读消息的频道数
    // 未读 = 频道最后一条消息晚于该用户 read_state.last_read_at，且不是自己发的
    const unreadRow = await db
      .select({ value: count() })
      .from(channels)
      .where(
        and(
          eq(channels.communityId, communityRow.id),
          sql`EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = ${channels.id} AND m.thread_id IS NULL AND m.author_id != ${userId} AND m.created_at > COALESCE((SELECT rs.last_read_at FROM channel_read_states rs WHERE rs.channel_id = ${channels.id} AND rs.user_id = ${userId}), 0))`,
        ),
      );
    // 未读 @ 计数：按 messages.mentions 现算，与讨论组未读同一口径
    // （channel_read_states.unread_mentions 是遗留计数列，不再作为来源）
    const unreadMentionsRow = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .leftJoin(
        channelReadStates,
        and(eq(channelReadStates.channelId, channels.id), eq(channelReadStates.userId, userId)),
      )
      .where(
        and(
          eq(channels.communityId, communityRow.id),
          isNull(messages.threadId),
          ne(messages.authorId, userId),
          gt(messages.createdAt, sql`COALESCE(${channelReadStates.lastReadAt}, 0)`),
          like(messages.mentions, `%"${userId}"%`),
        ),
      );
    result.push({
      ...mapCommunity(communityRow),
      permissions: access.permissions,
      unreadChannels: unreadRow[0]?.value ?? 0,
      unreadMentions: Number(unreadMentionsRow[0]?.value ?? 0),
    });
  }
  return c.json(result);
});

// --- POST / —— 创建社区（含 @everyone + 预置管理员角色、默认频道、owner 成员、邀请码） ---
communitiesApi.post("/", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const body = await jsonBody<CreateCommunityRequest>(c);
  validateCommunityName(body.name ?? "");

  // 限额（常量见 constants.ts）：加入总数 / 自建总数 / 自建频率
  const memberCountRows = await db
    .select({ value: count() })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId));
  const totalOwned = await db
    .select({ value: count() })
    .from(communities)
    .where(eq(communities.ownerId, userId));
  if ((memberCountRows[0]?.value ?? 0) >= MAX_COMMUNITIES_PER_USER)
    throw new HttpApiError(
      409,
      "COMMUNITY_TOTAL_LIMIT",
      `超过最多加入的社区数（${MAX_COMMUNITIES_PER_USER}）`,
    );
  if ((totalOwned[0]?.value ?? 0) >= MAX_COMMUNITIES_PER_USER)
    throw new HttpApiError(
      409,
      "COMMUNITY_TOTAL_LIMIT",
      `自建社区已达上限（${MAX_COMMUNITIES_PER_USER}）`,
    );
  // 自建频率：按最近 24 小时滚动窗口计数（不用自然日，免去时区歧义）
  const recentOwned = await db
    .select({ value: count() })
    .from(communities)
    .where(
      and(
        eq(communities.ownerId, userId),
        gte(communities.createdAt, Date.now() - 24 * 60 * 60 * 1000),
      ),
    );
  if ((recentOwned[0]?.value ?? 0) >= COMMUNITY_CREATE_DAILY_LIMIT)
    throw new HttpApiError(
      409,
      "COMMUNITY_DAILY_LIMIT",
      `24 小时内最多创建 ${COMMUNITY_CREATE_DAILY_LIMIT} 个社区，请稍后再试`,
    );

  const id = newId();
  const now = Date.now();
  // 社区短标识：创建时自动生成（nanoid，数字+大小写字母、8 位、无符号），
  // 不依赖用户输入，并在此做唯一性兜底（正常几乎不会撞）。
  let slug = newSlug();
  for (let i = 0; i < 5; i += 1) {
    const dup = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);
    if (dup.length === 0) break;
    slug = newSlug();
  }
  const inviteCode = newInviteCode();
  const communityId = id;
  await db.insert(communities).values({
    id: communityId,
    name: body.name.trim(),
    slug,
    description: body.description ?? null,
    privacy: body.privacy ?? "public",
    ownerId: userId,
    iconUrl: body.iconUrl ?? null,
    bannerUrl: body.bannerUrl ?? null,
    inviteCode,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(communityMembers).values({ communityId, userId, joinedAt: now });
  // @everyone 角色（默认 VIEW/SEND/CREATE_THREAD）
  const everyone = await ensureEveryoneRole(db, communityId, now);
  // 预置「管理员」角色（权限 = 当时全部权限位）：新手无需自己建，分配即成为管理员
  await createDefaultAdminRole(db, communityId, now);
  // 默认频道：全员（文字讨论）+ 公告（所有人默认禁言，仅拥有 SEND_MESSAGES 的角色可发）
  const defaults = [
    { name: "全员", kind: "text" as const, position: 0 },
    { name: "公告", kind: "announcement" as const, position: 1 },
  ];
  const createdChannels: ChannelAccess[] = [];
  let announcementChannelId: string | null = null;
  for (const d of defaults) {
    const channelId = newId();
    const row: ChannelRow = {
      id: channelId,
      communityId,
      name: d.name,
      kind: d.kind,
      position: d.position,
      topic: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(channels).values(row);
    if (d.kind === "announcement") {
      await grantAnnouncementReadOnly(db, channelId, now);
      announcementChannelId = channelId;
    }
    createdChannels.push(channelAccess(row, ALL_PERMISSIONS));
  }
  // 开箱指南：往公告频道发一条置顶说明，避免新人进来看到一片空白
  if (announcementChannelId) {
    await insertPinnedGuide(db, {
      channelId: announcementChannelId,
      communityId,
      authorId: userId,
      content: NEW_COMMUNITY_GUIDE,
      at: now,
    });
  }
  void everyone;
  const created = await mustRow(
    db.select().from(communities).where(eq(communities.id, communityId)).limit(1),
    "community",
  );
  return c.json({ ...mapCommunity(created), channels: createdChannels, inviteCode }, 201);
});

// --- GET /:id —— 详情（公开可看/私密需成员） ---
communitiesApi.get("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const row = await communityById(db, communityId);
  const access = await resolveCommunityPermissions(db, communityId, userId);
  if (!access.isMember && row.privacy === "private") {
    throw HttpApiError.forbidden("private community");
  }
  const chans = access.isMember ? await listChannelAccess(db, communityId, userId) : [];
  // 讨论组仅成员可见（含未读聚合）；公开访客拿空数组
  const threadSummaries = access.isMember
    ? await listThreadSummaries(db, { communityId }, userId)
    : [];
  return c.json({
    ...mapCommunity(row),
    channels: chans,
    threads: threadSummaries,
    myPermissions: access.permissions,
    isMember: access.isMember,
    myRoleIds: access.roleIds,
    roles: access.isMember ? access.roles.map(mapRole) : [],
  });
});

// --- PATCH /:id —— 改社区资料/隐私/短标识（MANAGE_COMMUNITY） ---
communitiesApi.patch("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await communityById(db, communityId);
  await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_COMMUNITY,
    "需要管理社区权限",
  );

  const body = await jsonBody<UpdateCommunityRequest>(c);
  if (body.name !== undefined) validateCommunityName(body.name);
  const patch: Partial<CommunityRow> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description;
  if (body.privacy !== undefined) patch.privacy = body.privacy;
  if (body.iconUrl !== undefined) patch.iconUrl = body.iconUrl;
  if (body.bannerUrl !== undefined) patch.bannerUrl = body.bannerUrl;
  if (body.slug !== undefined) {
    const slug = body.slug?.trim()?.toLowerCase() ?? null;
    if (slug) {
      const dup = await db
        .select()
        .from(communities)
        .where(and(eq(communities.slug, slug), sql`id != ${communityId}`))
        .limit(1);
      if (dup.length > 0) throw HttpApiError.conflict("slug 已被占用");
    }
    patch.slug = slug;
  }
  if (Object.keys(patch).length === 0) throw HttpApiError.badRequest("empty patch");
  patch.updatedAt = Date.now();
  await db
    .update(communities)
    .set(patch as never)
    .where(eq(communities.id, communityId));
  const updated = await mustRow(
    db.select().from(communities).where(eq(communities.id, communityId)).limit(1),
    "community",
  );
  return c.json(mapCommunity(updated));
});

// --- POST /join-by-code —— 用邀请码加入 ---
communitiesApi.post("/join-by-code", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const body = await jsonBody<{ inviteCode: string }>(c);
  const code = body.inviteCode?.trim();
  if (!code) throw HttpApiError.badRequest("inviteCode required");
  const row = (
    await db.select().from(communities).where(eq(communities.inviteCode, code)).limit(1)
  )[0];
  if (!row) throw new HttpApiError(400, "INVITE_CODE_INVALID", "invite code 无效");
  return joinCommunity(db, c, userId, row);
});

// --- POST /:id/join —— 加入公开社区；私有必须用 /join-by-code ---
communitiesApi.post("/:id/join", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const row = await communityById(db, communityId);
  if (row.privacy !== "public") {
    throw HttpApiError.forbidden("private community，请用邀请码加入（/join-by-code）");
  }
  return joinCommunity(db, c, userId, row);
});

async function joinCommunity(
  db: ReturnType<typeof dbOf>,
  c: AppCtx,
  userId: string,
  communityRow: CommunityRow,
): Promise<Response> {
  await requireNotBanned(db, communityRow.id, userId);
  const existing = await getMembership(db, communityRow.id, userId);
  if (!existing) {
    await db.insert(communityMembers).values({
      communityId: communityRow.id,
      userId,
      joinedAt: Date.now(),
    });
    await db
      .update(communities)
      .set({ memberCount: communityRow.memberCount + 1 })
      .where(eq(communities.id, communityRow.id));
  }
  // @everyone 角色兜底（历史社区可能缺失）
  await ensureEveryoneRole(db, communityRow.id, Date.now());
  // 收敛该用户可能遗留的 pending 邀请（用邀请码/公开方式加入也算接受邀请）
  await finalizePendingInvites(db, communityRow.id, userId, "accepted");
  const access = await resolveCommunityPermissions(db, communityRow.id, userId);
  const chans = await listChannelAccess(db, communityRow.id, userId);
  return c.json({
    ...mapCommunity(communityRow),
    channels: chans,
    myPermissions: access.permissions,
  });
}

// --- POST /:id/leave —— 退出（owner 需先转让） ---
communitiesApi.post("/:id/leave", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const member = await getMembership(db, communityId, userId);
  if (!member) throw HttpApiError.notFound("not a member");
  if (await isCommunityOwner(db, communityId, userId)) {
    throw HttpApiError.badRequest("owner 不能退出社区，请先转让所有权");
  }
  await db
    .delete(memberRoles)
    .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, userId)));
  await db
    .delete(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  const row = (
    await db.select().from(communities).where(eq(communities.id, communityId)).limit(1)
  )[0];
  if (row)
    await db
      .update(communities)
      .set({ memberCount: Math.max(0, row.memberCount - 1) })
      .where(eq(communities.id, communityId));
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json({ ok: true });
});

// --- POST /:id/transfer-owner —— 转让所有权（仅 owner） ---
communitiesApi.post("/:id/transfer-owner", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await communityById(db, communityId);
  await requireCommunityOwner(db, communityId, userId);

  const body = await jsonBody<TransferOwnerRequest>(c);
  const targetId = body.userId?.trim();
  if (!targetId) throw HttpApiError.badRequest("userId required");
  if (targetId === userId) throw HttpApiError.badRequest("你已经是 owner");
  await requireMember(db, communityId, targetId);

  await db
    .update(communities)
    .set({ ownerId: targetId, updatedAt: Date.now() })
    .where(eq(communities.id, communityId));
  return c.json({ ok: true });
});

// --- POST /:id/invites —— 邀请注册用户入社区（INVITE_MEMBERS） ---
communitiesApi.post("/:id/invites", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const actor = requireCurrentUser(c);
  const communityId = c.req.param("id");
  const row = await communityById(db, communityId);
  await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.INVITE_MEMBERS,
    "需要邀请成员权限",
  );

  const body = await jsonBody<CreateInviteRequest>(c);
  const who = body.handleOrEmail?.trim() ?? "";
  if (!who) throw HttpApiError.badRequest("handleOrEmail required");
  const found = await findAuthUserByHandleOrEmail(c.env.DB, who);
  if (!found) {
    throw new HttpApiError(
      404,
      "INVITE_INVALID",
      "未找到该用户：目前只能邀请已注册用户，请输入对方的 @handle 或注册邮箱",
    );
  }
  if (found.user.id === actorId) {
    throw HttpApiError.badRequest("不能邀请自己");
  }
  if (await isCommunityBanned(db, communityId, found.user.id)) {
    throw HttpApiError.badRequest("该用户已被封禁，无法邀请");
  }

  const invite = await createCommunityInvite({
    db,
    env: c.env,
    request: c.req.raw as Request,
    community: row,
    actor: { id: actorId, handle: actor.handle },
    target: { id: found.user.id, email: found.email },
  });
  return c.json({ ...invite, invitee: found.user }, 201);
});

// --- DELETE /:id —— 删除社区（仅 owner） ---
// 级联清理顺序：先删子表（消息/未读/频道）再删社区本身；角色/成员/覆盖由外键级联，
// 或在此显式清理以兼容本地旧库。R2 附件对象留在桶里由孤儿回收策略兜底。
communitiesApi.delete("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await communityById(db, communityId);
  await requireCommunityOwner(db, communityId, userId);

  const channelRows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.communityId, communityId));
  const channelIds = channelRows.map((r) => r.id);
  // 房间行删除后 DO 无法再解析权限，须先记下房间 id 供断连用
  const threadRows = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.communityId, communityId));
  if (channelIds.length > 0) {
    await db.delete(channelOverwrites).where(inArray(channelOverwrites.channelId, channelIds));
    await db.delete(channelReadStates).where(inArray(channelReadStates.channelId, channelIds));
  }
  await db.delete(messages).where(eq(messages.communityId, communityId));
  await db.delete(channels).where(eq(channels.communityId, communityId));
  await db.delete(memberRoles).where(eq(memberRoles.communityId, communityId));
  await db.delete(communityRoles).where(eq(communityRoles.communityId, communityId));
  await db.delete(communityMembers).where(eq(communityMembers.communityId, communityId));
  await db.delete(communities).where(eq(communities.id, communityId));
  await notifyRoomsAccessChanged(c.env, communityId, [
    ...channelIds,
    ...threadRows.map((r) => r.id),
  ]);
  return emptyOk(c);
});

/** 取消公告频道的 @everyone 只读（只摘掉自动叠加的 deny 位；空覆盖则删行） */
async function revokeAnnouncementReadOnly(
  db: ReturnType<typeof dbOf>,
  channelId: string,
  now: number,
): Promise<void> {
  const where = and(
    eq(channelOverwrites.channelId, channelId),
    eq(channelOverwrites.targetType, "everyone"),
    eq(channelOverwrites.targetId, EVERYONE_TARGET_ID),
  );
  const row = (await db.select().from(channelOverwrites).where(where).limit(1))[0];
  if (!row) return;
  const deny = row.deny & ~ANNOUNCEMENT_READONLY_DENY;
  if (deny === 0 && row.allow === 0) {
    await db.delete(channelOverwrites).where(where);
    return;
  }
  await db.update(channelOverwrites).set({ deny, updatedAt: now }).where(where);
}

// ================================================================
// 频道（创建挂在社区下 /:id/channels）
// ================================================================

// --- POST /:id/channels —— 新增频道（MANAGE_CHANNEL） ---
communitiesApi.post("/:id/channels", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await communityById(db, communityId);
  await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_CHANNEL,
    "需要管理频道权限",
  );

  const body = await jsonBody<CreateChannelRequest>(c);
  const name = body.name?.trim();
  if (!name || name.length > 80) throw HttpApiError.badRequest("频道名长度需在 1~80 之间");
  const now = Date.now();
  let position = body.position ?? 0;
  if (body.position === undefined) {
    const maxRow = await db
      .select({ value: sql<number>`COALESCE(MAX(position), 0)` })
      .from(channels)
      .where(eq(channels.communityId, communityId));
    position = (maxRow[0]?.value ?? 0) + 1;
  }
  const id = newId();
  const row: ChannelRow = {
    id,
    communityId,
    name,
    kind: body.kind ?? "text",
    position,
    topic: body.topic ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(channels).values(row);
  // 公告频道建好即为只读：补写 @everyone 覆盖，避免普通成员可发
  if (row.kind === "announcement") await grantAnnouncementReadOnly(db, id, now);
  const permissions = await resolveChannelPermissions(db, row, userId);
  return c.json(channelAccess(row, permissions), 201);
});

// ================================================================
// 角色（Discord 式）
// ================================================================

// --- GET /:id/roles —— 社区全部角色（成员可见） ---
communitiesApi.get("/:id/roles", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await requireMember(db, communityId, userId);
  const roles = await loadRoles(db, communityId);
  return c.json({ items: roles.map(mapRole) });
});

// --- POST /:id/roles —— 新建角色（MANAGE_ROLES；新角色落在自己层级之下） ---
communitiesApi.post("/:id/roles", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const access = await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_ROLES,
    "需要管理角色权限",
  );

  const body = await jsonBody<CreateRoleRequest>(c);
  const name = body.name?.trim();
  if (!name || name.length > 50) throw HttpApiError.badRequest("角色名长度需在 1~50 之间");
  if (name === "@everyone") throw HttpApiError.badRequest("@everyone 为保留角色名");
  const permissions = body.permissions ?? 0;
  assertGrantablePermissions(access, permissions);
  // 层级：owner 放最上方（max+1）；非 owner 放最下方且必须严格低于自己
  const custom = access.roles.filter((r) => !r.isEveryone);
  let position: number;
  if (access.isOwner) {
    position = custom.reduce((max, r) => Math.max(max, r.position), 0) + 1;
  } else {
    if (highestHeldPosition(access) === 0) {
      throw HttpApiError.forbidden("需要先拥有一个角色才能创建新角色");
    }
    position = custom.reduce((min, r) => Math.min(min, r.position), 1) - 1;
  }
  const row: CommunityRoleRow = {
    id: newId(),
    communityId,
    name,
    color: body.color ?? null,
    position,
    permissions,
    isEveryone: false,
    createdAt: Date.now(),
  };
  await db.insert(communityRoles).values(row);
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json(mapRole(row), 201);
});

// --- PUT /:id/roles/order —— 整体重排角色层级（MANAGE_ROLES；层级不低于自己的部分不可动） ---
communitiesApi.put("/:id/roles/order", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const access = await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_ROLES,
    "需要管理角色权限",
  );

  const body = await jsonBody<ReorderRolesRequest>(c);
  const orderedIds = [...new Set((body.roleIds ?? []).map((r) => r.trim()).filter(Boolean))];
  const plan = planRoleReorder(access, orderedIds);
  for (const step of plan) {
    await db
      .update(communityRoles)
      .set({ position: step.position })
      .where(and(eq(communityRoles.id, step.roleId), eq(communityRoles.communityId, communityId)));
  }
  await notifyCommunityAccessChanged(c.env, communityId);
  const roles = await loadRoles(db, communityId);
  return c.json({ items: roles.filter((r) => !r.isEveryone).map(mapRole) });
});

// --- PATCH /:id/roles/:roleId —— 改角色（MANAGE_ROLES；@everyone 不可改名） ---
communitiesApi.patch("/:id/roles/:roleId", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const roleId = c.req.param("roleId");
  const access = await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_ROLES,
    "需要管理角色权限",
  );

  const role = await firstOr404(
    db
      .select()
      .from(communityRoles)
      .where(and(eq(communityRoles.id, roleId), eq(communityRoles.communityId, communityId)))
      .limit(1),
    "role not found",
  );
  assertCanManageRole(access, role);
  const body = await jsonBody<UpdateRoleRequest>(c);
  const patch: Partial<CommunityRoleRow> = {};
  if (body.name !== undefined) {
    if (role.isEveryone) throw HttpApiError.badRequest("@everyone 角色不能改名");
    const name = body.name.trim();
    if (!name || name.length > 50) throw HttpApiError.badRequest("角色名长度需在 1~50 之间");
    if (name === "@everyone") throw HttpApiError.badRequest("@everyone 为保留角色名");
    patch.name = name;
  }
  if (body.color !== undefined) patch.color = body.color;
  if (body.permissions !== undefined) {
    // 只禁止「新增自己没有的位」；去掉已有位不算提权
    assertGrantablePermissions(access, body.permissions & ~role.permissions);
    patch.permissions = body.permissions;
  }
  if (Object.keys(patch).length === 0) throw HttpApiError.badRequest("empty patch");
  await db.update(communityRoles).set(patch).where(eq(communityRoles.id, roleId));
  const updated = await mustRow(
    db.select().from(communityRoles).where(eq(communityRoles.id, roleId)).limit(1),
    "role",
  );
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json(mapRole(updated));
});

// --- DELETE /:id/roles/:roleId —— 删角色（MANAGE_ROLES；@everyone 不可删） ---
communitiesApi.delete("/:id/roles/:roleId", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  const roleId = c.req.param("roleId");
  const access = await requireCommunityPermission(
    db,
    communityId,
    userId,
    Permission.MANAGE_ROLES,
    "需要管理角色权限",
  );

  const role = await firstOr404(
    db
      .select()
      .from(communityRoles)
      .where(and(eq(communityRoles.id, roleId), eq(communityRoles.communityId, communityId)))
      .limit(1),
    "role not found",
  );
  if (role.isEveryone) throw HttpApiError.badRequest("@everyone 角色不能删除");
  assertCanManageRole(access, role);
  await db.delete(memberRoles).where(eq(memberRoles.roleId, roleId));
  await db.delete(communityRoles).where(eq(communityRoles.id, roleId));
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json({ ok: true });
});

// ================================================================
// 成员
// ================================================================

// --- GET /:id/members —— 成员列表（成员可见；可 roleId 过滤） ---
communitiesApi.get("/:id/members", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await requireMember(db, communityId, userId);
  const q = c.req.query() as ListMembersQuery;
  const { limit, offset } = parseLimitOffset(c.req.query(), 50, 200);

  const rows = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(desc(communityMembers.joinedAt));
  const roleIdsByMember = await loadRoleIdsByMember(db, communityId);
  let filtered: CommunityMemberRow[] = rows;
  if (q.roleId) {
    filtered = rows.filter((r) =>
      (roleIdsByMember.get(r.userId) ?? []).includes(q.roleId as string),
    );
  }

  const users = await fetchUsersByIds(
    c.env.DB,
    filtered.map((r) => r.userId),
  );
  const userById = new Map(users.map((u) => [u.id, u]));
  let entries = filtered
    .map((r) => ({ member: r, user: userById.get(r.userId) ?? null }))
    .filter((e): e is { member: CommunityMemberRow; user: User } => e.user !== null);
  if (q.q?.trim()) {
    const needle = q.q.trim().toLowerCase();
    entries = entries.filter(
      (e) =>
        e.user.handle.toLowerCase().includes(needle) ||
        (e.user.displayName ?? "").toLowerCase().includes(needle),
    );
  }
  const total = entries.length;
  const page = entries.slice(offset, offset + limit);
  const items: CommunityMemberItem[] = page.map((e) => ({
    ...(e.member as unknown as CommunityMember),
    user: e.user,
    roleIds: roleIdsByMember.get(e.member.userId) ?? [],
  }));
  return c.json({ items, total, offset, limit });
});

// --- GET /:id/online —— 社区在线成员（聚合各频道 + 活跃讨论组的 DO presence，按用户去重） ---
communitiesApi.get("/:id/online", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const communityId = c.req.param("id");
  await requireMember(db, communityId, userId);

  // 只聚合「当前可能有人待着」的房间：全部频道 + 未归档讨论组（归档组无人发言不会有连接）
  const [channelRows, threadRows] = await Promise.all([
    db.select({ id: channels.id }).from(channels).where(eq(channels.communityId, communityId)),
    db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.communityId, communityId), eq(threads.status, "active"))),
  ]);
  const members = await loadCommunityOnline(
    c.env,
    [...channelRows, ...threadRows].map((row) => row.id),
  );
  const body: GetCommunityOnlineResponse = { count: members.length, members };
  return c.json(body);
});

// --- PUT /:id/members/:userId/roles —— 设置成员角色（MANAGE_ROLES，受层级限制） ---
communitiesApi.put("/:id/members/:userId/roles", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const communityId = c.req.param("id");
  const targetId = c.req.param("userId");
  const access = await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.MANAGE_ROLES,
    "需要管理角色权限",
  );

  await requireMember(db, communityId, targetId);
  if (await isCommunityOwner(db, communityId, targetId)) {
    throw HttpApiError.forbidden("不能修改 owner 的角色（owner 恒定拥有全部权限）");
  }

  const body = await jsonBody<SetMemberRolesRequest>(c);
  const roleIds = [...new Set((body.roleIds ?? []).map((r) => r.trim()).filter(Boolean))];
  if (roleIds.length > 0) {
    const valid = await db
      .select({ id: communityRoles.id, isEveryone: communityRoles.isEveryone })
      .from(communityRoles)
      .where(and(eq(communityRoles.communityId, communityId), inArray(communityRoles.id, roleIds)));
    const validIds = new Set(valid.filter((r) => !r.isEveryone).map((r) => r.id));
    for (const id of roleIds) {
      if (!validIds.has(id)) throw HttpApiError.badRequest("包含不属于该社区的角色 id");
    }
  }
  const currentRoleIds = await loadMemberRoleIds(db, communityId, targetId);
  assertMemberRolesEditable(access, currentRoleIds, roleIds);

  const now = Date.now();
  await db
    .delete(memberRoles)
    .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, targetId)));
  if (roleIds.length > 0) {
    await db
      .insert(memberRoles)
      .values(
        roleIds.map((roleId) => ({ communityId, userId: targetId, roleId, assignedAt: now })),
      );
  }
  const member = await mustRow(
    db
      .select()
      .from(communityMembers)
      .where(
        and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId)),
      )
      .limit(1),
    "membership",
  );
  const user = await fetchUserById(c.env.DB, targetId);
  if (!user) throw HttpApiError.notFound("user not found");
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json({
    ...(member as unknown as CommunityMember),
    user,
    roleIds,
  } satisfies CommunityMemberItem);
});

// --- DELETE /:id/members/:userId —— 踢人（KICK_MEMBERS；不能踢 owner/自己/层级更高者） ---
communitiesApi.delete("/:id/members/:userId", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const communityId = c.req.param("id");
  const targetId = c.req.param("userId");
  const access = await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.KICK_MEMBERS,
    "需要移除成员权限",
  );
  await requireMember(db, communityId, targetId);
  if (await isCommunityOwner(db, communityId, targetId))
    throw HttpApiError.badRequest("不能移除 owner");
  if (targetId === actorId) throw HttpApiError.badRequest("请用 leave 退出社区");
  assertCanManageMember(access, await loadMemberRoleIds(db, communityId, targetId));
  await db
    .delete(memberRoles)
    .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, targetId)));
  await db
    .delete(communityMembers)
    .where(
      and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId)),
    );
  const row = (
    await db.select().from(communities).where(eq(communities.id, communityId)).limit(1)
  )[0];
  if (row)
    await db
      .update(communities)
      .set({ memberCount: Math.max(0, row.memberCount - 1) })
      .where(eq(communities.id, communityId));
  await notifyCommunityAccessChanged(c.env, communityId);
  return emptyOk(c);
});

// --- GET /:id/bans —— 封禁列表（BAN_MEMBERS，时间倒序） ---
communitiesApi.get("/:id/bans", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const communityId = c.req.param("id");
  await communityById(db, communityId);
  await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.BAN_MEMBERS,
    "需要封禁成员权限",
  );

  const rows = await db
    .select()
    .from(communityBans)
    .where(eq(communityBans.communityId, communityId))
    .orderBy(desc(communityBans.createdAt));
  const users = await fetchUsersByIds(
    c.env.DB,
    rows.map((r) => r.userId),
  );
  const userById = new Map(users.map((u) => [u.id, u]));
  const items = rows
    .filter((r) => userById.has(r.userId))
    .map((r) => ({
      communityId: r.communityId,
      userId: r.userId,
      user: userById.get(r.userId) as User,
      bannedBy: r.bannedBy,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  return c.json({ items });
});

// --- POST /:id/bans —— 封禁：移出成员 + 记录封禁（BAN_MEMBERS；不能封 owner/自己/层级更高者） ---
communitiesApi.post("/:id/bans", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const communityId = c.req.param("id");
  const communityRow = await communityById(db, communityId);
  const access = await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.BAN_MEMBERS,
    "需要封禁成员权限",
  );

  const body = await jsonBody<BanCommunityMemberRequest>(c);
  const byUserId = body.userId?.trim() ?? "";
  const who = (body.handleOrEmail ?? "").trim();
  if (!byUserId && !who) throw HttpApiError.badRequest("userId 或 handleOrEmail 必填其一");
  let targetId: string;
  let targetUser: User;
  if (byUserId) {
    const target = await fetchUserById(c.env.DB, byUserId);
    if (!target) throw HttpApiError.notFound("user not found");
    targetId = byUserId;
    targetUser = target;
  } else {
    const found = await findAuthUserByHandleOrEmail(c.env.DB, who);
    if (!found) {
      throw HttpApiError.notFound("未找到该用户：请输入对方的 @handle 或注册邮箱");
    }
    targetId = found.user.id;
    targetUser = found.user;
  }
  if (targetId === communityRow.ownerId) throw HttpApiError.badRequest("不能封禁 owner");
  if (targetId === actorId) throw HttpApiError.badRequest("不能封禁自己");

  // 仍在该社区 → 同时移出成员与角色
  const membership = await getMembership(db, communityId, targetId);
  if (membership) {
    assertCanManageMember(access, await loadMemberRoleIds(db, communityId, targetId));
    await db
      .delete(memberRoles)
      .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, targetId)));
    await db
      .delete(communityMembers)
      .where(
        and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId)),
      );
    await db
      .update(communities)
      .set({ memberCount: Math.max(0, communityRow.memberCount - 1) })
      .where(eq(communities.id, communityId));
  }

  const now = Date.now();
  await db
    .insert(communityBans)
    .values({
      communityId,
      userId: targetId,
      bannedBy: actorId,
      reason: body.reason?.trim() || null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [communityBans.communityId, communityBans.userId],
      set: { bannedBy: actorId, reason: body.reason?.trim() || null, createdAt: now },
    });
  await notifyCommunityAccessChanged(c.env, communityId);
  return c.json({
    communityId,
    userId: targetId,
    user: targetUser,
    bannedBy: actorId,
    reason: body.reason?.trim() || null,
    createdAt: now,
  });
});

// --- DELETE /:id/bans/:userId —— 解封（BAN_MEMBERS） ---
communitiesApi.delete("/:id/bans/:userId", async (c) => {
  const db = dbOf(c);
  const actorId = requireUserId(c);
  const communityId = c.req.param("id");
  const targetId = c.req.param("userId");
  await communityById(db, communityId);
  await requireCommunityPermission(
    db,
    communityId,
    actorId,
    Permission.BAN_MEMBERS,
    "需要封禁成员权限",
  );
  await db
    .delete(communityBans)
    .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, targetId)));
  return c.json({ ok: true });
});

// ================================================================
// 频道独立路由（/api/channels/:id）—— 改 / 删 / 权限覆盖
// ================================================================

const channelsApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const channelsRoutes = channelsApi;

channelsApi.use("*", createBearerAuth("required"));

// --- PATCH /:id ---
channelsApi.patch("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const body = await jsonBody<UpdateChannelRequest>(c);
  const row = await loadChannelRow(db, c.req.param("id"));
  await requireChannelPermission(db, row, userId, Permission.MANAGE_CHANNEL, "需要管理频道权限");
  const patch: Partial<ChannelRow> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 80) throw HttpApiError.badRequest("频道名长度需在 1~80 之间");
    patch.name = name;
  }
  if (body.topic !== undefined) patch.topic = body.topic;
  if (body.position !== undefined) patch.position = body.position;
  if (body.kind !== undefined) patch.kind = body.kind;
  if (Object.keys(patch).length === 0) throw HttpApiError.badRequest("empty patch");
  const now = Date.now();
  patch.updatedAt = now;
  await db
    .update(channels)
    .set(patch as never)
    .where(eq(channels.id, row.id));
  // 在普通频道与公告频道之间切换时，同步 @everyone 只读覆盖
  const nextKind = patch.kind ?? row.kind;
  if (nextKind === "announcement" && row.kind !== "announcement") {
    await grantAnnouncementReadOnly(db, row.id, now);
  } else if (row.kind === "announcement" && nextKind !== "announcement") {
    await revokeAnnouncementReadOnly(db, row.id, now);
  }
  const updated = await mustRow(
    db.select().from(channels).where(eq(channels.id, row.id)).limit(1),
    "channel",
  );
  return c.json(updated);
});

// --- DELETE /:id —— 删频道（MANAGE_CHANNEL；同时断开该房间在线连接） ---
channelsApi.delete("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadChannelRow(db, c.req.param("id"));
  await requireChannelPermission(db, row, userId, Permission.MANAGE_CHANNEL, "需要管理频道权限");
  await db.delete(channels).where(eq(channels.id, row.id));
  await notifyRoomsAccessChanged(c.env, row.communityId, [row.id]);
  return emptyOk(c);
});

// --- GET /:id/overwrites —— 频道权限覆盖列表（社区级 MANAGE_CHANNEL，避免被频道级 deny 自锁） ---
channelsApi.get("/:id/overwrites", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadChannelRow(db, c.req.param("id"));
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_CHANNEL,
    "需要管理频道权限",
  );
  const items: ChannelOverwriteRow[] = await db
    .select()
    .from(channelOverwrites)
    .where(eq(channelOverwrites.channelId, row.id));
  return c.json({ items });
});

// --- PUT /:id/overwrites/:targetType/:targetId —— 写入/覆盖（社区级 MANAGE_CHANNEL） ---
channelsApi.put("/:id/overwrites/:targetType/:targetId", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadChannelRow(db, c.req.param("id"));
  const access = await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_CHANNEL,
    "需要管理频道权限",
  );

  const target = await validateOverwriteTarget(
    db,
    row.communityId,
    c.req.param("targetType"),
    c.req.param("targetId"),
  );
  const body = await jsonBody<SetChannelOverwriteRequest>(c);
  const allow = Number.isFinite(body.allow) ? body.allow | 0 : 0;
  const deny = Number.isFinite(body.deny) ? body.deny | 0 : 0;
  assertOverwritePermissions(allow, deny);
  // 只禁止「新增自己没有的放行位」；沿用/收紧既有覆盖不算提权
  const existing = (
    await db
      .select({ allow: channelOverwrites.allow })
      .from(channelOverwrites)
      .where(
        and(
          eq(channelOverwrites.channelId, row.id),
          eq(channelOverwrites.targetType, target.targetType),
          eq(channelOverwrites.targetId, target.targetId),
        ),
      )
      .limit(1)
  )[0];
  assertGrantablePermissions(access, allow & ~(existing?.allow ?? 0));
  const now = Date.now();
  await db
    .insert(channelOverwrites)
    .values({
      channelId: row.id,
      targetType: target.targetType,
      targetId: target.targetId,
      allow,
      deny,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        channelOverwrites.channelId,
        channelOverwrites.targetType,
        channelOverwrites.targetId,
      ],
      set: { allow, deny, updatedAt: now },
    });
  const saved = await mustRow(
    db
      .select()
      .from(channelOverwrites)
      .where(
        and(
          eq(channelOverwrites.channelId, row.id),
          eq(channelOverwrites.targetType, target.targetType),
          eq(channelOverwrites.targetId, target.targetId),
        ),
      )
      .limit(1),
    "overwrite",
  );
  await notifyCommunityAccessChanged(c.env, row.communityId);
  return c.json(saved);
});

// --- DELETE /:id/overwrites/:targetType/:targetId —— 清除覆盖（社区级 MANAGE_CHANNEL） ---
channelsApi.delete("/:id/overwrites/:targetType/:targetId", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadChannelRow(db, c.req.param("id"));
  await requireCommunityPermission(
    db,
    row.communityId,
    userId,
    Permission.MANAGE_CHANNEL,
    "需要管理频道权限",
  );
  const target = await validateOverwriteTarget(
    db,
    row.communityId,
    c.req.param("targetType"),
    c.req.param("targetId"),
  );
  await db
    .delete(channelOverwrites)
    .where(
      and(
        eq(channelOverwrites.channelId, row.id),
        eq(channelOverwrites.targetType, target.targetType),
        eq(channelOverwrites.targetId, target.targetId),
      ),
    );
  await notifyCommunityAccessChanged(c.env, row.communityId);
  return c.json({ ok: true });
});

void getEveryoneRole;
