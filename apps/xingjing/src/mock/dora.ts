export interface DORAMetric {
  name: string;
  value: string;
  level: string;
  trend: 'up' | 'down' | 'stable';
  trendText: string;
  target: string;
}

export const doraMetrics: DORAMetric[] = [
  { name: '部署频率', value: '14次/周', level: '精英→高效', trend: 'up', trendText: 'vs 上月+40%', target: '≥10次/周' },
  { name: '变更前置时间', value: '3.2天', level: '高效级', trend: 'down', trendText: 'vs 上月-55%', target: '≤7天' },
  { name: '变更失败率', value: '4.2%', level: '达标', trend: 'stable', trendText: '持平', target: '≤5%' },
  { name: 'MTTR', value: '3.2h', level: '达标', trend: 'down', trendText: 'vs 上月-60%', target: '≤4h' },
];

export interface DomainPerformance {
  domain: string;
  deployFreq: string;
  leadTime: string;
  failRate: string;
  coverage: string;
  adoptionRate: string;
  adoptionStatus: 'ok' | 'progress' | 'warning';
}

export const domainPerformance: DomainPerformance[] = [
  { domain: '财务云', deployFreq: '14次/周', leadTime: '3.2天', failRate: '4%', coverage: '84%', adoptionRate: '100%', adoptionStatus: 'ok' },
  { domain: '供应链', deployFreq: '6次/周', leadTime: '5.1天', failRate: '6%', coverage: '79%', adoptionRate: '80%', adoptionStatus: 'progress' },
  { domain: '人力云', deployFreq: '2次/周', leadTime: '12.3天', failRate: '15%', coverage: '62%', adoptionRate: '40%', adoptionStatus: 'warning' },
  { domain: '制造云', deployFreq: '8次/周', leadTime: '4.5天', failRate: '5%', coverage: '81%', adoptionRate: '70%', adoptionStatus: 'progress' },
];

export const okrTargets = [
  {
    objective: '苍穹所有领域接入率 ≥ 90%',
    current: 72.5,
    target: 90,
    predictedDate: '2026-05-20',
    deadline: 'Week 12',
  },
  {
    objective: 'DORA 整体达高效级',
    current: 75,
    target: 100,
    detail: '3/4 领域达高效级，人力云需额外3-4周',
    predictedDate: '2026-06-01',
    deadline: 'Week 16',
  },
];

export const doraTrend = [
  { month: '1月', deployFreq: 4, leadTime: 12, failRate: 12, mttr: 12 },
  { month: '2月', deployFreq: 6, leadTime: 9, failRate: 10, mttr: 8 },
  { month: '3月', deployFreq: 10, leadTime: 7, failRate: 6, mttr: 5 },
  { month: '4月', deployFreq: 14, leadTime: 3.2, failRate: 4.2, mttr: 3.2 },
];
