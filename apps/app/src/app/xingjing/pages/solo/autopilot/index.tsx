import { createSignal, Show, For, onCleanup, onMount, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { FileText, PlayCircle, CheckCircle, Clock, Zap, Loader2, Settings, Maximize2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-solid';
import CreateProductModal from '../../../components/product/new-product-modal';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { soloWorkflowSteps, soloSampleGoals } from '../../../mock/autopilot';
import { modelOptions } from '../../../mock/settings';
import { loadProjectSettings, readYaml } from '../../../services/file-store';
import { initProductDir } from '../../../../lib/tauri';
import { getHealthScore } from '../../../services/knowledge-health';
import { buildKnowledgeIndex } from '../../../services/knowledge-index';
import {
  SOLO_AGENTS,
  runDirectAgent,
  parseMention,
  type AutopilotAgent,
  type AgentExecutionStatus,
} from '../../../services/autopilot-executor';
import MentionInput from '../../../components/autopilot/mention-input';
import ArtifactWorkspace, { type ArtifactItem, detectArtifactFormat } from '../../../components/autopilot/artifact-workspace';
import PermissionDialog, { type PermissionRequest } from '../../../components/autopilot/permission-dialog';
import { createTeamSessionOrchestrator } from '../../../services/team-session-orchestrator';
import AgentSessionView from '../../../components/autopilot/agent-session-view';
import SessionTabBar from '../../../components/autopilot/session-tab-bar';
import TeamChatComposer from '../../../components/autopilot/team-chat-composer';

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
  agent: AutopilotAgent;
  status: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
  currentTask?: string;
  doneToday: number;
  artifactCount: number;
  elapsedTime?: string;
}) => {
  const isActive = () => props.status === 'thinking' || props.status === 'working';
  const isDone = () => props.status === 'done';

  const statusDotColor = () => {
    if (isActive()) return chartColors.success;
    if (isDone()) return chartColors.success;
    if (props.status === 'waiting') return '#fa8c16';
    return themeColors.border;
  };

  return (
    <div style={{
      display: 'flex',
      'align-items': 'flex-start',
      gap: '10px',
      padding: '10px 12px',
      'border-radius': '6px',
      background: isActive() ? themeColors.successBg : 'transparent',
      'border-left': `3px solid ${isActive() ? chartColors.success : 'transparent'}`,
      transition: 'all 0.3s ease',
    }}>
      {/* 图标 */}
      <div style={{
        width: '32px',
        height: '32px',
        'border-radius': '8px',
        background: props.agent.bgColor,
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'font-size': '16px',
        'flex-shrink': '0',
        filter: props.status === 'idle' ? 'grayscale(80%) opacity(0.5)' : 'none',
        transition: 'filter 0.3s',
      }}>
        {props.agent.emoji}
      </div>

      {/* 内容 */}
      <div style={{ flex: '1', 'min-width': '0' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '5px', 'margin-bottom': '2px' }}>
          <span style={{
            'font-size': '13px',
            'font-weight': '600',
            color: isActive() ? props.agent.color : themeColors.text,
          }}>
            {props.agent.name}
          </span>
          <span style={{
            display: 'inline-block',
            width: '7px',
            height: '7px',
            'border-radius': '50%',
            background: statusDotColor(),
          }} />
        </div>
        <div style={{
          'font-size': '11px',
          color: themeColors.textMuted,
          'margin-bottom': '6px',
          'line-height': '1.4',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}>
          {isActive() && props.currentTask ? props.currentTask : props.agent.description}
        </div>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}>
          <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
            {props.elapsedTime ?? '—'}
          </span>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
            <Show when={props.doneToday > 0}>
              <span style={{
                'font-size': '10px',
                padding: '1px 6px',
                'border-radius': '4px',
                background: chartColors.primary + '20',
                color: chartColors.primary,
                'font-weight': '500',
              }}>
                {props.doneToday} 次
              </span>
            </Show>
            <Show when={props.artifactCount > 0}>
              <span style={{
                'font-size': '10px',
                padding: '1px 7px',
                'border-radius': '4px',
                background: chartColors.success + '20',
                color: chartColors.success,
                'font-weight': '500',
              }}>
                {props.artifactCount} 产出
              </span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Agent 面板左侧栏 ──────────────────────────────────────────────────────────

const AgentPanelSidebar = (props: {
  agents: AutopilotAgent[];
  agentStatuses: AgentStatus;
  agentTasks: AgentTasks;
  agentDone: AgentDone;
  elapsedSec: number;
  runState: RunState;
  artifactCount: (id: string) => number;
  stepTimes: Record<string, string>;
  progress: number;
}) => {
  const [isCollapsed, setIsCollapsed] = createSignal(true);

  const doneCount = () => props.agents.filter(a => props.agentStatuses[a.id] === 'done').length;
  const runCount = () => props.agents.filter(
    a => props.agentStatuses[a.id] === 'thinking' || props.agentStatuses[a.id] === 'working'
  ).length;
  const waitCount = () => props.agents.filter(
    a => props.agentStatuses[a.id] === 'idle' || props.agentStatuses[a.id] === 'waiting'
  ).length;
  const progressPct = () => props.runState === 'done'
    ? 100
    : Math.round((doneCount() / Math.max(props.agents.length, 1)) * 100);
  const fmtElapsed = (sec: number) =>
    `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, '0')}s`;

  // 收起态：只显示一个简洁的竖向栏
  return (
    <Show
      when={!isCollapsed()}
      fallback={
        <div style={{
          width: '44px',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          border: `1px solid ${themeColors.border}`,
          'border-radius': '8px',
          background: themeColors.surface,
          overflow: 'hidden',
          'flex-shrink': '0',
          transition: 'width 0.2s ease',
        }}>
          {/* 展开按鈕 */}
          <button
            onClick={() => setIsCollapsed(false)}
            style={{
              width: '100%',
              padding: '8px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              color: themeColors.textMuted,
              'border-bottom': `1px solid ${themeColors.border}`,
              'flex-shrink': 0,
            }}
          >
            <ChevronRight size={16} />
          </button>
          {/* 进度条 + 完成数/总数 */}
          <div style={{ width: '100%', padding: '6px 8px', 'flex-shrink': 0 }}>
            <div style={{ width: '100%', height: '3px', background: themeColors.border, 'border-radius': '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct()}%`,
                background: props.runState === 'done' ? chartColors.success : chartColors.success,
                'border-radius': '2px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ 'text-align': 'center', 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '3px', 'font-weight': 500 }}>
              {doneCount()}/{props.agents.length}
            </div>
          </div>
          {/* Agent 图标列 */}
          <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '6px' }}>
            <For each={props.agents}>
              {(agent) => {
                const status = () => props.agentStatuses[agent.id] ?? 'idle';
                const isActive = () => status() === 'thinking' || status() === 'working';
                const isDone = () => status() === 'done';
                const dotColor = () => {
                  if (isActive()) return chartColors.success;
                  if (isDone()) return chartColors.success;
                  if (status() === 'waiting') return '#fa8c16';
                  return themeColors.border;
                };
                return (
                  <div
                    title={`${agent.name} · ${isActive() ? '执行中' : isDone() ? '完成' : status() === 'waiting' ? '等待中' : '待命'}`}
                    style={{ position: 'relative', 'flex-shrink': '0' }}
                  >
                    <div style={{
                      width: '28px', height: '28px', 'border-radius': '8px',
                      background: agent.bgColor, display: 'flex',
                      'align-items': 'center', 'justify-content': 'center', 'font-size': '14px',
                      filter: status() === 'idle' ? 'grayscale(80%) opacity(0.5)' : 'none',
                      transition: 'filter 0.3s',
                      'box-shadow': isActive() ? `0 0 0 2px ${agent.color}40` : 'none',
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
            <Show when={runCount() > 0}>
              <div style={{ 'text-align': 'center' }}>
                <div style={{ 'font-size': '12px', 'font-weight': 700, color: '#fa8c16', 'line-height': 1 }}>{runCount()}</div>
                <div style={{ 'font-size': '9px', color: themeColors.textMuted, 'margin-top': '1px' }}>运行</div>
              </div>
            </Show>
            <Show when={props.runState !== 'idle'}>
              <div style={{ 'writing-mode': 'vertical-rl', transform: 'rotate(180deg)', 'font-size': '10px', color: themeColors.textMuted, 'line-height': 1, 'padding': '2px 0', 'max-height': '52px', overflow: 'hidden' }}>
                {fmtElapsed(props.elapsedSec)}
              </div>
            </Show>
          </div>
        </div>
      }
    >
      <div style={{
        width: '220px',
        height: '100%',
        display: 'flex',
        'flex-direction': 'column',
        border: `1px solid ${themeColors.border}`,
        'border-radius': '8px',
        background: themeColors.surface,
        overflow: 'hidden',
        'flex-shrink': '0',
        transition: 'width 0.2s ease',
      }}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          padding: '12px 14px 10px',
          'border-bottom': `1px solid ${themeColors.border}`,
          'flex-shrink': '0',
        }}>
          <span style={{ 'font-size': '13px', 'font-weight': '600' }}>Agent 面板</span>
          <button
            onClick={() => setIsCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              'align-items': 'center',
              color: themeColors.textMuted,
              'border-radius': '4px',
            }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* 进度区 */}
        <div style={{ padding: '8px 14px 10px', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': '0' }}>
          {/* 状态文字 + 百分比 */}
          <Show when={props.runState !== 'idle'}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'line-height': '1.3' }}>
                {props.runState === 'done'
                  ? `全部完成 · ${props.agents.length} 个角色脑并行调度`
                  : `并行调度中... ${doneCount()}/${props.agents.length} 个脑已完成`}
              </span>
              <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'flex-shrink': '0', 'margin-left': '6px' }}>{props.progress}%</span>
            </div>
          </Show>
          {/* 进度条 */}
          <div style={{
            background: themeColors.border,
            'border-radius': '4px',
            height: '6px',
            'margin-bottom': '6px',
          }}>
            <div style={{
              background: props.runState === 'done' ? chartColors.success : chartColors.primary,
              height: '100%',
              'border-radius': '4px',
              width: `${props.progress || progressPct()}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
              已用时 {fmtElapsed(props.elapsedSec)}
            </span>
            <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
              {doneCount()}/{props.agents.length} 完成
            </span>
          </div>
        </div>

        {/* Agent 列表 */}
        <div style={{ flex: '1', 'overflow-y': 'auto', padding: '4px 0' }}>
          <For each={props.agents}>
            {(agent) => (
              <SoloBrainCard
                agent={agent}
                status={props.agentStatuses[agent.id] as any}
                currentTask={props.agentTasks[agent.id]}
                doneToday={props.agentDone[agent.id]}
                artifactCount={props.artifactCount(agent.id)}
                elapsedTime={props.stepTimes[agent.id]}
              />
            )}
          </For>
        </div>

        {/* 底部统计 */}
        <div style={{
          display: 'flex',
          'border-top': `1px solid ${themeColors.border}`,
          padding: '10px 0',
          'flex-shrink': '0',
        }}>
          <div style={{ flex: '1', 'text-align': 'center' }}>
            <div style={{ 'font-size': '20px', 'font-weight': '700', color: chartColors.success, 'line-height': '1.2' }}>
              {doneCount()}
            </div>
            <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>完成</div>
          </div>
          <div style={{
            flex: '1',
            'text-align': 'center',
            'border-left': `1px solid ${themeColors.border}`,
            'border-right': `1px solid ${themeColors.border}`,
          }}>
            <div style={{ 'font-size': '20px', 'font-weight': '700', color: '#fa8c16', 'line-height': '1.2' }}>
              {runCount()}
            </div>
            <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>运行</div>
          </div>
          <div style={{ flex: '1', 'text-align': 'center' }}>
            <div style={{ 'font-size': '20px', 'font-weight': '700', color: themeColors.textSecondary, 'line-height': '1.2' }}>
              {waitCount()}
            </div>
            <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>等待</div>
          </div>
        </div>
      </div>
    </Show>
  );
};

type RunState = 'idle' | 'running' | 'done';

const SoloAutopilot = () => {
  const { state, productStore, actions, resolvedWorkspaceId, openworkCtx } = useAppStore();
  const navigate = useNavigate();
  const soloProducts = () => productStore.products().filter(p => (p.productType ?? 'solo') === 'solo');
  const [knowledgeHealthScore, setKnowledgeHealthScore] = createSignal<number | null>(null);

  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = createSignal<AgentStatus>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<AgentTasks>({});
  const [agentDone, setAgentDone] = createSignal<AgentDone>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 0]))
  );
  const [artifacts, setArtifacts] = createSignal<typeof soloWorkflowSteps>([]);
  const [progress, setProgress] = createSignal(0);
  const [agentExecStatuses, setAgentExecStatuses] = createSignal<Record<string, AgentExecutionStatus>>({});
  const [agentError, setAgentError] = createSignal<string | null>(null);
  const [artifactsData, setArtifactsData] = createSignal<ArtifactItem[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [saveMsg, setSaveMsg] = createSignal<string | null>(null);

  // ─── 权限授权队列 ─────────────────────────────────────────────────────────────
  // 队列头部为当前展示的 Dialog，resolve 后自动弹出下一个
  const [permissionQueue, setPermissionQueue] = createSignal<PermissionRequest[]>([]);

  const handlePermissionAsked = (params: PermissionRequest) => {
    setPermissionQueue((prev) => [...prev, params]);
  };

  const handlePermissionResolve = (action: 'once' | 'always' | 'reject') => {
    const current = permissionQueue()[0];
    if (current) {
      current.resolve(action);
      setPermissionQueue((prev) => prev.slice(1));
    }
  };
  const [artifactWidth, setArtifactWidth] = createSignal(420);
  const [artifactFloat, setArtifactFloat] = createSignal(false);
  const [artifactCollapsed, setArtifactCollapsed] = createSignal(true);
  const [artifactFloatPos, setArtifactFloatPos] = createSignal({ x: 0, y: 64 });
  // 展开/折叠状态：key = step.id 或 agentId
  const [expandedSteps, setExpandedSteps] = createSignal<Record<string, boolean>>({});
  // 步骤出现时间戳：key = step.id 或 agentId
  const [stepTimes, setStepTimes] = createSignal<Record<string, string>>({});
  const [artifactFloatWidth, setArtifactFloatWidth] = createSignal(420);
  const [artifactFloatHeight, setArtifactFloatHeight] = createSignal(Math.round(window.innerHeight * 0.78));

  // 产出物有内容时自动展开
  createEffect(() => {
    if (artifactsData().length > 0) {
      setArtifactCollapsed(false);
    }
  });

  // ─── 计时状态 ──────────────────────────────────────────────────────────────────
  const [elapsedSec, setElapsedSec] = createSignal(0);
  let elapsedTimerRef: ReturnType<typeof setInterval> | undefined;

  const agentArtifactCount = (agentId: string) =>
    artifactsData().filter(a => a.agentId === agentId).length;

  // ─── 模型选择器状态 ───────────────────────────────────────────────────────────
  // per-provider 已配置的 API Keys（从 settings.yaml 读取）
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({});
  // 当前会话选用的模型 ID（默认取 state.llmConfig.modelID）
  const [sessionModelId, setSessionModelId] = createSignal<string>(
    state.llmConfig.modelID ?? 'deepseek-chat'
  );

  // 已填写 API Key 的模型列表（排除 custom）
  const configuredModels = () =>
    modelOptions.filter(
      (opt) =>
        opt.providerID !== 'custom' &&
        (providerKeys()[opt.providerID]?.trim().length ?? 0) > 0,
    );

  // 反查当前会话选用模型的完整配置，传给 callAgent
  const getSessionModel = () => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return undefined;
    if (!providerKeys()[opt.providerID]) return undefined;
    return { providerID: opt.providerID, modelID: opt.modelID };
  };

  // onMount：加载持久化的 providerKeys，合并 store 内存最新值
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        const keys: Record<string, string> = { ...(settings.llmProviderKeys ?? {}) };
        const cur = state.llmConfig;
        if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;
        setProviderKeys(keys);
        // 若当前 sessionModelId 不在已配置列表，切换到第一个已配置模型
        const configured = modelOptions.filter(
          (opt) => opt.providerID !== 'custom' && (keys[opt.providerID]?.trim().length ?? 0) > 0,
        );
        if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) {
          setSessionModelId(configured[0].modelID);
        }
      } catch { /* 静默降级 */ }

      // 异步加载知识健康度分数
      buildKnowledgeIndex(workDir, null).then(idx => {
        if (idx) return getHealthScore(workDir, idx);
        return null;
      }).then(score => {
        if (score !== null) setKnowledgeHealthScore(score);
      }).catch(() => { /* 知识健康度加载失败：静默降级 */ });
    }
  });

  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];

  // ─── TeamSessionOrchestrator 初始化 ───────────────────────────────────────────
  const orchestrator = createTeamSessionOrchestrator({
    client: () => openworkCtx?.opencodeClient?.() ?? null,
    workspaceId: () => resolvedWorkspaceId(),
    workDir: () => productStore.activeProduct()?.workDir ?? '',
    availableAgents: SOLO_AGENTS,
    model: () => {
      const m = getSessionModel();
      if (!m) return null;
      return { providerID: m.providerID, modelID: m.modelID };
    },
    skillApi: null,
  });

  const clearTimers = () => {
    timersRef.forEach(clearTimeout);
    timersRef.length = 0;
  };

  const reset = () => {
    clearTimers();
    if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    setElapsedSec(0);
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle' as const])));
    setAgentTasks({});
    setArtifacts([]);
    setArtifactsData([]);
    setArtifactCollapsed(true);
    setProgress(0);
    setAgentExecStatuses({});
    setExpandedSteps({});
    setStepTimes({});
    // 清理残留的权限请求：reject 所有等待中的 Promise 防止旧 SSE 循环永远卡住
    permissionQueue().forEach((req) => { try { req.resolve('reject'); } catch { /* noop */ } });
    setPermissionQueue([]);
    // 注意：agentDone 不在此重置，记录本次会话的累计执行次数
  };

  // 格式化当前时间 HH:MM:SS
  const nowTime = () => {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  };

  // 切换单个步骤展开/折叠
  const toggleStep = (key: string) => {
    setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ─── handleStart: 使用 TeamSessionOrchestrator ───
  const handleStart = async () => {
    if (!goal().trim()) return;
    reset();
    setAgentError(null);
    setRunState('running');

    // ── 前置校验：模型未配置时立即报错 ──
    if (!getSessionModel() && configuredModels().length === 0) {
      setAgentError('尚未配置可用的大模型，请先前往「设置 → 大模型配置」填写 API Key 并保存');
      setRunState('idle');
      return;
    }

    const { targetAgent, cleanText } = parseMention(goal(), SOLO_AGENTS);

    try {
      if (targetAgent) {
        // @mention 直接调用模式
        await orchestrator.runDirect(targetAgent.id, cleanText);
      } else {
        // 团队协作模式
        await orchestrator.run(cleanText);
      }
      setRunState('done');
    } catch (err) {
      console.error('[solo-autopilot] handleStart error:', err);
      setAgentError(`执行失败：${err}`);
      setRunState('idle');
    }
  };

  // ─── 产出物保存 ─────────────────────────────────────────────────────────────
  const handleSaveArtifact = async (artifact: ArtifactItem) => {
    const product = productStore.activeProduct();
    const workDir = product?.workDir;
    if (!workDir) {
      setSaveMsg('未找到活跃产品的工作目录');
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    setSaving(true);
    try {
      // 1. 读取 config.yaml 获取 appCode（使用相对路径 + directory 参数）
      let appCode: string | undefined;
      try {
        const config = await readYaml<{ apps?: string[] }>(
          '.xingjing/config.yaml',
          { apps: [] },
          workDir,
        );
        appCode = config.apps?.[0];
      } catch {
        console.warn('[solo-autopilot] 读取 .xingjing/config.yaml 失败，尝试降级');
      }
      // 降级：使用产品 code 作为 appCode
      if (!appCode && product?.code) {
        appCode = product.code;
        console.info(`[solo-autopilot] 降级使用产品编码 "${appCode}" 作为 appCode`);
      }
      if (!appCode) throw new Error('未找到应用编码，请确认产品目录已初始化或产品已设置英文编码');

      // 2. 根据 agentId 确定目标子目录
      const dirMap: Record<string, string> = {
        'product-brain': `apps/${appCode}/docs/product/prd`,
        'eng-brain': `apps/${appCode}/docs/product/architecture`,
      };
      const subDir = dirMap[artifact.agentId] ?? `apps/${appCode}/docs/delivery`;

      // 3. 生成安全文件名
      const safeName = artifact.title
        .replace(/[\/\\:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const timestamp = new Date().toISOString().slice(0, 10);
      const ext = artifact.format === 'html' ? '.html' : '.md';
      const fileName = `${safeName}-${timestamp}${ext}`;

      // 4. 通过 Tauri 原生命令写入文件（自动创建父目录）
      const relativePath = `${subDir}/${fileName}`;
      const result = await initProductDir(workDir, [{ path: relativePath, content: artifact.content }]);
      if (!result.ok) {
        throw new Error(result.error ?? '文件写入失败');
      }

      setSaveMsg(`已保存到 ${subDir}/${fileName}`);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg(`保存失败：${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setSaveMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ─── 产出物区域 resize / 悬浮面板拖拽 ──────────────────────────────────────
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartW = 420;

  const handleResizeMove = (e: PointerEvent) => {
    if (!isResizing) return;
    const dx = resizeStartX - e.clientX;
    setArtifactWidth(Math.max(280, Math.min(700, resizeStartW + dx)));
  };
  const handleResizeEnd = () => {
    isResizing = false;
    document.removeEventListener('pointermove', handleResizeMove);
    document.removeEventListener('pointerup', handleResizeEnd);
  };
  const handleResizeStart = (e: PointerEvent) => {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartW = artifactWidth();
    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeEnd);
    e.preventDefault();
  };

  let isFloatDragging = false;
  let floatDragStart = { x: 0, y: 0 };
  let floatPosStart = { x: 0, y: 0 };

  const handleFloatDragStart = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isFloatDragging = true;
    floatDragStart = { x: e.clientX, y: e.clientY };
    floatPosStart = { ...artifactFloatPos() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const handleFloatDragMove = (e: PointerEvent) => {
    if (!isFloatDragging) return;
    const dx = e.clientX - floatDragStart.x;
    const dy = e.clientY - floatDragStart.y;
    setArtifactFloatPos({
      x: Math.max(0, Math.min(floatPosStart.x + dx, window.innerWidth - artifactFloatWidth())),
      y: Math.max(0, floatPosStart.y + dy),
    });
  };
  const handleFloatDragEnd = () => { isFloatDragging = false; };

  // ─── 浮动面板边框 Resize ──────────────────────────────────────────────────────
  let isFloatResizing = false;
  let floatResizeDir = '';
  let floatResizeStart = { x: 0, y: 0, w: 0, h: 0, px: 0 };

  const handleFloatResizeMove = (e: PointerEvent) => {
    if (!isFloatResizing) return;
    const dx = e.clientX - floatResizeStart.x;
    const dy = e.clientY - floatResizeStart.y;
    if (floatResizeDir.includes('right')) {
      setArtifactFloatWidth(Math.max(280, Math.min(window.innerWidth - 40, floatResizeStart.w + dx)));
    }
    if (floatResizeDir.includes('left')) {
      const newW = Math.max(280, Math.min(window.innerWidth - 40, floatResizeStart.w - dx));
      setArtifactFloatWidth(newW);
      setArtifactFloatPos(prev => ({ ...prev, x: Math.max(0, floatResizeStart.px + floatResizeStart.w - newW) }));
    }
    if (floatResizeDir.includes('bottom')) {
      setArtifactFloatHeight(Math.max(200, Math.min(window.innerHeight - 80, floatResizeStart.h + dy)));
    }
  };

  const handleFloatResizeEnd = () => {
    isFloatResizing = false;
    document.removeEventListener('pointermove', handleFloatResizeMove);
    document.removeEventListener('pointerup', handleFloatResizeEnd);
  };

  const handleFloatResizeEdge = (e: PointerEvent, dir: string) => {
    isFloatResizing = true;
    floatResizeDir = dir;
    floatResizeStart = { x: e.clientX, y: e.clientY, w: artifactFloatWidth(), h: artifactFloatHeight(), px: artifactFloatPos().x };
    document.addEventListener('pointermove', handleFloatResizeMove);
    document.addEventListener('pointerup', handleFloatResizeEnd);
    e.preventDefault();
    e.stopPropagation();
  };

  onCleanup(() => {
    clearTimers();
    if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    document.removeEventListener('pointermove', handleResizeMove);
    document.removeEventListener('pointerup', handleResizeEnd);
    document.removeEventListener('pointermove', handleFloatResizeMove);
    document.removeEventListener('pointerup', handleFloatResizeEnd);
  });

  const doneAgents = () => Object.values(agentStatuses()).filter((s) => s === 'done').length;

  // 根据 runState 自动管理计时器
  createEffect(() => {
    if (runState() === 'running') {
      if (elapsedTimerRef) clearInterval(elapsedTimerRef);
      setElapsedSec(0);
      elapsedTimerRef = setInterval(() => setElapsedSec(s => s + 1), 1000);
    } else {
      if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    }
  });

  return (
    <div style={{ display: 'flex', 'align-items': 'stretch', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 左侧 Agent 面板 */}
      <div style={{ 'flex-shrink': '0', 'padding-right': '8px', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
        <AgentPanelSidebar
          agents={SOLO_AGENTS}
          agentStatuses={agentStatuses()}
          agentTasks={agentTasks()}
          agentDone={agentDone()}
          elapsedSec={elapsedSec()}
          runState={runState()}
          artifactCount={agentArtifactCount}
          stepTimes={stepTimes()}
          progress={progress()}
        />
      </div>

      {/* 中间列：对话 + 执行流 */}
      <div style={{ flex: '1', 'min-width': '0', display: 'flex', 'flex-direction': 'column', 'padding-right': '8px', overflow: 'hidden' }}>

        {/* 空状态横幅 */}
        <Show when={soloProducts().length === 0}>
          <div style={{
            background: `linear-gradient(135deg, ${themeColors.successBg} 0%, ${themeColors.successBg} 100%)`,
            border: `1px dashed ${themeColors.successBorder}`,
            'text-align': 'center',
            'border-radius': '8px',
            padding: '16px',
            'flex-shrink': '0',
            'margin-bottom': '8px',
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
          'margin-bottom': '8px',
          'border-radius': '8px',
          padding: '6px 14px',
          background: themeColors.primaryBg,
          border: `1px solid ${themeColors.primaryBorder}`,
          'font-size': '12px',
          'flex-shrink': '0',
        }}>
          <strong style={{ color: chartColors.primary }}>独立版 · 自动驾驶</strong>
          <Show when={knowledgeHealthScore() !== null}>
            <span style={{
              'font-size': '11px', padding: '1px 6px', 'border-radius': '9999px', 'margin-left': '8px',
              background: knowledgeHealthScore()! >= 80 ? chartColors.success : knowledgeHealthScore()! >= 50 ? chartColors.warning : chartColors.error,
              color: 'white', 'font-weight': 600,
            }}>
              🧠 {knowledgeHealthScore()}分
            </span>
          </Show>
          <span style={{ color: themeColors.textSecondary, 'margin-left': '8px' }}>
            你就是所有角色，AI 直接替你执行，4 个虚拟角色脑并行调度，无审批流程，适合快速验证和迭代
          </span>
        </div>

        {/* ── 居中态：无消息 & idle ── */}
        <Show when={!orchestrator.state().orchestratorSessionId && !orchestrator.state().isRunning}>
          <div style={{ flex: '1', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'padding-bottom': '40px' }}>
            <div style={{ width: '100%' }}>
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
                  <Zap size={16} style={{ color: chartColors.success }} />
                  告诉 AI 你想做什么
                </div>
                <div style={{ 'margin-bottom': '12px' }}>
                  <MentionInput
                    value={goal()}
                    onChange={setGoal}
                    disabled={false}
                    placeholder="描述你的目标，或输入 @ 直接调用某个 Agent，例如：实现「段落一键重写」功能..."
                    agents={SOLO_AGENTS}
                  />
                </div>
                <div style={{ 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'flex-wrap': 'wrap' }}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
                    <Show
                      when={configuredModels().length > 0}
                      fallback={
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>暂无已配置模型</span>
                      }
                    >
                      <select
                        value={sessionModelId()}
                        onChange={(e) => setSessionModelId(e.currentTarget.value)}
                        style={{
                          'font-size': '12px',
                          padding: '4px 8px',
                          'border-radius': '6px',
                          border: `1px solid ${themeColors.border}`,
                          background: themeColors.surface,
                          color: themeColors.text,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <For each={configuredModels()}>
                          {(opt) => <option value={opt.modelID}>{opt.label}</option>}
                        </For>
                      </select>
                    </Show>
                  </div>
                  <button
                    onClick={handleStart}
                    disabled={!goal().trim()}
                    style={{
                      background: chartColors.success,
                      color: 'white',
                      border: 'none',
                      'border-radius': '6px',
                      padding: '8px 16px',
                      cursor: !goal().trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '6px',
                      opacity: !goal().trim() ? 0.6 : 1,
                    }}
                  >
                    启动
                  </button>
                </div>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
                  <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>快速示例：</span>
                  <For each={soloSampleGoals}>
                    {(g) => (
                      <div
                        onClick={() => setGoal(g)}
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
                </div>
              </div>
            </div>
          </div>
        </Show>

        {/* ── 展开态：有 session 或 运行中 ── */}
        <Show when={orchestrator.state().orchestratorSessionId || orchestrator.state().isRunning}>
          <div style={{ flex: '1', display: 'flex', 'flex-direction': 'column', 'min-height': '0', overflow: 'hidden' }}>

            {/* 对话内容区 */}
            <div
              style={{ flex: '1', 'overflow-y': 'auto', 'min-height': '0', padding: '12px 0 0' }}
            >
                {/* Session Tab Bar */}
                <Show when={orchestrator.state().orchestratorSessionId || orchestrator.state().agentSlots.size > 0}>
                  <div style={{ 'margin-bottom': '12px', 'padding': '0 12px' }}>
                    <SessionTabBar
                      orchestratorSessionId={orchestrator.state().orchestratorSessionId}
                      slots={Array.from(orchestrator.state().agentSlots.values())}
                      activeTabId={orchestrator.state().activeTabId}
                      onTabChange={orchestrator.setActiveTab}
                      dispatchPlan={orchestrator.state().dispatchPlan}
                    />
                  </div>
                </Show>

                <Show
                  when={orchestrator.state().activeTabId !== 'orchestrator' && orchestrator.getActiveSlot()}
                  fallback={
                    <div style={{
                      display: 'flex',
                      'flex-direction': 'column',
                      'align-items': 'center',
                      'justify-content': 'center',
                      height: '100%',
                      color: themeColors.textMuted,
                      'text-align': 'center',
                      padding: '40px',
                    }}>
                      <div style={{ 'font-size': '48px', 'margin-bottom': '16px' }}>💬</div>
                      <div style={{ 'font-size': '16px', 'font-weight': 500 }}>开始对话</div>
                      <div style={{ 'font-size': '13px', 'margin-top': '8px' }}>
                        输入目标或使用 @ 提及特定 Agent
                      </div>
                    </div>
                  }
                >
                  {(slot) => (
                    <AgentSessionView
                      slot={slot()}
                      getSessionById={orchestrator.getSessionById}
                      getMessagesBySessionId={orchestrator.getMessagesBySessionId}
                      ensureSessionLoaded={orchestrator.ensureSessionLoaded}
                      sessionLoadingById={orchestrator.sessionLoadingById}
                      onPermissionReply={(permId, action) => {
                        orchestrator.replyPermission(slot().agentId, permId, action);
                      }}
                      onQuestionReply={(reqId, answers) => {
                        orchestrator.replyQuestion(slot().agentId, reqId, answers);
                      }}
                      onSendMessage={(text) => {
                        orchestrator.sendTo(slot().agentId, text);
                      }}
                      developerMode={false}
                      showThinking={false}
                    />
                  )}
                </Show>
            </div>

            {/* ── 底部输入区（置底） ── */}
            <div style={{
              'flex-shrink': '0',
              'border-top': `1px solid ${themeColors.border}`,
              'padding-top': '12px',
              'margin-top': '8px',
              background: themeColors.surface,
            }}>
              <div style={{ 'margin-bottom': '8px' }}>
                <MentionInput
                  value={goal()}
                  onChange={setGoal}
                  disabled={runState() === 'running'}
                  placeholder="继续描述你的目标，或输入 @ 直接调用某个 Agent..."
                  agents={SOLO_AGENTS}
                />
              </div>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'flex-wrap': 'wrap', 'margin-bottom': '8px' }}>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
                  <Show
                    when={configuredModels().length > 0}
                    fallback={<span style={{ 'font-size': '12px', color: themeColors.textMuted }}>暂无已配置模型</span>}
                  >
                    <select
                      value={sessionModelId()}
                      onChange={(e) => setSessionModelId(e.currentTarget.value)}
                      disabled={runState() === 'running'}
                      style={{
                        'font-size': '12px',
                        padding: '4px 8px',
                        'border-radius': '6px',
                        border: `1px solid ${themeColors.border}`,
                        background: themeColors.surface,
                        color: themeColors.text,
                        cursor: runState() === 'running' ? 'not-allowed' : 'pointer',
                        outline: 'none',
                      }}
                    >
                      <For each={configuredModels()}>
                        {(opt) => <option value={opt.modelID}>{opt.label}</option>}
                      </For>
                    </select>
                  </Show>
                </div>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                  <Show when={runState() !== 'idle'}>
                    <button
                      onClick={reset}
                      disabled={runState() === 'running'}
                      style={{
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
              </div>

              {/* Agent 调用错误提示 */}
              <Show when={agentError() !== null}>
                <div style={{
                  'margin-bottom': '8px',
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
                  <span style={{ 'flex-shrink': '0', 'margin-top': '1px' }}>⚠️</span>
                  <div style={{ flex: '1' }}>
                    <div style={{ 'font-weight': '600', 'margin-bottom': '4px' }}>AI 调用失败</div>
                    <div>{agentError()}</div>
                    <div style={{ 'margin-top': '6px', 'font-size': '12px', color: '#8c1a11' }}>
                      请前往「设置 → 大模型配置」检查 API Key 是否已保存，或尝试「会话测试」按钮验证连通性。
                    </div>
                  </div>
                  <button
                    onClick={() => setAgentError(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', padding: '0', 'flex-shrink': '0' }}
                  >✕</button>
                </div>
              </Show>


            </div>
          </div>
        </Show>
      </div>

      {/* 拖拽调整宽度手柄 — 仅在展开且非悬浮时显示 */}
      <Show when={!artifactFloat() && !artifactCollapsed()}>
        <div
          style={{
            width: '6px',
            cursor: 'col-resize',
            'flex-shrink': '0',
            background: themeColors.border,
            'border-radius': '3px',
            'align-self': 'stretch',
            transition: 'background 0.15s',
          }}
          onPointerDown={handleResizeStart}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.success + '80'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.border; }}
        />
      </Show>

      {/* 右列：产出物工作区（嵌入展开模式） */}
      <Show when={!artifactFloat() && !artifactCollapsed()}>
        <div style={{ width: `${artifactWidth()}px`, 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
          <ArtifactWorkspace
            artifacts={artifactsData()}
            isFloating={false}
            onSave={handleSaveArtifact}
            saving={saving()}
            onToggleFloat={() => {
              setArtifactFloatWidth(artifactWidth());
              setArtifactFloatHeight(Math.round(window.innerHeight * 0.78));
              setArtifactFloatPos({ x: Math.max(0, window.innerWidth - artifactWidth() - 20), y: 64 });
              setArtifactFloat(true);
            }}
            onCollapse={() => setArtifactCollapsed(true)}
          />
        </div>
      </Show>

      {/* 右列：产出物收起态 */}
      <Show when={!artifactFloat() && artifactCollapsed()}>
        <div
          onClick={() => setArtifactCollapsed(false)}
          title="展开产出物面板"
          style={{
            width: '36px',
            'flex-shrink': '0',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            padding: '10px 0',
            gap: '8px',
            cursor: 'pointer',
            border: `1px solid ${themeColors.border}`,
            'border-radius': '8px',
            background: themeColors.surface,
            'user-select': 'none',
          }}
        >
          <FileText size={15} style={{ color: themeColors.textMuted }} />
          <span style={{
            'writing-mode': 'vertical-rl',
            'font-size': '11px',
            color: themeColors.textMuted,
            'letter-spacing': '2px',
          }}>
            产出物
          </span>
          <Show when={artifactsData().length > 0}>
            <span style={{
              'font-size': '10px',
              background: chartColors.success,
              color: 'white',
              'border-radius': '9999px',
              padding: '1px 5px',
              'font-weight': '600',
            }}>
              {artifactsData().length}
            </span>
          </Show>
        </div>
      </Show>

      {/* 产出物工作区（悬浮面板模式） */}
      <Show when={artifactFloat()}>
        <div
          style={{
            position: 'fixed',
            left: `${artifactFloatPos().x}px`,
            top: `${artifactFloatPos().y}px`,
            width: `${artifactFloatWidth()}px`,
            height: `${artifactFloatHeight()}px`,
            'z-index': 200,
            'border-radius': '10px',
            overflow: 'hidden',
            'box-shadow': '0 8px 40px rgba(0,0,0,0.22)',
          }}
        >
          <ArtifactWorkspace
            artifacts={artifactsData()}
            isFloating={true}
            onSave={handleSaveArtifact}
            saving={saving()}
            onToggleFloat={() => setArtifactFloat(false)}
            onDragStart={handleFloatDragStart}
            onDragMove={handleFloatDragMove}
            onDragEnd={handleFloatDragEnd}
            onResizeEdge={handleFloatResizeEdge}
          />
        </div>
      </Show>

      {/* 保存结果提示 */}
      <Show when={saveMsg() !== null}>
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 20px',
            'border-radius': '6px',
            'font-size': '13px',
            'z-index': 300,
            background: saveMsg()?.startsWith('已保存') ? themeColors.successBg : '#fff2f0',
            border: `1px solid ${saveMsg()?.startsWith('已保存') ? themeColors.successBorder : '#ffccc7'}`,
            color: saveMsg()?.startsWith('已保存') ? chartColors.success : '#cf1322',
            'box-shadow': '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {saveMsg()}
        </div>
      </Show>

      <CreateProductModal
        open={createModalOpen()}
        onClose={() => setCreateModalOpen(false)}
      />
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
      `}</style>
      {/* 工具权限授权 Dialog（用 permissionId 作 key 确保队列轮转时重建组件 + 重启倒计时） */}
      <Show when={permissionQueue()[0]} keyed>
        {(req) => (
          <PermissionDialog
            request={req}
            onResolve={handlePermissionResolve}
          />
        )}
      </Show>
    </div>
  );
};

export default SoloAutopilot;
