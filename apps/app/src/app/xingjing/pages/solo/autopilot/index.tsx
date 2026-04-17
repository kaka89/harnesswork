/**
 * SoloAutopilot — 独立版 AI 虚拟团队主界面（升级版）
 *
 * 对标 Claude Cowork，提供完备的 AI 会话能力：
 * 1. 双模式切换：💬 普通对话（单 Agent Q&A）| 🚀 团队调度（多 Agent 并行）
 * 2. EnhancedComposer：自动高度、@mention、/slash 命令、模型选择器
 * 3. OpenWork 能力集成：MCP 工具、Skills、Knowledge、Commands 实时展示
 * 4. 会话历史侧边栏：基于 OpenCode Session API 的持久化多轮记忆
 * 5. 产出物工作区：可 resize / 悬浮，支持保存到产品目录
 * 6. Agent 面板：可折叠侧边栏，显示各角色实时状态
 */
import {
  createSignal,
  Show,
  For,
  onCleanup,
  onMount,
  createEffect,
} from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  History,
  X,
  AlertCircle,
} from 'lucide-solid';
import CreateProductModal from '../../../components/product/new-product-modal';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { soloSampleGoals } from '../../../mock/autopilot';
import { modelOptions } from '../../../mock/settings';
import { loadProjectSettings, readYaml } from '../../../services/file-store';
import { initProductDir } from '../../../../lib/tauri';
import { getHealthScore } from '../../../services/knowledge-health';
import { buildKnowledgeIndex } from '../../../services/knowledge-index';
import {
  SOLO_AGENTS,
  parseMention,
  type AutopilotAgent,
  type AgentExecutionStatus,
} from '../../../services/autopilot-executor';
import { callAgent } from '../../../services/opencode-client';
import ArtifactWorkspace, {
  type ArtifactItem,
  detectArtifactFormat,
} from '../../../components/autopilot/artifact-workspace';
import PermissionDialog, {
  type PermissionRequest,
} from '../../../components/autopilot/permission-dialog';
import { createTeamSessionOrchestrator } from '../../../services/team-session-orchestrator';
import AgentSessionView from '../../../components/autopilot/agent-session-view';
import SessionTabBar from '../../../components/autopilot/session-tab-bar';
import EnhancedComposer, {
  type CapabilityBadge,
  type SlashCommand,
} from '../../../components/autopilot/enhanced-composer';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface AgentStatus { [key: string]: 'idle' | 'thinking' | 'working' | 'done' | 'waiting'; }
interface AgentTasks { [key: string]: string; }
interface AgentDone { [key: string]: number; }

type RunState = 'idle' | 'running' | 'done';
type ChatMode = 'chat' | 'dispatch';

/** 普通对话（chat 模式）的消息气泡 */
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  loading?: boolean;
}

const genMsgId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const nowTimeStr = () => new Date().toTimeString().slice(0, 5);

// ─── 快速示例（按模式分类） ──────────────────────────────────────────────────

const CHAT_SAMPLES = [
  '帮我分析一下产品的核心用户场景',
  '给当前功能写一份竞品对比',
  '如何优化我们的用户留存策略？',
  '帮我想 5 个增长实验方案',
];

const DISPATCH_SAMPLES = [
  '实现用户一键分享功能，从 PRD 到测试全覆盖',
  '对首页改版方案做完整技术评审',
  '生成本周迭代的发布报告',
  ...soloSampleGoals.slice(0, 2),
];

// ─── SoloBrainCard ────────────────────────────────────────────────────────────

