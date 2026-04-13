// Autopilot mode mock data — shared by Enterprise and Solo autopilot pages

// ─── Agent Definitions ─────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'done' | 'waiting';

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  color: string;
  bgColor: string;
  borderColor: string;
  emoji: string;
  skills: string[];
  description: string;
}

export const teamAgents: AgentDef[] = [
  {
    id: 'pm-agent',
    name: 'AI产品搭档',
    role: '产品经理',
    color: '#1264e5',
    bgColor: '#e6f0ff',
    borderColor: '#91c5ff',
    emoji: '📋',
    skills: ['需求分析', 'PRD 生成', '优先级排序', '用户故事'],
    description: '分析需求、拆解用户故事、生成 PRD 草稿',
  },
  {
    id: 'arch-agent',
    name: 'AI架构搭档',
    role: '架构师',
    color: '#722ed1',
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
    emoji: '🏗️',
    skills: ['系统设计', 'SDD 生成', 'API 规范', 'ADR 记录'],
    description: '评审 PRD、设计系统架构、生成 SDD 与接口契约',
  },
  {
    id: 'dev-agent',
    name: 'AI开发搭档',
    role: '开发人员',
    color: '#08979c',
    bgColor: '#e6fffb',
    borderColor: '#87e8de',
    emoji: '💻',
    skills: ['代码生成', 'PR 提交', '单元测试', 'Code Review'],
    description: '按 SDD 实现功能、提交 PR、生成单元测试',
  },
  {
    id: 'qa-agent',
    name: 'AI测试搭档',
    role: 'QA 工程师',
    color: '#d46b08',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    emoji: '🧪',
    skills: ['测试用例', '自动化测试', '回归测试', '质量门控'],
    description: '生成测试用例、执行自动化测试、输出质量报告',
  },
  {
    id: 'sre-agent',
    name: 'AI运维搭档',
    role: 'SRE',
    color: '#389e0d',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    emoji: '🚀',
    skills: ['CI/CD', '发布管理', '监控告警', '回滚决策'],
    description: '触发流水线、执行部署、配置监控告警',
  },
  {
    id: 'mgr-agent',
    name: 'AI管理搭档',
    role: '管理层',
    color: '#cf1322',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
    emoji: '📊',
    skills: ['进度汇总', '风险预警', '迭代报告', '效能分析'],
    description: '汇总执行结果、生成迭代报告、分析效能数据',
  },
];

export const soloAgents: AgentDef[] = [
  {
    id: 'product-brain',
    name: 'AI产品搭档',
    role: 'AI产品搭档',
    color: '#1264e5',
    bgColor: '#e6f0ff',
    borderColor: '#91c5ff',
    emoji: '🧠',
    skills: ['需求分析', '假设拆解', '用户洞察', '功能优先级'],
    description: '以产品经理视角分析目标，拆解为可验证的假设和功能点',
  },
  {
    id: 'eng-brain',
    name: 'AI工程搭档',
    role: 'AI工程搭档',
    color: '#08979c',
    bgColor: '#e6fffb',
    borderColor: '#87e8de',
    emoji: '⚙️',
    skills: ['技术方案', '代码实现', 'Bug 修复', '部署执行'],
    description: '选择最简技术方案，直接生成可运行代码，无需评审',
  },
  {
    id: 'growth-brain',
    name: 'AI增长搭档',
    role: 'AI增长搭档',
    color: '#d46b08',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    emoji: '📈',
    skills: ['用户获取', '留存策略', '文案生成', '社区运营'],
    description: '制定增长策略，生成营销文案，规划用户触达方案',
  },
  {
    id: 'ops-brain',
    name: 'AI运营搭档',
    role: 'AI运营搭档',
    color: '#389e0d',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    emoji: '🔧',
    skills: ['数据监控', '发布管理', '客服回复', '故障处理'],
    description: '监控生产环境，处理用户反馈，执行日常运营任务',
  },
];

// ─── Workflow Steps ─────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  output: string;
  durationMs: number;   // simulated delay before this step appears
  artifact?: {
    title: string;
    content: string;
  };
}

