// ================================================================
// 频道共享逻辑：按 id 取频道、社区下频道列表、公告频道默认只读覆盖
// ================================================================

import { EVERYONE_TARGET_ID, Permission, type PermissionFlags } from "@dsh-talk/types/entities";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { type ChannelRow, channelOverwrites, channels } from "../db/schema";
import { firstOr404 } from "./response";

/** 公告频道默认只读：给 @everyone 叠加 SEND_MESSAGES | CREATE_THREAD 的 deny
 *  （owner 绕过频道覆盖，因此仍可发布；其他角色/成员需在该频道显式 allow SEND_MESSAGES） */
export const ANNOUNCEMENT_READONLY_DENY: PermissionFlags =
  Permission.SEND_MESSAGES | Permission.CREATE_THREAD;

/** 按 id 取频道；不存在 404 */
export function loadChannelRow(db: Db, channelId: string): Promise<ChannelRow> {
  return firstOr404(
    db.select().from(channels).where(eq(channels.id, channelId)).limit(1),
    "channel not found",
  );
}

/** 某社区下的频道列表（按 position 升序） */
export function listChannels(db: Db, communityId: string): Promise<ChannelRow[]> {
  return db
    .select()
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(asc(channels.position));
}

/** 让公告频道对 @everyone 只读（保留既有 allow 与其它 deny 位） */
export async function grantAnnouncementReadOnly(
  db: Db,
  channelId: string,
  now: number,
): Promise<void> {
  await db
    .insert(channelOverwrites)
    .values({
      channelId,
      targetType: "everyone",
      targetId: EVERYONE_TARGET_ID,
      allow: 0,
      deny: ANNOUNCEMENT_READONLY_DENY,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        channelOverwrites.channelId,
        channelOverwrites.targetType,
        channelOverwrites.targetId,
      ],
      set: { deny: sql`${channelOverwrites.deny} | ${ANNOUNCEMENT_READONLY_DENY}`, updatedAt: now },
    });
}
