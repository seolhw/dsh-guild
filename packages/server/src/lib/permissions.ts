// ================================================================
// Discord 式权限解析
//
// 模型：
//   - communities.ownerId 为 owner，恒定拥有全部权限（绕过一切判定，但转让/删社区之外仍需 owner）
//   - 每个社区必有且仅有一个 @everyone 角色（isEveryone，隐式作用于全体成员，position 恒 0）
//   - 建社区时预置一个「管理员」角色：就是个**普通角色**，权限按 ALL_PERMISSIONS 初始化，
//     可改名/可删/可任意增删权限位，也不会自动分配给任何人，需要 owner 手动分配
//   - 成员可持有多个自定义角色（member_roles），基础权限 = 各角色 permissions 的并集
//   - 角色带唯一 position（越大越靠上）；只能操作层级**严格低于**自己的角色/成员，
//     也不能授予自己没有的权限位（见 assert* / planRoleReorder）
//   - 频道维度用 channel_overwrites 对 @everyone / 角色 / 成员 叠加 allow/deny
//
// 解析顺序（与 Discord 一致）：
//   1) owner => ALL_PERMISSIONS（忽略覆盖）
//   2) 非成员 => 0（社区频道一律不可见）
//   3) 基础权限 base = union(全部持有角色.permissions，含 @everyone)
//   4) @everyone 覆盖：base = (base & ~deny) | allow
//   5) 持有角色的覆盖：按 position 从低到高逐个 (base & ~deny) | allow（高位覆盖低位）
//   6) 成员级覆盖：base = (base & ~deny) | allow
// ================================================================

import type { ChannelAccess } from "@dsh-guild/types/api";
import {
  ALL_PERMISSIONS,
  CHANNEL_OVERWRITE_PERMISSIONS,
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_EVERYONE_PERMISSIONS,
  Permission,
  type PermissionFlags,
} from "@dsh-guild/types/entities";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import {
  type ChannelOverwriteRow,
  type ChannelRow,
  type CommunityRoleRow,
  channelOverwrites,
  channels,
  communities,
  communityRoles,
  memberRoles,
} from "../db/schema";
import { getMembership } from "./access";
import { HttpApiError } from "./errors";
import { newId } from "./ids";

export type { CommunityRoleRow };

// ---------------- 角色读写 ----------------

/** 社区全部角色（position 大→小，@everyone 恒排最后） */
export async function loadRoles(db: Db, communityId: string): Promise<CommunityRoleRow[]> {
  const rows = await db
    .select()
    .from(communityRoles)
    .where(eq(communityRoles.communityId, communityId))
    .orderBy(desc(communityRoles.position), asc(communityRoles.createdAt));
  return rows.sort((a, b) => Number(a.isEveryone) - Number(b.isEveryone));
}

