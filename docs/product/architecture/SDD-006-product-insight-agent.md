# SDD-006 · 产品洞察 Agent：互联网搜索 + 假设记录 + 需求生成

**状态**: 设计稿  
**作者**: xingjing 产品团队  
**适用页面**: `/solo/product` — 产品洞察页面  
**前置条件**: Task 1–12 完成（OpenWork 原生能力已接入），SDD-005 完成（知识库体系已建立）

---

## 一、背景与目标

### 1.1 现状问题

当前"产品洞察"页面已具备：
- 假设验证看板（拖拽状态流转，本地持久化）
- 产品需求文档生成（AI 对话 + Markdown 输出）
- "奇想"快捷假设录入

**核心缺陷**：AI 搭档完全基于用户已有信息做推理，**没有外部视野**。产品经理需要：
- 了解竞品动态（竞品功能、定价、用户评价）
- 感知市场趋势（技术趋势、行业动向）
- 用外部数据佐证或推翻内部假设

### 1.2 设计目标

| 目标 | 描述 |
|------|------|
| 🔍 互联网搜索 | Agent 能主动调用 web_search 工具获取最新外部信息 |
| 💡 洞察生成 | 对搜索结果做结构化分析，给出产品建议 |
| 📋 假设记录 | 用户口头描述 → AI 自动结构化 → 一键存入假设看板 |
| 📄 需求输出 | AI 综合内外部信息 → 生成可编辑需求文档 |
| 🔄 Tool 可见 | UI 中展示 Agent 工具调用过程，让用户感知 AI 正在做什么 |

---

## 二、核心设计决策

### 2.1 工具调用可见性（关键设计）

**现有问题**：`callAgent` 的 `onText` 回调只返回文本流，工具调用对 UI 不可见，用户体验为黑盒。

**解决方案**：扩展 `CallAgentOptions` 加入 `onToolUse` / `onToolResult` 回调，在 `callAgent` 的 SSE 解析层抽取工具调用事件。同时 Insight Agent Panel UI 中用"步骤卡片"呈现工具调用过程。

```
用户发送 ──▶ [Agent 思考中...] ──▶ [🔍 搜索: "Notion AI 功能"] ──▶ [📥 获取到 12 条结果]
              ──▶ [🔍 搜索: "AI 写作工具市场份额 2024"] ──▶ [📥 获取到 8 条结果]
              ──▶ [✍️ 正在分析...] ──▶ [💡 洞察 + 产品建议]
```

每个步骤：展示搜索关键词 / 摘要结果数量 / 耗时。

### 2.2 Agent 工作模式（三模式设计）

| 模式 | 触发方式 | 工具调用 | 主要输出 |
|------|----------|----------|----------|
| 🔍 **研究模式** | 用户询问竞品/市场/趋势类问题 | web_search + 分析 | 洞察卡片 + 外部引用 |
| 📋 **记录模式** | 用户描述想法/假设/痛点 | 无（纯生成） | 结构化假设 → 存入看板 |
| 📄 **生成模式** | 用户要求输出需求/文档 | 可选 web_search | 需求文档 → 需求列表 |

模式自动识别（通过 Orchestrator 前置意图分类），也可手动切换。

### 2.3 数据流架构

```
用户输入
  │
  ├─ [InsightOrchestrator] 意图分类（研究/记录/生成）
  │      │
  │      ├─ 研究模式 → [InsightResearchAgent]
  │      │     ├─ 调用 web_search 工具（多轮，1-5次）
  │      │     ├─ 每次搜索结果 → parseSearchResults → SearchResultItem[]
  │      │     └─ 汇总分析 → InsightRecord + ProductSuggestion[]
  │      │
  │      ├─ 记录模式 → [HypothesisAgent]
  │      │     └─ 结构化输出 → Hypothesis JSON → saveHypothesis()
  │      │
  │      └─ 生成模式 → [RequirementAgent]
  │            ├─ 可选 web_search（竞品参考）
  │            └─ 输出 RequirementOutput Markdown → saveRequirementOutput()
  │
  └─ [KnowledgeSink] 将高质量洞察写入行为知识库
```

