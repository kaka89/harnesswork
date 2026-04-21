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
  createMemo,
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
  Plus,
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
import { loadSession as loadMemorySession, loadMemoryIndex, saveMemoryMeta } from '../../../services/memory-store';
import {
  parseMention,
  type AutopilotAgent,
  type AgentExecutionStatus,
} from '../../../services/autopilot-executor';
import { listAllAgents, getBuiltinAgents } from '../../../services/agent-registry';
import { callAgent, isClientReady, setProviderAuth, buildGitSystemContext } from '../../../services/opencode-client';
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
import MessageList from '../../../../components/session/message-list';
import { createMessageAccumulator } from '../../../services/message-accumulator';
import type { MessageWithParts } from '../../../../types';
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
  /** 关联的产出物 ID（内容被提取为产出物后设置） */
  artifactId?: string;
  /** 产出物标题（展示链接时用） */
  artifactTitle?: string;
}

const genMsgId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const nowTimeStr = () => new Date().toTimeString().slice(0, 5);

/**
 * 从 OpenCode 存储的完整 user prompt 中提取用户实际输入。
 *
 * 完整 prompt 格式为 systemPrompt + 时间 + 知识上下文 + 回忆上下文 + 用户输入，
 * 各段之间以 "\n\n---\n\n" 分隔。
 * 检测到 "## 当前系统时间" 标记时，认为包含元上下文，取最后一段为用户输入。
 * 未检测到标记时原样返回（兼容无 system prompt 的纯用户消息）。
 */
function stripSystemContext(content: string): string {
  const SEP = '\n\n---\n\n';
  const MARKER = '## 当前系统时间';
  if (!content.includes(MARKER)) return content;
  const parts = content.split(SEP);
  // 用户输入始终在最后一段
  const userInput = parts[parts.length - 1]?.trim();
  return userInput || content;
}

/**
 * 对 accumulator 消息中含有系统上下文注入标记的 text part 进行剥离。
 *
 * 不依赖 role 字段：OpenCode 的 message.part.updated 事件先于 message.updated 到达时，
 * 占位 message 的 role 默认为 'assistant'，导致用户消息被误判。
 * 改为通过内容特征（## 当前系统时间 标记）识别注入消息，并同时修正 role 为 'user'。
 */
function stripAccUserMsg(msg: MessageWithParts): MessageWithParts {
  const hasSystemCtx = msg.parts.some(
    p => p.type === 'text' && ((p as any).text ?? '').includes('## 当前系统时间')
  );
  if (!hasSystemCtx) return msg;
  // 含有系统上下文 → 剥离注入内容，并将 role 修正为 'user'
  return {
    ...msg,
    info: { ...(msg.info as any), role: 'user' as const } as any,
    parts: msg.parts.map(part => {
      if (part.type !== 'text') return part;
      const raw = (part as any).text ?? '';
      const stripped = stripSystemContext(raw);
      return stripped === raw ? part : { ...part, text: stripped } as any;
    }),
  };
}

// ─── 产出物自动检测 ──────────────────────────────────────────────────────────

/** 检测消息内容格式（仅供产出物检测使用） */
type MsgFormat = 'html' | 'markdown' | 'text';
function detectMsgFormatForArtifact(content: string): MsgFormat {
  const t = content.trimStart().toLowerCase();
  if (t.startsWith('<!doctype html') || t.startsWith('<html')) return 'html';
  if (/<head[\s>]/i.test(t) && /<body[\s>]/i.test(t)) return 'html';
  const blockTags = (t.match(/<(div|section|table|style|header|footer|main|form)\b/gi) || []).length;
  if (blockTags >= 3) return 'html';
  const mdMarkers = [
    /^#{1,3} /m, /\*\*.+?\*\*/, /^[-*] /m, /```/, /^\|.+\|/m,
  ].filter(re => re.test(content)).length;
  if (mdMarkers >= 2) return 'markdown';
  return 'text';
}

