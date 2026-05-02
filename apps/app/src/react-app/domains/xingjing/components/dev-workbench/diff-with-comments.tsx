/** @jsxImportSource react */
/**
 * Diff + 行间评论组件（react-diff-view 实现）
 *
 * 点击行号 → 直接在该行下方以 widget 形式展开输入框；
 * 已保存的评论也以 widget 形式贴在对应行下方堆叠展示。
 */
import { useMemo, useState, type ReactNode } from "react";
import { createTwoFilesPatch } from "diff";
import {
  Diff,
  Hunk,
  parseDiff,
  getChangeKey,
  type ChangeData,
  type HunkData,
  type ChangeEventArgs,
} from "react-diff-view";
import { MessageSquare, Check, Trash2, X } from "lucide-react";
import "react-diff-view/style/index.css";
import type { CodeDiffFile, CodeLineComment } from "../../types/dev-workbench";

// ── Props ────────────────────────────────────────────────────────────

export interface DiffWithCommentsProps {
  diffFile: CodeDiffFile;
  comments: CodeLineComment[];
  /** 跳转高亮的行（形如 "L-12" / "R-12"） */
  flashLineId?: string | null;
  onAdd: (file: string, line: number, side: "left" | "right", content: string) => void;
  onDelete: (commentId: string) => void;
  onToggleResolved: (commentId: string) => void;
}

// ── 工具 ──────────────────────────────────────────────────────────────

/** 外部使用的 lineId 格式：L-N / R-N（与旧 API 兼容） */
function lineIdOf(side: "left" | "right", line: number): string {
  return `${side === "left" ? "L" : "R"}-${line}`;
}

function parseLineId(lineId: string): { side: "left" | "right"; line: number } | null {
  const m = /^([LR])-(\d+)$/.exec(lineId);
  if (!m) return null;
  return { side: m[1] === "L" ? "left" : "right", line: Number(m[2]) };
}

/** (side,line) → 对应的 ChangeData */
function findChangeForComment(
  changes: ChangeData[],
  side: "left" | "right",
  line: number,
): ChangeData | null {
  if (side === "left") {
    for (const c of changes) {
      if (c.type === "delete" && c.lineNumber === line) return c;
    }
    for (const c of changes) {
      if (c.type === "normal" && c.oldLineNumber === line) return c;
    }
    return null;
  }
  for (const c of changes) {
    if (c.type === "insert" && c.lineNumber === line) return c;
  }
  for (const c of changes) {
    if (c.type === "normal" && c.newLineNumber === line) return c;
  }
  return null;
}

/** 点击 gutter 时把 change + side 映射回 (left/right, line) */
function commentLocOfChange(
  change: ChangeData,
  side: "old" | "new",
): { line: number; side: "left" | "right" } {
  if (change.type === "insert") return { line: change.lineNumber, side: "right" };
  if (change.type === "delete") return { line: change.lineNumber, side: "left" };
  if (side === "old") return { line: change.oldLineNumber, side: "left" };
  return { line: change.newLineNumber, side: "right" };
}

/** jsdiff 输出补 git 头，便于 gitdiff-parser 解析 */
function buildUnifiedPatch(file: string, oldContent: string, newContent: string): string {
  const body = createTwoFilesPatch(`a/${file}`, `b/${file}`, oldContent, newContent, "", "");
  return `diff --git a/${file} b/${file}\n${body}`;
}

// ── Component ────────────────────────────────────────────────────────

