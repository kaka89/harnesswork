export interface QualityGate {
  name: string;
  value: string;
  target: string;
  status: 'passed' | 'failed' | 'warning';
  icon: string;
}

export const qualityGates: QualityGate[] = [
  { name: '测试覆盖率', value: '84%', target: '80%', status: 'passed', icon: 'check' },
  { name: 'SonarQube', value: '0 Critical / 0 Blocker', target: '0', status: 'passed', icon: 'check' },
  { name: 'Pact 契约', value: '12/12 通过', target: '100%', status: 'passed', icon: 'check' },
  { name: '安全扫描', value: '0 CVE', target: '0', status: 'passed', icon: 'check' },
];

export const coverageTrend = [
  { date: '3/20', value: 72 },
  { date: '3/25', value: 74 },
  { date: '4/1', value: 76 },
  { date: '4/3', value: 78 },
  { date: '4/7', value: 80 },
  { date: '4/10', value: 82 },
  { date: '4/14', value: 83 },
  { date: '4/21', value: 85 },
  { date: '4/28', value: 84 },
];

export const aiReviewStats = {
  totalPRs: 7,
  avgScore: 7.8,
  commonIssues: [
    { issue: '异常处理不完整', count: 3, suggestion: '建议安排培训' },
    { issue: '缺少 Javadoc', count: 2, suggestion: '建议加入 pre-commit hook 检查' },
    { issue: '企业数据隔离缺失', count: 1, suggestion: '高风险，已阻断' },
  ],
};
