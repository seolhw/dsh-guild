// ================================================================
// 实时广播：REST 写入成功后，用类型化 RPC 通知该频道的 ChannelActor(DO)。
//   每个频道一个 DO（idFromName(channelId)），DO 实例内扇出给在线订阅者。
//   失败不抛给业务（REST 写库成功才是关键；广播是尽力而为）。
//   数据隔离：广播只走 DO；消息等规范数据始终在业务 D1。
// ================================================================

import type { GetCommunityOnlineResponse } from "@dsh-guild/types/api";
import type { ServerFrame } from "@dsh-guild/types/ws";
import { eq } from "drizzle-orm";
import { createDbForWorker } from "../db";
import { channels, threads } from "../db/schema";
import type { Env } from "../types";

type CommunityOnlineMember = GetCommunityOnlineResponse["members"][number];

/** DO 原始快照行（snake_case，与 room.ts 的 online() 返回一致） */
type RoomOnlineRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  kind: "online" | "away" | "offline";
  last_seen: number;
};

const PRESENCE_RANK: Record<RoomOnlineRow["kind"], number> = { online: 0, away: 1, offline: 2 };

export async function broadcastToChannel(
  env: Env,
  channelId: string,
  frame: ServerFrame,
): Promise<void> {
  try {
    const stub = env.ROOM_ACTOR.get(env.ROOM_ACTOR.idFromName(channelId));
    await stub.broadcast(frame);
  } catch (error) {
    console.warn(`[realtime] broadcast failed for channel ${channelId}:`, error);
  }
}

/**
 * 通知一批房间（频道 / 讨论组）的 DO：重校验在线连接，失去 VIEW_CHANNEL 者被断开，
 * 其余收到 evt.community.access.changed 刷新 UI。用于社区被删除（房间行已不在库里）等场景。
 */
export async function notifyRoomsAccessChanged(
  env: Env,
  communityId: string,
  roomIds: readonly string[],
): Promise<void> {
  await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const stub = env.ROOM_ACTOR.get(env.ROOM_ACTOR.idFromName(roomId));
        await stub.accessChanged({ communityId, roomId });
      } catch (error) {
        console.warn(`[realtime] access-changed failed for room ${roomId}:`, error);
      }
    }),
  );
}

/**
 * 社区权限配置变更（角色 / 成员角色 / 频道覆盖 / 踢人 / 封禁 / 转让）后的通知：
 * 逐个通知该社区全部频道与讨论组的 DO。
 */
export async function notifyCommunityAccessChanged(env: Env, communityId: string): Promise<void> {
  try {
    const db = createDbForWorker(env.DB);
    const [channelRows, threadRows] = await Promise.all([
      db.select({ id: channels.id }).from(channels).where(eq(channels.communityId, communityId)),
      db.select({ id: threads.id }).from(threads).where(eq(threads.communityId, communityId)),
    ]);
    await notifyRoomsAccessChanged(
      env,
      communityId,
      [...channelRows, ...threadRows].map((row) => row.id),
    );
  } catch (error) {
    console.warn(`[realtime] access-changed notify failed for community ${communityId}:`, error);
  }
}

/**
 * 聚合一批房间（频道 / 讨论组）的在线名单：按用户去重，presence 取最强
 * （online > away > offline），lastSeen 取最近一次，最后按 presence、handle 排序。
 * DO 只统计仍保持连接的会话；单个房间查询失败按空快照处理（尽力而为）。
 */
export async function loadCommunityOnline(
  env: Env,
  roomIds: readonly string[],
): Promise<CommunityOnlineMember[]> {
  const snapshots = await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const stub = env.ROOM_ACTOR.get(env.ROOM_ACTOR.idFromName(roomId));
        const res = (await stub.online()) as unknown as { members: RoomOnlineRow[] };
        return res.members;
      } catch (error) {
        console.warn(`[realtime] online snapshot failed for room ${roomId}:`, error);
        return [] as RoomOnlineRow[];
      }
    }),
  );

  const merged = new Map<string, CommunityOnlineMember>();
  for (const member of snapshots.flat()) {
    const current = merged.get(member.user_id);
    if (!current) {
      merged.set(member.user_id, {
        userId: member.user_id,
        handle: member.handle,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        presence: member.kind,
        lastSeen: member.last_seen,
      });
      continue;
    }
    if (PRESENCE_RANK[member.kind] < PRESENCE_RANK[current.presence]) {
      current.presence = member.kind;
    }
    if (member.last_seen > current.lastSeen) current.lastSeen = member.last_seen;
  }

  return [...merged.values()].sort(
    (a, b) =>
      PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence] || a.handle.localeCompare(b.handle),
  );
}
