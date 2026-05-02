/** @jsxImportSource react */
/**
 * 代码评审详情组件
 *
 * 左侧：文件 tab + Diff + 行级评论
 * 右侧：AI Findings（可跳转）+ 评论汇总 + 整单总评 + 操作按钮
 */
import { useMemo, useState } from "react";
import { FileCode2, ThumbsUp, ThumbsDown, Wrench } from "lucide-react";
import type { ReviewItem, CodeLineComment } from "../../types/dev-workbench";
import { AiFindingsList } from "./ai-findings-list";
import { DiffWithComments, lineIdOf } from "./diff-with-comments";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Props ────────────────────────────────────────────────────────────

export interface ReviewCodeDetailProps {
  item: ReviewItem;
  onUpdate: (updater: (it: ReviewItem) => ReviewItem) => void;
  onConfirmPass: () => void;
  onReject: () => void;
  onLaunchFix: () => void;
  launchingFix?: boolean;
  launchError?: string | null;
}

// ── Component ────────────────────────────────────────────────────────

export function ReviewCodeDetail({
  item, onUpdate, onConfirmPass, onReject, onLaunchFix, launchingFix, launchError,
}: ReviewCodeDetailProps) {
  const files = item.codeDiffFiles ?? [];
  const comments = item.lineComments ?? [];

  const [activeFile, setActiveFile] = useState<string>(files[0]?.file ?? "");
  const [flashLineId, setFlashLineId] = useState<string | null>(null);

  const activeDiffFile = files.find((f) => f.file === activeFile) ?? files[0] ?? null;

  // 行级评论 CRUD
  const addComment = (file: string, line: number, side: "left" | "right", content: string) => {
    const next: CodeLineComment = {
      id: newId("lc"),
      file,
      line,
      side,
      content,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    onUpdate((it) => ({
      ...it,
      lineComments: [...(it.lineComments ?? []), next],
    }));
  };
  const deleteComment = (id: string) => {
    onUpdate((it) => ({
      ...it,
      lineComments: (it.lineComments ?? []).filter((c) => c.id !== id),
    }));
  };
  const toggleResolved = (id: string) => {
    onUpdate((it) => ({
      ...it,
      lineComments: (it.lineComments ?? []).map((c) =>
        c.id === id ? { ...c, resolved: !c.resolved } : c,
      ),
    }));
  };

  // AI Findings 点击定位
  const handleJumpToLine = (file: string, line: number) => {
    setActiveFile(file);
    const id = lineIdOf("right", line);
    setFlashLineId(id);
    window.setTimeout(() => setFlashLineId(null), 1500);
  };

  // 按文件分组评论（右侧汇总）
  const commentsByFile = useMemo(() => {
    const map = new Map<string, CodeLineComment[]>();
    for (const c of comments) {
      const arr = map.get(c.file) ?? [];
      arr.push(c);
      map.set(c.file, arr);
    }
    return map;
  }, [comments]);

  const setSummary = (v: string) => onUpdate((it) => ({ ...it, summaryComment: v }));

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：文件 tab + Diff */}
      <div className="flex min-h-0 flex-1 basis-[60%] flex-col border-r border-dls-border">
        <div className="shrink-0 border-b border-dls-border px-4 py-2">
          <h3 className="text-[13px] font-semibold text-dls-text">{item.title}</h3>
          <p className="mt-0.5 text-[11px] text-dls-secondary">代码变更对比 · 点击行号在行间添加评论</p>
        </div>

        {/* 文件 tab */}
        {files.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1 border-b border-dls-border bg-dls-surface/60 px-3 py-1.5">
            {files.map((f) => {
              const count = commentsByFile.get(f.file)?.length ?? 0;
              const active = f.file === activeFile;
              return (
                <button
                  key={f.file}
                  type="button"
                  onClick={() => setActiveFile(f.file)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                    active
                      ? "bg-dls-accent/10 text-dls-accent"
                      : "text-dls-secondary hover:bg-dls-hover"
                  }`}
                >
                  <FileCode2 size={11} />
                  {f.file}
                  {count > 0 ? (
                    <span className="rounded-full bg-amber-3 px-1.5 text-[10px] text-amber-11">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Diff */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeDiffFile ? (
            <DiffWithComments
              key={activeDiffFile.file}
              diffFile={activeDiffFile}
              comments={comments}
              flashLineId={flashLineId}
              onAdd={addComment}
              onDelete={deleteComment}
              onToggleResolved={toggleResolved}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-dls-secondary">
              无 diff 文件
            </div>
          )}
        </div>
      </div>

      {/* 右侧：AI Findings + 评论汇总 + 总评 + 操作 */}
      <div className="flex min-h-0 basis-[40%] flex-col overflow-y-auto p-4">
        <AiFindingsList findings={item.findings} onJumpToLine={handleJumpToLine} />

        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] font-semibold text-dls-secondary">
            行级评论汇总 · {comments.length} 条
          </div>
          {comments.length === 0 ? (
            <p className="text-[11px] text-dls-secondary/70">点击 Diff 行号可添加评论</p>
          ) : (
            <ul className="space-y-1.5">
              {Array.from(commentsByFile.entries()).map(([file, list]) => (
                <li key={file} className="space-y-1">
                  <div className="font-mono text-[10px] text-dls-secondary">{file}</div>
                  {list.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleJumpToLine(c.file, c.line)}
                      className={`block w-full rounded border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-dls-hover ${
                        c.resolved
                          ? "border-green-5 bg-green-1/40 text-dls-secondary line-through"
                          : "border-amber-5 bg-amber-1/40 text-dls-text"
                      }`}
                    >
                      <span className="mr-1 font-mono text-[10px] text-dls-secondary">L{c.line}</span>
                      {c.content}
                    </button>
                  ))}
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
