/**
 * 上下文回忆服务
 *
 * 从统一会话索引中检索与当前 prompt 最相关的历史会话摘要，
 * 用于注入到 Agent 调用的上下文中，实现跨会话的知识延续。
 *
 * 匹配算法：简单 TF-IDF 相似度排序（纯本地计算，无需向量库）。
 */

import { loadMemoryIndex, extractKeywords, type MemoryIndexEntry } from './memory-store';

// ─── 配置 ─────────────────────────────────────────────────────────────────────

/** 最多返回的相关会话数 */
const MAX_RECALL_SESSIONS = 3;

/** 回忆上下文的最大字符数（避免过长导致 token 超限） */
const MAX_RECALL_CHARS = 1500;

// ─── 核心接口 ─────────────────────────────────────────────────────────────────

export interface RecallResult {
  /** 格式化后的回忆上下文文本（可直接注入 prompt） */
  contextText: string;
  /** 匹配到的会话条目 */
  matchedSessions: MemoryIndexEntry[];
}

/**
 * 检索与当前 prompt 最相关的历史会话摘要
 *
 * @param workDir 工作目录
 * @param currentPrompt 当前用户输入的 prompt
 * @returns RecallResult 回忆结果（包含格式化文本和匹配条目）
 */
export async function recallRelevantContext(
  workDir: string,
  currentPrompt: string,
): Promise<RecallResult> {
  const empty: RecallResult = { contextText: '', matchedSessions: [] };

  if (!currentPrompt.trim() || !workDir) return empty;

  try {
    const index = await loadMemoryIndex(workDir);
    if (index.sessions.length === 0) return empty;

    // 1. 提取当前 prompt 的关键词
    const queryKeywords = extractKeywords(currentPrompt);
    if (queryKeywords.length === 0) return empty;

    // 2. 计算每个索引条目的 TF-IDF 相似度分数
    const scored = index.sessions.map(entry => {
      const score = calculateTfIdfScore(queryKeywords, entry);
      return { entry, score };
    });

    // 3. 过滤无匹配项，按分数降序排列
    const matched = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECALL_SESSIONS)
      .map(s => s.entry);

    if (matched.length === 0) return empty;

    // 4. 格式化为可注入的上下文文本
    const contextText = formatRecallContext(matched);

    return { contextText, matchedSessions: matched };
  } catch (e) {
    console.warn('[memory-recall] recallRelevantContext failed:', e);
    return empty;
  }
}

/**
 * 将回忆结果注入到 userPrompt 中
 *
 * @param originalPrompt 原始 userPrompt
 * @param recallContext 回忆上下文文本
 * @returns 注入后的完整 prompt
 */
export function injectRecallContext(
  originalPrompt: string,
  recallContext: string,
): string {
  if (!recallContext) return originalPrompt;
  return `## 相关历史上下文\n${recallContext}\n\n---\n\n${originalPrompt}`;
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

/**
 * 简单 TF-IDF 相似度计算
 *
 * 对每个关键词：
 * - TF（词频）= 关键词在该条目中出现的次数 / 条目总词数
 * - IDF（逆文档频率）= log(总会话数 / 包含该关键词的会话数 + 1)
 * - 分数 = sum(TF * IDF) 对所有查询关键词
 *
 * 简化实现：直接用命中关键词数 * IDF 近似值作为分数
 */
function calculateTfIdfScore(
  queryKeywords: string[],
  entry: MemoryIndexEntry,
): number {
  const entryText = `${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
  let score = 0;

  for (const kw of queryKeywords) {
    if (entryText.includes(kw)) {
      // 标签精确匹配给更高权重
      const tagMatch = entry.tags.some(t => t.toLowerCase().includes(kw));
      score += tagMatch ? 2.0 : 1.0;
    }
  }

  // 时间衰减因子：越新的会话得分越高
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const timeFactor = ageDays < 7 ? 1.0 : ageDays < 30 ? 0.8 : ageDays < 90 ? 0.5 : 0.3;

  return score * timeFactor;
}

/**
 * 将匹配的会话条目格式化为可注入的上下文文本
 */
function formatRecallContext(entries: MemoryIndexEntry[]): string {
  const parts: string[] = [];
  let totalChars = 0;

  for (const entry of entries) {
    const typeBadge = entry.type === 'chat' ? '对话' : entry.type === 'autopilot' ? 'Autopilot' : 'Pipeline';
    const tagsStr = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
    const line = `- [${typeBadge}] ${entry.summary}${tagsStr} (${entry.createdAt})`;

    if (totalChars + line.length > MAX_RECALL_CHARS) break;
    parts.push(line);
    totalChars += line.length;
  }

  return parts.join('\n');
}
