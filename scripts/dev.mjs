/**
 * DSH-Guild 开发看门狗：pnpm dev 的唯一入口。
 *
 * 同时负责两件事：
 *  1. 以 watch 模式跑 tsdown（源码变更 → 自动重打包 lib/）；
 *  2. 轮询 lib/ 产物，编译结果稳定后拉起 / 重启
 *     `npx @deepseek-ai/dsh --profile <dev 用 profile> --patch ./cordis.yml`。
 *
 * 只有 host 半边（lib/index.mjs）变化才会重启进程：它是启动时被 import 的
 * Node 侧插件（配置接口 / 会话打包 / 还原），改动必须重启才生效。client 半边
 * （lib/client.js）不用重启——DSH 的 client-hmr 会轮询产物并把新模块热重载进
 * 浏览器（~1s），所以改 UI 只需等 tsdown 打包完成即可，浏览器会自动更新。
 * 重启在本机 npx 缓存里跑，并加 --no-open 避免反复弹浏览器（首次仍会自动打开）。
 *
 * overlay 与「profile 里已安装的 dsh-guild」会撞同一个 loader entry id
 * （duplicate loader entry id: dsh-guild），所以看 profile 现状自动选：
 * 装了插件 → 改用隔离 profile（`<profile>-dev`，不存在时从官方模板初始化，
 * 只含 base + web-app，插件完全由本仓库的 cordis.yml 提供）；
 * 没装 → 直接用该 profile。两种启动方式因此都可用，dev 永远跑本地构建。
 * 想强制指定 profile 用 DSH_GUILD_PROFILE。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 用户实际使用的 profile（也就是 pnpm 里装插件的那份）。
const USER_PROFILE = process.env.DSH_PROFILE?.trim() || "web";
const DSH_HOME = process.env.DSH_HOME?.trim() || path.join(homedir(), ".dsh");
const GUILD_BUNDLE = "dsh-guild";

const profileDir = (name) => path.join(DSH_HOME, "profiles", name);

/** 该 profile 里是否装了 dsh-guild（dependencies 或 profile.bundles 任一命中）。 */
function profileHasGuild(name) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(profileDir(name), "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return GUILD_BUNDLE in deps || (pkg.dsh?.profile?.bundles ?? []).includes(GUILD_BUNDLE);
  } catch {
    return false;
  }
}

/**
 * overlay 与「profile 里已安装的 dsh-guild」会撞同一个 loader entry id
 * （duplicate loader entry id: dsh-guild），所以装了插件时就自动改用隔离 profile
 * （只含 base + web-app，插件完全由 cordis.yml 提供）；没装则直接用该 profile。
 * 两种启动方式因此都可用，dev 永远跑本地构建。DSH_GUILD_PROFILE 可强制指定。
 */
const DEV_PROFILE = process.env.DSH_GUILD_PROFILE?.trim() ||
  (profileHasGuild(USER_PROFILE) ? `${USER_PROFILE}-dev` : USER_PROFILE);
// 隔离 profile 不存在时用官方模板初始化（dsh 的 --from-default-profile）。
const INIT_PROFILE = existsSync(path.join(profileDir(DEV_PROFILE), "package.json"))
  ? ""
  : ` --from-default-profile ${USER_PROFILE}`;

// 决定「可以启动/重启 server」的产物：host 入口 + client 入口。
const WATCH_TARGETS = ["lib/index.mjs", "lib/client.js"];
// 必须重启进程的产物：只有 host 半边（Node 侧插件：配置接口 / 会话打包 / 还原）。
// client 半边（lib/client.js）由 DSH 自带的 client-hmr 轮询（~500ms）热重载到
// 浏览器：改 UI 只需 tsdown 重新打包，浏览器会自动 invalidate 该插件模块，无需重启。
const RESTART_TARGETS = ["lib/index.mjs"];
// 产物连续无新写入这么久，才认为一次编译完成（合并同一轮的多次写入）。
const SETTLE_MS = 700;
// 轮询 lib/ 产物 mtime 的间隔。
const POLL_MS = 250;
// 杀掉旧 server 后、拉起新 server 前的间隔，等端口释放。
const RELAUNCH_DELAY_MS = 500;

