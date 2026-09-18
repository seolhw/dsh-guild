// ================================================================
// 聊天相关弹窗：社区内消息搜索（命中可跳转定位）。
// ================================================================

import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SearchMessageResult } from "@dsh-guild/types/api";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  type MessageSearchFilters,
  notify,
  revealMessage,
  searchCommunityMessages,
  useGuildState,
} from "../store";
import { emptyMsg } from "./homeStyles";
import { palette, smallText, Spinner, timeLabel } from "./styles";
import { GuildModal as Modal } from "./GuildModal";

/** 时间范围筛选：前端换算成 from 时间戳（服务端按含端点区间过滤） */
type TimeRange = "all" | "24h" | "7d" | "30d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "不限时间" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
];

const TIME_RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const filterSelect: CSSProperties = {
  flex: "1 1 0",
  minWidth: 0,
  padding: "5px 6px",
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.inputBg,
  color: palette.text,
  fontSize: 14,
};

/** 高亮命中关键词（不区分大小写） */
function highlightMatch(text: string, keyword: string): ReactNode {
  const kw = keyword.trim().toLowerCase();
  if (kw.length === 0) return text;
  const lower = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(kw, cursor);
    if (at < 0) {
      nodes.push(text.slice(cursor));
      break;
    }
    if (at > cursor) nodes.push(text.slice(cursor, at));
    nodes.push(
      <span
        key={`${at}-${kw}`}
        style={{ background: palette.highlightBg, borderRadius: 3, padding: "0 1px" }}
      >
        {text.slice(at, at + kw.length)}
      </span>,
    );
    cursor = at + kw.length;
  }
  return <>{nodes}</>;
}

/** 消息搜索弹窗：社区内按正文关键词搜索，命中可一键跳到对应频道定位 */
export function SearchMessagesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const guild = useGuildState();
  const [q, setQ] = useState("");
  const [channelId, setChannelId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [range, setRange] = useState<TimeRange>("all");
  const [mentionsMe, setMentionsMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [items, setItems] = useState<SearchMessageResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 正在跳转定位的命中 id：该行显示转圈并禁用点击
  const [openingId, setOpeningId] = useState<string | null>(null);

  // 每次打开重置搜索状态
  useEffect(() => {
    if (open) {
      setQ("");
      setChannelId("");
      setAuthorId("");
      setRange("all");
      setMentionsMe(false);
      setItems([]);
      setNextCursor(null);
      setRan(false);
      setBusy(false);
      setLoadingMore(false);
    }
  }, [open]);

  /** 收集当前筛选条件（空条件不发，交由 server 只按关键词或直接拒绝全空查询） */
  function buildFilters(): MessageSearchFilters {
    const filters: MessageSearchFilters = {};
    if (channelId) filters.channelId = channelId;
    if (authorId) filters.authorId = authorId;
    if (range !== "all") filters.from = Date.now() - TIME_RANGE_MS[range];
    if (mentionsMe) filters.mentionsMe = true;
    return filters;
  }

  async function run(append: boolean): Promise<void> {
    const keyword = q.trim();
    const filters = buildFilters();
    if (keyword.length === 0 && Object.keys(filters).length === 0) return;
    if (append) {
      if (loadingMore || nextCursor === null) return;
      setLoadingMore(true);
    } else {
      if (busy) return;
      setBusy(true);
      setRan(true);
    }
    const cursorArg = append && nextCursor ? nextCursor : undefined;
    const page = await searchCommunityMessages(keyword, cursorArg, filters);
    if (page) {
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    }
    setBusy(false);
    setLoadingMore(false);
  }

  async function openHit(hit: SearchMessageResult): Promise<void> {
    if (openingId !== null) return;
    setOpeningId(hit.id);
    const ok = await revealMessage(hit.channelId, hit.id, hit.thread?.id ?? null);
    setOpeningId(null);
    if (ok) onClose();
    else notify("该消息较旧，未能定位（可去对应频道向上加载更早消息）");
  }

  const keyword = q.trim();
  const channels = guild.view.community?.channels ?? [];
  const members = guild.view.members;
  const hasFilter = channelId !== "" || authorId !== "" || range !== "all" || mentionsMe;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="搜索消息"
      closeLabel="关闭"
      description="按正文关键词搜索本社区消息，可用频道 / 作者 / 时间 / 仅 @我 收窄范围；命中结果可一键跳转定位。"
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 340, minHeight: 160 }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run(false);
              }
            }}
            placeholder="搜索关键词（可留空，仅用筛选）"
          />
          <Button
            variant="primary"
            disabled={busy || (keyword.length === 0 && !hasFilter)}
            onClick={() => void run(false)}
          >
            {busy ? "搜索中…" : "搜索"}
          </Button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            aria-label="按频道筛选"
            style={filterSelect}
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">全部频道</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>
          <select
            aria-label="按作者筛选"
            style={filterSelect}
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
          >
            <option value="">所有人</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.handle}
              </option>
            ))}
          </select>
          <select
            aria-label="按时间范围筛选"
            style={filterSelect}
            value={range}
            onChange={(e) => setRange(e.target.value as TimeRange)}
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={mentionsMe ? "primary" : "ghost"}
            aria-pressed={mentionsMe}
            onClick={() => setMentionsMe((prev) => !prev)}
          >
            仅 @我
          </Button>
        </div>
        {ran && !busy && items.length === 0 ? (
          <div style={{ ...emptyMsg, padding: "26px 8px" }}>
            {keyword.length > 0 ? `没有匹配「${keyword}」的消息` : "没有符合条件的消息"}
          </div>
        ) : !ran && items.length === 0 ? (
          <div style={{ ...emptyMsg, padding: "26px 8px" }}>
            输入关键词或选择筛选条件搜索整个社区，点击结果可跳到对应频道定位。
          </div>
        ) : null}
        {items.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 330,
              overflowY: "auto",
            }}
          >
            {items.map((hit) => (
              <button
                key={hit.id}
                type="button"
                disabled={openingId !== null}
                onClick={() => void openHit(hit)}
                style={{
                  display: "block",
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  borderRadius: 10,
                  padding: "7px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = palette.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: palette.muted }}>#</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>
                    {hit.channel.name}
                  </span>
                  <span style={{ ...smallText, fontSize: 14 }}>{timeLabel(hit.createdAt)}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 14,
                      color: palette.muted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {hit.author.displayName ?? hit.author.handle}
                  </span>
                  {openingId === hit.id ? (
                    <span
                      style={{
                        display: "inline-flex",
                        flex: "0 0 auto",
                        color: palette.muted,
                      }}
                    >
                      <Spinner size={14} />
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: palette.muted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {highlightMatch(
                    hit.content.length > 180 ? `${hit.content.slice(0, 180)}…` : hit.content,
                    keyword,
                  )}
                </div>
              </button>
            ))}
            {nextCursor ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void run(true)}
                disabled={loadingMore}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
