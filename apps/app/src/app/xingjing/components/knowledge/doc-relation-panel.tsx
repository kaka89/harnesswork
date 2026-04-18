/**
 * 右侧文档关联面板
 * 三分区：文档关联 / AI 使用路径 / 知识溯源
 */
import { Component, For, Show, createSignal } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';

interface DocRelationPanelProps {
  entry: KnowledgeEntry | null;
  allEntries: KnowledgeEntry[];
  onNavigate: (entryId: string) => void;
  onSendToAI: (entry: KnowledgeEntry) => void;
  onStartAutopilot: (entry: KnowledgeEntry) => void;
  onCopyRef: (entry: KnowledgeEntry) => void;
  onViewSession?: (sessionId: string) => void;
  onDelete?: (entry: KnowledgeEntry) => void;
}

const sectionStyle = {
  'margin-bottom': '16px',
};
const sectionTitleStyle = {
  'font-size': '11px', 'font-weight': 600, color: '#9ca3af',
  'text-transform': 'uppercase' as const, 'letter-spacing': '0.05em',
  'margin-bottom': '8px', padding: '0 0 4px', 'border-bottom': '1px solid #f3f4f6',
};
const linkBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer', 'font-size': '12px',
  color: chartColors.primary, padding: '3px 0', display: 'block', 'text-align': 'left' as const,
  'white-space': 'nowrap' as const, overflow: 'hidden', 'text-overflow': 'ellipsis', width: '100%',
};
const actionBtnStyle = (bg: string, color: string) => ({
  width: '100%', padding: '7px 10px', 'border-radius': '6px', border: 'none',
  background: bg, color, cursor: 'pointer', 'font-size': '12px', 'font-weight': 500,
  'text-align': 'left' as const, 'margin-bottom': '6px', display: 'block',
});

export const DocRelationPanel: Component<DocRelationPanelProps> = (props) => {
  const [deleteConfirm, setDeleteConfirm] = createSignal(false);

  const upstream = () =>
    (props.entry?.upstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

  const downstream = () =>
    (props.entry?.downstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

  // 当条目变化时重置确认状态
  const isDeletable = () => {
    const e = props.entry;
    if (!e) return false;
    return e.source === 'private' ||
      (e.source === 'workspace-doc' && e.filePath?.startsWith('knowledge/'));
  };

  const handleDeleteClick = () => {
    if (!deleteConfirm()) {
      setDeleteConfirm(true);
    } else {
      setDeleteConfirm(false);
      if (props.entry) props.onDelete?.(props.entry);
    }
  };

  return (
    <div style={{ padding: '12px', 'font-size': '12px', overflow: 'auto', height: '100%' }}>
      <Show when={!props.entry}>
        <div style={{ color: themeColors.textSecondary, 'font-size': '12px', 'text-align': 'center', padding: '24px 0' }}>
          选择文档查看关联信息
        </div>
      </Show>

      <Show when={props.entry}>
        {/* ① 文档关联 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>📎 文档关联</div>
          <Show when={upstream().length > 0}>
            <div style={{ 'margin-bottom': '6px' }}>
              <span style={{ color: '#9ca3af', 'font-size': '11px' }}>↑ 上游</span>
              <For each={upstream()}>
                {(e) => (
                  <button style={linkBtnStyle} onClick={() => props.onNavigate(e.id)}>
                    {e.docType ?? e.category} · {e.title}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={downstream().length > 0}>
            <div style={{ 'margin-bottom': '6px' }}>
              <span style={{ color: '#9ca3af', 'font-size': '11px' }}>↓ 下游</span>
              <For each={downstream()}>
                {(e) => (
                  <button style={linkBtnStyle} onClick={() => props.onNavigate(e.id)}>
                    {e.docType ?? e.category} · {e.title}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={upstream().length === 0 && downstream().length === 0}>
            <div style={{ color: themeColors.textSecondary }}>暂无上下游关联</div>
          </Show>
        </div>

        {/* ② AI 使用路径 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>🤖 AI 使用</div>
          <button
            style={actionBtnStyle(chartColors.primary, 'white')}
            onClick={() => props.entry && props.onSendToAI(props.entry)}
          >
            ▶ 发送给 AI
          </button>
          <button
            style={actionBtnStyle('#f3e8ff', '#7c3aed')}
            onClick={() => props.entry && props.onStartAutopilot(props.entry)}
          >
            🚀 启动 Autopilot
          </button>
          <button
            style={actionBtnStyle('#f9fafb', themeColors.text)}
            onClick={() => props.entry && props.onCopyRef(props.entry)}
          >
            📋 复制引用
          </button>
          <Show when={isDeletable()}>
            <button
              style={{
                ...actionBtnStyle(
                  deleteConfirm() ? '#fef2f2' : '#f9fafb',
                  deleteConfirm() ? '#dc2626' : '#6b7280',
                ),
                border: deleteConfirm() ? '1px solid #fca5a5' : '1px solid transparent',
              }}
              onClick={handleDeleteClick}
              onBlur={() => setDeleteConfirm(false)}
            >
              {deleteConfirm() ? '⚠️ 再次点击确认删除' : '🗑️ 删除此知识'}
            </button>
          </Show>
        </div>

        {/* ③ 知识溯源 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>📊 知识来源</div>
          <div style={{ color: themeColors.textSecondary, 'line-height': '1.6' }}>
            <Show when={props.entry?.source === 'behavior'}>
              <div>📚 行为知识（OpenWork Skill）</div>
              <div style={{ color: '#9ca3af', 'font-size': '11px' }}>由团队协作共享</div>
              <Show when={props.entry?.lifecycle}>
                <div style={{ 'margin-top': '4px', 'font-size': '11px' }}>
                  生命周期: {props.entry?.lifecycle === 'stable' ? '🔒 稳定' : '🌱 动态'}
                </div>
              </Show>
            </Show>
            <Show when={props.entry?.source === 'private'}>
              <div>📝 个人笔记</div>
              <div style={{ color: '#9ca3af', 'font-size': '11px' }}>存于 knowledge/ 目录</div>
            </Show>
            <Show when={props.entry?.source === 'workspace-doc'}>
              <div>📄 产品文档</div>
              <Show when={props.entry?.filePath}>
                <div style={{ color: '#9ca3af', 'font-size': '11px', 'word-break': 'break-all' }}>{props.entry?.filePath}</div>
              </Show>
              <Show when={props.entry?.owner}>
                <div>👤 {props.entry?.owner}</div>
              </Show>
            </Show>
          </div>

          {/* Agent 生成溯源 */}
          <Show when={props.entry?.sourceAgentId}>
            <div style={{ 'margin-top': '8px', padding: '6px 8px', background: '#f0fdf4', 'border-radius': '6px', 'font-size': '11px' }}>
              <div style={{ color: '#16a34a', 'font-weight': 500 }}>🧠 由 {props.entry?.sourceAgentId} 生成</div>
              <Show when={props.entry?.date}>
                <div style={{ color: '#9ca3af', 'margin-top': '2px' }}>沉淀于 {String(props.entry?.date ?? '').slice(0, 10)}</div>
              </Show>
            </div>
          </Show>

          {/* 查看原始会话 */}
          <Show when={props.entry?.sourceSessionId && props.onViewSession}>
            <button
              style={{
                ...actionBtnStyle('#f0f9ff', '#0369a1'),
                'margin-top': '6px', 'text-align': 'center' as const,
              }}
              onClick={() => props.onViewSession?.(props.entry!.sourceSessionId!)}
            >
              💬 查看原始对话
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default DocRelationPanel;
