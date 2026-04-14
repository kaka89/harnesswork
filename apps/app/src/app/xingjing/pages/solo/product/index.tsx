import { Component, createSignal, createEffect, For, Show, onMount } from 'solid-js';
import {
  hypotheses as mockHypotheses,
  requirementOutputs as mockRequirements,
  Hypothesis,
  HypothesisStatus,
  RequirementOutput,
  reqTypeLabel,
} from '../../../mock/solo';
import { loadHypotheses, loadRequirementOutputs, saveHypothesis } from '../../../services/file-store';
import { SOLO_AGENTS } from '../../../services/autopilot-executor';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
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

// ─── Drag-drop types ────────────────────────────────────────────────────────

interface DragHandlers {
  draggingId: () => string | null;
  dragOverStatus: () => HypothesisStatus | null;
  onDragStart: (id: string) => void;
  onDrop: (targetStatus: HypothesisStatus) => void;
  onDragEnter: (status: HypothesisStatus) => void;
  onDragLeave: () => void;
}

// ─── HypothesisColumn ───────────────────────────────────────────────────────

const HypothesisColumn: Component<{
  title: string;
  status: HypothesisStatus;
  items: Hypothesis[];
  onDetail: (h: Hypothesis) => void;
  onAddNew?: () => void;
  drag: DragHandlers;
}> = (props) => {
  const cfg = () => statusConfig[props.status];
  const isOver = () => props.drag.dragOverStatus() === props.status;

  return (
    <div
      style={{ flex: 1, 'min-width': 0 }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragEnter={() => props.drag.onDragEnter(props.status)}
      onDragLeave={() => props.drag.onDragLeave()}
      onDrop={(e) => { e.preventDefault(); props.drag.onDrop(props.status); }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px',
        padding: '8px 12px', 'border-radius': '8px',
        background: isOver() ? cfg().border : cfg().bg,
        border: `2px solid ${isOver() ? cfg().border : cfg().border}`,
        transition: 'background 0.15s',
      }}>
        <span>{cfg().icon}</span>
        <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{props.title}</span>
        <span style={{ 'margin-left': 'auto', 'font-size': '12px', padding: '1px 6px', background: themeColors.surface, 'border-radius': '9999px', color: themeColors.textSecondary, border: `1px solid ${themeColors.border}` }}>
          {props.items.length}
        </span>
      </div>

      {/* Drop zone container */}
      <div style={{
        display: 'flex', 'flex-direction': 'column', gap: '10px',
        'min-height': '80px',
        padding: '4px',
        'border-radius': '8px',
        border: isOver() ? `2px dashed ${cfg().border}` : '2px dashed transparent',
        transition: 'border 0.15s',
      }}>
        <Show when={props.items.length === 0 && !isOver()}>
          <div style={{ 'text-align': 'center', padding: '32px 0', color: themeColors.textMuted, 'font-size': '14px' }}>暂无</div>
        </Show>
        <For each={props.items}>
          {(h) => {
            const impact = impactConfig[h.impact] || impactConfig.low;
            const isDragging = () => props.drag.draggingId() === h.id;
            return (
              <div
                draggable={true}
                onDragStart={() => props.drag.onDragStart(h.id)}
                style={{
                  'border-radius': '12px',
                  border: `1px solid ${cfg().cardBorder}`,
                  background: themeColors.surface,
                  padding: '14px',
                  cursor: 'grab',
                  transition: 'opacity 0.2s, box-shadow 0.2s',
                  opacity: isDragging() ? 0.4 : 1,
                  'box-shadow': isDragging() ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                  'user-select': 'none',
                }}
                onClick={() => !props.drag.draggingId() && props.onDetail(h)}
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

        {/* Drop hint */}
        <Show when={isOver()}>
          <div style={{ 'text-align': 'center', padding: '16px 0', color: cfg().border, 'font-size': '13px', 'font-weight': 500 }}>
            放开移入 {cfg().label}
          </div>
        </Show>

        <Show when={props.status === 'testing'}>
          <button
            style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}
            onClick={() => props.onAddNew?.()}
          >
            + 新增假设
          </button>
        </Show>
      </div>
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const productBrainAgent = SOLO_AGENTS.find(a => a.id === 'product-brain')!;

function markdownToSafeHtml(md: string): string {
  const rawHtml = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}

/** 从 AI 回复中尝试提取 ```json ... ``` 块并解析 */
function extractIdeaJson(text: string): { belief: string; why: string; method: string; impact: 'high' | 'medium' | 'low' } | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.belief && parsed.why && parsed.method) {
      return {
        belief: String(parsed.belief),
        why: String(parsed.why),
        method: String(parsed.method),
        impact: (['high', 'medium', 'low'].includes(parsed.impact) ? parsed.impact : 'medium') as 'high' | 'medium' | 'low',
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SoloProduct: Component = () => {
  const { productStore, actions } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<'hypotheses' | 'requirements'>('hypotheses');
  const [hypotheses, setHypotheses] = createSignal<Hypothesis[]>(mockHypotheses);
  const [requirements, setRequirements] = createSignal<RequirementOutput[]>(mockRequirements);
  const [detailHypo, setDetailHypo] = createSignal<Hypothesis | null>(null);
  const [editMode, setEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [editContent, setEditContent] = createSignal('');
  const [newHypothesisModal, setNewHypothesisModal] = createSignal(false);
  const [newHypothesisText, setNewHypothesisText] = createSignal('');
  const [newHypothesisMethod, setNewHypothesisMethod] = createSignal('');

  // Drag-and-drop
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = createSignal<HypothesisStatus | null>(null);

  // AI 搭档
  const [agentInput, setAgentInput] = createSignal('');
  const [agentLoading, setAgentLoading] = createSignal(false);
  const [ideaMode, setIdeaMode] = createSignal(false);
  const [savedIdeaToast, setSavedIdeaToast] = createSignal(false);
  let messagesRef: HTMLDivElement | undefined;
  const [agentMessages, setAgentMessages] = createSignal([
    {
      role: 'assistant',
      content: '我是你的「AI产品搭档」，定位为精益型产品顾问。\n\n我擅长需求分析、假设拆解、用户洞察和功能优先级排序，以 solo 创业者视角帮你聚焦 MVP。\n\n切换「💡 奇想」模式，随手记录产品突发奇想，我会自动补全并保存到产品假设中。',
    },
  ]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const [fileHypo, fileReqs] = await Promise.all([
        loadHypotheses(workDir),
        loadRequirementOutputs(workDir),
      ]);
      if (fileHypo.length > 0) setHypotheses(fileHypo as unknown as Hypothesis[]);
      if (fileReqs.length > 0) setRequirements(fileReqs as unknown as RequirementOutput[]);
    } catch {
      // Mock fallback
    }
  });

  const testingItems = () => hypotheses().filter((h) => h.status === 'testing');
  const validatedItems = () => hypotheses().filter((h) => h.status === 'validated');
  const invalidatedItems = () => hypotheses().filter((h) => h.status === 'invalidated');

  // Auto-scroll messages
  const scrollToBottom = () => {
    if (messagesRef) messagesRef.scrollTo({ top: messagesRef.scrollHeight, behavior: 'smooth' });
  };
  createEffect(() => {
    agentMessages();
    setTimeout(scrollToBottom, 50);
  });

  // ─── Hypothesis detail ────────────────────────────────────────────────────

  const openHypoDetail = (h: Hypothesis) => {
    setDetailHypo(h);
    setEditMode('preview');
    const md = h.markdownDetail || `## 假设：${h.belief}\n\n### 因为\n\n${h.why}\n\n### 验证方式\n\n${h.method}${h.result ? `\n\n### 实际结果\n\n${h.result}` : ''}`;
    setEditContent(md);
  };

  // ─── Drag-and-drop handlers ───────────────────────────────────────────────

  const drag: DragHandlers = {
    draggingId,
    dragOverStatus,
    onDragStart: (id) => setDraggingId(id),
    onDrop: (targetStatus) => {
      const id = draggingId();
      if (!id) return;
      setHypotheses(prev => prev.map(h => h.id === id ? { ...h, status: targetStatus } : h));
      // Persist to workspace
      const workDir = productStore.activeProduct()?.workDir;
      if (workDir) {
        const updated = hypotheses().find(h => h.id === id);
        if (updated) void saveHypothesis(workDir, updated as unknown as Parameters<typeof saveHypothesis>[1]);
      }
      setDraggingId(null);
      setDragOverStatus(null);
    },
    onDragEnter: (status) => setDragOverStatus(status),
    onDragLeave: () => {
      // Small delay to prevent flicker when moving between child elements
      setTimeout(() => setDragOverStatus(null), 50);
    },
  };

  // ─── AI 搭档 send ─────────────────────────────────────────────────────────

  /** 显示 toast 2 秒后自动消失 */
  const showToast = () => {
    setSavedIdeaToast(true);
    setTimeout(() => setSavedIdeaToast(false), 2500);
  };

  /** 将解析到的奇想 JSON 创建为新假设并持久化 */
  const createHypothesisFromIdea = (parsed: ReturnType<typeof extractIdeaJson>) => {
    if (!parsed) return;
    const newH: Hypothesis = {
      id: `idea-${Date.now()}`,
      status: 'testing',
      belief: parsed.belief,
      why: parsed.why,
      method: parsed.method,
      impact: parsed.impact,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setHypotheses(prev => [newH, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveHypothesis(workDir, newH as unknown as Parameters<typeof saveHypothesis>[1]);
    showToast();
  };

  const ideaSystemPrompt = productBrainAgent.systemPrompt;

  const handleAgentSend = () => {
    if (!agentInput().trim() || agentLoading()) return;
    const q = agentInput().trim();
    setAgentMessages(prev => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setAgentLoading(true);

    // 占位 assistant 消息
    setAgentMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    const assistantIdx = agentMessages().length - 1;
    let finalResponse = '';

    void actions.callAgent({
      systemPrompt: ideaSystemPrompt,
      userPrompt: ideaMode() ? `[突发奇想] ${q}` : q,
      title: ideaMode() ? '产品奇想记录' : '产品搭档对话',
      onText: (accumulated) => {
        finalResponse = accumulated;
        setAgentMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: accumulated } : m
        ));
      },
      onDone: () => {
        setAgentLoading(false);
        // 奇想模式：尝试从响应提取并创建假设
        if (ideaMode()) {
          const parsed = extractIdeaJson(finalResponse);
          if (parsed) createHypothesisFromIdea(parsed);
        }
      },
      onError: () => {
        let reply = '';
        if (ideaMode()) {
          // 奇想模式降级：生成一条示例假设
          reply = '[离线模式] 已收到你的奇想，为你补全如下：\n\n```json\n{"belief":"' + q + '","why":"用户在使用过程中遇到了明显痛点，这个功能可以直接降低摩擦","method":"邀请 3-5 位目标用户内测，观察 7 天使用频率","impact":"medium"}\n```\n\n这个假设已暂存。建议下一步通过快速 MVP 验证用户真实反应。';
          const parsed = extractIdeaJson(reply);
          if (parsed) createHypothesisFromIdea(parsed);
        } else if (q.includes('重写') || q.includes('段落') || q.includes('MVP')) {
          reply = '[离线模式] 作为AI产品搭档，根据数据：大纲功能只有 12% 活跃使用率，但初期用户调研有 70% 感兴趣。这说明「用户说想要」≠「用户会真正使用」。建议先上线更粗糙的 MVP，看真实使用频率。';
        } else if (q.includes('团队') || q.includes('协作')) {
          reply = '[离线模式] 注意：企业版功能复杂度会让开发成本翻倍，且 NPS 42 主要来自个人用户。建议先用「共享链接」这个轻量功能代替团队版验证需求。';
        } else {
          reply = '[离线模式] 作为你的AI产品搭档，你的活跃用户 78% 在晚间使用，说明他们是「业余写作者」而非专业作家。这个画像会影响很多产品决策……你想深入讨论哪个功能？';
        }
        setAgentMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: reply } : m
        ));
        setAgentLoading(false);
      },
    });
  };

  // ─── Tab style ────────────────────────────────────────────────────────────

  const tabStyle = (isActive: boolean): Record<string, string | number> => ({
    padding: '8px 16px', 'font-size': '14px', 'font-weight': 500,
    'border-bottom': isActive ? `2px solid ${themeColors.purple}` : '2px solid transparent',
    color: isActive ? themeColors.purple : themeColors.textMuted,
    background: 'none', border: 'none',
    cursor: 'pointer', transition: 'color 0.2s',
  });

  // ─── Render ───────────────────────────────────────────────────────────────

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
              <button style={tabStyle(activeTab() === 'requirements')} onClick={() => setActiveTab('requirements')}>
                📄 产品需求
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {/* Hypotheses Kanban */}
              <Show when={activeTab() === 'hypotheses'}>
                <div style={{ padding: '10px 12px', background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '8px', 'margin-bottom': '14px', 'font-size': '12px', color: chartColors.primary }}>
                  💡 在右侧切换「奇想」模式，随手记录突发奇想，AI 自动补全后即出现在「验证中」列。拖拽卡片可流转假设状态。
                </div>
                <div style={{ display: 'flex', gap: '12px' }}
                  onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                >
                  <HypothesisColumn title="验证中" status="testing" items={testingItems()} onDetail={openHypoDetail} onAddNew={() => setNewHypothesisModal(true)} drag={drag} />
                  <HypothesisColumn title="已证实" status="validated" items={validatedItems()} onDetail={openHypoDetail} drag={drag} />
                  <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems()} onDetail={openHypoDetail} drag={drag} />
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
        <div style={{ position: 'relative' }}>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, display: 'flex', 'flex-direction': 'column', height: 'calc(100vh - 200px)' }}>
            {/* Panel Header */}
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span style={{ color: themeColors.purple }}>🧠</span>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>AI产品搭档</span>
              <Show when={agentLoading()}>
                <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>思考中...</span>
              </Show>
              <div style={{ 'margin-left': 'auto', display: 'flex', gap: '6px' }}>
                {/* 奇想模式 toggle */}
                <button
                  onClick={() => setIdeaMode(v => !v)}
                  title={ideaMode() ? '切换回普通对话模式' : '切换到突发奇想模式'}
                  style={{
                    'font-size': '12px',
                    padding: '3px 10px',
                    'border-radius': '9999px',
                    border: `1px solid ${ideaMode() ? themeColors.warningBorder : themeColors.border}`,
                    background: ideaMode() ? themeColors.warningBg : themeColors.surface,
                    color: ideaMode() ? themeColors.warningDark : themeColors.textSecondary,
                    cursor: 'pointer',
                    'font-weight': ideaMode() ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  💡 奇想
                </button>
              </div>
            </div>

            {/* 奇想模式提示横幅 */}
            <Show when={ideaMode()}>
              <div style={{ padding: '8px 16px', background: themeColors.warningBg, border: `0 0 1px 0 solid ${themeColors.warningBorder}`, 'border-bottom': `1px solid ${themeColors.warningBorder}`, 'font-size': '12px', color: themeColors.warningDark, display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span>💡</span>
                <span>奇想模式已开启 — AI 将自动补全假设结构并记录到「验证中」</span>
              </div>
            </Show>

            {/* Messages */}
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

            {/* Quick suggestions */}
            <div style={{ padding: '8px 12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
              <Show when={!ideaMode()}>
                <For each={['这个功能的 MVP 边界是什么？', '当前假设的优先级合理吗？', '用户最核心的痛点']}>
                  {(q) => (
                    <button style={{ 'font-size': '12px', padding: '4px 10px', background: themeColors.hover, 'border-radius': '9999px', border: `1px solid ${themeColors.border}`, cursor: 'pointer', color: themeColors.textSecondary }} onClick={() => setAgentInput(q)}>
                      {q}
                    </button>
                  )}
                </For>
              </Show>
              <Show when={ideaMode()}>
                <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'font-style': 'italic' }}>随手输入一个功能奇想，AI 帮你补全并保存 →</span>
              </Show>
            </div>

            {/* Input */}
            <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
                placeholder={ideaMode() ? '随手记下功能奇想，AI 自动补全并记录…' : '向AI产品搭档提问...'}
                disabled={agentLoading()}
                style={{ flex: 1, border: `1px solid ${ideaMode() ? themeColors.warningBorder : themeColors.border}`, 'border-radius': '8px', padding: '8px 12px', 'font-size': '12px', outline: 'none', background: themeColors.surface, color: themeColors.text, opacity: agentLoading() ? 0.6 : 1, transition: 'border-color 0.2s' }}
              />
              <button
                onClick={handleAgentSend}
                disabled={agentLoading()}
                style={{ background: agentLoading() ? themeColors.textMuted : (ideaMode() ? themeColors.warningDark : themeColors.purple), color: 'white', 'border-radius': '8px', padding: '8px 12px', 'font-size': '14px', border: 'none', cursor: agentLoading() ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
              >
                {ideaMode() ? '💡' : '→'}
              </button>
            </div>
          </div>

          {/* Toast notification */}
          <Show when={savedIdeaToast()}>
            <div style={{
              position: 'absolute', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
              background: themeColors.successBg, border: `1px solid ${themeColors.successBorder}`,
              color: chartColors.success, 'font-size': '13px', 'font-weight': 500,
              padding: '8px 16px', 'border-radius': '9999px',
              'box-shadow': '0 2px 12px rgba(0,0,0,0.12)',
              'white-space': 'nowrap',
              'z-index': 100,
              animation: 'fadeIn 0.2s ease',
            }}>
              ✅ 已记录到产品假设·验证中
            </div>
          </Show>
        </div>
      </div>

      {/* Hypothesis Detail Modal */}
      <Show when={detailHypo()}>
        <div style={{ position: 'fixed', inset: 0, 'z-index': 50, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setDetailHypo(null)} />
          <div style={{ position: 'relative', background: themeColors.surface, 'border-radius': '16px', 'box-shadow': '0 4px 24px rgba(0,0,0,0.15)', padding: '24px', width: '640px', 'max-height': '90vh', 'overflow-y': 'auto' }}>
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

            <Show when={editMode() === 'preview'}>
              <div style={{ 'font-size': '14px', 'line-height': '1.8', color: themeColors.text }} innerHTML={markdownToSafeHtml(editContent())} />
            </Show>
            <Show when={editMode() === 'edit'}>
              <textarea
                value={editContent()}
                onInput={(e) => setEditContent(e.currentTarget.value)}
                style={{ width: '100%', 'min-height': '300px', border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '12px', 'font-size': '13px', 'font-family': '"SF Mono", "Fira Code", monospace', 'line-height': '1.6', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text, outline: 'none' }}
              />
            </Show>

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
                value={newHypothesisMethod()}
                onInput={(e) => setNewHypothesisMethod(e.currentTarget.value)}
                style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }}
              />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button
                style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px', color: themeColors.text }}
                onClick={() => { setNewHypothesisModal(false); setNewHypothesisText(''); setNewHypothesisMethod(''); }}
              >取消</button>
              <button
                style={{ background: chartColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => {
                  if (!newHypothesisText().trim()) return;
                  const newH: Hypothesis = {
                    id: `h-${Date.now()}`,
                    status: 'testing',
                    belief: newHypothesisText().trim(),
                    why: '',
                    method: newHypothesisMethod().trim() || '待定',
                    impact: 'medium',
                    createdAt: new Date().toISOString().slice(0, 10),
                  };
                  setHypotheses(prev => [newH, ...prev]);
                  const workDir = productStore.activeProduct()?.workDir;
                  if (workDir) void saveHypothesis(workDir, newH as unknown as Parameters<typeof saveHypothesis>[1]);
                  setNewHypothesisModal(false);
                  setNewHypothesisText('');
                  setNewHypothesisMethod('');
                }}
              >保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloProduct;
