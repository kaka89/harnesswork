/**
 * 产品洞察持久化服务
 *
 * 负责 InsightRecord（外部调研记录）和 ProductSuggestion（产品建议）的读写。
 * 存储路径：knowledge/insights/（遵循 dir-graph.yaml Knowledge 规范）
 *
 * 文件格式：
 *   knowledge/insights/{id}.md — 单条洞察/知识条目（frontmatter + Markdown body）
 *
 * 兼容两种 frontmatter 格式：
 *   1. Knowledge 标准格式：id, category(user-insight), title, tags, feature, createdAt
 *   2. InsightRecord 格式：id, insightCategory, title, createdAt, linkedHypotheses
 */
import { readMarkdownDir, writeMarkdownWithFrontmatter, deleteFile } from './file-store';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface InsightSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export type InsightCategory = 'competitor' | 'market' | 'user' | 'tech' | 'general';

export interface InsightRecord {
  id: string;
  query: string;
  /** AI 摘要（Markdown 格式） */
  summary: string;
  sources: InsightSource[];
  suggestions: ProductSuggestion[];
  category: InsightCategory;
  createdAt: string;
  /** 关联的假设 ID 列表 */
  linkedHypotheses?: string[];
}

export type SuggestionPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type SuggestionCategory = 'feature' | 'positioning' | 'pricing' | 'ux' | 'growth';

export interface ProductSuggestion {
  id: string;
  title: string;
  rationale: string;
  priority: SuggestionPriority;
  category: SuggestionCategory;
  /** 是否可直接转为需求 */
  actionable: boolean;
  /** 来源洞察记录 ID */
  sourceInsightId?: string;
  createdAt: string;
  /** 已被采纳：转为需求或假设 */
  adopted?: boolean;
}

// ─── 路径常量（遵循 dir-graph.yaml: knowledge/insights/）─────────────────────

const INSIGHTS_DIR = 'knowledge/insights';

function insightFilePath(id: string): string {
  return `${INSIGHTS_DIR}/${id}.md`;
}

// ─── InsightRecord CRUD ───────────────────────────────────────────────────────

/**
 * 加载所有洞察记录，从 knowledge/insights/ 目录扫描 Markdown 文件
 * 兼容 Knowledge 标准格式与 InsightRecord 格式
 */
export async function loadInsightRecords(workDir: string): Promise<InsightRecord[]> {
  try {
    const docs = await readMarkdownDir<Record<string, unknown>>(INSIGHTS_DIR, workDir);
    return docs
      .map(doc => parseKnowledgeToInsight(doc.frontmatter, doc.body))
      .filter(r => !!r.id);
  } catch {
    return [];
  }
}

/**
 * 保存一条洞察记录到 knowledge/insights/{id}.md
 * 使用 Knowledge 兼容的 frontmatter 格式
 */
export async function saveInsightRecord(workDir: string, record: InsightRecord): Promise<boolean> {
  const frontmatter: Record<string, unknown> = {
    id: record.id,
    category: 'user-insight',         // Knowledge 标准 category
    title: record.query,
    tags: record.sources.slice(0, 5).map(s => s.title).filter(Boolean),
    createdAt: record.createdAt,
    insightCategory: record.category,  // 保留 InsightRecord 原始分类
    linkedHypotheses: record.linkedHypotheses ?? [],
  };
  const body = serializeInsightBody(record);
  return writeMarkdownWithFrontmatter(
    insightFilePath(record.id),
    { frontmatter, body },
    workDir,
  );
}

/**
 * 删除一条洞察记录
 */
export async function deleteInsightRecord(workDir: string, id: string): Promise<boolean> {
  try {
    await deleteFile(insightFilePath(id), workDir);
    return true;
  } catch {
    return false;
  }
}

// ─── 序列化/反序列化 ──────────────────────────────────────────────────────────

/**
 * 将 InsightRecord body 序列化为 Markdown（不含 frontmatter，由 writeMarkdownWithFrontmatter 处理）
 */
