/**
 * YAML 结构化文档渲染器
 * 支持 SoloTaskRecord / SoloHypothesis / SoloAdr / SoloRelease 四种类型
 * 将 YAML 前端数据渲染为可读的结构化卡片
 */
import { Component, For, Show, Switch, Match } from 'solid-js';
import { themeColors, chartColors, getStatusColor, getStatusBgColor } from '../../utils/colors';

// ─── 类型定义（与 file-store.ts 保持一致） ─────────────────────────────────────

interface TaskRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  est: string;
  dod?: string[];
  note?: string;
  createdAt: string;
}

interface Hypothesis {
  id: string;
  status: string;
  belief: string;
  why: string;
  method: string;
  result?: string;
  impact: string;
  createdAt: string;
  validatedAt?: string;
}

interface Adr {
  id: string;
  title: string;
  question: string;
  decision: string;
  reason: string;
  date: string;
  status: string;
}

interface Release {
  version: string;
  date: string;
  env: string;
  status: string;
  summary: string;
  deployTime: string;
}

export type StructuredDocType = 'task' | 'hypothesis' | 'adr' | 'release';

interface StructuredDocViewerProps {
  docType: StructuredDocType;
  data: Record<string, unknown>;
}

// ─── 通用样式 ───────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'white', 'border-radius': '10px', padding: '16px',
  border: `1px solid ${themeColors.border}`, 'margin-bottom': '12px',
};
const labelStyle = {
  'font-size': '11px', color: '#9ca3af', 'font-weight': 500,
  'text-transform': 'uppercase' as const, 'letter-spacing': '0.04em',
  'margin-bottom': '4px',
};
const valueStyle = {
  'font-size': '13px', color: themeColors.text, 'line-height': '1.6',
};
const badgeStyle = (bg: string, color: string) => ({
  display: 'inline-block', padding: '2px 8px', 'border-radius': '12px',
  'font-size': '11px', 'font-weight': 600, background: bg, color,
});
const rowStyle = {
  display: 'flex', gap: '16px', 'margin-bottom': '12px', 'flex-wrap': 'wrap' as const,
};
const fieldStyle = {
  flex: '1 1 auto', 'min-width': '120px',
};

// ─── 子组件 ──────────────────────────────────────────────────────────────────

const TaskView: Component<{ data: TaskRecord }> = (props) => {
  const typeLabels: Record<string, string> = {
    dev: '🔧 开发', product: '📦 产品', ops: '🔩 运维', growth: '📈 增长',
  };
  const statusLabels: Record<string, string> = {
    todo: '⬜ 待办', doing: '🔵 进行中', done: '✅ 完成',
  };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
        <span style={{ 'font-size': '16px', 'font-weight': 600 }}>{props.data.title}</span>
        <span style={badgeStyle(getStatusBgColor(props.data.status), getStatusColor(props.data.status))}>
          {statusLabels[props.data.status] ?? props.data.status}
        </span>
      </div>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <div style={labelStyle}>类型</div>
          <div style={valueStyle}>{typeLabels[props.data.type] ?? props.data.type}</div>
        </div>
        <div style={fieldStyle}>
          <div style={labelStyle}>预估工时</div>
          <div style={valueStyle}>{props.data.est || '—'}</div>
        </div>
        <div style={fieldStyle}>
          <div style={labelStyle}>创建时间</div>
          <div style={valueStyle}>{props.data.createdAt?.slice(0, 10) || '—'}</div>
        </div>
      </div>
      <Show when={props.data.dod && props.data.dod.length > 0}>
        <div style={{ 'margin-bottom': '10px' }}>
          <div style={labelStyle}>完成定义 (DoD)</div>
          <ul style={{ margin: '4px 0', 'padding-left': '18px', ...valueStyle }}>
            <For each={props.data.dod}>
              {(item) => <li style={{ 'margin-bottom': '2px' }}>{item}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.data.note}>
        <div>
          <div style={labelStyle}>备注</div>
          <div style={{ ...valueStyle, color: '#6b7280' }}>{props.data.note}</div>
        </div>
      </Show>
    </div>
  );
};

