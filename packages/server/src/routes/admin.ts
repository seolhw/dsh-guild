// ================================================================
// 运营用管理接口（/api/admin/*）
//
// 只给部署者本人使用，因此是「Bearer 会话 + X-Admin-Token」双重校验：
//   - Bearer 会话：确认调用者是一个真实注册用户（种子社区的 owner 就是 TA）
//   - X-Admin-Token：环境变量里的运营口令，避免任何一个注册用户抢先把
//     官方社区建到自己名下
// 未配置 ADMIN_TOKEN 时整个分组直接不可用（自托管实例默认就是关的）。
// ================================================================

import { Hono } from "hono";
import { createBearerAuth, requireUserId } from "../lib/auth";
import { db as dbOf } from "../lib/db";
import { HttpApiError } from "../lib/errors";
import { seedOfficialCommunities } from "../lib/official";
import type { Env, HonoAppVariables } from "../types";

const adminApi = new Hono<{ Bindings: Env; Variables: HonoAppVariables }>();

export const adminRoutes = adminApi;

adminApi.use("*", createBearerAuth("required"));

/**
 * POST /api/admin/seed-official —— 幂等写入官方社区（含默认角色、频道、置顶说明帖）。
 * 可重复执行：已存在的官方社区会被跳过。
 */
adminApi.post("/seed-official", async (c) => {
  const expected = c.env.ADMIN_TOKEN?.trim();
  if (!expected) {
    throw HttpApiError.forbidden("服务端未配置 ADMIN_TOKEN，管理接口已禁用");
  }
  if (c.req.header("X-Admin-Token")?.trim() !== expected) {
    throw HttpApiError.forbidden("X-Admin-Token 不正确");
  }
  const items = await seedOfficialCommunities(dbOf(c), requireUserId(c));
  return c.json({ items });
});
