/**
 * 知识索引服务（三源聚合）
 *
 * 聚合三个知识来源构建统一索引：
 * 1. 行为知识（OpenWork Skill API）
 * 2. 私有知识（本地文件 .xingjing/solo/knowledge/）
 * 3. Workspace 文档知识（dir-graph.yaml 驱动扫描）
 *
 * 提供关键词检索 + 多维排序（融合文档链路距离和知识层级近邻度）。
 */

import { fileRead, fileWrite } from './opencode-client';
import { loadSoloKnowledge, type SoloKnowledgeItem } from './file-store';
import { listBehaviorKnowledge, type BehaviorKnowledge, type SkillApiAdapter, type ApplicableScene } from './knowledge-behavior';
import { extractKeywords } from './memory-store';

// ─── 三源知识类型定义 ──────────────────────────────────────────────────────────

/** Workspace 文档知识（由 dir-graph.yaml 驱动扫描） */
export interface WorkspaceDocKnowledge {
  id: string;
  docType: string;
  category: 'baseline' | 'process-delivery' | 'process-research';
  layer: string;
  title: string;
  summary: string;
  tags: string[];
  filePath: string;
  owner: string;
  upstream: string[];
  downstream: string[];
  frontmatter: Record<string, unknown>;
  lifecycle: 'living' | 'stable';
  indexedAt: string;
}

/** 私有知识元数据 */
export interface PrivateKnowledgeMeta {
  knowledgeId: string;
  source: 'behavior' | 'private' | 'workspace-doc';
  lastReferencedAt?: string;
  referenceCount: number;
  personalNotes?: string;
}

/** 统一知识条目（用于索引和检索） */
export interface KnowledgeEntry {
  id: string;
  source: 'behavior' | 'private' | 'workspace-doc';
  title: string;
  summary: string;
  tags: string[];
  category: string;
  applicableScenes: string[];
  docType?: string;
  layer?: string;
  owner?: string;
  upstream?: string[];
  downstream?: string[];
  lifecycle: 'living' | 'stable';
  date?: string;
  filePath?: string;
}

/** dir-graph 配置模型 */
export interface DirGraphConfig {
  version: string;
  mode: 'solo' | 'team';
  pathVars: Record<string, string | string[]>;
  layers: Array<{ id: string; path: string; contains: string[] }>;
  docTypes: Record<string, {
    category: 'baseline' | 'process-delivery' | 'process-research';
    naming: string;
    locations: string[];
    owner: string;
    upstream?: string[];
    downstream?: string[];
    index?: string;
  }>;
  docChain: Array<{ from: string; to: string; gate: string }>;
  agents: Record<string, { outputs: Array<{ type: string; path: string }> }>;
}

// ─── 知识索引结构 ──────────────────────────────────────────────────────────────

export interface KnowledgeIndex {
  version: 1;
  entries: KnowledgeEntry[];
  tagIndex: Record<string, string[]>;
  sceneIndex: Record<string, string[]>;
  docTypeIndex: Record<string, string[]>;
  layerIndex: Record<string, string[]>;
  invertedIndex: Record<string, string[]>;
  builtAt: string;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const INDEX_PATH = '.xingjing/solo/knowledge/_index.json';
const DOC_INDEX_PATH = '.xingjing/solo/knowledge/_doc-index.json';
const META_DIR = '.xingjing/solo/knowledge/_meta';

// ─── 索引构建 ──────────────────────────────────────────────────────────────────

/**
 * 构建三源知识索引
 */
export async function buildKnowledgeIndex(
  workDir: string,
  skillApi: SkillApiAdapter | null,
): Promise<KnowledgeIndex> {
  const entries: KnowledgeEntry[] = [];

  // 1. 行为知识（Skill API）
  if (skillApi) {
    try {
      const behaviorItems = await listBehaviorKnowledge(skillApi);
      for (const item of behaviorItems) {
        entries.push(behaviorToEntry(item));
      }
    } catch (e) {
      console.warn('[knowledge-index] Failed to load behavior knowledge:', e);
    }
  }

  // 2. 私有知识（本地文件）
  try {
    const privateItems = await loadSoloKnowledge(workDir);
    for (const item of privateItems) {
      entries.push(privateToEntry(item));
    }
  } catch (e) {
    console.warn('[knowledge-index] Failed to load private knowledge:', e);
  }

  // 3. Workspace 文档知识（从 _doc-index.json 加载，由 knowledge-scanner 生成）
  try {
    const docContent = await fileRead(`${workDir}/${DOC_INDEX_PATH}`);
    if (docContent) {
      const docItems = JSON.parse(docContent) as WorkspaceDocKnowledge[];
      for (const item of docItems) {
        entries.push(docToEntry(item));
      }
    }
  } catch {
    // 文档索引不存在或解析失败，跳过
  }

  // 4. 构建多维索引
  const tagIndex: Record<string, string[]> = {};
  const sceneIndex: Record<string, string[]> = {};
  const docTypeIndex: Record<string, string[]> = {};
  const layerIndex: Record<string, string[]> = {};
  const invertedIndex: Record<string, string[]> = {};

  for (const entry of entries) {
    // 标签索引
    for (const tag of entry.tags) {
      if (!tagIndex[tag]) tagIndex[tag] = [];
      tagIndex[tag].push(entry.id);
    }
    // 场景索引
    for (const scene of entry.applicableScenes) {
      if (!sceneIndex[scene]) sceneIndex[scene] = [];
      sceneIndex[scene].push(entry.id);
    }
    // 文档类型索引
    if (entry.docType) {
      if (!docTypeIndex[entry.docType]) docTypeIndex[entry.docType] = [];
      docTypeIndex[entry.docType].push(entry.id);
    }
    // 层级索引
    if (entry.layer) {
      if (!layerIndex[entry.layer]) layerIndex[entry.layer] = [];
      layerIndex[entry.layer].push(entry.id);
    }
    // 全文倒排索引（简单分词）
    const text = `${entry.title} ${entry.summary} ${entry.tags.join(' ')}`;
    const words = extractKeywords(text);
    for (const word of words) {
      if (!invertedIndex[word]) invertedIndex[word] = [];
      if (!invertedIndex[word].includes(entry.id)) {
        invertedIndex[word].push(entry.id);
      }
    }
  }

  const index: KnowledgeIndex = {
    version: 1,
    entries,
    tagIndex,
    sceneIndex,
    docTypeIndex,
    layerIndex,
    invertedIndex,
    builtAt: new Date().toISOString(),
  };

  // 缓存到本地
  await cacheIndex(workDir, index);

  return index;
}

/**
 * 加载缓存的索引（避免每次重建）
 */
export async function loadCachedIndex(workDir: string): Promise<KnowledgeIndex | null> {
  try {
    const content = await fileRead(`${workDir}/${INDEX_PATH}`);
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed.version !== 1) return null;
    return parsed as KnowledgeIndex;
  } catch {
    return null;
  }
}

