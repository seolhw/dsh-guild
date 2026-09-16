import type {
  ChannelKind,
  ChannelReadState,
  ID,
  Message,
  MessageReaction,
  TimestampMs,
  User,
} from "../entities";
import type { CursorPaginated, CursorPaginationQuery, EmptyResponse } from "./common";
import type { MessageAttachmentPut } from "./r2";

// ===============================================================
// /api/channels/:id/*  ——  频道消息 & 未读
// ===============================================================

/** GET /api/channels/:id/messages —— 历史消息（倒序 = 最新在前；倒序翻页靠 cursor）
 *  传 ?threadId=<讨论组 id> 时返回该讨论组的消息；不传只返回主频道直接消息 */
export interface ListMessagesQuery extends CursorPaginationQuery {
  /** 只看某条讨论组（thread）内的消息；留空 = 主频道 */
  threadId?: ID | null;
  /** 默认倒序（新→旧）。传 asc = 旧→新 */
  direction?: "desc" | "asc";
}

export type ListMessagesResponse = CursorPaginated<
  Message & { author: User; replyTo?: (Message & { author: User }) | null }
>;

/** POST /api/channels/:id/messages —— 发消息（实时广播走 WS） */
export interface CreateMessageRequest {
  content: string;
  /** 附件：先 PUT /api/r2/objects 拿 r2Key 列表再随消息提交 */
  attachments?: MessageAttachmentPut[];
  /**
   * @handle 列表（前端传 handle，后端解析成 userId 存入 mentions）。
   * 解析不到的 handle 会被忽略：正文里的 @ 就是用户打的普通字符，不报错。
   */
  mentionHandles?: string[];
  /** 正文是否 @所有人（@everyone）：后端展开成全体成员，用于提及未读与高亮 */
  mentionEveryone?: boolean;
  /** 回复的父消息 */
  replyToId?: ID | null;
  /** 发到某条讨论组（thread）里；空 = 发在主频道 */
  threadId?: ID | null;
  /** 挂一张分享卡片（通过 POST /api/shares 先创建，拿 id） */
  shareId?: ID | null;
}

export type CreateMessageResponse = Message & { author: User };

/** PATCH /api/messages/:id —— 改消息（作者本人 or admin） */
export interface UpdateMessageRequest {
  content?: string;
}
export type UpdateMessageResponse = Message & { author: User };

/** DELETE /api/messages/:id —— 删消息（作者 or admin） */
export type DeleteMessageResponse = EmptyResponse;

// ------- 置顶（pin） -------
// 置顶按「房间」维度生效：主频道直接消息与讨论组内消息各成一份列表。

/** POST /api/messages/:id/pin —— 置顶（需社区 MANAGE_MESSAGES 位） */
export type PinMessageResponse = Message & { author: User };

/** DELETE /api/messages/:id/pin —— 取消置顶（同上权限） */
export type UnpinMessageResponse = Message & { author: User };

/** GET /api/channels/:id/pins —— 该房间的置顶消息（?threadId= 取该讨论组的），按置顶时间倒序 */
export interface ListPinsResponse {
  items: Array<Message & { author: User }>;
}

// ------- 表情回应（reaction） -------

/** POST /api/messages/:id/reactions —— 切换表情回应（已回应过则取消） */
export interface ToggleMessageReactionRequest {
  emoji: string;
}

/** 返回该消息最新的整份回应聚合，客户端直接替换本地状态 */
export interface ToggleMessageReactionResponse {
  messageId: ID;
  reactions: MessageReaction[];
}

// ------- 未读 -----------------------------------------------------------

/** GET /api/channels/:id/read-state —— 我在该频道的未读 */
export type GetReadStateResponse = ChannelReadState & { lastMessageAt: number | null };

/** POST /api/channels/:id/read-state —— 上报「读到了哪条」（一般 WS 里也能发，HTTP 兜底） */
export interface UpdateReadStateRequest {
  lastReadMessageId: ID;
}
export type UpdateReadStateResponse = ChannelReadState;

// ------- 在线成员（读频道 DO 的 presence 快照，仅含当前保持连接的会话） -------

export interface ChannelOnlineMember {
  userId: ID;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  presence: "online" | "away" | "offline";
  /** 最近活跃时间（unix ms） */
  lastSeen: number;
}

/** GET /api/channels/:id/online —— 该频道当前在线成员 */
export type GetChannelOnlineResponse = {
  count: number;
  members: ChannelOnlineMember[];
};

// ------- 消息搜索（社区范围内按内容模糊匹配） -------

/** 搜索命中项：消息 + 作者 + 所属频道摘要（命中在讨论组内时附带 thread） */
export interface SearchMessageResult extends Message {
  author: User;
  channel: {
    id: ID;
    name: string;
    kind: ChannelKind;
  };
  /** 命中讨论组内的消息时给出；null = 命中主频道直接消息 */
  thread: {
    id: ID;
    name: string;
  } | null;
}

/** GET /api/messages/search —— 社区内消息搜索（各条件之间为「与」关系） */
export interface SearchMessagesQuery extends CursorPaginationQuery {
  communityId: ID;
  /** 搜索关键词（匹配消息正文）；留空时至少要给一个筛选条件 */
  q: string;
  /** 只看某个频道；留空 = 全社区 */
  channelId?: ID | null;
  /** 只看某个作者发的消息 */
  authorId?: ID | null;
  /** 起始时间（unix ms，含） */
  from?: TimestampMs | null;
  /** 结束时间（unix ms，含） */
  to?: TimestampMs | null;
  /** 只看提及我的消息 */
  mentionsMe?: boolean;
}

export type SearchMessagesResponse = CursorPaginated<SearchMessageResult>;