---

## 三、数据模型

### 3.1 新增数据类型

```typescript
// ─── InsightRecord：一条外部洞察 ────────────────────────────────────
interface InsightRecord {
  id: string;
  query: string;                    // 原始搜索查询
  sources: InsightSource[];         // 来源列表
  summary: string;                  // AI 摘要（Markdown）
  suggestions: ProductSuggestion[]; // 产品建议
  category: 'competitor' | 'market' | 'user' | 'tech' | 'general';
  createdAt: string;
  linkedHypotheses?: string[];      // 关联的假设 ID
}

interface InsightSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

interface ProductSuggestion {
  id: string;
  title: string;
  rationale: string;                // 支撑理由（含引用）
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'feature' | 'positioning' | 'pricing' | 'ux' | 'growth';
  actionable: boolean;              // 是否可直接转为需求
}

// ─── ToolCallStep：工具调用 UI 步骤 ────────────────────────────────
interface ToolCallStep {
  id: string;
  type: 'search' | 'analyze' | 'write' | 'thinking';
  status: 'running' | 'done' | 'error';
  label: string;                    // 如 "搜索: Notion AI 竞品分析"
  detail?: string;                  // 结果摘要
  startedAt: number;
  duration?: number;
}

// ─── InsightAgentMessage：扩展原有 ChatMessage ──────────────────────
interface InsightAgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolSteps?: ToolCallStep[];       // 工具调用步骤
  insightRecord?: InsightRecord;    // 附带洞察卡片
  hypothesis?: Hypothesis;          // 附带假设草稿
  requirementDraft?: RequirementOutput; // 附带需求草稿
  timestamp: string;
  mode: 'research' | 'record' | 'generate' | 'chat';
}
```

### 3.2 文件存储结构

```
.xingjing/
└── solo/
    └── product/
        ├── hypotheses.yaml         # 已有（假设列表）
        ├── requirements.yaml       # 已有（需求列表）
        └── insights/
            ├── index.yaml          # 洞察记录索引
            ├── {id}.md             # 各条洞察全文（含搜索结果原文）
            └── suggestions.yaml    # 产品建议汇总
```

---

## 四、服务层设计

### 4.1 `services/web-search.ts` — 搜索工具抽象

```typescript
/**
 * Web Search 工具抽象
 *
 * 实现路径优先级：
 * 1. OpenCode 内置 web_search 工具（通过 agent session 自动调用）
 * 2. 降级：解析 Agent 输出文本中的 [SEARCH_RESULT:...] 标记
 *
 * 核心约定：Agent 在 systemPrompt 中被告知可以调用 web_search 工具，
 * 工具调用由 OpenCode 框架自动处理，结果注入到 Agent 上下文。
 * 我们通过 onToolUse / onToolResult 回调获取可见性。
 */

export interface SearchQuery {
  query: string;
  intent: 'competitor' | 'market' | 'user-pain' | 'tech' | 'general';
  maxResults?: number;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface SearchResult {
  query: string;
  items: SearchResultItem[];
  totalFound: number;
}

/**
 * 解析 Agent 输出文本中内联的搜索结果标记（降级方案）
 * 当 OpenCode 工具调用可见性不可用时，通过解析文本获取结果摘要
 *
 * Agent 输出格式约定：
 * [SEARCH: <query>]
 * [RESULTS: <count> items]
 * [SOURCE: <title> | <url>]
 * <snippet>
 * [/SOURCE]
 * [/SEARCH]
 */
export function parseSearchMarkersFromText(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  // ... regex 解析实现
  return results;
}
```

### 4.2 `services/insight-executor.ts` — 洞察 Agent 执行器

