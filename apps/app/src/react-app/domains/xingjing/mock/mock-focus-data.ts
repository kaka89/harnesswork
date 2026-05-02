import type { FocusTask, AiReport, FocusBriefing } from "../types/focus";

// ── Mock 任务数据（含 7 种状态各至少 1 条）────────────────────────────────────

export const MOCK_TASKS: FocusTask[] = [
  {
    id: "t1",
    title: "修复 Editor 光标丢失 bug",
    status: "todo",
    priority: "urgent",
    tags: ["研发", "Bug"],
    source: "dev",
    dueLabel: "3h",
    description: "5 位用户反馈此问题，影响核心使用体验，已有2 天未解决",
    createdAt: "2026-05-01T07:00:00Z",
    activity: [
      { id: "a1-3", timestamp: "2026-05-01T07:00:00Z", type: "status_change", content: "状态从「待办」改为「计划」" },
      { id: "a1-2", timestamp: "2026-04-30T15:00:00Z", type: "priority_change", content: "优先级从「重要」升级为「紧急」" },
      { id: "a1-1", timestamp: "2026-04-30T09:00:00Z", type: "created", content: "任务已创建" },
    ],
  },
  {
    id: "t2",
    title: "回复 Product Hunt 评论",
    status: "todo",
    priority: "normal",
    tags: ["增长"],
    source: "growth",
    dueLabel: "30min",
    createdAt: "2026-05-01T08:00:00Z",
  },
  {
    id: "t3",
    title: "邀请 5 位用户内测重写功能",
    status: "backlog",
    priority: "important",
    tags: ["增长"],
    source: "growth",
    dueLabel: "本周",
    createdAt: "2026-04-30T09:00:00Z",
  },
  {
    id: "t4",
    title: "调研 AI 写作竞品定价策略",
    status: "backlog",
    priority: "low",
    tags: ["产品"],
    source: "product",
    createdAt: "2026-04-28T10:00:00Z",
  },
  {
    id: "t5",
    title: "实现段落重写功能（MVP）",
    status: "in_progress",
    priority: "important",
    tags: ["产品", "功能"],
    source: "product",
    dueLabel: "2d",
    createdAt: "2026-04-29T10:00:00Z",
    activity: [
      { id: "a5-3", timestamp: "2026-04-30T14:00:00Z", type: "status_change", content: "状态从「计划」改为「进行中」" },
      { id: "a5-2", timestamp: "2026-04-30T09:00:00Z", type: "edited", content: "修改了任务描述" },
      { id: "a5-1", timestamp: "2026-04-29T10:00:00Z", type: "created", content: "任务已创建" },
    ],
  },
  {
    id: "t6",
    title: "更新落地页 — 加入 Dark Mode 截图",
    status: "in_review",
    priority: "normal",
    tags: ["增长", "设计"],
    source: "growth",
    dueLabel: "1h",
    createdAt: "2026-04-28T15:00:00Z",
  },
  {
    id: "t7",
    title: "集成 Stripe 订阅功能",
    status: "done",
    priority: "important",
    tags: ["研发", "支付"],
    source: "dev",
    createdAt: "2026-04-25T09:00:00Z",
    completedAt: "2026-04-30T18:00:00Z",
    activity: [
      { id: "a7-4", timestamp: "2026-04-30T18:00:00Z", type: "status_change", content: "状态从「评审中」改为「已完成」" },
      { id: "a7-3", timestamp: "2026-04-29T16:00:00Z", type: "status_change", content: "状态从「进行中」改为「评审中」" },
      { id: "a7-2", timestamp: "2026-04-26T10:00:00Z", type: "status_change", content: "状态从「计划」改为「进行中」" },
      { id: "a7-1", timestamp: "2026-04-25T09:00:00Z", type: "created", content: "任务已创建" },
    ],
  },
  {
    id: "t8",
    title: "修复移动端菜单溢出问题",
    status: "blocked",
    priority: "urgent",
    tags: ["研发", "Bug"],
    source: "dev",
    description: "等待设计师提供新布局稿，预计明日给出",
    createdAt: "2026-04-27T11:00:00Z",
    activity: [
      { id: "a8-3", timestamp: "2026-04-28T10:00:00Z", type: "status_change", content: "状态从「进行中」改为「已阔塞」" },
      { id: "a8-2", timestamp: "2026-04-28T09:00:00Z", type: "comment", content: "需要设计师提供新布局方案后才能继续" },
      { id: "a8-1", timestamp: "2026-04-27T11:00:00Z", type: "created", content: "任务已创建" },
    ],
  },
  {
    id: "t9",
    title: "调研竞品定价页面改版方案",
    status: "cancelled",
    priority: "low",
    tags: ["产品"],
    source: "product",
    createdAt: "2026-04-20T09:00:00Z",
  },
];

// ── Mock AI 搭档报告 ───────────────────────────────────────────────────────────

