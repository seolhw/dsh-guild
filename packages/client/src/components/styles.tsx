// ================================================================
// DSH-Talk 页面共享样式：全部使用 DeepSeek 宿主注入的 --dsw-* token，
// 随系统亮/暗主题自动切换（宿主把 "system" 解析成实际 colorScheme 后，
// 通过 body 内联变量 + body[data-ds-dark-theme] 下发）。插件侧禁止硬编码色值。
// 参考：dsh-client-ui-theme 的 design-platform.css token 命名。
// ================================================================

import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

/** 语义色 token（明暗随宿主翻转）。组件只引用这里的键，不得写字面色值 */
export const palette = {
  // 表面
  page: "var(--dsw-alias-bg-base)",
  panel: "var(--dsw-alias-bg-layer-1)",
  layer2: "var(--dsw-alias-bg-layer-2)",
  rail: "var(--dsw-specific-sidebar-fill)",
  elevated: "var(--dsw-alias-bg-overlay)",
  // 边框
  border: "var(--dsw-alias-border-l1)",
  // 文字：只有正文与辅助两档。所有说明、提示、时间戳、占位统一用 muted，
  // 不再按“次要程度”细分（同类场景必须落到同一个色）。
  // muted 走 --dsht-label-* 变量层：暗色主题下宿主 token 偏暗，
  // 由 components.tsx 的 DARK_TEXT_CSS 在插件内提亮；未定义时回退宿主 token。
  text: "var(--dsw-alias-label-primary)",
  muted: "var(--dsht-label-tertiary, var(--dsw-alias-label-tertiary))",
  // 品牌 / 状态
  accent: "var(--dsw-alias-state-business-primary)",
  danger: "var(--dsw-alias-state-error-primary)",
  dangerSoft: "var(--dsw-alias-state-error-secondary)",
  success: "var(--dsw-alias-state-success-primary)",
  warn: "var(--dsw-alias-state-warn-primary)",
  // 交互
  inputBg: "var(--dsw-alias-interactive-bg-hover-solid)",
  hover: "var(--dsw-alias-interactive-bg-hover)",
  // 徽标：提及用品牌色，普通未读用文字弱化层
  badge: "var(--dsw-alias-state-error-primary)",
  hoverAccent: "var(--dsw-alias-interactive-bg-hover-accent)",
  // 彩色/深色块上的文字与图标（未读气泡、头像字母、@ 自己的反白）：各主题下恒定用白
  onColor: "#ffffff",
  /** 品牌色淡底：@提及高亮、被提及消息的底色 */
  mentionBg: "var(--dsw-alias-state-business-tertiary)",
  /** 搜索命中关键词的底色（比 mentionBg 更实一档的半透明品牌色） */
  highlightBg: "var(--dsw-alias-interactive-bg-hover-accent)",
  /** 头像无图时的默认底色渐变 */
  avatarFallback:
    "var(--dsht-community-avatar-bg, #ffffff)",
  /**
   * 社区头像（社区 logo）的圆形底色：内缩 logo 四周露出的那一圈。
   * 亮色主题白底、暗色主题黑底，取值走 --dsht-community-avatar-bg 变量层
   * （暗色覆盖由 components.tsx 的 DARK_THEME_CSS 下发）。
   */
  communityAvatarBg: "var(--dsht-community-avatar-bg, #ffffff)",
} as const;

/** 阴影：集中定义，避免 rgba 黑散落在各组件里 */
export const shadow = {
  /** 小元素 / 列表卡片 */
  soft: "0 1px 2px rgba(0,0,0,0.06)",
  /** 消息 hover 操作条 */
  chip: "0 2px 6px rgba(0,0,0,0.1)",
  /** @ 补全下拉 */
  menu: "0 4px 16px rgba(0,0,0,0.14)",
  /** 表情面板等浮层 */
  popup: "0 6px 20px rgba(0,0,0,0.18)",
} as const;

/** 页签内容页根容器：占满宿主中栏（高度由外层 flex 约束） */
export const pageRoot: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: palette.page,
  color: palette.text,
};

/** 垂直填满剩余空间 */
export const flexFill: CSSProperties = { flex: 1, minHeight: 0 };

/** 水平滚动条细样式（可选加到滚动容器） */
export const slimScrollbar: CSSProperties = {
  scrollbarWidth: "thin",
  scrollbarColor: "var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2)) transparent",
};

export const smallText: CSSProperties = { fontSize: 14, color: palette.muted };

