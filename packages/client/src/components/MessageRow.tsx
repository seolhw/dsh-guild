// ================================================================
// 消息行：作者/时间/正文（Markdown 渲染，含 @ 高亮）/附件/分享卡片
// + 表情回应 + hover 操作条（加表情回应/回复/讨论组/编辑/撤回）。
// ================================================================

import {
  Button,
  IconBranchOutline16,
  IconCloseOutline16,
  IconDownloadOutline16,
  IconEditOutline16,
  IconTrashOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { type MessageAttachment, Permission } from "@dsh-talk/types/entities";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import {
  askConfirm,
  canEditMessage,
  canPinMessages,
  canRetractMessage,
  channelPermissions,
  deleteMessage,
  type MessageItem,
  notify,
  replyToMessage,
  revealMessage,
  setMessagePinned,
  toggleReaction,
  updateMessage,
  useTalkState,
} from "../store";
import { EmojiPopover } from "./EmojiPicker";
import { formatBytes, msgChip, msgRow, replyParts, textAreaEdit } from "./homeStyles";
import { Markdown } from "./Markdown";
import { ShareCardView } from "./ShareModals";
import { Avatar, palette, smallText, Spinner, timeLabel } from "./styles";

/** 回复（引用）小图标：拐角返回箭头，随按钮颜色 */
export function ReplyGlyph(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V19" />
    </svg>
  );
}

/** 置顶小图标（宿主 primitives 没有 pin 图标，与 ReplyGlyph 一样画一个） */
export function PinGlyph({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9 9 3z" />
    </svg>
  );
}

// ---------------- 附件展示 ----------------

const fileChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.inputBg,
  color: palette.text,
  fontSize: 14,
  textDecoration: "none",
  maxWidth: 260,
};

export function AttachmentList({
  attachments,
}: {
  attachments: MessageAttachment[];
}): ReactElement | null {
  const list = attachments ?? [];
  if (list.length === 0) return null;
  const images = list.filter((a) => a.kind === "image");
  const files = list.filter((a) => a.kind !== "image");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {images.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          title={a.name}
          style={{ display: "block", borderRadius: 10, overflow: "hidden" }}
        >
          <img
            src={a.url}
            alt={a.name}
            loading="lazy"
            style={{
              display: "block",
              maxHeight: 240,
              maxWidth: 320,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: palette.inputBg,
            }}
          />
        </a>
      ))}
      {files.map((a) => (
        <a key={a.url} href={`${a.url}?download=1`} title="点击下载" style={fileChip}>
          <span style={{ color: palette.muted, display: "inline-flex" }}>
            <IconDownloadOutline16 />
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {a.name}
          </span>
          <span style={{ ...smallText, fontSize: 14, flex: "0 0 auto" }}>
            {formatBytes(a.size)}
          </span>
        </a>
      ))}
    </div>
  );
}

// ---------------- 表情回应（reaction） ----------------

/** hover 操作条里的快捷回应：不展开表情面板，单击即切换 */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉"];

/** 快捷回应按钮：我投过的用品牌色淡底高亮 */
function quickReactionStyle(mine: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    minWidth: 24,
    padding: "0 3px",
    fontSize: 15,
    lineHeight: 1,
    cursor: "pointer",
    borderRadius: 6,
    border: "none",
    background: mine ? palette.hoverAccent : "transparent",
  };
}

