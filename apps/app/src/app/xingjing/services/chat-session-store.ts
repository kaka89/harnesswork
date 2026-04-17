/**
 * 聊天会话历史存储服务
 *
 * @deprecated 已迁移至 OpenCode Session API。
 * 该文件保留为兆底存储层（localStorage），仅在 OpenCode 不可用时启用。
 * 主存储已通过 memory-store.ts 的 loadMemoryIndex() 走 SDK 通道。
 *
 * 残留的 localStorage 存储仅为兼容旧数据，新会话不再写入。
 */

// ─── 类型定义（与 ai-chat-drawer.tsx 共享，避免循环依赖）────────────────────

export interface AiMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'chat' | 'dispatch' | 'direct-agent';
  agentName?: string;
  ts?: string;
}

export interface SessionRecord {
  id: string;
  summary: string;
  messages: AiMessageRecord[];
  ts: string;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'xingjing-chat-sessions-v1';
const MAX_SESSIONS = 100;  // 最多保存 100 条历史会话

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 从 localStorage 加载会话历史列表
 * 失败时返回空数组（不抛出异常）
 */
export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SessionRecord[];
  } catch (e) {
    console.warn('[chat-session-store] 加载历史失败:', e);
    return [];
  }
}

/**
 * 将会话历史列表写入 localStorage
 * @deprecated OpenCode 自动持久化会话，此函数仅保留为兼容层
 */
export function saveSessions(list: SessionRecord[]): void {
  try {
    const trimmed = list.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[chat-session-store] 保存失败:', e);
  }
}

/**
 * 追加一条新会话到历史列表
 * @deprecated OpenCode 自动持久化，此函数仅保留为兼容层
 */
export function appendSession(session: SessionRecord): void {
  const list = loadSessions();
  const idx = list.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    list[idx] = session;
  } else {
    list.unshift(session);
  }
  saveSessions(list);
}

/**
 * 删除某条会话记录
 * @deprecated OpenCode 管理会话生命周期
 */
export function removeSession(id: string): void {
  const list = loadSessions().filter(s => s.id !== id);
  saveSessions(list);
}

/**
 * 清空所有历史会话
 * @deprecated 仅清理 localStorage 兆底数据
 */
export function clearSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Tauri 文件写入（已废弃，OpenCode 自动持久化）─────────────────────────────

/** @deprecated OpenCode 自动持久化会话数据 */
async function tryWriteToFile(_list: SessionRecord[]): Promise<void> {
  // no-op
}

// ─── 时间工具 ────────────────────────────────────────────────────────────────

/**
 * 返回当前时间字符串，格式 "HH:mm"
 */
export function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 返回当前完整日期时间字符串，格式 "YYYY-MM-DD HH:mm"
 */
export function nowDateTimeStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
