/**
 * AiChatDrawer — AI 虚拟团队侧边抽屉
 *
 * 升级后的对话界面，支持三种模式：
 * 1. 普通对话（默认）：Q&A，callAgent 直接回答
 * 2. @mention 直接调用：@agent-id 跳过 Orchestrator
 * 3. 任务调度模式：Orchestrator 两阶段调度 + 内联执行状态可视化
 */
import {
  createSignal, createEffect, For, Show, onCleanup, onMount,
  type Component,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { marked } from 'marked';
import { Bot, Wifi, WifiOff, Loader2, ChevronDown, ChevronUp, Zap, MessageSquare, History, ChevronRight, Brain, Copy, Check } from 'lucide-solid';
import type { CallAgentOptions } from '../../services/opencode-client';
import PermissionDialog, { type PermissionRequest } from '../autopilot/permission-dialog';
import {
  type SessionRecord as PersistedSessionRecord,
  loadSessions as loadLegacySessions,
  appendSession as appendLegacySession,
  saveSessions,
  nowTimeStr,
  nowDateTimeStr,
} from '../../services/chat-session-store';
import {
  type MemorySession,
  type MemoryMessage,
  saveSession as saveMemorySession,
  loadMemoryIndex,
  loadSession as loadMemorySession,
  generateSessionSummary,
  genSessionId,
  nowISO,
  type CallAgentFn as MemoryCallAgentFn,
} from '../../services/memory-store';
import { recallRelevantContext } from '../../services/memory-recall';
import {
  SOLO_AGENTS,
  TEAM_AGENTS,
  runOrchestratedAutopilot,
  runDirectAgent,
  parseMention,
  type AutopilotAgent,
  type DispatchItem,
  type AgentExecutionStatus,
} from '../../services/autopilot-executor';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface DispatchState {
  phase: 'orchestrating' | 'executing' | 'done' | 'error';
  orchestratorText: string;
  plan: DispatchItem[];
  agentStatuses: Record<string, AgentExecutionStatus>;
  agentStreamTexts: Record<string, string>;
  progress: number;
  error?: string;
}

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'chat' | 'dispatch' | 'direct-agent';
  dispatchState?: DispatchState;
  agentName?: string;  // direct-agent 模式下的 Agent 名称
  ts?: string;         // 消息显示时间，格式 "HH:mm"
}

interface AiChatDrawerProps {
  open: boolean;
  onClose: () => void;
  isSoloMode: boolean;
  callAgentFn: (opts: CallAgentOptions) => Promise<void>;
  openworkStatus: 'connected' | 'limited' | 'disconnected';
  llmConfig: { providerID?: string; modelID?: string };
  currentProductName?: string;
  workDir?: string;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Marked 配置 ─────────────────────────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

// ─── 思考内容解析 ─────────────────────────────────────────────────────────────

interface ParsedContent {
  thinking: string;
  output: string;
  thinkingComplete: boolean;
}

function parseThinkingContent(content: string): ParsedContent {
  if (!content) return { thinking: '', output: '', thinkingComplete: false };
  const closeIdx = content.indexOf('</think>');
  if (content.startsWith('<think>')) {
    if (closeIdx !== -1) {
      return {
        thinking: content.slice(7, closeIdx).trim(),
        output: content.slice(closeIdx + 8).trim(),
        thinkingComplete: true,
      };
    }
    // 仍在流式输出思考中
    return { thinking: content.slice(7).trim(), output: '', thinkingComplete: false };
  }
  return { thinking: '', output: content, thinkingComplete: true };
}

// ─── Markdown 渲染组件 ────────────────────────────────────────────────────────

const MarkdownContent: Component<{ content: string; streaming?: boolean }> = (props) => {
  const html = () => {
    if (!props.content) return '';
    try {
      const raw = marked.parse(props.content, { async: false }) as string;
      return raw;
    } catch {
      return props.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  };
  return (
    <div
      class="md-prose"
      innerHTML={html()}
      style={{ position: 'relative' }}
    />
  );
};

// ─── 思考过程折叠块 ───────────────────────────────────────────────────────────

const ThinkingBlock: Component<{ content: string; complete: boolean; isStreaming: boolean }> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  // 思考完成后自动折叠
  createEffect(() => {
    if (props.complete && !props.isStreaming) {
      setExpanded(false);
    }
  });
  return (
    <div
      class="thinking-block rounded-xl mb-3 overflow-hidden"
      style={{
        background: 'rgba(139,92,246,0.06)',
        border: '1px solid rgba(139,92,246,0.2)',
      }}
    >
      <button
        class="w-full px-3 py-2 flex items-center gap-2 text-xs transition-colors"
        style={{ color: 'var(--purple-9, #7c3aed)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <Show
          when={props.isStreaming}
          fallback={<Brain size={12} />}
        >
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
        </Show>
        <span class="font-medium">
          {props.isStreaming ? '思考中...' : '思考过程'}
        </span>
        <Show when={!props.isStreaming}>
          <span class="ml-auto opacity-50 text-[10px]">
            {expanded() ? '收起' : '展开'}
          </span>
          <Show when={expanded()} fallback={<ChevronRight size={11} />}>
            <ChevronDown size={11} />
          </Show>
        </Show>
      </button>
      <Show when={expanded() && props.content}>
        <div
          class="px-3 py-2 text-[11px] leading-relaxed border-t whitespace-pre-wrap"
          style={{
            color: 'rgba(109,40,217,0.75)',
            'border-color': 'rgba(139,92,246,0.15)',
            'font-style': 'italic',
          }}
        >
          {props.content}
          <Show when={props.isStreaming}>
            <span class="streaming-cursor" />
          </Show>
        </div>
      </Show>
    </div>
  );
};

// ─── 会话历史类型 ─────────────────────────────────────────────────────────────

interface SessionRecord {
  id: string;
  summary: string;
  messages: AiMessage[];
  ts: string;
}

/** AiMessage → PersistedSessionRecord messages 格式转换 */
function toPersistedMessages(msgs: AiMessage[]): PersistedSessionRecord['messages'] {
  return msgs.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    type: m.type,
    agentName: m.agentName,
    ts: m.ts,
  }));
}

/** PersistedSessionRecord → SessionRecord 还原（忽略 dispatchState） */
function fromPersistedSession(s: PersistedSessionRecord): SessionRecord {
  return {
    id: s.id,
    summary: s.summary,
    ts: s.ts,
    messages: s.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      type: m.type as AiMessage['type'],
      agentName: m.agentName,
      ts: m.ts,
    })),
  };
}

