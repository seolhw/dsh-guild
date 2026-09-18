// ================================================================
// 消息正文的 Markdown 渲染：基于 Streamdown（Vercel 的流式 Markdown 渲染器）。
// 相比早先自己写的轻量解析器，它自带 GFM、代码高亮、CJK 排版与成套的排版样式，
// 表格 / 嵌套列表等重语法也能正确渲染。
// 本文件负责两件事：DSH-Guild 特有的 @提及 高亮，以及不依赖 Tailwind 的内联排版。
// ================================================================

import {
  createContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { Streamdown } from "streamdown";
import { palette } from "./styles";

/** 标记当前 code 是否位于 pre 代码块内（块内样式由 pre 统一提供） */
const CodeBlockContext = createContext(false);

const rootStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  wordBreak: "break-word",
};

const headingStyle: CSSProperties = {
  fontWeight: 600,
  lineHeight: 1.3,
  margin: "18px 0 8px",
};

/** 代码统一用等宽字体：pre 和行内 code 共用，避免块内退回正文比例字体 */
export const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

const codeBlockStyle: CSSProperties = {
  background: palette.layer2,
  border: `1px solid ${palette.border}`,
  borderRadius: 6,
  padding: "10px 12px",
  margin: "10px 0",
  overflowX: "auto",
  fontSize: 14,
  lineHeight: 1.6,
  // 不写字体族的话，pre 会继承正文的中文 UI 字体，代码看起来是「比例字体排版」
  fontFamily: MONO_FONT,
  tabSize: 2,
};

const inlineCodeStyle: CSSProperties = {
  // 代码块内部的行内 code 不要再叠一层底色，否则会看到发蓝的方块。
  // 给个中性灰底，跟随主题；块内由 pre 提供底色。
  background: "rgba(127, 127, 127, 0.16)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: 14,
  fontFamily: MONO_FONT,
};

/** @提及高亮：自己用品牌底色反白 */
function mentionStyle(self: boolean): CSSProperties {
  return {
    color: self ? palette.onColor : palette.accent,
    background: self ? palette.accent : palette.mentionBg,
    borderRadius: 4,
    padding: self ? "0 3px" : "0 2px",
    fontWeight: 500,
  };
}

const MENTION_RE = /@[\p{L}\p{N}_]+/gu;

/**
 * 把一段纯文本里的 @提及 拆成节点数组。
 * 只在文本节点上调用，所以代码块 / 行内 code 里的 @ 字面量不受影响。
 */
function renderMentions(text: string, selfHandle: string): ReactNode {
  if (!text.includes("@")) return text;
  const parts = text.split(MENTION_RE);
  if (parts.length === 1) return text;
  const marks = text.match(MENTION_RE) ?? [];
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) out.push(parts[i]);
    const mark = marks[i];
    if (mark === undefined) continue;
    out.push(
      <span key={`${mark}-${i}`} style={mentionStyle(mark.slice(1) === selfHandle)}>
        {mark}
      </span>,
    );
  }
  return out;
}

/** 递归把 children 里的字符串节点做 @提及 高亮，其余原样透传 */
function withMentions(children: ReactNode, selfHandle: string): ReactNode {
  if (typeof children === "string") return renderMentions(children, selfHandle);
  if (Array.isArray(children)) {
    return children.map((child) =>
      typeof child === "string" ? renderMentions(child, selfHandle) : child,
    );
  }
  return children;
}

/**
 * 代码块里的 code 由 pre 提供底色，行内 code 才需要自己的灰底。
 * Streamdown 会按 Shiki 结果给每个 token 挂 `style="color: var(--shiki-...)"`，
 * 但项目里没有 Tailwind 也没引 Shiki 主题 CSS，这些变量解析不到会把颜色退回继承值。
 * 这里统一用文字色覆盖，保证在宿主深浅主题下都可读。
 */