```typescript
/**
 * 产品洞察 Agent 执行器
 *
 * 三模式执行流：
 * 1. 研究模式：先意图分类 → 生成搜索关键词 → 多轮 web_search → 综合分析
 * 2. 记录模式：提取结构化假设 → 返回 Hypothesis JSON
 * 3. 生成模式：结合当前上下文 + 可选搜索 → 生成需求文档
 */

export type InsightMode = 'research' | 'record' | 'generate' | 'auto';

export interface InsightRunOpts {
  workDir: string;
  model?: { providerID: string; modelID: string };
  mode?: InsightMode;
  callAgentFn: (opts: CallAgentOptions) => Promise<void>;
  /** 当前产品上下文（已有假设、需求摘要） */
  productContext?: string;
  /** 三源知识注入 */
  knowledgeContext?: string;
  // ── 进度回调 ──────────────────────────────────────────────────
  onModeDetected?: (mode: InsightMode) => void;
  onToolUse?: (step: ToolCallStep) => void;
  onToolResult?: (stepId: string, detail: string) => void;
  onStream?: (text: string) => void;
  onInsightRecord?: (record: InsightRecord) => void;
  onHypothesisDraft?: (h: Hypothesis) => void;
  onRequirementDraft?: (r: RequirementOutput) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
}

/**
 * 执行洞察 Agent
 *
 * Phase 1: 模式识别（auto 时由 LLM 判断）
 * Phase 2: 根据模式构建专属 systemPrompt + 工具配置
 * Phase 3: 执行 + 流式输出 + 工具调用追踪
 * Phase 4: 后处理（结构化提取 + 持久化）
 */
export async function runInsightAgent(
  userPrompt: string,
  opts: InsightRunOpts,
): Promise<void> {
  // ... 实现
}

/**
 * 构建研究模式的 systemPrompt
 * 明确告知 Agent：可用 web_search 工具，输出格式约定
 */
function buildResearchSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，帮助独立开发者了解竞品动态和市场趋势。

你拥有 web_search 工具，应主动搜索获取最新信息。搜索策略：
- 对用户的问题分解为 2-4 个搜索关键词
- 优先搜索: 竞品名称 + "功能" / "定价" / "用户评价"
- 补充搜索: 行业关键词 + "市场趋势" + 当前年份
- 搜索结果中优先引用近 12 个月的内容

【当前产品上下文】
${productContext}

【输出格式】（严格遵循）：
## 🔍 调研摘要
（2-3 句话概括本次发现）

## 💡 产品建议
按优先级列出 3-5 条可操作建议，每条格式：
**[P0/P1/P2]** 建议标题 — 理由（引用具体数据或来源）

## 📊 外部证据
- 来源1: 关键数据点
- 来源2: 关键数据点

## 🎯 建议的假设
（如果本次调研产生了可验证假设，按 JSON 格式列出）
\`\`\`hypothesis
{"belief":"...","why":"...","method":"...","impact":"high|medium|low"}
\`\`\`
`;
}

/**
 * 构建记录模式的 systemPrompt
 */
function buildRecordSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，帮助快速结构化记录产品假设和用户洞察。

用户会描述一个想法、假设或观察，你需要将其结构化为标准格式。

【当前产品上下文】
${productContext}

【输出格式】（严格遵循）：
先用 1-2 句话确认你的理解，然后输出结构化假设：

\`\`\`hypothesis
{
  "belief": "我认为 [具体功能/改变] 能 [预期结果]",
  "why": "因为 [用户痛点/数据支撑/逻辑推理]",
  "method": "通过 [具体验证方法：内测/A-B测试/问卷/数据分析]",
  "impact": "high|medium|low"
}
\`\`\`

如果用户描述不够清晰，追问 1 个关键问题以完善假设。`;
}

/**
 * 构建生成模式的 systemPrompt
 */
function buildGenerateSystemPrompt(productContext: string): string {
  return `你是产品洞察 Agent，帮助将验证过的假设和洞察转化为可执行需求文档。

你可以选择性地使用 web_search 工具查阅竞品实现参考。

【当前产品上下文】
${productContext}

【需求文档格式】（严格遵循，输出时第一行必须是 [REQ_DOC:模块名称]）：
[REQ_DOC:模块名称]
# 需求文档 · [模块名称]

## 用户故事
**作为** [用户角色]，**我希望** [期望功能]，**以便** [达成目标]。

## 功能规格
| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| ...    | ...  | P0     |

## 验收标准
- [ ] 标准1（可量化）
- [ ] 标准2

## 竞品参考
（如有搜索结果，列出 1-2 个参考实现）

## 非功能需求
- 性能：...
- 安全：...`;
}
```

### 4.3 `services/insight-store.ts` — 洞察持久化

```typescript
/**
 * 产品洞察持久化服务
 * 扩展 file-store.ts，处理 InsightRecord 的读写
 */

