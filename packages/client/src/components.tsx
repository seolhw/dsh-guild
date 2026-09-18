// ================================================================
// DSH-Guild client UI：会话「社区」页签页（整页，非弹窗）
// 认证态 → AuthScreen；已登录 → HomeScreen（社区/频道/消息 + 实时）
// 顶层不再自绘浮层外壳 —— 视觉 chrome（会话标题/页签/操作行）由
// DSH 宿主头部承担，本组件只负责整页内容与身份门禁。
// ================================================================

import { Button, Toast } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { HomeScreen } from "./components/HomeScreen";
import { pageRoot, palette } from "./components/styles";
import {
  activateGuild,
  deactivateGuild,
  dismissToast,
  loadCommunityOnline,
  refresh,
  refreshInboxUnread,
  setCurrentDshSession,
  useGuildState,
} from "./store";

/** 居中提示视图 */
function Centered({ children }: { children: ReactElement }): ReactElement {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: 24 }}>
      {children}
    </div>
  );
}

function LoadingView(): ReactElement {
  return <div style={{ color: palette.muted, fontSize: 14 }}>正在连接 DSH-Guild Server…</div>;
}

function ErrorView(): ReactElement {
  const { error } = useGuildState();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ color: palette.danger, fontSize: 14 }}>连接失败：{error}</div>
      <Button variant="outline" size="sm" onClick={() => void refresh()}>
        重试
      </Button>
    </div>
  );
}

// 宿主契约：视图根声明 data-conversation-composer-overlay 后，宿主把 viewArea 约束为定高
// （flex:1 1 0; min-height:0; overflow:hidden），滚动交给视图内部（官方「轨迹」视图同做法）。
// 该模式下宿主的 composer 会浮在视图底部，与社区页自带的输入框叠加，故一并隐藏。
// 宿主类名是构建期哈希，只能用其 data-* 契约属性定位。
const PAGE_HOST_CSS = `
[data-conversation-scroll]:has([data-dsht-page-root]) > [data-composer-seat] {
  display: none;
}
`;

/**
 * 本插件 hover 说明卡的主题适配：宿主 HoverCard 把卡片底色写死成 #2C2C2E
 * （明暗一致，figma 取值），卡内文字才是跟随主题的——亮色下就成了"深底 + 深字"
 * 的黑块。这里把卡片表面改回跟随主题（palette.hoverCardBg：亮色白卡 / 暗色深卡）。
 * 宿主类名是构建期哈希，只能用结构选择器：卡片本身就是 body 下的 portal 根节点；
 * 标记属性 data-dsht-hover-tip 由本插件的卡片内容声明（CommunitiesRail 的
 * RailTip、Manage 的 ActionTip），因此只覆盖本插件的卡片，不动 DSH 自己的。
 */
const HOVER_CARD_CSS = `
body > div:has(> [data-dsht-hover-tip]) {
  --dsw-hovercard-bg: ${palette.hoverCardBg};
}
`;

/**
 * 暗色主题下的插件内覆盖层（宿主主题由 `body[data-ds-dark-theme]` 切换）：
 *  - 灰度文字提亮：宿主 token 在深色底上偏暗，小字难以辨认，这里只覆盖本插件
 *    自己的 --dsht-label-* 变量层（palette.muted 引用它），不动宿主 token，
 *    因此不会影响 DSH 其他界面。插件只保留一档辅助灰，暗色下提亮到 bluish-300。
 *  - 社区 logo 圆底：亮色是白底（palette.communityAvatarBg 的 var 兜底值），
 *    暗色换成黑底，避免深色界面里一圈刺眼的白。
 *  - 分段选择组激活键底色：亮色兜底用纯白表面（bg-layer-1）以拉开与轨道的差距，
 *    暗色下 bg-layer-1 反而比轨道暗，故这里覆盖回 bg-overlay 维持原来的浮起观感。
 */
const DARK_THEME_CSS = `
body[data-ds-dark-theme] {
  --dsht-label-tertiary: var(--dsw-static-neutral-bluish-300);
  --dsht-community-avatar-bg: #000000;
  --dsht-pill-active-bg: var(--dsw-alias-bg-overlay);
}
`;

let hostCssInjected = false;

/** 注入一次宿主覆盖样式（幂等） */
function ensureHostCss(): void {
  if (hostCssInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dsht-page-css", "");
  style.textContent = `${PAGE_HOST_CSS}${HOVER_CARD_CSS}${DARK_THEME_CSS}`;
  document.head.appendChild(style);
  hostCssInjected = true;
}

/** 「社区」页签页：随会话 view 挂载/卸载而激活/释放实时连接 */
export function GuildPage(props: { sessionId?: string }): ReactElement {
  const guild = useGuildState();
  const ready = guild.phase === "ready";
  const sessionId = props.sessionId ?? null;
  // Toast 通过 body portal 渲染，不传 anchor 会相对整个视口居中；
  // 这里用社区页根节点当锚点，让横幅居中在社区内容区而不是整个网页。
  const [pageEl, setPageEl] = useState<HTMLElement | null>(null);

  // 记录当前 DSH 会话 id：「分享会话」入口默认用它
  useEffect(() => {
    setCurrentDshSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    activateGuild();
    return () => deactivateGuild();
  }, []);

  // 宿主覆盖样式：社区页自己管滚动与输入框，挂载时注入一次
  useEffect(() => {
    ensureHostCss();
  }, []);

  // 就绪后周期性地轮询站内信未读数（铃铛角标），有新邀请时尽快亮起
  useEffect(() => {
    if (!ready) return;
    void refreshInboxUnread();
    const timer = window.setInterval(() => void refreshInboxUnread(), 30000);
    return () => window.clearInterval(timer);
  }, [ready]);

  // 社区在线态：进入社区后拉一次，之后与站内信同节奏轮询（右侧成员面板用这一份数据）
  const communityId = guild.view.communityId;
  useEffect(() => {
    if (!ready || communityId === null) return;
    void loadCommunityOnline();
    const timer = window.setInterval(() => void loadCommunityOnline(), 30000);
    return () => window.clearInterval(timer);
  }, [ready, communityId]);

  let body: ReactElement;
  if (guild.phase === "error") {
    body = (
      <Centered>
        <ErrorView />
      </Centered>
    );
  } else if (guild.phase === "anon") {
    body = (
      <Centered>
        <AuthScreen />
      </Centered>
    );
  } else if (guild.busy || guild.phase === "booting") {
    body = (
      <Centered>
        <LoadingView />
      </Centered>
    );
  } else {
    body = <HomeScreen />;
  }

  return (
    <div ref={setPageEl} style={pageRoot} data-dsht-page-root data-conversation-composer-overlay="">
      {body}
      {guild.toast.length > 0 ? (
        <Toast text={guild.toast} anchor={pageEl} onDone={() => dismissToast()} />
      ) : null}
      <ConfirmDialog />
    </div>
  );
}
