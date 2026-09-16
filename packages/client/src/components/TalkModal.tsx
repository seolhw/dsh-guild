// ================================================================
// DSH-Talk 弹窗包装：沿用宿主 primitives 的 Modal 外观，但把遮罩与居中范围
// 限制在「社区」页签内容区内（不包含左侧 DSH 工作区）。
//
// 原因：primitives 的 Modal 通过 createPortal 挂到 document.body，其 root 为
// position:fixed; inset:0，因此天然相对整个视口居中。这里给 dialog 追加标记
// 类，用 :has() 选中宿主对应的 portal root，再把四条定位边改成页签内容区
// 相对视口的偏移；偏移量由 [data-dsht-page-root] 根节点（见 components.tsx
// 的 TalkPage）实时测得。宿主类名是构建期哈希（如 _root_w1urq_2），不可直接
// 引用，故用结构选择器。
// ================================================================

import { Modal as BaseModal } from "@deepseek-ai/dsh-client-ui-primitives";
import { type ComponentProps, type ReactElement, useLayoutEffect } from "react";

/** 追加到 dialog 的标记类：供 :has() 定位对应的 portal root */
const DIALOG_MARKER = "dsht-modal-dialog";

/** 页签内容区根节点的查询属性（见 components.tsx 的 TalkPage） */
const PAGE_ROOT_SELECTOR = "[data-dsht-page-root]";

const talkModalCss = `
body > div[role="presentation"]:has(> .${DIALOG_MARKER}) {
  left: var(--dsht-modal-left, 0px);
  top: var(--dsht-modal-top, 0px);
  right: var(--dsht-modal-right, 0px);
  bottom: var(--dsht-modal-bottom, 0px);
}

/* 宿主 dialog 默认宽 min(380px, 100%)，对表单 / 列表类内容偏窄，统一放宽 */
body > div[role="presentation"] > .${DIALOG_MARKER} {
  width: min(560px, 100%);
}

/* HoverCard 卡片同样经 body portal 渲染、固定 z-index 100，会被上面的遮罩
   （z-index 1000）盖住；把带说明卡的 portal root 提到遮罩之上（只读卡片，
   无需交互）。标记属性见 Manage.tsx 的 ActionTip 与 CommunitiesRail.tsx 的
   各类说明卡，宿主类名是构建期哈希，故只能用结构选择器。 */
body > div:has(> [data-dsht-hover-tip]) {
  z-index: 1100;
}
`;

let styleInjected = false;

/** 注入一次覆盖样式（幂等） */
function ensureStyle(): void {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dsht-modal-css", "");
  style.textContent = talkModalCss;
  document.head.appendChild(style);
  styleInjected = true;
}

/** 把页签内容区相对视口的偏移写入 CSS 变量，供上面的覆盖样式读取 */
function syncBounds(): void {
  const root = document.querySelector<HTMLElement>(PAGE_ROOT_SELECTOR);
  if (!root) return;
  const rect = root.getBoundingClientRect();
  const right = Math.max(0, window.innerWidth - rect.right);
  const bottom = Math.max(0, window.innerHeight - rect.bottom);
  const style = document.documentElement.style;
  style.setProperty("--dsht-modal-left", `${Math.round(rect.left)}px`);
  style.setProperty("--dsht-modal-top", `${Math.round(rect.top)}px`);
  style.setProperty("--dsht-modal-right", `${Math.round(right)}px`);
  style.setProperty("--dsht-modal-bottom", `${Math.round(bottom)}px`);
}

type BaseModalProps = ComponentProps<typeof BaseModal>;

/** 替代 primitives Modal：外观一致，仅在社区页签内容区内居中 */
export function TalkModal({ open, className, ...rest }: BaseModalProps): ReactElement {
  useLayoutEffect(() => {
    if (!open) return;
    ensureStyle();
    syncBounds();
    const root = document.querySelector<HTMLElement>(PAGE_ROOT_SELECTOR);
    const observer = root ? new ResizeObserver(syncBounds) : null;
    if (root && observer) observer.observe(root);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
    };
  }, [open]);

  return (
    <BaseModal
      open={open}
      className={className ? `${className} ${DIALOG_MARKER}` : DIALOG_MARKER}
      {...rest}
    />
  );
}
