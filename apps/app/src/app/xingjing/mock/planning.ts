// 产品规划工坊 Mock 数据

export type PlanningStatus = 'research' | 'analyzing' | 'proposed' | 'approved' | 'rejected';
export type PlanningType = 'new-module' | 'feature-optimize' | 'new-product-line' | 'tech-upgrade';

export interface CompetitorAnalysis {
  id: string;
  competitor: string;
  product: string;
  strengths: string[];
  weaknesses: string[];
  marketShare: number;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: string;
}

export interface MarketInsight {
  id: string;
  title: string;
  category: 'trend' | 'regulation' | 'technology' | 'customer-demand';
  summary: string;
  impact: 'high' | 'medium' | 'low';
  source: string;
  date: string;
}

export interface CustomerVoice {
  id: string;
  customer: string;
  industry: string;
  size: 'large' | 'medium' | 'small';
  painPoints: string[];
  demands: string[];
  satisfaction: number;
  visits: number;
  lastContact: string;
}

export interface ProductPlan {
  id: string;
  title: string;
  type: PlanningType;
  status: PlanningStatus;
  owner: string;
  priority: 'P0' | 'P1' | 'P2';
  targetVersion: string;
  description: string;
  background: string;
  expectedROI: string;
  competitors: string[];
  customerVoices: string[];
  marketInsights: string[];
  aiScore: number;
  aiSuggestion: string;
  votes: { approve: number; reject: number; abstain: number };
  createdAt: string;
  decidedAt?: string;
  relatedPrds: string[];
}

// 竞品分析数据
export const competitorList: CompetitorAnalysis[] = [
  {
    id: 'COMP-001',
    competitor: '用友',
    product: 'YonSuite',
    strengths: ['中大型企业覆盖广', '品牌知名度高', '生态合作伙伴多'],
    weaknesses: ['系统较重', '定制化成本高', '云原生程度低'],
    marketShare: 28,
    trend: 'stable',
    lastUpdated: '2026-03-20',
  },
  {
    id: 'COMP-002',
    competitor: 'SAP',
    product: 'S/4HANA Cloud',
    strengths: ['全球化能力强', '行业最佳实践', '合规性好'],
    weaknesses: ['价格昂贵', '实施周期长', '本地化不足'],
    marketShare: 22,
    trend: 'down',
    lastUpdated: '2026-03-15',
  },
  {
    id: 'COMP-003',
    competitor: '浪潮',
    product: 'GS Cloud',
    strengths: ['政企市场强', '国产替代优势', '安全合规'],
    weaknesses: ['产品体验一般', '生态较封闭', '中小企业覆盖弱'],
    marketShare: 12,
    trend: 'up',
    lastUpdated: '2026-03-25',
  },
  {
    id: 'COMP-004',
    competitor: '泛微',
    product: 'e-cology',
    strengths: ['协同办公领先', 'OA领域深耕', '低代码能力强'],
    weaknesses: ['ERP能力弱', '财务模块薄弱', '行业深度不够'],
    marketShare: 8,
    trend: 'up',
    lastUpdated: '2026-04-01',
  },
];

// 市场洞察
export const marketInsights: MarketInsight[] = [
  {
    id: 'MKT-001',
    title: 'AI+财务成为企业数字化核心趋势',
    category: 'trend',
    summary: 'Gartner报告指出，到2027年60%的大型企业将采用AI辅助财务决策，智能财务分析和预测成为刚需。',
    impact: 'high',
    source: 'Gartner 2026 Q1 Report',
    date: '2026-03-10',
  },
  {
    id: 'MKT-002',
    title: '新会计准则IFRS 18即将生效',
    category: 'regulation',
    summary: 'IFRS 18《财务报表列报》将于2027年1月生效，要求重新分类损益表项目，影响所有财务软件。',
    impact: 'high',
    source: 'IASB 官方通告',
    date: '2026-02-28',
  },
  {
    id: 'MKT-003',
    title: '低代码平台市场增速30%+',
    category: 'technology',
    summary: 'IDC数据显示，中国低代码市场2025年规模达85亿，同比增长32%，企业对低代码扩展需求旺盛。',
    impact: 'medium',
    source: 'IDC China 2026',
    date: '2026-03-20',
  },
  {
    id: 'MKT-004',
    title: '中小企业SaaS订阅模式渗透率提升',
    category: 'customer-demand',
    summary: '调研显示65%的中小企业倾向SaaS订阅模式，月付/年付灵活定价是关键竞争力。',
    impact: 'medium',
    source: '艾瑞咨询 2026 Q1',
    date: '2026-03-15',
  },
  {
    id: 'MKT-005',
    title: '供应链韧性成为制造业首要诉求',
    category: 'customer-demand',
    summary: '受全球贸易环境影响，72%的制造业企业将供应链可视化和风险预警列为IT投资首要方向。',
    impact: 'high',
    source: '麦肯锡供应链调研',
    date: '2026-04-02',
  },
];

