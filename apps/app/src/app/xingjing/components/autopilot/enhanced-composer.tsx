/**
 * EnhancedComposer — Claude Cowork 风格的增强输入组件
 *
 * 功能：
 * 1. 自动高度自适应 textarea（支持 Shift+Enter 换行，Enter 发送）
 * 2. @mention Agent 弹出选择器（接入已有 MentionInput 逻辑）
 * 3. /slash 命令面板（快速触发 OpenWork 能力）
 * 4. 能力徽标区：显示已接入的 MCP / 知识库 / 技能数量
 * 5. 底部工具栏：模型选择器 + 发送 / 停止按钮
 * 6. 附件按钮（可扩展，当前为 UI 占位）
 */
import {
  createSignal,
  createEffect,
  Show,
  For,
  onMount,
  onCleanup,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  Send,
  Square,
  Paperclip,
  Zap,
  Brain,
  Wrench,
  BookOpen,
  ChevronDown,
  AtSign,
  Command,
} from 'lucide-solid';
import type { AutopilotAgent } from '../../services/autopilot-executor';
import { themeColors, chartColors } from '../../utils/colors';
import { modelOptions } from '../../mock/settings';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: (text: string) => void;
}

export interface CapabilityBadge {
  type: 'mcp' | 'skill' | 'knowledge' | 'command';
  count: number;
  label: string;
}

export interface EnhancedComposerProps {
  /** 当前输入值 */
  value: string;
  onChange: (v: string) => void;
  /** 是否处于运行中（禁用发送） */
  isRunning: boolean;
  /** 是否有活跃 session（已经在对话中） */
  hasSession: boolean;
  /** 可用 Agent 列表（用于 @mention） */
  agents: AutopilotAgent[];
  /** 已配置的模型列表 */
  configuredModels: Array<{ modelID: string; label: string; providerID: string }>;
  /** 当前选中的模型 ID */
  selectedModelId: string;
  onModelChange: (id: string) => void;
  /** 发送 / 启动 */
  onSubmit: () => void;
  /** 停止当前执行 */
  onStop?: () => void;
  /** 重置对话 */
  onReset?: () => void;
  /** 当前模式：chat（普通对话）| dispatch（团队调度） */
  mode: 'chat' | 'dispatch';
  onModeChange: (mode: 'chat' | 'dispatch') => void;
  /** 能力概览徽标 */
  capabilities?: CapabilityBadge[];
  /** 斜杠命令 */
  slashCommands?: SlashCommand[];
  /** 知识健康度分数（0-100） */
  knowledgeScore?: number | null;
  /** 占位提示 */
  placeholder?: string;
}

// ─── 斜杠命令面板 ──────────────────────────────────────────────────────────────

const SlashCommandPanel = (props: {
  commands: SlashCommand[];
  query: string;
  anchorRect: DOMRect | null;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}) => {
  const filtered = () => {
    const q = props.query.toLowerCase();
    return props.commands.filter(
      (c) => c.id.includes(q) || c.label.toLowerCase().includes(q),
    );
  };

  return (
    <Show when={props.anchorRect && filtered().length > 0}>
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: `${props.anchorRect!.left}px`,
            bottom: `${window.innerHeight - props.anchorRect!.top + 6}px`,
            width: `${Math.min(props.anchorRect!.width, 360)}px`,
            'z-index': '500',
            background: themeColors.surface,
            border: `1px solid ${themeColors.border}`,
            'border-radius': '10px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            'font-size': '10px',
            'font-weight': '600',
            color: themeColors.textMuted,
            'letter-spacing': '0.5px',
            'text-transform': 'uppercase',
            'border-bottom': `1px solid ${themeColors.border}`,
          }}>
            命令
          </div>
          <For each={filtered()}>
            {(cmd) => (
              <button
                onClick={() => props.onSelect(cmd)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  'text-align': 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ 'font-size': '16px', 'flex-shrink': '0' }}>{cmd.icon}</span>
                <div style={{ flex: '1', 'min-width': '0' }}>
                  <div style={{ 'font-size': '13px', 'font-weight': '500', color: themeColors.text }}>
                    /{cmd.id}
                  </div>
                  <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '1px' }}>
                    {cmd.description}
                  </div>
                </div>
              </button>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
};

// ─── @Mention 面板 ─────────────────────────────────────────────────────────────

