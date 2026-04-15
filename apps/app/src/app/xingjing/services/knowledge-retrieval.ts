/**
 * 知识检索服务（三源融合统一入口）
 *
 * 整合三源知识索引、检索和格式化，为 Agent 调用提供统一的知识上下文。
 *
 * 职责：
 * 1. 加载三源知识索引（带内存缓存）
 * 2. 搜索匹配知识条目（包含 workspace 文档）
 * 3. 按优先级排序（融合文档链路距离）
 * 4. 格式化为 Markdown 文本块，带来源+层级标注
 * 5. 截断到 maxTokens
 * 6. 降级：OpenWork 不可用时仅检索私有知识
 */

import {
  buildKnowledgeIndex,
  loadCachedIndex,
  searchKnowledge,
  updateReferenceMeta,
  type KnowledgeIndex,
  type KnowledgeEntry,
  type SearchContext,
} from './knowledge-index';
import type { SkillApiAdapter } from './knowledge-behavior';

// ─── 内存缓存 ─────────────────────────────────────────────────────────────────

let _cachedIndex: KnowledgeIndex | null = null;
let _cacheWorkDir = '';
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

// ─── 引用更新防抖 ─────────────────────────────────────────────────────────────

let _pendingRefUpdates: Array<{ workDir: string; id: string; source: 'behavior' | 'private' | 'workspace-doc' }> = [];
let _refUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const REF_UPDATE_DEBOUNCE_MS = 5000;

// ─── 主接口 ─────────────────────────────────────────────────────────────────

export interface RetrieveKnowledgeOpts {
  /** 工作目录 */
  workDir: string;
  /** OpenWork Skill API 适配器（null 则降级为仅私有知识） */
  skillApi: SkillApiAdapter | null;
  /** 查询文本 */
  query: string;
  /** 当前 Agent ID（用于场景匹配和 doc-chain 链路） */
  agentId?: string;
  /** 当前场景 */
  scene?: string;
  /** 当前任务的目标文档类型（用于链路距离计算） */
  targetDocType?: string;
  /** 当前所在知识层级 */
  currentLayer?: string;
  /** 最大字符数（默认 2000） */
  maxTokens?: number;
}

/**
 * 统一知识检索入口
 *
 * @returns 格式化的 Markdown 知识上下文文本（可直接注入 prompt）
 */
export async function retrieveKnowledge(opts: RetrieveKnowledgeOpts): Promise<string> {
  const { workDir, skillApi, query, maxTokens = 2000 } = opts;

  if (!workDir || !query.trim()) return '';

  try {
    // 1. 获取索引（带缓存）
    const index = await getOrBuildIndex(workDir, skillApi);
    if (!index || index.entries.length === 0) return '';

    // 2. 搜索匹配
    const context: SearchContext = {
      query,
      agentId: opts.agentId,
      scene: opts.scene,
      targetDocType: opts.targetDocType,
      currentLayer: opts.currentLayer,
    };
    const results = searchKnowledge(index, context, 5);
    if (results.length === 0) return '';

    // 3. 格式化为 Markdown
    const formatted = formatKnowledgeResults(results, maxTokens);

    // 4. 异步更新引用计数（防抖）
    scheduleRefUpdate(workDir, results);

    return formatted;
  } catch (e) {
    console.warn('[knowledge-retrieval] retrieveKnowledge failed:', e);
    return '';
  }
}

/**
 * 强制刷新索引缓存
 */
export async function refreshKnowledgeIndex(
  workDir: string,
  skillApi: SkillApiAdapter | null,
): Promise<void> {
  _cachedIndex = await buildKnowledgeIndex(workDir, skillApi);
  _cacheWorkDir = workDir;
  _cacheTimestamp = Date.now();
}

/**
 * 使索引缓存失效（用于文件变更时触发重建）
 */
export function invalidateKnowledgeCache(): void {
  _cachedIndex = null;
  _cacheTimestamp = 0;
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

async function getOrBuildIndex(
  workDir: string,
  skillApi: SkillApiAdapter | null,
): Promise<KnowledgeIndex | null> {
  // 检查内存缓存
  if (
    _cachedIndex &&
    _cacheWorkDir === workDir &&
    Date.now() - _cacheTimestamp < CACHE_TTL_MS
  ) {
    return _cachedIndex;
  }

  // 尝试加载磁盘缓存
  const diskCache = await loadCachedIndex(workDir);
  if (diskCache) {
    const cacheAge = Date.now() - new Date(diskCache.builtAt).getTime();
    if (cacheAge < CACHE_TTL_MS * 2) {
      _cachedIndex = diskCache;
      _cacheWorkDir = workDir;
      _cacheTimestamp = Date.now();
      return diskCache;
    }
  }

  // 全量构建
  try {
    const index = await buildKnowledgeIndex(workDir, skillApi);
    _cachedIndex = index;
    _cacheWorkDir = workDir;
    _cacheTimestamp = Date.now();
    return index;
  } catch {
    return diskCache;
  }
}

/**
 * 将检索结果格式化为可注入的 Markdown 文本
 *
 * 标注格式：
 * - [Skill] — 行为知识
 * - [笔记] — 私有知识
 * - [PRD@应用层] — workspace 文档
 */
function formatKnowledgeResults(
  entries: KnowledgeEntry[],
  maxChars: number,
): string {
  const parts: string[] = [];
  let totalChars = 0;

  for (const entry of entries) {
    const badge = formatBadge(entry);
    const tagsStr = entry.tags.length > 0 ? ` (${entry.tags.slice(0, 3).join(', ')})` : '';
    const summary = entry.summary.slice(0, 300);
    const block = `### ${badge} ${entry.title}${tagsStr}\n\n${summary}`;

    if (totalChars + block.length > maxChars) {
      // 尝试放入截断版本
      const remaining = maxChars - totalChars;
      if (remaining > 100) {
        parts.push(`### ${badge} ${entry.title}\n\n${summary.slice(0, remaining - 50)}...`);
      }
      break;
    }

    parts.push(block);
    totalChars += block.length;
  }

  return parts.join('\n\n---\n\n');
}

function formatBadge(entry: KnowledgeEntry): string {
  switch (entry.source) {
    case 'behavior':
      return '[Skill]';
    case 'private':
      return '[笔记]';
    case 'workspace-doc':
      return `[${entry.docType ?? 'DOC'}@${entry.layer ?? ''}]`;
    default:
      return '[知识]';
  }
}

/**
 * 防抖批量更新引用计数
 */
function scheduleRefUpdate(workDir: string, entries: KnowledgeEntry[]): void {
  for (const entry of entries) {
    _pendingRefUpdates.push({ workDir, id: entry.id, source: entry.source });
  }

  if (_refUpdateTimer) clearTimeout(_refUpdateTimer);
  _refUpdateTimer = setTimeout(async () => {
    const updates = [..._pendingRefUpdates];
    _pendingRefUpdates = [];

    for (const { workDir: wd, id, source } of updates) {
      await updateReferenceMeta(wd, id, source);
    }
  }, REF_UPDATE_DEBOUNCE_MS);
}
