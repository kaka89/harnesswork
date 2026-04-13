// 知识中心 Mock 数据 — 五层分级知识管理

export type KnowledgeLevel = 'company' | 'platform' | 'product-line' | 'domain' | 'application';

export type KnowledgeCategory =
  | 'specification'
  | 'architecture'
  | 'process'
  | 'scenario'
  | 'sdd-artifact'
  | 'glossary';

export type ApplicableScene =
  | 'product-planning'
  | 'requirement-design'
  | 'technical-design'
  | 'code-development';

export interface KnowledgeItem {
  id: string;
  title: string;
  category: KnowledgeCategory;
  level: KnowledgeLevel;
  nodeId: string;
  summary: string;
  tags: string[];
  updatedAt: string;
  owner: string;
  applicableScenes: ApplicableScene[];
  status: 'active' | 'archived' | 'deprecated';
}

export interface KnowledgeTreeNode {
  key: string;
  title: string;
  level: KnowledgeLevel;
  children?: KnowledgeTreeNode[];
}

// 知识分类标签中文映射
export const categoryLabelMap: Record<KnowledgeCategory, string> = {
  specification: '规约/规范',
  architecture: '架构设计',
  process: '流程知识',
  scenario: '用户场景',
  'sdd-artifact': 'SDD 产物',
  glossary: '词汇表',
};

export const categoryColorMap: Record<KnowledgeCategory, string> = {
  specification: 'red',
  architecture: 'blue',
  process: 'cyan',
  scenario: 'green',
  'sdd-artifact': 'purple',
  glossary: 'geekblue',
};

// 应用场景标签中文映射
export const sceneLabelMap: Record<ApplicableScene, string> = {
  'product-planning': '产品规划',
  'requirement-design': '需求设计',
  'technical-design': '技术设计',
  'code-development': '代码开发',
};

// 层级标签中文映射和颜色
export const levelLabelMap: Record<KnowledgeLevel, string> = {
  company: '公司级',
  platform: '平台级',
  'product-line': '产品线级',
  domain: '领域级',
  application: '应用级',
};

export const levelColorMap: Record<KnowledgeLevel, string> = {
  company: '#f5222d',
  platform: '#1890ff',
  'product-line': '#722ed1',
  domain: '#52c41a',
  application: '#fa8c16',
};

