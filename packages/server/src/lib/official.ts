// ================================================================
// 官方预置社区（种子内容）
//
// 背景：公开 Server 上「新用户注册进来看到的是空场」是最大的流失点。
// 这里定义一套官方社区蓝图，由 POST /api/admin/seed-official 幂等写入，
// 让每个社区一建好就带着「公告 + 使用指南」，发现页也不再只有空社区。
//
// 幂等键 = 社区 id（固定前缀 + blueprint.key），因此不依赖名称、可重复执行；
// 发现页也用同一批固定 id 判断「官方」，无需新增数据库字段。
// ================================================================

import type { ChannelKind } from "@dsh-guild/types/entities";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db";
import { channels, communities, communityMembers } from "../db/schema";
import { grantAnnouncementReadOnly } from "./channels";
import { newInviteCode } from "./ids";
import { insertPinnedGuide } from "./messages";
import { createDefaultAdminRole, ensureEveryoneRole } from "./permissions";

/** 官方社区 id 前缀（用户自建社区的 id 是 21 位随机串，不会撞） */
const OFFICIAL_ID_PREFIX = "official-";

export interface OfficialChannelBlueprint {
  name: string;
  kind: ChannelKind;
  topic?: string;
  /** 建社区时写入该频道并置顶的说明（Markdown；缺省 = 不发消息） */
  pinned?: string;
}

export interface OfficialCommunityBlueprint {
  /** 稳定标识：社区 id = `official-${key}`、slug = `dsh-${key}`（含 `-`，随机 slug 不会撞） */
  key: string;
  name: string;
  description: string;
  channels: OfficialChannelBlueprint[];
}

/** 官方社区固定 id */
export function officialCommunityId(key: string): string {
  return `${OFFICIAL_ID_PREFIX}${key}`;
}

/** 官方频道固定 id（position 参与，保证可重复推导） */
function officialChannelId(key: string, position: number): string {
  return `${OFFICIAL_ID_PREFIX}${key}-${position}`;
}

/**
 * 官方社区蓝图（3 个，宁可少而活）：
 *   官方公告 → 版本与规范；会话分享广场 → 核心内容资产；插件开发 → 受众所在。
 */
