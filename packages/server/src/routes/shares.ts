// ================================================================
// /api/shares/* —— DSH 会话分享
//   POST   /agent-session 会话分享：host 打包 DSH 会话后直传 R2，这里只登记元数据
//   GET    /:id           元数据 + downloadUrl（作者 / 公开 / 来源社区成员）
// 权限：isPublic 仅对「归属公开社区」的来源置 true。
// ================================================================

import type { CreateAgentSessionShareRequest } from "@dsh-guild/types/api";
import type { Share } from "@dsh-guild/types/entities";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { MAX_SHARE_BYTES } from "../constants";
import { communities, type ShareRow, shares } from "../db/schema";
import { requireMember } from "../lib/access";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { type AppCtx, parseJson, publicOrigin } from "../lib/response";
import { requireUserById } from "../lib/users";
import type { Env, HonoAppVariables } from "../types";

const api = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();
export const sharesRoutes = api;

api.use("*", createBearerAuth("required"));

function rowToShare(row: ShareRow): Share {
  return {
    id: row.id,
    authorId: row.authorId,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    r2Key: row.r2Key,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    manifest: parseJson<Record<string, unknown>>(row.manifest) ?? {},
    public: row.isPublic,
    downloadCount: row.downloadCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadShareRow(c: AppCtx, shareId: string): Promise<ShareRow> {
  const db = dbOf(c);
  const row = (await db.select().from(shares).where(eq(shares.id, shareId)).limit(1))[0];
  if (!row) throw HttpApiError.notFound("share not found");
  return row;
}

/** 分享的来源社区（manifest 里记录 communityId；无则视为不公开给社区） */
function shareCommunityId(share: Share): string | null {
  const communityId = share.manifest?.communityId;
  return typeof communityId === "string" ? communityId : null;
}

// ---------------- 单条：GET ----------------

api.get("/:id", async (c) => {
  const db = dbOf(c);
  const userId = requireUserId(c);
  const row = await loadShareRow(c, c.req.param("id"));
  const share = rowToShare(row);

  // 作者/公开直通；其余须为来源社区成员（含私有社区内部共享）
  if (row.authorId !== userId && !share.public) {
    const communityId = shareCommunityId(share);
    if (!communityId) throw HttpApiError.forbidden("无权查看该分享");
    await requireMember(db, communityId, userId);
  }
  const author = await requireUserById(c.env.DB, row.authorId);
  const origin = publicOrigin(c);
  return c.json({
    ...share,
    author,
    downloadUrl: `${origin}/api/r2/objects/${row.r2Key}?download=1`,
  });
});

// ---------------- 登记会话分享：POST /agent-session ----------------
// 包体由本机 host 打包后经 PUT /api/r2/objects 直传 R2，这里只登记元数据。

api.post(
  "/agent-session",
  validator("json", (v) => v as CreateAgentSessionShareRequest),
  async (c) => {
    const db = dbOf(c);
    const userId = requireUserId(c);
    const body = c.req.valid("json" as never) as CreateAgentSessionShareRequest;

    const r2Key = (body.r2Key ?? "").trim();
    if (!r2Key) throw HttpApiError.badRequest("r2Key 必填");
    const title = (body.title ?? "").trim();
    if (!title) throw HttpApiError.badRequest("title 必填");
    const sizeBytes = Number(body.sizeBytes);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw HttpApiError.badRequest("sizeBytes 无效");
    }
    if (sizeBytes > MAX_SHARE_BYTES) {
      const mb = Math.round(MAX_SHARE_BYTES / 1024 / 1024);
      throw HttpApiError.badRequest(`分享包超过 ${mb} MiB 上限`);
    }

    // 归属社区（可选）：提供时须为成员，并据社区可见性决定是否公开进广场
    const communityId = (body.communityId ?? "").trim() || null;
    let isPublic = false;
    if (communityId) {
      await requireMember(db, communityId, userId);
      const community = (
        await db.select().from(communities).where(eq(communities.id, communityId)).limit(1)
      )[0];
      if (!community) throw HttpApiError.notFound("community not found");
      isPublic = community.privacy === "public";
    }

    const shareId = newId();
    const now = Date.now();
    const manifest = {
      ...(body.manifest ?? {}),
      ...(communityId ? { communityId } : {}),
    };
    await db.insert(shares).values({
      id: shareId,
      authorId: userId,
      kind: "agent-session",
      title,
      summary: body.summary?.trim() || null,
      coverUrl: null,
      r2Key,
      sizeBytes,
      sha256: body.sha256?.trim() || null,
      manifest: JSON.stringify(manifest),
      isPublic,
      downloadCount: 0,
      createdAt: now,
      updatedAt: null,
    });

    const created = (await db.select().from(shares).where(eq(shares.id, shareId)).limit(1))[0];
    if (!created) throw HttpApiError.internal("share row not found");
    const author = await requireUserById(c.env.DB, userId);
    const origin = publicOrigin(c);
    return c.json(
      {
        share: { ...rowToShare(created), author },
        downloadUrl: `${origin}/api/r2/objects/${r2Key}?download=1`,
      },
      201,
    );
  },
);