export const MOCK_REPORTS: AiReport[] = [
  {
    id: "r1",
    agentName: "竞品雷达",
    agentIcon: "🔭",
    reportType: "competitive-analysis",
    title: "Notion AI 新功能分析",
    summary:
      "Notion 本周推出 AI 写作功能，支持一键补全段落。用户反馈积极，建议关注其快捷键体验设计，考虑差异化切入点。",
    generatedAt: "2026-05-01T08:00:00Z",
    status: "new",
    sessionId: "session-abc",
    keyFindings: [
      "Notion AI 用户对上下文理解满意度高，NPS +12",
      "快捷键触发（/ai）是差异化卖点，用户留存率高 18%",
      "竞品没有多轮对话记忆能力，是可超越的窗口期",
    ],
    recommendations: [
      "增加 /ai 快捷命令入口，降低触发成本",
      "段落补全功能优先对标 Notion，强化上下文记忆",
      "考虑推出多轮对话模式作为差异化功能",
    ],
  },
  {
    id: "r2",
    agentName: "数据哨兵",
    agentIcon: "📊",
    reportType: "user-feedback",
    title: "用户反馈摘要 · 5月1日",
    summary:
      "过去 24 小时收到12 条用户反馈，其中 3 条提到光标丢失问题，2 条建议增加协作功能，1 条高度赞扬编辑体验。",
    generatedAt: "2026-05-01T07:30:00Z",
    status: "important",
    sessionId: "session-def",
    keyFindings: [
      "3 条反馈均涉及光标丢失，影响用户多模式下的基础体验",
      "2 条客户强烈期望实时协作编辑，属于高佐性需求",
      "用户对现有 AI 辅助写作功能满意度较高（好评占 73%）",
    ],
    recommendations: [
      "将光标丢失 bug 升级为 P0，今日内安排修复",
      "开始调研协作体验方案，评估是否列入 Q2 路线图",
    ],
  },
  {
    id: "r3",
    agentName: "产品智囊",
    agentIcon: "🧠",
    reportType: "market-trend",
    title: "AI 写作工具市场趋势 · 2026 Q2",
    summary:
      "全球 AI 写作工具月活同比增长 40%，国内市场以企业知识库场景为增长主力，个人创作场景仍以海外市场为主。",
    generatedAt: "2026-04-30T16:00:00Z",
    status: "read",
    keyFindings: [
      "企业知识库场景是国内增长最快的细分，同比 +62%",
      "个人创作者付费意愿偏低，订阅转化率约 4.2%",
      "多模态写作（图文混排）成为下一个竞争焦点",
    ],
    recommendations: [
      "优先开拓企业知识库场景，推出团队协作版定价包",
      "提升个人版 onboarding 转化，降低首次付费门槛",
      "将图文混排能力列入 H2 路线图",
    ],
  },
  {
    id: "r4",
    agentName: "趋势观察员",
    agentIcon: "📡",
    reportType: "market-trend",
    title: "大语言模型定价模型演变分析",
    summary:
      "主流 LLM 厂商正从按 Token 计费转向按能力订阅制，混合定价策略（免费基础 + 高级功能付费）成为主流趋势。",
    generatedAt: "2026-04-29T10:00:00Z",
    status: "read",
    keyFindings: [
      "OpenAI、Anthropic 均已推出团队席位订阅，Token 定价退居辅助",
      "混合定价策略用户留存率比纯 Token 计费高 23%",
      "免费配额吸引用户试用后的转化是最高效漏斗路径",
    ],
    recommendations: [
      "重新审视现有定价策略，引入能力分层的订阅制",
      "设计免费配额 → 付费升级的明确引导流程",
      "关注 Anthropic Claude 席位定价对市场的影响",
    ],
  },
  {
    id: "r5",
    agentName: "竞品雷达",
    agentIcon: "🔭",
    reportType: "competitive-analysis",
    title: "Linear vs Notion 项目管理功能对比",
    summary:
      "Linear 以极简 UI 和快捷键驱动体验著称，Notion 以灵活度取胜。两者在 AI 辅助任务分解方向均已布局，差异化仍有空间。",
    generatedAt: "2026-04-28T14:00:00Z",
    status: "new",
    keyFindings: [
      "Linear 快捷键覆盖率 92%，键盘流用户满意度极高",
      "Notion AI 任务分解功能上线后，项目模板使用率提升 31%",
      "两者均无「今日焦点」式的日聚焦能力，属于未占领市场",
    ],
    recommendations: [
      "强化今日焦点的日计划聚焦能力，形成差异化壁垒",
      "参考 Linear 快捷键设计，提升看板操作效率",
      "考虑推出 AI 辅助任务分解功能，与 Notion 同台竞争",
    ],
  },
  {
    id: "r6",
    agentName: "数据哨兵",
    agentIcon: "📊",
    reportType: "custom",
    title: "产品功能使用频率分析报告",
    summary:
      "过去 30 天功能埋点显示，AI 简报打开率 78%，任务看板日活 61%，AI 报告查看率仅 34%，存在明显落差。",
    generatedAt: "2026-04-27T09:00:00Z",
    status: "read",
    keyFindings: [
      "AI 简报是最高频使用功能，用户每天平均查看 2.3 次",
      "任务看板中「进行中」列卡片平均停留 3.2 天，偏长",
      "报告查看率低，原因是入口不明显（按钮色对比度不足）",
    ],
    recommendations: [
      "优化报告入口视觉权重，提升「查看」按钮可见性",
      "为滞留任务增加超时提醒机制",
      "将报告打开率纳入核心产品健康度指标",
    ],
  },
];

// ── Mock AI 今日简报 ──────────────────────────────────────────────────────────

export const MOCK_BRIEFING: FocusBriefing = {
  summary: "今天有 3 件最重要的事需要你关注。总体进展健康。",
  items: [
    {
      id: "b1",
      title: "修复 Editor 光标丢失 bug",
      priority: "urgent",
      reason: "5 位用户反馈，已有 2 天未解决，影响核心体验",
      action: "cockpit",
    },
    {
      id: "b2",
      title: "回复 Product Hunt 评论区 8 条留言",
      priority: "important",
      reason: "昨日上线有用户提问，及时回复有助于转化和口碑",
    },
    {
      id: "b3",
      title: "验证「段落重写」功能假设",
      priority: "important",
      reason: "这是本周最高优先级假设，已收集到 3 个用户测试意愿",
      action: "product-insight",
    },
  ],
};
