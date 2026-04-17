/**
 * 知识库左侧文档树导航
 * 按来源分组展示产品文档、个人笔记、行为知识
 */
import { Component, createSignal, For, Show } from 'solid-js';
import type { KnowledgeEntry, KnowledgeTreeGroup } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';
import { BookOpen, ChevronDown, ChevronRight, Plus, FileText, Lightbulb, Code, AlertTriangle, Layers } from 'lucide-solid';

export type { KnowledgeEntry };

const DOC_TYPE_ICON: Record<string, string> = {
  PRD: '📄', SDD: '🔧', MODULE: '🧩', PLAN: '📋', TASK: '✅',
  GLOSSARY: '📖', pitfall: '🕳', 'user-insight': '👁', 'tech-note': '💻',
  'best-practice': '⭐', architecture: '🏛', process: '🔄', glossary: '📖',
  scenario: '🎭', hypothesis: '💡', release: '🚀', adr: '⚖️', feedback: '💬',
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  approved: { label: '✅', color: '#16a34a' },
  reviewing: { label: '⏳', color: '#d97706' },
  draft: { label: '✏️', color: '#6b7280' },
  validated: { label: '✅', color: '#16a34a' },
  testing: { label: '🧪', color: '#7c3aed' },
  done: { label: '✅', color: '#16a34a' },
  'in-progress': { label: '🔄', color: '#2563eb' },
  accepted: { label: '✅', color: '#16a34a' },
  superseded: { label: '🔁', color: '#9ca3af' },
  stable: { label: '🔒', color: '#6b7280' },
  living: { label: '🌱', color: '#16a34a' },
};

function getDocTypeLabel(entry: KnowledgeEntry): string {
  if (entry.docType) return entry.docType;
  if (entry.category) return entry.category;
  return entry.source;
}

function getStatusKey(entry: KnowledgeEntry): string {
  const fm = entry as KnowledgeEntry & { frontmatter?: Record<string, unknown> };
  if (fm.frontmatter?.status) return String(fm.frontmatter.status);
  return entry.lifecycle ?? 'living';
}

