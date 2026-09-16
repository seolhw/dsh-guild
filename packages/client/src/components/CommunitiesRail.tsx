// ================================================================
// 左侧社区栏：顶部 logo / 站内信 / 新建入口，中部社区头像列，底部个人中心入口。
// 所有图标的 hover 说明共用同一套卡片排版（RailTip），保证视觉一致。
// ================================================================

import { HoverCard, IconPlusOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Community } from "@dsh-talk/types/entities";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { backToCommunities, openCommunity, useTalkState } from "../store";
import {
  PRIVACY_LABELS,
  rail,
  railAction,
  railAvatar,
  railBubble,
  railDivider,
  railItem,
  railPill,
  railScroll,
} from "./homeStyles";
import { BellGlyph } from "./Inbox";
import { Avatar, BrandLogo, palette, Spinner } from "./styles";

// ---------------- hover 卡片排版（社区栏统一） ----------------

const tipWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 176,
  maxWidth: 260,
};

const tipTitle: CSSProperties = { fontSize: 16, fontWeight: 600, color: palette.text };

const tipHint: CSSProperties = { fontSize: 14, lineHeight: 1.5, color: palette.muted };

/** 窄列图标的 hover 说明卡：标题 + 可选副标题 */
function RailTip({ title, hint }: { title: string; hint?: string }): ReactElement {
  return (
    <div style={tipWrap}>
      <span style={tipTitle}>{title}</span>
      {hint ? <span style={tipHint}>{hint}</span> : null}
    </div>
  );
}

/** 项目仓库地址（logo hover 卡里的唯一外链） */
const PROJECT_REPO = "https://github.com/seolhw/dsh-talk";

/** 左上角 logo hover 小窗：项目介绍 + 仓库地址（可点开新标签） */
function ProjectCard(): ReactElement {
  return (
    <div style={{ ...tipWrap, maxWidth: 280, gap: 4 }}>
      <span style={tipTitle}>DSH-Talk</span>
      <span style={{...tipHint, textAlign: "justify"}}>
        把「社区」装进 DSH：在 DeepSeek Harness 里和同好聊天、提问求助、发通知。
      </span>
      <a
        href={PROJECT_REPO}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 14,
          color: palette.accent,
          textDecoration: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        开源地址
      </a>
    </div>
  );
}

/** 社区栏 hover 小窗：名称、可见性、描述、成员总数（只读，点击仍选社区） */
function CommunityMetaCard({ community }: { community: Community }): ReactElement {
  return (
    <div style={tipWrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Avatar
          color={palette.communityAvatarBg}
          label={community.name}
          src={community.iconUrl}
          size={32}
          inset={3}
          kind="community"
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              ...tipTitle,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {community.name}
          </div>
          <div style={tipHint}>{PRIVACY_LABELS[community.privacy]}</div>
          {community.slug ? (
            <div
              style={{
                ...tipHint,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              @{community.slug}
            </div>
          ) : null}
        </div>
      </div>
      {community.description ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 14,
            lineHeight: 1.6,
            color: palette.muted,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {community.description}
        </div>
      ) : null}
      <div style={{ ...tipHint, marginTop: 6 }}>{community.memberCount} 名成员</div>
    </div>
  );
}

/** 底部个人中心 hover 小窗：头像 + 昵称/@用户名 + 进入提示 */
function UserMetaCard({
  label,
  handle,
  avatarUrl,
}: {
  label: string;
  handle: string;
  avatarUrl: string | null;
}): ReactElement {
  return (
    <div style={tipWrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Avatar label={handle} src={avatarUrl} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              ...tipTitle,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </div>
          <div style={tipHint}>@{handle}</div>
        </div>
      </div>
      <div style={{ ...tipHint, marginTop: 6 }}>点击进入个人中心</div>
    </div>
  );
}

// ---------------- 社区栏 ----------------

export function CommunitiesRail({
  onAdd,
  onInbox,
  onOpenProfile,
}: {
  onAdd: () => void;
  onInbox: () => void;
  onOpenProfile: () => void;
}): ReactElement {
  const talk = useTalkState();
  const current = talk.view.communityId;
  const me = talk.me;
  const unreadLabel = talk.inboxUnread > 99 ? "99+" : String(talk.inboxUnread);

  /** 统一给窄列图标包一层 hover 卡（去除原生 title，避免重复提示）。0.1.5 的
   * HoverCard 要求 copyLabel/copiedLabel：本插件不传 copyText，两个标签不会渲染。 */
  function withTip(anchor: ReactNode, content: ReactNode, delay = 300): ReactElement {
    return (
      <HoverCard
        openDelayMs={delay}
        content={content}
        anchor={anchor}
        copyLabel="复制"
        copiedLabel="已复制"
      />
    );
  }

  return (
    <div style={rail}>
      {withTip(
        <button type="button" style={railAction} onClick={backToCommunities} aria-label="回到首页">
          <BrandLogo size={34} />
        </button>,
        <ProjectCard />,
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          marginTop: 6,
        }}
      >
        {withTip(
          <button type="button" style={railAction} onClick={onInbox} aria-label="站内信">
            <span style={railAvatar}>
              <BellGlyph size={24} />
              {talk.inboxUnread > 0 ? (
                <span style={{ ...railBubble, top: -4, right: -6 }}>{unreadLabel}</span>
              ) : null}
            </span>
          </button>,
          <RailTip
            title="站内信"
            hint={talk.inboxUnread > 0 ? `${unreadLabel} 条未读，含社区邀请` : "社区邀请与重要事件"}
          />,
        )}
        {withTip(
          <button
            type="button"
            style={railAction}
            onClick={onAdd}
            aria-label="加入、发现或创建社区"
          >
            <IconPlusOutline16 size={24} />
          </button>,
          <RailTip title="加入、发现或创建社区" />,
        )}
      </div>
      <div style={railDivider} />
      <div style={railScroll}>
        {talk.communities.map((c) => {
          const active = c.id === current;
          const unread = c.unreadChannels;
          const mention = c.unreadMentions;
          return (
            <button
              key={c.id}
              type="button"
              style={railItem}
              onClick={() => {
                if (!active) void openCommunity(c.id);
              }}
            >
              {active ? <span style={railPill} /> : null}
              {withTip(
                <span style={railAvatar}>
                  <Avatar
                    color={palette.communityAvatarBg}
                    label={c.name}
                    src={c.iconUrl}
                    size={44}
                    inset={4}
                    kind="community"
                  />
                  {active && talk.view.communityLoading ? (
                    <span
                      style={{
                        ...railBubble,
                        background: palette.elevated,
                        border: `1px solid ${palette.border}`,
                        color: palette.text,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Spinner size={12} />
                    </span>
                  ) : mention > 0 ? (
                    <span style={{ ...railBubble, background: palette.accent }}>{mention}</span>
                  ) : unread > 0 ? (
                    <span style={railBubble}>{unread}</span>
                  ) : null}
                </span>,
                <CommunityMetaCard community={c} />,
              )}
            </button>
          );
        })}
      </div>
      {me ? (
        <div
          style={{
            padding: "8px 0 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            width: "100%",
          }}
        >
          <div style={railDivider} />
          {withTip(
            <button type="button" style={railAction} onClick={onOpenProfile} aria-label="个人中心">
              <Avatar label={me.handle} src={me.avatarUrl} size={34} />
            </button>,
            <UserMetaCard
              label={me.displayName ?? me.handle}
              handle={me.handle}
              avatarUrl={me.avatarUrl}
            />,
            150,
          )}
        </div>
      ) : null}
    </div>
  );
}
