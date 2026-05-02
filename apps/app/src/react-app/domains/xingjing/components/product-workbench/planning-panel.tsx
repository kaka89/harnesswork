/** @jsxImportSource react */
import { useState } from "react";
import { AlertTriangle, Plus, Sparkles, X } from "lucide-react";
import type {
  GoalStatus,
  PlanningPanelProps,
  ProductGoal,
  Quarter,
} from "../../types/product-workbench";
import { SkillQuickActions } from "./skill-quick-actions";

const QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

const STATUS_LABEL: Record<GoalStatus, string> = {
  planning: "规划中",
  active:   "进行中",
  "at-risk":"有风险",
  done:     "已完成",
};

const STATUS_COLOR: Record<GoalStatus, { chip: string; bar: string }> = {
  planning:  { chip: "bg-dls-hover text-dls-secondary", bar: "bg-dls-secondary/40" },
  active:    { chip: "bg-blue-2 text-blue-10",           bar: "bg-blue-10" },
  "at-risk": { chip: "bg-amber-2 text-amber-10",         bar: "bg-amber-10" },
  done:      { chip: "bg-green-2 text-green-10",         bar: "bg-green-10" },
};

interface EditorState {
  open: boolean;
  mode: "create" | "edit";
  targetId?: string;
  title: string;
  quarter: Quarter;
  status: GoalStatus;
  progress: number;
  owner: string;
  summary: string;
  linkedRequirementIds: string[];
}

function emptyEditor(defaults?: Partial<EditorState>): EditorState {
  return {
    open: false,
    mode: "create",
    title: "",
    quarter: "Q2",
    status: "planning",
    progress: 0,
    owner: "",
    summary: "",
    linkedRequirementIds: [],
    ...defaults,
  };
}

