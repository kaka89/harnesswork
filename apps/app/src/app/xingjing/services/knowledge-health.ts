/**
 * 知识健康度检测与一致性校验
 *
 * 职责：
 * 1. 检测 stale 知识条目（>90天未更新 + 无引用）
 * 2. 计算单条知识和全局健康度分数
 * 3. 生成三源知识健康报告（行为/私有/文档）
 * 4. 术语一致性检测（glossary 交叉引用）
 * 5. 文档链路完整性检测（doc-chain 引用）
 * 6. 私有知识自动晋升推荐（referenceCount >= 5）
 */

import {
  type KnowledgeIndex,
  type KnowledgeEntry,
  type PrivateKnowledgeMeta,
} from './knowledge-index';
import { fileRead, fileList } from './opencode-client';

// ─── 配置 ─────────────────────────────────────────────────────────────────────

/** stale 判定天数阈值 */
const STALE_THRESHOLD_DAYS = 90;

/** 自动晋升推荐的引用次数阈值 */
const PROMOTE_REF_THRESHOLD = 5;

/** 元数据目录路径 */
const META_DIR = '.xingjing/solo/knowledge/_meta';

// ─── 健康报告数据模型 ─────────────────────────────────────────────────────────

export interface KnowledgeHealthScore {
  /** 0-100 分 */
  overall: number;
  /** 各源分项得分 */
  bySource: {
    behavior: SourceHealthDetail;
    private: SourceHealthDetail;
    workspaceDoc: SourceHealthDetail;
  };
  /** stale 条目列表 */
  staleEntries: StaleEntry[];
  /** 推荐晋升为行为知识的私有知识 */
  promotionCandidates: PromotionCandidate[];
  /** 一致性检查结果 */
  consistency: ConsistencyReport;
  /** 生成时间 */
  generatedAt: string;
}

export interface SourceHealthDetail {
  total: number;
  healthy: number;
  stale: number;
  score: number;
}

export interface StaleEntry {
  id: string;
  title: string;
  source: KnowledgeEntry['source'];
  daysSinceUpdate: number;
  referenceCount: number;
}

export interface PromotionCandidate {
  id: string;
  title: string;
  referenceCount: number;
  tags: string[];
  reason: string;
}

export interface ConsistencyReport {
  /** 术语一致性问题 */
  glossaryIssues: GlossaryIssue[];
  /** 文档链路缺失 */
  docChainGaps: DocChainGap[];
  /** 一致性评分 0-100 */
  score: number;
}

export interface GlossaryIssue {
  term: string;
  /** 在哪些文档中使用了不同的定义 */
  conflictingEntries: Array<{ id: string; title: string; definition: string }>;
}

export interface DocChainGap {
  /** 缺失链路：应该存在但未找到的文档 */
  expectedDocType: string;
  /** 上游文档 */
  upstreamDoc: string;
  /** 说明 */
  description: string;
}

// ─── 主接口 ─────────────────────────────────────────────────────────────────

/**
 * 生成知识健康度报告
 */
