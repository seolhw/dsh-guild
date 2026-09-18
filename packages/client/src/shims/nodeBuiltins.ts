// ================================================================
// 浏览器侧对 Node 内置模块（node:path / node:process / node:url）的最小替身。
//
// 为什么需要：Streamdown 的依赖链里带进了 unified / vfile，而 vfile@6 用
// package.json 的 `imports` 条件导出（#minpath / #minproc / #minurl）在
// Node 版与 browser 版之间切换。rolldown 在 platform: "browser" 下没能识别
// 这组条件导出，取到了 Node 分支，于是打包产物顶部残留了
// require("node:path") 之类的调用——DSH 的 loader 模块表里没有这些名字，
// 插件一加载就报 "missed the module table"。
//
// 通过 tsdown 的 alias 把这三个说明符指到本文件，vfile 就走浏览器语义。
// 三个内置模块共用一份导出：路径相关成员满足 node:path，cwd/env 满足
// node:process，fileURLToPath 满足 node:url；vfile 只会碰到这几种用法。
// ================================================================

const sep = "/";

function normalize(parts: string[]): string {
  const out: string[] = [];
  for (const part of parts.join(sep).split(sep)) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return out.join(sep);
}

function basename(input: string, ext?: string): string {
  const name = input.split(sep).pop() ?? "";
  if (ext && name.endsWith(ext)) return name.slice(0, name.length - ext.length);
  return name;
}

function dirname(input: string): string {
  const parts = input.split(sep);
  parts.pop();
  return parts.length === 0 ? "." : parts.join(sep);
}

function extname(input: string): string {
  const name = basename(input);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

function join(...parts: string[]): string {
  return normalize(parts);
}

function fileURLToPath(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input) : input;
  return decodeURIComponent(url.pathname);
}

// vfile 只在没传 options 时取 cwd 作为基准目录；浏览器里没有工作目录，
// 用 origin 当根即可（vfile 的 path 计算不是关键路径）。
function cwd(): string {
  return typeof globalThis.location === "object" ? globalThis.location.origin : "/";
}

// 用具名命名空间 + default 同时导出：vfile 走 `import path from "node:path"`
// 取 default，而 rolldown 对 default 做 tree-shaking 时只会保留真正被读到
// 的属性，所以这里把所有成员都挂上。
const nodeBuiltins = {
  basename,
  cwd,
  dirname,
  env: {},
  extname,
  fileURLToPath,
  join,
  normalize,
  platform: "browser",
  posix: { basename, dirname, extname, join, normalize, sep },
  resolve: join,
  sep,
};

export default nodeBuiltins;
export { basename, cwd, dirname, extname, fileURLToPath, join, normalize, sep };
