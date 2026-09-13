// ================================================================
// 管理 UI：社区工具（角色管理/新建频道/邀请/设置/退出）、频道创建/编辑/删除、
// 频道权限覆盖（Discord 式：@everyone / 角色 / 成员 的 allow-deny 位）。
// 权限判定统一走 store 的权限位（MANAGE_CHANNEL / MANAGE_ROLES / KICK_MEMBERS …），
// 服务端才是最终裁决（层级、可授予权限等约束由 server 兜底）。
// ================================================================

import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  Button,
  HoverCard,
  IconBranchOutline16,
  IconChevronLeftOutline14,
  IconCopyOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconPlusOutline16,
  IconRightUpOutline16,
  IconTrashOutline16,
  IconUserOutline16,
  Input,
  Menu,
  writeClipboard,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
  CHANNEL_OVERWRITE_PERMISSIONS,
  type Channel,
  type ChannelOverwrite,
  type CommunityRole,
  EVERYONE_TARGET_ID,
  type ID,
  type OverwriteTargetType,
  PERMISSION_INFO,
  Permission,
  type PermissionFlags,
  type User,
} from "@dsh-talk/types/entities";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  askConfirm,
  canInviteMembers,
  canManageCommunity,
  canManageRolePosition,
  canManageRoles,
  channelPermissions,
  createChannel,
  createRole,
  deleteChannelById,
  deleteChannelOverwrite,
  deleteCommunity,
  deleteRole,
  inviteMember,
  isMember,
  isModerator,
  isOwner,
  leaveCommunity,
  listChannelOverwrites,
  listMembers,
  type MemberLite,
  moveChannel,
  myHighestRolePosition,
  myPermissions,
  notify,
  reorderRoles,
  setChannelOverwrite,
  setMemberRoles,
  updateChannelById,
  updateCommunity,
  updateRole,
  uploadImage,
  useTalkState,
} from "../store";
import {
  AvatarPicker,
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
import { TalkModal as Modal } from "./TalkModal";

/** 角色编辑器的权限位（全部位；中文名/说明/作用域来自 types 的 PERMISSION_INFO） */
const PERMISSION_FIELDS = PERMISSION_INFO;

/** 频道覆盖只接受频道级位（社区级位与 ADMINISTRATOR 由 scope 排除） */
const OVERWRITE_FIELDS = CHANNEL_OVERWRITE_PERMISSIONS;

/** 角色展示色（color 为 0xRRGGBB；null = 默认灰） */
const roleColorOf = (role: CommunityRole): string =>
  role.color === null || role.color === 0
    ? palette.muted
    : `#${role.color.toString(16).padStart(6, "0")}`;

/** 角色可选展示色（0xRRGGBB；null = 默认灰） */
const ROLE_COLOR_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: "默认" },
  { value: 0x5865f2, label: "蓝" },
  { value: 0x57f287, label: "绿" },
  { value: 0xfee75c, label: "黄" },
  { value: 0xe67e22, label: "橙" },
  { value: 0xed4245, label: "红" },
  { value: 0xeb459e, label: "粉" },
  { value: 0x9b59b6, label: "紫" },
];

/** 把权限位渲染成简短文本 */
const permissionSummary = (bits: PermissionFlags): string => {
  const names = PERMISSION_FIELDS.filter((f) => (bits & f.bit) !== 0).map((f) => f.label);
  return names.length > 0 ? names.join(" · ") : "无权限";
};

// ---------- 弹窗共享样式 ----------

/** 弹窗说明文字 */
const dialogHint: CSSProperties = {
  fontSize: 14,
  color: palette.muted,
  lineHeight: 1.6,
};

/** hover 说明卡的容器（标记属性供 TalkModal 提升层级，避免被弹窗遮罩盖住） */
const tipWrap: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 176,
  maxWidth: 260,
};

const tipTitle: CSSProperties = { fontSize: 16, fontWeight: 600, color: palette.text };
const tipHint: CSSProperties = { fontSize: 14, lineHeight: 1.5, color: palette.muted };

/** 成员操作按钮的 hover 说明卡：标题 + 行为说明 */
function ActionTip({ title, hint }: { title: string; hint: string }): ReactElement {
  return (
    <div data-dsht-hover-tip style={tipWrap}>
      <span style={tipTitle}>{title}</span>
      <span style={tipHint}>{hint}</span>
    </div>
  );
}

type CommunityDialog = null | "roles" | "create-channel" | "invite-user" | "invite" | "settings";

