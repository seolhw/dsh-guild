// ================================================================
// /api/invites/:id/* —— 接受 / 拒绝社区邀请
//   仅被邀请人本人可处理；处理成功即入会，
//   同时把对应 pending 邀请收尾、站内信标已读。
// ================================================================

import type { AcceptInviteResponse } from "@dsh-guild/types/api";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { communities, communityMembers, type InviteRow, invites } from "../db/schema";
import { getMembership, requireNotBanned } from "../lib/access";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { mapCommunity } from "../lib/communities";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { finalizePendingInvites } from "../lib/invites";
import {
  ensureEveryoneRole,
  listChannelAccess,
  resolveCommunityPermissions,
} from "../lib/permissions";
import { emptyOk } from "../lib/response";
import type { Env, HonoAppVariables } from "../types";

const invitesApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const invitesRoutes = invitesApi;

invitesApi.use("*", createBearerAuth("required"));

async function loadInviteOr404(db: ReturnType<typeof dbOf>, inviteId: string): Promise<InviteRow> {
  const row = (await db.select().from(invites).where(eq(invites.id, inviteId)).limit(1))[0];
  if (!row) throw new HttpApiError(404, "INVITE_INVALID", "邀请不存在或已被撤销");
  return row;
}

// --- POST /:id/accept —— 接受邀请并加入社区 ---
invitesApi.post("/:id/accept", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const invite = await loadInviteOr404(db, c.req.param("id"));
  if (invite.inviteeUserId !== userId) {
    throw new HttpApiError(403, "INVITE_INVALID", "只有被邀请人可以处理这条邀请");
  }
  if (invite.status !== "pending") {
    throw new HttpApiError(409, "INVITE_INVALID", "该邀请已处理，无需重复操作");
  }
  const communityRow = (
    await db.select().from(communities).where(eq(communities.id, invite.communityId)).limit(1)
  )[0];
  if (!communityRow) {
    throw new HttpApiError(404, "INVITE_INVALID", "邀请的社区不存在或已删除");
  }

  const existing = await getMembership(db, communityRow.id, userId);
  if (!existing) {
    await requireNotBanned(db, communityRow.id, userId);
    await db.insert(communityMembers).values({
      communityId: communityRow.id,
      userId,
      joinedAt: Date.now(),
    });
    await db
      .update(communities)
      .set({ memberCount: communityRow.memberCount + 1 })
      .where(eq(communities.id, communityRow.id));
  }
  await finalizePendingInvites(db, communityRow.id, userId, "accepted");
  await ensureEveryoneRole(db, communityRow.id, Date.now());

  const access = await resolveCommunityPermissions(db, communityRow.id, userId);
  const chans = await listChannelAccess(db, communityRow.id, userId);
  const body: AcceptInviteResponse = {
    ...mapCommunity(communityRow),
    memberCount: communityRow.memberCount + (existing ? 0 : 1),
    channels: chans,
    myPermissions: access.permissions,
  };
  return c.json(body);
});

// --- POST /:id/decline —— 拒绝邀请 ---
invitesApi.post("/:id/decline", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const invite = await loadInviteOr404(db, c.req.param("id"));
  if (invite.inviteeUserId !== userId) {
    throw new HttpApiError(403, "INVITE_INVALID", "只有被邀请人可以处理这条邀请");
  }
  if (invite.status !== "pending") {
    throw new HttpApiError(409, "INVITE_INVALID", "该邀请已处理，无需重复操作");
  }
  await finalizePendingInvites(db, invite.communityId, userId, "declined");
  return emptyOk(c);
});
