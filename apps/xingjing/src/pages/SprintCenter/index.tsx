import React from 'react';
import { Card, Row, Col, Tag, Typography, Space, Button, Statistic, Alert, Progress } from 'antd';
import { WarningOutlined, RobotOutlined, ArrowRightOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';
import { currentSprint } from '../../mock/sprint';
import { useAppStore } from '../../store';

const { Text, Title } = Typography;

const SprintCenter: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, updateTaskStatus } = useAppStore();

  const statusColumns: { status: string; title: string; color: string }[] = [
    { status: 'todo', title: '待开发', color: 'default' },
    { status: 'in-dev', title: '开发中', color: 'processing' },
    { status: 'in-review', title: '评审中', color: 'warning' },
    { status: 'done', title: '完成', color: 'success' },
  ];

  const burndownOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['理想线', '实际'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: currentSprint.burndown.map((d) => `Day${d.day}`),
    },
    yAxis: { type: 'value' as const, name: '故事点' },
    series: [
      {
        name: '理想线',
        type: 'line',
        data: currentSprint.burndown.map((d) => d.ideal),
        lineStyle: { type: 'dashed' as const, color: '#ccc' },
        itemStyle: { color: '#ccc' },
      },
      {
        name: '实际',
        type: 'line',
        data: currentSprint.burndown.filter((d) => d.actual > 0).map((d) => d.actual),
        lineStyle: { color: '#1264e5' },
        itemStyle: { color: '#1264e5' },
        areaStyle: { color: 'rgba(18,100,229,0.1)' },
      },
    ],
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      updateTaskStatus(taskId, targetStatus as any);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {currentSprint.id} (Day {currentSprint.currentDay}/{currentSprint.totalDays})
        </Title>
        <Button type="primary" onClick={() => navigate('/sprint/plan')}>
          下个 Sprint 规划
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="燃尽图" size="small">
            <ReactECharts option={burndownOption} style={{ height: 250 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Sprint 健康度" size="small">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="速度 SPI"
                  value={currentSprint.spiIndex}
                  precision={2}
                  valueStyle={{ color: currentSprint.spiIndex < 0.9 ? '#faad14' : '#52c41a' }}
                  suffix={currentSprint.spiIndex < 0.9 ? '⚠️' : '✅'}
                />
              </Col>
              <Col span={12}>
                <Statistic title="完成率" value={currentSprint.completionRate} suffix="%" />
                <Text type="secondary" style={{ fontSize: 12 }}>计划 55%</Text>
              </Col>
              <Col span={12}>
                <Statistic title="阻塞 TASK" value={currentSprint.blockedTasks} />
              </Col>
              <Col span={12}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>预测完成</Text>
                  <div>{currentSprint.predictedEnd}</div>
                  <Text type="secondary" style={{ fontSize: 11 }}>原计划 {currentSprint.originalEnd}，+3天</Text>
                </div>
              </Col>
            </Row>
            <Button icon={<RobotOutlined />} style={{ marginTop: 12 }} block>
              风险分析
            </Button>
          </Card>
        </Col>
      </Row>

      {/* Task kanban */}
      <Card title="TASK 看板" style={{ marginBottom: 16 }}>
        <Row gutter={12}>
          {statusColumns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <Col span={6} key={col.status}>
                <div
                  className="kanban-column"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, col.status)}
                  style={{ minHeight: 300 }}
                >
                  <div className="kanban-column-title">
                    {col.title} ({colTasks.length})
                  </div>
                  {colTasks.map((task) => (
                    <Card
                      key={task.id}
                      size="small"
                      style={{ marginBottom: 8, cursor: 'grab' }}
                      className="hover-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                    >
                      <Text strong style={{ fontSize: 12 }}>{task.id}</Text>
                      <div><Text style={{ fontSize: 13 }}>{task.title}</Text></div>
                      {task.actual && task.estimate && task.actual > task.estimate && (
                        <Tag color="error" style={{ marginTop: 4 }}>
                          超时{Math.round((task.actual - task.estimate) / task.estimate * 100)}%
                        </Tag>
                      )}
                      {task.dependencies?.length ? (
                        <Tag color="warning" style={{ marginTop: 4 }}>等待依赖</Tag>
                      ) : null}
                      {task.assignee && (
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          {task.assignee}
                        </Text>
                      )}
                    </Card>
                  ))}
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* Risk warnings */}
      <Card title="实时风险预警" style={{ marginBottom: 16 }}>
        {currentSprint.risks.map((risk, idx) => (
          <Alert
            key={idx}
            message={risk.message}
            type={risk.level === 'high' ? 'error' : 'warning'}
            showIcon
            style={{ marginBottom: 8 }}
          />
        ))}
      </Card>

      {/* Agent panel */}
      <Card className="agent-panel">
        <div className="agent-panel-title">
          <RobotOutlined /> project-manager-agent
        </div>
        <Text style={{ fontSize: 13 }}>
          "当前 Sprint SPI {currentSprint.spiIndex}，进度偏低。建议考虑将 TASK-001-09
          （SDD更新）移至下个 Sprint，可以释放 1 天 buffer。
          同时建议今日站会讨论 TASK-001-02 的拆分方案。"
        </Text>
        <div style={{ marginTop: 8 }}>
          <Space>
            <Button size="small">查看详细分析</Button>
            <Button size="small">调整 Sprint 范围</Button>
            <Button size="small" type="primary">通知团队</Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default SprintCenter;
