/**
 * 知识文档阅读器
 * 支持 Markdown 文档、YAML 结构文档、行为知识卡片三种渲染模式
 */
import { Component, createSignal, createEffect, Show } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { fileRead } from '../../services/file-ops';
import { themeColors, chartColors } from '../../utils/colors';
import DocMetaHeader from './doc-meta-header';
import DocChainBreadcrumb from './doc-chain-breadcrumb';
import { StructuredDocViewer, type StructuredDocType } from './structured-doc-viewer';

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

/** 判断文件是否为 YAML 结构化文档，返回对应的 StructuredDocType */
function detectYamlDocType(filePath?: string, docType?: string): StructuredDocType | null {
  const fp = (filePath ?? '').toLowerCase();
  const dt = (docType ?? '').toUpperCase();
  if (fp.includes('/tasks/') || dt === 'TASK') return 'task';
  if (fp.includes('/hypotheses/') || fp.includes('hypothesis')) return 'hypothesis';
  if (fp.includes('adrs') || dt === 'ADR') return 'adr';
  if (fp.includes('/releases/') || dt === 'RELEASE') return 'release';
  if (fp.endsWith('.yaml') || fp.endsWith('.yml')) {
    // 通用 YAML 文件——根据内容含有的 key 尝试推断
    return null; // 将在内容加载后再推断
  }
  return null;
}

/** 简易 YAML 解析器（处理常见的平坦 key-value + 数组） */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // 跳过注释和空行
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // 数组项
    const arrayMatch = line.match(/^\s+- (.+)$/);
    if (arrayMatch && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(arrayMatch[1].trim());
      result[currentKey] = currentArray;
      continue;
    }

    // 普通 key: value
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      // 保存前一个数组
      currentArray = null;
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '' || val === '|' || val === '>') {
        result[currentKey] = '';
      } else {
        // 去除引号
        result[currentKey] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return result;
}

/** 从解析后的 YAML 数据推断 StructuredDocType */
function inferDocTypeFromData(data: Record<string, unknown>): StructuredDocType | null {
  if ('dod' in data || ('est' in data && 'type' in data)) return 'task';
  if ('belief' in data || 'method' in data) return 'hypothesis';
  if ('decision' in data && 'question' in data) return 'adr';
  if ('version' in data && 'deployTime' in data) return 'release';
  return null;
}

export const KnowledgeDocViewer: Component<KnowledgeDocViewerProps> = (props) => {
  const [content, setContent] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [enrichedEntry, setEnrichedEntry] = createSignal<KnowledgeEntry>(props.entry);
  const [yamlDocType, setYamlDocType] = createSignal<StructuredDocType | null>(null);
  const [yamlData, setYamlData] = createSignal<Record<string, unknown> | null>(null);

  createEffect(() => {
    const entry = props.entry;
    setContent(null);
    setError(null);
    setYamlDocType(null);
    setYamlData(null);

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

        // 判断是否是 YAML 结构化文档
        let ydt = detectYamlDocType(entry.filePath, entry.docType);
        const isYaml = (entry.filePath ?? '').endsWith('.yaml') || (entry.filePath ?? '').endsWith('.yml');

        if (isYaml) {
          const parsed = parseSimpleYaml(raw);
          if (!ydt) ydt = inferDocTypeFromData(parsed);
          if (ydt) {
            setYamlDocType(ydt);
            setYamlData(parsed);
            setContent(raw); // 保留原始内容以备回退
            return;
          }
        }

        // Markdown 处理
        const { frontmatter, body } = extractBody(raw);
        setContent(body);
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

        {/* Content — YAML 结构化或 Markdown */}
        <Show when={!loading() && !error() && yamlDocType() && yamlData()}>
          <StructuredDocViewer docType={yamlDocType()!} data={yamlData()!} />
        </Show>

        <Show when={!loading() && !error() && content() && !yamlDocType()}>
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