function serializeInsightBody(record: InsightRecord): string {
  const parts: string[] = [];
  parts.push(`## 摘要\n\n${record.summary}`);

  if (record.sources.length > 0) {
    parts.push(`## 来源\n\n${record.sources.map(s =>
      `- [${s.title}](${s.url})\n  ${s.snippet.slice(0, 200)}`
    ).join('\n')}`);
  }

  if (record.suggestions.length > 0) {
    parts.push(`## 产品建议\n\n${record.suggestions.map(s =>
      `### [${s.priority}] ${s.title}\n${s.rationale}\n**分类**: ${s.category}`
    ).join('\n\n')}`);
  }

  return parts.join('\n\n') + '\n';
}

/**
 * 将 Knowledge 标准格式或 InsightRecord 格式的 frontmatter + body 映射为 InsightRecord
 *
 * 兼容策略：
 * - query:    优先 frontmatter.query，回退 frontmatter.title
 * - category: 优先 frontmatter.insightCategory（InsightRecord），
 *             否则从 Knowledge category 映射（user-insight → user, tech-note → tech）
 * - summary:  优先 ## 摘要（InsightRecord），回退 ## 洞察（Knowledge）
 * - sources:  优先 ## 来源，回退 ## 外部来源
 * - suggestions: ## 产品建议 / ## 建议方案
 */
function parseKnowledgeToInsight(
  fm: Record<string, unknown>,
  body: string,
): InsightRecord {
  const id = String(fm.id ?? '');
  const query = String(fm.query ?? fm.title ?? '');
  const createdAt = String(fm.createdAt ?? fm.date ?? '');

  // Category: insightCategory 优先（InsightRecord 保存的原始分类），否则从 Knowledge category 映射
  const rawInsightCat = String(fm.insightCategory ?? '');
  const VALID_CATS: InsightCategory[] = ['competitor', 'market', 'user', 'tech', 'general'];
  let category: InsightCategory;
  if (rawInsightCat && (VALID_CATS as string[]).includes(rawInsightCat)) {
    category = rawInsightCat as InsightCategory;
  } else {
    const knowledgeMap: Record<string, InsightCategory> = {
      'user-insight': 'user', 'tech-note': 'tech', 'pitfall': 'general',
    };
    category = knowledgeMap[String(fm.category ?? '')] ?? 'general';
  }

  const linkedHypotheses = Array.isArray(fm.linkedHypotheses)
    ? fm.linkedHypotheses.map(String)
    : [];

  // 提取摘要：兼容 ## 摘要（InsightRecord）/ ## 洞察（Knowledge）
  const summaryRe = new RegExp('## (?:摘要|洞察)\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)');
  const summaryMatch = body.match(summaryRe);
  const summary = summaryMatch ? summaryMatch[1].trim() : body.slice(0, 300).trim();

  // 提取来源：兼容 ## 来源 / ## 外部来源
  const sources: InsightSource[] = [];
  const sourceRe = new RegExp('## (?:来源|外部来源)\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)');
  const sourceSection = body.match(sourceRe);
  if (sourceSection) {
    const sourceLines = sourceSection[1].split('\n- ');
    for (const block of sourceLines) {
      const linkMatch = block.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const snippet = block.replace(linkMatch[0], '').replace(/\n\s+/, ' ').trim();
        sources.push({ title: linkMatch[1], url: linkMatch[2], snippet });
      }
    }
  }

  // 提取产品建议：兼容 ## 产品建议 / ## 建议方案
  const suggestions: ProductSuggestion[] = [];
  const sugRe = new RegExp('## (?:产品建议|建议方案)\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)');
  const sugSection = body.match(sugRe);
  if (sugSection) {
    const sugBlocks = sugSection[1].split(/\n### /);
    for (const block of sugBlocks) {
      if (!block.trim()) continue;
      const headerMatch = block.match(/^\[([^\]]+)\] (.+)/);
      if (!headerMatch) continue;
      const priority = headerMatch[1] as ProductSuggestion['priority'];
      const title = headerMatch[2].trim();
      const categoryMatch = block.match(/\*\*分类\*\*:\s*(.+)/);
      const sugCategory = (categoryMatch?.[1]?.trim() ?? 'ux') as ProductSuggestion['category'];
      const rationaleRaw = block
        .replace(/^\[[^\]]+\] .+\n/, '')
        .replace(/\*\*分类\*\*:.+/, '')
        .trim();
      suggestions.push({
        id: `sug-${id}-${title.slice(0, 10).replace(/\s/g, '-')}`,
        title, priority, category: sugCategory, rationale: rationaleRaw,
        actionable: true, createdAt, adopted: false,
      });
    }
  }

  return { id, query, summary, sources, suggestions, category, createdAt, linkedHypotheses };
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

export function generateInsightId(): string {
  return `insight-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generateSuggestionId(): string {
  return `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 将 InsightRecord 格式化为行为知识条目内容（用于写入 knowledge sink）
 */
export function formatInsightAsKnowledge(record: InsightRecord): string {
  const sourceList = record.sources.slice(0, 5)
    .map(s => `- ${s.title}: ${s.snippet.slice(0, 100)}`)
    .join('\n');
  return `# 产品洞察：${record.query}\n\n${record.summary}\n\n## 外部来源\n${sourceList}`;
}