// 客户声音
export const customerVoices: CustomerVoice[] = [
  {
    id: 'CUS-001',
    customer: '华为技术有限公司',
    industry: '通信/ICT',
    size: 'large',
    painPoints: ['多币种核算效率低', '集团合并报表复杂', '与自研系统集成困难'],
    demands: ['AI智能对账', '多法人多币种自动合并', '开放API生态'],
    satisfaction: 7.5,
    visits: 12,
    lastContact: '2026-04-01',
  },
  {
    id: 'CUS-002',
    customer: '比亚迪股份',
    industry: '汽车制造',
    size: 'large',
    painPoints: ['供应链协同实时性差', '生产成本核算周期长', '质量追溯链路断裂'],
    demands: ['实时供应链看板', '自动成本归集', 'IoT数据对接'],
    satisfaction: 7.0,
    visits: 8,
    lastContact: '2026-03-28',
  },
  {
    id: 'CUS-003',
    customer: '顺丰控股',
    industry: '物流',
    size: 'large',
    painPoints: ['物流费用分摊复杂', '多维度利润分析缺失', '报表定制化需求多'],
    demands: ['智能费用分摊引擎', '自助报表平台', '实时利润仪表盘'],
    satisfaction: 8.0,
    visits: 6,
    lastContact: '2026-04-05',
  },
  {
    id: 'CUS-004',
    customer: '瑞幸咖啡',
    industry: '餐饮零售',
    size: 'medium',
    painPoints: ['门店扩张期财务核算量激增', '连锁门店对账耗时', '税务合规压力大'],
    demands: ['批量自动对账', '智能税务申报', '门店财务分析模板'],
    satisfaction: 7.8,
    visits: 4,
    lastContact: '2026-03-30',
  },
  {
    id: 'CUS-005',
    customer: '宁德时代',
    industry: '新能源',
    size: 'large',
    painPoints: ['研发投入资本化判定复杂', '专利相关资产管理弱', '多工厂成本对比困难'],
    demands: ['研发费用智能分类', '无形资产全生命周期管理', '多工厂成本对标分析'],
    satisfaction: 7.2,
    visits: 5,
    lastContact: '2026-04-03',
  },
];

