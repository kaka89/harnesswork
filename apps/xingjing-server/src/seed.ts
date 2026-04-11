import { db, createProduct, getAllProducts, createPRD, createTask, createBacklogItem, createSprint, createKnowledgeDoc, createDoraMetrics } from "./db";
import { type Product, type PRD, type Task, type BacklogItem, type Sprint, type KnowledgeDoc, type DoraMetrics } from "./types";

const seedProducts: Product[] = [
  {
    id: 'PROJ-001',
    name: '苍穹财务',
    description: '企业财务管理系统',
    type: 'enterprise',
    mode: 'team',
    techStack: 'Java/Spring Boot/Vue3',
    createdAt: '2026-02-01',
  },
  {
    id: 'PROJ-002',
    name: '苍穹供应链',
    description: '供应链协同管理平台',
    type: 'enterprise',
    mode: 'team',
    techStack: 'Java/Kafka/React',
    createdAt: '2026-02-05',
  },
];

const seedPRDs: PRD[] = [
  {
    id: 'PRD-001',
    title: '凭证批量导入',
    owner: '张PM',
    status: 'approved',
    aiScore: 8.5,
    reviewComments: 0,
    createdAt: '2026-03-15',
    sddStatus: '已完成',
    devProgress: '7/9',
    description: '支持用户通过Excel批量导入凭证数据，减少手动录入工作量，提升财务处理效率。',
    userStories: [
      {
        id: 'US-001',
        content: '作为财务操作员，我希望能上传Excel文件批量导入凭证',
        acceptanceCriteria: ['系统应支持.xlsx格式', '单次最大支持1000条', '导入前需预览确认'],
      },
      {
        id: 'US-002',
        content: '作为财务操作员，我希望系统自动校验借贷平衡',
        acceptanceCriteria: ['不平衡时阻止提交', '高亮错误行', '提供差额提示'],
      },
    ],
    nfr: '单次批量导入1000条凭证 < 30s；并发用户≤50时响应时间 < 2s',
    impactApps: ['cosmic-gl', 'cosmic-ap'],
  },
  {
    id: 'PRD-002',
    title: '账期汇总报表',
    owner: '张PM',
    status: 'approved',
    aiScore: 8.8,
    reviewComments: 0,
    createdAt: '2026-03-10',
    sddStatus: '已完成',
    devProgress: '100%',
    description: '提供按会计期间维度的汇总报表，支持多级科目汇总和对比分析。',
    userStories: [
      {
        id: 'US-003',
        content: '作为财务经理，我希望按账期查看科目余额汇总',
        acceptanceCriteria: ['支持按月/季/年维度', '支持导出Excel'],
      },
    ],
    nfr: '报表查询响应时间 < 5s',
    impactApps: ['cosmic-gl'],
  },
  {
    id: 'PRD-003',
    title: '多币种支持',
    owner: '李PM',
    status: 'reviewing',
    aiScore: 7.8,
    reviewComments: 2,
    createdAt: '2026-04-01',
    description: '支持多币种凭证录入和自动汇率转换，满足外贸企业需求。',
    userStories: [
      {
        id: 'US-004',
        content: '作为财务操作员，我希望录入凭证时选择外币',
        acceptanceCriteria: ['支持主流货币', '自动拉取实时汇率'],
      },
    ],
    impactApps: ['cosmic-gl', 'cosmic-ar', 'cosmic-ap'],
  },
  {
    id: 'PRD-004',
    title: '期末结转自动化',
    owner: '王PM',
    status: 'reviewing',
    aiScore: 8.2,
    reviewComments: 3,
    createdAt: '2026-04-03',
    description: '实现期末损益结转自动化，减少手动操作和人为错误。',
    userStories: [
      {
        id: 'US-005',
        content: '作为财务经理，我希望期末一键结转损益',
        acceptanceCriteria: ['自动生成结转凭证', '支持结转预览'],
      },
    ],
    impactApps: ['cosmic-gl'],
  },
  {
    id: 'PRD-005',
    title: '凭证模板管理',
    owner: '张PM',
    status: 'draft',
    aiScore: 7.2,
    reviewComments: 0,
    createdAt: '2026-04-08',
    description: '用户目前每次录入凭证时需要手动填写科目、摘要等信息，希望能保存常用凭证配置为模板，提升录入效率。',
    userStories: [
      {
        id: 'US-006',
        content: '作为财务操作员，我希望保存常用凭证为模板',
        acceptanceCriteria: ['支持模板命名', '支持分类管理', '支持模板分享'],
      },
      {
        id: 'US-007',
        content: '作为财务操作员，我希望从模板快速创建凭证',
        acceptanceCriteria: ['一键填充', '支持修改后提交'],
      },
    ],
    impactApps: ['cosmic-gl'],
  },
];

