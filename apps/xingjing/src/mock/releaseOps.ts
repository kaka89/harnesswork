// Enterprise Release & Ops mock data
// Scenario: 苍穹平台多环境发布、运行监控、告警分析、运维系统对接

// ─── Environments ────────────────────────────────────────────────────────────

export interface Environment {
  id: string;
  name: string;
  label: string;
  version: string;
  status: 'healthy' | 'degraded' | 'down';
  lastDeployedAt: string;
  lastDeployedBy: string;
  uptime: string;
  services: number;
  healthyServices: number;
  color: string;
}

export const environments: Environment[] = [
  {
    id: 'dev',
    name: 'dev',
    label: '开发环境',
    version: 'v1.4.0-dev.38',
    status: 'healthy',
    lastDeployedAt: '2026-04-11 14:32',
    lastDeployedBy: '张三',
    uptime: '2d 4h',
    services: 12,
    healthyServices: 12,
    color: '#1264e5',
  },
  {
    id: 'staging',
    name: 'staging',
    label: 'Staging 环境',
    version: 'v1.3.8-rc.2',
    status: 'degraded',
    lastDeployedAt: '2026-04-10 20:15',
    lastDeployedBy: '李四',
    uptime: '1d 18h',
    services: 12,
    healthyServices: 11,
    color: '#722ed1',
  },
  {
    id: 'prod',
    name: 'prod',
    label: '生产环境',
    version: 'v1.3.7',
    status: 'healthy',
    lastDeployedAt: '2026-04-08 10:00',
    lastDeployedBy: '王五',
    uptime: '3d 6h',
    services: 12,
    healthyServices: 12,
    color: '#52c41a',
  },
];

// ─── Pipeline Runs ────────────────────────────────────────────────────────────

export interface PipelineStage {
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  duration: string;
}

export interface PipelineRun {
  id: string;
  version: string;
  branch: string;
  targetEnv: string;
  triggeredBy: string;
  triggeredAt: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  duration: string;
  approvers: string[];
  stages: PipelineStage[];
  commitMsg: string;
}

export const pipelineRuns: PipelineRun[] = [
  {
    id: 'run-009',
    version: 'v1.4.0-dev.38',
    branch: 'feature/ai-search',
    targetEnv: 'dev',
    triggeredBy: '张三',
    triggeredAt: '2026-04-11 14:30',
    status: 'success',
    duration: '4m 12s',
    approvers: [],
    commitMsg: 'feat: 新增 AI 智能搜索功能',
    stages: [
      { name: '代码检查', status: 'success', duration: '38s' },
      { name: '单元测试', status: 'success', duration: '1m 12s' },
      { name: '构建镜像', status: 'success', duration: '1m 48s' },
      { name: '部署', status: 'success', duration: '34s' },
      { name: '健康检查', status: 'success', duration: '20s' },
    ],
  },
  {
    id: 'run-008',
    version: 'v1.3.8-rc.2',
    branch: 'release/1.3.8',
    targetEnv: 'staging',
    triggeredBy: '李四',
    triggeredAt: '2026-04-10 20:10',
    status: 'success',
    duration: '5m 47s',
    approvers: ['王五（SRE）', '赵六（Tech Lead）'],
    commitMsg: 'chore: release v1.3.8-rc.2',
    stages: [
      { name: '代码检查', status: 'success', duration: '42s' },
      { name: '单元测试', status: 'success', duration: '1m 28s' },
      { name: '构建镜像', status: 'success', duration: '2m 01s' },
      { name: '部署', status: 'success', duration: '56s' },
      { name: '健康检查', status: 'success', duration: '40s' },
    ],
  },
  {
    id: 'run-007',
    version: 'v1.3.8-rc.1',
    branch: 'release/1.3.8',
    targetEnv: 'staging',
    triggeredBy: '李四',
    triggeredAt: '2026-04-09 16:05',
    status: 'failed',
    duration: '2m 14s',
    approvers: ['王五（SRE）'],
    commitMsg: 'fix: 修复账期计算精度问题',
    stages: [
      { name: '代码检查', status: 'success', duration: '40s' },
      { name: '单元测试', status: 'failed', duration: '1m 10s' },
      { name: '构建镜像', status: 'pending', duration: '-' },
      { name: '部署', status: 'pending', duration: '-' },
      { name: '健康检查', status: 'pending', duration: '-' },
    ],
  },
  {
    id: 'run-006',
    version: 'v1.3.7',
    branch: 'main',
    targetEnv: 'prod',
    triggeredBy: '王五',
    triggeredAt: '2026-04-08 09:50',
    status: 'success',
    duration: '6m 33s',
    approvers: ['王五（SRE）', '赵六（Tech Lead）'],
    commitMsg: 'release: v1.3.7 正式发布',
    stages: [
      { name: '代码检查', status: 'success', duration: '45s' },
      { name: '单元测试', status: 'success', duration: '1m 34s' },
      { name: '构建镜像', status: 'success', duration: '2m 10s' },
      { name: '部署（灰度 20%）', status: 'success', duration: '48s' },
      { name: '部署（全量）', status: 'success', duration: '56s' },
      { name: '健康检查', status: 'success', duration: '20s' },
    ],
  },
];

