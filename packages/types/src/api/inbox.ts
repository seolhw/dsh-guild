import type {
  Community,
  CommunityInvite,
  InviteStatus,
  Notification,
  PermissionFlags,
  User,
} from "../entities";
import type { OffsetPaginated, OffsetPaginationQuery } from "./common";
import type { ChannelAccess } from "./communities";

// ===============================================================
// /api/communities/:id/invites & /api/invites/* & /api/notifications/*
// —— 站内信收件箱 + 社区邀请（v1 收件箱只承载「邀请」事件）
// ===============================================================

// ------- 邀请 --------------------------------------------------------------

/** POST /api/communities/:id/invites —— 邀请一个已注册用户入社区（INVITE_MEMBERS） */
export interface CreateInviteRequest {
  /** @handle 或注册邮箱，二者都精确匹配 */
  handleOrEmail: string;
}

export type CreateInviteResponse = CommunityInvite & {
  /** 被邀请人的公开资料（不含邮箱） */
  invitee: User;
};

/**
 * POST /api/communities/:id/invite-emails
 * —— 站外邀请：只发一封「邀请链接 + 教程」邮件给还没注册的人，不建邀请记录。
 */
export interface SendInviteEmailRequest {
  /** 收件邮箱（无需是 DSH-Guild 用户） */
  email: string;
}

export type SendInviteEmailResponse = {
  /** 邮件已交给发信通道（RESEND 未配置时为 false，仅打日志） */
  sent: boolean;
  email: string;
};

/** POST /api/invites/:id/accept —— 接受邀请（仅被邀请人本人） */
export type AcceptInviteResponse = Community & {
  channels: ChannelAccess[];
  myPermissions: PermissionFlags;
};

/** POST /api/invites/:id/decline —— 拒绝邀请（仅被邀请人本人） */
export type DeclineInviteResponse = { ok: true };

// ------- 站内信（收件箱） ----------------------------------------------------

/** 列表项 = 站内信 + 邀请的实时状态（避免死链时按钮还可用） */
export type InboxItem = Notification & {
  /** kind=invite：对应邀请当前状态；null = 邀请已失效（如社区已删除） */
  invite: { id: string; status: InviteStatus } | null;
};

/** GET /api/notifications —— 我的站内信（新→旧） */
export interface ListNotificationsQuery extends OffsetPaginationQuery {
  /** 只列未读 */
  onlyUnread?: boolean;
}

export type ListNotificationsResponse = OffsetPaginated<InboxItem> & {
  /** 未读数（供角标显示，不受 onlyUnread 影响） */
  unread: number;
};

/** POST /api/notifications/:id/read —— 标记一条已读 */
export type MarkNotificationReadResponse = { ok: true };

/** POST /api/notifications/read-all —— 全部已读 */
export type MarkAllNotificationsReadResponse = { ok: true };
