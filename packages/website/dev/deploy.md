# 自部署 Server

[← 返回文档首页](/) ｜ 相关文档：[参与开发](/dev/development)

DSH-Guild 的 **Server** 是唯一的数据中心，完全自包含：Hono Worker + D1 + R2 + Durable Object，可以整套部署到你自己的 Cloudflare 账号。

- 如果你只是**作为用户使用插件**，不需要看这份文档 —— 照[安装与首次使用](/guide/install)连一个现成的 Server 地址即可；
- 如果你想**自己托管**一个 Server（给团队内部用，或给公开社区用作官方服务），按下面的步骤走；
- 想在本地先把 Server 跑起来联调（不碰 Cloudflare），见[参与开发](/dev/development#本地跑通全栈)里的「启动 Server」。

## 一、准备资源

```bash
# 登录 Cloudflare
npx wrangler login

# D1 元数据库（记下输出的 database_id）
npx wrangler d1 create dsh-guild

# R2 桶（附件与分享包）
npx wrangler r2 bucket create dsh-guild-assets
```

把 `npx wrangler d1 create` 返回的 `database_id` 填回 [`packages/server/wrangler.jsonc`](https://github.com/seolhw/dsh-guild/blob/main/packages/server/wrangler.jsonc) 的 `d1_databases[0].database_id`，并按需修改 `name`、`routes`（自定义域）与 `r2_buckets.bucket_name`。

## 二、配置变量与密钥

`BETTER_AUTH_URL` 是非敏感值，直接写在 `wrangler.jsonc` 的 `vars` 里（改成你的线上地址，**必须与自定义域一致**，否则请求会因 Host 不在允许名单而被拒）。密钥用 secret 注入：

```bash
cd packages/server
npx wrangler secret put BETTER_AUTH_SECRET   # ≥ 32 字符随机串
npx wrangler secret put RESEND_API_KEY       # 可选；不配则验证码只打印到服务端日志
npx wrangler secret put ADMIN_TOKEN          # 可选；配了才能执行官方社区种子（见第六节）
```

完整变量说明见下面的[环境变量](#环境变量)。

## 三、应用数据库迁移

```bash
# 仓库根目录；等价于 wrangler d1 migrations apply dsh-guild --remote
pnpm --filter @dsh-guild/server db:apply-remote
```

认证相关表（user / session / account / verification）无需迁移：首次访问 `/api/auth/*` 时由 Better Auth 自举创建（幂等）。

## 四、部署

```bash
pnpm deploy:server   # 等价于 packages/server 下的 wrangler deploy
```

## 五、客户端接入

在 DSH 插件设置里把 `serverUrl` 改成你的线上地址（`https://<你的自定义域>`），即可注册 / 登录使用。自定义域有变动时，记得同步更新 `wrangler.jsonc` 的 `vars.BETTER_AUTH_URL` 与插件设置里的 `serverUrl`。

## 六、（可选）写入官方社区与种子内容

公共 Server 上「新用户注册进来看到空场」是最大的流失点。配好 `ADMIN_TOKEN` 并部署后，用**你自己的账号**先注册登录，然后执行一次（可重复执行，已存在的官方社区会跳过）：

```bash
# serverUrl 换成你的线上地址；TOKEN 用插件设置里的 token（登录后自动写入）
curl -X POST https://<你的自定义域>/api/admin/seed-official \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

会创建 3 个公开社区（DSH 官方 / 会话分享广场 / 插件与技能开发），每个社区自带公告、文字频道与**各频道置顶说明帖**，owner 是你自己（之后可在成员面板转让所有权）。这 3 个社区恒排在发现页顶部并带「官方」标记；想调整内容就改 [`packages/server/src/lib/official.ts`](https://github.com/seolhw/dsh-guild/blob/main/packages/server/src/lib/official.ts) 后重新执行。

> 不跑这一步也能正常用，只是新用户进来看到的还是空场：发现页只有用户自建的社区。本地 D1 与远程 D1 是两套独立数据库，本地跑过不代表生产也有。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 是 | 会话签名密钥，≥ 32 字符 |
| `BETTER_AUTH_URL` | 否 | 认证对外地址（邮箱链接基于它）；缺省按请求 Host 推导 |
| `RESEND_API_KEY` | 否 | 事务邮件发送密钥；未配置时验证码只打印到服务端日志 |
| `ADMIN_TOKEN` | 否 | 运营口令；配置后才可用 `/api/admin/*`（写入官方社区种子），未配置则该分组直接禁用 |

> 发信依赖 Resend 等事务邮件（验证码 / 重置密码 / 邀请邮件）。若 Server 未配置 `RESEND_API_KEY`，注册 / 找回密码时请改看服务端日志里打印的验证码。

其余业务限额在 [`packages/server/src/constants.ts`](https://github.com/seolhw/dsh-guild/blob/main/packages/server/src/constants.ts) 中集中维护，完整清单见[限额与边界规则](/reference/limits)。

## 部署文档站（Cloudflare Pages）

文档站是纯静态产物，同样部署到 Cloudflare，与 Server 是两个互相独立的 Pages / Worker 项目。

### 首次：创建项目并登录

```bash
npx wrangler login                                  # 浏览器授权一次
npx wrangler pages project create dsh-guild-docs --production-branch=main
```

### 部署与更新

```bash
pnpm docs:deploy    # 构建 + 上传，等价于 packages/website 下 vitepress build && wrangler pages deploy
```

首次部署后站点地址是 `https://dsh-guild-docs.pages.dev`。之后每次 `pnpm docs:deploy` 覆盖生产环境；把 `--branch=main` 换成别的分支名则会生成一个预览地址，不影响正式站点。

### CI 中部署

在 Cloudflare 控制台 **My Profile → API Tokens** 建一个权限为 **Cloudflare Pages: Edit** 的令牌，然后在流水线里注入两个环境变量，无需浏览器登录：

| 变量 | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 上一步创建的令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID（控制台右侧可见） |

```bash
pnpm install
pnpm docs:deploy
```

### 关于 base 路径

文档站的 [`config.mts`](https://github.com/seolhw/dsh-guild/blob/main/packages/website/.vitepress/config.mts) 中 `base` 为 `/`，因为 Pages 项目挂在域名根路径。若之后要绑自定义域（如 `docs.example.com`），根路径不变，**无需改动 base**；只有把站点部署到子路径（如 `example.com/docs/`）时才需要同步改它。
