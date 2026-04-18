import { Component, createSignal, createEffect, For, Show, onMount } from 'solid-js';
import {
  Hypothesis,
  HypothesisStatus,
  RequirementOutput,
  reqTypeLabel,
} from '../../../mock/solo';
import {
  loadHypotheses,
  loadRequirementOutputs,
  saveHypothesis,
  saveRequirementOutput,
  loadUserFeedbacks,
  loadProductFeatures,
  loadProductOverview,
  loadProductRoadmap,
  loadSoloMetrics,
  type SoloUserFeedback,
  type SoloProductFeature,
  type SoloBusinessMetric,
} from '../../../services/file-store';
import { SOLO_AGENTS } from '../../../services/autopilot-executor';
import { invalidateKnowledgeCache } from '../../../services/knowledge-retrieval';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { InsightRecord, ProductSuggestion } from '../../../services/insight-store';
import { loadInsightRecords, saveInsightRecord, deleteInsightRecord } from '../../../services/insight-store';
import InsightAgentPanel from '../../../components/insight/insight-agent-panel';
import InsightBoard from '../../../components/insight/insight-board';
import FeedbackCard from '../../../components/insight/feedback-card';

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
  onDragEnd: () => void;
  onDrop: (targetStatus: HypothesisStatus, transferId?: string) => void;
  onDragEnter: (status: HypothesisStatus) => void;
  onDragLeave: () => void;
}

// ─── HypothesisColumn ───────────────────────────────────────────────────────

/** 每列的颜色主题（普通态 / drag-over 态） */
const columnTheme: Record<HypothesisStatus, {
  colBg: string; colBorder: string; accentColor: string;
  overBg: string; overBorder: string;
}> = {
  testing: {
    colBg: themeColors.primaryBg,
    colBorder: themeColors.primaryBorder,
    accentColor: chartColors.primary,
    overBg: 'var(--blue-3)',
    overBorder: chartColors.primary,
  },
  validated: {
    colBg: themeColors.successBg,
    colBorder: themeColors.successBorder,
    accentColor: chartColors.success,
    overBg: 'var(--green-3)',
    overBorder: chartColors.success,
  },
  invalidated: {
    colBg: '#fff2f0',
    colBorder: '#ffccc7',
    accentColor: chartColors.error,
    overBg: '#ffe2e0',
    overBorder: chartColors.error,
  },
};

