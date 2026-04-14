// Solo mode mock data
// Scenario: An indie developer building "WriteFlow" — an AI-assisted writing SaaS tool

export const productName = 'WriteFlow';
export const productTagline = 'AI 写作助手 · 让思路流动起来';

// ─── Today's Focus ─────────────────────────────────────────────────
export interface FocusItem {
  id: string;
  priority: 'urgent' | 'important' | 'normal';
  category: 'product' | 'dev' | 'ops' | 'growth';
  title: string;
  reason: string;
  action: string;
  linkedRoute?: string;
}

export const todayFocus: FocusItem[] = [
  {
    id: 'f1',
    priority: 'urgent',
    category: 'dev',
    title: '修复 Editor 光标丢失 bug',
    reason: '5 位用户反馈此问题，影响核心使用体验，已有 2 天未解决',
    action: '去构建中',
    linkedRoute: '/solo/build',
  },
  {
    id: 'f2',
    priority: 'important',
    category: 'growth',
    title: '回复 Product Hunt 评论区 8 条留言',
    reason: '昨日上线后有用户提问，及时回复有助于转化和口碑',
    action: '去处理',
  },
  {
    id: 'f3',
    priority: 'important',
    category: 'product',
    title: '验证「段落重写」功能假设',
    reason: '这是本周最高优先级假设，已收集到 3 个用户测试意愿',
    action: '去产品洞察',
    linkedRoute: '/solo/product',
  },
];

// ─── Business Metrics ───────────────────────────────────────────────
export interface BusinessMetric {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  color: string;
  good: boolean;
}

export const businessMetrics: BusinessMetric[] = [
  {
    key: 'dau',
    label: 'DAU',
    value: 142,
    unit: '人',
    trend: 'up',
    trendValue: '+12% vs 上周',
    color: '#1264e5',
    good: true,
  },
  {
    key: 'mrr',
    label: 'MRR',
    value: '$1,240',
    trend: 'up',
    trendValue: '+$180 vs 上月',
    color: '#52c41a',
    good: true,
  },
  {
    key: 'retention',
    label: '7日留存',
    value: '68%',
    trend: 'stable',
    trendValue: '±1% vs 上周',
    color: '#722ed1',
    good: true,
  },
  {
    key: 'nps',
    label: 'NPS',
    value: 42,
    trend: 'up',
    trendValue: '+5 vs 上月',
    color: '#faad14',
    good: true,
  },
];

export interface MetricHistory {
  week: string;
  dau: number;
  mrr: number;
  retention: number;
}

export const metricsHistory: MetricHistory[] = [
  { week: 'W1', dau: 58,  mrr: 620,  retention: 61 },
  { week: 'W2', dau: 74,  mrr: 720,  retention: 63 },
  { week: 'W3', dau: 89,  mrr: 820,  retention: 65 },
  { week: 'W4', dau: 105, mrr: 940,  retention: 66 },
  { week: 'W5', dau: 127, mrr: 1060, retention: 67 },
  { week: 'W6', dau: 142, mrr: 1240, retention: 68 },
];

export interface FeatureUsage {
  feature: string;
  usage: number;
  trend: 'up' | 'down' | 'stable';
}

export const featureUsage: FeatureUsage[] = [
  { feature: 'AI 续写',    usage: 89, trend: 'up' },
  { feature: '段落精修',    usage: 72, trend: 'up' },
  { feature: '风格转换',    usage: 54, trend: 'stable' },
  { feature: '大纲生成',    usage: 38, trend: 'up' },
  { feature: '引用检查',    usage: 12, trend: 'down' },
];

// ─── Hypotheses ─────────────────────────────────────────────────────
export type HypothesisStatus = 'testing' | 'validated' | 'invalidated';

export interface Hypothesis {
  id: string;
  status: HypothesisStatus;
  belief: string;         // 我认为...
  why: string;            // 因为...
  method: string;         // 验证方式
  result?: string;        // 实际结果
  impact: 'high' | 'medium' | 'low';
  createdAt: string;
  validatedAt?: string;
  markdownDetail?: string; // Markdown 格式详细描述
}

