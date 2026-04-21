import { Component, createSignal, createEffect, For, Show } from 'solid-js';
import {
  reqTypeLabel,
} from '../../../mock/solo';
import {
  loadHypotheses,
  loadRequirementOutputs,
  saveHypothesis,
  saveRequirementOutput,
  updateRequirementStatus,
  loadUserFeedbacks,
  loadProductFeatures,
  loadProductOverview,
  loadProductRoadmap,
  loadSoloMetrics,
  appendHypothesisResultToPrd,
  convertHypothesisToRequirement,
  loadPrds,
  loadSdds,
  savePrd,
  saveSdd,
  type SoloHypothesis,
  type SoloHypothesisStatus,
  type SoloRequirementOutput,
  type SoloUserFeedback,
  type SoloProductFeature,
  type SoloBusinessMetric,
  type RequirementStatus,
  type PrdFrontmatter,
  type SddFrontmatter,
} from '../../../services/file-store';
import { SOLO_AGENTS } from '../../../services/autopilot-executor';
import { invalidateKnowledgeCache } from '../../../services/knowledge-retrieval';
import { useAppStore } from '../../../stores/app-store';
import type { SkillApiAdapter } from '../../../services/knowledge-behavior';
import { themeColors, chartColors } from '../../../utils/colors';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { InsightRecord, ProductSuggestion } from '../../../services/insight-store';
import { loadInsightRecords, saveInsightRecord, deleteInsightRecord } from '../../../services/insight-store';
import InsightAgentPanel from '../../../components/insight/insight-agent-panel';
import InsightBoard from '../../../components/insight/insight-board';
import FeedbackCard from '../../../components/insight/feedback-card';
import RequirementCard from '../../../components/requirement/requirement-card';
import PushToDevModal from '../../../components/requirement/push-to-dev-modal';
import { pushRequirementToDev, type TaskDraft } from '../../../services/requirement-dev-bridge';
import GitStatusBadge from '../../../components/common/git-status-badge';
import LiveMarkdownEditor from '../../../../components/live-markdown-editor';
import type { EditorView } from '@codemirror/view';
import {
  modalOverlayClass, modalShellClass, modalHeaderClass,
  modalBodyClass, modalFooterClass, modalTitleClass,
  modalHeaderButtonClass, pillPrimaryClass, pillSecondaryClass,
} from '../../../../workspace/modal-styles';

const statusConfig: Record<SoloHypothesisStatus, { label: string; icon: string; bg: string; border: string; cardBorder: string }> = {
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
  dragOverStatus: () => SoloHypothesisStatus | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetStatus: SoloHypothesisStatus, transferId?: string) => void;
  onDragEnter: (status: SoloHypothesisStatus) => void;
  onDragLeave: () => void;
}

// ─── HypothesisColumn ───────────────────────────────────────────────────────

