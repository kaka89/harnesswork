import type {
  Competitor,
  MarketInsight,
  ProductGoal,
  RequirementDraft,
  RequirementIndexItem,
  SkillAction,
  WorkbenchTabId,
} from "../types/product-workbench";

// ── 产品规划 ───────────────────────────────────────────────────────
export const MOCK_GOALS: ProductGoal[] = [
  {
    id: "g1",
    title: "AI 搭档编辑体验升级",
    quarter: "Q2",
    status: "active",
    progress: 62,
    owner: { name: "小米" },
    linkedRequirementIds: ["r3", "r7"],
    summary: "让 AI 搭档的配置与调用更直观",
  },
  {
    id: "g2",
    title: "竞品雷达自动化",
    quarter: "Q2",
    status: "at-risk",
    progress: 28,
    owner: { name: "大橙" },
    linkedRequirementIds: ["r5"],
    summary: "每周自动拉取竞品动态",
  },
  {
    id: "g3",
    title: "星静发布流程升级",
    quarter: "Q1",
    status: "done",
    progress: 100,
    owner: { name: "小波" },
    linkedRequirementIds: ["r11"],
    summary: "基于 GitHub Actions 的发布流水线",
  },
  {
    id: "g4",
    title: "知识库语义检索",
    quarter: "Q3",
    status: "planning",
    progress: 0,
    owner: { name: "小靜" },
    linkedRequirementIds: ["r6"],
    summary: "力求查准、查全",
  },
];

// ── 竞品 ───────────────────────────────────────────────────────────
export const MOCK_COMPETITORS: Competitor[] = [
  {
    id: "c1",
    name: "Cursor",
    logoEmoji: "🚀",
    website: "https://cursor.com",
    positioning: "AI-first IDE",
    tags: [
      { label: "IDE", tone: "blue" },
      { label: "Agent", tone: "purple" },
    ],
    updates: [
      { date: "2026-04-28", title: "Agent 模式全量上线", source: "Cursor Blog" },
      { date: "2026-04-10", title: "Composer 支持多仓多文件编辑" },
    ],
    addedAt: "2026-03-01",
  },
  {
    id: "c2",
    name: "Windsurf",
    logoEmoji: "🌊",
    website: "https://windsurf.com",
    positioning: "协同编程 IDE",
    tags: [
      { label: "IDE", tone: "blue" },
      { label: "Cascade", tone: "green" },
    ],
    updates: [
      { date: "2026-04-20", title: "Cascade 2.0 上线" },
      { date: "2026-04-02", title: "企业版新增 SSO" },
    ],
    addedAt: "2026-03-15",
  },
  {
    id: "c3",
    name: "Claude Code",
    logoEmoji: "🎛️",
    website: "https://claude.com/code",
    positioning: "CLI 编码助手",
    tags: [{ label: "CLI", tone: "amber" }],
    updates: [
      { date: "2026-04-25", title: "新增 Skill 语义" },
      { date: "2026-04-12", title: "子 Agent 调度开放" },
    ],
    addedAt: "2026-04-01",
  },
];

// ── 市场洞察 ──────────────────────────────────────────────────────
export const MOCK_INSIGHTS: MarketInsight[] = [
  {
    id: "i1",
    title: "GitHub Copilot 推出 Agent Mode，可自动多步改码",
    summary: "Copilot 从 autocomplete 走向 autonomous，面向多文件重构与补丁生成。",
    content:
      "## 要点\n\n- **新模式**：Agent Mode 可自主规划 → 调用工具 → 验证。\n- **覆盖语言**：主力 JS / TS / Python，Go/Rust 为 preview。\n- **我们的机会**：Pipeline 预设可针对 GitHub workflow 场景深度整合。",
    category: "industry-trend",
    source: "The Verge",
    publishedAt: "2026-04-28",
    pinned: true,
  },
  {
    id: "i2",
    title: "用户反馈：Pipeline 配置曲线过陡，期望模板市场",
    summary: "来自内部社群的定性反馈，多位用户希望有「一键套用」的 pipeline 模板。",
    content:
      "## 用户原声\n\n> 每次都要从 0 画 DAG，很费时间。希望有社区模板可以 fork。\n\n## 建议方向\n\n- 模板市场 MVP\n- 模板 diff / fork 能力",
    category: "user-voice",
    source: "内部社群",
    publishedAt: "2026-04-22",
  },
  {
    id: "i3",
    title: "Cursor Business 新订阅档：$40/月含 Claude 4.5",
    summary: "企业版以绑定长上下文模型拉升 ARPU。",
    content:
      "## 定价结构\n\n| 档位 | 月费 | 模型 |\n|---|---|---|\n| Pro | \\$20 | 常规 |\n| Business | \\$40 | Claude 4.5 + 加长上下文 |\n\n## 启示\n\n- 高阶套餐可尝试捆绑「推理增强」。",
    category: "pricing",
    source: "Cursor Blog",
    publishedAt: "2026-04-15",
  },
  {
    id: "i4",
    title: "欧盟 AI Act 通用模型义务 2026 Q3 生效",
    summary: "涉及透明度、版权合规、系统风险评估。",
    content:
      "## 关键义务\n\n- 训练数据摘要公开\n- 系统风险评估 & 红队演练\n- 版权政策披露\n\n## 对我们的影响\n\n- 欧洲用户数据出境需重新评估\n- 需在隐私政策中披露第三方模型能力边界",
    category: "regulation",
    source: "36kr",
    publishedAt: "2026-04-10",
  },
  {
    id: "i5",
    title: "Y Combinator W26 批 AI-native DevTools 占比 38%",
    summary: "工具链仍是 AI 应用最拥挤的细分赛道之一。",
    content:
      "## 数据\n\n- 总共 240 家,其中 91 家属于 DevTools\n- IDE / Agent 框架 / 评测 占前三\n\n## 竞争态势\n\n- 通用 IDE 位已被巨头占据,差异化在场景化工作流。",
    category: "industry-trend",
    source: "HN",
    publishedAt: "2026-04-05",
  },
];

