/**
 * 洞察记录卡片
 * 展示单条外部调研记录（可展开/折叠/操作）
 */
import { Component, createSignal, Show, For } from 'solid-js';
import type { InsightRecord, ProductSuggestion } from '../../services/insight-store';
import { themeColors, chartColors } from '../../utils/colors';

interface InsightRecordCardProps {
  record: InsightRecord;
  onDelete?: (id: string) => void;
  onConvertToRequirement?: (suggestion: ProductSuggestion) => void;
  onConvertToHypothesis?: (suggestion: ProductSuggestion) => void;
}

const CATEGORY_CONFIG: Record<InsightRecord['category'], { label: string; bg: string; color: string }> = {
  competitor: { label: '竞品分析', bg: '#f0f5ff', color: '#1d39c4' },
  market:     { label: '市场趋势', bg: '#f6ffed', color: '#237804' },
  user:       { label: '用户洞察', bg: '#fffbe6', color: '#ad6800' },
  tech:       { label: '技术调研', bg: '#f9f0ff', color: '#531dab' },
  general:    { label: '综合调研', bg: '#f5f5f5', color: '#595959' },
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: '#cf1322', P1: '#d48806', P2: '#0958d9', P3: '#595959',
};

export const InsightRecordCard: Component<InsightRecordCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const cat = () => CATEGORY_CONFIG[props.record.category] ?? CATEGORY_CONFIG.general;

  return (
    <div style={{
      border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
      background: 'white', overflow: 'hidden',
      'margin-bottom': '10px',
    }}>
      {/* 头部：点击展开/折叠 */}
      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '10px',
          padding: '10px 14px', cursor: 'pointer',
          background: expanded() ? '#fafafa' : 'white',
          'border-bottom': expanded() ? `1px solid ${themeColors.border}` : 'none',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{
          padding: '2px 8px', 'border-radius': '12px', 'font-size': '11px', 'font-weight': 500,
          background: cat().bg, color: cat().color, 'flex-shrink': 0,
        }}>
          {cat().label}
        </span>
        <div style={{ flex: 1, 'min-width': 0 }}>
          <div style={{ 'font-size': '13px', 'font-weight': 500, color: themeColors.textPrimary,
            overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
            {props.record.query}
          </div>
          <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '2px' }}>
            {props.record.sources.length} 个来源 · {props.record.createdAt}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', 'align-items': 'center', 'flex-shrink': 0 }}>
          <Show when={props.record.suggestions.length > 0}>
            <span style={{
              padding: '2px 6px', 'border-radius': '10px', 'font-size': '11px',
              background: '#fffbe6', color: '#d48806',
            }}>
              💡 {props.record.suggestions.length} 条建议
            </span>
          </Show>
          <span style={{ color: themeColors.textMuted, 'font-size': '12px' }}>
            {expanded() ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* 展开内容 */}
      <Show when={expanded()}>
        <div style={{ padding: '12px 14px' }}>
          {/* 摘要 */}
          <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'line-height': '1.6',
            'margin-bottom': props.record.sources.length > 0 || props.record.suggestions.length > 0 ? '12px' : '0' }}>
            {props.record.summary}
          </div>

          {/* 来源列表 */}
          <Show when={props.record.sources.length > 0}>
            <div style={{ 'margin-bottom': '12px' }}>
              <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'font-weight': 600,
                'margin-bottom': '6px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px' }}>
                来源
              </div>
              <For each={props.record.sources.slice(0, 4)}>
                {(src) => (
                  <div style={{ 'font-size': '12px', 'margin-bottom': '4px', display: 'flex', gap: '6px' }}>
                    <span style={{ color: themeColors.textMuted, 'flex-shrink': 0 }}>•</span>
                    <div>
                      <Show when={src.url} fallback={<span style={{ color: themeColors.textSecondary }}>{src.title}</span>}>
                        <a href={src.url} target="_blank" rel="noreferrer"
                          style={{ color: '#1677ff', 'text-decoration': 'none' }}
                          onClick={(e) => e.stopPropagation()}>
                          {src.title}
                        </a>
                      </Show>
                      <Show when={src.snippet}>
                        <div style={{ color: themeColors.textMuted, 'font-size': '11px', 'margin-top': '1px' }}>
                          {src.snippet.slice(0, 120)}
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* 产品建议 */}
          <Show when={props.record.suggestions.length > 0}>
            <div>
              <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'font-weight': 600,
                'margin-bottom': '8px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px' }}>
                产品建议
              </div>
              <For each={props.record.suggestions}>
                {(sug) => (
                  <div style={{
                    padding: '8px 10px', 'border-radius': '8px',
                    background: '#fafafa', border: `1px solid ${themeColors.border}`,
                    'margin-bottom': '6px',
                  }}>
                    <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{
                          display: 'inline-block', 'margin-right': '6px',
                          padding: '1px 5px', 'border-radius': '4px', 'font-size': '11px',
                          background: PRIORITY_COLOR[sug.priority] ?? '#595959',
                          color: 'white', 'font-weight': 600,
                        }}>
                          {sug.priority}
                        </span>
                        <span style={{ 'font-size': '12px', 'font-weight': 500, color: themeColors.textPrimary }}>
                          {sug.title}
                        </span>
                        <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'margin-top': '3px' }}>
                          {sug.rationale.slice(0, 100)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', 'flex-shrink': 0 }}>
                        <Show when={props.onConvertToHypothesis}>
                          <button
                            onClick={(e) => { e.stopPropagation(); props.onConvertToHypothesis!(sug); }}
                            style={{ background: 'none', border: `1px solid #d3adf7`, 'border-radius': '5px',
                              padding: '3px 7px', cursor: 'pointer', 'font-size': '11px', color: '#722ed1', 'white-space': 'nowrap' }}
                          >
                            存为假设
                          </button>
                        </Show>
                        <Show when={props.onConvertToRequirement}>
                          <button
                            onClick={(e) => { e.stopPropagation(); props.onConvertToRequirement!(sug); }}
                            style={{ background: '#1677ff', color: 'white', border: 'none', 'border-radius': '5px',
                              padding: '3px 7px', cursor: 'pointer', 'font-size': '11px', 'white-space': 'nowrap' }}
                          >
                            转为需求 →
                          </button>
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* 删除按钮 */}
          <Show when={props.onDelete}>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', 'margin-top': '8px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); props.onDelete!(props.record.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  'font-size': '11px', color: themeColors.textMuted, padding: '2px 6px' }}
              >
                删除记录
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default InsightRecordCard;
