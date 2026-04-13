export interface Task {
  id: string;
  title: string;
  sddId: string;
  assignee: string;
  status: 'todo' | 'in-dev' | 'in-review' | 'done';
  estimate: number;
  actual?: number;
  branch?: string;
  ciStatus?: 'running' | 'passed' | 'failed' | 'pending';
  coverage?: number;
  dod: { label: string; done: boolean }[];
  dependencies?: string[];
  priority: 'P0' | 'P1' | 'P2';
}

export const taskList: Task[] = [
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
  {
    id: 'TASK-001-07',
    title: 'Pact 契约测试',
    sddId: 'SDD-001',
    assignee: '王测试',
    status: 'todo',
    estimate: 1.0,
    dod: [
      { label: 'Pact 测试编写', done: false },
      { label: '契约验证通过', done: false },
    ],
    dependencies: ['TASK-001-02'],
    priority: 'P1',
  },
  {
    id: 'TASK-001-08',
    title: '集成测试',
    sddId: 'SDD-001',
    assignee: '王测试',
    status: 'todo',
    estimate: 1.5,
    dod: [
      { label: '集成测试编写', done: false },
      { label: '全链路通过', done: false },
    ],
    dependencies: ['TASK-001-05'],
    priority: 'P1',
  },
  {
    id: 'TASK-001-09',
    title: 'SDD 文档更新',
    sddId: 'SDD-001',
    assignee: '王架构',
    status: 'todo',
    estimate: 1.0,
    dod: [
      { label: 'SDD 更新', done: false },
      { label: '评审通过', done: false },
    ],
    priority: 'P2',
  },
];
