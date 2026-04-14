import { Show, For, onMount, onCleanup } from 'solid-js';
import { X, Loader2 } from 'lucide-solid';
import { themeColors, chartColors } from '../../utils/colors';
import type { AutopilotAgent, DispatchItem, AgentExecutionStatus } from '../../services/autopilot-executor';

interface ExpandableOverlayProps {
  show: boolean;
  onClose: () => void;
  title?: string;
  dispatchPlan: DispatchItem[];
  agentStreamTexts: Record<string, string>;
  agentExecStatuses: Record<string, AgentExecutionStatus>;
  agents: AutopilotAgent[];
}

const ExpandableOverlay = (props: ExpandableOverlayProps) => {
  // ESC 键关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={props.show}>
      {/* 全屏遮罩 */}
      <div
        style={{
          position: 'fixed',
          inset: '0',
          'z-index': '9999',
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        {/* 内容面板 */}
        <div
          style={{
            width: '80vw',
            height: '80vh',
            background: themeColors.surface,
            'border-radius': '12px',
            'box-shadow': '0 24px 64px rgba(0,0,0,0.2)',
            display: 'flex',
            'flex-direction': 'column',
            overflow: 'hidden',
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              padding: '14px 20px',
              'border-bottom': `1px solid ${themeColors.border}`,
              'flex-shrink': '0',
            }}
          >
            <span style={{ 'font-weight': '600', 'font-size': '15px', color: themeColors.text }}>
              {props.title ?? '执行流详情'}
            </span>
            <button
              onClick={props.onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: themeColors.textMuted,
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                padding: '4px',
                'border-radius': '4px',
              }}
              title="关闭 (ESC)"
            >
              <X size={18} />
            </button>
          </div>

          {/* 内容区（只读，可滚动） */}
          <div
            style={{
              flex: '1',
              'overflow-y': 'auto',
              padding: '16px 20px',
            }}
          >
            <Show
              when={props.dispatchPlan.length > 0}
              fallback={
                <div style={{ 'text-align': 'center', padding: '60px 0', color: themeColors.textMuted, 'font-size': '14px' }}>
                  暂无执行内容
                </div>
              }
            >
              <For each={props.dispatchPlan}>
                {(item) => {
                  const agent = () => props.agents.find((a) => a.id === item.agentId);
                  const text = () => props.agentStreamTexts[item.agentId] ?? '';
                  const execStatus = () => props.agentExecStatuses[item.agentId] ?? 'pending';
                  const isStreaming = () => execStatus() === 'thinking' || execStatus() === 'working';
                  const isDone = () => execStatus() === 'done';
                  const ag = agent();
                  if (!ag) return null;
                  return (
                    <div
                      style={{
                        'padding-bottom': '20px',
                        'margin-bottom': '20px',
                        'border-bottom': `1px solid ${themeColors.border}`,
                      }}
                    >
                      {/* Agent 头部 */}
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '10px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            'border-radius': '50%',
                            'flex-shrink': '0',
                            background: isDone() ? ag.color : 'transparent',
                            border: isStreaming() ? `2px solid ${ag.color}` : `2px solid ${themeColors.border}`,
                            display: 'flex',
                            'align-items': 'center',
                            'justify-content': 'center',
                            'font-size': '14px',
                          }}
                        >
                          <Show when={isStreaming()}>
                            <Loader2 size={14} style={{ color: ag.color, animation: 'spin 1s linear infinite' }} />
                          </Show>
                          <Show when={!isStreaming()}>
                            {ag.emoji}
                          </Show>
                        </div>
                        <div>
                          <div style={{ display: 'inline-flex', 'align-items': 'center', padding: '2px 8px', 'border-radius': '4px', 'font-size': '12px', background: ag.color + '20', color: ag.color, border: `1px solid ${ag.borderColor}`, 'margin-right': '8px' }}>
                            {ag.name}
                          </div>
                          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{item.task}</span>
                        </div>
                      </div>

                      {/* 流式输出内容（完整展示，不截断） */}
                      <Show when={text()}>
                        <div
                          style={{
                            'font-size': '13px',
                            color: themeColors.textSecondary,
                            'white-space': 'pre-wrap',
                            'line-height': '1.7',
                            background: themeColors.hover,
                            padding: '12px 14px',
                            'border-radius': '6px',
                          }}
                        >
                          {text()}
                        </div>
                      </Show>
                      <Show when={!text() && execStatus() === 'pending'}>
                        <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'font-style': 'italic' }}>等待执行中...</div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Show>
  );
};

export default ExpandableOverlay;