/** 频道列表顶部的社区管理菜单（角色 / 新建频道 / 邀请 / 设置 / 退出；成员操作在聊天区右侧成员面板） */
export function CommunityTools(): ReactElement | null {
  const talk = useTalkState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<CommunityDialog>(null);
  // 退出社区请求进行中（禁用入口并显示转圈）
  const [leaving, setLeaving] = useState(false);
  const communityId = talk.view.communityId;
  const canRoles = canManageRoles();
  const canChannel = isModerator();
  const canInvite = canInviteMembers();
  const canCommunity = canManageCommunity();
  const member = isMember();
  if (!communityId) return null;

  const menuItems: MenuEntry[] = [];
  if (canRoles) menuItems.push({ id: "roles", label: "角色管理", icon: <IconUserOutline16 /> });
  if (canChannel)
    menuItems.push({ id: "create-channel", label: "新建频道", icon: <IconPlusOutline16 /> });
  if (canInvite)
    menuItems.push({ id: "invite-user", label: "邀请用户", icon: <IconPlusOutline16 /> });
  if (member) menuItems.push({ id: "invite", label: "邀请码", icon: <IconCopyOutline16 /> });
  if (canCommunity)
    menuItems.push({ id: "settings", label: "社区设置", icon: <IconEditOutline16 /> });
  if (menuItems.length > 0) menuItems.push({ type: "separator", id: "sep" });
  menuItems.push({ id: "leave", label: "退出社区", danger: true, icon: <IconRightUpOutline16 /> });

  return (
    <>
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          setMenuOpen(false);
          if (
            id === "roles" ||
            id === "create-channel" ||
            id === "invite-user" ||
            id === "invite" ||
            id === "settings"
          )
            setDialog(id);
          if (id === "leave") {
            void (async () => {
              const ok = await askConfirm({
                title: "退出社区",
                message:
                  "退出后你将不再是该社区成员，需要重新加入才能查看社区内容（社区所有者需先转让所有权）。",
                confirmLabel: "退出社区",
                danger: true,
              });
              if (!ok) return;
              setLeaving(true);
              await leaveCommunity(communityId);
              setLeaving(false);
            })();
          }
        }}
        anchor={
          <Button
            size="sm"
            variant="ghost"
            icon={leaving ? <Spinner size={14} /> : <IconEllipsisOutline16 />}
            disabled={leaving}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={leaving ? "正在退出社区" : "社区管理"}
          />
        }
        items={menuItems}
        portal
      />
      {dialog === "roles" ? <RolesDialog open onClose={() => setDialog(null)} /> : null}
      {dialog === "create-channel" ? <ChannelDialog open onClose={() => setDialog(null)} /> : null}
      {dialog === "invite-user" ? <InviteUserDialog open onClose={() => setDialog(null)} /> : null}
      {dialog === "invite" ? <InviteDialog open onClose={() => setDialog(null)} /> : null}
      {dialog === "settings" ? <SettingsDialog open onClose={() => setDialog(null)} /> : null}
    </>
  );
}

/** 邀请码展示 / 复制（创建社区时生成、固定不变；码对所有成员可见） */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const talk = useTalkState();
  const community = talk.view.community;
  const code = community?.inviteCode ?? "";

  async function copy(): Promise<void> {
    await writeClipboard(code);
    notify("邀请码已复制");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="邀请码"
      closeLabel="关闭"
      description="把邀请码发给对方：对方在「＋ 加入」里输入即可进社区。"
    >
      <div style={fieldBlock}>
        <label htmlFor="talk-invite-code" style={fieldLabel}>
          邀请码
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            id="talk-invite-code"
            readOnly
            value={code}
            aria-label="邀请码"
            style={{ flex: 1 }}
          />
          <Button variant="outline" icon={<IconCopyOutline16 />} onClick={() => void copy()}>
            复制
          </Button>
        </div>
        <span style={dialogHint}>邀请码在创建社区时生成、固定不变，不会过期；</span>
      </div>
    </Modal>
  );
}

/** 邀请已注册用户入社区（owner/admin）：输入 @用户名 或邮箱，对方会收到站内信 + 邮件 */
function InviteUserDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  // 每次打开清空输入
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  async function submit(): Promise<void> {
    if (busy || value.trim().length === 0) return;
    setBusy(true);
    const ok = await inviteMember(value);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="邀请用户加入"
      closeLabel="关闭"
      description="输入对方的 @用户名 或注册邮箱，对方会收到站内信和邮件邀请。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || value.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? "邀请中…" : "发送邀请"}
          </Button>
        </>
      }
    >
      <div style={fieldBlock}>
        <label htmlFor="talk-invite-user" style={fieldLabel}>
          @用户名 或邮箱
        </label>
        <Input
          id="talk-invite-user"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="如 @alice 或 alice@example.com"
        />
        <span style={dialogHint}>仅可邀请已注册的用户；对方接受后即可加入社区。</span>
      </div>
    </Modal>
  );
}

