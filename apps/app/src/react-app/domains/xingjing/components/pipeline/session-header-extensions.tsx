/** @jsxImportSource react */
/**
 * XingjingSessionHeaderExtensions — 注入 SessionHeader 右侧的流水线启动入口
 *
 * 仅在星静外壳（XingjingSessionPage）中挂载，团队版和 OpenWork 原生不显示。
 *
 * 包含：
 * - PipelineLauncherButton：⚡流水线▾ 按钮，点击展开 PipelineLauncherMenu
 * - PipelineLauncherMenu：按 scope 分组显示所有流水线 + new/current-session 模式切换
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Settings, Zap } from "lucide-react";
import type { PipelineDefinition, PipelineScope } from "../../pipeline/types";
import { PIPELINE_SCOPE_LABELS } from "../../pipeline/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineLaunchMode = "new-session" | "current-session";

export interface SessionHeaderExtensionsProps {
  /** 该 workspace 下的所有流水线 */
  pipelines: PipelineDefinition[];
  isLoading: boolean;
  /** 当前是否有活跃 session（决定是否可选 current-session 模式） */
  hasActiveSession: boolean;
  /** 正在启动 */
  launching: boolean;
  /** 点击「运行」后触发：将选中的 def + mode 传给上层 */
  onLaunch: (def: PipelineDefinition, mode: PipelineLaunchMode) => void;
  /** 点击「编辑/去设置」跳转设置页 */
  onOpenSettings: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionHeaderExtensions({
  pipelines,
  isLoading,
  hasActiveSession,
  launching,
  onLaunch,
  onOpenSettings,
}: SessionHeaderExtensionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={launching}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 ${
          open
            ? "border-green-7 bg-green-2 text-green-11"
            : "border-dls-border bg-white text-dls-secondary hover:border-green-7/60 hover:text-green-11"
        }`}
      >
        {launching ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-green-9/40 border-t-green-9" />
        ) : (
          <Zap size={12} className="shrink-0" />
        )}
        流水线
        <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <PipelineLauncherMenu
          pipelines={pipelines}
          isLoading={isLoading}
          hasActiveSession={hasActiveSession}
          onLaunch={(def, mode) => {
            setOpen(false);
            onLaunch(def, mode);
          }}
          onOpenSettings={() => {
            setOpen(false);
            onOpenSettings();
          }}
        />
      ) : null}
    </div>
  );
}

// ── PipelineLauncherMenu ───────────────────────────────────────────────────────

interface PipelineLauncherMenuProps {
  pipelines: PipelineDefinition[];
  isLoading: boolean;
  hasActiveSession: boolean;
  onLaunch: (def: PipelineDefinition, mode: PipelineLaunchMode) => void;
  onOpenSettings: () => void;
}

function PipelineLauncherMenu({
  pipelines,
  isLoading,
  hasActiveSession,
  onLaunch,
  onOpenSettings,
}: PipelineLauncherMenuProps) {
  const [selectedDef, setSelectedDef] = useState<PipelineDefinition | null>(null);
  const [mode, setMode] = useState<PipelineLaunchMode>(
    hasActiveSession ? "current-session" : "new-session",
  );

  // 按 scope 分组
  const groups = useMemo(() => {
    const map = new Map<PipelineScope | "custom", PipelineDefinition[]>();
    for (const p of pipelines) {
      const s = p.scope;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(p);
    }
    return map;
  }, [pipelines]);

  const effectiveSelected = selectedDef ?? pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;

  const canLaunch = Boolean(effectiveSelected);

  return (
    <div className="absolute right-0 top-full z-50 mt-1.5 w-[300px] overflow-hidden rounded-xl border border-dls-border bg-white shadow-xl">
      {/* ── Pipeline list ─── */}
      <div className="max-h-[280px] overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-dls-secondary">
            <span className="h-3 w-3 animate-pulse rounded-full bg-dls-hover/80" />
            加载中…
          </div>
        ) : pipelines.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-dls-secondary">
            尚未配置流水线，
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-green-10 hover:underline"
            >
              去设置
            </button>
          </div>
        ) : (
          Array.from(groups.entries()).map(([scope, items]) => (
            <div key={scope}>
              <div className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-dls-secondary/70">
                {PIPELINE_SCOPE_LABELS[scope] ?? scope}
              </div>
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedDef(p)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-dls-hover ${
                    effectiveSelected?.id === p.id ? "bg-green-2/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 leading-none">
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        effectiveSelected?.id === p.id ? "bg-green-9" : "bg-dls-secondary/40"
                      }`}
                    />
                  </div>
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
                    <div className="mt-0.5 font-mono text-[10px] text-dls-secondary">
                      /{p.triggerCommand}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Mode toggle ─── */}
      {pipelines.length > 0 ? (
        <div className="border-t border-dls-border px-3 py-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-dls-secondary/70">
            执行方式
          </div>
          <div className="flex gap-1.5">
            <ModeChip
              label="启动新会话"
              active={mode === "new-session"}
              onClick={() => setMode("new-session")}
            />
            <ModeChip
              label="在当前会话中执行"
              active={mode === "current-session"}
              disabled={!hasActiveSession}
              onClick={() => setMode("current-session")}
            />
          </div>
        </div>
      ) : null}

      {/* ── Footer actions ─── */}
      <div className="flex items-center justify-between border-t border-dls-border px-3 py-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 text-[12px] text-dls-secondary hover:text-dls-text"
        >
          <Settings size={12} />
          管理流水线
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          onClick={() => {
            if (effectiveSelected) onLaunch(effectiveSelected, mode);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-green-9 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-green-10 disabled:opacity-50"
        >
          <Zap size={12} />
          运行
        </button>
      </div>
    </div>
  );
}

// ── ModeChip ──────────────────────────────────────────────────────────────────

function ModeChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-green-7 bg-green-2 font-medium text-green-11"
          : "border-dls-border text-dls-secondary hover:border-green-7/60"
      }`}
    >
      {label}
    </button>
  );
}
