// ---------------------------------------------------------------
// D1 实体类型（与 server/src/db/schema.ts 的 Drizzle 表一一对应）
// 命名规则：
//   - 读模型：Xxx（对外返回）
//   - 写模型：CreateXxx / UpdateXxx
// ---------------------------------------------------------------

/** 雪花 ID 或 UUID 字符串（服务端生成，客户端只当 opaque 处理） */
export type ID = string;

/** Unix 毫秒时间戳 */
export type TimestampMs = number;

/**
 * 消息可「撤回」（作者删除）的有效窗口。
 * 超过该时间后作者不能删除自己的消息，只能编辑（moderator 删除不受此限）。
 */
export const MESSAGE_RETRACT_MS = 2 * 60 * 1000;

// ====================== 用户 ======================

export interface User {
  id: ID;
  /** 平台内全局唯一的昵称/句柄（@alice） */
  handle: string;
  /** 显示名（可选，空时显示 handle） */
  displayName: string | null;
  /** 头像 URL（R2 或外部 CDN；可 null = 默认头像） */
  avatarUrl: string | null;
  /** 平台注册码换令牌首次写入时生成，不可变 */
  createdAt: TimestampMs;
}

// ====================== 社区 ======================

export type CommunityPrivacy = "public" | "private";

export interface Community {
  id: ID;
  name: string;
  slug: string | null;
  description: string | null;
  privacy: CommunityPrivacy;
  /** 创建者 UserId，社区 owner */
  ownerId: ID;
  /** 图标 URL */
  iconUrl: string | null;
  /** 横幅 URL（大卡头图） */
  bannerUrl: string | null;
  /** 加入码（创建社区时生成、固定不变；公开社区也可通过它定向加入） */
  inviteCode: string | null;
  memberCount: number;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

// ====================== 频道 ======================

/**
 * 频道定位（互斥）：普通文字（直接聊天 + 可开临时讨论）/
 * 公告（默认对 @everyone 只读，仅 owner 或被单独授权者可发）/
 * 话题（forum：不直接聊天，先建话题再进话题里聊）
 */
export type ChannelKind = "text" | "announcement" | "forum";

export interface Channel {
  id: ID;
  communityId: ID;
  name: string;
  kind: ChannelKind;
  /** 同一社区内的排序，越小越靠前 */
  position: number;
  topic: string | null;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

// ====================== 权限（Discord 式位标志） ======================

/**
 * 权限位（bitfield）。角色自带一组基础权限，频道再用 overwrite 对
 * @everyone / 角色 / 成员 逐个叠加 allow/deny；解析见 server/src/lib/permissions.ts。
 *
 * 命名与语义对齐 Discord：频道级位可作 overwrite 目标，社区级位只能挂在角色上
 * （见 PERMISSION_INFO 的 scope）。位序即 UI 展示顺序，新增位一律追加。
 */
export const Permission = {
  /** 查看频道：看不到 = 频道不下发、不可订阅、不可读消息 */
  VIEW_CHANNEL: 1 << 0,
  /** 发送消息：在主频道与讨论组里发言 */
  SEND_MESSAGES: 1 << 1,
  /** 创建讨论组/话题 */
  CREATE_THREAD: 1 << 2,
  /** 管理讨论组：改名/归档/删除/加人/标记解决 */
  MANAGE_THREADS: 1 << 3,
  /** 管理消息：改/删/撤回他人消息 */
  MANAGE_MESSAGES: 1 << 4,
  /** 管理频道：新建/改名/删除频道、调整顺序、管理频道权限覆盖 */
  MANAGE_CHANNEL: 1 << 5,
  /** 管理社区：改社区资料、隐私与短标识（删社区/转让仅 owner） */
  MANAGE_COMMUNITY: 1 << 6,
  /** 管理角色：增删改角色、调整层级、给成员分配角色（受层级限制） */
  MANAGE_ROLES: 1 << 7,
  /** 邀请成员：邀请注册用户加入社区 */
  INVITE_MEMBERS: 1 << 8,
  /** 移除成员（踢人，可被邀请码重新加入） */
  KICK_MEMBERS: 1 << 9,
  /** 封禁成员：移出并阻止重新加入、管理封禁名单 */
  BAN_MEMBERS: 1 << 10,
} as const;

export type PermissionBit = (typeof Permission)[keyof typeof Permission];

/** 权限位组合（bitfield number） */
export type PermissionFlags = number;

/** 全部权限位（owner 恒定拥有；建社区时预置的「管理员」角色也按它初始化） */
export const ALL_PERMISSIONS: PermissionFlags =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.CREATE_THREAD |
  Permission.MANAGE_THREADS |
  Permission.MANAGE_MESSAGES |
  Permission.MANAGE_CHANNEL |
  Permission.MANAGE_COMMUNITY |
  Permission.MANAGE_ROLES |
  Permission.INVITE_MEMBERS |
  Permission.KICK_MEMBERS |
  Permission.BAN_MEMBERS;

/** @everyone 默认权限：能看、能发、能开讨论组，但不能管理 */
export const DEFAULT_EVERYONE_PERMISSIONS: PermissionFlags =
  Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.CREATE_THREAD;

/**
 * 建社区时预置的「管理员」角色名。它就是个**普通角色**：权限按创建时的
 * ALL_PERMISSIONS 初始化，之后可改名、可删、可任意增删权限位，也不会自动分配给任何人；
 * 频道覆盖对它一样生效（不会绕过），新增权限位也不会自动补进已有角色。
 */
export const DEFAULT_ADMIN_ROLE_NAME = "管理员";

/** 权限位作用域：community = 只能挂在角色上；channel = 也可作为频道覆盖目标 */
export type PermissionScope = "community" | "channel";

/** 权限位元数据（管理界面/文档的唯一来源，避免各处重复维护中文名与说明） */
export interface PermissionInfo {
  bit: PermissionBit;
  label: string;
  hint: string;
  scope: PermissionScope;
}

/** 全部权限位元数据（顺序即 UI 顺序） */
export const PERMISSION_INFO: readonly PermissionInfo[] = [
  {
    bit: Permission.VIEW_CHANNEL,
    label: "查看频道",
    hint: "看不到则频道不下发、不可订阅、不可读消息",
    scope: "channel",
  },
  {
    bit: Permission.SEND_MESSAGES,
    label: "发送消息",
    hint: "在频道与讨论组里发言",
    scope: "channel",
  },
  {
    bit: Permission.CREATE_THREAD,
    label: "创建讨论组",
    hint: "在频道里开讨论组/话题",
    scope: "channel",
  },
  {
    bit: Permission.MANAGE_THREADS,
    label: "管理讨论组",
    hint: "改名/归档/删除讨论组、加人、标记解决",
    scope: "channel",
  },
  {
    bit: Permission.MANAGE_MESSAGES,
    label: "管理消息",
    hint: "改/删/撤回他人消息",
    scope: "channel",
  },
  {
    bit: Permission.MANAGE_CHANNEL,
    label: "管理频道",
    hint: "新建/改名/删除频道、调整顺序、管理频道权限覆盖",
    scope: "channel",
  },
  {
    bit: Permission.MANAGE_COMMUNITY,
    label: "管理社区",
    hint: "改社区资料、隐私与短标识（删除/转让仅 owner）",
    scope: "community",
  },
  {
    bit: Permission.MANAGE_ROLES,
    label: "管理角色",
    hint: "增删改角色、调整层级、给成员分配角色（受层级限制）",
    scope: "community",
  },
  {
    bit: Permission.INVITE_MEMBERS,
    label: "邀请成员",
    hint: "邀请已注册用户加入社区",
    scope: "community",
  },
  {
    bit: Permission.KICK_MEMBERS,
    label: "移除成员",
    hint: "把成员移出社区（可被邀请码重新加入）",
    scope: "community",
  },
  {
    bit: Permission.BAN_MEMBERS,
    label: "封禁成员",
    hint: "移出并禁止重新加入、管理封禁名单",
    scope: "community",
  },
];

/** 可作频道覆盖目标的权限位（社区级位不可覆盖） */
export const CHANNEL_OVERWRITE_PERMISSIONS: readonly PermissionInfo[] = PERMISSION_INFO.filter(
  (p) => p.scope === "channel",
);

/**
 * 社区角色（Discord 式）。每个社区必有且仅有一个 @everyone 角色
 * （isEveryone=true，position 恒为 0，自动作用于全部成员，不可删除/改名/调层级）。
 * owner（communities.ownerId）绕过所有权限判定。
 *
 * position：自定义角色取 1..N 的唯一槽位，越大越靠上；只有层级**严格更高**的人
 * 才能操作某角色（改/删/调层级），层级通过 PUT /roles/order 整体重排。
 */
export interface CommunityRole {
  id: ID;
  communityId: ID;
  name: string;
  /** 展示色（0xRRGGBB；null = 默认灰） */
  color: number | null;
  /** 层级槽位：越大越靠上（@everyone 恒为 0，自定义角色唯一） */
  position: number;
  /** 该角色自带的基础权限位 */
  permissions: PermissionFlags;
  /** 是否 @everyone（每社区唯一） */
  isEveryone: boolean;
  createdAt: TimestampMs;
}

/** 成员 ↔ 角色 分配（多对多；@everyone 不写行，隐式作用于全体成员） */
export interface RoleAssignment {
  communityId: ID;
  userId: ID;
  roleId: ID;
  assignedAt: TimestampMs;
}

/** 频道权限覆盖目标：@everyone / 角色 / 单个成员 */
export type OverwriteTargetType = "everyone" | "role" | "member";

/** @everyone 覆盖用固定 targetId（避免 null 主键） */
export const EVERYONE_TARGET_ID = "@everyone";

/** 频道权限覆盖（allow/deny 位并集，按 Discord 顺序叠加到角色基础权限上） */
export interface ChannelOverwrite {
  channelId: ID;
  targetType: OverwriteTargetType;
  /** role/member 时为 roleId/userId；everyone 时恒为 EVERYONE_TARGET_ID */
  targetId: ID;
  allow: PermissionFlags;
  deny: PermissionFlags;
  updatedAt: TimestampMs;
}

// ====================== 社区成员（多对多） ======================

export interface CommunityMember {
  communityId: ID;
  userId: ID;
  joinedAt: TimestampMs;
}

// ====================== 消息 ======================

export type MessageAttachmentKind = "image" | "file";

export interface MessageAttachment {
  kind: MessageAttachmentKind;
  /** R2 预签名/公开 URL */
  url: string;
  /** 原始文件名 */
  name: string;
  /** 字节数 */
  size: number;
  /** MIME */
  mimeType: string | null;
  /** 图片宽高（仅 image） */
  width?: number | null;
  height?: number | null;
}

export type MessageShareCardKind = "agent-session";

/** 消息内嵌的分享卡片引用（只占元数据；实际 payload 在 Share 表） */
export interface MessageShareCardRef {
  shareId: ID;
  kind: MessageShareCardKind;
  title: string;
  summary: string | null;
  /** 封面图 URL（可选） */
  coverUrl: string | null;
}

export interface Message {
  id: ID;
  channelId: ID;
  communityId: ID;
  authorId: ID;
  /** 非空，Markdown 原文 */
  content: string;
  attachments: MessageAttachment[];
  /** @某人 的 userId 列表（解析 @handle 后得到） */
  mentions: ID[];
  /** 分享卡片（0 或 1 条；目前一条消息只挂一张卡片） */
  shareCard: MessageShareCardRef | null;
  /** 引用/回复的父消息 ID */
  replyToId: ID | null;
  /** 所属讨论组（thread）id；null = 直接发在主频道 */
  threadId: ID | null;
  /** 表情回应（按 emoji 聚合，来自 message_reactions 表） */
  reactions: MessageReaction[];
  /** 被置顶的时间（null = 未置顶）；置顶按房间（频道或讨论组）维度展示 */
  pinnedAt: TimestampMs | null;
  createdAt: TimestampMs;
  updatedAt: TimestampMs | null;
}

/** 一条消息上的某个表情回应（按 emoji 聚合；同一人同一 emoji 只计一次） */
export interface MessageReaction {
  emoji: string;
  /** 回应人数 */
  count: number;
  /** 我是否也回应过这个 emoji */
  me: boolean;
}

// ====================== 讨论组（thread） ======================

/** 讨论组生命周期：活跃 / 已归档（24h 无新消息自动归档，可再发言恢复） */
export type ThreadStatus = "active" | "archived";

/**
 * 讨论组可见性：
 * - public：社区成员自由进入
 * - private：仅成员可进出；非成员可见但加锁。设了密码可凭密码进入，未设密码则只能被邀请
 */
export type ThreadVisibility = "public" | "private";

export interface Thread {
  id: ID;
  /** 所属社区 */
  communityId: ID;
  /** 依附的主频道 */
  channelId: ID;
  name: string;
  /** 创建讨论时点选的主频道消息（null = 手动新建的空白讨论组） */
  starterMessageId: ID | null;
  /** 发起人 userId（弱引用） */
  createdBy: ID;
  /** 发起人的快照（改名不改历史，方便列表展示） */
  creatorHandle: string;
  creatorDisplayName: string | null;
  creatorAvatarUrl: string | null;
  /** 起点消息正文摘要（空白讨论组为 null） */
  starterSnippet: string | null;
  status: ThreadStatus;
  /** 可见性（public / private） */
  visibility: ThreadVisibility;
  /** 私密讨论组是否设了进入密码（只暴露有无，不泄露密码本身） */
  hasPasscode: boolean;
  /** 讨论内消息总数（含起点引用消息？不含：只统计本线程消息行） */
  messageCount: number;
  lastMessageId: ID | null;
  /** 最近一次活跃时间（创建 / 新消息触发；自动归档依据） */
  lastActivityAt: TimestampMs;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
  /** 归档时间（active 时为 null） */
  archivedAt: TimestampMs | null;
}

/** 讨论组成员（仅私密讨论组有行；发起人建组时也会写入一行） */
export interface ThreadMember {
  threadId: ID;
  userId: ID;
  /** 邀请人（发起人自动加入时为发起人自己） */
  addedBy: ID;
  createdAt: TimestampMs;
}

/** 讨论组已读状态（用户 x 讨论组） */
export interface ThreadReadState {
  userId: ID;
  threadId: ID;
  lastReadMessageId: ID | null;
  lastReadAt: TimestampMs | null;
}

// ====================== 分享（DSH 会话） ======================

export type ShareKind = "agent-session";

export interface Share {
  id: ID;
  authorId: ID;
  kind: ShareKind;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  /** R2 对象 key（DSH 会话包 JSON） */
  r2Key: string;
  /** 字节数，用于校验下载完整性 */
  sizeBytes: number;
  /** SHA-256 hex（可选，存着方便校验） */
  sha256: string | null;
  /** 包体 manifest 快照字段（cwd / 事件数等） */
  manifest: Record<string, unknown>;
  /** 是否公开（未登录也能下载？一般 false，只有注册用户能看社区的才能下载） */
  public: boolean;
  downloadCount: number;
  createdAt: TimestampMs;
  updatedAt: TimestampMs | null;
}

// ====================== 频道未读状态（按 用户 x 频道） ======================

export interface ChannelReadState {
  userId: ID;
  channelId: ID;
  /** 最后一次已读消息 ID（null = 从未读过） */
  lastReadMessageId: ID | null;
  lastReadAt: TimestampMs | null;
  /** 该频道里 @我 且未读的消息数 */
  unreadMentions: number;
}

// ====================== 社区邀请 ======================

/** 邀请状态：pending → accepted / declined（社区被删时随邀请整行级联清除） */
export type InviteStatus = "pending" | "accepted" | "declined";

export interface CommunityInvite {
  id: ID;
  communityId: ID;
  /** 发起邀请的用户 id（owner/admin） */
  inviterId: ID;
  /** 被邀请的用户 id */
  inviteeUserId: ID;
  /** 被邀请人注册邮箱（发信快照；对外响应不携带，避免二次泄露） */
  inviteeEmail: string;
  status: InviteStatus;
  createdAt: TimestampMs;
  /** 处理时间（accepted/declined），未处理为 null */
  respondedAt: TimestampMs | null;
}

// ====================== 站内信（事件收件箱） ======================

/** v1 只有「邀请」这类事件，后续按需扩展该联合 */
export type NotificationKind = "invite";

/** kind = invite 时 data 的快照字段（建信时写死，防止关联对象被删后无法展示） */
export interface InviteNotificationData {
  inviteId: ID;
  communityId: ID;
  communityName: string;
  communityIconUrl: string | null;
  inviterId: ID;
  inviterHandle: string;
}

/** 各 kind 对应的 data 联合；目前只有邀请一种 */
export type NotificationData = InviteNotificationData;

export interface Notification {
  id: ID;
  /** 收件人 userId */
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  /** kind 相关的快照数据（按 kind 解码） */
  data: NotificationData | null;
  isRead: boolean;
  createdAt: TimestampMs;
}
