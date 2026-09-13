import type {
  Channel,
  ChannelOverwrite,
  Community,
  CommunityMember,
  CommunityRole,
  ID,
  OverwriteTargetType,
  PermissionFlags,
  TimestampMs,
  User,
} from "../entities";
import type { OffsetPaginated, OffsetPaginationQuery } from "./common";
import type { ChannelOnlineMember } from "./messages";
import type { ThreadSummary } from "./threads";

// ===============================================================
// /api/communities/*  ——  社区 CRUD / 加入 / 邀请码 / 频道 / 角色 / 成员
// 权限模型：Discord 式角色 + 频道权限覆盖（overwrite）
//   - communities.ownerId = owner，绕过所有权限判定
//   - 每个社区一个 @everyone 角色（隐式作用于全体成员）+ 若干自定义角色
//   - 频道维度用 overwrite（@everyone / 角色 / 成员 的 allow-deny 位）叠加
// ===============================================================

/** 频道在「我」视角下的权限（VIEW/SEND/MANAGE/CREATE_THREAD 位） */
export type ChannelAccess = Channel & { permissions: PermissionFlags };

/** GET /api/communities/discover —— 发现页（公开社区目录） */
export interface DiscoverCommunitiesQuery extends OffsetPaginationQuery {
  /** 模糊搜索 name / description */
  q?: string;
  /** 排序：默认热门（memberCount desc）；active = 最近有消息优先；newest = 最新创建 */
  sort?: "hot" | "newest" | "active";
}

/**
 * 发现页条目：社区 + 活跃度概览。
 * 带上活跃度是为了让用户一眼看出「点进去有没有人说话」，避免进到空社区。
 */
export interface DiscoverCommunityItem extends Community {
  /** 官方预置社区（服务端按固定 id 判定；发现页置顶展示） */
  isOfficial: boolean;
  /** 该社区最后一条消息时间（null = 从未有消息；含讨论组消息） */
  lastMessageAt: TimestampMs | null;
  /** 近 7 天消息数 */
  recentMessages: number;
}

export type DiscoverCommunitiesResponse = OffsetPaginated<DiscoverCommunityItem>;

/** GET /api/communities/mine —— 我加入的社区列表（含 owner 的） */
export type GetMyCommunitiesResponse = (Community & {
  /** 我在该社区的基础权限（不含频道覆盖） */
  permissions: PermissionFlags;
  unreadChannels: number;
  unreadMentions: number;
})[];

/** POST /api/communities —— 创建社区（注册用户）；slug 由系统自动生成 */
export interface CreateCommunityRequest {
  name: string;
  description?: string | null;
  /** 默认 public */
  privacy?: "public" | "private";
  iconUrl?: string | null;
  bannerUrl?: string | null;
}

export type CreateCommunityResponse = Community & {
  /** 创建时自动生成的默认频道列表（含我在每个频道的权限） */
  channels: ChannelAccess[];
  /** 私有社区自动生成邀请码（public 也有但不强制使用） */
  inviteCode: string;
};

/** GET /api/communities/:id —— 取社区详情（已加入 or 公开） */
export type GetCommunityResponse = Community & {
  /** 我只能看到有 VIEW_CHANNEL 权限的频道（非成员为空） */
  channels: ChannelAccess[];
  /** 该社区全部讨论组（成员视角带未读；公开访客为 []） */
  threads: ThreadSummary[];
  /** 我在该社区的基础权限；非成员 = 0；私有未加入 = 403 */
  myPermissions: PermissionFlags;
  /** 我是否是该社区成员（与权限位无关：@everyone 全 0 时仍为 true） */
  isMember: boolean;
  /** 我持有的角色 id（@everyone 不计入） */
  myRoleIds: ID[];
  /** 社区全部角色（成员可见；公开访客为 []） */
  roles: CommunityRole[];
};

/** PATCH /api/communities/:id —— 改社区资料（MANAGE_COMMUNITY；slug/隐私同权） */
export interface UpdateCommunityRequest {
  name?: string;
  description?: string | null;
  privacy?: "public" | "private";
  iconUrl?: string | null;
  bannerUrl?: string | null;
  slug?: string | null;
}

export type UpdateCommunityResponse = Community;

/** POST /api/communities/join-by-code —— 用邀请码加入私有社区（公开社区直接 POST /join） */
export interface JoinByInviteRequest {
  inviteCode: string;
}

export type JoinByInviteResponse = Community & {
  channels: ChannelAccess[];
  myPermissions: PermissionFlags;
};

/** POST /api/communities/:id/join —— 加入公开社区；私有必须走 invite code */
export type JoinCommunityResponse = Community & {
  channels: ChannelAccess[];
  myPermissions: PermissionFlags;
};

/** POST /api/communities/:id/leave —— 退出（owner 不能退，必须先转让） */
export type LeaveCommunityResponse = { ok: true };

/** POST /api/communities/:id/transfer-owner —— 转让所有权（仅 owner） */
export interface TransferOwnerRequest {
  userId: ID;
}
export type TransferOwnerResponse = { ok: true };

/** DELETE /api/communities/:id —— 删除社区（仅 owner；成员/频道/消息/未读/邀请级联清理） */
export type DeleteCommunityResponse = { ok: true };

// ------- 频道 ----------------------------------------------------------------

/** POST /api/communities/:id/channels —— 新增频道（MANAGE_CHANNEL） */
export interface CreateChannelRequest {
  name: string;
  kind?: "text" | "announcement" | "forum";
  topic?: string | null;
  /** 插到什么位置；不传 = 末尾 */
  position?: number;
}