export const teamWorkflowSteps: WorkflowStep[] = [
  {
    id: 'es1',
    agentId: 'pm-agent',
    agentName: 'PM Agent',
    action: '分析目标，拆解用户故事',
    output: '识别出 3 个核心用户故事，2 个验收标准',
    durationMs: 1200,
    artifact: {
      title: 'PRD 草稿（要点）',
      content: '• 用户故事 #1：作为用户，我希望…\n• 用户故事 #2：作为用户，我希望…\n• 验收标准：功能覆盖率 ≥ 95%，P99 延迟 ≤ 200ms',
    },
  },
  {
    id: 'es2',
    agentId: 'pm-agent',
    agentName: 'PM Agent',
    action: '生成 PRD 文档，提交评审',
    output: 'PRD v1.0 已生成，等待架构师评审',
    durationMs: 1000,
  },
  {
    id: 'es3',
    agentId: 'arch-agent',
    agentName: 'Architect Agent',
    action: '评审 PRD，设计系统架构',
    output: '架构方案确认：微服务拆分 2 个新服务，复用现有 Auth 模块',
    durationMs: 1500,
    artifact: {
      title: 'SDD 架构决策',
      content: '• 新增 writing-service（Go）\n• 新增 ai-gateway（Node.js）\n• ADR-07: 使用 GPT-4o API，降级至 GPT-4o-mini\n• API 接口契约已定义 (OpenAPI 3.0)',
    },
  },
  {
    id: 'es4',
    agentId: 'arch-agent',
    agentName: 'Architect Agent',
    action: '生成 API 契约，通知开发团队',
    output: 'OpenAPI Spec 已发布，契约测试脚手架已生成',
    durationMs: 800,
  },
  {
    id: 'es5',
    agentId: 'dev-agent',
    agentName: 'Dev Agent',
    action: '按 SDD 实现功能，编写单元测试',
    output: '核心逻辑实现完毕，单元测试覆盖率 87%',
    durationMs: 2000,
    artifact: {
      title: '代码产出',
      content: '• 新增文件：writing-service/handler.go\n• 单元测试：87% 覆盖率（目标 80%）✅\n• PR #142 已提交，请求 Code Review',
    },
  },
  {
    id: 'es6',
    agentId: 'qa-agent',
    agentName: 'QA Agent',
    action: '生成测试用例，执行自动化测试',
    output: '32 个测试用例全部通过，发现 1 个边界 Bug 已记录',
    durationMs: 1800,
    artifact: {
      title: '质量报告',
      content: '• 测试用例：32 个（Pass 31 / Fail 0 / Skip 1）\n• 发现边界 Bug：空字符串输入未处理（已提 Issue #89）\n• 性能测试：P99 = 142ms ✅',
    },
  },
  {
    id: 'es7',
    agentId: 'sre-agent',
    agentName: 'SRE Agent',
    action: '触发 CI/CD 流水线，部署到生产',
    output: '部署成功，监控告警已配置，SLO 达标',
    durationMs: 1600,
    artifact: {
      title: '部署记录',
      content: '• 环境：Production\n• 版本：v2.4.1\n• 部署耗时：3m 22s\n• 监控：ErrorRate < 0.1% ✅\n• 回滚方案：已配置自动回滚（ErrorRate > 1%）',
    },
  },
  {
    id: 'es8',
    agentId: 'mgr-agent',
    agentName: 'Manager Agent',
    action: '汇总执行结果，生成迭代报告',
    output: '迭代报告已生成，效能数据已更新到驾驶舱',
    durationMs: 900,
    artifact: {
      title: '迭代总结',
      content: '• 功能按时交付 ✅\n• 需求完成率：100%\n• 缺陷逃逸率：0%\n• DORA Lead Time：4h 12min（目标 < 8h）✅\n• 节省人工工时估算：~18h',
    },
  },
];

export const soloWorkflowSteps: WorkflowStep[] = [
  {
    id: 'ss1',
    agentId: 'product-brain',
    agentName: 'AI产品搭档',
    action: '分析目标，拆解为最小可验证功能',
    output: '确定 MVP 范围：1 个核心功能点，3 项 DoD',
    durationMs: 800,
    artifact: {
      title: '功能拆解',
      content: '• 最小范围：仅实现核心路径\n• DoD: ①功能可用 ②有基础错误处理 ③上线可观测\n• 跳过：完善 UI、多语言、权限管理（后续迭代）',
    },
  },
  {
    id: 'ss2',
    agentId: 'eng-brain',
    agentName: 'AI工程搭档',
    action: '选定技术方案，直接生成实现代码',
    output: '核心逻辑实现完毕，复用已有组件，无新增依赖',
    durationMs: 1400,
    artifact: {
      title: '技术产出',
      content: '• 实现方式：复用 TipTap Extension 模式\n• 新增文件：extensions/ParagraphRewrite.ts\n• API 调用：POST /api/rewrite（已有接口改造）\n• 无新增 npm 依赖 ✅',
    },
  },
  {
    id: 'ss3',
    agentId: 'ops-brain',
    agentName: 'AI运营搭档',
    action: '部署上线，开启 Feature Flag 灰度',
    output: '已部署，Feature Flag 设为 10% 灰度，监控正常',
    durationMs: 900,
    artifact: {
      title: '发布状态',
      content: '• 版本：v1.2.4\n• 部署耗时：1m 58s\n• Feature Flag: paragraph-rewrite-beta → 10% 用户\n• 监控：无异常告警 ✅',
    },
  },
  {
    id: 'ss4',
    agentId: 'growth-brain',
    agentName: 'AI增长搭档',
    action: '生成用户邀请文案，发送内测通知',
    output: '5 封内测邀请邮件已生成，反馈收集表单已创建',
    durationMs: 700,
    artifact: {
      title: '增长行动',
      content: '• 邀请邮件：5 封（针对高活跃用户）\n• 邮件主题：「你最期待的功能来了 — 内测邀请」\n• 反馈表单：Typeform 已创建\n• 预计内测回收时间：3 天',
    },
  },
];

// ─── Sample Goals ─────────────────────────────────────────────────

export const teamSampleGoals = [
  '为苍穹财务增加「智能费用报销审批」功能，支持 OCR 识别票据、自动匹配审批规则，并与现有工作流集成',
  '优化苍穹供应链「采购订单管理」模块的性能，P99 响应时间从 800ms 降低到 200ms 以内',
  '为苍穹人力云新增「员工入职自动化」流程，从 offer 接受到系统账号开通全链路自动化',
];

export const soloSampleGoals = [
  '为 WriteFlow 实现「段落一键重写」功能，选中段落后 AI 重写，保留原意改写表达，MVP 版本',
  '修复 Editor 在 iOS 上的光标偏移 bug，并上线到生产环境',
  '上线「写作数据周报」功能，每周日发送用户写作统计邮件（字数/完成度/最佳时段）',
];
