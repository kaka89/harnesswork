import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  teamSampleGoals,
  type AgentDef,
  type WorkflowStep,
  type AgentStatus,
} from '../../mock/autopilot';
import CreateProductModal from '../../components/product/new-product-modal';
import {
  Bot, CheckCircle, Loader2, Clock, PlayCircle, FileText, Network,
  Bug, Rocket, BarChart3, Plus, Send, Settings, Zap,
  MessageSquare, Activity, X, ChevronLeft, ChevronRight,
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
import ArtifactWorkspace, { type ArtifactItem } from '../../components/autopilot/artifact-workspace';
import { modelOptions } from '../../mock/settings';
import {
  loadProjectSettings,
  loadAutopilotHistory,
  saveAutopilotHistory,
  type AutopilotChatMessage,
} from '../../services/file-store';
import { loadPipelineConfig, type PipelineConfig, type PipelineStage } from '../../services/pipeline-config';
import { runPipeline } from '../../services/pipeline-executor';

// ─── Status badge ────────────────────────────────────────────────────────────

const statusBadge: Record<AgentStatus, { text: string; color: string }> = {
  idle: { text: '待命', color: themeColors.textMuted },
  thinking: { text: '思考中', color: themeColors.primary },
  working: { text: '执行中', color: themeColors.primary },
  done: { text: '完成', color: themeColors.success },
  waiting: { text: '等待中', color: themeColors.warning },
};

// ─── Compact sidebar agent card ──────────────────────────────────────────────

const SidebarAgentCard = (props: {
  agent: AgentDef;
  status: AgentStatus;
  outputCount?: number;
  elapsedText?: string;
  onClick?: () => void;
  selected?: boolean;
}) => {
  const badge = statusBadge[props.status];
  const isActive = () => props.status === 'thinking' || props.status === 'working';

  return (
    <div
      onClick={props.onClick}
      style={{
        display: 'flex',
        'align-items': 'flex-start',
        gap: '10px',
        padding: '10px 12px',
        'border-radius': '6px',
        cursor: 'pointer',
        background: props.selected ? themeColors.primaryBg : isActive() ? props.agent.bgColor : 'transparent',
        'border-left': `3px solid ${isActive() || props.selected ? props.agent.color : 'transparent'}`,
        transition: 'all 0.2s',
      }}
    >
      <span style={{ 'font-size': '18px', 'flex-shrink': 0, 'margin-top': '1px' }}>{props.agent.emoji}</span>
      <div style={{ flex: 1, 'min-width': 0 }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <span style={{ 'font-size': '13px', 'font-weight': 600, color: themeColors.textPrimary }}>{props.agent.name}</span>
          <span style={{
            width: '6px', height: '6px', 'border-radius': '50%', 'flex-shrink': 0,
            'background-color': badge.color,
          }} />
        </div>
        <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '2px', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
          {props.agent.role}
        </div>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-top': '4px' }}>
          <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
            {props.elapsedText ?? '—'}
          </span>
          <Show when={(props.outputCount ?? 0) > 0}>
            <span style={{
              'font-size': '10px', color: chartColors.primary,
              background: themeColors.primaryBg, padding: '1px 6px', 'border-radius': '8px',
              'font-weight': 600,
            }}>
              {props.outputCount} 产出
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = AutopilotChatMessage & { isStreaming?: boolean };
type RunState = 'idle' | 'running' | 'done';

const formatTime = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const formatElapsed = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

// ─── Main component ──────────────────────────────────────────────────────────

const EnterpriseAutopilot = () => {
  const store = useAppStore();
  const navigate = useNavigate();

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
  const [directAnswer, setDirectAnswer] = createSignal<string | null>(null);

  // ─── Pipeline mode state ────────────────────────────────────────────────
  const [autopilotMode, setAutopilotMode] = createSignal<'instant' | 'pipeline'>('instant');
  const [pipelineConfig, setPipelineConfig] = createSignal<PipelineConfig | null>(null);
  const [pipelineStageStatuses, setPipelineStageStatuses] = createSignal<Record<string, PipelineStage['outputStatus']>>({});
  const [pipelineStageOutputs, setPipelineStageOutputs] = createSignal<Record<string, string>>({});
  const [pipelineGateResolver, setPipelineGateResolver] = createSignal<{ stageId: string; stageName: string; resolve: (v: 'approve' | 'reject') => void } | null>(null);

  // ─── Model selector state ─────────────────────────────────────────────────
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({});
  const [sessionModelId, setSessionModelId] = createSignal<string>(
    store.state.llmConfig.modelID ?? 'deepseek-chat'
  );
  const configuredModels = () =>
    modelOptions.filter(
      (opt) => opt.providerID !== 'custom' && (providerKeys()[opt.providerID]?.trim().length ?? 0) > 0
    );
  const getSessionModel = () => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return undefined;
    if (!providerKeys()[opt.providerID]) return undefined;
    return { providerID: opt.providerID, modelID: opt.modelID };
  };

  // ─── New cockpit state ────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = createSignal<'chat' | 'flow'>('chat');
  const [filterAgentId, setFilterAgentId] = createSignal<string | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = createSignal(false);
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [sessionId, setSessionId] = createSignal('session-' + Date.now());

  let chatScrollRef: HTMLDivElement | undefined;
  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => { timersRef.forEach(clearTimeout); timersRef.length = 0; };

  const resetExecution = () => {
    clearTimers();
    if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
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
    setDirectAnswer(null);
  };

  const pushMsg = (msg: Omit<ChatMessage, 'id'>) => {
    setChatMessages((prev) => [...prev, { ...msg, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
  };

  const updateLastAiMsg = (agentId: string, text: string, streaming: boolean) => {
    setChatMessages((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === 'ai' && prev[i].agentId === agentId) { idx = i; break; }
      }
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], text, isStreaming: streaming };
        return updated;
      }
      return prev;
    });
  };

  // ─── Handle start ─────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!goal().trim()) return;
    resetExecution();
    setAgentError(null);
    setRunState('running');
    setElapsedSeconds(0);
    elapsedInterval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    // Push user message
    pushMsg({ type: 'user', text: goal().trim(), time: formatTime() });

    const workDir = store.productStore.activeProduct()?.workDir;
    const model = getSessionModel();

    // ── 前置校验：模型未配置时立即报错，避免等待 SSE 超时 ──
    if (!model && configuredModels().length === 0) {
      setAgentError('尚未配置可用的大模型，请先前往「设置 → 大模型配置」填写 API Key 并保存');
      setRunState('idle');
      return;
    }

    // ── Pipeline 模式执行 ──
    if (autopilotMode() === 'pipeline') {
      const config = pipelineConfig();
      if (!config || config.stages.length === 0) {
        setAgentError('Pipeline 配置为空或未找到 orchestrator.yaml，请先在项目根目录创建配置文件');
        setRunState('idle');
        return;
      }
      pushMsg({ type: 'ai', agentId: 'pipeline', agentName: 'Pipeline', agentEmoji: '🔗', text: `正在执行 Pipeline（${config.stages.length} 个阶段）...`, time: formatTime(), isStreaming: true });
      const initStatuses: Record<string, PipelineStage['outputStatus']> = {};
      config.stages.forEach((s) => { initStatuses[s.id] = 'pending'; });
      setPipelineStageStatuses(initStatuses);
      setPipelineStageOutputs({});
      await runPipeline({
        config, goal: goal().trim(), workDir, model,
        callAgentFn: (o) => store.actions.callAgent(o),
        onStageStart: (stageId) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'running' }));
          const stage = config.stages.find((s) => s.id === stageId);
          pushMsg({ type: 'ai', agentId: stageId, agentName: stage?.name ?? stageId, agentEmoji: '⚙️', text: '执行中...', time: formatTime(), isStreaming: true });
        },
        onStageStream: (stageId, text) => {
          setPipelineStageOutputs((prev) => ({ ...prev, [stageId]: text }));
          updateLastAiMsg(stageId, text, true);
        },
        onStageComplete: (stageId, result) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'success' }));
          setPipelineStageOutputs((prev) => ({ ...prev, [stageId]: result }));
          updateLastAiMsg(stageId, result, false);
          const totalDone = Object.values(pipelineStageStatuses()).filter((s) => s === 'success' || s === 'failed' || s === 'skipped').length + 1;
          setProgress(Math.round((totalDone / config.stages.length) * 100));
        },
        onStageFailed: (stageId, error) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'failed' }));
          updateLastAiMsg(stageId, `执行失败：${error}`, false);
        },
        onGateWaiting: (stageId, stageName) => {
          return new Promise((resolve) => {
            setPipelineGateResolver({ stageId, stageName, resolve });
          });
        },
        onDone: () => { setProgress(100); setRunState('done'); updateLastAiMsg('pipeline', 'Pipeline 执行完成', false); },
        onError: (err) => { setAgentError(`Pipeline 执行失败：${err}`); setRunState('idle'); },
      });
      return;
    }

    const { targetAgent, cleanText } = parseMention(goal(), TEAM_AGENTS);

    if (targetAgent) {
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      pushMsg({ type: 'ai', agentId: targetAgent.id, agentName: targetAgent.name, agentEmoji: targetAgent.emoji, text: '正在思考...', time: formatTime(), isStreaming: true });
      await runDirectAgent(targetAgent, cleanText, {
        workDir, model,
        callAgentFn: (o) => store.actions.callAgent(o),
        onStatus: (status) => {
          const m: Record<AgentExecutionStatus, AgentStatus> = { idle: 'idle', pending: 'waiting', thinking: 'thinking', working: 'working', done: 'done', error: 'done' };
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: m[status] }));
        },
        onStream: (text) => { setAgentStreamTexts((p) => ({ ...p, [targetAgent.id]: text })); updateLastAiMsg(targetAgent.id, text, true); setProgress(50); },
        onDone: (text) => { setAgentStreamTexts((p) => ({ ...p, [targetAgent.id]: text })); updateLastAiMsg(targetAgent.id, text, false); setProgress(100); setRunState('done'); },
        onError: (err) => {
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'idle' }));
          setAgentError(`调用 ${targetAgent.name} 失败：${err}`);
          updateLastAiMsg(targetAgent.id, `调用失败：${err}`, false);
          setRunState('idle');
        },
      });
      return;
    }

    // Orchestrated mode
    pushMsg({ type: 'ai', agentId: 'orchestrator', agentName: 'Orchestrator', agentEmoji: '🤖', text: '好的，我将调度多个 Agent 来协同处理这个任务...', time: formatTime(), isStreaming: true });
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: TEAM_AGENTS, workDir, model,
      callAgentFn: (o) => store.actions.callAgent(o),
      onOrchestrating: (text) => { setOrchestratorText(text); updateLastAiMsg('orchestrator', text, true); setProgress(10); },
      onOrchestratorDone: (plan) => {
        setDispatchPlan(plan);
        const s: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => { s[agentId] = 'pending'; });
        setAgentExecStatuses(s);
        updateLastAiMsg('orchestrator', orchestratorText() + '\n\n已完成规划，正在调度 ' + plan.length + ' 个 Agent 执行...', false);
        setProgress(20);
        // Push agent placeholders
        plan.forEach(({ agentId, task }) => {
          const ag = TEAM_AGENTS.find((a) => a.id === agentId);
          if (ag) pushMsg({ type: 'ai', agentId, agentName: ag.name, agentEmoji: ag.emoji, text: `正在处理：${task.slice(0, 60)}...`, time: formatTime(), isStreaming: true });
        });
      },
      onAgentStatus: (agentId, status) => {
        setAgentExecStatuses((p) => ({ ...p, [agentId]: status }));
        const m: Record<AgentExecutionStatus, AgentStatus> = { idle: 'idle', pending: 'waiting', thinking: 'thinking', working: 'working', done: 'done', error: 'done' };
        setAgentStatuses((p) => ({ ...p, [agentId]: m[status] }));
      },
      onAgentStream: (agentId, text) => {
        setAgentStreamTexts((p) => ({ ...p, [agentId]: text }));
        updateLastAiMsg(agentId, text, true);
        const done = Object.values(agentExecStatuses()).filter((s) => s === 'done').length;
        setProgress(20 + Math.round((done / Math.max(dispatchPlan().length, 1)) * 70));
      },
      onDone: (results) => {
        const artifactSteps: WorkflowStep[] = [];
        Object.entries(results).forEach(([agentId, text]) => {
          const agent = TEAM_AGENTS.find((a) => a.id === agentId);
          updateLastAiMsg(agentId, text, false);
          const artMatch = text.match(/###\s+产出物[：:]\s*(.+)\n([\s\S]+)/);
          if (artMatch && agent) {
            artifactSteps.push({ id: `real-${agentId}`, agentId, agentName: agent.name, action: '执行完成', output: '', durationMs: 0, artifact: { title: artMatch[1].trim(), content: artMatch[2].trim().slice(0, 500) } });
          }
        });
        setArtifacts(artifactSteps);
        setProgress(100);
        setRunState('done');
      },
      onError: (err) => { setAgentError(`编排执行失败：${err}`); setRunState('idle'); },
      onDirectAnswer: (text) => { setDirectAnswer(text); updateLastAiMsg('orchestrator', text, false); setProgress(100); setRunState('done'); },
    });
  };

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onMount(async () => {
    const workDir = store.productStore.activeProduct()?.workDir;
    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        const keys: Record<string, string> = { ...(settings.llmProviderKeys ?? {}) };
        const cur = store.state.llmConfig;
        if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;
        setProviderKeys(keys);
        const configured = modelOptions.filter((o) => o.providerID !== 'custom' && (keys[o.providerID]?.trim().length ?? 0) > 0);
        if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) setSessionModelId(configured[0].modelID);
      } catch { /* silent */ }
      // Load pipeline config
      try {
        const config = await loadPipelineConfig(workDir);
        if (config) setPipelineConfig(config);
      } catch { /* silent */ }
      // Load history
      try {
        const history = await loadAutopilotHistory(workDir);
        if (history.sessions.length > 0) {
          const last = history.sessions[0];
          setChatMessages(last.messages.map((m) => ({ ...m, isStreaming: false })));
          setSessionId(last.id);
        }
      } catch { /* silent */ }
    }
  });

  // Auto-save history
  createEffect(() => {
    const msgs = chatMessages();
    if (msgs.length === 0) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const workDir = store.productStore.activeProduct()?.workDir;
      if (!workDir) return;
      saveAutopilotHistory(workDir, {
        sessions: [{ id: sessionId(), goal: msgs.find((m) => m.type === 'user')?.text ?? '', startedAt: new Date().toISOString(), messages: msgs.map(({ isStreaming, ...rest }) => rest) }],
      }).catch(() => {});
    }, 500);
  });

  // Auto-scroll chat
  createEffect(() => {
    chatMessages(); // track
    requestAnimationFrame(() => { if (chatScrollRef) chatScrollRef.scrollTop = chatScrollRef.scrollHeight; });
  });

  onCleanup(() => { clearTimers(); if (elapsedInterval) clearInterval(elapsedInterval); clearTimeout(saveTimeout); });

  // ─── Derived ──────────────────────────────────────────────────────────────

  const doneCount = createMemo(() => Object.values(agentStatuses()).filter((s) => s === 'done').length);
  const runningCount = createMemo(() => Object.values(agentStatuses()).filter((s) => s === 'thinking' || s === 'working').length);
  const waitingCount = createMemo(() => Object.values(agentStatuses()).filter((s) => s === 'waiting').length);

  const filteredMessages = createMemo(() => {
    const fid = filterAgentId();
    if (!fid) return chatMessages();
    return chatMessages().filter((m) => m.type === 'user' || m.agentId === fid);
  });

  const artifactItems = createMemo<ArtifactItem[]>(() =>
    artifacts().filter((s) => s.artifact).map((s) => {
      const ag = TEAM_AGENTS.find((a) => a.id === s.agentId);
      return { id: s.id, agentId: s.agentId, agentName: s.agentName, agentEmoji: ag?.emoji ?? '🤖', title: s.artifact!.title, content: s.artifact!.content, createdAt: formatTime() };
    })
  );

  const hasMessages = () => chatMessages().length > 0;

  // ─── GoalInputPanel ──────────────────────────────────────────────────────

  const GoalInputPanel = (props: { centered?: boolean }) => (
    <div style={{ width: '100%', 'max-width': props.centered ? '680px' : 'none' }}>
      {/* 卡片 */}
      <div style={{
        border: `1px solid ${themeColors.border}`,
        'border-radius': '8px',
        overflow: 'hidden',
        background: themeColors.surface,
      }}>
        {/* 模式切换 + 标题行 */}
        <div style={{ padding: '12px 16px 0', display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <Zap size={15} style={{ color: chartColors.primary }} />
          <span style={{ 'font-size': '14px', 'font-weight': 600, color: themeColors.textPrimary }}>
            输入目标，启动 Agent 自动驾驶
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '4px', background: themeColors.bgSubtle, 'border-radius': '6px', padding: '2px' }}>
            <button
              onClick={() => setAutopilotMode('instant')}
              style={{
                padding: '3px 10px', 'border-radius': '4px', 'font-size': '12px',
                border: 'none', cursor: 'pointer', 'font-weight': 500, transition: 'all 0.2s',
                background: autopilotMode() === 'instant' ? chartColors.primary : 'transparent',
                color: autopilotMode() === 'instant' ? 'white' : themeColors.textSecondary,
              }}
            >即时模式</button>
            <button
              onClick={() => setAutopilotMode('pipeline')}
              style={{
                padding: '3px 10px', 'border-radius': '4px', 'font-size': '12px',
                border: 'none', cursor: 'pointer', 'font-weight': 500, transition: 'all 0.2s',
                background: autopilotMode() === 'pipeline' ? chartColors.primary : 'transparent',
                color: autopilotMode() === 'pipeline' ? 'white' : themeColors.textSecondary,
              }}
            >Pipeline</button>
          </div>
        </div>
        {/* 大 textarea */}
        <textarea
          value={goal()}
          onInput={(e) => setGoal(e.currentTarget.value)}
          disabled={runState() === 'running'}
          placeholder="描述你的目标，例如：为苍穹财务增加「智能费用报销审批」功能，支持 OCR 识别票据、自动匹配审批规则..."
          style={{
            width: '100%', 'min-height': '88px', border: 'none', outline: 'none',
            resize: 'vertical', padding: '12px 16px', 'font-size': '13px',
            'line-height': '1.6', background: 'transparent', color: themeColors.textPrimary,
            'box-sizing': 'border-box', 'font-family': 'inherit',
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart(); }}
        />
        {/* 底部：快速示例 + 操作按钮 */}
        <div style={{
          display: 'flex', 'align-items': 'center', gap: '8px',
          padding: '8px 12px', 'border-top': `1px solid ${themeColors.border}`,
          'flex-wrap': 'wrap',
        }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'flex-shrink': 0 }}>快速示例：</span>
          <For each={teamSampleGoals}>{(g) => (
            <button
              onClick={() => { if (runState() !== 'running') setGoal(g); }}
              style={{
                'font-size': '12px', padding: '3px 10px', 'border-radius': '12px',
                border: `1px solid ${themeColors.border}`, background: themeColors.surface,
                cursor: 'pointer', color: themeColors.textSecondary,
                'max-width': '220px', overflow: 'hidden', 'text-overflow': 'ellipsis',
                'white-space': 'nowrap', 'flex-shrink': 0,
              }}
            >{g.slice(0, 22)}…</button>
          )}</For>
          <div style={{ flex: 1 }} />
          {/* 重置 */}
          <button
            onClick={() => { setGoal(''); resetExecution(); setChatMessages([]); setSessionId('session-' + Date.now()); }}
            style={{
              padding: '6px 14px', 'border-radius': '6px', 'font-size': '13px',
              border: `1px solid ${themeColors.border}`, background: 'transparent',
              cursor: 'pointer', color: themeColors.textSecondary, 'flex-shrink': 0,
            }}
          >重置</button>
          {/* 重新启动 */}
          <button
            onClick={handleStart}
            disabled={runState() === 'running' || !goal().trim()}
            style={{
              display: 'flex', 'align-items': 'center', gap: '6px',
              padding: '6px 16px', 'border-radius': '6px', 'font-size': '13px',
              border: 'none', cursor: (!goal().trim() || runState() === 'running') ? 'not-allowed' : 'pointer',
              background: (!goal().trim() || runState() === 'running') ? themeColors.border : chartColors.primary,
              color: 'white', 'font-weight': 500, 'flex-shrink': 0, transition: 'background 0.2s',
            }}
          >
            {runState() === 'running'
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <PlayCircle size={14} />}
            重新启动
          </button>
        </div>
      </div>
      {/* 进度条行（运行中或完成时显示） */}
      <Show when={runState() !== 'idle'}>
        <div style={{ padding: '8px 2px 0', display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'flex-shrink': 0, 'min-width': '140px' }}>
            {runState() === 'done' ? '所有 Agent 执行完成' : `执行中 · ${doneCount()}/${TEAM_AGENTS.length} Agent`}
          </span>
          <div style={{ flex: 1, height: '4px', background: themeColors.border, 'border-radius': '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress()}%`,
              background: runState() === 'done' ? chartColors.success : chartColors.primary,
              'border-radius': '2px', transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'flex-shrink': 0 }}>{progress()}%</span>
        </div>
      </Show>
      {/* Pipeline 阶段时间线 */}
      <Show when={autopilotMode() === 'pipeline' && pipelineConfig()}>
        <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap', 'margin-top': '8px' }}>
          <For each={pipelineConfig()?.stages ?? []}>{(stage) => {
            const status = () => pipelineStageStatuses()[stage.id] ?? 'pending';
            const colors: Record<string, { bg: string; border: string; text: string }> = {
              pending: { bg: themeColors.bgSubtle, border: themeColors.border, text: themeColors.textMuted },
              running: { bg: themeColors.primaryBg, border: chartColors.primary, text: chartColors.primary },
              success: { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' },
              failed: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
              skipped: { bg: themeColors.bgSubtle, border: themeColors.border, text: themeColors.textMuted },
            };
            const c = () => colors[status() ?? 'pending'] ?? colors.pending;
            return (
              <div style={{
                display: 'flex', 'align-items': 'center', gap: '4px',
                padding: '3px 8px', 'border-radius': '4px', 'font-size': '11px',
                border: `1px solid ${c().border}`, background: c().bg, color: c().text,
              }}>
                <span>{status() === 'running' ? '▶' : status() === 'success' ? '✓' : status() === 'failed' ? '✗' : '○'}</span>
                <span>{stage.name}</span>
                <Show when={stage.gate === 'await-approval'}>
                  <span style={{ 'font-size': '9px', opacity: 0.7 }}>🔒</span>
                </Show>
              </div>
            );
          }}</For>
        </div>
      </Show>
      {/* Pipeline 门控审批 */}
      <Show when={pipelineGateResolver()}>
        {(gate) => (
          <div style={{
            'margin-top': '8px', padding: '10px 14px', 'border-radius': '6px',
            background: '#fffbeb', border: '1px solid #fbbf24',
            display: 'flex', 'align-items': 'center', gap: '10px',
          }}>
            <span style={{ 'font-size': '16px' }}>🔒</span>
            <span style={{ flex: 1, 'font-size': '13px', color: '#92400e' }}>
              阶段「{gate().stageName}」需要审批确认
            </span>
            <button
              onClick={() => { gate().resolve('reject'); setPipelineGateResolver(null); }}
              style={{ padding: '4px 12px', 'border-radius': '4px', 'font-size': '12px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#6b7280' }}
            >跳过</button>
            <button
              onClick={() => { gate().resolve('approve'); setPipelineGateResolver(null); }}
              style={{ padding: '4px 12px', 'border-radius': '4px', 'font-size': '12px', border: 'none', background: '#16a34a', color: 'white', cursor: 'pointer', 'font-weight': 500 }}
            >批准执行</button>
          </div>
        )}
      </Show>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Top banners (preserved) ── */}
      <Show when={store.productStore.products().length === 0}>
        <div style={{ 'margin': '0 16px', 'margin-top': '12px', 'background': `linear-gradient(135deg, ${themeColors.primaryBg} 0%, ${themeColors.primaryBg} 100%)`, 'border': `1px dashed ${themeColors.primaryBorder}`, 'border-radius': '8px', padding: '16px', 'text-align': 'center' }}>
          <Bot size={36} style={{ color: chartColors.primary, 'margin-bottom': '8px', display: 'block' }} />
          <h4 style={{ margin: '0 0 6px', color: chartColors.primary, 'font-size': '15px' }}>欢迎使用星静工程效能平台</h4>
          <div style={{ 'font-size': '13px', color: themeColors.textSecondary }}>你还没有创建任何产品，从新建产品开始你的团队研发之旅吧</div>
          <button onClick={() => setCreateModalOpen(true)} style={{ 'margin-top': '10px', background: chartColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 14px', cursor: 'pointer', 'font-size': '13px', display: 'inline-flex', 'align-items': 'center', gap: '4px' }}>
            <Plus size={14} />立即创建第一个产品
          </button>
        </div>
      </Show>
      <div style={{ margin: '8px 16px', background: themeColors.primaryBg, 'border': `1px solid ${themeColors.primaryBorder}`, 'border-radius': '6px', 'border-left': `3px solid ${chartColors.primary}`, padding: '8px 14px', 'font-size': '13px', 'flex-shrink': 0 }}>
        <strong style={{ color: chartColors.primary }}>团队版 · Agent 自动驾驶</strong>
        <span style={{ color: themeColors.textSecondary, 'margin-left': '8px' }}>为 PM / 架构师 / 开发 / QA / SRE / 管理层提供专属 Agent</span>
      </div>

      {/* ── Main 3-column area ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '0' }}>
        {/* ── LEFT: Agent Panel ── */}
        <div style={{
          width: leftPanelCollapsed() ? '44px' : '220px',
          'min-width': leftPanelCollapsed() ? '44px' : '220px',
          'border-right': `1px solid ${themeColors.border}`,
          display: 'flex', 'flex-direction': 'column', 'flex-shrink': 0,
          overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', background: themeColors.surface,
        }}>
          <Show when={!leftPanelCollapsed()} fallback={
            /* ── 收起态：进度 + 图标列 + 执行数据 ── */
            <div style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', height: '100%' }}>
              {/* 展开按钮 */}
              <button
                onClick={() => setLeftPanelCollapsed(false)}
                style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: themeColors.textMuted, 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': 0 }}
              >
                <ChevronRight size={16} />
              </button>
              {/* 进度条 + 百分比 */}
              <div style={{ width: '100%', padding: '6px 8px', 'flex-shrink': 0 }}>
                <div style={{ width: '100%', height: '3px', background: themeColors.border, 'border-radius': '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round(doneCount() / TEAM_AGENTS.length * 100)}%`,
                    background: runState() === 'done' ? chartColors.success : chartColors.primary,
                    'border-radius': '2px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ 'text-align': 'center', 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '3px', 'font-weight': 500 }}>
                  {doneCount()}/{TEAM_AGENTS.length}
                </div>
              </div>
              {/* Agent 图标列 */}
              <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '6px' }}>
                <For each={TEAM_AGENTS}>
                  {(agent) => {
                    const status = () => agentStatuses()[agent.id];
                    const dotColor = () => statusBadge[status()]?.color ?? themeColors.textMuted;
                    return (
                      <div
                        title={`${agent.name} · ${statusBadge[status()]?.text ?? '待命'}`}
                        style={{ position: 'relative', cursor: 'pointer', 'flex-shrink': 0 }}
                        onClick={() => { setLeftPanelCollapsed(false); setFilterAgentId(agent.id); }}
                      >
                        <div style={{
                          width: '28px', height: '28px', 'border-radius': '8px',
                          background: agent.bgColor, display: 'flex', 'align-items': 'center',
                          'justify-content': 'center', 'font-size': '14px',
                          filter: status() === 'idle' ? 'grayscale(80%) opacity(0.5)' : 'none',
                          transition: 'filter 0.3s',
                          'box-shadow': (status() === 'thinking' || status() === 'working') ? `0 0 0 2px ${chartColors.primary}40` : 'none',
                        }}>
                          {agent.emoji}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: '-1px', right: '-1px',
                          width: '6px', height: '6px', 'border-radius': '50%',
                          background: dotColor(),
                          border: `1px solid ${themeColors.surface}`,
                          display: 'block',
                        }} />
                      </div>
                    );
                  }}
                </For>
              </div>
              {/* 底部执行数据 */}
              <div style={{ 'border-top': `1px solid ${themeColors.border}`, padding: '6px 0', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '5px', 'flex-shrink': 0, width: '100%' }}>
                <div style={{ 'text-align': 'center' }}>
                  <div style={{ 'font-size': '12px', 'font-weight': 700, color: chartColors.success, 'line-height': 1 }}>{doneCount()}</div>
                  <div style={{ 'font-size': '9px', color: themeColors.textMuted, 'margin-top': '1px' }}>完成</div>
                </div>
                <Show when={runningCount() > 0}>
                  <div style={{ 'text-align': 'center' }}>
                    <div style={{ 'font-size': '12px', 'font-weight': 700, color: chartColors.primary, 'line-height': 1 }}>{runningCount()}</div>
                    <div style={{ 'font-size': '9px', color: themeColors.textMuted, 'margin-top': '1px' }}>运行</div>
                  </div>
                </Show>
                <Show when={runState() !== 'idle'}>
                  <div style={{ 'writing-mode': 'vertical-rl', transform: 'rotate(180deg)', 'font-size': '10px', color: themeColors.textMuted, 'line-height': 1, 'padding': '2px 0', 'max-height': '52px', overflow: 'hidden' }}>
                    {formatElapsed(elapsedSeconds())}
                  </div>
                </Show>
              </div>
            </div>
          }>
            {/* ── 展开态 ── */}
            <div style={{ padding: '10px 12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': 0 }}>
              <span style={{ 'font-weight': 600, 'font-size': '13px' }}>Agent 面板</span>
              <button onClick={() => setLeftPanelCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted, padding: '2px', display: 'flex' }}>
                <ChevronLeft size={16} />
              </button>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', 'justify-content': 'space-between', 'font-size': '11px', color: themeColors.textMuted, 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': 0 }}>
              <span>已用时 {formatElapsed(elapsedSeconds())}</span>
              <span>{doneCount()}/{TEAM_AGENTS.length} 完成</span>
            </div>
            <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0' }}>
              <For each={TEAM_AGENTS}>
                {(agent) => {
                  const outputCount = () => artifacts().filter((a) => a.agentId === agent.id && a.artifact).length;
                  return (
                    <SidebarAgentCard
                      agent={agent}
                      status={agentStatuses()[agent.id]}
                      outputCount={outputCount()}
                      elapsedText={agentStatuses()[agent.id] !== 'idle' ? formatElapsed(elapsedSeconds()) : undefined}
                      onClick={() => setFilterAgentId(filterAgentId() === agent.id ? null : agent.id)}
                      selected={filterAgentId() === agent.id}
                    />
                  );
                }}
              </For>
            </div>
            {/* Bottom stats */}
            <div style={{ padding: '8px 12px', 'border-top': `1px solid ${themeColors.border}`, display: 'flex', gap: '12px', 'font-size': '12px', 'flex-shrink': 0 }}>
              <span style={{ color: chartColors.success, 'font-weight': 600 }}>{doneCount()}<br /><span style={{ 'font-weight': 400, color: themeColors.textMuted }}>完成</span></span>
              <span style={{ color: chartColors.primary, 'font-weight': 600 }}>{runningCount()}<br /><span style={{ 'font-weight': 400, color: themeColors.textMuted }}>运行</span></span>
              <span style={{ color: themeColors.warning, 'font-weight': 600 }}>{waitingCount()}<br /><span style={{ 'font-weight': 400, color: themeColors.textMuted }}>等待</span></span>
            </div>
          </Show>
        </div>

        {/* ── CENTER: Chat / Flow ── */}
        <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', overflow: 'hidden', 'min-width': 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', 'align-items': 'center', padding: '0 16px', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': 0, background: themeColors.surface }}>
            <button onClick={() => setActiveTab('chat')} style={{ display: 'flex', 'align-items': 'center', gap: '5px', padding: '10px 14px', border: 'none', 'border-bottom': activeTab() === 'chat' ? `2px solid ${chartColors.primary}` : '2px solid transparent', background: 'none', cursor: 'pointer', 'font-size': '13px', 'font-weight': activeTab() === 'chat' ? 600 : 400, color: activeTab() === 'chat' ? chartColors.primary : themeColors.textMuted }}>
              <MessageSquare size={14} /> 对话
            </button>
            <button onClick={() => setActiveTab('flow')} style={{ display: 'flex', 'align-items': 'center', gap: '5px', padding: '10px 14px', border: 'none', 'border-bottom': activeTab() === 'flow' ? `2px solid ${chartColors.primary}` : '2px solid transparent', background: 'none', cursor: 'pointer', 'font-size': '13px', 'font-weight': activeTab() === 'flow' ? 600 : 400, color: activeTab() === 'flow' ? chartColors.primary : themeColors.textMuted }}>
              <Activity size={14} /> 执行流
            </button>
            <div style={{ flex: 1 }} />
            <Show when={filterAgentId()}>
              {(fid) => {
                const ag = TEAM_AGENTS.find((a) => a.id === fid());
                return (
                  <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '4px', 'font-size': '12px', padding: '3px 10px', 'border-radius': '12px', background: chartColors.primary, color: 'white' }}>
                    筛选: {ag?.name ?? fid()}
                    <button onClick={() => setFilterAgentId(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                  </span>
                );
              }}
            </Show>
          </div>

          {/* Chat tab */}
          <Show when={activeTab() === 'chat'}>
            <Show when={hasMessages()} fallback={
              /* ── Empty state: centered input ── */
              <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'flex-start', padding: '40px 24px 24px', gap: '12px' }}>
                <GoalInputPanel centered />
                <Show when={agentError() !== null}>
                  <div style={{ 'max-width': '680px', width: '100%', padding: '10px 14px', 'border-radius': '6px', 'font-size': '13px', background: '#fff2f0', border: '1px solid #ffccc7', color: '#cf1322', display: 'flex', gap: '8px' }}>
                    <span>⚠️</span>
                    <div style={{ flex: 1 }}><strong>AI 调用失败</strong><br />{agentError()}</div>
                    <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322' }}>✕</button>
                  </div>
                </Show>
              </div>
            }>
              {/* ── Has messages: scrollable list + bottom input ── */}
              <div ref={chatScrollRef} style={{ flex: 1, 'overflow-y': 'auto', padding: '16px 24px' }}>
                <For each={filteredMessages()}>
                  {(msg) => {
                    if (msg.type === 'user') return (
                      <div style={{ display: 'flex', 'justify-content': 'flex-end', 'margin-bottom': '16px' }}>
                        <div style={{ 'max-width': '70%', display: 'flex', 'align-items': 'flex-start', gap: '8px', 'flex-direction': 'row-reverse' }}>
                          <div style={{ width: '32px', height: '32px', 'border-radius': '50%', background: chartColors.primary, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'white', 'font-size': '13px', 'font-weight': 600, 'flex-shrink': 0 }}>我</div>
                          <div>
                            <div style={{ background: '#dcf8e8', padding: '10px 14px', 'border-radius': '12px 2px 12px 12px', 'font-size': '13px', 'line-height': '1.6', color: themeColors.textPrimary }}>{msg.text}</div>
                            <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'text-align': 'right', 'margin-top': '4px' }}>{msg.time}</div>
                          </div>
                        </div>
                      </div>
                    );
                    if (msg.type === 'ai') return (
                      <div style={{ display: 'flex', 'margin-bottom': '16px' }}>
                        <div style={{ 'max-width': '75%', display: 'flex', 'align-items': 'flex-start', gap: '8px' }}>
                          <div style={{ width: '32px', height: '32px', 'border-radius': '50%', background: themeColors.hover, display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '14px', 'flex-shrink': 0 }}>
                            {msg.agentEmoji || 'AI'}
                          </div>
                          <div>
                            <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textSecondary, 'margin-bottom': '4px' }}>{msg.agentName}</div>
                            <div style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, padding: '10px 14px', 'border-radius': '2px 12px 12px 12px', 'font-size': '13px', 'line-height': '1.7', color: themeColors.textPrimary, 'white-space': 'pre-wrap' }}>
                              {msg.text}
                              <Show when={msg.isStreaming}>
                                <span style={{ display: 'inline-flex', gap: '2px', 'margin-left': '4px', 'vertical-align': 'middle' }}>
                                  <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0s' }} />
                                  <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0.2s' }} />
                                  <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0.4s' }} />
                                </span>
                              </Show>
                            </div>
                            <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '4px' }}>{msg.time}</div>
                          </div>
                        </div>
                      </div>
                    );
                    return null;
                  }}
                </For>
                {/* Inline error */}
                <Show when={agentError() !== null}>
                  <div style={{ padding: '10px 14px', 'border-radius': '6px', 'font-size': '13px', background: '#fff2f0', border: '1px solid #ffccc7', color: '#cf1322', 'margin-bottom': '12px', display: 'flex', gap: '8px' }}>
                    <span>⚠️</span>
                    <div style={{ flex: 1 }}><strong>AI 调用失败</strong> — {agentError()}</div>
                    <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322' }}>✕</button>
                  </div>
                </Show>
                {/* Done banner */}
                <Show when={runState() === 'done'}>
                  <div style={{ padding: '10px 14px', background: themeColors.successBg, border: `1px solid ${themeColors.successBorder}`, 'border-radius': '8px', display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
                    <CheckCircle size={16} style={{ color: chartColors.success }} />
                    <span style={{ 'font-size': '13px', color: chartColors.success, 'font-weight': 600 }}>全部完成</span>
                    <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>— 共调度 {dispatchPlan().length || 1} 个 Agent</span>
                  </div>
                </Show>
              </div>
              {/* Bottom input */}
              <div style={{ padding: '10px 16px', 'border-top': `1px solid ${themeColors.border}`, 'flex-shrink': 0, background: themeColors.surface }}>
                <GoalInputPanel />
              </div>
            </Show>
          </Show>

          {/* Flow tab — reuse existing timeline */}
          <Show when={activeTab() === 'flow'}>
            <div ref={timelineRef} style={{ flex: 1, 'overflow-y': 'auto', padding: '16px' }}>
              <Show when={dispatchPlan().length === 0 && visibleSteps().length === 0}>
                <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted }}>
                  <Bot size={40} style={{ 'margin-bottom': '12px', display: 'block' }} />
                  <div style={{ 'font-size': '14px' }}>启动自动驾驶后，Agent 执行过程将在此实时显示</div>
                </div>
              </Show>
              <Show when={orchestratorText() && dispatchPlan().length === 0}>
                <div style={{ padding: '10px 12px', background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '6px', 'margin-bottom': '8px' }}>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: chartColors.primary, 'margin-bottom': '4px' }}>Orchestrator 规划中...</div>
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'white-space': 'pre-wrap', 'max-height': '120px', 'overflow-y': 'auto' }}>{orchestratorText()}</div>
                </div>
              </Show>
              <For each={dispatchPlan()}>
                {(item) => {
                  const agent = TEAM_AGENTS.find((a) => a.id === item.agentId);
                  const text = () => agentStreamTexts()[item.agentId] ?? '';
                  const execStatus = () => agentExecStatuses()[item.agentId] ?? 'pending';
                  const isStreaming = () => execStatus() === 'thinking' || execStatus() === 'working';
                  if (!agent) return null;
                  return (
                    <div style={{ 'padding-bottom': '12px', display: 'flex', gap: '12px' }}>
                      <div style={{ width: '20px', height: '20px', 'border-radius': '50%', 'flex-shrink': 0, 'background-color': execStatus() === 'done' ? agent.color : 'transparent', border: isStreaming() ? `2px solid ${agent.color}` : `2px solid ${themeColors.border}`, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
                        <Show when={isStreaming()}><Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} /></Show>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
                          <span style={{ display: 'inline-block', background: agent.color, color: 'white', padding: '0 6px', 'border-radius': '4px', 'font-size': '11px' }}>{agent.name}</span>
                          <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>{item.task.slice(0, 40)}...</span>
                        </div>
                        <Show when={text()}>
                          <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'white-space': 'pre-wrap', 'line-height': '1.6', 'max-height': '200px', 'overflow-y': 'auto', background: themeColors.hover, padding: '6px 8px', 'border-radius': '4px' }}>{text()}</div>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* ── RIGHT: Artifact Workspace ── */}
        <div style={{ width: '360px', 'min-width': '280px', 'flex-shrink': 0, 'border-left': `1px solid ${themeColors.border}`, display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
          <ArtifactWorkspace artifacts={artifactItems()} />
        </div>
      </div>

      <CreateProductModal open={createModalOpen()} onClose={() => setCreateModalOpen(false)} />
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default EnterpriseAutopilot;
