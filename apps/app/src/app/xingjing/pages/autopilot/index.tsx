import { createSignal, createMemo, onMount, onCleanup, Show, For } from 'solid-js';
import {
  teamAgents,
  teamWorkflowSteps,
  teamSampleGoals,
  type AgentDef,
  type WorkflowStep,
  type AgentStatus,
} from '../../mock/autopilot';
import CreateProductModal from '../../components/product/new-product-modal';
import {
  Zap, Bot, CheckCircle, Loader2, Clock, PlayCircle, FileText, Network,
  Bug, Rocket, BarChart3, Users, Plus, AlertCircle, Send
} from 'lucide-solid';
import { useAppStore } from '../../stores/app-store';
import { aiSessionsApi } from '../../api';
import { themeColors, chartColors } from '../../utils/colors';

const agentIcon: Record<string, any> = {
  'pm-agent': FileText,
  'arch-agent': Network,
  'dev-agent': Bot,
  'qa-agent': Bug,
  'sre-agent': Rocket,
  'mgr-agent': BarChart3,
};

const statusBadge: Record<AgentStatus, { status: string; text: string; color: string }> = {
  idle: { status: 'default', text: '待命', color: themeColors.textMuted },
  thinking: { status: 'processing', text: '思考中', color: themeColors.primary },
  working: { status: 'processing', text: '执行中', color: themeColors.primary },
  done: { status: 'success', text: '完成', color: themeColors.success },
  waiting: { status: 'warning', text: '等待中', color: themeColors.warning },
};