const seedTasks: Task[] = [
  {
    id: 'TASK-001-01',
    title: 'API 骨架搭建',
    sddId: 'SDD-001',
    assignee: '张开发',
    status: 'done',
    estimate: 1.0,
    actual: 0.8,
    branch: 'feature/TASK-001-01-api-skeleton',
    ciStatus: 'passed',
    coverage: 92,
    dod: [
      { label: '功能实现', done: true },
      { label: '单测覆盖≥90%', done: true },
      { label: 'SDD 同步更新', done: true },
    ],
    priority: 'P0',
  },
  {
    id: 'TASK-001-02',
    title: 'VoucherBatchService 核心逻辑',
    sddId: 'SDD-001',
    assignee: '张开发',
    status: 'in-dev',
    estimate: 2.5,
    actual: 3.2,
    branch: 'feature/TASK-001-02-voucher-batch-service',
    ciStatus: 'running',
    coverage: 84,
    dod: [
      { label: '功能实现', done: true },
      { label: '单测覆盖≥90%', done: true },
      { label: '无Critical', done: true },
      { label: '借贷平衡', done: true },
      { label: '账期校验', done: true },
      { label: '错误收集', done: true },
      { label: 'SDD 同步更新', done: false },
      { label: 'PR Checklist 自查', done: false },
    ],
    priority: 'P0',
  },
  {
    id: 'TASK-001-03',
    title: 'Excel 解析工具',
    sddId: 'SDD-001',
    assignee: '李开发',
    status: 'done',
    estimate: 1.5,
    actual: 1.2,
    branch: 'feature/TASK-001-03-excel-parser',
    ciStatus: 'passed',
    coverage: 95,
    dod: [
      { label: '功能实现', done: true },
      { label: '单测覆盖≥90%', done: true },
      { label: 'SDD 同步更新', done: true },
    ],
    priority: 'P0',
  },
  {
    id: 'TASK-001-04',
    title: '进度追踪（Redis）',
    sddId: 'SDD-001',
    assignee: '',
    status: 'todo',
    estimate: 1.0,
    dod: [
      { label: '功能实现', done: false },
      { label: '单测覆盖≥90%', done: false },
    ],
    dependencies: ['TASK-001-02'],
    priority: 'P1',
  },
  {
    id: 'TASK-001-05',
    title: '前端页面',
    sddId: 'SDD-001',
    assignee: '李前端',
    status: 'in-dev',
    estimate: 2.0,
    actual: 1.5,
    branch: 'feature/TASK-001-05-frontend',
    ciStatus: 'passed',
    coverage: 78,
    dod: [
      { label: '页面实现', done: true },
      { label: '交互完善', done: true },
      { label: '响应式适配', done: false },
    ],
    priority: 'P0',
  },
  {
    id: 'TASK-001-06',
    title: '错误处理与重试',
    sddId: 'SDD-001',
    assignee: '张开发',
    status: 'todo',
    estimate: 1.5,
    dod: [
      { label: '功能实现', done: false },
      { label: '单测覆盖≥90%', done: false },
    ],
    priority: 'P1',
  },
];

