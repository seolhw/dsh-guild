// ================================================================
// 话题（forum）板：选中话题频道时的主面板（帖子式列表 + 归档折叠 + 空态）。
// ================================================================

import {
  Button,
  IconBranchOutline16,
  IconChevronRightOutline14,
  IconPlusOutline16,
  IconRefreshOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ThreadSummary } from "@dsh-guild/types/api";
import { Permission } from "@dsh-guild/types/entities";
import { orderBy, partition } from "es-toolkit/array";
import { type CSSProperties, type ReactElement, useState } from "react";
import { channelPermissions, openThread, reloadCommunityDetail, useGuildState } from "../store";
import { emptyMsg, privacyBadge } from "./homeStyles";
import { palette, smallText, Spinner, timeLabel } from "./styles";
import { ThreadJoinModal } from "./ThreadModals";

/** 单个话题行（帖子式：标题 + 发起人/活跃时间/回复数），点击进入话题内聊天 */
function ForumTopicRow({
  thread,
  channelId,
  archivedView,
}: {
  thread: ThreadSummary;
  channelId: string;
  archivedView: boolean;
}): ReactElement {
  const [joinOpen, setJoinOpen] = useState(false);
  const unread = thread.unreadCount;
  const mention = thread.unreadMentions;
  const author = thread.creatorDisplayName ?? thread.creatorHandle;
  const replies = thread.messageCount;
  const isPrivate = thread.visibility === "private";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (thread.locked) setJoinOpen(true);
          else void openThread({ id: thread.id, channelId });
        }}
        title={thread.name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          border: "none",
          borderBottom: `1px solid ${palette.border}`,
          background: "transparent",
          padding: "9px 4px",
          color: palette.text,
          cursor: "pointer",
          textAlign: "left",
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = palette.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: palette.inputBg,
            border: `1px solid ${palette.border}`,
            color: archivedView ? palette.muted : palette.accent,
            flex: "0 0 auto",
          }}
        >
          <IconBranchOutline16 />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              fontSize: 14,
              fontWeight: 650,
              color: archivedView ? palette.muted : palette.text,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {thread.name}
            </span>
            {isPrivate ? (
              <span style={privacyBadge}>{thread.locked ? "🔒 私密" : "私密"}</span>
            ) : null}
            {archivedView ? (
              <span
                style={{
                  flex: "0 0 auto",
                  fontSize: 14,
                  fontWeight: 600,
                  color: palette.muted,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 999,
                  padding: "0 6px",
                  lineHeight: "18px",
                }}
              >
                已归档
              </span>
            ) : null}
          </span>
          <span style={{ ...smallText, fontSize: 14 }}>
            {author} 发起
            {thread.starterSnippet ? (
              <>
                {" · "}
                <span style={{ color: palette.muted }}>{thread.starterSnippet}</span>
              </>
            ) : null}
            {" · "}
            {replies} 条回复 · {timeLabel(thread.lastActivityAt)}
          </span>
        </span>
        {unread > 0 ? (
          <span
            style={{
              flex: "0 0 auto",
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: "18px",
              textAlign: "center",
              color: palette.onColor,
              background: mention > 0 ? palette.accent : palette.badge,
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <ThreadJoinModal open={joinOpen} onClose={() => setJoinOpen(false)} thread={thread} />
    </>
  );
}

/** 话题频道主面板：活跃话题列表 + 已归档折叠 + 空状态引导；点行进入话题详情交流 */
export function ForumTopicBoard({
  channelId,
  onNewTopic,
}: {
  channelId: string;
  onNewTopic: () => void;
}): ReactElement | null {
  const guild = useGuildState();
  const [archivedOpen, setArchivedOpen] = useState(false);
  // 刷新话题列表请求进行中
  const [refreshing, setRefreshing] = useState(false);
  const channel = guild.view.community?.channels.find((c) => c.id === channelId) ?? null;

  /** 重新拉取社区详情（含最新话题回复与未读） */
  async function refreshTopics(): Promise<void> {
    if (refreshing) return;
    setRefreshing(true);
    await reloadCommunityDetail();
    setRefreshing(false);
  }
  if (channel?.kind !== "forum") return null;
  // 建话题 = 在该频道创建讨论组，需 CREATE_THREAD 权限位
  const canPost = (channelPermissions(channelId) & Permission.CREATE_THREAD) !== 0;
  const all = (guild.view.community?.threads ?? []).filter((t) => t.channelId === channelId);
  const [activeRaw, archivedRaw] = partition(all, (t) => t.status === "active");
  const active = orderBy(activeRaw, [(t) => t.lastActivityAt], ["desc"]);
  const archived = orderBy(archivedRaw, [(t) => t.lastActivityAt], ["desc"]);

  if (active.length === 0 && archived.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={emptyMsg}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 14,
              color: palette.accent,
              background: palette.inputBg,
              border: `1px solid ${palette.border}`,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            #
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>这里还没有话题</span>
          <span style={{ fontSize: 14, lineHeight: 1.6 }}>
            话题频道的聊天都放进一条条话题里：发一个新话题，
            <br />
            大家点进去围绕它交流；24 小时无人回复会自动归档。
          </span>
          {canPost ? (
            <Button
              variant="primary"
              size="sm"
              icon={<IconBranchOutline16 />}
              onClick={onNewTopic}
              style={{ marginTop: 4 }}
            >
              创建第一个话题
            </Button>
          ) : null}
          {!canPost ? <span style={{ fontSize: 14 }}>你没有在此频道发布话题的权限。</span> : null}
        </div>
      </div>
    );
  }

  const metaBar: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "4px 4px 8px",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
      <div style={metaBar}>
        <span style={{ ...smallText, fontSize: 14 }}>
          {active.length + archived.length} 条话题 · 点进话题查看与回复
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Button
            size="sm"
            variant="ghost"
            icon={refreshing ? <Spinner size={14} /> : <IconRefreshOutline16 />}
            disabled={refreshing}
            onClick={() => void refreshTopics()}
            aria-label={refreshing ? "刷新中" : "刷新话题"}
            title="刷新话题列表（含最新回复与未读）"
          />
          {canPost ? (
            <Button size="sm" variant="ghost" icon={<IconPlusOutline16 />} onClick={onNewTopic}>
              新建话题
            </Button>
          ) : null}
        </span>
      </div>
      <div>
        {active.map((t) => (
          <ForumTopicRow key={t.id} thread={t} channelId={channelId} archivedView={false} />
        ))}
      </div>
      {archived.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
              border: "none",
              background: "transparent",
              padding: "4px 2px",
              fontSize: 14,
              fontWeight: 600,
              color: palette.muted,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                color: palette.muted,
                transition: "transform 120ms ease",
                transform: archivedOpen ? "rotate(90deg)" : undefined,
              }}
            >
              <IconChevronRightOutline14 />
            </span>
            已归档话题（{archived.length}）
          </button>
          {archivedOpen ? (
            <div>
              {archived.map((t) => (
                <ForumTopicRow key={t.id} thread={t} channelId={channelId} archivedView={true} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
