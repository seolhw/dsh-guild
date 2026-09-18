// ================================================================
// 提醒设置（本机生效，存 localStorage）：
//   desktop —— 被 @ 时若页面不在前台，弹系统桌面通知（需浏览器授权）
//   dnd     —— 免打扰：完全不弹桌面通知（站内角标/未读数照常）
// 站内信（邀请等）不依赖这里，始终进收件箱。
// ================================================================

export interface ReminderSettings {
  /** 是否启用桌面通知（浏览器未授权时即便为 true 也不会弹） */
  desktop: boolean;
  /** 免打扰开关 */
  dnd: boolean;
}

const STORAGE_KEY = "dsh-guild.reminder-settings";

const DEFAULT_SETTINGS: ReminderSettings = { desktop: false, dnd: false };

/** 读本机提醒设置（损坏或不可用时回落到默认值） */
export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return { desktop: parsed.desktop === true, dnd: parsed.dnd === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 写本机提醒设置，返回合并后的结果 */
export function saveReminderSettings(patch: Partial<ReminderSettings>): ReminderSettings {
  const next = { ...getReminderSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式等写入失败：本次会话内仍按 next 生效
  }
  return next;
}

/** 浏览器是否支持桌面通知 */
export function notificationsSupported(): boolean {
  return typeof Notification !== "undefined";
}

/** 请求通知授权；返回是否已授权（已拒绝时直接返回 false，不再弹授权框） */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** 弹一条桌面通知；点击后聚焦本页面。前置条件由调用方判定 */
export function showDesktopNotification(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    // 同一 tag：连续 @ 只保留最新一条，避免刷屏
    const notification = new Notification(title, { body, tag: "dsh-guild-mention" });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // 个别环境不支持构造函数（如部分移动端浏览器），静默忽略
  }
}