// ── 需求草稿 ──────────────────────────────────────────────────────
export const MOCK_REQUIREMENT_DRAFTS: RequirementDraft[] = [
  {
    id: "d1",
    title: "批量导出需求为 Markdown",
    content:
      "# 批量导出需求为 Markdown\n\n## 背景\n\n用户希望能一次性导出多条需求做离线评审。\n\n## 用户故事\n\n- 作为 PM,我希望勾选多条需求一键打包下载,以便在文档工具中汇总。\n\n## 验收标准\n\n- [ ] 支持勾选 1~N 条\n- [ ] 导出为单文件 .md / ZIP 可选\n\n## 依赖\n\n- 需求检索 Panel 的多选能力",
    status: "draft",
    updatedAt: "2026-05-02T09:30:00.000Z",
  },
  {
    id: "d2",
    title: "Pipeline 模板市场 MVP",
    content:
      "# Pipeline 模板市场 MVP\n\n## 背景\n\n基于用户反馈(来源 i2),需要社区模板 fork 能力。\n\n## 用户故事\n\n- 作为新用户,我想直接套用推荐模板而不是从 0 搭建。\n\n## 验收标准\n\n- [ ] 模板列表页\n- [ ] 一键 fork 到当前 workspace\n- [ ] 模板打分 & 收藏",
    status: "reviewing",
    updatedAt: "2026-05-01T14:20:00.000Z",
    fromInsightId: "i2",
  },
  {
    id: "d3",
    title: "AI 搭档调用留痕与回溯",
    content:
      "# AI 搭档调用留痕与回溯\n\n## 背景\n\n当前调用历史散落,难以复盘。\n\n## 核心能力\n\n- 每次调用记录: 搭档/意图/产出/耗时\n- 支持按搭档/日期筛选\n- 单次调用详情页可 replay",
    status: "draft",
    updatedAt: "2026-04-30T16:00:00.000Z",
  },
];

// ── 需求索引(12 条) ─────────────────────────────────────────────
function buildReq(
  id: string,
  title: string,
  status: RequirementIndexItem["status"],
  owner: string,
  tags: string[],
  summary: string,
  updatedAt: string,
): RequirementIndexItem {
  return {
    id,
    title,
    status,
    owner,
    tags,
    summary,
    updatedAt,
    content: `# ${title}\n\n## 摘要\n\n${summary}\n\n## 目标\n\n（mock）本需求的目标是围绕「${title}」解决核心场景,并给出最小可用版本。\n\n## 验收标准\n\n- [ ] 主干路径可用\n- [ ] 无阻塞 bug\n- [ ] 文档同步更新`,
  };
}

export const MOCK_REQUIREMENTS: RequirementIndexItem[] = [
  buildReq("r1", "批量导出需求", "draft", "小米", ["#编辑器"], "多选勾选 + 一键 Markdown 打包", "2026-05-02T08:00:00.000Z"),
  buildReq("r2", "编辑器光标持久化", "draft", "大橙", ["#编辑器"], "切换文件后保留光标位置", "2026-05-01T11:10:00.000Z"),
  buildReq("r3", "AI 搭档调用留痕", "draft", "小波", ["#AI", "#搭档"], "记录每次搭档调用的意图与产出", "2026-04-30T09:40:00.000Z"),
  buildReq("r4", "Pipeline 模板市场", "reviewing", "小米", ["#AI"], "社区模板 fork 与打分", "2026-04-29T15:00:00.000Z"),
  buildReq("r5", "竞品雷达自动化", "reviewing", "大橙", ["#AI"], "每周自动抓取竞品 blog/release", "2026-04-28T12:30:00.000Z"),
  buildReq("r6", "知识库语义检索", "reviewing", "小靜", ["#知识库"], "基于 embedding 的语义搜索", "2026-04-27T10:00:00.000Z"),
  buildReq("r7", "AI 搭档编辑体验升级", "approved", "小米", ["#AI", "#搭档"], "配置面板模块化 + 参数预设", "2026-04-25T17:20:00.000Z"),
  buildReq("r8", "Skill 市场精选", "approved", "大橙", ["#AI"], "首页展示高质量 Skill,支持订阅", "2026-04-24T09:00:00.000Z"),
  buildReq("r9", "焦点页今日亮点算法", "approved", "小波", ["#知识库"], "基于最近活动聚合今日亮点", "2026-04-22T14:40:00.000Z"),
  buildReq("r10", "多工作区切换", "released", "小靜", ["#发布"], "顶栏快速切换工作区", "2026-04-18T08:30:00.000Z"),
  buildReq("r11", "发布流水线 GA", "released", "小波", ["#发布"], "GitHub Actions 发布流水线正式发布", "2026-04-15T11:00:00.000Z"),
  buildReq("r12", "设置页重构", "released", "小米", ["#编辑器"], "分组化 + 搜索式设置项", "2026-04-10T16:00:00.000Z"),
];