const INSIGHTS_INDEX_PATH = '.xingjing/solo/product/insights/index.yaml';
const SUGGESTIONS_PATH = '.xingjing/solo/product/insights/suggestions.yaml';

export async function loadInsightRecords(workDir: string): Promise<InsightRecord[]>
export async function saveInsightRecord(workDir: string, record: InsightRecord): Promise<boolean>
export async function loadProductSuggestions(workDir: string): Promise<ProductSuggestion[]>
export async function upsertProductSuggestion(workDir: string, s: ProductSuggestion): Promise<boolean>
export async function deleteInsightRecord(workDir: string, id: string): Promise<boolean>
```

### 4.4 扩展 `CallAgentOptions` — 工具调用可见性

在 `opencode-client.ts` 中为 `CallAgentOptions` 新增：

```typescript
interface CallAgentOptions {
  // ... 现有字段 ...

  /**
   * Agent 使用工具时触发（工具调用前，OpenCode SSE tool_use 事件）
   * 用于 UI 展示"Agent 正在搜索..."等状态
   */
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;

  /**
   * Agent 获得工具结果时触发（OpenCode SSE tool_result 事件）
   * 用于 UI 更新"搜索完成，获取到 N 条结果"
   */
  onToolResult?: (toolName: string, result: string) => void;
}
```

在 `callAgent` 的 SSE 解析循环中，识别 `tool_use` / `tool_result` 类型的消息并触发回调。

---

## 五、UI 层设计

### 5.1 页面整体布局重构

```
┌──────────────────────────────────────────────────────────────┐
│  产品洞察                     🧪 3个假设验证中  ✅ 5个已证实  │
├──────────────────────────┬───────────────────────────────────┤
│  主内容区 (flex 1)         │  产品洞察 Agent (400px)           │
│                           │                                   │
│  [Tab: 假设验证看板]        │  ┌─ 模式选择 ──────────────────┐ │
│  [Tab: 产品需求]            │  │  🔍研究  📋记录  📄生成  💬对话│ │
│  [Tab: 外部洞察] ← 新增     │  └───────────────────────────┘ │
│                           │                                   │
│  (Tab 内容)               │  ┌─ 对话线程 ──────────────────┐ │
│                           │  │  消息气泡 + 工具调用步骤卡片  │ │
│                           │  └───────────────────────────┘ │
│                           │                                   │
│                           │  ┌─ 输入区 ────────────────────┐ │
│                           │  │  [文本框]        [发送 ▶]    │ │
│                           │  │  快捷提示词                  │ │
│                           │  └───────────────────────────┘ │
└──────────────────────────┴───────────────────────────────────┘
```

**主内容区宽度**: `minmax(0, 1fr)`  
**Agent 面板宽度**: `400px`（固定，不可拖动，保持聚焦）

### 5.2 新增 Tab：外部洞察

```
[外部洞察] Tab 内容：

┌── 产品建议 ─────────────────────────────────────────────────┐
│  [P0] 增加 AI 续写中断恢复功能           [转为需求] [存为假设] │
│  理由：Notion AI 用户反馈最多的痛点是..." (引用来源)          │
│                                                             │
│  [P1] 定价策略：考虑"写作者套餐"分层      [转为需求] [存为假设] │
│  理由：Jasper 和 Copy.ai 均已推出..."                        │
└─────────────────────────────────────────────────────────────┘

