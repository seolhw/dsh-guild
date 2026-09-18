// ================================================================
// Worker Bindings & Context 类型
// ================================================================

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { ID, User } from "@dsh-guild/types/entities";
import type { Db } from "./db";
import type { ChannelActor } from "./room";

export interface Env {
  // ---------- Wrangler bindings ----------
  DB: D1Database;
  R2: R2Bucket;
  /** ChannelActor：每个频道一个 DO 实例（idFromName(channelId)），RPC 类型化广播 */
  ROOM_ACTOR: DurableObjectNamespace<ChannelActor>;

  // ---------- Better Auth 密钥（本地放 packages/server/.dev.vars / 根 .env；生产用 wrangler secret put） ----------
  /** 认证服务对外公开地址，如 https://auth.example.com 或 http://localhost:8787。
   *  邮箱验证/重置链接都以它为基础。留空时按请求 Host 推导（本地开发够用） */
  BETTER_AUTH_URL?: string;
  /** 会话签名密钥，≥32 字符，必填 */
  BETTER_AUTH_SECRET?: string;

  // ---------- Resend 事务邮件 ----------
  RESEND_API_KEY?: string;

  // ---------- 运营（自托管可不配；不配则 /api/admin/* 不可用） ----------
  /** 管理接口口令：调用 /api/admin/* 时需带 X-Admin-Token 头与之一致 */
  ADMIN_TOKEN?: string;
}

// Hono ctx.set(...) 注入的变量
export interface HonoAppVariables {
  userId?: ID;
  currentUser?: User;
  requestId?: string;
  /** Drizzle D1 实例（中间件在 * 上注入一次） */
  db: Db;
}
