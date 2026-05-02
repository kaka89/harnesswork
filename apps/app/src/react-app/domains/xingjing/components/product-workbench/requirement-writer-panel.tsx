/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import type {
  DraftStatus,
  RequirementDraft,
  RequirementWriterPanelProps,
} from "../../types/product-workbench";
import { MOCK_DRAFT_SEGMENTS } from "../../mock/mock-product-workbench";
import { SkillQuickActions } from "./skill-quick-actions";

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft:     "草稿",
  reviewing: "评审中",
  locked:    "已锁定",
};

const STATUS_COLOR: Record<DraftStatus, string> = {
  draft:     "bg-dls-hover text-dls-secondary",
  reviewing: "bg-blue-2 text-blue-10",
  locked:    "bg-purple-2 text-purple-10",
};

const TEMPLATE_SNIPPETS: Record<string, string> = {
  "requirement-scaffold":
    "\n\n# PRD 大纲\n\n## 背景\n\n## 目标用户\n\n## 用户故事\n\n## 验收标准\n\n## 非功能需求\n\n## 依赖\n",
  "acceptance-criteria-gen":
    "\n\n## 验收标准（Given/When/Then）\n\n- Given ...\n  When ...\n  Then ...\n",
  "user-story-gen":
    "\n\n## 用户故事\n\n- As a [角色]\n  I want [能力]\n  So that [价值]\n",
  "risk-assessment":
    "\n\n## 风险评估\n\n| 风险 | 概率 | 影响 | 缓解 |\n|---|---|---|---|\n| ... | M | H | ... |\n",
};

function formatUpdated(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return iso.slice(0, 10);
}

