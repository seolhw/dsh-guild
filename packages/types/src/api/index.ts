// ---------------------------------------------------------------
// Server REST API 类型总入口
// ---------------------------------------------------------------

export * from "./auth";
export * from "./common";
export * from "./communities";
export * from "./inbox";
export * from "./messages";
export * from "./r2";
export * from "./shares";
export * from "./threads";

// ---------------------------------------------------------------
// 路由总表（仅供人阅读的「契约目录」，非运行时用）
// 实际实现在 server/src/worker.ts
// ---------------------------------------------------------------

/**
 * 路由契约（方法 + 路径 → 请求/响应类型）
 *
 *  认证（由 Better Auth 提供，路径都在 /api/auth 下；会话 = Bearer Token）
 *   POST  /api/auth/sign-up/email       邮箱注册（用户名可选）
 *   POST  /api/auth/sign-in/email       邮箱登录
 *   POST  /api/auth/sign-in/username    用户名登录（username 插件）
 *   POST  /api/auth/sign-out            登出（吊销会话）
 *   GET   /api/auth/get-session         当前会话（user + session）
 *   POST  /api/auth/change-password     修改密码
 *   POST  /api/auth/update-user         改资料 / 改用户名
 *   POST  /api/auth/send-verification-email      重发验证邮件
 *   POST  /api/auth/request-password-reset       忘记密码（发重置邮件）
 *   POST  /api/auth/reset-password      用 token 重设密码
 *   （登录/注册成功后，响应头 set-auth-token 即会话 token）
 *
 *  社区
 *   GET   /api/communities/discover   query:DiscoverCommunitiesQuery  → DiscoverCommunitiesResponse
 *   GET   /api/communities/mine       —                                → GetMyCommunitiesResponse
 *   POST  /api/communities            CreateCommunityRequest           → CreateCommunityResponse
 *   GET   /api/communities/:id        —                                → GetCommunityResponse
 *   PATCH /api/communities/:id        UpdateCommunityRequest           → UpdateCommunityResponse
 *   POST  /api/communities/join-by-code      JoinByInviteRequest       → JoinByInviteResponse
 *   POST  /api/communities/:id/join   —                                → JoinCommunityResponse
 *   POST  /api/communities/:id/leave  —                                → LeaveCommunityResponse
 *   POST  /api/communities/:id/transfer-owner  TransferOwnerRequest     → TransferOwnerResponse
 *   DELETE /api/communities/:id       —                                → DeleteCommunityResponse
 *
 *  频道
 *   POST  /api/communities/:id/channels  CreateChannelRequest       → CreateChannelResponse
 *   PATCH /api/channels/:id              UpdateChannelRequest       → UpdateChannelResponse
 *   DELETE /api/channels/:id             —                         → DeleteChannelResponse
 *
 *  角色（Discord 式；MANAGE_ROLES）
 *   GET    /api/communities/:id/roles                    —                  → ListRolesResponse
 *   POST   /api/communities/:id/roles                    CreateRoleRequest  → CreateRoleResponse
 *   PUT    /api/communities/:id/roles/order              ReorderRolesRequest → ReorderRolesResponse
 *   PATCH  /api/communities/:id/roles/:roleId            UpdateRoleRequest  → UpdateRoleResponse
 *   DELETE /api/communities/:id/roles/:roleId            —                  → DeleteRoleResponse
 *
 *  频道权限覆盖（overwrite；社区级 MANAGE_CHANNEL，仅接受频道级权限位）
 *   GET    /api/channels/:id/overwrites                                  → ListChannelOverwritesResponse
 *   PUT    /api/channels/:id/overwrites/:targetType/:targetId  SetChannelOverwriteRequest → SetChannelOverwriteResponse
 *   DELETE /api/channels/:id/overwrites/:targetType/:targetId —          → DeleteChannelOverwriteResponse
 *
 *  成员
 *   GET   /api/communities/:id/members        query:ListMembersQuery   → ListMembersResponse
 *   PUT   /api/communities/:id/members/:userId/roles  SetMemberRolesRequest → SetMemberRolesResponse
 *   DELETE /api/communities/:id/members/:userId      —                 → RemoveMemberResponse
 *
 *  社区在线（聚合各频道 + 活跃讨论组的 presence，按用户去重）
 *   GET   /api/communities/:id/online         —                        → GetCommunityOnlineResponse
 *
 *  封禁（成员被移出后阻止重新加入；BAN_MEMBERS）
 *   GET    /api/communities/:id/bans              —                            → ListCommunityBansResponse
 *   POST   /api/communities/:id/bans              BanCommunityMemberRequest    → BanCommunityMemberResponse
 *   DELETE /api/communities/:id/bans/:userId      —                            → UnbanCommunityMemberResponse
 *
 *  邀请 / 站内信（发邀请需 INVITE_MEMBERS）
 *   POST  /api/communities/:id/invites   CreateInviteRequest       → CreateInviteResponse
 *   POST  /api/invites/:id/accept        —                         → AcceptInviteResponse
 *   POST  /api/invites/:id/decline       —                         → DeclineInviteResponse
 *   GET   /api/notifications             query:ListNotificationsQuery → ListNotificationsResponse
 *   POST  /api/notifications/:id/read    —                         → MarkNotificationReadResponse
 *   POST  /api/notifications/read-all    —                         → MarkAllNotificationsReadResponse
 *
 *  邀请链接（分享链接 = {origin}/invite/{inviteCode}，公开无鉴权）
 *   GET   /invite/:code                  —                         → HTML 落地页
 *
 *  消息
 *   GET    /api/channels/:id/messages          query:ListMessagesQuery  → ListMessagesResponse
 *   POST   /api/channels/:id/messages          CreateMessageRequest     → CreateMessageResponse
 *   PATCH  /api/messages/:id                   UpdateMessageRequest     → UpdateMessageResponse
 *   DELETE /api/messages/:id                   —                        → DeleteMessageResponse
 *   POST   /api/messages/:id/reactions         ToggleMessageReactionRequest → ToggleMessageReactionResponse
 *   GET    /api/messages/search                query:SearchMessagesQuery → SearchMessagesResponse
 *
 *  讨论组（thread；消息复用上面同一套，传 ?threadId= / body.threadId）
 *   可见性 public/private：私密组非成员"可见但加锁"，可凭密码进入或被邀请
 *   GET    /api/channels/:channelId/threads    query:ListThreadsQuery   → ListThreadsResponse
 *   POST   /api/channels/:channelId/threads    CreateThreadRequest      → CreateThreadResponse
 *   GET    /api/threads/:id                    —                        → ThreadSummary
 *   PATCH  /api/threads/:id                    UpdateThreadRequest      → UpdateThreadResponse
 *   POST   /api/threads/:id/archive            —                        → ArchiveThreadResponse
 *   POST   /api/threads/:id/reopen             —                        → ReopenThreadResponse
 *   DELETE /api/threads/:id                    —                        → DeleteThreadResponse
 *   POST   /api/threads/:id/join               JoinThreadRequest        → JoinThreadResponse
 *   GET    /api/threads/:id/members            —                        → ListThreadMembersResponse
 *   POST   /api/threads/:id/members            AddThreadMemberRequest   → AddThreadMemberResponse
 *   DELETE /api/threads/:id/members/:userId    —                        → RemoveThreadMemberResponse
 *   GET    /api/threads/:id/candidates         query:ListThreadCandidatesQuery → ListThreadCandidatesResponse
 *   GET    /api/threads/:id/read-state         —                        → GetThreadReadStateResponse
 *   POST   /api/threads/:id/read-state         UpdateThreadReadStateRequest → UpdateThreadReadStateResponse
 *
 *  未读 / 在线
 *   GET    /api/channels/:id/read-state        —                        → GetReadStateResponse
 *   POST   /api/channels/:id/read-state        UpdateReadStateRequest   → UpdateReadStateResponse
 *   GET    /api/channels/:id/online            —                        → GetChannelOnlineResponse
 *
 *  分享（agent-session DSH 会话）
 *   POST   /api/shares/agent-session         CreateAgentSessionShareRequest → CreateAgentSessionShareResponse
 *   GET    /api/shares/:id                   —                          → GetShareResponse
 *   （分享卡片随消息发出时带 CreateMessageRequest.shareId）
 *
 *  附件（R2，Worker 直写）
 *   PUT   /api/r2/objects              原始字节 body + X-File-Name(URL 编码)
 *                                      + Content-Type → UploadAttachmentResponse
 *   GET   /api/r2/objects/:key         公开读取（key 不可枚举）；?download=1 触发下载
 *
 *  WebSocket 升级
 *   GET    /ws                               Upgrade header             → WebSocket 连接
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const _ROUTE_CONTRACT: unique symbol;
