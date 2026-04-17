/**
 * Web Search 工具抽象层
 *
 * 核心职责：
 * 1. 定义 SearchResultItem / SearchResult 类型，供 InsightExecutor 使用
 * 2. 从 Agent 输出文本中解析搜索相关标记（降级方案）
 * 3. 从工具调用结果（onToolResult 回调）中提取结构化数据
 *
 * 工具调用实现说明：
 * 实际的 web_search 调用由 OpenCode 框架自动处理（Agent 系统提示中声明工具）。
 * 我们通过 CallAgentOptions.onToolUse / onToolResult 回调获取可见性。
 */

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface SearchResult {
  query: string;
  items: SearchResultItem[];
  /** 搜索引擎报告的总结果数（估计值） */
  totalFound?: number;
}

export type SearchIntent = 'competitor' | 'market' | 'user-pain' | 'tech' | 'general';

export interface SearchQuery {
  query: string;
  intent: SearchIntent;
  maxResults?: number;
}

// ─── 来源域名提取 ─────────────────────────────────────────────────────────────

/**
 * 从 URL 或文本中提取域名列表（用于 ToolCallStepCard 展示）
 */
export function extractDomains(text: string): string[] {
  const domains = new Set<string>();
  const urlPattern = /https?:\/\/([^/\s,"']+)/g;
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(text)) !== null) {
    let domain = m[1].split('/')[0];
    // 去除 www. 前缀
    domain = domain.replace(/^www\./, '');
    if (domain && domain.length < 50) domains.add(domain);
  }
  return Array.from(domains).slice(0, 6);
}

/**
 * 从工具结果文本中解析 SearchResultItem 列表
 *
 * 支持多种格式：
 * 1. OpenCode web_search 标准 JSON 格式
 * 2. 纯文本（snippet 形式）
 */
export function parseSearchResultsFromToolOutput(toolResult: string): SearchResultItem[] {
  if (!toolResult.trim()) return [];

  // 尝试 JSON 解析
  try {
    const raw = JSON.parse(toolResult);
    // 格式 1: { results: [...] }
    if (raw && Array.isArray(raw.results)) {
      return (raw.results as Array<Record<string, unknown>>).map(r => ({
        title: String(r.title ?? r.name ?? ''),
        url: String(r.url ?? r.link ?? ''),
        snippet: String(r.snippet ?? r.description ?? r.body ?? ''),
        publishedDate: r.publishedDate ? String(r.publishedDate) : undefined,
      })).filter(r => r.title || r.url);
    }
    // 格式 2: [...] 直接数组
    if (Array.isArray(raw)) {
      return (raw as Array<Record<string, unknown>>).map(r => ({
        title: String(r.title ?? r.name ?? ''),
        url: String(r.url ?? r.link ?? ''),
        snippet: String(r.snippet ?? r.description ?? r.body ?? ''),
        publishedDate: r.publishedDate ? String(r.publishedDate) : undefined,
      })).filter(r => r.title || r.url);
    }
  } catch { /* fall through to text parsing */ }

  // 文本解析：提取 URL 和相邻标题/摘要
  const items: SearchResultItem[] = [];
  const lines = toolResult.split('\n');
  let current: Partial<SearchResultItem> | null = null;

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (urlMatch) {
      if (current?.url) items.push(current as SearchResultItem);
      current = { url: urlMatch[0], title: line.replace(urlMatch[0], '').trim() || urlMatch[0], snippet: '' };
    } else if (current && line.trim()) {
      current.snippet = ((current.snippet ?? '') + ' ' + line.trim()).trim();
    }
  }
  if (current?.url) items.push(current as SearchResultItem);

  return items.slice(0, 10);
}

/**
 * 从工具调用参数中提取搜索关键词
 */
export function extractQueryFromToolInput(toolInput: Record<string, unknown>): string {
  return String(
    toolInput.query ?? toolInput.q ?? toolInput.search_query ??
    toolInput.keyword ?? toolInput.text ?? ''
  ).trim();
}

/**
 * 统计结果条数的摘要文本（用于 ToolCallStepCard.detail）
 */
export function summarizeSearchResults(items: SearchResultItem[], query: string): string {
  if (items.length === 0) return `搜索"${query}"未找到结果`;
  return `找到 ${items.length} 条结果`;
}
