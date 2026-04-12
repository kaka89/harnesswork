import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Checkbox, Typography, Statistic, Button, Space, Badge,
} from 'antd';
import {
  ThunderboltOutlined, RobotOutlined, ArrowUpOutlined, ArrowRightOutlined,
  BulbOutlined, CodeOutlined, NotificationOutlined, FireOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { todayFocus, businessMetrics, soloTasks, SoloTask } from '../../../mock/solo';

const { Text, Title, Paragraph } = Typography;

const priorityConfig = {
  urgent:    { label: '紧急', color: '#ff4d4f', bg: '#fff2f0', border: '#ffccc7' },
  important: { label: '重要', color: '#faad14', bg: '#fffbe6', border: '#ffe58f' },
  normal:    { label: '普通', color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
};

const categoryIcon: Record<string, React.ReactNode> = {
  dev:     <CodeOutlined />,
  product: <BulbOutlined />,
  ops:     <NotificationOutlined />,
  growth:  <RiseOutlinedIcon />,
};

function RiseOutlinedIcon() {
  return <ArrowUpOutlined />;
}

const modeCards = [
  {
    route: '/solo/build',
    icon: <CodeOutlined style={{ fontSize: 24, color: '#1264e5' }} />,
    label: '开发模式',
    desc: '修 Bug · 写功能 · 深度专注',
    color: '#e6f4ff',
    border: '#91caff',
  },
  {
    route: '/solo/product',
    icon: <BulbOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
    label: '产品模式',
    desc: '验证假设 · 规划想法 · 用户洞察',
    color: '#f9f0ff',
    border: '#d3adf7',
  },
  {
    route: '/solo/review',
    icon: <ArrowUpOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
    label: '运营模式',
    desc: '看数据 · 回复反馈 · 写内容',
    color: '#f6ffed',
    border: '#b7eb8f',
  },
];

const SoloFocus: React.FC = () => {
  const navigate = useNavigate();
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());

  const todayTasks: SoloTask[] = [
    ...soloTasks.filter((t) => t.status === 'doing'),
    ...soloTasks.filter((t) => t.status === 'todo').slice(0, 4),
  ].slice(0, 5);

  const toggleTask = (id: string) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ color: '#faad14', marginRight: 8 }} />
            今日焦点
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </div>
        <Tag icon={<FireOutlined />} color="orange">专注模式已开启</Tag>
      </div>

      {/* AI Daily Brief */}
      <Card
        style={{
          marginBottom: 20,
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)',
          border: '1px solid #91caff',
        }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#1264e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <RobotOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Text strong style={{ fontSize: 14 }}>AI 今日简报</Text>
            <Paragraph style={{ margin: '6px 0 12px', fontSize: 13, color: '#444' }}>
              WriteFlow 今天有 <Text strong>3 件最重要的事</Text>需要你关注。DAU 昨日 142，MRR $1,240，整体健康。
            </Paragraph>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayFocus.map((item, idx) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: cfg.color,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                        <Tag color={item.priority === 'urgent' ? 'red' : item.priority === 'important' ? 'orange' : 'green'} style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px' }}>
                          {priorityConfig[item.priority].label}
                        </Tag>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.reason}</Text>
                    </div>
                    {item.linkedRoute && (
                      <Button
                        type="link"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        onClick={() => navigate(item.linkedRoute!)}
                        style={{ padding: 0, flexShrink: 0, fontSize: 12 }}
                      >
                        {item.action}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={16}>
        {/* Today's Task List */}
        <Col span={14}>
          <Card
            title={
              <span>
                今日任务清单
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                  Top {todayTasks.length} · {checkedTasks.size}/{todayTasks.length} 完成
                </Text>
              </span>
            }
            extra={<Button type="link" size="small" onClick={() => navigate('/solo/build')}>全部任务 →</Button>}
            style={{ marginBottom: 16 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {todayTasks.map((task) => {
                const done = checkedTasks.has(task.id);
                const typeColorMap: Record<string, string> = {
                  dev: 'blue', product: 'purple', ops: 'orange', growth: 'green',
                };
                const typeLabel: Record<string, string> = {
                  dev: '开发', product: '产品', ops: '运营', growth: '增长',
                };
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: done ? '#f9f9f9' : '#fafafa',
                      border: '1px solid var(--dls-border-light)',
                      cursor: 'pointer',
                      opacity: done ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                    onClick={() => toggleTask(task.id)}
                  >
                    <Checkbox checked={done} onChange={() => toggleTask(task.id)} onClick={(e) => e.stopPropagation()} />
                    <div style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          textDecoration: done ? 'line-through' : 'none',
                          color: done ? '#bfbfbf' : '#1f1f1f',
                        }}
                      >
                        {task.status === 'doing' && !done && (
                          <Badge status="processing" style={{ marginRight: 4 }} />
                        )}
                        {task.title}
                      </Text>
                    </div>
                    <Space size={4}>
                      <Tag color={typeColorMap[task.type]} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
                        {typeLabel[task.type]}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>{task.est}</Text>
                    </Space>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Work Mode Cards */}
          <Card title="切换工作模式" bodyStyle={{ padding: '12px 16px' }}>
            <Row gutter={12}>
              {modeCards.map((mode) => (
                <Col span={8} key={mode.route}>
                  <div
                    onClick={() => navigate(mode.route)}
                    style={{
                      background: mode.color,
                      border: `1px solid ${mode.border}`,
                      borderRadius: 10,
                      padding: '12px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'transform 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    {mode.icon}
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{mode.label}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{mode.desc}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* Business Health Snapshot */}
        <Col span={10}>
          <Card
            title="商业健康快照"
            extra={<Button type="link" size="small" onClick={() => navigate('/solo/review')}>详细数据 →</Button>}
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[12, 12]}>
              {businessMetrics.map((m) => (
                <Col span={12} key={m.key}>
                  <Card
                    size="small"
                    style={{ borderRadius: 8, border: `1px solid ${m.color}22` }}
                    bodyStyle={{ padding: '12px 14px' }}
                  >
                    <Statistic
                      title={<span style={{ fontSize: 12 }}>{m.label}</span>}
                      value={m.value}
                      valueStyle={{ fontSize: 20, fontWeight: 700, color: m.color }}
                      prefix={m.trend === 'up' ? <ArrowUpOutlined style={{ fontSize: 14, color: '#52c41a' }} /> : undefined}
                    />
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.trendValue}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>

          {/* Streak */}
          <Card
            style={{
              background: 'linear-gradient(135deg, #fff9e6 0%, #fffbe6 100%)',
              border: '1px solid #ffe58f',
            }}
            bodyStyle={{ padding: '16px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FireOutlined style={{ fontSize: 28, color: '#fa8c16' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>连续构建 14 天 🔥</div>
                <Text type="secondary" style={{ fontSize: 12 }}>保持每日发布节奏，用户感知到你在快速迭代</Text>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: i < 14 ? '#fa8c16' : 'var(--dls-border-light)',
                  }}
                />
              ))}
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--dls-border-light)' }}
                />
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SoloFocus;
