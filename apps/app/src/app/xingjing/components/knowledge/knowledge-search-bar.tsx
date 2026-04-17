/**
 * 全局知识搜索栏
 * 跨所有来源的全文搜索 + 多维过滤（来源 / 文档类型 / 适用场景）
 */
import { Component, createSignal, For, Show } from 'solid-js';
import { themeColors, chartColors } from '../../utils/colors';

export type KnowledgeSourceFilter = 'all' | 'workspace-doc' | 'private' | 'behavior';

interface KnowledgeSearchBarProps {
  value: string;
  sourceFilter: KnowledgeSourceFilter;
  docTypeFilter?: string | null;
  sceneFilter?: string | null;
  onSearch: (query: string) => void;
  onSourceChange: (source: KnowledgeSourceFilter) => void;
  onDocTypeChange?: (docType: string | null) => void;
  onSceneChange?: (scene: string | null) => void;
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

const DOC_TYPES: Array<{ id: string; label: string }> = [
  { id: 'GLOSSARY', label: '术语表' },
  { id: 'PRD', label: 'PRD' },
  { id: 'SDD', label: 'SDD' },
  { id: 'MODULE', label: '模块' },
  { id: 'PLAN', label: '计划' },
  { id: 'TASK', label: '任务' },
];

const SCENES: Array<{ id: string; label: string }> = [
  { id: 'product-planning', label: '产品规划' },
  { id: 'requirement-design', label: '需求设计' },
  { id: 'technical-design', label: '技术设计' },
  { id: 'code-development', label: '代码开发' },
];

const chipStyle = (active: boolean) => ({
  padding: '3px 8px', 'border-radius': '12px', border: 'none', cursor: 'pointer',
  'font-size': '11px', 'font-weight': active ? 600 : 400,
  background: active ? chartColors.primary : '#f3f4f6',
  color: active ? 'white' : '#6b7280',
  transition: 'all 0.15s',
});

export const KnowledgeSearchBar: Component<KnowledgeSearchBarProps> = (props) => {
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  const hasActiveFilters = () =>
    !!(props.docTypeFilter || props.sceneFilter);

  return (
    <div style={{ 'border-bottom': `1px solid ${themeColors.border}`, background: 'white', 'flex-shrink': 0 }}>
      {/* 主搜索行 */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '10px 16px' }}>
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

        {/* 高级过滤切换 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced())}
          style={{
            background: hasActiveFilters() ? '#eff6ff' : 'transparent',
            border: hasActiveFilters() ? `1px solid ${chartColors.primary}` : `1px solid ${themeColors.border}`,
            'border-radius': '6px', padding: '4px 8px', cursor: 'pointer',
            'font-size': '11px', color: hasActiveFilters() ? chartColors.primary : themeColors.textSecondary,
            'font-weight': hasActiveFilters() ? 600 : 400,
          }}
        >
          ⚙ 过滤{hasActiveFilters() ? ' ●' : ''}
        </button>

        {/* 结果计数 */}
        <span style={{ 'font-size': '12px', color: themeColors.textSecondary, 'flex-shrink': 0 }}>
          {props.value ? `${props.resultCount ?? 0} / ` : ''}{props.totalCount} 条
        </span>
      </div>

      {/* 高级过滤面板（可折叠） */}
      <Show when={showAdvanced()}>
        <div style={{ padding: '0 16px 10px', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          {/* 文档类型过滤 */}
          <Show when={props.onDocTypeChange}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
              <span style={{ 'font-size': '11px', color: '#9ca3af', 'flex-shrink': 0, width: '56px' }}>文档类型</span>
              <For each={DOC_TYPES}>
                {(dt) => (
                  <button
                    onClick={() => props.onDocTypeChange?.(props.docTypeFilter === dt.id ? null : dt.id)}
                    style={chipStyle(props.docTypeFilter === dt.id)}
                  >{dt.label}</button>
                )}
              </For>
            </div>
          </Show>

          {/* 适用场景过滤 */}
          <Show when={props.onSceneChange}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
              <span style={{ 'font-size': '11px', color: '#9ca3af', 'flex-shrink': 0, width: '56px' }}>适用场景</span>
              <For each={SCENES}>
                {(sc) => (
                  <button
                    onClick={() => props.onSceneChange?.(props.sceneFilter === sc.id ? null : sc.id)}
                    style={chipStyle(props.sceneFilter === sc.id)}
                  >{sc.label}</button>
                )}
              </For>
            </div>
          </Show>

          {/* 清除所有过滤 */}
          <Show when={hasActiveFilters()}>
            <button
              onClick={() => { props.onDocTypeChange?.(null); props.onSceneChange?.(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', 'font-size': '11px', color: chartColors.error, padding: '2px 0', 'text-align': 'left' }}
            >✕ 清除高级过滤</button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default KnowledgeSearchBar;
