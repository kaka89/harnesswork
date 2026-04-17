/**
 * 知识库健康度仪表板
 * 可展开的健康报告面板
 */
import { Component, createSignal, For, Show } from 'solid-js';
import type { KnowledgeHealthScore, StaleEntry, PromotionCandidate } from '../../services/knowledge-health';
import { themeColors, chartColors } from '../../utils/colors';

interface KnowledgeHealthDashboardProps {
  health: KnowledgeHealthScore | null;
  loading: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function scoreLabel(score: number): string {
  if (score >= 80) return '✅ 健康';
  if (score >= 50) return '⚠️ 一般';
  return '🔴 待治理';
}

export const KnowledgeHealthDashboard: Component<KnowledgeHealthDashboardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const score = () => props.health?.overall ?? 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* 触发按钮 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'none', border: `1px solid ${themeColors.border}`, 'border-radius': '8px',
          padding: '5px 12px', cursor: 'pointer', 'font-size': '12px', 'font-weight': 500,
          color: props.loading ? themeColors.textSecondary : scoreColor(score()),
          display: 'flex', 'align-items': 'center', gap: '6px',
        }}
      >
        <Show when={!props.loading} fallback={<span>检查中...</span>}>
          <span>健康度: {score()}分 {scoreLabel(score())}</span>
          <span style={{ 'font-size': '10px' }}>{expanded() ? '▲' : '▼'}</span>
        </Show>
      </button>

      {/* 展开面板 */}
      <Show when={expanded() && props.health}>
        <div style={{
          position: 'absolute', right: 0, top: '36px', width: '360px', 'z-index': 100,
          background: 'white', 'border-radius': '10px', padding: '16px',
          'box-shadow': '0 8px 30px rgba(0,0,0,0.15)', border: `1px solid ${themeColors.border}`,
        }}>
          <div style={{ 'font-weight': 600, 'margin-bottom': '12px', 'font-size': '14px', display: 'flex', 'justify-content': 'space-between' }}>
            <span>知识库健康报告</span>
            <span style={{ color: scoreColor(score()) }}>{score()} / 100</span>
          </div>

          {/* 分来源评分 */}
          <Show when={props.health!.bySource}>
            <For each={Object.entries(props.health!.bySource ?? {})}>
              {([src, detail]) => (
                <div style={{ 'margin-bottom': '8px' }}>
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '12px', 'margin-bottom': '3px' }}>
                    <span style={{ color: themeColors.textSecondary }}>
                      {{ 'workspace-doc': '产品文档', private: '个人笔记', behavior: '行为知识' }[src] ?? src}
                    </span>
                    <span style={{ 'font-weight': 500, color: scoreColor((detail as { score: number }).score) }}>{(detail as { score: number }).score}分</span>
                  </div>
                  <div style={{ height: '4px', background: '#f3f4f6', 'border-radius': '2px' }}>
                    <div style={{ height: '4px', width: `${(detail as { score: number }).score}%`, background: scoreColor((detail as { score: number }).score), 'border-radius': '2px', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
            </For>
          </Show>

          {/* 过期条目 */}
          <Show when={(props.health!.staleEntries ?? []).length > 0}>
            <div style={{ 'margin-top': '12px', 'border-top': `1px solid ${themeColors.border}`, 'padding-top': '10px' }}>
              <div style={{ 'font-size': '12px', 'font-weight': 600, 'margin-bottom': '6px', color: '#d97706' }}>
                ⚠️ 需要关注 ({props.health!.staleEntries?.length})
              </div>
              <For each={(props.health!.staleEntries ?? []).slice(0, 3)}>
                {(e) => (
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'margin-bottom': '4px', 'padding-left': '8px' }}>
                    • {e.title} — {e.daysSinceUpdate}天未更新
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* 升级候选 */}
          <Show when={(props.health!.promotionCandidates ?? []).length > 0}>
            <div style={{ 'margin-top': '10px' }}>
              <div style={{ 'font-size': '12px', 'font-weight': 600, 'margin-bottom': '6px', color: '#7c3aed' }}>
                💡 升级建议 ({props.health!.promotionCandidates?.length})
              </div>
              <For each={(props.health!.promotionCandidates ?? []).slice(0, 2)}>
                {(c) => (
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'margin-bottom': '4px', 'padding-left': '8px' }}>
                    • {c.title} — 可升级为行为知识（引用{c.referenceCount}次）
                  </div>
                )}
              </For>
            </div>
          </Show>

          <button
            onClick={() => setExpanded(false)}
            style={{ 'margin-top': '12px', background: 'none', border: 'none', cursor: 'pointer', 'font-size': '12px', color: themeColors.textSecondary }}
          >关闭</button>
        </div>
      </Show>
    </div>
  );
};

export default KnowledgeHealthDashboard;