const seedBacklogItems: BacklogItem[] = [
  {
    id: 'BL-001',
    title: 'SDD文档更新',
    description: '更新SDD文档以反映最新的架构设计',
    priority: 'P0',
    storyPoints: 1.0,
    epic: 'documentation',
    tags: ['docs', 'sdd'],
    status: 'todo',
  },
  {
    id: 'BL-002',
    title: '多币种-汇率服务',
    description: '实现外汇汇率实时查询和转换服务',
    priority: 'P1',
    storyPoints: 2.0,
    epic: 'multi-currency',
    tags: ['feature', 'backend'],
    status: 'todo',
  },
  {
    id: 'BL-003',
    title: '多币种-前端选择器',
    description: '开发多币种选择器UI组件',
    priority: 'P1',
    storyPoints: 1.5,
    epic: 'multi-currency',
    tags: ['feature', 'frontend'],
    status: 'todo',
  },
  {
    id: 'BL-004',
    title: '期末结转-规则引擎',
    description: '实现期末结转业务规则引擎',
    priority: 'P1',
    storyPoints: 3.0,
    epic: 'period-end-close',
    tags: ['feature', 'backend'],
    status: 'todo',
  },
];

const seedSprints: Sprint[] = [
  {
    id: 'SPRINT-2026-04',
    name: 'Sprint 2026-04',
    goal: '完成凭证批量导入核心功能',
    startDate: '2026-04-06',
    endDate: '2026-04-16',
    status: 'active',
    velocity: 29,
  },
];

const seedKnowledgeDocs: KnowledgeDoc[] = [
  {
    id: 'DOC-001',
    title: '苍穹财务系统架构设计',
    content: '本文档描述了苍穹财务系统的整体架构设计，包括核心模块、数据流和集成点。\n\n## 核心模块\n- 凭证管理\n- 账期管理\n- 报表生成\n- 审批流程\n\n## 技术栈\nJava 17, Spring Boot 3, PostgreSQL, Redis',
    category: '系统设计',
    tags: ['架构', '财务', '设计'],
    author: '王架构',
    createdAt: '2026-03-01',
    updatedAt: '2026-04-08',
  },
  {
    id: 'DOC-002',
    title: '凭证批量导入功能设计文档',
    content: '本文档详细说明了凭证批量导入功能的设计和实现方案。\n\n## 功能需求\n- 支持 Excel 格式导入\n- 自动验证借贷平衡\n- 批量处理能力\n\n## 接口设计\nPOST /api/vouchers/batch-import',
    category: '功能设计',
    tags: ['凭证', 'API', '设计'],
    author: '张PM',
    createdAt: '2026-03-15',
    updatedAt: '2026-04-05',
  },
  {
    id: 'DOC-003',
    title: '工程效能度量指南',
    content: '本文档介绍了苍穹平台的 DORA 指标度量方法和最佳实践。\n\n## DORA 指标\n- 部署频率\n- 变更前置时间\n- 变更失败率\n- MTTR\n\n## 目标\n达到精英级别性能',
    category: '工程效能',
    tags: ['DORA', '效能', '度量'],
    author: '李效能',
    createdAt: '2026-02-20',
    updatedAt: '2026-04-10',
  },
];

const seedDoraMetrics: (DoraMetrics & { id: string; createdAt: string })[] = [
  {
    id: 'DORA-2026-04',
    period: '2026-04',
    deployFrequency: '14次/周',
    changeLeadTime: '3.2天',
    changeFailureRate: '4.2%',
    mttr: '3.2h',
    createdAt: '2026-04-11',
  },
  {
    id: 'DORA-2026-03',
    period: '2026-03',
    deployFrequency: '10次/周',
    changeLeadTime: '7天',
    changeFailureRate: '6.2%',
    mttr: '5.2h',
    createdAt: '2026-03-31',
  },
  {
    id: 'DORA-2026-02',
    period: '2026-02',
    deployFrequency: '6次/周',
    changeLeadTime: '12天',
    changeFailureRate: '10.2%',
    mttr: '8h',
    createdAt: '2026-02-28',
  },
];

export function seedIfEmpty(): void {
  const existingProducts = getAllProducts();

  if (existingProducts.length === 0) {
    console.log('Seeding database with initial data...');

    seedProducts.forEach(createProduct);
    seedPRDs.forEach(createPRD);
    seedTasks.forEach(createTask);
    seedBacklogItems.forEach(createBacklogItem);
    seedSprints.forEach(createSprint);
    seedKnowledgeDocs.forEach(createKnowledgeDoc);
    seedDoraMetrics.forEach(createDoraMetrics);

    console.log('Database seeded successfully!');
  }
}