function CodeElement({ children }: { children?: ReactNode }): ReactElement {
  const inBlock = useContext(CodeBlockContext);
  if (inBlock) return <code style={{ color: palette.text }}>{children}</code>;
  return <code style={inlineCodeStyle}>{children}</code>;
}

/** 消息正文：text 为 Markdown 原文，selfHandle 用于 @提及高亮 */
export function Markdown({ text, selfHandle }: { text: string; selfHandle: string }): ReactElement {
  return (
    <div className="dsht-md" style={rootStyle}>
      <Streamdown
        mode="static"
        components={{
          p: (props) => (
            <p style={{ margin: "6px 0" }}>{withMentions(props.children, selfHandle)}</p>
          ),
          li: (props) => (
            <li style={{ margin: "3px 0" }}>{withMentions(props.children, selfHandle)}</li>
          ),
          h1: (props) => (
            <h1 style={{ ...headingStyle, fontSize: 22 }}>
              {withMentions(props.children, selfHandle)}
            </h1>
          ),
          h2: (props) => (
            <h2 style={{ ...headingStyle, fontSize: 19 }}>
              {withMentions(props.children, selfHandle)}
            </h2>
          ),
          h3: (props) => (
            <h3 style={{ ...headingStyle, fontSize: 17 }}>
              {withMentions(props.children, selfHandle)}
            </h3>
          ),
          h4: (props) => (
            <h4 style={{ ...headingStyle, fontSize: 15 }}>
              {withMentions(props.children, selfHandle)}
            </h4>
          ),
          h5: (props) => (
            <h5 style={{ ...headingStyle, fontSize: 14 }}>
              {withMentions(props.children, selfHandle)}
            </h5>
          ),
          h6: (props) => (
            <h6 style={{ ...headingStyle, fontSize: 14 }}>
              {withMentions(props.children, selfHandle)}
            </h6>
          ),
          ul: (props) => <ul style={{ margin: "6px 0", paddingLeft: 22 }}>{props.children}</ul>,
          ol: (props) => <ol style={{ margin: "6px 0", paddingLeft: 22 }}>{props.children}</ol>,
          a: (props) => (
            <a href={props.href} target="_blank" rel="noreferrer" style={{ color: palette.accent }}>
              {withMentions(props.children, selfHandle)}
            </a>
          ),
          strong: (props) => (
            <strong style={{ fontWeight: 600 }}>{withMentions(props.children, selfHandle)}</strong>
          ),
          blockquote: (props) => (
            <blockquote
              style={{
                borderLeft: `3px solid ${palette.border}`,
                margin: "8px 0",
                paddingLeft: 12,
                color: palette.muted,
              }}
            >
              {props.children}
            </blockquote>
          ),
          // 注意：围栏代码块不走这里。Streamdown 把它交给独立的 code-block 组件
          // （看 DOM 上的 data-streamdown="code-block"），样式由 components.tsx 的
          // STREAMDOWN_CODE_CSS 用 CSS 覆盖；此处的 pre/code 只兜底非围栏场景。
          pre: (props) => (
            <pre style={codeBlockStyle}>
              <CodeBlockContext.Provider value={true}>{props.children}</CodeBlockContext.Provider>
            </pre>
          ),
          code: (props) => <CodeElement>{props.children}</CodeElement>,
          hr: () => (
            <hr
              style={{ border: "none", borderTop: `1px solid ${palette.border}`, margin: "14px 0" }}
            />
          ),
          table: (props) => (
            <table style={{ borderCollapse: "collapse", margin: "8px 0" }}>{props.children}</table>
          ),
          th: (props) => (
            <th
              style={{
                border: `1px solid ${palette.border}`,
                padding: "4px 8px",
                textAlign: "left",
                fontWeight: 600,
              }}
            >
              {props.children}
            </th>
          ),
          td: (props) => (
            <td style={{ border: `1px solid ${palette.border}`, padding: "4px 8px" }}>
              {props.children}
            </td>
          ),
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}
