// ================================================================
// /api/r2/objects —— 消息附件：Worker 直写 R2（非预签名 S3）
//   PUT /objects     上传：body = 文件原始字节（Bearer 鉴权）
//                      头部：X-File-Name（URL 编码）、Content-Type
//                      限制：单文件 <= MAX_R2_UPLOAD_BYTES
//   GET /objects/:key  读取：公开但 key 不可枚举（att<21位随机>）
//                      加 ?download=1 触发 Content-Disposition 下载
// 对象 key 语义：att + newId()，单个路径段、无斜杠，可直接作 URL 参数。
// ================================================================

import type { UploadAttachmentResponse } from "@dsh-guild/types/api";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MAX_ATTACHMENT_NAME, MAX_R2_UPLOAD_BYTES } from "../constants";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { HttpApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { type AppCtx, publicOrigin } from "../lib/response";
import type { Env, HonoAppVariables } from "../types";

const KEY_PREFIX = "att";

/** 公开读 URL（key 不可枚举；同源 Worker 代取） */
function objectReadUrl(c: AppCtx, key: string): string {
  return `${publicOrigin(c)}/api/r2/objects/${key}`;
}

function oversizedResponse() {
  const err = {
    code: "PAYLOAD_TOO_LARGE",
    message: `附件超过 ${Math.round(MAX_R2_UPLOAD_BYTES / 1024 / 1024)} MiB 上限`,
  };
  return Response.json(err, { status: 413 });
}

// ---------------- 写：PUT /objects（需登录） ----------------

const uploadApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();
export const r2UploadRoutes = uploadApi;

uploadApi.use("*", createBearerAuth("required"));

uploadApi.put(
  "/objects",
  bodyLimit({ maxSize: MAX_R2_UPLOAD_BYTES, onError: oversizedResponse }),
  async (c) => {
    const userId = requireUserId(c);

    const rawName = c.req.header("X-File-Name");
    if (!rawName) throw HttpApiError.badRequest("缺少 X-File-Name 头（原始文件名）");
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      throw HttpApiError.badRequest("X-File-Name 不是合法的 URL 编码");
    }
    name = name.trim();
    if (name.length === 0) throw HttpApiError.badRequest("文件名不能为空");
    if (name.length > MAX_ATTACHMENT_NAME)
      throw HttpApiError.badRequest(`文件名超过 ${MAX_ATTACHMENT_NAME} 字符`);

    const contentType = c.req.header("Content-Type") || "application/octet-stream";
    const key = `${KEY_PREFIX}${newId()}`;

    if (!c.req.raw.body) throw HttpApiError.badRequest("请求体为空");
    const object = await c.env.R2.put(key, c.req.raw.body, {
      httpMetadata: { contentType },
      customMetadata: {
        // 归属：后续创建消息时只允许附件上传者本人引用
        u: userId,
        // 原始文件名：读取时用于 Content-Disposition
        n: name,
      },
    });
    if (!object) throw HttpApiError.internal("R2 写入失败");

    const stored = object.httpMetadata?.contentType ?? contentType;
    return c.json(
      {
        r2Key: key,
        url: objectReadUrl(c, key),
        name,
        size: object.size,
        mimeType: stored,
      } satisfies UploadAttachmentResponse,
      201,
    );
  },
);

// ---------------- 读：GET /objects/:key（公开、key 不可枚举） ----------------

const readApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();
export const r2ObjectReadRoutes = readApi;

readApi.get("/objects/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2.get(key);
  if (!object) {
    return c.json({ code: "NOT_FOUND", message: "object not found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const wantDownload = c.req.query("download") === "1";
  const name = object.customMetadata?.n ?? object.key;
  if (wantDownload || !object.httpMetadata?.contentType?.startsWith("image/")) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  }

  return new Response(object.body, { headers });
});
