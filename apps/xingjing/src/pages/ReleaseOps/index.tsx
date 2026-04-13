import React, { useState } from 'react';
import {
  Card, Row, Col, Tabs, Tag, Button, Typography, Table, Statistic,
  Space, Timeline, Badge, Select, Tooltip, Progress, message, Descriptions,
  Alert,
} from 'antd';
import {
  RocketOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
  CloudServerOutlined, AlertOutlined, ApiOutlined, WarningOutlined,
  SafetyCertificateOutlined, LinkOutlined, SettingOutlined, ReloadOutlined,
  EyeOutlined, UndoOutlined, ExclamationCircleOutlined, BugOutlined,
  DatabaseOutlined, SearchOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import {
  environments, pipelineRuns, systemMetrics, servicesHealth,
  alertEvents, errorTraces, opsIntegrations,
  Environment, PipelineRun, AlertEvent, ErrorTrace, OpsIntegration,
} from '../../mock/releaseOps';

const { Text, Title } = Typography;

// ─── helpers ─────────────────────────────────────────────────────────────────

const envStatusColor: Record<string, string> = { healthy: '#52c41a', degraded: '#faad14', down: '#ff4d4f' };
const envStatusLabel: Record<string, string> = { healthy: '健康', degraded: '降级', down: '宕机' };

const pipelineStatusColor: Record<string, string> = {
  success: 'success', failed: 'error', running: 'processing', pending: 'default',
};
const pipelineStatusLabel: Record<string, string> = {
  success: '成功', failed: '失败', running: '执行中', pending: '待执行',
};
const stageStatusIcon: Record<string, React.ReactNode> = {
  success: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  running: <SyncOutlined spin style={{ color: '#1264e5' }} />,
  pending: <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f0f0f0', border: '1px solid #d9d9d9', display: 'inline-block' }} />,
};

const alertLevelColor: Record<string, string> = { P0: 'red', P1: 'orange', P2: 'gold' };
const alertStatusColor: Record<string, string> = { firing: 'error', acknowledged: 'warning', resolved: 'success' };
const alertStatusLabel: Record<string, string> = { firing: '告警中', acknowledged: '已确认', resolved: '已解决' };

// ─── Tab1: Pipeline ───────────────────────────────────────────────────────────

const PipelineTab: React.FC = () => {
  const [targetEnv, setTargetEnv] = useState<string>('staging');
  const [branch, setBranch] = useState<string>('release/1.3.8');
  const [deploying, setDeploying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleDeploy = () => {
    if (targetEnv === 'prod') {
      message.warning('生产发布需 SRE + Tech Lead 双人审批，已向审批人发送钉钉通知');
      return;
    }
    setDeploying(true);
    setProgress(0);
    setDone(false);
    let p = 0;
    const timer = setInterval(() => {
      p += Math.random() * 15 + 6;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        setTimeout(() => {
          setDeploying(false);
          setDone(true);
          message.success(`🚀 已成功部署到 ${targetEnv === 'staging' ? 'Staging 环境' : '开发环境'}！`);
        }, 400);
      }
      setProgress(Math.min(Math.round(p), 100));
    }, 300);
  };

  const columns = [
    {
      title: '版本', dataIndex: 'version', key: 'version',
      render: (v: string, r: PipelineRun) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.branch}</Text></div>
        </div>
      ),
    },
    {
      title: '目标环境', dataIndex: 'targetEnv', key: 'targetEnv',
      render: (v: string) => {
        const colorMap: Record<string, string> = { dev: 'blue', staging: 'purple', prod: 'green' };
        const labelMap: Record<string, string> = { dev: '开发', staging: 'Staging', prod: '生产' };
        return <Tag color={colorMap[v]}>{labelMap[v]}</Tag>;
      },
    },
    { title: '触发人', dataIndex: 'triggeredBy', key: 'triggeredBy' },
    { title: '触发时间', dataIndex: 'triggeredAt', key: 'triggeredAt', render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={pipelineStatusColor[v]}>{pipelineStatusLabel[v]}</Tag>,
    },
    { title: '耗时', dataIndex: 'duration', key: 'duration' },
    {
      title: '阶段', dataIndex: 'stages', key: 'stages',
      render: (stages: PipelineRun['stages']) => (
        <Space size={4}>
          {stages.map((s, i) => (
            <Tooltip key={i} title={`${s.name} · ${s.duration}`}>
              <span style={{ cursor: 'default' }}>{stageStatusIcon[s.status]}</span>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: unknown, r: PipelineRun) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} type="text">日志</Button>
          {r.status === 'success' && r.targetEnv === 'prod' && (
            <Button size="small" icon={<UndoOutlined />} type="text" danger>回滚</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Environment cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {environments.map((env: Environment) => (
          <Col span={8} key={env.id}>
            <Card
              size="small"
              style={{
                borderLeft: `3px solid ${env.color}`,
                background: env.status === 'degraded' ? '#fffbe6' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Text strong style={{ fontSize: 14 }}>{env.label}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Badge color={envStatusColor[env.status]} text={envStatusLabel[env.status]} />
                    <Tag color={env.color} style={{ fontSize: 11, padding: '0 6px' }}>{env.version}</Tag>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
                    <span>健康服务 {env.healthyServices}/{env.services}</span>
                    <span style={{ marginLeft: 12 }}>运行 {env.uptime}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#8c8c8c' }}>
                  <div>最后部署</div>
                  <div>{env.lastDeployedAt}</div>
                  <div>{env.lastDeployedBy}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Deploy panel */}
      <Card
        title={<span><RocketOutlined style={{ marginRight: 6 }} />发起部署</span>}
        style={{ marginBottom: 16 }}
      >
        <Alert
          message="生产环境发布需要 SRE + Tech Lead 双人审批，审批通过后自动触发流水线。"
          type="info"
          showIcon
          style={{ marginBottom: 14, fontSize: 12 }}
        />
        <Row gutter={16} align="middle">
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>目标环境</Text>
            <div style={{ marginTop: 4 }}>
              <Select value={targetEnv} onChange={setTargetEnv} style={{ width: 160 }}
                options={[
                  { value: 'dev', label: '🛠 开发环境' },
                  { value: 'staging', label: '🧪 Staging 环境' },
                  { value: 'prod', label: '🚀 生产环境（需审批）' },
                ]}
              />
            </div>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>分支</Text>
            <div style={{ marginTop: 4 }}>
              <Select value={branch} onChange={setBranch} style={{ width: 200 }}
                options={[
                  { value: 'release/1.3.8', label: 'release/1.3.8' },
                  { value: 'main', label: 'main' },
                  { value: 'feature/ai-search', label: 'feature/ai-search' },
                ]}
              />
            </div>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>审批人（生产必填）</Text>
            <div style={{ marginTop: 4 }}>
              <Select
                mode="multiple"
                placeholder="选择审批人"
                style={{ width: 220 }}
                disabled={targetEnv !== 'prod'}
                options={[
                  { value: 'sre', label: '王五（SRE）' },
                  { value: 'lead', label: '赵六（Tech Lead）' },
                ]}
              />
            </div>
          </Col>
          <Col style={{ paddingTop: 20 }}>
            <Button
              type="primary"
              icon={deploying ? <SyncOutlined spin /> : <RocketOutlined />}
              loading={deploying}
              onClick={handleDeploy}
              style={{
                background: targetEnv === 'prod' ? '#faad14' : '#1264e5',
                borderColor: targetEnv === 'prod' ? '#faad14' : '#1264e5',
              }}
            >
              {targetEnv === 'prod' ? '发起审批' : '一键部署'}
            </Button>
          </Col>
        </Row>
        {(deploying || done) && (
          <div style={{ marginTop: 14 }}>
            <Progress percent={progress} status={deploying ? 'active' : 'success'}
              strokeColor={deploying ? '#1264e5' : '#52c41a'} />
          </div>
        )}
      </Card>

      {/* Pipeline history */}
      <Card title="流水线执行记录">
        <Table
          dataSource={pipelineRuns}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          expandable={{
            expandedRowRender: (r: PipelineRun) => (
              <div style={{ padding: '8px 0 8px 24px' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>提交信息：</Text>
                <Text style={{ fontSize: 12 }}>{r.commitMsg}</Text>
                {r.approvers.length > 0 && (
                  <span style={{ marginLeft: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>审批人：</Text>
                    {r.approvers.map((a) => <Tag key={a} style={{ fontSize: 11 }}>{a}</Tag>)}
                  </span>
                )}
              </div>
            ),
          }}
        />
      </Card>
    </div>
  );
};

// ─── Tab2: Monitoring ─────────────────────────────────────────────────────────

const MonitoringTab: React.FC = () => {
  const latest = systemMetrics[systemMetrics.length - 1];
  const avg = (key: keyof typeof latest) =>
    Math.round(systemMetrics.reduce((s, p) => s + (p[key] as number), 0) / systemMetrics.length);

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['响应时间 (ms)', '错误率 (%)'], bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: systemMetrics.map((p) => p.time), axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value' as const, name: 'ms', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 } },
      { type: 'value' as const, name: '%', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 }, max: 5 },
    ],
    series: [
      { name: '响应时间 (ms)', type: 'line', smooth: true, data: systemMetrics.map((p) => p.responseTime), itemStyle: { color: '#1264e5' }, areaStyle: { opacity: 0.08 } },
      { name: '错误率 (%)', type: 'line', smooth: true, yAxisIndex: 1, data: systemMetrics.map((p) => p.errorRate), itemStyle: { color: '#ff4d4f' }, areaStyle: { opacity: 0.08 } },
    ],
  };

  const cpuMemOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['CPU (%)', '内存 (%)'], bottom: 0 },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: systemMetrics.map((p) => p.time), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value' as const, max: 100, axisLabel: { fontSize: 11, formatter: '{value}%' } },
    series: [
      { name: 'CPU (%)', type: 'line', smooth: true, data: systemMetrics.map((p) => p.cpu), itemStyle: { color: '#722ed1' }, areaStyle: { opacity: 0.08 } },
      { name: '内存 (%)', type: 'line', smooth: true, data: systemMetrics.map((p) => p.memory), itemStyle: { color: '#faad14' }, areaStyle: { opacity: 0.08 } },
    ],
  };

  const serviceColumns = [
    { title: '服务名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
    { title: '类型', dataIndex: 'type', key: 'type', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Badge color={envStatusColor[v]} text={envStatusLabel[v]} />,
    },
    {
      title: '响应时间', dataIndex: 'responseTime', key: 'responseTime',
      render: (v: number) => (
        <Text style={{ color: v > 300 ? '#ff4d4f' : v > 200 ? '#faad14' : '#52c41a' }}>{v} ms</Text>
      ),
    },
    {
      title: '错误率', dataIndex: 'errorRate', key: 'errorRate',
      render: (v: number) => (
        <Text style={{ color: v > 1 ? '#ff4d4f' : v > 0.5 ? '#faad14' : '#52c41a' }}>{v}%</Text>
      ),
    },
    { title: '实例数', dataIndex: 'instances', key: 'instances', render: (v: number) => `${v} 个` },
    { title: '版本', dataIndex: 'version', key: 'version', render: (v: string) => <Tag color="blue">{v}</Tag> },
  ];

  return (
    <div>
      {/* Key metrics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { title: '系统可用性', value: '99.82', suffix: '%', color: '#52c41a' },
          { title: '平均响应时间', value: avg('responseTime'), suffix: 'ms', color: avg('responseTime') > 200 ? '#faad14' : '#1264e5' },
          { title: '平均错误率', value: (systemMetrics.reduce((s, p) => s + p.errorRate, 0) / systemMetrics.length).toFixed(2), suffix: '%', color: '#faad14' },
          { title: '平均 CPU', value: avg('cpu'), suffix: '%', color: '#722ed1' },
        ].map((m) => (
          <Col span={6} key={m.title}>
            <Card size="small">
              <Statistic title={m.title} value={m.value} suffix={m.suffix}
                valueStyle={{ color: m.color, fontSize: 24, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="近 24h 响应时间 & 错误率" size="small">
            <ReactECharts option={chartOption} style={{ height: 220 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="近 24h CPU & 内存" size="small">
            <ReactECharts option={cpuMemOption} style={{ height: 220 }} />
          </Card>
        </Col>
      </Row>

      <Card title="服务健康状态">
        <Table dataSource={servicesHealth} columns={serviceColumns} rowKey="id" size="small" pagination={false}
          rowClassName={(r) => r.status === 'degraded' ? 'ant-table-row-warning' : ''}
        />
      </Card>
    </div>
  );
};

// ─── Tab3: Issues ─────────────────────────────────────────────────────────────

const IssuesTab: React.FC = () => {
  const [alertList, setAlertList] = useState(alertEvents);

  const acknowledge = (id: string) => {
    setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, status: 'acknowledged' as const } : a));
    message.success('已确认告警，已通知相关人员处理');
  };
  const resolve = (id: string) => {
    setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolved' as const } : a));
    message.success('告警已标记为已解决');
  };

  const alertColumns = [
    {
      title: '级别', dataIndex: 'level', key: 'level',
      render: (v: string) => <Tag color={alertLevelColor[v]} style={{ fontWeight: 700 }}>{v}</Tag>,
    },
    {
      title: '告警标题', dataIndex: 'title', key: 'title',
      render: (v: string, r: AlertEvent) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text></div>
        </div>
      ),
    },
    { title: '来源', dataIndex: 'source', key: 'source', render: (v: string) => <Tag>{v}</Tag> },
    { title: '触发时间', dataIndex: 'firedAt', key: 'firedAt', render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={alertStatusColor[v]}>{alertStatusLabel[v]}</Tag>,
    },
    {
      title: '操作', key: 'action',
      render: (_: unknown, r: AlertEvent) => (
        <Space>
          {r.status === 'firing' && (
            <Button size="small" type="primary" ghost onClick={() => acknowledge(r.id)}>确认</Button>
          )}
          {r.status !== 'resolved' && (
            <Button size="small" type="text" onClick={() => resolve(r.id)}>标记解决</Button>
          )}
        </Space>
      ),
    },
  ];

  const errorColumns = [
    {
      title: '错误类型', dataIndex: 'type', key: 'type',
      render: (v: string, r: ErrorTrace) => (
        <div>
          <Tag color="red" style={{ fontSize: 11 }}>{v}</Tag>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{r.message}</Text>
          </div>
        </div>
      ),
    },
    { title: '所属服务', dataIndex: 'service', key: 'service', render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: '次数', dataIndex: 'count', key: 'count',
      render: (v: number) => <Text strong style={{ color: v > 100 ? '#ff4d4f' : '#faad14' }}>{v}</Text>,
    },
    {
      title: '影响用户', dataIndex: 'affectedUsers', key: 'affectedUsers',
      render: (v: number) => v > 0 ? <Tag color="red">{v} 人</Tag> : <Tag color="default">无</Tag>,
    },
    { title: '首次 / 最近', key: 'time', render: (_: unknown, r: ErrorTrace) => <Text style={{ fontSize: 11 }}>{r.firstSeen} ~ {r.lastSeen}</Text> },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => {
        const m: Record<string, string> = { open: 'error', ignored: 'default', resolved: 'success' };
        const l: Record<string, string> = { open: '待处理', ignored: '已忽略', resolved: '已解决' };
        return <Tag color={m[v]}>{l[v]}</Tag>;
      },
    },
  ];

  const firingCount = alertList.filter((a) => a.status === 'firing').length;

  return (
    <div>
      {firingCount > 0 && (
        <Alert
          message={`当前有 ${firingCount} 个告警正在触发，请及时处理`}
          type="error"
          showIcon
          icon={<AlertOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title={<span><AlertOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />告警事件</span>}
        style={{ marginBottom: 16 }}
        extra={<Button size="small" icon={<ReloadOutlined />}>刷新</Button>}
      >
        <Table dataSource={alertList} columns={alertColumns} rowKey="id" size="small" pagination={{ pageSize: 5 }} />
      </Card>

      <Card
        title={<span><BugOutlined style={{ color: '#faad14', marginRight: 6 }} />错误追踪 Top {errorTraces.length}</span>}
        extra={
          <Button size="small" icon={<SearchOutlined />} type="link">
            在 SkyWalking 中查看全部日志
          </Button>
        }
      >
        <Table dataSource={errorTraces} columns={errorColumns} rowKey="id" size="small" pagination={false} />
      </Card>
    </div>
  );
};

// ─── Tab4: Integrations ───────────────────────────────────────────────────────

const IntegrationsTab: React.FC = () => {
  const [integrations, setIntegrations] = useState(opsIntegrations);

  const toggleConnection = (id: string) => {
    setIntegrations((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, connected: !item.connected } : item
      )
    );
    const item = integrations.find((i) => i.id === id);
    if (item?.connected) {
      message.warning(`已断开与 ${item.name} 的连接`);
    } else {
      message.success(`已连接到 ${item?.name}`);
    }
  };

  return (
    <div>
      <Alert
        message="通过 Webhook 或 Open API 接入运维系统后，AI 可自动拉取指标、分析问题并生成运维报告。"
        type="info"
        showIcon
        icon={<ApiOutlined />}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16}>
        {integrations.map((item: OpsIntegration) => (
          <Col span={8} key={item.id} style={{ marginBottom: 16 }}>
            <Card
              size="small"
              style={{
                borderLeft: `3px solid ${item.connected ? '#52c41a' : '#d9d9d9'}`,
                background: item.connected ? '#fff' : '#fafafa',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{item.icon}</span>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>{item.name}</Text>
                    <div>
                      <Tag style={{ fontSize: 10, padding: '0 4px' }}>{item.category}</Tag>
                      {item.connected
                        ? <Tag color="success" style={{ fontSize: 10, padding: '0 4px' }}>已连接</Tag>
                        : <Tag color="default" style={{ fontSize: 10, padding: '0 4px' }}>未连接</Tag>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '10px 0 6px' }}>
                {item.description}
              </Text>

              {item.connected && item.lastSyncAt && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  上次同步：{item.lastSyncAt}
                </Text>
              )}

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Button
                  size="small"
                  type={item.connected ? 'default' : 'primary'}
                  icon={<SettingOutlined />}
                  onClick={() => message.info(`打开 ${item.name} 配置面板`)}
                >
                  配置
                </Button>
                {item.connected && item.endpoint && (
                  <Button
                    size="small"
                    type="link"
                    icon={<LinkOutlined />}
                    href={item.endpoint}
                    target="_blank"
                    style={{ padding: '0 4px' }}
                  >
                    跳转
                  </Button>
                )}
                <Button
                  size="small"
                  type="text"
                  danger={item.connected}
                  style={{ marginLeft: 'auto' }}
                  onClick={() => toggleConnection(item.id)}
                >
                  {item.connected ? '断开' : '接入'}
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="AI 运维洞察能力"
        style={{ marginTop: 4 }}
        size="small"
      >
        <Row gutter={16}>
          {[
            { icon: '🤖', title: '自动根因分析', desc: 'AI 接入 Prometheus + SkyWalking 后，可自动关联指标和链路，定位告警根因' },
            { icon: '📋', title: '运维周报生成', desc: '每周自动生成服务可用性、错误趋势、性能变化报告，导出至知识中心' },
            { icon: '🔮', title: '容量预测', desc: '分析历史 CPU/内存趋势，预测下周资源需求，提前发出扩容建议' },
            { icon: '🚨', title: '智能告警降噪', desc: '自动合并相关告警、过滤已知误报、优先推送真实 P0/P1 事件' },
          ].map((f) => (
            <Col span={6} key={f.title}>
              <div style={{ padding: '12px', background: '#f8f9ff', borderRadius: 8, height: '100%' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
                <Text strong style={{ fontSize: 13 }}>{f.title}</Text>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReleaseOps: React.FC = () => {
  const firingAlerts = alertEvents.filter((a) => a.status === 'firing').length;

  const tabItems = [
    {
      key: 'pipeline',
      label: (
        <span><RocketOutlined style={{ marginRight: 4 }} />发布流水线</span>
      ),
      children: <PipelineTab />,
    },
    {
      key: 'monitoring',
      label: (
        <span><CloudServerOutlined style={{ marginRight: 4 }} />运行监控</span>
      ),
      children: <MonitoringTab />,
    },
    {
      key: 'issues',
      label: (
        <span>
          <AlertOutlined style={{ marginRight: 4 }} />
          问题分析
          {firingAlerts > 0 && (
            <Tag color="red" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
              {firingAlerts}
            </Tag>
          )}
        </span>
      ),
      children: <IssuesTab />,
    },
    {
      key: 'integrations',
      label: (
        <span><ApiOutlined style={{ marginRight: 4 }} />运维对接</span>
      ),
      children: <IntegrationsTab />,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CloudServerOutlined style={{ color: '#1264e5', marginRight: 8 }} />
          发布与运维中心
        </Title>
        <Space>
          {firingAlerts > 0 && (
            <Tag color="red" icon={<AlertOutlined />}>
              {firingAlerts} 个告警触发中
            </Tag>
          )}
          <Tag color="green" icon={<SafetyCertificateOutlined />}>生产 v1.3.7 运行中</Tag>
          <Tag color="blue">上线 3 天 | 可用性 99.82%</Tag>
        </Space>
      </div>

      <Tabs items={tabItems} defaultActiveKey="pipeline" />
    </div>
  );
};

export default ReleaseOps;
