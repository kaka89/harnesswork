import { Component, createSignal, createEffect, For, Show, onMount } from 'solid-js';
import {
  hypotheses as mockHypotheses,
  featureIdeas as mockFeatureIdeas,
  competitors as mockCompetitors,
  requirementOutputs as mockRequirements,
  Hypothesis,
  HypothesisStatus,
  FeatureIdea,
  Competitor,
  RequirementOutput,
  reqTypeLabel,
} from '../../../mock/solo';
import { loadHypotheses, loadFeatureIdeas, loadCompetitors, loadRequirementOutputs } from '../../../services/file-store';
import { SOLO_AGENTS } from '../../../services/autopilot-executor';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { Lightbulb, Microscope, FileText } from 'lucide-solid';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const statusConfig: Record<HypothesisStatus, { label: string; icon: string; bg: string; border: string; cardBorder: string }> = {
  testing:     { label: '验证中',  icon: '🧪', bg: themeColors.primaryBg, border: themeColors.primaryBorder, cardBorder: themeColors.border },
  validated:   { label: '已证实',  icon: '✅', bg: themeColors.successBg, border: themeColors.successBorder, cardBorder: themeColors.successBorder },
  invalidated: { label: '已推翻',  icon: '❌', bg: themeColors.errorBg, border: themeColors.errorBorder, cardBorder: themeColors.errorBorder },
};

const impactConfig: Record<string, { label: string; bg: string; color: string }> = {
  high:   { label: '高影响', bg: themeColors.errorBg, color: chartColors.error },
  medium: { label: '中影响', bg: themeColors.warningBg, color: themeColors.warningDark },
  low:    { label: '低影响', bg: themeColors.hover, color: themeColors.textSecondary },
};

const priorityStyle: Record<string, { bg: string }> = {
  P0: { bg: chartColors.error },
  P1: { bg: chartColors.warning },
  P2: { bg: chartColors.primary },
  P3: { bg: themeColors.textMuted },
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
    <div style={{ flex: 1, 'min-width': 0 }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px', padding: '8px 12px', 'border-radius': '8px', background: cfg().bg, border: `1px solid ${cfg().border}` }}>
        <span>{cfg().icon}</span>
        <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{props.title}</span>
        <span style={{ 'margin-left': 'auto', 'font-size': '12px', padding: '1px 6px', background: themeColors.surface, 'border-radius': '9999px', color: themeColors.textSecondary, border: `1px solid ${themeColors.border}` }}>
          {props.items.length}
        </span>
      </div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <Show when={props.items.length === 0}>
          <div style={{ 'text-align': 'center', padding: '32px 0', color: themeColors.textMuted, 'font-size': '14px' }}>暂无</div>
        </Show>
        <For each={props.items}>
          {(h) => {
            const impact = impactConfig[h.impact] || impactConfig.low;
            return (
              <div
                style={{ 'border-radius': '12px', border: `1px solid ${cfg().cardBorder}`, background: themeColors.surface, padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onClick={() => props.onDetail(h)}
              >
                <div style={{ 'margin-bottom': '8px' }}>
                  <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>「{h.belief}」</span>
                </div>
                <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px' }}>
                  ❓ {h.method}
                </div>
                <Show when={h.result}>
                  <div style={{ 'margin-bottom': '8px', padding: '6px 10px', 'border-radius': '8px', 'font-size': '12px', background: props.status === 'validated' ? themeColors.successBg : themeColors.errorBg, color: props.status === 'validated' ? chartColors.success : chartColors.error }}>
                    {h.result}
                  </div>
                </Show>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                  <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: impact.bg, color: impact.color }}>
                    {impact.label}
                  </span>
                  <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': 'auto' }}>{h.createdAt}</span>
                </div>
              </div>
            );
          }}
        </For>
        <Show when={props.status === 'testing'}>
          <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }} onClick={() => props.onAddNew?.()}>
            + 新增假设
          </button>
        </Show>
      </div>
    </div>
  );
};

const productBrainAgent = SOLO_AGENTS.find(a => a.id === 'product-brain')!;

function markdownToSafeHtml(md: string): string {
  const rawHtml = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}

