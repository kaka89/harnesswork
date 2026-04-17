/**
 * 产品洞察 Agent 执行器
 *
 * 三模式执行流：
 *   研究模式 (research)  — web_search + 竞品/市场分析 → InsightRecord + ProductSuggestion[]
 *   记录模式 (record)    — 结构化假设提取 → Hypothesis
 *   生成模式 (generate)  — 综合上下文 + 可选搜索 → RequirementOutput
 *   对话模式 (chat)      — 通用产品讨论（无特殊结构化输出）
 */
import type { CallAgentOptions } from './opencode-client';
import type { Hypothesis } from '../mock/solo';
import type { RequirementOutput } from '../mock/solo';
import type { InsightRecord, ProductSuggestion } from './insight-store';
import { generateInsightId, generateSuggestionId } from './insight-store';
import type { ToolCallStep } from '../components/insight/tool-call-step-card';
import {
  extractDomains,
  parseSearchResultsFromToolOutput,
  extractQueryFromToolInput,
  summarizeSearchResults,
} from './web-search';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type InsightMode = 'research' | 'record' | 'generate' | 'chat' | 'auto';

export interface InsightRunOpts {
  workDir: string;
  model?: { providerID: string; modelID: string };
  mode?: InsightMode;
  /** callAgent 实现（来自 store.actions.callAgent） */
  callAgentFn: (opts: CallAgentOptions) => Promise<void>;
  /** 当前产品上下文（已有假设、需求摘要） */
  productContext?: string;
  /** 三源知识注入 */
  knowledgeContext?: string;
  // ── 进度回调 ────────────────────────────────────────────────────
  onModeDetected?: (mode: InsightMode) => void;
  onToolStep?: (step: ToolCallStep) => void;
  onToolStepDone?: (stepId: string, detail: string, sources: string[]) => void;
  onStream?: (text: string) => void;
  onInsightRecord?: (record: InsightRecord) => void;
  onHypothesisDraft?: (h: Hypothesis) => void;
  onRequirementDraft?: (r: RequirementOutput) => void;
  onDone?: (fullText: string) => void;
  onError?: (err: string) => void;
}

// ─── 意图识别 ─────────────────────────────────────────────────────────────────

const RESEARCH_KEYWORDS = [
  '分析', '竞品', '市场', '趋势', '对比', '调研', '搜索', '了解',
  '竞争', '对手', '搜一下', '查一查', '搜索', '最新', '行业', '用户评价',
  'competitor', 'market', 'search', 'research', 'trend',
];
const RECORD_KEYWORDS = [
  '记录', '假设', '想到', '发现', '用户说', '有个想法', '感觉',
  '我觉得', '应该', '猜测', '验证', '收到反馈', '用户反馈',
  '痛点', '需求点', '观察到',
];
const GENERATE_KEYWORDS = [
  '需求', '文档', 'PRD', '写一份', '生成', '细化', '输出',
  '需求文档', '用户故事', '验收标准', '功能规格', '写需求',
];

export function detectInsightMode(userPrompt: string): InsightMode {
  const text = userPrompt.toLowerCase();
  const researchScore = RESEARCH_KEYWORDS.filter(k => text.includes(k)).length;
  const recordScore = RECORD_KEYWORDS.filter(k => text.includes(k)).length;
  const generateScore = GENERATE_KEYWORDS.filter(k => text.includes(k)).length;

  const max = Math.max(researchScore, recordScore, generateScore);
  if (max === 0) return 'chat';
  if (researchScore === max) return 'research';
  if (generateScore === max) return 'generate';
  if (recordScore === max) return 'record';
  return 'chat';
}

// ─── System Prompt 构建 ────────────────────────────────────────────────────────

function buildResearchSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，专门帮助独立开发者了解竞品动态、市场趋势和用户反馈。

你拥有 web_search 工具，应主动调用它获取最新信息，不要依赖训练数据中的旧内容。

搜索策略（必须遵守）：
- 将用户问题拆解为 2-4 个不同搜索关键词，进行多轮搜索
- 优先搜索：竞品名 + "功能特性" / "用户评价" / "定价"
- 补充搜索：行业词 + "市场趋势" + "2025" 或 "2024"
- 优先引用近 12 个月的内容

【当前产品上下文】
${productContext || '（暂无产品上下文）'}

【输出格式】（严格遵循，不要遗漏任何章节）：

## 🔍 调研摘要
（2-3 句话，概括本次搜索发现的最核心内容）

## 💡 产品建议
（3-5 条，每条必须有外部数据/来源支撑）
格式：**[P0/P1/P2]** 建议标题（类别：feature/ux/pricing/positioning/growth）— 支撑理由（引用具体来源或数据）

