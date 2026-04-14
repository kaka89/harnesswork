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
  Bug, Rocket, BarChart3, Plus, Send, Settings,
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

  // ─── Inline ChatInputBar ─────────────────────────────────────────────────

  const ChatInputBar = (props: { centered?: boolean }) => (
    <div style={{ width: '100%', 'max-width': props.centered ? '640px' : 'none' }}>
      <div style={{ display: 'flex', 'align-items': 'flex-end', gap: '8px', background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '10px', padding: '8px 12px' }}>
        <Show when={configuredModels().length > 0}>
          <select
            value={sessionModelId()} onChange={(e) => setSessionModelId(e.currentTarget.value)}
            disabled={runState() === 'running'}
            style={{ 'font-size': '11px', padding: '3px 4px', 'border-radius': '4px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.textMuted, outline: 'none', 'flex-shrink': 0 }}
          >
            <For each={configuredModels()}>{(o) => <option value={o.modelID}>{o.label}</option>}</For>
          </select>
        </Show>
        <MentionInput
          value={goal()} onChange={setGoal} disabled={runState() === 'running'}
          placeholder="输入消息，与 Agent 对话..."
          agents={TEAM_AGENTS}
          style={{ flex: '1' }}
        />
        <button
          onClick={handleStart}
          disabled={runState() === 'running' || !goal().trim()}
          style={{ width: '32px', height: '32px', 'border-radius': '50%', border: 'none', background: (!goal().trim() || runState() === 'running') ? themeColors.border : chartColors.primary, color: 'white', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'flex-shrink': 0, transition: 'background 0.2s' }}
        >
          {runState() === 'running' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
        </button>
      </div>
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
          width: leftPanelCollapsed() ? '0px' : '220px',
          'min-width': leftPanelCollapsed() ? '0px' : '220px',
          'border-right': leftPanelCollapsed() ? 'none' : `1px solid ${themeColors.border}`,
          display: 'flex', 'flex-direction': 'column', 'flex-shrink': 0,
          overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', background: themeColors.surface,
        }}>
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
        </div>

        {/* Collapse expand handle */}
        <Show when={leftPanelCollapsed()}>
          <button onClick={() => setLeftPanelCollapsed(false)} style={{ width: '24px', 'flex-shrink': 0, background: themeColors.hover, border: 'none', 'border-right': `1px solid ${themeColors.border}`, cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: themeColors.textMuted }}>
            <ChevronRight size={14} />
          </button>
        </Show>

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
              /* ── Empty state: centered input + quick examples ── */
              <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', padding: '24px', gap: '16px' }}>
                <Bot size={48} style={{ color: themeColors.border, 'margin-bottom': '4px' }} />
                <div style={{ 'font-size': '15px', color: themeColors.textMuted, 'text-align': 'center' }}>输入目标，启动 Agent 自动驾驶</div>
                <ChatInputBar centered />
                {/* Quick examples */}
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'justify-content': 'center', 'max-width': '640px' }}>
                  <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>快速示例：</span>
                  <For each={teamSampleGoals}>
                    {(g) => (
                      <button onClick={() => { if (runState() !== 'running') setGoal(g); }} style={{ 'border': `1px solid ${themeColors.border}`, 'border-radius': '12px', padding: '2px 10px', 'font-size': '12px', background: themeColors.surface, cursor: 'pointer', 'max-width': '260px', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                        {g.slice(0, 30)}…
                      </button>
                    )}
                  </For>
                </div>
                <Show when={agentError() !== null}>
                  <div style={{ 'max-width': '640px', width: '100%', padding: '10px 14px', 'border-radius': '6px', 'font-size': '13px', background: '#fff2f0', border: '1px solid #ffccc7', color: '#cf1322', display: 'flex', gap: '8px' }}>
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
                <ChatInputBar />
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
