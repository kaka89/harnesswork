import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { myKnowledge as mockKnowledge, KnowledgeItem, KnowledgeCategory } from '../../../mock/solo';
import { loadSoloKnowledge, saveSoloKnowledge } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { BookOpen, AlertTriangle, User, Code, Search, Plus, Lightbulb } from 'lucide-solid';
import { listBehaviorKnowledge, type BehaviorKnowledge, type SkillApiAdapter } from '../../../services/knowledge-behavior';
import { buildKnowledgeIndex, type KnowledgeIndex } from '../../../services/knowledge-index';
import { checkKnowledgeHealth, type KnowledgeHealthScore, type StaleEntry, type PromotionCandidate } from '../../../services/knowledge-health';
import { invalidateKnowledgeCache } from '../../../services/knowledge-retrieval';

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

// ─── 知识源分类 Tab ───────────────────────────────────────────────

type KnowledgeSourceTab = 'private' | 'behavior';

// ─── 健康度徽章组件 ──────────────────────────────────────────────

const HealthBadge: Component<{ score: number }> = (props) => {
  const color = () => props.score >= 80 ? chartColors.success : props.score >= 50 ? chartColors.warning : chartColors.error;
  const label = () => props.score >= 80 ? '健康' : props.score >= 50 ? '一般' : '待治理';
  return (
    <span style={{
      'font-size': '12px', padding: '2px 8px', 'border-radius': '9999px',
      background: color(), color: 'white', 'font-weight': 600,
    }}>
      {props.score}分 · {label()}
    </span>
  );
};

// ─── 晃升建议卡片 ──────────────────────────────────────────────

