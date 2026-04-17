/**
 * 外部洞察看板 Tab 视图
 * 展示：产品建议汇总（已聚合） + 调研记录列表
 */
import { Component, Show, For, createMemo } from 'solid-js';
import type { InsightRecord, ProductSuggestion } from '../../services/insight-store';
import type { Hypothesis } from '../../mock/solo';
import type { RequirementOutput } from '../../mock/solo';
import InsightRecordCard from './insight-record-card';
import { themeColors, chartColors } from '../../utils/colors';

interface InsightBoardProps {
  records: InsightRecord[];
  loading: boolean;
  onDeleteRecord: (id: string) => void;
  onConvertToRequirement: (sug: ProductSuggestion, insightId: string) => void;
  onConvertToHypothesis: (sug: ProductSuggestion) => void;
}

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const PRIORITY_BG: Record<string, string> = {
  P0: '#fff1f0', P1: '#fffbe6', P2: '#e6f4ff', P3: '#f5f5f5',
};
const PRIORITY_COLOR: Record<string, string> = {
  P0: '#cf1322', P1: '#d48806', P2: '#0958d9', P3: '#595959',
};

export const InsightBoard: Component<InsightBoardProps> = (props) => {
  // 聚合所有记录中的建议，按优先级排序，去除已采纳
  const allSuggestions = createMemo(() => {
    const seen = new Set<string>();
    return props.records
      .flatMap(r => r.suggestions.map(s => ({ ...s, _insightId: r.id })))
      .filter(s => !s.adopted && !seen.has(s.id) && seen.add(s.id))
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  });

  return (
    <div style={{ height: '100%', 'overflow-y': 'auto', padding: '16px' }}>
      {/* 加载状态 */}
      <Show when={props.loading}>
        <div style={{ 'text-align': 'center', padding: '40px 0', color: themeColors.textMuted }}>
          加载洞察记录中...
        </div>
      </Show>

      {/* 空状态 */}
      <Show when={!props.loading && props.records.length === 0}>
        <div style={{
          'text-align': 'center', padding: '60px 24px',
          color: themeColors.textMuted, 'max-width': '400px', margin: '0 auto',
        }}>
          <div style={{ 'font-size': '40px', 'margin-bottom': '16px' }}>🔍</div>
          <div style={{ 'font-size': '15px', 'font-weight': 500, 'margin-bottom': '8px', color: themeColors.textSecondary }}>
            暂无外部洞察
          </div>
          <div style={{ 'font-size': '13px', 'line-height': '1.6' }}>
            在右侧 Agent 面板中，切换到
            <span style={{ color: '#1677ff', 'font-weight': 500 }}> 🔍研究</span> 模式，
            询问竞品动态或市场趋势，洞察结果将自动保存到这里。
          </div>
        </div>
      </Show>

      <Show when={!props.loading && props.records.length > 0}>
        {/* 产品建议汇总 */}
        <Show when={allSuggestions().length > 0}>
          <div style={{ 'margin-bottom': '24px' }}>
            <div style={{
              display: 'flex', 'align-items': 'center', gap: '8px',
              'margin-bottom': '12px',
            }}>
              <h3 style={{ margin: 0, 'font-size': '14px', 'font-weight': 600, color: themeColors.textPrimary }}>
                💡 产品建议
              </h3>
              <span style={{
                padding: '1px 8px', 'border-radius': '10px', 'font-size': '12px',
                background: '#fffbe6', color: '#d48806',
              }}>
                {allSuggestions().length} 条
              </span>
            </div>

            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
              <For each={allSuggestions()}>
                {(sug) => (
                  <div style={{
                    padding: '10px 14px', 'border-radius': '10px',
                    background: PRIORITY_BG[sug.priority] ?? '#fafafa',
                    border: `1px solid ${themeColors.border}`,
                  }}>
                    <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
                          <span style={{
                            padding: '1px 6px', 'border-radius': '4px', 'font-size': '11px',
                            background: PRIORITY_COLOR[sug.priority] ?? '#595959', color: 'white', 'font-weight': 700,
                          }}>
                            {sug.priority}
                          </span>
                          <span style={{ 'font-size': '13px', 'font-weight': 500, color: themeColors.textPrimary }}>
                            {sug.title}
                          </span>
                          <span style={{
                            padding: '1px 6px', 'border-radius': '10px', 'font-size': '11px',
                            background: themeColors.hover, color: themeColors.textMuted,
                          }}>
                            {sug.category}
                          </span>
                        </div>
                        <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'line-height': '1.5' }}>
                          {sug.rationale.slice(0, 150)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'flex-shrink': 0 }}>
                        <button
                          onClick={() => props.onConvertToHypothesis(sug)}
                          style={{
                            background: 'none', border: `1px solid #d3adf7`, 'border-radius': '6px',
                            padding: '4px 10px', cursor: 'pointer', 'font-size': '11px', color: '#722ed1',
                            'white-space': 'nowrap',
                          }}
                        >
                          存为假设 →
                        </button>
                        <button
                          onClick={() => props.onConvertToRequirement(sug, sug._insightId ?? '')}
                          style={{
                            background: '#1677ff', color: 'white', border: 'none', 'border-radius': '6px',
                            padding: '4px 10px', cursor: 'pointer', 'font-size': '11px',
                            'white-space': 'nowrap',
                          }}
                        >
                          转为需求 →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* 调研记录列表 */}
        <div>
          <h3 style={{ margin: '0 0 12px', 'font-size': '14px', 'font-weight': 600, color: themeColors.textPrimary }}>
            📋 调研记录
          </h3>
          <For each={props.records}>
            {(record) => (
              <InsightRecordCard
                record={record}
                onDelete={props.onDeleteRecord}
                onConvertToRequirement={(sug) => props.onConvertToRequirement(sug, record.id)}
                onConvertToHypothesis={props.onConvertToHypothesis}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default InsightBoard;
