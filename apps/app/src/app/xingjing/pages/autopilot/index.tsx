import { createSignal, createMemo, onMount, onCleanup, Show, For } from 'solid-js';
import {
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
import { themeColors, chartColors } from '../../utils/colors';
import {
  TEAM_AGENTS,
  runOrchestratedAutopilot,
  runDirectAgent,
  parseMention,
  type DispatchItem,
  type AgentExecutionStatus,
} from '../../services/autopilot-executor';
import MentionInput from '../../components/autopilot/mention-input';

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
    Object.fromEntries(TEAM_AGENTS.map((a) => [a.id, 'idle' as AgentStatus]))
  );
  const [agentTasks, setAgentTasks] = createSignal<Record<string, string>>({});
  const [visibleSteps, setVisibleSteps] = createSignal<WorkflowStep[]>([]);
  const [artifacts, setArtifacts] = createSignal<WorkflowStep[]>([]);
  const [progress, setProgress] = createSignal(0);
  const [orchestratorText, setOrchestratorText] = createSignal('');
  const [dispatchPlan, setDispatchPlan] = createSignal<DispatchItem[]>([]);
  const [agentStreamTexts, setAgentStreamTexts] = createSignal<Record<string, string>>({});
  const [agentExecStatuses, setAgentExecStatuses] = createSignal<Record<string, AgentExecutionStatus>>({});
  const [agentError, setAgentError] = createSignal<string | null>(null);

  // 获取当前配置的模型（传给 callAgent）
  const getConfiguredModel = () => {
    const llm = store.state.llmConfig;
    if (llm.providerID && llm.modelID && llm.providerID !== 'custom') {
      return { providerID: llm.providerID, modelID: llm.modelID };
    }
    return undefined;
  };

  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timersRef.forEach(clearTimeout);
    timersRef.length = 0;
  };

  const reset = () => {
    clearTimers();
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(TEAM_AGENTS.map((a) => [a.id, 'idle' as AgentStatus])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setProgress(0);
    setOrchestratorText('');
    setDispatchPlan([]);
    setAgentStreamTexts({});
    setAgentExecStatuses({});
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
    setAgentError(null);
    setRunState('running');

    const workDir = store.productStore.activeProduct()?.workDir;
    const model = getConfiguredModel();
    const { targetAgent, cleanText } = parseMention(goal(), TEAM_AGENTS);

    if (targetAgent) {
      // @mention 直接调用模式：跳过 Orchestrator
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        model,
        onStatus: (status) => {
          const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
            idle: 'idle', pending: 'waiting', thinking: 'thinking',
            working: 'working', done: 'done', error: 'done',
          };
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: legacyMap[status] }));
        },
        onStream: (text) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: text }));
          setProgress(50);
        },
        onDone: (fullText) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: fullText }));
          setProgress(100);
          setRunState('done');
        },
        onError: (err) => {
          console.warn('[autopilot] @mention direct agent failed:', err);
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'idle' }));
          setAgentError(`调用 ${targetAgent.name} 失败：${err}`);
          setRunState('idle');
        },
      });
      return;
    }

    // Orchestrated 模式：两阶段调度
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: TEAM_AGENTS,
      workDir,
      model,
      onOrchestrating: (text) => {
        setOrchestratorText(text);
        setProgress(10);
      },
      onOrchestratorDone: (plan) => {
        setDispatchPlan(plan);
        const statuses: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => {
          statuses[agentId] = 'pending';
        });
        setAgentExecStatuses(statuses);
        setProgress(20);
      },
      onAgentStatus: (agentId, status) => {
        setAgentExecStatuses((prev) => ({ ...prev, [agentId]: status }));
        const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
          idle: 'idle', pending: 'waiting', thinking: 'thinking',
          working: 'working', done: 'done', error: 'done',
        };
        setAgentStatuses((prev) => ({ ...prev, [agentId]: legacyMap[status] }));
      },
      onAgentStream: (agentId, text) => {
        setAgentStreamTexts((prev) => ({ ...prev, [agentId]: text }));
        const doneCount = Object.values(agentExecStatuses()).filter(
          (s) => s === 'done',
        ).length;
        setProgress(
          20 + Math.round((doneCount / Math.max(dispatchPlan().length, 1)) * 70),
        );
      },
      onDone: (results) => {
        // 从 Agent 输出中提取产出物
        const artifactSteps: WorkflowStep[] = [];
        Object.entries(results).forEach(([agentId, text]) => {
          const agent = TEAM_AGENTS.find((a) => a.id === agentId);
          const artMatch = text.match(/###\s+产出物[：:]\s*(.+)\n([\s\S]+)/);
          if (artMatch && agent) {
            artifactSteps.push({
              id: `real-${agentId}`,
              agentId,
              agentName: agent.name,
              action: '执行完成',
              output: '',
              durationMs: 0,
              artifact: {
                title: artMatch[1].trim(),
                content: artMatch[2].trim().slice(0, 500),
              },
            });
          }
        });
        setArtifacts(artifactSteps);
        setProgress(100);
        setRunState('done');
      },
      onError: (err) => {
        console.warn('[autopilot] orchestration failed:', err);
        setAgentError(`编排执行失败：${err}`);
        setRunState('idle');
      },
    });
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
      {/* Empty State Banner — 仅在从未创建过任何产品时显示，与模式无关 */}
      <Show when={store.productStore.products().length === 0}>
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
        <MentionInput
          value={goal()}
          onChange={setGoal}
          disabled={runState() === 'running'}
          placeholder="描述你的目标，或输入 @ 直接调用某个 Agent，例如：为苍穹财务增加「智能费用报销审批」功能..."
          agents={TEAM_AGENTS}
          style={{ 'margin-bottom': '12px' }}
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
        {/* Agent 调用错误提示 */}
        <Show when={agentError() !== null}>
          <div style={{
            'margin-top': '10px',
            padding: '10px 14px',
            'border-radius': '6px',
            'font-size': '13px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            color: '#cf1322',
            display: 'flex',
            'align-items': 'flex-start',
            gap: '8px',
          }}>
            <span>⚠️</span>
            <div style={{ flex: '1' }}>
              <div style={{ 'font-weight': '600', 'margin-bottom': '4px' }}>AI 调用失败</div>
              <div>{agentError()}</div>
              <div style={{ 'margin-top': '6px', 'font-size': '12px', color: '#8c1a11' }}>
                请前往「设置 → 大模型配置」检查 API Key 是否已保存。
              </div>
            </div>
            <button
              onClick={() => setAgentError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', padding: '0' }}
            >✕</button>
          </div>
        </Show>
        {runState() !== 'idle' && (
          <div style={{ 'margin-top': '12px' }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                {runState() === 'done'
                  ? '所有 Agent 执行完成'
                  : `正在执行... ${doneCount()}/${TEAM_AGENTS.length} 个 Agent 完成`}
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
            Agent 团队（{doneCount()}/{TEAM_AGENTS.length} 完成）
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={TEAM_AGENTS}>
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
          {visibleSteps().length === 0 && dispatchPlan().length === 0 ? (
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
              {/* Phase 1: Orchestrator 思考输出 */}
              <Show when={orchestratorText() && dispatchPlan().length === 0}>
                <div style={{
                  padding: '10px 12px',
                  background: themeColors.primaryBg,
                  border: `1px solid ${themeColors.primaryBorder}`,
                  'border-radius': '6px',
                  'margin-bottom': '8px',
                }}>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: chartColors.primary, 'margin-bottom': '4px' }}>
                    Orchestrator 规划中...
                  </div>
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'white-space': 'pre-wrap', 'max-height': '120px', 'overflow-y': 'auto' }}>
                    {orchestratorText()}
                  </div>
                </div>
              </Show>

              {/* Phase 2: 各 Agent 流式输出 */}
              <For each={dispatchPlan()}>
                {(item) => {
                  const agent = TEAM_AGENTS.find((a) => a.id === item.agentId);
                  const text = () => agentStreamTexts()[item.agentId] ?? '';
                  const execStatus = () => agentExecStatuses()[item.agentId] ?? 'pending';
                  const isStreaming = () => execStatus() === 'thinking' || execStatus() === 'working';
                  if (!agent) return null;
                  return (
                    <div style={{ 'padding-bottom': '12px', display: 'flex', gap: '12px' }}>
                      <div style={{
                        width: '20px', height: '20px', 'border-radius': '50%', 'flex-shrink': 0,
                        'background-color': execStatus() === 'done' ? agent.color : 'transparent',
                        border: isStreaming() ? `2px solid ${agent.color}` : `2px solid ${themeColors.border}`,
                        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                      }}>
                        <Show when={isStreaming()}>
                          <Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} />
                        </Show>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
                          <span style={{
                            display: 'inline-block', background: agent.color, color: 'white',
                            padding: '0 6px', 'border-radius': '4px', 'font-size': '11px',
                          }}>
                            {agent.name}
                          </span>
                          <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
                            {item.task.slice(0, 40)}...
                          </span>
                        </div>
                        <Show when={text()}>
                          <div style={{
                            'font-size': '11px', color: themeColors.textSecondary,
                            'white-space': 'pre-wrap', 'line-height': '1.6',
                            'max-height': '200px', 'overflow-y': 'auto',
                            background: themeColors.hover, padding: '6px 8px', 'border-radius': '4px',
                          }}>
                            {text()}
                          </div>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>

              <For each={visibleSteps()}>
                {(step, idx) => {
                  const agent = TEAM_AGENTS.find((a) => a.id === step.agentId)!;
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
                  调度 {TEAM_AGENTS.length} 个 Agent，完成 {artifacts().length || teamWorkflowSteps.length} 个任务，节省约 18 小时人工工时
                </div>
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
                  const agent = TEAM_AGENTS.find((a) => a.id === step.agentId)!;
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
