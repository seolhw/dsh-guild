// ================================================================
// 个人中心：改头像 / 改昵称 / 改用户名 / 改密码；邮箱只读；退出登录。
// ================================================================

import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  askConfirm,
  changePassword,
  logout,
  notify,
  removeUserAvatar,
  updateReminderSettings,
  updateUserAvatar,
  updateUserNickname,
  updateUserUsername,
  useTalkState,
} from "../store";
import { AvatarPicker, fieldLabel, palette, smallText, Spinner } from "./styles";
import { TalkModal as Modal } from "./TalkModal";

/** 只读信息行：左侧标签，右侧值（单行省略） */
const infoRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 10,
  background: palette.inputBg,
  border: `1px solid ${palette.border}`,
};

const infoValue: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: palette.text,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** 开关行：无现成 Switch 组件，按站内样式手写一个（role=switch，可键盘操作） */
function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <div style={infoRow}>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: palette.text }}>{label}</span>
        <span style={{ ...smallText, fontSize: 14 }}>{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        style={{
          flex: "0 0 auto",
          width: 40,
          height: 22,
          padding: 0,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: checked ? palette.accent : palette.border,
          position: "relative",
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.15s",
          }}
        />
      </button>
    </div>
  );
}

export function ProfileModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const talk = useTalkState();
  const me = talk.me;
  const [nickname, setNickname] = useState("");
  const [nicknameBusy, setNicknameBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  // 打开时用当前昵称预填（保存成功后 displayName 变化也会同步回填）
  useEffect(() => {
    if (open) setNickname(me?.displayName ?? "");
  }, [open, me?.displayName]);

  // 打开时用当前用户名预填（保存成功后 handle 变化也会同步回填）
  useEffect(() => {
    if (open) setUsername(me?.handle ?? "");
  }, [open, me?.handle]);

  // 每次打开清空密码表单，避免残留
  useEffect(() => {
    if (open) {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }
  }, [open]);

  if (!me) return null;

  /** 退出登录：先用站内确认弹窗二次确认，再真正退出 */
  async function confirmLogout(): Promise<void> {
    const ok = await askConfirm({
      title: "退出登录",
      message: "退出后需要重新登录才能继续参与社区讨论。",
      confirmLabel: "确认退出",
      danger: true,
    });
    if (!ok) return;
    setLogoutBusy(true);
    await logout();
    setLogoutBusy(false);
  }

  async function pickAvatar(file: File): Promise<void> {
    setAvatarBusy(true);
    await updateUserAvatar(file);
    setAvatarBusy(false);
  }

  async function removeAvatar(): Promise<void> {
    setAvatarBusy(true);
    await removeUserAvatar();
    setAvatarBusy(false);
  }

  async function saveNickname(): Promise<void> {
    if (nicknameBusy) return;
    setNicknameBusy(true);
    await updateUserNickname(nickname);
    setNicknameBusy(false);
  }

  async function saveUsername(): Promise<void> {
    if (usernameBusy) return;
    setUsernameBusy(true);
    await updateUserUsername(username);
    setUsernameBusy(false);
  }

  async function submitPassword(): Promise<void> {
    if (pwdBusy) return;
    if (currentPwd.length === 0) {
      notify("请输入当前密码");
      return;
    }
    if (newPwd.length < 8) {
      notify("新密码至少 8 位");
      return;
    }
    if (newPwd !== confirmPwd) {
      notify("两次输入的新密码不一致");
      return;
    }
    setPwdBusy(true);
    const ok = await changePassword({ currentPassword: currentPwd, newPassword: newPwd });
    setPwdBusy(false);
    if (ok) {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }
  }

  const canSubmitPwd =
    !pwdBusy && currentPwd.length > 0 && newPwd.length >= 8 && newPwd === confirmPwd;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="个人中心"
      closeLabel="关闭"
      description="管理你的头像、昵称、用户名与登录密码。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="outline"
            icon={logoutBusy ? <Spinner size={14} /> : undefined}
            disabled={logoutBusy}
            style={{ color: palette.danger, borderColor: palette.danger }}
            onClick={() => void confirmLogout()}
          >
            {logoutBusy ? "退出中…" : "退出登录"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 650, color: palette.text }}>个人资料</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={fieldLabel}>头像</span>
            <AvatarPicker
              src={me.avatarUrl}
              label={me.handle}
              size={60}
              onPick={(file) => void pickAvatar(file)}
              onRemove={() => void removeAvatar()}
              busy={avatarBusy}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="talk-profile-nickname" style={fieldLabel}>
              昵称
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                id="talk-profile-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveNickname();
                  }
                }}
                placeholder={me.handle}
              />
              <Button
                variant="primary"
                disabled={nicknameBusy || nickname.trim().length === 0}
                onClick={() => void saveNickname()}
              >
                {nicknameBusy ? "保存中…" : "保存"}
              </Button>
            </div>
            <span style={{ ...smallText, fontSize: 14 }}>昵称会显示在消息与成员列表里。</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="talk-profile-username" style={fieldLabel}>
              用户名
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                id="talk-profile-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={16}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveUsername();
                  }
                }}
                placeholder={me.handle}
              />
              <Button
                variant="primary"
                disabled={usernameBusy || username.trim().length === 0}
                onClick={() => void saveUsername()}
              >
                {usernameBusy ? "保存中…" : "保存"}
              </Button>
            </div>
            <span style={{ ...smallText, fontSize: 14 }}>
              仅限大小写字母和数字，4-16 个字符，每周只能修改一次。
            </span>
          </div>
          <div style={infoRow}>
            <span style={{ ...smallText, fontSize: 14, flex: "0 0 auto" }}>邮箱</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={infoValue}>{talk.meEmail ?? "—"}</span>
              <span
                style={{
                  flex: "0 0 auto",
                  fontSize: 14,
                  fontWeight: 600,
                  color: palette.success,
                }}
              >
                已验证
              </span>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 650, color: palette.text }}>修改密码</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder="当前密码"
            aria-label="当前密码"
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="新密码（至少 8 位）"
            aria-label="新密码"
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitPassword();
              }
            }}
            placeholder="确认新密码"
            aria-label="确认新密码"
          />
          <div>
            <Button
              variant="primary"
              disabled={!canSubmitPwd}
              onClick={() => void submitPassword()}
            >
              {pwdBusy ? "更新中…" : "更新密码"}
            </Button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 650, color: palette.text }}>提醒</span>
          <ToggleRow
            label="桌面通知"
            hint="页面在后台时，当前房间有人 @ 我会弹系统通知（需浏览器授权）"
            checked={talk.reminderSettings.desktop}
            onToggle={() =>
              void updateReminderSettings({ desktop: !talk.reminderSettings.desktop })
            }
          />
          <ToggleRow
            label="免打扰"
            hint="开启后只保留未读角标，不再弹桌面通知"
            checked={talk.reminderSettings.dnd}
            onToggle={() => void updateReminderSettings({ dnd: !talk.reminderSettings.dnd })}
          />
        </div>
      </div>
    </Modal>
  );
}
