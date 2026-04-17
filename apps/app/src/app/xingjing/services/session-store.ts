/**
 * session-store.ts — 基于 OpenCode SDK 的会话管理
 *
 * 替代 chat-session-store.ts + memory-store.ts
 * 会话数据由 OpenCode server 统一持久化，无需 localStorage 双写
 */

import { getXingjingClient } from './opencode-client';

// ─── 类型（与原 chat-session-store 兼容）────────────────────────────────────

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts?: string;
}

// ─── 会话列表 ────────────────────────────────────────────────────────────────

/**
 * 获取指定工作目录下的会话列表（按最近更新排序）
 */
export async function listSessions(workDir: string): Promise<SessionSummary[]> {
  try {
    const client = getXingjingClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.session as any).list({ directory: workDir });
    if (!result?.data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions: any[] = Array.isArray(result.data) ? result.data : [];
    return sessions
      .map((s: { id: string; title?: string; time?: { updated?: number; created?: number } }) => ({
        id: s.id,
        title: s.title ?? s.id,
        createdAt: s.time?.created ?? 0,
        updatedAt: s.time?.updated ?? s.time?.created ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * 获取会话的消息列表
 */
export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  try {
    const client = getXingjingClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.session as any).messages({ sessionID: sessionId });
    if (!result?.data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(result.data) ? result.data : []).map((m: any) => ({
      id: m.id ?? crypto.randomUUID(),
      role: m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : m.parts?.map((p: { type: string; text?: string }) => p.text ?? '').join('') ?? '',
      ts: m.time ? new Date(m.time).toISOString() : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * 删除指定会话
 * （通过 OpenWork server API /workspace/:id/sessions/:sessionId）
 */
export async function deleteSession(_sessionId: string): Promise<void> {
  // 通过 app-store 的 openworkServer context 调用，此处为占位
  // 实际调用路径：openworkServer.deleteSession(workspaceId, sessionId)
  console.warn('[session-store] deleteSession not yet wired to openworkServer');
}

// ─── 时间工具 ────────────────────────────────────────────────────────────────

export function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function nowDateTimeStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