export const hypotheses: Hypothesis[] = [
  {
    id: 'h1',
    status: 'testing',
    belief: '用户需要「段落一键重写」功能',
    why: '用户在 Editor 内花大量时间手动改写，且频繁使用续写后再删除',
    method: '邀请 5 位活跃用户内测 Beta，观察 3 天使用频率',
    impact: 'high',
    createdAt: '2026-04-07',
    markdownDetail: '## 假设：用户需要「段落一键重写」功能\n\n### 背景\n\n用户在 Editor 内花大量时间手动改写，且频繁使用续写后再删除。\n\n### 验证方式\n\n- 邀请 **5 位活跃用户**内测 Beta\n- 观察 **3 天**使用频率\n- 收集定性反馈\n\n### 成功标准\n\n| 指标 | 目标 |\n|------|------|\n| 日均使用次数 | >= 3 次 |\n| 用户满意度 | >= 4/5 |',
  },
  {
    id: 'h2',
    status: 'testing',
    belief: '团队协作功能是用户付费的核心驱动力',
    why: '多个用户在反馈中提到「希望和同事共享」',
    method: '在付费弹窗中增加「团队版」选项，观察点击率 vs 个人版',
    impact: 'high',
    createdAt: '2026-04-01',
    markdownDetail: '## 假设：团队协作是付费核心驱动力\n\n### 背景\n\n多个用户在反馈中提到「希望和同事共享」，用户 zhuming@corp.com 明确询问团队版且愿意付费 5 人。\n\n### 验证方式\n\n在付费弹窗中增加「团队版」选项，对比点击率：\n\n1. A 组：仅显示个人版\n2. B 组：同时显示个人版 + 团队版\n\n### 风险\n\n> 企业版功能复杂度会让开发成本翻倍，当前 NPS 42 主要来自个人用户。',
  },
  {
    id: 'h3',
    status: 'testing',
    belief: '语音输入能提升低键盘效率用户的留存',
    why: '部分用户反馈「打字太慢，思路跟不上」',
    method: '上线语音输入 Beta，对比该组用户 7 日留存 vs 对照组',
    impact: 'medium',
    createdAt: '2026-04-05',
  },
  {
    id: 'h4',
    status: 'validated',
    belief: '每日写作目标提醒能提升打开率',
    why: 'TODO 类应用的推送通知普遍有效',
    method: 'A/B 测试：50% 用户开启推送提醒 vs 不开启',
    result: '开启推送组 DAU +34%，7日留存 +11%。已全量上线。',
    impact: 'high',
    createdAt: '2026-03-20',
    validatedAt: '2026-04-01',
    markdownDetail: '## 假设：每日写作目标提醒能提升打开率\n\n### 实验设计\n\nA/B 测试：50% 用户开启推送提醒 vs 不开启\n\n### 结果\n\n- 开启推送组 DAU **+34%**\n- 7日留存 **+11%**\n- 已**全量上线**\n\n### 结论\n\n推送通知对写作工具同样有效，建议后续优化推送时间段（晚间 20:30 效果最佳）。',
  },
  {
    id: 'h5',
    status: 'validated',
    belief: 'Dark Mode 是用户流失的原因之一',
    why: '多条差评提及「没有深色模式」',
    method: '上线 Dark Mode 后观察评分变化和流失率',
    result: '上线后 App Store 评分从 3.8 → 4.4，当月流失率 -8%。已保留。',
    impact: 'medium',
    createdAt: '2026-03-10',
    validatedAt: '2026-03-28',
  },
  {
    id: 'h6',
    status: 'invalidated',
    belief: 'AI 自动生成大纲能成为核心功能',
    why: '用户调研中 70% 表示感兴趣',
    method: '上线大纲功能，观察 30 天活跃使用率',
    result: '上线后仅 12% 用户使用超过 3 次。用户反馈「生成结果太模板化」。已降优先级。',
    impact: 'low',
    createdAt: '2026-02-20',
    validatedAt: '2026-03-25',
    markdownDetail: '## 假设：AI 自动生成大纲能成为核心功能\n\n### 背景\n\n用户调研中 70% 表示感兴趣。\n\n### 实验结果\n\n上线后仅 **12%** 用户使用超过 3 次。\n\n### 失败原因分析\n\n- 用户反馈「生成结果太模板化」\n- 「用户说想要」≠「用户会真正使用」\n- 调研数据有偏差，实际行为才是真相\n\n### 后续行动\n\n已降优先级，转为探索更个性化的大纲生成方式。',
  },
];

