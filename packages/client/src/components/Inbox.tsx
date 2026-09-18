// ================================================================
// 站内信收件箱：邀请类事件 + 接受/拒绝操作（v1 只承载社区邀请）
// 打开/关闭由 store.inboxOpen 控制（社区栏铃铛触发 openInbox()）
// ================================================================

import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InboxItem } from "@dsh-guild/types/api";
import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import {
  acceptInvite,
  askConfirm,
  closeInbox,
  declineInvite,
  markAllNotificationsRead,
  useGuildState,
} from "../store";
import { avatarGap, CommunityAvatar, palette, smallText, Spinner, timeLabel } from "./styles";
import { GuildModal as Modal } from "./GuildModal";

function BellGlyph({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2.4a3.7 3.7 0 0 0-3.7 3.7c0 2 .6 2.9 1 3.5h5.4c.4-.6 1-1.5 1-3.5A3.7 3.7 0 0 0 8 2.4Z" />
      <path d="M6.4 12.2a1.7 1.7 0 0 0 3.2 0" />
    </svg>
  );
}

const rowWrap: CSSProperties = {
  display: "flex",
  gap: avatarGap,
  alignItems: "flex-start",
  padding: "10px 12px",
  borderRadius: 12,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "已接受",
  declined: "已拒绝",
};

function InboxRow({ item }: { item: InboxItem }): ReactElement {
  const guild = useGuildState();
  const invite = item.invite;
  const busy = guild.inboxBusyId !== null && invite?.id === guild.inboxBusyId;
  // 本行正在提交的动作：按钮据此显示对应加载文案
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const communityName = item.data?.communityName ?? "";
  const icon = item.data?.communityIconUrl ?? null;

  return (
    <div style={rowWrap}>
      <CommunityAvatar label={communityName || "邀"} src={icon} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 650,
            color: palette.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: palette.muted,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {item.body}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...smallText, fontSize: 14 }}>{timeLabel(item.createdAt)}</span>
          {!item.isRead ? (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: palette.accent,
                flex: "0 0 auto",
              }}
            />
          ) : null}
        </div>
      </div>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: "0 0 auto",
          paddingTop: 2,
        }}
      >
        {item.kind === "invite" ? (
          invite === null ? (
            <span style={{ ...smallText, fontSize: 14 }}>邀请已失效</span>
          ) : invite.status === "pending" ? (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || pending !== null}
                icon={pending === "accept" ? <Spinner size={14} /> : undefined}
                onClick={() => {
                  setPending("accept");
                  void acceptInvite(invite.id).finally(() => setPending(null));
                }}
              >
                {pending === "accept" ? "加入中…" : "加入"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || pending !== null}
                icon={pending === "decline" ? <Spinner size={14} /> : undefined}
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "拒绝社区邀请",
                    message: "拒绝后这条邀请失效，需要对方重新邀请才能加入。",
                    confirmLabel: "拒绝邀请",
                  });
                  if (!ok) return;
                  setPending("decline");
                  await declineInvite(invite.id);
                  setPending(null);
                }}
              >
                {pending === "decline" ? "拒绝中…" : "拒绝"}
              </Button>
            </>
          ) : (
            <span style={{ fontSize: 14, color: palette.muted }}>
              {STATUS_LABEL[invite.status] ?? invite.status}
            </span>
          )
        ) : null}
      </span>
    </div>
  );
}

export function InboxDialog(): ReactElement | null {
  const guild = useGuildState();
  const unread = guild.inboxUnread;
  const hasInvites = guild.notifications.length > 0;
  const [markingAll, setMarkingAll] = useState(false);

  return (
    <Modal
      open={guild.inboxOpen}
      onClose={() => closeInbox()}
      title="站内信"
      closeLabel="关闭"
      description="社区邀请与重要事件会出现在这里。"
      footer={
        <Button
          variant="ghost"
          size="sm"
          icon={markingAll ? <Spinner size={14} /> : undefined}
          disabled={unread === 0 || markingAll}
          onClick={() => {
            setMarkingAll(true);
            void markAllNotificationsRead().finally(() => setMarkingAll(false));
          }}
        >
          {markingAll ? "处理中…" : "全部已读"}
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560 }}>
        {guild.inboxLoading ? (
          <div style={{ ...smallText, padding: "14px 4px" }}>加载中…</div>
        ) : !hasInvites ? (
          <div
            style={{
              ...smallText,
              padding: "20px 4px",
              textAlign: "center",
            }}
          >
            暂时没有站内信。
            <br />
            当有人邀请你加入社区时，会第一时间出现在这里。
          </div>
        ) : (
          guild.notifications.map((item) => <InboxRow key={item.id} item={item} />)
        )}
      </div>
    </Modal>
  );
}

export { BellGlyph };
