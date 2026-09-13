// ================================================================
// DSH 会话分享：选择本机会话分享到频道、消息内嵌卡片、分享详情（下载 / 克隆）。
// ================================================================

import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { GetShareResponse } from "@dsh-talk/types/api";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  cloneShareToSession,
  getCurrentDshSession,
  getShareInfo,
  listShareableSessions,
  type MessageItem,
  notify,
  type ShareSessionNode,
  type ShareSessionTree,
  sendMessage,
  shareDownloadUrl,
  shareLocalSession,
} from "../store";
import { formatBytes } from "./homeStyles";
import { palette, pillStyle, smallText, timeLabel } from "./styles";
import { TalkModal as Modal } from "./TalkModal";

/** 会话行尾状态提示：交互阻断 > 运行中 > 已完成（对齐宿主左侧会话栏口径） */
function sessionHint(row: ShareSessionNode): string {
  if (row.pendingInteraction) return "待处理";
  if (row.running) {
    return row.runningSubagentCount > 0 ? `${row.runningSubagentCount} 个子代理` : "运行中";
  }
  return row.completed ? "已完成" : "";
}

/** 会话树里按 id 取展示名：选中会话时用它默认填充分享标题 */
function sessionTitleOf(tree: ShareSessionTree, sessionId: string): string {
  for (const group of tree.groups) {
    for (const row of group.sessions) if (row.id === sessionId) return row.title;
  }
  return "";
}

/** 分享 DSH 会话弹窗：选一个本机会话，打包上传并发送卡片到当前频道 */
export function ShareSnapshotModal({
  open,
  onClose,
  channelId,
  communityId,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  communityId: string | null;
}): ReactElement {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  // DSH 会话分享：整棵会话树（工作区 → 会话，与宿主左侧会话栏同源）+ 选中的会话
  const [tree, setTree] = useState<ShareSessionTree>({ groups: [], current: null });
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    if (!open) return;
    void listShareableSessions().then((res) => {
      setTree(res);
      const initial =
        getCurrentDshSession() ?? res.current ?? res.groups[0]?.sessions[0]?.id ?? "";
      setSessionId(initial);
      // 分享标题默认取所选会话的展示名，用户仍可改写
      setTitle(sessionTitleOf(res, initial));
    });
  }, [open]);

  /** 选会话：标题同步换成该会话的名字（之后用户自己写的以用户为准） */
  function selectSession(row: ShareSessionNode): void {
    setSessionId(row.id);
    setTitle(row.title);
  }

  /** DSH 会话：host 打包上传后登记分享，并把卡片发到当前频道 */
  async function submitSession(): Promise<void> {
    if (busy || sessionId.length === 0) return;
    setBusy(true);
    const shareId = await shareLocalSession({ sessionId, title, summary, communityId });
    if (shareId && channelId.length > 0) {
      const sent = await sendMessage("", [], shareId);
      if (!sent) notify("分享已创建，但发送卡片失败");
    }
    setBusy(false);
    if (!shareId) return;
    setTitle("");
    setSummary("");
    onClose();
  }

  const sessionGroups = tree.groups;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="分享 DSH 会话"
      description="把本机一个 DSH 会话打包上传，社区成员可「克隆到会话」还原出同样的会话。"
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || sessionId.length === 0}
            onClick={() => void submitSession()}
          >
            {busy ? "处理中…" : "分享到本频道"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {sessionGroups.length === 0 ? (
              <div style={{ ...smallText, fontSize: 14 }}>没有可分享的本机会话。</div>
            ) : (
              sessionGroups.map((group) => (
                <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    title={group.cwd}
                    style={{
                      fontSize: 14,
                      fontWeight: 650,
                      color: palette.muted,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {group.label}
                  </span>
                  {group.sessions.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => selectSession(row)}
                      title={row.id}
                      style={{
                        ...pillStyle(row.id === sessionId),
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        textAlign: "left",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </span>
                      {sessionHint(row).length > 0 ? (
                        <span style={{ ...smallText, flex: "0 0 auto", fontSize: 12 }}>
                          {sessionHint(row)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="分享标题（默认用会话名，可修改）"
        />
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="一句话摘要（可选）"
        />
      </div>
    </Modal>
  );
}

// ---------------- 消息内嵌分享卡片 ----------------

// 消息内嵌的分享卡片（标题 + 摘要 + 下载）
const shareCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 6,
  padding: "8px 10px",
  maxWidth: 380,
  borderRadius: 10,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
  cursor: "pointer",
  textAlign: "left",
};

const shareCardBadge: CSSProperties = {
  flex: "0 0 auto",
  fontSize: 14,
  fontWeight: 650,
  color: palette.accent,
  background: palette.elevated,
  border: `1px solid ${palette.border}`,
  borderRadius: 6,
  padding: "2px 6px",
  letterSpacing: "0.02em",
};

/** 消息内嵌分享卡片：点击打开详情弹窗（可在弹窗里克隆到本地会话） */
export function ShareCardView({
  card,
}: {
  card: NonNullable<MessageItem["shareCard"]>;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="查看分享详情"
        style={shareCardStyle}
      >
        <span style={shareCardBadge}>DSH 会话</span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.title}
          </span>
          {card.summary ? (
            <span
              style={{
                ...smallText,
                fontSize: 14,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {card.summary}
            </span>
          ) : null}
        </span>
        <span style={{ ...smallText, fontSize: 14, flex: "0 0 auto" }}>查看</span>
      </button>
      <ShareCardModal open={open} onClose={() => setOpen(false)} card={card} />
    </>
  );
}

/** 分享详情弹窗：展示分享信息；可一键克隆到本地会话 */
function ShareCardModal({
  open,
  onClose,
  card,
}: {
  open: boolean;
  onClose: () => void;
  card: NonNullable<MessageItem["shareCard"]>;
}): ReactElement {
  const [detail, setDetail] = useState<GetShareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // 打开时拉一次详情（分享者 / 时间 / 大小 / 会话事件数）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    void getShareInfo(card.shareId).then((res) => {
      if (cancelled) return;
      setDetail(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, card.shareId]);

  async function download(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const url = await shareDownloadUrl(card.shareId);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function clone(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const ok = await cloneShareToSession(card.shareId);
    setBusy(false);
    if (ok) onClose();
  }

  const eventCount =
    typeof detail?.manifest.eventCount === "number" ? detail.manifest.eventCount : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="DSH 会话分享"
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => void download()}>
            下载包体
          </Button>
          <Button variant="primary" disabled={busy || loading} onClick={() => void clone()}>
            {busy ? "处理中…" : "克隆到本地的会话"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={shareCardBadge}>DSH 会话</span>
          <span style={{ fontSize: 14, fontWeight: 650 }}>{card.title}</span>
        </div>
        {card.summary ? <div style={{ ...smallText, fontSize: 14 }}>{card.summary}</div> : null}
        {loading ? (
          <div style={{ ...smallText, fontSize: 14 }}>加载分享信息…</div>
        ) : detail ? (
          <div style={{ ...smallText, fontSize: 14, lineHeight: 1.9 }}>
            <div>分享者：@{detail.author.handle}</div>
            <div>时间：{timeLabel(detail.createdAt)}</div>
            <div>大小：{formatBytes(detail.sizeBytes)}</div>
            {eventCount !== null ? <div>会话事件数：{eventCount}</div> : null}
            <div>下载次数：{detail.downloadCount}</div>
          </div>
        ) : null}
        <div style={{ ...smallText, fontSize: 14 }}>
          克隆会在你的 DSH 里新建一个会话并切过去，不影响原会话。
        </div>
      </div>
    </Modal>
  );
}
