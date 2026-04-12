import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { myKnowledge as mockKnowledge, KnowledgeItem, KnowledgeCategory } from '../../../mock/solo';
import { readMarkdownDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { BookOpen, AlertTriangle, User, Code, Search, Plus, Lightbulb } from 'lucide-solid';

const categoryConfig: Record<KnowledgeCategory, {
  label: string; icon: string; color: string; bg: string; border: string; tagClass: string;
}> = {
  pitfall:        { label: '踩过的坑',  icon: '⚠️', color: 'themeColors.error', bg: 'themeColors.surface2f0', border: 'themeColors.errorBorder', tagClass: 'bg-red-100 text-red-700' },
  'user-insight': { label: '用户洞察',  icon: '👤', color: 'chartColors.purple', bg: 'themeColors.purpleBg', border: 'themeColors.purpleBorder', tagClass: 'bg-purple-100 text-purple-700' },
  'tech-note':    { label: '技术笔记',  icon: '💻', color: 'chartColors.primary', bg: 'themeColors.primaryBg', border: 'themeColors.primaryBorder', tagClass: 'bg-blue-100 text-blue-700' },
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
      class="rounded-xl border bg-white mb-3 overflow-hidden"
      style={{
        'border-color': props.item.aiAlert ? 'themeColors.warningBorder' : cfg().border,
        background: props.item.aiAlert ? 'themeColors.surfacebe6' : 'themeColors.surface',
      }}
    >
      <Show when={props.item.aiAlert}>
        <div class="px-3 py-1.5 bg-yellow-400 text-white text-xs flex items-center gap-1.5">
          🤖 {props.item.aiAlert}
        </div>
      </Show>
      <div class="p-3.5">
        <div class="font-semibold text-sm text-gray-900 mb-1.5">{props.item.title}</div>
        <p class="text-xs text-gray-600 leading-relaxed mb-2 m-0">
          {displayContent()}
          <Show when={needsExpand()}>
            <button
              class="text-blue-500 hover:text-blue-600 ml-1"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded() ? ' 收起' : ' 展开'}
            </button>
          </Show>
        </p>
        <div class="flex items-center gap-1.5 flex-wrap">
          <For each={props.item.tags}>
            {(tag) => (
              <span class={`text-xs px-1.5 py-0.5 rounded ${cfg().tagClass}`}>{tag}</span>
            )}
          </For>
          <span class="text-xs text-gray-400 ml-auto">{props.item.date}</span>
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
    const files = await readMarkdownDir('.xingjing/solo/knowledge', workDir);
    if (files.length > 0) setKnowledge(files.map((f) => f.frontmatter as unknown as KnowledgeItem));
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
    <div>
      {/* Header */}
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
          <span class="text-blue-600">📚</span>
          个人知识库
        </h2>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{knowledge().length} 条记录</span>
          <button class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            + 添加笔记
          </button>
        </div>
      </div>

      {/* Contrast note */}
      <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
        <strong>💡 对比团队版：</strong> 团队版是五层组织知识树（公司/平台/产品线/领域/应用），解决多人知识不一致问题。独立版是个人第二大脑，核心价值是：<strong>AI 能引用这些知识辅助决策，并在类似场景主动提醒你。</strong>
      </div>

      {/* AI Alert */}
      <Show when={alertItems().length > 0}>
        <div class="mb-4 p-3.5 rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100">
          <div class="flex items-start gap-3">
            <span class="text-yellow-500 text-xl">🤖</span>
            <div>
              <div class="font-semibold text-sm text-gray-800 mb-1">AI 知识关联提醒</div>
              <For each={alertItems()}>
                {(item) => (
                  <div class="text-sm text-yellow-800 py-0.5">
                    · 检测到「{item.title}」与当前任务相关 —{' '}
                    <span class="text-yellow-600 font-medium">{item.aiAlert}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      {/* Search + Filter */}
      <div class="flex gap-3 mb-4">
        <div class="flex-1 relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="搜索知识库..."
            class="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 transition-colors"
          />
        </div>
        <div class="flex gap-1.5">
          <button
            class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              activeCategory() === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setActiveCategory('all')}
          >
            全部
          </button>
          <For each={Object.keys(categoryConfig) as KnowledgeCategory[]}>
            {(cat) => (
              <button
                class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  activeCategory() === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
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
        <div class="text-center py-16 text-gray-400">
          <div class="text-5xl mb-3">📭</div>
          <div>没有找到匹配的记录</div>
        </div>
      </Show>

      {/* Three columns */}
      <Show when={filtered().length > 0}>
        <div class="grid grid-cols-3 gap-4">
          <Show when={showCol('pitfall') && pitfalls().length > 0}>
            <div>
              <div
                class="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border"
                style={{ background: categoryConfig.pitfall.bg, 'border-color': categoryConfig.pitfall.border }}
              >
                <span>⚠️</span>
                <span class="font-semibold text-sm" style={{ color: categoryConfig.pitfall.color }}>踩过的坑</span>
                <span class="ml-auto text-xs px-1.5 py-0.5 bg-red-500 text-white rounded-full">{pitfalls().length}</span>
              </div>
              <For each={pitfalls()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 transition-colors">
                + 记录新踩坑
              </button>
            </div>
          </Show>

          <Show when={showCol('user-insight') && insights().length > 0}>
            <div>
              <div
                class="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border"
                style={{ background: categoryConfig['user-insight'].bg, 'border-color': categoryConfig['user-insight'].border }}
              >
                <span>👤</span>
                <span class="font-semibold text-sm" style={{ color: categoryConfig['user-insight'].color }}>用户洞察</span>
                <span class="ml-auto text-xs px-1.5 py-0.5 bg-purple-500 text-white rounded-full">{insights().length}</span>
              </div>
              <For each={insights()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 transition-colors">
                + 记录用户洞察
              </button>
            </div>
          </Show>

          <Show when={showCol('tech-note') && notes().length > 0}>
            <div>
              <div
                class="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border"
                style={{ background: categoryConfig['tech-note'].bg, 'border-color': categoryConfig['tech-note'].border }}
              >
                <span>💻</span>
                <span class="font-semibold text-sm" style={{ color: categoryConfig['tech-note'].color }}>技术笔记</span>
                <span class="ml-auto text-xs px-1.5 py-0.5 bg-blue-500 text-white rounded-full">{notes().length}</span>
              </div>
              <For each={notes()}>
                {(item) => <KnowledgeCard item={item} />}
              </For>
              <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 transition-colors">
                + 记录技术笔记
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* AI Usage Hint */}
      <div class="mt-4 p-4 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
        <div class="flex items-start gap-3">
          <span class="text-blue-600 text-xl">💡</span>
          <div>
            <div class="font-semibold text-sm text-gray-800 mb-1">知识库如何帮助 AI 做得更好</div>
            <p class="text-xs text-gray-600 m-0 leading-relaxed">
              这里记录的每一条内容都会被 AI 虚拟团队引用。当你问 dev-agent「这个 bug 怎么修」时，它会先检索你的技术笔记；当你问用户代言人「该做哪个功能」时，它会先读取你的用户洞察。你积累的越多，AI 建议越准确。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoloKnowledge;
