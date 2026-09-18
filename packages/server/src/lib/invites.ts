// ================================================================
// 社区邀请的业务逻辑（建邀请 + 落站内信 + 发邮件；处理邀请后收尾）。
// 路由壳在 routes/communities.ts（创建）与 routes/invites.ts（接受/拒绝）。
// ================================================================

import type { InviteNotificationData } from "@dsh-guild/types/entities";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { type CommunityRow, type InviteRow, invites, notifications } from "../db/schema";
import type { Env } from "../types";
import { getMembership } from "./access";
import { dispatchInvitationEmail } from "./email";
import { HttpApiError } from "./errors";
import { newId } from "./ids";

export type { InviteRow };

/**
 * 创建一条社区邀请，并同步做三件事：
 *   1) invites 落一条 pending
 *   2) 给被邀请人写一条未读站内信（kind=invite）
 *   3) 后台给被邀请人发一封邮件（随请求 waitUntil）
 * 前置校验（对方已入会 / 已有 pending 邀请）在这里统一拦掉。
 */
export async function createCommunityInvite(args: {
  db: Db;
  env: Env;
  request: Request | undefined;
  community: CommunityRow;
  actor: { id: string; handle: string };
  target: { id: string; email: string };
}): Promise<InviteRow> {
  const { db, env, request, community, actor, target } = args;

  const membership = await getMembership(db, community.id, target.id);
  if (membership) {
    throw new HttpApiError(409, "ALREADY_MEMBER", "对方已是该社区成员");
  }
  const dup = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.communityId, community.id),
        eq(invites.inviteeUserId, target.id),
        eq(invites.status, "pending"),
      ),
    )
    .limit(1);
  if (dup.length > 0) {
    throw new HttpApiError(409, "INVITE_DUPLICATE", "对方已有一条待处理的邀请，请等待对方处理");
  }

  const now = Date.now();
  const inviteId = newId();
  await db.insert(invites).values({
    id: inviteId,
    communityId: community.id,
    inviterId: actor.id,
    inviteeUserId: target.id,
    inviteeEmail: target.email,
    status: "pending",
    createdAt: now,
    respondedAt: null,
  });

  const data: InviteNotificationData = {
    inviteId,
    communityId: community.id,
    communityName: community.name,
    communityIconUrl: community.iconUrl,
    inviterId: actor.id,
    inviterHandle: actor.handle,
  };
  await db.insert(notifications).values({
    id: newId(),
    userId: target.id,
    communityId: community.id,
    kind: "invite",
    title: `${actor.handle} 邀请你加入「${community.name}」`,
    body: `${actor.handle} 邀请你加入 DSH-Guild 社区「${community.name}」。`,
    data: JSON.stringify(data),
    isRead: false,
    createdAt: now,
  });

  // 邮件随响应返回后由 waitUntil 投递（未配置 RESEND 时仅打日志）
  dispatchInvitationEmail(env, request, {
    to: target.email,
    inviter: actor.handle,
    communityName: community.name,
    inviteCode: community.inviteCode ?? "",
  });

  const row = (await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1))[0];
  if (!row) throw HttpApiError.internal("invite row not found");
  return row;
}

/**
 * 把「某用户在某个社区的待处理邀请」收尾：更新状态 + 把该社区的邀请类站内信标记已读。
 * 用于：邀请被接受/拒绝，以及用户通过邀请码 / 公开加入把遗留 pending 一并收敛。
 */
export async function finalizePendingInvites(
  db: Db,
  communityId: string,
  userId: string,
  status: "accepted" | "declined",
): Promise<void> {
  const now = Date.now();
  await db
    .update(invites)
    .set({ status, respondedAt: now })
    .where(
      and(
        eq(invites.communityId, communityId),
        eq(invites.inviteeUserId, userId),
        eq(invites.status, "pending"),
      ),
    );
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.communityId, communityId),
        eq(notifications.kind, "invite"),
        eq(notifications.isRead, false),
      ),
    );
}
