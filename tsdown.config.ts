/**
 * DSH-Guild 双面（dual-face）打包配置：
 *  - Node.js host（packages/host/src/index.ts）→ lib/index.mjs + index.cjs + d.ts
 *  - 浏览器 client（packages/client/src/index.ts）→ lib/client.js
 *    client 产物以 window.__ModuleLoader__.load({id, factory}) 交给 DSH 的
 *    web shell；react / cordis / ui-slots 等平台模块由 loader 的模块表提供，
 *    因此 externals（neverBundle），其余一律内联。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UserConfig } from "tsdown";

/** 浏览器平台模块（镜像 shell seed table） */
const PLATFORM_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
] as const;

export default (): UserConfig[] => {
  // watch（pnpm dev 看门狗）时不能 clean 整个 outDir：host 单独重建会把
  // 未变动的 client.js 一并删掉，导致 web shell 找不到浏览器半边。
  const watch = process.env.TSDOWN_WATCH === "1" || process.argv.includes("--watch");
  const configs: UserConfig[] = [
    {
      name: "dsh-guild/host",
      entry: ["packages/host/src/index.ts"],
      outDir: "lib",
      format: ["esm", "cjs"],
      target: "es2022",
      dts: true,
      clean: !watch,
      // cordis / dsh 系 / schemastery 在运行期由 DSH 模块图提供（dev 走 repo node_modules）
      deps: {
        neverBundle: [
          "@deepseek-ai/cordis",
          "@deepseek-ai/dsh-settings",
          "@deepseek-ai/dsh-host-webserver",
          "@deepseek-ai/schemastery",
        ],
      },
    },
  ];

  if (existsSync(resolve(process.cwd(), "packages/client/src/index.ts"))) {
    // 项目 logo：`public/` 不在 web shell 的静态目录里，浏览器侧拿不到这个文件，
    // 因此在构建期读成字符串注入（源码在 packages/client/public/logo.svg，
    // 消费方见 packages/client/src/components/styles.tsx 的 guildLogoUrl）。
    const logoSvg = readFileSync(resolve(process.cwd(), "packages/client/public/logo.svg"), "utf8");
    configs.push({
      name: "dsh-guild/client",
      entry: { client: "packages/client/src/index.ts" },
      outDir: "lib",
      format: "cjs",
      platform: "browser",
      target: "es2022",
      dts: false,
      sourcemap: true,
      clean: false,
      deps: {
        neverBundle: [...PLATFORM_MODULES],
        // 不在平台模块表里的依赖（@dsh-guild/types、我们自己的代码等）一律内联
        alwaysBundle: (id: string) => (PLATFORM_MODULES.includes(id as never) ? undefined : true),
      },
      alias: {
        // vfile@6 用 package.json 的 `imports`（#minpath / #minproc / #minurl）
        // 在 Node 版与 browser 版之间切换，rolldown 在 platform: "browser" 下
        // 会误选 Node 分支，把 require("node:path") 之类的调用留进产物，
        // 而 DSH loader 的模块表里没有这些名字 → 插件加载失败。
        // 这里直接指到浏览器替身，顺带覆盖其余可能的 node: 内置引用。
        "node:path": resolve(process.cwd(), "packages/client/src/shims/nodeBuiltins.ts"),
        "node:process": resolve(process.cwd(), "packages/client/src/shims/nodeBuiltins.ts"),
        "node:url": resolve(process.cwd(), "packages/client/src/shims/nodeBuiltins.ts"),
      },
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
        "import.meta.env.MODE": JSON.stringify(process.env.NODE_ENV ?? "production"),
        "import.meta.env": JSON.stringify({ MODE: process.env.NODE_ENV ?? "production" }),
        __DSH_GUILD_LOGO_SVG__: JSON.stringify(logoSvg),
      },
      outputOptions: {
        entryFileNames: "client.js",
        // DSH 的 loader 只加载 client.js 这一个文件，因此必须关闭代码分割：
        // Streamdown 内部有动态 import()（mermaid、Shiki 语言包），默认会拆出
        // chunk-*.cjs 等旁挂文件，运行时按相对路径取会 404。
        codeSplitting: false,
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify("dsh-guild")}, factory: (require) => {`,
        footer: "return module.exports; } });",
        intro: "var module = { exports: {} }; var exports = module.exports;",
      },
    });
  }

  return configs;
};
