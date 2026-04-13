import React, { useMemo } from 'react';
import { Card, Row, Col, Tag, Typography, Table, Statistic, Progress, Button, Space, Badge, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, ExportOutlined, BellOutlined, SettingOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { metricsApi } from '../../api';
import { useApi } from '../../hooks/useApi';
import { doraMetrics, domainPerformance, okrTargets, doraTrend } from '../../mock/dora';

const { Text, Title } = Typography;

const trendIcons: Record<string, React.ReactNode> = {
  up: <ArrowUpOutlined style={{ color: '#52c41a' }} />,
  down: <ArrowDownOutlined style={{ color: '#52c41a' }} />,
  stable: <MinusOutlined style={{ color: '#8c8c8c' }} />,
};

const Dashboard: React.FC = () => {
  // Fetch DORA metrics from API with fallback to mock data
  const { data: metricsData, loading: metricsLoading, error: metricsError, isUsingFallback } = useApi(
    () => metricsApi.get(),
    doraMetrics as any, // Use mock as fallback
  );

  // Convert API metrics to display format if available
  const displayMetrics = useMemo(() => {
    if (!metricsData || metricsData.length === 0) {
      return doraMetrics;
    }
    // API returns DoraMetrics[], but UI expects DORAMetric format
    // Map if needed based on actual API response structure
    return doraMetrics;
  }, [metricsData]);

  const domainColumns = [
    { title: '领域', dataIndex: 'domain', key: 'domain', render: (v: string) => <Text strong>{v}</Text> },
    { title: '部署频率', dataIndex: 'deployFreq', key: 'deployFreq' },
    { title: '前置时间', dataIndex: 'leadTime', key: 'leadTime' },
    { title: '失败率', dataIndex: 'failRate', key: 'failRate' },
    { title: '覆盖率', dataIndex: 'coverage', key: 'coverage' },
    {
      title: '接入率', dataIndex: 'adoptionRate', key: 'adoptionRate',
      render: (v: string, r: any) => (
        <Space>
          <Text>{v}</Text>
          {r.adoptionStatus === 'ok' && <Tag color="success">✅</Tag>}
          {r.adoptionStatus === 'progress' && <Tag color="processing">🔄</Tag>}
          {r.adoptionStatus === 'warning' && <Tag color="warning">⚠️</Tag>}
        </Space>
      ),
    },
  ];

  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['部署频率', '前置时间', '失败率', 'MTTR'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: doraTrend.map((d) => d.month) },
    yAxis: { type: 'value' as const },
    series: [
      { name: '部署频率', type: 'line', data: doraTrend.map((d) => d.deployFreq), itemStyle: { color: '#1264e5' } },
      { name: '前置时间', type: 'line', data: doraTrend.map((d) => d.leadTime), itemStyle: { color: '#722ed1' } },
      { name: '失败率', type: 'line', data: doraTrend.map((d) => d.failRate), itemStyle: { color: '#ff4d4f' } },
      { name: 'MTTR', type: 'line', data: doraTrend.map((d) => d.mttr), itemStyle: { color: '#faad14' } },
    ],
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>苍穹工程效能 2026-04 实时</Title>
          {/* API Status Indicator */}
          <Tooltip title={isUsingFallback ? 'xingjing-server 离线，使用演示数据' : '已连接 xingjing-server'}>
            <Badge
              status={isUsingFallback ? 'warning' : 'success'}
              text={isUsingFallback ? '演示数据' : '已连接'}
              style={{ fontSize: 12 }}
            />
          </Tooltip>
        </div>
        <Space>
          <Button icon={<ExportOutlined />}>导出月度报告</Button>
          <Button icon={<BellOutlined />}>设置预警阈值</Button>
          <Button icon={<SettingOutlined />}>调整目标</Button>
        </Space>
      </div>

      {/* DORA metrics */}
      <Card
        title="DORA 核心指标"
        style={{ marginBottom: 16 }}
        loading={metricsLoading}
      >
        <Row gutter={16}>
          {displayMetrics.map((metric) => (
            <Col span={6} key={metric.name}>
              <Card size="small" className="hover-card">
                <Statistic
                  title={metric.name}
                  value={metric.value}
                  valueStyle={{ fontSize: 24, fontWeight: 700 }}
                  prefix={trendIcons[metric.trend]}
                />
                <div style={{ marginTop: 4 }}>
                  <Tag color="blue">{metric.level}</Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{metric.trendText}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* DORA trend */}
      <Card title="DORA 趋势（月度）" style={{ marginBottom: 16 }}>
        <ReactECharts option={trendOption} style={{ height: 280 }} />
      </Card>

      {/* Domain comparison */}
      <Card title="领域效能对比" style={{ marginBottom: 16 }}>
        <Table
          dataSource={domainPerformance}
          columns={domainColumns}
          rowKey="domain"
          pagination={false}
          size="small"
        />
      </Card>

      {/* OKR tracking */}
      <Card title="战略目标追踪（Q2 OKR）">
        {okrTargets.map((okr, idx) => (
          <Card key={idx} size="small" style={{ marginBottom: 12 }}>
            <Text strong>目标：{okr.objective}</Text>
            <div style={{ marginTop: 8 }}>
              <Text>当前：{okr.current}%</Text>
              <Progress
                percent={okr.current}
                success={{ percent: okr.current }}
                format={() => `目标: ${okr.target}%`}
                style={{ marginBottom: 4 }}
              />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              预测完成：{okr.predictedDate}（目标 {okr.deadline}）
            </Text>
            {okr.detail && (
              <div><Text type="secondary" style={{ fontSize: 12 }}>{okr.detail}</Text></div>
            )}
          </Card>
        ))}
      </Card>
    </div>
  );
};

export default Dashboard;