// ─── System Metrics (24h time series) ────────────────────────────────────────

export interface MetricPoint {
  time: string;
  responseTime: number;  // ms
  errorRate: number;     // %
  cpu: number;           // %
  memory: number;        // %
}

const genMetrics = (): MetricPoint[] => {
  const points: MetricPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const hour = new Date();
    hour.setHours(hour.getHours() - i);
    const label = `${String(hour.getHours()).padStart(2, '0')}:00`;
    points.push({
      time: label,
      responseTime: 120 + Math.round(Math.sin(i * 0.4) * 30 + Math.random() * 20),
      errorRate: parseFloat((0.2 + Math.random() * 0.4 + (i === 14 ? 1.8 : 0)).toFixed(2)),
      cpu: Math.round(35 + Math.sin(i * 0.3) * 15 + Math.random() * 10),
      memory: Math.round(52 + Math.sin(i * 0.2) * 8 + Math.random() * 6),
    });
  }
  return points;
};

export const systemMetrics: MetricPoint[] = genMetrics();

// ─── Services Health ──────────────────────────────────────────────────────────

export interface ServiceHealth {
  id: string;
  name: string;
  type: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  errorRate: number;
  instances: number;
  version: string;
}

export const servicesHealth: ServiceHealth[] = [
  { id: 's1', name: '苍穹财务-账务服务', type: 'Java', status: 'healthy', responseTime: 98, errorRate: 0.12, instances: 4, version: 'v1.3.7' },
  { id: 's2', name: '苍穹财务-报表服务', type: 'Java', status: 'healthy', responseTime: 145, errorRate: 0.23, instances: 2, version: 'v1.3.7' },
  { id: 's3', name: '苍穹供应链-采购服务', type: 'Java', status: 'degraded', responseTime: 342, errorRate: 1.45, instances: 3, version: 'v1.3.6' },
  { id: 's4', name: '苍穹人力-薪酬服务', type: 'Java', status: 'healthy', responseTime: 112, errorRate: 0.08, instances: 2, version: 'v1.3.7' },
  { id: 's5', name: 'API 网关', type: 'Nginx', status: 'healthy', responseTime: 8, errorRate: 0.05, instances: 2, version: 'v1.22.1' },
  { id: 's6', name: '消息队列（RocketMQ）', type: 'MQ', status: 'healthy', responseTime: 12, errorRate: 0.0, instances: 3, version: 'v5.1.0' },
  { id: 's7', name: '配置中心', type: 'Go', status: 'healthy', responseTime: 22, errorRate: 0.0, instances: 2, version: 'v2.1.0' },
];

// ─── Alert Events ─────────────────────────────────────────────────────────────

export type AlertLevel = 'P0' | 'P1' | 'P2';
export type AlertStatus = 'firing' | 'acknowledged' | 'resolved';

export interface AlertEvent {
  id: string;
  level: AlertLevel;
  title: string;
  source: string;
  service: string;
  description: string;
  status: AlertStatus;
  firedAt: string;
  resolvedAt?: string;
  assignee?: string;
}

export const alertEvents: AlertEvent[] = [
  {
    id: 'a1',
    level: 'P1',
    title: '苍穹供应链-采购服务响应时间超阈值',
    source: 'Prometheus',
    service: '苍穹供应链-采购服务',
    description: 'P99 延迟超过 300ms 已持续 15 分钟，阈值为 200ms',
    status: 'firing',
    firedAt: '2026-04-11 13:45',
    assignee: '王五',
  },
  {
    id: 'a2',
    level: 'P2',
    title: '苍穹财务-报表服务错误率升高',
    source: 'SkyWalking',
    service: '苍穹财务-报表服务',
    description: '错误率从 0.2% 上升至 1.2%，疑似上游数据服务抖动',
    status: 'acknowledged',
    firedAt: '2026-04-11 11:20',
    assignee: '张三',
  },
  {
    id: 'a3',
    level: 'P0',
    title: '生产环境 v1.3.6 数据库连接池耗尽',
    source: 'Prometheus',
    service: 'MySQL 主库',
    description: '连接池使用率达 98%，已触发限流，影响全部财务模块',
    status: 'resolved',
    firedAt: '2026-04-09 02:14',
    resolvedAt: '2026-04-09 02:38',
    assignee: '王五',
  },
  {
    id: 'a4',
    level: 'P2',
    title: 'Staging 健康检查失败（v1.3.8-rc.1）',
    source: 'Jenkins',
    service: '苍穹供应链-采购服务',
    description: 'run-007 流水线健康检查未通过，单元测试失败 3 条',
    status: 'resolved',
    firedAt: '2026-04-09 16:07',
    resolvedAt: '2026-04-09 17:30',
    assignee: '李四',
  },
  {
    id: 'a5',
    level: 'P2',
    title: 'CPU 使用率异常峰值',
    source: 'Prometheus',
    service: 'API 网关',
    description: 'CPU 短暂达到 92%，持续约 3 分钟后恢复正常',
    status: 'resolved',
    firedAt: '2026-04-08 22:10',
    resolvedAt: '2026-04-08 22:13',
  },
];

