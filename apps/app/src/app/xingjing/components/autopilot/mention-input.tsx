import { createSignal, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
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
  const [dropdownPos, setDropdownPos] = createSignal<{ top: number; left: number; width: number; direction: 'up' | 'down' } | null>(null);
  let textareaRef: HTMLTextAreaElement | undefined;

  const filteredAgents = () => {
    const q = mentionQuery().toLowerCase();
    return props.agents.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    );
  };

  const DROPDOWN_MAX_HEIGHT = 280;
  const DROPDOWN_GAP = 6;
  const HEADER_HEIGHT = 30;
  const ITEM_HEIGHT = 40;

  const estimateDropdownHeight = () => {
    const itemCount = filteredAgents().length;
    const raw = HEADER_HEIGHT + ITEM_HEIGHT * itemCount;
    return Math.min(raw, DROPDOWN_MAX_HEIGHT);
  };

  const updateDropdownPos = () => {
    if (textareaRef) {
      const rect = textareaRef.getBoundingClientRect();
      const estHeight = estimateDropdownHeight();
      const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP;
      const spaceAbove = rect.top - DROPDOWN_GAP;
      // Prefer below; flip to above only when below is insufficient and above has more room
      const direction: 'up' | 'down' = spaceBelow >= estHeight || spaceBelow >= spaceAbove ? 'down' : 'up';
      const top = direction === 'down'
        ? rect.bottom + DROPDOWN_GAP
        : rect.top - estHeight - DROPDOWN_GAP;
      setDropdownPos({ top, left: rect.left, width: rect.width, direction });
    }
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
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
      <Show when={showDropdown() && filteredAgents().length > 0 && dropdownPos() !== null}>
        <Portal mount={document.body}>
          <div
            style={{
              position: 'fixed',
              top: `${dropdownPos()!.top}px`,
              left: `${dropdownPos()!.left}px`,
              background: themeColors.surface,
              border: `1px solid ${themeColors.border}`,
              'border-radius': dropdownPos()!.direction === 'up' ? '8px 8px 4px 4px' : '4px 4px 8px 8px',
              'box-shadow': '0 4px 16px rgba(0,0,0,0.12)',
              'z-index': '9999',
              'min-width': `${Math.max(dropdownPos()!.width, 220)}px`,
              'max-height': `${DROPDOWN_MAX_HEIGHT}px`,
              display: 'flex',
              'flex-direction': dropdownPos()!.direction === 'up' ? 'column-reverse' : 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                'font-size': '11px',
                color: themeColors.textMuted,
                'border-bottom': dropdownPos()!.direction === 'down' ? `1px solid ${themeColors.border}` : 'none',
                'border-top': dropdownPos()!.direction === 'up' ? `1px solid ${themeColors.border}` : 'none',
                'flex-shrink': '0',
              }}
            >
              直接调用 Agent（跳过 Orchestrator）
            </div>
            <div style={{ 'overflow-y': 'auto', flex: '1', 'min-height': '0' }}>
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
                      background: hoveredId() === agent.id ? themeColors.hover : 'transparent',
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
                          color: themeColors.textPrimary,
                        }}
                      >
                        {agent.name}
                      </div>
                      <div
                        style={{ 'font-size': '11px', color: themeColors.textMuted }}
                      >
                        @{agent.id} · {agent.description}
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default MentionInput;