interface KnowledgeTreeNavProps {
  groups: KnowledgeTreeGroup[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (entry: KnowledgeEntry) => void;
  onCreateNote?: (category: 'pitfall' | 'user-insight' | 'tech-note') => void;
  onRefresh?: () => void;
}

export const KnowledgeTreeNav: Component<KnowledgeTreeNavProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  };

  const sectionColor: Record<string, string> = {
    'workspace-docs': chartColors.primary,
    'private-notes': themeColors.purple,
    behavior: '#16a34a',
  };

  // Sub-grouping for workspace docs by docType
  function subGroupWorkspaceDocs(entries: KnowledgeEntry[]): Array<{ label: string; entries: KnowledgeEntry[] }> {
    const groups: Record<string, KnowledgeEntry[]> = {};
    for (const e of entries) {
      const key = e.docType ?? e.category ?? '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    const ORDER = ['PRD', 'SDD', 'MODULE', 'PLAN', 'TASK', 'GLOSSARY'];
    return Object.entries(groups)
      .sort(([a], [b]) => {
        const ai = ORDER.indexOf(a.toUpperCase());
        const bi = ORDER.indexOf(b.toUpperCase());
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([label, ents]) => ({ label, entries: ents }));
  }

  // Sub-grouping for private notes by category
  function subGroupPrivate(entries: KnowledgeEntry[]): Array<{ label: string; cat: string; entries: KnowledgeEntry[] }> {
    const CATS: Array<{ cat: string; label: string }> = [
      { cat: 'pitfall', label: '踩坑记录' },
      { cat: 'user-insight', label: '用户洞察' },
      { cat: 'tech-note', label: '技术笔记' },
    ];
    return CATS.map(({ cat, label }) => ({
      label, cat,
      entries: entries.filter((e) => e.category === cat),
    }));
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶部操作栏 */}
      <div style={{ padding: '8px 12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'border-bottom': `1px solid ${themeColors.border}` }}>
        <span style={{ 'font-size': '13px', 'font-weight': 600, color: themeColors.text }}>知识库</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Show when={props.onRefresh}>
            <button
              title="刷新索引"
              onClick={props.onRefresh}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textSecondary, padding: '2px 4px', 'font-size': '13px', 'border-radius': '4px' }}
            >↺</button>
          </Show>
        </div>
      </div>

      {/* Loading */}
      <Show when={props.loading}>
        <div style={{ padding: '16px', 'text-align': 'center', color: themeColors.textSecondary, 'font-size': '12px' }}>
          索引加载中...
        </div>
      </Show>

      {/* 树形内容 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <For each={props.groups}>
          {(group) => {
            const isCollapsed = () => collapsed()[group.id] ?? false;
            const color = sectionColor[group.id] ?? chartColors.primary;

            return (
              <div>
                {/* Section 头部 */}
                <div
                  onClick={() => toggleSection(group.id)}
                  style={{ display: 'flex', 'align-items': 'center', gap: '4px', padding: '6px 12px', cursor: 'pointer', 'user-select': 'none', color: themeColors.text, 'font-size': '12px', 'font-weight': 600 }}
                >
                  <span style={{ color, 'font-size': '10px' }}>{isCollapsed() ? '▶' : '▼'}</span>
                  <span>{group.label}</span>
                  <span style={{ 'margin-left': 'auto', color: themeColors.textSecondary, 'font-weight': 400 }}>{group.entries.length}</span>
                  <Show when={group.source === 'private' && props.onCreateNote}>
                    <button
                      title="新建笔记"
                      onClick={(e) => { e.stopPropagation(); props.onCreateNote?.('tech-note'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textSecondary, padding: '0 2px', 'line-height': 1 }}
                    >+</button>
                  </Show>
                </div>

                {/* Section 内容 */}
                <Show when={!isCollapsed()}>
                  {/* Workspace docs: sub-grouped by docType */}
                  <Show when={group.source === 'workspace-doc'}>
                    <For each={subGroupWorkspaceDocs(group.entries)}>
                      {(sub) => {
                        const subKey = `ws-${sub.label}`;
                        const subCollapsed = () => collapsed()[subKey] ?? false;
                        return (
                          <div>
                            <div
                              onClick={() => toggleSection(subKey)}
                              style={{ display: 'flex', 'align-items': 'center', gap: '4px', padding: '4px 12px 4px 24px', cursor: 'pointer', 'font-size': '11px', 'font-weight': 600, color: themeColors.textSecondary }}
                            >
                              <span>{subCollapsed() ? '▶' : '▼'}</span>
                              <span>{DOC_TYPE_ICON[sub.label] ?? '📄'} {sub.label}</span>
                              <span style={{ 'margin-left': 'auto' }}>{sub.entries.length}</span>
                            </div>
                            <Show when={!subCollapsed()}>
                              <For each={sub.entries}>
                                {(entry) => <TreeLeaf entry={entry} selected={props.selectedId === entry.id} onSelect={props.onSelect} />}
                              </For>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </Show>

                  {/* Private notes: sub-grouped by category */}
                  <Show when={group.source === 'private'}>
                    <For each={subGroupPrivate(group.entries)}>
                      {(sub) => {
                        const subKey = `pv-${sub.cat}`;
                        const subCollapsed = () => collapsed()[subKey] ?? false;
                        return (
                          <div>
                            <div
                              onClick={() => toggleSection(subKey)}
                              style={{ display: 'flex', 'align-items': 'center', gap: '4px', padding: '4px 12px 4px 24px', cursor: 'pointer', 'font-size': '11px', 'font-weight': 600, color: themeColors.textSecondary }}
                            >
                              <span>{subCollapsed() ? '▶' : '▼'}</span>
                              <span>{DOC_TYPE_ICON[sub.cat] ?? '📝'} {sub.label}</span>
                              <span style={{ 'margin-left': 'auto' }}>{sub.entries.length}</span>
                            </div>
                            <Show when={!subCollapsed()}>
                              <For each={sub.entries}>
                                {(entry) => <TreeLeaf entry={entry} selected={props.selectedId === entry.id} onSelect={props.onSelect} />}
                              </For>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </Show>

                  {/* Behavior knowledge: flat list */}
                  <Show when={group.source === 'behavior'}>
                    <For each={group.entries}>
                      {(entry) => <TreeLeaf entry={entry} selected={props.selectedId === entry.id} onSelect={props.onSelect} />}
                    </For>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>

        <Show when={!props.loading && props.groups.every((g) => g.entries.length === 0)}>
          <div style={{ padding: '16px', color: themeColors.textSecondary, 'font-size': '12px', 'text-align': 'center' }}>
            暂无知识条目
          </div>
        </Show>
      </div>
    </div>
  );
};

const TreeLeaf: Component<{ entry: KnowledgeEntry; selected: boolean; onSelect: (e: KnowledgeEntry) => void }> = (props) => {
  const icon = () => DOC_TYPE_ICON[props.entry.docType ?? props.entry.category ?? ''] ?? '📄';
  const statusKey = () => getStatusKey(props.entry);
  const badge = () => STATUS_BADGE[statusKey()];

  return (
    <div
      onClick={() => props.onSelect(props.entry)}
      style={{
        display: 'flex', 'align-items': 'center', gap: '6px', padding: '5px 12px 5px 32px',
        cursor: 'pointer', 'font-size': '12px',
        background: props.selected ? themeColors.primaryBg : 'transparent',
        color: props.selected ? chartColors.primary : themeColors.text,
        'border-left': props.selected ? `2px solid ${chartColors.primary}` : '2px solid transparent',
      }}
    >
      <span style={{ 'flex-shrink': 0 }}>{icon()}</span>
      <span style={{ flex: 1, overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{props.entry.title}</span>
      <Show when={badge()}>
        <span title={statusKey()} style={{ 'flex-shrink': 0, 'font-size': '10px' }}>{badge()?.label}</span>
      </Show>
    </div>
  );
};

export default KnowledgeTreeNav;
