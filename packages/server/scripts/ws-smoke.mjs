// 冒烟：每频道一个 ChannelActor(DO) 的实时链路
//   /ws?token=<session>&channelId=<id> → Worker 鉴权 → 频道 DO 成员校验 → 101
//   REST 写库成功 → RPC stub.broadcast(frame) → DO 实例内扇出（mentionMe 逐人计算）
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8787";
// 本包根目录（wrangler 命令的工作目录，用于直读本地 D1 里的邮箱验证码）
const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
// 认证请求必须带 Origin（缺了 better-auth 直接拒 MISSING_OR_NULL_ORIGIN），
// 且必须「已信任 + 与 Worker 不同源」：同源时 wrangler dev 会按 wrangler.jsonc 的
// routes 把它改写成自定义域 Origin，该域不在本地白名单里 → 403 INVALID_ORIGIN。
const ORIGIN = "http://127.0.0.1:3000";
const WS = BASE.replace(/^http/, "ws");
const ts = Date.now();

async function call(method, path, body, token) {
  const headers = { origin: ORIGIN };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** PUT /api/r2/objects —— 原始字节直传（Worker 直写 R2） */
async function uploadAttachment(token, name, bytes, contentType) {
  const res = await fetch(`${BASE}/api/r2/objects`, {
    method: "PUT",
    headers: {
      origin: ORIGIN,
      authorization: `Bearer ${token}`,
      "x-file-name": encodeURIComponent(name),
      "content-type": contentType,
    },
    body: bytes,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** 直读本地 D1 里该邮箱最近一条验证码（value 形如 "<otp>:<attempts>"，仅本地冒烟可用） */
function readLocalOtp(email) {
  const out = execSync(
    `wrangler d1 execute dsh-talk --local --json --command "SELECT value FROM verification WHERE identifier = 'email-verification-otp-${email}' ORDER BY createdAt DESC LIMIT 1"`,
    { cwd: SERVER_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const value = JSON.parse(out)?.[0]?.results?.[0]?.value;
  if (typeof value !== "string") throw new Error(`未找到邮箱验证码：${email}`);
  return value.split(":")[0];
}

// requireEmailVerification：注册不建会话，需走「注册 → 邮箱验证码 → 会话 token」，
// 与客户端一致从响应头 set-auth-token 取 token。
async function signup(name) {
  const email = `${name}${ts}@example.com`;
  const res = await call("POST", "/api/auth/sign-up/email", {
    name,
    email,
    password: "Password1234",
    username: `${name}${ts.toString(36)}`,
  });
  console.log(`signup ${name} -> ${res.status}`);
  const otp = readLocalOtp(email);
  const verify = await fetch(`${BASE}/api/auth/email-otp/verify-email`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  const token = verify.headers.get("set-auth-token");
  if (verify.status !== 200 || !token) {
    throw new Error(`邮箱验证失败 ${name} -> ${verify.status}`);
  }
  console.log(`verify ${name} -> 已获得会话 token`);
  return token;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`ok: ${msg}`);
}

function connectWs(token, channelId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}&channelId=${channelId}`);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error("ws open failed")));
  });
}

/** 期望连接失败（非 101，如非成员被拒） */
function expectWsRejected(token, channelId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}&channelId=${channelId}`);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("expected rejection but ws stayed open"));
    }, 5000);
    const onOpen = () => {
      cleanup();
      ws.close();
      reject(new Error("expected rejection but ws opened"));
    };
    const onError = () => {
      cleanup();
      resolve(undefined);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
  });
}

function waitFrame(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting frame"));
    }, timeoutMs);
    const onMsg = (ev) => {
      const frame = JSON.parse(String(ev.data));
      if (predicate(frame)) {
        cleanup();
        resolve(frame);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMsg);
    };
    ws.addEventListener("message", onMsg);
  });
}

const tokenA = await signup("chalice");
const tokenB = await signup("chbob");
const comm = await call("POST", "/api/communities", { name: "Channel DO Test", privacy: "public" }, tokenA);
assert(comm.status === 201, "A 建社区");
// 建社区时预置「管理员」角色：普通角色，权限位 = 当时全部权限（bit0..bit10 = 2047）
const rolesRes = await call("GET", `/api/communities/${comm.json.id}/roles`, undefined, tokenA);
const adminRole = rolesRes.json?.items?.find((r) => r.name === "管理员");
assert(adminRole !== undefined, "建社区时预置「管理员」角色");
assert(adminRole?.permissions === (1 << 11) - 1, "预置管理员角色拥有全部权限位");
assert(adminRole?.isEveryone === false, "预置管理员角色不是 @everyone");
const channelId = comm.json.channels.find((ch) => ch.name === "全员").id;
await call("POST", `/api/communities/${comm.json.id}/join`, {}, tokenB);

