/**
 * 聊天会话历史存储服务
 *
 * 存储策略：
 * 1. 主存储：localStorage（key: xingjing-chat-sessions-v1）
 *    - 在 Tauri Webview 中，localStorage 等同于持久化本地存储
 *    - 浏览器模式下同样有效
 * 2. 辅助存储：Tauri 环境下尝试写入 ~/.xingjing/chat-sessions.json
 *    - 通过 xingjing_write_chat_history invoke 命令（尽力而为，失败不影响主流程）
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
 * 将会话历史列表写入 localStorage，同时异步尝试写入本地文件
 * 不抛出异常
 */
export function saveSessions(list: SessionRecord[]): void {
  try {
    // 裁剪超出限制的旧会话（保留最新的）
    const trimmed = list.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    // 异步尝试写入本地文件（Tauri 环境下）
    void tryWriteToFile(trimmed);
  } catch (e) {
    console.warn('[chat-session-store] 保存失败:', e);
  }
}

/**
 * 追加一条新会话到历史列表（自动去重：同 id 则更新）
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
 */
export function removeSession(id: string): void {
  const list = loadSessions().filter(s => s.id !== id);
  saveSessions(list);
}

/**
 * 清空所有历史会话
 */
export function clearSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Tauri 文件写入（尽力而为）──────────────────────────────────────────────

async function tryWriteToFile(list: SessionRecord[]): Promise<void> {
  try {
    // 检测 Tauri 环境
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!w.__TAURI__ && !w.__TAURI_INTERNALS__) return;

    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('xingjing_write_chat_history', {
      content: JSON.stringify(list, null, 2),
    });
  } catch {
    // 命令可能不存在（旧版后端），静默忽略
  }
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