// 产品规划决策
export const productPlans: ProductPlan[] = [
  {
    id: 'PLAN-001',
    title: 'AI 智能财务分析模块',
    type: 'new-module',
    status: 'approved',
    owner: '张产品总监',
    priority: 'P0',
    targetVersion: 'v8.0',
    description: '新建AI驱动的智能财务分析模块，提供预测性分析、异常检测、智能对账等能力。',
    background: '竞品用友/SAP均已布局AI+财务；客户华为、顺丰等明确提出AI对账、智能分析需求；市场趋势显示AI+财务是核心方向。',
    expectedROI: '预计带来 15% 新客户增长，30% 续约率提升',
    competitors: ['COMP-001', 'COMP-002'],
    customerVoices: ['CUS-001', 'CUS-003'],
    marketInsights: ['MKT-001'],
    aiScore: 9.2,
    aiSuggestion: '强烈建议：该规划与市场趋势高度吻合，竞品已布局，建议作为v8.0核心特性优先投入。',
    votes: { approve: 8, reject: 0, abstain: 1 },
    createdAt: '2026-03-01',
    decidedAt: '2026-03-15',
    relatedPrds: ['PRD-001', 'PRD-002'],
  },
  {
    id: 'PLAN-002',
    title: '供应链韧性升级',
    type: 'feature-optimize',
    status: 'approved',
    owner: '李产品总监',
    priority: 'P0',
    targetVersion: 'v8.0',
    description: '升级供应链模块，增加实时可视化看板、供应商风险预警、多源替代推荐等核心能力。',
    background: '制造业客户（比亚迪、宁德时代）普遍反馈供应链协同痛点；麦肯锡调研佐证；浪潮在该领域加大投入。',
    expectedROI: '制造业客户群续约率提升 25%，新签约 10+ 大型制造企业',
    competitors: ['COMP-003'],
    customerVoices: ['CUS-002', 'CUS-005'],
    marketInsights: ['MKT-005'],
    aiScore: 8.8,
    aiSuggestion: '建议优先：制造业客户痛点突出，且竞品浪潮正在追赶，需尽快建立优势壁垒。',
    votes: { approve: 7, reject: 1, abstain: 1 },
    createdAt: '2026-03-05',
    decidedAt: '2026-03-20',
    relatedPrds: [],
  },
  {
    id: 'PLAN-003',
    title: 'IFRS 18 新准则适配',
    type: 'feature-optimize',
    status: 'analyzing',
    owner: '张产品总监',
    priority: 'P1',
    targetVersion: 'v8.0',
    description: '适配IFRS 18新准则，重构损益表分类逻辑，新增经营/投资/融资三段式列报。',
    background: 'IFRS 18将于2027年1月强制生效，所有上市公司及采用IFRS的企业必须在2026年完成系统改造。',
    expectedROI: '合规性必备，避免客户流失；预计影响 200+ 上市公司客户',
    competitors: ['COMP-002'],
    customerVoices: [],
    marketInsights: ['MKT-002'],
    aiScore: 8.5,
    aiSuggestion: '合规必做项：建议在v8.0 SP1前完成，需提前与审计团队对齐准则细节。',
    votes: { approve: 0, reject: 0, abstain: 0 },
    createdAt: '2026-03-10',
    relatedPrds: [],
  },
  {
    id: 'PLAN-004',
    title: '苍穹小微企业版（新产品线）',
    type: 'new-product-line',
    status: 'proposed',
    owner: '王产品总监',
    priority: 'P1',
    targetVersion: 'v1.0',
    description: '面向中小微企业推出轻量级SaaS财务产品，按月订阅，简化版核心功能+AI记账助手。',
    background: '中小企业SaaS订阅渗透率快速提升；当前产品线主攻中大型企业，小微市场空白；泛微等竞品开始下沉。',
    expectedROI: '开辟新市场，预计年收入 5000万+，用户规模 10万+',
    competitors: ['COMP-004'],
    customerVoices: ['CUS-004'],
    marketInsights: ['MKT-004'],
    aiScore: 7.5,
    aiSuggestion: '有潜力但需谨慎：市场空间大，但需要独立团队运营，与现有产品线资源分配需平衡。建议先做MVP验证。',
    votes: { approve: 4, reject: 2, abstain: 3 },
    createdAt: '2026-03-20',
    relatedPrds: [],
  },
  {
    id: 'PLAN-005',
    title: '低代码扩展平台升级',
    type: 'tech-upgrade',
    status: 'research',
    owner: '陈架构师',
    priority: 'P2',
    targetVersion: 'v8.1',
    description: '升级苍穹平台低代码引擎，支持AI辅助生成页面、增强组件市场、优化运行时性能。',
    background: '低代码市场增速超30%，客户对自助扩展需求旺盛；当前低代码引擎在复杂场景下性能和易用性不足。',
    expectedROI: '客户自助开发率提升 40%，实施周期缩短 30%',
    competitors: ['COMP-004'],
    customerVoices: [],
    marketInsights: ['MKT-003'],
    aiScore: 7.0,
    aiSuggestion: '长期价值高：建议在v8.0完成后作为v8.1重点投入，可先启动技术预研。',
    votes: { approve: 0, reject: 0, abstain: 0 },
    createdAt: '2026-04-01',
    relatedPrds: [],
  },
];

// 市场份额趋势（季度）
export const marketShareTrend = [
  { quarter: '2025 Q1', kingdee: 30, yonyou: 29, sap: 23, inspur: 10 },
  { quarter: '2025 Q2', kingdee: 31, yonyou: 28, sap: 23, inspur: 11 },
  { quarter: '2025 Q3', kingdee: 32, yonyou: 28, sap: 22, inspur: 11 },
  { quarter: '2025 Q4', kingdee: 33, yonyou: 27, sap: 22, inspur: 12 },
  { quarter: '2026 Q1', kingdee: 34, yonyou: 28, sap: 21, inspur: 12 },
];