// ─── Feature Ideas ───────────────────────────────────────────────────
export interface FeatureIdea {
  id: string;
  title: string;
  description: string;
  source: '用户反馈' | '竞品分析' | '自己想到' | '数据发现';
  aiPriority: 'P0' | 'P1' | 'P2' | 'P3';
  aiReason: string;
  votes: number;
}

export const featureIdeas: FeatureIdea[] = [
  {
    id: 'fi1',
    title: '段落重写 v1',
    description: '选中段落后一键 AI 重写，保留原意，改写表达',
    source: '用户反馈',
    aiPriority: 'P0',
    aiReason: '与当前最高优先级假设 h1 直接关联，且数据显示续写后删除的用户占 43%',
    votes: 12,
  },
  {
    id: 'fi2',
    title: '写作数据周报',
    description: '每周推送用户写作数据：字数、完成度、最佳写作时段',
    source: '竞品分析',
    aiPriority: 'P1',
    aiReason: 'Notion AI 和 Grammarly 都有类似功能，可提升参与感和留存',
    votes: 8,
  },
  {
    id: 'fi3',
    title: '引用格式自动检测',
    description: '检测文本中的引用来源，自动建议标准引用格式',
    source: '用户反馈',
    aiPriority: 'P3',
    aiReason: '仅 12% 用户使用引用检查功能，优先级较低',
    votes: 3,
  },
];

// ─── Requirement Outputs ─────────────────────────────────────────────
export type RequirementType = 'user-story' | 'acceptance' | 'nfr';

export interface RequirementOutput {
  id: string;
  title: string;
  type: RequirementType;
  content: string;  // Markdown 格式
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  linkedHypothesis?: string;  // 关联假设 ID
  createdAt: string;
}

const reqTypeLabel: Record<RequirementType, string> = {
  'user-story': '用户故事',
  acceptance: '验收标准',
  nfr: '非功能需求',
};

export { reqTypeLabel };

export const requirementOutputs: RequirementOutput[] = [
  {
    id: 'req1',
    title: '段落重写 MVP 用户故事',
    type: 'user-story',
    content: '### 用户故事\n\n**作为**一个 WriteFlow 用户，\n**我希望**选中一段文字后能一键 AI 重写，\n**以便**快速改善表达质量，无需手动逐句修改。\n\n### 场景描述\n\n1. 用户在编辑器中选中一段文字\n2. 浮动工具栏出现「重写」按钮\n3. 点击后 AI 生成重写版本，保留原意\n4. 用户可选择「采用」或「放弃」',
    priority: 'P0',
    linkedHypothesis: 'h1',
    createdAt: '2026-04-08',
  },
  {
    id: 'req2',
    title: '段落重写验收标准',
    type: 'acceptance',
    content: '### 验收标准\n\n- [ ] 选中文本后 500ms 内出现重写按钮\n- [ ] 重写延迟 < 3 秒（P95）\n- [ ] 重写结果保留原文核心语义\n- [ ] 支持「采用/放弃/重新生成」三种操作\n- [ ] 错误时显示友好提示，不阻断编辑流程\n- [ ] 移动端触摸选中同样可用',
    priority: 'P0',
    linkedHypothesis: 'h1',
    createdAt: '2026-04-08',
  },
  {
    id: 'req3',
    title: '共享链接功能用户故事',
    type: 'user-story',
    content: '### 用户故事\n\n**作为**一个想与同事协作的用户，\n**我希望**能生成一个只读共享链接分享文档，\n**以便**在不需要完整团队版的情况下实现基本协作。\n\n### 备注\n\n> 这是团队版的轻量替代方案，用于验证协作需求的真实程度。',
    priority: 'P1',
    linkedHypothesis: 'h2',
    createdAt: '2026-04-09',
  },
  {
    id: 'req4',
    title: 'AI 重写性能要求',
    type: 'nfr',
    content: '### 非功能需求：AI 重写性能\n\n| 指标 | 要求 |\n|------|------|\n| 响应延迟（P95） | < 3 秒 |\n| 并发支持 | >= 50 用户同时重写 |\n| 错误率 | < 1% |\n| 降级策略 | API 超时后 5s 自动重试一次，仍失败则提示用户 |',
    priority: 'P0',
    linkedHypothesis: 'h1',
    createdAt: '2026-04-08',
  },
];