// ─── 调度消息卡片 ──────────────────────────────────────────────────────────────

const AgentStatusBadge: Component<{ status: AgentExecutionStatus; color: string }> = (props) => {
  const text = () => {
    switch (props.status) {
      case 'pending':  return '等待中';
      case 'thinking': return '思考中';
      case 'working':  return '执行中';
      case 'done':     return '完成';
      case 'error':    return '失败';
      default:         return '待命';
    }
  };
  const isActive = () => props.status === 'thinking' || props.status === 'working';

  return (
    <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
      style={{
        background: props.status === 'done'
          ? 'var(--dls-success-bg)'
          : props.status === 'error'
            ? 'rgba(239,68,68,0.1)'
            : isActive() ? `${props.color}20` : 'var(--dls-hover)',
        color: props.status === 'done'
          ? 'var(--green-9)'
          : props.status === 'error'
            ? 'var(--red-9)'
            : isActive() ? props.color : 'var(--dls-text-muted)',
        border: `1px solid ${props.status === 'done' ? 'var(--dls-success-border)' : props.status === 'error' ? 'rgba(239,68,68,0.3)' : isActive() ? props.color : 'var(--dls-border)'}`,
      }}
    >
      <Show when={isActive()}>
        <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
      </Show>
      {text()}
    </span>
  );
};

const DispatchCard: Component<{ state: DispatchState; agents: AutopilotAgent[] }> = (props) => {
  const [expandedAgent, setExpandedAgent] = createSignal<string | null>(null);

  return (
    <div class="rounded-xl border border-[var(--dls-border)] bg-[var(--dls-surface)] overflow-hidden text-xs">
      {/* Phase 1 — Orchestrator 规划 */}
      <Show when={props.state.phase === 'orchestrating' || props.state.orchestratorText}>
        <div class="px-3 py-2 border-b border-[var(--dls-border-light)]"
          style={{ background: 'var(--dls-primary-bg, rgba(99,102,241,0.06))' }}
        >
          <div class="flex items-center gap-1.5 font-semibold mb-1"
            style={{ color: 'var(--purple-9, #7c3aed)' }}
          >
            <Show when={props.state.phase === 'orchestrating'}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            </Show>
            <span>Orchestrator 规划中...</span>
          </div>
          <Show when={props.state.orchestratorText}>
            <div class="text-[var(--dls-text-secondary)] whitespace-pre-wrap leading-relaxed max-h-[80px] overflow-y-auto opacity-70">
              {props.state.orchestratorText}
            </div>
          </Show>
        </div>
      </Show>

      {/* Phase 2 — Agent 执行列表 */}
      <Show when={props.state.plan.length > 0}>
        <div class="divide-y divide-[var(--dls-border-light)]">
          <For each={props.state.plan}>
            {(item) => {
              const agent = props.agents.find(a => a.id === item.agentId);
              if (!agent) return null;
              const status = () => props.state.agentStatuses[item.agentId] ?? 'pending';
              const streamText = () => props.state.agentStreamTexts[item.agentId] ?? '';
              const isExpanded = () => expandedAgent() === item.agentId;
              const hasText = () => streamText().length > 0;

              return (
                <div class="px-3 py-2">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-base leading-none">{agent.emoji}</span>
                    <span class="font-medium" style={{ color: agent.color }}>{agent.name}</span>
                    <AgentStatusBadge status={status()} color={agent.color} />
                    <Show when={hasText()}>
                      <button
                        class="ml-auto text-[var(--dls-text-muted)] hover:text-[var(--dls-text-secondary)] transition-colors"
                        onClick={() => setExpandedAgent(isExpanded() ? null : item.agentId)}
                      >
                        <Show when={isExpanded()} fallback={<ChevronDown size={12} />}>
                          <ChevronUp size={12} />
                        </Show>
                      </button>
                    </Show>
                  </div>
                  <div class="text-[var(--dls-text-muted)] leading-relaxed mb-1 truncate">{item.task.slice(0, 60)}…</div>
                  <Show when={hasText() && isExpanded()}>
                    <div class="mt-1.5 p-2 rounded-lg text-[var(--dls-text-secondary)] whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto"
                      style={{ background: 'var(--dls-hover)', 'font-size': '11px' }}
                    >
                      {streamText()}
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* 进度条 */}
      <Show when={props.state.phase !== 'done' && props.state.phase !== 'error'}>
        <div class="px-3 py-2 border-t border-[var(--dls-border-light)]">
          <div class="flex justify-between text-[var(--dls-text-muted)] mb-1" style={{ 'font-size': '10px' }}>
            <span>
              {props.state.phase === 'orchestrating' ? 'Orchestrator 分析中...' : `执行中 · ${Object.values(props.state.agentStatuses).filter(s => s === 'done').length}/${props.state.plan.length} 完成`}
            </span>
            <span>{props.state.progress}%</span>
          </div>
          <div class="h-1 rounded-full overflow-hidden" style={{ background: 'var(--dls-border)' }}>
            <div class="h-full rounded-full transition-all duration-300"
              style={{
                width: `${props.state.progress}%`,
                background: 'var(--purple-9, #7c3aed)',
              }}
            />
          </div>
        </div>
      </Show>

      {/* 完成 / 错误状态 */}
      <Show when={props.state.phase === 'done'}>
        <div class="px-3 py-2 border-t border-[var(--dls-success-border)] text-[var(--green-9)]"
          style={{ background: 'var(--dls-success-bg)', 'font-size': '11px' }}
        >
          ✓ 所有 Agent 执行完成
        </div>
      </Show>
      <Show when={props.state.phase === 'error'}>
        <div class="px-3 py-2 border-t text-[var(--red-9)]"
          style={{ background: 'rgba(239,68,68,0.06)', 'font-size': '11px', 'border-color': 'rgba(239,68,68,0.2)' }}
        >
          ⚠️ {props.state.error ?? '执行失败'}
        </div>
      </Show>
    </div>
  );
};

// ─── Direct Agent 消息卡片 ─────────────────────────────────────────────────────

const DirectAgentCard: Component<{ agentName: string; content: string; loading: boolean; agentColor?: string }> = (props) => {
  return (
    <div class="rounded-xl border border-[var(--dls-border)] bg-[var(--dls-surface)] overflow-hidden text-xs">
      <div class="px-3 py-2 border-b border-[var(--dls-border-light)] flex items-center gap-2"
        style={{ background: props.agentColor ? `${props.agentColor}12` : 'var(--dls-hover)' }}
      >
        <span class="font-semibold" style={{ color: props.agentColor ?? 'var(--dls-text-primary)' }}>
          {props.agentName}
        </span>
        <Show when={props.loading}>
          <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: props.agentColor ?? 'var(--dls-text-muted)' }} />
        </Show>
      </div>
      <div class="px-3 py-2 text-[var(--dls-text-secondary)] leading-relaxed max-h-[300px] overflow-y-auto">
        <Show when={props.content} fallback={<span class="text-[var(--dls-text-muted)] italic flex items-center gap-1"><TypingDots /></span>}>
          <MarkdownContent content={props.content} />
        </Show>
      </div>
    </div>
  );
};

