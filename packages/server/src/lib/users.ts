// ================================================================
// 只读访问 Better Auth 的 user 表，把认证库用户投影成业务 User 实体。
// Better Auth 建表是它自己管理的（表名 user，列名 camelCase），
// 业务侧不持有该表的写权限，这里仅做 SELECT。
// ================================================================

import type { D1Database } from "@cloudflare/workers-types";
import type { ID, User } from "@dsh-guild/types/entities";
import { uniq } from "es-toolkit/array";
import { HttpApiError } from "./errors";

interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  createdAt: unknown;
}

export function toEntityUser(row: AuthUserRow): User {
  const emailPrefix = row.email.split("@")[0] || row.id;
  const createdAt =
    typeof row.createdAt === "number"
      ? row.createdAt
      : typeof row.createdAt === "string"
        ? Date.parse(row.createdAt)
        : Date.now();
  return {
    id: row.id as ID,
    handle: row.username?.trim() || emailPrefix,
    displayName: row.name || null,
    avatarUrl: row.image ?? null,
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
  };
}

const USER_COLUMNS = "id, name, email, image, username, createdAt";

// ---- 用户名规则（与 username 插件配置、客户端预检保持一致）----
// 只能使用大小写字母和数字；长度 4..16；每周只能改一次；全局唯一。
export const USERNAME_PATTERN = /^[A-Za-z0-9]+$/;
export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 16;
const USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 校验「改用户名」是否被允许：字符集 / 长度 / 每周一次 / 唯一性。
 * 任一不满足即抛中文 BAD_REQUEST（前端直接展示 message）。
 * 通过时返回归一化（小写）后的新用户名；用户名未变化时直接返回、不消耗冷却。
 *
 * 必须在写库之前调用（见 worker.ts 的 /api/auth/update-user 中间件）：
 * Better Auth 的 hooks.before 阶段拿不到 Bearer 会话，无法在那里做唯一性判断。
 */
export async function assertUsernameChangeAllowed(
  db: D1Database,
  userId: string,
  rawNext: string,
): Promise<string> {
  const trimmed = rawNext.trim();
  const next = trimmed.toLowerCase();

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw HttpApiError.badRequest("用户名只能包含大小写字母和数字");
  }
  if (next.length < USERNAME_MIN_LENGTH) {
    throw HttpApiError.badRequest(`用户名至少需要 ${USERNAME_MIN_LENGTH} 个字符`);
  }
  if (next.length > USERNAME_MAX_LENGTH) {
    throw HttpApiError.badRequest(`用户名最多 ${USERNAME_MAX_LENGTH} 个字符`);
  }

  const current = await db
    .prepare(`SELECT username, usernameChangedAt FROM "user" WHERE id = ?`)
    .bind(userId)
    .first<{ username: string | null; usernameChangedAt: number | null }>();
  const currentName = (current?.username ?? "").trim().toLowerCase();
  if (next === currentName) return next;

  const changedAt = current?.usernameChangedAt ?? null;
  if (changedAt !== null) {
    const remaining = USERNAME_CHANGE_COOLDOWN_MS - (Date.now() - changedAt);
    if (remaining > 0) {
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
      throw HttpApiError.badRequest(`用户名每周只能修改一次，请在 ${days} 天后再试`);
    }
  }

  const taken = await db
    .prepare(`SELECT id FROM "user" WHERE username = ?`)
    .bind(next)
    .first<{ id: string }>();
  if (taken && taken.id !== userId) {
    throw HttpApiError.badRequest("该用户名已被占用");
  }

  return next;
}

/** 生成 length 位随机小写字母/数字标签（0-9, a-z） */
function randomTag(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((byte) => (byte % 36).toString(36))
    .join("");
}

/**
 * 从邮箱 @ 前缀派生一个合法且唯一的用户名；若前缀已被占用则追加随机后缀。
 * 与用户名规则一致：小写 + 仅允许 [a-z0-9]，长度固定在 4..16
 * （与 username 插件的 minUsernameLength=4, maxUsernameLength=16 对齐），
 * 保证在 databaseHooks 中写入的用户名符合编辑用户名时的校验规则。
 */
export async function uniqueUsernameForEmail(db: D1Database, email: string): Promise<string> {
  const prefix = email.split("@")[0] ?? "user";
  // 仅保留小写字母和数字，截到 12 位（为随机后缀留空间，合计 ≤16）
  let base =
    prefix
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12) || "user";

  // 邮箱前缀过短：补齐到 ≥4，避免产生低于最小长度的用户名
  if (base.length < 4) {
    base = `${base}${randomTag(4 - base.length + 1)}`.slice(0, 12);
  }

  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (attempt > 0) {
      candidate = `${base}${randomTag(4)}`.slice(0, 16);
    }
    const existing = await db
      .prepare(`SELECT id FROM "user" WHERE username = ?`)
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }
  return `${base}${crypto
    .randomUUID()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8)}`.slice(0, 16);
}

/** 单查一个认证用户；不存在返回 null */
export async function fetchUserById(db: D1Database, userId: string): Promise<User | null> {
  const row = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM "user" WHERE id = ?`)
    .bind(userId)
    .first<AuthUserRow>();
  return row ? toEntityUser(row) : null;
}

/** 查一个认证用户，不存在按内部错误抛出（写路径回读作者资料） */
export async function requireUserById(db: D1Database, userId: string): Promise<User> {
  const user = await fetchUserById(db, userId);
  if (!user) throw HttpApiError.internal("user not found");
  return user;
}

/** 批量查（用于成员/作者列表补全）；不保证顺序与入参一致 */
export async function fetchUsersByIds(db: D1Database, ids: string[]): Promise<User[]> {
  const unique = uniq(ids.filter(Boolean));
  const users: User[] = [];
  for (const id of unique) {
    const user = await fetchUserById(db, id);
    if (user) users.push(user);
  }
  return users;
}

/** 按 @handle 或 email 精确查（用于解析 mentionHandles），返回 userId */
export async function resolveUserIdsByHandles(
  db: D1Database,
  handles: string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  for (const raw of handles) {
    const handle = raw.trim();
    if (!handle) continue;
    const row = await db
      .prepare(`SELECT id, username, email FROM "user" WHERE username = ? OR email = ?`)
      .bind(handle.toLowerCase(), handle.toLowerCase())
      .first<{ id: string; username: string | null }>();
    if (row) resolved.set(handle, row.id);
  }
  return resolved;
}

/** 按 @handle 或邮箱精确查一个注册用户；不存在返回 null（发邀请用） */
export async function findAuthUserByHandleOrEmail(
  db: D1Database,
  raw: string,
): Promise<{ user: User; email: string } | null> {
  const q = raw.trim().replace(/^@/, "").toLowerCase();
  if (!q) return null;
  const row = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM "user" WHERE username = ? OR email = ?`)
    .bind(q, q)
    .first<AuthUserRow>();
  return row ? { user: toEntityUser(row), email: row.email } : null;
}