export function PlanningPanel(props: PlanningPanelProps) {
  const {
    goals,
    setGoals,
    requirementIndex,
    onOpenRequirement,
    agents,
    onAgentInvoke,
    onPipelineLaunch,
    toast,
    getAgentReplyTemplate,
    skills,
  } = props;

  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<null | "pipeline" | "agent">(null);

  const detail = goals.find((g) => g.id === detailId) ?? null;

  function openCreate() {
    setEditor(emptyEditor({ open: true, mode: "create" }));
  }

  function openEdit(g: ProductGoal) {
    setDetailId(null);
    setEditor({
      open: true,
      mode: "edit",
      targetId: g.id,
      title: g.title,
      quarter: g.quarter,
      status: g.status,
      progress: g.progress,
      owner: g.owner.name,
      summary: g.summary,
      linkedRequirementIds: [...g.linkedRequirementIds],
    });
  }

  function handleSubmitEditor() {
    if (!editor.title.trim()) {
      toast("请填写目标标题", "error");
      return;
    }
    if (editor.mode === "create") {
      setGoals((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          title: editor.title.trim(),
          quarter: editor.quarter,
          status: editor.status,
          progress: editor.progress,
          owner: { name: editor.owner || "未分配" },
          linkedRequirementIds: editor.linkedRequirementIds,
          summary: editor.summary.trim(),
        },
      ]);
      toast("已新建目标", "success");
    } else if (editor.targetId) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editor.targetId
            ? {
                ...g,
                title: editor.title.trim(),
                quarter: editor.quarter,
                status: editor.status,
                progress: editor.progress,
                owner: { name: editor.owner || "未分配" },
                summary: editor.summary.trim(),
                linkedRequirementIds: editor.linkedRequirementIds,
              }
            : g,
        ),
      );
      toast("已保存修改", "success");
    }
    setEditor(emptyEditor());
  }

  function handleDelete(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setDetailId(null);
    toast("已删除目标", "info");
  }

  async function handleAiGeneratePlan() {
    setAiMenuOpen(false);
    if (aiLoading) return;
    setAiLoading("pipeline");
    try {
      await onPipelineLaunch("product-planning");
      // 找到目标最少的季度
      const counts: Record<Quarter, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      for (const g of goals) counts[g.quarter]++;
      const target = (Object.entries(counts).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "Q3") as Quarter;
      const now = Date.now();
      const added: ProductGoal[] = [
        {
          id: `g-${now}-a`,
          title: "[AI] 提升需求管理自动化覆盖率",
          quarter: target,
          status: "planning",
          progress: 0,
          owner: { name: "未分配" },
          linkedRequirementIds: [],
          summary: "降低 PM 手动录入成本",
        },
        {
          id: `g-${now}-b`,
          title: "[AI] 知识库双向同步",
          quarter: target,
          status: "planning",
          progress: 0,
          owner: { name: "未分配" },
          linkedRequirementIds: [],
          summary: "与团队 wiki 保持一致",
        },
      ];
      setGoals((prev) => [...prev, ...added]);
      toast(`已在 ${target} 规划 2 个新目标`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI 建议失败", "error");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleAgentAnalyse() {
    setAiMenuOpen(false);
    if (agents.length === 0) {
      toast("请先到 AI 搭档页面创建一个搭档", "info");
      return;
    }
    if (aiLoading) return;
    setAiLoading("agent");
    try {
      const intent = "请分析当前 Roadmap 的风险与机会";
      const reply = await onAgentInvoke(agents[0].name, intent);
      toast(reply || getAgentReplyTemplate("planning", intent), "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "搭档暂时无响应", "error");
    } finally {
      setAiLoading(null);
    }
  }

  function handleSkillInvoke(slug: string) {
    if (slug === "goal-conflict-check") {
      const atRisk = goals.filter((g) => g.status === "at-risk").length;
      setAlertMsg(
        atRisk > 0
          ? `检测到 ${atRisk} 个"有风险"目标，建议优先复盘依赖关系`
          : "未检测到明显冲突，Roadmap 整体健康",
      );
      return;
    }
    toast(`已触发 Skill：${slug}`, "info");
  }

  const linkedReqs = detail
    ? requirementIndex.filter((r) => detail.linkedRequirementIds.includes(r.id))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {alertMsg ? (
        <div className="flex items-start gap-2 border-b border-amber-5 bg-amber-1 px-6 py-2 text-[12px] text-amber-10">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1">{alertMsg}</div>
          <button
            type="button"
            onClick={() => setAlertMsg(null)}
            className="rounded-md p-0.5 hover:bg-amber-2"
            aria-label="关闭"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-dls-border px-6 py-3">
        <div className="text-[13px] font-semibold text-dls-text">产品 Roadmap · 2026</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
        >
          <Plus size={14} /> 新建目标
        </button>
        <div className="relative">
          <button
            type="button"
            disabled={Boolean(aiLoading)}
            onClick={() => setAiMenuOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-purple-10 hover:bg-purple-2 disabled:opacity-50"
          >
            <Sparkles size={14} /> AI 建议
          </button>
          {aiMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+2px)] z-40 w-[220px] overflow-hidden rounded-xl border border-dls-border bg-dls-surface py-1 shadow-xl">
              <button
                type="button"
                onClick={() => void handleAiGeneratePlan()}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-dls-text hover:bg-dls-hover"
              >
                生成下季度规划
              </button>
              <button
                type="button"
                onClick={() => void handleAgentAnalyse()}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-dls-text hover:bg-dls-hover"
              >
                搭档分析当前 Roadmap
              </button>
            </div>
          ) : null}
        </div>
        <SkillQuickActions skills={skills} onInvoke={handleSkillInvoke} />
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {QUARTERS.map((q) => {
            const items = goals.filter((g) => g.quarter === q);
            return (
              <div key={q} className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-dls-border pb-2">
                  <span className="text-[13px] font-semibold text-dls-text">{q}</span>
                  <span className="text-[11px] text-dls-secondary">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditor(emptyEditor({ open: true, mode: "create", quarter: q }));
                    }}
                    className="rounded-xl border border-dashed border-dls-border p-3 text-left text-[12px] text-dls-secondary hover:border-dls-accent/40 hover:bg-dls-hover"
                  >
                    + 添加 {q} 目标
                  </button>
                ) : (
                  items.map((g) => {
                    const color = STATUS_COLOR[g.status];
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setDetailId(g.id)}
                        className="flex w-full flex-col gap-2 rounded-xl border border-dls-border bg-dls-hover/40 p-3 text-left transition-colors hover:border-dls-accent/40"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 text-[13px] font-medium text-dls-text">
                            {g.title}
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${color.chip}`}>
                            {STATUS_LABEL[g.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dls-hover">
                            <div
                              className={`h-full ${color.bar}`}
                              style={{ width: `${g.progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] tabular-nums text-dls-secondary">
                            {g.progress}%
                          </span>
                        </div>
                        <div className="text-[11px] text-dls-secondary">
                          👤 {g.owner.name}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Drawer */}
      {detail ? (
        <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l border-dls-border bg-dls-surface shadow-xl">
          <div className="flex items-start gap-3 border-b border-dls-border px-5 py-4">
            <div className="flex-1">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[detail.status].chip}`}
              >
                {STATUS_LABEL[detail.status]} · {detail.quarter}
              </span>
              <div className="mt-1 text-[16px] font-semibold text-dls-text">
                {detail.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openEdit(detail)}
              className="rounded-md px-2 py-1 text-[12px] text-dls-secondary hover:bg-dls-hover"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => handleDelete(detail.id)}
              className="rounded-md px-2 py-1 text-[12px] text-red-10 hover:bg-dls-hover"
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
            <div className="mb-3">
              <div className="mb-1 text-[11px] text-dls-secondary">进度</div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-dls-hover">
                  <div
                    className={`h-full ${STATUS_COLOR[detail.status].bar}`}
                    style={{ width: `${detail.progress}%` }}
                  />
                </div>
                <span className="text-[12px] tabular-nums text-dls-text">{detail.progress}%</span>
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-[11px] text-dls-secondary">负责人</div>
              <div className="text-[13px] text-dls-text">👤 {detail.owner.name}</div>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-[11px] text-dls-secondary">目标摘要</div>
              <div className="text-[13px] text-dls-text">{detail.summary || "—"}</div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-dls-secondary">
                关联需求 ({linkedReqs.length})
              </div>
              {linkedReqs.length === 0 ? (
                <div className="text-[12px] text-dls-secondary">暂无关联需求</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {linkedReqs.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-dls-border px-3 py-2"
                    >
                      <div className="flex-1 truncate text-[13px] text-dls-text">{r.title}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailId(null);
                          onOpenRequirement(r.id);
                        }}
                        className="rounded-md px-2 py-0.5 text-[11px] text-dls-accent hover:bg-dls-hover"
                      >
                        查看
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Editor Modal */}
      {editor.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[480px] rounded-2xl bg-dls-surface p-5 shadow-xl">
            <div className="mb-3 text-[15px] font-semibold text-dls-text">
              {editor.mode === "create" ? "新建目标" : "编辑目标"}
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                标题 *
                <input
                  autoFocus
                  maxLength={40}
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-dls-secondary">
                  季度
                  <select
                    value={editor.quarter}
                    onChange={(e) => setEditor({ ...editor, quarter: e.target.value as Quarter })}
                    className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-dls-secondary">
                  状态
                  <select
                    value={editor.status}
                    onChange={(e) => setEditor({ ...editor, status: e.target.value as GoalStatus })}
                    className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                  >
                    {(Object.keys(STATUS_LABEL) as GoalStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                进度（{editor.progress}%）
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={editor.progress}
                  onChange={(e) => setEditor({ ...editor, progress: Number(e.target.value) })}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                负责人
                <select
                  value={editor.owner}
                  onChange={(e) => setEditor({ ...editor, owner: e.target.value })}
                  className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                >
                  <option value="">未分配</option>
                  {agents.map((a) => (
                    <option key={a.name} value={a.options?.displayName || a.name}>
                      {a.options?.displayName || a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                目标摘要（≤120 字）
                <textarea
                  rows={3}
                  maxLength={120}
                  value={editor.summary}
                  onChange={(e) => setEditor({ ...editor, summary: e.target.value })}
                  className="resize-none rounded-lg border border-dls-border bg-dls-surface p-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                关联需求（可多选）
                <select
                  multiple
                  size={4}
                  value={editor.linkedRequirementIds}
                  onChange={(e) => {
                    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setEditor({ ...editor, linkedRequirementIds: ids });
                  }}
                  className="rounded-lg border border-dls-border bg-dls-surface p-1 text-[12px] text-dls-text outline-none focus:border-dls-accent"
                >
                  {requirementIndex.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}（{r.status}）
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(emptyEditor())}
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
    </div>
  );
}
