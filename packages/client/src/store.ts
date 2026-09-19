// ================================================================
// DSH-Guild client UI store（极简 listener store + React hook）
// 流程：打开面板 → host 取配置 → 有 token 则 get-session + 我的社区。
// 主屏：社区列表 ↔ 社区详情（频道） ↔ 频道消息（REST 加载 + WS 实时）。
// 认证：邮箱/用户名登录、注册。
// 实时：每个频道一条 GuildSocket；消息事件按当前 channelId 落到列表。
// ================================================================

import type {
  AuthUser,
  BanCommunityMemberRequest,
  ChannelOnlineMember,
  CommunityBanItem,
  CreateMessageRequest,
  CreateRoleRequest,
  CreateThreadRequest,
  DiscoverCommunitiesQuery,
  DiscoverCommunityItem,
  GetCommunityResponse,
  GetMyCommunitiesResponse,
  GetShareResponse,
  InboxItem,
  ListMembersResponse,
  MessageAttachmentPut,
  SearchMessageResult,
  SetChannelOverwriteRequest,
  SignUpEmailRequest,
  ThreadMemberItem,
  ThreadSummary,
  UpdateRoleRequest,
  UpdateThreadRequest,
  UpdateUserRequest,
} from "@dsh-guild/types/api";
import {
  ALL_PERMISSIONS,
  type ChannelOverwrite,
  type CommunityRole,
  DEFAULT_ADMIN_ROLE_NAME,
  EVERYONE_TARGET_ID,
  type ID,
  MESSAGE_RETRACT_MS,
  type Message,
  type MessageReaction,
  type OverwriteTargetType,
  Permission,
  type PermissionFlags,
  type ThreadVisibility,
  type User,
} from "@dsh-guild/types/entities";
import type { AgentSessionPackage, GuildSettings } from "@dsh-guild/types/rpc";
import type { ServerFrame } from "@dsh-guild/types/ws";
import { sortBy, uniq } from "es-toolkit/array";
import { useEffect, useReducer } from "react";
import {
  hostClone,
  hostConfigGet,
  hostConfigSet,
  hostSessionPackage,
  hostSessions,
} from "./config";
import {
  getReminderSettings,
  type ReminderSettings,
  requestNotificationPermission,
  saveReminderSettings,
  showDesktopNotification,
} from "./reminders";
import { ServerApiError, ServerClient } from "./server";
import { GuildSocket } from "./ws";

// ---------------- 类型 ----------------

export type GuildPhase = "booting" | "anon" | "ready" | "error";

export type MessageItem = Message & {
  author: User;
  replyTo?: MessageItem | null;
};

export type CommunityDetail = GetCommunityResponse;

/** @ 自动补全用的社区成员精简信息（由 /members 映射而来） */
export interface MemberLite {
  userId: ID;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** 成员持有的角色 id（@everyone 不计入） */
  roleIds: ID[];
}

/** 房间内其他人的「正在输入」状态（来自 evt.typing 推送，到期自动清除） */
export interface TypingMember {
  userId: ID;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** 到期时间（unix ms）：到点仍未收到新帧即视为已停止输入 */
  expiresAt: number;
}

export interface ViewState {
  communityId: ID | null;
  community: CommunityDetail | null;
  communityLoading: boolean;
  channelId: ID | null;
  /** 当前打开的讨论组 id（null = 正在看主频道直接消息）。依附于 channelId */
  threadId: ID | null;
  /** 按时间升序渲染（旧→新，最新在底部） */
  messages: MessageItem[];
  nextCursor: string | null;
  messagesLoading: boolean;
  loadingOlder: boolean;
  sending: boolean;
  /** 当前频道 WS 是否 live */
  live: boolean;
  /** 社区在线人数（聚合各房间去重，由 loadCommunityOnline 定期刷新） */
  communityOnlineCount: number;
  /** 社区在线成员快照（与 communityOnlineCount 同源，供右侧成员面板展示在线态） */
  communityOnlineMembers: ChannelOnlineMember[];
  /** 当前正在引用的消息（回复目标；位于 composer 上方提示条） */
  replyingTo: MessageItem | null;
  /** 房间内其他人的输入态（composer 上方「xxx 正在输入…」） */
  typing: TypingMember[];
  /** 跳转高亮目标：消息加载后滚动定位并短暂高亮，随后清除 */
  focusMessageId: string | null;
  /** 当前社区成员缓存（@ 提及自动补全用；进入社区时拉一次） */
  members: MemberLite[];
  membersLoading: boolean;
}

export interface GuildState {
  open: boolean;
  busy: boolean;
  phase: GuildPhase;
  settings: GuildSettings | null;
  me: User | null;
  /** 当前登录账号的邮箱（个人中心只读展示；User 实体不对外暴露邮箱） */
  meEmail: string | null;
  communities: GetMyCommunitiesResponse;
  error: string;
  toast: string;
  /** 待确认的站内确认弹窗（替代 window.confirm；非空时由 ConfirmDialog 渲染） */
  confirm: ConfirmRequest | null;
  view: ViewState;
  /** 待验证的邮箱；非空时 AuthScreen 切换到验证码界面 */
  pendingEmail: string | null;
  /** 进入验证码界面的原因：注册后验证 / 未验证账号登录被拦截 */
  pendingEmailReason: "register" | "login" | null;
  /** 站内信收件箱 */
  inboxOpen: boolean;
  notifications: InboxItem[];
  inboxLoading: boolean;
  inboxUnread: number;
  /** 正在处理（接受/拒绝）的站内信 id，用于按钮禁用 */
  inboxBusyId: string | null;
  /** 本机提醒设置（桌面通知 / 免打扰），个人中心可改 */
  reminderSettings: ReminderSettings;
}

// ---------------- 初始状态 ----------------

/** askConfirm 的入参（confirmLabel / cancelLabel / danger 可选） */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作：确认按钮用错误色 */
  danger?: boolean;
}

/** 渲染中的确认弹窗内容（字段已补全默认值） */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

const INITIAL_VIEW: ViewState = {
  communityId: null,
  community: null,
  communityLoading: false,
  channelId: null,
  threadId: null,
  messages: [],
  nextCursor: null,
  messagesLoading: false,
  loadingOlder: false,
  sending: false,
  live: false,
  communityOnlineCount: 0,
  communityOnlineMembers: [],
  replyingTo: null,
  typing: [],
  focusMessageId: null,
  members: [],
  membersLoading: false,
};

const INITIAL: GuildState = {
  open: false,
  busy: false,
  phase: "booting",
  settings: null,
  me: null,
  meEmail: null,
  communities: [],
  error: "",
  toast: "",
  confirm: null,
  view: INITIAL_VIEW,
  pendingEmail: null,
  pendingEmailReason: null,
  inboxOpen: false,
  notifications: [],
  inboxLoading: false,
  inboxUnread: 0,
  inboxBusyId: null,
  reminderSettings: { desktop: false, dnd: false },
};

let state: GuildState = {
  ...INITIAL,
  view: { ...INITIAL_VIEW },
  reminderSettings: getReminderSettings(),
};
const listeners = new Set<() => void>();
let toastTimer: number | null = null;

function setState(patch: Partial<GuildState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function patchView(patch: Partial<ViewState>): void {
  setState({ view: { ...state.view, ...patch } });
}

function makeServer(settings: GuildSettings): ServerClient {
  return new ServerClient(settings.serverUrl, settings.token);
}

function serverOf(): ServerClient | null {
  const settings = state.settings;
  if (!settings || settings.token.length === 0) return null;
  return makeServer(settings);
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function toUser(auth: AuthUser): User {
  const emailPrefix = auth.email.split("@")[0] || auth.id;
  const createdAt = Number.isNaN(Date.parse(auth.createdAt))
    ? Date.now()
    : Date.parse(auth.createdAt);
  return {
    id: auth.id as ID,
    handle: auth.username || emailPrefix,
    displayName: auth.name || null,
    avatarUrl: auth.image,
    createdAt,
  };
}

/** update-user 只回 { status: true }，要拿更新后的 user 得再拉一次会话 */
async function refreshedUser(server: ServerClient): Promise<User | null> {
  const session = await server.getSession();
  return session?.user ? toUser(session.user) : null;
}

/** 通知条（自动消失） */
export function notify(message: string): void {
  setState({ toast: message });
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setState({ toast: "" }), 3200);
}

/** 提前关闭通知条（Toast 动画结束后调用） */
export function dismissToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  setState({ toast: "" });
}

/**
 * 站内确认弹窗（替代 window.confirm）：
 * confirmResolver 保存本次弹窗的 Promise resolver，弹窗关闭时以 true/false 结算，
 * 调用点即可像 window.confirm 一样顺序书写。
 */
let confirmResolver: ((ok: boolean) => void) | null = null;

/** 弹出站内确认弹窗，resolve 用户是否确认 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  // 同一时间只保留一个确认弹窗：未决的旧弹窗按「取消」结算，避免 Promise 悬挂
  settleConfirm(false);
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve;
    setState({
      confirm: {
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "确认",
        cancelLabel: options.cancelLabel ?? "取消",
        danger: options.danger ?? false,
      },
    });
  });
}

/** 结算并关闭当前确认弹窗（由 ConfirmDialog 的按钮 / 关闭回调调用） */
export function settleConfirm(ok: boolean): void {
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve !== null) resolve(ok);
  if (state.confirm !== null) setState({ confirm: null });
}

/** 清空站内信状态（登出 / 切换账号时调用） */
function resetInbox(): void {
  setState({
    inboxOpen: false,
    notifications: [],
    inboxLoading: false,
    inboxUnread: 0,
    inboxBusyId: null,
  });
}