export const OFFICIAL_COMMUNITIES: readonly OfficialCommunityBlueprint[] = [
  {
    key: "official",
    name: "DSH 官方",
    description: "DSH 与 DSH-Guild 的版本公告、新手上路与反馈入口",
    channels: [
      {
        name: "公告",
        kind: "announcement",
        topic: "版本发布、变更说明与使用须知",
        pinned: `这里是 **DSH 官方 · 公告频道**，只有所有者、管理员或被授予「发送消息」的角色才能发布。

发布内容约定：

- **版本更新**：DSH / DSH-Guild 新版本、重要变更与兼容性说明
- **功能说明**：新功能怎么用，附一条操作路径
- **故障与维护**：服务不可用、迁移通知

> 想讨论或提问，请到「新手上路」或「反馈与建议」频道，公告频道只读。`,
      },
      {
        name: "新手上路",
        kind: "text",
        topic: "第一次用 DSH-Guild？先看这里",
        pinned: `欢迎来到 DSH-Guild 的官方社区。这份帖子说明**怎么把它用起来**。

## 1. 你现在在哪

DSH-Guild 是一个跑在 DSH 面板里的社区插件：不用切窗口，就能和同好聊天、问答、收通知。左侧社区栏 →「＋」可以**发现公开社区**、用「邀请码」加入私有社区，或自己**创建**一个。

## 2. 三件值得马上试的事

1. **绑定分享**：在频道输入框下方点第一个按钮，把本机一条 DSH 会话打包发出来。别人点开卡片即可**一键克隆到自己的 DSH** —— 这是这个工具最有用的能力。
2. **提问**：在「求助与答疑」里贴出你的场景（DSH 版本、报错原文、期望结果），比「有人吗」快得多。
3. **看公告**：DSH 与插件的新版本都会在「公告」频道发布。

## 3. 提问模板（照抄即可）

\`\`\`
- DSH 版本：
- 操作系统：
- 复现步骤：
- 期望结果 / 实际结果：
- 报错原文（贴全文，不要截图）：
\`\`\`

> 贴代码或日志请用 \`\`\` 代码块包裹，长内容直接上传附件即可。`,
      },
      {
        name: "反馈与建议",
        kind: "text",
        topic: "Bug、体验问题与功能建议",
        pinned: `这里是**反馈与建议**频道。提交时请按下面格式，方便定位与跟进：

**Bug 反馈**

\`\`\`
- 现象：
- 复现步骤：
- 期望结果：
- 环境（DSH 版本 / 操作系统）：
- 截图或录屏：
\`\`\`

**功能建议**

\`\`\`
- 想解决的问题：
- 你现在的做法：
- 期望的做法：
\`\`\`

> 请描述**问题**而不是只给方案 —— 说清楚卡在哪一步，往往能换来更好的实现。
> 敏感信息（令牌、邮箱、内网地址）请先打码。`,
      },
    ],
  },
  {
    key: "share",
    name: "会话分享广场",
    description: "分享可一键克隆的 DSH 会话，把好用的 Agent 工作流传下去",
    channels: [
      {
        name: "公告",
        kind: "announcement",
        topic: "分享规则与精选说明",
        pinned: `这里是**会话分享广场**的公告频道。

这个社区只做一件事：**积累可直接复用的 DSH 会话**。一条好的分享，胜过十篇教程 —— 别人下载后立刻就能跑起来。

分享规则：

1. 分享前**自己先跑通一遍**，确认能复现；
2. 标题写清「做什么」，不要写「求助」「救救」；
3. 说明适用范围与前置条件（模型、依赖、数据）；
4. 不要分享含密钥、公司内部数据、他人隐私的会话；
5. 转载他人会话请注明来源。

> 精选帖会在这里汇总，方便后来者直接抄作业。`,
      },
      {
        name: "工作流分享",
        kind: "text",
        topic: "发你的可克隆会话（附说明模板）",
        pinned: `在这里发布你的 DSH 会话分享。**贴一条会话卡片 + 一段说明**即可。

建议按这个结构写（复制后替换）：

\`\`\`
【标题】一句话说清这条会话做什么
【适用场景】什么时候你会用它
【前置条件】需要的模型 / 依赖 / 数据
【怎么用】1. 点卡片克隆到本地 2. ……
【效果】它产出的结果长什么样
\`\`\`

怎么发：

1. 在下方输入框点第一个按钮（分享），选一条本机会话，等待打包完成；
2. 打包好的分享会自动作为卡片发到本频道；
3. 再补一段上面格式的说明文字。

> 分享的是会话本身（消息与工具调用记录），不含你的本地文件；发布前请自行确认没有敏感内容。`,
      },
      {
        name: "求助问答",
        kind: "text",
        topic: "提问与认领",
        pinned: `**求助问答**：问得越具体，答得越快。

提问请包含：

\`\`\`
- 我想做什么：
- 已经试过什么：试了什么、报什么错
- 环境：DSH 版本、操作系统
- 相关代码 / 会话（可直接分享会话卡片）
\`\`\`

回答建议：

- 能给出**可运行的会话分享**最好，提问者可以直接克隆验证；
- 只给结论不给过程时，补一句「为什么」，方便别人举一反三；
- 问题解决后请回来补一句结论，方便后来人搜到。`,
      },
    ],
  },
  {
    key: "plugin",
    name: "插件与技能开发",
    description: "DSH 插件、技能与脚本开发交流：踩坑、约定、作品发布",
    channels: [
      {
        name: "公告",
        kind: "announcement",
        topic: "社区约定与发布规范",
        pinned: `这里是**插件与技能开发**的公告频道。

社区约定：

- 提问前先搜索历史消息，重复问题会被引导到原帖；
- 大段代码、日志请用代码块或附件，不要刷屏；
- 插件与技能的**安装方式、依赖版本、适用 DSH 版本**必须写清；
- 严禁发布要求用户关闭安全校验、或来路不明的可执行文件。

> 本频道只读；讨论请到「开发交流」，作品请发「作品发布」。`,
      },
      {
        name: "开发交流",
        kind: "text",
        topic: "插件 / 技能 / 脚本的开发与踩坑",
        pinned: `**开发交流**：CLI 插件、技能、脚本相关的实现细节都在这里聊。

可能有用的起步信息：

1. DSH 插件可以走 overlay 方式本地加载：\`npx @deepseek-ai/dsh web --patch ./cordis.yml\`，改完重新构建再刷新页面即可看到效果；
2. 插件分 host（Node.js 侧：本地文件、配置、长任务）与 client（浏览器侧：界面、实时连接）两半，两者通过本地接口协作；
3. 涉及本地文件系统、子进程的操作请放在 host 侧，浏览器侧只做界面与网络请求。

提问时请附：DSH 版本、插件加载方式、报错原文、最小复现。`,
      },
      {
        name: "作品发布",
        kind: "text",
        topic: "发布你的插件 / 技能 / 工作流",
        pinned: `**作品发布**：把你的插件、技能或成体系的工作流发在这里。

发布模板：

\`\`\`
【名称】
【一句话介绍】
【适用 DSH 版本】
【安装 / 使用方式】
【依赖】
【已知限制】
【截图或演示会话】
\`\`\`

> 有可复现的**会话分享**，欢迎一并贴上：读者点开卡片就能克隆体验，比截图更有说服力。`,
      },
    ],
  },
];

