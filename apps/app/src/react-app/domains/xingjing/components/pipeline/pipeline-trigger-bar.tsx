/** @jsxImportSource react */
/**
 * PipelineTriggerBar — 二级菜单页面顶部流水线触发栏
 *
 * 显示当前 scope 的默认流水线，提供"▶ 一键运行"入口。
 * 支持从下拉菜单切换其他 pipeline。
 * 空态时显示"去设置"CTA，引导用户在 Settings 页创建流水线。
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play, Settings, Zap } from "lucide-react";
import type { PipelineDefinition, PipelineScope } from "../../pipeline/types";
import { PIPELINE_SCOPE_LABELS } from "../../pipeline/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineTriggerBarProps {
  /** 当前二级菜单对应的 pipeline scope（null 则不渲染触发栏） */
  scope: PipelineScope | null;
  /** 该 scope 下所有可用流水线 */
  pipelines: PipelineDefinition[];
  isLoading: boolean;
  /** 是否正在启动 */
  launching: boolean;
  /** 启动错误 */
  launchError?: string | null;
  /** 点击"▶ 一键运行"后触发 */
  onLaunch: (def: PipelineDefinition) => void;
  /** 点击"去设置"跳转设置页 */
  onOpenSettings: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PipelineTriggerBar({
  scope,
  pipelines,
  isLoading,
  launching,
  launchError,
  onLaunch,
  onOpenSettings,
}: PipelineTriggerBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 优先选默认流水线，否则选第一条
  const defaultDef = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  const [selectedDef, setSelectedDef] = useState<PipelineDefinition | null>(null);

  // 当 pipelines 更新时重置 selectedDef
  useEffect(() => {
    setSelectedDef(defaultDef);
  }, [pipelines]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeDef = selectedDef ?? defaultDef;

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  if (!scope) return null;

  const scopeLabel = PIPELINE_SCOPE_LABELS[scope] ?? scope;

  // ── 加载中 ──
  if (isLoading) {
    return (
      <div className="flex h-12 items-center gap-2 border-b border-dls-border bg-white/80 px-5">
        <Zap size={14} className="shrink-0 animate-pulse text-green-10" />
        <span className="text-[12px] text-dls-secondary">加载流水线配置…</span>
      </div>
    );
  }

  // ── 空态 ──
  if (pipelines.length === 0) {
    return (
      <div className="flex h-12 items-center gap-3 border-b border-dls-border bg-white/80 px-5">
        <Zap size={14} className="shrink-0 text-dls-secondary/60" />
        <span className="text-[12px] text-dls-secondary">
          尚未配置「{scopeLabel}」流水线
        </span>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-green-10 hover:bg-green-2"
        >
          <Settings size={12} />
          去设置
        </button>
      </div>
    );
  }

  // ── 正常态 ──
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-dls-border bg-white/80 px-5">
      <Zap size={14} className="shrink-0 text-green-10" />

      {/* Pipeline switcher */}
      {pipelines.length > 1 ? (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-dls-border bg-white px-3 py-1.5 text-[12px] hover:bg-dls-hover"
          >
            <span className="max-w-[180px] truncate font-medium">
              {activeDef?.name ?? "选择流水线"}
            </span>
            {activeDef?.isDefault ? (
              <span className="rounded-full bg-green-3 px-1.5 py-0.5 text-[10px] text-green-11">
                默认
              </span>
            ) : null}
            <ChevronDown size={12} className="shrink-0 text-dls-secondary" />
          </button>

          {dropdownOpen ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-[260px] overflow-hidden rounded-xl border border-dls-border bg-white shadow-lg">
              <div className="py-1">
                {pipelines.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedDef(p);
                      setDropdownOpen(false);
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-dls-hover ${
                      activeDef?.id === p.id ? "bg-green-2/50" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-dls-text">
                          {p.name}
                        </span>
                        {p.isDefault ? (
                          <span className="shrink-0 rounded-full bg-green-3 px-1.5 py-0.5 text-[10px] text-green-11">
                            默认
                          </span>
                        ) : null}
                      </div>
                      {p.triggerCommand ? (
                        <div className="mt-0.5 font-mono text-[10px] text-dls-secondary">
                          /{p.triggerCommand}
                        </div>
                      ) : null}
                      {p.description ? (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-dls-secondary">
                          {p.description}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-dls-border">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-dls-secondary hover:bg-dls-hover"
                >
                  <Settings size={12} />
                  管理流水线…
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        // 只有一条时直接显示名称 badge
        <div className="flex items-center gap-1.5 rounded-lg border border-dls-border/50 bg-green-2/60 px-3 py-1.5">
          <span className="text-[12px] font-medium text-green-11">
            {activeDef?.name ?? ""}
          </span>
          {activeDef?.isDefault ? (
            <span className="rounded-full bg-green-3 px-1.5 py-0.5 text-[10px] text-green-11">
              默认
            </span>
          ) : null}
        </div>
      )}

      {/* Description */}
      {activeDef?.description ? (
        <span className="hidden truncate text-[12px] text-dls-secondary md:block">
          {activeDef.description}
        </span>
      ) : null}

      <div className="flex-1" />

      {/* Launch error */}
      {launchError ? (
        <span className="max-w-[200px] truncate text-[12px] text-red-10">{launchError}</span>
      ) : null}

      {/* Run button */}
      <button
        type="button"
        onClick={() => {
          if (activeDef) onLaunch(activeDef);
        }}
        disabled={!activeDef || launching}
        className="flex items-center gap-1.5 rounded-lg bg-green-9 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-green-10 disabled:opacity-50"
      >
        {launching ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            启动中…
          </>
        ) : (
          <>
            <Play size={13} />
            一键运行
          </>
        )}
      </button>
    </div>
  );
}
