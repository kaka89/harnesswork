import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { marked } from 'marked';
import {
  teamSampleGoals,
  type AgentDef,
  type WorkflowStep,
  type AgentStatus,
} from '../../../mock/autopilot';
import CreateProductModal from '../../../components/product/new-product-modal';
import {
  Bot, CheckCircle, Loader2, Clock, PlayCircle, FileText, Network,
  Bug, Rocket, BarChart3, Plus, Send, Settings, Zap,
  MessageSquare, Activity, X, ChevronLeft, ChevronRight,
  Brain, Copy, Check,
} from 'lucide-solid';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import {
  runOrchestratedAutopilot,
  runDirectAgent,
  runDirectSkill,
  parseMention,
  type DispatchItem,
  type AgentExecutionStatus,
  type AutopilotAgent,
} from '../../../services/autopilot-executor';
import { listAllAgents } from '../../../services/agent-registry';
import MentionInput from '../../../components/autopilot/mention-input';
import ArtifactWorkspace, { type ArtifactItem } from '../../../components/autopilot/artifact-workspace';
import PermissionDialog, { type PermissionRequest } from '../../../components/autopilot/permission-dialog';
import { modelOptions } from '../../../mock/settings';
import {
  loadProjectSettings,
  loadAutopilotHistory,
  saveAutopilotHistory,
  type AutopilotChatMessage,
} from '../../../services/file-store';
import {
  type MemorySession,
  type MemoryMessage,
  saveSession as saveMemorySession,
  loadMemoryIndex,
  loadSession as loadMemorySession,
  genSessionId,
  nowISO,
} from '../../../services/memory-store';
import { loadPipelineConfig, type PipelineConfig, type PipelineStage } from '../../../services/pipeline-config';
import { runPipeline } from '../../../services/pipeline-executor';

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

// ─── Markdown + Think 解析 ────────────────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

interface ParsedContent { thinking: string; output: string; thinkingComplete: boolean; }

function parseThinkingContent(content: string): ParsedContent {
  if (!content) return { thinking: '', output: '', thinkingComplete: false };
  const closeIdx = content.indexOf('</think>');
  if (content.startsWith('<think>')) {
    if (closeIdx !== -1) {
      return { thinking: content.slice(7, closeIdx).trim(), output: content.slice(closeIdx + 8).trim(), thinkingComplete: true };
    }
    return { thinking: content.slice(7).trim(), output: '', thinkingComplete: false };
  }
  return { thinking: '', output: content, thinkingComplete: true };
}

const MarkdownMsg = (props: { content: string }) => {
  const html = () => {
    if (!props.content) return '';
    try { return marked.parse(props.content, { async: false }) as string; }
    catch { return props.content.replace(/</g, '&lt;'); }
  };
  return <div class="md-prose" innerHTML={html()} />;
};