┌── 调研记录 ─────────────────────────────────────────────────┐
│  📅 2024-01-15  竞品功能对比：Notion AI vs WriteFlow         │
│  来源：3个网页 | 关键词：Notion AI 写作功能       [展开] [删除] │
│                                                             │
│  📅 2024-01-12  AI 写作工具市场趋势分析                      │
│  来源：5个网页 | 关键词：AI writing tools 2024   [展开] [删除] │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 工具调用步骤卡片 `ToolCallStep` 组件

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 搜索中...                           ⏱ 1.2s              │
│  "Notion AI 竞品功能对比 2024"                               │
└─────────────────────────────────────────────────────────────┘
                         ↓ 完成后
┌─────────────────────────────────────────────────────────────┐
│  ✅ 搜索完成                            ⏱ 1.2s              │
│  "Notion AI 竞品功能对比 2024"  → 找到 8 条结果              │
│  + notion.so, techcrunch.com, producthunt.com...             │
└─────────────────────────────────────────────────────────────┘
```

样式规格：
- 背景：`#f0f9ff`（蓝色浅底），边框：`#bae0ff`
- 运行中：左侧有蓝色 spinner
- 完成：左侧绿色对勾，域名列表用 `#6b7280` 小字展示

### 5.4 洞察卡片 `InsightCard` 组件

Agent 响应中，若包含结构化洞察，在消息气泡下方追加卡片：

```
┌── 🧠 产品建议 ──────────────────────────────────────────────┐
│  [P0] 增加续写中断恢复                                       │
│  因为：Notion AI 3 篇用户文章均提到此痛点...                  │
│  [转为需求 →]  [存为假设 →]  [忽略]                          │
├─────────────────────────────────────────────────────────────┤
│  🔗 来源：notion.so, techcrunch.com (+6)                     │
│  📅 调研时间：2024-01-15                [查看完整调研 →]      │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 假设草稿卡片 `HypothesisDraftCard` 组件

记录模式下，Agent 输出结构化假设时显示：

```
┌── 📋 假设草稿 ─────────────────────────────────────────────┐
│  我认为：添加段落重写功能能提升 30 天留存率                    │
│  因为：78% 用户在晚间修改文章，需要快速迭代写作内容             │
│  验证方式：邀请 5 位用户内测，观察 7 天使用频率                │
│  影响：🔴 高                                                │
│                                [编辑] [✅ 保存到假设看板]    │
└─────────────────────────────────────────────────────────────┘
```

### 5.6 快捷提示词

Agent 输入框下方提供上下文感知的快捷提示：

**研究模式触发词**（自动识别）：
- "分析 [竞品] 的功能和定价"
- "[关键词] 市场趋势"
- "用户对 [竞品] 的评价"

**记录模式触发词**：
- "记录一个假设：..."
- "我发现用户..."
- "想到一个功能点..."

**生成模式触发词**：
- "基于以上洞察，写 [模块名] 需求文档"
- "细化 [功能] 的验收标准"

快捷提示词示例（根据当前模式和历史动态生成）：
```
[🔍 分析竞品 Notion AI]  [🔍 AI 写作工具市场趋势]
[📋 记录今天的用户反馈]  [📄 生成段落重写需求文档]
```

---

## 六、新增组件清单

| 组件路径 | 职责 |
|----------|------|
| `components/insight/insight-agent-panel.tsx` | 整体 Agent 面板（模式选择 + 对话线程 + 输入区）|
| `components/insight/tool-call-step-card.tsx` | 单条工具调用步骤卡片（运行中/完成/失败） |
| `components/insight/insight-record-card.tsx` | 单条调研记录（可展开/折叠/操作按钮） |
| `components/insight/product-suggestion-list.tsx` | 产品建议列表（排序/过滤/转为需求） |
| `components/insight/hypothesis-draft-card.tsx` | 假设草稿预览 + 编辑 + 一键保存 |
| `components/insight/insight-board.tsx` | 外部洞察 Tab 主视图（建议 + 调研记录） |
| `components/insight/quick-prompt-chips.tsx` | 快捷提示词芯片行 |

---

## 七、服务文件清单

| 文件路径 | 新增/修改 | 职责 |
|----------|-----------|------|
| `services/web-search.ts` | 新增 | 搜索结果解析与类型定义 |
| `services/insight-executor.ts` | 新增 | 洞察 Agent 三模式执行器 |
| `services/insight-store.ts` | 新增 | InsightRecord / ProductSuggestion 持久化 |
| `services/opencode-client.ts` | 修改 | 扩展 `onToolUse` / `onToolResult` 回调 |
| `pages/solo/product/index.tsx` | 重构 | 整合新 Agent 面板，新增"外部洞察" Tab |

---

## 八、实施分阶段计划

### Phase 1：工具调用可见性基础设施（1-2天）
**目标**：让 `callAgent` 能暴露工具调用事件给 UI

- [ ] 扩展 `CallAgentOptions`：加入 `onToolUse` / `onToolResult`
- [ ] 修改 `callAgent` SSE 解析：识别 `tool_use` / `tool_result` 消息类型
- [ ] 创建 `ToolCallStep` 类型 + `tool-call-step-card.tsx` 组件
- [ ] 在现有 AI 搭档面板中加入工具步骤可见性（smoke test）

**关键文件**：`opencode-client.ts`, `components/insight/tool-call-step-card.tsx`

### Phase 2：数据层 + 持久化（0.5天）
**目标**：InsightRecord 和 ProductSuggestion 可读写

- [ ] 创建 `services/insight-store.ts`（loadInsightRecords, saveInsightRecord, 等）
- [ ] 扩展 `file-store.ts` 复用现有 YAML 工具函数
- [ ] 创建 `services/web-search.ts`（类型定义 + 文本解析函数）

**关键文件**：`services/insight-store.ts`, `services/web-search.ts`

### Phase 3：InsightExecutor — 三模式 Agent（2天）
**目标**：三种模式的 Agent 可正确执行并返回结构化输出

- [ ] 创建 `services/insight-executor.ts`
  - [ ] `detectInsightMode()` — 意图分类函数（基于关键词规则 + LLM 兜底）
  - [ ] `buildResearchSystemPrompt()` — 研究模式 prompt
  - [ ] `buildRecordSystemPrompt()` — 记录模式 prompt
  - [ ] `buildGenerateSystemPrompt()` — 生成模式 prompt
  - [ ] `runInsightAgent()` — 主执行函数
  - [ ] `parseInsightOutput()` — 从 Agent 输出提取结构化数据
  - [ ] `parseHypothesisJson()` — 提取 ```hypothesis 代码块