// ─── Competitors ─────────────────────────────────────────────────────
export interface Competitor {
  name: string;
  strength: string[];
  weakness: string[];
  pricing: string;
  differentiation: string;
}

export const competitors: Competitor[] = [
  {
    name: 'Jasper AI',
    strength: ['品牌知名度高', '模板丰富', '营销文案强'],
    weakness: ['价格偏高 $49/mo', '中文支持弱', '编辑器体验一般'],
    pricing: '$49/mo',
    differentiation: '我们聚焦中文写作体验，价格更亲民',
  },
  {
    name: 'Notion AI',
    strength: ['生态强', '用户粘性高', '产品体验好'],
    weakness: ['AI 能力是附加功能', '写作专注度不如专用工具'],
    pricing: '$10/mo add-on',
    differentiation: '我们是写作专用工具，AI 能力更深度',
  },
];

// ─── Solo Tasks ──────────────────────────────────────────────────────
export type TaskType = 'dev' | 'product' | 'ops' | 'growth';
export type SoloTaskStatus = 'todo' | 'doing' | 'done';

export interface SoloTask {
  id: string;
  title: string;
  type: TaskType;
  status: SoloTaskStatus;
  est: string;
  dod: string[];
  note?: string;
  createdAt: string;
}

export const soloTasks: SoloTask[] = [
  {
    id: 'st1',
    title: '修复 Editor 光标丢失 bug',
    type: 'dev',
    status: 'doing',
    est: '3h',
    dod: ['复现稳定', '修复并通过本地测试', '部署到生产'],
    note: 'Prosemirror selection state 在 IME 输入后丢失，已定位到 handleKeyDown',
    createdAt: '2026-04-08',
  },
  {
    id: 'st2',
    title: '实现段落重写功能（MVP）',
    type: 'dev',
    status: 'todo',
    est: '2d',
    dod: ['选中段落后出现重写按钮', '调用 GPT-4o 重写', 'Loading 态 + 错误处理'],
    createdAt: '2026-04-09',
  },
  {
    id: 'st3',
    title: '邀请 5 位用户内测重写功能',
    type: 'product',
    status: 'todo',
    est: '1h',
    dod: ['发送邀请邮件', '建立反馈收集表单'],
    createdAt: '2026-04-09',
  },
  {
    id: 'st4',
    title: '回复 Product Hunt 评论',
    type: 'growth',
    status: 'todo',
    est: '30min',
    dod: ['8 条评论全部回复', '记录有价值的反馈到知识库'],
    createdAt: '2026-04-10',
  },
  {
    id: 'st5',
    title: '更新落地页 — 加入 Dark Mode 截图',
    type: 'growth',
    status: 'todo',
    est: '1h',
    dod: ['截图准备好', 'Landing page 发布'],
    createdAt: '2026-04-09',
  },
  {
    id: 'st6',
    title: '配置 PostHog 用户行为追踪',
    type: 'ops',
    status: 'done',
    est: '2h',
    dod: ['集成 SDK', '关键事件埋点', '验证数据上报'],
    createdAt: '2026-04-07',
  },
  {
    id: 'st7',
    title: '升级 Next.js 14 → 15',
    type: 'dev',
    status: 'done',
    est: '3h',
    dod: ['依赖升级', '破坏性变更处理', '生产验证'],
    createdAt: '2026-04-05',
  },
];

