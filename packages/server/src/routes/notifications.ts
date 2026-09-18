// ================================================================
// /api/notifications/* —— 站内信（事件收件箱）
//   只返回「我」的信；kind=invite 时附带邀请实时状态（被删/已处理后按钮禁用）。
// ================================================================

import type { InboxItem, ListNotificationsQuery } from "@dsh-guild/types/api";
import type { NotificationData } from "@dsh-guild/types/entities";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { compact, uniq } from "es-toolkit/array";
import { Hono } from "hono";
import { invites, type NotificationRow, notifications } from "../db/schema";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { emptyOk, parseJson, parseLimitOffset } from "../lib/response";
import type { Env, HonoAppVariables } from "../types";

const notificationsApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const notificationsRoutes = notificationsApi;

notificationsApi.use("*", createBearerAuth("required"));

// --- GET / —— 我的站内信（新→旧）+ 未读数 ---
notificationsApi.get("/", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const q = c.req.query() as ListNotificationsQuery;
  const onlyUnread = q.onlyUnread === true;
  const { limit, offset } = parseLimitOffset(c.req.query(), 20, 50);

  const scopeConds = [eq(notifications.userId, userId)];
  if (onlyUnread) scopeConds.push(eq(notifications.isRead, false));

  const totalRow = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(...scopeConds));
  const unreadRow = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...scopeConds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  // 批量补 invite 实时状态（invite 行随社区被删级联消失 -> null）
  const inviteIds = compact(
    rows
      .filter((r) => r.kind === "invite")
      .map((r) => parseJson<NotificationData>(r.data)?.inviteId),
  );
  const inviteStatusById = new Map<string, "pending" | "accepted" | "declined">();
  if (inviteIds.length > 0) {
    const found = await db
      .select({ id: invites.id, status: invites.status })
      .from(invites)
      .where(inArray(invites.id, uniq(inviteIds)));
    for (const inv of found) inviteStatusById.set(inv.id, inv.status);
  }

  const items: InboxItem[] = rows.map((row: NotificationRow) => {
    const data = parseJson<NotificationData>(row.data);
    const inviteId = data?.inviteId ?? null;
    const status = inviteId ? inviteStatusById.get(inviteId) : undefined;
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      title: row.title,
      body: row.body,
      data,
      isRead: row.isRead,
      createdAt: row.createdAt,
      invite: inviteId && status !== undefined ? { id: inviteId, status } : null,
    };
  });

  return c.json({
    items,
    total: totalRow[0]?.value ?? 0,
    unread: unreadRow[0]?.value ?? 0,
    offset,
    limit,
  });
});

// --- POST /:id/read —— 标记一条已读 ---
notificationsApi.post("/:id/read", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const notificationId = c.req.param("id");
  const row = (
    await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .limit(1)
  )[0];
  if (!row) throw HttpApiError.notFound("notification not found");
  if (!row.isRead) {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
  }
  return emptyOk(c);
});

// --- POST /read-all —— 全部已读 ---
notificationsApi.post("/read-all", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return emptyOk(c);
});