// ── Skill 注册表（每 Tab 独立）──────────────────────────────────
export const MOCK_SKILL_REGISTRY: Record<WorkbenchTabId, SkillAction[]> = {
  "planning": [
    { slug: "goal-conflict-check", label: "目标冲突检查", description: "扫描跨季度目标的依赖冲突" },
    { slug: "roadmap-align",       label: "Roadmap 对齐",  description: "对齐公司级 OKR 与产品目标" },
  ],
  "competitor": [
    { slug: "competitor-matrix-gen", label: "生成对标矩阵", description: "按维度输出对比表" },
  ],
  "market-insight": [
    { slug: "insight-tagger", label: "洞察打标", description: "为未分类洞察自动归类" },
  ],
  "requirement-writer": [
    { slug: "requirement-scaffold",    label: "PRD 大纲模板",    description: "输出标准 PRD 骨架" },
    { slug: "acceptance-criteria-gen", label: "验收标准模板",    description: "Given/When/Then 格式" },
    { slug: "user-story-gen",          label: "用户故事模板",    description: "As a / I want / So that" },
    { slug: "risk-assessment",         label: "风险评估模板",    description: "P×I 矩阵" },
  ],
  "requirement-search": [
    { slug: "requirement-summary", label: "批量摘要", description: "对选中需求生成一句话摘要" },
  ],
};

// ── Agent 回复模板 ────────────────────────────────────────────────
export const MOCK_AGENT_REPLY_TEMPLATES: Record<
  "default" | "planning" | "requirement",
  (intent: string) => string
> = {
  default: (intent) =>
    `收到意图：「${intent}」\n我建议分 3 步推进：\n1) 先拉齐目标与约束；\n2) 梳理 1 份用户故事清单；\n3) 输出验收标准与上线节奏。\n需要我直接起草吗？`,
  planning: (intent) =>
    `针对规划诉求「${intent}」：\n- 当前季度健康度尚可，但「竞品雷达自动化」进度 28% 有风险；\n- 建议把「知识库语义检索」从 Q3 前置到 Q2 末；\n- 可以让我生成一份目标冲突检查报告吗？`,
  requirement: (intent) =>
    `需求「${intent}」建议包含：背景 / 用户故事 / 验收标准 / 非功能需求 / 上线依赖。\n我可以直接追加到当前草稿。`,
};

// ── AI 起草的 5 段预置文案（RequirementWriter 使用）─────────────
export const MOCK_DRAFT_SEGMENTS = (intent: string): string[] => [
  `\n\n# ${intent || "未命名需求"}\n`,
  `\n## 背景\n\n基于当前产品路线与近期用户反馈，本需求旨在解决「${intent || "目标场景"}」带来的体验断点。\n`,
  `\n## 用户故事\n\n- 作为产品经理，我希望能快速完成「${intent || "该能力"}」的立项与评审。\n- 作为研发，我希望在进入编码前就能看到清晰的验收标准。\n`,
  `\n## 验收标准\n\n- [ ] 主干路径可用\n- [ ] 错误路径有兜底\n- [ ] 指标埋点覆盖\n`,
  `\n## 依赖 & 风险\n\n- 依赖：AI 搭档调用 API、Pipeline 定义\n- 风险：模型耗时可能超过 UI 预期，需要 loading 兜底。\n`,
];

// ── 竞品对标矩阵的 mock 行（CompetitorCompareDrawer 使用）──────
export const MOCK_COMPETITOR_MATRIX = (
  competitorName: string,
): Array<{ dimension: string; self: string; competitor: string; gap: string }> => [
  { dimension: "核心定位",      self: "AI-native 产品协作平台",   competitor: `${competitorName} · IDE 内嵌`, gap: `我方强协作，${competitorName} 强编码` },
  { dimension: "模型接入",      self: "多模型可切换 + 本地推理", competitor: "默认 Claude / GPT",           gap: "我方切换灵活，竞品默认体验更顺" },
  { dimension: "Pipeline 能力", self: "可视化 DAG + 模板市场",    competitor: "脚本化配置",                   gap: "我方门槛更低" },
  { dimension: "生态 Skill",    self: "内置 20+ 常用 Skill",      competitor: "开放市场",                     gap: "我方精选，竞品广度" },
  { dimension: "企业特性",      self: "团队版 RBAC/SSO",          competitor: "团队/企业双版本",              gap: "竞品企业版更成熟" },
];