/** 回应小胶囊：我投过的用品牌色描边高亮 */
function reactionChipStyle(mine: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 7px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${mine ? palette.accent : palette.border}`,
    background: mine ? palette.hoverAccent : palette.inputBg,
    color: mine ? palette.accent : palette.muted,
  };
}

/** 消息底部的一排回应：表情 + 计数，点击切换自己的回应 */
function ReactionRow({ item }: { item: MessageItem }): ReactElement | null {
  const reactions = item.reactions ?? [];
  // 正在切换的回应表情：切换期间禁用整排，避免重复提交
  const [busyEmoji, setBusyEmoji] = useState<string | null>(null);
  if (reactions.length === 0) return null;

  async function react(emoji: string): Promise<void> {
    if (busyEmoji !== null) return;
    setBusyEmoji(emoji);
    await toggleReaction(item, emoji);
    setBusyEmoji(null);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={busyEmoji !== null}
          onClick={() => void react(reaction.emoji)}
          title={reaction.me ? `取消回应 ${reaction.emoji}` : `回应 ${reaction.emoji}`}
          style={reactionChipStyle(reaction.me)}
        >
          <span style={{ fontSize: 14, lineHeight: 1.2 }}>
            {busyEmoji === reaction.emoji ? <Spinner size={12} /> : reaction.emoji}
          </span>
          <span>{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------- 消息行 ----------------

export function MessageRow({
  item,
  onCreateThread,
}: {
  item: MessageItem;
  onCreateThread?: (item: MessageItem) => void;
}): ReactElement {
  const talk = useTalkState();
  const [editing, setEditing] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [draftText, setDraftText] = useState(item.content);
  // 各消息操作请求进行中（保存编辑 / 撤回 / 置顶 / 快捷回应）
  const [savingEdit, setSavingEdit] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [reacting, setReacting] = useState<string | null>(null);
  const mine = talk.me !== null && item.authorId === talk.me.id;
  const mentionedMe = (item.mentions ?? []).includes(talk.me?.id ?? "");
  const focused = talk.view.focusMessageId === item.id;
  const allowEdit = canEditMessage(item);
  const allowRetract = canRetractMessage(item);
  const quote = item.replyTo ? replyParts(item) : null;
  // 该消息所在频道的权限位：能否回复 / 能否从这条消息开讨论组
  const channelOf = talk.view.community?.channels.find((c) => c.id === item.channelId);
  const channelPerms = channelOf ? channelPermissions(channelOf.id) : 0;
  const canReplyHere = (channelPerms & Permission.SEND_MESSAGES) !== 0;
  // 只能从文字频道主频道的直接消息开临时讨论（讨论组/话题内的消息不能再套娃）
  const canThreadHere =
    item.threadId === null &&
    channelOf?.kind === "text" &&
    (channelPerms & Permission.CREATE_THREAD) !== 0;

  async function saveEdit(): Promise<void> {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      await updateMessage(item.id, draftText);
      setEditing(false);
    } catch {
      // 错误已 toast
    } finally {
      setSavingEdit(false);
    }
  }

  /** 撤回（自己的消息，2 分钟内）或删除（owner/admin） */
  async function remove(): Promise<void> {
    if (removing) return;
    const confirmed = await askConfirm(
      mine
        ? {
            title: "撤回这条消息",
            message: "撤回后消息将从频道移除，2 分钟内可撤回，超过 2 分钟只能编辑。",
            confirmLabel: "撤回",
            danger: true,
          }
        : {
            title: "删除这条消息",
            message: "删除后消息将从频道永久移除，且无法恢复。",
            confirmLabel: "删除",
            danger: true,
          },
    );
    if (!confirmed) return;
    setRemoving(true);
    try {
      await deleteMessage(item.id);
    } catch {
      // 错误已 toast（例如已超过 2 分钟撤回窗口）
    } finally {
      setRemoving(false);
    }
  }

  /** 置顶 / 取消置顶 */
  async function togglePin(): Promise<void> {
    if (pinning) return;
    setPinning(true);
    await setMessagePinned(item, item.pinnedAt === null);
    setPinning(false);
  }

  /** 快捷回应 / 表情面板回应 */
  async function react(emoji: string): Promise<void> {
    if (reacting !== null) return;
    setReacting(emoji);
    await toggleReaction(item, emoji);
    setReacting(null);
  }

  async function jumpQuote(): Promise<void> {
    const target = item.replyTo;
    if (!target) return;
    const ok = await revealMessage(item.channelId, target.id, target.threadId ?? null);
    if (!ok) notify("被引用的消息较旧，未能定位");
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      setDraftText(item.content);
      setEditing(false);
    }
  }

  return (
    <div
      className={`dsht-msg-row${mentionedMe ? " is-mentioned" : ""}${focused ? " is-focus" : ""}`}
      data-msg-id={item.id}
      style={msgRow}
    >
      <Avatar size={38} label={item.author.handle} src={item.author.avatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {quote ? (
          <button
            type="button"
            onClick={() => void jumpQuote()}
            title={`跳转到 ${quote.author} 的消息`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
              border: "none",
              background: "transparent",
              padding: "1px 0",
              margin: "0 0 2px",
              cursor: "pointer",
              color: palette.muted,
              fontSize: 14,
              textAlign: "left",
              overflow: "hidden",
            }}
          >
            <span style={{ color: palette.accent, display: "inline-flex", flex: "0 0 auto" }}>
              <ReplyGlyph />
            </span>
            <span
              style={{
                flex: "0 0 auto",
                fontWeight: 600,
                color: palette.accent,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 150,
              }}
            >
              {quote.author}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {quote.content}
            </span>
          </button>
        ) : null}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {item.author.displayName ?? item.author.handle}
          </span>
          <span style={{ fontSize: 14 }}>{mine ? "" : `@${item.author.handle}`}</span>
          <span style={{ ...smallText, fontSize: 14 }}>{timeLabel(item.createdAt)}</span>
          {item.pinnedAt !== null ? (
            <span
              style={{
                fontSize: 14,
                color: palette.accent,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
              title="这条消息已被置顶"
            >
              <PinGlyph size={12} />
              已置顶
            </span>
          ) : null}
          {mentionedMe ? <span style={{ fontSize: 14, color: palette.accent }}>@了你</span> : null}
          {item.updatedAt ? <span style={{ ...smallText, fontSize: 14 }}>(已编辑)</span> : null}
        </div>
        {editing ? (
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={onEditKeyDown}
            style={textAreaEdit}
          />
        ) : (
          <Markdown text={item.content} selfHandle={talk.me?.handle ?? ""} />
        )}
        <AttachmentList attachments={item.attachments ?? []} />
        {item.shareCard ? <ShareCardView card={item.shareCard} /> : null}
        <ReactionRow item={item} />
      </div>
      <span
        className={`dsht-msg-actions${editing || reactionOpen ? " is-open" : ""}`}
        style={msgChip}
      >
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<IconCloseOutline16 />}
              disabled={savingEdit}
              onClick={() => setEditing(false)}
              aria-label="取消编辑"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={savingEdit ? <Spinner size={14} /> : <IconEditOutline16 />}
              disabled={savingEdit}
              onClick={() => void saveEdit()}
              aria-label={savingEdit ? "保存中" : "保存"}
            />
          </>
        ) : (
          <>
            <EmojiPopover
              open={reactionOpen}
              onOpenChange={setReactionOpen}
              onPick={(emoji) => void react(emoji)}
              size="sm"
              align="right"
              label="添加表情回应"
              title="添加表情回应"
              disabled={reacting !== null}
            />
            {QUICK_REACTIONS.map((emoji) => {
              const reacted = (item.reactions ?? []).some((r) => r.emoji === emoji && r.me);
              return (
                <button
                  key={emoji}
                  type="button"
                  className="dsht-quick-react"
                  disabled={reacting !== null}
                  onClick={() => void react(emoji)}
                  title={reacted ? `取消回应 ${emoji}` : `回应 ${emoji}`}
                  aria-label={reacted ? `取消回应 ${emoji}` : `回应 ${emoji}`}
                  style={quickReactionStyle(reacted)}
                >
                  {reacting === emoji ? <Spinner size={12} /> : emoji}
                </button>
              );
            })}
            {canReplyHere ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<ReplyGlyph />}
                onClick={() => replyToMessage(item)}
                aria-label="回复"
                title="回复这条消息"
              />
            ) : null}
            {canThreadHere && onCreateThread ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconBranchOutline16 />}
                onClick={() => onCreateThread(item)}
                aria-label="创建讨论组"
                title="以此为话题创建讨论组"
              />
            ) : null}
            {canPinMessages() ? (
              <Button
                size="sm"
                variant="ghost"
                icon={pinning ? <Spinner size={14} /> : <PinGlyph />}
                disabled={pinning}
                onClick={() => void togglePin()}
                aria-label={item.pinnedAt === null ? "置顶" : "取消置顶"}
                title={item.pinnedAt === null ? "置顶这条消息" : "取消置顶"}
              />
            ) : null}
            {allowEdit ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconEditOutline16 />}
                onClick={() => setEditing(true)}
                aria-label="编辑"
                title="编辑消息"
              />
            ) : null}
            {allowRetract ? (
              <Button
                size="sm"
                variant="ghost"
                icon={removing ? <Spinner size={14} /> : <IconTrashOutline16 />}
                disabled={removing}
                onClick={() => void remove()}
                aria-label={removing ? "处理中" : mine ? "撤回" : "删除"}
                title={mine ? "撤回消息（2 分钟内）" : "删除消息"}
              />
            ) : null}
          </>
        )}
      </span>
    </div>
  );
}
