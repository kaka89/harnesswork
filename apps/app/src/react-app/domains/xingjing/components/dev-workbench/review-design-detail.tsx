/** @jsxImportSource react */
/**
 * 架构评审详情组件
 *
 * 左侧：Markdown 渲染 + 段落级人工批注
 * 右侧：AI Findings + 批注汇总 + 整单总评 + 操作按钮
 */
import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquarePlus, MessageSquare, Check, Trash2, ThumbsUp, ThumbsDown, Wrench,
} from "lucide-react";
import type {
  ReviewItem, DesignAnnotation,
} from "../../types/dev-workbench";
import { AiFindingsList } from "./ai-findings-list";

// ── 工具 ──────────────────────────────────────────────────────────────

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function scrollAnchorIntoView(root: HTMLElement | null, anchor: string) {
  if (!root) return;
  const el = root.querySelector(`[data-anchor="${anchor}"]`) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-7", "ring-offset-2");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-amber-7", "ring-offset-2");
    }, 1200);
  }
}

// ── 段落批注显示组件（内嵌到段落内部） ─────────────────────────────────

interface AnnotationBlockProps {
  anchor: string;
  annotations: DesignAnnotation[];
  onAdd: (anchor: string, content: string) => void;
  onDelete: (id: string) => void;
  onToggleResolved: (id: string) => void;
}

