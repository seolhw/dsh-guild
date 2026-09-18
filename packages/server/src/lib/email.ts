// ================================================================
// 事务邮件：Resend HTTP API（不引入 SDK，Worker 可直接 fetch）
//
// Better Auth 的 sendVerificationEmail / sendResetPassword 回调在请求处理
// 中途触发，并且回调第二参带当前 Request。我们按 Request 挂 executionCtx，
// 把投递交给 waitUntil，保证响应返回后仍继续发送；无 waitUntil 时退化为
// fire-and-forget（本地单测等场景）。
// ================================================================

import type { ExecutionContext } from "@cloudflare/workers-types";
import type { Env } from "../types";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// ---------- 按 Request 记录当前 executionCtx ----------

const requestContexts = new WeakMap<Request, Pick<ExecutionContext, "waitUntil">>();

/** 请求入口处绑定（worker.ts 的 fetch 包装里调用），响应结束后 clear */
export function bindExecutionCtx(request: Request, ctx: Pick<ExecutionContext, "waitUntil">): void {
  requestContexts.set(request, ctx);
}

export function unbindExecutionCtx(request: Request): void {
  requestContexts.delete(request);
}

/** 把「发完即忘」的任务挂到该请求的 waitUntil 上，避免被提前回收 */
function runDetached(request: Request | undefined, task: Promise<unknown>): void {
  const ctx = request ? requestContexts.get(request) : undefined;
  const settle = (error: unknown) => console.error("[email] detached task failed:", error);
  if (ctx) ctx.waitUntil(task.catch(settle));
  else void task.catch(settle);
}

// ---------- Resend ----------

// Resend 发件地址。建议换成你在 Resend 已验证的域名邮箱；
const EMAIL_FROM = "DSH-Guild <onboarding@huiwang.fun>";

function resendKey(env: Env): string | null {
  return env.RESEND_API_KEY?.trim() || null;
}

/** 发送一封事务邮件（async；调用方决定是否 await/挂到 waitUntil） */
export async function sendMail(env: Env, message: MailMessage): Promise<void> {
  const apiKey = resendKey(env);
  if (!apiKey) {
    // 开发期没配 key 时打印到服务端日志，便于先联调其它流程
    console.warn(
      `[email] RESEND_API_KEY 未配置，跳过发送 -> to=${message.to} subject=${message.subject}`,
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`resend send failed: ${res.status} ${detail}`);
  }
}

// ---------- 面向 Better Auth 回调的便捷发送 ----------

/** 验证邮件 / 重置邮件正文直接放 Better Auth 生成的完整 url */
export function dispatchVerificationEmail(
  env: Env,
  request: Request | undefined,
  user: { email: string; name?: string | null },
  url: string,
): void {
  runDetached(
    request,
    sendMail(env, {
      to: user.email,
      subject: "DSH-Guild：验证你的邮箱",
      text: `你好${user.name ? ` ${user.name}` : ""}，点击以下链接完成邮箱验证：\n${url}\n\n如果这不是你的操作，请忽略本邮件。`,
    }),
  );
}

export function dispatchResetPasswordEmail(
  env: Env,
  request: Request | undefined,
  user: { email: string; name?: string | null },
  url: string,
): void {
  runDetached(
    request,
    sendMail(env, {
      to: user.email,
      subject: "DSH-Guild：重置你的密码",
      text: `你好${user.name ? ` ${user.name}` : ""}，点击以下链接重置密码：\n${url}\n\n如果这不是你的操作，请忽略本邮件。`,
    }),
  );
}

/**
 * 发送 6 位验证码邮件（emailOTP 插件回调）。验证码 5 分钟内有效。
 * type=forget-password 时用于「忘记密码」，主题/正文换成重置密码语境。
 */
export function dispatchVerificationOTPEmail(
  env: Env,
  request: Request | undefined,
  email: string,
  otp: string,
  type:
    | "email-verification"
    | "forget-password"
    | "sign-in"
    | "change-email" = "email-verification",
): void {
  const isReset = type === "forget-password";
  runDetached(
    request,
    sendMail(env, {
      to: email,
      subject: isReset ? "DSH-Guild：重置密码验证码" : "DSH-Guild：你的邮箱验证码",
      text: isReset
        ? `你正在重置 DSH-Guild 账号的密码，验证码是：${otp}\n\n5 分钟内有效。如果这不是你的操作，请忽略本邮件，密码不会改变。`
        : `你的 DSH-Guild 邮箱验证码是：${otp}\n\n5 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
    }),
  );
}

/** 社区邀请邮件：与被邀请人的站内信同时投递（随请求 waitUntil 后台发送） */
export function dispatchInvitationEmail(
  env: Env,
  request: Request | undefined,
  mail: {
    to: string;
    inviter: string;
    communityName: string;
    inviteCode: string;
  },
): void {
  const codeHint =
    mail.inviteCode.length > 0
      ? `2. 或在社区面板点「＋ 用邀请码加入」，输入邀请码 ${mail.inviteCode} 加入。`
      : "";
  runDetached(
    request,
    sendMail(env, {
      to: mail.to,
      subject: `${mail.inviter} 邀请你加入 DSH-Guild 社区「${mail.communityName}」`,
      text:
        `${mail.inviter} 邀请你加入 DSH-Guild 社区「${mail.communityName}」。\n\n` +
        `加入方式：\n` +
        `1. 打开 DSH-Guild 的「社区」面板，点击左上角铃铛查看站内信，点「加入」即可；\n` +
        (codeHint ? `${codeHint}\n` : "") +
        `\n如果你不认识对方，忽略本邮件即可。`,
    }),
  );
}
