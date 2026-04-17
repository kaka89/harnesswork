/**
 * 工具调用步骤卡片
 * 展示 Agent 调用 web_search 等工具时的中间状态：运行中 / 完成 / 失败
 */
import { Component, Show, For } from 'solid-js';
import { themeColors } from '../../utils/colors';

export interface ToolCallStep {
  id: string;
  type: 'search' | 'analyze' | 'write' | 'thinking';
  status: 'running' | 'done' | 'error';
  /** 展示标签，如 "搜索: Notion AI 竞品分析" */
  label: string;
  /** 完成后的结果摘要，如 "找到 8 条结果" */
  detail?: string;
  /** 来源域名列表，如 ["notion.so", "techcrunch.com"] */
  sources?: string[];
  startedAt: number;
  /** 耗时毫秒（完成后填入） */
  duration?: number;
}

const STEP_ICONS: Record<ToolCallStep['type'], string> = {
  search: '🔍',
  analyze: '🧠',
  write: '✍️',
  thinking: '💭',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const ToolCallStepCard: Component<{ step: ToolCallStep }> = (props) => {
  const icon = () => STEP_ICONS[props.step.type];
  const elapsed = () => {
    if (props.step.duration !== undefined) return formatDuration(props.step.duration);
    return formatDuration(Date.now() - props.step.startedAt);
  };

  return (
    <div style={{
      display: 'flex', gap: '10px', 'align-items': 'flex-start',
      padding: '8px 12px', 'border-radius': '8px',
      background: props.step.status === 'error' ? '#fff2f0' : '#f0f9ff',
      border: `1px solid ${props.step.status === 'error' ? '#ffccc7' : props.step.status === 'done' ? '#b7eb8f' : '#bae0ff'}`,
      'font-size': '12px', transition: 'all 0.2s',
    }}>
      {/* 左侧图标 / spinner */}
      <div style={{ 'flex-shrink': 0, 'margin-top': '1px', width: '16px', 'text-align': 'center' }}>
        <Show
          when={props.step.status === 'running'}
          fallback={
            <span style={{ 'font-size': '13px' }}>
              {props.step.status === 'done' ? '✅' : '⚠️'}
            </span>
          }
        >
          <span style={{
            display: 'inline-block', width: '12px', height: '12px',
            border: '2px solid #1677ff', 'border-top-color': 'transparent',
            'border-radius': '50%', animation: 'spin 0.8s linear infinite',
          }} />
        </Show>
      </div>

      {/* 主内容 */}
      <div style={{ flex: 1, 'min-width': 0 }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: '#1677ff', 'font-weight': 500 }}>
            {icon()} {props.step.label}
          </span>
          <span style={{ color: themeColors.textMuted, 'white-space': 'nowrap', 'flex-shrink': 0 }}>
            {elapsed()}
          </span>
        </div>

        {/* 完成后详情 */}
        <Show when={props.step.status !== 'running' && (props.step.detail || (props.step.sources?.length ?? 0) > 0)}>
          <div style={{ 'margin-top': '4px', color: themeColors.textSecondary }}>
            <Show when={props.step.detail}>
              <span>{props.step.detail}</span>
            </Show>
            <Show when={(props.step.sources?.length ?? 0) > 0}>
              <div style={{ 'margin-top': '2px', color: themeColors.textMuted }}>
                <For each={props.step.sources?.slice(0, 4)}>
                  {(src) => (
                    <span style={{
                      display: 'inline-block', 'margin-right': '6px',
                      padding: '1px 6px', 'border-radius': '4px',
                      background: '#e6f4ff', color: '#1677ff', 'font-size': '11px',
                    }}>
                      {src}
                    </span>
                  )}
                </For>
                <Show when={(props.step.sources?.length ?? 0) > 4}>
                  <span style={{ color: themeColors.textMuted, 'font-size': '11px' }}>
                    +{(props.step.sources?.length ?? 0) - 4}
                  </span>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ToolCallStepCard;
