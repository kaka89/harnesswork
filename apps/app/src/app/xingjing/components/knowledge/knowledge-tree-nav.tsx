/**
 * 知识库左侧文档树导航
 *
 * SDD-013: 按来源分组展示产品文档（产品设计 + 迭代）、个人笔记、行为知识
 * 产品文档按 filePath 前缀分为「产品设计」和「迭代」两个语义子分类，
 * 产品特性按 feature 目录分组，迭代按子目录（反馈/假设/发布/任务/归档）分组。
 */
import { Component, createSignal, For, Show } from 'solid-js';
import type { KnowledgeEntry, KnowledgeTreeGroup } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';
import { BookOpen, ChevronDown, ChevronRight, Plus, FileText, Lightbulb, Code, AlertTriangle, Layers } from 'lucide-solid';

export type { KnowledgeEntry };

// ─── SDD-013: 语义分层树结构 ─────────────────────────────────────────────────

/** 递归树节点：支持多级折叠 */
interface DocTreeSection {
  id: string;
  label: string;
  icon: string;
  entries?: KnowledgeEntry[];
  children?: DocTreeSection[];
}

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

  // SDD-013: 按 filePath 前缀将产品文档分为「产品设计」和「迭代」
  function classifyWorkspaceDocs(entries: KnowledgeEntry[]): DocTreeSection[] {
    const productEntries = entries.filter(e => e.filePath?.startsWith('product/'));
    const iterationEntries = entries.filter(e => e.filePath?.startsWith('iterations/'));
    const otherEntries = entries.filter(e =>
      !e.filePath?.startsWith('product/') &&
      !e.filePath?.startsWith('iterations/') &&
      !e.filePath?.startsWith('knowledge/')
    );

    // === 产品设计 ===
    const overview = productEntries.filter(e => /^product\/overview\./.test(e.filePath ?? ''));
    const roadmap = productEntries.filter(e => /^product\/roadmap\./.test(e.filePath ?? ''));
    const featureEntries = productEntries.filter(e =>
      e.filePath?.startsWith('product/features/') && !e.filePath?.endsWith('_index.yml')
    );

    // 按 feature 目录分组
    const featureGroups: Record<string, KnowledgeEntry[]> = {};
    for (const e of featureEntries) {
      const match = e.filePath?.match(/^product\/features\/([^/]+)\//);
      if (match) {
        const name = match[1];
        if (!featureGroups[name]) featureGroups[name] = [];
        featureGroups[name].push(e);
      }
    }
    const featureChildren: DocTreeSection[] = Object.entries(featureGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ents]) => ({ id: `feat-${name}`, label: name, icon: '📦', entries: ents }));

    const productDesignChildren: DocTreeSection[] = [];
    if (overview.length) productDesignChildren.push({ id: 'pd-overview', label: 'Overview', icon: '📋', entries: overview });
    if (roadmap.length) productDesignChildren.push({ id: 'pd-roadmap', label: 'Roadmap', icon: '🗺️', entries: roadmap });
    if (featureChildren.length) productDesignChildren.push({ id: 'pd-features', label: '产品特性', icon: '🧩', children: featureChildren });

    // === 迭代 ===
    const ITER_DIRS: Array<{ dir: string; label: string; icon: string }> = [
      { dir: 'feedbacks', label: '反馈', icon: '💬' },
      { dir: 'hypotheses', label: '产品假设', icon: '💡' },
      { dir: 'releases', label: '发布', icon: '🚀' },
      { dir: 'tasks', label: '任务', icon: '✅' },
      { dir: 'archive', label: '归档', icon: '📦' },
    ];
    const iterChildren: DocTreeSection[] = ITER_DIRS.map(({ dir, label, icon }) => ({
      id: `iter-${dir}`, label, icon,
      entries: iterationEntries.filter(e => e.filePath?.includes(`iterations/${dir}/`)),
    }));

    const sections: DocTreeSection[] = [
      { id: 'product-design', label: '产品设计', icon: '🎨', children: productDesignChildren },
      { id: 'iterations', label: '迭代', icon: '🔄', children: iterChildren },
    ];

    if (otherEntries.length) {
      sections.push({ id: 'other-docs', label: '其他', icon: '📄', entries: otherEntries });
    }

    return sections;
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
                  {/* SDD-013: Workspace docs — 按路径语义分层 */}
                  <Show when={group.source === 'workspace-doc'}>
                    <For each={classifyWorkspaceDocs(group.entries)}>
                      {(section) => (
                        <TreeSectionNode
                          section={section}
                          depth={1}
                          collapsed={collapsed()}
                          toggleSection={toggleSection}
                          selectedId={props.selectedId}
                          onSelect={props.onSelect}
                        />
                      )}
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

