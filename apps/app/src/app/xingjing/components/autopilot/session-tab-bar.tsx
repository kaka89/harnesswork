/**
 * Session Tab Bar
 *
 * Tab 导航 + 状态徽标，显示 Orchestrator 和各 Agent Session 的状态
 */

import { For, Show } from 'solid-js';
import type { AgentSessionSlot } from '../../services/team-session-orchestrator';
import type { DispatchItem } from '../../services/autopilot-executor';
import { themeColors } from '../../utils/colors';

export interface SessionTabBarProps {
  slots: AgentSessionSlot[];
  orchestratorSessionId: string | null;
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  dispatchPlan: DispatchItem[] | null;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'working':
    case 'thinking':
      return themeColors.primary;
    case 'done':
      return themeColors.success;
    case 'error':
      return themeColors.error;
    default:
      return themeColors.textMuted;
  }
};

const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'working':
    case 'thinking':
      return '◐';
    case 'done':
      return '●';
    case 'error':
      return '✕';
    default:
      return '○';
  }
};

export default function SessionTabBar(props: SessionTabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '12px 16px',
        'border-bottom': `1px solid ${themeColors.border}`,
        'background-color': themeColors.bgSubtle,
        'overflow-x': 'auto',
      }}
    >
      {/* Orchestrator Tab */}
      <Show when={props.orchestratorSessionId}>
        <button
          onClick={() => props.onTabChange('orchestrator')}
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '6px',
            padding: '6px 12px',
            'border-radius': '6px',
            border: 'none',
            background: props.activeTabId === 'orchestrator' ? themeColors.primaryBg : 'transparent',
            color: props.activeTabId === 'orchestrator' ? themeColors.primary : themeColors.textPrimary,
            'font-size': '13px',
            'font-weight': props.activeTabId === 'orchestrator' ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
            'white-space': 'nowrap',
          }}
        >
          <span>🎯</span>
          <span>Orchestrator</span>
          <Show when={props.dispatchPlan && props.dispatchPlan.length > 0}>
            <span
              style={{
                'font-size': '10px',
                padding: '2px 6px',
                'border-radius': '8px',
                background: themeColors.primaryBg,
                color: themeColors.primary,
              }}
            >
              {props.dispatchPlan!.length}
            </span>
          </Show>
        </button>
      </Show>

      {/* Agent Tabs */}
      <For each={props.slots}>
        {(slot) => {
          const hasPendingPermission = () => slot.pendingPermission() !== null;
          const hasPendingQuestion = () => slot.pendingQuestion() !== null;
          const status = () => slot.status();
          const statusColor = () => getStatusColor(status());
          const statusIcon = () => getStatusIcon(status());

          return (
            <button
              onClick={() => props.onTabChange(slot.agentId)}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                padding: '6px 12px',
                'border-radius': '6px',
                border: 'none',
                background: props.activeTabId === slot.agentId ? themeColors.primaryBg : 'transparent',
                color: props.activeTabId === slot.agentId ? themeColors.primary : themeColors.textPrimary,
                'font-size': '13px',
                'font-weight': props.activeTabId === slot.agentId ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s',
                'white-space': 'nowrap',
                position: 'relative',
              }}
            >
              <span style={{ color: statusColor() }}>{statusIcon()}</span>
              <span>{slot.agentId}</span>

              {/* 权限请求红点 */}
              <Show when={hasPendingPermission()}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    'border-radius': '50%',
                    background: themeColors.error,
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                  }}
                />
              </Show>

              {/* 提问黄点 */}
              <Show when={hasPendingQuestion()}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    'border-radius': '50%',
                    background: themeColors.warning,
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                  }}
                />
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}
