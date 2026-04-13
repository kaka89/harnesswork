import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { myKnowledge as mockKnowledge, KnowledgeItem, KnowledgeCategory } from '../../../mock/solo';
import { loadSoloKnowledge, saveSoloKnowledge } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { BookOpen, AlertTriangle, User, Code, Search, Plus, Lightbulb } from 'lucide-solid';

const categoryConfig: Record<KnowledgeCategory, {
  label: string; icon: string; color: string; bg: string; border: string; badgeBg: string;
}> = {
  pitfall:        { label: '踩过的坑',  icon: '⚠️', color: chartColors.error, bg: themeColors.errorBg, border: themeColors.errorBorder, badgeBg: chartColors.error },
  'user-insight': { label: '用户洞察',  icon: '👤', color: themeColors.purple, bg: themeColors.purpleBg, border: themeColors.purpleBorder, badgeBg: themeColors.purple },
  'tech-note':    { label: '技术笔记',  icon: '💻', color: chartColors.primary, bg: themeColors.primaryBg, border: themeColors.primaryBorder, badgeBg: chartColors.primary },
};

const KnowledgeCard: Component<{ item: KnowledgeItem }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const cfg = () => categoryConfig[props.item.category];
  const needsExpand = () => props.item.content.length > 120;
  const displayContent = () =>
    needsExpand() && !expanded()
      ? props.item.content.slice(0, 120) + '...'
      : props.item.content;

  return (
    <div
      style={{
        'border-radius': '12px', 'margin-bottom': '12px', overflow: 'hidden',
        border: `1px solid ${props.item.aiAlert ? themeColors.warningBorder : cfg().border}`,
        background: props.item.aiAlert ? themeColors.warningBg : themeColors.surface,
      }}
    >
      <Show when={props.item.aiAlert}>
        <div style={{ padding: '4px 12px', background: themeColors.warning, color: 'white', 'font-size': '12px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          🤖 {props.item.aiAlert}
        </div>
      </Show>
      <div style={{ padding: '14px' }}>
        <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '6px' }}>{props.item.title}</div>
        <p style={{ 'font-size': '12px', color: themeColors.textSecondary, 'line-height': '1.6', 'margin-bottom': '8px', margin: '0 0 8px' }}>
          {displayContent()}
          <Show when={needsExpand()}>
            <button
              style={{ color: chartColors.primary, background: 'none', border: 'none', cursor: 'pointer', 'margin-left': '4px', 'font-size': '12px' }}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded() ? ' 收起' : ' 展开'}
            </button>
          </Show>
        </p>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
          <For each={props.item.tags}>
            {(tag) => (
              <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: cfg().bg, color: cfg().color }}>{tag}</span>
            )}
          </For>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': 'auto' }}>{props.item.date}</span>
        </div>
      </div>
    </div>
  );
};

