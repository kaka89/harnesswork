import React from 'react';
import { Card, Row, Col, Tag, Typography, Table, Statistic } from 'antd';
import { CheckCircleOutlined, SafetyOutlined, BugOutlined, LockOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { qualityGates, coverageTrend, aiReviewStats } from '../../mock/quality';
import { pactNetwork } from '../../mock/contracts';

const { Text, Title } = Typography;

const gateIcons: Record<string, React.ReactNode> = {
  '测试覆盖率': <BugOutlined />,
  'SonarQube': <SafetyOutlined />,
  'Pact 契约': <CheckCircleOutlined />,
  '安全扫描': <LockOutlined />,
};

const QualityCenter: React.FC = () => {
  const coverageOption = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category' as const, data: coverageTrend.map((d) => d.date) },
    yAxis: { type: 'value' as const, min: 60, max: 100 },
    series: [
      {
        type: 'line',
        data: coverageTrend.map((d) => d.value),
        itemStyle: { color: '#1264e5' },
        areaStyle: { color: 'rgba(18,100,229,0.1)' },
        markLine: {
          data: [{ yAxis: 80, name: '目标线' }],
          lineStyle: { color: '#ff4d4f', type: 'dashed' as const },
          label: { formatter: '目标 80%' },
        },
      },
    ],
  };

  const issueColumns = [
    { title: '问题', dataIndex: 'issue', key: 'issue' },
    { title: '次数', dataIndex: 'count', key: 'count', render: (v: number) => <Tag color="orange">{v} 次</Tag> },
    { title: '建议', dataIndex: 'suggestion', key: 'suggestion' },
  ];

  return (
    <div>
      <Title level={4}>质量中心</Title>

      {/* Quality gates */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {qualityGates.map((gate) => (
          <Col span={6} key={gate.name}>
            <Card size="small" className="hover-card">
              <Statistic
                title={gate.name}
                value={gate.value}
                valueStyle={{ color: gate.status === 'passed' ? '#52c41a' : '#ff4d4f', fontSize: 20 }}
                prefix={gateIcons[gate.name]}
                suffix={gate.status === 'passed' ? '✅' : '❌'}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>目标: {gate.target}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Pact network */}
      <Card title="Pact 契约网络" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '30px 0', gap: 40, flexWrap: 'wrap' }}>
          {/* Consumer nodes on left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {pactNetwork.nodes.filter((n) => n.type === 'consumer').map((node) => {
              const edge = pactNetwork.edges.find((e) => e.from === node.id);
              return (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="pact-node pact-node-consumer">
                    {node.label}
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>(消费方)</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '2px solid #52c41a', width: 80 }} />
                    <Text style={{ fontSize: 11 }}>{edge?.label}</Text>
                    <div><Tag color="success" style={{ fontSize: 11 }}>{edge?.contracts}条契约 ✅</Tag></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Producer node center */}
          <div className="pact-node pact-node-producer" style={{ padding: '20px 30px' }}>
            cosmic-gl
            <div style={{ fontSize: 11, color: '#096dd9' }}>(生产方)</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">最后验证：30分钟前 ✅</Text>
        </div>
      </Card>

      <Row gutter={16}>
        {/* Coverage trend */}
        <Col span={14}>
          <Card title="覆盖率趋势（30天）" size="small">
            <ReactECharts option={coverageOption} style={{ height: 250 }} />
          </Card>
        </Col>

        {/* AI Review stats */}
        <Col span={10}>
          <Card title="AI Review 分析（本Sprint）" size="small">
            <Statistic
              title="Review 的 PR 数"
              value={aiReviewStats.totalPRs}
              suffix={`个，平均评分 ${aiReviewStats.avgScore}/10`}
              style={{ marginBottom: 16 }}
            />
            <Text strong>最常见问题：</Text>
            <Table
              dataSource={aiReviewStats.commonIssues}
              columns={issueColumns}
              rowKey="issue"
              pagination={false}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default QualityCenter;
