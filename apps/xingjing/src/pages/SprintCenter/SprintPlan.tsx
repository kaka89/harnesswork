import React from 'react';
import { Card, Row, Col, Typography, Button, Tag, Space, Progress, message } from 'antd';
import { RobotOutlined, ArrowRightOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { historyVelocity } from '../../mock/sprint';

const { Text, Title } = Typography;

const SprintPlan: React.FC = () => {
  const navigate = useNavigate();
  const { backlog, toggleBacklogItem } = useAppStore();

  const sprintCapacity = 32;
  const planned = backlog.filter((b) => b.inSprint).reduce((sum, b) => sum + b.estimate, 0);
  const remaining = sprintCapacity - planned;

  const velocityOption = {
    tooltip: {},
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category' as const, data: historyVelocity.map((v) => v.sprint) },
    yAxis: { type: 'value' as const },
    series: [
      {
        type: 'bar',
        data: historyVelocity.map((v) => v.points),
        itemStyle: { color: '#1264e5' },
        barWidth: 30,
      },
    ],
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Sprint 规划 — SPRINT-2026-W19</Title>
        <Space>
          <Text type="secondary">时间：2026-05-06 ~ 2026-05-16</Text>
          <Text type="secondary">容量：{sprintCapacity} 人天</Text>
        </Space>
      </div>

      <Row gutter={16}>
        {/* Backlog */}
        <Col span={10}>
          <Card title="Backlog（可加入）" size="small">
            {backlog.map((item) => (
              <Card
                key={item.id}
                size="small"
                style={{
                  marginBottom: 8,
                  opacity: item.inSprint ? 0.5 : 1,
                  cursor: 'pointer',
                }}
                className="hover-card"
                onClick={() => toggleBacklogItem(item.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Space>
                    <Tag color={item.priority === 'P0' ? 'red' : item.priority === 'P1' ? 'orange' : 'blue'}>
                      {item.priority}
                    </Tag>
                    <Text strong style={{ fontSize: 13 }}>{item.id}</Text>
                  </Space>
                  <Text type="secondary">{item.estimate}天</Text>
                </div>
                <Text style={{ fontSize: 13 }}>{item.title}</Text>
                <div style={{ marginTop: 4 }}>
                  <Button
                    size="small"
                    type={item.inSprint ? 'default' : 'primary'}
                  >
                    {item.inSprint ? '移出 Sprint' : '加入 Sprint →'}
                  </Button>
                </div>
              </Card>
            ))}
          </Card>

          <Card title="历史速度参考" size="small" style={{ marginTop: 12 }}>
            <ReactECharts option={velocityOption} style={{ height: 150 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>建议 Sprint 容量: ≤ 26 点</Text>
          </Card>
        </Col>

        {/* Sprint plan */}
        <Col span={14}>
          <Card title="本 Sprint 计划" size="small">
            <div style={{ marginBottom: 12 }}>
              <Text>已计划: {planned}/{sprintCapacity} 人天</Text>
              <Progress
                percent={Math.round((planned / sprintCapacity) * 100)}
                strokeColor={planned > sprintCapacity ? '#ff4d4f' : '#1264e5'}
              />
            </div>

            {backlog.filter((b) => b.inSprint).map((item) => (
              <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Space>
                    <Text strong>{item.id}</Text>
                    <Text>{item.title}</Text>
                  </Space>
                  <Text>{item.estimate}天</Text>
                </div>
              </Card>
            ))}

            {backlog.filter((b) => b.inSprint).length === 0 && (
              <Text type="secondary">点击左侧 Backlog 中的任务加入 Sprint</Text>
            )}

            <div style={{ marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">剩余容量: {remaining.toFixed(1)} 人天</Text>
                </Col>
                <Col span={12} style={{ textAlign: 'right' }}>
                  <Text type="secondary">
                    置信度: {planned > 0 && planned <= sprintCapacity * 0.8 ? '82% ✅' : planned > sprintCapacity ? '低 ⚠️' : '待评估'}
                  </Text>
                </Col>
              </Row>
            </div>
          </Card>

          {/* Agent panel */}
          <Card style={{ marginTop: 12 }} className="agent-panel">
            <div className="agent-panel-title">
              <RobotOutlined /> plan-agent 自动规划建议
            </div>
            <Text style={{ fontSize: 13 }}>
              "基于 {sprintCapacity} 人天容量和历史速度，建议本 Sprint 计划 20-24 人天
              (留 25% buffer)。我已自动排列高优先级 TASK，关键路径
              7天，在 Sprint 内可完成。TASK-002-03 建议移到下个 Sprint
              因为外部 API 依赖不确定性较高。"
            </Text>
            <Space style={{ marginTop: 8 }}>
              <Button size="small" type="primary">采用建议</Button>
              <Button size="small">手动调整</Button>
              <Button size="small">查看关键路径</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <Space>
          <Button onClick={() => navigate('/sprint')}>取消</Button>
          <Button type="primary" onClick={() => { message.success('Sprint 计划已确认！'); navigate('/sprint'); }}>
            确认 Sprint 计划
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default SprintPlan;
