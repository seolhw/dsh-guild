// ================================================================
// 认证视图：登录 / 注册（邮箱或用户名 + 密码）
// 视觉全部走宿主 --dsw-* 语义 token（styles.tsx 的 palette），
// 仅在状态/行为上调用 store，不改动认证逻辑。
// ================================================================

import { Button, IconWarningOutline16, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { CSSProperties, FormEvent, ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  cancelVerification,
  login,
  register,
  requestPasswordResetOtp,
  resendVerificationOtp,
  resetPasswordWithOtp,
  useGuildState,
  verifyOtp,
} from "../store";
import { BrandLogo, fieldLabel, palette, pillGroup } from "./styles";

type Mode = "login" | "register";

const card: CSSProperties = {
  width: 420,
  maxWidth: "calc(100vw - 48px)",
  background: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: 16,
  padding: "26px 28px",
  color: palette.text,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const fieldHint: CSSProperties = { fontSize: 14, color: palette.muted };

const errorBanner: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 8,
  background: palette.layer2,
  border: `1px solid ${palette.border}`,
  borderLeft: `3px solid ${palette.danger}`,
  color: palette.danger,
  fontSize: 14,
  lineHeight: 1.4,
};

const linkButton: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  color: palette.accent,
  fontSize: 14,
  cursor: "pointer",
};

const linkButtonDisabled: CSSProperties = {
  ...linkButton,
  color: palette.muted,
  cursor: "default",
};

/** 把异常转成可展示的文案 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 卡片顶部品牌标识 + 标题 / 副标题 */
function BrandHeader({ title, subtitle }: { title: string; subtitle: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <BrandLogo size={42} title="DSH-Guild 社区" />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 650, lineHeight: 1.2 }}>{title}</div>
        <div style={{ ...fieldHint, fontSize: 14 }}>{subtitle}</div>
      </div>
    </div>
  );
}

/** 错误提示条（左侧警告图标 + 文案） */
function ErrorBanner({ message }: { message: string }): ReactElement {
  return (
    <div style={errorBanner}>
      <span style={{ display: "inline-flex", flex: "0 0 auto", marginTop: 1 }}>
        <IconWarningOutline16 size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
    </div>
  );
}

/** 显示 / 隐藏密码切换按钮 */
function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        color: palette.accent,
        fontSize: 14,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {shown ? "隐藏" : "显示"}
    </button>
  );
}

/** 分段控制：登录 / 注册，以及登录态下的 邮箱 / 用户名 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <div style={pillGroup}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 14,
              fontWeight: active ? 600 : 450,
              color: active ? palette.text : palette.muted,
              background: active ? palette.elevated : "transparent",
              cursor: "pointer",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 带标签行的表单字段：左侧 label，右侧可选插槽（如显示/隐藏密码） */
function Field({
  label,
  htmlFor,
  right,
  children,
}: {
  label: string;
  htmlFor: string;
  right?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label htmlFor={htmlFor} style={fieldLabel}>
          {label}
        </label>
        {right}
      </span>
      {children}
    </div>
  );
}

