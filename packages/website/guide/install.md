# 安装与首次使用

把插件装进你自己的 DSH profile 即可。

## 前置条件

- Node ≥ 20
- 已安装 pnpm
- `npx @deepseek-ai/dsh`

## 安装到 profile

```bash
# 从 npm 装进 web profile（推荐）
npx @deepseek-ai/dsh plugin --profile web add dsh-guild@0.0.3

# 启动 DSH Web
npx @deepseek-ai/dsh web
```

也可以直接从 GitHub 装最新源码：

```bash
npx @deepseek-ai/dsh plugin --profile web add github:seolhw/dsh-guild
```

## 代理设置（可选）

Server 地址为 `https://dsh-guild-api.huiwang.fun`，部署在 Cloudflare 上，国内直连可能不稳定；在代理工具里让这个域名**走代理**即可。

浏览器打开 `https://dsh-guild-api.huiwang.fun/healthz` 能返回 JSON，即说明链路已通。

## 首次使用

1. 启动后侧栏底部出现 **DSH-Guild（社区）** 入口，即安装成功。
2. 在面板内用邮箱注册账号，查收 **6 位验证码**完成验证，然后创建或加入社区。

::: tip 收不到验证码？
注册 / 找回密码会向邮箱发送 6 位验证码。如果你连的自建 Server 没有配置 `RESEND_API_KEY`，邮件不会发送，验证码会打印在服务端日志里。
:::

## 升级与卸载

```bash
npx @deepseek-ai/dsh plugin --profile web update dsh-guild    # 升级到 npm 最新版
npx @deepseek-ai/dsh plugin --profile web remove dsh-guild    # 卸载（同时从 dsh.profile.bundles 移除）
```

## 下一步

- 想在本仓库里边改边跑（热重载、watch 打包）见[参与开发](/dev/development)
- 想自己托管 Server 见[自部署 Server](/dev/deploy)
- 想知道每个功能要什么权限见[权限与角色](/reference/permissions)