const ThinkBlock = (props: { content: string; complete: boolean; streaming: boolean }) => {
  const [open, setOpen] = createSignal(true);
  createEffect(() => { if (props.complete && !props.streaming) setOpen(false); });
  return (
    <div style={{ 'border-radius': '10px', overflow: 'hidden', 'margin-bottom': '8px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)' }}>
      <button
        style={{ width: '100%', display: 'flex', 'align-items': 'center', gap: '6px', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', 'font-size': '12px', 'font-weight': 600 }}
        onClick={() => setOpen(v => !v)}
      >
        <Show when={props.streaming} fallback={<Brain size={12} />}>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
        </Show>
        <span>{props.streaming ? '思考中...' : '思考过程'}</span>
        <Show when={!props.streaming}>
          <span style={{ 'margin-left': 'auto', 'font-size': '11px', opacity: '0.5' }}>{open() ? '收起' : '展开'}</span>
          <Show when={open()} fallback={<ChevronRight size={11} />}><ChevronLeft size={11} style={{ transform: 'rotate(90deg)' }} /></Show>
        </Show>
      </button>
      <Show when={open() && props.content}>
        <div style={{ padding: '6px 10px 8px', 'font-size': '11px', 'line-height': '1.65', color: 'rgba(109,40,217,0.75)', 'border-top': '1px solid rgba(139,92,246,0.12)', 'white-space': 'pre-wrap', 'font-style': 'italic' }}>
          {props.content}
          <Show when={props.streaming}><span class="streaming-cursor" /></Show>
        </div>
      </Show>
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const EnterpriseAutopilot = () => {
  const store = useAppStore();
  const navigate = useNavigate();

  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  // Team Agent 列表：异步加载，初始为空数组
  const [teamAgents, setTeamAgents] = createSignal<AutopilotAgent[]>([]);
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = createSignal<Record<string, AgentStatus>>({});
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
  const [permissionRequest, setPermissionRequest] = createSignal<PermissionRequest | null>(null);

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
  const getSessionModel = (): { providerID: string; modelID: string } | null => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return null;
    if (!providerKeys()[opt.providerID]) return null;
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
    setAgentStatuses(Object.fromEntries(teamAgents().map((a) => [a.id, 'idle' as AgentStatus])));
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

  const handlePermissionAsked = (params: {
    permissionId: string;
    sessionId: string;
    tool?: string;
    description?: string;
    input?: string;
    resolve: (action: 'once' | 'always' | 'reject') => void;
  }) => {
    setPermissionRequest({
      permissionId: params.permissionId,
      sessionId: params.sessionId,
      tool: params.tool,
      description: params.description,
      input: params.input,
      resolve: params.resolve,
    });
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

      const initStatuses: Record<string, PipelineStage['outputStatus']> = {};
      config.stages.forEach((s) => { initStatuses[s.id] = 'pending'; });
      setPipelineStageStatuses(initStatuses);
      setPipelineStageOutputs({});

      // 使用新的 Session 执行器
      const { runPipelineWithSessions } = await import('../../../services/pipeline-executor');
      await runPipelineWithSessions({
        config,
        goal: goal().trim(),
        client: () => store.openworkStatus() === 'connected' ? (window as any).__openworkClient : null,
        workspaceId: () => store.resolvedWorkspaceId(),
        workDir: () => workDir ?? '',
        model: getSessionModel,
        onStageStart: (stageId) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'running' }));
        },
        onStageSessionCreated: (stageId, sessionId) => {
          // TODO: 存储 Stage Session ID，用于 UI 绑定
          console.log(`[Pipeline] Stage ${stageId} session created: ${sessionId}`);
        },
        onStageComplete: (stageId, result) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'success' }));
          setPipelineStageOutputs((prev) => ({ ...prev, [stageId]: result }));
          const totalDone = Object.values(pipelineStageStatuses()).filter((s) => s === 'success' || s === 'failed' || s === 'skipped').length + 1;
          setProgress(Math.round((totalDone / config.stages.length) * 100));
        },
        onStageFailed: (stageId, error) => {
          setPipelineStageStatuses((prev) => ({ ...prev, [stageId]: 'failed' }));
        },
        onGateWaiting: (stageId, stageName) => {
          return new Promise((resolve) => {
            setPipelineGateResolver({ stageId, stageName, resolve });
          });
        },
        onDone: () => { setProgress(100); setRunState('done'); },
        onError: (err) => { setAgentError(`Pipeline 执行失败：${err}`); setRunState('idle'); },
      });
      return;
    }

    const { targetAgent, targetSkill, cleanText } = parseMention(goal(), teamAgents());

    // @skill:xxx → 直接以 Skill 上下文执行，绕过 Pipeline
    if (targetSkill) {
      pushMsg({ type: 'ai', agentId: 'skill', agentName: targetSkill, agentEmoji: '🛠️', text: '正在加载 Skill...', time: formatTime(), isStreaming: true });
      const skillApiAdapter = {
        listSkills: () => store.actions.listOpenworkSkills(),
        getSkill: (name: string) => store.actions.getOpenworkSkill(name),
        upsertSkill: (name: string, content: string, desc?: string) => store.actions.upsertOpenworkSkill(name, content, desc ?? ''),
      };
      await runDirectSkill(targetSkill, cleanText, {
        workDir, model: model ?? undefined,
        callAgentFn: (o) => store.actions.callAgent(o),
        skillApi: skillApiAdapter,
        onPermissionAsked: handlePermissionAsked,
        onStream: (text) => { updateLastAiMsg('skill', text, true); setProgress(50); },
        onDone: (text) => { updateLastAiMsg('skill', text, false); setProgress(100); setRunState('done'); },
        onError: (err) => {
          setAgentError(`Skill ${targetSkill} 执行失败：${err}`);
          updateLastAiMsg('skill', `执行失败：${err}`, false);
          setRunState('idle');
        },
      });
      return;
    }

    if (targetAgent) {
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      pushMsg({ type: 'ai', agentId: targetAgent.id, agentName: targetAgent.name, agentEmoji: targetAgent.emoji, text: '正在思考...', time: formatTime(), isStreaming: true });
      await runDirectAgent(targetAgent, cleanText, {
        workDir, model: model ?? undefined,
        onPermissionAsked: handlePermissionAsked,
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
    const skillApiAdapter = {
      listSkills: () => store.actions.listOpenworkSkills(),
      getSkill: (name: string) => store.actions.getOpenworkSkill(name),
      upsertSkill: (name: string, content: string, desc?: string) => store.actions.upsertOpenworkSkill(name, content, desc ?? ''),
    };
    await runOrchestratedAutopilot(cleanText, {
      workDir,
      availableAgents: teamAgents(),
      model: model ?? undefined,
      callAgentFn: (o) => store.actions.callAgent(o),
      skillApi: skillApiAdapter,
      onPermissionAsked: handlePermissionAsked,
      onOrchestrating: (text) => { setOrchestratorText(text); },
      onOrchestratorDone: (plan) => { setDispatchPlan(plan); setProgress(10); },
      onAgentStatus: (agentId, status) => {
        const m: Record<AgentExecutionStatus, AgentStatus> = { idle: 'idle', pending: 'waiting', thinking: 'thinking', working: 'working', done: 'done', error: 'done' };
        setAgentStatuses((prev) => ({ ...prev, [agentId]: m[status] }));
        setAgentExecStatuses((prev) => ({ ...prev, [agentId]: status }));
        const ag = teamAgents().find((a) => a.id === agentId);
        if (ag && status === 'thinking') pushMsg({ type: 'ai', agentId, agentName: ag.name, agentEmoji: ag.emoji, text: '正在思考...', time: formatTime(), isStreaming: true });
      },
      onAgentStream: (agentId, text) => { setAgentStreamTexts((p) => ({ ...p, [agentId]: text })); updateLastAiMsg(agentId, text, true); setProgress(50); },
      onDirectAnswer: (text) => { setDirectAnswer(text); updateLastAiMsg('orchestrator', text, false); },
      onDone: () => { setProgress(100); setRunState('done'); },
      onError: (err) => { setAgentError(`编排执行失败：${err}`); setRunState('idle'); },
    });
  };

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  // 加载 Team Agent 列表
  onMount(async () => {
    try {
      const agents = await listAllAgents('team');
      setTeamAgents(agents);
      setAgentStatuses(Object.fromEntries(agents.map((a) => [a.id, 'idle' as AgentStatus])));
    } catch { /* 静默 */ }
  });

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
      // Load history——优先从 memory-store 加载，降级到旧的 autopilot-history.json
      try {
        const memIndex = await loadMemoryIndex(workDir);
        const autopilotEntries = memIndex.sessions.filter(s => s.type === 'autopilot');
        if (autopilotEntries.length > 0) {
          const lastEntry = autopilotEntries[0];
          const lastSession = await loadMemorySession(workDir, lastEntry.id);
          if (lastSession && lastSession.messages.length > 0) {
            setChatMessages(lastSession.messages.map(m => ({
              id: m.id,
              type: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'ai',
              text: m.content,
              time: m.ts,
              isStreaming: false,
              agentId: m.agentId,
              agentName: m.agentName,
            })));
            setSessionId(lastSession.id);
          }
        } else {
          // 降级：加载旧的 autopilot-history.json
          const history = await loadAutopilotHistory(workDir);
          if (history.sessions.length > 0) {
            const last = history.sessions[0];
            setChatMessages(last.messages.map((m) => ({ ...m, isStreaming: false })));
            setSessionId(last.id);
          }
        }
      } catch { /* silent */ }
    }
  });

  // Auto-save history——同时保存到 memory-store 和旧的 autopilot-history.json
  createEffect(() => {
    const msgs = chatMessages();
    if (msgs.length === 0) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const workDir = store.productStore.activeProduct()?.workDir;
      if (!workDir) return;

      // 旧的持久化（降级兜底）
      saveAutopilotHistory(workDir, {
        sessions: [{ id: sessionId(), goal: msgs.find((m) => m.type === 'user')?.text ?? '', startedAt: new Date().toISOString(), messages: msgs.map(({ isStreaming, ...rest }) => rest) }],
      }).catch(() => {});

      // 新的统一存储
      const memMessages: MemoryMessage[] = msgs.map(m => ({
        id: m.id,
        role: m.type === 'user' ? 'user' as const : m.type === 'system' ? 'system' as const : 'assistant' as const,
        content: m.text,
        agentId: m.agentId,
        agentName: m.agentName,
        ts: m.time ?? '',
      }));
      const memSession: MemorySession = {
        id: sessionId(),
        type: 'autopilot',
        summary: msgs.find((m) => m.type === 'user')?.text?.slice(0, 80) ?? '',
        goal: msgs.find((m) => m.type === 'user')?.text ?? '',
        tags: [],
        messages: memMessages,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      void saveMemorySession(workDir, memSession);
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
      const ag = teamAgents().find((a) => a.id === s.agentId);
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
        {/* Textarea 区域 */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={goal()}
            onInput={(e) => setGoal(e.currentTarget.value)}
            disabled={runState() === 'running'}
            placeholder={runState() === 'running' ? 'Agent 执行中，请稍候...' : '描述目标，例如：为财务系统增加「智能报销审批」功能，支持 OCR 识别票据、自动匹配规则… (⌘Enter 启动)'}
            style={{
              width: '100%', 'min-height': '80px', 'max-height': '200px',
              border: 'none', outline: 'none', resize: 'vertical',
              padding: '12px 48px 12px 16px', 'font-size': '13px',
              'line-height': '1.65', background: 'transparent',
              color: themeColors.textPrimary, 'box-sizing': 'border-box',
              'font-family': 'inherit', opacity: runState() === 'running' ? '0.6' : '1',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart(); }}
          />
          {/* 右侧发送按钮（浮动在 textarea 内） */}
          <button
            onClick={handleStart}
            disabled={runState() === 'running' || !goal().trim()}
            title="启动 (⌘Enter)"
            style={{
              position: 'absolute', right: '10px', bottom: '10px',
              width: '30px', height: '30px', 'border-radius': '8px',
              border: 'none', cursor: (!goal().trim() || runState() === 'running') ? 'not-allowed' : 'pointer',
              background: (!goal().trim() || runState() === 'running') ? themeColors.border : chartColors.primary,
              color: 'white', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              transition: 'all 0.2s', 'flex-shrink': 0,
              'box-shadow': (!goal().trim() || runState() === 'running') ? 'none' : `0 2px 6px ${chartColors.primary}50`,
            }}
          >
            <Show when={runState() === 'running'} fallback={<Send size={13} />}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            </Show>
          </button>
        </div>
        {/* 底部：快速示例 + 重置 */}
        <div style={{
          display: 'flex', 'align-items': 'center', gap: '6px',
          padding: '6px 12px 8px', 'border-top': `1px solid ${themeColors.border}`,
          'flex-wrap': 'wrap',
        }}>
          <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'flex-shrink': 0 }}>示例：</span>
          <For each={teamSampleGoals.slice(0, 3)}>{(g) => (
            <button
              onClick={() => { if (runState() !== 'running') setGoal(g); }}
              style={{
                'font-size': '11px', padding: '2px 9px', 'border-radius': '10px',
                border: `1px solid ${themeColors.border}`, background: 'transparent',
                cursor: 'pointer', color: themeColors.textSecondary,
                'max-width': '200px', overflow: 'hidden', 'text-overflow': 'ellipsis',
                'white-space': 'nowrap', 'flex-shrink': 0, transition: 'all 0.15s',
              }}
            >{g.slice(0, 20)}…</button>
          )}</For>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setGoal(''); resetExecution(); setChatMessages([]); setSessionId('session-' + Date.now()); }}
            disabled={runState() === 'running'}
            style={{
              padding: '3px 10px', 'border-radius': '5px', 'font-size': '11px',
              border: `1px solid ${themeColors.border}`, background: 'transparent',
              cursor: 'pointer', color: themeColors.textMuted, 'flex-shrink': 0,
            }}
          >清空</button>
        </div>
      </div>
      {/* 进度条行（运行中或完成时显示） */}
      <Show when={runState() !== 'idle'}>
        <div style={{ padding: '8px 2px 0', display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'flex-shrink': 0, 'min-width': '140px' }}>
            {runState() === 'done' ? '所有 Agent 执行完成' : `执行中 · ${doneCount()}/${teamAgents().length} Agent`}
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
                    width: `${Math.round(doneCount() / (teamAgents().length || 1) * 100)}%`,
                    background: runState() === 'done' ? chartColors.success : chartColors.primary,
                    'border-radius': '2px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ 'text-align': 'center', 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '3px', 'font-weight': 500 }}>
                  {doneCount()}/{teamAgents().length}
                </div>
              </div>
              {/* Agent 图标列 */}
              <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '6px' }}>
                <For each={teamAgents()}>
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
              <span>{doneCount()}/{teamAgents().length} 完成</span>
            </div>
            <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0' }}>
              <For each={teamAgents()}>
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
                const ag = teamAgents().find((a) => a.id === fid());
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
            <Show when={!hasMessages()} fallback={
              /* ── Has messages: scrollable bubble list ── */
              <div ref={chatScrollRef} style={{ flex: 1, 'overflow-y': 'auto', padding: '16px 20px' }}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', 'padding-bottom': '8px' }}>
                  <For each={filteredMessages()}>
                    {(msg) => {
                      // ── User bubble ──
                      if (msg.type === 'user') return (
                        <div style={{ display: 'flex', 'justify-content': 'flex-end', 'align-items': 'flex-end', gap: '8px' }}>
                          <div style={{ 'max-width': '72%' }}>
                            <div style={{
                              background: chartColors.primary,
                              padding: '10px 14px',
                              'border-radius': '18px 18px 4px 18px',
                              'font-size': '13px', 'line-height': '1.65',
                              color: 'white', 'word-break': 'break-word',
                              'box-shadow': '0 1px 4px rgba(0,0,0,0.12)',
                            }}>{msg.text}</div>
                            <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'text-align': 'right', 'margin-top': '4px', 'padding-right': '2px' }}>{msg.time}</div>
                          </div>
                          <div style={{
                            width: '30px', height: '30px', 'border-radius': '50%',
                            background: chartColors.primary,
                            display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                            color: 'white', 'font-size': '12px', 'font-weight': 700,
                            'flex-shrink': 0, 'box-shadow': '0 1px 4px rgba(0,0,0,0.15)',
                          }}>我</div>
                        </div>
                      );

                      // ── AI bubble ──
                      if (msg.type === 'ai') {
                        const agent = teamAgents().find(a => a.id === msg.agentId);
                        const agentColor = agent?.color ?? chartColors.primary;
                        const agentBg = agent?.bgColor ?? themeColors.hover;
                        const parsed = parseThinkingContent(msg.text ?? '');
                        const thinkStreaming = () => !!msg.isStreaming && !parsed.thinkingComplete;
                        const outStreaming = () => !!msg.isStreaming && parsed.thinkingComplete;
                        const isEmpty = () => !msg.text && !!msg.isStreaming;

                        // copy state per message (keyed by id)
                        const [copied, setCopied] = createSignal(false);
                        const [hovered, setHovered] = createSignal(false);
                        const handleCopy = () => {
                          const text = parsed.output || msg.text;
                          if (!text) return;
                          navigator.clipboard.writeText(text).then(() => {
                            setCopied(true); setTimeout(() => setCopied(false), 2000);
                          }).catch(() => {});
                        };

                        return (
                          <div
                            style={{ display: 'flex', 'align-items': 'flex-start', gap: '10px', 'max-width': '88%' }}
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                          >
                            {/* Agent avatar */}
                            <div style={{
                              width: '32px', height: '32px', 'border-radius': '10px',
                              background: agentBg,
                              border: `1.5px solid ${agentColor}40`,
                              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                              'font-size': '16px', 'flex-shrink': 0,
                              'box-shadow': `0 1px 4px ${agentColor}20`,
                            }}>
                              {msg.agentEmoji || '🤖'}
                            </div>
                            <div style={{ flex: 1, 'min-width': 0 }}>
                              {/* Agent name row */}
                              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '5px' }}>
                                <span style={{ 'font-size': '12px', 'font-weight': 700, color: agentColor }}>{msg.agentName}</span>
                                <Show when={msg.isStreaming}>
                                  <span style={{
                                    display: 'inline-flex', 'align-items': 'center', gap: '3px',
                                    'font-size': '10px', color: agentColor, opacity: '0.8',
                                    background: agentBg, padding: '1px 7px', 'border-radius': '8px',
                                    border: `1px solid ${agentColor}30`,
                                  }}>
                                    <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
                                    生成中
                                  </span>
                                </Show>
                              </div>

                              {/* Message content bubble */}
                              <div style={{
                                background: themeColors.surface,
                                border: `1px solid ${themeColors.border}`,
                                'border-left': `3px solid ${agentColor}60`,
                                padding: '10px 14px',
                                'border-radius': '0 14px 14px 14px',
                                'font-size': '13px', 'line-height': '1.7',
                                color: themeColors.textPrimary,
                                'box-shadow': '0 1px 3px rgba(0,0,0,0.05)',
                                'min-width': '80px',
                              }}>
                                {/* Loading state: empty + streaming */}
                                <Show when={isEmpty()}>
                                  <span style={{ display: 'flex', 'align-items': 'center', gap: '5px' }}>
                                    <span class="typing-dot" style={{ 'animation-delay': '0s' }} />
                                    <span class="typing-dot" style={{ 'animation-delay': '0.2s' }} />
                                    <span class="typing-dot" style={{ 'animation-delay': '0.4s' }} />
                                  </span>
                                </Show>
                                {/* Has content */}
                                <Show when={msg.text}>
                                  {/* Think block */}
                                  <Show when={parsed.thinking}>
                                    <ThinkBlock content={parsed.thinking} complete={parsed.thinkingComplete} streaming={thinkStreaming()} />
                                  </Show>
                                  {/* Main output */}
                                  <Show when={parsed.output}>
                                    <MarkdownMsg content={parsed.output} />
                                    <Show when={outStreaming()}>
                                      <span class="streaming-cursor" />
                                    </Show>
                                  </Show>
                                  {/* Thinking done but output not started yet */}
                                  <Show when={!parsed.output && parsed.thinkingComplete && msg.isStreaming}>
                                    <span style={{ display: 'flex', 'align-items': 'center', gap: '5px', 'margin-top': '4px' }}>
                                      <span class="typing-dot" style={{ 'animation-delay': '0s' }} />
                                      <span class="typing-dot" style={{ 'animation-delay': '0.2s' }} />
                                      <span class="typing-dot" style={{ 'animation-delay': '0.4s' }} />
                                    </span>
                                  </Show>
                                </Show>
                              </div>

                              {/* Footer: time + copy */}
                              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-top': '4px', 'padding-left': '2px' }}>
                                <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>{msg.time}</span>
                                <Show when={!msg.isStreaming && msg.text && hovered()}>
                                  <button
                                    onClick={handleCopy}
                                    style={{
                                      display: 'flex', 'align-items': 'center', gap: '3px',
                                      padding: '2px 7px', 'border-radius': '5px',
                                      'font-size': '11px', cursor: 'pointer',
                                      background: themeColors.hover, border: `1px solid ${themeColors.border}`,
                                      color: copied() ? '#16a34a' : themeColors.textMuted,
                                      transition: 'all 0.15s',
                                    }}
                                  >
                                    <Show when={copied()} fallback={<Copy size={9} />}><Check size={9} /></Show>
                                    {copied() ? '已复制' : '复制'}
                                  </button>
                                </Show>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  </For>
                </div>

                {/* Bottom input */}
                <div style={{ 'flex-shrink': 0, padding: '16px 0 0' }}>
                  <GoalInputPanel />
                </div>
                <Show when={agentError() !== null}>
                  <div style={{ padding: '10px 14px', 'border-radius': '8px', 'font-size': '13px', background: '#fff2f0', border: '1px solid #ffccc7', color: '#cf1322', display: 'flex', gap: '8px', 'margin-top': '8px', 'align-items': 'flex-start' }}>
                    <span style={{ 'flex-shrink': 0 }}>⚠️</span>
                    <div style={{ flex: 1 }}><strong>AI 调用失败</strong><br />{agentError()}</div>
                    <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', 'flex-shrink': 0 }}>✕</button>
                  </div>
                </Show>
              </div>
            }>
              {/* ── Empty state: centered input ── */}
              <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', padding: '32px 24px', gap: '20px' }}>
                {/* Hero section */}
                <div style={{ 'text-align': 'center', 'max-width': '480px' }}>
                  <div style={{ 'font-size': '36px', 'margin-bottom': '10px', 'line-height': 1 }}>🤖</div>
                  <div style={{ 'font-size': '18px', 'font-weight': 700, color: themeColors.textPrimary, 'margin-bottom': '6px' }}>Agent 自动驾驶</div>
                  <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'line-height': '1.6' }}>
                    描述目标，{teamAgents().length} 个专属 Agent 并行规划、开发、测试、部署
                  </div>
                  {/* Agent avatar row */}
                  <div style={{ display: 'flex', 'justify-content': 'center', gap: '8px', 'margin-top': '16px', 'flex-wrap': 'wrap' }}>
                    <For each={teamAgents().slice(0, 6)}>{(agent) => (
                      <div title={agent.name} style={{
                        width: '36px', height: '36px', 'border-radius': '10px',
                        background: agent.bgColor, border: `1.5px solid ${agent.color}30`,
                        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                        'font-size': '18px',
                      }}>{agent.emoji}</div>
                    )}</For>
                  </div>
                </div>
                <GoalInputPanel centered />
                <Show when={agentError() !== null}>
                  <div style={{ 'max-width': '680px', width: '100%', padding: '10px 14px', 'border-radius': '8px', 'font-size': '13px', background: '#fff2f0', border: '1px solid #ffccc7', color: '#cf1322', display: 'flex', gap: '8px', 'align-items': 'flex-start' }}>
                    <span style={{ 'flex-shrink': 0 }}>⚠️</span>
                    <div style={{ flex: 1 }}><strong>AI 调用失败</strong><br />{agentError()}</div>
                    <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', 'flex-shrink': 0 }}>✕</button>
                  </div>
                </Show>
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
                <div style={{ padding: '12px 14px', background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '10px', 'margin-bottom': '12px' }}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'font-size': '12px', 'font-weight': 700, color: chartColors.primary, 'margin-bottom': '6px' }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    Orchestrator 规划中...
                  </div>
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'max-height': '120px', 'overflow-y': 'auto' }}>
                    <MarkdownMsg content={orchestratorText()} />
                  </div>
                </div>
              </Show>
              <For each={dispatchPlan()}>
                {(item) => {
                  const agent = teamAgents().find((a) => a.id === item.agentId);
                  const rawText = () => agentStreamTexts()[item.agentId] ?? '';
                  const execStatus = () => agentExecStatuses()[item.agentId] ?? 'pending';
                  const isActive = () => execStatus() === 'thinking' || execStatus() === 'working';
                  const isDone = () => execStatus() === 'done';
                  if (!agent) return null;

                  const parsedFlow = () => parseThinkingContent(rawText());

                  return (
                    <div style={{ 'margin-bottom': '12px', display: 'flex', gap: '12px' }}>
                      {/* Status dot + line */}
                      <div style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'flex-shrink': 0 }}>
                        <div style={{
                          width: '22px', height: '22px', 'border-radius': '50%', 'flex-shrink': 0,
                          background: isDone() ? agent.color : isActive() ? `${agent.color}20` : themeColors.hover,
                          border: isActive() ? `2px solid ${agent.color}` : isDone() ? 'none' : `2px solid ${themeColors.border}`,
                          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                          'box-shadow': isActive() ? `0 0 0 3px ${agent.color}15` : 'none',
                          transition: 'all 0.3s',
                        }}>
                          <Show when={isActive()} fallback={
                            <Show when={isDone()}>
                              <CheckCircle size={12} style={{ color: 'white' }} />
                            </Show>
                          }>
                            <Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} />
                          </Show>
                        </div>
                      </div>
                      <div style={{ flex: 1, 'min-width': 0, 'padding-bottom': '4px' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '7px', 'margin-bottom': '6px', 'flex-wrap': 'wrap' }}>
                          <span style={{
                            display: 'inline-flex', 'align-items': 'center', gap: '4px',
                            background: agent.bgColor, color: agent.color,
                            border: `1px solid ${agent.borderColor ?? agent.color}40`,
                            padding: '2px 8px', 'border-radius': '6px', 'font-size': '11px', 'font-weight': 700,
                          }}>
                            {agent.emoji} {agent.name}
                          </span>
                          <span style={{ 'font-size': '11px', color: themeColors.textMuted, flex: 1, 'min-width': 0, overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                            {item.task.slice(0, 60)}{item.task.length > 60 ? '…' : ''}
                          </span>
                          {/* Status badge */}
                          <span style={{
                            'font-size': '10px', padding: '1px 6px', 'border-radius': '8px', 'flex-shrink': 0,
                            background: isDone() ? '#f0fdf4' : isActive() ? `${agent.color}12` : themeColors.hover,
                            color: isDone() ? '#16a34a' : isActive() ? agent.color : themeColors.textMuted,
                            border: `1px solid ${isDone() ? '#86efac' : isActive() ? `${agent.color}30` : themeColors.border}`,
                          }}>
                            {isDone() ? '✓ 完成' : isActive() ? '执行中' : '等待中'}
                          </span>
                        </div>
                        {/* Content area */}
                        <Show when={rawText()}>
                          <div style={{
                            background: themeColors.bgSubtle, 'border-radius': '8px',
                            border: `1px solid ${themeColors.border}`,
                            'border-left': `3px solid ${agent.color}50`,
                            overflow: 'hidden',
                          }}>
                            <Show when={parsedFlow().thinking}>
                              <div style={{ padding: '6px 10px', 'font-size': '11px', color: 'rgba(109,40,217,0.7)', 'font-style': 'italic', 'border-bottom': `1px solid ${themeColors.border}`, background: 'rgba(139,92,246,0.04)', 'white-space': 'pre-wrap', 'max-height': '80px', 'overflow-y': 'auto', 'line-height': '1.5' }}>
                                <span style={{ 'font-weight': 600, 'font-style': 'normal' }}>🧠 </span>{parsedFlow().thinking}
                              </div>
                            </Show>
                            <Show when={parsedFlow().output}>
                              <div style={{ padding: '8px 10px', 'max-height': '220px', 'overflow-y': 'auto', 'font-size': '12px' }}>
                                <MarkdownMsg content={parsedFlow().output} />
                                <Show when={isActive() && parsedFlow().thinkingComplete}>
                                  <span class="streaming-cursor" />
                                </Show>
                              </div>
                            </Show>
                            <Show when={!parsedFlow().output && isActive()}>
                              <div style={{ padding: '8px 10px', display: 'flex', 'align-items': 'center', gap: '5px' }}>
                                <span class="typing-dot" style={{ 'animation-delay': '0s' }} />
                                <span class="typing-dot" style={{ 'animation-delay': '0.2s' }} />
                                <span class="typing-dot" style={{ 'animation-delay': '0.4s' }} />
                              </div>
                            </Show>
                          </div>
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
        .typing-dot {
          display: inline-block;
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor; opacity: 0.5;
          animation: ai-bounce 1.4s ease-in-out infinite;
        }
      `}</style>
      <Show when={permissionRequest()}>
        <PermissionDialog
          request={permissionRequest()!}
          onResolve={(action) => {
            permissionRequest()?.resolve(action);
            setPermissionRequest(null);
          }}
        />
      </Show>
    </div>
  );
};

export default EnterpriseAutopilot;
