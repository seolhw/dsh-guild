// ================================================================
// 消息正文的轻量 Markdown 渲染：直接产出 React 节点（不写 innerHTML，天然免疫 XSS）。
// 覆盖聊天常用语法：围栏代码块、标题、引用、有序/无序列表、分割线，以及行内
// code / 粗体 / 斜体 / 删除线 / 链接 / 自动链接，并保留 @提及 高亮与单行换行。
// 只做「够用」的解析：不支持表格、脚注、嵌套列表等重语法。
// ================================================================

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { palette } from "./styles";

/** 等宽字体栈（宿主没有对应 token，按系统字体回退） */
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const rootStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 14,
  lineHeight: 1.55,
};

const inlineCodeStyle: CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 14,
  padding: "1px 5px",
  borderRadius: 4,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

const codeBlockStyle: CSSProperties = {
  margin: "4px 0",
  padding: "8px 10px",
  borderRadius: 8,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
  fontFamily: MONO_FONT,
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: "pre",
  overflowX: "auto",
};

const linkStyle: CSSProperties = {
  color: palette.accent,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  wordBreak: "break-all",
};

const quoteStyle: CSSProperties = {
  margin: "4px 0",
  padding: "2px 0 2px 10px",
  borderLeft: `3px solid ${palette.border}`,
  color: palette.muted,
};

const hrStyle: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${palette.border}`,
  margin: "8px 0",
};

const paragraphStyle: CSSProperties = { margin: "2px 0" };
const listStyle: CSSProperties = { margin: "4px 0", paddingLeft: 22 };

function headingStyle(level: number): CSSProperties {
  return { margin: "6px 0 2px", fontSize: level <= 3 ? 16 : 14, fontWeight: 700, lineHeight: 1.4 };
}

/**
 * 行内语法：code / 自动链接 / 粗斜体 / 删除线 / 链接 / @提及 / 转义。
 * 必须带 u 标志（@提及用到 \p{L} 之类的 Unicode 属性转义）；
 * 自动链接排在强调语法之前，避免 URL 里的下划线被当成斜体。
 */
const INLINE_RE =
  /^(?:`([^`\n]+)`|(https?:\/\/[^\s<>()]+)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]*)\]\(([^)\s]+)\)|(@[\p{L}\p{N}_]+)|(\\.))/u;

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^\s*>\s?/;
const LIST_ITEM_RE = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

/** 段落终止判定：遇到下一个块级语法就收尾 */
function startsBlock(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_ITEM_RE.test(line)
  );
}

/** 链接白名单：只放行 http/https/mailto，其余（如 javascript:）按普通文本显示 */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw, "https://dsh-guild.invalid");
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return raw;
    }
  } catch {
    // 解析失败当普通文本
  }
  return null;
}

/** @提及高亮：自己用品牌底色反白 */
function mentionNode(key: string, raw: string, selfHandle: string): ReactElement {
  const isSelf = raw.slice(1) === selfHandle;
  return (
    <span
      key={key}
      style={{
        color: isSelf ? palette.onColor : palette.accent,
        background: isSelf ? palette.accent : palette.mentionBg,
        borderRadius: 4,
        padding: isSelf ? "0 3px" : "0 2px",
        fontWeight: 500,
      }}
    >
      {raw}
    </span>
  );
}