const HypothesisView: Component<{ data: Hypothesis }> = (props) => {
  const statusLabels: Record<string, string> = {
    draft: '📝 草稿', testing: '🧪 验证中', validated: '✅ 已验证', rejected: '❌ 已否定',
  };
  const impactColors: Record<string, { bg: string; fg: string }> = {
    high: { bg: '#fef2f2', fg: '#dc2626' },
    medium: { bg: '#fffbeb', fg: '#d97706' },
    low: { bg: '#f0fdf4', fg: '#16a34a' },
  };
  const ic = impactColors[props.data.impact] ?? { bg: '#f3f4f6', fg: '#6b7280' };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
        <span style={{ 'font-size': '16px', 'font-weight': 600 }}>💡 {props.data.belief}</span>
        <span style={badgeStyle(getStatusBgColor(props.data.status), getStatusColor(props.data.status))}>
          {statusLabels[props.data.status] ?? props.data.status}
        </span>
        <span style={badgeStyle(ic.bg, ic.fg)}>{props.data.impact} impact</span>
      </div>
      <div style={{ 'margin-bottom': '10px' }}>
        <div style={labelStyle}>为什么重要</div>
        <div style={valueStyle}>{props.data.why}</div>
      </div>
      <div style={{ 'margin-bottom': '10px' }}>
        <div style={labelStyle}>验证方法</div>
        <div style={valueStyle}>{props.data.method}</div>
      </div>
      <Show when={props.data.result}>
        <div style={{ 'margin-bottom': '10px' }}>
          <div style={labelStyle}>验证结果</div>
          <div style={{ ...valueStyle, padding: '8px', background: '#f9fafb', 'border-radius': '6px' }}>{props.data.result}</div>
        </div>
      </Show>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <div style={labelStyle}>创建时间</div>
          <div style={valueStyle}>{props.data.createdAt?.slice(0, 10) || '—'}</div>
        </div>
        <Show when={props.data.validatedAt}>
          <div style={fieldStyle}>
            <div style={labelStyle}>验证时间</div>
            <div style={valueStyle}>{props.data.validatedAt?.slice(0, 10)}</div>
          </div>
        </Show>
      </div>
    </div>
  );
};

const AdrView: Component<{ data: Adr }> = (props) => {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
        <span style={{ 'font-size': '16px', 'font-weight': 600 }}>📋 {props.data.title}</span>
        <span style={badgeStyle(
          props.data.status === 'active' ? '#dbeafe' : '#fef2f2',
          props.data.status === 'active' ? '#1d4ed8' : '#dc2626',
        )}>
          {props.data.status === 'active' ? '🟢 生效' : '🔴 废弃'}
        </span>
      </div>
      <div style={{ 'margin-bottom': '10px' }}>
        <div style={labelStyle}>决策问题</div>
        <div style={valueStyle}>{props.data.question}</div>
      </div>
      <div style={{ 'margin-bottom': '10px', padding: '10px', background: '#f0f9ff', 'border-radius': '8px', 'border-left': `3px solid ${chartColors.primary}` }}>
        <div style={labelStyle}>决策结论</div>
        <div style={{ ...valueStyle, 'font-weight': 500 }}>{props.data.decision}</div>
      </div>
      <div style={{ 'margin-bottom': '10px' }}>
        <div style={labelStyle}>决策理由</div>
        <div style={valueStyle}>{props.data.reason}</div>
      </div>
      <div>
        <div style={labelStyle}>决策日期</div>
        <div style={valueStyle}>{props.data.date || '—'}</div>
      </div>
    </div>
  );
};

const ReleaseView: Component<{ data: Release }> = (props) => {
  const envLabels: Record<string, string> = {
    prod: '🌐 生产', staging: '🧪 预发布',
  };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
        <span style={{ 'font-size': '16px', 'font-weight': 600 }}>🚀 v{props.data.version}</span>
        <span style={badgeStyle(getStatusBgColor(props.data.status), getStatusColor(props.data.status))}>
          {props.data.status}
        </span>
        <span style={badgeStyle('#f3f4f6', '#6b7280')}>
          {envLabels[props.data.env] ?? props.data.env}
        </span>
      </div>
      <div style={{ 'margin-bottom': '10px' }}>
        <div style={labelStyle}>发布摘要</div>
        <div style={valueStyle}>{props.data.summary}</div>
      </div>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <div style={labelStyle}>发布日期</div>
          <div style={valueStyle}>{props.data.date || '—'}</div>
        </div>
        <div style={fieldStyle}>
          <div style={labelStyle}>部署耗时</div>
          <div style={valueStyle}>{props.data.deployTime || '—'}</div>
        </div>
      </div>
    </div>
  );
};

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export const StructuredDocViewer: Component<StructuredDocViewerProps> = (props) => {
  return (
    <Switch fallback={
      <div style={{ 'font-size': '13px', color: themeColors.textSecondary, padding: '12px' }}>
        不支持的结构化文档类型: {props.docType}
      </div>
    }>
      <Match when={props.docType === 'task'}>
        <TaskView data={props.data as unknown as TaskRecord} />
      </Match>
      <Match when={props.docType === 'hypothesis'}>
        <HypothesisView data={props.data as unknown as Hypothesis} />
      </Match>
      <Match when={props.docType === 'adr'}>
        <AdrView data={props.data as unknown as Adr} />
      </Match>
      <Match when={props.docType === 'release'}>
        <ReleaseView data={props.data as unknown as Release} />
      </Match>
    </Switch>
  );
};

export default StructuredDocViewer;