const PromotionAlert: Component<{ candidates: PromotionCandidate[] }> = (props) => {
  return (
    <Show when={props.candidates.length > 0}>
      <div style={{ 'margin-bottom': '16px', padding: '14px', 'border-radius': '12px', border: `1px solid ${themeColors.successBorder ?? '#b7eb8f'}`, background: themeColors.successBg ?? '#f6ffed' }}>
        <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
          <span style={{ 'font-size': '20px' }}>⬆️</span>
          <div>
            <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>晃升建议：私有知识 → 行为知识</div>
            <For each={props.candidates}>
              {(c) => (
                <div style={{ 'font-size': '12px', color: themeColors.textSecondary, padding: '2px 0' }}>
                  · 「{c.title}」已被引用 {c.referenceCount} 次 — {c.reason}
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
};

// ─── Stale 警告 ──────────────────────────────────────────────

const StaleWarning: Component<{ entries: StaleEntry[] }> = (props) => {
  return (
    <Show when={props.entries.length > 0}>
      <div style={{ 'margin-bottom': '16px', padding: '14px', 'border-radius': '12px', border: `1px solid ${themeColors.warningBorder}`, background: themeColors.warningBg }}>
        <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
          <span style={{ 'font-size': '20px' }}>⏰</span>
          <div>
            <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>{props.entries.length} 条知识已过期</div>
            <For each={props.entries.slice(0, 5)}>
              {(e) => (
                <div style={{ 'font-size': '12px', color: themeColors.warning, padding: '2px 0' }}>
                  · [{e.source === 'behavior' ? 'Skill' : e.source === 'private' ? '笔记' : '文档'}] {e.title} — {e.daysSinceUpdate} 天未更新
                </div>
              )}
            </For>
            <Show when={props.entries.length > 5}>
              <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '4px' }}>… 另有 {props.entries.length - 5} 条</div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

// ─── 行为知识卡片 ──────────────────────────────────────────────

const BehaviorKnowledgeCard: Component<{ item: BehaviorKnowledge }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const needsExpand = () => props.item.content.length > 120;
  const displayContent = () =>
    needsExpand() && !expanded()
      ? props.item.content.slice(0, 120) + '...'
      : props.item.content;

  return (
    <div style={{
      'border-radius': '12px', 'margin-bottom': '12px', overflow: 'hidden',
      border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.surface,
    }}>
      <div style={{ padding: '4px 12px', background: chartColors.primary, color: 'white', 'font-size': '11px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
        ✨ Skill · {props.item.category} · {props.item.lifecycle}
      </div>
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
              <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: themeColors.primaryBg, color: chartColors.primary }}>{tag}</span>
            )}
          </For>
          <Show when={props.item.applicableScenes.length > 0}>
            <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-left': 'auto' }}>
              适用: {props.item.applicableScenes.join(', ')}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

// ─── 主组件 ──────────────────────────────────────────────
const SoloKnowledge: Component = () => {
  const { productStore, store } = useAppStore();
  const [knowledge, setKnowledge] = createSignal<KnowledgeItem[]>(mockKnowledge);
  const [behaviorItems, setBehaviorItems] = createSignal<BehaviorKnowledge[]>([]);
  const [search, setSearch] = createSignal('');
  const [activeCategory, setActiveCategory] = createSignal<KnowledgeCategory | 'all'>('all');
  const [sourceTab, setSourceTab] = createSignal<KnowledgeSourceTab>('private');
  const [healthReport, setHealthReport] = createSignal<KnowledgeHealthScore | null>(null);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    // 加载私有知识
    try {
      const files = await loadSoloKnowledge(workDir);
      if (files.length > 0) setKnowledge(files as unknown as KnowledgeItem[]);
    } catch {
      // Mock fallback
    }

    // 加载行为知识 + 健康报告
    try {
      const skillApi: SkillApiAdapter = {
        listSkills: () => store.actions.listOpenworkSkills(),
        getSkill: (name: string) => store.actions.getOpenworkSkill(name),
        upsertSkill: (name: string, content: string, desc?: string) => store.actions.upsertOpenworkSkill(name, content, desc),
      };
      const items = await listBehaviorKnowledge(skillApi);
      setBehaviorItems(items);

      try {
        const index = await buildKnowledgeIndex(workDir, skillApi);
        const report = await checkKnowledgeHealth(workDir, index);
        setHealthReport(report);
      } catch {
        // health check is best-effort
      }
    } catch {
      // Skill API not available
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

  const filteredBehavior = () => {
    const s = search().toLowerCase();
    if (!s) return behaviorItems();
    return behaviorItems().filter(item =>
      item.title.toLowerCase().includes(s)
      || item.content.toLowerCase().includes(s)
      || item.tags.some(t => t.toLowerCase().includes(s))
    );
  };

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
          知识中心
          <Show when={healthReport()}>
            <HealthBadge score={healthReport()!.overall} />
          </Show>
        </h2>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>
            {sourceTab() === 'private' ? knowledge().length : behaviorItems().length} 条记录
          </span>
          <button style={{ 'font-size': '12px', padding: '4px 12px', background: chartColors.primary, color: 'white', 'border-radius': '8px', border: 'none', cursor: 'pointer' }}>
            + 添加笔记
          </button>
        </div>
      </div>

      {/* Source Tab Switcher */}
      <div style={{ display: 'flex', gap: '4px', 'margin-bottom': '16px', padding: '4px', background: themeColors.hover, 'border-radius': '10px', width: 'fit-content' }}>
        <button
          style={{ padding: '6px 16px', 'font-size': '13px', 'border-radius': '8px', border: 'none', cursor: 'pointer', 'font-weight': sourceTab() === 'private' ? 600 : 400, background: sourceTab() === 'private' ? themeColors.surface : 'transparent', color: sourceTab() === 'private' ? themeColors.text : themeColors.textSecondary, 'box-shadow': sourceTab() === 'private' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          onClick={() => setSourceTab('private')}
        >
          📝 私有知识
        </button>
        <button
          style={{ padding: '6px 16px', 'font-size': '13px', 'border-radius': '8px', border: 'none', cursor: 'pointer', 'font-weight': sourceTab() === 'behavior' ? 600 : 400, background: sourceTab() === 'behavior' ? themeColors.surface : 'transparent', color: sourceTab() === 'behavior' ? themeColors.text : themeColors.textSecondary, 'box-shadow': sourceTab() === 'behavior' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          onClick={() => setSourceTab('behavior')}
        >
          ✨ 行为知识 (Skill)
        </button>
      </div>

      {/* Health Alerts: Promotion + Stale */}
      <Show when={healthReport()}>
        <PromotionAlert candidates={healthReport()!.promotionCandidates} />
        <StaleWarning entries={healthReport()!.staleEntries} />
      </Show>

      {/* Contrast note */}
      <Show when={sourceTab() === 'private'}>
        <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
          <strong>💡 对比团队版：</strong> 团队版是五层组织知识树（公司/平台/产品线/领域/应用），解决多人知识不一致问题。独立版是个人第二大脑，核心价值是：<strong>AI 能引用这些知识辅助决策，并在类似场景主动提醒你。</strong>
        </div>
      </Show>

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

      {/* Three columns - Private Knowledge */}
      <Show when={sourceTab() === 'private' && filtered().length > 0}>
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

      {/* Behavior Knowledge List */}
      <Show when={sourceTab() === 'behavior'}>
        <Show when={filteredBehavior().length === 0}>
          <div style={{ 'text-align': 'center', padding: '64px 0', color: themeColors.textMuted }}>
            <div style={{ 'font-size': '48px', 'margin-bottom': '12px' }}>✨</div>
            <div>暂无行为知识（Skill）</div>
            <p style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '8px' }}>
              Agent 执行后会自动提取可复用的知识并存储为 Skill，或者私有知识被多次引用后会建议晃升。
            </p>
          </div>
        </Show>
        <Show when={filteredBehavior().length > 0}>
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '16px' }}>
            <For each={filteredBehavior()}>
              {(item) => <BehaviorKnowledgeCard item={item} />}
            </For>
          </div>
        </Show>
      </Show>

      {/* Glossary Consistency Issues */}
      <Show when={healthReport() && healthReport()!.consistency.glossaryIssues.length > 0}>
        <div style={{ 'margin-top': '16px', padding: '14px', 'border-radius': '12px', border: `1px solid ${themeColors.warningBorder}`, background: themeColors.warningBg }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>🔍 术语一致性问题</div>
          <For each={healthReport()!.consistency.glossaryIssues}>
            {(issue) => (
              <div style={{ 'font-size': '12px', color: themeColors.warning, padding: '2px 0' }}>
                · 术语「{issue.term}」在 {issue.conflictingEntries.length} 个文档中存在不同定义
              </div>
            )}
          </For>
        </div>
      </Show>
      <div style={{ 'margin-top': '16px', padding: '16px', 'border-radius': '12px', border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.primaryBg }}>
        <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
          <span style={{ color: chartColors.primary, 'font-size': '20px' }}>💡</span>
          <div>
            <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>知识中心如何帮助 AI 做得更好</div>
            <p style={{ 'font-size': '12px', color: themeColors.textSecondary, margin: 0, 'line-height': '1.6' }}>
              每条知识都会被 AI 虚拟团队自动检索并引用。私有知识被引用超过 5 次会建议晃升为行为知识（Skill），让全局复用。超过 90 天未更新且无引用的知识会被标记为过期，可更新或废弃。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoloKnowledge;
