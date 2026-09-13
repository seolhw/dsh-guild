// ================================================================
// 消息共享逻辑：预置「指南」消息（新建社区 / 官方种子社区共用）
// ================================================================

import type { Db } from "../db";
import { messages } from "../db/schema";
import { newId } from "./ids";

/**
 * 在指定频道插入一条置顶消息（用于社区开箱指南、官方社区各频道说明）。
 * 只写规范数据（D1）、不做实时广播：调用时机都是「社区刚建好、还没人在线」。
 */
export async function insertPinnedGuide(
  db: Db,
  opts: {
    channelId: string;
    communityId: string;
    /** 作者 userId（必须是已注册用户，读取消息时会回查其资料） */
    authorId: string;
    content: string;
    /** 创建时间（默认当前）；同一批预置消息传同一个时间戳保持顺序稳定 */
    at?: number;
  },
): Promise<string> {
  const id = newId();
  const now = opts.at ?? Date.now();
  await db.insert(messages).values({
    id,
    channelId: opts.channelId,
    communityId: opts.communityId,
    authorId: opts.authorId,
    content: opts.content,
    attachments: null,
    mentions: null,
    shareCard: null,
    replyToId: null,
    threadId: null,
    pinnedAt: now,
    createdAt: now,
    updatedAt: null,
  });
  return id;
}
