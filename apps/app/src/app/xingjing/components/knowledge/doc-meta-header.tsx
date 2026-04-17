/**
 * 文档元信息头部：状态、所有者、层级、日期
 */
import { Component, Show } from 'solid-js';
import { themeColors, chartColors } from '../../utils/colors';
import type { KnowledgeEntry } from '../../services/knowledge-index';

interface DocMetaHeaderProps {
  entry: KnowledgeEntry;
}

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  approved:  { bg: '#dcfce7', text: '#16a34a', label: '✅ 已批准' },
  reviewing: { bg: '#fef3c7', text: '#d97706', label: '⏳ 审核中' },
  draft:     { bg: '#f3f4f6', text: '#6b7280', label: '✏️ 草稿' },
  validated: { bg: '#dcfce7', text: '#16a34a', label: '✅ 已验证' },
  testing:   { bg: '#f3e8ff', text: '#7c3aed', label: '🧪 测试中' },
  accepted:  { bg: '#dcfce7', text: '#16a34a', label: '✅ 已采纳' },
  superseded:{ bg: '#f3f4f6', text: '#9ca3af', label: '🔁 已替代' },
  stable:    { bg: '#f3f4f6', text: '#6b7280', label: '🔒 稳定' },
  living:    { bg: '#dcfce7', text: '#16a34a', label: '🌱 动态' },
};

const LAYER_LABELS: Record<string, string> = {
  feature: '功能', form: '表单', application: '应用', domain: '领域',
  'product-line': '产品线', product: '产品', platform: '平台',
};

export const DocMetaHeader: Component<DocMetaHeaderProps> = (props) => {
  const fm = () => (props.entry as KnowledgeEntry & { frontmatter?: Record<string, unknown> }).frontmatter ?? {};
  const statusKey = () => String(fm().status ?? props.entry.lifecycle ?? 'living');
  const statusStyle = () => STATUS_COLOR[statusKey()] ?? STATUS_COLOR.living;
  const owner = () => String(fm().owner ?? props.entry.owner ?? '');
  const layer = () => props.entry.layer ?? '';
  const date = () => String(fm().updatedAt ?? fm().createdAt ?? props.entry.date ?? '');

  return (
    <div style={{
      display: 'flex', 'flex-wrap': 'wrap', gap: '8px', padding: '10px 16px',
      background: '#f9fafb',
      'border-radius': '8px', 'margin-bottom': '16px',
      'border': `1px solid ${themeColors.border}`, 'font-size': '12px',
    }}>
      {/* 状态 */}
      <span style={{ padding: '2px 8px', 'border-radius': '12px', background: statusStyle().bg, color: statusStyle().text, 'font-weight': 500 }}>
        {statusStyle().label}
      </span>

      {/* 所有者 */}
      <Show when={owner()}>
        <span style={{ color: themeColors.textSecondary }}>👤 {owner()}</span>
      </Show>

      {/* 层级 */}
      <Show when={layer()}>
        <span style={{ padding: '2px 8px', 'border-radius': '12px', background: '#dbeafe', color: '#1d4ed8' }}>
          📐 {LAYER_LABELS[layer()] ?? layer()}
        </span>
      </Show>

      {/* 文档类型 */}
      <Show when={props.entry.docType}>
        <span style={{ padding: '2px 8px', 'border-radius': '12px', background: '#f3e8ff', color: '#7c3aed' }}>
          {props.entry.docType}
        </span>
      </Show>

      {/* 日期 */}
      <Show when={date()}>
        <span style={{ color: themeColors.textSecondary, 'margin-left': 'auto' }}>
          🗓 {date().slice(0, 10)}
        </span>
      </Show>
    </div>
  );
};

export default DocMetaHeader;
