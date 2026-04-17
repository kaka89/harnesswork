/**
 * 右侧文档关联面板
 * 三分区：文档关联 / AI 使用路径 / 知识溯源
 */
import { Component, For, Show } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';

interface DocRelationPanelProps {
  entry: KnowledgeEntry | null;
  allEntries: KnowledgeEntry[];
  onNavigate: (entryId: string) => void;
  onSendToAI: (entry: KnowledgeEntry) => void;
  onStartAutopilot: (entry: KnowledgeEntry) => void;
  onCopyRef: (entry: KnowledgeEntry) => void;
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
  const upstream = () =>
    (props.entry?.upstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

  const downstream = () =>
    (props.entry?.downstream ?? [])
      .map((id) => props.allEntries.find((e) => e.id === id || e.filePath?.includes(id)))
      .filter(Boolean) as KnowledgeEntry[];

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
        </div>

        {/* ③ 知识溯源 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>📊 知识来源</div>
          <div style={{ color: themeColors.textSecondary, 'line-height': '1.6' }}>
            <Show when={props.entry?.source === 'behavior'}>
              <div>📚 行为知识（OpenWork Skill）</div>
              <div style={{ color: '#9ca3af', 'font-size': '11px' }}>由团队协作共享</div>
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
        </div>
      </Show>
    </div>
  );
};

export default DocRelationPanel;