// ─── ADR ─────────────────────────────────────────────────────────────
export interface ADR {
  id: string;
  title: string;
  question: string;
  decision: string;
  reason: string;
  date: string;
  status: 'active' | 'deprecated';
}

export const adrs: ADR[] = [
  {
    id: 'adr1',
    title: 'AI 模型选型',
    question: '使用 GPT-4o 还是 Claude 3.5 Sonnet？',
    decision: '主力使用 GPT-4o，长文档摘要降级到 GPT-4o-mini',
    reason: '中文写作质量 GPT-4o > Claude，成本用 mini 兜底',
    date: '2026-03-01',
    status: 'active',
  },
  {
    id: 'adr2',
    title: '编辑器技术选型',
    question: '用 ProseMirror、TipTap 还是 Quill？',
    decision: '选 TipTap（基于 ProseMirror）',
    reason: '开发体验更好，Extension 生态完善，有商业支持',
    date: '2026-02-15',
    status: 'active',
  },
  {
    id: 'adr3',
    title: '数据库选型',
    question: '用 PlanetScale（MySQL）还是 Supabase（Postgres）？',
    decision: '选 Supabase',
    reason: '自带 Auth + Storage，减少集成工作量；Postgres 生态更强',
    date: '2026-02-10',
    status: 'active',
  },
];

// ─── Feature Flags ───────────────────────────────────────────────────
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout: number; // percentage
  environment: 'prod' | 'staging' | 'dev';
}

export const featureFlags: FeatureFlag[] = [
  {
    id: 'ff1',
    name: 'paragraph-rewrite-beta',
    description: '段落重写功能 Beta',
    enabled: true,
    rollout: 10,
    environment: 'prod',
  },
  {
    id: 'ff2',
    name: 'voice-input',
    description: '语音输入（验证中）',
    enabled: true,
    rollout: 50,
    environment: 'prod',
  },
];

// ─── Release History ─────────────────────────────────────────────────
export interface Release {
  version: string;
  date: string;
  env: 'prod' | 'staging';
  status: 'success' | 'failed' | 'rolledback';
  summary: string;
  deployTime: string;
}

export const releases: Release[] = [
  {
    version: 'v1.2.3',
    date: '2026-04-07',
    env: 'prod',
    status: 'success',
    summary: '修复移动端键盘遮挡问题，升级 Next.js 15',
    deployTime: '2m 14s',
  },
  {
    version: 'v1.2.2',
    date: '2026-04-03',
    env: 'prod',
    status: 'success',
    summary: 'Dark Mode 全量上线，性能优化',
    deployTime: '1m 58s',
  },
  {
    version: 'v1.2.1',
    date: '2026-03-28',
    env: 'prod',
    status: 'rolledback',
    summary: 'AI 续写延迟优化 — 回滚（Stream 解析崩溃）',
    deployTime: '—',
  },
  {
    version: 'v1.2.0',
    date: '2026-03-20',
    env: 'prod',
    status: 'success',
    summary: '每日写作提醒推送，PostHog 用户行为追踪',
    deployTime: '2m 31s',
  },
  {
    version: 'v1.1.9',
    date: '2026-03-15',
    env: 'prod',
    status: 'success',
    summary: '引用检查功能上线，大纲生成优化',
    deployTime: '1m 44s',
  },
];

// ─── Knowledge Base ──────────────────────────────────────────────────
export type KnowledgeCategory = 'pitfall' | 'user-insight' | 'tech-note';

export interface KnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  date: string;
  aiAlert?: string;
}

