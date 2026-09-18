// ================================================================
// 讨论组（thread）相关弹窗：创建 / 输入密码进入 / 设置 / 私密成员管理。
// ================================================================

import { Button, IconPlusOutline16, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ThreadMemberItem, ThreadSummary, UpdateThreadRequest } from "@dsh-guild/types/api";
import type { ThreadVisibility, User } from "@dsh-guild/types/entities";
import { type ReactElement, useEffect, useState } from "react";
import {
  addThreadMember,
  askConfirm,
  canManageThreads,
  closeThread,
  createThreadInChannel,
  joinThreadWithPasscode,
  listThreadCandidates,
  listThreadMembers,
  removeThreadMember,
  updateThread,
  useGuildState,
} from "../store";
import {
  Avatar,
  fieldBlock,
  fieldLabel,
  listCard,
  listCardName,
  LoadingHint,
  palette,
  pillGroup,
  pillStyle,
  smallText,
  Spinner,
} from "./styles";
import { GuildModal as Modal } from "./GuildModal";

/** 创建讨论组 / 话题：按来源预填标题，可设为公开或私密（可带进入密码） */
export function ThreadCreateModal({
  open,
  onClose,
  channelId,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string | null;
  seed: { name: string; starterMessageId?: string } | null;
}): ReactElement | null {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<ThreadVisibility>("public");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const guild = useGuildState();

  // 每次打开按来源预填标题，并重置可见性
  useEffect(() => {
    if (open) {
      setName(seed?.name ?? "");
      setVisibility("public");
      setPasscode("");
    }
  }, [open, seed]);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!channelId || trimmed.length === 0 || busy) return;
    setBusy(true);
    const input: {
      name: string;
      starterMessageId?: string;
      visibility?: ThreadVisibility;
      passcode?: string | null;
    } = { name: trimmed, visibility };
    if (seed?.starterMessageId) input.starterMessageId = seed.starterMessageId;
    if (visibility === "private") {
      input.passcode = passcode.trim().length > 0 ? passcode.trim() : null;
    }
    const ok = await createThreadInChannel(channelId, input);
    setBusy(false);
    if (ok) onClose();
  }

  const starterNote = seed?.starterMessageId
    ? "以这条消息为起点：讨论组会单独成串，原消息保留在主频道。"
    : null;
  const threadable = channelId
    ? (guild.view.community?.channels.find((c) => c.id === channelId)?.kind ?? "text")
    : "text";
  const forumMode = threadable === "forum";
  if (!open || !channelId || threadable === "announcement") return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={forumMode ? "创建话题" : "创建讨论组"}
      closeLabel="关闭"
      description={
        forumMode
          ? "发一条新话题，它会列在本频道的话题列表里；大家点进去围绕它交流，24 小时无人回复会自动归档。"
          : "为某个话题开一个独立、集中的小空间，发言后它列在频道下的「讨论」里。"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? "创建中…" : forumMode ? "创建话题" : "创建讨论组"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={fieldBlock}>
          <label htmlFor="guild-thread-name" style={fieldLabel}>
            {forumMode ? "话题标题" : "讨论组名称"}
          </label>
          <Input
            id="guild-thread-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={forumMode ? "例如：如何快速导出聊天记录？" : "例如：周末活动安排"}
          />
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>可见性</span>
          <div style={pillGroup}>
            <button
              type="button"
              style={pillStyle(visibility === "public")}
              onClick={() => setVisibility("public")}
            >
              公开
            </button>
            <button
              type="button"
              style={pillStyle(visibility === "private")}
              onClick={() => setVisibility("private")}
            >
              私密
            </button>
          </div>
          <span style={{ ...smallText, fontSize: 14, lineHeight: 1.6 }}>
            {visibility === "public"
              ? "社区成员自由进出。"
              : passcode.trim().length > 0
                ? "非成员可见但需凭密码进入；社区所有者/管理员可直接查看。"
                : "仅邀请可加入：非成员看到锁标识，需由组内成员把你拉入。"}
          </span>
        </div>
        {visibility === "private" ? (
          <div style={fieldBlock}>
            <label htmlFor="guild-thread-passcode" style={fieldLabel}>
              进入密码（可选）
            </label>
            <Input
              id="guild-thread-passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="留空表示仅邀请加入"
            />
            <span style={{ ...smallText, fontSize: 14 }}>
              留空 = 只能由组内成员拉入；填写后，社区成员可凭该密码自行进入。
            </span>
          </div>
        ) : null}
        {starterNote ? (
          <div style={{ ...smallText, fontSize: 14, lineHeight: 1.6 }}>{starterNote}</div>
        ) : null}
        <div style={{ ...smallText, fontSize: 14, lineHeight: 1.6 }}>
          24
          小时内没人发言会自动归档（从频道列表收起，可在「已归档」里恢复）；再有人发言会自动回到活跃区。
        </div>
      </div>
    </Modal>
  );
}