// A 直连 general 频道的 ChannelActor
const ws = await connectWs(tokenA, channelId);
const hello = await waitFrame(ws, (f) => f.type === "evt.hello");
assert(hello.payload.channelId === channelId, "hello 携带 channelId");
assert(hello.payload.user.handle.startsWith("chalice"), "hello 携带身份");
assert(typeof hello.payload.onlineCount === "number", "hello 带在线数");

// 社区在线接口：聚合社区各房间的在线名单并按用户去重（此刻只有 A 一条长连接）
const onlineRes = await call("GET", `/api/communities/${comm.json.id}/online`, undefined, tokenA);
assert(onlineRes.status === 200, "社区在线接口 200");
assert(onlineRes.json?.count === 1, "社区在线人数 = 1（仅 A 保持连接）");
assert(
  onlineRes.json?.members?.[0]?.handle.startsWith("chalice"),
  "社区在线成员里含 A",
);

// B 发 @chalice 消息 -> A 的频道 DO 扇出 evt.message.new 且 mentionMe=true
const newP = waitFrame(ws, (f) => f.type === "evt.message.new");
const post = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "hi per-channel realtime", mentionHandles: [`chalice${ts.toString(36)}`] },
  tokenB,
);
assert(post.status === 201, "B REST 发消息成功");
const newEvt = await newP;
assert(newEvt.payload.channelId === channelId, "收到 evt.message.new");
assert(newEvt.payload.message.content === "hi per-channel realtime", "消息内容一致");
assert(newEvt.payload.mentionMe === true, "mentionMe=true");

// 解析不到的 @handle 不是错误：正文里的 @ 当作普通字符，照常发出去、不进 mentions
const strayMention = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "价格 @ 100 元，@没有这个人 也是普通字符", mentionHandles: ["没有这个人"] },
  tokenB,
);
assert(strayMention.status === 201, "无法解析的 @handle 不再报错（201）");
assert((strayMention.json?.mentions ?? []).length === 0, "无法解析的 @handle 不进 mentions");
assert(strayMention.json?.content.includes("@没有这个人"), "正文里的 @ 原样保留");

// ping 心跳应答 + presence.set 应答
const pongP = waitFrame(ws, (f) => f.id === "pg");
ws.send(JSON.stringify({ type: "ping", payload: { clientTime: Date.now() }, id: "pg" }));
const pong = await pongP;
assert(pong.type === "ok" && pong.payload.echoClientTime, "ping -> ok");
const preP = waitFrame(ws, (f) => f.id === "ps");
ws.send(JSON.stringify({ type: "presence.set", payload: { kind: "away" }, id: "ps" }));
const pre = await preP;
assert(pre.type === "ok" && pre.payload.kind === "away", "presence.set -> ok");

// B 改消息 -> A 收 evt.message.updated
const updP = waitFrame(ws, (f) => f.type === "evt.message.updated");
const patch = await call("PATCH", `/api/messages/${post.json.id}`, { content: "hi edited" }, tokenB);
assert(patch.status === 200, "B 改消息成功");
const updEvt = await updP;
assert(updEvt.payload.message.content === "hi edited", "收到 evt.message.updated");

// B 删消息 -> A 收 evt.message.deleted
const delP = waitFrame(ws, (f) => f.type === "evt.message.deleted");
await call("DELETE", `/api/messages/${post.json.id}`, undefined, tokenB);
const delEvt = await delP;
assert(delEvt.payload.messageId === post.json.id, "收到 evt.message.deleted");

// 附件链路：B 直传 R2 → 带附件发消息 → A 收到含图片附件的广播；误引用/读回也要对
const upl = await uploadAttachment(
  tokenB,
  "pic.png",
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  "image/png",
);
assert(upl.status === 201 && upl.json?.r2Key?.startsWith("att"), "B 直传 R2 成功");
const attachP = waitFrame(
  ws,
  (f) => f.type === "evt.message.new" && (f.payload.message.attachments ?? []).length > 0,
);
const withAtt = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "look at this", attachments: [{ r2Key: upl.json.r2Key, name: "pic.png", size: upl.json.size }] },
  tokenB,
);
assert(withAtt.status === 201, "B 带附件发消息成功");
const evtAtt = await attachP;
const sentAtt = evtAtt.payload.message.attachments?.[0];
assert(
  sentAtt && sentAtt.kind === "image" && sentAtt.url.includes(upl.json.r2Key),
  "广播携带图片附件（kind=image + url）",
);