- [ ] 单元测试：三种模式的 systemPrompt 构建函数

**关键文件**：`services/insight-executor.ts`

### Phase 4：UI 组件开发（2天）
**目标**：新组件可独立运行

- [ ] `components/insight/insight-agent-panel.tsx` — 主面板骨架（模式 tabs + 对话线程 + 输入）
- [ ] `components/insight/hypothesis-draft-card.tsx` — 假设草稿卡片（含编辑 + 保存按钮）
- [ ] `components/insight/insight-record-card.tsx` — 洞察记录卡片
- [ ] `components/insight/product-suggestion-list.tsx` — 建议列表
- [ ] `components/insight/insight-board.tsx` — 外部洞察 Tab 视图
- [ ] `components/insight/quick-prompt-chips.tsx` — 快捷提示词

### Phase 5：页面整合 + 联调（1天）
**目标**：完整页面可端到端运行

- [ ] 重构 `pages/solo/product/index.tsx`
  - [ ] 迁移到新布局（grid 主内容 + Agent 面板）
  - [ ] 加入"外部洞察" Tab
  - [ ] 接入 `InsightAgentPanel`（替换旧 AI 搭档）
  - [ ] 接入 `InsightBoard`（新 Tab 内容）
  - [ ] 连通 `onHypothesisDraft` → 假设看板
  - [ ] 连通 `onRequirementDraft` → 需求列表
  - [ ] 连通 `onInsightRecord` → 外部洞察 Tab
- [ ] TypeScript 编译零错误验证
- [ ] 端到端功能流程手动验证（三种模式各走一遍）

---

## 九、关键技术细节

### 9.1 工具调用与 OpenCode SSE 协议

OpenCode 的 SSE 流中，工具调用相关事件格式（参考 Anthropic Messages API）：

