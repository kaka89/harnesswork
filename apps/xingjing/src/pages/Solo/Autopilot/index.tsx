import React, { useState, useRef, useEffect } from 'react';
import {
  Card, Row, Col, Button, Input, Tag, Typography, Space,
  Timeline, Alert, Progress, Badge,
} from 'antd';
import {
  PlayCircleOutlined, RobotOutlined, CheckCircleOutlined,
  LoadingOutlined, ClockCircleOutlined, UserOutlined,
  FileTextOutlined, ThunderboltOutlined, PlusOutlined,
} from '@ant-design/icons';
import {
  soloAgents, soloWorkflowSteps, soloSampleGoals,
  AgentDef, WorkflowStep, AgentStatus,
} from '../../../mock/autopilot';
import { useAppStore } from '../../../store';
import CreateProductModal from '../../../components/common/CreateProductModal';

const { Text, Title } = Typography;

const statusBadge: Record<AgentStatus, { status: 'default' | 'processing' | 'success' | 'warning'; text: string }> = {
  idle:     { status: 'default',    text: '待命' },
  thinking: { status: 'processing', text: '思考中' },
  working:  { status: 'processing', text: '执行中' },
  done:     { status: 'success',    text: '完成' },
  waiting:  { status: 'warning',    text: '等待中' },
};

