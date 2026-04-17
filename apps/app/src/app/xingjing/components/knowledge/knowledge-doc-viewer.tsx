/**
 * 知识文档阅读器
 * 支持 Markdown 文档、YAML 结构文档、行为知识卡片三种渲染模式
 */
import { Component, createSignal, createEffect, Show } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { fileRead } from '../../services/opencode-client';
import { themeColors, chartColors } from '../../utils/colors';
import DocMetaHeader from './doc-meta-header';
import DocChainBreadcrumb from './doc-chain-breadcrumb';

interface KnowledgeDocViewerProps {
  entry: KnowledgeEntry;
  workDir: string;
  allEntries: KnowledgeEntry[];
  onNavigate: (entryId: string) => void;
  onBack: () => void;
}

/** 简单 Markdown → HTML 转换（基础支持） */
function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:16px 0 6px;color:var(--dls-text)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;margin:20px 0 8px;color:var(--dls-text)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:var(--dls-text)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1. $2</li>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 10px;line-height:1.7">')
    .replace(/^(?!<[h|l|p])(.+)$/gm, '<p style="margin:0 0 10px;line-height:1.7">$1</p>');
}

/** 从 frontmatter+body Markdown 中提取正文 */
function extractBody(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim();
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: match[2].trim() };
}

export const KnowledgeDocViewer: Component<KnowledgeDocViewerProps> = (props) => {
  const [content, setContent] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [enrichedEntry, setEnrichedEntry] = createSignal<KnowledgeEntry>(props.entry);

  createEffect(() => {
    const entry = props.entry;
    setContent(null);
    setError(null);

    if (entry.source === 'behavior') {
      // 行为知识内容已在 summary 中
      setContent(entry.summary);
      return;
    }

    if (!entry.filePath) {
      setContent(entry.summary);
      return;
    }

    setLoading(true);
    fileRead(entry.filePath, props.workDir)
      .then((raw) => {
        if (!raw) { setError('文件读取失败'); return; }
        const { frontmatter, body } = extractBody(raw);
        setContent(body);
        // 将 frontmatter 合并回 entry 供 DocMetaHeader 使用
        setEnrichedEntry({ ...entry, frontmatter } as KnowledgeEntry & { frontmatter: Record<string, unknown> });
      })
      .catch(() => setError('文件读取失败'))
      .finally(() => setLoading(false));
  });

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶部：返回 + 文档链 */}
      <div style={{ padding: '10px 16px', 'border-bottom': `1px solid ${themeColors.border}`, display: 'flex', 'align-items': 'center', gap: '8px', 'flex-shrink': 0 }}>
        <button
          onClick={props.onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textSecondary, 'font-size': '13px', padding: '2px 6px', 'border-radius': '4px' }}
        >← 返回</button>
        <DocChainBreadcrumb
          entry={enrichedEntry()}
          allEntries={props.allEntries}
          onNavigate={props.onNavigate}
        />
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* 标题 */}
        <h1 style={{ 'font-size': '20px', 'font-weight': 700, color: themeColors.text, margin: '0 0 12px' }}>
          {props.entry.title}
        </h1>

        {/* 元信息 */}
        <DocMetaHeader entry={enrichedEntry()} />

        {/* Tags */}
        <Show when={props.entry.tags?.length > 0}>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'margin-bottom': '16px' }}>
            {props.entry.tags.map((tag) => (
              <span style={{ 'font-size': '11px', padding: '2px 8px', 'border-radius': '12px', background: '#f3f4f6', color: '#6b7280' }}>#{tag}</span>
            ))}
          </div>
        </Show>

        {/* Loading */}
        <Show when={loading()}>
          <div style={{ color: themeColors.textSecondary, 'font-size': '13px', padding: '24px', 'text-align': 'center' }}>
            加载文档内容...
          </div>
        </Show>

        {/* Error */}
        <Show when={error()}>
          <div style={{ color: chartColors.error, 'font-size': '13px', padding: '12px', background: '#fef2f2', 'border-radius': '8px' }}>
            ⚠️ {error()}
          </div>
        </Show>

        {/* Content */}
        <Show when={!loading() && !error() && content()}>
          <div
            style={{ 'font-size': '13px', 'line-height': '1.7', color: themeColors.text }}
            innerHTML={simpleMarkdownToHtml(content()!)}
          />
        </Show>
      </div>
    </div>
  );
};

export default KnowledgeDocViewer;