const OFFICIAL_IDS: readonly string[] = OFFICIAL_COMMUNITIES.map((c) => officialCommunityId(c.key));

const OFFICIAL_ID_SET = new Set<string>(OFFICIAL_IDS);

/** 是否官方预置社区（发现页据此置顶并加「官方」标记） */
export function isOfficialCommunity(communityId: string): boolean {
  return OFFICIAL_ID_SET.has(communityId);
}

/** 官方社区 id 列表（发现页排序用） */
export const OFFICIAL_COMMUNITY_IDS: readonly string[] = OFFICIAL_IDS;

/** 排序片段：官方社区恒排在最前 */
export function officialFirstOrder(): SQL[] {
  const ids = [...OFFICIAL_IDS];
  if (ids.length === 0) return [];
  return [sql`CASE WHEN ${inArray(communities.id, ids)} THEN 0 ELSE 1 END`];
}

export interface SeededOfficialCommunity {
  communityId: string;
  name: string;
  /** false = 该社区已存在，本次跳过（幂等） */
  created: boolean;
}

/**
 * 幂等写入官方社区（含默认角色、频道、各频道置顶说明帖）。
 * owner 为调用者本人（运营者账号）——之后可在成员面板里转让所有权。
 */
export async function seedOfficialCommunities(
  db: Db,
  ownerUserId: string,
): Promise<SeededOfficialCommunity[]> {
  const result: SeededOfficialCommunity[] = [];
  for (const blueprint of OFFICIAL_COMMUNITIES) {
    const communityId = officialCommunityId(blueprint.key);
    const existing = await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.id, communityId))
      .limit(1);
    if (existing.length > 0) {
      result.push({ communityId, name: blueprint.name, created: false });
      continue;
    }

    const now = Date.now();
    await db.insert(communities).values({
      id: communityId,
      name: blueprint.name,
      slug: `dsh-${blueprint.key}`,
      description: blueprint.description,
      privacy: "public",
      ownerId: ownerUserId,
      iconUrl: null,
      bannerUrl: null,
      inviteCode: newInviteCode(),
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(communityMembers).values({ communityId, userId: ownerUserId, joinedAt: now });
    await ensureEveryoneRole(db, communityId, now);
    await createDefaultAdminRole(db, communityId, now);

    let position = 0;
    for (const channel of blueprint.channels) {
      const channelId = officialChannelId(blueprint.key, position);
      await db.insert(channels).values({
        id: channelId,
        communityId,
        name: channel.name,
        kind: channel.kind,
        position,
        topic: channel.topic ?? null,
        createdAt: now,
        updatedAt: now,
      });
      if (channel.kind === "announcement") await grantAnnouncementReadOnly(db, channelId, now);
      if (channel.pinned) {
        await insertPinnedGuide(db, {
          channelId,
          communityId,
          authorId: ownerUserId,
          content: channel.pinned,
          at: now,
        });
      }
      position += 1;
    }
    result.push({ communityId, name: blueprint.name, created: true });
  }
  return result;
}