const bad = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "bad attach", attachments: [{ r2Key: "attNoSuchObject", name: "x.txt", size: 1 }] },
  tokenB,
);
assert(bad.status === 400, "引用不存在附件被拒（400）");

// 表情回应：B 投一个 → A 收 evt.message.reactions；A 再投/取消，计数与 me 都要对
const reactP = waitFrame(ws, (f) => f.type === "evt.message.reactions");
const reacted = await call(
  "POST",
  `/api/messages/${withAtt.json.id}/reactions`,
  { emoji: "👍" },
  tokenB,
);
assert(reacted.status === 200, "B 添加表情回应成功");
assert(
  reacted.json.reactions.length === 1 &&
    reacted.json.reactions[0].count === 1 &&
    reacted.json.reactions[0].me === true,
  "回应聚合 count=1 / me=true",
);
const reactEvt = await reactP;
assert(
  reactEvt.payload.messageId === withAtt.json.id && reactEvt.payload.reactions[0]?.emoji === "👍",
  "收到 evt.message.reactions（含 emoji）",
);
const reacted2 = await call(
  "POST",
  `/api/messages/${withAtt.json.id}/reactions`,
  { emoji: "👍" },
  tokenA,
);
assert(
  reacted2.json.reactions[0].count === 2 && reacted2.json.reactions[0].me === true,
  "两人回应同一 emoji -> count=2",
);
const reacted3 = await call(
  "POST",
  `/api/messages/${withAtt.json.id}/reactions`,
  { emoji: "👍" },
  tokenA,
);
assert(
  reacted3.json.reactions[0].count === 1 && reacted3.json.reactions[0].me === false,
  "再投一次 = 取消（count 回落 1）",
);
const listWithReactions = await call(
  "GET",
  `/api/channels/${channelId}/messages?limit=50`,
  undefined,
  tokenA,
);
const reactedRow = listWithReactions.json.items.find((m) => m.id === withAtt.json.id);
assert(reactedRow?.reactions?.[0]?.count === 1, "历史消息列表带回应聚合");

// 未读角标：别人发的消息算未读，自己发的消息永远不算（否则发完就给自己亮角标）
const myCommunity = async () =>
  (await call("GET", "/api/communities/mine", undefined, tokenA)).json.find(
    (c) => c.id === comm.json.id,
  );
const probe = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "unread probe" },
  tokenB,
);
assert((await myCommunity())?.unreadChannels >= 1, "B 发言后 A 出现未读频道角标");
await call(
  "POST",
  `/api/channels/${channelId}/read-state`,
  { lastReadMessageId: probe.json.id },
  tokenA,
);
assert((await myCommunity())?.unreadChannels === 0, "A 读完未读清零");
await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "这条是我自己发的" },
  tokenA,
);
assert((await myCommunity())?.unreadChannels === 0, "A 自己发的消息不算未读");

// 讨论组未读同理：自己发的不算，别人发的算
const thread = await call(
  "POST",
  `/api/channels/${channelId}/threads`,
  { name: "未读冒烟" },
  tokenA,
);
assert(thread.status === 201 || thread.status === 200, "A 建讨论组");
await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "话题里我自己的消息", threadId: thread.json.id },
  tokenA,
);
const threadsAfterSelf = await call("GET", `/api/channels/${channelId}/threads`, undefined, tokenA);
const selfThread = threadsAfterSelf.json.active.find((t) => t.id === thread.json.id);
assert(selfThread?.unreadCount === 0, "讨论组内自己发的消息不算未读");
await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "话题里别人的消息", threadId: thread.json.id },
  tokenB,
);
const threadsAfterOther = await call("GET", `/api/channels/${channelId}/threads`, undefined, tokenA);
const otherThread = threadsAfterOther.json.active.find((t) => t.id === thread.json.id);
assert(otherThread?.unreadCount === 1, "讨论组内他人发言计入未读");

// typing：B 连上同一房间后，A 发 typing 帧 -> B 收 evt.typing（房间私有热态，不落库）
const wsB = await connectWs(tokenB, channelId);
try {
  await waitFrame(wsB, (f) => f.type === "evt.hello");
  const typingP = waitFrame(wsB, (f) => f.type === "evt.typing");
  ws.send(JSON.stringify({ type: "typing", payload: { clientTime: Date.now() } }));
  const typingEvt = await typingP;
  assert(typingEvt.payload.channelId === channelId, "同房间他人收到 evt.typing");
  assert(typingEvt.payload.member.handle.startsWith("chalice"), "evt.typing 带发送者身份");
  assert(typingEvt.payload.expiresAt > Date.now(), "evt.typing 带到期时间");
} finally {
  wsB.close();
}

