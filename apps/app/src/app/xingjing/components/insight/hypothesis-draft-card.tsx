/**
 * 假设草稿卡片
 * Agent 输出结构化假设后，在消息下方展示预览 + 编辑 + 一键保存
 */
import { Component, createSignal, Show } from 'solid-js';
import type { Hypothesis } from '../../mock/solo';
import { themeColors, chartColors } from '../../utils/colors';

interface HypothesisDraftCardProps {
  hypothesis: Hypothesis;
  onSave: (h: Hypothesis) => void;
  onDismiss?: () => void;
}

const IMPACT_CONFIG = {
  high:   { label: '高影响', bg: '#fff2f0', color: '#cf1322' },
  medium: { label: '中影响', bg: '#fffbe6', color: '#d48806' },
  low:    { label: '低影响', bg: '#f6ffed', color: '#389e0d' },
};

export const HypothesisDraftCard: Component<HypothesisDraftCardProps> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal<Hypothesis>({ ...props.hypothesis });
  const [saved, setSaved] = createSignal(false);

  const impact = () => IMPACT_CONFIG[draft().impact] ?? IMPACT_CONFIG.medium;

  const handleSave = () => {
    props.onSave(draft());
    setSaved(true);
  };

  return (
    <div style={{
      border: `1px solid #d3adf7`, 'border-radius': '10px',
      background: '#fdf4ff', padding: '12px 14px', 'margin-top': '8px',
      'font-size': '13px',
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '10px' }}>
        <span style={{ 'font-weight': 600, color: '#722ed1' }}>📋 假设草稿</span>
        <div style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          <span style={{
            padding: '2px 8px', 'border-radius': '12px',
            background: impact().bg, color: impact().color, 'font-size': '11px', 'font-weight': 500,
          }}>
            {impact().label}
          </span>
          <Show when={!saved()}>
            <button
              onClick={() => setEditing(v => !v)}
              style={{ background: 'none', border: `1px solid #d3adf7`, 'border-radius': '6px',
                padding: '2px 8px', cursor: 'pointer', 'font-size': '11px', color: '#722ed1' }}
            >
              {editing() ? '收起' : '编辑'}
            </button>
          </Show>
        </div>
      </div>

      {/* 展示模式 */}
      <Show when={!editing()}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <div>
            <span style={{ color: themeColors.textMuted, 'font-size': '11px' }}>我认为</span>
            <div style={{ color: themeColors.textPrimary, 'margin-top': '2px' }}>{draft().belief}</div>
          </div>
          <div>
            <span style={{ color: themeColors.textMuted, 'font-size': '11px' }}>因为</span>
            <div style={{ color: themeColors.textSecondary, 'margin-top': '2px' }}>{draft().why}</div>
          </div>
          <div>
            <span style={{ color: themeColors.textMuted, 'font-size': '11px' }}>验证方式</span>
            <div style={{ color: themeColors.textSecondary, 'margin-top': '2px' }}>{draft().method}</div>
          </div>
        </div>
      </Show>

      {/* 编辑模式 */}
      <Show when={editing()}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          {(['belief', 'why', 'method'] as const).map(field => {
            const labels = { belief: '我认为', why: '因为', method: '验证方式' };
            return (
              <div>
                <label style={{ 'font-size': '11px', color: themeColors.textMuted, display: 'block', 'margin-bottom': '3px' }}>
                  {labels[field]}
                </label>
                <textarea
                  value={draft()[field]}
                  onInput={(e) => setDraft(prev => ({ ...prev, [field]: (e.target as HTMLTextAreaElement).value }))}
                  rows={2}
                  style={{
                    width: '100%', 'box-sizing': 'border-box', resize: 'vertical',
                    padding: '6px 8px', 'border-radius': '6px', 'font-size': '12px',
                    border: `1px solid ${themeColors.border}`, background: 'white',
                    color: themeColors.textPrimary, 'line-height': '1.5',
                  }}
                />
              </div>
            );
          })}
          <div>
            <label style={{ 'font-size': '11px', color: themeColors.textMuted, display: 'block', 'margin-bottom': '3px' }}>影响程度</label>
            <select
              value={draft().impact}
              onChange={(e) => setDraft(prev => ({ ...prev, impact: (e.target as HTMLSelectElement).value as 'high' | 'medium' | 'low' }))}
              style={{ padding: '4px 8px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, 'font-size': '12px' }}
            >
              <option value="high">高影响</option>
              <option value="medium">中影响</option>
              <option value="low">低影响</option>
            </select>
          </div>
        </div>
      </Show>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '8px', 'margin-top': '12px', 'justify-content': 'flex-end' }}>
        <Show when={!saved()}>
          <Show when={props.onDismiss}>
            <button
              onClick={props.onDismiss}
              style={{ background: 'none', border: `1px solid ${themeColors.border}`, 'border-radius': '6px',
                padding: '5px 12px', cursor: 'pointer', 'font-size': '12px', color: themeColors.textMuted }}
            >
              忽略
            </button>
          </Show>
          <button
            onClick={handleSave}
            style={{
              background: '#722ed1', color: 'white', border: 'none', 'border-radius': '6px',
              padding: '5px 14px', cursor: 'pointer', 'font-size': '12px', 'font-weight': 500,
            }}
          >
            ✅ 保存到假设看板
          </button>
        </Show>
        <Show when={saved()}>
          <span style={{ color: chartColors.success, 'font-size': '12px', 'font-weight': 500 }}>✅ 已保存到假设看板</span>
        </Show>
      </div>
    </div>
  );
};

export default HypothesisDraftCard;