/** 每列的颜色主题（普通态 / drag-over 态） */
const columnTheme: Record<SoloHypothesisStatus, {
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
  status: SoloHypothesisStatus;
  items: SoloHypothesis[];
  onDetail: (h: SoloHypothesis) => void;
  onAddNew?: () => void;
  onConvertToRequirement?: (h: SoloHypothesis) => void;
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
                  <Show when={props.status === 'validated' && props.onConvertToRequirement}>
                    <button
                      style={{ 'font-size': '11px', padding: '1px 8px', 'border-radius': '4px', border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.primaryBg, color: chartColors.primary, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); props.onConvertToRequirement!(h); }}
                    >+需求</button>
                  </Show>
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

  // ── SkillApiAdapter ───────────────────────────────────────────────
  const skillApi: SkillApiAdapter = {
    listSkills: () => actions.listOpenworkSkills(),
    getSkill: (name) => actions.getOpenworkSkill(name),
    upsertSkill: (name, content, desc) => actions.upsertOpenworkSkill(name, content, desc),
  };

  const [activeTab, setActiveTab] = createSignal<'hypotheses' | 'requirements' | 'features' | 'feedbacks' | 'insights'>('hypotheses');
  const [hypotheses, setHypotheses] = createSignal<SoloHypothesis[]>([]);
  const [requirements, setRequirements] = createSignal<SoloRequirementOutput[]>([]);
  const [insightRecords, setInsightRecords] = createSignal<InsightRecord[]>([]);
  const [insightLoading, setInsightLoading] = createSignal(false);
  const [pageLoading, setPageLoading] = createSignal(false);
  // New real-data signals
  const [features, setFeatures] = createSignal<SoloProductFeature[]>([]);
  const [feedbacks, setFeedbacks] = createSignal<SoloUserFeedback[]>([]);
  const [productOverview, setProductOverview] = createSignal('');
  const [productRoadmap, setProductRoadmap] = createSignal('');
  const [metrics, setMetrics] = createSignal<SoloBusinessMetric[]>([]);
  const [detailHypo, setDetailHypo] = createSignal<SoloHypothesis | null>(null);
  const [editMode, setEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [editContent, setEditContent] = createSignal('');
  // 需求详情悬浮窗
  const [detailReq, setDetailReq] = createSignal<SoloRequirementOutput | null>(null);
  const [reqEditMode, setReqEditMode] = createSignal<'preview' | 'edit'>('preview');
  const [reqEditContent, setReqEditContent] = createSignal('');
  const [newHypothesisModal, setNewHypothesisModal] = createSignal(false);
  const [newHypothesisText, setNewHypothesisText] = createSignal('');
  const [newHypothesisMethod, setNewHypothesisMethod] = createSignal('');

  // 需求筛选
  const [reqFilterFeature, setReqFilterFeature] = createSignal('');
  const [reqFilterStatus, setReqFilterStatus] = createSignal('');
  const filteredRequirements = () => {
    let list = requirements();
    const feat = reqFilterFeature();
    const st = reqFilterStatus();
    if (feat) list = list.filter((r) => r.linkedFeatureId === feat);
    if (st) list = list.filter((r) => (r.status ?? 'draft') === st);
    return list;
  };
  // 推送至研发目标需求
  const [pushToDevTarget, setPushToDevTarget] = createSignal<SoloRequirementOutput | null>(null);

  // 产品模块展开状态 + PRD/SDD 数据
  const [expandedFeatureId, setExpandedFeatureId] = createSignal<string | null>(null);
  const [featureDocTab, setFeatureDocTab] = createSignal<'prd' | 'sdd'>('prd');
  const [featurePrds, setFeaturePrds] = createSignal<Map<string, PrdFrontmatter & { _body?: string }>>(new Map());
  const [featureSdds, setFeatureSdds] = createSignal<Map<string, SddFrontmatter & { _body?: string }>>(new Map());

  // 文档弹窗编辑器
  const [modalEditorView, setModalEditorView] = createSignal<EditorView | null>(null);

  // Markdown 工具栏 helper 函数
  const mdWrapSel = (before: string, after = before) => {
    const v = modalEditorView();
    if (!v) return;
    const { from, to } = v.state.selection.main;
    const sel = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: `${before}${sel}${after}` },
      selection: { anchor: from + before.length, head: from + before.length + sel.length },
    });
    v.focus();
  };
  const mdLinePrefix = (prefix: string) => {
    const v = modalEditorView();
    if (!v) return;
    const line = v.state.doc.lineAt(v.state.selection.main.from);
    v.dispatch({ changes: { from: line.from, insert: prefix } });
    v.focus();
  };
  const mdInsertAt = (text: string) => {
    const v = modalEditorView();
    if (!v) return;
    const from = v.state.selection.main.from;
    v.dispatch({ changes: { from, insert: text } });
    v.focus();
  };

  // 全屏弹窗
  const [fullscreenDoc, setFullscreenDoc] = createSignal<{
    type: 'prd' | 'sdd'; slug: string; title: string; body: string;
    meta?: PrdFrontmatter | SddFrontmatter;
  } | null>(null);
  const [fullscreenMode, setFullscreenMode] = createSignal<'view' | 'edit'>('view');
  const [fullscreenEditContent, setFullscreenEditContent] = createSignal('');

  // Drag-and-drop
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = createSignal<SoloHypothesisStatus | null>(null);

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

  // 错误状态
  const [loadError, setLoadError] = createSignal<string | null>(null);

  // 竞态保护：loadVersion 递增计数器，防止快速切换产品时旧请求覆盖新数据
  let loadVersion = 0;

  // ─── 需求状态操作 handlers ───
  const handleRequirementStatusChange = async (id: string, status: RequirementStatus) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    await updateRequirementStatus(workDir, id, status);
    // 刷新列表
    const updated = await loadRequirementOutputs(workDir);
    setRequirements(updated);
  };

  const handlePushToDev = (requirement: SoloRequirementOutput) => {
    setPushToDevTarget(requirement);
  };

  const loadAllData = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const currentVersion = ++loadVersion;
    setPageLoading(true);
    setLoadError(null);
    try {
      const [fileHypo, fileReqs, fileFeedbacks, fileFeatures, overview, roadmap, metricsData, records, prds, sdds] = await Promise.all([
        loadHypotheses(workDir),
        loadRequirementOutputs(workDir),
        loadUserFeedbacks(workDir),
        loadProductFeatures(workDir),
        loadProductOverview(workDir),
        loadProductRoadmap(workDir),
        loadSoloMetrics(workDir),
        loadInsightRecords(workDir),
        loadPrds(workDir),
        loadSdds(workDir),
      ]);
      // 竞态守卫：如果版本已过期，丢弃结果
      if (currentVersion !== loadVersion) return;
      setHypotheses(fileHypo);
      setRequirements(fileReqs);
      setFeedbacks(fileFeedbacks);
      setFeatures(fileFeatures);
      setProductOverview(overview);
      setProductRoadmap(roadmap);
      setMetrics(metricsData.businessMetrics ?? []);
      setInsightRecords(records);
      // 按 featureSlug 索引 PRD/SDD
      const prdMap = new Map<string, PrdFrontmatter & { _body?: string }>();
      for (const p of prds) if ((p as any)._featureSlug) prdMap.set((p as any)._featureSlug, p as any);
      setFeaturePrds(prdMap);
      const sddMap = new Map<string, SddFrontmatter & { _body?: string }>();
      for (const s of sdds) if ((s as any)._featureSlug) sddMap.set((s as any)._featureSlug, s as any);
      setFeatureSdds(sddMap);
    } catch (e) {
      if (currentVersion !== loadVersion) return;
      setLoadError('数据加载失败，请检查网络连接后刷新');
      console.error('[xingjing] 产品洞察数据加载失败:', e);
    } finally {
      if (currentVersion === loadVersion) setPageLoading(false);
    }
  };

  // 监听活跃产品变化，自动重度加载数据：
  // - 首次挂载时即触发（替代 onMount）
  // - activeProduct() 切换时（如切换产品、从文件异步加载完成）也会重载
  createEffect(() => {
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void loadAllData();
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

  const openHypoDetail = (h: SoloHypothesis) => {
    setDetailHypo(h);
    setEditMode('preview');
    const md = h.markdownDetail || `## 假设：${h.belief}\n\n### 因为\n\n${h.why}\n\n### 验证方式\n\n${h.method}${h.result ? `\n\n### 实际结果\n\n${h.result}` : ''}`;
    setEditContent(md);
  };

  // 打开需求详情
  const openReqDetail = (req: SoloRequirementOutput) => {
    setDetailReq(req);
    setReqEditMode('preview');
    setReqEditContent(req.content);
  };

  // 从 AI 回复保存需求
  const saveReqFromAI = (rawContent: string) => {
    const match = REQ_DOC_REGEX.exec(rawContent);
    const title = match?.[1] || '新需求文档';
    const content = rawContent.replace(REQ_DOC_REGEX, '').trimStart();
    const newReq: SoloRequirementOutput = {
      id: `req_${Date.now()}`,
      title,
      type: 'user-story',
      content,
      priority: 'P1',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRequirements(prev => [newReq, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, newReq as Parameters<typeof saveRequirementOutput>[1]);
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
      const updated: SoloHypothesis = { ...original, status: targetStatus };
      setHypotheses(prev => prev.map(h => h.id === id ? updated : h));
      setDraggingId(null);
      setDragOverStatus(null);
      // 持久化到 workspace
      const workDir = productStore.activeProduct()?.workDir;
      if (workDir) {
        void saveHypothesis(workDir, updated as Parameters<typeof saveHypothesis>[1]);
        // SDD-014 Phase 2：验证状态变更时 fire-and-forget 回写 PRD
        if (['validated', 'invalidated'].includes(targetStatus) && updated.feature) {
          void appendHypothesisResultToPrd(workDir, updated);
        }
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
    const newH: SoloHypothesis = {
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
      void saveHypothesis(workDir, newH as Parameters<typeof saveHypothesis>[1]);
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
    // SDD-014 Phase 1：移除 enrichedSystemPrompt 中重复拼接的假设/需求摘要，由 productContext 统一提供
    const enrichedSystemPrompt = `${productBrainAgent.systemPrompt}

注意：当前产品假设、已有需求文档等完整上下文已通过 productContext 注入，可直接引用。

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

  // SDD-014 Phase 3：将已证实假设转化为需求草稿
  const handleConvertHypothesisToRequirement = async (h: SoloHypothesis) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const req = convertHypothesisToRequirement(h);
    await saveRequirementOutput(workDir, req as Parameters<typeof saveRequirementOutput>[1]);
    setRequirements(prev => [req, ...prev]);
    invalidateKnowledgeCache();
    showToast();
  };

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
    const newH: SoloHypothesis = {
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
      void saveHypothesis(workDir, newH as Parameters<typeof saveHypothesis>[1]);
      invalidateKnowledgeCache();
    }
  };

  const handleConvertSuggestionToRequirement = (sug: ProductSuggestion, _insightId: string) => {
    const newReq: SoloRequirementOutput = {
      id: `req-sug-${Date.now()}`,
      title: sug.title,
      type: 'user-story',
      content: `## 需求：${sug.title}\n\n### 背景\n${sug.rationale}\n\n### 分类\n${sug.category}\n\n### 优先级\n${sug.priority}\n`,
      priority: sug.priority === 'P0' ? 'P0' : sug.priority === 'P1' ? 'P1' : sug.priority === 'P2' ? 'P2' : 'P3',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRequirements(prev => [newReq, ...prev]);
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, newReq as Parameters<typeof saveRequirementOutput>[1]);
  };

  const handleHypothesisSaveFromAgent = (h: SoloHypothesis) => {
    setHypotheses(prev => {
      const exists = prev.some(item => item.id === h.id);
      return exists ? prev.map(item => item.id === h.id ? h : item) : [h, ...prev];
    });
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      void saveHypothesis(workDir, h as Parameters<typeof saveHypothesis>[1]);
      invalidateKnowledgeCache();
    }
  };

  const handleRequirementSaveFromAgent = (r: SoloRequirementOutput) => {
    setRequirements(prev => {
      const exists = prev.some(item => item.id === r.id);
      return exists ? prev.map(item => item.id === r.id ? r : item) : [r, ...prev];
    });
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) void saveRequirementOutput(workDir, r as Parameters<typeof saveRequirementOutput>[1]);
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
        <GitStatusBadge workDir={() => productStore.activeProduct()?.workDir} />
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
              <button style={tabStyle(activeTab() === 'requirements')} onClick={() => setActiveTab('requirements')}>
                📋 产品需求
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{requirements().length}</span>
              </button>
              <button style={tabStyle(activeTab() === 'features')} onClick={() => setActiveTab('features')}>
                📦 产品模块
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
              {/* 错误提示条 */}
              <Show when={loadError()}>
                <div style={{
                  padding: '8px 16px',
                  background: themeColors.errorBg,
                  color: chartColors.error,
                  'border-radius': '6px',
                  'font-size': '13px',
                  'margin-bottom': '12px',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px',
                }}>
                  <span>{loadError()}</span>
                  <button onClick={() => void loadAllData()}
                    style={{ cursor: 'pointer', 'text-decoration': 'underline', background: 'none', border: 'none', color: 'inherit', 'font-size': '13px', padding: 0 }}>
                    重试
                  </button>
                </div>
              </Show>
              {/* Hypotheses Kanban */}
              <Show when={activeTab() === 'hypotheses'}>
                <div style={{ padding: '10px 12px', background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '8px', 'margin-bottom': '14px', 'font-size': '12px', color: chartColors.primary }}>
                  💡 在右侧切换「奇想」模式，随手记录突发奇想，AI 自动补全后即出现在「验证中」列。拖拽卡片可流转假设状态。
                </div>
                <div style={{ display: 'flex', gap: '14px' }}
                  onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                >
                  <HypothesisColumn title="验证中" status="testing" items={testingItems()} onDetail={openHypoDetail} onAddNew={() => setNewHypothesisModal(true)} drag={drag} />
                  <HypothesisColumn title="已证实" status="validated" items={validatedItems()} onDetail={openHypoDetail} onConvertToRequirement={handleConvertHypothesisToRequirement} drag={drag} />
                  <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems()} onDetail={openHypoDetail} drag={drag} />
                </div>
              </Show>

              {/* Product Requirements */}
              <Show when={activeTab() === 'requirements'}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  {/* Filters */}
                  <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'margin-bottom': '4px' }}>
                    <select
                      style={{ 'font-size': '12px', padding: '4px 8px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                      onChange={(e) => setReqFilterFeature(e.currentTarget.value)}
                    >
                      <option value="">全部功能</option>
                      <For each={features()}>
                        {(f) => <option value={f.id}>{f.title ?? f.name}</option>}
                      </For>
                    </select>
                    <select
                      style={{ 'font-size': '12px', padding: '4px 8px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                      onChange={(e) => setReqFilterStatus(e.currentTarget.value)}
                    >
                      <option value="">全部状态</option>
                      <option value="draft">草稿</option>
                      <option value="review">审核中</option>
                      <option value="accepted">已确认</option>
                      <option value="in-dev">研发中</option>
                      <option value="done">已完成</option>
                      <option value="rejected">已否决</option>
                    </select>
                  </div>
                  {/* Requirement list */}
                  <Show when={filteredRequirements().length === 0}>
                    <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted, 'font-size': '14px' }}>
                      <div style={{ 'font-size': '32px', 'margin-bottom': '8px' }}>📋</div>
                      <div>暂无产品需求</div>
                      <div style={{ 'font-size': '12px', 'margin-top': '4px' }}>通过 AI 产品搭档生成需求，或在洞察面板中转化建议为需求</div>
                    </div>
                  </Show>
                  <For each={filteredRequirements()}>
                    {(req) => (
                      <RequirementCard
                        requirement={req}
                        features={features()}
                        onStatusChange={handleRequirementStatusChange}
                        onPushToDev={handlePushToDev}
                      />
                    )}
                  </For>
                </div>
              </Show>

              {/* Product Modules */}
              <Show when={activeTab() === 'features'}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <Show when={features().length === 0}>
                    <div style={{ 'text-align': 'center', padding: '48px 0', color: themeColors.textMuted, 'font-size': '14px' }}>
                      <div style={{ 'font-size': '32px', 'margin-bottom': '8px' }}>📦</div>
                      <div>暂无产品模块</div>
                      <div style={{ 'font-size': '12px', 'margin-top': '4px' }}>在 product/features/_index.yml 中添加模块条目</div>
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
                      const isExpanded = () => expandedFeatureId() === feat.id;
                      const slug = feat.id;
                      const prd = () => featurePrds().get(slug);
                      const sdd = () => featureSdds().get(slug);
                      const prdStatusCfg: Record<string, { label: string; bg: string; color: string }> = {
                        approved: { label: '已审批', bg: themeColors.successBg, color: chartColors.success },
                        reviewing: { label: '审核中', bg: themeColors.warningBg, color: themeColors.warningDark },
                        draft: { label: '草稿', bg: themeColors.hover, color: themeColors.textSecondary },
                      };
                      return (
                        <div style={{ 'border-radius': '12px', border: `1px solid ${isExpanded() ? chartColors.primary : themeColors.borderLight}`, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                          {/* Card Header — clickable */}
                          <div
                            style={{ padding: '14px 16px', cursor: 'pointer', 'user-select': 'none', background: isExpanded() ? themeColors.primaryBg : 'transparent', transition: 'background 0.2s' }}
                            onClick={() => { setExpandedFeatureId(isExpanded() ? null : feat.id); setFeatureDocTab('prd'); }}
                          >
                            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
                              <span style={{ 'font-size': '12px', color: themeColors.textMuted, transition: 'transform 0.2s', transform: isExpanded() ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{feat.title ?? feat.name}</span>
                              <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '4px', background: s.bg, color: s.color }}>{s.label}</span>
                              <Show when={feat.since}>
                                <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>since {feat.since}</span>
                              </Show>
                              <Show when={feat.hypothesis}>
                                <span style={{ 'font-size': '11px', padding: '1px 6px', 'border-radius': '4px', background: themeColors.primaryBg, color: chartColors.primary }}>🔗 {feat.hypothesis}</span>
                              </Show>
                              {/* PRD/SDD 有无指示器 */}
                              <Show when={prd()}>
                                <span style={{ 'font-size': '10px', padding: '1px 5px', 'border-radius': '3px', background: '#e6f7ff', color: '#1890ff' }}>PRD</span>
                              </Show>
                              <Show when={sdd()}>
                                <span style={{ 'font-size': '10px', padding: '1px 5px', 'border-radius': '3px', background: '#f6ffed', color: '#52c41a' }}>SDD</span>
                              </Show>
                            </div>
                            <Show when={feat.brief ?? feat.description}>
                              <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-top': '4px', 'padding-left': '20px' }}>
                                {feat.brief ?? feat.description}
                              </div>
                            </Show>
                          </div>

                          {/* Expanded Detail: PRD / SDD tabs */}
                          <Show when={isExpanded()}>
                            <div style={{ 'border-top': `1px solid ${themeColors.borderLight}`, padding: '12px 16px' }}>
                              {/* Doc sub-tabs */}
                              <div style={{ display: 'flex', gap: '4px', 'margin-bottom': '12px' }}>
                                <button
                                  style={{ padding: '4px 12px', 'font-size': '12px', 'border-radius': '6px', border: 'none', cursor: 'pointer', background: featureDocTab() === 'prd' ? chartColors.primary : themeColors.hover, color: featureDocTab() === 'prd' ? '#fff' : themeColors.textSecondary, transition: 'all 0.15s' }}
                                  onClick={(e) => { e.stopPropagation(); setFeatureDocTab('prd'); }}
                                >
                                  📖 功能设计 (PRD)
                                </button>
                                <button
                                  style={{ padding: '4px 12px', 'font-size': '12px', 'border-radius': '6px', border: 'none', cursor: 'pointer', background: featureDocTab() === 'sdd' ? chartColors.primary : themeColors.hover, color: featureDocTab() === 'sdd' ? '#fff' : themeColors.textSecondary, transition: 'all 0.15s' }}
                                  onClick={(e) => { e.stopPropagation(); setFeatureDocTab('sdd'); }}
                                >
                                  🛠 技术设计 (SDD)
                                </button>
                              </div>

                              {/* PRD content */}
                              <Show when={featureDocTab() === 'prd'}>
                                <Show when={prd()} fallback={
                                  <div style={{ 'text-align': 'center', padding: '24px 0', color: themeColors.textMuted, 'font-size': '13px' }}>
                                    <div style={{ 'margin-bottom': '4px' }}>📄 暂无 PRD 文档</div>
                                    <div style={{ 'font-size': '11px' }}>在 product/features/{slug}/PRD.md 中添加功能设计文档</div>
                                  </div>
                                }>
                                  {(p) => {
                                    const ps = prdStatusCfg[(p() as any).status] ?? prdStatusCfg.draft;
                                    const bodyText = () => (p() as any)._body || '';
                                    return (
                                      <div>
                                        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
                                          <span style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>{(p() as any).title}</span>
                                          <span style={{ 'font-size': '10px', padding: '1px 5px', 'border-radius': '3px', background: ps.bg, color: ps.color }}>{ps.label}</span>
                                          <Show when={(p() as any).owner}>
                                            <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>负责人: {(p() as any).owner}</span>
                                          </Show>
                                          <div style={{ 'margin-left': 'auto', display: 'flex', gap: '4px' }}>
                                            <button
                                              style={{ padding: '2px 8px', 'font-size': '11px', 'border-radius': '4px', border: `1px solid ${themeColors.border}`, background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }}
                                              onClick={(e) => { e.stopPropagation(); setModalEditorView(null); setFullscreenDoc({ type: 'prd', slug, title: (p() as any).title || slug, body: bodyText(), meta: p() as any }); setFullscreenEditContent(bodyText()); setFullscreenMode('edit'); }}
                                            >编辑</button>
                                            <button
                                              style={{ padding: '2px 8px', 'font-size': '11px', 'border-radius': '4px', border: `1px solid ${themeColors.border}`, background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }}
                                              onClick={(e) => { e.stopPropagation(); setFullscreenDoc({ type: 'prd', slug, title: (p() as any).title || slug, body: bodyText(), meta: p() as any }); setFullscreenMode('view'); setFullscreenEditContent(bodyText()); }}
                                            >全屏</button>
                                          </div>
                                        </div>
                                        <Show when={bodyText()}>
                                          <div style={{ 'font-size': '13px', color: themeColors.text, 'line-height': '1.7', 'max-height': '400px', overflow: 'auto', padding: '8px 12px', background: themeColors.hover, 'border-radius': '6px' }} innerHTML={markdownToSafeHtml(bodyText())} />
                                        </Show>
                                      </div>
                                    );
                                  }}
                                </Show>
                              </Show>

                              {/* SDD content */}
                              <Show when={featureDocTab() === 'sdd'}>
                                <Show when={sdd()} fallback={
                                  <div style={{ 'text-align': 'center', padding: '24px 0', color: themeColors.textMuted, 'font-size': '13px' }}>
                                    <div style={{ 'margin-bottom': '4px' }}>📄 暂无 SDD 文档</div>
                                    <div style={{ 'font-size': '11px' }}>在 product/features/{slug}/SDD.md 中添加技术设计文档</div>
                                  </div>
                                }>
                                  {(d) => {
                                    const ds = prdStatusCfg[(d() as any).status] ?? prdStatusCfg.draft;
                                    const bodyText = () => (d() as any)._body || '';
                                    return (
                                      <div>
                                        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
                                          <span style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>{(d() as any).title}</span>
                                          <span style={{ 'font-size': '10px', padding: '1px 5px', 'border-radius': '3px', background: ds.bg, color: ds.color }}>{ds.label}</span>
                                          <Show when={(d() as any).owner}>
                                            <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>负责人: {(d() as any).owner}</span>
                                          </Show>
                                          <div style={{ 'margin-left': 'auto', display: 'flex', gap: '4px' }}>
                                            <button
                                              style={{ padding: '2px 8px', 'font-size': '11px', 'border-radius': '4px', border: `1px solid ${themeColors.border}`, background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }}
                                              onClick={(e) => { e.stopPropagation(); setModalEditorView(null); setFullscreenDoc({ type: 'sdd', slug, title: (d() as any).title || slug, body: bodyText(), meta: d() as any }); setFullscreenEditContent(bodyText()); setFullscreenMode('edit'); }}
                                            >编辑</button>
                                            <button
                                              style={{ padding: '2px 8px', 'font-size': '11px', 'border-radius': '4px', border: `1px solid ${themeColors.border}`, background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }}
                                              onClick={(e) => { e.stopPropagation(); setFullscreenDoc({ type: 'sdd', slug, title: (d() as any).title || slug, body: bodyText(), meta: d() as any }); setFullscreenMode('view'); setFullscreenEditContent(bodyText()); }}
                                            >全屏</button>
                                          </div>
                                        </div>
                                        <Show when={bodyText()}>
                                          <div style={{ 'font-size': '13px', color: themeColors.text, 'line-height': '1.7', 'max-height': '400px', overflow: 'auto', padding: '8px 12px', background: themeColors.hover, 'border-radius': '6px' }} innerHTML={markdownToSafeHtml(bodyText())} />
                                        </Show>
                                      </div>
                                    );
                                  }}
                                </Show>
                              </Show>
                            </div>
                          </Show>
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
            skillApi={skillApi}
            productContext={[
              productOverview() ? `## 产品概述\n${productOverview()}` : '',
              productRoadmap() ? `## 路线图\n${productRoadmap()}` : '',
              metrics().length > 0 ? `## 业务指标\n${metrics().map(m => `- ${m.label}: ${m.value}${m.unit ?? ''} (${m.trendValue})`).join('\n')}` : '',
              // SDD-014 Phase 1: 假设/功能模块/需求各加 slice(0, 20) 上限
              `## 当前产品假设\n${hypotheses().slice(0, 20).map(h => `- [${h.status}] ${h.belief}${h.feature ? ` (功能: ${h.feature})` : ''}`).join('\n') || '（暂无）'}`,
              features().slice(0, 20).length > 0 ? `## 功能注册表\n${features().slice(0, 20).map(f => `- [${f.status}] ${f.title ?? f.name}${f.hypothesis ? ` (假设: ${f.hypothesis})` : ''}`).join('\n')}` : '',
              feedbacks().length > 0 ? `## 用户反馈摘要\n${feedbacks().slice(0, 5).map(f => `- [${f.sentiment}] ${f.user}: ${(f.content ?? '').slice(0, 60)}`).join('\n')}` : '',
              requirements().slice(0, 20).length > 0 ? `## 已有需求文档\n${requirements().slice(0, 20).map(r => `- [${r.priority}] ${r.title}`).join('\n')}` : '',
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
                      if (workDir) void saveRequirementOutput(workDir, updated as Parameters<typeof saveRequirementOutput>[1]);
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
                  const newH: SoloHypothesis = {
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
                    void saveHypothesis(workDir, newH as Parameters<typeof saveHypothesis>[1]);
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

      {/* Push to Dev Modal */}
      <Show when={pushToDevTarget()}>
        <PushToDevModal
          requirement={pushToDevTarget()!}
          features={features()}
          onCancel={() => setPushToDevTarget(null)}
          onConfirm={async (tasks: TaskDraft[], sprintId?: string) => {
            const workDir = productStore.activeProduct()?.workDir;
            if (!workDir || !pushToDevTarget()) return;
            await pushRequirementToDev({
              workDir,
              requirement: pushToDevTarget()!,
              tasks,
              sprintId,
            });
            setPushToDevTarget(null);
            const updated = await loadRequirementOutputs(workDir);
            setRequirements(updated);
          }}
        />
      </Show>

      {/* Fullscreen Document Modal */}
      <Show when={fullscreenDoc()}>
        {(doc) => (
          <div class={modalOverlayClass} onClick={() => setFullscreenDoc(null)}>
            <div class={modalShellClass} style={{ width: '80vw', 'max-width': '80vw' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
              <div class={modalHeaderClass}>
                <div>
                  <h2 class={modalTitleClass}>{doc().title}</h2>
                  <span style={{ 'font-size': '12px', color: themeColors.textSecondary }}>{doc().type === 'prd' ? '功能设计 (PRD)' : '技术设计 (SDD)'}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
                  <button
                    class={fullscreenMode() === 'edit' ? pillPrimaryClass : pillSecondaryClass}
                    onClick={() => { if (fullscreenMode() === 'edit') { setFullscreenMode('view'); } else { setModalEditorView(null); setFullscreenEditContent(doc().body); setFullscreenMode('edit'); } }}
                  >{fullscreenMode() === 'edit' ? '预览' : '编辑'}</button>
                  <button class={modalHeaderButtonClass} onClick={() => setFullscreenDoc(null)}>✕</button>
                </div>
              </div>
              <div class={modalBodyClass} style={{ padding: '0' }}>
                <Show when={fullscreenMode() === 'edit'} fallback={
                  <div style={{ 'font-size': '14px', color: themeColors.text, 'line-height': '1.8', padding: '24px' }} innerHTML={markdownToSafeHtml(doc().body)} />
                }>
                  {/* Markdown 工具栏 */}
                  <div style={{
                    display: 'flex', gap: '2px', 'align-items': 'center', 'flex-wrap': 'wrap',
                    padding: '4px 10px', 'border-bottom': `1px solid ${themeColors.border}`,
                    background: themeColors.hover,
                  }}>
                    {/* 标题 */}
                    {([['H1', '# '], ['H2', '## '], ['H3', '### ']] as [string, string][]).map(([label, p]) => (
                      <button
                        title={`标题 ${label}`}
                        style={{ padding: '3px 7px', 'font-size': '11px', 'font-weight': 700, 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer', 'font-family': 'inherit' }}
                        onClick={(e) => { e.preventDefault(); mdLinePrefix(p); }}
                      >{label}</button>
                    ))}
                    <span style={{ width: '1px', height: '16px', background: themeColors.border, margin: '0 4px' }} />
                    {/* 粗体、斜体、删除线 */}
                    <button title="加粗 (Ctrl+B)" style={{ padding: '3px 7px', 'font-size': '12px', 'font-weight': 700, 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('**'); }}>B</button>
                    <button title="斜体 (Ctrl+I)" style={{ padding: '3px 7px', 'font-size': '12px', 'font-style': 'italic', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('*'); }}>I</button>
                    <button title="删除线" style={{ padding: '3px 7px', 'font-size': '12px', 'text-decoration': 'line-through', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('~~'); }}>S</button>
                    <span style={{ width: '1px', height: '16px', background: themeColors.border, margin: '0 4px' }} />
                    {/* 代码 */}
                    <button title="内联代码" style={{ padding: '3px 7px', 'font-size': '11px', 'font-family': 'monospace', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('`'); }}>`code`</button>
                    <button title="代码块" style={{ padding: '3px 7px', 'font-size': '11px', 'font-family': 'monospace', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('```\n', '\n```'); }}>```</button>
                    <span style={{ width: '1px', height: '16px', background: themeColors.border, margin: '0 4px' }} />
                    {/* 列表、引用 */}
                    <button title="无序列表" style={{ padding: '3px 7px', 'font-size': '13px', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdLinePrefix('- '); }}>• 列表</button>
                    <button title="有序列表" style={{ padding: '3px 7px', 'font-size': '11px', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdLinePrefix('1. '); }}>1. 列表</button>
                    <button title="引用" style={{ padding: '3px 7px', 'font-size': '12px', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdLinePrefix('> '); }}>&#10077; 引用</button>
                    <span style={{ width: '1px', height: '16px', background: themeColors.border, margin: '0 4px' }} />
                    {/* 链接、分割线 */}
                    <button title="插入链接" style={{ padding: '3px 7px', 'font-size': '11px', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdWrapSel('[', '](url)'); }}>🔗 链接</button>
                    <button title="分割线" style={{ padding: '3px 7px', 'font-size': '11px', 'border-radius': '4px', border: 'none', background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); mdInsertAt('\n---\n'); }}>— 分割线</button>
                  </div>
                  {/* 编辑器 */}
                  <div style={{ 'min-height': '400px' }}>
                    <LiveMarkdownEditor
                      value={fullscreenEditContent()}
                      onChange={setFullscreenEditContent}
                      onEditorReady={setModalEditorView}
                      placeholder={`编辑 ${doc().type === 'prd' ? 'PRD' : 'SDD'} 内容...`}
                    />
                  </div>
                </Show>
              </div>
              <Show when={fullscreenMode() === 'edit'}>
                <div class={modalFooterClass}>
                  <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
                    <button class={pillSecondaryClass} onClick={() => setFullscreenMode('view')}>取消</button>
                    <button class={pillPrimaryClass} onClick={async () => {
                      const workDir = productStore.activeProduct()?.workDir;
                      if (!workDir) return;
                      const d = doc();
                      if (d.type === 'prd') {
                        await savePrd(workDir, { ...(d.meta as any), _featureSlug: d.slug, description: fullscreenEditContent() });
                        const prds = await loadPrds(workDir);
                        const prdMap = new Map<string, PrdFrontmatter & { _body?: string }>();
                        for (const pr of prds) if ((pr as any)._featureSlug) prdMap.set((pr as any)._featureSlug, pr as any);
                        setFeaturePrds(prdMap);
                      } else {
                        await saveSdd(workDir, { ...(d.meta as any), _featureSlug: d.slug }, fullscreenEditContent());
                        const sdds = await loadSdds(workDir);
                        const sddMap = new Map<string, SddFrontmatter & { _body?: string }>();
                        for (const sd of sdds) if ((sd as any)._featureSlug) sddMap.set((sd as any)._featureSlug, sd as any);
                        setFeatureSdds(sddMap);
                      }
                      setFullscreenDoc({ ...d, body: fullscreenEditContent() });
                      setFullscreenMode('view');
                    }}>保存</button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default SoloProduct;