// ─── Error Tracking ───────────────────────────────────────────────────────────

export interface ErrorTrace {
  id: string;
  type: string;
  message: string;
  count: number;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
  service: string;
  status: 'open' | 'ignored' | 'resolved';
}

export const errorTraces: ErrorTrace[] = [
  { id: 'e1', type: 'NullPointerException', message: 'Cannot invoke "String.trim()" on null in VoucherService.java:248', count: 127, affectedUsers: 23, firstSeen: '2026-04-09', lastSeen: '2026-04-11', service: '苍穹财务-账务服务', status: 'open' },
  { id: 'e2', type: 'TimeoutException', message: 'Query timeout after 5000ms in ReportQueryBuilder.java:512', count: 84, affectedUsers: 15, firstSeen: '2026-04-10', lastSeen: '2026-04-11', service: '苍穹财务-报表服务', status: 'open' },
  { id: 'e3', type: 'ConnectionException', message: 'Failed to acquire connection from pool after 3 retries', count: 56, affectedUsers: 0, firstSeen: '2026-04-09', lastSeen: '2026-04-09', service: 'MySQL 主库', status: 'resolved' },
  { id: 'e4', type: 'ValidationException', message: 'Purchase order amount exceeds approved limit: ¥2,400,000', count: 34, affectedUsers: 8, firstSeen: '2026-04-08', lastSeen: '2026-04-11', service: '苍穹供应链-采购服务', status: 'open' },
  { id: 'e5', type: 'SerializationException', message: 'Failed to deserialize MQ message: unexpected token at position 0', count: 12, affectedUsers: 0, firstSeen: '2026-04-11', lastSeen: '2026-04-11', service: '消息队列（RocketMQ）', status: 'open' },
];

// ─── Ops Integrations ─────────────────────────────────────────────────────────

export interface OpsIntegration {
  id: string;
  name: string;
  category: string;
  icon: string;
  connected: boolean;
  lastSyncAt?: string;
  endpoint?: string;
  description: string;
}

export const opsIntegrations: OpsIntegration[] = [
  { id: 'k8s', name: 'Kubernetes', category: '容器编排', icon: '⚙️', connected: true, lastSyncAt: '2026-04-11 14:00', endpoint: 'https://k8s.kingdee.internal:6443', description: '管理容器部署、扩缩容与滚动更新' },
  { id: 'jenkins', name: 'Jenkins', category: 'CI/CD', icon: '🔧', connected: true, lastSyncAt: '2026-04-11 14:32', endpoint: 'https://ci.kingdee.internal', description: '触发构建流水线、查看执行日志' },
  { id: 'prometheus', name: 'Prometheus', category: '监控', icon: '📊', connected: true, lastSyncAt: '2026-04-11 14:35', endpoint: 'https://prometheus.kingdee.internal:9090', description: '采集系统指标、触发告警规则' },
  { id: 'skywalking', name: 'SkyWalking', category: '链路追踪', icon: '🔍', connected: true, lastSyncAt: '2026-04-11 14:35', endpoint: 'https://skywalking.kingdee.internal:11800', description: '分布式链路追踪与服务拓扑分析' },
  { id: 'grafana', name: 'Grafana', category: '可视化', icon: '📈', connected: true, lastSyncAt: '2026-04-11 14:00', endpoint: 'https://grafana.kingdee.internal:3000', description: '自定义监控大盘与数据可视化' },
  { id: 'dingtalk', name: '钉钉告警', category: '通知', icon: '🔔', connected: true, lastSyncAt: '2026-04-11 13:45', description: '告警事件实时推送到钉钉群' },
  { id: 'harbor', name: 'Harbor', category: '镜像仓库', icon: '🐳', connected: true, lastSyncAt: '2026-04-11 14:30', endpoint: 'https://harbor.kingdee.internal', description: '容器镜像存储与安全扫描' },
  { id: 'elastic', name: 'Elasticsearch', category: '日志', icon: '🗄️', connected: false, description: '集中日志存储与全文检索（待接入）' },
];