export const myKnowledge: KnowledgeItem[] = [
  {
    id: 'k1',
    category: 'pitfall',
    title: 'ProseMirror IME 输入光标丢失',
    content: '在中文 IME 输入过程中，composition 事件会导致 selection 状态错误。需要在 compositionstart/end 事件中缓存 selection state，避免 handleKeyDown 覆盖。',
    tags: ['ProseMirror', 'IME', '中文输入'],
    date: '2026-04-08',
    aiAlert: '当前正在修复的 bug (st1) 与此坑相关！',
  },
  {
    id: 'k2',
    category: 'pitfall',
    title: 'Vercel Serverless 冷启动超时',
    content: 'OpenAI Stream 接口在冷启动时会超过 Vercel 10s 限制。解决方案：迁移到 Edge Runtime，或使用 Vercel Pro 的更长超时配置。',
    tags: ['Vercel', 'Serverless', 'OpenAI'],
    date: '2026-03-28',
  },
  {
    id: 'k3',
    category: 'user-insight',
    title: '用户实际使用时间集中在晚间',
    content: '根据 PostHog 数据，78% 的 DAU 活跃时间在 20:00-23:00。推送通知应在 20:30 发送，而非 09:00。',
    tags: ['用户行为', '推送策略'],
    date: '2026-04-02',
  },
  {
    id: 'k4',
    category: 'user-insight',
    title: '首次使用放弃率在第 3 步骤',
    content: '用户注册后在「选择写作风格」步骤流失率达 42%。原因：选项太多（8个），建议精简到 3 个，其余用「高级设置」收起。',
    tags: ['Onboarding', '转化率'],
    date: '2026-03-30',
  },
  {
    id: 'k5',
    category: 'tech-note',
    title: 'Supabase RLS 策略最佳实践',
    content: '每张表必须开启 RLS，哪怕是只读表。用 auth.uid() 而非 auth.role() 进行行级权限控制。注意：JOIN 查询中关联表也必须有对应 RLS 策略，否则返回空。',
    tags: ['Supabase', 'RLS', '安全'],
    date: '2026-03-18',
  },
  {
    id: 'k6',
    category: 'tech-note',
    title: 'TipTap Extension 的正确开发姿势',
    content: '不要直接修改 Node 的 attrs，要通过 Command 触发。Extension 之间通信用 Editor.storage，不要用全局状态。测试时必须 mock ProseMirror state。',
    tags: ['TipTap', 'ProseMirror', 'Extension'],
    date: '2026-02-25',
  },
];

// ─── User Feedback ───────────────────────────────────────────────────
export interface UserFeedback {
  id: string;
  user: string;
  channel: 'Email' | 'Product Hunt' | 'Twitter' | 'In-app';
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string;
}

export const userFeedbacks: UserFeedback[] = [
  {
    id: 'uf1',
    user: '@alice_writes',
    channel: 'Product Hunt',
    content: '终于有一个真正懂中文写作的 AI 工具了，续写质量比 Jasper 好多了！就是希望能加个段落重写功能。',
    sentiment: 'positive',
    date: '2026-04-09',
  },
  {
    id: 'uf2',
    user: '匿名用户',
    channel: 'In-app',
    content: '有时候 AI 续写速度很慢，等了快 10 秒，体验不好。',
    sentiment: 'negative',
    date: '2026-04-08',
  },
  {
    id: 'uf3',
    user: '@davidchen',
    channel: 'Twitter',
    content: 'WriteFlow 的 Dark Mode 真的很好看，终于不用在黑暗中瞪着白屏了 🌙',
    sentiment: 'positive',
    date: '2026-04-07',
  },
  {
    id: 'uf4',
    user: 'zhuming@corp.com',
    channel: 'Email',
    content: '我们团队有 5 个人想用，有没有团队版？单独买 5 个感觉有点贵。',
    sentiment: 'neutral',
    date: '2026-04-06',
  },
  {
    id: 'uf5',
    user: '@writer_li',
    channel: 'In-app',
    content: '每天写作提醒太好用了！已经连续写作 14 天，是我用过最有用的功能。',
    sentiment: 'positive',
    date: '2026-04-05',
  },
];
