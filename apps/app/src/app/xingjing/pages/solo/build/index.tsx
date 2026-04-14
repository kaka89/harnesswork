import { Component, createSignal, For, Show, onMount } from 'solid-js';
import {
  soloTasks as mockSoloTasks,
  adrs as mockAdrs,
  codeReviews as mockCodeReviews,
  testReports as mockTestReports,
  SoloTask, ADR, CodeReviewItem, TestReport,
} from '../../../mock/solo';
import {
  loadSoloTasks,
  saveSoloTask,
  loadAdrs,
  saveAdr,
  type SoloTaskRecord,
  type SoloAdr,
} from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import {
  ChevronDown, ChevronUp, CheckCircle, GitPullRequest, FlaskConical, Send,
  Building2, ClipboardCheck, X, Pencil, Bot,
} from 'lucide-solid';
import {
  SOLO_AGENTS,
  runDirectAgent,
  type AutopilotAgent,
} from '../../../services/autopilot-executor';

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const typeStyleMap: Record<string, { bg: string; color: string }> = {
  dev:     { bg: themeColors.primaryBg, color: chartColors.primary },
  product: { bg: themeColors.purpleBg, color: themeColors.purple },
  ops:     { bg: themeColors.warningBg, color: themeColors.warningDark },
  growth:  { bg: themeColors.successBg, color: chartColors.success },
};

const statusStyleMap: Record<string, { bg: string; color: string }> = {
  todo:  { bg: themeColors.hover, color: themeColors.textSecondary },
  doing: { bg: themeColors.primaryBg, color: chartColors.primary },
  done:  { bg: themeColors.successBg, color: chartColors.success },
};

const typeLabel: Record<string, string> = { dev: '开发', product: '产品', ops: '运营', growth: '增长' };
const statusLabel: Record<string, string> = { todo: '待办', doing: '进行中', done: '完成' };

const reviewStatusMap: Record<string, { bg: string; color: string; label: string }> = {
  pending:            { bg: themeColors.warningBg,  color: themeColors.warningDark, label: '待审核' },
  approved:           { bg: themeColors.successBg,  color: chartColors.success,     label: '已通过' },
  'changes-requested':{ bg: '#fff1f0',              color: '#cf1322',               label: '需修改' },
};

const testStatusMap: Record<string, { bg: string; color: string; label: string }> = {
  passed:  { bg: themeColors.successBg,  color: chartColors.success,  label: '全部通过' },
  failed:  { bg: '#fff1f0',              color: '#cf1322',             label: '测试失败' },
  partial: { bg: themeColors.warningBg,  color: themeColors.warningDark, label: '部分通过' },
};

// ─── TaskCard ─────────────────────────────────────────────────────────────────

