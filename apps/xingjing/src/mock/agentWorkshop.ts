// Agent Workshop mock data — Skill pool & Agent-Task assignments

// ─── Color & Emoji Presets ─────────────────────────────────────────

export interface ColorPreset {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const agentColorPresets: ColorPreset[] = [
  { label: '蓝', color: '#1264e5', bgColor: '#e6f0ff', borderColor: '#91c5ff' },
  { label: '紫', color: '#722ed1', bgColor: '#f9f0ff', borderColor: '#d3adf7' },
  { label: '青', color: '#08979c', bgColor: '#e6fffb', borderColor: '#87e8de' },
  { label: '橙', color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591' },
  { label: '绿', color: '#389e0d', bgColor: '#f6ffed', borderColor: '#b7eb8f' },
  { label: '红', color: '#cf1322', bgColor: '#fff2f0', borderColor: '#ffccc7' },
  { label: '金', color: '#d4b106', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  { label: '品红', color: '#c41d7f', bgColor: '#fff0f6', borderColor: '#ffadd2' },
  { label: '靛', color: '#1d39c4', bgColor: '#f0f5ff', borderColor: '#adc6ff' },
  { label: '火山', color: '#d4380d', bgColor: '#fff2e8', borderColor: '#ffbb96' },
];

export const emojiPresets: string[] = [
  '📋', '🏗️', '💻', '🧪', '🚀', '📊',
  '🧠', '⚙️', '📈', '🔧', '🎯', '🔍',
  '🛡️', '📦', '🤖', '💡',
];

// ─── Skill Definitions ─────────────────────────────────────────────

export interface SkillInputParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface SkillDef {
  id: string;
  name: string;
  category: string;
  description: string;
  icon?: string;
  systemPrompt?: string;
  inputParams?: SkillInputParam[];
  outputType?: string;
  trigger?: string;
}

// ─── Skill Execution & Orchestration ──────────────────────────────

export interface SkillExecution {
  skillName: string;
  status: 'pending' | 'running' | 'done';
  output?: string;
}

export interface TaskOrchestration {
  agentId: string;
  taskId: string;
  steps: SkillExecution[];
}

export const teamSkillPool: SkillDef[] = [
  {
    id: 'es01', name: '需求分析', category: '产品',
    description: '分析业务需求，提炼核心用户故事',
    trigger: '产品经理发起新需求 / strategy_prd_approved 事件',
    systemPrompt: '你是金蝶的资深产品经理，精通金蝶苍穹/星空/EAS 产品体系。\n分析规则：\n1. 用户故事必须包含“作为[角色]，我希望[功能]，以便[业务价值]”格式\n2. 每个用户故事必须有 ≥ 2 条可测试验收标准\n3. 影响分析必须识别所有关联应用\n4. 财务类需求必须识别适用的会计准则/税务法规',
    inputParams: [
      { name: 'requirement_description', type: 'string', required: true, description: '用户需求描述（自然语言）' },
      { name: 'domain', type: 'enum(finance,supply-chain,hr,manufacturing)', required: true, description: '业务领域' },
      { name: 'priority', type: 'enum(P0,P1,P2)', required: false, description: '需求优先级' },
    ],
    outputType: 'list[UserStory] — 包含用户故事列表和验收标准',
  },
  { id: 'es02', name: 'PRD 生成', category: '产品', description: '自动生成结构化产品需求文档' },
  { id: 'es03', name: '优先级排序', category: '产品', description: '基于 RICE 模型智能排列需求优先级' },
  { id: 'es04', name: '用户故事拆解', category: '产品', description: '将大需求拆解为可执行的用户故事' },
  { id: 'es05', name: '系统设计', category: '架构', description: '设计模块间依赖关系与数据流' },
  {
    id: 'es06', name: 'SDD 生成', category: '架构',
    description: '自动输出系统设计文档（SDD）',
    trigger: 'prd_approved 事件自动触发',
    systemPrompt: '你是金蝶的首席架构师，精通 Spring Cloud 微服务架构、金蝶苍穹平台。\nSDD 生成规则：\n1. 架构图使用 Mermaid 语法\n2. 数据模型必须包含索引设计和数据量估算\n3. 关键决策以 ADR 格式记录\n4. NFR 必须有可测量指标（如 P99 延迟）',
    inputParams: [
      { name: 'prd_path', type: 'string', required: true, description: 'PRD 文档路径' },
      { name: 'domain', type: 'string', required: true, description: '业务领域' },
      { name: 'app', type: 'string', required: false, description: '主要影响的应用名' },
    ],
    outputType: 'file — docs/sdd/SDD-{id}.md（含架构图、数据模型、ADR）',
  },
  { id: 'es07', name: 'API 规范', category: '架构', description: '生成 OpenAPI 3.0 接口契约' },
  { id: 'es08', name: 'ADR 记录', category: '架构', description: '记录架构决策及其上下文与后果' },
  {
    id: 'es09', name: '代码生成', category: '开发',
    description: '按 SDD 规格自动生成实现代码',
    trigger: '开发者在 IDE 中手动调用 / task_assigned 事件',
    systemPrompt: '你是金蝶的高级开发工程师。\n代码生成规则：\n1. 优先读取 TASK 文档，理解任务边界和 DoD\n2. 遵循金蝶 Java 编码规范（Alibaba Java 编码规范）\n3. 包结构：com.kingdee.{product}.{domain}.{app}.{layer}\n4. 异常使用 KingdeeBusinessException',
    inputParams: [
      { name: 'task_id', type: 'string', required: true, description: 'TASK 文档 ID' },
      { name: 'sdd_path', type: 'string', required: true, description: 'SDD 文档路径' },
      { name: 'target_layer', type: 'enum(service,dao,controller,model)', required: false, description: '生成层次' },
    ],
    outputType: 'files — Java 源码骨架 + 单元测试骨架',
  },
  { id: 'es10', name: 'Code Review', category: '开发', description: '自动审查代码质量与最佳实践' },
  { id: 'es11', name: '单元测试', category: '开发', description: '自动生成单元测试用例' },
  {
    id: 'es12', name: '测试用例生成', category: '质量',
    description: '基于需求自动生成集成测试用例',
    trigger: 'sdd_approved 事件 / 手动调用',
    systemPrompt: '你是金蝶的 QA 工程师，擅长设计全面的测试策略。\n测试用例规则：\n1. 覆盖正常流程、边界值、异常场景\n2. 验收标准（AC）对应至少 1 个测试用例\n3. 财务场景必须包含账期校验测试\n4. 接口测试使用 Pact 契约测试框架',
    inputParams: [
      { name: 'prd_path', type: 'string', required: true, description: 'PRD 文档路径' },
      { name: 'contract_path', type: 'string', required: false, description: '接口契约文档路径' },
      { name: 'test_type', type: 'enum(unit,integration,e2e)', required: true, description: '测试类型' },
    ],
    outputType: 'list[TestCase] — 测试用例列表（含前置条件、步骤、预期结果）',
  },
  { id: 'es13', name: '自动化测试', category: '质量', description: '执行端到端自动化回归测试' },
  { id: 'es14', name: 'CI/CD 执行', category: '运维', description: '触发构建流水线并执行部署' },
  { id: 'es15', name: '监控告警', category: '运维', description: '配置 SLO 监控和智能告警规则' },
  { id: 'es16', name: '进度汇总', category: '管理', description: '汇总迭代进度并生成周报' },
  { id: 'es17', name: '风险预警', category: '管理', description: '识别项目风险并主动提醒' },
  { id: 'es18', name: '效能分析', category: '管理', description: '分析 DORA 指标并给出优化建议' },
];

export const soloSkillPool: SkillDef[] = [
  { id: 'ss01', name: '假设验证', category: '产品', description: '设计实验验证产品假设的可行性' },
  { id: 'ss02', name: '功能优先级', category: '产品', description: '基于商业价值与用户反馈排优先级' },
  { id: 'ss03', name: '用户洞察', category: '产品', description: '从反馈中提炼用户真实需求' },
  { id: 'ss04', name: 'MVP 开发', category: '工程', description: '用最小代码量实现核心功能' },
  { id: 'ss05', name: 'Bug 修复', category: '工程', description: '快速定位并修复生产问题' },
  { id: 'ss06', name: '技术方案', category: '工程', description: '选择最简可行的技术实现路径' },
  { id: 'ss07', name: '一键部署', category: '工程', description: '自动化构建并部署到生产环境' },
  { id: 'ss08', name: '增长文案', category: '增长', description: '生成营销文案、邮件和社交媒体内容' },
  { id: 'ss09', name: '留存策略', category: '增长', description: '设计用户留存与激活策略' },
  { id: 'ss10', name: '社区运营', category: '增长', description: '管理社区互动并回复用户' },
  { id: 'ss11', name: '数据监控', category: '运营', description: '监控核心商业指标（DAU/MRR/留存）' },
  { id: 'ss12', name: '客服回复', category: '运营', description: '生成客服回复并分类用户反馈' },
];

// ─── Agent-Task Assignments ────────────────────────────────────────

export interface AgentAssignment {
  agentId: string;
  taskId: string;
  status: 'assigned' | 'working' | 'done';
}

export const initialEnterpriseAssignments: AgentAssignment[] = [
  { agentId: 'pm-agent', taskId: 'TASK-001-04', status: 'assigned' },
  { agentId: 'dev-agent', taskId: 'TASK-001-02', status: 'working' },
  { agentId: 'qa-agent', taskId: 'TASK-001-07', status: 'assigned' },
  { agentId: 'arch-agent', taskId: 'TASK-001-09', status: 'assigned' },
];

export const initialSoloAssignments: AgentAssignment[] = [
  { agentId: 'product-brain', taskId: 'st3', status: 'assigned' },
  { agentId: 'eng-brain', taskId: 'st1', status: 'working' },
  { agentId: 'growth-brain', taskId: 'st5', status: 'assigned' },
  { agentId: 'ops-brain', taskId: 'st4', status: 'assigned' },
];

// ─── Enterprise Orchestrations ────────────────────────────────────

export const teamOrchestrations: TaskOrchestration[] = [
  {
    agentId: 'pm-agent', taskId: 'TASK-001-04',
    steps: [
      { skillName: '需求分析', status: 'done', output: '提炼出 3 个核心用户故事，明确验收标准' },
      { skillName: 'PRD 生成', status: 'done', output: 'PRD v1.0 草稿已生成，包含功能范围与边界' },
      { skillName: '优先级排序', status: 'running', output: '正在基于 RICE 模型排序中...' },
    ],
  },
  {
    agentId: 'dev-agent', taskId: 'TASK-001-02',
    steps: [
      { skillName: '代码生成', status: 'done', output: '按 SDD 规格生成核心业务逻辑代码' },
      { skillName: '单元测试', status: 'done', output: '单元测试覆盖率 89%，全部通过' },
      { skillName: 'Code Review', status: 'running', output: '正在自动审查代码质量...' },
    ],
  },
  {
    agentId: 'qa-agent', taskId: 'TASK-001-07',
    steps: [
      { skillName: '测试用例生成', status: 'done', output: '生成 28 个测试用例（含边界场景）' },
      { skillName: '自动化测试', status: 'pending', output: undefined },
    ],
  },
  {
    agentId: 'arch-agent', taskId: 'TASK-001-09',
    steps: [
      { skillName: '系统设计', status: 'done', output: '确定微服务拆分方案，2 个新服务' },
      { skillName: 'SDD 生成', status: 'done', output: 'SDD v2.1 已输出，含模块依赖图' },
      { skillName: 'API 规范', status: 'running', output: '正在生成 OpenAPI 3.0 契约...' },
      { skillName: 'ADR 记录', status: 'pending', output: undefined },
    ],
  },
];

// ─── Solo Orchestrations ──────────────────────────────────────────

export const soloOrchestrations: TaskOrchestration[] = [
  {
    agentId: 'product-brain', taskId: 'st3',
    steps: [
      { skillName: '假设验证', status: 'done', output: '段落重写假设已拆解为 3 个可验证维度' },
      { skillName: '用户洞察', status: 'running', output: '正在分析 5 位内测用户的使用数据...' },
      { skillName: '功能优先级', status: 'pending', output: undefined },
    ],
  },
  {
    agentId: 'eng-brain', taskId: 'st1',
    steps: [
      { skillName: 'Bug 修复', status: 'done', output: '定位到光标偏移根因：iOS 虚拟键盘高度计算错误' },
      { skillName: '技术方案', status: 'done', output: '采用 VisualViewport API 替代 window.innerHeight' },
      { skillName: 'MVP 开发', status: 'running', output: '正在实现修复代码并编写回归测试...' },
    ],
  },
  {
    agentId: 'growth-brain', taskId: 'st5',
    steps: [
      { skillName: '增长文案', status: 'done', output: '生成 3 套 Product Hunt 回复模板' },
      { skillName: '社区运营', status: 'running', output: '正在批量回复 8 条评论...' },
    ],
  },
  {
    agentId: 'ops-brain', taskId: 'st4',
    steps: [
      { skillName: '数据监控', status: 'done', output: 'MRR/DAU/留存仪表盘数据已更新' },
      { skillName: '客服回复', status: 'pending', output: undefined },
    ],
  },
];
