/** @jsxImportSource react */
import { useCallback, useMemo, useState } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import type { OpenworkSkillItem } from "../../../../app/lib/openwork-server";

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface SkillSelectorPanelProps {
  /** 当前已选的 skill slug 列表 */
  selectedSlugs: string[];
  /** 全量可用 Skill 列表 */
  availableSkills: OpenworkSkillItem[];
  /** 完成时回调，返回最终选中的 slug 列表 */
  onConfirm: (slugs: string[]) => void;
  /** 取消回调 */
  onCancel: () => void;
}

// ── 组件 ─────────────────────────────────────────────────────────────────────

/**
 * Skill 选择面板。
 *
 * 布局：左侧「已选」+ 右侧「Skill 池（含搜索框）」
 * 仅在 Agent 编辑弹窗第一步中点击「选择 Skill」时浮现（叠层形式）。
 */
export function SkillSelectorPanel({
  selectedSlugs,
  availableSkills,
  onConfirm,
  onCancel,
}: SkillSelectorPanelProps) {
  const [selected, setSelected] = useState<string[]>([...selectedSlugs]);
  const [query, setQuery] = useState("");

  // 根据搜索词过滤 Skill 池
  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableSkills;
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    );
  }, [availableSkills, query]);

  const toggleSkill = useCallback((slug: string) => {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }, []);

  const removeSelected = useCallback((slug: string) => {
    setSelected((prev) => prev.filter((s) => s !== slug));
  }, []);

  return (
    // 背景遮罩
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex h-[520px] w-[680px] overflow-hidden rounded-2xl border border-dls-border bg-white shadow-2xl">
        {/* 左侧：已选 */}
        <div className="flex w-[220px] shrink-0 flex-col border-r border-dls-border">
          <div className="flex h-11 items-center justify-between border-b border-dls-border px-4">
            <span className="text-[13px] font-medium text-dls-text">
              已选 ({selected.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {selected.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="text-[28px] opacity-20">🎯</span>
                <p className="text-[12px] text-dls-secondary">暂未选择 Skill</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {selected.map((slug) => {
                  const skill = availableSkills.find((s) => s.name === slug);
                  return (
                    <div
                      key={slug}
                      className="flex items-center justify-between rounded-lg border border-dls-border bg-dls-hover/40 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] text-dls-text">
                        {skill?.name ?? slug}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelected(slug)}
                        className="ml-1.5 shrink-0 rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
                        aria-label={`移除 ${slug}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：Skill 池 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 头部 */}
          <div className="flex h-11 items-center justify-between border-b border-dls-border px-4">
            <span className="text-[13px] font-medium text-dls-text">选择 Skill</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1 text-[12px] text-dls-secondary hover:bg-dls-hover"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onConfirm(selected)}
                className="rounded-lg bg-green-9 px-3 py-1 text-[12px] font-medium text-white hover:bg-green-10"
              >
                完成
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="border-b border-dls-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-dls-border bg-dls-hover/40 px-3 py-1.5">
              <Search size={13} className="shrink-0 text-dls-secondary" />
              <input
                type="text"
                placeholder="搜索 Skill..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-dls-text outline-none placeholder:text-dls-secondary/60"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 rounded p-0.5 text-dls-secondary hover:text-dls-text"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Skill 列表 */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredSkills.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="text-[28px] opacity-20">🔍</span>
                <p className="text-[12px] text-dls-secondary">未找到匹配的 Skill</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredSkills.map((skill) => {
                  const isSelected = selected.includes(skill.name);
                  return (
                    <button
                      key={skill.name}
                      type="button"
                      onClick={() => toggleSkill(skill.name)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-dls-hover ${
                        isSelected ? "bg-green-1 border border-green-6/30" : ""
                      }`}
                    >
                      {/* 勾选圆圈 */}
                      <div
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isSelected
                            ? "border-green-9 bg-green-9 text-white"
                            : "border-dls-border"
                        }`}
                      >
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path
                              d="M1 3L3 5L7 1"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-dls-text">
                            {skill.name}
                          </span>
                          {skill.trigger && (
                            <span className="rounded bg-dls-hover px-1.5 py-0.5 text-[10px] text-dls-secondary">
                              /{skill.trigger}
                            </span>
                          )}
                          {skill.scope === "global" && (
                            <span className="rounded bg-blue-2 px-1.5 py-0.5 text-[10px] text-blue-9">
                              全局
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <p className="mt-0.5 text-[12px] leading-[1.4] text-dls-secondary line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部：前往 Settings 新建 Skill */}
          <div className="border-t border-dls-border px-3 py-2">
            <a
              href="/settings/skills"
              className="flex items-center gap-1.5 text-[12px] text-dls-secondary hover:text-green-11"
            >
              <ExternalLink size={12} />
              前往设置中心新建 Skill
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
