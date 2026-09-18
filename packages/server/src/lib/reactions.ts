// ================================================================
// 消息表情回应（reaction）：聚合读取 + 行的组装。
//   存储：message_reactions 一行为「某人给某条消息的某个 emoji 投了一票」，
//   同一 (messageId, userId, emoji) 唯一；再次点击即删行（= 取消回应）。
//   对外：Message.reactions 是按 emoji 聚合后的数组（count + 我是否投过）。
// ================================================================

import type { MessageReaction } from "@dsh-guild/types/entities";
import { and, eq, inArray } from "drizzle-orm";
import type { MessageReactionRow } from "../db/schema";
import { messageReactions } from "../db/schema";
import type { db as dbOf } from "./db";

type Db = ReturnType<typeof dbOf>;

/** 单条反应 emoji 的最大长度（UTF-16 码元；覆盖 ZWJ 组合序列，防止塞长文本） */
export const MAX_REACTION_EMOJI_LENGTH = 16;

/** 按 emoji 聚合：票多在前，同票数按「首个回应时间」先后 */
function group(rows: MessageReactionRow[], meId: string): MessageReaction[] {
  const map = new Map<string, { count: number; me: boolean; firstAt: number }>();
  for (const row of rows) {
    const current = map.get(row.emoji);
    if (current) {
      current.count += 1;
      current.firstAt = Math.min(current.firstAt, row.createdAt);
      if (row.userId === meId) current.me = true;
    } else {
      map.set(row.emoji, {
        count: 1,
        me: row.userId === meId,
        firstAt: row.createdAt,
      });
    }
  }
  return [...map.entries()]
    .map(([emoji, value]) => ({ emoji, count: value.count, me: value.me, firstAt: value.firstAt }))
    .sort((a, b) => b.count - a.count || a.firstAt - b.firstAt)
    .map(({ emoji, count, me }) => ({ emoji, count, me }));
}

/** 一批消息的回应聚合（消息 id -> 聚合数组；没有回应的消息不出现在 Map 里） */
export async function loadReactionsByMessage(
  db: Db,
  messageIds: readonly string[],
  meId: string,
): Promise<Map<string, MessageReaction[]>> {
  const result = new Map<string, MessageReaction[]>();
  if (messageIds.length === 0) return result;
  const rows = await db
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, [...messageIds]));
  const byMessage = new Map<string, MessageReactionRow[]>();
  for (const row of rows) {
    const list = byMessage.get(row.messageId);
    if (list) list.push(row);
    else byMessage.set(row.messageId, [row]);
  }
  for (const [messageId, list] of byMessage) result.set(messageId, group(list, meId));
  return result;
}

/** 单条消息的回应聚合 */
export async function loadMessageReactions(
  db: Db,
  messageId: string,
  meId: string,
): Promise<MessageReaction[]> {
  const rows = await db
    .select()
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId));
  return group(rows, meId);
}

/** 我是否已给该消息回应过这个 emoji */
export async function hasMyReaction(
  db: Db,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const row = (
    await db
      .select({ emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji),
        ),
      )
      .limit(1)
  )[0];
  return row !== undefined;
}
