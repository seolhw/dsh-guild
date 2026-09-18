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
import { MONO_FONT } from "./components/Markdown";
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
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function LoadingView(): ReactElement {
  const settings = useGuildState().settings;
  const serverUrl = settings?.serverUrl ?? "";

  /**
   * 「测试本机连通性」= 用本机浏览器直接打开服务端的健康检查 JSON。
   * 页面由本机发出请求，因此看到 /healthz 返回 { ok: true } 就证明
   * 本机 → 该域名的 DNS / TCP / TLS / HTTP 这一路是通的（通不了则浏览器报错）。
   */
  const openHealthz = (): void => {
    if (serverUrl.length === 0) return;
    const healthUrl = `${serverUrl.replace(/\/+$/, "")}/healthz`;
    window.open(healthUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ color: palette.muted, fontSize: 14 }}>
        {settings === null ? "正在读取本地配置…" : "正在连接 DSH-Guild Server…"}
      </div>
      <div style={{ color: palette.muted, fontSize: 14 }}>
        {settings === null ? "服务地址读取中…" : serverUrl}
      </div>
      <Button variant="outline" size="sm" disabled={serverUrl.length === 0} onClick={openHealthz}>
        测试本机连通性
      </Button>
    </div>
  );
}

function ErrorView(): ReactElement {
  const { error } = useGuildState();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
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

/**
 * Streamdown 代码块的样式补齐。
 *
 * Streamdown 的围栏代码块不走 Markdown.tsx 的 components 覆写，而是由它自己的
 * code-block 组件渲染（DOM 上带 data-streamdown="code-block" / "code-block-body"），
 * 底色、边框、内边距、等宽字体全挂在 Tailwind class 上。本项目没有 Tailwind，
 * 这些 class 一律不生效，结果是代码块没有底色、且退回正文的比例字体。
 * 这里按它实际的结构补上等价样式；--sdm-bg / --sdm-c 是它每个 token 下发的
 * CSS 变量（Shiki 主题变量解析不到时回退到这里的兜底值）。
 */
const STREAMDOWN_CODE_CSS = `
[data-streamdown="code-block"] {
  margin: 10px 0;
  border: 1px solid ${palette.border};
  border-radius: 8px;
  background: ${palette.layer2};
  overflow: hidden;
}
[data-streamdown="code-block-header"] {
  font-family: ${MONO_FONT};
  font-size: 14px;
  color: ${palette.muted};
  padding: 6px 12px;
  background: transparent;
}
[data-streamdown="code-block-body"] {
  border: none;
  border-radius: 0;
  background: ${palette.layer2};
  padding: 10px 12px;
}
/* 行内 code：排除 pre 内的，避免给代码块叠底色 */
.dsht-md :not(pre) > code {
  font-family: ${MONO_FONT};
  font-size: 14px;
  background: rgba(127, 127, 127, 0.16);
  border-radius: 4px;
  padding: 1px 5px;
}
/*
 * 代码块内的 pre / code：等宽字体。
 * 不依赖 Streamdown 的 data-* 属性（它那几个属性在部分渲染路径下不输出），
 * 直接挂在 .dsht-md 作用域内的 pre 上——这个包装器由本插件渲染，必定存在。
 * Streamdown 会给 pre 传内联 style，故用 !important 压过。
 */
.dsht-md pre,
.dsht-md pre code,
.dsht-md pre span {
  font-family: ${MONO_FONT} !important;
}
.dsht-md pre {
  font-size: 14px !important;
  line-height: 1.6 !important;
}
.dsht-md pre code,
.dsht-md pre span {
  font-size: inherit !important;
}
.dsht-md pre {
  margin: 0;
  tab-size: 2;
  color: ${palette.text};
}
.dsht-md pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}
`;

let hostCssInjected = false;

/** 注入一次宿主覆盖样式（幂等） */
function ensureHostCss(): void {
  if (hostCssInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dsht-page-css", "");
  style.textContent = `${PAGE_HOST_CSS}${HOVER_CARD_CSS}${DARK_THEME_CSS}${STREAMDOWN_CODE_CSS}`;
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
