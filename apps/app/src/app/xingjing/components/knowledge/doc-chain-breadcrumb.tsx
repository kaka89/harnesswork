/**
 * 文档链面包屑导航：展示 PRD → SDD → MODULE → TASK 上下游关系
 */
import { Component, For, Show } from 'solid-js';
import { themeColors, chartColors } from '../../utils/colors';
import type { KnowledgeEntry } from '../../services/knowledge-index';

const CHAIN_ORDER = ['GLOSSARY', 'PRD', 'SDD', 'MODULE', 'PLAN', 'TASK'];

interface DocChainBreadcrumbProps {
  entry: KnowledgeEntry;
  allEntries: KnowledgeEntry[];
  onNavigate: (entryId: string) => void;
}

export const DocChainBreadcrumb: Component<DocChainBreadcrumbProps> = (props) => {
  const upstream = () =>
    (props.entry.upstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

  const downstream = () =>
    (props.entry.downstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

  const currentIdx = () => CHAIN_ORDER.indexOf((props.entry.docType ?? '').toUpperCase());

  if (!props.entry.docType && upstream().length === 0 && downstream().length === 0) return null;

  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', 'flex-wrap': 'wrap', 'margin-bottom': '12px', 'font-size': '12px' }}>
      {/* 上游文档 */}
      <For each={upstream()}>
        {(up) => (
          <>
            <button
              onClick={() => props.onNavigate(up.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textSecondary, padding: '2px 6px', 'border-radius': '4px', 'font-size': '12px' }}
            >
              {up.docType ?? up.category} · {up.title.slice(0, 20)}
            </button>
            <span style={{ color: themeColors.textSecondary }}>→</span>
          </>
        )}
      </For>

      {/* 当前文档 */}
      <span style={{ padding: '2px 8px', 'border-radius': '4px', background: chartColors.primary, color: 'white', 'font-weight': 500 }}>
        {props.entry.docType ?? props.entry.category} · {props.entry.title.slice(0, 20)}
      </span>

      {/* 下游文档 */}
      <For each={downstream()}>
        {(down) => (
          <>
            <span style={{ color: themeColors.textSecondary }}>→</span>
            <button
              onClick={() => props.onNavigate(down.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textSecondary, padding: '2px 6px', 'border-radius': '4px', 'font-size': '12px' }}
            >
              {down.docType ?? down.category} · {down.title.slice(0, 20)}
            </button>
          </>
        )}
      </For>
    </div>
  );
};

export default DocChainBreadcrumb;