const AgentCard = (props: { agent: AgentDef; status: AgentStatus; currentTask?: string }) => {
  const badge = statusBadge[props.status];
  const isActive = props.status === 'thinking' || props.status === 'working';
  const IconComponent = agentIcon[props.agent.id];

  return (
    <div
      style={{
        'border': `1px solid ${isActive ? props.agent.borderColor : props.status === 'done' ? themeColors.successBorder : themeColors.border}`,
        'border-radius': '8px',
        'background': isActive ? props.agent.bgColor : props.status === 'done' ? themeColors.successBg : themeColors.hover,
        padding: '12px',
        'transition': 'all 0.4s ease',
        'box-shadow': isActive ? `0 0 0 2px ${props.agent.borderColor}` : 'none',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '8px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            'border-radius': '8px',
            'background': isActive ? props.agent.color : props.status === 'done' ? themeColors.success : themeColors.textMuted,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            color: themeColors.surface,
            'font-size': '16px',
            'flex-shrink': 0,
            transition: 'background 0.3s',
          }}
        >
          {props.status === 'done' ? (
            <CheckCircle size={16} color="themeColors.surface" />
          ) : IconComponent ? (
            <IconComponent size={16} color="themeColors.surface" />
          ) : null}
        </div>
        <div style={{ flex: 1, 'min-width': 0 }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '2px' }}>
            <span style={{ 'font-size': '13px', 'font-weight': 600, color: themeColors.textPrimary }}>{props.agent.name}</span>
            <div style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '4px',
              'font-size': '11px',
              color: badge.color,
            }}>
              <span style={{ width: '6px', height: '6px', 'border-radius': '50%', 'background-color': badge.color }}></span>
              {badge.text}
            </div>
          </div>
          <div style={{ 'font-size': '11px', color: themeColors.textMuted, display: 'block' }}>{props.agent.role}</div>
          <Show when={props.currentTask}>
            <div style={{ 'font-size': '11px', color: props.agent.color, display: 'block', 'margin-top': '2px' }}>
              {(isActive) && (
                <Loader2 size={12} style={{ display: 'inline-block', 'margin-right': '4px', animation: 'spin 1s linear infinite' }} />
              )}
              {props.currentTask}
            </div>
          </Show>
          <div style={{ 'margin-top': '4px', display: 'flex', 'flex-wrap': 'wrap', gap: '2px' }}>
            <For each={props.agent.skills.slice(0, 2)}>
              {(s) => (
                <span
                  style={{
                    'font-size': '10px',
                    'line-height': '16px',
                    padding: '0 4px',
                    margin: 0,
                    'border': `1px solid ${themeColors.border}`,
                    'border-radius': '4px',
                    display: 'inline-block',
                  }}
                >
                  {s}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};

type RunState = 'idle' | 'running' | 'done';

const EnterpriseAutopilot = () => {
  const store = useAppStore();
  const teamProducts = createMemo(() => store.state.products.filter((p) => p.mode === 'team'));
  const currentProject = createMemo(() => teamProducts()[0]?.id);

  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = createSignal<Record<string, AgentStatus>>(
    Object.fromEntries(teamAgents.map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<Record<string, string>>({});
  const [visibleSteps, setVisibleSteps] = createSignal<WorkflowStep[]>([]);
  const [artifacts, setArtifacts] = createSignal<WorkflowStep[]>([]);
  const [progress, setProgress] = createSignal(0);
  const [sessionResult, setSessionResult] = createSignal<string | null>(null);
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  const [isUsingApi, setIsUsingApi] = createSignal(false);

  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timersRef.forEach(clearTimeout);
    timersRef.length = 0;
  };

  const reset = () => {
    clearTimers();
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(teamAgents.map((a) => [a.id, 'idle'])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setProgress(0);
    setSessionResult(null);
    setSessionId(null);
    setIsUsingApi(false);
  };

  const startMockSimulation = () => {
    let cumulativeDelay = 400;
    const totalSteps = teamWorkflowSteps.length;

    teamWorkflowSteps.forEach((step, idx) => {
      cumulativeDelay += step.durationMs;

      // Activate agent: thinking
      const t1 = setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'thinking' }));
        setAgentTasks((prev) => ({ ...prev, [step.agentId]: step.action }));
      }, cumulativeDelay - step.durationMs + 200);
      timersRef.push(t1);

      // Agent: working
      const t2 = setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [step.agentId]: 'working' }));
      }, cumulativeDelay - step.durationMs + 500);
      timersRef.push(t2);

      // Step appears in timeline
      const t3 = setTimeout(() => {
        setVisibleSteps((prev) => [...prev, step]);
        setProgress(Math.round(((idx + 1) / totalSteps) * 100));
        if (step.artifact) {
          setArtifacts((prev) => [...prev, step]);
        }
        // Mark agent done after last step
        const lastIdx = teamWorkflowSteps.reduce(
          (acc: number, s, i) => (s.agentId === step.agentId ? i : acc),
          -1
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
      timersRef.push(t3);
    });
  };

  const handleStart = async () => {
    if (!goal().trim()) return;
    reset();
    setRunState('running');

    try {
      // 尝试创建真实 AI 会话
      const session = await aiSessionsApi.create(goal());
      setSessionId(session.id);
      setIsUsingApi(true);

      // 轮询会话状态
      const cleanup = await aiSessionsApi.poll(
        session.id,
        (updatedSession) => {
          // 更新 Agent 状态
          if (updatedSession.agentStates) {
            const newStatuses: Record<string, AgentStatus> = {};
            updatedSession.agentStates.forEach((state) => {
              newStatuses[state.agentId] = state.status as AgentStatus;
            });
            setAgentStatuses(newStatuses);
          }

          // 更新进度
          if (updatedSession.progress !== undefined) {
            setProgress(updatedSession.progress);
          }

          // 检查完成状态
          if (updatedSession.status === 'done') {
            setRunState('done');
            setSessionResult(updatedSession.result || '任务完成');
          } else if (updatedSession.status === 'failed') {
            setRunState('idle');
            setSessionResult('任务失败，请重试');
          }
        },
        2000 // 每 2 秒轮询一次
      );

      onCleanup(cleanup);
    } catch (err) {
      console.warn('API unavailable, using mock simulation', err);
      setIsUsingApi(false);
      // 降级到本地模拟
      startMockSimulation();
    }
  };

  onMount(() => {
    if (timelineRef) {
      const scrollInterval = setInterval(() => {
        if (timelineRef) {
          timelineRef.scrollTop = timelineRef.scrollHeight;
        }
      }, 100);
      onCleanup(() => clearInterval(scrollInterval));
    }
  });

  onCleanup(() => {
    clearTimers();
  });

  const doneCount = createMemo(() =>
    Object.values(agentStatuses()).filter((s) => s === 'done').length
  );

  return (
    <div style={{ 'max-width': '1400px', margin: '0 auto' }}>
      {/* Empty State Banner */}
      <Show when={teamProducts().length === 0}>
        <div
          style={{
            'margin-bottom': '20px',
            'background': `linear-gradient(135deg, ${themeColors.primaryBg} 0%, ${themeColors.primaryBg} 100%)`,
            'border': `1px dashed ${themeColors.primaryBorder}`,
            'border-radius': '8px',
            padding: '16px',
            'text-align': 'center',
          }}
        >
          <div style={{ padding: '16px 0' }}>
            <Bot size={48} style={{ color: chartColors.primary, 'margin-bottom': '12px', display: 'block' }} />
            <h4 style={{ margin: '0 0 8px', color: chartColors.primary }}>欢迎使用星静工程效能平台</h4>
            <div style={{ 'font-size': '14px', color: themeColors.textSecondary }}>
              你还没有创建任何产品，从新建产品开始你的团队研发之旅吧
            </div>
            <div style={{ 'margin-top': '16px' }}>
              <button
                onClick={() => setCreateModalOpen(true)}
                style={{
                  background: chartColors.primary,
                  color: 'white',
                  border: 'none',
                  'border-radius': '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  'font-size': '14px',
                  'font-weight': 500,
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: '6px',
                }}
              >
                <Plus size={16} />
                立即创建第一个产品
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Info Banner */}
      <div
        style={{
          background: themeColors.primaryBg,
          'border': `1px solid ${themeColors.primaryBorder}`,
          'border-radius': '8px',
          'border-left': `4px solid ${chartColors.primary}`,
          padding: '10px 16px',
          'margin-bottom': '20px',
          'font-size': '14px',
        }}
      >
        <strong style={{ color: chartColors.primary }}>团队版 · Agent 自动驾驶</strong>
        <span style={{ color: themeColors.textSecondary, 'margin-left': '8px' }}>
          专为多角色协作团队打造，为 PM / 架构师 / 开发 / QA / SRE / 管理层分别提供专属 Agent 与工作坊，输出物经评审门控，保留完整决策可追溯性
        </span>
      </div>

      {/* Goal Input */}
      <div
        style={{
          'border': `1px solid ${themeColors.border}`,
          'border-radius': '8px',
          padding: '16px',
          background: themeColors.surface,
          'margin-bottom': '20px',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '12px', 'font-weight': 600 }}>
          <Zap size={16} style={{ color: chartColors.primary }} />
          输入目标，启动 Agent 自动驾驶
        </div>
        <textarea
          value={goal()}
          onInput={(e) => setGoal(e.currentTarget.value)}
          placeholder="描述你的目标，例如：为苍穹财务增加「智能费用报销审批」功能..."
          disabled={runState() === 'running'}
          style={{
            width: '100%',
            'min-height': '80px',
            'margin-bottom': '12px',
            'font-size': '14px',
            padding: '8px 12px',
            'border': `1px solid ${themeColors.border}`,
            'border-radius': '6px',
            'font-family': 'inherit',
          }}
        />
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>快速示例：</span>
          <For each={teamSampleGoals}>
            {(g) => (
              <button
                onClick={() => {
                  if (runState() !== 'running') setGoal(g);
                }}
                disabled={runState() === 'running'}
                style={{
                  'border': `1px solid ${themeColors.border}`,
                  'border-radius': '12px',
                  padding: '2px 8px',
                  'font-size': '12px',
                  'max-width': '260px',
                  'overflow': 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                  background: themeColors.surface,
                  cursor: 'pointer',
                }}
              >
                {g.slice(0, 30)}…
              </button>
            )}
          </For>
          <div style={{ 'margin-left': 'auto', display: 'flex', gap: '8px' }}>
            {runState() !== 'idle' && (
              <button
                onClick={reset}
                disabled={runState() === 'running'}
                style={{
                  background: themeColors.surface,
                  'border': `1px solid ${themeColors.border}`,
                  'border-radius': '6px',
                  padding: '6px 16px',
                  cursor: 'pointer',
                  'font-size': '14px',
                }}
              >
                重置
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={runState() === 'running' || !goal().trim()}
              style={{
                background: chartColors.primary,
                color: 'white',
                'border': 'none',
                'border-radius': '6px',
                padding: '6px 16px',
                cursor: 'pointer',
                'font-size': '14px',
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                opacity: (runState() === 'running' || !goal().trim()) ? 0.5 : 1,
              }}
            >
              {runState() === 'running' ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  执行中…
                </>
              ) : runState() === 'done' ? (
                <>
                  <PlayCircle size={14} />
                  重新启动
                </>
              ) : (
                <>
                  <PlayCircle size={14} />
                  启动自动驾驶
                </>
              )}
            </button>
          </div>
        </div>
        {runState() !== 'idle' && (
          <div style={{ 'margin-top': '12px' }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                {runState() === 'done'
                  ? '所有 Agent 执行完成'
                  : `正在执行... ${doneCount()}/${teamAgents.length} 个 Agent 完成`}
              </span>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{progress()}%</span>
            </div>
            <div
              style={{
                background: themeColors.border,
                'border-radius': '4px',
                height: '6px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: runState() === 'done' ? chartColors.success : chartColors.primary,
                  height: '100%',
                  'border-radius': '4px',
                  width: `${progress()}%`,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px' }}>
        {/* Left: Agent Grid */}
        <div
          style={{
            'border': `1px solid ${themeColors.border}`,
            'border-radius': '8px',
            padding: '16px',
            background: themeColors.surface,
          }}
        >
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '12px', 'font-weight': 600 }}>
            <Bot size={16} />
            Agent 团队（{doneCount()}/{teamAgents.length} 完成）
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={teamAgents}>
              {(agent) => (
                <AgentCard
                  agent={agent}
                  status={agentStatuses()[agent.id]}
                  currentTask={agentTasks()[agent.id]}
                />
              )}
            </For>
          </div>
        </div>

        {/* Center: Execution Timeline */}
        <div
          style={{
            'border': `1px solid ${themeColors.border}`,
            'border-radius': '8px',
            padding: '16px',
            background: themeColors.surface,
          }}
        >
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '12px', 'font-weight': 600 }}>
            <Clock size={16} />
            执行时间轴
          </div>
          {visibleSteps().length === 0 ? (
            <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted }}>
              <Bot size={40} style={{ 'margin-bottom': '12px', display: 'block' }} />
              <div style={{ 'font-size': '14px' }}>启动自动驾驶后，Agent 执行过程将在此实时显示</div>
            </div>
          ) : (
            <div
              ref={timelineRef}
              style={{
                'max-height': '520px',
                'overflow-y': 'auto',
                'padding-right': '4px',
              }}
            >
              <For each={visibleSteps()}>
                {(step, idx) => {
                  const agent = teamAgents.find((a) => a.id === step.agentId)!;
                  const isLast = idx() === visibleSteps().length - 1 && runState() === 'running';
                  return (
                    <div style={{ 'padding-bottom': '16px', display: 'flex', gap: '12px' }}>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          'border-radius': '50%',
                          'background-color': isLast
                            ? 'transparent'
                            : agent.color,
                          'border': isLast
                            ? `2px solid ${agent.color}`
                            : 'none',
                          'flex-shrink': 0,
                          display: 'flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                        }}
                      >
                        {isLast && (
                          <Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '2px' }}>
                          <span
                            style={{
                              'display': 'inline-block',
                              'background': agent.color,
                              color: 'white',
                              padding: '0 6px',
                              'border-radius': '4px',
                              'font-size': '11px',
                              'margin': 0,
                            }}
                          >
                            {agent.name}
                          </span>
                          <span style={{ 'font-size': '12px', 'font-weight': 600 }}>{step.action}</span>
                        </div>
                        <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>{step.output}</div>
                        {step.artifact && (
                          <div
                            style={{
                              'margin-top': '4px',
                              background: themeColors.hover,
                              padding: '4px 8px',
                              'border-radius': '4px',
                              'border': `1px solid ${agent.borderColor}`,
                              'font-size': '11px',
                            }}
                          >
                            <FileText size={12} style={{ display: 'inline-block', 'margin-right': '4px' }} />
                            产出物: {step.artifact.title}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          )}

          {runState() === 'done' && (
            <div
              style={{
                'margin-top': '12px',
                padding: '10px 14px',
                background: themeColors.successBg,
                'border': `1px solid ${themeColors.successBorder}`,
                'border-radius': '8px',
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
              }}
            >
              <CheckCircle size={16} style={{ color: chartColors.success }} />
              <div>
                <div style={{ 'font-weight': 600, 'font-size': '13px', color: chartColors.success }}>全部完成</div>
                <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                  调度 {teamAgents.length} 个 Agent，完成 {teamWorkflowSteps.length} 个任务，节省约 18 小时人工工时
                </div>
                {sessionResult() && (
                  <div style={{ 'font-size': '12px', color: chartColors.primary, 'margin-top': '4px' }}>
                    实际结果：{sessionResult()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Artifacts */}
        <div
          style={{
            'border': `1px solid ${themeColors.border}`,
            'border-radius': '8px',
            padding: '16px',
            background: themeColors.surface,
          }}
        >
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '12px', 'font-weight': 600 }}>
            <FileText size={16} />
            产出物预览
          </div>
          {artifacts().length === 0 ? (
            <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted }}>
              <FileText size={40} style={{ 'margin-bottom': '12px', display: 'block' }} />
              <div style={{ 'font-size': '14px' }}>Agent 执行完成后，各阶段产出物将在此展示</div>
            </div>
          ) : (
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
              <For each={artifacts()}>
                {(step) => {
                  const agent = teamAgents.find((a) => a.id === step.agentId)!;
                  return (
                    <div
                      style={{
                        padding: '10px 12px',
                        'background': agent.bgColor,
                        'border': `1px solid ${agent.borderColor}`,
                        'border-radius': '8px',
                      }}
                    >
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '6px' }}>
                        <span
                          style={{
                            'display': 'inline-block',
                            'background': agent.color,
                            color: 'white',
                            padding: '0 6px',
                            'border-radius': '4px',
                            'font-size': '11px',
                            'margin': 0,
                          }}
                        >
                          {agent.name}
                        </span>
                        <span style={{ 'font-weight': 600, 'font-size': '12px' }}>{step.artifact!.title}</span>
                      </div>
                      <div
                        style={{
                          'font-size': '11px',
                          color: themeColors.textSecondary,
                          'white-space': 'pre-line',
                          'line-height': '1.7',
                        }}
                      >
                        {step.artifact!.content}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </div>
      </div>

      <CreateProductModal
        open={createModalOpen()}
        onClose={() => setCreateModalOpen(false)}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default EnterpriseAutopilot;
