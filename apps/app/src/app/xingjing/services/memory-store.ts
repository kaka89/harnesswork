/**
 * 统一会话记忆存储服务（已迁移至 OpenCode Session API）
 *
 * 读取通道：
 *   会话列表 → OpenCode SDK client.session.list()
 *   消息详情 → OpenCode SDK client.session.messages()
 *
 * 写入通道：
 *   OpenCode 自动持久化会话，前端无需手动写入。
 *   仅 sidecar 元数据（tags/goal）通过 fileWrite 写入 .xingjing/memory/sidecar.json。
 */

import { fileRead, fileWrite } from './file-ops';
import { getXingjingClient } from './opencode-client';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface MemoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 原始消息类型（兼容 Chat 的 dispatch/direct-agent） */
  msgType?: string;
  agentId?: string;
  agentName?: string;
  ts: string;
}

export interface MemorySession {
  id: string;
  type: 'chat' | 'dispatch' | 'autopilot' | 'pipeline';
  summary: string;
  goal?: string;
  tags: string[];
  messages: MemoryMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryIndexEntry {
  id: string;
  type: MemorySession['type'];
  summary: string;
  tags: string[];
  createdAt: string;
  messageCount: number;
}

export interface MemoryIndex {
  /** 会话索引条目列表 */
  sessions: MemoryIndexEntry[];
}

// ─── Sidecar 元数据（tags/goal，OpenCode 不存储的星静特有数据）────────────────
//
// OpenWork Session 类型不支持自定义 metadata 字段（如 tags、goal、mode）。
// 这些字段对星静的功能至关重要：
// - tags: 会话标签，用于分类和搜索增强
// - goal: 会话目标，用于上下文回忆
// - mode: 会话模式（chat/dispatch），用于 UI 展示区分
//
// 因此通过本地 sidecar.json 文件补充存储这些元数据。
// 当 OpenWork 未来支持自定义 metadata 时，可迁移到原生 API。

const SIDECAR_PATH = '.xingjing/memory/sidecar.json';

// ─── 索引操作（已迁移至 OpenCode Session SDK）──────────────────────────

/**
 * 加载会话索引。优先从 OpenCode Session API 读取，
 * 并融合 sidecar.json 中的星静特有元数据（tags/goal）。
 * 失败时返回空索引。
 */
export async function loadMemoryIndex(workDir: string): Promise<MemoryIndex> {
  try {
    const client = getXingjingClient();
    const result = await client.session.list({
      ...(workDir ? { directory: workDir } : {}),
    });
    if (!result.data) return { sessions: [] };
    const sessions = Array.isArray(result.data) ? result.data : [];

    // 加载 sidecar 元数据（tags/goal）
    let sidecar: Record<string, { tags?: string[]; goal?: string; mode?: 'chat' | 'dispatch' }> = {};
    try {
      const raw = await fileRead(`${workDir}/${SIDECAR_PATH}`);
      if (raw) sidecar = JSON.parse(raw);
    } catch { /* sidecar 可能不存在 */ }

    return {
      sessions: sessions
        .sort((a: any, b: any) => {
          const ta = a.time?.updated ?? a.time?.created ?? 0;
          const tb = b.time?.updated ?? b.time?.created ?? 0;
          return tb - ta; // 倒序：最新在前
        })
        .map((s: any) => {
          // mode 优先从 sidecar 读取；无记录时通过 title 前缀判断（兼容旧数据）
          const sidecarMode = sidecar[s.id]?.mode;
          // titleMode 兑底：
          // - xingjing-orchestrator-xxx → dispatch（编排器 session）
          // - xingjing-{agentId}-xxx → dispatch（@mention 直连 agent session）
          // - 其他 → chat
          const title = s.title as string | undefined;
          const titleMode = title?.startsWith('xingjing-') ? 'dispatch' : 'chat';
          const resolvedMode = sidecarMode ?? titleMode;
          return {
            id: s.id ?? '',
            type: resolvedMode as MemorySession['type'],
            summary: s.title ?? s.description ?? '',
            tags: sidecar[s.id]?.tags ?? [],
            createdAt: (() => {
              const ms = s.time?.updated ?? s.time?.created;
              if (!ms) return '';
              return new Date(ms).toLocaleString('zh-CN', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
              });
            })(),
            messageCount: 0,
          };
        }),
    };
  } catch {
    return { sessions: [] };
  }
}

/**
 * 保存 sidecar 元数据（tags/goal）
 * OpenCode 不存储这些星静特有数据，通过本地 sidecar 文件补充。
 */
