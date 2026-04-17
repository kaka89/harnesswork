/**
 * 知识浏览模式卡片网格
 * 浏览模式（无选中节点）下的聚合展示
 */
import { Component, For, Show, createMemo } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';

interface KnowledgeGridViewProps {
  entries: KnowledgeEntry[];
  sourceFilter: 'all' | 'workspace-doc' | 'private' | 'behavior';
  onSelect: (entry: KnowledgeEntry) => void;
  onSendToAI?: (entry: KnowledgeEntry) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  'workspace-doc': '产品文档', private: '个人笔记', behavior: '行为知识',
};
const SOURCE_COLOR: Record<string, { bg: string; text: string }> = {
  'workspace-doc': { bg: '#dbeafe', text: '#1d4ed8' },
  private:         { bg: '#f3e8ff', text: '#7c3aed' },
  behavior:        { bg: '#dcfce7', text: '#16a34a' },
};
const DOC_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  PRD:      { bg: '#dbeafe', text: '#1d4ed8' },
  SDD:      { bg: '#f3e8ff', text: '#7c3aed' },
  MODULE:   { bg: '#fef3c7', text: '#d97706' },
  TASK:     { bg: '#dcfce7', text: '#16a34a' },
  GLOSSARY: { bg: '#f3f4f6', text: '#6b7280' },
};

export const KnowledgeGridView: Component<KnowledgeGridViewProps> = (props) => {
  const filtered = createMemo(() =>
    props.sourceFilter === 'all'
      ? props.entries
      : props.entries.filter((e) => e.source === props.sourceFilter)
  );

  return (
    <div style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
      <Show when={filtered().length === 0}>
        <div style={{ 'text-align': 'center', color: themeColors.textSecondary, padding: '40px', 'font-size': '13px' }}>
          暂无知识条目
        </div>
      </Show>
      <div style={{
        display: 'grid',
        'grid-template-columns': 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '12px',
      }}>
        <For each={filtered()}>
          {(entry) => <KnowledgeCard entry={entry} onSelect={props.onSelect} onSendToAI={props.onSendToAI} />}
        </For>
      </div>
    </div>
  );
};

const KnowledgeCard: Component<{
  entry: KnowledgeEntry;
  onSelect: (e: KnowledgeEntry) => void;
  onSendToAI?: (e: KnowledgeEntry) => void;
}> = (props) => {
  const srcColor = () => SOURCE_COLOR[props.entry.source] ?? SOURCE_COLOR.private;
  const docTypeColor = () => props.entry.docType ? (DOC_TYPE_COLOR[props.entry.docType.toUpperCase()] ?? { bg: '#f3f4f6', text: '#6b7280' }) : null;

  return (
    <div
      style={{
        background: 'white', border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
        padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.15s',
        display: 'flex', 'flex-direction': 'column', gap: '8px',
      }}
      onClick={() => props.onSelect(props.entry)}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: '6px', 'align-items': 'flex-start', 'flex-wrap': 'wrap' }}>
        <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '10px', background: srcColor().bg, color: srcColor().text, 'flex-shrink': 0 }}>
          {SOURCE_LABEL[props.entry.source]}
        </span>
        <Show when={docTypeColor()}>
          <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '10px', background: docTypeColor()!.bg, color: docTypeColor()!.text, 'flex-shrink': 0 }}>
            {props.entry.docType}
          </span>
        </Show>
        <Show when={props.entry.layer}>
          <span style={{ 'font-size': '11px', color: '#9ca3af', 'margin-left': 'auto' }}>{props.entry.layer}</span>
        </Show>
      </div>

      {/* Title */}
      <div style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text, 'line-height': '1.4' }}>
        {props.entry.title}
      </div>

      {/* Summary */}
      <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'line-height': '1.5', overflow: 'hidden', display: '-webkit-box', '-webkit-line-clamp': '3', '-webkit-box-orient': 'vertical' }}>
        {props.entry.summary}
      </div>

      {/* Tags */}
      <Show when={(props.entry.tags ?? []).length > 0}>
        <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
          {(props.entry.tags ?? []).slice(0, 4).map((tag) => (
            <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '8px', background: '#f3f4f6', color: '#6b7280' }}>#{tag}</span>
          ))}
        </div>
      </Show>

      {/* Footer */}
      <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-top': 'auto', 'padding-top': '4px' }}>
        <Show when={props.entry.date}>
          <span style={{ 'font-size': '11px', color: '#9ca3af' }}>{String(props.entry.date ?? '').slice(0, 10)}</span>
        </Show>
        <Show when={props.onSendToAI}>
          <button
            style={{ background: 'none', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', padding: '2px 8px', cursor: 'pointer', 'font-size': '11px', color: chartColors.primary }}
            onClick={(e) => { e.stopPropagation(); props.onSendToAI?.(props.entry); }}
          >▶ 发给 AI</button>
        </Show>
      </div>
    </div>
  );
};

export default KnowledgeGridView;