/** 分段选择组容器（对齐 AuthScreen 的 Segmented 控件）：圆角外壳 + 内部激活键 */
export const pillGroup: CSSProperties = {
  display: "flex",
  gap: 2,
  padding: 3,
  borderRadius: 10,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

/** 分段选择组内的单个键（非激活态） */
const pillKey: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 14,
  fontWeight: 450,
  color: palette.muted,
  background: "transparent",
  cursor: "pointer",
  transition: "background 120ms ease, color 120ms ease",
};

/** 分段选择键样式：active 时叠加激活态 */
export function pillStyle(active: boolean): CSSProperties {
  if (!active) return pillKey;
  return {
    ...pillKey,
    fontWeight: 600,
    color: palette.text,
    background: palette.elevated,
    boxShadow: shadow.soft,
  };
}

/** 表单字段纵向容器 */
export const fieldBlock: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** 字段小标签 */
export const fieldLabel: CSSProperties = {
  fontSize: 14,
  color: palette.muted,
  fontWeight: 500,
};

/** 成员 / 封禁 / 在线成员等列表卡片行 */
export const listCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 10,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

/** 列表卡片的主标题行（单行省略） */
export const listCardName: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * 项目 logo（构建期由 tsdown 读 packages/client/public/logo.svg 注入）转 data URL。
 * 源文件是纯黑单色图形，这里统一用 CSS mask 渲染、以宿主语义文字色填充，
 * 因此亮/暗主题下都可见（详见 BrandLogo）。
 */
export const talkLogoUrl = `data:image/svg+xml;utf8,${encodeURIComponent(__DSH_TALK_LOGO_SVG__)}`;

// ---------------- 加载指示器 ----------------

/** Spinner 旋转动画（@keyframes 不能用内联样式，挂载时注入一次） */
const SPINNER_CSS = `
@keyframes dsht-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dsht-spinner { animation-duration: 1.6s !important; }
}
`;

let spinnerCssInjected = false;

function ensureSpinnerCss(): void {
  if (spinnerCssInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dsht-spinner-css", "");
  style.textContent = SPINNER_CSS;
  document.head.appendChild(style);
  spinnerCssInjected = true;
}

/**
 * 行内加载指示器（转圈）：服务器在境外、请求偏慢时用于按钮/列表的行内反馈。
 * 颜色跟随当前文字色，可放在 Button 的 icon 插槽或文字前。
 */
export function Spinner({ size = 14 }: { size?: number }): ReactElement {
  ensureSpinnerCss();
  return (
    <span
      className="dsht-spinner"
      role="status"
      aria-label="加载中"
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "inline-block",
        borderRadius: "50%",
        border: `2px solid currentColor`,
        borderTopColor: "transparent",
        animation: "dsht-spin 0.7s linear infinite",
      }}
    />
  );
}

/** 居中的加载提示（整块区域拉取数据时用） */
export function LoadingHint({
  text = "加载中…",
  padding = "16px 4px",
}: {
  text?: string;
  padding?: string;
}): ReactElement {
  return (
    <div
      style={{
        ...smallText,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding,
      }}
    >
      <Spinner size={14} />
      <span>{text}</span>
    </div>
  );
}

