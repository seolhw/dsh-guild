// ================================================================
// Server REST client（浏览器端直连 @dsh-guild/server 后端）
// 认证采用 Better Auth Bearer Token：
//   - /api/auth/*：登录/注册/会话/改密等（见 @dsh-guild/types/api/auth）
//   - 业务 REST：Authorization: Bearer <session token>
// 类型契约复用 @dsh-guild/types/api（请求）+ @dsh-guild/types/entities（实体）。
// ================================================================

import type {
  AcceptInviteResponse,
  AddThreadMemberResponse,
  ApiError,
  AuthUser,
  BanCommunityMemberRequest,
  BanCommunityMemberResponse,
  ChangePasswordRequest,
  CreateAgentSessionShareRequest,
  CreateAgentSessionShareResponse,
  CreateChannelRequest,
  CreateChannelResponse,
  CreateCommunityRequest,
  CreateCommunityResponse,
  CreateInviteRequest,
  CreateInviteResponse,
  CreateMessageRequest,
  CreateMessageResponse,
  CreateRoleRequest,
  CreateRoleResponse,
  CreateThreadRequest,
  CreateThreadResponse,
  DeclineInviteResponse,
  DeleteChannelOverwriteResponse,
  DeleteChannelResponse,
  DeleteCommunityResponse,
  DeleteRoleResponse,
  DiscoverCommunitiesQuery,
  DiscoverCommunitiesResponse,
  GetCommunityOnlineResponse,
  GetCommunityResponse,
  GetMyCommunitiesResponse,
  GetReadStateResponse,
  GetSessionResponse,
  GetShareResponse,
  GetThreadReadStateResponse,
  JoinByInviteRequest,
  JoinByInviteResponse,
  JoinCommunityResponse,
  JoinThreadRequest,
  JoinThreadResponse,
  LeaveCommunityResponse,
  ListChannelOverwritesResponse,
  ListCommunityBansResponse,
  ListMembersQuery,
  ListMembersResponse,
  ListMessagesQuery,
  ListMessagesResponse,
  ListNotificationsResponse,
  ListPinsResponse,
  ListRolesResponse,
  ListThreadCandidatesResponse,
  ListThreadMembersResponse,
  ListThreadsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  OverwriteTargetType,
  PinMessageResponse,
  RemoveMemberResponse,
  RemoveThreadMemberResponse,
  ReorderRolesRequest,
  ReorderRolesResponse,
  RequestPasswordResetOTPResponse,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  ResetPasswordWithOTPRequest,
  ResetPasswordWithOTPResponse,
  SearchMessagesResponse,
  SendVerificationEmailRequest,
  SendVerificationOTPRequest,
  SetChannelOverwriteRequest,
  SetChannelOverwriteResponse,
  SetMemberRolesRequest,
  SetMemberRolesResponse,
  SignInEmailRequest,
  SignInUsernameRequest,
  SignUpEmailRequest,
  ThreadSummary,
  ToggleMessageReactionRequest,
  ToggleMessageReactionResponse,
  TransferOwnerRequest,
  TransferOwnerResponse,
  UnpinMessageResponse,
  UpdateChannelRequest,
  UpdateChannelResponse,
  UpdateCommunityRequest,
  UpdateCommunityResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdateReadStateRequest,
  UpdateRoleRequest,
  UpdateRoleResponse,
  UpdateThreadReadStateRequest,
  UpdateThreadReadStateResponse,
  UpdateThreadRequest,
  UpdateUserRequest,
  UploadAttachmentResponse,
  VerifyEmailOTPRequest,
} from "@dsh-guild/types/api";
import { pickBy } from "es-toolkit/object";
import { isPlainObject } from "es-toolkit/predicate";

export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string | undefined,
    readonly details?: Record<string, string[]> | undefined,
  ) {
    super(message);
  }
}

const errorMessage = (data: unknown, text: string): string => {
  if (data && typeof data === "object") {
    const maybe = data as { message?: unknown; error?: unknown };
    if (typeof maybe.message === "string" && maybe.message.length > 0) return maybe.message;
    if (typeof maybe.error === "string" && maybe.error.length > 0) return maybe.error;
    // Better Auth 字段级错误：{ error: { field: [...] } }
    if (maybe.error && typeof maybe.error === "object") {
      const first = Object.values(maybe.error)[0];
      if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    }
  }
  return text.length > 0 ? text : "request failed";
};

