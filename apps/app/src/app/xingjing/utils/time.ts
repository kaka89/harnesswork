/**
 * 时间格式化工具函数
 *
 * 从 chat-session-store.ts 迁入，供 ai-chat-drawer 等组件使用。
 */

/** 返回 HH:mm 格式的当前时间 */
export function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** 返回 YYYY-MM-DD HH:mm 格式的当前日期时间 */
export function nowDateTimeStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