// ---------------- React hook ----------------

export function useGuildState(): GuildState {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return state;
}

// ---------------- 页面生命周期（社区作为独立页面，不再依赖弹层开关） ----------------

export function activateGuild(): void {
  if (!state.open) {
    setState({ open: true });
    void refresh();
  }
  bindPresenceListeners();
}

export function deactivateGuild(): void {
  if (!state.open) return;
  closeRealtime();
  unbindPresenceListeners();
  setState({ open: false });
}

// ---------------- 认证 ----------------

type LoginMode = "email" | "username";

/**
 * 是否为「邮箱尚未验证」被 Better Auth 拒绝（requireEmailVerification 生效时
 * sign-in 返回 403 + code EMAIL_NOT_VERIFIED，见 lib/auth.ts）。
 * 以 code 为主、403 + 文案为兜底，避免不同版本响应体差异导致漏判。
 */
function isEmailNotVerified(error: unknown): boolean {
  if (!(error instanceof ServerApiError)) return false;
  if (error.code === "EMAIL_NOT_VERIFIED") return true;
  return error.status === 403 && /not verified|verify your email/i.test(error.message);
}

/** 邮箱/用户名登录（Better Auth），成功后写 host token/handle */
export async function login(mode: LoginMode, account: string, password: string): Promise<void> {
  const settings = state.settings;
  if (!settings) throw new Error("尚未就绪");
  const server = makeServer(settings);
  try {
    const result =
      mode === "email"
        ? await server.signInEmail({ email: account, password })
        : await server.signInUsername({ username: account, password });
    const { user, token } = result;
    if (!token || !user) throw new Error("服务端未返回会话 token");
    await applySession({ user, token });
    notify("登录成功");
  } catch (error) {
    // 未验证邮箱的账号不允许登录：不发会话，切到验证码界面并补发验证码
    // （sign-in 已校验过密码，此处向该邮箱重发验证码是安全的）
    if (!isEmailNotVerified(error)) throw error;
    if (mode !== "email") {
      throw new Error("该账号的邮箱尚未验证，请改用邮箱登录完成验证");
    }
    const email = account.trim();
    setState({ pendingEmail: email, pendingEmailReason: "login", error: "" });
    try {
      await server.sendVerificationOtp({ email, type: "email-verification" });
    } catch {
      // 发送失败不阻塞界面：验证码界面提供「重新发送」
    }
  }
}

/** 邮箱注册：用户名由服务端从邮箱 @ 前缀自动派生，客户端不再提交。昵称可选。 */
export async function register(input: {
  name?: string;
  email: string;
  password: string;
}): Promise<void> {
  const settings = state.settings;
  if (!settings) throw new Error("尚未就绪");
  const name = input.name?.trim() || input.email.split("@")[0] || "dsh-user";
  const body: SignUpEmailRequest = { name, email: input.email, password: input.password };
  // 注册成功（requireEmailVerification=true 不会自动登录），服务端已发送 6 位验证码；
  // 这里只切换 UI 到验证码界面，由 verifyOtp 完成后续登录。
  await makeServer(settings).signUpEmail(body);
  setState({ pendingEmail: input.email.trim(), pendingEmailReason: "register", error: "" });
}

/** 校验邮箱验证码；验证成功且 autoSignInAfterVerification 开启时自动登录 */
export async function verifyOtp(otp: string): Promise<void> {
  const settings = state.settings;
  const email = state.pendingEmail;
  if (!settings || !email) throw new Error("请先注册并获取验证码");
  const result = await makeServer(settings).verifyEmail({ email, otp: otp.trim() });
  if (!result.user) throw new Error("验证失败，请重试");
  if (result.token) {
    await applySession({ user: result.user, token: result.token });
    notify("邮箱验证成功，已自动登录");
    return;
  }
  // 未自动登录：回登录页，让用户手动登录
  setState({ pendingEmail: null, pendingEmailReason: null });
  notify("邮箱验证成功，请登录");
}

/** 重新发送邮箱验证码 */
export async function resendVerificationOtp(): Promise<void> {
  const settings = state.settings;
  const email = state.pendingEmail;
  if (!settings || !email) throw new Error("尚未就绪");
  await makeServer(settings).sendVerificationOtp({ email, type: "email-verification" });
  notify("验证码已重新发送");
}

/** 从验证码界面返回登录页 */
export function cancelVerification(): void {
  setState({ pendingEmail: null, pendingEmailReason: null });
}

/**
 * 忘记密码 step1：请求把 6 位重置验证码发到邮箱。
 * 服务端对「邮箱不存在」也返回成功（防探测），文案由调用方统一提示。
 */
export async function requestPasswordResetOtp(email: string): Promise<void> {
  const settings = state.settings;
  if (!settings) throw new Error("尚未就绪");
  await makeServer(settings).requestPasswordResetOtp(email.trim());
}

/** 忘记密码 step2：用邮箱收到的验证码重设密码（成功后回登录页手动登录） */
export async function resetPasswordWithOtp(input: {
  email: string;
  otp: string;
  password: string;
}): Promise<void> {
  const settings = state.settings;
  if (!settings) throw new Error("尚未就绪");
  await makeServer(settings).resetPasswordWithOtp({
    email: input.email.trim(),
    otp: input.otp.trim(),
    password: input.password,
  });
}

export async function applySession(result: { user: AuthUser; token: string }): Promise<void> {
  setState({ busy: true, error: "" });
  try {
    const me = toUser(result.user);
    const next = await hostConfigSet({ token: result.token, handle: me.handle });
    const server = makeServer(next);
    const communities = await server.myCommunities();
    // 切换账号：未决的确认弹窗按「取消」结算
    settleConfirm(false);
    resetInbox();
    setState({
      busy: false,
      phase: "ready",
      settings: next,
      me,
      meEmail: result.user.email,
      communities,
      view: { ...INITIAL_VIEW },
    });
    void refreshInboxUnread();
  } catch (error) {
    setState({ busy: false, phase: "anon", error: errorText(error) });
    throw error;
  }
}