/** 读取响应体并尽力解析 JSON；空体或非 JSON 时 data 为 null */
async function readJson(res: Response): Promise<{ data: unknown; text: string }> {
  const text = await res.text();
  if (text.length === 0) return { data: null, text };
  try {
    return { data: JSON.parse(text) as unknown, text };
  } catch {
    return { data: null, text };
  }
}

/** 非 2xx 统一抛 ServerApiError；2xx 返回解析后的 JSON（空体为 null） */
async function parseResponse<T>(res: Response): Promise<T> {
  const { data, text } = await readJson(res);
  if (!res.ok) {
    const err = data as ApiError | null;
    throw new ServerApiError(
      res.status,
      err?.code ?? "AUTH_ERROR",
      errorMessage(data, text),
      err?.requestId,
      err?.details,
    );
  }
  return data as T;
}

/** 登录/注册类端点返回：user + 会话 token（响应头 set-auth-token 或 body.token） */
export interface AuthCallResult {
  user: AuthUser | null;
  token: string | null;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(
    pickBy(params, (v) => v !== undefined && v !== null && String(v).length > 0),
  );
  if (entries.length === 0) return "";
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
}

// ---------- 网络层失败自动重试 ----------
// fetch 只有在「网络层」失败时才会 reject（如 ERR_CONNECTION_REFUSED / ERR_NETWORK，
// 表现为 TypeError: Failed to fetch）；HTTP 状态码错误会正常 resolve，交给 !res.ok 处理。
// 本地开发时后端 wrangler dev 刚启动、端口尚未就绪就会命中这里，做有上限的重试，
// 消除「页面先于后端就绪导致的一次性 REFUSED」。
const NETWORK_RETRY_MAX = 4;
const NETWORK_RETRY_BASE_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= NETWORK_RETRY_MAX; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === NETWORK_RETRY_MAX) break;
      await sleep(NETWORK_RETRY_BASE_MS * (attempt + 1));
    }
  }
  throw lastError;
}

export class ServerClient {
  readonly baseUrl: string;
  token: string | null;

