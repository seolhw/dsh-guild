---
layout: home

hero:
  name: DSH-Guild
  text: 把「社区」装进 DSH
  tagline: 在 DeepSeek Harness 里直接和同好聊天、提问求助、发通知，社区内容与你的 Agent 工作区不再割裂。
  image:
    src: /logo.svg
    alt: DSH-Guild
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/install
    - theme: alt
      text: 权限与角色参考
      link: /reference/permissions
    - theme: alt
      text: GitHub
      link: https://github.com/seolhw/dsh-guild

features:
  - title: 类 Discord 的社区模型
    details: 公开 / 私有社区、文字 / 公告 / 话题三类频道、Discord 式角色与权限位、频道级 allow / deny 覆盖，一整套开箱即用。
  - title: 细粒度权限
    details: 11 个权限位、角色层级防提权、频道覆盖按 Discord 顺序解析。每个动作需要哪个权限，参考手册逐条列清。
  - title: 分享 DSH 会话
    details: 把本机一条 DSH 会话打包发到频道里，别人点开卡片就能一键克隆到自己的 DSH，工作流直接交接。
  - title: 实时与未读
    details: 每频道一条 WebSocket 长连接，新消息 / 编辑 / 删除 / 表情回应即时同步；@提及与未读气泡分频道统计。
  - title: 讨论组（话题）
    details: 独立成串的讨论线，支持公开 / 私密、进入密码、成员拉人，24 小时无人回复自动归档、发言即恢复。
  - title: 完全自包含
    details: Server 是 Hono Worker + D1 + R2 + Durable Object 的完整后端，可整套部署到你自己的 Cloudflare 账号。
---