export function RequirementWriterPanel(props: RequirementWriterPanelProps) {
  const {
    drafts,
    setDrafts,
    preselectDraftId,
    onAgentInvoke,
    onPipelineLaunch,
    toast,
    skills,
  } = props;

  const [selectedId, setSelectedId] = useState<string | null>(
    preselectDraftId ?? drafts[0]?.id ?? null,
  );
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptIntent, setPromptIntent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);

  // 外部预选切换
  useEffect(() => {
    if (preselectDraftId && preselectDraftId !== selectedId) {
      setSelectedId(preselectDraftId);
    }
  }, [preselectDraftId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!promptOpen) return;
    const handler = (e: MouseEvent) => {
      if (promptRef.current && !promptRef.current.contains(e.target as Node)) {
        if (!generating) setPromptOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [promptOpen, generating]);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  function patchSelected(patch: Partial<RequirementDraft>) {
    if (!selected) return;
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === selected.id
          ? { ...d, ...patch, updatedAt: new Date().toISOString() }
          : d,
      ),
    );
  }

  function handleCreate() {
    const now = new Date().toISOString();
    const id = `d-${Date.now()}`;
    setDrafts((prev) => [
      { id, title: "未命名需求", content: "", status: "draft", updatedAt: now },
      ...prev,
    ]);
    setSelectedId(id);
  }

  function handleDelete(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setConfirmDeleteId(null);
    if (selectedId === id) {
      const next = drafts.find((d) => d.id !== id);
      setSelectedId(next?.id ?? null);
    }
    toast("已删除草稿", "info");
  }

  function handleInsertTemplate(slug: string) {
    if (!selected) {
      toast("请先选择一个草稿", "info");
      return;
    }
    const snippet = TEMPLATE_SNIPPETS[slug];
    if (!snippet) {
      toast(`已触发 Skill：${slug}`, "info");
      return;
    }
    patchSelected({ content: selected.content + snippet });
    toast("已插入模板", "success");
  }

  function handleSkillInvoke(slug: string) {
    handleInsertTemplate(slug);
  }

  function handleSave() {
    if (!selected) return;
    patchSelected({});
    toast("已保存到工作区草稿", "success");
  }

  async function handleAiDraft() {
    if (!selected) {
      toast("请先选择一个草稿", "info");
      return;
    }
    if (generating) return;
    setGenerating(true);
    try {
      // Pipeline 不命中会 fallback 到 mock
      await onPipelineLaunch("requirement-drafting", { intent: promptIntent });
    } catch {
      // pipeline mock 不抛错；这里兜底
    }
    try {
      // 尝试让搭档参与一下（mock）—— 失败也不阻塞
      if (props.agents[0]) {
        await onAgentInvoke(props.agents[0].name, promptIntent || selected.title).catch(() => "");
      }
      const segments = MOCK_DRAFT_SEGMENTS(promptIntent || selected.title);
      for (let i = 0; i < segments.length; i++) {
        await new Promise((r) => setTimeout(r, 700));
        // 读 latest state via closure
        const seg = segments[i];
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === selected.id
              ? { ...d, content: d.content + seg, updatedAt: new Date().toISOString() }
              : d,
          ),
        );
      }
      toast("已生成初稿", "success");
    } finally {
      setGenerating(false);
      setPromptOpen(false);
      setPromptIntent("");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-dls-border px-6 py-3">
        <div className="text-[13px] font-semibold text-dls-text">需求编写</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
        >
          <Plus size={14} /> 新建需求
        </button>
        <SkillQuickActions
          skills={skills}
          onInvoke={handleSkillInvoke}
          label="插入模板"
        />
      </div>

      {/* Body: list + editor */}
      <div className="flex flex-1 min-h-0">
        {/* List */}
        <div className="flex w-[260px] min-w-[200px] flex-col border-r border-dls-border">
          <div className="flex-1 overflow-auto">
            {drafts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[12px] text-dls-secondary">
                <div>暂无草稿</div>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-md bg-dls-accent px-2 py-1 text-[12px] text-white"
                >
                  <Plus size={12} className="mr-0.5 inline" /> 新建第一条
                </button>
              </div>
            ) : (
              drafts.map((d) => {
                const active = d.id === selectedId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`group relative flex w-full flex-col gap-0.5 border-b border-dls-border px-3 py-2 text-left ${
                      active ? "bg-dls-hover" : "hover:bg-dls-hover"
                    }`}
                  >
                    {active ? (
                      <span className="absolute inset-y-0 left-0 w-[3px] bg-dls-accent" />
                    ) : null}
                    <div className="flex items-center gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      <span className="flex-1 truncate text-[13px] text-dls-text">{d.title}</span>
                    </div>
                    <span className="text-[11px] text-dls-secondary">
                      {formatUpdated(d.updatedAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex flex-1 min-w-0 flex-col">
          {selected ? (
            <>
              <div className="flex flex-col gap-2 border-b border-dls-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <input
                    value={selected.title}
                    onChange={(e) => patchSelected({ title: e.target.value })}
                    placeholder="未命名需求"
                    className="h-8 flex-1 rounded-lg border border-dls-border bg-dls-surface px-2 text-[14px] font-semibold text-dls-text outline-none focus:border-dls-accent"
                  />
                  <select
                    value={selected.status}
                    onChange={(e) =>
                      patchSelected({ status: e.target.value as DraftStatus })
                    }
                    className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[12px] text-dls-text outline-none focus:border-dls-accent"
                  >
                    {(Object.keys(STATUS_LABEL) as DraftStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div ref={promptRef} className="relative">
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => setPromptOpen((v) => !v)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-purple-10 hover:bg-purple-2 disabled:opacity-50"
                    >
                      <Sparkles size={14} /> AI 起草
                      <ChevronDown size={12} />
                    </button>
                    {promptOpen ? (
                      <div className="absolute left-0 top-[calc(100%+4px)] z-40 w-[360px] rounded-2xl border border-dls-border bg-dls-surface p-4 shadow-xl">
                        <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                          描述你的意图
                          <textarea
                            rows={3}
                            value={promptIntent}
                            placeholder="做一个批量导出需求的功能"
                            onChange={(e) => setPromptIntent(e.target.value)}
                            className="resize-none rounded-lg border border-dls-border bg-dls-surface p-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                          />
                        </label>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={generating}
                            onClick={() => setPromptOpen(false)}
                            className="h-8 rounded-lg px-3 text-[12px] text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={generating}
                            onClick={() => void handleAiDraft()}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {generating ? "生成中…" : "生成"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1" />
                  <span className="text-[11px] text-dls-secondary">
                    更新：{formatUpdated(selected.updatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
                  >
                    <Save size={14} /> 保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(selected.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] text-red-10 hover:bg-dls-hover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-5">
                <textarea
                  ref={textareaRef}
                  value={selected.content}
                  onChange={(e) => patchSelected({ content: e.target.value })}
                  placeholder="在这里撰写 Markdown 需求…"
                  className="h-full w-full resize-none rounded-xl border border-dls-border bg-dls-surface p-4 font-mono text-[13px] leading-relaxed text-dls-text outline-none focus:border-dls-accent"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-dls-secondary">
              从左侧选择或新建一个草稿开始写作
            </div>
          )}
        </div>
      </div>

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[360px] rounded-2xl bg-dls-surface p-5 shadow-xl">
            <div className="text-[15px] font-semibold text-dls-text">删除草稿</div>
            <div className="mt-2 text-[13px] text-dls-secondary">
              此操作不可恢复，是否继续？
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-8 rounded-lg px-3 text-[12px] text-dls-secondary hover:bg-dls-hover"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                className="h-8 rounded-lg bg-red-10 px-3 text-[12px] text-white hover:opacity-90"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
