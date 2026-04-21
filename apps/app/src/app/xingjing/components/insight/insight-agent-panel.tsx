/**
 * 产品洞察 Agent 面板
 *
 * 包含：
 *   - 模式切换 Tab（研究 / 记录 / 生成 / 对话）
 *   - 对话线程（消息气泡 + 工具调用步骤卡片 + 假设草稿卡片）
 *   - 快捷提示词芯片
 *   - 输入框
 */
import { Component, createSignal, createEffect, For, Show, onCleanup } from 'solid-js';
import type { InsightMode, InsightRunOpts } from '../../services/insight-executor';
import {
  runInsightAgent,
  detectInsightMode,
  generateQuickPrompts,
  parseHypothesisFromOutput,
  parseRequirementFromOutput,
} from '../../services/insight-executor';
import type { CallAgentOptions } from '../../services/opencode-client';
import type { Hypothesis } from '../../mock/solo';
import type { RequirementOutput } from '../../mock/solo';
import type { InsightRecord, ProductSuggestion } from '../../services/insight-store';
import type { SkillApiAdapter } from '../../services/knowledge-behavior';
import { themeColors, chartColors } from '../../utils/colors';
import ToolCallStepCard, { type ToolCallStep } from './tool-call-step-card';
import HypothesisDraftCard from './hypothesis-draft-card';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolSteps?: ToolCallStep[];
  hypothesisDraft?: Hypothesis;
  requirementDraft?: RequirementOutput;
  insightRecord?: InsightRecord;
  mode: InsightMode;
}

interface InsightAgentPanelProps {
  callAgentFn: (opts: CallAgentOptions) => Promise<void>;
  productContext?: string;
  productName?: string;
  workDir: string;
  /** OpenWork Skill API 适配器（用于 record 模式的 Skill 注入） */
  skillApi?: SkillApiAdapter | null;
  onHypothesisSave: (h: Hypothesis) => void;
  onRequirementSave: (r: RequirementOutput) => void;
  onInsightRecord: (r: InsightRecord) => void;
}

// ─── 模式配置 ─────────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<InsightMode, { label: string; emoji: string; desc: string; color: string }> = {
  research: { label: '研究',  emoji: '🔍', desc: '搜索竞品/市场/趋势', color: '#1677ff' },
  record:   { label: '记录',  emoji: '📋', desc: '结构化记录假设',      color: '#722ed1' },
  generate: { label: '生成',  emoji: '📄', desc: '输出需求文档',        color: '#389e0d' },
  chat:     { label: '对话',  emoji: '💬', desc: '产品策略讨论',        color: '#595959' },
  auto:     { label: '自动',  emoji: '✨', desc: '',                    color: '#1677ff' },
};

const MODES: InsightMode[] = ['research', 'record', 'generate', 'chat'];

// ─── 主组件 ────────────────────────────────────────────────────────────────────

