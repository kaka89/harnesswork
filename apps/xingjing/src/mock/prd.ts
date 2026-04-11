export interface PRD {
  id: string;
  title: string;
  owner: string;
  status: 'draft' | 'reviewing' | 'approved';
  aiScore: number;
  reviewComments: number;
  createdAt: string;
  sddStatus?: string;
  devProgress?: string;
  description?: string;
  userStories: { id: string; content: string; acceptanceCriteria: string[] }[];
  nfr?: string;
  impactApps?: string[];
}

export const prdList: PRD[] = [
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
      { id: 'US-001', content: '作为财务操作员，我希望能上传Excel文件批量导入凭证', acceptanceCriteria: ['系统应支持.xlsx格式', '单次最大支持1000条', '导入前需预览确认'] },
      { id: 'US-002', content: '作为财务操作员，我希望系统自动校验借贷平衡', acceptanceCriteria: ['不平衡时阻止提交', '高亮错误行', '提供差额提示'] },
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
      { id: 'US-003', content: '作为财务经理，我希望按账期查看科目余额汇总', acceptanceCriteria: ['支持按月/季/年维度', '支持导出Excel'] },
    ],
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
      { id: 'US-004', content: '作为财务操作员，我希望录入凭证时选择外币', acceptanceCriteria: ['支持主流货币', '自动拉取实时汇率'] },
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
      { id: 'US-005', content: '作为财务经理，我希望期末一键结转损益', acceptanceCriteria: ['自动生成结转凭证', '支持结转预览'] },
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
      { id: 'US-006', content: '作为财务操作员，我希望保存常用凭证为模板', acceptanceCriteria: ['支持模板命名', '支持分类管理', '支持模板分享'] },
      { id: 'US-007', content: '作为财务操作员，我希望从模板快速创建凭证', acceptanceCriteria: ['一键填充', '支持修改后提交'] },
    ],
    impactApps: ['cosmic-gl'],
  },
  {
    id: 'PRD-006',
    title: '科目辅助核算',
    owner: '李PM',
    status: 'draft',
    aiScore: 0,
    reviewComments: 0,
    createdAt: '2026-04-09',
    description: '支持科目下设辅助核算维度（如：部门、客户、项目），实现精细化核算管理。',
    userStories: [],
    impactApps: ['cosmic-gl', 'cosmic-ap'],
  },
];