async function cacheIndex(workDir: string, index: KnowledgeIndex): Promise<void> {
  try {
    await fileWrite(`${workDir}/${INDEX_PATH}`, JSON.stringify(index, null, 2));
  } catch {
    // silent
  }
}

// ─── 知识检索 ──────────────────────────────────────────────────────────────────

export interface SearchContext {
  query: string;
  agentId?: string;
  scene?: string;
  targetDocType?: string;
  currentLayer?: string;
}

/**
 * 搜索知识索引
 */
export function searchKnowledge(
  index: KnowledgeIndex,
  context: SearchContext,
  maxResults = 5,
): KnowledgeEntry[] {
  const keywords = extractKeywords(context.query);
  if (keywords.length === 0 && !context.scene && !context.targetDocType) {
    return [];
  }

  // 收集候选条目 ID
  const candidateIds = new Set<string>();

  // 通过倒排索引匹配关键词
  for (const kw of keywords) {
    const ids = index.invertedIndex[kw];
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // 通过标签索引匹配
  for (const kw of keywords) {
    const ids = index.tagIndex[kw];
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // 通过场景索引匹配
  if (context.scene) {
    const ids = index.sceneIndex[context.scene];
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  // 通过文档类型索引匹配
  if (context.targetDocType) {
    const ids = index.docTypeIndex[context.targetDocType];
    if (ids) ids.forEach(id => candidateIds.add(id));
  }

  if (candidateIds.size === 0) return [];

  // 查找对应的条目
  const candidates = index.entries.filter(e => candidateIds.has(e.id));

  // 排序
  const ranked = rankKnowledgeResults(candidates, context, keywords);

  return ranked.slice(0, maxResults);
}

// ─── 知识排序（融合文档链路） ──────────────────────────────────────────────────

// doc-chain 的标准顺序（用于链路距离计算）
const DOC_CHAIN_ORDER = ['GLOSSARY', 'PRD', 'SDD', 'MODULE', 'PLAN', 'TASK'];

// 层级优先级（近层优先）
const LAYER_PRIORITY: Record<string, number> = {
  'feature': 5,
  'form': 5,
  'application': 4,
  'domain': 3,
  'product-line': 2,
  'product': 2,
  'platform': 1,
};

/**
 * 多维排序：
 * 1. 场景匹配 (0.25)
 * 2. 标签相关性 (0.20)
 * 3. 文档链路近邻度 (0.20)
 * 4. 时效性 (0.10)
 * 5. 热度 (0.10)
 * 6. 知识层级近邻度 (0.10)
 * 7. 生命周期 (0.05)
 */
function rankKnowledgeResults(
  entries: KnowledgeEntry[],
  context: SearchContext,
  keywords: string[],
): KnowledgeEntry[] {
  const scored = entries.map(entry => {
    let score = 0;

    // 1. 场景匹配 (0.25)
    if (context.scene && entry.applicableScenes.includes(context.scene)) {
      score += 0.25;
    } else if (context.agentId && entry.owner === context.agentId) {
      score += 0.20;
    }

    // 2. 标签相关性 (0.20)
    if (keywords.length > 0) {
      const entryText = `${entry.title} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
      let matches = 0;
      for (const kw of keywords) {
        if (entryText.includes(kw)) matches++;
      }
      score += 0.20 * (matches / keywords.length);
    }

    // 3. 文档链路近邻度 (0.20)
    if (context.targetDocType && entry.docType) {
      const distance = calculateDocChainDistance(context.targetDocType, entry.docType);
      if (distance === 0) score += 0.20;
      else if (distance === 1) score += 0.15;
      else if (distance === 2) score += 0.08;
      else score += 0.05;
    }

    // 4. 时效性 (0.10)
    if (entry.date) {
      const ageMs = Date.now() - new Date(entry.date).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 7) score += 0.10;
      else if (ageDays < 30) score += 0.08;
      else if (ageDays < 90) score += 0.05;
      else score += 0.02;
    }

    // 5. 热度 (0.10) — TODO: 从 _meta 加载 referenceCount（阶段三实现）
    // 暂时给所有条目一个基础分
    score += 0.03;

    // 6. 知识层级近邻度 (0.10)
    if (entry.layer) {
      const entryPriority = LAYER_PRIORITY[entry.layer] ?? 1;
      const currentPriority = context.currentLayer ? (LAYER_PRIORITY[context.currentLayer] ?? 3) : 3;
      const layerDistance = Math.abs(entryPriority - currentPriority);
      if (layerDistance === 0) score += 0.10;
      else if (layerDistance === 1) score += 0.07;
      else if (layerDistance === 2) score += 0.04;
      else score += 0.02;
    }

    // 7. 生命周期 (0.05)
    score += entry.lifecycle === 'stable' ? 0.05 : 0.02;

    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.entry);
}

/**
 * 计算文档链路距离
 */
function calculateDocChainDistance(targetType: string, entryType: string): number {
  const targetIdx = DOC_CHAIN_ORDER.indexOf(targetType.toUpperCase());
  const entryIdx = DOC_CHAIN_ORDER.indexOf(entryType.toUpperCase());
  if (targetIdx < 0 || entryIdx < 0) return 99;
  return Math.abs(targetIdx - entryIdx);
}

// ─── 引用元数据 ──────────────────────────────────────────────────────────────

/**
 * 更新知识引用元数据
 */
export async function updateReferenceMeta(
  workDir: string,
  knowledgeId: string,
  source: PrivateKnowledgeMeta['source'],
): Promise<void> {
  const metaPath = `${workDir}/${META_DIR}/${knowledgeId}.json`;
  try {
    let meta: PrivateKnowledgeMeta;
    const existing = await fileRead(metaPath);
    if (existing) {
      meta = JSON.parse(existing) as PrivateKnowledgeMeta;
      meta.referenceCount += 1;
      meta.lastReferencedAt = new Date().toISOString();
    } else {
      meta = {
        knowledgeId,
        source,
        referenceCount: 1,
        lastReferencedAt: new Date().toISOString(),
      };
    }
    await fileWrite(metaPath, JSON.stringify(meta, null, 2));
  } catch {
    // silent
  }
}

// ─── 类型转换工具 ──────────────────────────────────────────────────────────────

function behaviorToEntry(item: BehaviorKnowledge): KnowledgeEntry {
  return {
    id: `bh-${item.id}`,
    source: 'behavior',
    title: item.title,
    summary: item.content.slice(0, 200),
    tags: item.tags,
    category: item.category,
    applicableScenes: item.applicableScenes,
    lifecycle: item.lifecycle,
    date: undefined,
  };
}

function privateToEntry(item: SoloKnowledgeItem): KnowledgeEntry {
  return {
    id: `pv-${item.id}`,
    source: 'private',
    title: item.title,
    summary: item.content.slice(0, 200),
    tags: item.tags,
    category: item.category,
    applicableScenes: mapCategoryToScenes(item.category),
    lifecycle: 'living',
    date: item.date,
  };
}

function docToEntry(item: WorkspaceDocKnowledge): KnowledgeEntry {
  return {
    id: `doc-${item.id}`,
    source: 'workspace-doc',
    title: item.title,
    summary: item.summary,
    tags: item.tags,
    category: item.category,
    applicableScenes: mapDocTypeToScenes(item.docType),
    docType: item.docType,
    layer: item.layer,
    owner: item.owner,
    upstream: item.upstream,
    downstream: item.downstream,
    lifecycle: item.lifecycle,
    date: item.indexedAt,
    filePath: item.filePath,
  };
}

function mapCategoryToScenes(category: string): string[] {
  switch (category) {
    case 'pitfall': return ['code-development', 'technical-design'];
    case 'user-insight': return ['product-planning', 'requirement-design'];
    case 'tech-note': return ['technical-design', 'code-development'];
    default: return [];
  }
}

function mapDocTypeToScenes(docType: string): string[] {
  const upper = docType.toUpperCase();
  switch (upper) {
    case 'PRD': return ['product-planning', 'requirement-design'];
    case 'SDD': return ['technical-design', 'requirement-design'];
    case 'MODULE': return ['technical-design', 'code-development'];
    case 'PLAN': case 'TASK': return ['code-development'];
    case 'GLOSSARY': return ['product-planning', 'requirement-design', 'technical-design', 'code-development'];
    default: return ['product-planning'];
  }
}