const HypothesisColumn: Component<{
  title: string;
  status: HypothesisStatus;
  items: Hypothesis[];
  onDetail: (h: Hypothesis) => void;
  onAddNew?: () => void;
  drag: DragHandlers;
}> = (props) => {
  const cfg = () => statusConfig[props.status];
  const theme = () => columnTheme[props.status];
  const isOver = () => props.drag.dragOverStatus() === props.status;

  return (
    <div
      style={{
        flex: 1, 'min-width': 0,
        'border-radius': '12px',
        border: `1px solid ${isOver() ? theme().overBorder : theme().colBorder}`,
        background: isOver() ? theme().overBg : theme().colBg,
        transition: 'background 0.18s, border-color 0.18s',
        overflow: 'hidden',
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; }}
      onDragEnter={(e) => { e.preventDefault(); props.drag.onDragEnter(props.status); }}
      onDragLeave={(e) => {
        // 只有真正离开整个列容器时才清除高亮（忽略移入子元素的假 leave）
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
        props.drag.onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // 双保险：优先用信号，WebKit fallback 从 dataTransfer 读取
        const transferId = e.dataTransfer?.getData('text/plain') || undefined;
        console.error('[DnD] drop targetStatus=', props.status, 'transferId=', transferId);
        props.drag.onDrop(props.status, transferId);
      }}
    >
      {/* Column header – 左色条 + 标题 */}
      <div style={{
        display: 'flex', 'align-items': 'center', gap: '8px',
        padding: '10px 14px',
        'border-bottom': `1px solid ${isOver() ? theme().overBorder : theme().colBorder}`,
        background: isOver() ? theme().overBg : theme().colBg,
        transition: 'background 0.18s',
      }}>
        <span style={{ 'font-size': '15px' }}>{cfg().icon}</span>
        <span style={{ 'font-weight': 700, 'font-size': '13px', color: theme().accentColor }}>{props.title}</span>
        <span style={{
          'margin-left': 'auto', 'font-size': '11px', padding: '1px 7px',
          background: themeColors.surface, 'border-radius': '9999px',
          color: theme().accentColor, border: `1px solid ${theme().colBorder}`,
          'font-weight': 600,
        }}>
          {props.items.length}
        </span>
      </div>

      {/* Cards area */}
      <div style={{
        display: 'flex', 'flex-direction': 'column', gap: '8px',
        'min-height': '120px',
        padding: '10px',
      }}>
        <Show when={props.items.length === 0 && !isOver()}>
          <div style={{ 'text-align': 'center', padding: '28px 0', color: themeColors.textMuted, 'font-size': '13px' }}>暂无</div>
        </Show>

        <For each={props.items}>
          {(h) => {
            const impact = impactConfig[h.impact] || impactConfig.low;
            const isDragging = () => props.drag.draggingId() === h.id;
            return (
              <div
                draggable={true}
                onDragStart={(e) => {
                  e.stopPropagation();
                  // WebKit/Tauri 要求必须调用 setData + effectAllowed，否则 drop 不触发
                  e.dataTransfer!.effectAllowed = 'move';
                  e.dataTransfer!.setData('text/plain', h.id);
                  props.drag.onDragStart(h.id);
                  console.error('[DnD] dragstart id=', h.id);
                }}
                onDragEnd={() => props.drag.onDragEnd()}
                style={{
                  'border-radius': '10px',
                  border: `1px solid ${isOver() ? theme().overBorder : theme().colBorder}`,
                  background: themeColors.surface,
                  padding: '12px 14px',
                  cursor: isDragging() ? 'grabbing' : 'grab',
                  transition: 'opacity 0.18s, box-shadow 0.18s, transform 0.18s',
                  opacity: isDragging() ? 0.35 : 1,
                  transform: isDragging() ? 'scale(0.97)' : 'scale(1)',
                  'box-shadow': isDragging() ? 'none' : '0 1px 3px rgba(0,0,0,0.07)',
                  'user-select': 'none',
                }}
                onClick={() => !props.drag.draggingId() && props.onDetail(h)}
              >
                <div style={{ 'margin-bottom': '6px' }}>
                  <span style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>「{h.belief}」</span>
                </div>
                <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px', 'line-height': '1.4' }}>
                  ❓ {h.method}
                </div>
                <Show when={h.result}>
                  <div style={{ 'margin-bottom': '8px', padding: '5px 8px', 'border-radius': '6px', 'font-size': '12px', background: props.status === 'validated' ? themeColors.successBg : themeColors.errorBg, color: props.status === 'validated' ? chartColors.success : chartColors.error }}>
                    {h.result}
                  </div>
                </Show>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                  <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '4px', background: impact.bg, color: impact.color }}>
                    {impact.label}
                  </span>
                  <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-left': 'auto' }}>{h.createdAt}</span>
                </div>
              </div>
            );
          }}
        </For>

        {/* Drop hint */}
        <Show when={isOver()}>
          <div style={{
            'text-align': 'center', padding: '14px 0',
            color: theme().accentColor, 'font-size': '13px', 'font-weight': 600,
            border: `2px dashed ${theme().overBorder}`, 'border-radius': '8px',
            background: themeColors.surface,
          }}>
            ↓ 放开移入「{cfg().label}」
          </div>
        </Show>

        <Show when={props.status === 'testing'}>
          <button
            style={{
              width: '100%', padding: '7px',
              border: `1px dashed ${theme().colBorder}`, 'border-radius': '8px',
              'font-size': '13px', color: theme().accentColor, background: 'transparent', cursor: 'pointer',
            }}
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

const REQ_DOC_REGEX = /^\[REQ_DOC:([^\]]+)\]/;

// ─── Main Component ───────────────────────────────────────────────────────────