// @everyone：后端展开成全体成员（自己除外）-> 收到广播且 mentionMe=true，提及未读角标亮起
const meId = hello.payload.user.id;
const everyoneP = waitFrame(
  ws,
  (f) => f.type === "evt.message.new" && (f.payload.message.mentions ?? []).length >= 1,
);
const everyoneMsg = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "@everyone 全员通知", mentionEveryone: true },
  tokenB,
);
assert(everyoneMsg.status === 201, "B 发 @everyone 消息成功");
assert(
  everyoneMsg.json.mentions.includes(meId) && everyoneMsg.json.mentions.length === 1,
  "@everyone 展开成全体成员（本社区仅 A+B，扣掉发送者只剩 A）",
);
const everyoneEvt = await everyoneP;
assert(everyoneEvt.payload.mentionMe === true, "@everyone 广播里 mentionMe=true");
const mineAfterEveryone = await myCommunity();
assert((mineAfterEveryone?.unreadMentions ?? 0) >= 1, "@everyone 让 A 的频道提及未读 > 0");
await call(
  "POST",
  `/api/channels/${channelId}/read-state`,
  { lastReadMessageId: everyoneMsg.json.id },
  tokenA,
);
assert((await myCommunity())?.unreadMentions === 0, "A 读完 @everyone 提及未读清零");

// 置顶：普通成员无权置顶；owner 置顶后出现在房间置顶列表，取消后消失
const pinDenied = await call("POST", `/api/messages/${probe.json.id}/pin`, undefined, tokenB);
assert(pinDenied.status === 403, "普通成员置顶被拒（403）");
const pinP = waitFrame(
  ws,
  (f) => f.type === "evt.message.updated" && f.payload.message?.pinnedAt !== null,
);
const pinned = await call("POST", `/api/messages/${probe.json.id}/pin`, undefined, tokenA);
assert(pinned.status === 200 && pinned.json.pinnedAt > 0, "owner 置顶成功（返回 pinnedAt）");
const pinEvt = await pinP;
assert(pinEvt.payload.message.id === probe.json.id, "置顶广播 evt.message.updated");
const pins = await call("GET", `/api/channels/${channelId}/pins`, undefined, tokenA);
assert(
  pins.json.items.length === 1 && pins.json.items[0].id === probe.json.id,
  "置顶列表含该消息",
);
const unpinned = await call("DELETE", `/api/messages/${probe.json.id}/pin`, undefined, tokenA);
assert(unpinned.status === 200 && unpinned.json.pinnedAt === null, "取消置顶成功");
const pinsAfter = await call("GET", `/api/channels/${channelId}/pins`, undefined, tokenA);
assert(pinsAfter.json.items.length === 0, "取消后置顶列表为空");

// 广播里的 url 用 Worker 侧 origin（本地 dev 会被 routes 改写成自定义域），改回本地直读
const getRes = await fetch(`${BASE}/api/r2/objects/${upl.json.r2Key}`);
assert(getRes.status === 200, "附件 GET 200");
assert((getRes.headers.get("content-type") ?? "").startsWith("image/png"), "附件 GET content-type 正确");

// Shares：登记一条 DSH 会话分享（先直传包体到 R2）→ 查看/随卡片消息级联删除
const packBody = Buffer.from(JSON.stringify({ kind: "agent-session", events: [] }));
const packUp = await uploadAttachment(tokenA, "session.json", packBody, "application/json");
assert(packUp.status === 201 && packUp.json?.r2Key?.startsWith("att"), "A 直传会话包到 R2");
const share = await call(
  "POST",
  "/api/shares/agent-session",
  {
    r2Key: packUp.json.r2Key,
    title: "会话分享冒烟",
    sizeBytes: packBody.byteLength,
    manifest: {},
    communityId: comm.json.id,
  },
  tokenA,
);
assert(
  share.status === 201 &&
    share.json?.share?.kind === "agent-session" &&
    share.json.share.r2Key === packUp.json.r2Key &&
    typeof share.json.downloadUrl === "string",
  "A 登记会话分享",
);
const shareId = share.json.share.id;
const view = await call("GET", `/api/shares/${shareId}`, undefined, tokenB);
assert(view.status === 200 && typeof view.json.downloadUrl === "string", "社区成员可查看分享");
// 删除分享 = 撤回卡片消息：发一条「卡片即消息」的消息（正文为空，只有卡片），撤回它，分享随之消失
const cardMsg = await call(
  "POST",
  `/api/channels/${channelId}/messages`,
  { content: "", shareId },
  tokenA,
);
assert(
  cardMsg.status === 201 && cardMsg.json?.shareCard?.shareId === shareId,
  "A 发送纯分享卡片消息（正文为空）",
);
const delCard = await call("DELETE", `/api/messages/${cardMsg.json.id}`, undefined, tokenA);
assert(delCard.status === 200, "A 撤回卡片消息");
const gone = await call("GET", `/api/shares/${shareId}`, undefined, tokenB);
assert(gone.status === 404, "分享随消息一并删除（404）");

