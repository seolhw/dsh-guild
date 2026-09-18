// ================================================================
// 中栏频道列表：社区头部（返回/名称/管理）+ 频道行 + 频道下挂的讨论组。
// ================================================================

import {
  IconBranchOutline16,
  IconChevronRightOutline14,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ThreadSummary } from "@dsh-guild/types/api";
import type { Channel } from "@dsh-guild/types/entities";
import { Fragment, type ReactElement, useState } from "react";
import { openThread, selectChannel, useGuildState } from "../store";
import { activeTile, midCol, privacyBadge, railScroll, sectionTitle } from "./homeStyles";
import { ChannelRowMenu, CommunityTools } from "./Manage";
import { palette, Spinner } from "./styles";
import { ThreadJoinModal } from "./ThreadModals";

export function ChannelList({
  onCreateThread,
}: {
  onCreateThread: (channelId: string) => void;
}): ReactElement | null {
  const guild = useGuildState();
  const community = guild.view.community;
  const activeChannel = guild.view.channelId;
  if (!community) return null;
  return (
    <div style={midCol}>
      <div
        style={{
          padding: "10px 12px 6px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 650,
            color: palette.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {community.name}
        </span>
        <CommunityTools />
      </div>
      <div style={{ ...railScroll, flex: 1, padding: "0 8px 8px" }}>
        <div style={sectionTitle}>频道</div>
        {community.channels.map((ch: Channel) => {
          const active = ch.id === activeChannel;
          return (
            <Fragment key={ch.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "0 4px 0 8px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  ...(active ? activeTile : {}),
                  marginBottom: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => void selectChannel(ch.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 2px",
                    border: "none",
                    background: "transparent",
                    color: palette.text,
                    fontWeight: active ? 600 : 450,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "inline-flex", flex: "0 0 auto", color: palette.muted }}>
                    #
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
                    {ch.name}
                  </span>
                  {active && guild.view.messagesLoading ? (
                    <span
                      style={{ display: "inline-flex", flex: "0 0 auto", color: palette.muted }}
                    >
                      <Spinner size={12} />
                    </span>
                  ) : null}
                </button>
                <ChannelRowMenu channel={ch} onCreateThread={onCreateThread} />
              </div>
              <ChannelThreadsOf channelId={ch.id} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- 讨论组（thread）列表：挂在频道下 ----------------

/** 单个讨论组的列表行（含未读角标与私密标识），点击进入该讨论 */
function ThreadListRow({ thread, channelId }: { thread: ThreadSummary; channelId: string }) {
  const guild = useGuildState();
  const [joinOpen, setJoinOpen] = useState(false);
  const opened = guild.view.threadId === thread.id;
  const unread = thread.unreadCount;
  const mention = thread.unreadMentions;
  const isPrivate = thread.visibility === "private";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (thread.locked) setJoinOpen(true);
          else void openThread({ id: thread.id, channelId });
        }}
        title={thread.starterSnippet ? `起点：${thread.starterSnippet}` : thread.name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          border: "none",
          background: opened ? palette.hover : "transparent",
          borderRadius: 6,
          padding: "4px 6px 4px 8px",
          color: palette.text,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            color: opened ? palette.accent : palette.muted,
            display: "inline-flex",
            flex: "0 0 auto",
          }}
        >
          <IconBranchOutline16 />
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            color: thread.status === "archived" ? palette.muted : palette.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {thread.name}
        </span>
        {isPrivate ? <span style={privacyBadge}>{thread.locked ? "🔒 私密" : "私密"}</span> : null}
        {unread > 0 ? (
          <span
            style={{
              flex: "0 0 auto",
              minWidth: 18,
              height: 18,
              padding: "0 4px",
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

/** 频道下方的「讨论」分组：活跃在列，已归档折叠可展开。话题频道不在此嵌套（右侧话题板承担列表）。 */
export function ChannelThreadsOf({ channelId }: { channelId: string }): ReactElement | null {
  const guild = useGuildState();
  const [archivedOpen, setArchivedOpen] = useState(false);
  const kindOf = guild.view.community?.channels.find((c) => c.id === channelId)?.kind;
  if (kindOf === "forum") return null;
  const all = guild.view.community?.threads.filter((t) => t.channelId === channelId) ?? [];
  const active = all.filter((t) => t.status === "active");
  const archived = all.filter((t) => t.status === "archived");
  if (active.length === 0 && archived.length === 0) return null;

  return (
    <div style={{ margin: "1px 0 6px", paddingLeft: 12 }}>
      {active.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {active.map((t) => (
            <ThreadListRow key={t.id} thread={t} channelId={channelId} />
          ))}
        </div>
      ) : null}
      {archived.length > 0 ? (
        <button
          type="button"
          onClick={() => setArchivedOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            width: "100%",
            border: "none",
            background: "transparent",
            padding: "3px 8px",
            fontSize: 14,
            color: palette.muted,
            cursor: "pointer",
            textAlign: "left",
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
          已归档讨论（{archived.length}）
        </button>
      ) : null}
      {archivedOpen && archived.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {archived.map((t) => (
            <ThreadListRow key={t.id} thread={t} channelId={channelId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