## 📊 外部证据
（从搜索结果中提取 3-6 条关键数据点，每条附原始来源）
- 来源名称: 核心数据或观点（保留原始语言，不要过度总结）

## 🎯 建议的假设
（如果本次调研产生了高置信度的可验证假设，输出 JSON，否则省略此节）
\`\`\`hypothesis
{"belief":"我认为...","why":"因为外部数据显示...","method":"通过...验证","impact":"high|medium|low"}
\`\`\``;
}

function buildRecordSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，专门帮助快速结构化记录产品假设和用户洞察。

用户会描述一个想法、观察或用户反馈，你需要帮助将其结构化为可验证的产品假设。

【当前产品上下文】
${productContext || '（暂无产品上下文）'}

【工作方式】：
1. 用 1-2 句话确认你的理解，补充缺失的上下文
2. 输出结构化假设（严格 JSON 格式，放在 \`\`\`hypothesis 代码块中）
3. 如果信息不足以构建假设，追问 1 个最关键的问题

【输出格式】：
先写确认语，然后：
\`\`\`hypothesis
{
  "belief": "我认为[具体功能/改变]能[具体预期结果]",
  "why": "因为[用户痛点/数据支撑/逻辑推理]",
  "method": "通过[具体验证方法：内测/A-B测试/问卷/数据分析/用户访谈]，观察[可量化指标]",
  "impact": "high|medium|low"
}
\`\`\`

最后，如果有帮助，可以附上 1-2 条执行建议。`;
}

function buildGenerateSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，帮助将验证过的假设和洞察转化为可执行的产品需求文档。

你可以视情况使用 web_search 工具查询竞品实现方式作为参考。

【当前产品上下文】
${productContext || '（暂无产品上下文）'}

【需求文档输出规则】：
当需要生成需求文档时，必须在输出内容第一行加上标识行（格式：[REQ_DOC:模块名称]），随后输出完整需求文档：

[REQ_DOC:模块名称]
# 需求文档 · [模块名称]

## 用户故事
**作为** [用户角色]，**我希望** [期望功能]，**以便** [达成目标]。

## 功能规格
| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 功能1 | 具体描述 | P0 |

## 验收标准
- [ ] 标准1（可量化）
- [ ] 标准2（可量化）

## 竞品参考
（如有搜索结果，列出 1-2 个参考实现）

## 非功能需求
- 性能：具体指标
- 安全：要求
- 可用性：目标`;
}

function buildChatSystemPrompt(productContext: string): string {
  return `你是 AI 产品搭档，帮助独立开发者做产品决策、分析问题、规划路径。

【当前产品上下文】
${productContext || '（暂无产品上下文）'}

你的风格：务实、直接、有数据思维。回答聚焦于可执行的建议。
遇到需要外部数据支撑的问题，主动说明并建议用研究模式获取最新信息。`;
}

// ─── 结构化输出解析 ───────────────────────────────────────────────────────────

/**
 * 从 Agent 输出中提取假设 JSON
 */
export function parseHypothesisFromOutput(text: string): Hypothesis | null {
  const match = text.match(/```hypothesis\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1].trim()) as {
      belief?: string; why?: string; method?: string; impact?: string;
    };
    if (!raw.belief) return null;
    return {
      id: `h-${Date.now()}`,
      status: 'testing' as const,
      belief: raw.belief.trim(),
      why: raw.why?.trim() ?? '',
      method: raw.method?.trim() ?? '',
      impact: (['high', 'medium', 'low'].includes(raw.impact ?? '')
        ? raw.impact as 'high' | 'medium' | 'low'
        : 'medium'),
      createdAt: new Date().toISOString().slice(0, 10),
    };
  } catch { return null; }
}

/**
 * 从 Agent 输出中提取 [REQ_DOC:] 需求文档
 */