export async function checkKnowledgeHealth(
  workDir: string,
  index: KnowledgeIndex,
): Promise<KnowledgeHealthScore> {
  // 1. 加载所有元数据
  const metaMap = await loadAllMeta(workDir);

  // 2. 计算各源健康数据
  const behaviorEntries = index.entries.filter(e => e.source === 'behavior');
  const privateEntries = index.entries.filter(e => e.source === 'private');
  const docEntries = index.entries.filter(e => e.source === 'workspace-doc');

  const behaviorHealth = calculateSourceHealth(behaviorEntries, metaMap);
  const privateHealth = calculateSourceHealth(privateEntries, metaMap);
  const docHealth = calculateSourceHealth(docEntries, metaMap);

  // 3. 收集 stale 条目
  const staleEntries = collectStaleEntries(index.entries, metaMap);

  // 4. 收集晋升候选
  const promotionCandidates = collectPromotionCandidates(privateEntries, metaMap);

  // 5. 一致性检查
  const consistency = checkConsistency(index);

  // 6. 计算总分
  const sourceAvg = (behaviorHealth.score + privateHealth.score + docHealth.score) / 3;
  const stalepenalty = Math.min(staleEntries.length * 3, 30);
  const overall = Math.max(0, Math.round(sourceAvg * 0.7 + consistency.score * 0.3 - stalepenalty));

  return {
    overall,
    bySource: {
      behavior: behaviorHealth,
      private: privateHealth,
      workspaceDoc: docHealth,
    },
    staleEntries,
    promotionCandidates,
    consistency,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 快速获取健康度分数（不含详细报告）
 */
export async function getHealthScore(
  workDir: string,
  index: KnowledgeIndex,
): Promise<number> {
  const report = await checkKnowledgeHealth(workDir, index);
  return report.overall;
}

// ─── 健康度计算 ─────────────────────────────────────────────────────────────

function calculateSourceHealth(
  entries: KnowledgeEntry[],
  metaMap: Map<string, PrivateKnowledgeMeta>,
): SourceHealthDetail {
  if (entries.length === 0) {
    return { total: 0, healthy: 0, stale: 0, score: 100 };
  }

  const now = Date.now();
  let healthy = 0;
  let stale = 0;

  for (const entry of entries) {
    const meta = metaMap.get(entry.id);
    const daysSinceUpdate = getDaysSince(entry.date, now);
    const refs = meta?.referenceCount ?? 0;

    if (daysSinceUpdate > STALE_THRESHOLD_DAYS && refs === 0) {
      stale++;
    } else {
      healthy++;
    }
  }

  const score = Math.round((healthy / entries.length) * 100);
  return { total: entries.length, healthy, stale, score };
}

function collectStaleEntries(
  entries: KnowledgeEntry[],
  metaMap: Map<string, PrivateKnowledgeMeta>,
): StaleEntry[] {
  const now = Date.now();
  const staleItems: StaleEntry[] = [];

  for (const entry of entries) {
    const meta = metaMap.get(entry.id);
    const daysSinceUpdate = getDaysSince(entry.date, now);
    const refs = meta?.referenceCount ?? 0;

    if (daysSinceUpdate > STALE_THRESHOLD_DAYS && refs === 0) {
      staleItems.push({
        id: entry.id,
        title: entry.title,
        source: entry.source,
        daysSinceUpdate,
        referenceCount: refs,
      });
    }
  }

  // 按天数降序排列（最旧的排前面）
  return staleItems.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

function collectPromotionCandidates(
  privateEntries: KnowledgeEntry[],
  metaMap: Map<string, PrivateKnowledgeMeta>,
): PromotionCandidate[] {
  const candidates: PromotionCandidate[] = [];

  for (const entry of privateEntries) {
    const meta = metaMap.get(entry.id);
    const refs = meta?.referenceCount ?? 0;

    if (refs >= PROMOTE_REF_THRESHOLD) {
      candidates.push({
        id: entry.id,
        title: entry.title,
        referenceCount: refs,
        tags: entry.tags,
        reason: `已被引用 ${refs} 次，建议晋升为行为知识（Skill）以便全局复用`,
      });
    }
  }

  return candidates.sort((a, b) => b.referenceCount - a.referenceCount);
}

// ─── 一致性检查 ─────────────────────────────────────────────────────────────

/**
 * 执行术语一致性和文档链路完整性检查
 */
function checkConsistency(index: KnowledgeIndex): ConsistencyReport {
  const glossaryIssues = checkGlossaryConsistency(index);
  const docChainGaps = checkDocChainIntegrity(index);

  // 计算一致性分数
  const totalIssues = glossaryIssues.length + docChainGaps.length;
  const score = totalIssues === 0 ? 100 : Math.max(0, 100 - totalIssues * 10);

  return { glossaryIssues, docChainGaps, score };
}

/**
 * 检查术语一致性
 *
 * 策略：从 GLOSSARY 类型文档中提取术语，检查同一术语是否在不同文档中有冲突定义
 */
function checkGlossaryConsistency(index: KnowledgeIndex): GlossaryIssue[] {
  const glossaryEntries = index.entries.filter(
    e => e.source === 'workspace-doc' && e.docType?.toUpperCase() === 'GLOSSARY'
  );

  if (glossaryEntries.length <= 1) return [];

  // 按标题分组：相同标题的术语可能有冲突定义
  const termMap = new Map<string, KnowledgeEntry[]>();
  for (const entry of glossaryEntries) {
    const key = entry.title.toLowerCase().trim();
    const group = termMap.get(key) ?? [];
    group.push(entry);
    termMap.set(key, group);
  }

  const issues: GlossaryIssue[] = [];
  for (const [term, entries] of termMap) {
    if (entries.length > 1) {
      // 同名术语出现多次，检查摘要是否不同
      const uniqueSummaries = new Set(entries.map(e => e.summary.slice(0, 100)));
      if (uniqueSummaries.size > 1) {
        issues.push({
          term,
          conflictingEntries: entries.map(e => ({
            id: e.id,
            title: e.title,
            definition: e.summary.slice(0, 150),
          })),
        });
      }
    }
  }

  return issues;
}

/**
 * 检查文档链路完整性
 *
 * 策略：检查 doc-chain 上下游引用是否存在对应文档
 * 如 SDD 应该有上游 PRD，PLAN 应该有上游 SDD
 */
function checkDocChainIntegrity(index: KnowledgeIndex): DocChainGap[] {
  const DOC_CHAIN_EXPECTED: Array<{ from: string; to: string }> = [
    { from: 'PRD', to: 'SDD' },
    { from: 'SDD', to: 'MODULE' },
    { from: 'SDD', to: 'PLAN' },
    { from: 'PLAN', to: 'TASK' },
  ];

  const docEntries = index.entries.filter(e => e.source === 'workspace-doc');
  const docTypeSet = new Set(docEntries.map(e => (e.docType ?? '').toUpperCase()));

  const gaps: DocChainGap[] = [];

  for (const chain of DOC_CHAIN_EXPECTED) {
    // 如果上游文档类型存在但下游不存在，记录缺口
    if (docTypeSet.has(chain.from) && !docTypeSet.has(chain.to)) {
      gaps.push({
        expectedDocType: chain.to,
        upstreamDoc: chain.from,
        description: `存在 ${chain.from} 文档但缺少下游 ${chain.to} 文档，建议补充以完善文档链路`,
      });
    }
  }

  return gaps;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────

async function loadAllMeta(workDir: string): Promise<Map<string, PrivateKnowledgeMeta>> {
  const map = new Map<string, PrivateKnowledgeMeta>();
  try {
    const metaDir = `${workDir}/${META_DIR}`;
    const files = await fileList(metaDir);
    if (!files || files.length === 0) return map;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fileRead(`${metaDir}/${file}`);
        if (content) {
          const meta = JSON.parse(content) as PrivateKnowledgeMeta;
          map.set(meta.knowledgeId, meta);
        }
      } catch {
        // skip corrupted meta files
      }
    }
  } catch {
    // meta dir doesn't exist yet
  }
  return map;
}

function getDaysSince(dateStr: string | undefined, now: number): number {
  if (!dateStr) return 999;
  try {
    const ms = now - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}
