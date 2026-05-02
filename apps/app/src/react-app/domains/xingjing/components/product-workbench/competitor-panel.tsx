/** @jsxImportSource react */
import { useState } from "react";
import { MoreHorizontal, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import type {
  Competitor,
  CompetitorPanelProps,
  CompetitorTagTone,
  MarketInsight,
} from "../../types/product-workbench";
import { MOCK_COMPETITOR_MATRIX } from "../../mock/mock-product-workbench";
import { SkillQuickActions } from "./skill-quick-actions";

const TONE_CLASS: Record<CompetitorTagTone, string> = {
  blue:   "bg-blue-2 text-blue-10",
  purple: "bg-purple-2 text-purple-10",
  green:  "bg-green-2 text-green-10",
  amber:  "bg-amber-2 text-amber-10",
};

interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  targetId?: string;
  name: string;
  emoji: string;
  website: string;
  positioning: string;
}

const EMPTY_EDITOR: EditorState = {
  open: false,
  mode: "create",
  name: "",
  emoji: "🧩",
  website: "",
  positioning: "",
};

export function CompetitorPanel(props: CompetitorPanelProps) {
  const {
    items,
    setItems,
    onArchiveToInsight,
    onPipelineLaunch,
    toast,
    skills,
  } = props;

  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const compareTarget = items.find((c) => c.id === compareId) ?? null;

  function openCreate() {
    setEditor({ ...EMPTY_EDITOR, open: true, mode: "create" });
  }

  function openEdit(c: Competitor) {
    setMenuOpenId(null);
    setEditor({
      open: true,
      mode: "edit",
      targetId: c.id,
      name: c.name,
      emoji: c.logoEmoji ?? "🧩",
      website: c.website ?? "",
      positioning: c.positioning,
    });
  }

  function handleSubmitEditor() {
    if (!editor.name.trim()) {
      toast("请填写竞品名称", "error");
      return;
    }
    if (editor.mode === "create") {
      const now = new Date().toISOString().slice(0, 10);
      setItems((prev) => [
        ...prev,
        {
          id: `c-${Date.now()}`,
          name: editor.name.trim(),
          logoEmoji: editor.emoji || "🧩",
          website: editor.website.trim() || undefined,
          positioning: editor.positioning.trim(),
          tags: [],
          updates: [],
          addedAt: now,
        },
      ]);
      toast("已添加竞品", "success");
    } else if (editor.targetId) {
      setItems((prev) =>
        prev.map((c) =>
          c.id === editor.targetId
            ? {
                ...c,
                name: editor.name.trim(),
                logoEmoji: editor.emoji || "🧩",
                website: editor.website.trim() || undefined,
                positioning: editor.positioning.trim(),
              }
            : c,
        ),
      );
      toast("已更新竞品", "success");
    }
    setEditor(EMPTY_EDITOR);
  }

  function handleDelete(id: string) {
    setMenuOpenId(null);
    setItems((prev) => prev.filter((c) => c.id !== id));
    toast("已删除竞品", "info");
  }

  async function handleBatchScan() {
    if (scanning) return;
    setScanning(true);
    try {
      await onPipelineLaunch("competitor-analysis");
      const today = new Date().toISOString().slice(0, 10);
      setItems((prev) =>
        prev.map((c) => ({
          ...c,
          updates: [
            { date: today, title: `[Mock] ${c.name} 本周暂无重大动态，持续监控中` },
            ...c.updates,
          ],
        })),
      );
      toast(`已扫描 ${items.length} 家竞品`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "扫描失败", "error");
    } finally {
      setScanning(false);
    }
  }

  async function handleCompare(c: Competitor) {
    setMenuOpenId(null);
    try {
      await onPipelineLaunch("competitor-analysis", { competitor: c.name });
      setCompareId(c.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "对标失败", "error");
    }
  }

  function handleArchiveCompare() {
    if (!compareTarget) return;
    const now = new Date().toISOString();
    const insight: MarketInsight = {
      id: `i-compare-${Date.now()}`,
      title: `对标分析：${compareTarget.name}`,
      summary: `基于最新对标矩阵对 ${compareTarget.name} 与我方产品的差距分析。`,
      content: MOCK_COMPETITOR_MATRIX(compareTarget.name)
        .map((r) => `- **${r.dimension}** · 我方：${r.self} / 竞品：${r.competitor} / 差距：${r.gap}`)
        .join("\n"),
      category: "industry-trend",
      source: "对标分析",
      publishedAt: now,
      pinned: true,
    };
    onArchiveToInsight(insight);
    setCompareId(null);
  }

  function handleSkillInvoke(slug: string) {
    if (slug === "competitor-matrix-gen") {
      if (items.length === 0) {
        toast("请先添加至少一个竞品", "info");
        return;
      }
      setCompareId(items[0].id);
      return;
    }
    toast(`已触发 Skill：${slug}`, "info");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-dls-border px-6 py-3">
        <div className="text-[13px] font-semibold text-dls-text">竞品雷达</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
        >
          <Plus size={14} /> 添加竞品
        </button>
        <button
          type="button"
          disabled={scanning || items.length === 0}
          onClick={() => void handleBatchScan()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
        >
          <RefreshCcw size={14} className={scanning ? "animate-spin" : ""} />
          批量扫描
        </button>
        <SkillQuickActions skills={skills} onInvoke={handleSkillInvoke} />
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-2 py-16 text-[13px] text-dls-secondary">
              <div>还没有竞品</div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
              >
                <Plus size={12} /> 添加第一个竞品
              </button>
            </div>
          ) : (
            items.map((c) => (
              <div
                key={c.id}
                className="relative flex flex-col gap-2 rounded-xl border border-dls-border bg-dls-hover/40 p-4 transition-colors hover:border-dls-accent/40"
              >
                <div className="flex items-start gap-2">
                  <span className="text-2xl">{c.logoEmoji || "🧩"}</span>
                  <div className="flex flex-1 flex-col">
                    <div className="text-[14px] font-semibold text-dls-text">{c.name}</div>
                    <div className="text-[12px] text-dls-secondary line-clamp-2">
                      {c.positioning}
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                      className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover"
                      aria-label="操作"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuOpenId === c.id ? (
                      <div className="absolute right-0 top-[calc(100%+2px)] z-40 w-[140px] overflow-hidden rounded-xl border border-dls-border bg-dls-surface py-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => void handleCompare(c)}
                          className="block w-full px-3 py-1.5 text-left text-[12px] text-dls-text hover:bg-dls-hover"
                        >
                          对标分析
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="block w-full px-3 py-1.5 text-left text-[12px] text-dls-text hover:bg-dls-hover"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="block w-full px-3 py-1.5 text-left text-[12px] text-red-10 hover:bg-dls-hover"
                        >
                          <Trash2 size={12} className="mr-1 inline" /> 删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {c.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t.label}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLASS[t.tone]}`}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {c.updates.length > 0 ? (
                  <div className="mt-1 flex flex-col gap-1 border-t border-dls-border pt-2 text-[11px] text-dls-secondary">
                    <span>最近动态</span>
                    <span className="text-[12px] text-dls-text line-clamp-1">
                      › {c.updates[0].title}
                    </span>
                    <span>{c.updates[0].date}</span>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {editor.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[440px] rounded-2xl bg-dls-surface p-5 shadow-xl">
            <div className="mb-3 text-[15px] font-semibold text-dls-text">
              {editor.mode === "create" ? "添加竞品" : "编辑竞品"}
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                名称
                <input
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                图标（单字符 Emoji）
                <input
                  value={editor.emoji}
                  onChange={(e) => setEditor({ ...editor, emoji: e.target.value.slice(0, 2) })}
                  className="h-8 w-20 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                官网
                <input
                  value={editor.website}
                  placeholder="https://"
                  onChange={(e) => setEditor({ ...editor, website: e.target.value })}
                  className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                定位（≤60 字）
                <textarea
                  rows={2}
                  maxLength={60}
                  value={editor.positioning}
                  onChange={(e) => setEditor({ ...editor, positioning: e.target.value })}
                  className="resize-none rounded-lg border border-dls-border bg-dls-surface p-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(EMPTY_EDITOR)}
                className="h-8 rounded-lg px-3 text-[12px] text-dls-secondary hover:bg-dls-hover"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmitEditor}
                className="h-8 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Compare Drawer */}
      {compareTarget ? (
        <div className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col border-l border-dls-border bg-dls-surface shadow-xl">
          <div className="flex items-center gap-3 border-b border-dls-border px-5 py-4">
            <div className="flex-1">
              <div className="text-[11px] text-dls-secondary">对标分析</div>
              <div className="text-[16px] font-semibold text-dls-text">
                我方 vs {compareTarget.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompareId(null)}
              className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-dls-secondary">
                  <th className="border-b border-dls-border py-2 pr-2">维度</th>
                  <th className="border-b border-dls-border py-2 pr-2">我方</th>
                  <th className="border-b border-dls-border py-2 pr-2">竞品</th>
                  <th className="border-b border-dls-border py-2">差距</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_COMPETITOR_MATRIX(compareTarget.name).map((row) => (
                  <tr key={row.dimension} className="align-top">
                    <td className="border-b border-dls-border py-2 pr-2 font-medium text-dls-text">
                      {row.dimension}
                    </td>
                    <td className="border-b border-dls-border py-2 pr-2 text-dls-text">
                      {row.self}
                    </td>
                    <td className="border-b border-dls-border py-2 pr-2 text-dls-text">
                      {row.competitor}
                    </td>
                    <td className="border-b border-dls-border py-2 text-dls-secondary">
                      {row.gap}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-dls-border px-5 py-3">
            <button
              type="button"
              onClick={handleArchiveCompare}
              className="h-8 rounded-lg px-3 text-[12px] text-dls-secondary hover:bg-dls-hover"
            >
              归档为洞察
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setCompareId(null)}
              className="h-8 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
