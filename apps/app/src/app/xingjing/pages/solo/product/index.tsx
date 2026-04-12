import { Component, createSignal, For, Show, onMount } from 'solid-js';
import {
  hypotheses as mockHypotheses,
  featureIdeas as mockFeatureIdeas,
  competitors as mockCompetitors,
  Hypothesis,
  HypothesisStatus,
  FeatureIdea,
  Competitor,
} from '../../../mock/solo';
import { readYamlDir, readMarkdownDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { Lightbulb, Microscope } from 'lucide-solid';

const statusConfig: Record<HypothesisStatus, { label: string; icon: string; bg: string; border: string; cardBorder: string }> = {
  testing:     { label: '验证中',  icon: '🧪', bg: 'themeColors.primaryBg', border: 'themeColors.primaryBorder', cardBorder: 'themeColors.border' },
  validated:   { label: '已证实',  icon: '✅', bg: 'themeColors.successBg', border: 'themeColors.successBorder', cardBorder: 'themeColors.successBorder' },
  invalidated: { label: '已推翻',  icon: '❌', bg: 'themeColors.surface2f0', border: 'themeColors.errorBorder', cardBorder: 'themeColors.errorBorder' },
};

const impactConfig = {
  high:   { label: '高影响', colorClass: 'bg-red-100 text-red-700' },
  medium: { label: '中影响', colorClass: 'bg-orange-100 text-orange-700' },
  low:    { label: '低影响', colorClass: 'bg-gray-100 text-gray-600' },
};

const priorityColor: Record<string, string> = {
  P0: 'bg-red-500 text-white',
  P1: 'bg-yellow-400 text-white',
  P2: 'bg-blue-500 text-white',
  P3: 'bg-gray-400 text-white',
};

const HypothesisColumn: Component<{
  title: string;
  status: HypothesisStatus;
  items: Hypothesis[];
  onDetail: (h: Hypothesis) => void;
  onAddNew?: () => void;
}> = (props) => {
  const cfg = () => statusConfig[props.status];
  return (
    <div class="flex-1 min-w-0">
      <div
        class="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
        style={{ background: cfg().bg, border: `1px solid ${cfg().border}` }}
      >
        <span>{cfg().icon}</span>
        <span class="font-semibold text-sm text-gray-800">{props.title}</span>
        <span class="ml-auto text-xs px-1.5 py-0.5 bg-white rounded-full text-gray-600 border border-gray-200">
          {props.items.length}
        </span>
      </div>
      <div class="flex flex-col gap-2.5">
        <Show when={props.items.length === 0}>
          <div class="text-center py-8 text-gray-400 text-sm">暂无</div>
        </Show>
        <For each={props.items}>
          {(h) => (
            <div
              class="rounded-xl border bg-white p-3.5 cursor-pointer hover:shadow-sm transition-shadow"
              style={{ 'border-color': cfg().cardBorder }}
              onClick={() => props.onDetail(h)}
            >
              <div class="mb-2">
                <span class="font-semibold text-sm text-gray-900">「{h.belief}」</span>
              </div>
              <div class="text-xs text-gray-500 mb-2">
                ❓ {h.method}
              </div>
              <Show when={h.result}>
                <div
                  class={`mb-2 px-2.5 py-1.5 rounded-lg text-xs ${
                    props.status === 'validated' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {h.result}
                </div>
              </Show>
              <div class="flex items-center gap-2">
                <span class={`text-xs px-1.5 py-0.5 rounded ${impactConfig[h.impact].colorClass}`}>
                  {impactConfig[h.impact].label}
                </span>
                <span class="text-xs text-gray-400 ml-auto">{h.createdAt}</span>
              </div>
            </div>
          )}
        </For>
        <Show when={props.status === 'testing'}>
          <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors" onClick={() => props.onAddNew?.()}>
            + 新增假设
          </button>
        </Show>
      </div>
    </div>
  );
};

const SoloProduct: Component = () => {
  const { productStore } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<'hypotheses' | 'ideas' | 'competitors'>('hypotheses');
  const [hypotheses, setHypotheses] = createSignal<Hypothesis[]>(mockHypotheses);
  const [featureIdeas, setFeatureIdeas] = createSignal<FeatureIdea[]>(mockFeatureIdeas);
  const [competitors, setCompetitors] = createSignal<Competitor[]>(mockCompetitors);
  const [detailHypo, setDetailHypo] = createSignal<Hypothesis | null>(null);
  const [newHypothesisModal, setNewHypothesisModal] = createSignal(false);
  const [newHypothesisText, setNewHypothesisText] = createSignal('');
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal([
    {
      role: 'assistant',
      content: '我是你的「用户代言人」。我会基于你录入的用户洞察，质疑你的产品决策。\n\n试试问我：「段落重写真的是用户最需要的功能吗？」',
    },
  ]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    const [hypoFiles, ideaFiles, competitorFiles] = await Promise.all([
      readMarkdownDir('.xingjing/solo/hypotheses', workDir),
      readYamlDir<FeatureIdea>('.xingjing/solo/feature-ideas', workDir),
      readYamlDir<Competitor>('.xingjing/solo/competitors', workDir),
    ]);

    if (hypoFiles.length > 0) setHypotheses(hypoFiles.map((f: any) => f.frontmatter as unknown as Hypothesis));
    if (ideaFiles.length > 0) setFeatureIdeas(ideaFiles);
    if (competitorFiles.length > 0) setCompetitors(competitorFiles);
  });

  const testingItems = () => hypotheses().filter((h) => h.status === 'testing');
  const validatedItems = () => hypotheses().filter((h) => h.status === 'validated');
  const invalidatedItems = () => hypotheses().filter((h) => h.status === 'invalidated');

  const handleAgentSend = () => {
    if (!agentInput().trim()) return;
    const q = agentInput().trim();
    setAgentMessages(prev => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (q.includes('重写') || q.includes('段落')) {
        reply = '作为用户代言人，我要质疑这个假设 🤔\n\n根据你的数据：\n· 大纲功能只有 12% 活跃使用率，最初用户调研有 70% 感兴趣\n· 这说明「用户说想要」≠「用户会真正使用」\n\n段落重写的验证方式（邀请 5 位用户内测）可能样本量不够，建议先上线一个更粗糙的 MVP，看真实使用频率，而不是只问用户「你喜欢吗」。';
      } else if (q.includes('团队') || q.includes('协作')) {
        reply = '这是个好问题！根据你的用户反馈，有用户 zhuming@corp.com 明确询问团队版，且愿意付费 5 人。\n\n但注意：企业版功能复杂度会让你的开发成本翻倍，而且你的 NPS 42 主要来自个人用户。\n\n建议：先用「共享链接」这个轻量功能代替团队版验证需求，不要贸然做完整团队版。';
      } else {
        reply = '作为你的用户代言人，我注意到：你的活跃用户 78% 在晚间使用，说明他们是「业余写作者」而非专业作家。这个画像会影响很多产品决策……你想深入讨论哪个功能？';
      }
      setAgentMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    }, 700);
  };

  return (
    <div>
      {/* Header */}
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
          <span class="text-purple-600">💡</span>
          产品洞察
        </h2>
        <div class="flex gap-2">
          <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">🧪 {testingItems().length} 个假设验证中</span>
          <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">✅ {validatedItems().length} 个已证实</span>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-4">
        {/* Main Content */}
        <div class="col-span-8">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100">
            {/* Tabs */}
            <div class="flex border-b border-gray-100">
              <button
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab() === 'hypotheses' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('hypotheses')}
              >
                🧪 假设看板
                <span class="ml-1.5 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{testingItems().length} 验证中</span>
              </button>
              <button
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab() === 'ideas' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('ideas')}
              >
                💡 功能想法
              </button>
              <button
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab() === 'competitors' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('competitors')}
              >
                🔭 竞品雷达
              </button>
            </div>

            <div class="p-4">
              {/* Hypotheses */}
              <Show when={activeTab() === 'hypotheses'}>
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
                  <strong>💡 对比团队版：</strong> 团队版需要完整 PRD → 评审 → 批准流程，独立版直接用假设驱动验证，快速决策。
                </div>
                <div class="flex gap-3">
                  <HypothesisColumn title="验证中" status="testing" items={testingItems()} onDetail={setDetailHypo} onAddNew={() => setNewHypothesisModal(true)} />
                  <HypothesisColumn title="已证实" status="validated" items={validatedItems()} onDetail={setDetailHypo} />
                  <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems()} onDetail={setDetailHypo} />
                </div>
              </Show>

              {/* Feature Ideas */}
              <Show when={activeTab() === 'ideas'}>
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
                  <strong>💡 对比团队版：</strong> 无需 PRD 模板、Schema 校验、AI评分。一个想法 = 一张卡片，AI 直接评估优先级。
                </div>
                <div class="flex flex-col gap-3">
                  <For each={featureIdeas()}>
                    {(idea) => (
                      <div class="rounded-xl border border-gray-100 p-4">
                        <div class="flex items-start gap-3">
                          <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                              <span class={`text-xs px-2 py-0.5 rounded font-bold ${priorityColor[idea.aiPriority]}`}>
                                {idea.aiPriority}
                              </span>
                              <span class="font-semibold text-sm text-gray-900">{idea.title}</span>
                              <span class="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{idea.source}</span>
                            </div>
                            <p class="text-sm text-gray-600 mb-2 m-0">{idea.description}</p>
                            <div class="px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                              🤖 {idea.aiReason}
                            </div>
                          </div>
                          <div class="text-center flex-shrink-0">
                            <div class="text-xl font-bold text-gray-800">👍 {idea.votes}</div>
                            <div class="text-xs text-gray-400">用户投票</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                  <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 transition-colors">
                    + 记录新想法
                  </button>
                </div>
              </Show>

              {/* Competitors */}
              <Show when={activeTab() === 'competitors'}>
                <div class="grid grid-cols-2 gap-4">
                  <For each={competitors()}>
                    {(c) => (
                      <div class="rounded-xl border border-gray-100 p-4">
                        <div class="flex items-center justify-between mb-3">
                          <span class="font-semibold text-sm text-gray-900">{c.name}</span>
                          <span class="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">{c.pricing}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-3">
                          <div>
                            <div class="text-xs text-gray-400 mb-1">优势</div>
                            <For each={c.strength}>
                              {(s) => <div class="text-xs text-green-700 py-0.5">✅ {s}</div>}
                            </For>
                          </div>
                          <div>
                            <div class="text-xs text-gray-400 mb-1">劣势</div>
                            <For each={c.weakness}>
                              {(w) => <div class="text-xs text-red-600 py-0.5">⚠️ {w}</div>}
                            </For>
                          </div>
                        </div>
                        <div class="px-3 py-2 bg-green-50 rounded-lg text-xs text-green-700">
                          <strong>我们的差异化：</strong> {c.differentiation}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right: Agent */}
        <div class="col-span-4">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span class="text-purple-600">🤖</span>
              <span class="font-semibold text-sm">用户代言人 Agent</span>
            </div>
            <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              <For each={agentMessages()}>
                {(msg) => (
                  <div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      class={`max-w-[85%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white rounded-2xl rounded-br-sm'
                          : 'bg-purple-50 text-gray-800 rounded-2xl rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </For>
            </div>
            <div class="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-1.5">
              <For each={['段落重写真的需要吗？', '团队版应该做吗？', '用户最真实的痛点']}>
                {(q) => (
                  <button
                    class="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-full border border-gray-200 transition-colors"
                    onClick={() => setAgentInput(q)}
                  >
                    {q}
                  </button>
                )}
              </For>
            </div>
            <div class="p-3 flex gap-2">
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
                placeholder="质疑我的产品决策..."
                class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-400"
              />
              <button
                onClick={handleAgentSend}
                class="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-2 text-sm transition-colors"
              >→</button>
            </div>
          </div>
        </div>
      </div>

      {/* Hypothesis Detail Modal */}
      <Show when={detailHypo()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/30" onClick={() => setDetailHypo(null)} />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <span class="font-semibold text-base text-gray-900">
                假设详情 · {statusConfig[detailHypo()!.status].label}
              </span>
              <button class="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setDetailHypo(null)}>✕</button>
            </div>
            <div class="flex flex-col gap-3">
              <div>
                <div class="text-xs text-gray-400 mb-1">我认为</div>
                <div class="text-base font-semibold text-gray-900">「{detailHypo()!.belief}」</div>
              </div>
              <div>
                <div class="text-xs text-gray-400 mb-1">因为</div>
                <div class="text-sm text-gray-700">{detailHypo()!.why}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400 mb-1">验证方式</div>
                <div class="text-sm text-gray-700">{detailHypo()!.method}</div>
              </div>
              <Show when={detailHypo()!.result}>
                <div
                  class={`p-3 rounded-xl text-sm ${
                    detailHypo()!.status === 'validated' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  <div class="text-xs mb-1 opacity-70">实际结果</div>
                  {detailHypo()!.result}
                </div>
              </Show>
              <div class="flex items-center gap-2">
                <span class={`text-xs px-2 py-0.5 rounded ${impactConfig[detailHypo()!.impact].colorClass}`}>
                  {impactConfig[detailHypo()!.impact].label}
                </span>
                <span class="text-xs text-gray-400">创建于 {detailHypo()!.createdAt}</span>
                <Show when={detailHypo()!.validatedAt}>
                  <span class="text-xs text-gray-400">· 验证于 {detailHypo()!.validatedAt}</span>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* New Hypothesis Modal */}
      <Show when={newHypothesisModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: 'themeColors.surface', 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '480px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600 }}>新增假设</h3>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>假设信念</label>
              <input
                type="text"
                placeholder="我认为..."
                value={newHypothesisText()}
                onInput={(e) => setNewHypothesisText(e.currentTarget.value)}
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>验证方式</label>
              <textarea
                rows={4}
                placeholder="如何验证这个假设..."
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button
                style={{ background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => setNewHypothesisModal(false)}
              >取消</button>
              <button
                style={{ background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => setNewHypothesisModal(false)}
              >保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloProduct;