const SoloBrainCard: React.FC<{
  agent: AgentDef;
  status: AgentStatus;
  currentTask?: string;
  doneToday: number;
}> = ({ agent, status, currentTask, doneToday }) => {
  const badge = statusBadge[status];
  const isActive = status === 'thinking' || status === 'working';
  const isDone = status === 'done';

  return (
    <Card
      style={{
        borderColor: isActive ? agent.borderColor : isDone ? '#b7eb8f' : '#f0f0f0',
        background: isActive ? agent.bgColor : isDone ? '#f6ffed' : '#fafafa',
        transition: 'all 0.4s ease',
        boxShadow: isActive ? `0 0 12px ${agent.borderColor}88` : 'none',
        textAlign: 'center',
      }}
    >
      {/* Brain emoji */}
      <div
        style={{
          fontSize: 32,
          marginBottom: 8,
          filter: status === 'idle' ? 'grayscale(100%) opacity(0.4)' : 'none',
          transition: 'filter 0.3s',
        }}
      >
        {agent.emoji}
      </div>

      {/* Name + status */}
      <Title level={5} style={{ margin: '0 0 2px', fontSize: 14, color: isActive ? agent.color : undefined }}>
        {agent.name}
      </Title>
      <div style={{ marginBottom: 6 }}>
        <Badge status={badge.status} text={<span style={{ fontSize: 11 }}>{badge.text}</span>} />
      </div>

      {/* Current task */}
      <div style={{ minHeight: 32 }}>
        {currentTask && isActive && (
          <Text style={{ fontSize: 11, color: agent.color }}>
            <LoadingOutlined style={{ marginRight: 4 }} />
            {currentTask}
          </Text>
        )}
        {isDone && (
          <Text style={{ fontSize: 11, color: '#52c41a' }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            已完成
          </Text>
        )}
        {status === 'idle' && (
          <Text type="secondary" style={{ fontSize: 11 }}>{agent.description}</Text>
        )}
      </div>

      {/* Done today count */}
      {doneToday > 0 && (
        <div style={{ marginTop: 8 }}>
          <Tag color={agent.color} style={{ fontSize: 11 }}>今日已完成 {doneToday}</Tag>
        </div>
      )}

      {/* Skills */}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
        {agent.skills.slice(0, 2).map((s) => (
          <Tag key={s} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{s}</Tag>
        ))}
      </div>
    </Card>
  );
};

type RunState = 'idle' | 'running' | 'done';

const SoloAutopilot: React.FC = () => {
  const products = useAppStore((s) => s.products);
  const soloProducts = products.filter((p) => p.mode === 'solo');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [runState, setRunState] = useState<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    Object.fromEntries(soloAgents.map((a) => [a.id, 'idle'])),
  );
  const [agentTasks, setAgentTasks] = useState<Record<string, string>>({});
  const [agentDone, setAgentDone] = useState<Record<string, number>>(
    Object.fromEntries(soloAgents.map((a) => [a.id, 0])),
  );
  const [visibleSteps, setVisibleSteps] = useState<WorkflowStep[]>([]);
  const [artifacts, setArtifacts] = useState<WorkflowStep[]>([]);
  const [progress, setProgress] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const reset = () => {
    clearTimers();
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(soloAgents.map((a) => [a.id, 'idle'])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setProgress(0);
  };

  const handleStart = () => {
    if (!goal.trim()) return;
    reset();
    setRunState('running');

    // Solo: all agents can run in parallel — stagger by small offset
    const staggerOffset = 300;
    const totalSteps = soloWorkflowSteps.length;

    soloWorkflowSteps.forEach((step, idx) => {
      const baseDelay = idx * staggerOffset + 500;

      // thinking
      const t1 = setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'thinking' }));
        setAgentTasks((prev) => ({ ...prev, [step.agentId]: step.action }));
      }, baseDelay);
      timersRef.current.push(t1);

      // working
      const t2 = setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'working' }));
      }, baseDelay + 400);
      timersRef.current.push(t2);

      // done
      const t3 = setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'done' }));
        setAgentTasks((prev) => ({ ...prev, [step.agentId]: '' }));
        setAgentDone((prev) => ({ ...prev, [step.agentId]: (prev[step.agentId] || 0) + 1 }));
        setVisibleSteps((prev) => [...prev, step]);
        setProgress(Math.round(((idx + 1) / totalSteps) * 100));
        if (step.artifact) {
          setArtifacts((prev) => [...prev, step]);
        }
        if (idx === totalSteps - 1) {
          setRunState('done');
        }
      }, baseDelay + step.durationMs);
      timersRef.current.push(t3);
    });
  };

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [visibleSteps]);

  useEffect(() => () => clearTimers(), []);

  const doneAgents = Object.values(agentStatuses).filter((s) => s === 'done').length;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Empty State Banner */}
      {soloProducts.length === 0 && (
        <Card
          style={{
            marginBottom: 20,
            background: 'linear-gradient(135deg, #f6ffed 0%, #f0fff0 100%)',
            border: '1px dashed #95de64',
            textAlign: 'center',
          }}
        >
          <div style={{ padding: '16px 0' }}>
            <RobotOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 12, display: 'block' }} />
            <Title level={4} style={{ margin: '0 0 8px', color: '#389e0d' }}>开始你的独立产品之旅</Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              还没有创建项目？先建一个，让 AI 虚拟团队为你服务
            </Text>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                创建我的第一个产品
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Diff Banner */}
      <Alert
        type="success"
        showIcon
        icon={<UserOutlined />}
        message={
          <span>
            <strong>独立版 · 自动驾驶</strong>
            <span style={{ color: '#595959', marginLeft: 8 }}>
              你就是所有角色，AI 直接替你执行，4 个虚拟角色脑并行调度，无审批流程，适合快速验证和迭代
            </span>
          </span>
        }
        style={{ marginBottom: 20 }}
      />

      {/* Goal Input */}
      <Card
        title={<span><ThunderboltOutlined style={{ color: '#52c41a', marginRight: 6 }} />告诉 AI 你想做什么</span>}
        style={{ marginBottom: 20, borderColor: runState !== 'idle' ? '#b7eb8f' : undefined }}
      >
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onPressEnter={() => { if (runState !== 'running' && goal.trim()) handleStart(); }}
          placeholder="一句话描述目标，例如：实现「段落重写」MVP 功能并上线灰度..."
          size="large"
          style={{ marginBottom: 12, fontSize: 14 }}
          disabled={runState === 'running'}
          suffix={
            <Button
              type="primary"
              icon={runState === 'running' ? <LoadingOutlined /> : <PlayCircleOutlined />}
              onClick={handleStart}
              disabled={runState === 'running' || !goal.trim()}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              {runState === 'running' ? '执行中…' : '启动'}
            </Button>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>快速示例：</Text>
          {soloSampleGoals.map((g, i) => (
            <Tag
              key={i}
              style={{ cursor: 'pointer', borderRadius: 12 }}
              color="green"
              onClick={() => { if (runState !== 'running') setGoal(g); }}
            >
              {g.slice(0, 24)}…
            </Tag>
          ))}
          {runState !== 'idle' && (
            <Button size="small" onClick={reset} disabled={runState === 'running'} style={{ marginLeft: 'auto' }}>
              重置
            </Button>
          )}
        </div>

        {runState !== 'idle' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12 }} type="secondary">
                {runState === 'done'
                  ? `全部完成 · 4 个角色脑并行调度`
                  : `并行调度中... ${doneAgents}/4 个脑已完成`}
              </Text>
              <Text style={{ fontSize: 12 }} type="secondary">{progress}%</Text>
            </div>
            <Progress
              percent={progress}
              strokeColor={runState === 'done' ? '#52c41a' : { '0%': '#52c41a', '100%': '#1264e5' }}
              showInfo={false}
              size="small"
            />
          </div>
        )}
      </Card>

      {/* 4 Brain Cards */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {soloAgents.map((agent) => (
          <Col span={6} key={agent.id}>
            <SoloBrainCard
              agent={agent}
              status={agentStatuses[agent.id]}
              currentTask={agentTasks[agent.id]}
              doneToday={agentDone[agent.id]}
            />
          </Col>
        ))}
      </Row>

      {/* Execution Flow + Artifacts */}
      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={<span><ClockCircleOutlined style={{ marginRight: 6 }} />执行流（并行 · 无审批）</span>}
            size="small"
          >
            {visibleSteps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
                <PlayCircleOutlined style={{ fontSize: 36, marginBottom: 10, display: 'block' }} />
                <Text type="secondary">输入目标并启动，执行过程将在此实时显示</Text>
              </div>
            ) : (
              <div ref={timelineRef} style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                <Timeline
                  items={visibleSteps.map((step, idx) => {
                    const agent = soloAgents.find((a) => a.id === step.agentId)!;
                    const isLast = idx === visibleSteps.length - 1 && runState === 'running';
                    return {
                      color: agent.color,
                      dot: isLast ? <LoadingOutlined style={{ color: agent.color }} /> : (
                        <span style={{ fontSize: 14 }}>{agent.emoji}</span>
                      ),
                      children: (
                        <div style={{ paddingBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Tag color={agent.color} style={{ fontSize: 11, margin: 0 }}>{agent.name}</Tag>
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>{step.action}</Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }}>{step.output}</Text>
                          {step.artifact && (
                            <Tag
                              icon={<CheckCircleOutlined />}
                              color="success"
                              style={{ marginTop: 4, fontSize: 11 }}
                            >
                              {step.artifact.title}
                            </Tag>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              </div>
            )}

            {runState === 'done' && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 8,
                }}
              >
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                <Text strong style={{ color: '#52c41a', fontSize: 13 }}>全自动完成</Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  4 个虚拟角色并行执行，{soloWorkflowSteps.length} 步完成，节省约 6 小时
                </Text>
              </div>
            )}
          </Card>
        </Col>

        <Col span={10}>
          <Card
            title={<span><FileTextOutlined style={{ marginRight: 6 }} />产出物</span>}
            size="small"
          >
            {artifacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
                <FileTextOutlined style={{ fontSize: 36, marginBottom: 10, display: 'block' }} />
                <Text type="secondary">执行完成后产出物将在此展示</Text>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {artifacts.map((step) => {
                  const agent = soloAgents.find((a) => a.id === step.agentId)!;
                  return (
                    <div
                      key={step.id}
                      style={{
                        padding: '10px 12px',
                        background: agent.bgColor,
                        border: `1px solid ${agent.borderColor}`,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>{agent.emoji}</span>
                        <Tag color={agent.color} style={{ margin: 0, fontSize: 11 }}>{agent.name}</Tag>
                        <Text strong style={{ fontSize: 12 }}>{step.artifact!.title}</Text>
                      </div>
                      <Text
                        style={{ fontSize: 11, color: '#595959', whiteSpace: 'pre-line', lineHeight: 1.7 }}
                      >
                        {step.artifact!.content}
                      </Text>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
      <CreateProductModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        mode="solo"
      />
    </div>
  );
};

export default SoloAutopilot;