/** 社区设置（owner/admin） */
function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const talk = useTalkState();
  const community = talk.view.community;
  const owner = isOwner();
  const [name, setName] = useState(community?.name ?? "");
  const [description, setDescription] = useState(community?.description ?? "");
  const [privacy, setPrivacy] = useState<"public" | "private">(community?.privacy ?? "public");
  const [iconUrl, setIconUrl] = useState<string | null>(community?.iconUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);

  // 每次打开用当前社区资料预填
  useEffect(() => {
    if (!open) return;
    setName(community?.name ?? "");
    setDescription(community?.description ?? "");
    setPrivacy(community?.privacy ?? "public");
    setIconUrl(community?.iconUrl ?? null);
  }, [open, community?.name, community?.description, community?.privacy, community?.iconUrl]);

  async function pickIcon(file: File): Promise<void> {
    setIconBusy(true);
    const url = await uploadImage(file);
    setIconBusy(false);
    if (url) setIconUrl(url);
  }

  async function save(): Promise<void> {
    if (name.trim().length === 0) return;
    setBusy(true);
    const ok = await updateCommunity({
      name: name.trim(),
      description: description.length > 0 ? description : null,
      privacy,
      iconUrl,
    });
    setBusy(false);
    if (ok) onClose();
  }

  /** 删除社区（仅 owner 可见按钮）；删除后整个社区及其内容不复存在 */
  async function removeCommunity(): Promise<void> {
    if (!community) return;
    const confirmed = await askConfirm({
      title: `删除社区「${community.name}」`,
      message: "社区下所有频道与消息将被永久删除，且无法恢复。",
      confirmLabel: "永久删除",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    const ok = await deleteCommunity(community.id);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="社区设置"
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={fieldBlock}>
          <span style={fieldLabel}>社区头像</span>
          <AvatarPicker
            src={iconUrl}
            label={name.trim() || "社区"}
            size={60}
            onPick={(file) => void pickIcon(file)}
            onRemove={() => setIconUrl(null)}
            uploadLabel="设置头像"
            removeLabel="移除头像"
            busy={busy || iconBusy}
            kind="community"
          />
        </div>
        <div style={fieldBlock}>
          <label htmlFor="talk-community-name" style={fieldLabel}>
            社区名称
          </label>
          <Input
            id="talk-community-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="社区名称"
          />
        </div>
        <div style={fieldBlock}>
          <label htmlFor="talk-community-desc" style={fieldLabel}>
            简介
          </label>
          <Input
            id="talk-community-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话介绍这个社区"
          />
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>可见性</span>
          <div style={pillGroup}>
            <button
              type="button"
              style={pillStyle(privacy === "public")}
              onClick={() => setPrivacy("public")}
            >
              公开
            </button>
            <button
              type="button"
              style={pillStyle(privacy === "private")}
              onClick={() => setPrivacy("private")}
            >
              私有
            </button>
          </div>
        </div>
        {owner ? (
          <div
            style={{
              borderTop: `1px solid ${palette.border}`,
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={dialogHint}>
              危险操作：删除社区「{community?.name}」后，其全部频道与消息将被永久清除。
            </span>
            <Button
              variant="ghost"
              icon={busy ? <Spinner size={14} /> : <IconTrashOutline16 />}
              disabled={busy}
              onClick={() => void removeCommunity()}
              style={{
                color: palette.danger,
                border: `1px solid ${palette.dangerSoft}`,
                alignSelf: "flex-start",
              }}
            >
              删除社区
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** 给成员分配角色（多选；@everyone 隐式作用于全体，不出现在这里）。由右侧成员面板承载。 */
export function MemberRolesDialog({
  member,
  roles,
  onClose,
  onSaved,
}: {
  member: MemberLite;
  roles: CommunityRole[];
  onClose: () => void;
  onSaved: (roleIds: ID[]) => void;
}): ReactElement {
  const [selected, setSelected] = useState<ID[]>(member.roleIds);
  const [busy, setBusy] = useState(false);
  // 只能分配层级严格低于自己的角色（与 server 的层级校验一致）
  const assignable = roles
    .filter((r) => !r.isEveryone && canManageRolePosition(r.position))
    .sort((a, b) => b.position - a.position);

  function toggle(roleId: ID): void {
    setSelected((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  async function save(): Promise<void> {
    setBusy(true);
    const ok = await setMemberRoles(member.userId, selected);
    setBusy(false);
    if (ok) onSaved(selected);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`@${member.handle} 的角色`}
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      {assignable.length === 0 ? (
        <div style={{ ...smallText, padding: "8px 2px" }}>
          还没有自定义角色，请先在「角色管理」里创建。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {assignable.map((r) => {
            const on = selected.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                style={{
                  ...listCard,
                  cursor: "pointer",
                  textAlign: "left",
                  border: `1px solid ${on ? palette.accent : palette.border}`,
                  background: on ? palette.hoverAccent : palette.inputBg,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: roleColorOf(r),
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={listCardName}>{r.name}</div>
                  <div style={{ ...smallText, fontSize: 14 }}>
                    {permissionSummary(r.permissions)}
                  </div>
                </div>
                <span style={{ ...smallText, fontSize: 14 }}>{on ? "已分配" : "未分配"}</span>
              </button>
            );
          })}
        </div>
      )}
      <span style={{ ...dialogHint, display: "block", marginTop: 8 }}>
        @everyone 角色自动作用于全体成员，无需单独分配。
      </span>
    </Modal>
  );
}

// ---------------- 频道：创建 / 编辑 / 删除 ----------------

function ChannelDialog({
  open,
  onClose,
  channel,
}: {
  open: boolean;
  onClose: () => void;
  channel?: Channel;
}): ReactElement {
  const isEdit = channel !== undefined;
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [kind, setKind] = useState<"text" | "announcement" | "forum">(channel?.kind ?? "text");
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    if (name.trim().length === 0) return;
    setBusy(true);
    let ok = false;
    if (isEdit) {
      ok = await updateChannelById(channel.id, {
        name: name.trim(),
        topic: topic.length > 0 ? topic : null,
        kind,
      });
    } else {
      const body: {
        name: string;
        topic?: string;
        kind?: "text" | "announcement" | "forum";
      } = {
        name: name.trim(),
        kind,
      };
      if (topic.length > 0) body.topic = topic;
      ok = await createChannel(body);
    }
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑频道" : "新建频道"}
      closeLabel="关闭"
      description={
        isEdit
          ? "可改名、改主题与类型。删除频道请用频道旁的「…」。"
          : "频道用于承载某一主题的实时消息。"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => void save()}
          >
            {busy ? (isEdit ? "保存中…" : "创建中…") : isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={fieldBlock}>
          <label htmlFor="talk-channel-name" style={fieldLabel}>
            频道名
          </label>
          <Input
            id="talk-channel-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="频道名，如 general / 公告 / 话题"
          />
        </div>
        <div style={fieldBlock}>
          <label htmlFor="talk-channel-topic" style={fieldLabel}>
            主题（可选）
          </label>
          <Input
            id="talk-channel-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="主题（显示在消息区顶部，可选）"
          />
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>类型</span>
          <div style={pillGroup}>
            <button
              type="button"
              style={pillStyle(kind === "text")}
              onClick={() => setKind("text")}
            >
              文字
            </button>
            <button
              type="button"
              style={pillStyle(kind === "announcement")}
              onClick={() => setKind("announcement")}
            >
              公告
            </button>
            <button
              type="button"
              style={pillStyle(kind === "forum")}
              onClick={() => setKind("forum")}
            >
              话题
            </button>
          </div>
          <span style={dialogHint}>
            {kind === "text"
              ? "全员自由发言。"
              : kind === "announcement"
                ? "默认用 everyone 覆盖禁言（禁发送消息与开讨论组），可在「权限覆盖」里给特定角色放行。"
                : "频道里只列话题，点进话题才聊天（24h 无人回复自动归档）。"}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** 频道上移 / 下移图标（复用左箭头旋转，避免额外图标依赖） */
const moveUpIcon: CSSProperties = { display: "inline-flex", transform: "rotate(90deg)" };
const moveDownIcon: CSSProperties = { display: "inline-flex", transform: "rotate(-90deg)" };

/**
 * 每行的频道呼出菜单：创建讨论组（该频道 CREATE_THREAD 位）+
 * 排序 / 改名 / 删除（该频道 MANAGE_CHANNEL 位）/ 权限覆盖（社区级 MANAGE_CHANNEL）。
 * 无可用项时不渲染。
 */
export function ChannelRowMenu({
  channel,
  onCreateThread,
}: {
  channel: Channel;
  onCreateThread: (channelId: string) => void;
}): ReactElement | null {
  const talk = useTalkState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [overwriting, setOverwriting] = useState(false);
  // 删除 / 排序请求进行中（禁用菜单入口并转圈）
  const [busy, setBusy] = useState(false);
  // 权限覆盖读写走社区级 MANAGE_CHANNEL（避免频道级 deny 自锁）；
  // 频道改名/删除/排序走该频道解析后的 MANAGE_CHANNEL 位
  const canOverwrite = isModerator();
  const canManageChannel = (channelPermissions(channel.id) & Permission.MANAGE_CHANNEL) !== 0;

  const channels = talk.view.community?.channels ?? [];
  const index = channels.findIndex((c) => c.id === channel.id);
  const canMoveUp = canManageChannel && index > 0;
  const canMoveDown = canManageChannel && index >= 0 && index < channels.length - 1;
  // 能否建讨论组取决于该频道的 CREATE_THREAD 位（公告频道默认被 everyone 覆盖拒绝）
  const canCreateThread = (channelPermissions(channel.id) & Permission.CREATE_THREAD) !== 0;
  const isForum = channel.kind === "forum";

  async function remove(): Promise<void> {
    const confirmed = await askConfirm({
      title: `删除频道 #${channel.name}`,
      message: "频道内的消息会一并永久删除，且无法恢复。",
      confirmLabel: "删除频道",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    const ok = await deleteChannelById(channel.id);
    setBusy(false);
    if (ok) setMenuOpen(false);
  }

  /** 频道上移 / 下移：服务端按整表重排 */
  async function move(dir: "up" | "down"): Promise<void> {
    if (busy) return;
    setBusy(true);
    await moveChannel(channel.id, dir);
    setBusy(false);
  }

  const items: MenuEntry[] = [
    ...(canCreateThread
      ? [
          {
            id: "create-thread",
            label: isForum ? "新建话题" : "创建讨论组",
            icon: <IconBranchOutline16 />,
          },
        ]
      : []),
    ...(canMoveUp
      ? [
          {
            id: "up",
            label: "上移",
            icon: (
              <span style={moveUpIcon}>
                <IconChevronLeftOutline14 />
              </span>
            ),
          },
        ]
      : []),
    ...(canMoveDown
      ? [
          {
            id: "down",
            label: "下移",
            icon: (
              <span style={moveDownIcon}>
                <IconChevronLeftOutline14 />
              </span>
            ),
          },
        ]
      : []),
    ...(canOverwrite ? [{ id: "overwrites", label: "权限覆盖", icon: <IconUserOutline16 /> }] : []),
    ...(canManageChannel
      ? [
          { id: "edit", label: "编辑频道", icon: <IconEditOutline16 /> },
          { id: "delete", label: "删除频道", danger: true, icon: <IconTrashOutline16 /> },
        ]
      : []),
  ];
  if (items.length === 0) return null;

  return (
    <>
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          setMenuOpen(false);
          if (id === "create-thread") onCreateThread(channel.id);
          if (id === "overwrites") setOverwriting(true);
          if (id === "edit") setEditing(true);
          if (id === "delete") void remove();
          if (id === "up") void move("up");
          if (id === "down") void move("down");
        }}
        anchor={
          <Button
            size="sm"
            variant="ghost"
            icon={busy ? <Spinner size={14} /> : <IconEllipsisOutline16 />}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={busy ? `正在处理 #${channel.name}` : `管理 #${channel.name}`}
          />
        }
        items={items}
        portal
      />
      {editing ? <ChannelDialog open channel={channel} onClose={() => setEditing(false)} /> : null}
      {overwriting ? (
        <ChannelOverwriteDialog open channel={channel} onClose={() => setOverwriting(false)} />
      ) : null}
    </>
  );
}

// ---------------- 角色管理 ----------------

/** 角色管理（MANAGE_ROLES；只能操作层级低于自己的角色）：列表 + 新建/编辑/删除 + 层级调整 */
function RolesDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const talk = useTalkState();
  const roles = talk.view.community?.roles ?? [];
  const [editing, setEditing] = useState<CommunityRole | "new" | null>(null);
  // 正在删除 / 调整层级的角色 id（禁用该行操作并转圈）
  const [busyRoleId, setBusyRoleId] = useState<ID | null>(null);

  const custom = roles.filter((r) => !r.isEveryone).sort((a, b) => b.position - a.position);
  const everyone = roles.find((r) => r.isEveryone) ?? null;

  async function remove(role: CommunityRole): Promise<void> {
    const confirmed = await askConfirm({
      title: `删除角色「${role.name}」`,
      message: "持有该角色的成员将立即失去其权限，且无法恢复。",
      confirmLabel: "删除角色",
      danger: true,
    });
    if (!confirmed) return;
    setBusyRoleId(role.id);
    await deleteRole(role.id);
    setBusyRoleId(null);
  }

  /** 与相邻自定义角色交换层级（服务端按整表重排，含层级校验） */
  async function move(role: CommunityRole, dir: "up" | "down"): Promise<void> {
    if (busyRoleId !== null) return;
    const index = custom.findIndex((r) => r.id === role.id);
    const other = custom[dir === "up" ? index - 1 : index + 1];
    if (index < 0 || other === undefined) return;
    const next = [...custom];
    next[index] = other;
    next[dir === "up" ? index - 1 : index + 1] = role;
    setBusyRoleId(role.id);
    await reorderRoles(next.map((r) => r.id));
    setBusyRoleId(null);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="角色管理"
      closeLabel="关闭"
      description="角色自带一组基础权限；在频道里可用「权限覆盖」针对单个角色放行或拒绝。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="primary"
            icon={<IconPlusOutline16 />}
            disabled={!isOwner() && myHighestRolePosition() === 0}
            title={!isOwner() && myHighestRolePosition() === 0 ? "需要先拥有一个角色" : undefined}
            onClick={() => setEditing("new")}
          >
            新建角色
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {custom.map((role, i) => (
          <div key={role.id} style={listCard}>
            <span
              style={{
                width: 10,
                height: 10,
                flexShrink: 0,
                borderRadius: "50%",
                background: roleColorOf(role),
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={listCardName}>{role.name}</div>
              <div style={{ ...smallText, fontSize: 14 }}>
                {permissionSummary(role.permissions)}
              </div>
            </div>
            <HoverCard
              openDelayMs={300}
              content={
                <ActionTip
                  title="上移层级"
                  hint="把该角色的层级提高一位。层级越高，在权限覆盖与成员身份判定中越优先。"
                />
              }
              anchor={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyRoleId !== null || i === 0 || !canManageRolePosition(role.position)}
                  onClick={() => void move(role, "up")}
                  aria-label={`${role.name} 上移`}
                >
                  上移
                </Button>
              }
            />
            <HoverCard
              openDelayMs={300}
              content={
                <ActionTip
                  title="下移层级"
                  hint="把该角色的层级降低一位。层级越低，越容易被更高层级的角色覆盖。"
                />
              }
              anchor={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    busyRoleId !== null ||
                    i === custom.length - 1 ||
                    !canManageRolePosition(role.position)
                  }
                  onClick={() => void move(role, "down")}
                  aria-label={`${role.name} 下移`}
                >
                  下移
                </Button>
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busyRoleId !== null || !canManageRolePosition(role.position)}
              onClick={() => setEditing(role)}
            >
              编辑
            </Button>
            <HoverCard
              openDelayMs={300}
              content={
                <ActionTip
                  title="删除角色"
                  hint={`删除「${role.name}」，持有该角色的成员会立即失去它带来的权限，且无法恢复。`}
                />
              }
              anchor={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyRoleId !== null || !canManageRolePosition(role.position)}
                  icon={busyRoleId === role.id ? <Spinner size={14} /> : <IconTrashOutline16 />}
                  onClick={() => void remove(role)}
                  aria-label={`删除角色 ${role.name}`}
                />
              }
            />
          </div>
        ))}
      </div>
      {everyone ? (
        <div style={{ marginTop: 10 }}>
          <div style={listCard}>
            <span
              style={{
                width: 10,
                height: 10,
                flexShrink: 0,
                borderRadius: "50%",
                background: roleColorOf(everyone),
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={listCardName}>@everyone</div>
              <div style={{ ...smallText, fontSize: 14 }}>
                {permissionSummary(everyone.permissions)}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canManageRolePosition(everyone.position)}
              onClick={() => setEditing(everyone)}
            >
              编辑
            </Button>
          </div>
          <span style={{ ...dialogHint, display: "block", marginTop: 6 }}>
            @everyone 是全体成员的隐式角色，不能改名或删除，层级恒在最下。
          </span>
        </div>
      ) : null}
      {editing !== null ? (
        <RoleEditorDialog
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Modal>
  );
}

/** 新建 / 编辑角色（@everyone 只能改权限与颜色） */
function RoleEditorDialog({
  role,
  onClose,
}: {
  /** null = 新建 */
  role: CommunityRole | null;
  onClose: () => void;
}): ReactElement {
  const isEdit = role !== null;
  const everyone = role?.isEveryone ?? false;
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState<number | null>(role?.color ?? null);
  const [permissions, setPermissions] = useState<PermissionFlags>(role?.permissions ?? 0);
  const [busy, setBusy] = useState(false);

  function toggle(bit: PermissionFlags): void {
    setPermissions((prev) => ((prev & bit) !== 0 ? prev & ~bit : prev | bit));
  }

  async function save(): Promise<void> {
    if (!everyone && name.trim().length === 0) return;
    setBusy(true);
    let ok: boolean;
    if (role !== null) {
      const patch: { name?: string; color: number | null; permissions: PermissionFlags } = {
        color,
        permissions,
      };
      if (!role.isEveryone) patch.name = name.trim();
      ok = await updateRole(role.id, patch);
    } else {
      ok = await createRole({ name: name.trim(), color, permissions });
    }
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "编辑角色" : "新建角色"}
      closeLabel="关闭"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || (!everyone && name.trim().length === 0)}
            onClick={() => void save()}
          >
            {busy ? (isEdit ? "保存中…" : "创建中…") : isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={fieldBlock}>
          <label htmlFor="talk-role-name" style={fieldLabel}>
            角色名
          </label>
          <Input
            id="talk-role-name"
            value={everyone ? "@everyone" : name}
            disabled={everyone}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 版主 / 新人"
          />
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>颜色</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ROLE_COLOR_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                title={choice.label}
                aria-label={`颜色 ${choice.label}`}
                onClick={() => setColor(choice.value)}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  cursor: "pointer",
                  borderRadius: "50%",
                  background:
                    choice.value === null
                      ? palette.inputBg
                      : `#${choice.value.toString(16).padStart(6, "0")}`,
                  border:
                    color === choice.value
                      ? `2px solid ${palette.accent}`
                      : `1px solid ${palette.border}`,
                }}
              />
            ))}
          </div>
        </div>
        <div style={fieldBlock}>
          <span style={fieldLabel}>权限</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PERMISSION_FIELDS.map((field) => {
              const on = (permissions & field.bit) !== 0;
              // 不能授予自己没有的位（已授予的位仍可关闭）
              const grantable = isOwner() || (field.bit & myPermissions()) === field.bit;
              const blocked = !on && !grantable;
              return (
                <button
                  key={field.label}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggle(field.bit)}
                  style={{
                    ...listCard,
                    cursor: blocked ? "not-allowed" : "pointer",
                    opacity: blocked ? 0.55 : 1,
                    textAlign: "left",
                    border: `1px solid ${on ? palette.accent : palette.border}`,
                    background: on ? palette.hoverAccent : palette.inputBg,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={listCardName}>{field.label}</div>
                    <div style={{ ...smallText, fontSize: 14 }}>{field.hint}</div>
                  </div>
                  <span style={{ ...smallText, fontSize: 14 }}>
                    {blocked ? "无权授予" : on ? "允许" : "未授予"}
                  </span>
                </button>
              );
            })}
          </div>
          <span style={dialogHint}>
            除角色自带权限外，还可对具体频道单独放行/拒绝（「权限覆盖」）。
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- 频道权限覆盖 ----------------

type OverwriteChoice = "inherit" | "allow" | "deny";

const OVERWRITE_CHOICES: { value: OverwriteChoice; label: string }[] = [
  { value: "inherit", label: "继承" },
  { value: "allow", label: "允许" },
  { value: "deny", label: "拒绝" },
];

function choiceOf(
  allow: PermissionFlags,
  deny: PermissionFlags,
  bit: PermissionFlags,
): OverwriteChoice {
  if ((allow & bit) !== 0) return "allow";
  if ((deny & bit) !== 0) return "deny";
  return "inherit";
}

/**
 * 频道权限覆盖（MANAGE_CHANNEL）：对 @everyone / 角色 / 成员 逐位设置
 * 继承（不写入）/ 允许 / 拒绝。解析优先级由服务端权限解析器决定。
 */
function ChannelOverwriteDialog({
  open,
  channel,
  onClose,
}: {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}): ReactElement {
  const talk = useTalkState();
  const roles = talk.view.community?.roles ?? [];
  const [overwrites, setOverwrites] = useState<ChannelOverwrite[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(`everyone:${EVERYONE_TARGET_ID}`);
  const [allow, setAllow] = useState<PermissionFlags>(0);
  const [deny, setDeny] = useState<PermissionFlags>(0);
  const [busy, setBusy] = useState(false);
  // 正在提交的动作：区分保存 / 清除，按钮据此显示对应加载文案
  const [action, setAction] = useState<"save" | "clear" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([listChannelOverwrites(channel.id), listMembers()]).then(([os, ms]) => {
      if (cancelled) return;
      setOverwrites(os);
      setMembers(ms.map((m) => m.user));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, channel.id]);

  const targets: { type: OverwriteTargetType; id: string; label: string }[] = [
    { type: "everyone", id: EVERYONE_TARGET_ID, label: "@everyone" },
    ...roles
      .filter((r) => !r.isEveryone)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ type: "role" as const, id: r.id, label: r.name })),
    ...members.map((u) => ({ type: "member" as const, id: u.id, label: `@${u.handle}` })),
  ];
  const selected = targets.find((t) => `${t.type}:${t.id}` === selectedKey) ?? {
    type: "everyone" as OverwriteTargetType,
    id: EVERYONE_TARGET_ID,
    label: "@everyone",
  };
  const current = overwrites.find(
    (o) => o.targetType === selected.type && o.targetId === selected.id,
  );

  // 切换目标时用其现有覆盖预填编辑器
  useEffect(() => {
    setAllow(current?.allow ?? 0);
    setDeny(current?.deny ?? 0);
  }, [current?.allow, current?.deny]);

  function setChoice(bit: PermissionFlags, choice: OverwriteChoice): void {
    setAllow((prev) => (choice === "allow" ? prev | bit : prev & ~bit));
    setDeny((prev) => (choice === "deny" ? prev | bit : prev & ~bit));
  }

  async function refresh(): Promise<void> {
    setOverwrites(await listChannelOverwrites(channel.id));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setAction("save");
    const ok = await setChannelOverwrite(channel.id, selected.type, selected.id, { allow, deny });
    setBusy(false);
    setAction(null);
    if (ok) {
      notify("权限覆盖已保存");
      await refresh();
    }
  }

  async function clear(): Promise<void> {
    if (!current) return;
    setBusy(true);
    setAction("clear");
    const ok = await deleteChannelOverwrite(channel.id, selected.type, selected.id);
    setBusy(false);
    setAction(null);
    if (ok) {
      notify("已清除该目标的覆盖");
      await refresh();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`#${channel.name} · 权限覆盖`}
      closeLabel="关闭"
      description="在角色自带权限之上，对该频道逐个目标放行或拒绝；「继承」表示不写入该位。"
      footer={
        <>
          <Button variant="ghost" disabled={busy || !current} onClick={() => void clear()}>
            {action === "clear" ? "清除中…" : "清除覆盖"}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {action === "save" ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingHint text="加载权限覆盖…" padding="12px 4px" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={fieldBlock}>
            <span style={fieldLabel}>目标</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {targets.map((target) => {
                const key = `${target.type}:${target.id}`;
                const active = key === selectedKey;
                const hasOverwrite = overwrites.some(
                  (o) => o.targetType === target.type && o.targetId === target.id,
                );
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    style={{
                      ...pillStyle(active),
                      flex: "0 0 auto",
                      padding: "5px 10px",
                      fontSize: 14,
                      border: hasOverwrite
                        ? `1px solid ${palette.accent}`
                        : `1px solid transparent`,
                    }}
                  >
                    {target.label}
                  </button>
                );
              })}
            </div>
            <span style={dialogHint}>带蓝色边框的目标已存在覆盖；成员列表仅含当前社区成员。</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {OVERWRITE_FIELDS.map((field) => {
              const choice = choiceOf(allow, deny, field.bit);
              return (
                <div key={field.label} style={listCard}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={listCardName}>{field.label}</div>
                    <div style={{ ...smallText, fontSize: 14 }}>{field.hint}</div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      padding: 2,
                      borderRadius: 8,
                      background: palette.inputBg,
                      border: `1px solid ${palette.border}`,
                    }}
                  >
                    {OVERWRITE_CHOICES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setChoice(field.bit, item.value)}
                        style={{
                          ...pillStyle(choice === item.value),
                          flex: "0 0 auto",
                          padding: "4px 10px",
                          fontSize: 14,
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
