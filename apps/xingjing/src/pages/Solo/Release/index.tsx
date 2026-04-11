import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Button, Typography, Switch, Progress, Space,
  Timeline, message, Select, Tooltip, Statistic,
} from 'antd';
import {
  RocketOutlined, CheckCircleOutlined, CloseCircleOutlined, UndoOutlined,
  SyncOutlined, ThunderboltOutlined, SafetyOutlined, WarningOutlined,
  CloudOutlined, DashboardOutlined, ApiOutlined, LinkOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { featureFlags, releases, FeatureFlag, Release } from '../../../mock/solo';

const { Text, Title } = Typography;

const statusIcon: Record<string, React.ReactNode> = {
  success: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  rolledback: <UndoOutlined style={{ color: '#faad14' }} />,
};

const statusColor: Record<string, string> = {
  success: 'success',
  failed: 'error',
  rolledback: 'warning',
};

type Env = 'staging' | 'prod';

const SoloRelease: React.FC = () => {
  const [deployEnv, setDeployEnv] = useState<Env>('staging');
  const [deploying, setDeploying] = useState(false);
  const [ciProgress, setCiProgress] = useState(0);
  const [ciDone, setCiDone] = useState(false);
  const [flags, setFlags] = useState<FeatureFlag[]>(featureFlags);
  const [rollouts, setRollouts] = useState<Record<string, number>>(
    Object.fromEntries(featureFlags.map((f) => [f.id, f.rollout]))
  );

  const handleDeploy = () => {
    setDeploying(true);
    setCiProgress(0);
    setCiDone(false);
    let p = 0;
    const timer = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        setTimeout(() => {
          setDeploying(false);
          setCiDone(true);
          message.success(`🚀 已成功部署到 ${deployEnv === 'prod' ? '生产环境' : 'Staging 环境'}！`);
        }, 400);
      }
      setCiProgress(Math.min(Math.round(p), 100));
    }, 280);
  };

  const toggleFlag = (id: string, enabled: boolean) => {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
    message.success(enabled ? '功能开关已开启' : '功能开关已关闭');
  };

  const ciSteps = [
    { label: '代码检查 (lint + typecheck)', done: !deploying || ciProgress > 20, active: deploying && ciProgress <= 20 },
    { label: '单元测试', done: !deploying || ciProgress > 45, active: deploying && ciProgress > 20 && ciProgress <= 45 },
    { label: '构建 (Next.js build)', done: !deploying || ciProgress > 70, active: deploying && ciProgress > 45 && ciProgress <= 70 },
    { label: '部署到 Vercel', done: !deploying || ciProgress > 90, active: deploying && ciProgress > 70 && ciProgress <= 90 },
    { label: '健康检查', done: ciDone, active: deploying && ciProgress > 90 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <RocketOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          发布管理
        </Title>
        <Space>
          <Tag icon={<SafetyOutlined />} color="green">v1.2.3 生产运行中</Tag>
          <Tag color="default">上线 3 天</Tag>
        </Space>
      </div>

      {/* Contrast note */}
      <div
        style={{
          padding: '8px 14px',
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: '#8c6914',
        }}
      >
        <Text strong>💡 对比团队版：</Text> 团队版需要 Tech Lead + SRE 双人审批才能发布生产。独立版只有你一个人，所有权限都在你手里，一键发布，秒级决策。
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* Deploy Panel */}
        <Col span={14}>
          <Card
            title={
              <span>
                <CloudOutlined style={{ marginRight: 6 }} />
                一键部署
              </span>
            }
          >
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>目标环境</Text>
                <div style={{ marginTop: 4 }}>
                  <Select
                    value={deployEnv}
                    onChange={(v) => setDeployEnv(v as Env)}
                    style={{ width: 150 }}
                    options={[
                      { value: 'staging', label: '🧪 Staging (测试)' },
                      { value: 'prod', label: '🚀 Production (生产)' },
                    ]}
                  />
                </div>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>分支</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color="blue">main</Tag>
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>最新 commit: 3f8a2c1</Text>
                </div>
              </Col>
            </Row>

            {/* CI Progress */}
            {(deploying || ciDone) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13 }}>
                    {deploying ? <SyncOutlined spin style={{ marginRight: 6 }} /> : <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />}
                    {deploying ? '正在部署...' : '部署完成 ✅'}
                  </Text>
                  <Text style={{ fontSize: 13 }}>{ciProgress}%</Text>
                </div>
                <Progress
                  percent={ciProgress}
                  status={deploying ? 'active' : 'success'}
                  strokeColor={deploying ? '#1264e5' : '#52c41a'}
                  style={{ marginBottom: 12 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ciSteps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      {step.active ? (
                        <SyncOutlined spin style={{ color: '#1264e5', fontSize: 12 }} />
                      ) : step.done ? (
                        <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                      ) : (
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f0f0f0', border: '1px solid #d9d9d9' }} />
                      )}
                      <Text style={{ color: step.active ? '#1264e5' : step.done ? '#1f1f1f' : '#bfbfbf', fontSize: 12 }}>
                        {step.label}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="primary"
              icon={deploying ? <SyncOutlined spin /> : <RocketOutlined />}
              size="large"
              block
              loading={deploying}
              onClick={handleDeploy}
              style={{
                background: deployEnv === 'prod' ? '#52c41a' : '#1264e5',
                borderColor: deployEnv === 'prod' ? '#52c41a' : '#1264e5',
                height: 48,
                fontSize: 16,
                borderRadius: 10,
              }}
            >
              {deploying ? '部署中...' : `一键部署到 ${deployEnv === 'prod' ? '🚀 生产' : '🧪 Staging'}`}
            </Button>

            {deployEnv === 'prod' && (
              <div style={{ marginTop: 8, textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ⚡ 无需审批 · 你是唯一的所有者
                </Text>
              </div>
            )}
          </Card>
        </Col>

        {/* Feature Flags */}
        <Col span={10}>
          <Card
            title={
              <span>
                <ThunderboltOutlined style={{ marginRight: 6 }} />
                功能开关 (Feature Flags)
              </span>
            }
          >
            <div
              style={{
                padding: '6px 10px',
                background: '#f0f9ff',
                borderRadius: 6,
                fontSize: 12,
                color: '#1264e5',
                marginBottom: 12,
              }}
            >
              无需重新部署即可控制功能上线范围，快速验证假设
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  style={{
                    padding: '12px 14px',
                    border: `1px solid ${flag.enabled ? '#91caff' : '#f0f0f0'}`,
                    borderRadius: 10,
                    background: flag.enabled ? '#f0f9ff' : '#fafafa',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text strong style={{ fontSize: 13 }}>{flag.description}</Text>
                      <div>
                        <Text code style={{ fontSize: 11 }}>{flag.name}</Text>
                      </div>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      onChange={(v) => toggleFlag(flag.id, v)}
                      size="small"
                    />
                  </div>
                  {flag.enabled && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>用户覆盖比例</Text>
                        <Text style={{ fontSize: 12, fontWeight: 600 }}>{rollouts[flag.id]}%</Text>
                      </div>
                      <Progress
                        percent={rollouts[flag.id]}
                        size="small"
                        strokeColor="#1264e5"
                        showInfo={false}
                      />
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        {[10, 25, 50, 100].map((v) => (
                          <Button
                            key={v}
                            size="small"
                            type={rollouts[flag.id] === v ? 'primary' : 'default'}
                            onClick={() => setRollouts((prev) => ({ ...prev, [flag.id]: v }))}
                            style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                          >
                            {v}%
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Release History */}
      <Card title="发布记录" style={{ marginBottom: 16 }}>
        <Timeline
          items={releases.map((r) => ({
            color: r.status === 'success' ? 'green' : r.status === 'failed' ? 'red' : 'orange',
            dot: statusIcon[r.status],
            children: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 14 }}>{r.version}</Text>
                    <Tag color={statusColor[r.status]}>
                      {r.status === 'success' ? '成功' : r.status === 'failed' ? '失败' : '已回滚'}
                    </Tag>
                    <Tag color={r.env === 'prod' ? 'green' : 'blue'} style={{ fontSize: 11 }}>
                      {r.env === 'prod' ? '生产' : 'Staging'}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>⏱ {r.deployTime}</Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{r.summary}</Text>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.date}</Text>
                  {r.status === 'success' && (
                    <Tooltip title="回滚到此版本">
                      <Button size="small" icon={<UndoOutlined />} type="text">
                        回滚
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ),
          }))}
        />
      </Card>

      {/* Runtime Monitoring */}
      <Card
        title={
          <span>
            <DashboardOutlined style={{ marginRight: 6, color: '#1264e5' }} />
            运行监控
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={12} style={{ marginBottom: 14 }}>
          {[
            { title: '可用性', value: '99.8', suffix: '%', color: '#52c41a' },
            { title: '平均响应', value: '148', suffix: 'ms', color: '#1264e5' },
            { title: '今日错误', value: '7', suffix: '次', color: '#faad14' },
            { title: '活跃用户', value: '142', suffix: 'DAU', color: '#722ed1' },
          ].map((m) => (
            <Col span={6} key={m.title}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Statistic
                  title={m.title}
                  value={m.value}
                  suffix={m.suffix}
                  valueStyle={{ color: m.color, fontSize: 20, fontWeight: 700 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
        <ReactECharts
          option={{
            tooltip: { trigger: 'axis' as const },
            legend: { data: ['错误率 (%)'], bottom: 0 },
            grid: { left: 40, right: 20, top: 10, bottom: 36 },
            xAxis: {
              type: 'category' as const,
              data: ['4/5', '4/6', '4/7', '4/8', '4/9', '4/10', '4/11'],
              axisLabel: { fontSize: 11 },
            },
            yAxis: { type: 'value' as const, axisLabel: { fontSize: 11, formatter: '{value}%' }, max: 3 },
            series: [{
              name: '错误率 (%)',
              type: 'line',
              smooth: true,
              data: [0.8, 0.5, 0.6, 1.2, 0.4, 0.3, 0.5],
              itemStyle: { color: '#ff4d4f' },
              areaStyle: { opacity: 0.1 },
            }],
          }}
          style={{ height: 160 }}
        />
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0f9ff', borderRadius: 6, fontSize: 12, color: '#1264e5' }}>
          AI 已分析近 7 天数据：4/8 错误率峰值由「账期计算」API 触发，建议在「构建中」模块添加边界值测试用例。
        </div>
      </Card>

      {/* Ops Integrations */}
      <Card
        title={
          <span>
            <ApiOutlined style={{ marginRight: 6, color: '#52c41a' }} />
            运维对接
          </span>
        }
      >
        <div
          style={{
            padding: '6px 10px',
            background: '#f6ffed',
            borderRadius: 6,
            fontSize: 12,
            color: '#52c41a',
            marginBottom: 12,
          }}
        >
          AI 已接入以下系统，可在「数据复盘」模块自动生成运营分析报告
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { icon: '▲', name: 'Vercel Analytics', desc: '流量来源、页面访问热力', connected: true, sync: '2026-04-11 14:00' },
            { icon: '🐛', name: 'Sentry', desc: '错误追踪与 Issue 管理', connected: true, sync: '2026-04-11 14:35' },
            { icon: '🟢', name: 'UptimeRobot', desc: '可用性监控与宕机告警', connected: true, sync: '2026-04-11 14:00' },
            { icon: '🔶', name: 'Cloudflare', desc: 'CDN 流量与 Web 安全防护', connected: false, sync: undefined },
          ] as Array<{ icon: string; name: string; desc: string; connected: boolean; sync?: string }>).map((item) => (
            <div
              key={item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                border: `1px solid ${item.connected ? '#b7eb8f' : '#f0f0f0'}`,
                borderRadius: 8,
                background: item.connected ? '#f6ffed' : '#fafafa',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div>
                  <Typography.Text strong style={{ fontSize: 13 }}>{item.name}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{item.desc}</Typography.Text>
                  </div>
                  {item.sync && (
                    <Typography.Text type="secondary" style={{ fontSize: 10 }}>上次同步：{item.sync}</Typography.Text>
                  )}
                </div>
              </div>
              <Space>
                {item.connected
                  ? <Tag color="success">已连接</Tag>
                  : <Tag color="default">未连接</Tag>
                }
                <Button size="small" icon={<LinkOutlined />} onClick={() => message.info(`打开 ${item.name} 配置`)}>配置</Button>
              </Space>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default SoloRelease;