export type CreateChannelResponse = ChannelAccess;

/** PATCH /api/channels/:id —— 改频道（名、位置、topic、kind；MANAGE_CHANNEL） */
export interface UpdateChannelRequest {
  name?: string;
  topic?: string | null;
  position?: number;
  kind?: "text" | "announcement" | "forum";
}

export type UpdateChannelResponse = Channel;

/** DELETE /api/channels/:id —— 删频道（MANAGE_CHANNEL） */
export type DeleteChannelResponse = { ok: true };

// ------- 角色（Discord 式） --------------------------------------------------

/** GET /api/communities/:id/roles —— 社区全部角色（成员可见） */
export type ListRolesResponse = { items: CommunityRole[] };

/** POST /api/communities/:id/roles —— 新建角色（MANAGE_ROLES；新角色落在自己层级之下） */
export interface CreateRoleRequest {
  name: string;
  color?: number | null;
  permissions?: PermissionFlags;
}
export type CreateRoleResponse = CommunityRole;

/** PATCH /api/communities/:id/roles/:roleId —— 改角色（MANAGE_ROLES；只能改层级低于自己的角色） */
export interface UpdateRoleRequest {
  name?: string;
  color?: number | null;
  permissions?: PermissionFlags;
}
export type UpdateRoleResponse = CommunityRole;

/** DELETE /api/communities/:id/roles/:roleId —— 删角色（MANAGE_ROLES；@everyone 不可删） */
export type DeleteRoleResponse = { ok: true };

/**
 * PUT /api/communities/:id/roles/order —— 整体重排角色层级（MANAGE_ROLES）。
 * roleIds 必须恰好是本社区全部自定义角色，按**从高到低**排列；
 * 非 owner 只能重排层级严格低于自己的部分（更高角色保持原位）。
 */
export interface ReorderRolesRequest {
  roleIds: ID[];
}
export type ReorderRolesResponse = { items: CommunityRole[] };

// ------- 频道权限覆盖（overwrite） ------------------------------------------

/** GET /api/channels/:id/overwrites —— 该频道的覆盖列表（社区级 MANAGE_CHANNEL） */
export type ListChannelOverwritesResponse = { items: ChannelOverwrite[] };

/** PUT /api/channels/:id/overwrites/:targetType/:targetId —— 写入/覆盖（社区级 MANAGE_CHANNEL） */
export interface SetChannelOverwriteRequest {
  /** 允许的权限位 */
  allow: PermissionFlags;
  /** 拒绝的权限位 */
  deny: PermissionFlags;
}
export type SetChannelOverwriteResponse = ChannelOverwrite;

/** DELETE /api/channels/:id/overwrites/:targetType/:targetId —— 清除覆盖（社区级 MANAGE_CHANNEL） */
export type DeleteChannelOverwriteResponse = { ok: true };

// ------- 成员 ---------------------------------------------------------------

/** GET /api/communities/:id/members */
export interface ListMembersQuery extends OffsetPaginationQuery {
  /** 按角色过滤（角色 id） */
  roleId?: ID;
  /** 模糊搜索 handle/displayName */
  q?: string;
}

export type CommunityMemberItem = CommunityMember & { user: User; roleIds: ID[] };

export type ListMembersResponse = OffsetPaginated<CommunityMemberItem>;

/** PUT /api/communities/:id/members/:userId/roles —— 设置成员角色（MANAGE_ROLES，受角色层级限制） */
export interface SetMemberRolesRequest {
  /** 成员持有的角色 id 全集（@everyone 不需传） */
  roleIds: ID[];
}
export type SetMemberRolesResponse = CommunityMemberItem;

/** DELETE /api/communities/:id/members/:userId —— 踢人（KICK_MEMBERS，不能踢 owner） */
export type RemoveMemberResponse = { ok: true };

// ------- 在线（社区级：聚合各频道 + 活跃讨论组，按用户去重） ------------------

/** GET /api/communities/:id/online —— 社区当前在线成员（读各房间 DO 的 presence 快照） */
export type GetCommunityOnlineResponse = {
  count: number;
  members: ChannelOnlineMember[];
};

// ------- 封禁（成员被移出后阻止重新加入；BAN_MEMBERS） --------------------

/** 单条封禁：操作者 + 被封用户快照 + 理由/时间 */
export interface CommunityBanItem {
  communityId: ID;
  userId: ID;
  user: User;
  bannedBy: ID;
  reason: string | null;
  createdAt: TimestampMs;
}

/** GET /api/communities/:id/bans —— 封禁列表（时间倒序） */
export type ListCommunityBansResponse = { items: CommunityBanItem[] };

/** POST /api/communities/:id/bans —— 封禁（同时把其移出成员，若在社内） */
export interface BanCommunityMemberRequest {
  /** 按成员行封禁时可直接传 userId（优先）；二者必填其一 */
  userId?: ID;
  /** 按 @handle 或注册邮箱封禁（与邀请一致） */
  handleOrEmail?: string;
  /** 可选封禁理由（展示用） */
  reason?: string;
}
export type BanCommunityMemberResponse = CommunityBanItem;

/** DELETE /api/communities/:id/bans/:userId —— 解封 */
export type UnbanCommunityMemberResponse = { ok: true };

/** 覆盖目标类型（用于路由参数，避免与实体 import 冲突时重复声明） */
export type { OverwriteTargetType };