/** 锁态私密讨论组：有密码 → 输入进入；无密码 → 仅提示需被邀请 */
export function ThreadJoinModal({
  open,
  onClose,
  thread,
}: {
  open: boolean;
  onClose: () => void;
  thread: ThreadSummary;
}): ReactElement {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPasscode("");
  }, [open]);

  async function submit(): Promise<void> {
    if (busy || passcode.trim().length === 0) return;
    setBusy(true);
    const ok = await joinThreadWithPasscode(thread.id, passcode);
    setBusy(false);
    if (ok) onClose();
  }

  const needsPasscode = thread.hasPasscode;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={needsPasscode ? "输入密码进入" : "私密讨论组"}
      closeLabel="关闭"
      description={
        needsPasscode
          ? `「${thread.name}」是私密讨论组，请输入进入密码。`
          : `「${thread.name}」是仅邀请可加入的私密讨论组，请联系组内成员把你拉入。`
      }
      footer={
        needsPasscode ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={busy || passcode.trim().length === 0}
              onClick={() => void submit()}
            >
              {busy ? "进入中…" : "进入"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            知道了
          </Button>
        )
      }
    >
      {needsPasscode ? (
        <div style={fieldBlock}>
          <label htmlFor="guild-thread-join-passcode" style={fieldLabel}>
            进入密码
          </label>
          <Input
            id="guild-thread-join-passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="请输入密码"
          />
        </div>
      ) : null}
    </Modal>
  );
}