function AnnotationInlinePanel({ anchor, annotations, onAdd, onDelete, onToggleResolved }: AnnotationBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(anchor, text);
    setDraft("");
    setEditing(false);
  };

  const hasAny = annotations.length > 0;

  return (
    <div className="mt-1.5 space-y-1.5">
      {annotations.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-2 rounded-md border border-amber-5 p-2 text-[12px] ${
            a.resolved ? "bg-green-1/50 line-through opacity-70" : "bg-amber-1/60"
          }`}
        >
          <MessageSquare size={11} className="mt-0.5 shrink-0 text-amber-10" />
          <p className="flex-1 leading-relaxed text-dls-text">{a.content}</p>
          <button
            type="button"
            title={a.resolved ? "重新打开" : "标记已解决"}
            onClick={() => onToggleResolved(a.id)}
            className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-green-10"
          >
            <Check size={11} />
          </button>
          <button
            type="button"
            title="删除"
            onClick={() => onDelete(a.id)}
            className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-red-10"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}

      {editing ? (
        <div className="rounded-md border border-dls-border bg-dls-surface p-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入批注..."
            rows={2}
            className="w-full resize-none border-0 bg-transparent text-[12px] text-dls-text outline-none placeholder:text-dls-secondary/70"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(""); }}
              className="rounded px-2 py-0.5 text-[11px] text-dls-secondary hover:bg-dls-hover"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              className="rounded bg-dls-accent px-2 py-0.5 text-[11px] text-white disabled:opacity-50"
            >
              提交
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-dls-secondary opacity-0 transition-opacity hover:bg-dls-hover hover:text-dls-accent group-hover:opacity-100"
        >
          <MessageSquarePlus size={11} />
          {hasAny ? "追加批注" : "添加批注"}
        </button>
      )}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────

export interface ReviewDesignDetailProps {
  item: ReviewItem;
  onUpdate: (updater: (it: ReviewItem) => ReviewItem) => void;
  onConfirmPass: () => void;
  onReject: () => void;
  onLaunchFix: () => void;
  launchingFix?: boolean;
  launchError?: string | null;
}

// ── 组件 ────────────────────────────────────────────────────────────

export function ReviewDesignDetail({
  item, onUpdate, onConfirmPass, onReject, onLaunchFix, launchingFix, launchError,
}: ReviewDesignDetailProps) {
  const markdownText = item.designDoc?.markdown ?? "";
  const annotations = item.designAnnotations ?? [];
  const contentRootRef = useRef<HTMLDivElement>(null);

  // 按 anchor 分组的批注
  const annotationsByAnchor = useMemo(() => {
    const map = new Map<string, DesignAnnotation[]>();
    for (const a of annotations) {
      const list = map.get(a.anchor) ?? [];
      list.push(a);
      map.set(a.anchor, list);
    }
    return map;
  }, [annotations]);

  // 批注 CRUD
  const addAnnotation = (anchor: string, content: string) => {
    const next: DesignAnnotation = {
      id: newId("da"),
      anchor,
      content,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    onUpdate((it) => ({
      ...it,
      designAnnotations: [...(it.designAnnotations ?? []), next],
    }));
  };
  const deleteAnnotation = (id: string) => {
    onUpdate((it) => ({
      ...it,
      designAnnotations: (it.designAnnotations ?? []).filter((a) => a.id !== id),
    }));
  };
  const toggleResolved = (id: string) => {
    onUpdate((it) => ({
      ...it,
      designAnnotations: (it.designAnnotations ?? []).map((a) =>
        a.id === id ? { ...a, resolved: !a.resolved } : a,
      ),
    }));
  };

  // 每次渲染重置块计数器（useMemo 保证同一次 render 内稳定）
  const blockCounterRef = useRef({ n: 0 });
  blockCounterRef.current.n = 0;

  const makeBlockWrapper = (Tag: "h1" | "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "blockquote" | "pre") => {
    return function BlockWrapper({ children, ...rest }: { children?: React.ReactNode }) {
      const idx = blockCounterRef.current.n++;
      const anchor = `block-${idx}`;
      const list = annotationsByAnchor.get(anchor) ?? [];
      const hasAnnotations = list.length > 0;
      return (
        <div
          data-anchor={anchor}
          className={`group relative -mx-3 rounded px-3 py-1 transition-colors hover:bg-amber-1/30 ${
            hasAnnotations ? "border-l-2 border-amber-7 bg-amber-1/20" : ""
          }`}
        >
          <Tag {...rest}>{children}</Tag>
          <AnnotationInlinePanel
            anchor={anchor}
            annotations={list}
            onAdd={addAnnotation}
            onDelete={deleteAnnotation}
            onToggleResolved={toggleResolved}
          />
        </div>
      );
    };
  };

  const components: Components = {
    h1: makeBlockWrapper("h1") as Components["h1"],
    h2: makeBlockWrapper("h2") as Components["h2"],
    h3: makeBlockWrapper("h3") as Components["h3"],
    h4: makeBlockWrapper("h4") as Components["h4"],
    p: makeBlockWrapper("p") as Components["p"],
    ul: makeBlockWrapper("ul") as Components["ul"],
    ol: makeBlockWrapper("ol") as Components["ol"],
    blockquote: makeBlockWrapper("blockquote") as Components["blockquote"],
    pre: makeBlockWrapper("pre") as Components["pre"],
  };

  // 整单总评
  const setSummary = (v: string) => onUpdate((it) => ({ ...it, summaryComment: v }));

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：Markdown + 批注 */}
      <div className="flex min-h-0 flex-1 basis-[60%] flex-col border-r border-dls-border">
        <div className="shrink-0 border-b border-dls-border px-4 py-2">
          <h3 className="text-[13px] font-semibold text-dls-text">{item.title}</h3>
          <p className="mt-0.5 text-[11px] text-dls-secondary">架构设计文档 · 悬停段落可添加批注</p>
        </div>
        <div
          ref={contentRootRef}
          className="min-h-0 flex-1 overflow-y-auto p-5 text-[13px] leading-relaxed text-dls-text
            [&_h1]:my-4 [&_h1]:text-[18px] [&_h1]:font-semibold
            [&_h2]:my-3 [&_h2]:text-[16px] [&_h2]:font-semibold
            [&_h3]:my-2 [&_h3]:text-[14px] [&_h3]:font-semibold
            [&_p]:my-2
            [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
            [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
            [&_blockquote]:border-l-4 [&_blockquote]:border-dls-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-dls-secondary
            [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-dls-border [&_pre]:bg-gray-1 [&_pre]:p-3 [&_pre]:text-[12px]
            [&_code]:rounded [&_code]:bg-gray-2/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
            {markdownText}
          </ReactMarkdown>
        </div>
      </div>

      {/* 右侧：AI Findings + 批注汇总 + 总评 + 操作 */}
      <div className="flex min-h-0 basis-[40%] flex-col overflow-y-auto p-4">
        <AiFindingsList findings={item.findings} />

        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] font-semibold text-dls-secondary">
            人工批注 · {annotations.length} 条
          </div>
          {annotations.length === 0 ? (
            <p className="text-[11px] text-dls-secondary/70">悬停左侧段落可添加批注</p>
          ) : (
            <ul className="space-y-1">
              {annotations.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => scrollAnchorIntoView(contentRootRef.current, a.anchor)}
                    className={`w-full rounded border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-dls-hover ${
                      a.resolved
                        ? "border-green-5 bg-green-1/40 text-dls-secondary line-through"
                        : "border-amber-5 bg-amber-1/40 text-dls-text"
                    }`}
                  >
                    <span className="mr-1 font-mono text-[10px] text-dls-secondary">@{a.anchor}</span>
                    {a.content}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-semibold text-dls-secondary">
            整单总评
          </label>
          <textarea
            value={item.summaryComment ?? ""}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="输入通过说明或驳回理由..."
            className="w-full resize-none rounded-md border border-dls-border bg-dls-surface p-2 text-[12px] text-dls-text outline-none focus:border-dls-accent"
          />
        </div>

        {launchError ? (
          <p className="mt-2 text-[11px] text-red-11">{launchError}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirmPass}
            className="flex items-center gap-1.5 rounded-md bg-green-9 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-green-10"
          >
            <ThumbsUp size={12} />通过
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-md border border-red-5 bg-red-1 px-3 py-1.5 text-[12px] font-medium text-red-11 transition-colors hover:bg-red-2"
          >
            <ThumbsDown size={12} />驳回
          </button>
          <button
            type="button"
            disabled={launchingFix}
            onClick={onLaunchFix}
            className="flex items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-3 py-1.5 text-[12px] text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text disabled:opacity-60"
          >
            <Wrench size={12} />启动修复 Agent
          </button>
        </div>
      </div>
    </div>
  );
}
