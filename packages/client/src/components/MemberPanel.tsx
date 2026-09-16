// ================================================================
// 聊天区右侧成员面板：社区成员按在线 / 离线分组，行内三点菜单按权限提供
// 提及、设为管理员、分配角色、移除成员、封禁成员、转让所有权；
// 顶部为 @everyone 入口，底部（有 BAN_MEMBERS 时）为已封禁用户与解封。
// 面板位于文档流内（挤占聊天区，不浮在内容之上），进入社区后默认展开，
// 可用聊天区头部的成员图标收起 / 再次展开。
// ================================================================

import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  Button,
  IconCloseOutline16,
  IconEllipsisOutline16,
  IconTrashOutline16,
  Menu,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ChannelOnlineMember, CommunityBanItem } from "@dsh-talk/types/api";
import type { ID } from "@dsh-talk/types/entities";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  adminRole,
  askConfirm,
  banUser,
  canBanMembers,
  canKickMembers,
  canManageRolePosition,
  canManageRoles,
  ensureAdminRole,
  highestPositionOf,
  isOwner,
  kickMember,
  listBannedUsers,
  type MemberLite,
  refreshCommunityMembers,
  setMemberRoles,
  transferOwner,
  unbanUser,
  useTalkState,
} from "../store";
import { memberPanel, memberPanelCss } from "./homeStyles";
import { MemberRolesDialog } from "./Manage";
import { Avatar, LoadingHint, palette, smallText, Spinner, timeLabel } from "./styles";

/** 在线态文案与颜色（在线 / 离开均计入「在线」分组） */
const PRESENCE_LABEL: Record<ChannelOnlineMember["presence"], string> = {
  online: "在线",
  away: "离开",
  offline: "离线",
};

const PRESENCE_COLOR: Record<ChannelOnlineMember["presence"], string> = {
  online: palette.success,
  away: palette.warn,
  offline: palette.muted,
};

// ---------- 面板样式 ----------

const panelHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 10px 10px 14px",
  borderBottom: `1px solid ${palette.border}`,
  flex: "0 0 auto",
};

const panelBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "2px 6px 12px",
};

/** 分组标题：在线 — 1 / 离线 — 0 / 已封禁用户 — 2 */
const groupTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 650,
  color: palette.muted,
  letterSpacing: "0.06em",
  padding: "10px 8px 4px",
};

const memberRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 6px 5px 8px",
  borderRadius: 8,
};

const nameRow: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: palette.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** @everyone 条目的圆形标记（图标库无 @ 字形，用文本代替） */
const everyoneBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  flex: "0 0 auto",
  borderRadius: "50%",
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
  color: palette.muted,
  fontSize: 14,
  fontWeight: 700,
};

const atGlyph = <span style={{ fontSize: 14, fontWeight: 700 }}>@</span>;

// ---------- 成员行 ----------

function PanelRow({
  member,
  status,
  items,
  busy,
  onSelect,
}: {
  member: MemberLite;
  status: ChannelOnlineMember["presence"];
  items: MenuEntry[];
  /** 该成员有请求进行中：菜单入口换成转圈并禁用 */
  busy?: boolean;
  onSelect: (id: string) => void;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="dsht-member-row" style={memberRow}>
      <Avatar label={member.handle} src={member.avatarUrl} size={24} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameRow}>
          {member.displayName ?? member.handle}
          <span style={{ fontSize: 14, color: PRESENCE_COLOR[status] }}>
            （{PRESENCE_LABEL[status]}）
          </span>
        </div>
        <div style={{ ...smallText, fontSize: 14 }}>@{member.handle}</div>
      </div>
      {busy ? (
        <span style={{ display: "inline-flex", padding: "0 8px", color: palette.muted }}>
          <Spinner size={14} />
        </span>
      ) : items.length > 0 ? (
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSelect={(id) => {
            setMenuOpen(false);
            onSelect(id);
          }}
          anchor={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconEllipsisOutline16 />}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`${member.handle} 的操作`}
            />
          }
          items={items}
          align="end"
          portal
        />
      ) : null}
    </div>
  );
}

// ---------- 面板主体 ----------