/** 取 @everyone 角色；不存在返回 null */
export async function getEveryoneRole(
  db: Db,
  communityId: string,
): Promise<CommunityRoleRow | null> {
  const rows = await db
    .select()
    .from(communityRoles)
    .where(and(eq(communityRoles.communityId, communityId), eq(communityRoles.isEveryone, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** 确保 @everyone 角色存在（建社区时调用） */
export async function ensureEveryoneRole(
  db: Db,
  communityId: string,
  now: number,
): Promise<CommunityRoleRow> {
  const existing = await getEveryoneRole(db, communityId);
  if (existing) return existing;
  const row: CommunityRoleRow = {
    id: newId(),
    communityId,
    name: "@everyone",
    color: null,
    position: 0,
    permissions: DEFAULT_EVERYONE_PERMISSIONS,
    isEveryone: true,
    createdAt: now,
  };
  await db.insert(communityRoles).values(row);
  return row;
}

/**
 * 建社区时预置管理员角色：permissions 按当时全部权限位初始化（就是一次普通赋值，
 * 后续新增的权限位不会自动补进来），position 固定 1（@everyone 恒 0）。
 * 它只是预设：可改名、可删、可任意增删权限位，也不会自动分配给任何人。
 */
export async function createDefaultAdminRole(
  db: Db,
  communityId: string,
  now: number,
): Promise<CommunityRoleRow> {
  const row: CommunityRoleRow = {
    id: newId(),
    communityId,
    name: DEFAULT_ADMIN_ROLE_NAME,
    color: null,
    position: 1,
    permissions: ALL_PERMISSIONS,
    isEveryone: false,
    createdAt: now,
  };
  await db.insert(communityRoles).values(row);
  return row;
}

/** 成员持有的角色 id（不含 @everyone） */
export async function loadMemberRoleIds(
  db: Db,
  communityId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(and(eq(memberRoles.communityId, communityId), eq(memberRoles.userId, userId)));
  return rows.map((r) => r.roleId);
}

/** 社区全部成员 → 角色 id 映射（用于成员列表） */
export async function loadRoleIdsByMember(
  db: Db,
  communityId: string,
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ userId: memberRoles.userId, roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(eq(memberRoles.communityId, communityId));
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.userId);
    if (list) list.push(r.roleId);
    else out.set(r.userId, [r.roleId]);
  }
  return out;
}

// ---------------- 权限计算 ----------------

/** 基础权限 = 各持有角色 permissions 的并集（含 @everyone） */
export function computeBasePermissions(
  roles: readonly CommunityRoleRow[],
  roleIds: readonly string[],
): PermissionFlags {
  const held = new Set(roleIds);
  let flags = 0;
  for (const role of roles) {
    if (role.isEveryone || held.has(role.id)) flags |= role.permissions;
  }
  return flags;
}

/**
 * 把频道覆盖按 Discord 顺序叠加到基础权限上：
 *   1) @everyone 覆盖
 *   2) 该成员持有的角色覆盖，**按角色层级从低到高**逐个整体覆盖
 *      （高位的 deny 能压过低位的 allow，反之亦然）
 *   3) 成员级覆盖（优先级最高）
 * 调用前保证调用方不是 owner（owner 忽略一切覆盖）。
 */
export function applyChannelOverwrites(
  base: PermissionFlags,
  roles: readonly CommunityRoleRow[],
  roleIds: readonly string[],
  overwrites: readonly ChannelOverwriteRow[],
): PermissionFlags {
  const held = new Set(roleIds);
  let flags = base;

  // 1) @everyone 覆盖
  for (const ow of overwrites) {
    if (ow.targetType !== "everyone") continue;
    flags = (flags & ~ow.deny) | ow.allow;
  }

  // 2) 角色覆盖：position 升序（低层级先应用，高层级后应用=最终生效）
  const byId = new Map(roles.map((r) => [r.id, r]));
  const ordered = overwrites
    .filter((ow) => ow.targetType === "role" && held.has(ow.targetId))
    .sort((a, b) => {
      const pa = byId.get(a.targetId)?.position ?? 0;
      const pb = byId.get(b.targetId)?.position ?? 0;
      if (pa !== pb) return pa - pb;
      return a.targetId < b.targetId ? -1 : 1;
    });
  for (const ow of ordered) {
    flags = (flags & ~ow.deny) | ow.allow;
  }

  // 3) 成员覆盖
  for (const ow of overwrites) {
    if (ow.targetType !== "member") continue;
    flags = (flags & ~ow.deny) | ow.allow;
  }
  return flags;
}

/**
 * 某频道「我」的权限位。
 * owner 拥有全量权限且忽略频道覆盖；非成员恒 0。
 */
export function computeChannelPermissions(opts: {
  basePermissions: PermissionFlags;
  isOwner: boolean;
  isMember: boolean;
  roles: readonly CommunityRoleRow[];
  roleIds: readonly string[];
  overwrites: readonly ChannelOverwriteRow[];
}): PermissionFlags {
  if (opts.isOwner) return ALL_PERMISSIONS;
  if (!opts.isMember) return 0;
  return applyChannelOverwrites(opts.basePermissions, opts.roles, opts.roleIds, opts.overwrites);
}

/** 按频道 id 分组加载覆盖行 */
export async function loadOverwritesByChannel(
  db: Db,
  channelIds: readonly string[],
): Promise<Map<string, ChannelOverwriteRow[]>> {
  const out = new Map<string, ChannelOverwriteRow[]>();
  if (channelIds.length === 0) return out;
  const rows = await db
    .select()
    .from(channelOverwrites)
    .where(inArray(channelOverwrites.channelId, [...channelIds]));
  for (const row of rows) {
    const list = out.get(row.channelId);
    if (list) list.push(row);
    else out.set(row.channelId, [row]);
  }
  return out;
}

// ---------------- 社区级解析 ----------------

export interface CommunityPermissions {
  isMember: boolean;
  isOwner: boolean;
  roleIds: string[];
  roles: CommunityRoleRow[];
  /** 基础权限（不含任何频道覆盖） */
  permissions: PermissionFlags;
}

/**
 * 解析「我」在某社区的身份与基础权限。
 * 非成员 => permissions = 0（公开访客看不到任何频道）。
 */
export async function resolveCommunityPermissions(
  db: Db,
  communityId: string,
  userId: string,
): Promise<CommunityPermissions> {
  const ownerRows = await db
    .select({ ownerId: communities.ownerId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  const ownerId = ownerRows[0]?.ownerId ?? null;
  const isOwner = ownerId !== null && ownerId === userId;

  const member = await getMembership(db, communityId, userId);
  const roles = await loadRoles(db, communityId);
  if (!member) {
    return { isMember: false, isOwner, roleIds: [], roles, permissions: 0 };
  }
  const roleIds = await loadMemberRoleIds(db, communityId, userId);
  const permissions = isOwner ? ALL_PERMISSIONS : computeBasePermissions(roles, roleIds);
  return { isMember: true, isOwner, roleIds, roles, permissions };
}

/** 某频道「我」的权限位（单频道，一次解析） */
export async function resolveChannelPermissions(
  db: Db,
  channel: ChannelRow,
  userId: string,
): Promise<PermissionFlags> {
  const access = await resolveCommunityPermissions(db, channel.communityId, userId);
  if (access.isOwner) return ALL_PERMISSIONS;
  if (!access.isMember) return 0;
  const owMap = await loadOverwritesByChannel(db, [channel.id]);
  return applyChannelOverwrites(
    access.permissions,
    access.roles,
    access.roleIds,
    owMap.get(channel.id) ?? [],
  );
}

/** 社区下「我」可见的频道（含各自权限位） */
export async function listChannelAccess(
  db: Db,
  communityId: string,
  userId: string,
): Promise<ChannelAccess[]> {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(asc(channels.position));
  const access = await resolveCommunityPermissions(db, communityId, userId);
  const owMap = access.isMember
    ? await loadOverwritesByChannel(
        db,
        rows.map((r) => r.id),
      )
    : new Map<string, ChannelOverwriteRow[]>();
  const out: ChannelAccess[] = [];
  for (const row of rows) {
    const permissions = computeChannelPermissions({
      basePermissions: access.permissions,
      isOwner: access.isOwner,
      isMember: access.isMember,
      roles: access.roles,
      roleIds: access.roleIds,
      overwrites: owMap.get(row.id) ?? [],
    });
    if ((permissions & Permission.VIEW_CHANNEL) === 0) continue;
    out.push({ ...row, permissions });
  }
  return out;
}

// ---------------- 角色层级（防提权） ----------------

/**
 * 我持有的最高角色层级（@everyone 不计入；无自定义角色 = 0）。
 * 层级比较一律用 position：position 大者在上，持权者只能操作**严格低于**自己的对象。
 */
export function highestHeldPosition(access: CommunityPermissions): number {
  const held = new Set(access.roleIds);
  let max = 0;
  for (const role of access.roles) {
    if (role.isEveryone || !held.has(role.id)) continue;
    if (role.position > max) max = role.position;
  }
  return max;
}

/** 只有 owner 与「层级严格高于该角色」的人能改/删/移动它 */
export function assertCanManageRole(access: CommunityPermissions, role: CommunityRoleRow): void {
  if (access.isOwner) return;
  if (role.position >= highestHeldPosition(access)) {
    throw HttpApiError.forbidden("不能操作层级不低于自己的角色");
  }
}

/** 频道覆盖只接受频道级权限位（社区级位不能作为覆盖目标） */
export function assertOverwritePermissions(allow: PermissionFlags, deny: PermissionFlags): void {
  const allowed = CHANNEL_OVERWRITE_PERMISSIONS.reduce((sum, p) => sum | p.bit, 0);
  if (((allow | deny) & ~allowed) !== 0) {
    throw HttpApiError.badRequest("频道覆盖只支持频道级权限位（不含社区级权限）");
  }
}

/** 非 owner 不得授予自己没有的权限位（角色基础权限与频道覆盖 allow 同理） */
export function assertGrantablePermissions(
  access: CommunityPermissions,
  permissions: PermissionFlags,
): void {
  if (access.isOwner) return;
  if ((permissions & ~access.permissions) !== 0) {
    throw HttpApiError.forbidden("不能授予自己没有的权限");
  }
}

/**
 * 不能管理「当前最高角色层级不低于自己」的成员（踢人 / 封禁 / 改角色共用）。
 */
export function assertCanManageMember(
  access: CommunityPermissions,
  targetRoleIds: readonly string[],
): void {
  if (access.isOwner) return;
  const mine = highestHeldPosition(access);
  const roleById = new Map(access.roles.map((r) => [r.id, r]));
  if (targetRoleIds.some((id) => (roleById.get(id)?.position ?? 0) >= mine)) {
    throw HttpApiError.forbidden("不能管理层级不低于自己的成员");
  }
}

/**
 * 设置成员角色前的层级校验：owner 恒可；否则
 *   - 不能管理「当前最高角色层级不低于自己」的成员
 *   - 不能授予或剥夺层级不低于自己的角色
 */
export function assertMemberRolesEditable(
  access: CommunityPermissions,
  targetRoleIds: readonly string[],
  nextRoleIds: readonly string[],
): void {
  if (access.isOwner) return;
  assertCanManageMember(access, targetRoleIds);
  const mine = highestHeldPosition(access);
  const roleById = new Map(access.roles.map((r) => [r.id, r]));
  if (nextRoleIds.some((id) => (roleById.get(id)?.position ?? 0) >= mine)) {
    throw HttpApiError.forbidden("不能授予层级不低于自己的角色");
  }
}

/**
 * 角色重排计划：owner 可整体重排；非 owner 只能重排层级严格低于自己的那段
 * （更高角色锁在原位），返回需要写入的新位置 roleId → position。
 * orderedIds 必须是全部自定义角色、按**从高到低**排列。
 */
export function planRoleReorder(
  access: CommunityPermissions,
  orderedIds: readonly string[],
): { roleId: string; position: number }[] {
  const custom = access.roles.filter((r) => !r.isEveryone);
  const customIds = new Set(custom.map((r) => r.id));
  for (const id of orderedIds) {
    if (!customIds.has(id)) throw HttpApiError.badRequest("包含不属于本社区的自定义角色 id");
  }
  if (orderedIds.length !== custom.length) {
    throw HttpApiError.badRequest("roleIds 必须恰好包含本社区全部自定义角色");
  }

  // 非 owner：层级 >= 自己的角色锁住，且提交顺序里这段前缀顺序必须保持不变
  const mine = highestHeldPosition(access);
  const locked = access.isOwner ? [] : custom.filter((r) => r.position >= mine);
  const lockedIds = new Set(locked.map((r) => r.id));
  if (locked.length > 0) {
    const lockedOrder = custom.filter((r) => lockedIds.has(r.id)).map((r) => r.id);
    const submitted = orderedIds.filter((id) => lockedIds.has(id));
    if (lockedOrder.join("\u0000") !== submitted.join("\u0000")) {
      throw HttpApiError.forbidden("不能调整层级不低于自己的角色");
    }
  }

  // 槽位沿用现有 position 集合：锁定角色占住原槽位，其余按提交顺序填入剩余槽位
  const allSlots = custom.map((r) => r.position).sort((a, b) => b - a);
  const lockedSlots = new Set(locked.map((r) => r.position));
  const freeSlots = allSlots.filter((p) => !lockedSlots.has(p));
  const plan: { roleId: string; position: number }[] = [];
  let next = 0;
  for (const id of orderedIds) {
    if (lockedIds.has(id)) continue;
    const position = freeSlots[next];
    next += 1;
    if (position !== undefined) plan.push({ roleId: id, position });
  }
  return plan;
}

// ---------------- 断言 ----------------

/** 社区级权限断言（owner 恒通过） */
export async function requireCommunityPermission(
  db: Db,
  communityId: string,
  userId: string,
  bit: PermissionFlags,
  message = "insufficient permissions",
): Promise<CommunityPermissions> {
  const access = await resolveCommunityPermissions(db, communityId, userId);
  if (!access.isMember) throw HttpApiError.forbidden("you are not a member of this community");
  if ((access.permissions & bit) === 0) throw HttpApiError.forbidden(message);
  return access;
}

/** 频道级权限断言（owner 恒通过；非成员/无位一律 403） */
export async function requireChannelPermission(
  db: Db,
  channel: ChannelRow,
  userId: string,
  bit: PermissionFlags,
  message = "insufficient permissions",
): Promise<void> {
  const permissions = await resolveChannelPermissions(db, channel, userId);
  if ((permissions & bit) === 0) throw HttpApiError.forbidden(message);
}

/** 仅 owner（删社区 / 转让所有权等敏感操作） */
export async function requireCommunityOwner(
  db: Db,
  communityId: string,
  userId: string,
): Promise<void> {
  const access = await resolveCommunityPermissions(db, communityId, userId);
  if (!access.isOwner) throw HttpApiError.forbidden("community owner required");
}

/** 是否 owner */
export async function isCommunityOwner(
  db: Db,
  communityId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ ownerId: communities.ownerId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return rows[0]?.ownerId === userId;
}
