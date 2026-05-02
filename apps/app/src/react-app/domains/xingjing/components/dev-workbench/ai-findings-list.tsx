/** @jsxImportSource react */
/**
 * AI Findings 列表组件
 *
 * 展示 AI Review 发现列表，按严重度分组着色，支持点击定位（代码评审场景）。
 */
import { AlertTriangle, AlertCircle, Info, Sparkles } from "lucide-react";
import type { AiReviewFinding, FindingSeverity } from "../../types/dev-workbench";

// ── Props ───────────────────────────────────────────────────────────────────

export interface AiFindingsListProps {
  findings: AiReviewFinding[];
  /** 点击 findings 中 file:line 时触发（仅代码评审） */
  onJumpToLine?: (file: string, line: number) => void;
}

// ── Severity 视觉 ─────────────────────────────────────────────────────────

const SEVERITY_META: Record<
  FindingSeverity,
  { label: string; colorClass: string; bgClass: string; borderClass: string; Icon: typeof AlertTriangle }
> = {
  high: {
    label: "高",
    colorClass: "text-red-11",
    bgClass: "bg-red-2",
    borderClass: "border-red-5",
    Icon: AlertTriangle,
  },
  medium: {
    label: "中",
    colorClass: "text-amber-11",
    bgClass: "bg-amber-2",
    borderClass: "border-amber-5",
    Icon: AlertCircle,
  },
  low: {
    label: "低",
    colorClass: "text-blue-11",
    bgClass: "bg-blue-2",
    borderClass: "border-blue-5",
    Icon: Info,
  },
};

// ── Component ────────────────────────────────────────────────────────────

export function AiFindingsList({ findings, onJumpToLine }: AiFindingsListProps) {
  if (findings.length === 0) {
    return (
      <div className="rounded-md border border-green-5 bg-green-2 p-3 text-center">
        <Sparkles size={16} className="mx-auto mb-1 text-green-9" />
        <p className="text-[12px] font-medium text-green-11">AI 未发现问题</p>
      </div>
    );
  }

  // 按严重度排序：high > medium > low
  const ORDER: FindingSeverity[] = ["high", "medium", "low"];
  const sorted = [...findings].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-dls-secondary">
        <Sparkles size={11} className="text-dls-accent" />
        AI Review 发现 · {findings.length} 条
      </div>
      <ul className="space-y-1.5">
        {sorted.map((f) => {
          const meta = SEVERITY_META[f.severity];
          const Icon = meta.Icon;
          const hasLocation = Boolean(f.file && typeof f.line === "number");
          return (
            <li
              key={f.id}
              className={`rounded-md border ${meta.borderClass} ${meta.bgClass} p-2`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Icon size={11} className={meta.colorClass} />
                <span className={`text-[10px] font-semibold ${meta.colorClass}`}>
                  [{meta.label}] {f.category}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-dls-text">
                {f.description}
              </p>
              {hasLocation ? (
                <button
                  type="button"
                  onClick={() => onJumpToLine?.(f.file!, f.line!)}
                  className="mt-1.5 inline-flex items-center gap-1 rounded bg-dls-surface px-1.5 py-0.5 font-mono text-[10px] text-dls-accent transition-colors hover:bg-dls-hover"
                >
                  {f.file}:{f.line}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