const SoloKnowledge: Component = () => {
  const { productStore } = useAppStore();
  const [knowledge, setKnowledge] = createSignal<KnowledgeItem[]>(mockKnowledge);
  const [search, setSearch] = createSignal('');
  const [activeCategory, setActiveCategory] = createSignal<KnowledgeCategory | 'all'>('all');

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const files = await loadSoloKnowledge(workDir);
      if (files.length > 0) setKnowledge(files as unknown as KnowledgeItem[]);
    } catch {
      // Mock fallback
    }
  });

  const filtered = () => knowledge().filter((item) => {
    const matchCat = activeCategory() === 'all' || item.category === activeCategory();
    const s = search().toLowerCase();
    const matchSearch = !s
      || item.title.toLowerCase().includes(s)
      || item.content.toLowerCase().includes(s)
      || item.tags.some((t) => t.toLowerCase().includes(s));
    return matchCat && matchSearch;
  });

  const byCategory = (cat: KnowledgeCategory) => filtered().filter((i) => i.category === cat);

  const pitfalls = () => byCategory('pitfall');
  const insights = () => byCategory('user-insight');
  const notes = () => byCategory('tech-note');

  const alertItems = () => knowledge().filter((i) => i.aiAlert);

  const showCol = (cat: KnowledgeCategory) =>
    activeCategory() === 'all' || activeCategory() === cat;

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px' }}>
        <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: chartColors.primary }}>📚</span>
          个人知识库
        </h2>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{knowledge().length} 条记录</span>
          <button style={{ 'font-size': '12px', padding: '4px 12px', background: chartColors.primary, color: 'white', 'border-radius': '8px', border: 'none', cursor: 'pointer' }}>
            + 添加笔记
          </button>
        </div>
      </div>

      {/* Contrast note */}
      <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
        <strong>💡 对比团队版：</strong> 团队版是五层组织知识树（公司/平台/产品线/领域/应用），解决多人知识不一致问题。独立版是个人第二大脑，核心价值是：<strong>AI 能引用这些知识辅助决策，并在类似场景主动提醒你。</strong>
      </div>

      {/* AI Alert */}
      <Show when={alertItems().length > 0}>
        <div style={{ 'margin-bottom': '16px', padding: '14px', 'border-radius': '12px', border: `1px solid ${themeColors.warningBorder}`, background: themeColors.warningBg }}>
          <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
            <span style={{ color: themeColors.warning, 'font-size': '20px' }}>🤖</span>
            <div>
              <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>AI 知识关联提醒</div>
              <For each={alertItems()}>
                {(item) => (
                  <div style={{ 'font-size': '14px', color: themeColors.warning, padding: '2px 0' }}>
                    · 检测到「{item.title}」与当前任务相关 —{' '}
                    <span style={{ 'font-weight': 500 }}>{item.aiAlert}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '12px', 'margin-bottom': '16px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: themeColors.textMuted }}>🔍</span>
          <input
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="搜索知识库..."
            style={{ width: '100%', 'padding-left': '36px', 'padding-right': '16px', padding: '8px 16px 8px 36px', border: `1px solid ${themeColors.border}`, 'border-radius': '12px', 'font-size': '14px', outline: 'none', background: themeColors.surface, color: themeColors.text, 'box-sizing': 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            style={{ padding: '4px 12px', 'font-size': '12px', 'border-radius': '8px', border: `1px solid ${activeCategory() === 'all' ? chartColors.primary : themeColors.border}`, background: activeCategory() === 'all' ? chartColors.primary : themeColors.surface, color: activeCategory() === 'all' ? 'white' : themeColors.textSecondary, cursor: 'pointer' }}
            onClick={() => setActiveCategory('all')}
          >
            全部
          </button>
          <For each={Object.keys(categoryConfig) as KnowledgeCategory[]}>
            {(cat) => (
              <button
                style={{ padding: '4px 12px', 'font-size': '12px', 'border-radius': '8px', border: `1px solid ${activeCategory() === cat ? chartColors.primary : themeColors.border}`, background: activeCategory() === cat ? chartColors.primary : themeColors.surface, color: activeCategory() === cat ? 'white' : themeColors.textSecondary, cursor: 'pointer' }}
                onClick={() => setActiveCategory(cat)}
              >
                {categoryConfig[cat].icon} {categoryConfig[cat].label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Empty State */}
      <Show when={filtered().length === 0}>
        <div style={{ 'text-align': 'center', padding: '64px 0', color: themeColors.textMuted }}>
          <div style={{ 'font-size': '48px', 'margin-bottom': '12px' }}>📭</div>
          <div>没有找到匹配的记录</div>
        </div>
      </Show>

      {/* Three columns */}
      <Show when={filtered().length > 0}>
        <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px' }}>
          <Show when={showCol('pitfall') && pitfalls().length > 0}>
            <div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px', padding: '8px 12px', 'border-radius': '8px', border: `1px solid ${categoryConfig.pitfall.border}`, background: categoryConfig.pitfall.bg }}>
                <span>⚠️</span>
                <span style={{ 'font-weight': 600, 'font-size': '14px', color: categoryConfig.pitfall.color }}>踩过的坑</span>
                <span style={{ 'margin-left': 'auto', 'font-size': '12px', padding: '1px 6px', background: categoryConfig.pitfall.badgeBg, color: 'white', 'border-radius': '9999px' }}>{pitfalls().length}</span>
              </div>
              <For each={pitfalls()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}>
                + 记录新踩坑
              </button>
            </div>
          </Show>

          <Show when={showCol('user-insight') && insights().length > 0}>
            <div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px', padding: '8px 12px', 'border-radius': '8px', border: `1px solid ${categoryConfig['user-insight'].border}`, background: categoryConfig['user-insight'].bg }}>
                <span>👤</span>
                <span style={{ 'font-weight': 600, 'font-size': '14px', color: categoryConfig['user-insight'].color }}>用户洞察</span>
                <span style={{ 'margin-left': 'auto', 'font-size': '12px', padding: '1px 6px', background: categoryConfig['user-insight'].badgeBg, color: 'white', 'border-radius': '9999px' }}>{insights().length}</span>
              </div>
              <For each={insights()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}>
                + 记录用户洞察
              </button>
            </div>
          </Show>

          <Show when={showCol('tech-note') && notes().length > 0}>
            <div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px', padding: '8px 12px', 'border-radius': '8px', border: `1px solid ${categoryConfig['tech-note'].border}`, background: categoryConfig['tech-note'].bg }}>
                <span>💻</span>
                <span style={{ 'font-weight': 600, 'font-size': '14px', color: categoryConfig['tech-note'].color }}>技术笔记</span>
                <span style={{ 'margin-left': 'auto', 'font-size': '12px', padding: '1px 6px', background: categoryConfig['tech-note'].badgeBg, color: 'white', 'border-radius': '9999px' }}>{notes().length}</span>
              </div>
              <For each={notes()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}>
                + 记录技术笔记
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* AI Usage Hint */}
      <div style={{ 'margin-top': '16px', padding: '16px', 'border-radius': '12px', border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.primaryBg }}>
        <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
          <span style={{ color: chartColors.primary, 'font-size': '20px' }}>💡</span>
          <div>
            <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>知识库如何帮助 AI 做得更好</div>
            <p style={{ 'font-size': '12px', color: themeColors.textSecondary, margin: 0, 'line-height': '1.6' }}>
              这里记录的每一条内容都会被 AI 虚拟团队引用。当你问 dev-agent「这个 bug 怎么修」时，它会先检索你的技术笔记；当你问用户代言人「该做哪个功能」时，它会先读取你的用户洞察。你积累的越多，AI 建议越准确。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoloKnowledge;