export function parseRequirementFromOutput(text: string): RequirementOutput | null {
  const match = text.match(/\[REQ_DOC:([^\]]+)\]/);
  if (!match) return null;
  const moduleName = match[1].trim();
  // 取 [REQ_DOC:] 标记之后的所有内容作为需求文档 body
  const bodyStart = text.indexOf(match[0]) + match[0].length;
  const content = text.slice(bodyStart).trim();
  if (!content) return null;
  return {
    id: `req-${Date.now()}`,
    title: `${moduleName} 需求文档`,
    type: 'user-story' as const,
    content,
    priority: 'P1' as const,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * 从 Agent 输出的"产品建议"章节提取 ProductSuggestion[]
 */
export function parseProductSuggestions(text: string, sourceInsightId: string): ProductSuggestion[] {
  const section = text.match(/##\s*💡\s*产品建议\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!section) return [];

  const suggestions: ProductSuggestion[] = [];
  const lines = section[1].split('\n').filter(l => l.trim().startsWith('**['));

  for (const line of lines) {
    // 格式：**[P0]** 标题（类别）— 理由
    const m = line.match(/\*\*\[([P0-3])\]\*\*\s*(.+?)(?:\（([^）]+)）)?\s*[—-]\s*(.+)/);
    if (!m) continue;
    const categoryMap: Record<string, ProductSuggestion['category']> = {
      'feature': 'feature', '功能': 'feature',
      'ux': 'ux', '体验': 'ux',
      'pricing': 'pricing', '定价': 'pricing',
      'positioning': 'positioning', '定位': 'positioning',
      'growth': 'growth', '增长': 'growth',
    };
    const rawCat = (m[3] ?? '').toLowerCase();
    const category = categoryMap[rawCat] ?? 'feature';

    suggestions.push({
      id: generateSuggestionId(),
      title: m[2].trim(),
      rationale: m[4].trim(),
      priority: m[1] as ProductSuggestion['priority'],
      category,
      actionable: true,
      sourceInsightId,
      createdAt: new Date().toISOString().slice(0, 10),
    });
  }
  return suggestions;
}

// ─── 主执行函数 ───────────────────────────────────────────────────────────────

/**
 * 执行产品洞察 Agent
 *
 * 整体流程：
 * 1. 意图识别（auto 模式下）
 * 2. 构建对应模式的 systemPrompt
 * 3. 调用 callAgentFn（工具调用由框架自动处理）
 * 4. 通过 onToolUse/onToolResult 追踪工具步骤 → 回调 onToolStep/onToolStepDone
 * 5. 输出完成后解析结构化输出 → 回调 onHypothesisDraft / onInsightRecord / onRequirementDraft
 */
export async function runInsightAgent(
  userPrompt: string,
  opts: InsightRunOpts,
): Promise<void> {
  // ── 1. 模式识别 ──
  const mode = opts.mode === 'auto' || !opts.mode
    ? detectInsightMode(userPrompt)
    : opts.mode;
  opts.onModeDetected?.(mode);

  const productCtx = opts.productContext ?? '';

  // ── 2. 构建 systemPrompt ──
  let systemPrompt: string;
  let autoApproveTools: string[] | undefined;
  switch (mode) {
    case 'research':
      systemPrompt = buildResearchSystemPrompt(productCtx);
      autoApproveTools = ['web_search', 'browser', 'webSearch', 'web-search'];
      break;
    case 'record':
      systemPrompt = buildRecordSystemPrompt(productCtx);
      break;
    case 'generate':
      systemPrompt = buildGenerateSystemPrompt(productCtx);
      autoApproveTools = ['web_search', 'browser', 'webSearch', 'web-search'];
      break;
    default:
      systemPrompt = buildChatSystemPrompt(productCtx);
  }

  // ── 3. 工具步骤追踪状态 ──
  // toolId → step
  const activeSteps = new Map<string, ToolCallStep>();
  let stepCounter = 0;

  const handleToolUse = (toolName: string, toolInput: Record<string, unknown>) => {
    const isSearchTool = /search|browser/i.test(toolName);
    const isAnalyzeTool = /analyz|inspect/i.test(toolName);
    const stepType = isSearchTool ? 'search' : isAnalyzeTool ? 'analyze' : 'thinking';

    const query = extractQueryFromToolInput(toolInput);
    const stepId = `step-${++stepCounter}`;
    const label = isSearchTool
      ? `搜索: ${query || toolName}`
      : `${toolName}: ${query || '处理中'}`;

    const step: ToolCallStep = {
      id: stepId,
      type: stepType,
      status: 'running',
      label,
      startedAt: Date.now(),
    };

    // 以 stepCounter 作 key（toolId 可能为空或重复）
    activeSteps.set(String(stepCounter), step);
    opts.onToolStep?.(step);
  };

  const handleToolResult = (toolName: string, result: string) => {
    const isSearchTool = /search|browser/i.test(toolName);

    // 找到最近一个 running 的 search step
    let targetKey: string | null = null;
    for (const [k, s] of activeSteps.entries()) {
      if (s.status === 'running' && (isSearchTool ? s.type === 'search' : true)) {
        targetKey = k;
      }
    }

    if (targetKey) {
      const step = activeSteps.get(targetKey)!;
      const items = isSearchTool ? parseSearchResultsFromToolOutput(result) : [];
      const sources = isSearchTool
        ? extractDomains(result)
        : [];
      const detail = isSearchTool
        ? summarizeSearchResults(items, step.label.replace('搜索: ', ''))
        : result.slice(0, 80);
      const duration = Date.now() - step.startedAt;
      activeSteps.delete(targetKey);
      opts.onToolStepDone?.(step.id, detail, sources);
    }
  };

  // ── 4. 执行 Agent ──
  let finalText = '';
  await opts.callAgentFn({
    systemPrompt,
    userPrompt,
    model: opts.model,
    title: `产品洞察-${mode}`,
    directory: opts.workDir,
    autoApproveTools,
    knowledgeContext: opts.knowledgeContext,
    onToolUse: handleToolUse,
    onToolResult: handleToolResult,
    onText: (text) => {
      finalText = text;
      opts.onStream?.(text);
    },
    onDone: (text) => {
      finalText = text;
      // ── 5. 结构化输出解析 ──
      _handleDone(text, mode, opts);
      opts.onDone?.(text);
    },
    onError: opts.onError,
  });
}

/**
 * 解析 Agent 输出，触发结构化回调
 */
function _handleDone(text: string, mode: InsightMode, opts: InsightRunOpts): void {
  // 假设提取（所有模式都可能有）
  const hypothesis = parseHypothesisFromOutput(text);
  if (hypothesis) opts.onHypothesisDraft?.(hypothesis);

  // 需求文档提取
  if (mode === 'generate') {
    const req = parseRequirementFromOutput(text);
    if (req) opts.onRequirementDraft?.(req);
  }

  // 洞察记录提取（研究模式）
  if (mode === 'research') {
    const insightId = generateInsightId();
    const suggestions = parseProductSuggestions(text, insightId);
    // 从"外部证据"章节提取来源
    const sources = _extractSourcesFromText(text);
    // 提取摘要（## 🔍 调研摘要 章节）
    const summaryMatch = text.match(/##\s*🔍\s*调研摘要\s*\n([\s\S]*?)(?=\n##\s|$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : text.slice(0, 300);

    // 推断 category
    const lower = text.toLowerCase();
    const category = lower.includes('竞品') || lower.includes('competitor')
      ? 'competitor'
      : lower.includes('市场') || lower.includes('market') ? 'market'
      : lower.includes('技术') || lower.includes('tech') ? 'tech'
      : 'general';

    const record: InsightRecord = {
      id: insightId,
      query: opts.productContext?.slice(0, 60) ?? '产品调研',
      summary,
      sources,
      suggestions,
      category,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    opts.onInsightRecord?.(record);
  }
}

function _extractSourcesFromText(text: string): import('./insight-store').InsightSource[] {
  const sources: import('./insight-store').InsightSource[] = [];
  // 提取 ## 📊 外部证据 章节
  const sectionMatch = text.match(/##\s*📊\s*外部证据\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!sectionMatch) return sources;

  const lines = sectionMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const title = line.slice(0, colonIdx).replace(/^[-\s*]+/, '').trim();
    const snippet = line.slice(colonIdx + 1).trim();
    // 提取 URL（如有）
    const urlMatch = snippet.match(/https?:\/\/\S+/);
    sources.push({ title, url: urlMatch ? urlMatch[0] : '', snippet: snippet.replace(urlMatch?.[0] ?? '', '').trim() });
  }
  return sources;
}

// ─── 快捷提示词生成 ───────────────────────────────────────────────────────────

export interface QuickPrompt {
  label: string;
  text: string;
  mode: InsightMode;
}

/**
 * 根据当前模式和产品名生成快捷提示词
 */
export function generateQuickPrompts(productName?: string, currentMode?: InsightMode): QuickPrompt[] {
  const name = productName || '你的产品';
  const prompts: QuickPrompt[] = [
    { label: '🔍 分析竞品', text: `帮我分析 ${name} 的主要竞品功能和定价策略`, mode: 'research' },
    { label: '🔍 市场趋势', text: `${name} 所在行业最新市场趋势和用户需求变化`, mode: 'research' },
    { label: '📋 记录假设', text: '我发现一个用户问题，帮我记录为假设：', mode: 'record' },
    { label: '📄 生成需求', text: '基于当前假设，帮我生成核心功能的需求文档', mode: 'generate' },
  ];

  // 当前是研究模式，补充更多研究快捷词
  if (currentMode === 'research') {
    prompts.push({ label: '🔍 用户评价', text: `${name} 竞品的用户评价和痛点分析`, mode: 'research' });
  }
  return prompts.slice(0, 4);
}