export const InsightAgentPanel: Component<InsightAgentPanelProps> = (props) => {
  const [mode, setMode] = createSignal<InsightMode>('auto');
  const [messages, setMessages] = createSignal<AgentMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  let scrollRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(saveTimeout));

  // 自动滚动到底部
  createEffect(() => {
    messages(); // track
    requestAnimationFrame(() => {
      if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
    });
  });

  const quickPrompts = () => generateQuickPrompts(
    props.productName,
    mode() === 'auto' ? undefined : mode(),
  );

  const effectiveMode = () => mode() === 'auto' ? detectInsightMode(input()) : mode();

  // ── 发送消息 ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input().trim();
    if (!text || loading()) return;
    setInput('');

    const userMsg: AgentMessage = {
      id: `u-${Date.now()}`, role: 'user', content: text, mode: effectiveMode(),
    };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: AgentMessage = {
      id: assistantMsgId, role: 'assistant', content: '',
      isStreaming: true, toolSteps: [], mode: effectiveMode(),
    };
    setMessages(prev => [...prev, assistantMsg]);
    setLoading(true);

    // 追踪工具步骤（本地 Map）
    const stepTimers = new Map<string, number>(); // stepId → startedAt

    const updateAssistant = (updater: (msg: AgentMessage) => AgentMessage) => {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? updater(m) : m));
    };

    await runInsightAgent(text, {
      workDir: props.workDir,
      mode: mode() === 'auto' ? undefined : mode(),
      callAgentFn: props.callAgentFn,
      productContext: props.productContext,
      skillApi: props.skillApi ?? null,
      onModeDetected: (detectedMode) => {
        updateAssistant(m => ({ ...m, mode: detectedMode }));
      },
      onToolStep: (step) => {
        stepTimers.set(step.id, step.startedAt);
        updateAssistant(m => ({
          ...m,
          toolSteps: [...(m.toolSteps ?? []), step],
        }));
      },
      onToolStepDone: (stepId, detail, sources) => {
        const startedAt = stepTimers.get(stepId) ?? Date.now();
        const duration = Date.now() - startedAt;
        updateAssistant(m => ({
          ...m,
          toolSteps: (m.toolSteps ?? []).map(s =>
            s.id === stepId ? { ...s, status: 'done' as const, detail, sources, duration } : s
          ),
        }));
      },
      onStream: (text) => {
        updateAssistant(m => ({ ...m, content: text, isStreaming: true }));
      },
      onHypothesisDraft: (h) => {
        updateAssistant(m => ({ ...m, hypothesisDraft: h }));
      },
      onRequirementDraft: (r) => {
        updateAssistant(m => ({ ...m, requirementDraft: r }));
      },
      onInsightRecord: (record) => {
        updateAssistant(m => ({ ...m, insightRecord: record }));
        props.onInsightRecord(record);
      },
      onDone: (fullText) => {
        updateAssistant(m => ({ ...m, content: fullText, isStreaming: false }));
        setLoading(false);
      },
      onError: (err) => {
        updateAssistant(m => ({
          ...m,
          content: `[调用失败] ${err}\n\n请检查 AI 服务是否正常，或切换到对话模式继续。`,
          isStreaming: false,
        }));
        setLoading(false);
      },
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleQuickPrompt = (text: string, promptMode: InsightMode) => {
    setMode(promptMode);
    setInput(text);
    inputRef?.focus();
  };

  const activeModeColor = () => MODE_CONFIG[mode()]?.color ?? '#1677ff';

  return (
    <div style={{
      display: 'flex', 'flex-direction': 'column', height: '100%',
      background: 'white', 'border-left': `1px solid ${themeColors.border}`,
    }}>
      {/* ── 模式选择 Tab ── */}
      <div style={{
        'flex-shrink': 0, padding: '12px 14px 0',
        'border-bottom': `1px solid ${themeColors.border}`,
      }}>
        <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted,
          'margin-bottom': '8px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px' }}>
          产品洞察 Agent
        </div>
        <div style={{ display: 'flex', gap: '4px', 'margin-bottom': '12px' }}>
          {/* Auto 模式 */}
          <button
            onClick={() => setMode('auto')}
            style={{
              padding: '4px 10px', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer',
              border: mode() === 'auto' ? `1px solid #1677ff` : `1px solid ${themeColors.border}`,
              background: mode() === 'auto' ? '#e6f4ff' : 'white',
              color: mode() === 'auto' ? '#1677ff' : themeColors.textSecondary,
              'font-weight': mode() === 'auto' ? 600 : 400,
            }}
          >
            ✨ 自动
          </button>
          <For each={MODES}>
            {(m) => {
              const cfg = MODE_CONFIG[m];
              const isActive = () => mode() === m;
              return (
                <button
                  onClick={() => setMode(m)}
                  title={cfg.desc}
                  style={{
                    padding: '4px 10px', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer',
                    border: isActive() ? `1px solid ${cfg.color}` : `1px solid ${themeColors.border}`,
                    background: isActive() ? `${cfg.color}18` : 'white',
                    color: isActive() ? cfg.color : themeColors.textSecondary,
                    'font-weight': isActive() ? 600 : 400,
                  }}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* ── 对话线程 ── */}
      <div ref={scrollRef} style={{ flex: 1, 'overflow-y': 'auto', padding: '12px 14px' }}>
        {/* 空状态 */}
        <Show when={messages().length === 0}>
          <div style={{ padding: '24px 0', 'text-align': 'center', color: themeColors.textMuted }}>
            <div style={{ 'font-size': '28px', 'margin-bottom': '10px' }}>
              {MODE_CONFIG[mode() === 'auto' ? 'research' : mode()]?.emoji ?? '✨'}
            </div>
            <div style={{ 'font-size': '13px', 'font-weight': 500, color: themeColors.textSecondary, 'margin-bottom': '6px' }}>
              {mode() === 'auto' ? '产品洞察 Agent 就绪' : MODE_CONFIG[mode()]?.desc}
            </div>
            <div style={{ 'font-size': '12px' }}>
              {mode() === 'research' && '我会主动搜索互联网，获取最新竞品和市场信息'}
              {mode() === 'record' && '描述你的想法或用户反馈，我帮你结构化记录'}
              {mode() === 'generate' && '告诉我要生成哪个功能模块的需求文档'}
              {mode() === 'chat' && '关于产品的任何问题，我都来聊'}
              {mode() === 'auto' && '描述你的问题，我会自动选择最合适的模式'}
            </div>
          </div>
        </Show>

        {/* 消息列表 */}
        <For each={messages()}>
          {(msg) => (
            <div style={{ 'margin-bottom': '16px' }}>
              {/* 用户消息 */}
              <Show when={msg.role === 'user'}>
                <div style={{ display: 'flex', 'justify-content': 'flex-end' }}>
                  <div style={{ 'max-width': '85%', display: 'flex', gap: '8px', 'flex-direction': 'row-reverse', 'align-items': 'flex-start' }}>
                    <div style={{
                      width: '26px', height: '26px', 'border-radius': '50%', 'flex-shrink': 0,
                      background: chartColors.primary, display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                      color: 'white', 'font-size': '11px', 'font-weight': 700,
                    }}>我</div>
                    <div style={{
                      background: '#dcf8e8', padding: '8px 11px',
                      'border-radius': '12px 2px 12px 12px',
                      'font-size': '13px', 'line-height': '1.6', color: themeColors.textPrimary,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </Show>

              {/* 助手消息 */}
              <Show when={msg.role === 'assistant'}>
                <div style={{ display: 'flex', gap: '8px', 'align-items': 'flex-start' }}>
                  <div style={{
                    width: '26px', height: '26px', 'border-radius': '50%', 'flex-shrink': 0,
                    background: `${MODE_CONFIG[msg.mode]?.color ?? '#1677ff'}18`,
                    display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '13px',
                  }}>
                    {MODE_CONFIG[msg.mode]?.emoji ?? '🤖'}
                  </div>
                  <div style={{ flex: 1, 'min-width': 0 }}>
                    {/* 工具调用步骤 */}
                    <Show when={(msg.toolSteps?.length ?? 0) > 0}>
                      <div style={{ 'margin-bottom': '8px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
                        <For each={msg.toolSteps}>
                          {(step) => <ToolCallStepCard step={step} />}
                        </For>
                      </div>
                    </Show>

                    {/* 文本内容 */}
                    <Show when={msg.content}>
                      <div style={{
                        background: themeColors.surface, border: `1px solid ${themeColors.border}`,
                        padding: '9px 12px', 'border-radius': '2px 12px 12px 12px',
                        'font-size': '13px', 'line-height': '1.7', color: themeColors.textPrimary,
                        'white-space': 'pre-wrap',
                      }}>
                        {msg.content}
                        <Show when={msg.isStreaming}>
                          <span style={{ display: 'inline-flex', gap: '2px', 'margin-left': '4px', 'vertical-align': 'middle' }}>
                            <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0s' }} />
                            <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0.2s' }} />
                            <span style={{ width: '4px', height: '4px', 'border-radius': '50%', background: chartColors.primary, animation: 'blink 1.4s infinite both', 'animation-delay': '0.4s' }} />
                          </span>
                        </Show>
                      </div>
                    </Show>

                    {/* 假设草稿卡片 */}
                    <Show when={msg.hypothesisDraft && !msg.isStreaming}>
                      <HypothesisDraftCard
                        hypothesis={msg.hypothesisDraft!}
                        onSave={(h) => {
                          props.onHypothesisSave(h);
                        }}
                      />
                    </Show>

                    {/* 需求草稿提示 */}
                    <Show when={msg.requirementDraft && !msg.isStreaming}>
                      <div style={{
                        'margin-top': '8px', padding: '8px 12px', 'border-radius': '8px',
                        background: '#f6ffed', border: '1px solid #b7eb8f',
                        'font-size': '12px', display: 'flex', 'align-items': 'center', gap: '8px',
                      }}>
                        <span>📄</span>
                        <span style={{ flex: 1, color: '#389e0d' }}>
                          需求文档已生成：{msg.requirementDraft!.title}
                        </span>
                        <button
                          onClick={() => props.onRequirementSave(msg.requirementDraft!)}
                          style={{
                            background: '#389e0d', color: 'white', border: 'none',
                            'border-radius': '5px', padding: '3px 10px', cursor: 'pointer',
                            'font-size': '11px', 'font-weight': 500,
                          }}
                        >
                          保存到需求列表
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* ── 快捷提示词 ── */}
      <Show when={messages().length === 0 || !loading()}>
        <div style={{
          'flex-shrink': 0, padding: '8px 14px 4px',
          display: 'flex', gap: '6px', 'flex-wrap': 'wrap',
          'border-top': messages().length > 0 ? `1px solid ${themeColors.border}` : 'none',
        }}>
          <For each={quickPrompts()}>
            {(qp) => (
              <button
                onClick={() => handleQuickPrompt(qp.text, qp.mode)}
                style={{
                  padding: '4px 10px', 'border-radius': '16px', 'font-size': '11px', cursor: 'pointer',
                  border: `1px solid ${themeColors.border}`,
                  background: themeColors.hover, color: themeColors.textSecondary,
                  'white-space': 'nowrap', transition: 'all 0.15s',
                }}
              >
                {qp.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* ── 输入区 ── */}
      <div style={{
        'flex-shrink': 0, padding: '10px 14px 14px',
        'border-top': `1px solid ${themeColors.border}`,
      }}>
        <div style={{
          display: 'flex', gap: '8px', 'align-items': 'flex-end',
          border: `1px solid ${loading() ? themeColors.border : activeModeColor()}`,
          'border-radius': '10px', padding: '8px 10px',
          background: 'white', transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={inputRef}
            value={input()}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode() === 'research' ? '输入竞品名称或市场问题...' :
              mode() === 'record' ? '描述你的想法或用户反馈...' :
              mode() === 'generate' ? '告诉我要生成哪个模块的需求...' :
              '和 AI 搭档聊产品...'
            }
            rows={2}
            disabled={loading()}
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'none',
              'font-size': '13px', 'line-height': '1.5', background: 'transparent',
              color: themeColors.textPrimary, 'font-family': 'inherit',
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input().trim() || loading()}
            style={{
              'flex-shrink': 0, width: '32px', height: '32px', 'border-radius': '8px',
              border: 'none', cursor: input().trim() && !loading() ? 'pointer' : 'not-allowed',
              background: input().trim() && !loading() ? activeModeColor() : themeColors.border,
              color: 'white', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'font-size': '14px', transition: 'background 0.2s',
            }}
          >
            ▶
          </button>
        </div>
        <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '5px', 'text-align': 'center' }}>
          Enter 发送 · Shift+Enter 换行
          <Show when={mode() !== 'auto'}>
            <span style={{ 'margin-left': '6px', color: MODE_CONFIG[mode()]?.color }}>
              · {MODE_CONFIG[mode()]?.emoji} {MODE_CONFIG[mode()]?.desc}
            </span>
          </Show>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default InsightAgentPanel;
