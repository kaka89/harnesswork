export interface SDD {
  id: string;
  title: string;
  prdId: string;
  owner: string;
  status: 'pending' | 'in-progress' | 'approved';
  aiScore: number;
  contractIds: string[];
  taskCount: number;
  taskDone: number;
  lastUpdate: string;
  codeSync: boolean;
  architecture: string;
  complexity: string;
}

export const sddList: SDD[] = [
  {
    id: 'SDD-001',
    title: '凭证批量导入',
    prdId: 'PRD-001',
    owner: '王架构',
    status: 'approved',
    aiScore: 8.2,
    contractIds: ['CONTRACT-001'],
    taskCount: 9,
    taskDone: 7,
    lastUpdate: '2天前',
    codeSync: true,
    architecture: `graph LR\n  FE[前端页面] --> API[BatchImportAPI]\n  API --> SVC[VoucherBatchService]\n  SVC --> DB[(数据库)]\n  SVC --> EVT[VoucherPosted事件]`,
    complexity: '中等',
  },
  {
    id: 'SDD-002',
    title: '账期汇总报表',
    prdId: 'PRD-002',
    owner: '王架构',
    status: 'approved',
    aiScore: 8.6,
    contractIds: ['CONTRACT-002'],
    taskCount: 6,
    taskDone: 6,
    lastUpdate: '5天前',
    codeSync: true,
    architecture: `graph LR\n  FE[报表页面] --> API[ReportAPI]\n  API --> SVC[PeriodSummaryService]\n  SVC --> DB[(数据库)]`,
    complexity: '简单',
  },
  {
    id: 'SDD-003',
    title: '多币种支持',
    prdId: 'PRD-003',
    owner: '李架构',
    status: 'in-progress',
    aiScore: 7.5,
    contractIds: [],
    taskCount: 0,
    taskDone: 0,
    lastUpdate: '1天前',
    codeSync: false,
    architecture: `graph LR\n  FE[凭证录入] --> API[VoucherAPI]\n  API --> RATE[ExchangeRateService]\n  API --> SVC[VoucherService]\n  RATE --> EXT[外部汇率API]`,
    complexity: '复杂',
  },
];