// 非成员直连同一频道 DO 被拒（握手前 403）
const outsider = await signup("chout");
await expectWsRejected(outsider, channelId);
console.log("ok: 非成员直连频道被拒");
const outsiderOnline = await call(
  "GET",
  `/api/communities/${comm.json.id}/online`,
  undefined,
  outsider,
);
assert(outsiderOnline.status === 403, "非成员读社区在线被拒（403）");

// —— 权限：公告频道只有 owner/admin 能发 ——
const annId = comm.json.channels.find((ch) => ch.kind === "announcement")?.id;
assert(annId, "建社区时自动生成公告频道");
const memberAnnounce = await call(
  "POST",
  `/api/channels/${annId}/messages`,
  { content: "member should be rejected" },
  tokenB,
);
assert(memberAnnounce.status === 403, "普通成员发公告被拒（403）");
const ownerAnnounce = await call(
  "POST",
  `/api/channels/${annId}/messages`,
  { content: "owner announcement" },
  tokenA,
);
assert(ownerAnnounce.status === 201, "owner 发公告成功");

// 把预置的「管理员」角色分配给 B：它只是普通角色，公告频道对 @everyone 的 deny 一样生效
const memberList = await call("GET", `/api/communities/${comm.json.id}/members`, undefined, tokenA);
const bob = memberList.json?.items?.find((m) => m.user.handle.startsWith("chbob"));
assert(bob !== undefined, "成员列表里能找到 B");
const assignAdmin = await call(
  "PUT",
  `/api/communities/${comm.json.id}/members/${bob.user.id}/roles`,
  { roleIds: [adminRole.id] },
  tokenA,
);
assert(assignAdmin.status === 200, "A 把「管理员」角色分配给 B");
assert(
  (assignAdmin.json?.roleIds ?? []).includes(adminRole.id),
  "B 的角色里含预置管理员角色",
);
const adminAnnounce = await call(
  "POST",
  `/api/channels/${annId}/messages`,
  { content: "admin announcement" },
  tokenB,
);
assert(adminAnnounce.status === 403, "管理员角色不绕过频道覆盖，B 发公告仍被拒（403）");

// 要让人发公告就在频道里显式授权：给该角色 allow SEND_MESSAGES 后 B 即可发布
const grantAnnounce = await call(
  "PUT",
  `/api/channels/${annId}/overwrites/role/${adminRole.id}`,
  { allow: 1 << 1, deny: 0 },
  tokenA,
);
assert(grantAnnounce.status === 200, "A 给「管理员」角色在公告频道放行「发送消息」");
const grantedAnnounce = await call(
  "POST",
  `/api/channels/${annId}/messages`,
  { content: "authorized announcement" },
  tokenB,
);
assert(grantedAnnounce.status === 201, "被单独授权后 B 发公告成功");

// —— 权限：只有 owner 能删除社区（级联清频道/消息/成员） ——
const delByMember = await call("DELETE", `/api/communities/${comm.json.id}`, undefined, tokenB);
assert(delByMember.status === 403, "非 owner 删除社区被拒（403）");
const delByOwner = await call("DELETE", `/api/communities/${comm.json.id}`, undefined, tokenA);
assert(delByOwner.status === 200, "owner 删除社区成功");
const goneComm = await call("GET", `/api/communities/${comm.json.id}`, undefined, tokenB);
assert(goneComm.status === 404, "删除后社区 404");
const mineB = await call("GET", "/api/communities/mine", undefined, tokenB);
assert(!mineB.json.some((x) => x.id === comm.json.id), "删除后从 B 的社区列表消失");
const goneMsgs = await call("GET", `/api/channels/${channelId}/messages`, undefined, tokenB);
assert(goneMsgs.status === 404, "删除后频道消息 404");

ws.close();
await sleep(300);
console.log("WS SMOKE PASSED");
process.exit(0);