const MentionPanel = (props: {
  agents: AutopilotAgent[];
  query: string;
  anchorRect: DOMRect | null;
  onSelect: (agent: AutopilotAgent) => void;
}) => {
  const filtered = () => {
    const q = props.query.toLowerCase();
    return props.agents.filter(
      (a) => a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  };

  return (
    <Show when={props.anchorRect && filtered().length > 0}>
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: `${props.anchorRect!.left}px`,
            bottom: `${window.innerHeight - props.anchorRect!.top + 6}px`,
            width: `${Math.min(props.anchorRect!.width, 280)}px`,
            'z-index': '500',
            background: themeColors.surface,
            border: `1px solid ${themeColors.border}`,
            'border-radius': '10px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            'font-size': '10px',
            'font-weight': '600',
            color: themeColors.textMuted,
            'letter-spacing': '0.5px',
            'text-transform': 'uppercase',
            'border-bottom': `1px solid ${themeColors.border}`,
          }}>
            选择 Agent
          </div>
          <For each={filtered()}>
            {(agent) => (
              <button
                onClick={() => props.onSelect(agent)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  'text-align': 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <div style={{
                  width: '28px', height: '28px', 'border-radius': '8px',
                  background: agent.bgColor, display: 'flex',
                  'align-items': 'center', 'justify-content': 'center', 'font-size': '14px', 'flex-shrink': '0',
                }}>
                  {agent.emoji}
                </div>
                <div>
                  <div style={{ 'font-size': '13px', 'font-weight': '500', color: themeColors.text }}>{agent.name}</div>
                  <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>{agent.description.slice(0, 32)}…</div>
                </div>
              </button>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
};

// ─── 能力徽标 ──────────────────────────────────────────────────────────────────

const CapabilityChip = (props: { badge: CapabilityBadge }) => {
  const iconMap: Record<string, any> = {
    mcp: Wrench,
    skill: Brain,
    knowledge: BookOpen,
    command: Command,
  };
  const colorMap: Record<string, string> = {
    mcp: chartColors.primary,
    skill: '#722ed1',
    knowledge: '#08979c',
    command: '#d46b08',
  };
  const Icon = iconMap[props.badge.type] ?? Zap;
  const color = colorMap[props.badge.type] ?? themeColors.textMuted;

  return (
    <div
      title={`${props.badge.count} 个${props.badge.label}已接入`}
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '3px',
        padding: '2px 7px',
        'border-radius': '9999px',
        'font-size': '11px',
        'font-weight': '500',
        color,
        background: color + '15',
        border: `1px solid ${color}30`,
        cursor: 'default',
        'flex-shrink': '0',
      }}
    >
      <Icon size={10} />
      <span>{props.badge.count}</span>
    </div>
  );
};

// ─── 模式切换按钮 ──────────────────────────────────────────────────────────────

const ModeToggle = (props: {
  mode: 'chat' | 'dispatch';
  onChange: (m: 'chat' | 'dispatch') => void;
}) => (
  <div style={{
    display: 'inline-flex',
    border: `1px solid ${themeColors.border}`,
    'border-radius': '7px',
    overflow: 'hidden',
    'flex-shrink': '0',
  }}>
    {(['chat', 'dispatch'] as const).map((m) => (
      <button
        onClick={() => props.onChange(m)}
        style={{
          padding: '3px 10px',
          'font-size': '11px',
          'font-weight': props.mode === m ? '600' : '400',
          border: 'none',
          cursor: 'pointer',
          background: props.mode === m ? chartColors.success : 'transparent',
          color: props.mode === m ? 'white' : themeColors.textMuted,
          transition: 'all 0.15s',
        }}
      >
        {m === 'chat' ? '💬 对话' : '🚀 团队'}
      </button>
    ))}
  </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function EnhancedComposer(props: EnhancedComposerProps) {
  let textareaRef: HTMLTextAreaElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [slashQuery, setSlashQuery] = createSignal('');
  const [showMention, setShowMention] = createSignal(false);
  const [showSlash, setShowSlash] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);

  // 自动高度调整
  const autoResize = () => {
    const el = textareaRef;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 200;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  };

  createEffect(() => {
    props.value; // track
    autoResize();
  });

  onMount(() => { autoResize(); });

  // 更新弹出面板的锚点位置
  const updateAnchor = () => {
    if (containerRef) {
      setAnchorRect(containerRef.getBoundingClientRect());
    }
  };

  const handleInput = (e: Event) => {
    const val = (e.currentTarget as HTMLTextAreaElement).value;
    props.onChange(val);

    const lastAt = val.lastIndexOf('@');
    const lastSlash = val.lastIndexOf('/');
    const cursor = (e.currentTarget as HTMLTextAreaElement).selectionStart ?? val.length;

    // @mention 检测
    if (lastAt >= 0 && lastAt < cursor) {
      const after = val.slice(lastAt + 1, cursor);
      if (!after.includes(' ') && !after.includes('\n')) {
        setMentionQuery(after);
        updateAnchor();
        setShowMention(true);
        setShowSlash(false);
        return;
      }
    }

    // /slash 检测（仅行首）
    const lineStart = val.lastIndexOf('\n', cursor - 1) + 1;
    if (lastSlash >= lineStart && lastSlash < cursor) {
      const after = val.slice(lastSlash + 1, cursor);
      if (!after.includes(' ') && !after.includes('\n')) {
        setSlashQuery(after);
        updateAnchor();
        setShowSlash(true);
        setShowMention(false);
        return;
      }
    }

    setShowMention(false);
    setShowSlash(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showMention() || showSlash()) {
      if (e.key === 'Escape') {
        setShowMention(false);
        setShowSlash(false);
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!props.isRunning && props.value.trim()) {
        props.onSubmit();
      }
    }
  };

  const selectAgent = (agent: AutopilotAgent) => {
    const val = props.value;
    const lastAt = val.lastIndexOf('@');
    const newVal = lastAt >= 0 ? val.slice(0, lastAt) + `@${agent.id} ` : val;
    props.onChange(newVal);
    setShowMention(false);
    textareaRef?.focus();
  };

  const selectSlashCommand = (cmd: SlashCommand) => {
    const val = props.value;
    const lastSlash = val.lastIndexOf('/');
    const newVal = lastSlash >= 0 ? val.slice(0, lastSlash) : val;
    props.onChange(newVal);
    setShowSlash(false);
    textareaRef?.focus();
    cmd.action(newVal);
  };

  const placeholder = () => props.placeholder ?? (
    props.mode === 'dispatch'
      ? '描述你的目标，AI 虚拟团队并行执行... (Enter 发送，Shift+Enter 换行)'
      : '问我任何问题，或输入 @ 召唤 Agent... (Enter 发送，Shift+Enter 换行)'
  );

  const canSend = () => !props.isRunning && props.value.trim().length > 0;

  // 知识库分数颜色
  const scoreColor = () => {
    const s = props.knowledgeScore;
    if (s === null || s === undefined) return themeColors.textMuted;
    if (s >= 80) return chartColors.success;
    if (s >= 50) return '#fa8c16';
    return chartColors.error;
  };

  return (
    <div
      ref={containerRef}
      style={{
        border: `1.5px solid ${isFocused() ? chartColors.success + 'aa' : themeColors.border}`,
        'border-radius': '12px',
        background: themeColors.surface,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        'box-shadow': isFocused() ? `0 0 0 3px ${chartColors.success}18` : 'none',
        overflow: 'hidden',
      }}
    >
      {/* ── 顶部能力条 ── */}
      <Show when={(props.capabilities && props.capabilities.length > 0) || props.knowledgeScore !== null}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: '6px 12px 0',
          'flex-wrap': 'wrap',
        }}>
          {/* 知识健康度 */}
          <Show when={props.knowledgeScore !== null && props.knowledgeScore !== undefined}>
            <div style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '3px',
              'font-size': '10px',
              'font-weight': '600',
              color: scoreColor(),
            }}>
              🧠 知识库 {props.knowledgeScore}分
            </div>
          </Show>

          <For each={props.capabilities ?? []}>
            {(badge) => <CapabilityChip badge={badge} />}
          </For>
        </div>
      </Show>

      {/* ── 文本输入区 ── */}
      <textarea
        ref={textareaRef}
        value={props.value}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={props.isRunning}
        placeholder={placeholder()}
        rows={2}
        style={{
          display: 'block',
          width: '100%',
          'min-height': '64px',
          'max-height': '200px',
          'font-size': '14px',
          'line-height': '1.6',
          padding: '10px 14px 0',
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          color: themeColors.text,
          'font-family': 'inherit',
          'box-sizing': 'border-box',
        }}
      />

      {/* ── 底部工具栏 ── */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '6px 10px 8px',
        gap: '8px',
      }}>
        {/* 左侧工具 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          {/* 模式切换 */}
          <ModeToggle mode={props.mode} onChange={props.onModeChange} />

          {/* @mention 提示按钮 */}
          <button
            title="@mention Agent"
            onClick={() => {
              const cur = props.value;
              props.onChange(cur + '@');
              textareaRef?.focus();
              updateAnchor();
              setShowMention(true);
            }}
            style={{
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              width: '26px', height: '26px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent', cursor: 'pointer', color: themeColors.textMuted,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <AtSign size={12} />
          </button>

          {/* 附件（UI 占位） */}
          <button
            title="附件（即将推出）"
            style={{
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              width: '26px', height: '26px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent', cursor: 'not-allowed', color: themeColors.textMuted,
              opacity: '0.5',
            }}
          >
            <Paperclip size={12} />
          </button>

          {/* 模型选择器 */}
          <Show
            when={props.configuredModels.length > 0}
            fallback={
              <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>未配置模型</span>
            }
          >
            <div style={{ position: 'relative', display: 'inline-flex', 'align-items': 'center' }}>
              <select
                value={props.selectedModelId}
                onChange={(e) => props.onModelChange(e.currentTarget.value)}
                disabled={props.isRunning}
                style={{
                  'font-size': '11px',
                  'font-weight': '500',
                  padding: '3px 20px 3px 8px',
                  'border-radius': '6px',
                  border: `1px solid ${themeColors.border}`,
                  background: themeColors.bgSubtle,
                  color: themeColors.text,
                  cursor: props.isRunning ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  appearance: 'none',
                }}
              >
                <For each={props.configuredModels}>
                  {(opt) => <option value={opt.modelID}>{opt.label}</option>}
                </For>
              </select>
              <ChevronDown
                size={10}
                style={{
                  position: 'absolute', right: '5px',
                  'pointer-events': 'none', color: themeColors.textMuted,
                }}
              />
            </div>
          </Show>
        </div>

        {/* 右侧按钮 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          {/* 重置按钮（有 session 时才显示） */}
          <Show when={props.hasSession && props.onReset}>
            <button
              onClick={props.onReset}
              disabled={props.isRunning}
              title="重置对话"
              style={{
                padding: '4px 10px',
                'font-size': '11px',
                'border-radius': '6px',
                border: `1px solid ${themeColors.border}`,
                background: 'transparent',
                color: themeColors.textMuted,
                cursor: props.isRunning ? 'not-allowed' : 'pointer',
                opacity: props.isRunning ? 0.5 : 1,
              }}
            >
              重置
            </button>
          </Show>

          {/* 停止 / 发送 */}
          <Show
            when={!props.isRunning}
            fallback={
              <button
                onClick={props.onStop}
                title="停止执行"
                style={{
                  display: 'flex', 'align-items': 'center', gap: '5px',
                  padding: '5px 12px', 'border-radius': '7px', border: 'none',
                  background: '#ff4d4f', color: 'white', cursor: 'pointer',
                  'font-size': '12px', 'font-weight': '600',
                  animation: 'composerPulse 1.5s ease-in-out infinite',
                }}
              >
                <Square size={12} />
                停止
              </button>
            }
          >
            <button
              onClick={props.onSubmit}
              disabled={!canSend()}
              title="发送 (Enter)"
              style={{
                display: 'flex', 'align-items': 'center', gap: '5px',
                padding: '5px 14px', 'border-radius': '7px', border: 'none',
                background: canSend() ? chartColors.success : themeColors.border,
                color: canSend() ? 'white' : themeColors.textMuted,
                cursor: canSend() ? 'pointer' : 'not-allowed',
                'font-size': '12px', 'font-weight': '600',
                transition: 'background 0.2s',
              }}
            >
              <Send size={12} />
              {props.hasSession ? '发送' : (props.mode === 'dispatch' ? '启动团队' : '发送')}
            </button>
          </Show>
        </div>
      </div>

      {/* ── 弹出面板 ── */}
      <MentionPanel
        agents={props.agents}
        query={mentionQuery()}
        anchorRect={showMention() ? anchorRect() : null}
        onSelect={selectAgent}
      />

      <Show when={props.slashCommands && props.slashCommands.length > 0}>
        <SlashCommandPanel
          commands={props.slashCommands!}
          query={slashQuery()}
          anchorRect={showSlash() ? anchorRect() : null}
          onSelect={selectSlashCommand}
          onClose={() => setShowSlash(false)}
        />
      </Show>

      <style>{`
        @keyframes composerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}