/** 判断 AI 回复是否构成一篇独立文档（达到产出物标准） */
function looksLikeDocument(content: string): boolean {
  if (content.length < 400) return false;
  const fmt = detectMsgFormatForArtifact(content);
  if (fmt === 'html') return true;
  // Markdown：至少有 2 个标题
  const headings = (content.match(/^#{1,3} /gm) || []).length;
  return headings >= 2;
}

/** 从 AI 回复中提取文档标题（取第一个标题行 or 截断） */
function extractDocTitle(content: string): string {
  const m = content.match(/^#{1,3} (.+)$/m);
  if (m) return m[1].trim().slice(0, 60);
  const line1 = content.trim().split('\n')[0].replace(/^[#*\->\s]+/, '').trim();
  return (line1 || '对话产出物').slice(0, 60);
}

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
  const [isCollapsed, setIsCollapsed] = createSignal(true); // 默认收起

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
  onNewSession: () => void;
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
      <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
        {/* 新建会话按钮 */}
        <button
          onClick={props.onNewSession}
          title="新建会话"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted,
            display: 'flex', 'align-items': 'center', padding: '2px 4px', 'border-radius': '4px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#22c55e'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = themeColors.textMuted; }}
        >
          <Plus size={14} />
        </button>
        <button onClick={props.onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted, display: 'flex', 'align-items': 'center' }}>
          <X size={14} />
        </button>
      </div>
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
                  {/* 模式 badge：常显且放在标题行更显眼 */}
                  <span style={{
                    'flex-shrink': '0',
                    padding: '1px 5px', 'border-radius': '3px', 'font-size': '9px', 'font-weight': '600',
                    background: item.mode === 'dispatch' ? 'rgba(168,85,247,0.15)' : 'rgba(34,197,94,0.15)',
                    color: item.mode === 'dispatch' ? '#a855f7' : '#16a34a',
                    border: `1px solid ${item.mode === 'dispatch' ? 'rgba(168,85,247,0.3)' : 'rgba(34,197,94,0.3)'}`,
                  }}>
                    {item.mode === 'dispatch' ? '🚀团队' : '💬对话'}
                  </span>
                  <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    {item.title}
                  </span>
                  <Show when={isRestoring()}>
                    <span style={{ 'font-size': '10px', color: chartColors.primary, 'flex-shrink': '0' }}>加载中…</span>
                  </Show>
                </div>
                <Show when={!!item.ts}>
                  <div style={{ 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '2px' }}>
                    {item.ts}
                  </div>
                </Show>
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

  // ── OpenCode Client 就绪状态（防止 client 未注入时调用 AI 功能）──────────────
  const [clientReady, setClientReady] = createSignal(isClientReady());
  createEffect(() => { setClientReady(isClientReady()); });

  // ── 基础状态 ────────────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [chatMode, setChatMode] = createSignal<ChatMode>('dispatch');
  // Agent 列表：同步初始值用内置常量（避免闪烁），异步更新加载自定义 Agent
  const [allAgents, setAllAgents] = createSignal<AutopilotAgent[]>(getBuiltinAgents('solo'));
  const [agentStatuses, setAgentStatuses] = createSignal<AgentStatus>(
    Object.fromEntries(getBuiltinAgents('solo').map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<AgentTasks>({});
  const [agentDone, setAgentDone] = createSignal<AgentDone>(
    Object.fromEntries(getBuiltinAgents('solo').map((a) => [a.id, 0]))
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
  /** 当前对话的 OpenCode Session ID（多轮复用同一 session） */
  const [currentChatSessionId, setCurrentChatSessionId] = createSignal<string | null>(null);
  // 历史会话恢复中的 sessionId（用于 loading 指示）
  const [restoringSessionId, setRestoringSessionId] = createSignal<string | null>(null);

  // ── Solo Chat 消息累积器（Part-based 消息源）──────────────────────────────────
  const [chatAccSessionId, setChatAccSessionId] = createSignal<string | null>(null);
  // ⚠️ 重要：不传 onPermissionAsked / onQuestionAsked
  // 权限处理由 callAgent 独占（含 autoApproveTools 白名单逻辑 + 手动审批弹窗）
  const chatAccumulator = createMessageAccumulator({
    client: () => openworkCtx?.opencodeClient?.() ?? null,
    sessionId: chatAccSessionId,
    directory: () => productStore.activeProduct()?.workDir,
  });

  // 乐观 UI：用户消息即时展示占位
  const [pendingUserMsg, setPendingUserMsg] = createSignal<MessageWithParts | null>(null);

  // 将旧 ChatMsg 格式转为 MessageWithParts（历史恢复兼容）
  function legacyToMessageWithParts(msg: ChatMsg): MessageWithParts {
    return {
      info: {
        id: msg.id,
        sessionID: '',
        role: msg.role,
        time: { created: msg.ts ? Date.parse(msg.ts) / 1000 : Date.now() / 1000 },
      } as any,
      parts: [{
        id: `part-${msg.id}`,
        type: 'text',
        text: msg.content,
        messageID: msg.id,
      } as any],
    };
  }

  // 合并消息源用于渲染：累积器消息(实时) + 旧格式消息(历史恢复) + 乐观占位
  // 使用 createMemo 确保只在依赖变化时重新计算，且不含副作用
  const chatDisplayMessages = createMemo((): MessageWithParts[] => {
    const accMsgs = chatAccumulator.messages();
    const legacy = chatMessages();
    const pending = pendingUserMsg();

    const result: MessageWithParts[] = [];

    // 旧格式消息（从历史恢复加载）
    if (legacy.length > 0) {
      result.push(...legacy.map(legacyToMessageWithParts));
    }

    // 累积器消息（实时会话）完全接管，不与 legacy 合并（防止重复显示）
    // 同时对用户消息剥离注入的系统上下文（去除 systemPrompt/时间/知识库内容）
    if (accMsgs.length > 0) {
      return accMsgs.map(stripAccUserMsg);
    }

    // 乐观占位消息（仅在 accumulator 尚无消息时显示）
    if (pending) {
      result.push(pending);
    }

    return result;
  });

  // 副作用独立到 createEffect：accumulator 收到用户消息后清除乐观占位
  // 同时检测含系统上下文标记的消息（role 可能被误判为 assistant）
  createEffect(() => {
    const accMsgs = chatAccumulator.messages();
    if (pendingUserMsg() && accMsgs.some(m =>
      (m.info as any).role === 'user' ||
      m.parts.some(p => p.type === 'text' && ((p as any).text ?? '').includes('## 当前系统时间'))
    )) {
      setPendingUserMsg(null);
    }
  });

  // 新消息出现或流式更新时自动滚到底部
  createEffect(() => {
    chatDisplayMessages(); // 响应消息内容变化（含流式增量）
    requestAnimationFrame(() => {
      if (chatScrollRef) {
        chatScrollRef.scrollTop = chatScrollRef.scrollHeight;
      }
    });
  });

  // MessageList 工具步骤展开状态
  const [chatExpandedStepIds, setChatExpandedStepIds] = createSignal<Set<string>>(new Set());
  let chatScrollRef: HTMLDivElement | undefined;

  // 追踪最近生成的产出物
  const latestArtifact = createMemo(() => {
    const arts = artifactsData();
    return arts.length > 0 ? arts[arts.length - 1] : null;
  });

  // ── 从 chat 回复中自动提取产出物 ─────────────────────────────────────────────
  const tryExtractArtifact = (_aiMsgId: string, fullText: string) => {
    if (!looksLikeDocument(fullText)) return;
    const title = extractDocTitle(fullText);
    const newArtifact: ArtifactItem = {
      id: `artifact-chat-${Date.now()}`,
      agentId: 'chat',
      agentName: 'AI 助手',
      agentEmoji: '💬',
      title,
      content: fullText,
      createdAt: nowTimeStr(),
      format: detectMsgFormatForArtifact(fullText) === 'html' ? 'html' : 'markdown',
    };
    setArtifactsData((prev) => [...prev, newArtifact]);
    setArtifactCollapsed(false);
    setActiveArtifactId(newArtifact.id);
    // 产出物面板自动展开，提示条通过 latestArtifact 信号驱动
  };

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
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      // 优先通过 loadMemoryIndex 获取（已融合 sidecar.json 中的 mode 信息）
      const memIndex = await loadMemoryIndex(workDir);
      if (memIndex.sessions.length > 0) {
        const items: HistoryItem[] = memIndex.sessions.slice(0, 30).map((entry) => ({
          id: entry.id,
          title: entry.summary || entry.id.slice(0, 12),
          ts: entry.createdAt,
          // entry.type 来自 sidecar，'dispatch' = 团队模式，其余默认对话
          mode: entry.type === 'dispatch' ? 'dispatch' : 'chat',
        }));
        setHistoryItems(items);
        return;
      }
    } catch { /* 降级到原始 title 判断 */ }

    // 降级：直接从 OpenCode session.list 读取，通过 title 前缀判断（历史数据兼容）
    const client = openworkCtx?.opencodeClient?.();
    if (!client) return;
    try {
      const result = await client.session.list({ directory: workDir });
      const sessions = Array.isArray(result.data) ? result.data : [];
      const toTs = (s: any) => {
        const ms = s.time?.updated ?? s.time?.created;
        if (!ms) return '—';
        return new Date(ms).toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      };
      const sorted = [...sessions].sort((a: any, b: any) => {
        const ta = a.time?.updated ?? a.time?.created ?? 0;
        const tb = b.time?.updated ?? b.time?.created ?? 0;
        return tb - ta;
      });
      const items: HistoryItem[] = sorted.slice(0, 30).map((s: any) => ({
        id: s.id,
        title: s.title || s.id.slice(0, 12),
        ts: toTs(s),
        // 历史数据无 sidecar 记录，通过 title 前缀推断（默认对话模式）
        mode: s.title?.startsWith('xingjing-orchestrator') ? 'dispatch' : 'chat',
      }));
      setHistoryItems(items);
    } catch {}
  };

  // ── 恢复历史会话：通过 memory-store 加载消息并以 chat 气泡形式展示 ─────────────
  const restoreHistorySession = async (item: HistoryItem) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    setRestoringSessionId(item.id);
    try {
      const detail = await loadMemorySession(workDir, item.id);
      if (!detail || detail.messages.length === 0) {
        console.warn('[solo-autopilot] 会话无消息:', item.id);
        setShowHistory(false);
        return;
      }

      // 将 MemoryMessage 转为 ChatMsg[]，只保留有文字内容的消息
      const converted: ChatMsg[] = [];
      for (const m of detail.messages) {
        const rawText = m.content?.trim();
        const text = (rawText && m.role === 'user') ? stripSystemContext(rawText) : rawText;
        if (!text) continue;

        const tsStr = m.ts
          ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : nowTimeStr();

        converted.push({
          id: m.id || genMsgId(),
          role: m.role === 'user' ? 'user' : 'assistant',
          content: text,
          ts: tsStr,
        });
      }

      // 用历史消息替换当前 chat 消息，并按历史记录的模式切换
      setChatMessages(converted);
      // 根据历史条目的模式切换：对话模式或团队调度模式
      setChatMode(item.mode === 'dispatch' ? 'dispatch' : 'chat');
      // 恢复历史时，让用户可继续在同一 session 中对话
      if (item.mode === 'chat') {
        setCurrentChatSessionId(item.id);
        // 绑定累积器到已恢复的 session，后续对话消息通过 accumulator SSE 订阅
        setChatAccSessionId(item.id);
      } else {
        setCurrentChatSessionId(null);
        setChatAccSessionId(null);
      }
      setShowHistory(false);
    } catch (err) {
      console.error('[solo-autopilot] Failed to restore session:', err);
      setShowHistory(false);
    } finally {
      setRestoringSessionId(null);
    }
  };

  // ── 加载/刷新 providerKeys 的通用函数（onMount 和 activeProduct 变化时复用）──
  const loadProviderKeys = async (workDir: string | undefined) => {
    // 无论有无 workDir，始终先把全局 llmConfig 中的 key 加载进来
    const cur = state.llmConfig;
    const keys: Record<string, string> = {};
    if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;

    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        // 项目级 key 优先级更高，merge 到全局 key 之上
        Object.assign(keys, settings.llmProviderKeys ?? {});
      } catch {}
    }

    setProviderKeys(keys);
    const configured = modelOptions.filter(
      (opt) => opt.providerID !== 'custom' && (keys[opt.providerID]?.trim().length ?? 0) > 0,
    );
    if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) {
      setSessionModelId(configured[0].modelID);
    }
  };

  // ── 响应式监听：activeProduct 变化时自动刷新 providerKeys ──────────────────────
  createEffect(() => {
    const workDir = productStore.activeProduct()?.workDir;
    loadProviderKeys(workDir);
  });

  // ── onMount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;

    // 异步加载完整 Agent 列表（内置 + 自定义）
    listAllAgents('solo').then((agents) => {
      setAllAgents(agents);
    }).catch(() => {});

    if (workDir) {
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

    // 自动恢复最近一次会话（若存在）
    const items = historyItems();
    if (items.length > 0) {
      await restoreHistorySession(items[0]);
    }
  });

  // ── TeamSessionOrchestrator ────────────────────────────────────────────────────
  const orchestrator = createTeamSessionOrchestrator({
    client: () => openworkCtx?.opencodeClient?.() ?? null,
    workspaceId: () => resolvedWorkspaceId(),
    workDir: () => productStore.activeProduct()?.workDir ?? '',
    availableAgents: allAgents(),
    model: () => {
      const m = getSessionModel();
      if (!m) return null;
      return { providerID: m.providerID, modelID: m.modelID };
    },
    // session.create 前确保 API Key 已同步到 OpenCode（防止 ConfigInvalidError）
    ensureAuth: async () => {
      const cfg = state.llmConfig;
      if (cfg.providerID && cfg.providerID !== 'custom' && cfg.apiKey && cfg.apiKey.length > 4) {
        await setProviderAuth(cfg.providerID, cfg.apiKey);
      }
    },
    skillApi: null,
    onArtifactExtracted: (artifact) => {
      const agent = allAgents().find((a) => a.id === artifact.agentId);
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
    // 每当 orchestrator 内部成功创建任何 session 时立即写入 sidecar，
    // await 确保落盘完成后再继续（防止 loadHistory 读到旧数据）
    onSessionCreated: async (sessionId) => {
      const workDir = productStore.activeProduct()?.workDir;
      if (workDir) {
        await saveMemoryMeta(workDir, sessionId, { tags: [], mode: 'dispatch' });
      }
    },
  });

  const timersRef: ReturnType<typeof setTimeout>[] = [];
  const clearTimers = () => { timersRef.forEach(clearTimeout); timersRef.length = 0; };

  const reset = () => {
    clearTimers();
    if (elapsedTimerRef) { clearInterval(elapsedTimerRef); elapsedTimerRef = undefined; }
    setElapsedSec(0);
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(allAgents().map((a) => [a.id, 'idle' as const])));
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

    // ▸ 诊断日志：记录入口状态
    const _model = getSessionModel();
    console.log('[solo-chat] handleChatSend 入口', {
      hasModel: !!_model,
      modelID: _model?.modelID,
      providerID: _model?.providerID,
      existingSessionId: currentChatSessionId(),
      configuredModelsCount: configuredModels().length,
      workDir: productStore.activeProduct()?.workDir,
    });

    // ▸ 前置模型验证（与 dispatch 模式保持一致）
    if (!_model && configuredModels().length === 0) {
      setAgentError('尚未配置可用的大模型，请先前往「设置 → 大模型配置」填写 API Key');
      return;
    }

    // 乐观 UI：立即展示用户消息
    const syntheticUserMsg: MessageWithParts = {
      info: {
        id: `pending-${Date.now()}`,
        sessionID: currentChatSessionId() || 'pending',
        role: 'user',
        time: { created: Date.now() / 1000 },
      } as any,
      parts: [{ id: `part-${Date.now()}`, type: 'text', text, messageID: '' } as any],
    };
    setPendingUserMsg(syntheticUserMsg);

    setGoal('');          // 立即清空输入框
    setChatLoading(true);
    setAgentError(null);

    // 用于产出物提取的累积文本缓存
    let lastAccumulatedTextRef = '';

    const productName = productStore.activeProduct()?.name ?? '未知产品';
    const workDir = productStore.activeProduct()?.workDir;

    await callAgent({
      userPrompt: text,
      systemPrompt: `你是「${productName}」产品的 AI 助手，精通产品策略、技术架构与增长分析。请用简洁、专业的中文回答用户的问题。${buildGitSystemContext(productStore.activeProduct()?.gitUrl)}`,
      title: currentChatSessionId()
        ? undefined
        : (text.length > 50 ? text.slice(0, 50) + '...' : text),
      model: getSessionModel(),
      directory: workDir,
      existingSessionId: currentChatSessionId() || undefined,
      owSessionStatusById: openworkCtx?.sessionStatusById,
      // 关键：session 建立后触发累积器订阅
      onSessionCreated: (sid) => {
        setCurrentChatSessionId(sid);
        setChatAccSessionId(sid);    // 触发 accumulator 的 createEffect → SSE 订阅
        // 将 chat 模式记录到 sidecar，供历史列表正确判断模式
        if (workDir) void saveMemoryMeta(workDir, sid, { tags: [], mode: 'chat' });
      },
      // 保留 onText 用于产出物提取（不再用于 UI 渲染）
      onText: (accumulated) => {
        lastAccumulatedTextRef = accumulated;
      },
      onDone: (fullText) => {
        setChatLoading(false);
        tryExtractArtifact('auto', fullText || lastAccumulatedTextRef);
      },
      onError: (errMsg) => {
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

    console.log('[solo-chat] handleStart 入口', {
      mode: chatMode(),
      hasModel: !!getSessionModel(),
      modelID: getSessionModel()?.modelID,
      configuredModelsCount: configuredModels().length,
    });

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

    const { targetAgent, cleanText } = parseMention(text, allAgents());

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
      clearTimers();
      orchestrator.abort();
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
    console.log('[solo-chat] onCleanup: 清理资源');
    clearTimers();
    orchestrator.abort();
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

  // chat 模式：accumulator 有消息 OR 有乐观占位消息 OR 正在流式
  const hasChatContent = () =>
    chatDisplayMessages().length > 0 || chatAccumulator.isStreaming() || chatLoading();

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
    <Show
      when={clientReady()}
      fallback={
        <div style={{
          display: 'flex', 'flex-direction': 'column', 'align-items': 'center',
          'justify-content': 'center', height: '100%', gap: '12px',
          background: themeColors.appBg,
        }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: chartColors.primary }} />
          <div style={{ 'font-size': '14px', color: themeColors.text }}>正在连接 OpenCode 服务...</div>
          <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>请确保 OpenWork 已启动并选择了工作区</div>
        </div>
      }
    >
    <div style={{ display: 'flex', 'align-items': 'stretch', width: '100%', height: '100%', overflow: 'hidden', gap: '8px' }}>

      {/* ── 历史侧边栏 ── */}
      <Show when={showHistory()}>
        <HistorySidebar
          items={historyItems()}
          activeId={orchestrator.state().orchestratorSessionId}
          restoringId={restoringSessionId()}
          onSelect={(id) => {
            const item = historyItems().find((h) => h.id === id);
            if (item) restoreHistorySession(item);
            else setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
          onNewSession={() => {
            // 新建会话：重置所有状态，关闭历史侧边栏
            orchestrator.resetState();
            reset();
            setChatMessages([]);
            setChatMode('dispatch');
            setCurrentChatSessionId(null);
            setChatAccSessionId(null);
            setPendingUserMsg(null);
            setShowHistory(false);
          }}
        />
      </Show>

      {/* ── 左侧 Agent 面板（数据从 orchestrator.state() 实时派生） ── */}
      <div style={{ 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>
        <AgentPanelSidebar
          agents={allAgents()}
          agentStatuses={(() => {
            // 从 orchestrator agentSlots 派生实时状态，映射 'pending' → 'waiting'
            const result: AgentStatus = Object.fromEntries(allAgents().map((a) => [a.id, 'idle' as const]));
            orchestrator.state().agentSlots.forEach((slot, agentId) => {
              const s = slot.status();
              result[agentId] = s === 'pending' ? 'waiting' : (s as any);
            });
            return result;
          })()}
          agentTasks={(() => {
            // 从各 slot 的最后一条 assistant 消息截取摘要作为当前任务描述
            const result: AgentTasks = {};
            orchestrator.state().agentSlots.forEach((slot, agentId) => {
              const msgs = slot.messages();
              const lastAssistant = [...msgs].reverse().find((m: any) => {
                const role = m.info?.role ?? m.role;
                return role === 'assistant';
              });
              if (lastAssistant) {
                const parts: any[] = (lastAssistant as any).parts ?? [];
                const text = parts
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text ?? '')
                  .join('')
                  .trim()
                  .slice(0, 40);
                if (text) result[agentId] = text + (text.length >= 40 ? '…' : '');
              }
            });
            return result;
          })()}
          agentDone={(() => {
            // 已完成的 agent 计 1，其余 0
            const result: AgentDone = Object.fromEntries(allAgents().map((a) => [a.id, 0]));
            orchestrator.state().agentSlots.forEach((slot, agentId) => {
              if (slot.status() === 'done') result[agentId] = 1;
            });
            return result;
          })()}
          elapsedSec={elapsedSec()}
          runState={(() => {
            if (orchestrator.state().isRunning) return 'running';
            const slots = orchestrator.state().agentSlots;
            if (slots.size > 0) {
              const allSettled = Array.from(slots.values()).every(
                (s) => s.status() === 'done' || s.status() === 'error'
              );
              if (allSettled) return 'done';
            }
            return runState(); // fallback 保留本地状态
          })()}
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
            {/* 新建会话按钮（有内容时显示，提供返回/清空入口） */}
            <Show when={hasContent()}>
              <button
                onClick={() => {
                  orchestrator.resetState();
                  reset();
                  setChatMessages([]);
                  setChatMode('dispatch');
                  setCurrentChatSessionId(null);
                  setChatAccSessionId(null);
                  setPendingUserMsg(null);
                }}
                title="新建会话"
                style={{
                  display: 'flex', 'align-items': 'center', gap: '4px',
                  padding: '3px 8px', 'border-radius': '6px', 'font-size': '11px',
                  border: `1px solid ${themeColors.border}`, background: 'transparent',
                  color: themeColors.textMuted,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = '#22c55e';
                  (e.currentTarget as HTMLElement).style.borderColor = '#22c55e';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = themeColors.textMuted;
                  (e.currentTarget as HTMLElement).style.borderColor = themeColors.border;
                }}
              >
                <Plus size={12} />
                新建
              </button>
            </Show>
            {/* 历史按钮 */}
            <button
              onClick={() => {
                const opening = !showHistory();
                setShowHistory(opening);
                if (opening) loadHistory();
              }}
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

        {/* ── 💬 Chat 模式：MessageList 渲染 ── */}
        <Show when={chatMode() === 'chat' && hasChatContent()}>
          <div
            ref={(el) => { chatScrollRef = el; }}
            style={{ flex: '1', 'overflow-y': 'auto', 'min-height': '0', padding: '12px 4px' }}
          >
            <MessageList
              messages={chatDisplayMessages()}
              isStreaming={chatAccumulator.isStreaming() || chatLoading()}
              developerMode={false}
              showThinking={true}
              expandedStepIds={chatExpandedStepIds()}
              setExpandedStepIds={setChatExpandedStepIds}
              scrollElement={() => chatScrollRef}
              variant="bubble"
              onOpenArtifact={(artifactId) => {
                setArtifactCollapsed(false);
                setActiveArtifactId(artifactId);
              }}
            />
          </div>
          {/* 产出物检测提示条 */}
          <Show when={!chatLoading() && latestArtifact()}>
            {(art) => (
              <div style={{
                display: 'flex', 'align-items': 'center', gap: '8px',
                padding: '8px 14px', margin: '0 4px 8px',
                'border-radius': '8px',
                border: `1px solid ${themeColors.border}`,
                background: themeColors.surface,
                'font-size': '12px',
              }}>
                <FileText size={14} style={{ color: chartColors.success, 'flex-shrink': '0' }} />
                <span style={{ color: themeColors.textMuted }}>已生成产出物：</span>
                <button
                  onClick={() => {
                    setArtifactCollapsed(false);
                    setActiveArtifactId(art().id);
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: chartColors.primary, 'font-weight': 600,
                    'font-size': '12px', padding: 0, 'text-decoration': 'underline',
                  }}
                >
                  {art().title}
                </button>
              </div>
            )}
          </Show>
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
            agents={allAgents()}
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
    </Show>
  );
};

export default SoloAutopilot;