const SoloBrainCard = (props: {
  agent: AutopilotAgent;
  status: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
  currentTask?: string;
  doneToday: number;
  artifactCount: number;
  elapsedTime?: string;
  isActive: boolean;
  onClick?: () => void;
}) => {
  const isRunning = () => props.status === 'thinking' || props.status === 'working';
  const isDone = () => props.status === 'done';

  const dotColor = () => {
    if (isRunning()) return chartColors.success;
    if (isDone()) return chartColors.success;
    if (props.status === 'waiting') return '#fa8c16';
    return themeColors.border;
  };

  return (
    <button
      onClick={props.onClick}
      style={{
        display: 'flex',
        'align-items': 'flex-start',
        gap: '8px',
        padding: '8px 10px',
        'border-radius': '7px',
        background: props.isActive
          ? themeColors.primaryBg
          : isRunning()
            ? themeColors.successBg
            : 'transparent',
        'border-left': `3px solid ${props.isActive
          ? chartColors.primary
          : isRunning()
            ? chartColors.success
            : 'transparent'}`,
        border: 'none',
        cursor: props.onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        width: '100%',
        'text-align': 'left',
      }}
    >
      <div style={{
        width: '30px', height: '30px', 'border-radius': '8px',
        background: props.agent.bgColor, display: 'flex',
        'align-items': 'center', 'justify-content': 'center', 'font-size': '15px',
        'flex-shrink': '0',
        filter: props.status === 'idle' ? 'grayscale(80%) opacity(0.5)' : 'none',
        'box-shadow': isRunning() ? `0 0 0 2px ${props.agent.color}40` : 'none',
        transition: 'all 0.3s',
      }}>
        {props.agent.emoji}
      </div>

      <div style={{ flex: '1', 'min-width': '0' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', 'margin-bottom': '2px' }}>
          <span style={{
            'font-size': '12px', 'font-weight': '600',
            color: isRunning() ? props.agent.color : themeColors.text,
          }}>
            {props.agent.name}
          </span>
          <span style={{
            display: 'inline-block', width: '6px', height: '6px',
            'border-radius': '50%', background: dotColor(), 'flex-shrink': '0',
          }} />
        </div>
        <div style={{
          'font-size': '10px', color: themeColors.textMuted,
          overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
        }}>
          {isRunning() && props.currentTask ? props.currentTask : props.agent.description}
        </div>
        <Show when={props.doneToday > 0 || props.artifactCount > 0}>
          <div style={{ display: 'flex', gap: '4px', 'margin-top': '4px' }}>
            <Show when={props.doneToday > 0}>
              <span style={{
                'font-size': '9px', padding: '1px 5px', 'border-radius': '4px',
                background: chartColors.primary + '20', color: chartColors.primary, 'font-weight': '500',
              }}>{props.doneToday} 次</span>
            </Show>
            <Show when={props.artifactCount > 0}>
              <span style={{
                'font-size': '9px', padding: '1px 5px', 'border-radius': '4px',
                background: chartColors.success + '20', color: chartColors.success, 'font-weight': '500',
              }}>{props.artifactCount} 产出</span>
            </Show>
          </div>
        </Show>
      </div>
    </button>
  );
};

// ─── AgentPanelSidebar ────────────────────────────────────────────────────────

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
  activeTabId: string;
  onAgentClick: (agentId: string) => void;
}) => {
  const [isCollapsed, setIsCollapsed] = createSignal(false);

  const doneCount = () => props.agents.filter((a) => props.agentStatuses[a.id] === 'done').length;
  const runCount = () => props.agents.filter(
    (a) => props.agentStatuses[a.id] === 'thinking' || props.agentStatuses[a.id] === 'working'
  ).length;
  const waitCount = () => props.agents.filter(
    (a) => props.agentStatuses[a.id] === 'idle' || props.agentStatuses[a.id] === 'waiting'
  ).length;
  const progressPct = () => props.runState === 'done'
    ? 100
    : Math.round((doneCount() / Math.max(props.agents.length, 1)) * 100);
  const fmtElapsed = (sec: number) =>
    `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, '0')}s`;

  // 折叠态
  return (
    <Show
      when={!isCollapsed()}
      fallback={
        <div style={{
          width: '44px', height: '100%', display: 'flex', 'flex-direction': 'column',
          'align-items': 'center', border: `1px solid ${themeColors.border}`,
          'border-radius': '10px', background: themeColors.surface, overflow: 'hidden',
          'flex-shrink': '0',
        }}>
          <button
            onClick={() => setIsCollapsed(false)}
            style={{
              width: '100%', padding: '8px 0', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              color: themeColors.textMuted, 'border-bottom': `1px solid ${themeColors.border}`,
            }}
          ><ChevronRight size={14} /></button>

          {/* 进度条 */}
          <div style={{ width: '100%', padding: '5px 7px' }}>
            <div style={{ width: '100%', height: '3px', background: themeColors.border, 'border-radius': '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progressPct()}%`,
                background: chartColors.success, 'border-radius': '2px', transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ 'text-align': 'center', 'font-size': '9px', color: themeColors.textMuted, 'margin-top': '2px', 'font-weight': 500 }}>
              {doneCount()}/{props.agents.length}
            </div>
          </div>

          {/* Agent 图标列 */}
          <div style={{ flex: 1, 'overflow-y': 'auto', padding: '4px 0', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '5px' }}>
            <For each={props.agents}>
              {(agent) => {
                const status = () => props.agentStatuses[agent.id] ?? 'idle';
                const isRunning = () => status() === 'thinking' || status() === 'working';
                const isDone = () => status() === 'done';
                return (
                  <button
                    onClick={() => { setIsCollapsed(false); props.onAgentClick(agent.id); }}
                    title={agent.name}
                    style={{
                      position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                    }}
                  >
                    <div style={{
                      width: '26px', height: '26px', 'border-radius': '7px',
                      background: agent.bgColor, display: 'flex',
                      'align-items': 'center', 'justify-content': 'center', 'font-size': '13px',
                      filter: status() === 'idle' ? 'grayscale(80%) opacity(0.5)' : 'none',
                      'box-shadow': isRunning() ? `0 0 0 2px ${agent.color}40` : 'none',
                    }}>{agent.emoji}</div>
                    <span style={{
                      position: 'absolute', bottom: '-1px', right: '-1px',
                      width: '6px', height: '6px', 'border-radius': '50%',
                      background: isRunning() ? chartColors.success : isDone() ? chartColors.success : status() === 'waiting' ? '#fa8c16' : themeColors.border,
                      border: `1px solid ${themeColors.surface}`,
                    }} />
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      }
    >
      <div style={{
        width: '200px', height: '100%', display: 'flex', 'flex-direction': 'column',
        border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
        background: themeColors.surface, overflow: 'hidden', 'flex-shrink': '0',
      }}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          padding: '10px 12px 8px', 'border-bottom': `1px solid ${themeColors.border}`,
          'flex-shrink': '0',
        }}>
          <span style={{ 'font-size': '12px', 'font-weight': '600', color: themeColors.text }}>AI 虚拟团队</span>
          <button
            onClick={() => setIsCollapsed(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              display: 'flex', 'align-items': 'center', color: themeColors.textMuted,
            }}
          ><ChevronLeft size={14} /></button>
        </div>

        {/* 进度区 */}
        <Show when={props.runState !== 'idle'}>
          <div style={{ padding: '8px 12px', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': '0' }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '10px', color: themeColors.textMuted }}>
                {props.runState === 'done' ? '全部完成' : `执行中 ${doneCount()}/${props.agents.length}`}
              </span>
              <span style={{ 'font-size': '10px', color: themeColors.textMuted }}>{progressPct()}%</span>
            </div>
            <div style={{ background: themeColors.border, 'border-radius': '3px', height: '4px' }}>
              <div style={{
                background: props.runState === 'done' ? chartColors.success : chartColors.primary,
                height: '100%', 'border-radius': '3px',
                width: `${props.progress || progressPct()}%`, transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-top': '4px' }}>
              <span style={{ 'font-size': '10px', color: themeColors.textMuted }}>
                ⏱ {fmtElapsed(props.elapsedSec)}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ 'font-size': '10px', color: chartColors.success }}>{doneCount()} ✓</span>
                <Show when={runCount() > 0}>
                  <span style={{ 'font-size': '10px', color: '#fa8c16' }}>{runCount()} ⟳</span>
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* Agent 列表 */}
        <div style={{ flex: '1', 'overflow-y': 'auto', padding: '4px' }}>
          <For each={props.agents}>
            {(agent) => (
              <SoloBrainCard
                agent={agent}
                status={props.agentStatuses[agent.id] as any ?? 'idle'}
                currentTask={props.agentTasks[agent.id]}
                doneToday={props.agentDone[agent.id] ?? 0}
                artifactCount={props.artifactCount(agent.id)}
                elapsedTime={props.stepTimes[agent.id]}
                isActive={props.activeTabId === agent.id}
                onClick={() => props.onAgentClick(agent.id)}
              />
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};

// ─── HistorySidebar ───────────────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  title: string;
  ts: string;
  mode: ChatMode;
}

const HistorySidebar = (props: {
  items: HistoryItem[];
  activeId: string | null;
  restoringId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) => (
  <div style={{
    width: '220px', 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column',
    border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
    background: themeColors.surface, overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
      padding: '10px 12px', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': '0',
    }}>
      <span style={{ 'font-size': '12px', 'font-weight': '600' }}>会话历史</span>
      <button onClick={props.onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted, display: 'flex', 'align-items': 'center' }}>
        <X size={14} />
      </button>
    </div>
    <div style={{ flex: 1, 'overflow-y': 'auto' }}>
      <Show
        when={props.items.length > 0}
        fallback={
          <div style={{ padding: '20px', 'text-align': 'center', color: themeColors.textMuted, 'font-size': '12px' }}>
            <History size={24} style={{ 'margin-bottom': '8px', opacity: '0.4' }} />
            <div>暂无历史记录</div>
          </div>
        }
      >
        <For each={props.items}>
          {(item) => {
            const isActive = () => props.activeId === item.id;
            const isRestoring = () => props.restoringId === item.id;
            return (
              <button
                onClick={() => { if (!props.restoringId) props.onSelect(item.id); }}
                disabled={!!props.restoringId}
                style={{
                  display: 'block', width: '100%', padding: '10px 12px', border: 'none',
                  background: isActive() ? themeColors.primaryBg : 'transparent',
                  cursor: props.restoringId ? 'wait' : 'pointer',
                  'text-align': 'left', 'border-bottom': `1px solid ${themeColors.border}`,
                  transition: 'background 0.15s', opacity: (props.restoringId && !isRestoring()) ? '0.5' : '1',
                }}
                onMouseEnter={(e) => { if (!isActive() && !props.restoringId) (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
                onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{
                  'font-size': '12px', 'font-weight': '500',
                  color: isActive() ? chartColors.primary : themeColors.text,
                  overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                  display: 'flex', 'align-items': 'center', gap: '4px',
                }}>
                  <span>{item.mode === 'chat' ? '💬' : '🚀'}</span>
                  <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    {item.title}
                  </span>
                  <Show when={isRestoring()}>
                    <span style={{ 'font-size': '10px', color: chartColors.primary, 'flex-shrink': '0' }}>加载中…</span>
                  </Show>
                </div>
                <div style={{ 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '2px' }}>
                  {item.ts}
                </div>
              </button>
            );
          }}
        </For>
      </Show>
    </div>
  </div>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

const SoloAutopilot = () => {
  const { state, productStore, actions, resolvedWorkspaceId, openworkCtx } = useAppStore();
  const navigate = useNavigate();
  const soloProducts = () => productStore.products().filter((p) => (p.productType ?? 'solo') === 'solo');

  // ── 基础状态 ────────────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [chatMode, setChatMode] = createSignal<ChatMode>('dispatch');
  const [agentStatuses, setAgentStatuses] = createSignal<AgentStatus>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<AgentTasks>({});
  const [agentDone, setAgentDone] = createSignal<AgentDone>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 0]))
  );
  const [progress, setProgress] = createSignal(0);
  const [agentError, setAgentError] = createSignal<string | null>(null);
  const [artifactsData, setArtifactsData] = createSignal<ArtifactItem[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [saveMsg, setSaveMsg] = createSignal<string | null>(null);
  const [activeArtifactId, setActiveArtifactId] = createSignal<string | null>(null);

  // ── UI 面板状态 ──────────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = createSignal(false);
  const [historyItems, setHistoryItems] = createSignal<HistoryItem[]>([]);
  const [artifactWidth, setArtifactWidth] = createSignal(420);
  const [artifactFloat, setArtifactFloat] = createSignal(false);
  const [artifactCollapsed, setArtifactCollapsed] = createSignal(true);
  const [artifactFloatPos, setArtifactFloatPos] = createSignal({ x: 0, y: 64 });
  const [artifactFloatWidth, setArtifactFloatWidth] = createSignal(420);
  const [artifactFloatHeight, setArtifactFloatHeight] = createSignal(Math.round(window.innerHeight * 0.78));
  const [expandedSteps, setExpandedSteps] = createSignal<Record<string, boolean>>({});
  const [stepTimes, setStepTimes] = createSignal<Record<string, string>>({});

  // ── OpenWork 能力状态 ────────────────────────────────────────────────────────
  const [capabilities, setCapabilities] = createSignal<CapabilityBadge[]>([]);
  const [knowledgeHealthScore, setKnowledgeHealthScore] = createSignal<number | null>(null);

  // ── 权限授权队列 ─────────────────────────────────────────────────────────────
  const [permissionQueue, setPermissionQueue] = createSignal<PermissionRequest[]>([]);
  const handlePermissionAsked = (params: PermissionRequest) =>
    setPermissionQueue((prev) => [...prev, params]);
  const handlePermissionResolve = (action: 'once' | 'always' | 'reject') => {
    const current = permissionQueue()[0];
    if (current) { current.resolve(action); setPermissionQueue((prev) => prev.slice(1)); }
  };

  // ── 计时器 ────────────────────────────────────────────────────────────────────
  const [elapsedSec, setElapsedSec] = createSignal(0);
  let elapsedTimerRef: ReturnType<typeof setInterval> | undefined;

  const agentArtifactCount = (agentId: string) =>
    artifactsData().filter((a) => a.agentId === agentId).length;

  // ── 模型选择 ──────────────────────────────────────────────────────────────────
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({});
  const [sessionModelId, setSessionModelId] = createSignal<string>(
    state.llmConfig.modelID ?? 'deepseek-chat'
  );

  const configuredModels = () =>
    modelOptions.filter(
      (opt) =>
        opt.providerID !== 'custom' &&
        (providerKeys()[opt.providerID]?.trim().length ?? 0) > 0,
    );

  const getSessionModel = () => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return undefined;
    if (!providerKeys()[opt.providerID]) return undefined;
    return { providerID: opt.providerID, modelID: opt.modelID };
  };

  // ── Chat 模式：普通对话消息（不走 Orchestrator，直接 callAgent）──────────────
  const [chatMessages, setChatMessages] = createSignal<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = createSignal(false);
  // 历史会话恢复中的 sessionId（用于 loading 指示）
  const [restoringSessionId, setRestoringSessionId] = createSignal<string | null>(null);

  // ── 产出物有内容时自动展开 ────────────────────────────────────────────────────
  createEffect(() => {
    if (artifactsData().length > 0) setArtifactCollapsed(false);
  });

  // ── 根据 runState 自动管理计时器 ───────────────────────────────────────────────
  createEffect(() => {
    if (runState() === 'running') {
      if (elapsedTimerRef) clearInterval(elapsedTimerRef);
      setElapsedSec(0);
      elapsedTimerRef = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else {
      if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    }
  });

  // ── 加载 OpenWork 能力徽标 ─────────────────────────────────────────────────────
  const loadCapabilities = async (wsId: string | null) => {
    if (!wsId || !openworkCtx) return;
    const badges: CapabilityBadge[] = [];
    try {
      if (openworkCtx.listMcp) {
        const mcps = await openworkCtx.listMcp(wsId);
        if (mcps.length > 0) badges.push({ type: 'mcp', count: mcps.length, label: 'MCP 工具' });
      }
    } catch {}
    try {
      if (openworkCtx.listSkills) {
        const skills = await openworkCtx.listSkills(wsId);
        if (skills.length > 0) badges.push({ type: 'skill', count: skills.length, label: 'Skills' });
      }
    } catch {}
    try {
      if (openworkCtx.listCommands) {
        const cmds = await openworkCtx.listCommands(wsId);
        if (cmds.length > 0) badges.push({ type: 'command', count: cmds.length, label: '命令' });
      }
    } catch {}
    setCapabilities(badges);
  };

  // ── 加载历史会话 ──────────────────────────────────────────────────────────────
  const loadHistory = async () => {
    const client = openworkCtx?.opencodeClient?.();
    const workDir = productStore.activeProduct()?.workDir;
    if (!client || !workDir) return;
    try {
      const result = await client.session.list({ directory: workDir });
      const sessions = Array.isArray(result.data) ? result.data : [];
      // Session.time 是 { created: number, updated: number }，单位毫秒
      const toTs = (s: any) => {
        const ms = s.time?.updated ?? s.time?.created;
        if (!ms) return '—';
        return new Date(ms).toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      };
      // 按最后活跃时间倒序排列
      const sorted = [...sessions].sort((a: any, b: any) => {
        const ta = a.time?.updated ?? a.time?.created ?? 0;
        const tb = b.time?.updated ?? b.time?.created ?? 0;
        return tb - ta;
      });
      const items: HistoryItem[] = sorted.slice(0, 30).map((s: any) => ({
        id: s.id,
        title: s.title || s.id.slice(0, 12),
        ts: toTs(s),
        mode: s.title?.startsWith('xingjing-orchestrator') ? 'dispatch' : 'chat',
      }));
      setHistoryItems(items);
    } catch {}
  };

  // ── 恢复历史会话：加载消息并以 chat 气泡形式展示 ───────────────────────────────
  const restoreHistorySession = async (item: HistoryItem) => {
    const client = openworkCtx?.opencodeClient?.();
    const workDir = productStore.activeProduct()?.workDir;
    if (!client || !workDir) return;

    setRestoringSessionId(item.id);
    try {
      const result = await (client.session as any).messages({
        path: { id: item.id },
        query: { directory: workDir },
      });
      const rawMessages: Array<{ info: any; parts: any[] }> = Array.isArray(result.data)
        ? result.data
        : [];

      // 将 OpenCode messages 转为 ChatMsg[]，只保留有文字内容的消息
      const converted: ChatMsg[] = [];
      for (const { info, parts } of rawMessages) {
        // 提取所有 text parts 的文字
        const textContent = (parts as any[])
          .filter((p) => p.type === 'text' && typeof p.text === 'string' && p.text.trim())
          .map((p) => p.text as string)
          .join('\n\n')
          .trim();

        if (!textContent) continue; // 跳过无文字消息（工具调用等）

        const tsMs = info?.time?.created ?? info?.time?.updated;
        const tsStr = tsMs
          ? new Date(tsMs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : nowTimeStr();

        converted.push({
          id: info.id ?? genMsgId(),
          role: info.role === 'user' ? 'user' : 'assistant',
          content: textContent,
          ts: tsStr,
        });
      }

      // 用历史消息替换当前 chat 消息，并切换到 chat 模式
      setChatMessages(converted);
      setChatMode('chat');
      setShowHistory(false);
    } catch (err) {
      console.error('[solo-autopilot] Failed to restore session:', err);
      setShowHistory(false);
    } finally {
      setRestoringSessionId(null);
    }
  };

  // ── onMount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        const keys: Record<string, string> = { ...(settings.llmProviderKeys ?? {}) };
        const cur = state.llmConfig;
        if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;
        setProviderKeys(keys);
        const configured = modelOptions.filter(
          (opt) => opt.providerID !== 'custom' && (keys[opt.providerID]?.trim().length ?? 0) > 0,
        );
        if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) {
          setSessionModelId(configured[0].modelID);
        }
      } catch {}

      // 知识健康度
      buildKnowledgeIndex(workDir, null).then((idx) => {
        if (idx) return getHealthScore(workDir, idx);
        return null;
      }).then((score) => {
        if (score !== null) setKnowledgeHealthScore(score);
      }).catch(() => {});
    }

    // 能力徽标 + 历史
    const wsId = resolvedWorkspaceId();
    await loadCapabilities(wsId);
    await loadHistory();
  });

  // ── TeamSessionOrchestrator ────────────────────────────────────────────────────
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
    onArtifactExtracted: (artifact) => {
      const agent = SOLO_AGENTS.find((a) => a.id === artifact.agentId);
      if (!agent) return;

      const newArtifact: ArtifactItem = {
        id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agentId: artifact.agentId,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        title: artifact.title,
        content: artifact.content,
        createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        format: detectArtifactFormat(artifact.content),
      };

      setArtifactsData((prev) => [...prev, newArtifact]);

      // 向 Agent Session 追加链接消息
      const linkMessage = `\n\n📄 **产出物已生成**：[${artifact.title}](artifact://${newArtifact.id})`;
      orchestrator.sendTo(artifact.agentId, linkMessage).catch(() => {});
    },
  });

  const timersRef: ReturnType<typeof setTimeout>[] = [];
  const clearTimers = () => { timersRef.forEach(clearTimeout); timersRef.length = 0; };

  const reset = () => {
    clearTimers();
    if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    setElapsedSec(0);
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle' as const])));
    setAgentTasks({});
    setArtifactsData([]);
    setArtifactCollapsed(true);
    setProgress(0);
    setExpandedSteps({});
    setStepTimes({});
    permissionQueue().forEach((req) => { try { req.resolve('reject'); } catch {} });
    setPermissionQueue([]);
  };

  // ── handleChatSend：💬 普通对话模式，直接 callAgent，内联显示 ──────────────────
  const handleChatSend = async () => {
    const text = goal().trim();
    if (!text || chatLoading()) return;

    const userMsgId = genMsgId();
    const aiMsgId = genMsgId();
    const ts = nowTimeStr();

    // 立即追加用户消息 + 占位 AI 消息
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text, ts },
      { id: aiMsgId, role: 'assistant', content: '', ts, loading: true },
    ]);
    setGoal('');          // 立即清空输入框
    setChatLoading(true);
    setAgentError(null);

    const productName = productStore.activeProduct()?.name ?? '未知产品';
    const workDir = productStore.activeProduct()?.workDir;

    await callAgent({
      userPrompt: text,
      systemPrompt: `你是「${productName}」产品的 AI 助手，精通产品策略、技术架构与增长分析。请用简洁、专业的中文回答用户的问题。`,
      title: `solo-chat-${Date.now()}`,
      model: getSessionModel(),
      directory: workDir,
      onText: (accumulated) => {
        setChatMessages((prev) =>
          prev.map((m) => m.id === aiMsgId ? { ...m, content: accumulated, loading: false } : m)
        );
      },
      onDone: () => {
        setChatMessages((prev) =>
          prev.map((m) => m.id === aiMsgId ? { ...m, loading: false } : m)
        );
        setChatLoading(false);
      },
      onError: (errMsg) => {
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: `调用失败：${errMsg}`, loading: false }
              : m
          )
        );
        setChatLoading(false);
        setAgentError(errMsg);
      },
    }).catch((e) => {
      setChatLoading(false);
      setAgentError(String(e));
    });
  };

  // ── handleStart：🚀 团队调度模式 ─────────────────────────────────────────────
  const handleStart = async () => {
    const text = goal().trim();
    if (!text) return;

    // ── chat 模式：走直接对话路径 ──
    if (chatMode() === 'chat') {
      await handleChatSend();
      return;
    }

    // ── dispatch 模式：走 Orchestrator 多 Agent 路径 ──
    if (!getSessionModel() && configuredModels().length === 0) {
      setAgentError('尚未配置可用的大模型，请先前往「设置 → 大模型配置」填写 API Key');
      return;
    }

    // 重置本地辅助状态（不影响 orchestrator 内部 session）
    clearTimers();
    setAgentError(null);
    setRunState('running');
    setGoal('');  // 清空输入框

    const { targetAgent, cleanText } = parseMention(text, SOLO_AGENTS);

    try {
      if (targetAgent) {
        await orchestrator.runDirect(targetAgent.id, cleanText);
      } else {
        await orchestrator.run(cleanText);
      }
      setRunState('done');
      await loadHistory();
    } catch (err) {
      console.error('[solo-autopilot] handleStart error:', err);
      setAgentError(`执行失败：${err}`);
      setRunState('idle');
    }
  };

  // ── 产出物保存 ──────────────────────────────────────────────────────────────────
  const handleSaveArtifact = async (artifact: ArtifactItem) => {
    const product = productStore.activeProduct();
    const workDir = product?.workDir;
    if (!workDir) { setSaveMsg('未找到活跃产品的工作目录'); setTimeout(() => setSaveMsg(null), 3000); return; }
    setSaving(true);
    try {
      let appCode: string | undefined;
      try {
        const config = await readYaml<{ apps?: string[] }>('.xingjing/config.yaml', { apps: [] }, workDir);
        appCode = config.apps?.[0];
      } catch {}
      if (!appCode && product?.code) appCode = product.code;
      if (!appCode) throw new Error('未找到应用编码');

      const dirMap: Record<string, string> = {
        'product-brain': `apps/${appCode}/docs/product/prd`,
        'eng-brain': `apps/${appCode}/docs/product/architecture`,
      };
      const subDir = dirMap[artifact.agentId] ?? `apps/${appCode}/docs/delivery`;
      const safeName = artifact.title.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const timestamp = new Date().toISOString().slice(0, 10);
      const ext = artifact.format === 'html' ? '.html' : '.md';
      const fileName = `${safeName}-${timestamp}${ext}`;
      const relativePath = `${subDir}/${fileName}`;
      const result = await initProductDir(workDir, [{ path: relativePath, content: artifact.content }]);
      if (!result.ok) throw new Error(result.error ?? '文件写入失败');
      setSaveMsg(`已保存到 ${subDir}/${fileName}`);
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg(`保存失败：${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setSaveMsg(null), 4000);
    } finally { setSaving(false); }
  };

  // ── 产出物区域 resize ───────────────────────────────────────────────────────────
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
    isResizing = true; resizeStartX = e.clientX; resizeStartW = artifactWidth();
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
    setArtifactFloatPos({
      x: Math.max(0, Math.min(floatPosStart.x + e.clientX - floatDragStart.x, window.innerWidth - artifactFloatWidth())),
      y: Math.max(0, floatPosStart.y + e.clientY - floatDragStart.y),
    });
  };
  const handleFloatDragEnd = () => { isFloatDragging = false; };

  let isFloatResizing = false;
  let floatResizeDir = '';
  let floatResizeStart = { x: 0, y: 0, w: 0, h: 0, px: 0 };
  const handleFloatResizeMove = (e: PointerEvent) => {
    if (!isFloatResizing) return;
    const dx = e.clientX - floatResizeStart.x;
    const dy = e.clientY - floatResizeStart.y;
    if (floatResizeDir.includes('right')) setArtifactFloatWidth(Math.max(280, Math.min(window.innerWidth - 40, floatResizeStart.w + dx)));
    if (floatResizeDir.includes('left')) {
      const newW = Math.max(280, Math.min(window.innerWidth - 40, floatResizeStart.w - dx));
      setArtifactFloatWidth(newW);
      setArtifactFloatPos((prev) => ({ ...prev, x: Math.max(0, floatResizeStart.px + floatResizeStart.w - newW) }));
    }
    if (floatResizeDir.includes('bottom')) setArtifactFloatHeight(Math.max(200, Math.min(window.innerHeight - 80, floatResizeStart.h + dy)));
  };
  const handleFloatResizeEnd = () => {
    isFloatResizing = false;
    document.removeEventListener('pointermove', handleFloatResizeMove);
    document.removeEventListener('pointerup', handleFloatResizeEnd);
  };
  const handleFloatResizeEdge = (e: PointerEvent, dir: string) => {
    isFloatResizing = true; floatResizeDir = dir;
    floatResizeStart = { x: e.clientX, y: e.clientY, w: artifactFloatWidth(), h: artifactFloatHeight(), px: artifactFloatPos().x };
    document.addEventListener('pointermove', handleFloatResizeMove);
    document.addEventListener('pointerup', handleFloatResizeEnd);
    e.preventDefault(); e.stopPropagation();
  };

  onCleanup(() => {
    clearTimers();
    if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    document.removeEventListener('pointermove', handleResizeMove);
    document.removeEventListener('pointerup', handleResizeEnd);
    document.removeEventListener('pointermove', handleFloatResizeMove);
    document.removeEventListener('pointerup', handleFloatResizeEnd);
  });

  // ── Slash 命令 ─────────────────────────────────────────────────────────────────
  const slashCommands: SlashCommand[] = [
    {
      id: 'prd', label: '生成 PRD', description: '一键生成产品需求文档',
      icon: '📋',
      action: (text) => {
        setGoal(`@product-brain 请基于以下描述生成完整 PRD：${text}`);
        setChatMode('dispatch');
      },
    },
    {
      id: 'arch', label: '架构评审', description: '对当前方案做技术架构评审',
      icon: '🏗️',
      action: (text) => {
        setGoal(`请对以下方案做完整技术架构评审，输出 SDD 和风险清单：${text}`);
        setChatMode('dispatch');
      },
    },
    {
      id: 'test', label: '生成测试用例', description: '生成覆盖完整的测试用例',
      icon: '🧪',
      action: (text) => {
        setGoal(`@eng-brain 请为以下功能生成完整测试用例（含边界场景）：${text}`);
        setChatMode('dispatch');
      },
    },
    {
      id: 'report', label: '迭代报告', description: '生成本周迭代进度报告',
      icon: '📊',
      action: (_) => {
        setGoal('请汇总当前迭代状态，生成本周进度报告，包含完成事项、风险和下周计划');
        setChatMode('dispatch');
      },
    },
    {
      id: 'growth', label: '增长实验', description: '设计并分析增长实验方案',
      icon: '🚀',
      action: (text) => {
        setGoal(`请设计 3 个可快速验证的增长实验方案，场景：${text}`);
        setChatMode('dispatch');
      },
    },
    {
      id: 'review', label: '代码评审', description: '对代码或实现方案做 Review',
      icon: '💻',
      action: (text) => {
        setGoal(`@eng-brain 请对以下代码/方案做 Code Review，指出问题并给出改进建议：${text}`);
        setChatMode('dispatch');
      },
    },
  ];

  // ── 渲染 ────────────────────────────────────────────────────────────────────────

  // chat 模式：有消息就算"有内容"
  const hasChatContent = () => chatMessages().length > 0;

  // dispatch 模式：session 已创建 OR 正在运行（与原始实现对齐，isRunning 是关键！）
  const hasDispatchSession = () => !!(
    orchestrator.state().orchestratorSessionId ||
    orchestrator.state().isRunning ||
    orchestrator.state().agentSlots.size > 0
  );

  // 整体"是否有内容"（用于切换空状态 vs 会话状态）
  const hasContent = () =>
    chatMode() === 'chat' ? hasChatContent() : hasDispatchSession();

  const isRunning = () =>
    chatLoading() || runState() === 'running' || orchestrator.state().isRunning;

  const quickSamples = () => chatMode() === 'chat' ? CHAT_SAMPLES : DISPATCH_SAMPLES;

  return (
    <div style={{ display: 'flex', 'align-items': 'stretch', width: '100%', height: '100%', overflow: 'hidden', gap: '8px' }}>

      {/* ── 历史侧边栏 ── */}
      <Show when={showHistory()}>
        <HistorySidebar
          items={historyItems()}
          activeId={orchestrator.state().orchestratorSessionId}
          onSelect={(id) => {
            const item = historyItems().find((h) => h.id === id);
            if (item) restoreHistorySession(item);
            else setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
        />
      </Show>

      {/* ── 左侧 Agent 面板 ── */}
      <div style={{ 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
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
          activeTabId={orchestrator.state().activeTabId}
          onAgentClick={(agentId) => orchestrator.setActiveTab(agentId)}
        />
      </div>

      {/* ── 中间列：对话区 ── */}
      <div style={{ flex: '1', 'min-width': '0', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>

        {/* 顶部横幅 */}
        <div style={{
          display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          padding: '6px 12px', 'border-radius': '8px', 'margin-bottom': '8px',
          background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`,
          'flex-shrink': '0',
        }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <strong style={{ 'font-size': '12px', color: chartColors.primary }}>
              独立版 · AI 虚拟团队
            </strong>
            <Show when={knowledgeHealthScore() !== null}>
              <span style={{
                'font-size': '10px', padding: '1px 6px', 'border-radius': '9999px',
                background: knowledgeHealthScore()! >= 80 ? chartColors.success : knowledgeHealthScore()! >= 50 ? '#fa8c16' : chartColors.error,
                color: 'white', 'font-weight': 600,
              }}>
                🧠 {knowledgeHealthScore()}分
              </span>
            </Show>
            <span style={{ 'font-size': '11px', color: themeColors.textSecondary }}>
              {chatMode() === 'chat'
                ? '💬 普通对话模式：直接问 AI，快速获取答案'
                : '🚀 团队调度模式：4 个 AI 角色并行执行，适合复杂任务'}
            </span>
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            {/* 历史按钮 */}
            <button
              onClick={() => { setShowHistory(!showHistory()); if (!showHistory()) loadHistory(); }}
              title="会话历史"
              style={{
                display: 'flex', 'align-items': 'center', gap: '4px',
                padding: '3px 8px', 'border-radius': '6px', 'font-size': '11px',
                border: `1px solid ${themeColors.border}`, background: showHistory() ? themeColors.primaryBg : 'transparent',
                color: showHistory() ? chartColors.primary : themeColors.textMuted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <History size={12} />
              历史
            </button>
          </div>
        </div>

        {/* 无产品空状态 */}
        <Show when={soloProducts().length === 0}>
          <div style={{
            background: themeColors.successBg, border: `1px dashed ${themeColors.successBorder}`,
            'text-align': 'center', 'border-radius': '10px', padding: '20px', 'flex-shrink': '0', 'margin-bottom': '8px',
          }}>
            <div style={{ 'font-size': '40px', 'margin-bottom': '10px' }}>🤖</div>
            <div style={{ 'font-weight': '600', color: themeColors.success, 'margin-bottom': '6px' }}>开始你的独立产品之旅</div>
            <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '14px' }}>
              还没有创建项目？先建一个，让 AI 虚拟团队为你服务
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              style={{
                background: chartColors.success, color: 'white', border: 'none',
                'border-radius': '6px', padding: '7px 20px', 'font-size': '13px', cursor: 'pointer',
              }}
            >
              创建我的第一个产品
            </button>
          </div>
        </Show>

        {/* ── 空状态（无内容）：显示欢迎引导 ── */}
        <Show when={!hasContent()}>
          <div style={{
            flex: '1', display: 'flex', 'flex-direction': 'column',
            'align-items': 'center', 'justify-content': 'center', 'padding-bottom': '20px',
          }}>
            <div style={{ width: '100%', 'max-width': '600px' }}>
              <div style={{ 'text-align': 'center', 'margin-bottom': '20px' }}>
                <div style={{ 'font-size': '36px', 'margin-bottom': '8px' }}>
                  {chatMode() === 'chat' ? '💬' : '🚀'}
                </div>
                <div style={{ 'font-size': '16px', 'font-weight': '600', color: themeColors.text, 'margin-bottom': '4px' }}>
                  {chatMode() === 'chat' ? '和 AI 直接对话' : '启动 AI 虚拟团队'}
                </div>
                <div style={{ 'font-size': '13px', color: themeColors.textMuted }}>
                  {chatMode() === 'chat'
                    ? '提问、头脑风暴、分析——AI 随时待命'
                    : '描述你的目标，4 个 AI 角色并行执行，给你完整的交付物'}
                </div>
              </div>
              <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px', 'margin-bottom': '16px' }}>
                <For each={quickSamples()}>
                  {(sample) => (
                    <button
                      onClick={() => setGoal(sample)}
                      style={{
                        padding: '10px 12px', 'border-radius': '8px',
                        border: `1px solid ${themeColors.border}`,
                        background: themeColors.surface, cursor: 'pointer',
                        'text-align': 'left', 'font-size': '12px',
                        color: themeColors.text, transition: 'all 0.15s', 'line-height': '1.5',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = chartColors.success;
                        (e.currentTarget as HTMLElement).style.background = themeColors.successBg;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = themeColors.border;
                        (e.currentTarget as HTMLElement).style.background = themeColors.surface;
                      }}
                    >
                      {sample}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* ── 💬 Chat 模式：内联消息气泡 ── */}
        <Show when={chatMode() === 'chat' && hasChatContent()}>
          <div style={{ flex: '1', 'overflow-y': 'auto', 'min-height': '0', padding: '12px 4px' }}>
            <For each={chatMessages()}>
              {(msg) => (
                <div style={{
                  display: 'flex',
                  'justify-content': msg.role === 'user' ? 'flex-end' : 'flex-start',
                  'margin-bottom': '12px',
                  gap: '8px',
                  'align-items': 'flex-end',
                }}>
                  {/* AI 头像 */}
                  <Show when={msg.role === 'assistant'}>
                    <div style={{
                      width: '28px', height: '28px', 'border-radius': '50%',
                      background: chartColors.success, display: 'flex',
                      'align-items': 'center', 'justify-content': 'center',
                      'font-size': '11px', 'font-weight': 700, color: 'white', 'flex-shrink': '0',
                    }}>AI</div>
                  </Show>

                  {/* 消息气泡 */}
                  <div style={{
                    'max-width': '75%', padding: '10px 14px', 'border-radius': '14px',
                    'border-bottom-left-radius': msg.role === 'assistant' ? '4px' : '14px',
                    'border-bottom-right-radius': msg.role === 'user' ? '4px' : '14px',
                    background: msg.role === 'user' ? chartColors.success : themeColors.surface,
                    color: msg.role === 'user' ? 'white' : themeColors.text,
                    border: msg.role === 'assistant' ? `1px solid ${themeColors.border}` : 'none',
                    'font-size': '13px', 'line-height': '1.65', 'white-space': 'pre-wrap',
                    'word-break': 'break-word',
                    'box-shadow': '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <Show
                      when={!msg.loading}
                      fallback={
                        <span style={{ display: 'flex', gap: '3px', 'align-items': 'center', padding: '2px 0', color: themeColors.textMuted }}>
                          <span style={{ animation: 'chatDot 1.2s ease-in-out 0s infinite', 'border-radius': '50%', width: '6px', height: '6px', background: 'currentColor', display: 'inline-block' }} />
                          <span style={{ animation: 'chatDot 1.2s ease-in-out 0.2s infinite', 'border-radius': '50%', width: '6px', height: '6px', background: 'currentColor', display: 'inline-block' }} />
                          <span style={{ animation: 'chatDot 1.2s ease-in-out 0.4s infinite', 'border-radius': '50%', width: '6px', height: '6px', background: 'currentColor', display: 'inline-block' }} />
                        </span>
                      }
                    >
                      {msg.content || <span style={{ color: themeColors.textMuted, 'font-style': 'italic' }}>正在生成...</span>}
                    </Show>
                  </div>

                  {/* 用户头像 */}
                  <Show when={msg.role === 'user'}>
                    <div style={{
                      width: '28px', height: '28px', 'border-radius': '50%',
                      background: chartColors.primary, display: 'flex',
                      'align-items': 'center', 'justify-content': 'center',
                      'font-size': '11px', 'font-weight': 700, color: 'white', 'flex-shrink': '0',
                    }}>我</div>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <style>{`
            @keyframes chatDot {
              0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </Show>

        {/* ── 🚀 Dispatch 模式：Orchestrator Session 视图 ── */}
        <Show when={chatMode() === 'dispatch' && hasDispatchSession()}>
          <div style={{ flex: '1', display: 'flex', 'flex-direction': 'column', 'min-height': '0', overflow: 'hidden' }}>
            {/* Session Tab Bar */}
            <Show when={orchestrator.state().orchestratorSessionId || orchestrator.state().agentSlots.size > 0}>
              <div style={{ 'margin-bottom': '8px' }}>
                <SessionTabBar
                  orchestratorSessionId={orchestrator.state().orchestratorSessionId}
                  slots={Array.from(orchestrator.state().agentSlots.values())}
                  activeTabId={orchestrator.state().activeTabId}
                  onTabChange={orchestrator.setActiveTab}
                  dispatchPlan={orchestrator.state().dispatchPlan}
                />
              </div>
            </Show>

            {/* 消息区 */}
            <div style={{ flex: '1', 'overflow-y': 'auto', 'min-height': '0' }}>
              <Show
                when={orchestrator.state().activeTabId !== 'orchestrator' && orchestrator.getActiveSlot()}
                fallback={
                  <div style={{
                    display: 'flex', 'flex-direction': 'column', 'align-items': 'center',
                    'justify-content': 'center', height: '100%', color: themeColors.textMuted,
                    'text-align': 'center', padding: '40px',
                  }}>
                    <Show
                      when={orchestrator.state().isRunning}
                      fallback={
                        <>
                          <div style={{ 'font-size': '40px', 'margin-bottom': '12px' }}>🎯</div>
                          <div style={{ 'font-size': '14px', 'font-weight': 500 }}>任务已分发给虚拟团队</div>
                          <div style={{ 'font-size': '12px', 'margin-top': '8px' }}>
                            点击上方 Tab 查看各 Agent 的执行详情与产出物
                          </div>
                        </>
                      }
                    >
                      <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', 'margin-bottom': '12px', color: chartColors.success }} />
                      <div style={{ 'font-size': '14px', 'font-weight': 500 }}>AI 虚拟团队正在执行中…</div>
                      <div style={{ 'font-size': '12px', 'margin-top': '8px' }}>正在创建 Agent 会话，请稍候</div>
                    </Show>
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
                    onPermissionReply={(permId, action) => orchestrator.replyPermission(slot().agentId, permId, action)}
                    onQuestionReply={(reqId, answers) => orchestrator.replyQuestion(slot().agentId, reqId, answers)}
                    onSendMessage={(text) => orchestrator.sendTo(slot().agentId, text)}
                    developerMode={false}
                    showThinking={false}
                    onOpenArtifact={(artifactId) => {
                      setArtifactCollapsed(false);
                      setActiveArtifactId(artifactId);
                    }}
                  />
                )}
              </Show>
            </div>
          </div>
        </Show>

        {/* ── 底部：增强输入组件 ── */}
        <div style={{
          'flex-shrink': '0',
          'border-top': hasDispatchSession() ? `1px solid ${themeColors.border}` : 'none',
          'padding-top': hasDispatchSession() ? '10px' : '0',
          'margin-top': '6px',
        }}>
          {/* 错误提示 */}
          <Show when={agentError() !== null}>
            <div style={{
              'margin-bottom': '8px', padding: '8px 12px', 'border-radius': '7px',
              'font-size': '12px', background: '#fff2f0', border: '1px solid #ffccc7',
              color: '#cf1322', display: 'flex', 'align-items': 'flex-start', gap: '8px',
            }}>
              <AlertCircle size={14} style={{ 'flex-shrink': '0', 'margin-top': '1px' }} />
              <div style={{ flex: '1' }}>
                <div style={{ 'font-weight': '600', 'margin-bottom': '2px' }}>AI 调用失败</div>
                <div>{agentError()}</div>
              </div>
              <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', padding: '0' }}>
                <X size={14} />
              </button>
            </div>
          </Show>

          {/* EnhancedComposer */}
          <EnhancedComposer
            value={goal()}
            onChange={setGoal}
            isRunning={isRunning()}
            hasSession={hasDispatchSession()}
            agents={SOLO_AGENTS}
            configuredModels={configuredModels()}
            selectedModelId={sessionModelId()}
            onModelChange={setSessionModelId}
            onSubmit={handleStart}
            onStop={() => {
              // 可扩展：abort 当前执行
              setRunState('idle');
            }}
            onReset={reset}
            mode={chatMode()}
            onModeChange={setChatMode}
            capabilities={capabilities()}
            slashCommands={slashCommands}
            knowledgeScore={knowledgeHealthScore()}
            placeholder={
              chatMode() === 'chat'
                ? '问我任何关于你产品的问题，或输入 @ 召唤特定 Agent...'
                : '描述你的目标，AI 虚拟团队并行执行... 支持 @ 指定 Agent，/ 触发命令'
            }
          />

          <div style={{ 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '5px', 'text-align': 'center' }}>
            Enter 发送 · Shift+Enter 换行 · @ 召唤 Agent · / 触发命令
          </div>
        </div>
      </div>

      {/* ── 拖拽手柄 ── */}
      <Show when={!artifactFloat() && !artifactCollapsed()}>
        <div
          style={{
            width: '5px', cursor: 'col-resize', 'flex-shrink': '0',
            background: themeColors.border, 'border-radius': '3px', 'align-self': 'stretch',
            transition: 'background 0.15s',
          }}
          onPointerDown={handleResizeStart}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.success + '80'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.border; }}
        />
      </Show>

      {/* ── 产出物区域（展开） ── */}
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
            activeArtifactId={activeArtifactId()}
            onActiveArtifactIdChange={setActiveArtifactId}
          />
        </div>
      </Show>

      {/* ── 产出物收起态 ── */}
      <Show when={!artifactFloat() && artifactCollapsed()}>
        <div
          onClick={() => setArtifactCollapsed(false)}
          title="展开产出物面板"
          style={{
            width: '34px', 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column',
            'align-items': 'center', padding: '10px 0', gap: '8px', cursor: 'pointer',
            border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
            background: themeColors.surface, 'user-select': 'none',
          }}
        >
          <FileText size={14} style={{ color: themeColors.textMuted }} />
          <span style={{ 'writing-mode': 'vertical-rl', 'font-size': '10px', color: themeColors.textMuted, 'letter-spacing': '2px' }}>
            产出物
          </span>
          <Show when={artifactsData().length > 0}>
            <span style={{
              'font-size': '9px', background: chartColors.success, color: 'white',
              'border-radius': '9999px', padding: '1px 4px', 'font-weight': '600',
            }}>
              {artifactsData().length}
            </span>
          </Show>
        </div>
      </Show>

      {/* ── 产出物悬浮面板 ── */}
      <Show when={artifactFloat()}>
        <div style={{
          position: 'fixed', left: `${artifactFloatPos().x}px`, top: `${artifactFloatPos().y}px`,
          width: `${artifactFloatWidth()}px`, height: `${artifactFloatHeight()}px`,
          'z-index': 200, 'border-radius': '12px', overflow: 'hidden',
          'box-shadow': '0 8px 40px rgba(0,0,0,0.22)',
        }}>
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
            activeArtifactId={activeArtifactId()}
            onActiveArtifactIdChange={setActiveArtifactId}
          />
        </div>
      </Show>

      {/* ── 保存提示 ── */}
      <Show when={saveMsg() !== null}>
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 18px', 'border-radius': '8px', 'font-size': '12px', 'z-index': 300,
          background: saveMsg()?.startsWith('已保存') ? themeColors.successBg : '#fff2f0',
          border: `1px solid ${saveMsg()?.startsWith('已保存') ? themeColors.successBorder : '#ffccc7'}`,
          color: saveMsg()?.startsWith('已保存') ? chartColors.success : '#cf1322',
          'box-shadow': '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {saveMsg()}
        </div>
      </Show>

      {/* ── 权限授权 Dialog ── */}
      <Show when={permissionQueue()[0]} keyed>
        {(req) => (
          <PermissionDialog request={req} onResolve={handlePermissionResolve} />
        )}
      </Show>

      <CreateProductModal open={createModalOpen()} onClose={() => setCreateModalOpen(false)} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default SoloAutopilot;
