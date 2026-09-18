// ================================================================
// 社区共享逻辑：communities 行 → Community 实体（路由多处复用）
// ================================================================

import type { Community } from "@dsh-guild/types/entities";
import type { CommunityRow } from "../db/schema";

/** communities 行 → 对外 Community 实体 */
export function mapCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    privacy: row.privacy,
    ownerId: row.ownerId,
    iconUrl: row.iconUrl,
    bannerUrl: row.bannerUrl,
    inviteCode: row.inviteCode,
    memberCount: row.memberCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
