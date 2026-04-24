/**
 * chat-session-store — Stub
 *
 * @deprecated 已迁移至 OpenWork Session API。
 * 此文件仅保留导出签名，供 ai-chat-drawer.tsx 编译通过。
 * ai-chat-drawer 改造后可删除此文件。
 */

// ── 类型定义 ─────────────────────────────────────────────────────────────────

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

// ── No-op stubs ──────────────────────────────────────────────────────────

export function loadSessions(): SessionRecord[] { return []; }
export function saveSessions(_list: SessionRecord[]): void { /* no-op */ }
export function appendSession(_session: SessionRecord): void { /* no-op */ }
export function removeSession(_id: string): void { /* no-op */ }
export function clearSessions(): void { /* no-op */ }

// 时间工具函数已迁移到 utils/time.ts
