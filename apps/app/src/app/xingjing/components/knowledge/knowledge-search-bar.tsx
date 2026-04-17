/**
 * 全局知识搜索栏
 * 跨所有来源的全文搜索 + 多维过滤
 */
import { Component, createSignal, For } from 'solid-js';
import { themeColors, chartColors } from '../../utils/colors';

export type KnowledgeSourceFilter = 'all' | 'workspace-doc' | 'private' | 'behavior';

interface KnowledgeSearchBarProps {
  value: string;
  sourceFilter: KnowledgeSourceFilter;
  onSearch: (query: string) => void;
  onSourceChange: (source: KnowledgeSourceFilter) => void;
  onClear: () => void;
  totalCount: number;
  resultCount?: number;
}

const SOURCES: Array<{ id: KnowledgeSourceFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'workspace-doc', label: '产品文档' },
  { id: 'private', label: '个人笔记' },
  { id: 'behavior', label: '行为知识' },
];

export const KnowledgeSearchBar: Component<KnowledgeSearchBarProps> = (props) => {
  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '10px 16px', 'border-bottom': `1px solid ${themeColors.border}`, background: 'white', 'flex-shrink': 0 }}>
      {/* 搜索框 */}
      <div style={{ position: 'relative', flex: 1 }}>
        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', 'font-size': '13px' }}>🔍</span>
        <input
          type="text"
          value={props.value}
          onInput={(e) => props.onSearch(e.currentTarget.value)}
          placeholder="搜索知识库..."
          style={{
            width: '100%', padding: '8px 10px 8px 32px', 'border-radius': '8px',
            border: `1px solid ${themeColors.border}`, 'font-size': '13px',
            outline: 'none', 'box-sizing': 'border-box',
          }}
        />
      </div>

      {/* 来源过滤 Tab */}
      <div style={{ display: 'flex', gap: '2px', background: '#f3f4f6', 'border-radius': '8px', padding: '2px' }}>
        <For each={SOURCES}>
          {(src) => (
            <button
              onClick={() => props.onSourceChange(src.id)}
              style={{
                padding: '4px 10px', 'border-radius': '6px', border: 'none', cursor: 'pointer',
                'font-size': '12px', 'font-weight': props.sourceFilter === src.id ? 600 : 400,
                background: props.sourceFilter === src.id ? 'white' : 'transparent',
                color: props.sourceFilter === src.id ? themeColors.text : themeColors.textSecondary,
                'box-shadow': props.sourceFilter === src.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >{src.label}</button>
          )}
        </For>
      </div>

      {/* 结果计数 */}
      <span style={{ 'font-size': '12px', color: themeColors.textSecondary, 'flex-shrink': 0 }}>
        {props.value ? `${props.resultCount ?? 0} / ` : ''}{props.totalCount} 条
      </span>
    </div>
  );
};

export default KnowledgeSearchBar;
