import { createSignal, createMemo, Show, For } from 'solid-js';
import {
  FileText, Edit3, Code2, Eye, Bold, Italic, Type, List, Link, Quote,
  ExternalLink, Minimize2,
} from 'lucide-solid';
import { themeColors, chartColors } from '../../utils/colors';

export interface ArtifactItem {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  content: string;
  createdAt: string; // "HH:mm" 格式
}

interface ArtifactWorkspaceProps {
  artifacts: ArtifactItem[];
  onContentChange?: (id: string, content: string) => void;
  isFloating?: boolean;
  onToggleFloat?: () => void;
  onDragStart?: (e: PointerEvent) => void;
  onDragMove?: (e: PointerEvent) => void;
  onDragEnd?: (e: PointerEvent) => void;
  onResizeEdge?: (e: PointerEvent, direction: string) => void;
}

type ViewMode = 'edit' | 'source' | 'review';

// 简单 Markdown 渲染（无额外依赖）
function renderMarkdown(text: string): string {
  return text
    // 标题 h1~h3
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;margin:12px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:14px;font-weight:700;margin:14px 0 5px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:16px;font-weight:700;margin:16px 0 6px">$1</h1>')
    // 加粗 & 斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 列表
    .replace(/^[-•] (.+)$/gm, '<li style="margin:2px 0;padding-left:4px">• $1</li>')
    // 换行
    .replace(/\n\n/g, '</p><p style="margin:6px 0">')
    .replace(/\n/g, '<br/>');
}