/** 读取仓库根 .env 里的 BETTER_AUTH_URL（与 server 同一个变量，决定连本地还是生产）。 */
function envServerUrl() {
  const fromProcess = process.env.BETTER_AUTH_URL?.trim();
  if (fromProcess) return fromProcess;
  let text = "";
  try {
    text = readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {
    return "";
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0 || line.slice(0, eq).trim() !== "BETTER_AUTH_URL") continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return "";
}

// 后端 Server 健康探测地址（worker.ts 的 /healthz）。仅提示，不阻塞 dev 主流程。
// 连接目标由 BETTER_AUTH_URL 决定：本地地址 → 本地 8787，生产地址 → 生产。
const SERVER_URL = (envServerUrl() || "http://127.0.0.1:8787").replace(/\/+$/, "");
const SERVER_HEALTH_URL = `${SERVER_URL}/healthz`;
// 只有本地 Server 才提示去跑 pnpm dev:server。
const IS_LOCAL_SERVER = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(SERVER_URL);

const IS_WIN = process.platform === "win32";

let shuttingDown = false;
let builder = null; // tsdown --watch 子进程
let server = null; // dsh web 子进程
let everStarted = false;
let relaunching = false;
let relaunchQueued = false;

let previousSig = "";
let stableAt = 0;
let handledSig = "";
let handledHostSig = "";
let seenWrite = false;

/** 后端 Server 健康状态：null=未知 / false=未就绪 / true=已就绪。仅记录+提示。 */
let serverHealthy = null;

function run(command, env = {}) {
  return spawn(command, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/** 单个产物的存在性 + size + mtime 信号。 */
function fileSignal(rel) {
  try {
    const st = statSync(path.join(ROOT, rel));
    return `${rel}:${st.size}:${Math.floor(st.mtimeMs)}`;
  } catch {
    return `${rel}:missing`;
  }
}

/** 构建完成判定用的整体产物信号（缺任何一个都算未就绪）。 */
function signature() {
  return WATCH_TARGETS.map(fileSignal).join("|");
}

/** 重启判定用的信号：只看 host 半边。 */
function restartSignature() {
  return RESTART_TARGETS.map(fileSignal).join("|");
}

function complete(sig) {
  return !sig.includes(":missing");
}

/** 杀掉 pid 对应的整棵进程树（dsh 由 npx → node 多层包着，只杀顶层会留孤儿）。 */
function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    // 进程已退出，忽略
  }
}

function bootServer(first) {
  const prefix = "npx --yes --no-install @deepseek-ai/dsh";
  const noOpen = first ? "" : " --no-open";
  const cmd = `${prefix} --profile ${DEV_PROFILE}${INIT_PROFILE} --patch ./cordis.yml${noOpen}`;
  if (!first) {
    console.log(`\n[dsh-guild] lib 已重建，正在重启 DSH web（${cmd}）...`);
  }
  const child = run(cmd);
  server = child;
  child.on("exit", () => {
    if (server === child) server = null;
  });
}

/** 编译完成后的重启流程：杀旧进程 → 短暂等待端口释放 → 拉起新进程。 */
function restartServer() {
  if (relaunching) {
    relaunchQueued = true;
    return;
  }
  relaunching = true;
  const old = server;
  server = null;
  const proceed = () => {
    relaunching = false;
    if (relaunchQueued && !shuttingDown) {
      relaunchQueued = false;
      restartServer();
    }
  };
  if (old) killTree(old.pid);
  setTimeout(() => {
    if (!shuttingDown) bootServer(false);
    proceed();
  }, RELAUNCH_DELAY_MS);
}

/** 探测配置的 Server 是否就绪，仅在状态变化时打印一次提示。 */
async function checkServerHealth() {
  let ok = false;
  try {
    const res = await fetch(SERVER_HEALTH_URL);
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (ok === serverHealthy) return;
  serverHealthy = ok;
  if (ok) {
    console.log(`\n[dsh-guild] ✅ 后端 Server 已就绪：${SERVER_HEALTH_URL}\n`);
  } else if (IS_LOCAL_SERVER) {
    console.error(
      `\n[dsh-guild] ❌ 无法连通后端 Server（${SERVER_URL}）。社区页将报 net::ERR_CONNECTION_REFUSED。\n` +
      "[dsh-guild] 请另开一个终端运行：pnpm dev:server\n",
    );
  } else {
    console.error(
      `\n[dsh-guild] ❌ 无法连通远端 Server（${SERVER_URL}，来自 BETTER_AUTH_URL）。\n` +
      "[dsh-guild] 请检查该地址是否可访问以及本机网络。\n",
    );
  }
}

function tick() {
  const sig = signature();
  const now = Date.now();
  if (sig !== previousSig) {
    previousSig = sig;
    // lib 里可能有上一次构建的残留：必须等 tsdown 真正写出一次新产物
    // （签名变化）才允许首次启动，避免拿旧代码起服务。
    if (!seenWrite && everStarted === false) seenWrite = true;
    // 产物齐全才开始计时；host 重建时 lib 里暂时缺 client.js 属正常。
    stableAt = complete(sig) ? now : 0;
    return;
  }
  if (!stableAt || sig === handledSig || shuttingDown) return;
  if (now - stableAt < SETTLE_MS) return;
  if (!seenWrite) return;
  handledSig = sig;
  if (!everStarted) {
    everStarted = true;
    handledHostSig = restartSignature();
    bootServer(true);
    return;
  }
  const hostSig = restartSignature();
  if (hostSig === handledHostSig) {
    // 只有 client 半边变了：client-hmr 会热重载浏览器侧模块，进程不用重启
    console.log(
      "\n[dsh-guild] client 已重建，浏览器会在 1s 内自动热重载（无需重启 DSH web）。\n",
    );
    return;
  }
  handledHostSig = hostSig;
  restartServer();
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(serverHealthPoll);
  if (builder) killTree(builder.pid);
  if (server) killTree(server.pid);
  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  "[dsh-guild] dev watch：源码变更将自动打包 lib/ 并重启 DSH web（Ctrl+C 退出）",
);
console.log(
  "[dsh-guild] 注意：本脚本只负责「打包 lib/ 并启动 DSH web（浏览器侧 UI）」，不会启动后端 Server。",
);
console.log(
  `[dsh-guild] DSH profile = ${DEV_PROFILE}${
    DEV_PROFILE === USER_PROFILE
      ? `（${USER_PROFILE} 里没装 dsh-guild，直接用它）`
      : `（${USER_PROFILE} 里装着 dsh-guild，改用隔离 profile，插件走 cordis.yml overlay）`
  }`,
);
console.log(
  IS_LOCAL_SERVER
    ? `[dsh-guild] 后端 Server = 本地 ${SERVER_URL}，需另开一个终端运行：pnpm dev:server`
    : `[dsh-guild] 后端 Server = 远端 ${SERVER_URL}（来自 BETTER_AUTH_URL），无需本地 dev:server`,
);

// TSDOWN_WATCH 告诉 tsdown.config.ts 这次是 watch：别 clean 掉整个 lib/，
// 否则只改 host 源码时 client.js 会被连带删除。
builder = run("tsdown --watch", { TSDOWN_WATCH: "1" });
builder.on("exit", (code) => {
  if (shuttingDown) return;
  console.error(`[dsh-guild] tsdown --watch 异常退出（code ${code}），结束 dev`);
  shutdown(code ?? 1);
});

const poll = setInterval(tick, POLL_MS);
tick();
// 每 2s 探测一次后端 Server，状态变化时打印提示（开始时若未就绪会提示如何启动后端）。
const serverHealthPoll = setInterval(() => void checkServerHealth(), 2000);
void checkServerHealth();
