# 参与开发

[← 返回 README](../README.md) ｜ 相关文档：[自部署 Server](./deploy.md)

本仓库是 pnpm TypeScript 工作区（monorepo）：插件本身 + Cloudflare Server 后端的源码都在这里。改了源码要在本地看到效果，按下面的步骤跑；只想**使用**插件的用户看 README 的「安装插件」即可。

---

## 环境

- Node.js ≥ 20、pnpm ≥ 9、[Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- DSH：`npx @deepseek-ai/dsh`

## 本地跑通全栈

### 1. 启动 Server

```bash
# 仓库根目录
pnpm install
pnpm dev:server      # Hono Worker，默认 http://127.0.0.1:8787
```

认证密钥写入仓库根 `.env`（predev 自动同步到 `packages/server/.dev.vars`，**不要提交**）：

```bash
BETTER_AUTH_SECRET=一个不少于32字符的随机串   # 必填
RESEND_API_KEY=re_xxx                        # 可选：配了才真正发邮件
# BETTER_AUTH_URL=http://127.0.0.1:8787      # 可选：对外地址
```

首次启动前生成并应用数据库迁移：

```bash
cd packages/server
pnpm db:generate     # 由 schema 生成迁移 SQL
pnpm db:apply-local  # 写入本地 D1
```

> 没配 `RESEND_API_KEY` 时，注册 / 找回密码的验证码会打印在 `pnpm dev:server` 的日志里。

### 2. 构建并载入插件

```bash
# 回到仓库根目录
pnpm build    # host/client 产物写入 lib/
pnpm dev      # overlay 模式：自动打包并启动 DSH Web（默认 http://127.0.0.1:3080）
```

侧栏底部出现 **DSH-Guild（社区）** 入口即加载成功。

- `pnpm dev` = `tsdown --watch`（源码变更自动重打包 `lib/`）+ `dsh --profile <自动选择> --patch ./cordis.yml`（overlay 加载），产物更新后自动重启；
- 只改 **client**（`packages/client`）时不会重启进程：DSH 自带的 client-hmr 会把新模块热重载进浏览器，等打包完成刷新页面即可；
- 改 **host**（`packages/host`）需要重启，`pnpm dev` 会自动做。

### 关于 overlay 加载

`cordis.yml` 是本地开发的 overlay，把插件插进 DSH 的启动树：

```yaml
- insert:
    - id: "dsh-guild"
      name: "./lib/index.mjs"
```

- `name` 必须指向**仓库根打包产物**（`./lib/index.mjs`），不要指向 `packages/host` —— client 半边靠「该 loader row 解析出的模块向上找最近的 `package.json`」来发现：只有根包 `dsh-guild` 同时声明了 `dsh.client` 与 `exports["./client"]`，指向 `packages/host` 只会加载 host、GUI 不出现插件 UI。
- overlay 与「profile 里已安装的 dsh-guild」不能同时生效：两条 loader row 同 id 会冲突（启动报 duplicate loader entry id）。`pnpm dev` 会自动处理这两种情况：该 profile 里**没装**插件时直接用它；**装了**时改用一个隔离 profile（`<profile>-dev`，只含 `dsh-base` + `dsh-web-app`，不存在时自动从官方模板初始化），插件完全由 `cordis.yml` overlay 提供，因此 dev 永远跑本地构建、装不装插件都不用手动切换。要覆盖默认行为用 `DSH_PROFILE`（默认 `web`）/ `DSH_GUILD_PROFILE`。
- 后端地址的优先级：`BETTER_AUTH_URL`（仅本地开发/自托管时存在，`dsh` 从仓库根 `.env` 载入）> settings 文档里的 `guild.serverUrl`（`$DSH_HOME/settings.yaml`，发布版安装走这条，首次启动会把默认值写进去）> 代码里的默认常量。`BETTER_AUTH_URL` 只影响当次进程，**不会**写进 settings 文档，所以不会把 `127.0.0.1` 污染给安装版；不想连本地 Server 时把它指向线上地址即可（`pnpm dev` 会据此提示连的是哪一端）。

### 3. 开始使用

1. 打开 DSH-Guild 面板 → **注册**一个邮箱账号，查收验证码完成邮箱验证；
2. **创建**第一个社区（公开），或在 **「＋ 加入」** 里输入别人的邀请码加入私有社区；
3. 在社区里 **新建频道**（文字 / 公告 / 话题），进入频道聊天、传图、`@` 人；
4. 忘记密码可以随时用「忘记密码？」通过验证码找回。

> 单机联调两台「用户」时，请使用两个独立的 DSH profile（不同端口、不同配置目录），连接同一个 Server。

---

## 仓库结构

```
dsh-guild/
├── packages/
│   ├── host/      # DSH 插件 host：注册 guild 设置 + 本地接口
│   ├── client/    # DSH 插件 client：React 聊天界面 + 连接层
│   ├── types/     # ⭐ 全栈共享类型：实体 / REST / WebSocket / RPC 契约
│   └── server/    # ⭐ Cloudflare Server：Hono Worker + D1 + R2 + Durable Object
├── docs/          # 文档：参与开发（本文件）+ 自部署 Server
├── assets/        # README 用的截图等静态资源
├── lib/           # 打包产物（host + client）
├── tsdown.config.ts / cordis.yml / cordis.patch.yml
├── biome.json     # 格式 / lint / import 排序
└── package.json
```

## 常用命令

（在仓库根目录执行）

```bash
pnpm build                # host/client 打包到 lib/
pnpm dev                  # watch + overlay 启动 DSH Web
pnpm dev:server           # 本地启动 Server
pnpm typecheck            # 全 workspace 类型检查
pnpm lint / pnpm check    # Biome 质量检查
pnpm --filter @dsh-guild/server db:generate   # 改 schema 后生成迁移
pnpm --filter @dsh-guild/server db:apply-local
pnpm --filter @dsh-guild/server test:smoke    # WebSocket 冒烟测试（需本地 Server 已启动）
```

## 约定

- 改共享接口先改 `packages/types`，再在 host / client / server 里使用；
- 变更数据库先 `db:generate` 并审查生成的 SQL，再 `db:apply-local`；
- 提交信息用 `feat(server): …` / `fix(client): …` 风格，每个提交聚焦单一变更；
- 提交前至少跑 `pnpm typecheck` 与 `pnpm lint`；
- 严禁提交 `.env`、`.dev.vars`、凭据或生产密钥。

## 自部署

想把自己的 Server 部署到 Cloudflare，见 [自部署 Server](./deploy.md)。