// ============ 五层知识树 ============
export const knowledgeTree: KnowledgeTreeNode[] = [
  {
    key: 'kingdee',
    title: '金蝶集团',
    level: 'company',
    children: [
      {
        key: 'cosmic',
        title: '苍穹平台',
        level: 'platform',
        children: [
          // 平台技术域
          {
            key: 'cosmic-user',
            title: '用户中心',
            level: 'domain',
            children: [
              { key: 'app-cosmic-uc', title: 'cosmic-uc（用户中心应用）', level: 'application' },
            ],
          },
          {
            key: 'cosmic-auth',
            title: '权限管理',
            level: 'domain',
            children: [
              { key: 'app-cosmic-perm', title: 'cosmic-perm（权限管理应用）', level: 'application' },
            ],
          },
          {
            key: 'cosmic-devapi',
            title: '开发接口',
            level: 'domain',
            children: [
              { key: 'app-cosmic-openapi', title: 'cosmic-openapi（开放平台应用）', level: 'application' },
            ],
          },
          {
            key: 'cosmic-workflow',
            title: '工作流引擎',
            level: 'domain',
            children: [
              { key: 'app-cosmic-wf', title: 'cosmic-wf（工作流应用）', level: 'application' },
            ],
          },
          // 产品线一：星空（中型企业）
          {
            key: 'galaxy',
            title: '星空',
            level: 'product-line',
            children: [
              {
                key: 'galaxy-finance',
                title: '财务领域',
                level: 'domain',
                children: [
                  { key: 'app-cosmic-gl', title: 'cosmic-gl（总账应用）', level: 'application' },
                  { key: 'app-cosmic-ap', title: 'cosmic-ap（应付应用）', level: 'application' },
                  { key: 'app-cosmic-ar', title: 'cosmic-ar（应收应用）', level: 'application' },
                  { key: 'app-cosmic-tax', title: 'cosmic-tax（税务应用）', level: 'application' },
                  { key: 'app-galaxy-gl', title: 'galaxy-gl（总账应用）', level: 'application' },
                  { key: 'app-galaxy-cost', title: 'galaxy-cost（成本应用）', level: 'application' },
                ],
              },
              {
                key: 'galaxy-scm',
                title: '供应链领域',
                level: 'domain',
                children: [
                  { key: 'app-cosmic-po', title: 'cosmic-po（采购应用）', level: 'application' },
                  { key: 'app-cosmic-wms', title: 'cosmic-wms（仓储应用）', level: 'application' },
                  { key: 'app-galaxy-purchase', title: 'galaxy-purchase（采购应用）', level: 'application' },
                  { key: 'app-galaxy-inventory', title: 'galaxy-inventory（库存应用）', level: 'application' },
                ],
              },
              {
                key: 'galaxy-mfg',
                title: '制造领域',
                level: 'domain',
                children: [
                  { key: 'app-cosmic-mes', title: 'cosmic-mes（生产执行应用）', level: 'application' },
                  { key: 'app-galaxy-prod', title: 'galaxy-prod（生产管理应用）', level: 'application' },
                ],
              },
            ],
          },
          // 产品线二：星瀚（小微企业）
          {
            key: 'constellation',
            title: '星瀚',
            level: 'product-line',
            children: [
              {
                key: 'constellation-finance',
                title: '财务领域',
                level: 'domain',
                children: [
                  { key: 'app-cons-gl', title: 'cons-gl（总账应用）', level: 'application' },
                ],
              },
              {
                key: 'constellation-hr',
                title: '人力领域',
                level: 'domain',
                children: [
                  { key: 'app-cons-hr', title: 'cons-hr（人力应用）', level: 'application' },
                ],
              },
              {
                key: 'constellation-collab',
                title: '协同领域',
                level: 'domain',
                children: [
                  { key: 'app-cons-oa', title: 'cons-oa（协同办公应用）', level: 'application' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

// ============ 知识条目 Mock 数据 ============
export const knowledgeItems: KnowledgeItem[] = [
  // ---- 公司级知识 ----
  {
    id: 'KW-CO-001',
    title: 'Java 编码规范 v3.0',
    category: 'specification',
    level: 'company',
    nodeId: 'kingdee',
    summary: '金蝶集团统一 Java 编码规范，涵盖命名约定、异常处理、日志规范、并发编程等核心准则，所有 Java 项目必须遵循。',
    tags: ['Java', '编码规范', '强制'],
    updatedAt: '2026-01-15',
    owner: 'CTO 办公室',
    applicableScenes: ['code-development'],
    status: 'active',
  },
  {
    id: 'KW-CO-002',
    title: '前端编码规范（React/Vue）',
    category: 'specification',
    level: 'company',
    nodeId: 'kingdee',
    summary: '涵盖组件命名、状态管理、TypeScript 类型安全、CSS 模块化等前端开发规范。',
    tags: ['前端', 'React', 'Vue', '编码规范'],
    updatedAt: '2026-02-01',
    owner: 'CTO 办公室',
    applicableScenes: ['code-development'],
    status: 'active',
  },
  {
    id: 'KW-CO-003',
    title: '信息安全管理制度',
    category: 'specification',
    level: 'company',
    nodeId: 'kingdee',
    summary: '企业级信息安全管理制度，包含数据分类保护、访问控制、敏感信息处理、开源许可证合规等要求。',
    tags: ['安全', '合规', '强制'],
    updatedAt: '2026-01-20',
    owner: 'CISO 办公室',
    applicableScenes: ['code-development', 'technical-design'],
    status: 'active',
  },
  {
    id: 'KW-CO-004',
    title: '企业架构原则（12 Factor + DDD）',
    category: 'architecture',
    level: 'company',
    nodeId: 'kingdee',
    summary: '基于 12 Factor App 和领域驱动设计（DDD）的企业级架构原则，指导微服务拆分、领域建模和多租户设计。',
    tags: ['架构', 'DDD', '12 Factor', '微服务'],
    updatedAt: '2026-01-10',
    owner: 'CTO 办公室',
    applicableScenes: ['technical-design', 'requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-CO-005',
    title: '研发流程规范（文档驱动开发）',
    category: 'process',
    level: 'company',
    nodeId: 'kingdee',
    summary: '统一研发流程：PRD → SDD → CONTRACT → PLAN → TASK → 代码，文档状态机驱动项目进度。',
    tags: ['研发流程', 'SDD驱动', '文档驱动'],
    updatedAt: '2026-02-15',
    owner: 'CTO 办公室',
    applicableScenes: ['product-planning', 'requirement-design', 'technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-CO-006',
    title: 'API 设计规范（RESTful + gRPC）',
    category: 'specification',
    level: 'company',
    nodeId: 'kingdee',
    summary: 'RESTful API 和 gRPC 接口设计统一规范，涵盖 URL 命名、HTTP 方法、错误码体系、版本策略等。',
    tags: ['API', 'RESTful', 'gRPC'],
    updatedAt: '2026-02-10',
    owner: 'CTO 办公室',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },

  // ---- 平台级知识（苍穹平台 — 技术底座）----
  {
    id: 'KW-PL-001',
    title: '苍穹平台架构总览',
    category: 'architecture',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '苍穹平台整体技术架构说明，包含微服务架构、中间件选型、部署拓扑、扩展机制（插件/扩展点）。',
    tags: ['苍穹', '架构', '平台'],
    updatedAt: '2026-03-01',
    owner: '苍穹架构组',
    applicableScenes: ['technical-design'],
    status: 'active',
  },
  {
    id: 'KW-PL-002',
    title: '微服务治理规约',
    category: 'specification',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '服务注册与发现、通信规范（同步/异步）、降级熔断策略、分布式事务处理规范。',
    tags: ['微服务', '治理', '规约'],
    updatedAt: '2026-03-05',
    owner: '苍穹架构组',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-PL-003',
    title: 'CI/CD 流水线标准配置',
    category: 'specification',
    level: 'platform',
    nodeId: 'cosmic',
    summary: 'standard-build 和 standard-deploy 的标准流水线配置，环境管理规范（dev/staging/prod），部署审批链。',
    tags: ['CI/CD', '流水线', '部署'],
    updatedAt: '2026-03-10',
    owner: '平台工程团队',
    applicableScenes: ['code-development'],
    status: 'active',
  },
  {
    id: 'KW-PL-004',
    title: '质量门禁标准',
    category: 'specification',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '单元测试覆盖率 ≥ 80%、SonarQube 0 Critical/Blocker、安全扫描 0 CVE、Pact 契约 100% 通过。',
    tags: ['质量', '门禁', 'SonarQube', 'Pact'],
    updatedAt: '2026-03-08',
    owner: '平台工程团队',
    applicableScenes: ['code-development', 'technical-design'],
    status: 'active',
  },
  {
    id: 'KW-PL-005',
    title: '苍穹平台 API 扩展机制',
    category: 'architecture',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '苍穹平台插件机制和扩展点设计，支持业务方在不修改平台代码的情况下扩展功能。',
    tags: ['苍穹', '扩展', '插件'],
    updatedAt: '2026-03-15',
    owner: '苍穹架构组',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-PL-006',
    title: '监控告警配置规范',
    category: 'specification',
    level: 'platform',
    nodeId: 'cosmic',
    summary: 'Prometheus + Grafana 监控体系配置规范，告警规则模板，日志规范与链路追踪（ELK + Jaeger）。',
    tags: ['监控', '告警', 'Prometheus', 'Grafana'],
    updatedAt: '2026-03-20',
    owner: '平台工程团队',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-PL-007',
    title: '用户中心技术规范',
    category: 'specification',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '统一用户模型、多租户用户隔离、SSO 对接规范（OIDC/SAML）、用户数据同步策略。',
    tags: ['用户', '多租户', 'SSO', 'OIDC'],
    updatedAt: '2026-03-12',
    owner: '苍穹架构组',
    applicableScenes: ['technical-design'],
    status: 'active',
  },
  {
    id: 'KW-PL-008',
    title: '权限模型与 RBAC 规范',
    category: 'architecture',
    level: 'platform',
    nodeId: 'cosmic',
    summary: '基于 RBAC 的统一权限模型，角色/资源/操作三元组设计，数据权限隔离方案，权限继承与委派机制。',
    tags: ['权限', 'RBAC', '数据权限'],
    updatedAt: '2026-03-14',
    owner: '苍穹架构组',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },

  // ---- 产品线级知识（星空 — 中型企业业务）----
  {
    id: 'KW-PD-001',
    title: '星空财务 v8.0 版本路线图',
    category: 'specification',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: 'v8.0 核心规划：AI 智能财务分析模块、供应链韧性升级、多币种全面支持。中长期 3 年路线图。',
    tags: ['路线图', 'v8.0', '产品规划'],
    updatedAt: '2026-03-15',
    owner: '张产品总监',
    applicableScenes: ['product-planning'],
    status: 'active',
  },
  {
    id: 'KW-PD-002',
    title: '财务领域竞品对标分析',
    category: 'specification',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: '用友 YonSuite、SAP S/4HANA、浪潮 GS Cloud 竞品分析，功能对比、市场份额、优劣势评估。',
    tags: ['竞品', '用友', 'SAP', '市场分析'],
    updatedAt: '2026-03-20',
    owner: '张产品总监',
    applicableScenes: ['product-planning'],
    status: 'active',
  },
  {
    id: 'KW-PD-003',
    title: '跨域事件契约（shared-events.yaml）',
    category: 'architecture',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: '星空产品线统一事件定义：VoucherPosted、PeriodClosed、TaxCalc 等跨应用事件的规格和消费方约定。',
    tags: ['事件', '契约', '跨域'],
    updatedAt: '2026-03-25',
    owner: '王架构',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-PD-004',
    title: '财务核心实体数据模型',
    category: 'architecture',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: '凭证、科目、账期、币种等核心实体模型定义，跨域数据映射关系，主数据管理规范。',
    tags: ['数据模型', '实体', '主数据'],
    updatedAt: '2026-03-18',
    owner: '王架构',
    applicableScenes: ['technical-design', 'requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-PD-005',
    title: '标杆客户案例集',
    category: 'scenario',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: '华为、比亚迪、顺丰、瑞幸、宁德时代等标杆客户的财务系统落地案例，含痛点、方案、成效。',
    tags: ['客户案例', '华为', '比亚迪', '顺丰'],
    updatedAt: '2026-04-05',
    owner: '张产品总监',
    applicableScenes: ['product-planning'],
    status: 'active',
  },
  {
    id: 'KW-PD-006',
    title: '星空产品常见问题（FAQ）',
    category: 'process',
    level: 'product-line',
    nodeId: 'galaxy',
    summary: '客户高频问题与标准回答，涵盖凭证管理、报表、多币种、期末结转等模块。',
    tags: ['FAQ', '常见问题'],
    updatedAt: '2026-04-02',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },

  // ---- 领域级知识（星空 > 财务领域）----
  {
    id: 'KW-DM-001',
    title: '总账领域词汇表',
    category: 'glossary',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '凭证（Voucher）、科目（Account）、账期（Period）、借贷平衡（Debit-Credit Balance）等核心术语定义。',
    tags: ['词汇表', '凭证', '科目', '账期'],
    updatedAt: '2026-04-01',
    owner: '张PM',
    applicableScenes: ['requirement-design', 'technical-design'],
    status: 'active',
  },
  {
    id: 'KW-DM-002',
    title: '凭证录入流程规范',
    category: 'process',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '标准凭证录入流程：创建 → 填写 → 校验借贷平衡 → 提交 → 审核 → 记账，含异常处理路径。',
    tags: ['凭证', '流程', '录入'],
    updatedAt: '2026-03-15',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-DM-003',
    title: '期末结转流程规范',
    category: 'process',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '期末结转完整流程：损益科目归集 → 结转凭证生成 → 预览确认 → 执行结转 → 账期关闭。',
    tags: ['期末', '结转', '流程'],
    updatedAt: '2026-03-20',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-DM-004',
    title: '总账领域服务架构',
    category: 'architecture',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '总账领域微服务架构图，包含 VoucherService、PeriodService、ReportService 等核心服务及其交互关系。',
    tags: ['架构', '微服务', '总账'],
    updatedAt: '2026-03-20',
    owner: '王架构',
    applicableScenes: ['technical-design'],
    status: 'active',
  },
  {
    id: 'KW-DM-005',
    title: '总账与应付/应收集成规范',
    category: 'specification',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '总账与应付、应收领域的集成接口规范，Pact 契约测试基线，数据同步策略。',
    tags: ['集成', 'Pact', '契约'],
    updatedAt: '2026-03-25',
    owner: '王架构',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-DM-006',
    title: '大数据量凭证处理最佳实践',
    category: 'process',
    level: 'domain',
    nodeId: 'galaxy-finance',
    summary: '万级凭证批量处理的性能优化经验：分批提交、异步处理、Redis 进度追踪、数据库批量写入。',
    tags: ['性能', '批量处理', 'Redis'],
    updatedAt: '2026-04-05',
    owner: '张开发',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },

  // ---- 应用级知识（cosmic-gl）----
  {
    id: 'KW-AP-001',
    title: 'PRD-001 凭证批量导入功能说明',
    category: 'specification',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '支持 Excel 批量导入凭证，含借贷平衡校验、错误提示、进度追踪，单次最大 1000 条，响应 < 30s。',
    tags: ['PRD-001', '凭证', '批量导入'],
    updatedAt: '2026-03-15',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-AP-002',
    title: 'SDD-001 凭证批量导入架构设计',
    category: 'architecture',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '架构设计：FE → BatchImportAPI → VoucherBatchService → DB + VoucherPosted 事件，异步处理模式。',
    tags: ['SDD-001', '架构', '异步'],
    updatedAt: '2026-03-18',
    owner: '王架构',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-AP-003',
    title: 'CONTRACT-001 BatchImportAPI 接口契约',
    category: 'sdd-artifact',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: 'BatchImportAPI v1.0.0 接口规格：3 个接口、12 个行为规格、Pact 契约测试全部通过。',
    tags: ['CONTRACT-001', '接口', 'Pact'],
    updatedAt: '2026-03-20',
    owner: '王架构',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-AP-004',
    title: '场景：财务操作员批量导入凭证',
    category: 'scenario',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '用户从 Excel 上传凭证 → 系统预览校验 → 确认导入 → 实时进度条 → 导入完成/错误报告。',
    tags: ['场景', '批量导入', '操作员'],
    updatedAt: '2026-03-15',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-AP-005',
    title: 'PLAN-001 凭证批量导入迭代计划',
    category: 'sdd-artifact',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '9 个 TASK 拆解：API 骨架、核心逻辑、Excel 解析、进度追踪、前端页面、错误处理、契约测试等。',
    tags: ['PLAN-001', '迭代', 'TASK'],
    updatedAt: '2026-03-22',
    owner: '王架构',
    applicableScenes: ['technical-design', 'code-development'],
    status: 'active',
  },
  {
    id: 'KW-AP-006',
    title: 'ADR-004 凭证批量导入采用异步模式',
    category: 'architecture',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '架构决策：凭证批量导入采用异步模式（而非同步），原因是大数据量处理需避免 HTTP 超时。',
    tags: ['ADR', '异步', '架构决策'],
    updatedAt: '2026-03-15',
    owner: '王架构',
    applicableScenes: ['technical-design'],
    status: 'active',
  },
  {
    id: 'KW-AP-007',
    title: 'PRD-002 账期汇总报表功能说明',
    category: 'specification',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '按会计期间维度汇总报表，支持多级科目汇总、同比环比分析、Excel 导出。',
    tags: ['PRD-002', '报表', '账期'],
    updatedAt: '2026-03-10',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
  {
    id: 'KW-AP-008',
    title: 'cosmic-gl Runbook（运维手册）',
    category: 'process',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '总账应用部署手册、监控告警配置、常见故障处理流程、紧急联系人列表。',
    tags: ['Runbook', '运维', '部署'],
    updatedAt: '2026-04-01',
    owner: '陈SRE',
    applicableScenes: ['code-development'],
    status: 'active',
  },
  {
    id: 'KW-AP-009',
    title: '场景：审计人员追溯凭证来源',
    category: 'scenario',
    level: 'application',
    nodeId: 'app-cosmic-gl',
    summary: '审计人员选择凭证 → 查看凭证详情 → 追溯导入批次 → 查看原始 Excel → 确认操作员和时间。',
    tags: ['场景', '审计', '追溯'],
    updatedAt: '2026-03-28',
    owner: '张PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },

  // ---- 应用级知识（cosmic-ap）----
  {
    id: 'KW-AP-101',
    title: '应付模块功能概述',
    category: 'specification',
    level: 'application',
    nodeId: 'app-cosmic-ap',
    summary: '应付模块核心功能：发票管理、付款管理、应付对账、账龄分析，支持与总账自动联动。',
    tags: ['应付', '发票', '付款'],
    updatedAt: '2026-03-20',
    owner: '李PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },

  // ---- 应用级知识（cosmic-ar）----
  {
    id: 'KW-AP-201',
    title: '应收模块功能概述',
    category: 'specification',
    level: 'application',
    nodeId: 'app-cosmic-ar',
    summary: '应收模块核心功能：收款管理、应收对账、账龄分析、坏账计提，支持与总账自动联动。',
    tags: ['应收', '收款', '对账'],
    updatedAt: '2026-03-22',
    owner: '李PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },

  // ---- 应用级知识（cosmic-tax）----
  {
    id: 'KW-AP-301',
    title: '税务模块功能概述',
    category: 'specification',
    level: 'application',
    nodeId: 'app-cosmic-tax',
    summary: '税务模块核心功能：税务计算、纳税申报、税务合规校验、发票管理，支持多税种和跨区域税务。',
    tags: ['税务', '申报', '合规'],
    updatedAt: '2026-03-25',
    owner: '王PM',
    applicableScenes: ['requirement-design'],
    status: 'active',
  },
];

// 辅助函数：根据节点 key 收集该节点及其子节点的所有知识条目
export function getNodeKeys(node: KnowledgeTreeNode): string[] {
  const keys = [node.key];
  if (node.children) {
    node.children.forEach((child) => {
      keys.push(...getNodeKeys(child));
    });
  }
  return keys;
}

export function findNodeByKey(nodes: KnowledgeTreeNode[], key: string): KnowledgeTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findNodeByKey(node.children, key);
      if (found) return found;
    }
  }
  return undefined;
}