const ArtifactWorkspace = (props: ArtifactWorkspaceProps) => {
  const [activeTabId, setActiveTabId] = createSignal<string | null>(null);
  const [viewMode, setViewMode] = createSignal<ViewMode>('review');
  const [editContents, setEditContents] = createSignal<Record<string, string>>({});

  const activeArtifact = createMemo(() => {
    const artifacts = props.artifacts;
    if (artifacts.length === 0) return null;
    const tabId = activeTabId();
    if (!tabId || !artifacts.find(a => a.id === tabId)) {
      return artifacts[0];
    }
    return artifacts.find(a => a.id === tabId) ?? artifacts[0];
  });

  const currentContent = createMemo(() => {
    const art = activeArtifact();
    if (!art) return '';
    return editContents()[art.id] ?? art.content;
  });

  const charCount = createMemo(() => currentContent().length);

  const handleContentChange = (val: string) => {
    const art = activeArtifact();
    if (!art) return;
    setEditContents((prev: Record<string, string>) => ({ ...prev, [art.id]: val }));
    props.onContentChange?.(art.id, val);
  };

  // 工具栏：在 textarea 中插入 Markdown 标记
  const insertMd = (before: string, after = '') => {
    const art = activeArtifact();
    if (!art) return;
    const ta = document.getElementById(`artifact-textarea-${art.id}`) as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = currentContent();
    const selected = val.slice(start, end);
    const newVal = val.slice(0, start) + before + selected + after + val.slice(end);
    handleContentChange(newVal);
    // 恢复光标
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const modeButtons: { mode: ViewMode; icon: any; label: string }[] = [
    { mode: 'edit', icon: Edit3, label: '编辑' },
    { mode: 'source', icon: Code2, label: '源码' },
    { mode: 'review', icon: Eye, label: '审查' },
  ];

  const toolbarButtons = [
    { icon: Bold, action: () => insertMd('**', '**'), title: '加粗' },
    { icon: Italic, action: () => insertMd('*', '*'), title: '斜体' },
    { icon: Type, action: () => insertMd('## '), title: '标题' },
    { icon: List, action: () => insertMd('- '), title: '列表' },
    { icon: Quote, action: () => insertMd('> '), title: '引用' },
    { icon: Link, action: () => insertMd('[', '](url)'), title: '链接' },
  ];

  return (
    <div
      style={{
        border: `1px solid ${themeColors.border}`,
        'border-radius': '8px',
        background: themeColors.surface,
        display: 'flex',
        'flex-direction': 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── 顶部：标题 + 文件数量 + 悬浮切换 ── */}
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: '10px 14px 8px',
          'border-bottom': `1px solid ${themeColors.border}`,
          'flex-shrink': '0',
          cursor: props.isFloating ? 'grab' : 'default',
          'user-select': 'none',
        }}
        onPointerDown={props.isFloating ? props.onDragStart : undefined}
        onPointerMove={props.isFloating ? props.onDragMove : undefined}
        onPointerUp={props.isFloating ? props.onDragEnd : undefined}
      >
        <FileText size={15} style={{ color: themeColors.textMuted }} />
        <span style={{ 'font-weight': '600', 'font-size': '13px', color: themeColors.text }}>
          产出物
        </span>
        <Show when={props.artifacts.length > 0}>
          <span
            style={{
              'font-size': '11px',
              color: themeColors.textMuted,
              padding: '1px 6px',
              'border-radius': '10px',
              border: `1px solid ${themeColors.border}`,
            }}
          >
            {props.artifacts.length} 个文件
          </span>
        </Show>
        <div style={{ flex: '1' }} />
        <Show when={props.onToggleFloat !== undefined}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={props.onToggleFloat}
            title={props.isFloating ? '收起到侧边栏' : '悬浮显示'}
            style={{
              display: 'inline-flex',
              'align-items': 'center',
              'justify-content': 'center',
              width: '22px',
              height: '22px',
              'border-radius': '4px',
              cursor: 'pointer',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent',
              color: themeColors.textMuted,
              'flex-shrink': '0',
            }}
          >
            <Show when={props.isFloating} fallback={<ExternalLink size={12} />}>
              <Minimize2 size={12} />
            </Show>
          </button>
        </Show>
      </div>

      {/* ── 空状态 ── */}
      <Show when={props.artifacts.length === 0}>
        <div
          style={{
            flex: '1',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            'justify-content': 'center',
            padding: '40px 20px',
            color: themeColors.textMuted,
            'text-align': 'center',
          }}
        >
          <FileText size={36} style={{ 'margin-bottom': '10px', opacity: '0.4' }} />
          <div style={{ 'font-size': '12px' }}>执行完成后产出物将在此展示</div>
        </div>
      </Show>

      {/* ── 有内容时渲染工作区 ── */}
      <Show when={props.artifacts.length > 0}>
        {/* Tab 栏 */}
        <div
          style={{
            display: 'flex',
            'overflow-x': 'auto',
            'border-bottom': `1px solid ${themeColors.border}`,
            'flex-shrink': '0',
          }}
        >
          <For each={props.artifacts}>
            {(art) => {
              const isActive = () => (activeTabId() === art.id) || (!activeTabId() && props.artifacts[0]?.id === art.id);
              return (
                <button
                  onClick={() => setActiveTabId(art.id)}
                  style={{
                    display: 'inline-flex',
                    'align-items': 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    'font-size': '12px',
                    'white-space': 'nowrap',
                    cursor: 'pointer',
                    border: 'none',
                    'border-bottom': isActive() ? `2px solid ${chartColors.success}` : '2px solid transparent',
                    background: 'transparent',
                    color: isActive() ? themeColors.text : themeColors.textMuted,
                    'font-weight': isActive() ? '600' : '400',
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{art.agentEmoji}</span>
                  <span style={{ 'max-width': '120px', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                    {art.title}
                  </span>
                </button>
              );
            }}
          </For>
        </div>

        {/* 模式切换 + 工具栏 */}
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '4px',
            padding: '6px 10px',
            'border-bottom': `1px solid ${themeColors.border}`,
            'flex-shrink': '0',
            'flex-wrap': 'wrap',
          }}
        >
          {/* 模式按钮 */}
          <For each={modeButtons}>
            {({ mode, icon: Icon, label }) => (
              <button
                onClick={() => setViewMode(mode)}
                style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  'font-size': '11px',
                  'border-radius': '4px',
                  cursor: 'pointer',
                  border: `1px solid ${viewMode() === mode ? chartColors.success : themeColors.border}`,
                  background: viewMode() === mode ? chartColors.success + '15' : 'transparent',
                  color: viewMode() === mode ? chartColors.success : themeColors.textMuted,
                  'font-weight': viewMode() === mode ? '600' : '400',
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            )}
          </For>

          {/* 编辑模式：格式工具栏 */}
          <Show when={viewMode() === 'edit'}>
            <div style={{ width: '1px', height: '16px', background: themeColors.border, margin: '0 4px' }} />
            <For each={toolbarButtons}>
              {({ icon: Icon, action, title }) => (
                <button
                  onClick={action}
                  title={title}
                  style={{
                    display: 'inline-flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    width: '24px',
                    height: '24px',
                    'border-radius': '4px',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'transparent',
                    color: themeColors.textMuted,
                  }}
                >
                  <Icon size={13} />
                </button>
              )}
            </For>
          </Show>
        </div>

        {/* 内容区 */}
        <div style={{ flex: '1', overflow: 'hidden', display: 'flex', 'flex-direction': 'column' }}>
          <Show when={activeArtifact()}>
            {(art) => (
              <>
                {/* 编辑模式 */}
                <Show when={viewMode() === 'edit'}>
                  <textarea
                    id={`artifact-textarea-${art().id}`}
                    value={currentContent()}
                    onInput={(e) => handleContentChange(e.currentTarget.value)}
                    style={{
                      flex: '1',
                      width: '100%',
                      resize: 'none',
                      border: 'none',
                      outline: 'none',
                      padding: '12px 14px',
                      'font-size': '13px',
                      'line-height': '1.7',
                      'font-family': 'inherit',
                      background: themeColors.surface,
                      color: themeColors.text,
                      'overflow-y': 'auto',
                      'box-sizing': 'border-box',
                      height: '100%',
                    }}
                    placeholder="在此编辑 Markdown 内容..."
                  />
                </Show>

                {/* 源码模式（只读等宽字体） */}
                <Show when={viewMode() === 'source'}>
                  <pre
                    style={{
                      flex: '1',
                      margin: '0',
                      padding: '12px 14px',
                      'font-size': '12px',
                      'line-height': '1.7',
                      'font-family': '"JetBrains Mono", "Fira Code", monospace',
                      background: themeColors.hover,
                      color: themeColors.textSecondary,
                      'overflow-y': 'auto',
                      'white-space': 'pre-wrap',
                      'word-break': 'break-word',
                    }}
                  >
                    {currentContent()}
                  </pre>
                </Show>

                {/* 审查模式（渲染 Markdown） */}
                <Show when={viewMode() === 'review'}>
                  <div
                    style={{
                      flex: '1',
                      'overflow-y': 'auto',
                      padding: '12px 14px',
                      'font-size': '13px',
                      'line-height': '1.8',
                      color: themeColors.text,
                    }}
                    // eslint-disable-next-line solid/no-innerhtml
                    innerHTML={`<p style="margin:6px 0">${renderMarkdown(currentContent())}</p>`}
                  />
                </Show>
              </>
            )}
          </Show>
        </div>

        {/* Footer */}
        <Show when={activeArtifact()}>
          {(art) => (
            <div
              style={{
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '5px 14px',
                'border-top': `1px solid ${themeColors.border}`,
                'font-size': '11px',
                color: themeColors.textMuted,
                'flex-shrink': '0',
                background: themeColors.hover,
              }}
            >
              <span>Markdown · {charCount()} 字符</span>
              <span>来自 {art().agentName} · {art().createdAt}</span>
            </div>
          )}
        </Show>
      </Show>
      {/* Resize 手柄（仅悬浮模式） */}
      <Show when={props.isFloating && props.onResizeEdge !== undefined}>
        {/* 右边 */}
        <div
          style={{
            position: 'absolute', right: '0', top: '8px', bottom: '8px',
            width: '6px', cursor: 'e-resize', 'z-index': 10,
            'border-radius': '3px', background: 'transparent', transition: 'background 0.15s',
          }}
          onPointerDown={(e) => props.onResizeEdge?.(e, 'right')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.primary + '50'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        {/* 左边 */}
        <div
          style={{
            position: 'absolute', left: '0', top: '8px', bottom: '8px',
            width: '6px', cursor: 'w-resize', 'z-index': 10,
            'border-radius': '3px', background: 'transparent', transition: 'background 0.15s',
          }}
          onPointerDown={(e) => props.onResizeEdge?.(e, 'left')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.primary + '50'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        {/* 底边 */}
        <div
          style={{
            position: 'absolute', bottom: '0', left: '8px', right: '8px',
            height: '6px', cursor: 's-resize', 'z-index': 10,
            'border-radius': '3px', background: 'transparent', transition: 'background 0.15s',
          }}
          onPointerDown={(e) => props.onResizeEdge?.(e, 'bottom')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.primary + '50'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        {/* 右下角 */}
        <div
          style={{
            position: 'absolute', right: '0', bottom: '0',
            width: '12px', height: '12px', cursor: 'se-resize', 'z-index': 11,
            'border-radius': '0 0 8px 0', background: 'transparent', transition: 'background 0.15s',
          }}
          onPointerDown={(e) => props.onResizeEdge?.(e, 'right-bottom')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.primary + '50'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        {/* 左下角 */}
        <div
          style={{
            position: 'absolute', left: '0', bottom: '0',
            width: '12px', height: '12px', cursor: 'sw-resize', 'z-index': 11,
            'border-radius': '0 0 0 8px', background: 'transparent', transition: 'background 0.15s',
          }}
          onPointerDown={(e) => props.onResizeEdge?.(e, 'left-bottom')}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = chartColors.primary + '50'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
      </Show>
    </div>
  );
};

export default ArtifactWorkspace;
