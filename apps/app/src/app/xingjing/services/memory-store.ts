/**
 * 统一会话记忆存储服务（私有记忆层）
 *
 * 将 Chat 和 Autopilot 两套会话历史统一为一套存储模型，
 * 支持索引+详情分离、按需加载、关键词搜索和自动裁剪。
 *
 * 存储路径：
 *   .xingjing/memory/index.json          — 会话索引（轻量，含摘要）
 *   .xingjing/memory/sessions/{id}.json  — 单会话详情（按需加载）
 *
 * 写入通道：
 *   私有记忆 → OpenCode file API（fileRead / fileWrite），
 *   因为 .xingjing/ 是 gitignored 的本地数据。
 */

import { fileRead, fileWrite } from './opencode-client';

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
  type: 'chat' | 'autopilot' | 'pipeline';
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
  version: 1;
  sessions: MemoryIndexEntry[];
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const MEMORY_DIR = '.xingjing/memory';
const INDEX_FILE = `${MEMORY_DIR}/index.json`;
const SESSIONS_DIR = `${MEMORY_DIR}/sessions`;
const MAX_SESSIONS = 200;

// ─── 索引操作 ─────────────────────────────────────────────────────────────────

/**
 * 加载会话索引。失败时返回空索引。
 */
export async function loadMemoryIndex(workDir: string): Promise<MemoryIndex> {
  try {
    const content = await fileRead(`${workDir}/${INDEX_FILE}`);
    if (!content) return { version: 1, sessions: [] };
    const parsed = JSON.parse(content);
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return { version: 1, sessions: [] };
    }
    return parsed as MemoryIndex;
  } catch {
    return { version: 1, sessions: [] };
  }
}

/**
 * 保存会话索引
 */
async function saveMemoryIndex(workDir: string, index: MemoryIndex): Promise<boolean> {
  try {
    return await fileWrite(
      `${workDir}/${INDEX_FILE}`,
      JSON.stringify(index, null, 2),
    );
  } catch {
    return false;
  }
}

// ─── 会话详情操作 ──────────────────────────────────────────────────────────────

/**
 * 按需加载单个会话详情
 */
export async function loadSession(
  workDir: string,
  sessionId: string,
): Promise<MemorySession | null> {
  try {
    const content = await fileRead(`${workDir}/${SESSIONS_DIR}/${sessionId}.json`);
    if (!content) return null;
    return JSON.parse(content) as MemorySession;
  } catch {
    return null;
  }
}

/**
 * 保存会话（详情文件 + 索引更新）
 *
 * - 写入 sessions/{id}.json
 * - 更新 index.json 中对应条目（存在则更新，不存在则追加到头部）
 * - 超限时裁剪旧会话
 */
export async function saveSession(
  workDir: string,
  session: MemorySession,
): Promise<boolean> {
  try {
    // 1. 写入详情文件
    const detailPath = `${workDir}/${SESSIONS_DIR}/${session.id}.json`;
    const written = await fileWrite(detailPath, JSON.stringify(session, null, 2));
    if (!written) return false;

    // 2. 更新索引
    const index = await loadMemoryIndex(workDir);
    const entry: MemoryIndexEntry = {
      id: session.id,
      type: session.type,
      summary: session.summary,
      tags: session.tags,
      createdAt: session.createdAt,
      messageCount: session.messages.length,
    };

    const idx = index.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      index.sessions[idx] = entry;
    } else {
      index.sessions.unshift(entry);
    }

    // 3. 裁剪超限（保留索引摘要，标记删除详情文件）
    if (index.sessions.length > MAX_SESSIONS) {
      const removed = index.sessions.splice(MAX_SESSIONS);
      // 异步删除详情文件（不阻塞主流程）
      for (const r of removed) {
        void deleteSessionFile(workDir, r.id);
      }
    }

    return await saveMemoryIndex(workDir, index);
  } catch (e) {
    console.warn('[memory-store] saveSession failed:', e);
    return false;
  }
}

/**
 * 删除会话详情文件（尽力而为）
 */
async function deleteSessionFile(workDir: string, sessionId: string): Promise<void> {
  try {
    // 写入空内容标记为已清理（OpenCode file API 不支持 delete，用空内容替代）
    await fileWrite(`${workDir}/${SESSIONS_DIR}/${sessionId}.json`, '');
  } catch {
    // silent
  }
}

// ─── 搜索 ─────────────────────────────────────────────────────────────────────

/**
 * 基于关键词/标签的会话搜索（索引级别，不加载详情）
 *
 * 算法：
 * 1. 将 query 拆分为关键词
 * 2. 对每个索引条目计算匹配分：summary + tags 中关键词命中数
 * 3. 按分数降序排列
 */
export async function searchSessions(
  workDir: string,
  query: string,
  maxResults = 10,
): Promise<MemoryIndexEntry[]> {
  const index = await loadMemoryIndex(workDir);
  if (!query.trim()) return index.sessions.slice(0, maxResults);

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
 * 超限时裁剪旧会话（保留索引摘要，删除详情文件）
 */
export async function pruneOldSessions(
  workDir: string,
  maxCount: number = MAX_SESSIONS,
): Promise<number> {
  const index = await loadMemoryIndex(workDir);
  if (index.sessions.length <= maxCount) return 0;

  const removed = index.sessions.splice(maxCount);
  for (const r of removed) {
    void deleteSessionFile(workDir, r.id);
  }
  await saveMemoryIndex(workDir, index);
  return removed.length;
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
 * 调用 LLM 生成会话摘要
 *
 * @param messages 会话消息列表
 * @param callAgentFn 复用现有的 callAgent 接口
 * @returns Promise<SummaryResult> 摘要和标签
 */
export function generateSessionSummary(
  messages: MemoryMessage[],
  callAgentFn: CallAgentFn,
): Promise<SummaryResult> {
  return new Promise((resolve) => {
    // 构造对话文本（截取最后 20 条消息，避免超长）
    const recentMessages = messages.slice(-20);
    const dialogText = recentMessages
      .map(m => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join('\n');

    const fallback: SummaryResult = {
      summary: extractFallbackSummary(messages),
      tags: [],
    };

    callAgentFn({
      userPrompt: SUMMARY_PROMPT + dialogText,
      onDone: (fullText: string) => {
        try {
          // 尝试从响应中提取 JSON
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            resolve({
              summary: String(parsed.summary || '').slice(0, 200),
              tags: Array.isArray(parsed.tags)
                ? parsed.tags.map(String).slice(0, 5)
                : [],
            });
            return;
          }
        } catch {
          // JSON 解析失败，使用 fallback
        }
        resolve(fallback);
      },
      onError: () => {
        resolve(fallback);
      },
    });
  });
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