export function MemberPanel({
  onMention,
  onClose,
}: {
  /** 把 @handle 插入聊天输入框（由 ChatPane 提供） */
  onMention: (handle: string) => void;
  onClose: () => void;
}): ReactElement {
  const talk = useTalkState();
  const me = talk.me;
  const community = talk.view.community;
  const communityId = talk.view.communityId;
  const roles = community?.roles ?? [];
  const owner = isOwner();
  const canRoles = canManageRoles();
  const canKick = canKickMembers();
  const canBan = canBanMembers();
  const [bans, setBans] = useState<CommunityBanItem[]>([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [assigning, setAssigning] = useState<MemberLite | null>(null);
  // 正在处理的成员 / 封禁用户 id：对应行显示转圈并禁用操作
  const [busyUserId, setBusyUserId] = useState<ID | null>(null);
  const [everyoneMenuOpen, setEveryoneMenuOpen] = useState(false);
  // 「设为管理员」快捷入口：分配预置的「管理员」角色（被改名/删除则先按预置规格新建）。
  // 已持有该角色的成员不再显示；目标角色层级必须严格低于自己。
  const quickTarget = adminRole();
  const canQuickAdmin =
    canRoles && (quickTarget === null || canManageRolePosition(quickTarget.position));

  // 已封禁用户：无 BAN_MEMBERS 时不请求（否则整批请求会 403）
  useEffect(() => {
    if (!canBan) return;
    let cancelled = false;
    setBansLoading(true);
    void listBannedUsers().then((list) => {
      if (cancelled) return;
      setBans(list);
      setBansLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canBan]);

  const presenceOf = new Map<ID, ChannelOnlineMember["presence"]>(
    talk.view.communityOnlineMembers.map((m) => [m.userId, m.presence]),
  );
  /** 在线 = 快照里 presence 非 offline（离开也算在线，只是状态不同） */
  const isActive = (userId: ID): boolean => {
    const presence = presenceOf.get(userId);
    return presence === "online" || presence === "away";
  };
  const presenceStatus = (userId: ID): ChannelOnlineMember["presence"] =>
    presenceOf.get(userId) ?? "offline";
  const byHandle = (a: MemberLite, b: MemberLite): number => a.handle.localeCompare(b.handle);
  const online = talk.view.members.filter((m) => isActive(m.userId)).sort(byHandle);
  const offline = talk.view.members.filter((m) => !isActive(m.userId)).sort(byHandle);

  /** 写操作后重拉成员缓存（面板与 @ 补全共用 view.members） */
  async function reload(): Promise<void> {
    if (communityId) await refreshCommunityMembers(communityId);
  }

  /** 一键把成员设为管理员：分配预置的「管理员」角色（被改名/删除则先新建） */
  async function makeAdmin(m: MemberLite): Promise<void> {
    if (busyUserId !== null) return;
    setBusyUserId(m.userId);
    const roleId = await ensureAdminRole();
    if (roleId !== null) {
      const next = m.roleIds.includes(roleId) ? m.roleIds : [...m.roleIds, roleId];
      if (await setMemberRoles(m.userId, next)) await reload();
    }
    setBusyUserId(null);
  }

  async function kick(m: MemberLite): Promise<void> {
    const ok = await askConfirm({
      title: `移除 @${m.handle}`,
      message: "把 TA 移出社区。之后 TA 仍可通过邀请码或邀请重新加入。",
      confirmLabel: "移除成员",
      danger: true,
    });
    if (!ok || busyUserId !== null) return;
    setBusyUserId(m.userId);
    if (await kickMember(m.userId)) await reload();
    setBusyUserId(null);
  }

  async function ban(m: MemberLite): Promise<void> {
    const ok = await askConfirm({
      title: `封禁 @${m.handle}`,
      message: "封禁会同时将其移出社区，且之后无法通过邀请码/邀请再加入（可在下方解封）。",
      confirmLabel: "封禁成员",
      danger: true,
    });
    if (!ok || busyUserId !== null) return;
    setBusyUserId(m.userId);
    if (await banUser(m.userId)) {
      await reload();
      setBans(await listBannedUsers());
    }
    setBusyUserId(null);
  }

  async function transfer(m: MemberLite): Promise<void> {
    const ok = await askConfirm({
      title: `转让社区所有权给 @${m.handle}`,
      message: "转让后你将失去所有者权限，且只有新所有者能再转让回来。",
      confirmLabel: "确认转让",
      danger: true,
    });
    if (!ok || busyUserId !== null) return;
    setBusyUserId(m.userId);
    await transferOwner(m.userId);
    setBusyUserId(null);
  }

  async function unban(item: CommunityBanItem): Promise<void> {
    const ok = await askConfirm({
      title: `解封 @${item.user.handle}`,
      message: "解封后 TA 可以重新加入社区，原有的成员身份不会自动恢复。",
      confirmLabel: "解除封禁",
    });
    if (!ok || busyUserId !== null) return;
    setBusyUserId(item.userId);
    if (await unbanUser(item.userId)) {
      setBans((prev) => prev.filter((b) => b.userId !== item.userId));
    }
    setBusyUserId(null);
  }

  /** 成员的三点菜单：按「提及 + 可管理层级 + 各自权限位」逐项判定 */
  function rowItems(m: MemberLite): MenuEntry[] {
    const self = me !== null && m.userId === me.id;
    const targetIsOwner = m.userId === community?.ownerId;
    // 层级：只能管理层级严格低于自己、且非自己 / owner 的成员
    const manageable =
      !self && !targetIsOwner && canManageRolePosition(highestPositionOf(m.roleIds));
    const items: MenuEntry[] = [];
    if (!self) items.push({ id: "mention", label: "提及", icon: atGlyph });
    if (manageable) {
      if (canQuickAdmin && (quickTarget === null || !m.roleIds.includes(quickTarget.id))) {
        items.push({ id: "admin", label: "设为管理员" });
      }
      if (canRoles) items.push({ id: "roles", label: "分配角色" });
      if (canKick) {
        items.push({ id: "kick", label: "移除成员", danger: true, icon: <IconTrashOutline16 /> });
      }
      if (canBan) items.push({ id: "ban", label: "封禁成员", danger: true });
    }
    if (owner && !self && !targetIsOwner) items.push({ id: "transfer", label: "转让所有权" });
    return items;
  }

  function onRowAction(id: string, m: MemberLite): void {
    if (id === "mention") {
      onMention(m.handle);
      return;
    }
    if (id === "admin") void makeAdmin(m);
    if (id === "roles") setAssigning(m);
    if (id === "kick") void kick(m);
    if (id === "ban") void ban(m);
    if (id === "transfer") void transfer(m);
  }

  return (
    <aside className="dsht-member-panel" style={memberPanel} aria-label="社区成员">
      <style>{memberPanelCss}</style>
      <div style={panelHeader}>
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>成员</span>
        <span style={{ ...smallText, fontSize: 14 }}>共 {community?.memberCount ?? 0} 名</span>
        <Button
          size="sm"
          variant="ghost"
          icon={<IconCloseOutline16 />}
          onClick={onClose}
          aria-label="收起成员列表"
        />
      </div>
      <div style={panelBody}>
        {/* @everyone：作用于全体成员，只提供提及等整体操作 */}
        <div className="dsht-member-row" style={{ ...memberRow, marginTop: 6 }}>
          <span style={everyoneBadge}>@</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={nameRow}>@everyone</div>
            <div style={{ ...smallText, fontSize: 14 }}>社区全体成员</div>
          </div>
          <Menu
            open={everyoneMenuOpen}
            onClose={() => setEveryoneMenuOpen(false)}
            onSelect={(id) => {
              setEveryoneMenuOpen(false);
              if (id === "mention") onMention("everyone");
            }}
            anchor={
              <Button
                size="sm"
                variant="ghost"
                icon={<IconEllipsisOutline16 />}
                onClick={() => setEveryoneMenuOpen((v) => !v)}
                aria-label="@everyone 的操作"
              />
            }
            items={[{ id: "mention", label: "提及 @everyone", icon: atGlyph }]}
            align="end"
            portal
          />
        </div>
        {talk.view.membersLoading && talk.view.members.length === 0 ? (
          <LoadingHint text="加载成员…" />
        ) : (
          <>
            <div style={groupTitle}>在线 — {online.length}</div>
            {online.length === 0 ? (
              <div style={{ ...smallText, fontSize: 14, padding: "4px 10px" }}>暂无成员在线</div>
            ) : (
              online.map((m) => (
                <PanelRow
                  key={m.userId}
                  member={m}
                  status={presenceStatus(m.userId)}
                  items={rowItems(m)}
                  busy={busyUserId === m.userId}
                  onSelect={(id) => onRowAction(id, m)}
                />
              ))
            )}
            <div style={groupTitle}>离线 — {offline.length}</div>
            {offline.length === 0 ? (
              <div style={{ ...smallText, fontSize: 14, padding: "4px 10px" }}>没有离线成员</div>
            ) : (
              offline.map((m) => (
                <PanelRow
                  key={m.userId}
                  member={m}
                  status={presenceStatus(m.userId)}
                  items={rowItems(m)}
                  busy={busyUserId === m.userId}
                  onSelect={(id) => onRowAction(id, m)}
                />
              ))
            )}
          </>
        )}
        {canBan && (bansLoading || bans.length > 0) ? (
          <>
            <div style={groupTitle}>已封禁用户 — {bans.length}</div>
            {bansLoading ? (
              <LoadingHint text="加载封禁用户…" />
            ) : (
              bans.map((b) => (
                <div key={b.userId} className="dsht-member-row" style={memberRow}>
                  <Avatar label={b.user.handle} src={b.user.avatarUrl} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nameRow}>@{b.user.handle}</div>
                    <div style={{ ...smallText, fontSize: 14 }}>
                      封禁于 {timeLabel(b.createdAt)}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={busyUserId === b.userId ? <Spinner size={14} /> : undefined}
                    disabled={busyUserId !== null}
                    onClick={() => void unban(b)}
                    aria-label={`解封 ${b.user.handle}`}
                  >
                    {busyUserId === b.userId ? "解封中…" : "解封"}
                  </Button>
                </div>
              ))
            )}
          </>
        ) : null}
      </div>
      {assigning ? (
        <MemberRolesDialog
          member={assigning}
          roles={roles}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            void reload();
          }}
        />
      ) : null}
    </aside>
  );
}