const TaskCard: Component<{ task: SoloTask; active?: boolean }> = (props) => {
  const [checked, setChecked] = createSignal<Record<number, boolean>>({});
  const doneCount = () => props.task.dod.filter((_, i) => checked()[i]).length;
  const progress = () => Math.round((doneCount() / props.task.dod.length) * 100);

  return (
    <div style={{
      'border-radius': '12px', padding: '14px',
      border: props.active ? `2px solid ${chartColors.primary}` : `1px solid ${themeColors.borderLight}`,
      background: props.active ? themeColors.primaryBg : themeColors.surface,
    }}>
      <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '8px', 'margin-bottom': '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '6px' }}>
            <Show when={props.active}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', 'border-radius': '50%', background: chartColors.primary, 'flex-shrink': 0 }} />
            </Show>
            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{props.task.title}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'margin-bottom': '8px' }}>
            <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: typeStyleMap[props.task.type]?.bg, color: typeStyleMap[props.task.type]?.color }}>
              {typeLabel[props.task.type]}
            </span>
            <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: statusStyleMap[props.task.status]?.bg, color: statusStyleMap[props.task.status]?.color }}>
              {statusLabel[props.task.status]}
            </span>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>预估 {props.task.est}</span>
          </div>
          <Show when={props.task.note}>
            <div style={{ 'margin-bottom': '8px', padding: '6px 10px', background: themeColors.warningBg, 'border-radius': '8px', 'font-size': '12px', color: themeColors.warning }}>
              📝 {props.task.note}
            </div>
          </Show>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '6px' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>DoD（完成标准）</span>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{doneCount()}/{props.task.dod.length}</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: themeColors.hover, 'border-radius': '9999px', 'margin-bottom': '8px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: chartColors.primary, 'border-radius': '9999px', transition: 'all 0.3s', width: `${progress()}%` }} />
        </div>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <For each={props.task.dod}>
            {(item, i) => (
              <label
                style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer' }}
                onClick={() => setChecked(prev => ({ ...prev, [i()]: !prev[i()] }))}
              >
                <div style={{
                  width: '14px', height: '14px', 'border-radius': '4px', 'flex-shrink': 0,
                  display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                  color: 'white', 'font-size': '12px',
                  border: checked()[i()] ? `1px solid ${chartColors.success}` : `1px solid ${themeColors.border}`,
                  background: checked()[i()] ? chartColors.success : 'transparent',
                }}>
                  {checked()[i()] && '✓'}
                </div>
                <span style={{ 'font-size': '12px', 'text-decoration': checked()[i()] ? 'line-through' : 'none', color: checked()[i()] ? themeColors.textMuted : themeColors.textSecondary }}>
                  {item}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

// ─── ADR Card（只读可展开） ────────────────────────────────────────────────────

const AdrCard: Component<{ adr: ADR }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  return (
    <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, overflow: 'hidden' }}>
      {/* 折叠头部 */}
      <button
        style={{
          width: '100%', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          padding: '14px 16px', background: themeColors.surface, border: 'none', cursor: 'pointer',
          'text-align': 'left',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', flex: 1 }}>
          <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{props.adr.title}</span>
          <span style={{
            'font-size': '11px', padding: '1px 8px', 'border-radius': '9999px',
            background: props.adr.status === 'active' ? themeColors.successBg : themeColors.hover,
            color: props.adr.status === 'active' ? chartColors.success : themeColors.textMuted,
          }}>
            {props.adr.status === 'active' ? '有效' : '已废弃'}
          </span>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{props.adr.date}</span>
        </div>
        <span style={{ color: themeColors.textMuted, 'flex-shrink': 0 }}>
          <Show when={expanded()} fallback={<ChevronDown size={16} />}>
            <ChevronUp size={16} />
          </Show>
        </span>
      </button>
      {/* 展开详情（只读） */}
      <Show when={expanded()}>
        <div style={{ padding: '0 16px 16px', background: themeColors.surface }}>
          <div style={{ height: '1px', background: themeColors.borderLight, 'margin-bottom': '14px' }} />
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={{ background: themeColors.warningBg, 'border-radius': '8px', padding: '12px' }}>
              <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-bottom': '6px', 'font-weight': 600 }}>❓ 问题背景</div>
              <div style={{ 'font-size': '13px', color: themeColors.text, 'line-height': '1.6' }}>{props.adr.question}</div>
            </div>
            <div style={{ background: themeColors.primaryBg, 'border-radius': '8px', padding: '12px' }}>
              <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-bottom': '6px', 'font-weight': 600 }}>✅ 决策内容</div>
              <div style={{ 'font-size': '13px', 'font-weight': 600, color: themeColors.text, 'line-height': '1.6' }}>{props.adr.decision}</div>
            </div>
            <div style={{ background: themeColors.successBg, 'border-radius': '8px', padding: '12px' }}>
              <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-bottom': '6px', 'font-weight': 600 }}>💡 决策原因</div>
              <div style={{ 'font-size': '13px', color: themeColors.text, 'line-height': '1.6' }}>{props.adr.reason}</div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ─── Code Diff Modal ──────────────────────────────────────────────────────────

const CodeDiffModal: Component<{
  review: CodeReviewItem;
  onClose: () => void;
  onAiRevise: (msg: string) => void;
}> = (props) => {
  const [selectedChangeIdx, setSelectedChangeIdx] = createSignal(0);
  const [editMode, setEditMode] = createSignal(false);
  const [editedCode, setEditedCode] = createSignal('');

  const currentChange = () => props.review.changes[selectedChangeIdx()];

  const handleEdit = () => {
    setEditedCode(currentChange().newCode);
    setEditMode(true);
  };

  const handleAiRevise = () => {
    const msg = `请帮我优化以下代码（来自 ${props.review.taskTitle} / ${currentChange().file}）：\n\n审核意见：${currentChange().comment}\n\n当前代码：\n\`\`\`\n${currentChange().newCode}\n\`\`\`\n\n请给出改进后的完整代码。`;
    props.onAiRevise(msg);
    props.onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
      <div style={{
        background: themeColors.surface, 'border-radius': '12px', width: '90vw', 'max-width': '860px',
        'max-height': '85vh', display: 'flex', 'flex-direction': 'column',
        'box-shadow': '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ 'font-weight': 700, 'font-size': '15px', color: themeColors.text, flex: 1 }}>
            代码审核 · {props.review.taskTitle}
          </span>
          <button onClick={props.onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted, display: 'flex', 'align-items': 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* File selector */}
        <Show when={props.review.changes.length > 1}>
          <div style={{ padding: '10px 20px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
            <For each={props.review.changes}>
              {(c, i) => (
                <button
                  onClick={() => { setSelectedChangeIdx(i()); setEditMode(false); }}
                  style={{
                    'font-size': '12px', padding: '4px 10px', 'border-radius': '6px',
                    background: selectedChangeIdx() === i() ? themeColors.primaryBg : themeColors.hover,
                    color: selectedChangeIdx() === i() ? chartColors.primary : themeColors.textSecondary,
                    border: selectedChangeIdx() === i() ? `1px solid ${chartColors.primary}` : `1px solid ${themeColors.border}`,
                    cursor: 'pointer', 'font-family': 'monospace',
                  }}
                >
                  {c.file.split('/').pop()}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Comment */}
        <div style={{ padding: '10px 20px', background: themeColors.warningBg, 'border-bottom': `1px solid ${themeColors.warningBorder}` }}>
          <span style={{ 'font-size': '12px', color: themeColors.warningDark }}>
            💬 审核意见：{currentChange().comment}
          </span>
        </div>

        {/* Diff view */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px', 'font-family': 'monospace' }}>
            📄 {currentChange().file}
          </div>
          <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px' }}>
            {/* 旧代码 */}
            <div>
              <div style={{ 'font-size': '11px', color: '#cf1322', 'font-weight': 600, 'margin-bottom': '6px' }}>− 修改前</div>
              <pre style={{
                background: '#fff1f0', 'border-radius': '8px', padding: '12px',
                'font-size': '12px', 'font-family': 'monospace', 'white-space': 'pre-wrap',
                'word-break': 'break-all', color: themeColors.text, 'line-height': '1.6',
                border: '1px solid #ffa39e', margin: 0, 'min-height': '120px',
              }}>
                {currentChange().oldCode}
              </pre>
            </div>
            {/* 新代码 */}
            <div>
              <div style={{ 'font-size': '11px', color: chartColors.success, 'font-weight': 600, 'margin-bottom': '6px' }}>+ 修改后</div>
              <Show when={!editMode()} fallback={
                <textarea
                  value={editedCode()}
                  onInput={(e) => setEditedCode(e.currentTarget.value)}
                  style={{
                    width: '100%', 'box-sizing': 'border-box', background: '#f6ffed',
                    'border-radius': '8px', padding: '12px', 'font-size': '12px',
                    'font-family': 'monospace', 'white-space': 'pre-wrap', color: themeColors.text,
                    'line-height': '1.6', border: `2px solid ${chartColors.success}`,
                    'min-height': '160px', resize: 'vertical', outline: 'none',
                  }}
                />
              }>
                <pre style={{
                  background: '#f6ffed', 'border-radius': '8px', padding: '12px',
                  'font-size': '12px', 'font-family': 'monospace', 'white-space': 'pre-wrap',
                  'word-break': 'break-all', color: themeColors.text, 'line-height': '1.6',
                  border: '1px solid #b7eb8f', margin: 0, 'min-height': '120px',
                }}>
                  {currentChange().newCode}
                </pre>
              </Show>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 20px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', gap: '10px', 'justify-content': 'flex-end' }}>
          <button
            onClick={props.onClose}
            style={{ padding: '7px 16px', 'border-radius': '7px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text, cursor: 'pointer', 'font-size': '13px' }}
          >
            关闭
          </button>
          <button
            onClick={handleEdit}
            style={{ padding: '7px 16px', 'border-radius': '7px', border: `1px solid ${themeColors.border}`, background: themeColors.hover, color: themeColors.textSecondary, cursor: 'pointer', 'font-size': '13px', display: 'flex', 'align-items': 'center', gap: '6px' }}
          >
            <Pencil size={13} />
            手动编辑
          </button>
          <button
            onClick={handleAiRevise}
            style={{ padding: '7px 16px', 'border-radius': '7px', border: 'none', background: '#08979c', color: 'white', cursor: 'pointer', 'font-size': '13px', display: 'flex', 'align-items': 'center', gap: '6px' }}
          >
            <Bot size={13} />
            AI 搭档修订
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Code Review Tab ──────────────────────────────────────────────────────────

const CodeReviewTab: Component<{
  reviews: CodeReviewItem[];
  onAiRevise: (msg: string) => void;
}> = (props) => {
  const [activeReview, setActiveReview] = createSignal<CodeReviewItem | null>(null);

  return (
    <div>
      <Show
        when={props.reviews.length > 0}
        fallback={
          <div style={{ padding: '40px', 'text-align': 'center', color: themeColors.textMuted, 'font-size': '14px' }}>
            暂无代码审核记录
          </div>
        }
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
          <For each={props.reviews}>
            {(review) => {
              const statusInfo = () => reviewStatusMap[review.status] ?? reviewStatusMap.pending;
              return (
                <div
                  onClick={() => setActiveReview(review)}
                  style={{
                    'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`,
                    padding: '16px', cursor: 'pointer', background: themeColors.surface,
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = chartColors.primary)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = themeColors.borderLight)}
                >
                  <div style={{ display: 'flex', 'align-items': 'flex-start', 'justify-content': 'space-between', 'margin-bottom': '8px' }}>
                    <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, flex: 1, 'margin-right': '10px' }}>
                      {review.taskTitle}
                    </span>
                    <span style={{ 'font-size': '12px', padding: '2px 8px', 'border-radius': '9999px', background: statusInfo().bg, color: statusInfo().color, 'flex-shrink': 0 }}>
                      {statusInfo().label}
                    </span>
                  </div>
                  <p style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '10px', 'line-height': '1.6', margin: '0 0 10px' }}>
                    {review.summary}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
                    <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                      📁 {review.filesChanged} 文件
                    </span>
                    <span style={{ 'font-size': '12px', color: chartColors.success }}>+{review.additions}</span>
                    <span style={{ 'font-size': '12px', color: '#cf1322' }}>-{review.deletions}</span>
                    <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': 'auto' }}>
                      审核者：{review.reviewer} · {review.createdAt}
                    </span>
                  </div>
                  <div style={{ 'margin-top': '10px', 'font-size': '12px', color: chartColors.primary }}>
                    点击查看代码对比 →
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={activeReview() !== null}>
        <CodeDiffModal
          review={activeReview()!}
          onClose={() => setActiveReview(null)}
          onAiRevise={(msg) => {
            setActiveReview(null);
            props.onAiRevise(msg);
          }}
        />
      </Show>
    </div>
  );
};

// ─── Testing Tab ──────────────────────────────────────────────────────────────

const TestingTab: Component<{ reports: TestReport[] }> = (props) => {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  return (
    <div>
      <Show
        when={props.reports.length > 0}
        fallback={
          <div style={{ padding: '40px', 'text-align': 'center', color: themeColors.textMuted, 'font-size': '14px' }}>
            暂无测试报告
          </div>
        }
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
          <For each={props.reports}>
            {(report) => {
              const statusInfo = () => testStatusMap[report.status] ?? testStatusMap.partial;
              const isExpanded = () => expandedId() === report.id;
              const passRate = () => Math.round((report.passedCases / report.totalCases) * 100);
              return (
                <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, overflow: 'hidden' }}>
                  {/* Card header */}
                  <button
                    style={{ width: '100%', display: 'flex', 'align-items': 'center', padding: '14px 16px', background: themeColors.surface, border: 'none', cursor: 'pointer', 'text-align': 'left', gap: '10px' }}
                    onClick={() => setExpandedId(isExpanded() ? null : report.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px' }}>
                        <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{report.taskTitle}</span>
                        <span style={{ 'font-size': '11px', padding: '1px 8px', 'border-radius': '9999px', background: statusInfo().bg, color: statusInfo().color }}>
                          {statusInfo().label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                          {report.passedCases} 通过 / {report.failedCases} 失败 / 共 {report.totalCases} 用例
                        </span>
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>覆盖率 {report.coverage}%</span>
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': 'auto' }}>{report.createdAt}</span>
                      </div>
                      {/* Progress bar */}
                      <div style={{ 'margin-top': '8px', width: '100%', height: '6px', background: themeColors.hover, 'border-radius': '9999px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', 'border-radius': '9999px',
                          background: report.status === 'passed' ? chartColors.success : report.status === 'failed' ? '#ff4d4f' : themeColors.warningDark,
                          width: `${passRate()}%`, transition: 'width 0.4s',
                        }} />
                      </div>
                    </div>
                    <span style={{ color: themeColors.textMuted, 'flex-shrink': 0 }}>
                      <Show when={isExpanded()} fallback={<ChevronDown size={16} />}>
                        <ChevronUp size={16} />
                      </Show>
                    </span>
                  </button>

                  {/* 展开详情 */}
                  <Show when={isExpanded()}>
                    <div style={{ 'border-top': `1px solid ${themeColors.borderLight}`, padding: '12px 16px', background: themeColors.hover }}>
                      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
                        <For each={report.details}>
                          {(detail) => (
                            <div style={{
                              display: 'flex', 'align-items': 'flex-start', gap: '8px',
                              padding: '8px 10px', 'border-radius': '8px',
                              background: detail.status === 'passed' ? themeColors.surface : '#fff1f0',
                            }}>
                              <span style={{ 'font-size': '13px', 'flex-shrink': 0, 'margin-top': '1px' }}>
                                {detail.status === 'passed' ? '✅' : '❌'}
                              </span>
                              <div style={{ flex: 1 }}>
                                <div style={{ 'font-size': '13px', color: themeColors.text }}>{detail.name}</div>
                                <Show when={detail.error}>
                                  <div style={{ 'margin-top': '4px', 'font-size': '11px', color: '#cf1322', 'font-family': 'monospace', 'white-space': 'pre-wrap', 'background': '#fff1f0', padding: '4px 8px', 'border-radius': '4px' }}>
                                    {detail.error}
                                  </div>
                                </Show>
                              </div>
                              <span style={{ 'font-size': '11px', color: themeColors.textMuted, 'flex-shrink': 0 }}>{detail.duration}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

// ─── 主页面组件 ────────────────────────────────────────────────────────────────

type TabKey = 'plan-review' | 'architecture' | 'code-review' | 'testing';

const SoloBuild: Component = () => {
  const { productStore } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<TabKey>('plan-review');
  const [tasks, setTasks] = createSignal<SoloTask[]>(mockSoloTasks);
  const [adrs, setAdrs] = createSignal<ADR[]>(mockAdrs);
  const [reviews] = createSignal<CodeReviewItem[]>(mockCodeReviews);
  const [reports] = createSignal<TestReport[]>(mockTestReports);

  // ADR 新增弹窗
  const [adrModal, setAdrModal] = createSignal(false);
  const [adrTitle, setAdrTitle] = createSignal('');
  const [adrQuestion, setAdrQuestion] = createSignal('');
  const [adrDecision, setAdrDecision] = createSignal('');
  const [adrReason, setAdrReason] = createSignal('');

  // AI 工程搭档
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal([
    { role: 'assistant', content: '你好！我是 AI 工程搭档，已加载当前任务上下文。\n\n我可以帮你分析技术方案、审查代码、解决 Bug，或协助修订代码改动。' },
  ]);
  const [agentLoading, setAgentLoading] = createSignal(false);

  const engBrain = (): AutopilotAgent | undefined =>
    SOLO_AGENTS.find(a => a.id === 'eng-brain');

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const [fileTasks, fileAdrs] = await Promise.all([
        loadSoloTasks(workDir),
        loadAdrs(workDir),
      ]);
      if (fileTasks.length > 0) setTasks(fileTasks as unknown as SoloTask[]);
      if (fileAdrs.length > 0) setAdrs(fileAdrs as unknown as ADR[]);
    } catch { /* Mock fallback */ }
  });

  const doingTasks = () => tasks().filter(t => t.status === 'doing');
  const todoTasks  = () => tasks().filter(t => t.status === 'todo');
  const doneTasks  = () => tasks().filter(t => t.status === 'done');

  const addTask = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    const newTask: SoloTask = {
      id: `task-${Date.now()}`, title: '新任务', type: 'dev', status: 'todo', est: '1h',
      dod: ['完成实现', '本地测试通过'], createdAt: new Date().toISOString().slice(0, 10),
    };
    setTasks(prev => [...prev, newTask]);
    if (workDir) await saveSoloTask(workDir, newTask as unknown as SoloTaskRecord);
  };

  const saveAdrRecord = async () => {
    if (!adrTitle().trim()) return;
    const workDir = productStore.activeProduct()?.workDir;
    const newAdr: ADR = {
      id: `adr-${Date.now()}`,
      title: adrTitle(),
      question: adrQuestion(),
      decision: adrDecision(),
      reason: adrReason(),
      date: new Date().toISOString().slice(0, 10),
      status: 'active',
    };
    setAdrs(prev => [newAdr, ...prev]);
    if (workDir) await saveAdr(workDir, newAdr as unknown as SoloAdr);
    setAdrModal(false);
    setAdrTitle(''); setAdrQuestion(''); setAdrDecision(''); setAdrReason('');
  };

  // AI 工程搭档发送逻辑
  const handleAgentSend = () => {
    if (!agentInput().trim() || agentLoading()) return;
    const q = agentInput().trim();
    setAgentMessages(prev => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setAgentLoading(true);

    const agent = engBrain();
    if (agent) {
      setAgentMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const update = (text: string) =>
        setAgentMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { role: 'assistant', content: text };
          return msgs;
        });

      void runDirectAgent(agent, q, {
        workDir: productStore.activeProduct()?.workDir,
        onStream: update,
        onDone: (full) => { update(full); setAgentLoading(false); },
        onError: () => {
          // 降级 Mock 回复
          let reply = '';
          if (q.includes('架构') || q.includes('方案')) {
            reply = '基于当前项目复杂度，建议优先保持现有架构，重点在边界层做抽象。可考虑：\n\n1. 将 IME 处理封装为独立 Hook\n2. 用策略模式替代 if/else 分支\n3. 确保测试覆盖率 >80%';
          } else if (q.includes('代码') || q.includes('修订') || q.includes('审核')) {
            reply = '收到代码修订需求。根据审核意见，主要改进点是：\n\n1. 将内联逻辑提取为独立函数\n2. 增加错误边界处理\n3. 完善 JSDoc 注释\n\n我已生成改进后的代码版本，请查看右侧对比。';
          } else if (q.includes('测试') || q.includes('用例')) {
            reply = '测试用例建议：\n\n1. 单元测试：覆盖正常路径 + 边界条件\n2. 集成测试：关注 compositionstart/end 事件顺序\n3. E2E：在 macOS/Windows 两个平台验证 IME 行为差异';
          } else {
            reply = '我已读取当前任务和代码审核上下文。请告诉我你希望如何优化，我来提供具体的技术方案和代码片段。';
          }
          update(`[本地知识库回复]\n\n${reply}`);
          setAgentLoading(false);
        },
      });
    } else {
      setTimeout(() => {
        setAgentMessages(prev => [...prev, { role: 'assistant', content: '我已加载当前任务上下文。请告诉我你的具体问题，我来帮你分析解决方案。' }]);
        setAgentLoading(false);
      }, 600);
    }
  };

  // 接收来自代码审核弹窗的 AI 修订请求
  const handleAiRevise = (msg: string) => {
    setAgentInput(msg);
    setActiveTab('plan-review'); // 切到任意tab时保持对话框可见
  };

  const tabStyle = (isActive: boolean): Record<string, string | number> => ({
    padding: '8px 14px', 'font-size': '13px', 'font-weight': 500,
    'border-bottom': isActive ? `2px solid ${chartColors.primary}` : '2px solid transparent',
    color: isActive ? chartColors.primary : themeColors.textMuted,
    background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s',
    display: 'flex', 'align-items': 'center', gap: '6px', 'white-space': 'nowrap',
    'border-bottom-color': isActive ? chartColors.primary : 'transparent',
  });

  const tabs: { key: TabKey; label: string; icon: Component }[] = [
    { key: 'plan-review',  label: '执行计划审核', icon: () => <ClipboardCheck size={14} /> },
    { key: 'architecture', label: '架构决策',      icon: () => <Building2 size={14} /> },
    { key: 'code-review',  label: '代码审核',      icon: () => <GitPullRequest size={14} /> },
    { key: 'testing',      label: '测试验证',       icon: () => <FlaskConical size={14} /> },
  ];

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Page Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: chartColors.primary }}>⚙️</span>
          产品研发
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>{doingTasks().length} 进行中</span>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{todoTasks().length} 待办</span>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>{doneTasks().length} 已完成</span>
        </div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        {/* ── 左侧：四大 Tab ── */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            {/* Tab 导航 */}
            <div style={{ display: 'flex', 'border-bottom': `1px solid ${themeColors.borderLight}`, overflow: 'auto' }}>
              <For each={tabs}>
                {(tab) => (
                  <button style={tabStyle(activeTab() === tab.key)} onClick={() => setActiveTab(tab.key)}>
                    <tab.icon />
                    {tab.label}
                    <Show when={tab.key === 'code-review'}>
                      <span style={{ 'font-size': '11px', padding: '0px 5px', background: themeColors.warningBg, color: themeColors.warningDark, 'border-radius': '9999px' }}>
                        {reviews().filter(r => r.status === 'changes-requested').length}
                      </span>
                    </Show>
                    <Show when={tab.key === 'testing'}>
                      <span style={{ 'font-size': '11px', padding: '0px 5px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>
                        {reports().filter(r => r.status === 'passed').length}/{reports().length}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>

            <div style={{ padding: '16px' }}>
              {/* ── 执行计划审核 ── */}
              <Show when={activeTab() === 'plan-review'}>
                <div style={{ padding: '10px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 执行计划审核：</strong> 你是全部角色（PM/Dev/QA），统一管理任务进度和完成标准（DoD）。
                </div>

                <Show when={doingTasks().length > 0}>
                  <div style={{ 'margin-bottom': '20px' }}>
                    <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>🔥 当前进行中</div>
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
                      <For each={doingTasks()}>{(t) => <TaskCard task={t} active />}</For>
                    </div>
                  </div>
                </Show>

                <div style={{ 'margin-bottom': '20px' }}>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>⬜ 待办</div>
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                    <For each={todoTasks()}>{(t) => <TaskCard task={t} />}</For>
                  </div>
                  <button
                    style={{ 'margin-top': '10px', width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}
                    onClick={addTask}
                  >
                    + 添加任务
                  </button>
                </div>

                <div>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>✅ 最近完成</div>
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', opacity: 0.7 }}>
                    <For each={doneTasks()}>{(t) => <TaskCard task={t} />}</For>
                  </div>
                </div>
              </Show>

              {/* ── 架构决策 ── */}
              <Show when={activeTab() === 'architecture'}>
                <div style={{ padding: '10px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 架构决策：</strong> 记录每个重大技术决策的背景、内容与原因。点击卡片可展开查看详情（只读）。
                </div>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
                  <For each={adrs()}>
                    {(adr) => <AdrCard adr={adr} />}
                  </For>
                </div>
                <button
                  style={{ 'margin-top': '12px', width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }}
                  onClick={() => setAdrModal(true)}
                >
                  + 记录架构决策
                </button>
              </Show>

              {/* ── 代码审核 ── */}
              <Show when={activeTab() === 'code-review'}>
                <div style={{ padding: '10px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 代码审核：</strong> 点击审核卡片可查看代码对比，支持手动编辑或发送给 AI 工程搭档二次修订。
                </div>
                <CodeReviewTab reviews={reviews()} onAiRevise={(msg) => { handleAiRevise(msg); }} />
              </Show>

              {/* ── 测试验证 ── */}
              <Show when={activeTab() === 'testing'}>
                <div style={{ padding: '10px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 测试验证：</strong> 每个需求的自动化测试报告，点击展开查看详细用例结果。
                </div>
                <TestingTab reports={reports()} />
              </Show>
            </div>
          </div>
        </div>

        {/* ── 右侧：AI 工程搭档 ── */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, display: 'flex', 'flex-direction': 'column', height: 'calc(100vh - 200px)' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span style={{ color: '#08979c' }}>⚙️</span>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>AI 工程搭档</span>
              <span style={{ 'font-size': '11px', padding: '1px 6px', background: '#e6fffb', color: '#08979c', 'border-radius': '9999px', border: '1px solid #87e8de' }}>已加载任务上下文</span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, 'overflow-y': 'auto', padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <For each={agentMessages()}>
                {(msg) => (
                  <div style={{ display: 'flex', 'justify-content': msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      'max-width': '90%', padding: '8px 12px', 'font-size': '12px',
                      'line-height': '1.6', 'white-space': 'pre-wrap',
                      ...(msg.role === 'user'
                        ? { background: '#08979c', color: 'white', 'border-radius': '16px 16px 4px 16px' }
                        : { background: themeColors.hover, color: themeColors.text, 'border-radius': '16px 16px 16px 4px' }),
                    }}>
                      {msg.content || '正在思考中...'}
                    </div>
                  </div>
                )}
              </For>
              <Show when={agentLoading()}>
                <div style={{ display: 'flex', 'justify-content': 'flex-start' }}>
                  <div style={{ padding: '8px 12px', background: themeColors.hover, 'border-radius': '16px 16px 16px 4px', 'font-size': '12px', color: themeColors.textMuted }}>
                    ⚙️ 思考中...
                  </div>
                </div>
              </Show>
            </div>

            {/* Quick questions */}
            <div style={{ padding: '8px 12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
              <For each={['架构方案建议', '代码审核要点', '测试覆盖分析']}>
                {(q) => (
                  <button
                    style={{ 'font-size': '11px', padding: '3px 9px', background: themeColors.hover, 'border-radius': '9999px', border: `1px solid ${themeColors.border}`, cursor: 'pointer', color: themeColors.textSecondary }}
                    onClick={() => setAgentInput(q)}
                    disabled={agentLoading()}
                  >
                    {q}
                  </button>
                )}
              </For>
            </div>

            {/* Input */}
            <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
                placeholder="问 AI 工程搭档..."
                disabled={agentLoading()}
                style={{
                  flex: 1, border: `1px solid ${themeColors.border}`, 'border-radius': '8px',
                  padding: '8px 12px', 'font-size': '12px', outline: 'none',
                  background: themeColors.surface, color: themeColors.text,
                }}
              />
              <button
                onClick={handleAgentSend}
                disabled={agentLoading() || !agentInput().trim()}
                style={{
                  background: '#08979c', color: 'white', 'border-radius': '8px',
                  padding: '8px 12px', 'font-size': '14px', border: 'none',
                  cursor: agentLoading() ? 'not-allowed' : 'pointer', opacity: agentLoading() ? 0.6 : 1,
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ADR 新增弹窗 */}
      <Show when={adrModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: themeColors.surface, 'border-radius': '10px', padding: '24px', width: '100%', 'max-width': '520px', 'box-shadow': '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600, color: themeColors.text }}>记录架构决策</h3>
            {[
              { label: '决策标题', value: adrTitle, set: setAdrTitle, placeholder: '如：选用 TipTap 作为编辑器' },
              { label: '问题背景', value: adrQuestion, set: setAdrQuestion, placeholder: '面临什么技术选择或挑战？' },
              { label: '决策内容', value: adrDecision, set: setAdrDecision, placeholder: '最终选择了什么方案？' },
              { label: '决策原因', value: adrReason, set: setAdrReason, placeholder: '为什么选这个方案？' },
            ].map(({ label, value, set, placeholder }) => (
              <div style={{ 'margin-bottom': '12px' }}>
                <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>{label}</label>
                <textarea
                  rows={2} placeholder={placeholder} value={value()} onInput={(e) => set(e.currentTarget.value)}
                  style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '13px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text, outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '8px' }}>
              <button style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '7px 16px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }} onClick={() => setAdrModal(false)}>取消</button>
              <button style={{ background: chartColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '7px 16px', cursor: 'pointer', 'font-size': '13px' }} onClick={saveAdrRecord}>保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloBuild;