```
// 工具调用开始
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_xxx","name":"web_search","input":{}}}

// 工具调用参数填充（streaming）
event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"Notion AI"}}

// 工具调用参数完成
event: content_block_stop
data: {"type":"content_block_stop","index":1}

// 工具结果（用户轮，即 tool_result）
// 在 sessionPrompt 中通过 tool_result content block 返回
```

**实现策略**：在 `callAgent` 的 SSE 处理循环中：
- 监听 `content_block_start` 中 `type === 'tool_use'` → 触发 `onToolUse(name, {})`
- 积累 `input_json_delta` → 工具调用完整输入后再次触发 `onToolUse(name, fullInput)`
- OpenCode 内部处理工具并将结果注入下一轮 → 通过内容检测或独立 SSE 触发 `onToolResult`

### 9.2 自动批准搜索工具

在 `runInsightAgent` 中，研究模式调用 `callAgent` 时设置：
```typescript
autoApproveTools: ['web_search', 'browser'],
```
避免每次搜索都弹出权限确认框，提升流畅度。但需在 UI 中以工具步骤卡片显示正在发生的操作，保持透明。

### 9.3 意图识别实现

`detectInsightMode` 采用分层策略：

```typescript
// 第一层：关键词快速匹配（零延迟）
const RESEARCH_KEYWORDS = ['分析', '竞品', '市场', '趋势', '对比', '调研', '搜索', '了解'];
const RECORD_KEYWORDS = ['记录', '假设', '想到', '发现', '用户说', '有个想法', '感觉'];
const GENERATE_KEYWORDS = ['需求', '文档', 'PRD', '写一份', '生成', '细化', '输出'];

// 第二层：LLM 分类（当关键词无法确定时）
// 用一个轻量分类 prompt + 低 maxTokens 快速判断
```

### 9.4 假设结构化提取

从 Agent 输出文本中提取假设 JSON：

```typescript
export function parseHypothesisFromOutput(text: string): Hypothesis | null {
  // 匹配 ```hypothesis ... ``` 代码块
  const match = text.match(/```hypothesis\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1].trim());
    return {
      id: `h-${Date.now()}`,
      status: 'testing' as const,
      belief: raw.belief ?? '',
      why: raw.why ?? '',
      method: raw.method ?? '',
      impact: raw.impact ?? 'medium',
      createdAt: new Date().toISOString().slice(0, 10),
    };
  } catch { return null; }
}
```

### 9.5 洞察记录与知识库联动

高质量洞察（有来源引用、有具体数据）可通过 `sinkAgentOutput` 写入行为知识库，category 设为 `'scenario'`。这样后续在 Autopilot 等其他场景也能检索到这些外部洞察。

```typescript
// 在 runInsightAgent onDone 后调用
if (insightRecord && insightRecord.sources.length > 0) {
  await sinkAgentOutput({
    agentId: 'insight-agent',
    output: formatInsightAsKnowledge(insightRecord),
    workDir,
    skillApi,
    mode: 'team',  // 写入 behavior knowledge
  });
}
```

---

## 十、验收标准

| 场景 | 验收条件 |
|------|----------|
| 搜索可见性 | Agent 调用 web_search 时，UI 显示"🔍 搜索: xxx"步骤卡片 |
| 搜索结果展示 | 搜索完成后步骤卡片显示来源域名列表 + 结果数量 |
| 假设自动结构化 | "我发现用户不喜欢 X" → AI 输出结构化假设草稿卡片 |
| 假设一键保存 | 点击"保存到假设看板"→ 假设出现在看板验证中列 |
| 需求生成 | "生成 [模块] 需求文档" → 需求草稿 → 保存到需求列表 |
| 外部洞察 Tab | 搜索洞察记录保存后，在"外部洞察"Tab 可见 |
| 产品建议操作 | 产品建议可"转为需求"或"存为假设" |
| 模式自动识别 | 竞品类问题自动进入研究模式，想法类进入记录模式 |
| TS 零错误 | `tsc --noEmit` 零错误 |
| 离线降级 | OpenCode 不可用时 AI 搭档降级到模拟响应，功能不崩溃 |