/** 忘记密码：邮箱 → 收验证码 → 设置新密码（全程在面板内完成，无需打开邮件链接） */
function ForgotPasswordCard({
  initialEmail,
  onDone,
}: {
  initialEmail: string;
  onDone: () => void;
}): ReactElement {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<"request" | "reset" | "done">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordResetOtp(email);
      setStage("reset");
      setOtp("");
      setNewPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await resetPasswordWithOtp({ email, otp, password: newPassword });
      setStage("done");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <BrandHeader
        title="重置密码"
        subtitle={stage === "done" ? "密码已更新" : "通过邮箱验证码找回账号"}
      />

      {stage === "done" ? (
        <>
          <div style={{ fontSize: 14, color: palette.muted, lineHeight: 1.6 }}>
            密码已重置成功，请使用新密码重新登录。
          </div>
          <Button variant="primary" size="md" style={{ width: "100%" }} onClick={onDone}>
            返回登录
          </Button>
        </>
      ) : (
        <form
          onSubmit={stage === "request" ? (e) => void request(e) : (e) => void submitReset(e)}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {stage === "request" ? (
            <>
              <div style={{ fontSize: 14, color: palette.muted, lineHeight: 1.6 }}>
                输入注册邮箱，我们会向它发送一封 6 位验证码邮件。
              </div>
              <Field label="邮箱" htmlFor="guild-reset-email">
                <Input
                  id="guild-reset-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: palette.muted, lineHeight: 1.6 }}>
                验证码已发送至 <strong style={{ color: palette.text }}>{email}</strong>，5
                分钟内有效；若未收到，请检查垃圾邮件；若该邮箱未注册则不会收到邮件。
              </div>
              <Field label="验证码" htmlFor="guild-reset-otp">
                <Input
                  id="guild-reset-otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="6 位数字"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </Field>
              <Field
                label="新密码"
                htmlFor="guild-reset-password"
                right={
                  <PasswordToggle
                    shown={showPassword}
                    onToggle={() => setShowPassword((prev) => !prev)}
                  />
                }
              >
                <Input
                  id="guild-reset-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                />
                <span style={fieldHint}>至少 8 位</span>
              </Field>
            </>
          )}

          {error ? <ErrorBanner message={error} /> : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={
              busy ||
              (stage === "request"
                ? email.trim().length === 0
                : otp.trim().length !== 6 || newPassword.length < 8)
            }
            style={{ width: "100%" }}
          >
            {busy ? "请稍候…" : stage === "request" ? "发送验证码" : "重置密码"}
          </Button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {stage === "reset" ? (
              <button
                type="button"
                style={busy ? linkButtonDisabled : linkButton}
                disabled={busy}
                onClick={() => {
                  setStage("request");
                  setError("");
                }}
              >
                换个邮箱
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              style={busy ? linkButtonDisabled : linkButton}
              disabled={busy}
              onClick={onDone}
            >
              返回登录
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AuthScreen(): ReactElement {
  const guild = useGuildState();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [forgot, setForgot] = useState(false);

  const pendingEmail = guild.pendingEmail;
  // 未验证账号登录被拦截时也会进入验证码界面，文案需与注册后验证区分
  const verifyFromLogin = guild.pendingEmailReason === "login";

  useEffect(() => {
    if (pendingEmail) {
      setOtp("");
      setOtpError("");
    }
  }, [pendingEmail]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await login("email", account.trim(), password);
      } else {
        const extra: { name?: string } = {};
        if (name.trim().length > 0) extra.name = name.trim();
        await register({ ...extra, email: account.trim(), password });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent): Promise<void> {
    event.preventDefault();
    setOtpBusy(true);
    setOtpError("");
    try {
      await verifyOtp(otp);
    } catch (err) {
      setOtpError(errorMessage(err));
    } finally {
      setOtpBusy(false);
    }
  }

  async function resend(): Promise<void> {
    setOtpError("");
    setOtpBusy(true);
    try {
      await resendVerificationOtp();
    } catch (err) {
      setOtpError(errorMessage(err));
    } finally {
      setOtpBusy(false);
    }
  }

  const allowSubmit = account.trim().length > 0 && password.length >= 8;

  if (pendingEmail) {
    const otpReady = otp.trim().length === 6;
    return (
      <div style={card}>
        <BrandHeader
          title="验证邮箱"
          subtitle={verifyFromLogin ? "该账号尚未验证，验证后即可登录" : "输入验证码完成注册"}
        />

        <div style={{ fontSize: 14, color: palette.muted, lineHeight: 1.5 }}>
          {verifyFromLogin ? (
            <>
              该邮箱尚未验证，暂时无法登录。验证码已重新发送至{" "}
              <strong style={{ color: palette.text }}>{pendingEmail}</strong>
              ，完成验证后将自动登录。5 分钟内有效；若未收到，请检查垃圾邮件。
            </>
          ) : (
            <>
              验证码已发送至 <strong style={{ color: palette.text }}>{pendingEmail}</strong>，
              请查收邮件。5 分钟内有效；若未收到，请检查垃圾邮件。
            </>
          )}
        </div>

        <form
          onSubmit={(e) => void verify(e)}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Field label="验证码" htmlFor="guild-otp">
            <Input
              id="guild-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="6 位数字"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </Field>

          {otpError ? <ErrorBanner message={otpError} /> : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={otpBusy || !otpReady}
            style={{ width: "100%" }}
          >
            {otpBusy ? "验证中…" : "验证邮箱"}
          </Button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              style={otpBusy ? linkButtonDisabled : linkButton}
              disabled={otpBusy}
              onClick={() => void resend()}
            >
              重新发送
            </button>
            <button
              type="button"
              style={otpBusy ? linkButtonDisabled : linkButton}
              disabled={otpBusy}
              onClick={() => cancelVerification()}
            >
              返回登录
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (forgot) {
    return <ForgotPasswordCard initialEmail={account.trim()} onDone={() => setForgot(false)} />;
  }

  return (
    <div style={card}>
      <BrandHeader title="DSH-Guild 社区" subtitle="登录后参与社区讨论" />

      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { key: "login", label: "登录" },
          { key: "register", label: "注册" },
        ]}
      />

      <form
        onSubmit={(e) => void submit(e)}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <Field label="邮箱" htmlFor="guild-account">
          <Input
            id="guild-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            required
          />
        </Field>

        {mode === "register" ? (
          <Field label="昵称（可选）" htmlFor="guild-name">
            <Input
              id="guild-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="显示名，留空用邮箱前缀"
            />
          </Field>
        ) : null}

        <Field
          label="密码"
          htmlFor="guild-password"
          right={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword((prev) => !prev)}
            />
          }
        >
          <Input
            id="guild-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
          {mode === "register" ? <span style={fieldHint}>至少 8 位</span> : null}
        </Field>

        {mode === "login" ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              style={linkButton}
              onClick={() => {
                setForgot(true);
                setError("");
              }}
            >
              忘记密码？
            </button>
          </div>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        {guild.busy && !busy ? (
          <div style={{ ...fieldHint, color: palette.muted }}>正在连接 Server…</div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={busy || !allowSubmit}
          style={{ width: "100%" }}
        >
          {busy ? "请稍候…" : mode === "login" ? "登录" : "创建账号"}
        </Button>
      </form>
    </div>
  );
}
