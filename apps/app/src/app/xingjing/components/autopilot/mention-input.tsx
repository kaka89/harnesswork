import { createSignal, Show, For } from 'solid-js';
import type { AutopilotAgent } from '../../services/autopilot-executor';
import { themeColors } from '../../utils/colors';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  agents: AutopilotAgent[];
  style?: Record<string, string>;
}

const MentionInput = (props: MentionInputProps) => {
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  let textareaRef: HTMLTextAreaElement | undefined;

  const filteredAgents = () => {
    const q = mentionQuery().toLowerCase();
    return props.agents.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    );
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
    const value = e.currentTarget.value;
    props.onChange(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const after = value.slice(lastAt + 1);
      if (!after.includes(' ') && !after.includes('\n')) {
        setMentionQuery(after);
        setShowDropdown(true);
        return;
      }
    }
    setShowDropdown(false);
  };

  const selectAgent = (agent: AutopilotAgent) => {
    const val = props.value;
    const lastAt = val.lastIndexOf('@');
    const newValue =
      lastAt >= 0 ? val.slice(0, lastAt) + `@${agent.id} ` : val;
    props.onChange(newValue);
    setShowDropdown(false);
    textareaRef?.focus();
  };

  return (
    <div style={{ ...props.style, position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={props.value}
        onInput={handleInput}
        onKeyDown={(e) => { if (e.key === 'Escape') setShowDropdown(false); }}
        disabled={props.disabled}
        placeholder={props.placeholder}
        style={{
          width: '100%',
          'min-height': '80px',
          'font-size': '14px',
          padding: '8px 12px',
          border: `1px solid ${themeColors.border}`,
          'border-radius': '6px',
          'font-family': 'inherit',
          resize: 'vertical',
          'box-sizing': 'border-box',
        }}
      />
      <Show when={showDropdown() && filteredAgents().length > 0}>
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            'margin-bottom': '4px',
            background: '#ffffff',
            border: `1px solid ${themeColors.border}`,
            'border-radius': '8px',
            'box-shadow': '0 4px 16px rgba(0,0,0,0.12)',
            'z-index': '200',
            'min-width': '220px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              'font-size': '11px',
              color: '#888',
              'border-bottom': `1px solid ${themeColors.border}`,
            }}
          >
            直接调用 Agent（跳过 Orchestrator）
          </div>
          <For each={filteredAgents()}>
            {(agent) => (
              <div
                onClick={() => selectAgent(agent)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '10px',
                  'align-items': 'center',
                  transition: 'background 0.15s',
                  background: hoveredId() === agent.id ? '#f5f5f5' : 'transparent',
                }}
                onMouseEnter={() => setHoveredId(agent.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span style={{ 'font-size': '20px' }}>{agent.emoji}</span>
                <div>
                  <div
                    style={{
                      'font-weight': '600',
                      'font-size': '13px',
                      color: '#1a1a1a',
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{ 'font-size': '11px', color: '#888' }}
                  >
                    @{agent.id} · {agent.description}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default MentionInput;