export function DiffWithComments({
  diffFile, comments, flashLineId, onAdd, onDelete, onToggleResolved,
}: DiffWithCommentsProps) {
  // 正在编辑中的 change
  const [activeChangeKey, setActiveChangeKey] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<"left" | "right">("right");
  const [activeLine, setActiveLine] = useState<number>(0);
  const [draft, setDraft] = useState("");

  const fileComments = useMemo(
    () => comments.filter((c) => c.file === diffFile.file),
    [comments, diffFile.file],
  );

  // 生成 unified patch → hunks
  const hunks = useMemo<HunkData[]>(() => {
    const patch = buildUnifiedPatch(diffFile.file, diffFile.oldContent, diffFile.newContent);
    const files = parseDiff(patch, { nearbySequences: "zip" });
    return files[0]?.hunks ?? [];
  }, [diffFile.file, diffFile.oldContent, diffFile.newContent]);

  // 展平 changes
  const allChanges = useMemo<ChangeData[]>(
    () => hunks.flatMap((h) => h.changes),
    [hunks],
  );

  // 构造 widgets：已有评论堆叠 + 可选的编辑器
  const widgets = useMemo<Record<string, ReactNode>>(() => {
    const commentGroups: Record<string, CodeLineComment[]> = {};
    for (const c of fileComments) {
      const change = findChangeForComment(allChanges, c.side, c.line);
      if (!change) continue;
      const key = getChangeKey(change);
      (commentGroups[key] ??= []).push(c);
    }

    const cancel = () => {
      setActiveChangeKey(null);
      setDraft("");
    };
    const submit = () => {
      const text = draft.trim();
      if (!text || !activeChangeKey) return;
      onAdd(diffFile.file, activeLine, activeSide, text);
      setDraft("");
      setActiveChangeKey(null);
    };

    const renderCommentList = (list: CodeLineComment[]) =>
      list.map((c) => (
        <div
          key={c.id}
          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-[12px] ${
            c.resolved
              ? "border-green-5 bg-green-1/40 text-dls-secondary line-through"
              : "border-amber-5 bg-dls-surface text-dls-text"
          }`}
        >
          <MessageSquare size={11} className="mt-0.5 shrink-0 text-amber-10" />
          <p className="flex-1 leading-relaxed">{c.content}</p>
          <button
            type="button"
            title={c.resolved ? "重新打开" : "标记已解决"}
            onClick={() => onToggleResolved(c.id)}
            className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-green-10"
          >
            <Check size={11} />
          </button>
          <button
            type="button"
            title="删除"
            onClick={() => onDelete(c.id)}
            className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-red-10"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ));

    const renderEditor = () => (
      <div className="rounded-md border border-amber-6 bg-dls-surface p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-dls-secondary">
            在{" "}
            <span className="font-mono text-dls-text">
              {diffFile.file}:{activeSide === "left" ? "L" : "R"}-{activeLine}
            </span>{" "}
            添加评论
          </span>
          <button
            type="button"
            onClick={cancel}
            className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          >
            <X size={12} />
          </button>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入评论内容..."
          rows={2}
          className="w-full resize-none rounded-md border border-dls-border bg-dls-surface p-2 text-[12px] text-dls-text outline-none focus:border-dls-accent"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={cancel}
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
    );

    const wrap = (children: ReactNode) => (
      <div className="space-y-1.5 border-l-2 border-dls-accent bg-amber-1/30 px-3 py-2">
        {children}
      </div>
    );

    const out: Record<string, ReactNode> = {};
    for (const [key, list] of Object.entries(commentGroups)) {
      out[key] = wrap(renderCommentList(list));
    }
    if (activeChangeKey) {
      const existing = commentGroups[activeChangeKey] ?? [];
      out[activeChangeKey] = wrap(
        <>
          {renderCommentList(existing)}
          {renderEditor()}
        </>,
      );
    }
    return out;
  }, [
    fileComments, allChanges, activeChangeKey, activeSide, activeLine, draft,
    diffFile.file, onAdd, onDelete, onToggleResolved,
  ]);

  // 高亮：有评论的行 + flash 行
  const selectedChanges = useMemo(() => {
    const keys = new Set<string>();
    for (const c of fileComments) {
      const ch = findChangeForComment(allChanges, c.side, c.line);
      if (ch) keys.add(getChangeKey(ch));
    }
    if (flashLineId) {
      const parsed = parseLineId(flashLineId);
      if (parsed) {
        const ch = findChangeForComment(allChanges, parsed.side, parsed.line);
        if (ch) keys.add(getChangeKey(ch));
      }
    }
    return Array.from(keys);
  }, [fileComments, allChanges, flashLineId]);

  const handleGutterClick = (args: ChangeEventArgs) => {
    if (!args.change) return;
    const side = args.side ?? "new";
    const loc = commentLocOfChange(args.change, side);
    setActiveChangeKey(getChangeKey(args.change));
    setActiveSide(loc.side);
    setActiveLine(loc.line);
    setDraft("");
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto text-[12px]">
      <Diff
        viewType="split"
        diffType="modify"
        hunks={hunks}
        widgets={widgets}
        selectedChanges={selectedChanges}
        gutterEvents={{ onClick: handleGutterClick }}
      >
        {(innerHunks) =>
          innerHunks.map((h, i) => <Hunk key={`${h.content}-${i}`} hunk={h} />)
        }
      </Diff>
    </div>
  );
}

export { lineIdOf };
