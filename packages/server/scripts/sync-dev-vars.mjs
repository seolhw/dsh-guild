// ================================================================
// predev：把 .env（包目录或仓库根）里的键同步到 .dev.vars，
// 让 `wrangler dev` 能读到 BETTER_AUTH_SECRET / RESEND_API_KEY 等
// 本地开发密钥。
// 说明：
//   - .env 与 .dev.vars 都被 git 忽略，不会入库。
//   - 只搬运认证相关变量（密钥 + BETTER_AUTH_URL）；其它策略都是代码常量，
//     不走 env。.dev.vars 里未出现在白名单的既有本地键会保留。
// ================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 只把认证 / 运营相关变量从 .env 同步到 .dev.vars（密钥 + 认证 URL） */
const KEY_ALLOWLIST = new Set([
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "ADMIN_TOKEN",
]);

const here = dirname(fileURLToPath(import.meta.url));
// script 位于 packages/server/scripts，故包目录 = ../，仓库根 = ../../../
const pkgDir = resolve(here, "..");
const repoRoot = resolve(pkgDir, "../..");

const candidates = [resolve(pkgDir, ".env"), resolve(repoRoot, ".env")];
const devVarsPath = resolve(pkgDir, ".dev.vars");

function parseEnvFile(filePath) {
  const entries = {};
  if (!existsSync(filePath)) return entries;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 去掉成对引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0) entries[key] = value;
  }
  return entries;
}

function serialize(entries) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
}

// 先读 .dev.vars 旧值作为基底（保留非白名单本地键），
// 再用 .env（本包 → 仓库根）里的白名单密钥覆盖同名旧值
const base = parseEnvFile(devVarsPath);
for (const candidate of candidates) {
  for (const [key, value] of Object.entries(parseEnvFile(candidate))) {
    if (KEY_ALLOWLIST.has(key)) base[key] = value;
  }
}
const merged = Object.entries(base)
  .sort(([a], [b]) => a.localeCompare(b))
  .reduce((acc, [k, v]) => {
    acc[k] = v;
    return acc;
  }, {});

const next = Object.keys(merged).length > 0 ? `${serialize(merged)}\n` : "";
const prev = existsSync(devVarsPath) ? readFileSync(devVarsPath, "utf8") : "";
if (next !== prev) {
  mkdirSync(dirname(devVarsPath), { recursive: true });
  writeFileSync(devVarsPath, next, "utf8");
  console.log(`[sync-dev-vars] 已同步 ${Object.keys(merged).length} 个本地变量 -> .dev.vars`);
}