const SoloProduct: Component = () => {
  const { productStore, state, actions } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<'hypotheses' | 'ideas' | 'competitors' | 'requirements'>('hypotheses');
  const [hypotheses, setHypotheses] = createSignal<Hypothesis[]>(mockHypotheses);
  const [featureIdeas, setFeatureIdeas] = createSignal<FeatureIdea[]>(mockFeatureIdeas);
  const [competitors, setCompetitors] = createSignal<Competitor[]>(mockCompetitors);
  const [requirements, setRequirements] = createSignal<RequirementOutput[]>(mockRequirements);
  const [detailHypo, setDetailHypo] = createSignal<Hypothesis | null>(null);
  const [editMode, setEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [editContent, setEditContent] = createSignal('');
  const [newHypothesisModal, setNewHypothesisModal] = createSignal(false);
  const [newHypothesisText, setNewHypothesisText] = createSignal('');
  const [agentInput, setAgentInput] = createSignal('');
  const [agentLoading, setAgentLoading] = createSignal(false);
  let messagesRef: HTMLDivElement | undefined;
  const [agentMessages, setAgentMessages] = createSignal([
    {
      role: 'assistant',
      content: '我是你的「AI产品搭档」，定位为精益型产品顾问。\n\n我擅长需求分析、假设拆解、用户洞察和功能优先级排序，以 solo 创业者视角帮你聚焦 MVP，识别最核心的用户价值。\n\n试试问我：「这个功能的 MVP 边界是什么？」',
    },
  ]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    try {
      const [fileHypo, fileIdeas, fileCompetitors, fileReqs] = await Promise.all([
        loadHypotheses(workDir),
        loadFeatureIdeas(workDir),
        loadCompetitors(workDir),
        loadRequirementOutputs(workDir),
      ]);
      if (fileHypo.length > 0) setHypotheses(fileHypo as unknown as Hypothesis[]);
      if (fileIdeas.length > 0) setFeatureIdeas(fileIdeas as unknown as FeatureIdea[]);
      if (fileCompetitors.length > 0) setCompetitors(fileCompetitors as unknown as Competitor[]);
      if (fileReqs.length > 0) setRequirements(fileReqs as unknown as RequirementOutput[]);
    } catch {
      // Mock fallback
    }
  });

  const testingItems = () => hypotheses().filter((h) => h.status === 'testing');
  const validatedItems = () => hypotheses().filter((h) => h.status === 'validated');
  const invalidatedItems = () => hypotheses().filter((h) => h.status === 'invalidated');

  // 自动滚动到底部
  const scrollToBottom = () => {
    if (messagesRef) {
      messagesRef.scrollTo({ top: messagesRef.scrollHeight, behavior: 'smooth' });
    }
  };

  createEffect(() => {
    agentMessages(); // track
    setTimeout(scrollToBottom, 50);
  });

  // 打开假设详情时初始化编辑内容
  const openHypoDetail = (h: Hypothesis) => {
    setDetailHypo(h);
    setEditMode('preview');
    const md = h.markdownDetail || `## 假设：${h.belief}\n\n### 因为\n\n${h.why}\n\n### 验证方式\n\n${h.method}${h.result ? `\n\n### 实际结果\n\n${h.result}` : ''}`;
    setEditContent(md);
  };

  const handleAgentSend = () => {
    if (!agentInput().trim() || agentLoading()) return;
    const q = agentInput().trim();
    setAgentMessages(prev => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setAgentLoading(true);

    // 添加空占位消息用于流式输出
    setAgentMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    const assistantIdx = agentMessages().length - 1;

    const systemPrompt = productBrainAgent.systemPrompt;

    void actions.callAgent({
      systemPrompt,
      userPrompt: q,
      title: '产品搭档对话',
      onText: (accumulated) => {
        setAgentMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: accumulated } : m
        ));
      },
      onDone: () => {
        setAgentLoading(false);
      },
      onError: () => {
        // 降级到 mock 回复
        let reply = '';
        if (q.includes('重写') || q.includes('段落') || q.includes('MVP')) {
          reply = '[离线模式] 作为AI产品搭档，我来分析这个假设：\n\n根据数据：\n· 大纲功能只有 12% 活跃使用率，最初用户调研有 70% 感兴趣\n· 这说明「用户说想要」≠「用户会真正使用」\n\n段落重写的验证方式（邀请 5 位用户内测）可能样本量不够，建议先上线一个更粗糙的 MVP，看真实使用频率。';
        } else if (q.includes('团队') || q.includes('协作')) {
          reply = '[离线模式] 根据用户反馈，有用户 zhuming@corp.com 明确询问团队版，且愿意付费 5 人。\n\n但注意：企业版功能复杂度会让开发成本翻倍，且 NPS 42 主要来自个人用户。\n\n建议：先用「共享链接」这个轻量功能代替团队版验证需求。';
        } else if (q.includes('优先') || q.includes('假设')) {
          reply = '[离线模式] 当前假设优先级建议：\n\n1. **P0** 段落重写（h1）— 与核心写作体验直接相关\n2. **P1** 团队协作（h2）— 付费潜力大但成本高\n3. **P2** 语音输入（h3）— 中等影响，可延后验证\n\n建议聚焦 h1，快速 MVP 验证。';
        } else {
          reply = '[离线模式] 作为你的AI产品搭档，我注意到：你的活跃用户 78% 在晚间使用，说明他们是「业余写作者」而非专业作家。这个画像会影响很多产品决策……你想深入讨论哪个功能？';
        }
        setAgentMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: reply } : m
        ));
        setAgentLoading(false);
      },
    });
  };

  const tabStyle = (isActive: boolean): Record<string, string | number> => ({
    padding: '8px 16px', 'font-size': '14px', 'font-weight': 500,
    'border-bottom': isActive ? `2px solid ${themeColors.purple}` : '2px solid transparent',
    color: isActive ? themeColors.purple : themeColors.textMuted,
    background: 'none', border: 'none',
    cursor: 'pointer', transition: 'color 0.2s',
  });

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: themeColors.purple }}>💡</span>
          产品洞察
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>🧪 {testingItems().length} 个假设验证中</span>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>✅ {validatedItems().length} 个已证实</span>
        </div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        {/* Main Content */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            {/* Tabs */}
            <div style={{ display: 'flex', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <button style={tabStyle(activeTab() === 'hypotheses')} onClick={() => setActiveTab('hypotheses')}>
                🧪 产品假设
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>{testingItems().length} 验证中</span>
              </button>
              <button style={tabStyle(activeTab() === 'ideas')} onClick={() => setActiveTab('ideas')}>
                💡 功能想法
              </button>
              <button style={tabStyle(activeTab() === 'competitors')} onClick={() => setActiveTab('competitors')}>
                🔭 竞品雷达
              </button>
              <button style={tabStyle(activeTab() === 'requirements')} onClick={() => setActiveTab('requirements')}>
                📄 需求输出
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {/* Hypotheses */}
              <Show when={activeTab() === 'hypotheses'}>
                <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 对比团队版：</strong> 团队版需要完整 PRD → 评审 → 批准流程，独立版直接用假设驱动验证，快速决策。
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <HypothesisColumn title="验证中" status="testing" items={testingItems()} onDetail={openHypoDetail} onAddNew={() => setNewHypothesisModal(true)} />
                  <HypothesisColumn title="已证实" status="validated" items={validatedItems()} onDetail={openHypoDetail} />
                  <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems()} onDetail={openHypoDetail} />
                </div>
              </Show>

              {/* Feature Ideas */}
              <Show when={activeTab() === 'ideas'}>
                <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 对比团队版：</strong> 无需 PRD 模板、Schema 校验、AI评分。一个想法 = 一张卡片，AI 直接评估优先级。
                </div>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <For each={featureIdeas()}>
                    {(idea) => {
                      const pStyle = priorityStyle[idea.aiPriority] || priorityStyle.P3;
                      return (
                        <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, padding: '16px' }}>
                          <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
                                <span style={{ 'font-size': '12px', padding: '1px 8px', 'border-radius': '4px', 'font-weight': 700, background: pStyle.bg, color: 'white' }}>
                                  {idea.aiPriority}
                                </span>
                                <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{idea.title}</span>
                                <span style={{ 'font-size': '12px', padding: '1px 6px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '4px' }}>{idea.source}</span>
                              </div>
                              <p style={{ 'font-size': '14px', color: themeColors.textSecondary, 'margin-bottom': '8px', margin: '0 0 8px' }}>{idea.description}</p>
                              <div style={{ padding: '8px 12px', background: themeColors.primaryBg, 'border-radius': '8px', 'font-size': '12px', color: chartColors.primary }}>
                                🤖 {idea.aiReason}
                              </div>
                            </div>
                            <div style={{ 'text-align': 'center', 'flex-shrink': 0 }}>
                              <div style={{ 'font-size': '20px', 'font-weight': 700, color: themeColors.text }}>👍 {idea.votes}</div>
                              <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>用户投票</div>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                  <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}>
                    + 记录新想法
                  </button>
                </div>
              </Show>

              {/* Competitors */}
              <Show when={activeTab() === 'competitors'}>
                <div style={{ display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '16px' }}>
                  <For each={competitors()}>
                    {(c) => (
                      <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, padding: '16px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '12px' }}>
                          <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{c.name}</span>
                          <span style={{ 'font-size': '12px', padding: '1px 8px', background: themeColors.warningBg, color: themeColors.warningDark, 'border-radius': '9999px' }}>{c.pricing}</span>
                        </div>
                        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px', 'margin-bottom': '12px' }}>
                          <div>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>优势</div>
                            <For each={c.strength}>
                              {(s) => <div style={{ 'font-size': '12px', color: chartColors.success, padding: '2px 0' }}>✅ {s}</div>}
                            </For>
                          </div>
                          <div>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>劣势</div>
                            <For each={c.weakness}>
                              {(w) => <div style={{ 'font-size': '12px', color: chartColors.error, padding: '2px 0' }}>⚠️ {w}</div>}
                            </For>
                          </div>
                        </div>
                        <div style={{ padding: '8px 12px', background: themeColors.successBg, 'border-radius': '8px', 'font-size': '12px', color: chartColors.success }}>
                          <strong>我们的差异化：</strong> {c.differentiation}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              {/* Requirements Output */}
              <Show when={activeTab() === 'requirements'}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <For each={requirements()}>
                    {(req) => {
                      const pStyle = priorityStyle[req.priority] || priorityStyle.P3;
                      return (
                        <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, padding: '16px' }}>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '10px', 'flex-wrap': 'wrap' }}>
                            <span style={{ 'font-size': '12px', padding: '1px 8px', 'border-radius': '4px', 'font-weight': 700, background: pStyle.bg, color: 'white' }}>
                              {req.priority}
                            </span>
                            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{req.title}</span>
                            <span style={{ 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '4px' }}>
                              {reqTypeLabel[req.type]}
                            </span>
                          </div>
                          <Show when={req.linkedHypothesis}>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px' }}>
                              🔗 关联假设: {req.linkedHypothesis}
                            </div>
                          </Show>
                          <div
                            style={{ 'font-size': '13px', 'line-height': '1.7', color: themeColors.text }}
                            innerHTML={markdownToSafeHtml(req.content)}
                          />
                          <div style={{ 'margin-top': '10px', 'font-size': '12px', color: themeColors.textMuted }}>
                            {req.createdAt}
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right: AI产品搭档 */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, display: 'flex', 'flex-direction': 'column', height: 'calc(100vh - 200px)' }}>
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span style={{ color: themeColors.purple }}>🧠</span>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>AI产品搭档</span>
              <Show when={agentLoading()}>
                <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': 'auto' }}>思考中...</span>
              </Show>
            </div>
            <div ref={messagesRef} style={{ flex: 1, 'overflow-y': 'auto', padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <For each={agentMessages()}>
                {(msg) => (
                  <div style={{ display: 'flex', 'justify-content': msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ 'max-width': '85%', padding: '8px 12px', 'font-size': '12px', 'line-height': '1.6', 'white-space': 'pre-wrap', ...(msg.role === 'user' ? { background: themeColors.purple, color: 'white', 'border-radius': '16px 16px 4px 16px' } : { background: themeColors.purpleBg, color: themeColors.text, 'border-radius': '16px 16px 16px 4px' }) }}>
                      {msg.content}
                    </div>
                  </div>
                )}
              </For>
            </div>
            <div style={{ padding: '8px 12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
              <For each={['这个功能的 MVP 边界是什么？', '当前假设的优先级合理吗？', '用户最核心的痛点']}>
                {(q) => (
                  <button style={{ 'font-size': '12px', padding: '4px 10px', background: themeColors.hover, 'border-radius': '9999px', border: `1px solid ${themeColors.border}`, cursor: 'pointer', color: themeColors.textSecondary }} onClick={() => setAgentInput(q)}>
                    {q}
                  </button>
                )}
              </For>
            </div>
            <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
                placeholder="向AI产品搭档提问..."
                disabled={agentLoading()}
                style={{ flex: 1, border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '8px 12px', 'font-size': '12px', outline: 'none', background: themeColors.surface, color: themeColors.text, opacity: agentLoading() ? 0.6 : 1 }}
              />
              <button onClick={handleAgentSend} disabled={agentLoading()} style={{ background: agentLoading() ? themeColors.textMuted : themeColors.purple, color: 'white', 'border-radius': '8px', padding: '8px 12px', 'font-size': '14px', border: 'none', cursor: agentLoading() ? 'not-allowed' : 'pointer' }}>→</button>
            </div>
          </div>
        </div>
      </div>

      {/* Hypothesis Detail Markdown Modal */}
      <Show when={detailHypo()}>
        <div style={{ position: 'fixed', inset: 0, 'z-index': 50, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setDetailHypo(null)} />
          <div style={{ position: 'relative', background: themeColors.surface, 'border-radius': '16px', 'box-shadow': '0 4px 24px rgba(0,0,0,0.15)', padding: '24px', width: '640px', 'max-height': '90vh', 'overflow-y': 'auto' }}>
            {/* 顶部工具栏 */}
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '16px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <span style={{ 'font-weight': 600, 'font-size': '16px', color: themeColors.text }}>
                  假设详情 · {statusConfig[detailHypo()!.status].label}
                </span>
                <span style={{ 'font-size': '12px', padding: '1px 8px', 'border-radius': '4px', background: (impactConfig[detailHypo()!.impact] || impactConfig.low).bg, color: (impactConfig[detailHypo()!.impact] || impactConfig.low).color }}>
                  {(impactConfig[detailHypo()!.impact] || impactConfig.low).label}
                </span>
              </div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <button
                  style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: editMode() === 'preview' ? themeColors.primaryBg : themeColors.surface, color: editMode() === 'preview' ? chartColors.primary : themeColors.textSecondary, cursor: 'pointer' }}
                  onClick={() => setEditMode('preview')}
                >预览</button>
                <button
                  style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: editMode() === 'edit' ? themeColors.primaryBg : themeColors.surface, color: editMode() === 'edit' ? chartColors.primary : themeColors.textSecondary, cursor: 'pointer' }}
                  onClick={() => setEditMode('edit')}
                >编辑</button>
                <Show when={editMode() === 'edit'}>
                  <button
                    style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: 'none', background: chartColors.primary, color: 'white', cursor: 'pointer' }}
                    onClick={() => {
                      const h = detailHypo()!;
                      setHypotheses(prev => prev.map(item =>
                        item.id === h.id ? { ...item, markdownDetail: editContent() } : item
                      ));
                      setEditMode('preview');
                    }}
                  >保存</button>
                </Show>
                <button style={{ color: themeColors.textMuted, 'font-size': '20px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setDetailHypo(null)}>✕</button>
              </div>
            </div>

            {/* 内容区 */}
            <Show when={editMode() === 'preview'}>
              <div
                style={{ 'font-size': '14px', 'line-height': '1.8', color: themeColors.text }}
                innerHTML={markdownToSafeHtml(editContent())}
              />
            </Show>
            <Show when={editMode() === 'edit'}>
              <textarea
                value={editContent()}
                onInput={(e) => setEditContent(e.currentTarget.value)}
                style={{ width: '100%', 'min-height': '300px', border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '12px', 'font-size': '13px', 'font-family': '"SF Mono", "Fira Code", monospace', 'line-height': '1.6', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text, outline: 'none' }}
              />
            </Show>

            {/* 底部元信息 */}
            <div style={{ 'margin-top': '16px', 'padding-top': '12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', color: themeColors.textMuted }}>
              <span>创建于 {detailHypo()!.createdAt}</span>
              <Show when={detailHypo()!.validatedAt}>
                <span>· 验证于 {detailHypo()!.validatedAt}</span>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* New Hypothesis Modal */}
      <Show when={newHypothesisModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: themeColors.surface, 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '480px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600, color: themeColors.text }}>新增假设</h3>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>假设信念</label>
              <input
                type="text"
                placeholder="我认为..."
                value={newHypothesisText()}
                onInput={(e) => setNewHypothesisText(e.currentTarget.value)}
                style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>验证方式</label>
              <textarea
                rows={4}
                placeholder="如何验证这个假设..."
                style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }}
              />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px', color: themeColors.text }} onClick={() => setNewHypothesisModal(false)}>取消</button>
              <button style={{ background: chartColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }} onClick={() => setNewHypothesisModal(false)}>保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloProduct;
