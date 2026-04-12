import React, { useState, useRef, useEffect } from 'react';
import {
  Card, Row, Col, Button, Input, Tag, Typography, Space, Badge,
  Timeline, Alert, Progress, Divider, Tooltip, message,
} from 'antd';
import {
  ThunderboltOutlined, RobotOutlined, CheckCircleOutlined,
  LoadingOutlined, ClockCircleOutlined, PlayCircleOutlined,
  FileTextOutlined, DeploymentUnitOutlined, BugOutlined,
  RocketOutlined, BarChartOutlined, TeamOutlined, PlusOutlined,
} from '@ant-design/icons';
import {
  teamAgents, teamWorkflowSteps, teamSampleGoals,
  AgentDef, WorkflowStep, AgentStatus,
} from '../../mock/autopilot';
import { aiSessionsApi } from '../../api';
import { useAppStore } from '../../store';
import CreateProductModal from '../../components/common/CreateProductModal';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const agentIcon: Record<string, React.ReactNode> = {
  'pm-agent':   <FileTextOutlined />,
  'arch-agent': <DeploymentUnitOutlined />,
  'dev-agent':  <RobotOutlined />,
  'qa-agent':   <BugOutlined />,
  'sre-agent':  <RocketOutlined />,
  'mgr-agent':  <BarChartOutlined />,
};

const statusBadge: Record<AgentStatus, { status: 'default' | 'processing' | 'success' | 'warning' | 'error'; text: string }> = {
  idle:     { status: 'default',    text: '待命' },
  thinking: { status: 'processing', text: '思考中' },
  working:  { status: 'processing', text: '执行中' },
  done:     { status: 'success',    text: '完成' },
  waiting:  { status: 'warning',    text: '等待中' },
};

