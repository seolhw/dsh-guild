// ================================================================
// 聊天面板：头部（房间标题 / 管理 / 搜索 / 实时态）+ 消息列表 + 输入框（@ 补全、附件、回复）。
// ================================================================

import {
  Button,
  IconBranchOutline16,
  IconChevronLeftOutline14,
  IconCloseOutline16,
  IconEditOutline16,
  IconPaperclipOutline16,
  IconSearchOutline16,
  IconSendOutline16,
  IconShareOutline16,
  IconUserOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { Permission } from "@dsh-talk/types/entities";
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  ReactElement,
  UIEvent,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cancelReply,
  canManageThreads,
  canPinMessages,
  channelPermissions,
  clearMessageFocus,
  closeThread,
  loadOlderMessages,
  loadPinnedMessages,
  type MemberLite,
  type MessageItem,
  notify,
  notifyTyping,
  revealMessage,
  sendMessage,
  setMessagePinned,
  setThreadArchived,
  type TypingMember,
  useTalkState,
} from "../store";
import { EmojiPopover } from "./EmojiPicker";
import { ForumTopicBoard } from "./ForumTopicBoard";
import {
  chatCol,
  composerBox,
  composerToolbar,
  composerToolbarGap,
  composerWrap,
  creatorRow,
  emptyMsg,
  formatBytes,
  liveDot,
  messagesContent,
  messagesWrap,
  pendingChip,
  replyParts,
  textArea,
} from "./homeStyles";
import { MemberPanel } from "./MemberPanel";
import { MessageRow, PinGlyph, ReplyGlyph } from "./MessageRow";
import { SearchMessagesModal } from "./SearchModals";
import { ShareSnapshotModal } from "./ShareModals";
import { Avatar, palette, shadow, smallText, Spinner, timeLabel } from "./styles";
import { TalkModal } from "./TalkModal";
import { ThreadMembersModal, ThreadSettingsModal } from "./ThreadModals";

/** 「张三 正在输入…」/「张三、李四 正在输入…」/「张三 等 3 人正在输入…」 */
function typingLabel(members: TypingMember[]): string {
  const names = members.map((m) => m.displayName ?? m.handle);
  if (names.length === 1) return `${names[0]} 正在输入…`;
  if (names.length === 2) return `${names[0]}、${names[1]} 正在输入…`;
  return `${names[0]} 等 ${names.length} 人正在输入…`;
}

/**
 * 置顶消息面板：列出当前房间（主频道或讨论组）的置顶消息，点击定位到原消息；
 * 持有 MANAGE_MESSAGES 时可就地取消置顶。
 */
function PinnedMessagesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const talk = useTalkState();
  const [items, setItems] = useState<MessageItem[] | null>(null);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);

  // 每次打开重拉（置顶可能已被别人改动）
  useEffect(() => {
    if (!open) return;
    setItems(null);
    let alive = true;
    void loadPinnedMessages().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  async function unpin(item: MessageItem): Promise<void> {
    if (unpinningId !== null) return;
    setUnpinningId(item.id);
    await setMessagePinned(item, false);
    setUnpinningId(null);
    setItems((prev) => (prev ?? []).filter((x) => x.id !== item.id));
  }

  async function jump(item: MessageItem): Promise<void> {
    onClose();
    const ok = await revealMessage(item.channelId, item.id, item.threadId);
    if (!ok) notify("该置顶消息较旧，未能定位");
  }

  return (
    <TalkModal
      open={open}
      onClose={onClose}
      title="置顶消息"
      closeLabel="关闭"
      description={talk.view.threadId ? "本讨论组的置顶消息" : "本频道的置顶消息"}
    >
      {items === null ? (
        <div style={{ ...smallText, fontSize: 14, padding: "10px 2px" }}>加载中…</div>
      ) : items.length === 0 ? (
        <div style={{ ...smallText, fontSize: 14, padding: "10px 2px" }}>
          还没有置顶消息。把鼠标移到消息上，点置顶图标即可固定在这里。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                border: `1px solid ${palette.border}`,
                background: palette.inputBg,
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <button
                type="button"
                onClick={() => void jump(item)}
                title="跳转到这条消息"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  color: palette.text,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {item.author.displayName ?? item.author.handle}
                  </span>
                  <span style={{ ...smallText, fontSize: 14 }}>
                    {timeLabel(item.pinnedAt ?? item.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: palette.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.content.trim().length > 0 ? item.content : "（无正文）"}
                </div>
              </button>
              {canPinMessages() ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={unpinningId === item.id ? <Spinner size={14} /> : <PinGlyph />}
                  disabled={unpinningId !== null}
                  onClick={() => void unpin(item)}
                  aria-label="取消置顶"
                  title="取消置顶"
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </TalkModal>
  );
}

export function ChatPane({
  onCreateThread,
}: {
  onCreateThread: (
    channelId: string,
    seed: { name: string; starterMessageId?: string } | null,
  ) => void;
}): ReactElement | null {
  const talk = useTalkState();
  const channelId = talk.view.channelId;
  const community = talk.view.community;
  const channel = channelId ? (community?.channels.find((c) => c.id === channelId) ?? null) : null;
  const messageCount = talk.view.messages.length;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<string | null>(null);
  const pinnedRef = useRef(true);
  const lastCountRef = useRef(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const MAX_ATTACH = 4;
  const [shareOpen, setShareOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  // 输入框 / @ 提及自动补全 / 消息搜索
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerText, setComposerText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartRef = useRef(-1);
  // 私密讨论组成员管理弹窗
  const [threadMembersOpen, setThreadMembersOpen] = useState(false);
  // 讨论组设置弹窗（改名 / 可见性 / 密码）
  const [threadSettingsOpen, setThreadSettingsOpen] = useState(false);
  // 置顶消息面板
  const [pinnedOpen, setPinnedOpen] = useState(false);
  // 拖拽文件到输入区时的高亮态
  const [dragging, setDragging] = useState(false);
  // 归档 / 恢复讨论组请求进行中
  const [threadBusy, setThreadBusy] = useState(false);

  const threadId = talk.view.threadId;
  const roomKey = threadId ?? channelId;
  const currentThread =
    channelId && threadId
      ? (talk.view.community?.threads.find((t) => t.id === threadId) ?? null)
      : null;
  const isThread = currentThread !== null;
  const isForumChannel = (channel?.kind ?? "text") === "forum";
  /** 话题频道的主面板 = 话题板（列表）；打开某条话题后才是聊天视图 */
  const isForumBoard = isForumChannel && !isThread;

  /** 与 @mentionQuery 匹配的候选成员（不含自己，最多 8 个） */
  const mentionCandidates: MemberLite[] = mentionActive
    ? talk.view.members
        .filter((m) => m.userId !== talk.me?.id)
        .filter((m) => m.handle.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  /** 回复目标（composer 提示条）展示信息 */
  const replyingPreview = talk.view.replyingTo
    ? replyParts({ replyTo: talk.view.replyingTo })
    : null;

  // 权限位（含频道 overwrite 叠加）：能否发言 / 能否开讨论组 / 能否管理当前讨论组
  const channelPerms = channel ? channelPermissions(channel.id) : 0;
  const canPost = (channelPerms & Permission.SEND_MESSAGES) !== 0;
  const canCreateThread = (channelPerms & Permission.CREATE_THREAD) !== 0;
  /** 能否管理当前讨论组（发起人或持有社区 MANAGE_THREADS） */
  const canManageThread =
    currentThread !== null && (currentThread.createdBy === talk.me?.id || canManageThreads());

  /** 在主频道头部开一个空白讨论组（弹窗由 HomeScreen 承载） */
  function openBlankThread(): void {
    if (channelId) onCreateThread(channelId, null);
  }

  /** 从某条消息发起讨论组（自动用消息摘要取名） */
  function openThreadFromMessage(item: MessageItem): void {
    const raw = item.content.replace(/\s+/g, " ").trim();
    const name = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw || "话题讨论";
    if (channelId) onCreateThread(channelId, { name, starterMessageId: item.id });
  }

  /** 归档 / 恢复当前讨论组 */
  async function toggleThreadArchive(): Promise<void> {
    if (!currentThread || threadBusy) return;
    setThreadBusy(true);
    await setThreadArchived(currentThread.id, currentThread.status === "active");
    setThreadBusy(false);
  }

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    const el = event.currentTarget;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // 切房间（主频道/讨论组）→ 置底；消息增多且贴底 → 跟随。
  // 用 layout effect 保证进入房间首帧就停在最新消息处，不出现「先顶部再跳到底部」。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switched = channelRef.current !== roomKey;
    channelRef.current = roomKey;
    if (switched) {
      lastCountRef.current = messageCount;
      el.scrollTop = el.scrollHeight;
      pinnedRef.current = true;
      return;
    }
    const grew = messageCount > lastCountRef.current;
    lastCountRef.current = messageCount;
    if (grew && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [roomKey, messageCount]);

  // 内容高度变化（图片懒加载、字体/排版回流）时，只要仍贴底就继续贴底
  // biome-ignore lint/correctness/useExhaustiveDependencies: 话题频道在「话题板 ↔ 聊天」间切换会重建内容节点，需随房间重新观测
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [roomKey]);

  // 切房间：清空输入框，收起 @ 补全弹层、表情面板与回复提示
  // biome-ignore lint/correctness/useExhaustiveDependencies: 需要在切换房间时重置弹层与输入
  useEffect(() => {
    setComposerText("");
    setEmojiOpen(false);
    setMentionActive(false);
    setMentionQuery("");
    setMentionIndex(0);
    mentionStartRef.current = -1;
  }, [roomKey]);

  // 选中「回复」后自动聚焦输入框
  useEffect(() => {
    if (talk.view.replyingTo) composerRef.current?.focus();
  }, [talk.view.replyingTo]);

  // 定位高亮：滚动到目标消息并在 1.8s 后清除标记
  useEffect(() => {
    const targetId = talk.view.focusMessageId;
    if (!targetId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${targetId}"]`);
    if (el) {
      pinnedRef.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const timer = window.setTimeout(() => clearMessageFocus(), 1800);
    return () => window.clearTimeout(timer);
  }, [talk.view.focusMessageId]);

  if (!channelId) return null;

  /** 追加待发送附件（选择器 / 粘贴 / 拖拽共用；超出上限时保留靠前的） */
  function addFiles(picked: File[]): void {
    if (picked.length === 0) return;
    setPendingFiles((prev) => {
      const room = MAX_ATTACH - prev.length;
      if (room <= 0) {
        notify(`一条消息最多 ${MAX_ATTACH} 个附件`);
        return prev;
      }
      if (picked.length > room) notify(`一条消息最多 ${MAX_ATTACH} 个附件，已保留前 ${room} 个`);
      return [...prev, ...picked].slice(0, MAX_ATTACH);
    });
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>): void {
    const picked = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    addFiles(picked);
  }

  /** 粘贴：剪贴板里带文件（截图等）时直接作为待发送附件 */
  function onComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  }

  /** 拖拽文件到输入区：仅接管文件类型，文本拖拽保持浏览器默认行为 */
  function onComposerDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!canPost || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function onComposerDrop(event: DragEvent<HTMLDivElement>): void {
    if (!canPost) return;
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function removePending(index: number): void {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  /** 光标前是否存在正在输入的 `@handle`，返回 token 起点与已输入部分 */
  function mentionAtCaret(text: string, caret: number): { start: number; query: string } | null {
    if (caret < 1) return null;
    let i = caret - 1;
    while (i >= 0 && /[\p{L}\p{N}_]/u.test(text.charAt(i))) i -= 1;
    if (i < 0 || text.charAt(i) !== "@") return null;
    if (i > 0 && /[\p{L}\p{N}_]/u.test(text.charAt(i - 1))) return null;
    return { start: i, query: text.slice(i + 1, caret) };
  }

  /** 把选中的成员插入正文，替换掉当前 @token */
  function acceptMention(member: MemberLite): void {
    const text = composerText;
    const caret = composerRef.current?.selectionStart ?? text.length;
    const start =
      mentionStartRef.current >= 0
        ? mentionStartRef.current
        : Math.max(0, caret - mentionQuery.length - 1);
    const next = `${text.slice(0, start)}@${member.handle} ${text.slice(caret)}`;
    setComposerText(next);
    setMentionActive(false);
    setMentionQuery("");
    mentionStartRef.current = -1;
    const caretAfter = start + member.handle.length + 2;
    const el = composerRef.current;
    if (el) {
      window.requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caretAfter, caretAfter);
      });
    }
  }

  function handleComposerChange(value: string): void {
    setComposerText(value);
    if (value.trim().length > 0) notifyTyping();
    const caret = composerRef.current?.selectionStart ?? value.length;
    const hit = mentionAtCaret(value, caret);
    if (hit) {
      mentionStartRef.current = hit.start;
      setMentionQuery(hit.query);
      setMentionIndex(0);
      setMentionActive(true);
    } else {
      mentionStartRef.current = -1;
      setMentionActive(false);
    }
  }

  /** 把表情插入输入框光标处（有选区时替换选区），并把光标移到表情之后 */
  function insertEmoji(emoji: string): void {
    const el = composerRef.current;
    const start = el?.selectionStart ?? composerText.length;
    const end = el?.selectionEnd ?? start;
    setComposerText(`${composerText.slice(0, start)}${emoji}${composerText.slice(end)}`);
    if (el) {
      const caret = start + emoji.length;
      window.requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    const choosing = mentionActive && mentionCandidates.length > 0;
    if (choosing && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setMentionIndex((i) => (i + delta + mentionCandidates.length) % mentionCandidates.length);
      return;
    }
    if (choosing && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      const pick = mentionCandidates[mentionIndex];
      if (pick) acceptMention(pick);
      return;
    }
    if (mentionActive && e.key === "Escape") {
      e.preventDefault();
      setMentionActive(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  async function submit(): Promise<void> {
    const text = composerText;
    if (text.trim().length === 0 && pendingFiles.length === 0) return;
    const ok = await sendMessage(text, pendingFiles);
    if (ok) {
      setComposerText("");
      setPendingFiles([]);
      setEmojiOpen(false);
      setMentionActive(false);
      mentionStartRef.current = -1;
      composerRef.current?.focus();
    }
  }

  /** 从右侧成员面板把 @handle 插入输入框（光标处已有 @token 时替换之） */
  function insertMentionHandle(handle: string): void {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? composerText.length;
    const hit = mentionAtCaret(composerText, caret);
    const start = hit ? hit.start : caret;
    const next = `${composerText.slice(0, start)}@${handle} ${composerText.slice(caret)}`;
    setComposerText(next);
    setMentionActive(false);
    setMentionQuery("");
    mentionStartRef.current = -1;
    const caretAfter = start + handle.length + 2;
    if (el) {
      window.requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caretAfter, caretAfter);
      });
    }
  }

  const hasOlder = talk.view.nextCursor !== null;
  const canLoadMore = !talk.view.loadingOlder && hasOlder;

  return (
    <>
      <div style={chatCol}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          {isThread && currentThread ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconChevronLeftOutline14 />}
              onClick={() => void closeThread()}
              aria-label={isForumChannel ? "返回话题列表" : "返回主频道"}
              title={isForumChannel ? "返回话题列表" : `返回 #${channel?.name ?? ""}`}
            />
          ) : null}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 22,
              borderRadius: 6,
              background: palette.inputBg,
              border: `1px solid ${palette.border}`,
              flex: "0 0 auto",
            }}
          >
            {isThread ? <IconBranchOutline16 /> : <span style={{ color: palette.muted }}>#</span>}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isThread
                ? (currentThread?.name ?? (isForumChannel ? "话题" : "讨论组"))
                : (channel?.name ?? "")}
            </div>
            {isThread ? (
              <div style={{ ...smallText, fontSize: 14 }}>
                {isForumChannel ? "话题" : "讨论组"}
                {currentThread?.status === "archived" ? "（已归档）" : ""} · 位于 #
                {channel?.name ?? ""}
              </div>
            ) : channel?.topic ? (
              <div
                style={{
                  ...smallText,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {channel.topic}
              </div>
            ) : null}
          </div>
          {isThread && currentThread?.visibility === "private" ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconUserOutline16 />}
              onClick={() => setThreadMembersOpen(true)}
              aria-label="讨论组成员"
              title="管理私密讨论组成员"
            >
              成员
            </Button>
          ) : null}
          {canManageThread ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconEditOutline16 />}
              onClick={() => setThreadSettingsOpen(true)}
              aria-label="讨论组设置"
              title="改动讨论组：名称 / 可见性 / 进入密码"
            />
          ) : null}
          {isThread ? (
            <Button
              size="sm"
              variant="ghost"
              icon={threadBusy ? <Spinner size={14} /> : undefined}
              disabled={threadBusy}
              onClick={() => void toggleThreadArchive()}
              aria-label={currentThread?.status === "active" ? "归档" : "恢复"}
              title={
                isForumChannel
                  ? currentThread?.status === "active"
                    ? "归档话题（24h 无人回复也会自动归档）"
                    : "把话题恢复为活跃"
                  : currentThread?.status === "active"
                    ? "手动归档（24h 无人发言也会自动归档）"
                    : "把讨论组恢复为活跃"
              }
            >
              {threadBusy ? "处理中…" : currentThread?.status === "active" ? "归档" : "恢复"}
            </Button>
          ) : null}
          {!isThread && canCreateThread ? (
            isForumChannel ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconBranchOutline16 />}
                onClick={openBlankThread}
              >
                新建话题
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconBranchOutline16 />}
                onClick={openBlankThread}
                aria-label="创建讨论组"
                title="为当前频道开一个讨论组"
              />
            )
          ) : null}
          {!isThread ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconSearchOutline16 />}
              onClick={() => setSearchOpen(true)}
              aria-label="搜索消息"
              title="搜索社区内的消息"
            />
          ) : null}
          {!isForumBoard ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<PinGlyph />}
              onClick={() => setPinnedOpen(true)}
              aria-label="置顶消息"
              title="查看置顶消息"
            />
          ) : null}
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flex: "0 0 auto",
            }}
          >
            <Button
              size="sm"
              variant="ghost"
              icon={<IconUserOutline16 />}
              onClick={() => setMembersOpen((v) => !v)}
              aria-label="社区成员"
              title="社区成员"
            />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 999,
                background: talk.view.live ? palette.hover : palette.inputBg,
                border: `1px solid ${palette.border}`,
              }}
            >
              <span
                style={{
                  ...liveDot,
                  background: talk.view.live ? palette.success : palette.muted,
                  boxShadow: talk.view.live ? `0 0 5px ${palette.success}` : undefined,
                }}
              />
              <span style={{ fontSize: 14, color: palette.muted }}>
                {talk.view.live ? "实时" : "重连中…"}
              </span>
            </span>
          </span>
        </div>

        {isForumBoard ? (
          <ForumTopicBoard channelId={channelId} onNewTopic={openBlankThread} />
        ) : (
          <>
            <div ref={scrollRef} onScroll={onScroll} style={messagesWrap}>
              <div ref={contentRef} style={messagesContent}>
                {talk.view.messagesLoading ? (
                  <div style={{ ...emptyMsg }}>加载消息…</div>
                ) : talk.view.messages.length === 0 ? (
                  <div style={{ ...emptyMsg }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        fontSize: 16,
                        fontWeight: 700,
                        color: palette.accent,
                        background: palette.inputBg,
                        border: `1px solid ${palette.border}`,
                      }}
                    >
                      #
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>
                      {channel?.kind === "announcement" ? "暂无公告" : "还没有消息"}
                    </span>
                    <span style={{ fontSize: 14 }}>
                      {channel?.kind === "announcement"
                        ? canPost
                          ? "在这里发布面向全员的公告。"
                          : "你没有在此频道发言的权限。"
                        : canPost
                          ? "来说第一句吧。"
                          : "你没有在此频道发言的权限。"}
                    </span>
                  </div>
                ) : (
                  <>
                    {canLoadMore ? (
                      <div style={creatorRow}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadOlderMessages()}
                          disabled={talk.view.loadingOlder}
                        >
                          {talk.view.loadingOlder ? "加载中…" : "加载更早消息"}
                        </Button>
                      </div>
                    ) : null}
                    {talk.view.messages.map((item) => (
                      <MessageRow
                        key={item.id}
                        item={item}
                        onCreateThread={openThreadFromMessage}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* biome-ignore lint/a11y/noStaticElementInteractions: 拖拽落区只是增强，键盘/无鼠标用户走「添加附件」按钮 */}
            <div
              style={
                dragging
                  ? { ...composerWrap, outline: `2px dashed ${palette.accent}`, borderRadius: 10 }
                  : composerWrap
              }
              onDragOver={onComposerDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onComposerDrop}
            >
              {canPost ? (
                <>
                  {talk.view.typing.length > 0 ? (
                    <div style={{ ...smallText, fontSize: 14, padding: "0 4px 2px" }}>
                      {typingLabel(talk.view.typing)}
                    </div>
                  ) : null}
                  {/* 输入整体外框：输入框在上，操作条（分享 / 表情 / 附件 + 发送）在下 */}
                  <div style={composerBox}>
                    <div
                      style={{
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {replyingPreview ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: palette.inputBg,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 8,
                            padding: "2px 4px 2px 8px",
                          }}
                        >
                          <span style={{ color: palette.accent, display: "inline-flex" }}>
                            <ReplyGlyph />
                          </span>
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14,
                              color: palette.muted,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            正在回复{" "}
                            <span style={{ fontWeight: 600, color: palette.text }}>
                              @{replyingPreview.author}
                            </span>
                            {replyingPreview.content ? (
                              <span>：{replyingPreview.content}</span>
                            ) : null}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<IconCloseOutline16 />}
                            onClick={() => {
                              cancelReply();
                              composerRef.current?.focus();
                            }}
                            aria-label="取消回复"
                          />
                        </div>
                      ) : null}
                      {pendingFiles.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {pendingFiles.map((f, i) => (
                            <span
                              key={`${f.name}-${f.size}-${f.lastModified}-${f.type}`}
                              style={pendingChip}
                            >
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {f.name}
                              </span>
                              <span style={{ ...smallText, fontSize: 14, flex: "0 0 auto" }}>
                                {formatBytes(f.size)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<IconCloseOutline16 />}
                                onClick={() => removePending(i)}
                                aria-label={`移除 ${f.name}`}
                              />
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {mentionActive ? (
                        <div
                          style={{
                            background: palette.elevated,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 10,
                            padding: 4,
                            maxHeight: 220,
                            overflowY: "auto",
                            boxShadow: shadow.menu,
                          }}
                        >
                          {talk.view.membersLoading ? (
                            <div
                              style={{
                                fontSize: 14,
                                color: palette.muted,
                                padding: "8px 10px",
                                textAlign: "center",
                              }}
                            >
                              加载成员…
                            </div>
                          ) : mentionCandidates.length === 0 ? (
                            <div
                              style={{
                                fontSize: 14,
                                color: palette.muted,
                                padding: "8px 10px",
                                textAlign: "center",
                              }}
                            >
                              {mentionQuery.length > 0
                                ? `没有匹配「${mentionQuery}」的成员`
                                : "还没有成员"}
                            </div>
                          ) : (
                            mentionCandidates.map((member, i) => (
                              <button
                                key={member.userId}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => acceptMention(member)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  border: "none",
                                  background: i === mentionIndex ? palette.hover : "transparent",
                                  borderRadius: 8,
                                  padding: "5px 8px",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <Avatar label={member.handle} src={member.avatarUrl} size={18} />
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: palette.text,
                                    flex: "0 0 auto",
                                  }}
                                >
                                  {member.displayName ?? member.handle}
                                </span>
                                <span style={{ fontSize: 14, color: palette.muted }}>
                                  @{member.handle}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                      <textarea
                        ref={composerRef}
                        value={composerText}
                        onChange={(e) => handleComposerChange(e.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        onPaste={onComposerPaste}
                        placeholder={
                          isThread && currentThread
                            ? `在「${currentThread.name}」里发消息…`
                            : `在 #${channel?.name ?? ""} 发消息…`
                        }
                        style={textArea}
                      />
                    </div>
                    {/* 操作条：分享 / 表情 / 附件在左，发送在右 */}
                    <div style={composerToolbar}>
                      {!isThread ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconShareOutline16 />}
                          onClick={() => setShareOpen(true)}
                          disabled={talk.view.sending}
                          aria-label="分享"
                          title="把本机 DSH 会话分享到社区"
                        />
                      ) : null}
                      <EmojiPopover
                        open={emojiOpen}
                        size="sm"
                        onOpenChange={(next) => {
                          setEmojiOpen(next);
                          // 表情面板与 @ 补全弹层都贴在输入框上方，同时展开会互相遮挡
                          if (next) setMentionActive(false);
                        }}
                        onPick={insertEmoji}
                        disabled={talk.view.sending}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconPaperclipOutline16 />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={talk.view.sending}
                        aria-label="添加附件"
                        title="添加附件"
                      />
                      <div style={composerToolbarGap} />
                      <Button
                        variant="primary"
                        size="sm"
                        icon={talk.view.sending ? <Spinner size={14} /> : <IconSendOutline16 />}
                        disabled={
                          talk.view.sending ||
                          (composerText.trim().length === 0 && pendingFiles.length === 0)
                        }
                        onClick={() => void submit()}
                        aria-label={talk.view.sending ? "发送中" : "发送"}
                        title={talk.view.sending ? "发送中…" : "发送"}
                      />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => pickFiles(e)}
                      style={{ display: "none" }}
                      aria-hidden
                      tabIndex={-1}
                    />
                  </div>
                </>
              ) : (
                <span
                  style={{
                    ...smallText,
                    fontSize: 14,
                    width: "100%",
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  公告频道默认全员只读，仅所有者或被单独授权的角色/成员可发布。
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {membersOpen ? (
        <MemberPanel onMention={insertMentionHandle} onClose={() => setMembersOpen(false)} />
      ) : null}
      <ShareSnapshotModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        channelId={channelId ?? ""}
        communityId={community?.id ?? null}
      />
      {isThread && currentThread ? (
        <>
          <ThreadMembersModal
            open={threadMembersOpen}
            onClose={() => setThreadMembersOpen(false)}
            thread={currentThread}
          />
          <ThreadSettingsModal
            open={threadSettingsOpen}
            onClose={() => setThreadSettingsOpen(false)}
            thread={currentThread}
          />
        </>
      ) : null}
      <SearchMessagesModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <PinnedMessagesModal open={pinnedOpen} onClose={() => setPinnedOpen(false)} />
    </>
  );
}
