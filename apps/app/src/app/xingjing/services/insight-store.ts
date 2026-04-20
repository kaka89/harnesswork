/**
 * 产品洞察持久化服务
 *
 * 负责 InsightRecord（外部调研记录）和 ProductSuggestion（产品建议）的读写。
 * 存储路径：.xingjing/product/insights/
 *
 * 文件结构：
 *   index.yaml            — InsightRecord 索引（轻量，不含全文）
 *   {id}.md               — 单条洞察全文（含搜索来源、摘要、建议）
 *   suggestions.yaml      — ProductSuggestion 汇总列表
 */
import { readYaml, writeYaml, writeFile, readFile, deleteFile, parseFrontmatter } from './file-store';

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

// ─── 路径常量 ─────────────────────────────────────────────────────────────────

const INSIGHTS_DIR = '.xingjing/product/insights';
const INDEX_PATH = `${INSIGHTS_DIR}/index.yaml`;
const SUGGESTIONS_PATH = `${INSIGHTS_DIR}/suggestions.yaml`;

function insightFilePath(id: string): string {
  return `${INSIGHTS_DIR}/${id}.md`;
}

// ─── InsightRecord CRUD ───────────────────────────────────────────────────────

interface InsightIndex {
  records: Array<{
    id: string;
    query: string;
    category: InsightCategory;
    createdAt: string;
    summarySnippet: string;
    sourceCount: number;
  }>;
}

/**
 * 加载所有洞察记录（仅索引字段 + summary，不含完整 sources 详情）
 */
export async function loadInsightRecords(workDir: string): Promise<InsightRecord[]> {
  const index = await readYaml<InsightIndex>(INDEX_PATH, { records: [] }, workDir);
  if (!index.records?.length) return [];

  // 并发加载各条记录全文
  const records = await Promise.all(
    index.records.map(async (meta) => {
      const content = await readFile(insightFilePath(meta.id), workDir);
      if (!content) {
        // 索引存在但文件丢失，返回仅有 meta 的骨架
        return {
          id: meta.id, query: meta.query, category: meta.category,
          createdAt: meta.createdAt, summary: meta.summarySnippet,
          sources: [], suggestions: [],
        } as InsightRecord;
      }
      return parseInsightMarkdown(meta.id, content);
    }),
  );
  return records;
}

/**
 * 保存一条洞察记录（更新索引 + 写入全文文件）
 */
export async function saveInsightRecord(workDir: string, record: InsightRecord): Promise<boolean> {
  // 写入全文文件
  const markdown = serializeInsightMarkdown(record);
  const fileOk = await writeFile(insightFilePath(record.id), markdown, workDir);
  if (!fileOk) return false;

  // 更新索引
  const index = await readYaml<InsightIndex>(INDEX_PATH, { records: [] }, workDir);
  const existing = index.records?.findIndex((r) => r.id === record.id) ?? -1;
  const meta = {
    id: record.id,
    query: record.query,
    category: record.category,
    createdAt: record.createdAt,
    summarySnippet: record.summary.slice(0, 120).replace(/\n/g, ' '),
    sourceCount: record.sources.length,
  };
  if (existing >= 0) {
    index.records[existing] = meta;
  } else {
    index.records = [meta, ...(index.records ?? [])];
  }
  return writeYaml(INDEX_PATH, index as unknown as Record<string, unknown>, workDir);
}

/**
 * 删除一条洞察记录
 */
export async function deleteInsightRecord(workDir: string, id: string): Promise<boolean> {
  await deleteFile(insightFilePath(id), workDir);
  const index = await readYaml<InsightIndex>(INDEX_PATH, { records: [] }, workDir);
  index.records = (index.records ?? []).filter((r) => r.id !== id);
  return writeYaml(INDEX_PATH, index as unknown as Record<string, unknown>, workDir);
}

// ─── ProductSuggestion CRUD ───────────────────────────────────────────────────

interface SuggestionsFile {
  suggestions: ProductSuggestion[];
}

/**
 * 加载所有产品建议
 */
export async function loadProductSuggestions(workDir: string): Promise<ProductSuggestion[]> {
  const file = await readYaml<SuggestionsFile>(SUGGESTIONS_PATH, { suggestions: [] }, workDir);
  return file.suggestions ?? [];
}

/**
 * 新增或更新一条产品建议
 */
export async function upsertProductSuggestion(
  workDir: string,
  suggestion: ProductSuggestion,
): Promise<boolean> {
  const file = await readYaml<SuggestionsFile>(SUGGESTIONS_PATH, { suggestions: [] }, workDir);
  const list = file.suggestions ?? [];
  const idx = list.findIndex((s) => s.id === suggestion.id);
  if (idx >= 0) { list[idx] = suggestion; } else { list.unshift(suggestion); }
  return writeYaml(
    SUGGESTIONS_PATH,
    { suggestions: list } as unknown as Record<string, unknown>,
    workDir,
  );
}

/**
 * 标记建议为已采纳
 */
export async function adoptSuggestion(workDir: string, id: string): Promise<boolean> {
  const file = await readYaml<SuggestionsFile>(SUGGESTIONS_PATH, { suggestions: [] }, workDir);
  const list = file.suggestions ?? [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], adopted: true };
  return writeYaml(
    SUGGESTIONS_PATH,
    { suggestions: list } as unknown as Record<string, unknown>,
    workDir,
  );
}

// ─── 序列化/反序列化 ──────────────────────────────────────────────────────────

function serializeInsightMarkdown(record: InsightRecord): string {
  const frontmatter = {
    id: record.id,
    query: record.query,
    category: record.category,
    createdAt: record.createdAt,
    sourceCount: record.sources.length,
    linkedHypotheses: record.linkedHypotheses ?? [],
  };
  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.length === 0) return `${k}: []`;
        return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join('\n');

  const sourcesSection = record.sources.length > 0
    ? `\n## 来源\n\n${record.sources.map(s =>
      `- [${s.title}](${s.url})\n  ${s.snippet.slice(0, 200)}`
    ).join('\n')}`
    : '';

  const suggestionsSection = record.suggestions.length > 0
    ? `\n## 产品建议\n\n${record.suggestions.map(s =>
      `### [${s.priority}] ${s.title}\n${s.rationale}\n**分类**: ${s.category}`
    ).join('\n\n')}`
    : '';

  return `---\n${fmLines}\n---\n\n## 摘要\n\n${record.summary}${sourcesSection}${suggestionsSection}\n`;
}

function parseInsightMarkdown(id: string, content: string): InsightRecord {
  const doc = parseFrontmatter<Record<string, unknown>>(content);
  const fm = doc.frontmatter;
  const body = doc.body;

  const query = String(fm.query ?? '');
  const category = (String(fm.category ?? 'general')) as InsightCategory;
  const createdAt = String(fm.createdAt ?? '');
  const linkedHypotheses = Array.isArray(fm.linkedHypotheses)
    ? fm.linkedHypotheses.map(String)
    : [];

  // 提取摘要段落
  const summaryRe = new RegExp('## 摘要\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)');
  const summaryMatch = body.match(summaryRe);
  const summary = summaryMatch ? summaryMatch[1].trim() : body.slice(0, 300);

  // 提取来源
  const sources: InsightSource[] = [];
  const sourceRe = new RegExp('## 来源\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)');
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

  return {
    id, query, category, createdAt, summary,
    sources, suggestions: [], linkedHypotheses,
  };
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