/** 讨论组设置：改名、公开↔私密、设置/清除进入密码（发起人或 owner/admin） */
export function ThreadSettingsModal({
  open,
  onClose,
  thread,
}: {
  open: boolean;
  onClose: () => void;
  thread: ThreadSummary;
}): ReactElement {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<ThreadVisibility>("public");
  const [passcode, setPasscode] = useState("");
  const [clearPasscode, setClearPasscode] = useState(false);
  const [busy, setBusy] = useState(false);

  // 每次打开按当前讨论组重置表单
  useEffect(() => {
    if (!open) return;
    setName(thread.name);
    setVisibility(thread.visibility);
    setPasscode("");
    setClearPasscode(false);
  }, [open, thread.name, thread.visibility]);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (busy || trimmed.length === 0) return;
    setBusy(true);
    const patch: UpdateThreadRequest = { name: trimmed, visibility };
    // 私密组才处理密码：勾了清除 → null；填了新密码 → 设置；否则不动
    if (visibility === "private") {
      if (clearPasscode) patch.passcode = null;
      else if (passcode.trim().length > 0) patch.passcode = passcode.trim();
    }
    const ok = await updateThread(thread.id, patch);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="讨论组设置"
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={fieldBlock}>
          <label htmlFor="guild-thread-settings-name" style={fieldLabel}>
            名称
          </label>
          <Input
            id="guild-thread-settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>可见性</span>
          <div style={pillGroup}>
            <button
              type="button"
              style={pillStyle(visibility === "public")}
              onClick={() => setVisibility("public")}
            >
              公开
            </button>
            <button
              type="button"
              style={pillStyle(visibility === "private")}
              onClick={() => setVisibility("private")}
            >
              私密
            </button>
          </div>
        </div>
        {visibility === "private" ? (
          <div style={fieldBlock}>
            <label htmlFor="guild-thread-settings-passcode" style={fieldLabel}>
              进入密码（可选）
            </label>
            <Input
              id="guild-thread-settings-passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={thread.hasPasscode ? "留空保持原密码" : "留空 = 仅邀请可加入"}
              disabled={clearPasscode}
            />
            {thread.hasPasscode ? (
              <label style={{ ...smallText, display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={clearPasscode}
                  onChange={(e) => setClearPasscode(e.target.checked)}
                />
                清除现有密码（改为仅邀请可加入）
              </label>
            ) : null}
          </div>
        ) : (
          <div style={{ ...smallText, fontSize: 14 }}>
            公开讨论组：社区成员可自由进出；转为公开会一并清除进入密码。
          </div>
        )}
      </div>
    </Modal>
  );
}

/** 私密讨论组成员：查看成员、移出/退出、从社区成员中搜索并拉入 */
export function ThreadMembersModal({
  open,
  onClose,
  thread,
}: {
  open: boolean;
  onClose: () => void;
  thread: ThreadSummary;
}): ReactElement {
  const guild = useGuildState();
  const me = guild.me;
  const [members, setMembers] = useState<ThreadMemberItem[]>([]);
  const [candidates, setCandidates] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // 可拉入候选的加载 / 搜索中状态
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = thread.createdBy === me?.id || canManageThreads();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setQuery("");
    void listThreadMembers(thread.id).then((list) => {
      if (cancelled) return;
      setMembers(list);
      setLoading(false);
    });
    setCandidatesLoading(true);
    void listThreadCandidates(thread.id, "").then((list) => {
      if (cancelled) return;
      setCandidates(list);
      setCandidatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, thread.id]);

  async function searchCandidates(value: string): Promise<void> {
    setQuery(value);
    setCandidatesLoading(true);
    const list = await listThreadCandidates(thread.id, value);
    setCandidates(list);
    setCandidatesLoading(false);
  }

  async function invite(userId: string): Promise<void> {
    if (busyId !== null) return;
    setBusyId(userId);
    const ok = await addThreadMember(thread.id, userId);
    setBusyId(null);
    if (!ok) return;
    const [nextMembers, nextCandidates] = await Promise.all([
      listThreadMembers(thread.id),
      listThreadCandidates(thread.id, query),
    ]);
    setMembers(nextMembers);
    setCandidates(nextCandidates);
  }

  async function remove(userId: string, isSelf: boolean): Promise<void> {
    if (busyId !== null) return;
    const okConfirm = await askConfirm(
      isSelf
        ? {
            title: "退出讨论组",
            message: "退出后将不再收到该讨论组的消息，需要重新加入才能进入。",
            confirmLabel: "退出讨论组",
            danger: true,
          }
        : {
            title: "移出讨论组",
            message: "把该成员移出后，TA 需要重新加入才能再看到讨论组消息。",
            confirmLabel: "移出",
            danger: true,
          },
    );
    if (!okConfirm) return;
    setBusyId(userId);
    const ok = await removeThreadMember(thread.id, userId);
    setBusyId(null);
    if (!ok) return;
    if (isSelf) {
      onClose();
      void closeThread();
      return;
    }
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
    void listThreadCandidates(thread.id, query).then(setCandidates);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="讨论组成员"
      closeLabel="关闭"
      description="私密讨论组：仅成员可进入；可将社区成员直接拉入。"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabel}>成员（{members.length}）</span>
          {loading ? (
            <LoadingHint text="加载成员…" padding="8px 2px" />
          ) : members.length === 0 ? (
            <div style={{ ...smallText, padding: "8px 2px" }}>还没有成员。</div>
          ) : (
            members.map((m) => {
              const isSelf = me !== null && m.userId === me.id;
              const isCreator = m.userId === thread.createdBy;
              return (
                <div key={m.userId} style={listCard}>
                  <Avatar label={m.user.handle} src={m.user.avatarUrl} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={listCardName}>
                      {m.user.displayName ?? m.user.handle}
                      {isSelf ? (
                        <span style={{ color: palette.muted, fontSize: 14 }}>（我）</span>
                      ) : null}
                    </div>
                    <div style={{ ...smallText, fontSize: 14 }}>
                      @{m.user.handle} · {isCreator ? "发起人" : "成员"}
                    </div>
                  </div>
                  {isSelf && !isCreator ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={busyId === m.userId ? <Spinner size={14} /> : undefined}
                      disabled={busyId !== null}
                      onClick={() => void remove(m.userId, true)}
                    >
                      {busyId === m.userId ? "退出中…" : "退出"}
                    </Button>
                  ) : canManage && !isCreator ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={busyId === m.userId ? <Spinner size={14} /> : undefined}
                      disabled={busyId !== null}
                      onClick={() => void remove(m.userId, false)}
                    >
                      {busyId === m.userId ? "移出中…" : "移出"}
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={fieldLabel}>拉入社区成员</span>
          <Input
            value={query}
            onChange={(e) => void searchCandidates(e.target.value)}
            placeholder="搜索 @用户名 / 昵称"
            aria-label="搜索可拉入的成员"
          />
          {candidatesLoading ? (
            <LoadingHint text="加载可拉入成员…" padding="4px 2px" />
          ) : candidates.length === 0 ? (
            <div style={{ ...smallText, padding: "4px 2px" }}>没有可拉入的成员。</div>
          ) : (
            candidates.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <Avatar label={u.handle} src={u.avatarUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={listCardName}>{u.displayName ?? u.handle}</div>
                  <div style={{ ...smallText, fontSize: 14 }}>@{u.handle}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={busyId === u.id ? <Spinner size={14} /> : <IconPlusOutline16 />}
                  disabled={busyId !== null}
                  onClick={() => void invite(u.id)}
                >
                  {busyId === u.id ? "拉入中…" : "拉入"}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