/** 逐段扫描行内语法，产出 React 节点（纯文本原样保留） */
function renderInline(text: string, selfHandle: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plain = "";
  let i = 0;
  let seq = 0;
  const flushPlain = (): void => {
    if (plain !== "") {
      nodes.push(plain);
      plain = "";
    }
  };
  while (i < text.length) {
    const match = INLINE_RE.exec(text.slice(i));
    if (!match) {
      plain += text[i];
      i += 1;
      continue;
    }
    flushPlain();
    const key = `${keyPrefix}-${seq}`;
    seq += 1;
    if (match[1] !== undefined) {
      nodes.push(
        <code key={key} style={inlineCodeStyle}>
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined) {
      // 自动链接：把结尾的句读还给正文
      const trimmed = match[2].replace(/[.,!?;:]+$/, "");
      nodes.push(
        <a key={key} href={trimmed} target="_blank" rel="noreferrer" style={linkStyle}>
          {trimmed}
        </a>,
      );
      plain = match[2].slice(trimmed.length);
    } else if (match[3] !== undefined) {
      nodes.push(
        <strong key={key}>
          <em>{renderInline(match[3], selfHandle, key)}</em>
        </strong>,
      );
    } else if (match[4] !== undefined || match[5] !== undefined) {
      const inner = match[4] ?? match[5] ?? "";
      nodes.push(<strong key={key}>{renderInline(inner, selfHandle, key)}</strong>);
    } else if (match[6] !== undefined) {
      nodes.push(<del key={key}>{renderInline(match[6], selfHandle, key)}</del>);
    } else if (match[7] !== undefined || match[8] !== undefined) {
      const inner = match[7] ?? match[8] ?? "";
      nodes.push(<em key={key}>{renderInline(inner, selfHandle, key)}</em>);
    } else if (match[9] !== undefined) {
      const href = safeHref(match[10] ?? "");
      if (href === null) {
        // 非法协议：整段按原文显示，不生成链接
        plain = match[0];
      } else {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer" style={linkStyle}>
            {match[9] || href}
          </a>,
        );
      }
    } else if (match[11] !== undefined) {
      nodes.push(mentionNode(key, match[11], selfHandle));
    } else if (match[12] !== undefined) {
      plain += match[12].slice(1);
    }
    i += match[0].length;
  }
  flushPlain();
  return nodes;
}

/** 按块解析：围栏代码块 / 标题 / 引用 / 列表 / 分割线 / 段落 */
function renderBlocks(text: string, selfHandle: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let blockIndex = 0;
  let i = 0;
  const nextKey = (): string => `b-${blockIndex++}`;
  const at = (n: number): string => lines[n] ?? "";

  while (i < lines.length) {
    const line = at(i);

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const closer = new RegExp(`^\\s*${fence[1]}\\s*$`);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !closer.test(at(i))) {
        body.push(at(i));
        i += 1;
      }
      i += 1; // 跳过结束围栏（缺失则停在末尾）
      blocks.push(
        <pre key={nextKey()} style={codeBlockStyle}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const key = nextKey();
      blocks.push(
        <div key={key} style={headingStyle((heading[1] ?? "").length)}>
          {renderInline(heading[2] ?? "", selfHandle, key)}
        </div>,
      );
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push(<hr key={nextKey()} style={hrStyle} />);
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(at(i))) {
        body.push(at(i).replace(QUOTE_RE, ""));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <blockquote key={key} style={quoteStyle}>
          {renderInline(body.join("\n"), selfHandle, key)}
        </blockquote>,
      );
      continue;
    }

    const item = LIST_ITEM_RE.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const items: { line: number; text: string }[] = [];
      while (i < lines.length) {
        const next = LIST_ITEM_RE.exec(at(i));
        if (!next || (next[2] !== undefined) !== ordered) break;
        items.push({ line: i, text: next[3] ?? "" });
        i += 1;
      }
      const key = nextKey();
      const children = items.map((entry) => (
        <li key={entry.line}>{renderInline(entry.text, selfHandle, `${key}-${entry.line}`)}</li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} style={listStyle}>
            {children}
          </ol>
        ) : (
          <ul key={key} style={listStyle}>
            {children}
          </ul>
        ),
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !/^\s*$/.test(at(i)) && !startsBlock(at(i))) {
      paragraph.push(at(i));
      i += 1;
    }
    const key = nextKey();
    blocks.push(
      <div key={key} style={paragraphStyle}>
        {renderInline(paragraph.join("\n"), selfHandle, key)}
      </div>,
    );
  }

  return blocks;
}

/** 消息正文：text 为 Markdown 原文，selfHandle 用于 @提及高亮 */
export function Markdown({ text, selfHandle }: { text: string; selfHandle: string }): ReactElement {
  return <div style={rootStyle}>{renderBlocks(text, selfHandle)}</div>;
}