// ─── MentionInput (内嵌轻量版，适配 Drawer 紧凑布局) ─────────────────────────

const DrawerMentionInput: Component<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  agents: AutopilotAgent[];
  onSubmit: () => void;
  isSoloMode: boolean;
}> = (props) => {
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [dropdownPos, setDropdownPos] = createSignal<{ top: number; left: number; width: number } | null>(null);
  let inputRef: HTMLInputElement | undefined;

  const filteredAgents = () => {
    const q = mentionQuery().toLowerCase();
    return props.agents.filter(a =>
      a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  };

  const updateDropdownPos = () => {
    if (inputRef) {
      const rect = inputRef.getBoundingClientRect();
      setDropdownPos({ top: rect.top, left: rect.left, width: rect.width });
    }
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const value = e.currentTarget.value;
    props.onChange(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const after = value.slice(lastAt + 1);
      if (!after.includes(' ') && !after.includes('\n')) {
        setMentionQuery(after);
        updateDropdownPos();
        setShowDropdown(true);
        return;
      }
    }
    setShowDropdown(false);
  };

  const selectAgent = (agent: AutopilotAgent) => {
    const val = props.value;
    const lastAt = val.lastIndexOf('@');
    const newValue = lastAt >= 0 ? val.slice(0, lastAt) + `@${agent.id} ` : val;
    props.onChange(newValue);
    setShowDropdown(false);
    inputRef?.focus();
  };

  const accentColor = () => props.isSoloMode ? 'var(--green-9)' : 'var(--purple-9)';

  return (
    <div class="flex-1 relative">
      <input
        ref={inputRef}
        value={props.value}
        onInput={handleInput}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setShowDropdown(false);
          if (e.key === 'Enter' && !e.shiftKey && !props.disabled) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
        disabled={props.disabled}
        placeholder={props.placeholder}
        class="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-[var(--dls-surface)] text-[var(--dls-text-primary)] transition-colors"
        style={{
          'border-color': 'var(--dls-border)',
          'box-shadow': 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = accentColor(); }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--dls-border)'; }}
      />

      <Show when={showDropdown() && filteredAgents().length > 0 && dropdownPos() !== null}>
        <Portal mount={document.body}>
          <div
            style={{
              position: 'fixed',
              bottom: `${window.innerHeight - dropdownPos()!.top + 6}px`,
              left: `${dropdownPos()!.left}px`,
              width: `${Math.max(dropdownPos()!.width, 260)}px`,
              background: 'var(--dls-surface)',
              border: '1px solid var(--dls-border)',
              'border-radius': '10px',
              'box-shadow': '0 -4px 20px rgba(0,0,0,0.15)',
              'z-index': '10000',
              overflow: 'hidden',
            }}
          >
            <div class="px-3 py-1.5 text-[11px] text-[var(--dls-text-muted)] border-b border-[var(--dls-border-light)]">
              直接调用 Agent（跳过 Orchestrator）
            </div>
            <For each={filteredAgents()}>
              {(agent) => (
                <button
                  class="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-[var(--dls-hover)] transition-colors"
                  onClick={() => selectAgent(agent)}
                >
                  <span class="text-lg">{agent.emoji}</span>
                  <div>
                    <div class="text-sm font-medium text-[var(--dls-text-primary)]">{agent.name}</div>
                    <div class="text-[11px] text-[var(--dls-text-muted)]">@{agent.id} · {agent.description}</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: AiMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是你的 AI 虚拟团队。我了解你的产品所有决策、技术笔记和用户洞察。\n\n你可以：\n· 直接提问（对话模式）\n· 切换「调度模式」让多个 AI Agent 并行执行任务\n· 输入 @ 直接呼叫特定 Agent',
  type: 'chat',
  ts: nowTimeStr(),
};

const QUICK_QUESTIONS_SOLO = ['今天先做什么？', '假设验证进展', '用户留存分析'];
const QUICK_QUESTIONS_TEAM = ['本迭代优先级？', '技术风险评估', '发布准备情况'];

// ─── 三点跳动加载动画 ───────────────────────────────────────────────────────────
const TypingDots: Component = () => (
  <span class="flex items-center gap-1.5 py-1" aria-label="AI 正在输入">
    <span class="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dls-text-muted)', animation: 'ai-bounce 1.4s ease-in-out 0s infinite' }} />
    <span class="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dls-text-muted)', animation: 'ai-bounce 1.4s ease-in-out 0.2s infinite' }} />
    <span class="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dls-text-muted)', animation: 'ai-bounce 1.4s ease-in-out 0.4s infinite' }} />
  </span>
);

// ─── 消息气泡组件（统一处理 user / assistant） ──────────────────────────────────
const MessageBubble: Component<{
  msg: AiMessage;
  accentColor: string;
  accentBg: string;
  agents: AutopilotAgent[];
  loading: boolean;
  onCopy?: (content: string) => void;
}> = (props) => {
  const isUser = () => props.msg.role === 'user';
  const isLoadingEmpty = () => props.loading && !props.msg.content && !isUser();
  const isStreaming = () => props.loading && !isUser();
  const bgClass = () => props.accentBg.split(' ')[0];
  const [copied, setCopied] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);

  const handleCopy = () => {
    // 复制纯文本（去掉 think 块）
    const parsed = parseThinkingContent(props.msg.content);
    const text = parsed.output || props.msg.content;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  // AI 普通消息渲染（chat 类型）
  const AiChatBubble = () => {
    const parsed = () => parseThinkingContent(props.msg.content);
    const thinkingStreaming = () => isStreaming() && !parsed().thinkingComplete;
    const outputStreaming = () => isStreaming() && parsed().thinkingComplete;

    return (
      <div
        class="ai-bubble px-4 py-3 text-sm bg-[var(--dls-surface)] border border-[var(--dls-border)] text-[var(--dls-text-primary)] rounded-2xl rounded-bl-sm shadow-sm"
        style={{ 'min-width': '60px', 'max-width': '100%' }}
      >
        {/* 空内容 loading 状态 */}
        <Show when={isLoadingEmpty()}>
          <TypingDots />
        </Show>

        {/* 有内容时渲染 */}
        <Show when={props.msg.content}>
          {/* 思考块 */}
          <Show when={parsed().thinking}>
            <ThinkingBlock
              content={parsed().thinking}
              complete={parsed().thinkingComplete}
              isStreaming={thinkingStreaming()}
            />
          </Show>

          {/* 主要输出内容 */}
          <Show when={parsed().output}>
            <MarkdownContent content={parsed().output} streaming={outputStreaming()} />
            <Show when={outputStreaming()}>
              <span class="streaming-cursor" />
            </Show>
          </Show>

          {/* 思考已完成但还没有 output 时，显示等待 dots */}
          <Show when={!parsed().output && parsed().thinkingComplete && isStreaming()}>
            <TypingDots />
          </Show>
        </Show>
      </div>
    );
  };

  return (
    <div
      class={`flex ${isUser() ? 'justify-end' : 'justify-start'} items-end gap-2.5`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* AI 头像（左侧） */}
      <Show when={!isUser()}>
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold shadow-sm"
          style={{ background: props.accentColor, 'min-width': '2rem' }}
        >
          AI
        </div>
      </Show>

      {/* 消息主体 */}
      <div class={`flex flex-col ${isUser() ? 'items-end' : 'items-start'} max-w-[84%]`}>

        {/* AI 消息 */}
        <Show when={!isUser()}>
          <Show
            when={props.msg.type === 'dispatch' && props.msg.dispatchState}
            fallback={
              <Show
                when={props.msg.type === 'direct-agent'}
                fallback={<AiChatBubble />}
              >
                <DirectAgentCard
                  agentName={props.msg.agentName ?? 'Agent'}
                  content={props.msg.content}
                  loading={isLoadingEmpty()}
                  agentColor={props.agents.find(a => props.msg.agentName?.includes(a.name))?.color}
                />
              </Show>
            }
          >
            <DispatchCard state={props.msg.dispatchState!} agents={props.agents} />
          </Show>
        </Show>

        {/* 用户消息 */}
        <Show when={isUser()}>
          <div
            class={`px-4 py-2.5 text-sm leading-relaxed text-white rounded-2xl rounded-tr-sm shadow-sm ${bgClass()}`}
            style={{ 'white-space': 'pre-wrap', 'word-break': 'break-word' }}
          >
            {props.msg.content}
          </div>
        </Show>

        {/* 时间戳 + 操作工具栏 */}
        <div class="flex items-center gap-2 mt-1.5 px-1">
          <Show when={props.msg.ts}>
            <span class="text-[10px] text-[var(--dls-text-muted)]">{props.msg.ts}</span>
          </Show>
          {/* 复制按钮（hover 时显示，AI 消息且有内容时） */}
          <Show when={!isUser() && props.msg.content && !isLoadingEmpty() && hovered()}>
            <button
              onClick={handleCopy}
              title={copied() ? '已复制' : '复制内容'}
              class="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-all"
              style={{
                color: copied() ? 'var(--green-9)' : 'var(--dls-text-muted)',
                background: 'var(--dls-hover)',
                border: '1px solid var(--dls-border)',
              }}
            >
              <Show when={copied()} fallback={<Copy size={9} />}>
                <Check size={9} />
              </Show>
              {copied() ? '已复制' : '复制'}
            </button>
          </Show>
        </div>
      </div>

      {/* 用户头像（右侧） */}
      <Show when={isUser()}>
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold shadow-sm"
          style={{ background: props.accentColor, 'min-width': '2rem' }}
        >
          我
        </div>
      </Show>
    </div>
  );
};

const AiChatDrawer: Component<AiChatDrawerProps> = (props) => {
  // ─── 拖拽调宽 ─────────────────────────────────────────────────────────────
  const DEFAULT_WIDTH = 440;
  const MIN_WIDTH = 380;
  const MAX_WIDTH = 900;
  const [drawerWidth, setDrawerWidth] = createSignal(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = createSignal(false);

  // ─── 自动滚动 ─────────────────────────────────────────────────────────────
  let msgListRef: HTMLDivElement | undefined;
  let msgEndRef: HTMLDivElement | undefined;

  const scrollToBottom = (smooth = true) => {
    if (msgEndRef) {
      msgEndRef.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'end' });
    } else if (msgListRef) {
      msgListRef.scrollTop = msgListRef.scrollHeight;
    }
  };

  const [messages, setMessages] = createSignal<AiMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [dispatchMode, setDispatchMode] = createSignal(false);

  // ─── 消息变化时自动滚动到底部 ─────────────────────────────────────────────
  createEffect(() => {
    // 订阅 messages 信号（含流式内容更新）
    const msgs = messages();
    void msgs;
    // 用 rAF 确保 DOM 已更新后再滚动
    requestAnimationFrame(() => scrollToBottom(loading()));
  });
  // 历史会话和消息折叠
  const [sessionHistory, setSessionHistory] = createSignal<SessionRecord[]>([]);
  const [showHistory, setShowHistory] = createSignal(false);
  const [historyExpanded, setHistoryExpanded] = createSignal(false);
  const [viewingSession, setViewingSession] = createSignal<SessionRecord | null>(null);

  // 加载持久化的历史会话（优先从 memory-store 加载，降级到 localStorage）
  onMount(async () => {
    const workDir = props.workDir;
    if (workDir) {
      try {
        const memIndex = await loadMemoryIndex(workDir);
        if (memIndex.sessions.length > 0) {
          setSessionHistory(memIndex.sessions.map(entry => ({
            id: entry.id,
            summary: entry.summary,
            messages: [], // 详情按需加载
            ts: entry.createdAt,
          })));
          return;
        }
      } catch { /* 降级到 localStorage */ }
    }
    // 降级：从 localStorage 加载（兼容旧数据）
    const persisted = loadLegacySessions();
    if (persisted.length > 0) {
      setSessionHistory(
        persisted.map(fromPersistedSession)
          .sort((a, b) => b.ts.localeCompare(a.ts))
      );
    }
  });

  // ─── 按需加载历史会话详情 ─────────────────────────────────────────
  const loadSessionDetail = async (session: SessionRecord) => {
    // 先设置当前查看的会话
    setViewingSession(session);

    if (session.messages.length > 0) return; // 已有消息，无需加载

    const workDir = props.workDir;
    if (!workDir) return;

    try {
      const detail = await loadMemorySession(workDir, session.id);
      if (detail && detail.messages.length > 0) {
        const loaded: SessionRecord = {
          ...session,
          messages: detail.messages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            type: (m.msgType as AiMessage['type']) ?? 'chat',
            agentName: m.agentName,
            ts: m.ts
              ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              : undefined,
          })),
        };
        setViewingSession(loaded);
        // 更新缓存
        setSessionHistory(prev => prev.map(s => s.id === session.id ? loaded : s));
      }
    } catch (e) {
      console.warn('[ai-chat-drawer] 加载会话详情失败:', e);
    }
  };

  // ─── 将历史会话恢复为活跃对话（可继续发消息）─────────────────────────
  const restoreAsActiveSession = (session: SessionRecord) => {
    if (session.messages.length === 0) return;
    // 将历史消息载入主消息列表
    setMessages(session.messages);
    // 关闭历史面板，回到对话界面
    setViewingSession(null);
    setShowHistory(false);
    setHistoryExpanded(false);
  };

  // ─── 工具权限请求队列 ──────────────────────────────────────────
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

  const agents = () => props.isSoloMode ? SOLO_AGENTS : TEAM_AGENTS;
  const accentColor = () => props.isSoloMode ? 'var(--green-9)' : 'var(--purple-9)';
  const accentBg = () => props.isSoloMode ? 'bg-[var(--green-9)] hover:bg-[var(--green-11)]' : 'bg-[var(--purple-9)] hover:bg-[var(--purple-10)]';
  const quickQuestions = () => props.isSoloMode ? QUICK_QUESTIONS_SOLO : QUICK_QUESTIONS_TEAM;

  const getModel = () => {
    const cfg = props.llmConfig;
    if (cfg.providerID && cfg.modelID && cfg.providerID !== 'custom') {
      return { providerID: cfg.providerID, modelID: cfg.modelID };
    }
    return undefined;
  };

  // ─── 归档当前会话 ─────────────────────────────────────────────
  const archiveCurrentSession = () => {
    const msgs = messages();
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;
    const first = userMsgs[0].content;
    const fallbackSummary = first.slice(0, 30) + (first.length > 30 ? '...' : '');
    const sessionId = genSessionId();
    const sessionTs = nowDateTimeStr();
    const session: SessionRecord = { id: sessionId, summary: fallbackSummary, messages: msgs, ts: sessionTs };
    setSessionHistory(prev => [session, ...prev]);

    // 持久化到 localStorage（降级兜底）
    appendLegacySession({
      id: session.id,
      summary: session.summary,
      ts: session.ts,
      messages: toPersistedMessages(session.messages),
    });

    // 异步持久化到 memory-store（新的统一存储）
    const workDir = props.workDir;
    if (workDir) {
      const memMessages: MemoryMessage[] = msgs.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        msgType: m.type,
        agentName: m.agentName,
        ts: m.ts ?? '',
      }));
      const memSession: MemorySession = {
        id: sessionId,
        type: 'chat',
        summary: fallbackSummary,
        tags: [],
        messages: memMessages,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      // 先存 fallback 摘要，再异步生成 AI 摘要更新
      void saveMemorySession(workDir, memSession).then(() => {
        // 异步生成 AI 摘要（不阻塞 UI）
        void generateSessionSummary(
          memMessages,
          props.callAgentFn as unknown as MemoryCallAgentFn,
        ).then(result => {
          if (result.summary) {
            memSession.summary = result.summary;
            memSession.tags = result.tags;
            memSession.updatedAt = nowISO();
            void saveMemorySession(workDir, memSession);
            // 更新 UI 中的摘要
            setSessionHistory(prev => prev.map(s =>
              s.id === sessionId ? { ...s, summary: result.summary } : s,
            ));
          }
        });
      });
    }
  };

  const startNewSession = () => {
    archiveCurrentSession();
    setMessages([WELCOME_MESSAGE]);
    setHistoryExpanded(false);
    setShowHistory(false);
    setViewingSession(null);
  };

  // ─── 普通对话发送 ──────────────────────────────────────────────────────────
  const sendChat = (q: string) => {
    const modeLabel = props.isSoloMode ? '独立开发者' : '企业团队';
    const systemPrompt = `你是「星静」智能研发平台的 AI 虚拟团队助手。\n当前模式：${modeLabel}\n当前产品：${props.currentProductName ?? '未选择产品'}\n\n请根据用户的问题提供专业、简洁的回答。如果涉及任务管理、产品规划、技术建议等，请结合当前角色给出具体可执行的建议。`;

    const msgId = genId();
    const msgTs = nowTimeStr();
    setMessages(prev => [...prev, {
      id: msgId, role: 'assistant', type: 'chat', content: '', ts: msgTs,
    }]);

    void props.callAgentFn({
      systemPrompt,
      userPrompt: q,
      title: `星静对话-${props.currentProductName ?? 'default'}`,
      model: getModel(),
      onPermissionAsked: handlePermissionAsked,
      onText: (text) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: text } : m));
      },
      onDone: () => {
        setLoading(false);
        // AI 回复完成后自动快照保存
        const snapshot = messages();
        const userMsgs = snapshot.filter(m => m.role === 'user');
        if (userMsgs.length > 0) {
          const first = userMsgs[0].content;
          const summary = first.slice(0, 30) + (first.length > 30 ? '...' : '');
          const sid = snapshot[0]?.id === 'welcome' ? (snapshot[1]?.id ?? 'cur') : snapshot[0].id;
          saveSessions([...loadLegacySessions().filter(s => s.id !== sid), {
            id: sid,
            summary,
            ts: nowDateTimeStr(),
            messages: toPersistedMessages(snapshot),
          }]);
        }
      },
      onError: () => {
        // 降级 mock 回复
        let reply = '';
        if (q.includes('优先') || q.includes('今天')) {
          reply = '根据你的任务列表和商业指标，今天最优先的 3 件事是：\n\n1. 🔴 修复 Editor 光标丢失 bug（5 位用户反馈，已拖 2 天）\n2. 🟡 回复 Product Hunt 8 条评论（趁热度在，及时转化）\n3. 🟡 开始邀请用户内测段落重写（本周最高优先级假设验证）';
        } else if (q.includes('重写') || q.includes('假设')) {
          reply = '段落重写功能假设（h1）当前状态：验证中\n\n验证方式：邀请 5 位活跃用户内测 Beta，观察 3 天使用频率。\n\n建议今天优先推进邀请内测（只需 1h）。';
        } else if (q.includes('用户') || q.includes('留存')) {
          reply = '根据知识库中的用户洞察：\n\n· 78% 的用户活跃时间在 20:00-23:00\n· Onboarding 第 3 步骤流失率 42%\n· 当前 7 日留存 68%，相对稳定但有提升空间。';
        } else {
          reply = '我已加载你的产品知识库、任务列表和用户反馈。请告诉我你想了解哪方面，我来帮你分析。';
        }
        const mockContent = `⚠️ OpenCode 未连接，使用本地知识库回复：\n\n${reply}`;
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: mockContent } : m
        ));
        setLoading(false);
        // mock 模式也要持久化历史（与 onDone 逻辑一致）
        const snapshot = messages();
        const userMsgs = snapshot.filter(m => m.role === 'user');
        if (userMsgs.length > 0) {
          const first = userMsgs[0].content;
          const summary = first.slice(0, 30) + (first.length > 30 ? '...' : '');
          const sid = snapshot[0]?.id === 'welcome' ? (snapshot[1]?.id ?? 'cur') : snapshot[0].id;
          saveSessions([...loadLegacySessions().filter(s => s.id !== sid), {
            id: sid,
            summary,
            ts: nowDateTimeStr(),
            messages: toPersistedMessages(snapshot),
          }]);
        }
      },
    }).catch(() => { setLoading(false); });
  };

  // ─── @mention 直接调用 ──────────────────────────────────────────────────────
  const sendDirectAgent = (agent: AutopilotAgent, prompt: string) => {
    const msgId = genId();
    setMessages(prev => [...prev, {
      id: msgId,
      role: 'assistant',
      type: 'direct-agent',
      content: '',
      agentName: `${agent.emoji} ${agent.name}`,
      ts: nowTimeStr(),
    }]);

    void runDirectAgent(agent, prompt, {
      workDir: props.workDir,
      model: getModel(),
      callAgentFn: (opts) => props.callAgentFn(opts),
      onPermissionAsked: handlePermissionAsked,
      onStream: (text) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: text } : m));
      },
      onDone: (fullText) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
        setLoading(false);
      },
      onError: (err) => {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: `执行失败：${err}` } : m
        ));
        setLoading(false);
      },
    }).catch(() => { setLoading(false); });
  };

  // ─── Orchestrator 两阶段调度 ───────────────────────────────────────────────
  const sendOrchestrated = (goal: string) => {
    const msgId = genId();
    const initState: DispatchState = {
      phase: 'orchestrating',
      orchestratorText: '',
      plan: [],
      agentStatuses: {},
      agentStreamTexts: {},
      progress: 0,
    };
    setMessages(prev => [...prev, {
      id: msgId, role: 'assistant', type: 'dispatch', content: '', dispatchState: initState, ts: nowTimeStr(),
    }]);

    const updateDispatch = (updater: (prev: DispatchState) => DispatchState) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.dispatchState) return m;
        return { ...m, dispatchState: updater(m.dispatchState) };
      }));
    };

    void runOrchestratedAutopilot(goal, {
      availableAgents: agents(),
      workDir: props.workDir,
      model: getModel(),
      callAgentFn: (opts) => props.callAgentFn(opts),
      onPermissionAsked: handlePermissionAsked,
      onOrchestrating: (text) => {
        updateDispatch(prev => ({ ...prev, orchestratorText: text, progress: 10 }));
      },
      onOrchestratorDone: (plan) => {
        const statuses: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => { statuses[agentId] = 'pending'; });
        updateDispatch(prev => ({
          ...prev,
          phase: 'executing',
          plan,
          agentStatuses: statuses,
          progress: 20,
        }));
      },
      onAgentStatus: (agentId, status) => {
        updateDispatch(prev => ({
          ...prev,
          agentStatuses: { ...prev.agentStatuses, [agentId]: status },
        }));
      },
      onAgentStream: (agentId, text) => {
        updateDispatch(prev => {
          const doneCount = Object.values(prev.agentStatuses).filter(s => s === 'done').length;
          return {
            ...prev,
            agentStreamTexts: { ...prev.agentStreamTexts, [agentId]: text },
            progress: 20 + Math.round((doneCount / Math.max(prev.plan.length, 1)) * 70),
          };
        });
      },
      onDirectAnswer: (text) => {
        // Orchestrator 直接回答（无调度计划）：将消息转换为普通对话气泡
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, type: 'chat', content: text } : m
        ));
        setLoading(false);
      },
      onDone: () => {
        updateDispatch(prev => ({ ...prev, phase: 'done', progress: 100 }));
        setLoading(false);
      },
      onError: (err) => {
        updateDispatch(prev => ({ ...prev, phase: 'error', error: err }));
        setLoading(false);
      },
    }).catch(() => { setLoading(false); });
  };

  // ─── 拖拽处理 ─────────────────────────────────────────────────────────────
  // 保存当前拖拽的清理函数引用，供 onCleanup 调用
  let cleanupResize: (() => void) | null = null;

  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = drawerWidth();
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // 向左拖 → delta 为正 → 宽度增大
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupResize = null;
    };

    cleanupResize = handleMouseUp;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // onCleanup 在组件初始化阶段注册，组件卸载时调用已保存的清理引用
  onCleanup(() => { cleanupResize?.(); });

  // 当 Drawer 关闭时（props.open 变为 false），立即清理拖拽状态
  // 防止拖拽中途关闭导致 body cursor/userSelect 样式残留
  createEffect(() => {
    if (!props.open) {
      cleanupResize?.();
    }
  });

  // ─── 统一发送入口 ──────────────────────────────────────────────────────────
  const handleSend = () => {
    const q = input().trim();
    if (!q || loading()) return;

    // 添加用户消息
    setMessages(prev => [...prev, { id: genId(), role: 'user', type: 'chat', content: q, ts: nowTimeStr() }]);
    setInput('');
    setLoading(true);

    // 路由：@mention > 调度模式 > 普通对话
    const { targetAgent, cleanText } = parseMention(q, agents());
    if (targetAgent) {
      sendDirectAgent(targetAgent, cleanText);
      return;
    }
    if (dispatchMode()) {
      sendOrchestrated(q);
      return;
    }
    sendChat(q);
  };

  return (
    <>
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div class="absolute inset-0 bg-black/20" onClick={props.onClose} />

        {/* Drawer */}
        <div
          class={`relative bg-[var(--dls-surface)] shadow-2xl flex flex-col h-full${isResizing() ? ' select-none' : ''}`}
          style={{ width: `${drawerWidth()}px` }}
        >
          {/* ── 左侧拖拽手柄 ── */}
          <div
            class="absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-10 group"
            onMouseDown={handleResizeStart}
          >
            <div
              class="h-full transition-all duration-150 mx-auto"
              style={{
                width: isResizing() ? '2px' : '1px',
                background: isResizing() ? accentColor() : 'var(--dls-border)',
                opacity: isResizing() ? '1' : '0.6',
              }}
            />
          </div>
          {/* ── Header ── */}
          <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--dls-border)] flex-shrink-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div style={{ color: accentColor() }}>
                <Bot size={16} />
              </div>
              <span class="font-semibold text-sm text-[var(--dls-text-primary)]">
                {showHistory() ? (viewingSession() ? viewingSession()!.summary.slice(0, 20) + '...' : '历史记录') : 'AI 虚拟团队'}
              </span>

              {/* OpenWork 连接状态 */}
              <Show when={!showHistory()}>
                <Show
                  when={props.openworkStatus !== 'disconnected'}
                  fallback={
                    <span class="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red-9)', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <WifiOff size={9} />
                      OpenWork 断开
                    </span>
                  }
                >
                  <span class="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: props.openworkStatus === 'connected' ? 'var(--dls-success-bg)' : 'rgba(245,158,11,0.1)',
                      color: props.openworkStatus === 'connected' ? 'var(--green-9)' : 'var(--amber-11)',
                      border: `1px solid ${props.openworkStatus === 'connected' ? 'var(--dls-success-border)' : 'rgba(245,158,11,0.3)'}`,
                    }}
                  >
                    <Wifi size={9} />
                    {props.openworkStatus === 'connected' ? 'OpenWork 已连接' : 'OpenWork 限制模式'}
                  </span>
                </Show>
              </Show>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              {/* 历史记录按钮 */}
              <button
                class={`p-1.5 rounded-lg transition-colors ${
                  showHistory()
                    ? 'bg-[var(--dls-hover)] text-[var(--dls-text-primary)]'
                    : 'text-[var(--dls-text-secondary)] hover:text-[var(--dls-text-primary)] hover:bg-[var(--dls-hover)]'
                }`}
                onClick={() => {
                  if (!showHistory()) {
                    // 打开历史面板时，从 localStorage 读取最新数据（onDone 只写 storage 不更新信号）
                    const persisted = loadLegacySessions();
                    setSessionHistory(
                      persisted.map(fromPersistedSession)
                        .sort((a, b) => b.ts.localeCompare(a.ts))
                    );
                  }
                  setShowHistory(v => !v);
                  setViewingSession(null);
                }}
                title="历史记录"
              >
                <History size={15} />
              </button>
              <button
                class="p-1.5 text-[var(--dls-text-secondary)] hover:text-[var(--dls-text-primary)] text-lg leading-none hover:bg-[var(--dls-hover)] rounded-lg"
                onClick={props.onClose}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── 模式切换栏（仅对话模式下显示） ── */}
          <Show when={!showHistory()}>
            <div class="px-4 py-2 border-b border-[var(--dls-border-light)] flex items-center gap-2 flex-shrink-0">
              <button
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !dispatchMode()
                    ? `text-white ${accentBg()}`
                    : 'bg-[var(--dls-hover)] text-[var(--dls-text-secondary)] hover:bg-[var(--dls-border-light)]'
                }`}
                onClick={() => setDispatchMode(false)}
                disabled={loading()}
              >
                <MessageSquare size={12} />
                对话模式
              </button>
              <button
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dispatchMode()
                    ? `text-white ${accentBg()}`
                    : 'bg-[var(--dls-hover)] text-[var(--dls-text-secondary)] hover:bg-[var(--dls-border-light)]'
                }`}
                onClick={() => setDispatchMode(true)}
                disabled={loading()}
              >
                <Zap size={12} />
                调度模式
              </button>
              <span class="text-[11px] text-[var(--dls-text-muted)] ml-auto">
                {dispatchMode() ? `${agents().length} 个 Agent 并行执行` : '输入 @ 直接召唤 Agent'}
              </span>
            </div>
          </Show>

          {/* ── 内容区域：历史列表 OR 对话界面 ── */}
          <Show when={showHistory()}>
            {/* 历史会话列表 */}
            <div class="flex-1 overflow-y-auto">
              <Show when={viewingSession()}>
                {/* 浏览某次历史会话 */}
                <div class="px-4 py-2 border-b border-[var(--dls-border)] flex items-center gap-2 justify-between">
                  <button
                    class="text-xs flex items-center gap-1 text-[var(--dls-text-secondary)] hover:text-[var(--dls-text-primary)] transition-colors"
                    onClick={() => setViewingSession(null)}
                  >
                    <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} />
                    返回历史记录
                  </button>
                  <Show when={viewingSession()!.messages.length > 0}>
                    <button
                      class={`text-xs px-3 py-1 rounded-lg text-white transition-colors ${accentBg()}`}
                      onClick={() => restoreAsActiveSession(viewingSession()!)}
                    >
                      继续对话
                    </button>
                  </Show>
                </div>
                <div class="p-4 flex flex-col gap-3">
                  <For each={viewingSession()!.messages}>
                    {(msg) => (
                      <MessageBubble msg={msg} accentColor={accentColor()} accentBg={accentBg()} agents={agents()} loading={false} />
                    )}
                  </For>
                </div>
              </Show>
              <Show when={!viewingSession()}>
                <Show
                  when={sessionHistory().length > 0}
                  fallback={
                    <div class="flex flex-col items-center justify-center h-full p-8 text-center">
                      <History size={32} class="mb-3 opacity-30 text-[var(--dls-text-muted)]" />
                      <div class="text-sm text-[var(--dls-text-secondary)]">暂无历史记录</div>
                      <div class="text-xs text-[var(--dls-text-muted)] mt-1">开始对话并开启新会话后，记录会保存在这里</div>
                    </div>
                  }
                >
                  <div class="p-3 flex flex-col">
                    <For each={sessionHistory()}>
                      {(session, idx) => (
                        <div>
                          <button
                            class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--dls-hover)] transition-colors"
                            onClick={() => loadSessionDetail(session)}
                          >
                            <div class="flex items-start gap-2">
                              <div class={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${idx() === 0 ? (props.isSoloMode ? 'bg-[var(--green-9)]' : 'bg-[var(--purple-9)]') : 'bg-[var(--dls-border)]'}`} />
                              <div class="flex-1 min-w-0">
                                <div class="text-sm text-[var(--dls-text-primary)] truncate">{session.summary}</div>
                                <div class="text-xs text-[var(--dls-text-muted)] mt-0.5">
                                  {session.ts} · {session.messages.filter(m => m.role === 'user').length} 条消息
                                </div>
                              </div>
                              <ChevronRight size={13} class="text-[var(--dls-text-muted)] mt-1 flex-shrink-0" />
                            </div>
                          </button>
                          <Show when={idx() < sessionHistory().length - 1}>
                            <div class="h-px bg-[var(--dls-border)] mx-3" />
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </Show>

          <Show when={!showHistory()}>
            {/* ── 消息列表 ── */}
            <div ref={msgListRef} class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

              {/* 欢迎消息（AI 头像 + 气泡） */}
              <Show when={messages().length > 0}>
                <MessageBubble
                  msg={messages()[0]}
                  accentColor={accentColor()}
                  accentBg={accentBg()}
                  agents={agents()}
                  loading={false}
                />
              </Show>

              {/* 历史消息折叠区（欢迎消息后、最后2条前） */}
              <Show when={messages().slice(1, -2).length > 0}>
                <Show
                  when={historyExpanded()}
                  fallback={
                    <button
                      class="text-xs py-2 px-3 rounded-lg bg-[var(--dls-hover)] text-[var(--dls-text-secondary)] hover:bg-[var(--dls-border-light)] transition-colors text-center"
                      onClick={() => setHistoryExpanded(true)}
                    >
                      ∨ 查看之前的 {messages().slice(1, -2).length} 条消息
                    </button>
                  }
                >
                  <For each={messages().slice(1, -2)}>
                    {(msg) => <MessageBubble msg={msg} accentColor={accentColor()} accentBg={accentBg()} agents={agents()} loading={false} />}
                  </For>
                  <button
                    class="text-xs text-center text-[var(--dls-text-muted)] hover:text-[var(--dls-text-secondary)] py-1 transition-colors"
                    onClick={() => setHistoryExpanded(false)}
                  >
                    ∧ 收起
                  </button>
                </Show>
              </Show>

              {/* 当前对话分隔线 */}
              <Show when={messages().length > 3}>
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-px bg-[var(--dls-border-light)]" />
                  <span class="text-[10px] text-[var(--dls-text-muted)] px-2">当前对话</span>
                  <div class="flex-1 h-px bg-[var(--dls-border-light)]" />
                </div>
              </Show>

              {/* 最新 2 条消息（user + assistant） */}
              <For each={messages().length > 1 ? messages().slice(-2) : []}>
                {(msg) => <MessageBubble msg={msg} accentColor={accentColor()} accentBg={accentBg()} agents={agents()} loading={loading()} />}
              </For>

              {/* 滚动锚点 */}
              <div ref={msgEndRef} style={{ height: '1px', 'flex-shrink': '0' }} />
            </div>

            {/* ── 快捷问题 + 新对话 ── */}
            <div class="px-4 py-2 border-t border-[var(--dls-border-light)] flex flex-wrap gap-2 flex-shrink-0">
              <For each={quickQuestions()}>
                {(q) => (
                  <button
                    class="text-xs px-3 py-1 bg-[var(--dls-hover)] hover:bg-[var(--dls-border-light)] rounded-full border border-[var(--dls-border)] transition-colors text-[var(--dls-text-secondary)]"
                    disabled={loading()}
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </button>
                )}
              </For>
              {/* 新对话按钮 */}
              <Show when={messages().filter(m => m.role === 'user').length > 0}>
                <button
                  class="text-xs px-3 py-1 rounded-full border border-[var(--dls-border)] transition-colors text-[var(--dls-text-muted)] hover:text-[var(--dls-text-secondary)] hover:bg-[var(--dls-hover)] ml-auto"
                  disabled={loading()}
                  onClick={startNewSession}
                >
                  + 新对话
                </button>
              </Show>
            </div>

            {/* ── 输入区 ── */}
            <div class="px-3 pt-2 pb-1 flex-shrink-0 border-t border-[var(--dls-border)]">
              <div class="flex gap-2">
                <DrawerMentionInput
                  value={input()}
                  onChange={setInput}
                  disabled={loading() || props.openworkStatus === 'disconnected'}
                  placeholder={
                    props.openworkStatus === 'disconnected'
                      ? 'OpenWork 服务未连接，AI 功能暂不可用'
                      : loading()
                        ? 'AI 正在回复中...'
                        : dispatchMode()
                          ? '描述目标，让 AI 团队并行执行... (Enter 发送)'
                          : '问我任何问题，@ 召唤 Agent... (Enter 发送)'
                  }
                  agents={agents()}
                  onSubmit={handleSend}
                  isSoloMode={props.isSoloMode}
                />
              <button
                onClick={handleSend}
                disabled={loading() || !input().trim() || props.openworkStatus === 'disconnected'}
                class={`flex-shrink-0 rounded-lg px-3 py-2 text-sm transition-colors text-white disabled:opacity-50 ${accentBg()}`}
                title="发送 (Enter)"
              >
                <Show when={loading()} fallback="→">
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                </Show>
              </button>
              </div>
              {/* 快捷键提示 */}
              <div class="flex items-center justify-between mt-1 pb-1">
                <span class="text-[10px] text-[var(--dls-text-muted)]">
                  Enter 发送 · @ 召唤 Agent · Shift+Enter 换行
                </span>
                <Show when={messages().filter(m => m.role === 'user').length > 0}>
                  <button
                    class="text-[10px] text-[var(--dls-text-muted)] hover:text-[var(--dls-text-secondary)] transition-colors"
                    disabled={loading()}
                    onClick={startNewSession}
                  >
                    + 新对话
                  </button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>

      {/* 工具权限授权对话框 */}
      <Show when={permissionQueue()[0]} keyed>
        {(req) => (
          <PermissionDialog
            request={req}
            onResolve={handlePermissionResolve}
          />
        )}
      </Show>
    </>
  );
};

export default AiChatDrawer;