// ─── SDD-013: 递归树节点组件 ─────────────────────────────────────────────────

interface TreeSectionNodeProps {
  section: DocTreeSection;
  depth: number;
  collapsed: Record<string, boolean>;
  toggleSection: (id: string) => void;
  selectedId: string | null;
  onSelect: (e: KnowledgeEntry) => void;
}

/** 统一渲染各层级的折叠/展开行为，支持二级→三级→四级 */
const TreeSectionNode: Component<TreeSectionNodeProps> = (props) => {
  const isCollapsed = () => props.collapsed[props.section.id] ?? false;
  const paddingLeft = () => `${12 + props.depth * 12}px`;

  // 计算该节点下的总条目数（包含子节点）
  const totalCount = (): number => {
    let count = props.section.entries?.length ?? 0;
    if (props.section.children) {
      for (const child of props.section.children) {
        count += child.entries?.length ?? 0;
        if (child.children) {
          for (const gc of child.children) {
            count += gc.entries?.length ?? 0;
          }
        }
      }
    }
    return count;
  };

  // 无子节点且无条目时，只渲染空状态的折叠头
  const hasContent = () =>
    (props.section.entries?.length ?? 0) > 0 ||
    (props.section.children?.length ?? 0) > 0;

  return (
    <div>
      {/* 节点头部 */}
      <div
        onClick={() => props.toggleSection(props.section.id)}
        style={{
          display: 'flex', 'align-items': 'center', gap: '4px',
          padding: `4px 12px 4px ${paddingLeft()}`,
          cursor: 'pointer', 'font-size': '11px', 'font-weight': 600,
          color: themeColors.textSecondary,
        }}
      >
        <span>{isCollapsed() ? '▶' : '▼'}</span>
        <span>{props.section.icon} {props.section.label}</span>
        <span style={{ 'margin-left': 'auto' }}>{totalCount()}</span>
      </div>

      {/* 节点内容 */}
      <Show when={!isCollapsed() && hasContent()}>
        {/* 直接条目（叶节点） */}
        <Show when={props.section.entries && props.section.entries.length > 0}>
          <For each={props.section.entries}>
            {(entry) => (
              <TreeLeaf
                entry={entry}
                selected={props.selectedId === entry.id}
                onSelect={props.onSelect}
                indent={props.depth + 1}
              />
            )}
          </For>
        </Show>
        {/* 子分组（递归） */}
        <Show when={props.section.children && props.section.children.length > 0}>
          <For each={props.section.children}>
            {(child) => (
              <TreeSectionNode
                section={child}
                depth={props.depth + 1}
                collapsed={props.collapsed}
                toggleSection={props.toggleSection}
                selectedId={props.selectedId}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};

// ─── 叶节点组件 ───────────────────────────────────────────────────────

const TreeLeaf: Component<{ entry: KnowledgeEntry; selected: boolean; onSelect: (e: KnowledgeEntry) => void; indent?: number }> = (props) => {
  const icon = () => DOC_TYPE_ICON[props.entry.docType ?? props.entry.category ?? ''] ?? '📄';
  const statusKey = () => getStatusKey(props.entry);
  const badge = () => STATUS_BADGE[statusKey()];
  const pl = () => `${12 + (props.indent ?? 2) * 12}px`;

  return (
    <div
      onClick={() => props.onSelect(props.entry)}
      style={{
        display: 'flex', 'align-items': 'center', gap: '6px',
        padding: `5px 12px 5px ${pl()}`,
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
