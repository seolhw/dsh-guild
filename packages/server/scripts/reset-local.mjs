// ================================================================
// reset-local：清空本地 wrangler 模拟状态（D1/DO/R2 local）并重建 D1 schema。
//   等价手动：删除 .wrangler → `wrangler d1 migrations apply dsh-guild --local`
// 用法：pnpm db:reset-local（需先停掉 `pnpm dev`，避免文件占用/状态回写）
// ================================================================

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = resolve(pkgDir, ".wrangler", "state");

if (existsSync(stateDir)) {
  rmSync(stateDir, { recursive: true, force: true });
  console.log("[reset-local] 已清空 .wrangler/state（D1 / DO / R2 本地状态）");
} else {
  console.log("[reset-local] 无 .wrangler/state，跳过清理");
}

// 交互式确认用 'y\n' 喂给 wrangler（非 TTY 会走 fallback yes）
const child = spawn(
  "npx wrangler d1 migrations apply dsh-guild --local",
  { cwd: pkgDir, shell: true, stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin?.write("y\n");
child.stdin?.end();

const code = await new Promise((resolveCode) => child.on("exit", resolveCode));
process.exit(code ?? 1);