/** 品牌 logo 标记：单色 mask 跟随宿主文字色，尺寸自定 */
export function BrandLogo({ size = 34, title }: { size?: number; title?: string }): ReactElement {
  return (
    <span
      role="img"
      aria-label={title ?? "DSH-Talk"}
      title={title}
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "inline-block",
        backgroundColor: palette.text,
        maskImage: `url("${talkLogoUrl}")`,
        WebkitMaskImage: `url("${talkLogoUrl}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

// ---------------- 默认头像（DiceBear 占位图） ----------------
// 用户与社区走不同 style + 不同配色，避免默认头像看起来是一类东西：
//   用户 = notionists 手绘人物 + 低饱和马卡龙底色（纸面透明）
//   社区 = shapes 几何图形 + 高饱和底色 + 白色图形，更接近社区徽标
const DICEBEAR_API = "https://api.dicebear.com/10.x";

const USER_PLACEHOLDER_BG = "b6e3f4";
// const USER_PLACEHOLDER_BG = "b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf";
const COMMUNITY_PLACEHOLDER_BG = "7c3aed";
// const COMMUNITY_PLACEHOLDER_BG = "2563eb,7c3aed,db2777,0d9488,ea580c";

/** 头像归属：用户 / 社区，决定默认占位图的风格 */
export type AvatarKind = "user" | "community";

/** 拼装 DiceBear 占位图 URL；seed 相同则每次生成同一张图，可稳定替代自定义头像 */
export function dicebearAvatarUrl(kind: AvatarKind, seed: string): string {
  const search = new URLSearchParams({ seed, size: "96" });
  if (kind === "community") {
    search.set("backgroundColor", COMMUNITY_PLACEHOLDER_BG);
    for (const key of ["shape1Color", "shape2Color", "shape3Color"]) {
      search.set(key, "ffffff");
    }
    return `${DICEBEAR_API}/planets/svg?${search}`;
  }
  search.set("backgroundColor", USER_PLACEHOLDER_BG);
  // 纸面透明，让底色铺满整个头像圆块
  search.set("paperColor", "00000000");
  return `${DICEBEAR_API}/voxel-bot/svg?${search}`;
}

/** 头像内文字随尺寸缩放，但只落在 14 / 16 两档（项目字号标准：最小 14，大号 16） */
function avatarLabelSize(size: number): number {
  return size * 0.42 < 15 ? 14 : 16;
}

/** 头像圆块：有 url 时显示图片；无 url / 加载失败时回退到 DiceBear 默认占位图 */
export function Avatar({
  label,
  color,
  size = 28,
  src,
  inset,
  kind = "user",
}: {
  label: string;
  color?: string;
  size?: number;
  src?: string | null;
  /** 图片相对圆块的内缩（px）：留出一圈底色与 logo 的缝隙；不传则图片铺满整圆 */
  inset?: number;
  /** 头像归属：用户 / 社区，决定默认占位图风格（默认用户） */
  kind?: AvatarKind;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (src) setFailed(false);
  }, [src]);
  const placeholder = dicebearAvatarUrl(kind, label);
  const showImage = Boolean(src) && !failed;
  const showPlaceholder = !showImage && placeholder;

  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        overflow: "hidden",
        background: color ?? palette.avatarFallback,
        color: palette.onColor,
        fontSize: avatarLabelSize(size),
        fontWeight: 600,
        userSelect: "none",
      }}
    >
      {showImage ? (
        <img
          src={src ?? ""}
          alt={label}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            // inset 时改用 contain：logo 完整落在内缩后的区域，四周露出底色
            objectFit: inset ? "contain" : "cover",
            ...(inset ? { boxSizing: "border-box" as const, padding: inset } : {}),
          }}
        />
      ) : showPlaceholder ? (
        <img
          src={placeholder}
          alt={label}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
          }}
        />
      ) : (
        label.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/**
 * 社区头像统一规格（社区栏列表、社区栏 hover 卡、社区创建/设置弹窗共用）：
 * 同一社区 logo 在三处必须同尺寸、同内缩、同圆底，避免视觉大小来回跳。
 */
export const COMMUNITY_AVATAR_SIZE = 44;

/** 社区 logo 相对圆块的内缩（px）：四周露出的一圈圆底 */
export const COMMUNITY_AVATAR_INSET = 4;

/** 头像与其右侧内容的统一间距（社区 hover 卡、头像选择器、邀请行共用） */
export const avatarGap = 8;

/** 社区头像：固定 COMMUNITY_AVATAR_SIZE + COMMUNITY_AVATAR_INSET + 主题圆底 */
export function CommunityAvatar({
  label,
  src,
  size,
}: {
  label: string;
  src?: string | null;
  size?: number | undefined;
}): ReactElement {
  return (
    <Avatar
      color={palette.communityAvatarBg}
      label={label}
      src={src ?? null}
      size={size ?? COMMUNITY_AVATAR_SIZE}
      inset={COMMUNITY_AVATAR_INSET}
      kind="community"
    />
  );
}

/** 头像/图标选择器：预览圆块 + 「修改/移除」按钮，选取后回调 onPick(File) */
export function AvatarPicker({
  src,
  label,
  size,
  onPick,
  onRemove,
  uploadLabel = "修改头像",
  removeLabel = "移除头像",
  busy,
  kind = "user",
}: {
  src?: string | null;
  label: string;
  /** 不传时：社区头像走 COMMUNITY_AVATAR_SIZE，用户头像 60 */
  size?: number;
  onPick?: (file: File) => void;
  onRemove?: () => void;
  uploadLabel?: string;
  removeLabel?: string;
  busy?: boolean;
  /** 头像归属：用户 / 社区，决定默认占位图风格（默认用户） */
  kind?: AvatarKind;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: avatarGap }}>
      {kind === "community" ? (
        <CommunityAvatar label={label} src={src ?? null} size={size} />
      ) : (
        <Avatar label={label} src={src ?? null} size={size ?? 60} kind={kind} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploadLabel}
          </Button>
          {onRemove ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
              {removeLabel}
            </Button>
          ) : null}
        </div>
        <span style={{ ...smallText, fontSize: 14 }}>支持 JPG / PNG / WebP，建议方形图片</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && onPick) onPick(file);
        }}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

export function timeLabel(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
