// ================================================================
// drizzle-kit config
// 目标：SQLite（Cloudflare D1 与本地 dev 一致）
//   pnpm db:generate  → 生成 SQL 到 drizzle/
//   pnpm db:up        → 推到本地 SQLite（见 db:sqlite）
//   pnpm db:apply-local → 用 wrangler D1 把 drizzle/*.sql 应用到本地 D1
//   pnpm db:studio    → 可视化 schema
// ================================================================

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // drizzle-kit check / up / studio 默认连这个本地 SQLite
  dbCredentials: {
    url: process.env.DB_SQLITE_URL ?? "./.data/guildserver.db",
  },
  // 输出格式：D1 友好（不要求 SQLite 版本过高的语法）
  migrations: {
    prefix: "timestamp",
  },
  verbose: true,
  strict: true,
});
