import React from 'react';
import {
  Card, Row, Col, Tag, Typography, Statistic, Space, List, Avatar,
} from 'antd';
import {
  LineChartOutlined, ArrowUpOutlined, SmileOutlined, FrownOutlined,
  MinusOutlined, RobotOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import {
  businessMetrics, metricsHistory, featureUsage, userFeedbacks,
} from '../../../mock/solo';

const { Text, Title, Paragraph } = Typography;

const sentimentIcon: Record<string, React.ReactNode> = {
  positive: <SmileOutlined style={{ color: '#52c41a' }} />,
  negative: <FrownOutlined style={{ color: '#ff4d4f' }} />,
  neutral:  <MinusOutlined style={{ color: '#8c8c8c' }} />,
};

const channelColor: Record<string, string> = {
  Email: 'default',
  'Product Hunt': 'orange',
  Twitter: 'blue',
  'In-app': 'purple',
};

const SoloReview: React.FC = () => {
  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['DAU', 'MRR ($)'], bottom: 0 },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: metricsHistory.map((d) => d.week) },
    yAxis: [
      { type: 'value' as const, name: 'DAU', nameTextStyle: { fontSize: 11 } },
      { type: 'value' as const, name: 'MRR ($)', nameTextStyle: { fontSize: 11 } },
    ],
    series: [
      {
        name: 'DAU',
        type: 'line',
        data: metricsHistory.map((d) => d.dau),
        smooth: true,
        itemStyle: { color: '#1264e5' },
        areaStyle: { color: 'rgba(18,100,229,0.08)' },
      },
      {
        name: 'MRR ($)',
        type: 'line',
        yAxisIndex: 1,
        data: metricsHistory.map((d) => d.mrr),
        smooth: true,
        itemStyle: { color: '#52c41a' },
        areaStyle: { color: 'rgba(82,196,26,0.08)' },
      },
    ],
  };

  const featureUsageOption = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 100, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, max: 100 },
    yAxis: { type: 'category' as const, data: featureUsage.map((f) => f.feature).reverse() },
    series: [
      {
        type: 'bar',
        data: featureUsage.map((f) => ({
          value: f.usage,
          itemStyle: {
            color: f.trend === 'up' ? '#52c41a' : f.trend === 'down' ? '#ff4d4f' : '#1264e5',
          },
        })).reverse(),
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right' as const,
          formatter: '{c}%',
          fontSize: 11,
        },
      },
    ],
  };

  const positiveCount = userFeedbacks.filter((f) => f.sentiment === 'positive').length;
  const negativeCount = userFeedbacks.filter((f) => f.sentiment === 'negative').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <LineChartOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          数据复盘
        </Title>
        <Tag color="blue">过去 6 周 · WriteFlow</Tag>
      </div>

      {/* Contrast note */}
      <div
        style={{
          padding: '8px 14px',
          background: 'var(--dls-warning-bg)',
          border: '1px solid #ffe58f',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: '#8c6914',
        }}
      >
        <Text strong>💡 对比团队版：</Text> 团队版核心指标是 DORA（部署频率、前置时间、失败率、MTTR）——面向工程效能。独立版核心指标是商业指标（DAU/MRR/留存/NPS）——工程是手段，商业结果才是目标。
      </div>

      {/* Business Metrics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {businessMetrics.map((m) => (
          <Col span={6} key={m.key}>
            <Card
              size="small"
              className="hover-card"
              style={{
                borderRadius: 10,
                border: `1px solid ${m.color}33`,
                background: `${m.color}08`,
              }}
            >
              <Statistic
                title={<span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>}
                value={m.value}
                valueStyle={{ fontSize: 26, fontWeight: 700, color: m.color }}
                prefix={m.trend === 'up' ? <ArrowUpOutlined style={{ fontSize: 16, color: '#52c41a' }} /> : undefined}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>{m.trendValue}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="DAU + MRR 趋势（6 周）">
            <ReactECharts option={trendOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="功能使用率（本周活跃用户）">
            <ReactECharts option={featureUsageOption} style={{ height: 220 }} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#52c41a' }}>▲ 上升</span>
              <span style={{ fontSize: 11, color: '#1264e5' }}>— 稳定</span>
              <span style={{ fontSize: 11, color: '#ff4d4f' }}>▼ 下降</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* User Feedback + AI Insight */}
      <Row gutter={16}>
        <Col span={15}>
          <Card
            title={
              <span>
                用户反馈摘要
                <Space style={{ marginLeft: 12 }}>
                  <Tag icon={<SmileOutlined />} color="success">{positiveCount} 正面</Tag>
                  <Tag icon={<FrownOutlined />} color="error">{negativeCount} 负面</Tag>
                </Space>
              </span>
            }
          >
            <List
              dataSource={userFeedbacks}
              renderItem={(item) => (
                <List.Item style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{
                          background: item.sentiment === 'positive' ? '#f6ffed' : item.sentiment === 'negative' ? '#fff2f0' : '#f5f5f5',
                          border: `1px solid ${item.sentiment === 'positive' ? '#b7eb8f' : item.sentiment === 'negative' ? '#ffccc7' : '#d9d9d9'}`,
                        }}
                      >
                        {sentimentIcon[item.sentiment]}
                      </Avatar>
                    }
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 13 }}>{item.user}</Text>
                        <Tag color={channelColor[item.channel]} style={{ fontSize: 11 }}>{item.channel}</Tag>
                        <Text type="secondary" style={{ fontSize: 11 }}>{item.date}</Text>
                      </div>
                    }
                    description={
                      <Text style={{ fontSize: 13, color: '#444' }}>{item.content}</Text>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col span={9}>
          <Card
            title={
              <span>
                <RobotOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                AI 洞察
              </span>
            }
            style={{ height: '100%' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  icon: '📈',
                  title: 'MRR 增长健康',
                  content: '过去 6 周 MRR 从 $620 增长到 $1,240，翻了一倍。当前增速 ~$120/周，按此速度 3 个月内可达 $2,700+。',
                  bg: '#f6ffed',
                  border: '#b7eb8f',
                },
                {
                  icon: '⚠️',
                  title: '引用检查功能需重新评估',
                  content: '功能使用率仅 12% 且呈下降趋势。建议考虑降低维护优先级，或将其合并为轻量插件。',
                  bg: '#fffbe6',
                  border: '#ffe58f',
                },
                {
                  icon: '🎯',
                  title: '团队版信号明确',
                  content: '收到 zhuming@corp.com 询问团队版，且明确 5 人愿意付费。建议先用「共享链接」快速验证，不要贸然开发完整版。',
                  bg: '#f0f9ff',
                  border: '#91caff',
                },
                {
                  icon: '🌙',
                  title: '优化推送时间',
                  content: '78% 用户活跃在晚间 20:00-23:00。建议将每日写作提醒时间从 09:00 调整为 20:30，预计可提升点击率 15%+。',
                  bg: '#f9f0ff',
                  border: '#d3adf7',
                },
              ].map((insight, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    background: insight.bg,
                    border: `1px solid ${insight.border}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    {insight.icon} {insight.title}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{insight.content}</Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SoloReview;