export async function saveMemoryMeta(
  workDir: string,
  sessionId: string,
  meta: { tags: string[]; goal?: string; mode?: 'chat' | 'dispatch' },
): Promise<void> {
  try {
    let sidecar: Record<string, any> = {};
    try {
      const raw = await fileRead(`${workDir}/${SIDECAR_PATH}`);
      if (raw) sidecar = JSON.parse(raw);
    } catch { /* new file */ }
    sidecar[sessionId] = { ...sidecar[sessionId], ...meta };
    await fileWrite(`${workDir}/${SIDECAR_PATH}`, JSON.stringify(sidecar, null, 2));
  } catch { /* silent */ }
}

// ─── 会话详情操作（已迁移至 OpenCode Session SDK）─────────────────────

/**
 * 按需加载单个会话详情（通过 SDK）
 */
export async function loadSession(
  workDir: string,
  sessionId: string,
): Promise<MemorySession | null> {
  try {
    const client = getXingjingClient();
    const result = await client.session.messages({ sessionID: sessionId });
    if (!result.data) return null;
    const messages = Array.isArray(result.data) ? result.data : [];

    // OpenCode messages 结构: { info: { id, role, time?: { created, updated } }, parts: [{ type, text }] }
    const extractTs = (m: any): string => {
      const ms = m.info?.time?.created ?? m.info?.time?.updated ?? m.time?.created ?? m.time?.updated;
      return ms ? new Date(ms).toISOString() : new Date().toISOString();
    };

    // 提取用户可见的文本内容（text + reasoning parts）
    // reasoning part 包含 AI 的思考过程，应保留在历史记录中
    const extractTextContent = (m: any): string => {
      if (typeof m.content === 'string') return m.content;
      const parts: any[] = m.parts ?? m.info?.parts ?? [];
      return parts
        .filter((p: any) =>
          (p.type === 'text' || p.type === 'reasoning') &&
          typeof p.text === 'string'
        )
        .map((p: any) => p.text as string)
        .join('\n\n');
    };

    const rawMessages: MemoryMessage[] = messages.map((m: any) => ({
      id: m.info?.id ?? m.id ?? '',
      role: (m.info?.role ?? m.role) === 'user' ? 'user' as const : 'assistant' as const,
      content: extractTextContent(m),
      ts: extractTs(m),
    }));

    // 过滤掉内容为空的消息（pure thinking / tool-call 消息）
    const filteredMessages = rawMessages.filter((m) => m.content.trim().length > 0);

    return {
      id: sessionId,
      type: 'chat',
      summary: '',
      tags: [],
      messages: filteredMessages,
      createdAt: messages.length > 0 ? extractTs(messages[0]) : new Date().toISOString(),
      updatedAt: messages.length > 0 ? extractTs(messages[messages.length - 1]) : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * 保存会话（兼容层）
 * @deprecated OpenCode 自动持久化会话。此函数仅将 sidecar 元数据写入。
 */
export async function saveSession(
  workDir: string,
  session: MemorySession,
): Promise<boolean> {
  try {
    // 仅写入 sidecar 元数据（tags/goal）
    if (session.tags.length > 0 || session.goal) {
      await saveMemoryMeta(workDir, session.id, {
        tags: session.tags,
        goal: session.goal,
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ─── 搜索 ─────────────────────────────────────────────────────────────────────

/**
 * 基于关键词的会话搜索（优先使用 OpenWork 原生搜索）
 *
 * 搜索策略：
 * 1. 优先使用 OpenWork session.list({ search }) 原生全文搜索
 * 2. 失败时降级到本地关键词匹配
 *
 * 原生搜索优势：
 * - 服务端索引，速度更快
 * - 全文匹配，准确性更高
 * - 减少客户端计算负担
 */
export async function searchSessions(
  workDir: string,
  query: string,
  maxResults = 10,
): Promise<MemoryIndexEntry[]> {
  if (!query.trim()) {
    const index = await loadMemoryIndex(workDir);
    return index.sessions.slice(0, maxResults);
  }

  // 尝试使用 OpenWork 原生搜索
  try {
    const client = getXingjingClient();
    const result = await client.session.list({
      directory: workDir,
      search: query,
      limit: maxResults,
    });

    if (result.data && Array.isArray(result.data)) {
      // 加载 sidecar 元数据（tags/goal）
      let sidecar: Record<string, { tags?: string[]; goal?: string; mode?: 'chat' | 'dispatch' }> = {};
      try {
        const raw = await fileRead(`${workDir}/${SIDECAR_PATH}`);
        if (raw) sidecar = JSON.parse(raw);
      } catch { /* sidecar 可能不存在 */ }

      return result.data.map((s: any) => ({
        id: s.id ?? '',
        type: (sidecar[s.id]?.mode ?? 'chat') as MemorySession['type'],
        summary: s.title ?? s.description ?? '',
        tags: sidecar[s.id]?.tags ?? [],
        createdAt: (() => {
          const ms = s.time?.updated ?? s.time?.created;
          if (!ms) return '';
          return new Date(ms).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });
        })(),
        messageCount: 0,
      }));
    }
  } catch (e) {
    console.warn('[memory] OpenWork 原生搜索失败，降级到本地搜索:', e);
  }

  // 降级：本地关键词搜索
  return localSearchSessions(workDir, query, maxResults);
}

/**
 * 本地关键词搜索（降级方案）
 */
async function localSearchSessions(
  workDir: string,
  query: string,
  maxResults: number,
): Promise<MemoryIndexEntry[]> {
  const index = await loadMemoryIndex(workDir);
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return index.sessions.slice(0, maxResults);

  const scored = index.sessions.map(entry => {
    let score = 0;
    const text = `${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    return { entry, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.entry);
}

/**
 * 超限时裁剪旧会话
 * @deprecated OpenCode 管理会话生命周期
 */
export async function pruneOldSessions(
  _workDir: string,
  _maxCount?: number,
): Promise<number> {
  // no-op: OpenCode 管理会话生命周期
  return 0;
}

// ─── AI 摘要生成 ──────────────────────────────────────────────────────────────

/**
 * 生成会话摘要的 LLM Prompt
 */
const SUMMARY_PROMPT = `请用不超过150字总结以下对话的核心内容和结论，并提取3-5个关键词标签。

输出格式要求（严格JSON）：
{"summary": "...", "tags": ["tag1", "tag2", "tag3"]}

对话内容：
`;

export interface SummaryResult {
  summary: string;
  tags: string[];
}

export type CallAgentFn = (opts: {
  systemPrompt?: string;
  userPrompt: string;
  onDone?: (fullText: string) => void;
  onError?: (errMsg: string) => void;
}) => void;

/**
 * 调用 LLM 生成会话摘要（异步模式，立即返回 fallback）
 *
 * 优化策略：
 * 1. 立即返回 fallback 摘要（不阻塞 UI）
 * 2. 异步生成 AI 摘要
 * 3. 生成后自动更新到 OpenWork session.title
 *
 * @param sessionId 会话 ID（用于更新摘要）
 * @param messages 会话消息列表
 * @param callAgentFn 复用现有的 callAgent 接口
 * @returns Promise<SummaryResult> 立即返回 fallback 摘要
 */
export function generateSessionSummary(
  sessionId: string,
  messages: MemoryMessage[],
  callAgentFn: CallAgentFn,
): Promise<SummaryResult> {
  // 1. 立即返回 fallback 摘要
  const fallback: SummaryResult = {
    summary: extractFallbackSummary(messages),
    tags: [],
  };

  // 2. 异步生成 AI 摘要（不阻塞 UI）
  setTimeout(() => {
    // 构造对话文本（截取最后 20 条消息，避免超长）
    const recentMessages = messages.slice(-20);
    const dialogText = recentMessages
      .map(m => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join('\n');

    callAgentFn({
      userPrompt: SUMMARY_PROMPT + dialogText,
      onDone: (fullText: string) => {
        try {
          // 尝试从响应中提取 JSON
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const aiSummary = String(parsed.summary || '').slice(0, 200);
            const aiTags = Array.isArray(parsed.tags)
              ? parsed.tags.map(String).slice(0, 5)
              : [];

            // 3. 生成后更新到 OpenWork session.title
            void updateSessionSummary(sessionId, aiSummary);

            // 4. 更新 sidecar 中的 tags
            // 注意：这里无法获取 workDir，需要调用方传入或通过其他方式获取
            console.log('[memory] AI 摘要生成成功:', { sessionId, summary: aiSummary, tags: aiTags });
          }
        } catch (e) {
          console.warn('[memory] AI 摘要解析失败:', e);
        }
      },
      onError: (err) => {
        console.warn('[memory] AI 摘要生成失败:', err);
      },
    });
  }, 0);

  return Promise.resolve(fallback);
}

/**
 * 更新会话摘要到 OpenWork session.title
 */
async function updateSessionSummary(
  sessionId: string,
  summary: string,
): Promise<void> {
  try {
    const client = getXingjingClient();
    await client.session.update({
      sessionID: sessionId,
      title: summary.slice(0, 200),
    });
    console.log('[memory] 摘要已更新到 OpenWork session.title:', sessionId);
  } catch (e) {
    console.warn('[memory] 更新 session.title 失败:', e);
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 提取关键词（简单分词：按空格/标点分割，过滤停用词和短词）
 */
export function extractKeywords(text: string): string[] {
  const STOP_WORDS = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
    'this', 'that', 'these', 'those', 'it', 'its',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
    .slice(0, 20); // 限制关键词数量
}

/**
 * 当 LLM 不可用时的 fallback 摘要：取第一条 user 消息前 80 字
 */
function extractFallbackSummary(messages: MemoryMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return '无摘要';
  const text = firstUser.content.trim();
  return text.slice(0, 80) + (text.length > 80 ? '...' : '');
}

/**
 * 生成 ISO 格式时间戳
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 生成唯一 ID
 */
export function genSessionId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