  constructor(baseUrl: string, token: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  get hasToken(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async call<T>(method: string, path: string, body?: unknown, auth = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth && this.hasToken) headers.authorization = `Bearer ${this.token}`;

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetchWithRetry(this.url(path), init);
    return parseResponse<T>(res);
  }

  /** 登录/注册专用：同时从响应头/body 收集会话 token（Bearer 用） */
  private async authCall(method: string, path: string, body: unknown): Promise<AuthCallResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.hasToken) headers.authorization = `Bearer ${this.token}`;
    const res = await fetchWithRetry(this.url(path), {
      method,
      headers,
      body: JSON.stringify(body),
    });
    const data = await parseResponse<unknown>(res);
    const tokenFromHeader = res.headers.get("set-auth-token");
    const tokenFromBody = isPlainObject(data) && typeof data.token === "string" ? data.token : null;
    const user =
      isPlainObject(data) && isPlainObject(data.user) ? (data.user as unknown as AuthUser) : null;
    return { user, token: tokenFromHeader ?? tokenFromBody };
  }

  // ---------- /api/auth/*（Better Auth） ----------

  /** POST /api/auth/sign-up/email —— 邮箱注册（用户名可选） */
  signUpEmail(body: SignUpEmailRequest): Promise<AuthCallResult> {
    return this.authCall("POST", "/api/auth/sign-up/email", body);
  }

  /** POST /api/auth/sign-in/email —— 邮箱登录 */
  signInEmail(body: SignInEmailRequest): Promise<AuthCallResult> {
    return this.authCall("POST", "/api/auth/sign-in/email", body);
  }

  /** POST /api/auth/sign-in/username —— 用户名登录 */
  signInUsername(body: SignInUsernameRequest): Promise<AuthCallResult> {
    return this.authCall("POST", "/api/auth/sign-in/username", body);
  }

  /** POST /api/auth/sign-out —— 登出（吊销当前会话）。Better Auth 要求 JSON body */
  signOut(): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>("POST", "/api/auth/sign-out", {}, true);
  }

  /**
   * GET /api/auth/get-session —— 当前登录态。
   * 注意：token 失效/被吊销时返回 200 + null（不是 401），调用方需判空。
   */
  getSession(): Promise<GetSessionResponse | null> {
    return this.call<GetSessionResponse | null>("GET", "/api/auth/get-session", undefined, true);
  }

  /** POST /api/auth/change-password —— 修改密码 */
  changePassword(body: ChangePasswordRequest): Promise<{ status: boolean }> {
    return this.call<{ status: boolean }>("POST", "/api/auth/change-password", body, true);
  }

  /** POST /api/auth/update-user —— 改资料/改用户名。
   * 注意：Better Auth 该端点仅返回 { status: true }，不含 user；
   * 需要更新后的 user 请再调 getSession()。 */
  updateUser(body: UpdateUserRequest): Promise<{ status: boolean }> {
    return this.call<{ status: boolean }>("POST", "/api/auth/update-user", body, true);
  }

  /** POST /api/auth/send-verification-email —— 重发验证邮件 */
  sendVerificationEmail(body: SendVerificationEmailRequest): Promise<{ status: boolean }> {
    return this.call<{ status: boolean }>("POST", "/api/auth/send-verification-email", body);
  }

  /** POST /api/auth/email-otp/send-verification-otp —— 发送 6 位邮箱验证码 */
  sendVerificationOtp(body: SendVerificationOTPRequest): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>(
      "POST",
      "/api/auth/email-otp/send-verification-otp",
      body,
    );
  }

  /** POST /api/auth/email-otp/verify-email —— 校验 6 位验证码；token 非空时已自动登录 */
  verifyEmail(body: VerifyEmailOTPRequest): Promise<AuthCallResult> {
    return this.authCall("POST", "/api/auth/email-otp/verify-email", body);
  }

  /** POST /api/auth/request-password-reset —— 忘记密码：发重置邮件 */
  requestPasswordReset(body: RequestPasswordResetRequest): Promise<{ status: boolean }> {
    return this.call<{ status: boolean }>("POST", "/api/auth/request-password-reset", body);
  }

  /** POST /api/auth/reset-password —— 用邮件里的 token 重设密码 */
  resetPassword(body: ResetPasswordRequest): Promise<{ status: boolean }> {
    return this.call<{ status: boolean }>("POST", "/api/auth/reset-password", body);
  }

  /** POST /api/auth/email-otp/request-password-reset —— 忘记密码：向邮箱发 6 位重置验证码 */
  requestPasswordResetOtp(email: string): Promise<RequestPasswordResetOTPResponse> {
    return this.call<RequestPasswordResetOTPResponse>(
      "POST",
      "/api/auth/email-otp/request-password-reset",
      { email },
    );
  }

  /** POST /api/auth/email-otp/reset-password —— 用验证码重设密码（应用内完成） */
  resetPasswordWithOtp(body: ResetPasswordWithOTPRequest): Promise<ResetPasswordWithOTPResponse> {
    return this.call<ResetPasswordWithOTPResponse>(
      "POST",
      "/api/auth/email-otp/reset-password",
      body,
    );
  }

  // ---------- 业务 REST：社区 / 频道 / 成员 ----------

  /** GET /api/communities/discover —— 公开社区目录（模糊搜索 + 排序） */
  discoverCommunities(
    opts: Pick<DiscoverCommunitiesQuery, "q" | "sort" | "limit" | "offset"> = {},
  ): Promise<DiscoverCommunitiesResponse> {
    const qs = toQuery({
      q: opts.q ?? "",
      sort: opts.sort ?? "",
      limit: opts.limit ?? 20,
      offset: opts.offset ?? 0,
    });
    return this.call<DiscoverCommunitiesResponse>(
      "GET",
      `/api/communities/discover${qs}`,
      undefined,
      true,
    );
  }

  /** GET /api/communities/mine —— 我加入的社区（含未读概览） */
  myCommunities(): Promise<GetMyCommunitiesResponse> {
    return this.call<GetMyCommunitiesResponse>("GET", "/api/communities/mine", undefined, true);
  }

  /** GET /api/communities/:id —— 社区详情（频道 + 我的角色） */
  getCommunity(communityId: string): Promise<GetCommunityResponse> {
    return this.call<GetCommunityResponse>(
      "GET",
      `/api/communities/${communityId}`,
      undefined,
      true,
    );
  }

  /** POST /api/communities —— 创建社区 */
  createCommunity(body: CreateCommunityRequest): Promise<CreateCommunityResponse> {
    return this.call<CreateCommunityResponse>("POST", "/api/communities", body, true);
  }

  /** POST /api/communities/join-by-code —— 邀请码加入（私有/公开通用） */
  joinByCode(body: JoinByInviteRequest): Promise<JoinByInviteResponse> {
    return this.call<JoinByInviteResponse>("POST", "/api/communities/join-by-code", body, true);
  }

  /** POST /api/communities/:id/join —— 直接加入公开社区 */
  joinCommunity(communityId: string): Promise<JoinCommunityResponse> {
    return this.call<JoinCommunityResponse>(
      "POST",
      `/api/communities/${communityId}/join`,
      {},
      true,
    );
  }

  /** POST /api/communities/:id/leave —— 退出社区（owner 不能退） */
  leaveCommunity(communityId: string): Promise<LeaveCommunityResponse> {
    return this.call<LeaveCommunityResponse>(
      "POST",
      `/api/communities/${communityId}/leave`,
      {},
      true,
    );
  }

  /** DELETE /api/communities/:id —— 删除社区（仅 owner；内容级联清除） */
  deleteCommunity(communityId: string): Promise<DeleteCommunityResponse> {
    return this.call<DeleteCommunityResponse>(
      "DELETE",
      `/api/communities/${communityId}`,
      undefined,
      true,
    );
  }

  /** POST /api/communities/:id/channels —— 新建频道（owner/admin） */
  createChannel(communityId: string, body: CreateChannelRequest): Promise<CreateChannelResponse> {
    return this.call<CreateChannelResponse>(
      "POST",
      `/api/communities/${communityId}/channels`,
      body,
      true,
    );
  }

  /** PATCH /api/communities/:id —— 改社区（owner/admin） */
  updateCommunity(
    communityId: string,
    body: UpdateCommunityRequest,
  ): Promise<UpdateCommunityResponse> {
    return this.call<UpdateCommunityResponse>(
      "PATCH",
      `/api/communities/${communityId}`,
      body,
      true,
    );
  }

  /** POST /api/communities/:id/invites —— 邀请已注册用户入社区（owner/admin） */
  createInvite(communityId: string, body: CreateInviteRequest): Promise<CreateInviteResponse> {
    return this.call<CreateInviteResponse>(
      "POST",
      `/api/communities/${communityId}/invites`,
      body,
      true,
    );
  }

  /** POST /api/invites/:id/accept —— 接受社区邀请并加入 */
  acceptInvite(inviteId: string): Promise<AcceptInviteResponse> {
    return this.call<AcceptInviteResponse>("POST", `/api/invites/${inviteId}/accept`, {}, true);
  }

  /** POST /api/invites/:id/decline —— 拒绝社区邀请 */
  declineInvite(inviteId: string): Promise<DeclineInviteResponse> {
    return this.call<DeclineInviteResponse>("POST", `/api/invites/${inviteId}/decline`, {}, true);
  }

  /** GET /api/notifications —— 我的站内信（新→旧，带未读数） */
  listNotifications(
    opts: { limit?: number; onlyUnread?: boolean } = {},
  ): Promise<ListNotificationsResponse> {
    const qs = toQuery({
      limit: opts.limit ?? 20,
      onlyUnread: opts.onlyUnread ? "1" : "",
    });
    return this.call<ListNotificationsResponse>("GET", `/api/notifications${qs}`, undefined, true);
  }

  /** POST /api/notifications/:id/read —— 标记一条站内信已读 */
  markNotificationRead(notificationId: string): Promise<MarkNotificationReadResponse> {
    return this.call<MarkNotificationReadResponse>(
      "POST",
      `/api/notifications/${notificationId}/read`,
      {},
      true,
    );
  }

  /** POST /api/notifications/read-all —— 全部已读 */
  markAllNotificationsRead(): Promise<MarkAllNotificationsReadResponse> {
    return this.call<MarkAllNotificationsReadResponse>(
      "POST",
      "/api/notifications/read-all",
      {},
      true,
    );
  }

  /** GET /api/communities/:id/members —— 成员列表（须是成员；可按角色 id 过滤） */
  listMembers(
    communityId: string,
    query: Pick<ListMembersQuery, "roleId" | "q" | "limit" | "offset"> = {},
  ): Promise<ListMembersResponse> {
    const qs = toQuery({
      roleId: query.roleId ?? "",
      q: query.q ?? "",
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    });
    return this.call<ListMembersResponse>(
      "GET",
      `/api/communities/${communityId}/members${qs}`,
      undefined,
      true,
    );
  }

  /** PUT /api/communities/:id/members/:userId/roles —— 设置成员角色全集（MANAGE_CHANNEL） */
  setMemberRoles(
    communityId: string,
    userId: string,
    body: SetMemberRolesRequest,
  ): Promise<SetMemberRolesResponse> {
    return this.call<SetMemberRolesResponse>(
      "PUT",
      `/api/communities/${communityId}/members/${userId}/roles`,
      body,
      true,
    );
  }

  /** POST /api/communities/:id/transfer-owner —— 转让所有权（仅 owner） */
  transferOwner(communityId: string, body: TransferOwnerRequest): Promise<TransferOwnerResponse> {
    return this.call<TransferOwnerResponse>(
      "POST",
      `/api/communities/${communityId}/transfer-owner`,
      body,
      true,
    );
  }

  // ---------- 业务 REST：角色 & 频道权限覆盖 ----------

  /** GET /api/communities/:id/roles —— 社区全部角色（成员可见） */
  listRoles(communityId: string): Promise<ListRolesResponse> {
    return this.call<ListRolesResponse>(
      "GET",
      `/api/communities/${communityId}/roles`,
      undefined,
      true,
    );
  }

  /** POST /api/communities/:id/roles —— 新建角色（MANAGE_ROLES） */
  createRole(communityId: string, body: CreateRoleRequest): Promise<CreateRoleResponse> {
    return this.call<CreateRoleResponse>(
      "POST",
      `/api/communities/${communityId}/roles`,
      body,
      true,
    );
  }

  /** PUT /api/communities/:id/roles/order —— 整体重排角色层级（MANAGE_ROLES，order 从高到低） */
  reorderRoles(communityId: string, body: ReorderRolesRequest): Promise<ReorderRolesResponse> {
    return this.call<ReorderRolesResponse>(
      "PUT",
      `/api/communities/${communityId}/roles/order`,
      body,
      true,
    );
  }

  /** PATCH /api/communities/:id/roles/:roleId —— 改角色（MANAGE_ROLES） */
  updateRole(
    communityId: string,
    roleId: string,
    body: UpdateRoleRequest,
  ): Promise<UpdateRoleResponse> {
    return this.call<UpdateRoleResponse>(
      "PATCH",
      `/api/communities/${communityId}/roles/${roleId}`,
      body,
      true,
    );
  }

  /** DELETE /api/communities/:id/roles/:roleId —— 删角色（MANAGE_CHANNEL） */
  deleteRole(communityId: string, roleId: string): Promise<DeleteRoleResponse> {
    return this.call<DeleteRoleResponse>(
      "DELETE",
      `/api/communities/${communityId}/roles/${roleId}`,
      undefined,
      true,
    );
  }

  /** GET /api/channels/:id/overwrites —— 频道的权限覆盖列表（MANAGE_CHANNEL） */
  listChannelOverwrites(channelId: string): Promise<ListChannelOverwritesResponse> {
    return this.call<ListChannelOverwritesResponse>(
      "GET",
      `/api/channels/${channelId}/overwrites`,
      undefined,
      true,
    );
  }

  /** PUT /api/channels/:id/overwrites/:targetType/:targetId —— 写入覆盖（MANAGE_CHANNEL） */
  setChannelOverwrite(
    channelId: string,
    targetType: OverwriteTargetType,
    targetId: string,
    body: SetChannelOverwriteRequest,
  ): Promise<SetChannelOverwriteResponse> {
    return this.call<SetChannelOverwriteResponse>(
      "PUT",
      `/api/channels/${channelId}/overwrites/${targetType}/${encodeURIComponent(targetId)}`,
      body,
      true,
    );
  }

  /** DELETE /api/channels/:id/overwrites/:targetType/:targetId —— 清除覆盖（MANAGE_CHANNEL） */
  deleteChannelOverwrite(
    channelId: string,
    targetType: OverwriteTargetType,
    targetId: string,
  ): Promise<DeleteChannelOverwriteResponse> {
    return this.call<DeleteChannelOverwriteResponse>(
      "DELETE",
      `/api/channels/${channelId}/overwrites/${targetType}/${encodeURIComponent(targetId)}`,
      undefined,
      true,
    );
  }

  /** DELETE /api/communities/:id/members/:userId —— 踢人（owner/admin，不能踢 owner） */
  removeMember(communityId: string, userId: string): Promise<RemoveMemberResponse> {
    return this.call<RemoveMemberResponse>(
      "DELETE",
      `/api/communities/${communityId}/members/${userId}`,
      undefined,
      true,
    );
  }

  /** GET /api/communities/:id/bans —— 封禁列表（owner/admin） */
  listBans(communityId: string): Promise<ListCommunityBansResponse> {
    return this.call<ListCommunityBansResponse>(
      "GET",
      `/api/communities/${communityId}/bans`,
      undefined,
      true,
    );
  }

  /** POST /api/communities/:id/bans —— 封禁（按 userId 或 handleOrEmail） */
  banUser(
    communityId: string,
    body: BanCommunityMemberRequest,
  ): Promise<BanCommunityMemberResponse> {
    return this.call<BanCommunityMemberResponse>(
      "POST",
      `/api/communities/${communityId}/bans`,
      body,
      true,
    );
  }

  /** DELETE /api/communities/:id/bans/:userId —— 解封 */
  unbanUser(communityId: string, userId: string): Promise<Record<string, never>> {
    return this.call<Record<string, never>>(
      "DELETE",
      `/api/communities/${communityId}/bans/${userId}`,
      undefined,
      true,
    );
  }

  /** PATCH /api/channels/:id —— 频道改名/主题/类型（owner/admin） */
  updateChannel(channelId: string, body: UpdateChannelRequest): Promise<UpdateChannelResponse> {
    return this.call<UpdateChannelResponse>("PATCH", `/api/channels/${channelId}`, body, true);
  }

  /** DELETE /api/channels/:id —— 删频道（owner/admin） */
  deleteChannel(channelId: string): Promise<DeleteChannelResponse> {
    return this.call<DeleteChannelResponse>(
      "DELETE",
      `/api/channels/${channelId}`,
      undefined,
      true,
    );
  }

  // ---------- 业务 REST：消息 & 未读 ----------

  /** GET /api/channels/:id/messages —— 历史（desc 新→旧；cursor=某条 createdAt 翻更早）
   *  threadId 传讨论组 id 时返回该讨论组消息；缺省为主频道直接消息 */
  listMessages(
    channelId: string,
    opts: Pick<ListMessagesQuery, "cursor" | "limit" | "direction" | "threadId"> = {},
  ): Promise<ListMessagesResponse> {
    const query = toQuery({
      cursor: opts.cursor ?? "",
      limit: opts.limit ?? 50,
      direction: opts.direction ?? "desc",
      threadId: opts.threadId ?? "",
    });
    return this.call<ListMessagesResponse>(
      "GET",
      `/api/channels/${channelId}/messages${query}`,
      undefined,
      true,
    );
  }

  /** POST /api/channels/:id/messages —— 发消息 */
  createMessage(channelId: string, body: CreateMessageRequest): Promise<CreateMessageResponse> {
    return this.call<CreateMessageResponse>(
      "POST",
      `/api/channels/${channelId}/messages`,
      body,
      true,
    );
  }

  /** PATCH /api/messages/:id —— 编辑消息（作者或 owner/admin） */
  updateMessage(messageId: string, body: UpdateMessageRequest): Promise<UpdateMessageResponse> {
    return this.call<UpdateMessageResponse>("PATCH", `/api/messages/${messageId}`, body, true);
  }

  /** DELETE /api/messages/:id —— 删除消息（作者或 owner/admin） */
  deleteMessage(messageId: string): Promise<Record<string, never>> {
    return this.call<Record<string, never>>(
      "DELETE",
      `/api/messages/${messageId}`,
      undefined,
      true,
    );
  }

  /** POST /api/messages/:id/reactions —— 切换表情回应（已回应过则取消），返回最新聚合 */
  toggleMessageReaction(messageId: string, emoji: string): Promise<ToggleMessageReactionResponse> {
    const body: ToggleMessageReactionRequest = { emoji };
    return this.call<ToggleMessageReactionResponse>(
      "POST",
      `/api/messages/${messageId}/reactions`,
      body,
      true,
    );
  }

  /** POST /api/messages/:id/pin —— 置顶消息（社区 MANAGE_MESSAGES） */
  pinMessage(messageId: string): Promise<PinMessageResponse> {
    return this.call<PinMessageResponse>("POST", `/api/messages/${messageId}/pin`, undefined, true);
  }

  /** DELETE /api/messages/:id/pin —— 取消置顶 */
  unpinMessage(messageId: string): Promise<UnpinMessageResponse> {
    return this.call<UnpinMessageResponse>(
      "DELETE",
      `/api/messages/${messageId}/pin`,
      undefined,
      true,
    );
  }

  /** GET /api/channels/:id/pins —— 该房间的置顶消息（threadId 非空时取讨论组内的） */
  listPinned(channelId: string, threadId: string | null = null): Promise<ListPinsResponse> {
    const query = toQuery({ threadId: threadId ?? "" });
    return this.call<ListPinsResponse>(
      "GET",
      `/api/channels/${channelId}/pins${query}`,
      undefined,
      true,
    );
  }

  /** GET /api/channels/:id/read-state —— 未读快照 */
  getReadState(channelId: string): Promise<GetReadStateResponse> {
    return this.call<GetReadStateResponse>(
      "GET",
      `/api/channels/${channelId}/read-state`,
      undefined,
      true,
    );
  }

  /** POST /api/channels/:id/read-state —— 上报已读 */
  markRead(channelId: string, body: UpdateReadStateRequest): Promise<GetReadStateResponse> {
    return this.call<GetReadStateResponse>(
      "POST",
      `/api/channels/${channelId}/read-state`,
      body,
      true,
    );
  }

  /** GET /api/communities/:id/online —— 社区当前在线成员（聚合各房间后按用户去重） */
  communityOnline(communityId: string): Promise<GetCommunityOnlineResponse> {
    return this.call<GetCommunityOnlineResponse>(
      "GET",
      `/api/communities/${communityId}/online`,
      undefined,
      true,
    );
  }

  // ---------- 业务 REST：讨论组（thread） ----------

  /** GET /api/channels/:channelId/threads —— 频道讨论组（默认活跃；archived=all 含归档） */
  listThreads(
    channelId: string,
    archived: "all" | undefined = undefined,
  ): Promise<ListThreadsResponse> {
    const query = toQuery({ archived: archived ?? "" });
    return this.call<ListThreadsResponse>(
      "GET",
      `/api/channels/${channelId}/threads${query}`,
      undefined,
      true,
    );
  }

  /** POST /api/channels/:channelId/threads —— 创建讨论组（可带起点消息） */
  createThread(channelId: string, body: CreateThreadRequest): Promise<CreateThreadResponse> {
    return this.call<CreateThreadResponse>(
      "POST",
      `/api/channels/${channelId}/threads`,
      body,
      true,
    );
  }

  /** GET /api/threads/:id —— 讨论组详情（含我未读） */
  getThread(threadId: string): Promise<ThreadSummary> {
    return this.call<ThreadSummary>("GET", `/api/threads/${threadId}`, undefined, true);
  }

  /** PATCH /api/threads/:id —— 改名 / 改可见性 / 改密码（发起人或 owner/admin） */
  updateThread(threadId: string, patch: UpdateThreadRequest): Promise<ThreadSummary> {
    return this.call<ThreadSummary>("PATCH", `/api/threads/${threadId}`, patch, true);
  }

  /** POST /api/threads/:id/join —— 凭密码进入私密讨论组（公开组幂等；无密码的私密组 403） */
  joinThread(threadId: string, passcode?: string): Promise<JoinThreadResponse> {
    const body: JoinThreadRequest = {};
    if (passcode !== undefined && passcode.length > 0) body.passcode = passcode;
    return this.call<JoinThreadResponse>("POST", `/api/threads/${threadId}/join`, body, true);
  }

  /** GET /api/threads/:id/members —— 讨论组成员名单（需可进入该讨论组） */
  listThreadMembers(threadId: string): Promise<ListThreadMembersResponse> {
    return this.call<ListThreadMembersResponse>(
      "GET",
      `/api/threads/${threadId}/members`,
      undefined,
      true,
    );
  }

  /** POST /api/threads/:id/members —— 直接把社区成员拉入讨论组 */
  addThreadMember(threadId: string, userId: string): Promise<AddThreadMemberResponse> {
    return this.call<AddThreadMemberResponse>(
      "POST",
      `/api/threads/${threadId}/members`,
      { userId },
      true,
    );
  }

  /** DELETE /api/threads/:id/members/:userId —— 移除成员（移除自己即退出） */
  removeThreadMember(threadId: string, userId: string): Promise<RemoveThreadMemberResponse> {
    return this.call<RemoveThreadMemberResponse>(
      "DELETE",
      `/api/threads/${threadId}/members/${userId}`,
      undefined,
      true,
    );
  }

  /** GET /api/threads/:id/candidates?q= —— 可拉入的社区成员（尚未在组内） */
  listThreadCandidates(threadId: string, q?: string): Promise<ListThreadCandidatesResponse> {
    const query = toQuery({ q: q ?? "" });
    return this.call<ListThreadCandidatesResponse>(
      "GET",
      `/api/threads/${threadId}/candidates${query}`,
      undefined,
      true,
    );
  }

  /** POST /api/threads/:id/archive —— 手动归档 */
  archiveThread(threadId: string): Promise<ThreadSummary> {
    return this.call<ThreadSummary>("POST", `/api/threads/${threadId}/archive`, {}, true);
  }

  /** POST /api/threads/:id/reopen —— 恢复活跃 */
  reopenThread(threadId: string): Promise<ThreadSummary> {
    return this.call<ThreadSummary>("POST", `/api/threads/${threadId}/reopen`, {}, true);
  }

  /** DELETE /api/threads/:id —— 删除讨论组 */
  deleteThread(threadId: string): Promise<Record<string, never>> {
    return this.call<Record<string, never>>("DELETE", `/api/threads/${threadId}`, undefined, true);
  }

  /** GET /api/threads/:id/read-state —— 我在讨论组的已读 */
  getThreadReadState(threadId: string): Promise<GetThreadReadStateResponse> {
    return this.call<GetThreadReadStateResponse>(
      "GET",
      `/api/threads/${threadId}/read-state`,
      undefined,
      true,
    );
  }

  /** POST /api/threads/:id/read-state —— 上报读到讨论组的哪条 */
  markThreadRead(
    threadId: string,
    body: UpdateThreadReadStateRequest,
  ): Promise<UpdateThreadReadStateResponse> {
    return this.call<UpdateThreadReadStateResponse>(
      "POST",
      `/api/threads/${threadId}/read-state`,
      body,
      true,
    );
  }

  /** GET /api/messages/search —— 社区内消息搜索（关键词 + 可选频道/作者/时间/@我 筛选，倒序） */
  searchMessages(
    communityId: string,
    q: string,
    opts: {
      cursor?: string;
      limit?: number;
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
    } = {},
  ): Promise<SearchMessagesResponse> {
    const query = toQuery({
      communityId,
      q,
      cursor: opts.cursor ?? "",
      limit: opts.limit ?? 20,
      channelId: opts.channelId ?? "",
      authorId: opts.authorId ?? "",
      from: opts.from ?? "",
      to: opts.to ?? "",
      mentionsMe: opts.mentionsMe ? "true" : "",
    });
    return this.call<SearchMessagesResponse>(
      "GET",
      `/api/messages/search${query}`,
      undefined,
      true,
    );
  }

  // ---------- 业务 REST：分享（DSH 会话） ----------

  /** POST /api/shares/agent-session —— 登记一条 DSH 会话分享（包体已直传 R2） */
  createAgentSessionShare(
    body: CreateAgentSessionShareRequest,
  ): Promise<CreateAgentSessionShareResponse> {
    return this.call<CreateAgentSessionShareResponse>(
      "POST",
      "/api/shares/agent-session",
      body,
      true,
    );
  }

  /** GET /api/shares/:id —— 分享详情（含 downloadUrl） */
  getShare(shareId: string): Promise<GetShareResponse> {
    return this.call<GetShareResponse>("GET", `/api/shares/${shareId}`, undefined, true);
  }

  /**
   * PUT /api/r2/objects —— 直传一个附件文件（body = 文件原始字节，非 JSON）。
   * 文件名为非 ASCII 时浏览器不允许放进请求头，故 X-File-Name 用 URL 编码传输。
   */
  async uploadObject(file: File): Promise<UploadAttachmentResponse> {
    if (!this.hasToken) throw new ServerApiError(401, "UNAUTHORIZED", "未登录");
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      "x-file-name": encodeURIComponent(file.name),
    };
    if (file.type.length > 0) headers["content-type"] = file.type;

    const res = await fetch(this.url("/api/r2/objects"), {
      method: "PUT",
      headers,
      body: file,
    });
    return parseResponse<UploadAttachmentResponse>(res);
  }
}