const AgentCard: React.FC<{ agent: AgentDef; status: AgentStatus; currentTask?: string }> = ({
  agent, status, currentTask,
}) => {
  const badge = statusBadge[status];
  const isActive = status === 'thinking' || status === 'working';

  return (
    <Card
      size="small"
      style={{
        borderColor: isActive ? agent.borderColor : status === 'done' ? 'var(--dls-success-border)' : 'var(--dls-border-light)',
        background: isActive ? agent.bgColor : status === 'done' ? 'var(--dls-success-bg)' : 'var(--dls-bg-subtle)',
        transition: 'all 0.4s ease',
        boxShadow: isActive ? `0 0 0 2px ${agent.borderColor}` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: isActive ? agent.color : status === 'done' ? '#52c41a' : 'var(--gray-8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 16,
            flexShrink: 0,
            transition: 'background 0.3s',
          }}
        >
          {status === 'done' ? <CheckCircleOutlined /> : agentIcon[agent.id]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text strong style={{ fontSize: 13 }}>{agent.name}</Text>
            <Badge status={badge.status} text={<span style={{ fontSize: 11 }}>{badge.text}</span>} />
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{agent.role}</Text>
          {currentTask && (
            <Text style={{ fontSize: 11, color: agent.color, display: 'block', marginTop: 2 }}>
              {isActive && <LoadingOutlined style={{ marginRight: 4 }} />}
              {currentTask}
            </Text>
          )}
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {agent.skills.slice(0, 2).map((s) => (
              <Tag key={s} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{s}</Tag>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

type RunState = 'idle' | 'running' | 'done';

const EnterpriseAutopilot: React.FC = () => {
  const products = useAppStore((s) => s.products);
  const teamProducts = products.filter((p) => p.mode === 'team');
  const currentProject = teamProducts[0]?.id;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [runState, setRunState] = useState<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    Object.fromEntries(teamAgents.map((a) => [a.id, 'idle'])),
  );
  const [agentTasks, setAgentTasks] = useState<Record<string, string>>({});
  const [visibleSteps, setVisibleSteps] = useState<WorkflowStep[]>([]);
  const [artifacts, setArtifacts] = useState<WorkflowStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const reset = () => {
    clearTimers();
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(teamAgents.map((a) => [a.id, 'idle'])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setProgress(0);
    setSessionResult(null);
  };

  /**
   * Try to use real API first, fall back to mock simulation if unavailable
   */
  const handleStart = async () => {
    if (!goal.trim()) return;
    reset();
    setRunState('running');

    try {
      // Attempt to create AI session via API
      const session = await aiSessionsApi.create(goal, currentProject);
      console.log('[Autopilot] Created AI session:', session.id);

      // Poll for session updates
      const stopPolling = await aiSessionsApi.poll(session.id, (updated) => {
        console.log('[Autopilot] Session updated:', updated.status);
        // Update UI with real session result if available
        if (updated.result) {
          setSessionResult(updated.result);
        }
        // When done, update UI
        if (updated.status === 'done' || updated.status === 'failed') {
          setRunState('done');
        }
      });

      cleanupRef.current = stopPolling;
    } catch (err) {
      // API unavailable, fall back to mock simulation
      console.warn('[Autopilot] API unavailable, using mock simulation:', err);
      message.info('使用本地模拟模式演示自动驾驶流程');

      // Run mock simulation
      let cumulativeDelay = 400;
      const totalSteps = teamWorkflowSteps.length;

      teamWorkflowSteps.forEach((step, idx) => {
        cumulativeDelay += step.durationMs;

        // Activate agent: thinking
        const t1 = setTimeout(() => {
          setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'thinking' }));
          setAgentTasks((prev) => ({ ...prev, [step.agentId]: step.action }));
        }, cumulativeDelay - step.durationMs + 200);
        timersRef.current.push(t1);

        // Agent: working
        const t2 = setTimeout(() => {
          setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'working' }));
        }, cumulativeDelay - step.durationMs + 500);
        timersRef.current.push(t2);

        // Step appears in timeline
        const t3 = setTimeout(() => {
          setVisibleSteps((prev) => [...prev, step]);
          setProgress(Math.round(((idx + 1) / totalSteps) * 100));
          if (step.artifact) {
            setArtifacts((prev) => [...prev, step]);
          }
          // Mark agent done after last step
          const lastIdx = teamWorkflowSteps.reduce(
            (acc: number, s, i) => (s.agentId === step.agentId ? i : acc), -1,
          );
          const isLastStepForAgent = lastIdx === idx;
          if (isLastStepForAgent) {
            setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'done' }));
            setAgentTasks((prev) => ({ ...prev, [step.agentId]: '' }));
          }
          // All done
          if (idx === totalSteps - 1) {
            setRunState('done');
          }
        }, cumulativeDelay);
        timersRef.current.push(t3);
      });
    }
  };

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [visibleSteps]);

  useEffect(
    () => () => {
      clearTimers();
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    },
    [],
  );

  const doneCount = Object.values(agentStatuses).filter((s) => s === 'done').length;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Empty State Banner */}
      {teamProducts.length === 0 && (
        <Card
          style={{
            marginBottom: 20,
            background: 'linear-gradient(135deg, var(--dls-info-bg-alt) 0%, var(--dls-info-bg) 100%)',
            border: '1px dashed var(--dls-info-border)',
            textAlign: 'center',
          }}
        >
          <div style={{ padding: '16px 0' }}>
            <RobotOutlined style={{ fontSize: 48, color: '#1264e5', marginBottom: 12, display: 'block' }} />
            <Title level={4} style={{ margin: '0 0 8px', color: '#1264e5' }}>欢迎使用星静工程效能平台</Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              你还没有创建任何产品，从新建产品开始你的团队研发之旅吧
            </Text>
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
                style={{ background: '#1264e5' }}
              >
                立即创建第一个产品
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Diff Banner */}
      <Alert
        type="info"
        showIcon
        icon={<TeamOutlined />}
        message={
          <span>
            <strong>团队版 · Agent 自动驾驶</strong>
            <span style={{ color: '#595959', marginLeft: 8 }}>
              专为多角色协作团队打造，为 PM / 架构师 / 开发 / QA / SRE / 管理层分别提供专属 Agent 与工作坊，输出物经评审门控，保留完整决策可追溯性
            </span>
          </span>
        }
        style={{ marginBottom: 20 }}
      />

      {/* Goal Input */}
      <Card
        title={<span><ThunderboltOutlined style={{ color: '#1264e5', marginRight: 6 }} />输入目标，启动 Agent 自动驾驶</span>}
        style={{ marginBottom: 20 }}
      >
        <TextArea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="描述你的目标，例如：为苍穹财务增加「智能费用报销审批」功能..."
          rows={3}
          style={{ marginBottom: 12, fontSize: 14 }}
          disabled={runState === 'running'}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>快速示例：</Text>
          {teamSampleGoals.map((g, i) => (
            <Tag
              key={i}
              style={{ cursor: 'pointer', borderRadius: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { if (runState !== 'running') setGoal(g); }}
            >
              {g.slice(0, 30)}…
            </Tag>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {runState !== 'idle' && (
              <Button onClick={reset} disabled={runState === 'running'}>重置</Button>
            )}
            <Button
              type="primary"
              icon={runState === 'running' ? <LoadingOutlined /> : <PlayCircleOutlined />}
              onClick={handleStart}
              disabled={runState === 'running' || !goal.trim()}
              style={{ background: '#1264e5' }}
            >
              {runState === 'running' ? '执行中…' : runState === 'done' ? '重新启动' : '启动自动驾驶'}
            </Button>
          </div>
        </div>
        {runState !== 'idle' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12 }} type="secondary">
                {runState === 'done' ? '所有 Agent 执行完成' : `正在执行... ${doneCount}/${teamAgents.length} 个 Agent 完成`}
              </Text>
              <Text style={{ fontSize: 12 }} type="secondary">{progress}%</Text>
            </div>
            <Progress
              percent={progress}
              strokeColor={runState === 'done' ? '#52c41a' : '#1264e5'}
              showInfo={false}
              size="small"
            />
          </div>
        )}
      </Card>

      <Row gutter={16}>
        {/* Left: Agent Grid */}
        <Col span={7}>
          <Card
            title={<span><RobotOutlined style={{ marginRight: 6 }} />Agent 团队（{doneCount}/{teamAgents.length} 完成）</span>}
            size="small"
            style={{ height: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {teamAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={agentStatuses[agent.id]}
                  currentTask={agentTasks[agent.id]}
                />
              ))}
            </Space>
          </Card>
        </Col>

        {/* Center: Execution Timeline */}
        <Col span={10}>
          <Card
            title={<span><ClockCircleOutlined style={{ marginRight: 6 }} />执行时间轴</span>}
            size="small"
            style={{ height: '100%' }}
          >
            {visibleSteps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#8c8c8c' }}>
                <RobotOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                <Text type="secondary">启动自动驾驶后，Agent 执行过程将在此实时显示</Text>
              </div>
            ) : (
              <div
                ref={timelineRef}
                style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}
              >
                <Timeline
                  items={visibleSteps.map((step, idx) => {
                    const agent = teamAgents.find((a) => a.id === step.agentId)!;
                    const isLast = idx === visibleSteps.length - 1 && runState === 'running';
                    return {
                      color: agent.color,
                      dot: isLast ? <LoadingOutlined style={{ color: agent.color }} /> : undefined,
                      children: (
                        <div style={{ paddingBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Tag color={agent.color} style={{ fontSize: 11, margin: 0 }}>{agent.name}</Tag>
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>{step.action}</Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }}>{step.output}</Text>
                          {step.artifact && (
                            <Tag
                              icon={<FileTextOutlined />}
                              color="blue"
                              style={{ marginTop: 4, fontSize: 11 }}
                            >
                              产出物: {step.artifact.title}
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
                  background: 'var(--dls-success-bg)',
                  border: '1px solid var(--dls-success-border)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                <div>
                  <Text strong style={{ fontSize: 13, color: '#52c41a' }}>全部完成</Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    调度 {teamAgents.length} 个 Agent，完成 {teamWorkflowSteps.length} 个任务，节省约 18 小时人工工时
                  </Text>
                  {sessionResult && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4, color: '#0066cc' }}>
                      实际结果：{sessionResult}
                    </Text>
                  )}
                </div>
              </div>
            )}
          </Card>
        </Col>

        {/* Right: Artifacts */}
        <Col span={7}>
          <Card
            title={<span><FileTextOutlined style={{ marginRight: 6 }} />产出物预览</span>}
            size="small"
            style={{ height: '100%' }}
          >
            {artifacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#8c8c8c' }}>
                <FileTextOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block' }} />
                <Text type="secondary">Agent 执行完成后，各阶段产出物将在此展示</Text>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {artifacts.map((step) => {
                  const agent = teamAgents.find((a) => a.id === step.agentId)!;
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
                        <Tag color={agent.color} style={{ margin: 0, fontSize: 11 }}>{agent.name}</Tag>
                        <Text strong style={{ fontSize: 12 }}>{step.artifact!.title}</Text>
                      </div>
                      <Text
                        style={{ fontSize: 11, color: 'var(--dls-text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.7 }}
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
        mode="team"
      />
    </div>
  );
};

export default EnterpriseAutopilot;