/** 修改昵称（displayName）：调用 Better Auth update-user，成功后同步本地 me。 */
export async function updateUserNickname(nickname: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  const trimmed = nickname.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === (state.me?.displayName ?? "")) {
    notify("昵称没有变化");
    return false;
  }
  try {
    const body: UpdateUserRequest = { name: trimmed };
    await server.updateUser(body);
    const me = (await refreshedUser(server)) ?? state.me;
    if (!me) {
      notify("无法获取最新用户信息");
      return false;
    }
    setState({ me });
    notify("昵称已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/**
 * 修改用户名（@handle）：客户端先做字符集/长度预检，最终以服务端校验为准
 * （唯一性、每周一次都由服务端强制），成功后同步本地 me 与 host 侧 handle。
 */
export async function updateUserUsername(username: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  const trimmed = username.trim();
  if (trimmed.length === 0) return false;
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    notify("用户名只能包含大小写字母和数字");
    return false;
  }
  if (trimmed.length < 4) {
    notify("用户名至少需要 4 个字符");
    return false;
  }
  if (trimmed.length > 16) {
    notify("用户名最多 16 个字符");
    return false;
  }
  if (trimmed.toLowerCase() === (state.me?.handle ?? "").toLowerCase()) {
    notify("用户名没有变化");
    return false;
  }
  try {
    const body: UpdateUserRequest = { username: trimmed };
    await server.updateUser(body);
    const me = (await refreshedUser(server)) ?? state.me;
    if (!me) {
      notify("无法获取最新用户信息");
      return false;
    }
    setState({ me });
    if (state.settings && state.settings.handle !== me.handle) {
      try {
        setState({ settings: await hostConfigSet({ handle: me.handle }) });
      } catch {
        // 写失败忽略：下次 refresh 会再同步
      }
    }
    notify("用户名已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 修改密码：调用 Better Auth change-password（服务端校验当前密码） */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.changePassword(input);
    notify("密码已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 上传一张图片到 R2，返回公开 URL；失败返回 null（内部已 toast） */
export async function uploadImage(file: File): Promise<string | null> {
  const server = serverOf();
  if (!server) return null;
  if (!file.type.startsWith("image/")) {
    notify("请选择图片文件");
    return null;
  }
  try {
    const up = await server.uploadObject(file);
    return up.url;
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

// ---------------- 提醒设置（桌面通知 / 免打扰） ----------------

/**
 * 更新本机提醒设置。开启桌面通知前先要浏览器授权：
 * 被拒绝时给出提示并保持原状，避免出现「开关亮着却弹不出来」。
 */
export async function updateReminderSettings(patch: Partial<ReminderSettings>): Promise<void> {
  if (patch.desktop === true) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      notify("浏览器未授予通知权限，请在站点设置里允许通知后重试");
      return;
    }
  }
  setState({ reminderSettings: saveReminderSettings(patch) });
}

/** 被 @ 且页面在后台时弹桌面通知（受设置与浏览器授权双重约束） */
function notifyMention(item: MessageItem): void {
  const { desktop, dnd } = state.reminderSettings;
  if (!desktop || dnd || !document.hidden) return;
  const who = item.author.displayName ?? item.author.handle;
  const text = item.content.replace(/\s+/g, " ").trim();
  showDesktopNotification(
    `${who} 在 DSH Guild 提到了你`,
    text.length > 120 ? `${text.slice(0, 120)}…` : text,
  );
}

/** 修改用户头像：先上传拿 URL，再更新 Better Auth user.image，并同步本地 me */
export async function updateUserAvatar(file: File): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  const url = await uploadImage(file);
  if (!url) return false;
  try {
    await server.updateUser({ image: url });
    const me = (await refreshedUser(server)) ?? state.me;
    if (!me) {
      notify("无法获取最新用户信息");
      return false;
    }
    setState({ me });
    notify("头像已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 移除用户头像，回退到字母头像 */
export async function removeUserAvatar(): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.updateUser({ image: null });
    const me = (await refreshedUser(server)) ?? state.me;
    if (!me) {
      notify("无法获取最新用户信息");
      return false;
    }
    setState({ me });
    notify("已移除头像");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

export async function logout(): Promise<void> {
  closeRealtime();
  // 未决的确认弹窗按「取消」结算，避免登出后 Promise 悬挂
  settleConfirm(false);
  const settings = state.settings;
  if (settings && settings.token.length > 0) {
    try {
      await makeServer(settings).signOut();
    } catch {
      // 远端吊销失败不阻塞本地退出
    }
  }
  try {
    await hostConfigSet({ token: "" });
  } catch {
    // 本地写失败不阻塞 UI 退出
  }
  setState({
    open: true,
    phase: "anon",
    me: null,
    meEmail: null,
    communities: [],
    error: "",
    view: { ...INITIAL_VIEW },
    settings: settings === null ? null : { ...settings, token: "" },
    pendingEmail: null,
    pendingEmailReason: null,
  });
  resetInbox();
}

// ---------------- 初始化 / 刷新 ----------------

export async function refresh(): Promise<void> {
  setState({ phase: "booting", busy: true, error: "" });
  try {
    const settings = await hostConfigGet();
    // 配置一拿到就先发布：界面可以立刻显示服务地址，不必死等后续两次跨境请求
    setState({ settings });
    if (settings.token.length === 0) {
      resetInbox();
      setState({
        phase: "anon",
        busy: false,
        pendingEmail: null,
        pendingEmailReason: null,
      });
      return;
    }
    const server = makeServer(settings);
    const session = await server.getSession();
    if (!session?.session || !session.user) {
      resetInbox();
      setState({
        phase: "anon",
        busy: false,
        pendingEmail: null,
        pendingEmailReason: null,
      });
      return;
    }
    const me = toUser(session.user);
    if (settings.handle !== me.handle) {
      try {
        await hostConfigSet({ handle: me.handle });
      } catch {
        // 写失败忽略
      }
    }
    const communities = await server.myCommunities();
    const nextSettings =
      settings.handle === me.handle ? settings : { ...settings, handle: me.handle };
    setState({
      busy: false,
      phase: "ready",
      settings: nextSettings,
      me,
      meEmail: session.user.email,
      communities,
    });
    void refreshInboxUnread();
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) {
      resetInbox();
      setState({
        phase: "anon",
        busy: false,
        me: null,
        meEmail: null,
        communities: [],
        pendingEmail: null,
        pendingEmailReason: null,
      });
      return;
    }
    setState({ phase: "error", busy: false, error: errorText(error) });
  }
}

/** 后台重取社区列表（加入/退出/未读变化后调用，不打断当前浏览） */
export async function refreshCommunities(): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    const communities = await server.myCommunities();
    setState({ communities });
  } catch {
    // 静默失败：下次刷新再试
  }
}

// ---------------- 站内信（事件收件箱） ----------------

/** 打开收件箱并拉取我的站内信 */
export async function openInbox(): Promise<void> {
  const server = serverOf();
  if (!state.open || !server) return;
  setState({ inboxOpen: true, inboxLoading: true });
  try {
    const res = await server.listNotifications({ limit: 50 });
    setState({ notifications: res.items, inboxUnread: res.unread, inboxLoading: false });
  } catch (error) {
    setState({ inboxLoading: false });
    notify(errorText(error));
  }
}

export function closeInbox(): void {
  setState({ inboxOpen: false });
}

/** 轻量刷新未读数（角标 / 定时轮询用） */
export async function refreshInboxUnread(): Promise<void> {
  const server = serverOf();
  if (!server || !state.open) return;
  try {
    const res = await server.listNotifications({ limit: 1 });
    if (res.unread !== state.inboxUnread) setState({ inboxUnread: res.unread });
  } catch {
    // 静默失败：等下次轮询
  }
}

function mapNotification(item: InboxItem, patch: Partial<InboxItem>): InboxItem {
  return { ...item, ...patch };
}

/** 接受某条邀请类站内信（成功即入会并打开社区） */
export async function acceptInvite(inviteId: string): Promise<boolean> {
  const server = serverOf();
  if (!server || state.inboxBusyId !== null) return false;
  setState({ inboxBusyId: inviteId });
  try {
    const joined = await server.acceptInvite(inviteId);
    setState({ inboxBusyId: null, inboxOpen: false });
    notify(`已加入社区「${joined.name}」`);
    await refreshCommunities();
    await openCommunity(joined.id);
    void refreshInboxUnread();
    return true;
  } catch (error) {
    setState({ inboxBusyId: null });
    notify(errorText(error));
    return false;
  }
}

/** 拒绝某条邀请类站内信 */
export async function declineInvite(inviteId: string): Promise<boolean> {
  const server = serverOf();
  if (!server || state.inboxBusyId !== null) return false;
  setState({ inboxBusyId: inviteId });
  try {
    await server.declineInvite(inviteId);
    setState({
      inboxBusyId: null,
      notifications: state.notifications.map((n) =>
        n.kind === "invite" && n.data?.inviteId === inviteId
          ? mapNotification(n, {
              isRead: true,
              invite: n.invite ? { ...n.invite, status: "declined" } : n.invite,
            })
          : n,
      ),
    });
    notify("已拒绝该邀请");
    void refreshInboxUnread();
    return true;
  } catch (error) {
    setState({ inboxBusyId: null });
    notify(errorText(error));
    return false;
  }
}

/** 标记一条站内信已读 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    await server.markNotificationRead(notificationId);
    const wasUnread = state.notifications.some((n) => n.id === notificationId && !n.isRead);
    setState({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? mapNotification(n, { isRead: true }) : n,
      ),
      inboxUnread: Math.max(0, state.inboxUnread - (wasUnread ? 1 : 0)),
    });
  } catch {
    // 已读失败不影响浏览
  }
}

/** 全部已读 */
export async function markAllNotificationsRead(): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    await server.markAllNotificationsRead();
    setState({
      notifications: state.notifications.map((n) => mapNotification(n, { isRead: true })),
      inboxUnread: 0,
    });
  } catch (error) {
    notify(errorText(error));
  }
}

// ---------------- 社区：选择 / 创建 / 加入 / 退出 ----------------

export function backToCommunities(): void {
  closeRealtime();
  setState({ view: { ...INITIAL_VIEW } });
}

export async function openCommunity(communityId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  closeRealtime();
  patchView({
    communityId,
    community: null,
    communityLoading: true,
    channelId: null,
    threadId: null,
    messages: [],
    nextCursor: null,
    live: false,
    communityOnlineCount: 0,
    communityOnlineMembers: [],
    replyingTo: null,
    focusMessageId: null,
  });
  try {
    const detail = await server.getCommunity(communityId);
    patchView({ community: detail, communityLoading: false });
    // 成员则进入第一个频道并预取成员列表；公开访客（非成员）只看社区资料
    if (detail.isMember) {
      void refreshCommunityMembers(communityId);
      const first = detail.channels[0];
      if (first) void selectChannel(first.id);
    }
  } catch (error) {
    patchView({ communityLoading: false });
    notify(errorText(error));
  }
}

export async function createCommunity(input: {
  name: string;
  description?: string;
  privacy?: "public" | "private";
  iconUrl?: string | null;
}): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    const body: {
      name: string;
      description?: string;
      privacy?: "public" | "private";
      iconUrl?: string | null;
    } = { name: input.name };
    if (input.description !== undefined && input.description.length > 0) {
      body.description = input.description;
    }
    if (input.privacy !== undefined) body.privacy = input.privacy;
    if (input.iconUrl !== undefined) body.iconUrl = input.iconUrl;
    const created = await server.createCommunity(body);
    await refreshCommunities();
    await openCommunity(created.id);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

export async function joinCommunityByCode(inviteCode: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    const joined = await server.joinByCode({ inviteCode: inviteCode.trim() });
    await refreshCommunities();
    await openCommunity(joined.id);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 发现公开社区（社区目录；支持关键词搜索与排序：热门 / 活跃 / 最新） */
export async function discoverCommunities(
  opts: { q?: string; sort?: DiscoverCommunitiesQuery["sort"]; offset?: number } = {},
): Promise<DiscoverCommunityItem[]> {
  const server = serverOf();
  if (!server) return [];
  try {
    const res = await server.discoverCommunities({
      q: opts.q?.trim() ?? "",
      sort: opts.sort ?? "hot",
      limit: 20,
      offset: opts.offset ?? 0,
    });
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 直接加入公开社区（发现页用；私有社区需邀请码走 joinCommunityByCode） */
export async function joinPublicCommunity(communityId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    const joined = await server.joinCommunity(communityId);
    await refreshCommunities();
    await openCommunity(joined.id);
    notify(`已加入社区「${joined.name}」`);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    await server.leaveCommunity(communityId);
    if (state.view.communityId === communityId) backToCommunities();
    await refreshCommunities();
    notify("已退出社区");
  } catch (error) {
    notify(errorText(error));
  }
}

/** 删除社区（仅 owner 可见入口）；服务端级联清除频道/消息/成员 */
export async function deleteCommunity(communityId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.deleteCommunity(communityId);
    if (state.view.communityId === communityId) backToCommunities();
    await refreshCommunities();
    notify("社区已删除");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ---------------- 社区 / 成员 / 频道 管理（owner/admin） ----------------

/** 重新拉取当前社区详情（编辑/建频道后刷新频道列表等） */
export async function reloadCommunityDetail(): Promise<void> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return;
  try {
    const detail = await server.getCommunity(communityId);
    patchView({ community: detail, communityLoading: false });
    // 权限变更后当前频道/讨论组可能已不可见：清空视图并断开实时
    const channelId = state.view.channelId;
    if (channelId !== null && !detail.channels.some((c) => c.id === channelId)) {
      closeRealtime();
      patchView({
        channelId: null,
        threadId: null,
        messages: [],
        nextCursor: null,
        live: false,
      });
    }
  } catch (error) {
    notify(errorText(error));
  }
}

/** 编辑社区资料 */
export async function updateCommunity(patch: {
  name?: string;
  description?: string | null;
  privacy?: "public" | "private";
  iconUrl?: string | null;
}): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    const body: {
      name?: string;
      description?: string | null;
      privacy?: "public" | "private";
      iconUrl?: string | null;
    } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.privacy !== undefined) body.privacy = patch.privacy;
    if (patch.iconUrl !== undefined) body.iconUrl = patch.iconUrl;
    await server.updateCommunity(communityId, body);
    await reloadCommunityDetail();
    await refreshCommunities();
    notify("社区资料已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 邀请已注册用户入社区（owner/admin）；目标会收到站内信 + 邮件 */
export async function inviteMember(handleOrEmail: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  const who = handleOrEmail.trim();
  if (!who) return false;
  try {
    const res = await server.createInvite(communityId, { handleOrEmail: who });
    notify(`已向 ${res.invitee.handle} 发送邀请（站内信 + 邮件）`);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/**
 * 站外邀请：给还没注册的人发一封「邀请链接 + 教程」邮件（不建邀请记录、不发站内信）。
 * 成功返回 true；失败已 notify，调用方只需保留弹窗。
 */
export async function sendInviteEmail(email: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  const to = email.trim();
  if (!to) return false;
  try {
    const res = await server.sendInviteEmail(communityId, { email: to });
    notify(res.sent ? `邀请邮件已发送至 ${res.email}` : "发信通道未配置，邮件未发出");
    return res.sent;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 拉成员列表 */
export async function listMembers(): Promise<ListMembersResponse["items"]> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return [];
  try {
    const res = await server.listMembers(communityId);
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 当前社区预置的「管理员」角色（按预置名查找；被改名或删除时返回 null） */
export function adminRole(): CommunityRole | null {
  return (
    (state.view.community?.roles ?? []).find(
      (r) => !r.isEveryone && r.name === DEFAULT_ADMIN_ROLE_NAME,
    ) ?? null
  );
}

/**
 * 取当前社区「管理员」角色 id；社区里没有（被改名/删除）就按预置规格
 * （预置名 + 全部权限位）新建一个普通角色。仅供「设为管理员」快捷入口使用，
 * 权限与层级仍由服务端裁决。
 */
export async function ensureAdminRole(): Promise<ID | null> {
  const existing = adminRole();
  if (existing !== null) return existing.id;
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return null;
  try {
    await server.createRole(communityId, {
      name: DEFAULT_ADMIN_ROLE_NAME,
      permissions: ALL_PERMISSIONS,
    });
    notify(`已创建「${DEFAULT_ADMIN_ROLE_NAME}」角色`);
    await reloadCommunityDetail();
    return adminRole()?.id ?? null;
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

/** 设置成员的角色全集（@everyone 不需传） */
export async function setMemberRoles(userId: string, roleIds: ID[]): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.setMemberRoles(communityId, userId, { roleIds });
    notify("成员角色已更新");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 转让社区所有权（仅 owner） */
export async function transferOwner(userId: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.transferOwner(communityId, { userId });
    notify("所有权已转让");
    await reloadCommunityDetail();
    await refreshCommunities();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ------- 角色（Discord 式；MANAGE_CHANNEL 可改） -------

/** 拉当前社区的完整角色表（含 @everyone） */
export async function listRoles(): Promise<CommunityRole[]> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return [];
  try {
    const res = await server.listRoles(communityId);
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 新建角色 */
export async function createRole(body: CreateRoleRequest): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.createRole(communityId, body);
    notify("角色已创建");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 修改角色（名/色/权限位；@everyone 不可改名。层级请用 reorderRoles） */
export async function updateRole(roleId: string, body: UpdateRoleRequest): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.updateRole(communityId, roleId, body);
    notify("角色已更新");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 整体重排角色层级（orderedIds 从高到低，必须含全部自定义角色） */
export async function reorderRoles(orderedIds: ID[]): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.reorderRoles(communityId, { roleIds: orderedIds });
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 删除角色（@everyone 不可删） */
export async function deleteRole(roleId: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.deleteRole(communityId, roleId);
    notify("角色已删除");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ------- 频道权限覆盖（overwrite；MANAGE_CHANNEL 可改） -------

/** 拉某频道的覆盖列表 */
export async function listChannelOverwrites(channelId: string): Promise<ChannelOverwrite[]> {
  const server = serverOf();
  if (!server) return [];
  try {
    const res = await server.listChannelOverwrites(channelId);
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 写入/覆盖某目标在该频道的 allow/deny 位 */
export async function setChannelOverwrite(
  channelId: string,
  targetType: OverwriteTargetType,
  targetId: string,
  body: SetChannelOverwriteRequest,
): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.setChannelOverwrite(channelId, targetType, targetId, body);
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 清除某目标在该频道的覆盖 */
export async function deleteChannelOverwrite(
  channelId: string,
  targetType: OverwriteTargetType,
  targetId: string,
): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.deleteChannelOverwrite(channelId, targetType, targetId);
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 移除成员 */
export async function kickMember(userId: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.removeMember(communityId, userId);
    notify("已移除该成员");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ------- 封禁（owner/admin；被封用户无法重新加入，可解封） -------

/** 按成员行封禁（userId）；服务端会同时把 TA 移出成员 */
export async function banUser(userId: string, reason?: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    const body: BanCommunityMemberRequest = { userId };
    if (reason?.trim()) body.reason = reason.trim();
    const res = await server.banUser(communityId, body);
    notify(`已封禁 @${res.user.handle}`);
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 按 @handle / 邮箱封禁（用于封禁非成员用户） */
export async function banUserByHandle(handleOrEmail: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.banUser(communityId, { handleOrEmail: handleOrEmail.trim() });
    notify("已封禁该用户");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 拉取该社区封禁列表（含用户快照） */
export async function listBannedUsers(): Promise<CommunityBanItem[]> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return [];
  try {
    const res = await server.listBans(communityId);
    return res.items;
  } catch {
    return [];
  }
}

/** 解封 */
export async function unbanUser(userId: string): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    await server.unbanUser(communityId, userId);
    notify("已解封该用户");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 新建频道（owner/admin），创建后自动进入 */
export async function createChannel(input: {
  name: string;
  topic?: string;
  kind?: "text" | "announcement" | "forum";
}): Promise<boolean> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return false;
  try {
    const body: {
      name: string;
      topic?: string | null;
      kind?: "text" | "announcement" | "forum";
    } = { name: input.name };
    if (input.topic !== undefined) body.topic = input.topic;
    if (input.kind !== undefined) body.kind = input.kind;
    const created = await server.createChannel(communityId, body);
    await reloadCommunityDetail();
    await selectChannel(created.id);
    notify("频道已创建");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 编辑频道（改名/主题/类型等） */
export async function updateChannelById(
  channelId: string,
  patch: {
    name?: string;
    topic?: string | null;
    kind?: "text" | "announcement" | "forum";
  },
): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.updateChannel(channelId, patch);
    await reloadCommunityDetail();
    notify("频道已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/**
 * 频道排序（owner/admin）：与相邻频道交换位置。
 * 频道列表按 position 升序渲染，但历史数据 position 可能重复，
 * 因此按当前顺序整体重排为 0..n-1，只 PATCH 真正变化的频道。
 */
export async function moveChannel(channelId: string, direction: "up" | "down"): Promise<boolean> {
  const server = serverOf();
  const community = state.view.community;
  if (!server || !community) return false;
  const ordered = [...community.channels];
  const index = ordered.findIndex((c) => c.id === channelId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return false;
  const current = ordered[index];
  const target = ordered[swapIndex];
  if (!current || !target) return false;
  const reordered = ordered.map((c) => {
    if (c.id === current.id) return target;
    if (c.id === target.id) return current;
    return c;
  });
  try {
    for (const [position, channel] of reordered.entries()) {
      if (channel.position !== position) {
        await server.updateChannel(channel.id, { position });
      }
    }
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 删除频道（owner/admin）；若正打开该频道则关闭它 */
export async function deleteChannelById(channelId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.deleteChannel(channelId);
    if (state.view.channelId === channelId) {
      closeRealtime();
      patchView({
        channelId: null,
        threadId: null,
        messages: [],
        nextCursor: null,
        live: false,
      });
    }
    await reloadCommunityDetail();
    notify("频道已删除");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ---------------- 讨论组（thread）操作 ----------------

/** 在主频道创建讨论组（可带起点消息与可见性）；成功后打开它 */
export async function createThreadInChannel(
  channelId: string,
  input: {
    name: string;
    starterMessageId?: string;
    visibility?: ThreadVisibility;
    passcode?: string | null;
  },
): Promise<ThreadSummary | null> {
  const server = serverOf();
  if (!server) return null;
  try {
    const body: CreateThreadRequest = { name: input.name.trim() };
    if (input.starterMessageId) body.starterMessageId = input.starterMessageId;
    if (input.visibility !== undefined) body.visibility = input.visibility;
    if (input.passcode !== undefined) body.passcode = input.passcode;
    const created = await server.createThread(channelId, body);
    notify(`已创建讨论组「${created.name}」`);
    await reloadCommunityDetail();
    await openThread({ id: created.id, channelId });
    return created;
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

/** 凭密码进入私密讨论组；成功后刷新频道讨论组列表并打开它 */
export async function joinThreadWithPasscode(threadId: string, passcode: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    const joined = await server.joinThread(threadId, passcode.trim());
    notify(`已加入讨论组「${joined.name}」`);
    await reloadCommunityDetail();
    await openThread({ id: joined.id, channelId: joined.channelId });
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 编辑讨论组（改名 / 改可见性 / 改密码），成功后刷新社区详情 */
export async function updateThread(threadId: string, patch: UpdateThreadRequest): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.updateThread(threadId, patch);
    await reloadCommunityDetail();
    notify("讨论组已更新");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 拉讨论组成员列表（失败返回 []） */
export async function listThreadMembers(threadId: string): Promise<ThreadMemberItem[]> {
  const server = serverOf();
  if (!server) return [];
  try {
    const res = await server.listThreadMembers(threadId);
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 拉可拉入的社区成员候选（支持关键词搜索；失败返回 []） */
export async function listThreadCandidates(threadId: string, q = ""): Promise<User[]> {
  const server = serverOf();
  if (!server) return [];
  try {
    const res = await server.listThreadCandidates(threadId, q.trim());
    return res.items;
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 直接把社区成员拉入讨论组 */
export async function addThreadMember(threadId: string, userId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    const res = await server.addThreadMember(threadId, userId);
    notify(`已把 @${res.user.handle} 拉入讨论组`);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 移除讨论组成员（userId 传自己即退出） */
export async function removeThreadMember(threadId: string, userId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.removeThreadMember(threadId, userId);
    notify(userId === state.me?.id ? "已退出讨论组" : "已移出该成员");
    await reloadCommunityDetail();
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 手动归档 / 恢复讨论组活跃 */
export async function setThreadArchived(threadId: string, archived: boolean): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    if (archived) await server.archiveThread(threadId);
    else await server.reopenThread(threadId);
    await reloadCommunityDetail();
    notify(archived ? "讨论组已归档（24h 无人发言也会自动归档）" : "讨论组已恢复活跃");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 删除讨论组（发起人或 owner/admin）；正打开时先退回主频道 */
export async function deleteThreadById(threadId: string): Promise<boolean> {
  const server = serverOf();
  if (!server) return false;
  try {
    await server.deleteThread(threadId);
    if (state.view.threadId === threadId) {
      const parent = state.view.channelId;
      if (parent) await selectChannel(parent);
    }
    await reloadCommunityDetail();
    notify("讨论组已删除");
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

// ---------------- 频道：选择 / 消息 / 实时 ----------------

let socket: GuildSocket | null = null;
let reconnectTimer: number | null = null;

function closeRealtime(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket !== null) {
    socket.close();
    socket = null;
  }
  if (state.view.live) patchView({ live: false });
}

// ---------------- 在线状态（presence） ----------------

/**
 * 页面不可见（切走标签页 / 最小化）视为「离开」，否则「在线」；离线由断连自动处理。
 * 不用 document.hasFocus()：它判定的是整个浏览器窗口是否持有系统焦点，用户点一下
 * 别的窗口（编辑器 / 终端 / 输入法候选框）就会把自己误标成「离开」。
 */
function desiredPresence(): "online" | "away" {
  if (typeof document === "undefined") return "online";
  if (document.visibilityState === "hidden") return "away";
  return "online";
}

/** 上报当前在线状态到当前房间（未连接时静默丢弃） */
function pushPresence(): void {
  socket?.send({ type: "presence.set", payload: { kind: desiredPresence() } });
}

let presenceBound = false;
function onPresenceSignal(): void {
  pushPresence();
}

/**
 * 房间 presence 增量（DO 实时扇出）：
 * - online / away 直接并入社区在线快照 —— 上线即时可见，不等 30s 轮询；
 * - offline 改为去抖重拉：房间帧只能证明「离开了本房间」，用户可能仍在线于
 *   同社区的其他频道，社区级名单以 REST 聚合结果为准（避免误判离线）。
 */
function applyPresenceUpdate(member: ChannelOnlineMember): void {
  if (member.presence === "offline") {
    if (presenceRefreshTimer !== null) return;
    presenceRefreshTimer = window.setTimeout(() => {
      presenceRefreshTimer = null;
      void loadCommunityOnline();
    }, 500);
    return;
  }
  presenceFrameAt.set(member.userId, Date.now());
  const current = state.view.communityOnlineMembers;
  const known = current.some((m) => m.userId === member.userId);
  const next = known
    ? current.map((m) => (m.userId === member.userId ? member : m))
    : [...current, member];
  patchView({ communityOnlineMembers: next, communityOnlineCount: next.length });
}

let presenceRefreshTimer: number | null = null;

/** 实时 presence 帧的到达时间（userId → ms），用于判断快照是否比本地状态更旧 */
const presenceFrameAt = new Map<ID, number>();

/**
 * 用 REST 快照替换在线名单，但保留「本次请求发起之后」由实时帧更新的成员：
 * 快照取的是请求发起那一刻的 DO 状态，可能还没包含刚建立连接的自己/他人，
 * 直接覆盖会把已显示的在线状态打回旧值（表现为再等一轮 30s 轮询）。
 */
function mergePresenceSnapshot(
  snapshot: ChannelOnlineMember[],
  requestStartedAt: number,
): ChannelOnlineMember[] {
  const fresher = state.view.communityOnlineMembers.filter(
    (m) => (presenceFrameAt.get(m.userId) ?? 0) > requestStartedAt,
  );
  if (fresher.length === 0) return snapshot;
  const merged = new Map(snapshot.map((m) => [m.userId, m] as const));
  for (const m of fresher) merged.set(m.userId, m);
  return [...merged.values()];
}

function bindPresenceListeners(): void {
  if (presenceBound) return;
  presenceBound = true;
  document.addEventListener("visibilitychange", onPresenceSignal);
}
function unbindPresenceListeners(): void {
  if (!presenceBound) return;
  presenceBound = false;
  document.removeEventListener("visibilitychange", onPresenceSignal);
}

function wsUrl(roomId: string): string {
  const settings = state.settings;
  const base = (settings?.serverUrl ?? "http://127.0.0.1:8787").replace(/^http/, "ws");
  const token = settings?.token ?? "";
  return `${base}/ws?token=${encodeURIComponent(token)}&channelId=${encodeURIComponent(roomId)}`;
}

/** 当前正在看的「房间」：讨论组优先，否则主频道 */
function roomIdOf(): string | null {
  const { threadId, channelId } = state.view;
  return threadId ?? channelId;
}

// ---------------- 输入中（typing，房间私有热状态） ----------------

/** 本房间其他人的输入态（key = userId）；随 evt.typing 刷新、到期自动清除 */
const typingByUser = new Map<ID, TypingMember>();
let typingSweeper: number | null = null;
/** 我上一次上报输入的时间（节流：同一房间最多 3s 一次） */
let lastTypingSentAt = 0;

function syncTypingView(): void {
  patchView({ typing: [...typingByUser.values()] });
}

/** 记录/刷新某人的输入态；首次出现时启动到期清扫定时器 */
function applyTyping(member: TypingMember): void {
  typingByUser.set(member.userId, member);
  syncTypingView();
  if (typingSweeper !== null) return;
  typingSweeper = window.setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [userId, item] of [...typingByUser.entries()]) {
      if (item.expiresAt <= now) {
        typingByUser.delete(userId);
        changed = true;
      }
    }
    if (changed) syncTypingView();
    if (typingByUser.size === 0 && typingSweeper !== null) {
      window.clearInterval(typingSweeper);
      typingSweeper = null;
    }
  }, 1000);
}

/** 切换房间时清掉输入态（上一个房间的人不该出现在新房间里） */
function resetTyping(): void {
  if (typingSweeper !== null) {
    window.clearInterval(typingSweeper);
    typingSweeper = null;
  }
  if (typingByUser.size === 0 && state.view.typing.length === 0) return;
  typingByUser.clear();
  syncTypingView();
}

/**
 * 我在当前房间输入：节流上报给服务端（≥3s 一次），由服务端扇出给同房间其他人。
 * 未连接时静默丢弃（断线期间不补发）。
 */
export function notifyTyping(): void {
  const now = Date.now();
  if (now - lastTypingSentAt < 3000) return;
  if (!socket?.send({ type: "typing", payload: { clientTime: now } })) return;
  lastTypingSentAt = now;
}

/** 连接某个房间（主频道或讨论组；各自一个 DO 实例 = 一条 WS） */
function connectChannel(roomId: string): void {
  closeRealtime();
  const settings = state.settings;
  socket = new GuildSocket(wsUrl(roomId), {
    onFrame: (frame) => handleServerFrame(frame),
    onClose: (code) => {
      socket = null;
      if (!state.open || roomIdOf() !== roomId) return;
      patchView({ live: false });
      // 1008 = 服务端因权限变更主动断开（access revoked）：重拉社区详情，不自动重连
      if (code === 1008) {
        void reloadCommunityDetail();
        return;
      }
      if (settings?.autoReconnect && reconnectTimer === null) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          if (state.open && roomIdOf() === roomId) connectChannel(roomId);
        }, 3000);
      }
    },
    onError: () => {
      // close 事件随后会触发重连
    },
  });
  socket.connect();
}

/** 服务端帧分发：hello（心跳开启）/ 权限变更 / 消息事件（仅当属于当前房间） */
function handleServerFrame(frame: ServerFrame): void {
  const roomId = roomIdOf();
  if (frame.type === "evt.hello") {
    patchView({ live: true });
    socket?.startHeartbeat(frame.payload.heartbeatIntervalSec);
    pushPresence();
    // 重连补拉：把断线期间漏掉的消息增量拉回来（首屏刚用 REST 拉过，通常为空）
    void catchUpMessages();
    return;
  }
  // 本房间其他人的输入态（DO 只扇出给别人，无需过滤自己）
  if (frame.type === "evt.typing") {
    if (frame.payload.channelId === roomId && frame.payload.member.userId !== state.me?.id) {
      applyTyping({ ...frame.payload.member, expiresAt: frame.payload.expiresAt });
    }
    return;
  }
  // 本房间在线状态变化（DO 扇出）：即时并入社区在线快照，免等 REST 轮询
  if (frame.type === "evt.presence.update") {
    if (frame.payload.channelId === roomId) applyPresenceUpdate(frame.payload.member);
    return;
  }
  // 社区权限配置变更：重拉社区详情与社区列表（频道可见性、按钮门槛、侧栏权限随之更新）
  if (frame.type === "evt.community.access.changed") {
    if (frame.payload.communityId === state.view.communityId) {
      void reloadCommunityDetail();
      void refreshCommunities();
    }
    return;
  }
  if (roomId === null) return;
  switch (frame.type) {
    case "evt.message.new": {
      if (frame.payload.channelId !== roomId) return;
      upsertMessage(frame.payload.message as MessageItem, true);
      // 被 @ 且页面在后台：按提醒设置补一条桌面通知（不影响站内状态）
      if (frame.payload.mentionMe) notifyMention(frame.payload.message as MessageItem);
      return;
    }
    case "evt.message.updated":
      if (frame.payload.channelId !== roomId) return;
      upsertMessage(frame.payload.message as MessageItem, true);
      return;
    case "evt.message.deleted":
      if (frame.payload.channelId !== roomId) return;
      removeMessage(frame.payload.messageId);
      return;
    case "evt.message.reactions":
      if (frame.payload.channelId !== roomId) return;
      patchReactions(frame.payload.messageId, frame.payload.reactions);
      return;
    default:
      return;
  }
}

function upsertMessage(item: MessageItem, appended: boolean): void {
  const list = state.view.messages;
  const index = list.findIndex((m) => m.id === item.id);
  let next: MessageItem[];
  if (index >= 0) {
    next = [...list];
    next[index] = item;
  } else if (appended) {
    next = [...list, item];
  } else {
    next = [item, ...list];
  }
  patchView({ messages: sortBy(next, ["createdAt"]) });
}

function removeMessage(messageId: string): void {
  patchView({ messages: state.view.messages.filter((m) => m.id !== messageId) });
}

/**
 * 重连后补齐断线期间漏掉的消息：以本地最新一条为游标向后（asc）翻页，
 * 最多 5 页（500 条）；断线时间过长时剩下的靠手动翻页/重进频道。
 */
async function catchUpMessages(): Promise<void> {
  const server = serverOf();
  const channelId = state.view.channelId;
  const newest = state.view.messages[state.view.messages.length - 1];
  if (!server || !channelId || !newest) return;
  const threadId = state.view.threadId;
  try {
    let cursor = String(newest.createdAt);
    for (let page = 0; page < 5; page += 1) {
      const res = await server.listMessages(channelId, {
        cursor,
        limit: 100,
        direction: "asc",
        ...(threadId === null ? {} : { threadId }),
      });
      if (res.items.length === 0) return;
      for (const item of res.items) upsertMessage(item as MessageItem, true);
      if (res.nextCursor === null) return;
      cursor = res.nextCursor;
    }
  } catch {
    // 补拉失败不阻塞实时（用户仍可手动翻页）
  }
}

/** 整份替换某条消息的表情回应（服务端聚合结果，收敛幂等） */
function patchReactions(messageId: string, reactions: MessageReaction[]): void {
  const list = state.view.messages;
  const index = list.findIndex((m) => m.id === messageId);
  const current = index >= 0 ? list[index] : undefined;
  if (!current) return;
  const next = [...list];
  next[index] = { ...current, reactions };
  patchView({ messages: next });
}

/** 切换到某个频道：拉历史 → 上报已读 → 连实时 */
export async function selectChannel(channelId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  closeRealtime();
  resetTyping();
  patchView({
    channelId,
    threadId: null,
    messages: [],
    nextCursor: null,
    messagesLoading: true,
    loadingOlder: false,
    live: false,
    replyingTo: null,
    focusMessageId: null,
  });
  try {
    const page = await server.listMessages(channelId, { limit: 50, direction: "desc" });
    const items = [...page.items].reverse();
    patchView({
      messages: items,
      nextCursor: page.nextCursor,
      messagesLoading: false,
    });
    const newest = items[items.length - 1];
    if (newest) {
      try {
        await server.markRead(channelId, { lastReadMessageId: newest.id });
        void refreshCommunities();
      } catch {
        // 已读上报失败不阻塞聊天
      }
    }
    connectChannel(channelId);
  } catch (error) {
    patchView({ messagesLoading: false, live: false });
    notify(errorText(error));
  }
}

/** 更新本地 community.threads 中的某条讨论组摘要（未读归零/计数推进等即时反馈） */
function patchThreadSummary(threadId: string, patch: Partial<ThreadSummary>): void {
  const community = state.view.community;
  if (!community?.threads.some((t) => t.id === threadId)) return;
  patchView({
    community: {
      ...community,
      threads: community.threads.map((t) => (t.id === threadId ? { ...t, ...patch } : t)),
    },
  });
}

/** 打开讨论组：切到依附频道 → 拉该讨论组的消息 → 上报已读 → 连讨论组实时房间 */
export async function openThread(thread: { id: string; channelId: string }): Promise<void> {
  const server = serverOf();
  if (!server) return;
  if (state.view.channelId !== thread.channelId) await selectChannel(thread.channelId);
  const threadId = thread.id;
  closeRealtime();
  resetTyping();
  patchView({
    threadId,
    messages: [],
    nextCursor: null,
    messagesLoading: true,
    loadingOlder: false,
    live: false,
    replyingTo: null,
    focusMessageId: null,
  });
  try {
    const page = await server.listMessages(thread.channelId, {
      limit: 50,
      direction: "desc",
      threadId,
    });
    const items = [...page.items].reverse();
    patchView({ messages: items, nextCursor: page.nextCursor, messagesLoading: false });
    const newest = items[items.length - 1];
    if (newest) {
      try {
        await server.markThreadRead(threadId, { lastReadMessageId: newest.id });
        patchThreadSummary(threadId, { unreadCount: 0, unreadMentions: 0 });
      } catch {
        // 已读上报失败不影响浏览
      }
    }
    connectChannel(threadId);
  } catch (error) {
    patchView({ messagesLoading: false, live: false });
    notify(errorText(error));
  }
}

/** 从讨论组退回它依附的主频道 */
export async function closeThread(): Promise<void> {
  const channelId = state.view.channelId;
  if (channelId) await selectChannel(channelId);
}

/**
 * 拉取社区在线快照：写入 view（右侧成员面板用这一份数据），并返回给调用方。
 * 失败静默（保持上一次的名单），不影响聊天。
 */
export async function loadCommunityOnline(): Promise<ChannelOnlineMember[]> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return [];
  const startedAt = Date.now();
  try {
    const res = await server.communityOnline(communityId);
    const members = mergePresenceSnapshot(res.members, startedAt);
    patchView({ communityOnlineCount: members.length, communityOnlineMembers: members });
    return members;
  } catch {
    return [];
  }
}

/** 向上翻更早消息（主频道或当前讨论组各自翻页） */
export async function loadOlderMessages(): Promise<void> {
  const server = serverOf();
  const { channelId, threadId, nextCursor, loadingOlder, messages } = state.view;
  if (!server || !channelId || !nextCursor || loadingOlder) return;
  patchView({ loadingOlder: true });
  try {
    const common = { cursor: nextCursor, limit: 50, direction: "desc" as const };
    const page =
      threadId !== null
        ? await server.listMessages(channelId, { ...common, threadId })
        : await server.listMessages(channelId, common);
    const older = [...page.items].reverse();
    const merged = [...older, ...messages];
    patchView({
      messages: merged,
      nextCursor: page.nextCursor,
      loadingOlder: false,
    });
  } catch (error) {
    patchView({ loadingOlder: false });
    notify(errorText(error));
  }
}

/** 正文里的 @handle 列表（@everyone 是保留目标、不对应具体用户，不作为 handle 上送） */
function mentionHandlesOf(text: string): string[] {
  const matches = text.match(/(?<![\p{L}\p{N}_])@([\p{L}\p{N}_]+)/gu) ?? [];
  return matches
    .map((token) => token.replace(/^@/, ""))
    .filter((handle) => `@${handle}` !== EVERYONE_TARGET_ID);
}

/** 组 createMessage 请求体：附件与 @mention 只在有值时带上（exactOptionalPropertyTypes） */
function buildMessageBody(
  content: string,
  attachments: MessageAttachmentPut[],
): {
  content: string;
  attachments?: MessageAttachmentPut[];
  mentionHandles?: string[];
  mentionEveryone?: boolean;
} {
  const body: {
    content: string;
    attachments?: MessageAttachmentPut[];
    mentionHandles?: string[];
    mentionEveryone?: boolean;
  } = { content };
  if (attachments.length > 0) body.attachments = attachments;
  const handles = uniq(mentionHandlesOf(content));
  if (handles.length > 0) body.mentionHandles = handles;
  // @everyone：正文里出现即按全员提及上报（服务端展开成社区成员列表）
  if (/(?<![\p{L}\p{N}_])@everyone(?![\p{L}\p{N}_])/u.test(content)) body.mentionEveryone = true;
  return body;
}

/**
 * 发消息：先逐个 PUT 附件拿 r2Key，再走 REST 创建；WS live 时事件回填，否则本地补一条。
 * shareId 非空时会附带一张分享卡片（服务端展开成消息内嵌的 shareCard 快照）。
 * @returns 是否成功入队（成功时调用方应清空输入与附件）
 */
export async function sendMessage(
  content: string,
  files: File[] = [],
  shareId: string | null = null,
): Promise<boolean> {
  const server = serverOf();
  const channelId = state.view.channelId;
  if (!server || !channelId || state.view.sending) return false;
  const text = content.trim();
  if (text.length === 0 && files.length === 0 && shareId === null) return false;
  patchView({ sending: true });
  try {
    const attachments: MessageAttachmentPut[] = [];
    for (const file of files) {
      const up = await server.uploadObject(file);
      attachments.push({
        r2Key: up.r2Key,
        name: up.name,
        size: up.size,
        mimeType: up.mimeType ?? (file.type.length > 0 ? file.type : null),
      });
    }
    const request: CreateMessageRequest = { ...buildMessageBody(text, attachments) };
    if (shareId !== null) request.shareId = shareId;
    if (state.view.replyingTo) request.replyToId = state.view.replyingTo.id;
    const sentThreadId = state.view.threadId;
    if (sentThreadId !== null) request.threadId = sentThreadId;
    const created = await server.createMessage(channelId, request);
    if (!state.view.live) {
      upsertMessage(created as MessageItem, true);
    }
    // 讨论组内发言：同步本地摘要计数/活跃并确保状态为活跃
    if (sentThreadId !== null) {
      const current = state.view.community?.threads.find((t) => t.id === sentThreadId);
      if (current) {
        patchThreadSummary(sentThreadId, {
          messageCount: current.messageCount + 1,
          lastMessageId: created.id,
          lastActivityAt: created.createdAt,
          status: "active",
          archivedAt: null,
          updatedAt: created.createdAt,
        });
      }
    }
    patchView({ sending: false, replyingTo: null });
    return true;
  } catch (error) {
    patchView({ sending: false });
    notify(errorText(error));
    return false;
  }
}

export async function updateMessage(messageId: string, content: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    const updated = await server.updateMessage(messageId, { content: content.trim() });
    if (!state.view.live) upsertMessage(updated as MessageItem, true);
  } catch (error) {
    notify(errorText(error));
    throw error;
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    await server.deleteMessage(messageId);
    if (!state.view.live) removeMessage(messageId);
    // 删除讨论组内的消息时同步回退本地计数
    const threadId = state.view.threadId;
    if (threadId !== null) {
      const current = state.view.community?.threads.find((t) => t.id === threadId);
      if (current && current.messageCount > 0) {
        patchThreadSummary(threadId, { messageCount: current.messageCount - 1 });
      }
    }
  } catch (error) {
    notify(errorText(error));
    throw error;
  }
}

/**
 * 切换某条消息上的表情回应（点过一次再点 = 取消）。
 * 成功后立刻用返回值替换本地聚合，不等 WS（WS 也会推同一份，幂等）。
 */
export async function toggleReaction(item: MessageItem, emoji: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    const result = await server.toggleMessageReaction(item.id, emoji);
    patchReactions(result.messageId, result.reactions);
  } catch (error) {
    notify(errorText(error));
  }
}

/** 我能否置顶/取消置顶（与改删他人消息同一权限位：社区 MANAGE_MESSAGES） */
export function canPinMessages(): boolean {
  return canManageMessages();
}

/**
 * 置顶 / 取消置顶某条消息。服务端会广播 evt.message.updated（同一份数据），
 * 这里先用响应整条替换本地消息，实时模式下也不会闪。
 */
export async function setMessagePinned(item: MessageItem, pinned: boolean): Promise<void> {
  const server = serverOf();
  if (!server) return;
  try {
    const updated = pinned ? await server.pinMessage(item.id) : await server.unpinMessage(item.id);
    upsertMessage(updated as MessageItem, true);
    notify(pinned ? "已置顶" : "已取消置顶");
  } catch (error) {
    notify(errorText(error));
  }
}

/** 拉当前房间的置顶消息（打开置顶面板时调用；按置顶时间倒序） */
export async function loadPinnedMessages(): Promise<MessageItem[]> {
  const server = serverOf();
  const channelId = state.view.channelId;
  if (!server || !channelId) return [];
  try {
    const res = await server.listPinned(channelId, state.view.threadId);
    return res.items as MessageItem[];
  } catch (error) {
    notify(errorText(error));
    return [];
  }
}

/** 取分享详情（含作者/大小/时间与下载地址）；失败返回 null */
export async function getShareInfo(shareId: string): Promise<GetShareResponse | null> {
  const server = serverOf();
  if (!server) return null;
  try {
    return await server.getShare(shareId);
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

/** 取分享的下载地址（服务端会顺带自增下载计数） */
export async function shareDownloadUrl(shareId: string): Promise<string | null> {
  const server = serverOf();
  if (!server) return null;
  try {
    const res = await server.getShare(shareId);
    return res.downloadUrl;
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

// ---------------- DSH 会话分享（agent-session） ----------------

/** 当前 DSH 会话 id：由「社区」页签（会话级 slot）挂载时写入 */
let currentDshSessionId: string | null = null;

export function setCurrentDshSession(id: string | null): void {
  currentDshSessionId = id;
}

export function getCurrentDshSession(): string | null {
  return currentDshSessionId;
}

type SessionOpener = (sessionId: string) => Promise<boolean>;

let openSessionFn: SessionOpener | null = null;

/** 由 client 入口 apply 注入「打开会话」实现（refresh + open） */
export function bindSessionOpener(fn: SessionOpener | null): void {
  openSessionFn = fn;
}

/** 可分享会话（会话树的一行）：与宿主左侧会话栏同源的展示与状态字段 */
export interface ShareSessionNode {
  id: string;
  /** 展示名：宿主已折算为 durable title → 工程名 → 会话 id */
  title: string;
  running: boolean;
  completed: boolean;
  /** 正在运行的子代理数（>0 时显示「N 个子代理运行中」） */
  runningSubagentCount: number;
  /** 相对时间的基准（epoch ms）；宿主不可用时缺省，缺省则不显示时间 */
  updatedAt?: number;
  /** 阻断该会话的用户交互：approval / plan-review / question */
  pendingInteraction?: string;
}

/** 会话树的一个工作区分组；不属于任何工作区的会话归入 key 为空串的「未分组」 */
export interface ShareWorkspaceGroup {
  key: string;
  /** 分组标题：工作区标题（未分组时为「未分组」） */
  label: string;
  /** 工作区绝对路径；未分组时缺省 */
  cwd?: string;
  sessions: ShareSessionNode[];
}

/** 会话树快照：分组顺序与分组内顺序都与宿主左侧会话栏一致 */
export interface ShareSessionTree {
  groups: ShareWorkspaceGroup[];
  /** 宿主当前打开的会话 id */
  current: string | null;
}

type SessionTreeReader = () => ShareSessionTree;

let sessionTreeFn: SessionTreeReader | null = null;

/** 由 client 入口 apply 注入「读取宿主会话树」实现（与左侧会话栏同源） */
export function bindSessionTree(fn: SessionTreeReader | null): void {
  sessionTreeFn = fn;
}

/** 路径最后一段（未分组回退用的工作区展示名，对齐宿主 workspaceLabel） */
function pathBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return trimmed.slice(separator + 1) || path;
}

/**
 * 本机可分享的会话树：优先用宿主会话栏同源的派生结果（工作区标题 / 运行状态 /
 * 更新时间），宿主不可用时回退到 host 持久化列表（只有 id / cwd）。
 */
export async function listShareableSessions(): Promise<ShareSessionTree> {
  const tree = sessionTreeFn?.() ?? null;
  if (tree && tree.groups.length > 0) return tree;
  try {
    const res = await hostSessions();
    const groups = new Map<string, ShareWorkspaceGroup>();
    for (const session of res.sessions) {
      const key = session.cwd ?? "";
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          label: key.length > 0 ? pathBasename(key) : "未分组",
          ...(key.length > 0 ? { cwd: key } : {}),
          sessions: [],
        };
        groups.set(key, group);
      }
      group.sessions.push({
        id: session.id,
        title: session.id,
        running: false,
        completed: false,
        runningSubagentCount: 0,
      });
    }
    return { groups: [...groups.values()], current: getCurrentDshSession() };
  } catch (error) {
    notify(errorText(error));
    return { groups: [], current: null };
  }
}

/**
 * 把本机某个 DSH 会话分享到社区：
 * host 打包 → 上传 R2 → 在 Server 登记一条 agent-session 分享。
 * 成功返回分享 id（可随消息发卡片），失败返回 null。
 */
export async function shareLocalSession(input: {
  sessionId: string;
  title?: string;
  summary?: string;
  communityId?: string | null;
}): Promise<string | null> {
  const server = serverOf();
  if (!server) return null;
  try {
    const raw = await hostSessionPackage(input.sessionId);
    const pack = JSON.parse(raw) as AgentSessionPackage;
    const title = input.title?.trim() || `会话分享：${pack.manifest.sessionId.slice(0, 8)}`;
    const file = new File([raw], `agent-session-${pack.manifest.sessionId}.json`, {
      type: "application/json",
    });
    const uploaded = await server.uploadObject(file);
    const res = await server.createAgentSessionShare({
      r2Key: uploaded.r2Key,
      title,
      ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
      sizeBytes: uploaded.size,
      manifest: pack.manifest,
      ...(input.communityId ? { communityId: input.communityId } : {}),
    });
    notify(`已分享会话「${res.share.title}」`);
    return res.share.id;
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}

/** 让 host 把一条分享还原成本地 DSH 会话，并切到该会话 */
export async function cloneShareToSession(shareId: string): Promise<boolean> {
  const url = await shareDownloadUrl(shareId);
  if (!url) return false;
  try {
    const res = await hostClone(url);
    if (!res.sessionId) {
      notify("该分享不是 DSH 会话包");
      return false;
    }
    const opened = openSessionFn ? await openSessionFn(res.sessionId) : false;
    notify(opened ? "已还原会话并切换过去" : `已还原会话 ${res.sessionId}，请在会话列表里打开`);
    return true;
  } catch (error) {
    notify(errorText(error));
    return false;
  }
}

/** 我在当前社区的基础权限位（非成员 = 0） */
export function myPermissions(): PermissionFlags {
  return state.view.community?.myPermissions ?? 0;
}

/** 我持有的角色 id（@everyone 不计入） */
export function myRoleIds(): ID[] {
  return state.view.community?.myRoleIds ?? [];
}

/** 我是否是当前社区成员（服务端字段，与权限位无关：@everyone 全 0 时仍为 true） */
export function isMember(): boolean {
  return state.view.community?.isMember ?? false;
}

/** 我是否持有某社区级权限位（owner 的 myPermissions 恒为全量，无需特判） */
export function canCommunity(bit: PermissionFlags): boolean {
  return (myPermissions() & bit) !== 0;
}

/** 我是否持有社区级 MANAGE_CHANNEL 权限（频道、社区信息、频道覆盖） */
export function isModerator(): boolean {
  return canCommunity(Permission.MANAGE_CHANNEL);
}

/** 我是否能管理角色与成员角色 */
export function canManageRoles(): boolean {
  return canCommunity(Permission.MANAGE_ROLES);
}

/** 我持有的最高角色层级（@everyone 不计；无自定义角色 = 0） */
export function myHighestRolePosition(): number {
  const held = new Set(state.view.community?.myRoleIds ?? []);
  let max = 0;
  for (const role of state.view.community?.roles ?? []) {
    if (role.isEveryone || !held.has(role.id)) continue;
    if (role.position > max) max = role.position;
  }
  return max;
}

/** 一组角色 id 的最高层级（用于判断某成员是否层级低于我） */
export function highestPositionOf(roleIds: readonly ID[]): number {
  const held = new Set(roleIds);
  let max = 0;
  for (const role of state.view.community?.roles ?? []) {
    if (role.isEveryone || !held.has(role.id)) continue;
    if (role.position > max) max = role.position;
  }
  return max;
}

/** 我能否操作该层级的角色/成员（owner 恒可；否则要求层级严格高于对方） */
export function canManageRolePosition(position: number): boolean {
  return isOwner() || position < myHighestRolePosition();
}

/** 我是否能管理讨论组（改名/归档/删除/加人） */
export function canManageThreads(): boolean {
  return canCommunity(Permission.MANAGE_THREADS);
}

/** 我是否能改社区资料/隐私/短标识 */
export function canManageCommunity(): boolean {
  return canCommunity(Permission.MANAGE_COMMUNITY);
}

/** 我是否能管理他人消息 */
export function canManageMessages(): boolean {
  return canCommunity(Permission.MANAGE_MESSAGES);
}

/** 我是否能邀请成员 */
export function canInviteMembers(): boolean {
  return canCommunity(Permission.INVITE_MEMBERS);
}

/** 我是否能移除成员 */
export function canKickMembers(): boolean {
  return canCommunity(Permission.KICK_MEMBERS);
}

/** 我是否能封禁成员 */
export function canBanMembers(): boolean {
  return canCommunity(Permission.BAN_MEMBERS);
}

/** 我是否是当前社区的所有者（owner 绕过所有权限判定） */
export function isOwner(): boolean {
  const community = state.view.community;
  if (community === null || state.me === null) return false;
  return community.ownerId === state.me.id;
}

/** 我在某频道下的解析后权限位（含 overwrite 叠加；非成员 = 0） */
export function channelPermissions(channelId: ID): PermissionFlags {
  return state.view.community?.channels.find((c) => c.id === channelId)?.permissions ?? 0;
}

/** 我在某频道是否持有指定权限位 */
export function can(channelId: ID, bit: PermissionFlags): boolean {
  return (channelPermissions(channelId) & bit) !== 0;
}

/** 能否编辑：作者本人（随时）或持有社区 MANAGE_MESSAGES */
export function canEditMessage(item: MessageItem): boolean {
  if (state.me === null) return false;
  if (item.authorId === state.me.id) return true;
  return canManageMessages();
}

/** 能否撤回/删除：有 MANAGE_MESSAGES（含 owner）随时可删任意消息；否则作者限 2 分钟内 */
export function canRetractMessage(item: MessageItem): boolean {
  if (state.me === null) return false;
  if (canManageMessages()) return true;
  return item.authorId === state.me.id && Date.now() - item.createdAt <= MESSAGE_RETRACT_MS;
}

// ---------------- 回复 / 定位高亮 ----------------

/** 选中某条消息作为回复目标（composer 上方会出现提示条） */
export function replyToMessage(item: MessageItem): void {
  patchView({ replyingTo: item });
}

/** 取消回复 */
export function cancelReply(): void {
  patchView({ replyingTo: null });
}

/** 清除跳转高亮标记（高亮动画结束后调用） */
export function clearMessageFocus(): void {
  if (state.view.focusMessageId !== null) patchView({ focusMessageId: null });
}

/**
 * 打开某条消息所在房间（主频道或讨论组）并定位：目标不在首屏则向上翻页
 * （最多 10 页）寻找，找到后短暂高亮。
 * @returns 是否成功定位
 */
export async function revealMessage(
  channelId: string,
  messageId: string,
  threadId: string | null = null,
): Promise<boolean> {
  try {
    const targetThread = threadId ?? null;
    if (state.view.channelId !== channelId || state.view.threadId !== targetThread) {
      if (targetThread) await openThread({ id: targetThread, channelId });
      else await selectChannel(channelId);
    }
    let guard = 0;
    while (
      guard < 10 &&
      state.view.nextCursor !== null &&
      !state.view.messages.some((m) => m.id === messageId)
    ) {
      await loadOlderMessages();
      guard += 1;
    }
    if (!state.view.messages.some((m) => m.id === messageId)) return false;
    patchView({ focusMessageId: messageId });
    return true;
  } catch {
    return false;
  }
}

// ---------------- 邀请链接（方案 A：一键邀请） ----------------

/**
 * 生成某社区的邀请链接（分享用）。
 * 形状 = `${serverUrl}/invite/${inviteCode}`，指向 Worker 渲染的落地页；
 * 落地页展示社区信息、安装指引与邀请码，访客装好插件后自己用码加入。
 * serverUrl 取当前配置，空则返回空串。
 */
export function inviteLinkFor(community: { inviteCode: string | null }): string {
  const base = state.settings?.serverUrl ?? "";
  const code = community.inviteCode ?? "";
  if (base.length === 0 || code.length === 0) return "";
  return `${base.replace(/\/+$/, "")}/invite/${code}`;
}

// ---------------- 成员列表（@ 补全数据源） ----------------

function toMemberLite(item: ListMembersResponse["items"][number]): MemberLite {
  return {
    userId: item.userId,
    handle: item.user.handle,
    displayName: item.user.displayName,
    avatarUrl: item.user.avatarUrl,
    roleIds: item.roleIds,
  };
}

/** 拉取当前社区成员到 view.members（缓存，供 @ 自动补全） */
export async function refreshCommunityMembers(communityId: string): Promise<void> {
  const server = serverOf();
  if (!server) return;
  if (state.view.communityId !== communityId) return;
  patchView({ membersLoading: true });
  try {
    const res = await server.listMembers(communityId, { limit: 200 });
    if (state.view.communityId !== communityId) return; // 已切走则丢弃
    patchView({ members: res.items.map(toMemberLite), membersLoading: false });
  } catch {
    if (state.view.communityId === communityId) patchView({ membersLoading: false });
  }
}

// ---------------- 消息搜索 ----------------

/** 消息搜索的可选筛选（与 REST 查询参数一一对应） */
export interface MessageSearchFilters {
  /** 只看某个频道 */
  channelId?: string;
  /** 只看某个作者 */
  authorId?: string;
  /** 起始时间（unix ms，含） */
  from?: number;
  /** 结束时间（unix ms，含） */
  to?: number;
  /** 只看提及我的消息 */
  mentionsMe?: boolean;
}

/** 在当前社区搜索消息（关键词可留空，此时需带筛选；返回 null 表示失败，错误已 toast） */
export async function searchCommunityMessages(
  q: string,
  cursor?: string,
  filters: MessageSearchFilters = {},
): Promise<{ items: SearchMessageResult[]; nextCursor: string | null } | null> {
  const server = serverOf();
  const communityId = state.view.communityId;
  if (!server || !communityId) return null;
  try {
    const res = await server.searchMessages(communityId, q, {
      ...filters,
      limit: 30,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { items: res.items, nextCursor: res.nextCursor };
  } catch (error) {
    notify(errorText(error));
    return null;
  }
}
