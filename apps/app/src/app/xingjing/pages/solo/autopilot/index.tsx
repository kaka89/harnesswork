import { createSignal, Show, For, onCleanup } from 'solid-js';
import { FileText, PlayCircle, CheckCircle, Clock, Zap } from 'lucide-solid';
import CreateProductModal from '../../../components/product/new-product-modal';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { soloAgents, soloWorkflowSteps, soloSampleGoals } from '../../../mock/autopilot';
import { callAgent } from '../../../services/opencode-client';

interface AgentStatus {
  [key: string]: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
}

interface AgentTasks {
  [key: string]: string;
}

interface AgentDone {
  [key: string]: number;
}

const statusBadge: Record<string, { status: string; text: string }> = {
  idle:     { status: 'default',    text: '待命' },
  thinking: { status: 'processing', text: '思考中' },
  working:  { status: 'processing', text: '执行中' },
  done:     { status: 'success',    text: '完成' },
  waiting:  { status: 'warning',    text: '等待中' },
};

const agentNameToId: Record<string, string> = {
  'AI产品搭档': 'product-brain',
  'AI工程搭档': 'eng-brain',
  'AI增长搭档': 'growth-brain',
  'AI运营搭档': 'ops-brain',
};

const SoloBrainCard = (props: {
  agent: typeof soloAgents[0];
  status: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
  currentTask?: string;
  doneToday: number;
}) => {
  const badge = statusBadge[props.status];
  const isActive = props.status === 'thinking' || props.status === 'working';
  const isDone = props.status === 'done';

  return (
    <div
      style={{
        'border-radius': '8px',
        padding: '16px',
        border: `1px solid ${isActive ? props.agent.borderColor : isDone ? themeColors.successBorder : themeColors.border}`,
        background: isActive ? props.agent.bgColor : isDone ? themeColors.successBg : themeColors.hover,
        transition: 'all 0.4s ease',
        'box-shadow': isActive ? `0 0 12px ${props.agent.borderColor}88` : 'none',
        'text-align': 'center',
      }}
    >
      <div style={{
        'font-size': '32px',
        'margin-bottom': '8px',
        filter: props.status === 'idle' ? 'grayscale(100%) opacity(0.4)' : 'none',
        transition: 'filter 0.3s',
      }}>
        {props.agent.emoji}
      </div>

      <div style={{ margin: '0 0 2px', 'font-size': '14px', 'font-weight': '600', color: isActive ? props.agent.color : undefined }}>
        {props.agent.name}
      </div>
      <div style={{ 'margin-bottom': '6px', 'font-size': '11px' }}>
        {badge.text}
      </div>

      <div style={{ 'min-height': '32px', 'font-size': '11px' }}>
        <Show when={props.currentTask && isActive}>
          <div style={{ color: props.agent.color }}>
            {props.currentTask}
          </div>
        </Show>
        <Show when={isDone}>
          <div style={{ color: chartColors.success }}>
            已完成
          </div>
        </Show>
        <Show when={props.status === 'idle'}>
          <div style={{ color: themeColors.textMuted }}>
            {props.agent.description}
          </div>
        </Show>
      </div>

      <Show when={props.doneToday > 0}>
        <div style={{ 'margin-top': '8px' }}>
          <div style={{
            display: 'inline-flex',
            'align-items': 'center',
            padding: '2px 8px',
            'border-radius': '4px',
            'font-size': '11px',
            border: `1px solid ${themeColors.border}`,
            background: props.agent.color + '20',
            color: props.agent.color,
          }}>
            今日已完成 {props.doneToday}
          </div>
        </div>
      </Show>

      <div style={{ 'margin-top': '8px', display: 'flex', 'flex-wrap': 'wrap', gap: '3px', 'justify-content': 'center' }}>
        <For each={props.agent.skills.slice(0, 2)}>
          {(skill) => (
            <div style={{
              display: 'inline-flex',
              'align-items': 'center',
              padding: '2px 8px',
              'border-radius': '4px',
              'font-size': '10px',
              border: `1px solid ${themeColors.border}`,
              margin: '0',
            }}>
              {skill}
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

type RunState = 'idle' | 'running' | 'done';

const SoloAutopilot = () => {
  const { state, productStore } = useAppStore();
  const soloProducts = () => state.products.filter((p: { mode: string }) => p.mode === 'solo');

  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = createSignal<AgentStatus>(
    Object.fromEntries(soloAgents.map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<AgentTasks>({});
  const [agentDone, setAgentDone] = createSignal<AgentDone>(
    Object.fromEntries(soloAgents.map((a) => [a.id, 0]))
  );
  const [visibleSteps, setVisibleSteps] = createSignal<typeof soloWorkflowSteps>([]);
  const [artifacts, setArtifacts] = createSignal<typeof soloWorkflowSteps>([]);
  const [progress, setProgress] = createSignal(0);

  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timersRef.forEach(clearTimeout);
    timersRef.length = 0;
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

  // ─── 解析流式文本为 Timeline 步骤 ───
  const updateFromStream = (text: string) => {
    const parts = text.split(/^## /m);
    const steps: typeof soloWorkflowSteps = [];
    const seenAgents: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const nlIdx = part.indexOf('\n');
      const header = (nlIdx >= 0 ? part.slice(0, nlIdx) : part).trim();
      const body = nlIdx >= 0 ? part.slice(nlIdx + 1).trim() : '';

      let agentId = '';
      for (const [name, id] of Object.entries(agentNameToId)) {
        if (header.includes(name)) { agentId = id; break; }
      }
      if (!agentId) continue;
      if (!seenAgents.includes(agentId)) seenAgents.push(agentId);

      const agent = soloAgents.find(a => a.id === agentId);
      const lines = body.split('\n').filter(l => l.trim());
      const action = (lines[0] || '执行中...').replace(/^[-\d.*]+\s*/, '').slice(0, 80);
      const outputLines = lines.slice(1);

      const artIdx = outputLines.findIndex(l => /^###\s/.test(l) || l.includes('产出物'));
      let artifact: { title: string; content: string } | undefined;
      let output: string;

      if (artIdx >= 0) {
        output = outputLines.slice(0, artIdx).map(l => l.trim()).join('\n') || action;
        const artTitle = outputLines[artIdx].replace(/^###\s*/, '').trim() || `${agent?.name || ''}产出`;
        const artContent = outputLines.slice(artIdx + 1).join('\n').trim();
        if (artContent) artifact = { title: artTitle, content: artContent.slice(0, 500) };
      } else {
        output = outputLines.slice(0, 3).join('\n') || '执行中...';
      }

      steps.push({
        id: `real-${i}`, agentId, agentName: agent?.name || header,
        action, output, durationMs: 0, artifact,
      });
    }

    if (steps.length > 0) {
      setVisibleSteps(steps);
      setArtifacts(steps.filter(s => s.artifact));
      const statuses: Record<string, string> = {};
      const tasks: Record<string, string> = {};
      soloAgents.forEach(a => { statuses[a.id] = 'thinking'; tasks[a.id] = ''; });
      seenAgents.forEach((id, i) => {
        if (i < seenAgents.length - 1) {
          statuses[id] = 'done'; tasks[id] = '';
        } else {
          statuses[id] = 'working';
          const lastStep = steps.filter(s => s.agentId === id).pop();
          tasks[id] = lastStep?.action || '执行中...';
        }
      });
      setAgentStatuses(statuses as AgentStatus);
      setAgentTasks(tasks);
      setProgress(Math.round((seenAgents.length / soloAgents.length) * 80));
    } else if (text.trim()) {
      setAgentStatuses(prev => ({ ...prev, 'product-brain': 'working' }));
      setAgentTasks(prev => ({ ...prev, 'product-brain': '分析目标中...' }));
      setProgress(5);
    }
  };

  // ─── Mock 降级模拟（OpenCode 不可用时使用） ───
  const runMockSimulation = () => {
    const staggerOffset = 300;
    const totalSteps = soloWorkflowSteps.length;
    soloWorkflowSteps.forEach((step, idx) => {
      const baseDelay = idx * staggerOffset + 500;
      const t1 = setTimeout(() => {
        setAgentStatuses(prev => ({ ...prev, [step.agentId]: 'thinking' }));
        setAgentTasks(prev => ({ ...prev, [step.agentId]: step.action }));
      }, baseDelay);
      timersRef.push(t1);
      const t2 = setTimeout(() => {
        setAgentStatuses(prev => ({ ...prev, [step.agentId]: 'working' }));
      }, baseDelay + 400);
      timersRef.push(t2);
      const t3 = setTimeout(() => {
        setAgentStatuses(prev => ({ ...prev, [step.agentId]: 'done' }));
        setAgentTasks(prev => ({ ...prev, [step.agentId]: '' }));
        setAgentDone(prev => ({ ...prev, [step.agentId]: (prev[step.agentId] || 0) + 1 }));
        setVisibleSteps(prev => [...prev, step]);
        setProgress(Math.round(((idx + 1) / totalSteps) * 100));
        if (step.artifact) setArtifacts(prev => [...prev, step]);
        if (idx === totalSteps - 1) setRunState('done');
      }, baseDelay + step.durationMs);
      timersRef.push(t3);
    });
  };

  // ─── handleStart: 真实 callAgent 调用 + mock 降级 ───
  const handleStart = () => {
    if (!goal().trim()) return;
    reset();
    setRunState('running');
    setAgentStatuses(Object.fromEntries(soloAgents.map(a => [a.id, 'thinking'])));

    const workDir = productStore.activeProduct()?.workDir;
    callAgent({
      systemPrompt: `你是星静独立版 AI 虚拟团队，负责全自动完成用户的产品目标。你同时扮演 4 个角色并行工作。
请依次以每个角色的视角输出执行计划和结果。每个角色用 "## 角色名" 开头：
- ## AI产品搭档
- ## AI工程搭档
- ## AI运营搭档
- ## AI增长搭档

每个角色输出：
1. 第一行：执行动作（一句话概括）
2. 后续行：执行结果（要点列表）
3. 如有具体产出，用 "### 产出物" 子标题标记
保持简洁，每个角色输出不超过 8 行。`,
      userPrompt: goal(),
      directory: workDir,
      title: `xingjing-solo-autopilot-${Date.now()}`,
      onText: (accumulated) => updateFromStream(accumulated),
      onDone: (fullText) => {
        updateFromStream(fullText);
        setAgentStatuses(Object.fromEntries(soloAgents.map(a => [a.id, 'done'])));
        setAgentTasks({});
        setAgentDone(prev => {
          const n: AgentDone = { ...prev };
          soloAgents.forEach(a => { n[a.id] = (n[a.id] || 0) + 1; });
          return n;
        });
        setProgress(100);
        setRunState('done');
      },
      onError: () => {
        // OpenCode 不可用，降级到 mock 模拟
        reset();
        setRunState('running');
        runMockSimulation();
      },
    });
  };

  onCleanup(() => clearTimers());

  const doneAgents = () => Object.values(agentStatuses()).filter((s) => s === 'done').length;

  return (
    <div style={{ 'max-width': '1200px', margin: '0 auto' }}>
      {/* Empty State Banner — 仅在从未创建过任何产品时显示，与模式无关 */}
      <Show when={productStore.products().length === 0}>
        <div style={{
          'margin-bottom': '20px',
          background: `linear-gradient(135deg, ${themeColors.successBg} 0%, ${themeColors.successBg} 100%)`,
          border: `1px dashed ${themeColors.successBorder}`,
          'text-align': 'center',
          'border-radius': '8px',
          padding: '16px',
        }}>
          <div style={{ 'font-size': '48px', color: chartColors.success, 'margin-bottom': '12px', display: 'block' }}>
            🤖
          </div>
          <div style={{ margin: '0 0 8px', color: themeColors.success, 'font-weight': '600', 'font-size': '16px' }}>开始你的独立产品之旅</div>
          <div style={{ 'font-size': '14px', color: themeColors.textSecondary, 'margin-bottom': '16px' }}>
            还没有创建项目？先建一个，让 AI 虚拟团队为你服务
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            style={{
              background: chartColors.success,
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              padding: '8px 24px',
              'font-size': '14px',
              cursor: 'pointer',
            }}
          >
            创建我的第一个产品
          </button>
        </div>
      </Show>

      <div style={{
        'margin-bottom': '20px',
        'border-radius': '8px',
        padding: '8px 14px',
        background: themeColors.primaryBg,
        border: `1px solid ${themeColors.primaryBorder}`,
        'font-size': '12px',
      }}>
        <strong style={{ color: chartColors.primary }}>独立版 · 自动驾驶</strong>
        <span style={{ color: themeColors.textSecondary, 'margin-left': '8px' }}>
          你就是所有角色，AI 直接替你执行，4 个虚拟角色脑并行调度，无审批流程，适合快速验证和迭代
        </span>
      </div>

      <div style={{
        border: `1px solid ${themeColors.border}`,
        'border-radius': '8px',
        padding: '16px',
        background: themeColors.surface,
        'margin-bottom': '20px',
        'border-color': runState() !== 'idle' ? themeColors.successBorder : undefined,
      }}>
        <div style={{
          'font-weight': '600',
          'margin-bottom': '12px',
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
        }}>
          <Zap size={16} style={{ color: chartColors.success }} />
          告诉 AI 你想做什么
        </div>
        <div style={{
          display: 'flex',
          gap: '8px',
          'margin-bottom': '12px',
        }}>
          <input
            type="text"
            value={goal()}
            onInput={(e) => setGoal(e.currentTarget.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && runState() !== 'running' && goal().trim()) handleStart();
            }}
            placeholder="一句话描述目标，例如：实现「段落重写」MVP 功能并上线灰度..."
            disabled={runState() === 'running'}
            style={{
              flex: '1',
              'font-size': '14px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              padding: '8px 12px',
              outline: 'none',
              opacity: runState() === 'running' ? 0.6 : 1,
            }}
          />
          <button
            onClick={handleStart}
            disabled={runState() === 'running' || !goal().trim()}
            style={{
              background: chartColors.success,
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              padding: '8px 16px',
              cursor: runState() === 'running' || !goal().trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              opacity: runState() === 'running' || !goal().trim() ? 0.6 : 1,
            }}
          >
            {runState() === 'running' ? '执行中…' : '启动'}
          </button>
        </div>

        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>快速示例：</span>
          <For each={soloSampleGoals}>
            {(g) => (
              <div
                onClick={() => {
                  if (runState() !== 'running') setGoal(g);
                }}
                style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  padding: '2px 12px',
                  'border-radius': '12px',
                  'font-size': '12px',
                  border: `1px solid ${chartColors.success}`,
                  background: chartColors.success,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {g.slice(0, 24)}…
              </div>
            )}
          </For>
          <Show when={runState() !== 'idle'}>
            <button
              onClick={reset}
              disabled={runState() === 'running'}
              style={{
                'margin-left': 'auto',
                background: themeColors.surface,
                border: `1px solid ${themeColors.border}`,
                'border-radius': '6px',
                padding: '4px 12px',
                'font-size': '12px',
                cursor: runState() === 'running' ? 'not-allowed' : 'pointer',
                opacity: runState() === 'running' ? 0.6 : 1,
              }}
            >
              重置
            </button>
          </Show>
        </div>

        <Show when={runState() !== 'idle'}>
          <div style={{ 'margin-top': '12px' }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                {runState() === 'done'
                  ? `全部完成 · 4 个角色脑并行调度`
                  : `并行调度中... ${doneAgents()}/4 个脑已完成`}
              </span>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{progress()}%</span>
            </div>
            <div style={{
              background: themeColors.border,
              'border-radius': '4px',
              height: '6px',
            }}>
              <div style={{
                background: runState() === 'done' ? chartColors.success : chartColors.primary,
                height: '100%',
                'border-radius': '4px',
                width: `${progress()}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </Show>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px', 'margin-bottom': '20px' }}>
        <For each={soloAgents}>
          {(agent) => (
            <SoloBrainCard
              agent={agent}
              status={agentStatuses()[agent.id] as any}
              currentTask={agentTasks()[agent.id]}
              doneToday={agentDone()[agent.id]}
            />
          )}
        </For>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        <div style={{
          border: `1px solid ${themeColors.border}`,
          'border-radius': '8px',
          padding: '16px',
          background: themeColors.surface,
        }}>
          <div style={{
            'font-weight': '600',
            'margin-bottom': '12px',
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
          }}>
            <Clock size={16} />
            执行流（并行 · 无审批）
          </div>
          <Show
            when={visibleSteps().length === 0}
            fallback={
              <div ref={timelineRef} style={{
                'max-height': '380px',
                'overflow-y': 'auto',
                'padding-right': '4px',
              }}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <For each={visibleSteps()}>
                    {(step, idx) => {
                      const agent = soloAgents.find((a) => a.id === step.agentId)!;
                      const isLast = idx() === visibleSteps().length - 1 && runState() === 'running';
                      return (
                        <div style={{
                          display: 'flex',
                          gap: '12px',
                          'padding-bottom': '4px',
                        }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            'border-radius': '50%',
                            background: agent.color,
                            display: 'flex',
                            'align-items': 'center',
                            'justify-content': 'center',
                            color: themeColors.surface,
                            'flex-shrink': '0',
                            'font-size': '14px',
                          }}>
                            {isLast ? '⟳' : agent.emoji}
                          </div>
                          <div style={{ flex: '1' }}>
                            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '2px' }}>
                              <div style={{
                                display: 'inline-flex',
                                'align-items': 'center',
                                padding: '2px 8px',
                                'border-radius': '4px',
                                'font-size': '11px',
                                border: `1px solid ${themeColors.border}`,
                                background: agent.color + '20',
                                color: agent.color,
                                margin: '0',
                              }}>
                                {agent.name}
                              </div>
                              <span style={{ 'font-size': '12px', 'font-weight': '600' }}>{step.action}</span>
                            </div>
                            <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>{step.output}</div>
                            <Show when={step.artifact}>
                              <div style={{
                                'margin-top': '4px',
                                'font-size': '11px',
                                padding: '4px 8px',
                                background: themeColors.successBg,
                                'border-radius': '4px',
                                color: chartColors.success,
                              }}>
                                ✓ {step.artifact?.title}
                              </div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            }
          >
            <div style={{
              'text-align': 'center',
              padding: '40px 0',
              color: themeColors.textMuted,
            }}>
              <PlayCircle size={36} style={{ 'margin-bottom': '10px', display: 'block' }} />
              <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>输入目标并启动，执行过程将在此实时显示</div>
            </div>
          </Show>

          <Show when={runState() === 'done'}>
            <div style={{
              'margin-top': '12px',
              padding: '10px 14px',
              background: themeColors.successBg,
              border: `1px solid ${themeColors.successBorder}`,
              'border-radius': '8px',
            }}>
              <CheckCircle size={16} style={{ color: chartColors.success, 'margin-right': '8px' }} />
              <strong style={{ color: chartColors.success, 'font-size': '13px' }}>全自动完成</strong>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': '8px' }}>
                4 个虚拟角色并行执行，{soloWorkflowSteps.length} 步完成，节省约 6 小时
              </span>
            </div>
          </Show>
        </div>

        <div style={{
          border: `1px solid ${themeColors.border}`,
          'border-radius': '8px',
          padding: '16px',
          background: themeColors.surface,
        }}>
          <div style={{
            'font-weight': '600',
            'margin-bottom': '12px',
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
          }}>
            <FileText size={16} />
            产出物
          </div>
          <Show
            when={artifacts().length === 0}
            fallback={
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                <For each={artifacts()}>
                  {(step) => {
                    const agent = soloAgents.find((a) => a.id === step.agentId)!;
                    return (
                      <div style={{
                        padding: '10px 12px',
                        background: agent.bgColor,
                        border: `1px solid ${agent.borderColor}`,
                        'border-radius': '8px',
                      }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '6px' }}>
                          <span style={{ 'font-size': '16px' }}>{agent.emoji}</span>
                          <div style={{
                            display: 'inline-flex',
                            'align-items': 'center',
                            padding: '2px 8px',
                            'border-radius': '4px',
                            'font-size': '11px',
                            border: `1px solid ${themeColors.border}`,
                            background: agent.color + '20',
                            color: agent.color,
                            margin: '0',
                          }}>
                            {agent.name}
                          </div>
                          <strong style={{ 'font-size': '12px' }}>{step.artifact?.title}</strong>
                        </div>
                        <div style={{
                          'font-size': '11px',
                          color: themeColors.textSecondary,
                          'white-space': 'pre-line',
                          'line-height': '1.7',
                        }}>
                          {step.artifact?.content}
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            }
          >
            <div style={{
              'text-align': 'center',
              padding: '40px 0',
              color: themeColors.textMuted,
            }}>
              <FileText size={36} style={{ 'margin-bottom': '10px', display: 'block' }} />
              <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>执行完成后产出物将在此展示</div>
            </div>
          </Show>
        </div>
      </div>

      <CreateProductModal
        open={createModalOpen()}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  );
};

export default SoloAutopilot;
