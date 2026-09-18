# 仓库指南

## 项目结构与模块划分

本仓库是 DSH-Guild 插件及其 Cloudflare 后端的 pnpm TypeScript 工作区。

- `packages/types/src/`：共享实体、REST 接口契约、WebSocket 协议和 Host 本地接口类型；通过各层的 `index.ts` 导出公共类型。
- `packages/host/src/`：注册 Host 侧配置与本地接口。
- `packages/client/src/`：React 浏览器界面、状态管理、连接层和组件样式。
- `packages/server/src/`：Hono/Cloudflare Worker 后端；路由位于 `routes/`，通用服务位于 `lib/`，Drizzle Schema 位于 `db/schema.ts`。
- `packages/server/drizzle/`：生成的 SQL 迁移及元数据。`lib/` 是构建产物，请勿直接修改。

## 构建、测试与开发命令

请在仓库根目录使用 pnpm 12（`pnpm install`）。

- `pnpm dev`：使用 `cordis.yml` 启动 DSH Web Host。
- `pnpm dev:server`：同步本地密钥并在 `127.0.0.1:8787` 启动 Worker。
- `pnpm build`：通过 tsdown 将 Host 和 Client 打包到 `lib/`。
- `pnpm typecheck`：检查所有工作区包的类型。
- `pnpm lint`：执行 Biome 静态检查；`pnpm format`：自动格式化。
- `pnpm --filter @dsh-guild/server test:smoke`：在本地 Worker 启动后执行 WebSocket 冒烟测试。

修改数据库 Schema 后，执行 `pnpm --filter @dsh-guild/server db:generate`，审查生成的 SQL，再用 `db:apply-local` 应用到本地数据库。

## 代码风格与命名规范

使用 TypeScript：2 空格缩进、双引号、分号、单行不超过 100 个字符。Biome 负责执行这些格式规则并整理 import。变量和函数使用 `camelCase`，React 组件和类型使用 `PascalCase`，文件名小写，例如 `routes/messages.ts`。变更共享接口或协议时，先同步更新 `packages/types`，再在其他包中使用。

## 测试规范

目前尚无完整的单元测试套件，Server 包提供冒烟测试。行为变更应补充针对性的测试或冒烟覆盖；测试文件按功能命名，例如 `messages.smoke.mjs`。提交前至少运行 `pnpm typecheck`、`pnpm lint` 以及相关的本地服务检查。

## 提交与 Pull Request 规范

使用简洁的历史惯例前缀：`feat(server): 添加频道路由`、`chore(server): 更新配置` 或 `build: 更新锁文件`。中英文提交说明均可，但要准确；每个提交应聚焦单一变更。PR 应说明用户可见行为、迁移或配置影响、验证命令、关联 Issue；界面改动请附截图。严禁提交 `.env`、`.dev.vars`、凭据或生产密钥。