const SoloProduct: Component = () => {
  const { productStore, actions } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<'hypotheses' | 'features' | 'feedbacks' | 'insights'>('hypotheses');
  const [hypotheses, setHypotheses] = createSignal<Hypothesis[]>([]);
  const [requirements, setRequirements] = createSignal<RequirementOutput[]>([]);
  const [insightRecords, setInsightRecords] = createSignal<InsightRecord[]>([]);
  const [insightLoading, setInsightLoading] = createSignal(false);
  const [pageLoading, setPageLoading] = createSignal(false);
  // New real-data signals
  const [features, setFeatures] = createSignal<SoloProductFeature[]>([]);
  const [feedbacks, setFeedbacks] = createSignal<SoloUserFeedback[]>([]);
  const [productOverview, setProductOverview] = createSignal('');
  const [productRoadmap, setProductRoadmap] = createSignal('');
  const [metrics, setMetrics] = createSignal<SoloBusinessMetric[]>([]);
  const [detailHypo, setDetailHypo] = createSignal<Hypothesis | null>(null);
  const [editMode, setEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [editContent, setEditContent] = createSignal('');
  // 需求详情悬浮窗
  const [detailReq, setDetailReq] = createSignal<RequirementOutput | null>(null);
  const [reqEditMode, setReqEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [reqEditContent, setReqEditContent] = createSignal('');
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

  const loadAllData = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    setPageLoading(true);
    try {
      const [fileHypo, fileReqs, fileFeedbacks, fileFeatures, overview, roadmap, metricsData, records] = await Promise.all([
        loadHypotheses(workDir),
        loadRequirementOutputs(workDir),
        loadUserFeedbacks(workDir),
        loadProductFeatures(workDir),
        loadProductOverview(workDir),
        loadProductRoadmap(workDir),
        loadSoloMetrics(workDir),
        loadInsightRecords(workDir),
      ]);
      if (fileHypo.length > 0) setHypotheses(fileHypo as unknown as Hypothesis[]);
      if (fileReqs.length > 0) setRequirements(fileReqs as unknown as RequirementOutput[]);
      setFeedbacks(fileFeedbacks as unknown as SoloUserFeedback[]);
      setFeatures(fileFeatures);
      setProductOverview(overview);
      setProductRoadmap(roadmap);
      setMetrics(metricsData.businessMetrics ?? []);
      setInsightRecords(records);
    } catch {
      // Graceful fallback: signals remain at empty defaults
    } finally {
      setPageLoading(false);
    }
  };

  onMount(() => void loadAllData());

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

  // 打开需求详情
  const openReqDetail = (req: RequirementOutput) => {
    setDetailReq(req);
    setReqEditMode('preview');
    setReqEditContent(req.content);
  };

  // 从 AI 回复保存需求
  const saveReqFromAI = (rawContent: string) => {
    const match = REQ_DOC_REGEX.exec(rawContent);
    const title = match?.[1] || '新需求文档';
    const content = rawContent.replace(REQ_DOC_REGEX, '').trimStart();
    const newReq: RequirementOutput = {
      id: `req_${Date.now()}`,
      title,
      type: 'user-story',
      content,
      priority: 'P1',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRequirements(prev => [newReq, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, newReq as unknown as Parameters<typeof saveRequirementOutput>[1]);
  };

  // ─── Drag-and-drop handlers ───────────────────────────────────────────────

  const drag: DragHandlers = {
    draggingId,
    dragOverStatus,
    onDragStart: (id) => setDraggingId(id),
    onDragEnd: () => { setDraggingId(null); setDragOverStatus(null); },
    onDrop: (targetStatus, transferId?) => {
      const id = draggingId() ?? (transferId && transferId.trim() !== '' ? transferId : null);
      console.error('[DnD] handler id=', id, 'targetStatus=', targetStatus, 'hypotheses=', hypotheses().length);
      if (!id) return;
      const original = hypotheses().find(h => h.id === id);
      if (!original) { setDraggingId(null); setDragOverStatus(null); return; }
      const updated: Hypothesis = { ...original, status: targetStatus };
      setHypotheses(prev => prev.map(h => h.id === id ? updated : h));
      setDraggingId(null);
      setDragOverStatus(null);
      // 持久化到 workspace
      const workDir = productStore.activeProduct()?.workDir;
      if (workDir) {
        void saveHypothesis(workDir, updated as unknown as Parameters<typeof saveHypothesis>[1]);
        invalidateKnowledgeCache();
      }
    },
    onDragEnter: (status) => setDragOverStatus(status),
    onDragLeave: () => setDragOverStatus(null),
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
    if (workDir) {
      void saveHypothesis(workDir, newH as unknown as Parameters<typeof saveHypothesis>[1]);
      invalidateKnowledgeCache();
    }
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

    // 需求模式：动态注入 workspace 上下文
    const hypothesisSummary = hypotheses()
      .map(h => `- [${h.status}] ${h.belief}`)
      .join('\n') || '（暂无）';
    const reqSummary = requirements()
      .map(r => `- [${r.priority}] ${r.title}`)
      .join('\n') || '（暂无）';
    const enrichedSystemPrompt = `${productBrainAgent.systemPrompt}

当前产品假设：
${hypothesisSummary}

已有需求文档：
${reqSummary}

【需求文档生成规则】当用户要求写某个模块的需求、细化需求或输出需求文档时，必须在输出内容的第一行加上标识行（格式：[REQ_DOC:模块名称]），随后按以下 Markdown 结构输出完整需求文档：
# 需求文档 · [模块名称]

## 用户故事
**作为** [用户角色]，
**我希望** [期望功能]，
**以便** [达成目标]。

## 验收标准
- [ ] 具体可验证的标准1
- [ ] 具体可验证的标准2

## 非功能需求
- 性能：...
- 安全：...
- 可用性：...`;

    void actions.callAgent({
      systemPrompt: ideaMode() ? ideaSystemPrompt : enrichedSystemPrompt,
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

  // ─── Insight handlers ──────────────────────────────────────────────────────

  const handleInsightRecord = (record: InsightRecord) => {
    setInsightRecords(prev => {
      const exists = prev.some(r => r.id === record.id);
      return exists ? prev.map(r => r.id === record.id ? record : r) : [record, ...prev];
    });
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveInsightRecord(workDir, record);
  };

  const handleDeleteInsightRecord = (id: string) => {
    setInsightRecords(prev => prev.filter(r => r.id !== id));
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void deleteInsightRecord(workDir, id);
  };

  const handleConvertSuggestionToHypothesis = (sug: ProductSuggestion) => {
    const newH: Hypothesis = {
      id: `h-sug-${Date.now()}`,
      status: 'testing',
      belief: sug.title,
      why: sug.rationale,
      method: '待定（源自产品洞察建议）',
      impact: sug.priority === 'P0' ? 'high' : sug.priority === 'P1' ? 'high' : sug.priority === 'P2' ? 'medium' : 'low',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setHypotheses(prev => [newH, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      void saveHypothesis(workDir, newH as unknown as Parameters<typeof saveHypothesis>[1]);
      invalidateKnowledgeCache();
    }
  };

  const handleConvertSuggestionToRequirement = (sug: ProductSuggestion, _insightId: string) => {
    const newReq: RequirementOutput = {
      id: `req-sug-${Date.now()}`,
      title: sug.title,
      type: 'user-story',
      content: `## 需求：${sug.title}\n\n### 背景\n${sug.rationale}\n\n### 分类\n${sug.category}\n\n### 优先级\n${sug.priority}\n`,
      priority: sug.priority === 'P0' ? 'P0' : sug.priority === 'P1' ? 'P1' : sug.priority === 'P2' ? 'P2' : 'P3',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRequirements(prev => [newReq, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, newReq as unknown as Parameters<typeof saveRequirementOutput>[1]);
  };

  const handleHypothesisSaveFromAgent = (h: Hypothesis) => {
    setHypotheses(prev => {
      const exists = prev.some(item => item.id === h.id);
      return exists ? prev.map(item => item.id === h.id ? h : item) : [h, ...prev];
    });
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      void saveHypothesis(workDir, h as unknown as Parameters<typeof saveHypothesis>[1]);
      invalidateKnowledgeCache();
    }
  };

  const handleRequirementSaveFromAgent = (r: RequirementOutput) => {
    setRequirements(prev => {
      const exists = prev.some(item => item.id === r.id);
      return exists ? prev.map(item => item.id === r.id ? r : item) : [r, ...prev];
    });
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, r as unknown as Parameters<typeof saveRequirementOutput>[1]);
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
        <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
          <For each={metrics()}>
            {(m) => (
              <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>
                {m.label}: {typeof m.value === 'number' ? `${m.value}${m.unit ?? ''}` : m.value}
                <Show when={m.trendValue}>
                  <span style={{ color: m.good ? chartColors.success : chartColors.error, 'margin-left': '4px' }}>{m.trendValue}</span>
                </Show>
              </span>
            )}
          </For>
          <Show when={metrics().length === 0}>
            <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>🧪 {testingItems().length} 个假设验证中</span>
            <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>✅ {validatedItems().length} 个已证实</span>
          </Show>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', 'align-items': 'flex-start' }}>
        {/* Main Content */}
        <div style={{ flex: 1, 'min-width': 0 }}>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            {/* Tabs */}
            <div style={{ display: 'flex', 'align-items': 'center', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <button style={tabStyle(activeTab() === 'hypotheses')} onClick={() => setActiveTab('hypotheses')}>
                🧪 产品假设
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>{testingItems().length} 验证中</span>
              </button>
              <button style={tabStyle(activeTab() === 'features')} onClick={() => setActiveTab('features')}>
                📦 功能注册
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{features().length}</span>
              </button>
              <button style={tabStyle(activeTab() === 'feedbacks')} onClick={() => setActiveTab('feedbacks')}>
                💬 用户反馈
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{feedbacks().length}</span>
              </button>
              <button style={tabStyle(activeTab() === 'insights')} onClick={() => setActiveTab('insights')}>
                🔍 外部洞察
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{insightRecords().length}</span>
              </button>
              <button
                style={{ 'margin-left': 'auto', padding: '4px 10px', background: 'none', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', cursor: pageLoading() ? 'not-allowed' : 'pointer', color: themeColors.textSecondary, 'font-size': '13px', 'align-self': 'center', 'margin-right': '8px', opacity: pageLoading() ? 0.5 : 1, transition: 'opacity 0.2s' }}
                onClick={() => { if (!pageLoading()) void loadAllData(); }}
                disabled={pageLoading()}
                title="刷新页面数据"
              >
                {pageLoading() ? '⟳ 刷新中...' : '↻ 刷新'}
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {/* Hypotheses Kanban */}
              <Show when={activeTab() === 'hypotheses'}>
                <div style={{ padding: '10px 12px', background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '8px', 'margin-bottom': '14px', 'font-size': '12px', color: chartColors.primary }}>
                  💡 在右侧切换「奇想」模式，随手记录突发奇想，AI 自动补全后即出现在「验证中」列。拖拽卡片可流转假设状态。
                </div>
                <div style={{ display: 'flex', gap: '14px' }}
                  onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                >
                  <HypothesisColumn title="验证中" status="testing" items={testingItems()} onDetail={openHypoDetail} onAddNew={() => setNewHypothesisModal(true)} drag={drag} />
                  <HypothesisColumn title="已证实" status="validated" items={validatedItems()} onDetail={openHypoDetail} drag={drag} />
                  <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems()} onDetail={openHypoDetail} drag={drag} />
                </div>
              </Show>

              {/* Features Registry */}
              <Show when={activeTab() === 'features'}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <Show when={features().length === 0}>
                    <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted, 'font-size': '14px' }}>
                      <div style={{ 'font-size': '32px', 'margin-bottom': '8px' }}>📦</div>
                      <div>暂无功能注册</div>
                      <div style={{ 'font-size': '12px', 'margin-top': '4px' }}>在 product/features/_index.yml 中添加功能条目</div>
                    </div>
                  </Show>
                  <For each={features()}>
                    {(feat) => {
                      const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
                        ga: { label: '已上线', bg: themeColors.successBg, color: chartColors.success },
                        beta: { label: 'Beta', bg: themeColors.warningBg, color: themeColors.warningDark },
                        planned: { label: '规划中', bg: themeColors.hover, color: themeColors.textSecondary },
                      };
                      const s = statusCfg[feat.status] ?? statusCfg.planned;
                      return (
                        <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '6px', 'flex-wrap': 'wrap' }}>
                            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{feat.title ?? feat.name}</span>
                            <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '4px', background: s.bg, color: s.color }}>{s.label}</span>
                            <Show when={feat.since}>
                              <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>since {feat.since}</span>
                            </Show>
                            <Show when={feat.hypothesis}>
                              <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '4px', background: themeColors.primaryBg, color: chartColors.primary }}>🔗 {feat.hypothesis}</span>
                            </Show>
                          </div>
                          <div style={{ 'font-size': '13px', color: themeColors.textSecondary }}>
                            {feat.brief ?? feat.description ?? ''}
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>

              {/* User Feedbacks */}
              <Show when={activeTab() === 'feedbacks'}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  {/* Sentiment summary */}
                  <Show when={feedbacks().length > 0}>
                    <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                      <span style={{ 'font-size': '12px', padding: '2px 8px', 'border-radius': '9999px', background: '#f6ffed', color: '#389e0d' }}>
                        😊 {feedbacks().filter(f => f.sentiment === 'positive').length} 正面
                      </span>
                      <span style={{ 'font-size': '12px', padding: '2px 8px', 'border-radius': '9999px', background: '#fff2f0', color: '#cf1322' }}>
                        😟 {feedbacks().filter(f => f.sentiment === 'negative').length} 负面
                      </span>
                      <span style={{ 'font-size': '12px', padding: '2px 8px', 'border-radius': '9999px', background: '#f5f5f5', color: '#595959' }}>
                        😐 {feedbacks().filter(f => f.sentiment === 'neutral').length} 中性
                      </span>
                    </div>
                  </Show>
                  <Show when={feedbacks().length === 0}>
                    <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted, 'font-size': '14px' }}>
                      <div style={{ 'font-size': '32px', 'margin-bottom': '8px' }}>💬</div>
                      <div>暂无用户反馈</div>
                      <div style={{ 'font-size': '12px', 'margin-top': '4px' }}>在 iterations/feedbacks/ 目录下添加反馈记录</div>
                    </div>
                  </Show>
                  <For each={feedbacks()}>
                    {(fb) => <FeedbackCard feedback={fb} />}
                  </For>
                </div>
              </Show>

              {/* External Insights */}
              <Show when={activeTab() === 'insights'}>
                <InsightBoard
                  records={insightRecords()}
                  loading={insightLoading()}
                  onDeleteRecord={handleDeleteInsightRecord}
                  onConvertToRequirement={handleConvertSuggestionToRequirement}
                  onConvertToHypothesis={handleConvertSuggestionToHypothesis}
                />
              </Show>
            </div>
          </div>
        </div>

        {/* Right: Insight Agent Panel */}
        <div style={{ width: '400px', 'flex-shrink': 0, height: 'calc(100vh - 160px)', position: 'sticky', top: '0' }}>
          <InsightAgentPanel
            callAgentFn={actions.callAgent}
            productName={productStore.activeProduct()?.name}
            workDir={productStore.activeProduct()?.workDir ?? ''}
            productContext={[
              productOverview() ? `## 产品概述\n${productOverview()}` : '',
              productRoadmap() ? `## 路线图\n${productRoadmap()}` : '',
              metrics().length > 0 ? `## 业务指标\n${metrics().map(m => `- ${m.label}: ${m.value}${m.unit ?? ''} (${m.trendValue})`).join('\n')}` : '',
              `## 当前产品假设\n${hypotheses().map(h => `- [${h.status}] ${h.belief}${h.feature ? ` (功能: ${h.feature})` : ''}`).join('\n') || '（暂无）'}`,
              features().length > 0 ? `## 功能注册表\n${features().map(f => `- [${f.status}] ${f.title ?? f.name}${f.hypothesis ? ` (假设: ${f.hypothesis})` : ''}`).join('\n')}` : '',
              feedbacks().length > 0 ? `## 用户反馈摘要\n${feedbacks().slice(0, 5).map(f => `- [${f.sentiment}] ${f.user}: ${(f.content ?? '').slice(0, 60)}`).join('\n')}` : '',
              requirements().length > 0 ? `## 已有需求文档\n${requirements().map(r => `- [${r.priority}] ${r.title}`).join('\n')}` : '',
            ].filter(Boolean).join('\n\n')}
            onHypothesisSave={handleHypothesisSaveFromAgent}
            onRequirementSave={handleRequirementSaveFromAgent}
            onInsightRecord={handleInsightRecord}
          />
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

      {/* Requirement Detail Modal */}
      <Show when={detailReq()}>
        <div style={{ position: 'fixed', inset: 0, 'z-index': 50, display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setDetailReq(null)} />
          <div style={{ position: 'relative', background: themeColors.surface, 'border-radius': '16px', 'box-shadow': '0 4px 24px rgba(0,0,0,0.15)', padding: '24px', width: '700px', 'max-height': '90vh', 'overflow-y': 'auto' }}>
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '16px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <span style={{ 'font-weight': 600, 'font-size': '16px', color: themeColors.text }}>📋 {detailReq()!.title}</span>
                <span style={{ 'font-size': '12px', padding: '1px 8px', 'border-radius': '4px', 'font-weight': 700, background: (priorityStyle[detailReq()!.priority] || priorityStyle.P3).bg, color: 'white' }}>
                  {detailReq()!.priority}
                </span>
                <span style={{ 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '4px' }}>
                  {reqTypeLabel[detailReq()!.type]}
                </span>
              </div>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <button
                  style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: reqEditMode() === 'preview' ? themeColors.primaryBg : themeColors.surface, color: reqEditMode() === 'preview' ? chartColors.primary : themeColors.textSecondary, cursor: 'pointer' }}
                  onClick={() => setReqEditMode('preview')}
                >预览</button>
                <button
                  style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: reqEditMode() === 'edit' ? themeColors.primaryBg : themeColors.surface, color: reqEditMode() === 'edit' ? chartColors.primary : themeColors.textSecondary, cursor: 'pointer' }}
                  onClick={() => setReqEditMode('edit')}
                >编辑</button>
                <Show when={reqEditMode() === 'edit'}>
                  <button
                    style={{ 'font-size': '12px', padding: '4px 12px', 'border-radius': '6px', border: 'none', background: chartColors.primary, color: 'white', cursor: 'pointer' }}
                    onClick={() => {
                      const r = detailReq()!;
                      const updated = { ...r, content: reqEditContent() };
                      setRequirements(prev => prev.map(item => item.id === r.id ? updated : item));
                      setDetailReq(updated);
                      setReqEditMode('preview');
                      const workDir = productStore.activeProduct()?.workDir;
                      if (workDir) void saveRequirementOutput(workDir, updated as unknown as Parameters<typeof saveRequirementOutput>[1]);
                    }}
                  >保存</button>
                </Show>
                <button style={{ color: themeColors.textMuted, 'font-size': '20px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setDetailReq(null)}>✕</button>
              </div>
            </div>

            <Show when={reqEditMode() === 'preview'}>
              <div style={{ 'font-size': '14px', 'line-height': '1.8', color: themeColors.text }} innerHTML={markdownToSafeHtml(reqEditContent())} />
            </Show>
            <Show when={reqEditMode() === 'edit'}>
              <textarea
                value={reqEditContent()}
                onInput={(e) => setReqEditContent(e.currentTarget.value)}
                style={{ width: '100%', 'min-height': '360px', border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '12px', 'font-size': '13px', 'font-family': '"SF Mono", "Fira Code", monospace', 'line-height': '1.6', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text, outline: 'none' }}
              />
            </Show>

            <div style={{ 'margin-top': '16px', 'padding-top': '12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', color: themeColors.textMuted }}>
              <span>创建于 {detailReq()!.createdAt}</span>
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
                  if (workDir) {
                    void saveHypothesis(workDir, newH as unknown as Parameters<typeof saveHypothesis>[1]);
                    invalidateKnowledgeCache();
                  }
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
