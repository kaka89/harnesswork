/**
 * Team Chat Composer
 *
 * 输入层，支持两种发送语义：
 * - Orchestrator Tab 下发送：触发新一轮团队编排
 * - Agent Tab 下发送：在该 Agent Session 内追加消息（多轮对话）
 * - @mention：无论在哪个 Tab，直接派发给指定 Agent
 */

import { createSignal, Show } from 'solid-js';
import { Send, StopCircle } from 'lucide-solid';
import type { AutopilotAgent } from '../../services/autopilot-executor';
import { themeColors } from '../../utils/colors';

export interface TeamChatComposerProps {
  activeTabId: string;
  isRunning: boolean;
  availableAgents: AutopilotAgent[];
  /** 发送到整个团队（经 Orchestrator） */
  onSend: (text: string) => void;
  /** 在当前活动 Agent Session 内追加消息（多轮） */
  onSendToAgent: (agentId: string, text: string) => void;
  onAbort: () => void;
}

export default function TeamChatComposer(props: TeamChatComposerProps) {
  const [input, setInput] = createSignal('');

  const handleSubmit = () => {
    const text = input().trim();
    if (!text) return;

    // 检测 @mention
    const mentionMatch = text.match(/^@(\S+)\s+([\s\S]*)$/);
    if (mentionMatch) {
      const agentRef = mentionMatch[1];
      const task = mentionMatch[2].trim();
      const agent = props.availableAgents.find((a) => a.id === agentRef || a.name === agentRef);
      if (agent && task) {
        props.onSendToAgent(agent.id, task);
        setInput('');
        return;
      }
    }

    // 根据当前 Tab 决定发送语义
    if (props.activeTabId === 'orchestrator') {
      // Orchestrator Tab：触发新一轮团队编排
      props.onSend(text);
    } else {
      // Agent Tab：在该 Agent Session 内追加消息
      props.onSendToAgent(props.activeTabId, text);
    }

    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '16px',
        'border-top': `1px solid ${themeColors.border}`,
        'background-color': themeColors.surface,
      }}
    >
      <textarea
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          props.activeTabId === 'orchestrator'
            ? '输入目标，团队将协作完成...'
            : `与 ${props.activeTabId} 对话...`
        }
        disabled={props.isRunning}
        style={{
          flex: 1,
          padding: '12px',
          'border-radius': '8px',
          border: `1px solid ${themeColors.border}`,
          'font-size': '14px',
          'font-family': 'inherit',
          resize: 'none',
          'min-height': '80px',
          'background-color': themeColors.bgSubtle,
          color: themeColors.textPrimary,
        }}
      />

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
        <Show
          when={!props.isRunning}
          fallback={
            <button
              onClick={props.onAbort}
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                gap: '6px',
                padding: '12px 20px',
                'border-radius': '8px',
                border: 'none',
                background: themeColors.error,
                color: 'white',
                'font-size': '14px',
                'font-weight': 500,
                cursor: 'pointer',
                'white-space': 'nowrap',
              }}
            >
              <StopCircle size={18} />
              <span>停止</span>
            </button>
          }
        >
          <button
            onClick={handleSubmit}
            disabled={!input().trim()}
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              gap: '6px',
              padding: '12px 20px',
              'border-radius': '8px',
              border: 'none',
              background: input().trim() ? themeColors.primary : themeColors.border,
              color: 'white',
              'font-size': '14px',
              'font-weight': 500,
              cursor: input().trim() ? 'pointer' : 'not-allowed',
              opacity: input().trim() ? 1 : 0.5,
              'white-space': 'nowrap',
            }}
          >
            <Send size={18} />
            <span>发送</span>
          </button>
        </Show>

        <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'text-align': 'center' }}>
          <Show when={props.activeTabId === 'orchestrator'}>
            <div>团队协作模式</div>
          </Show>
          <Show when={props.activeTabId !== 'orchestrator'}>
            <div>多轮对话模式</div>
          </Show>
          <div style={{ 'margin-top': '4px' }}>@agent 直接派发</div>
        </div>
      </div>
    </div>
  );
}
