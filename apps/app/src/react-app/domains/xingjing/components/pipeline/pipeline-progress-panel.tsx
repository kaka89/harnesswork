/** @jsxImportSource react */
/**
 * PipelineProgressPanel — 流水线执行进度面板（§I 闸门 3/4 UI）
 *
 * 显示：
 * - 整体进度条
 * - 每节点状态时间线（pending/running/completed/failed/skipped/awaiting-approval）
 * - 异常红色横幅 + 重跑/终止按钮
 * - human_approval 节点时显示审批等待提示（§I 闸门 4）
 *
 * 使用场景：在 ArtifactsDrawer 或 SessionSurface 右侧，当检测到该 session 由
 * pipeline 启动时显示。
 */

import { AlertTriangle, CheckCircle2, Circle, Clock, GitBranch, Loader2, SkipForward, UserCheck, XCircle } from "lucide-react";
import type { NodeSupervisorState, NodeSupervisorStatus, PipelineSupervisorResult } from "../../hooks/use-pipeline-supervisor";
import type { PipelineDefinition } from "../../pipeline/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineProgressPanelProps {
  def: PipelineDefinition;
  supervisorResult: PipelineSupervisorResult;
  /** 是否正在终止 pipeline */
  terminating?: boolean;
  /** 点击「回到节点 N 重跑」 */
  onRetryFromNode?: (nodeIndex: number) => void;
  /** 点击「终止 pipeline」 */
  onTerminate?: () => void;
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  NodeSupervisorStatus,
  { label: string; color: string; Icon: React.ElementType }
> = {
  pending: { label: "等待中", color: "text-dls-secondary/60", Icon: Circle },
  running: { label: "执行中", color: "text-blue-9", Icon: Loader2 },
  completed: { label: "已完成", color: "text-green-9", Icon: CheckCircle2 },
  failed: { label: "失败", color: "text-red-9", Icon: XCircle },
  skipped: { label: "已跳过", color: "text-dls-secondary/50", Icon: SkipForward },
  "awaiting-approval": { label: "等待审批", color: "text-amber-9", Icon: UserCheck },
  unknown: { label: "未知", color: "text-dls-secondary/40", Icon: Circle },
};

const NODE_KIND_ICON: Record<string, React.ElementType> = {
  branch: GitBranch,
  human_approval: UserCheck,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PipelineProgressPanel({
  def,
  supervisorResult,
  terminating = false,
  onRetryFromNode,
  onTerminate,
}: PipelineProgressPanelProps) {
  const { nodeStates, hasAnomaly, anomalies, progress } = supervisorResult;

  const completedCount = nodeStates.filter(
    (n) => n.status === "completed" || n.status === "skipped",
  ).length;
  const totalCount = def.nodes.length;

  const awaitingApproval = nodeStates.some((n) => n.status === "awaiting-approval");

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-dls-border bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-dls-border px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="truncate text-[12px] font-semibold text-dls-text">{def.name}</div>
          <div className="mt-0.5 font-mono text-[10px] text-dls-secondary">/{def.triggerCommand}</div>
        </div>
        <div className="shrink-0 text-[11px] text-dls-secondary">
          {completedCount}/{totalCount} 节点
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-dls-hover">
          <div
            className="h-full rounded-full bg-green-9 transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="mt-1 text-right text-[10px] text-dls-secondary">
          {Math.round(progress * 100)}%
        </div>
      </div>

      {/* Anomaly banner */}
      {hasAnomaly ? (
        <div className="mx-3 mb-2 rounded-lg border border-red-6/30 bg-red-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-red-11">
            <AlertTriangle size={13} />
            检测到执行异常
          </div>
          <ul className="mt-1 space-y-0.5">
            {anomalies.map((msg, i) => (
              <li key={i} className="text-[11px] text-red-10">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* human_approval 提示：闸门 4 */}
      {awaitingApproval ? (
        <div className="mx-3 mb-2 rounded-lg border border-amber-6/30 bg-amber-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-11">
            <UserCheck size={13} />
            流水线等待人工审批
          </div>
          <p className="mt-0.5 text-[11px] text-amber-10">
            请在任务列表中勾选对应的审批待办后，流水线将自动继续。
          </p>
        </div>
      ) : null}

      {/* Node timeline */}
      <div className="px-3 pb-1 pt-1">
        <div className="space-y-0.5">
          {nodeStates.map((state, idx) => (
            <NodeRow
              key={idx}
              state={state}
              nodeKind={def.nodes[idx]?.kind ?? "agent"}
              isLast={idx === nodeStates.length - 1}
              onRetry={
                onRetryFromNode && state.status !== "pending"
                  ? () => onRetryFromNode(idx)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Footer actions */}
      {(onRetryFromNode || onTerminate) && totalCount > 0 ? (
        <div className="flex items-center justify-end gap-2 border-t border-dls-border px-3 py-2">
          {onTerminate ? (
            <button
              type="button"
              onClick={onTerminate}
              disabled={terminating}
              className="rounded-lg border border-red-6/40 px-3 py-1.5 text-[12px] text-red-10 hover:bg-red-2 disabled:opacity-50"
            >
              {terminating ? "终止中…" : "终止 Pipeline"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── NodeRow ───────────────────────────────────────────────────────────────────

function NodeRow({
  state,
  nodeKind,
  isLast,
  onRetry,
}: {
  state: NodeSupervisorState;
  nodeKind: string;
  isLast: boolean;
  onRetry?: () => void;
}) {
  const cfg = STATUS_CONFIG[state.status];
  const StatusIcon = cfg.Icon;
  const KindIcon = NODE_KIND_ICON[nodeKind] ?? null;

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-dls-hover/40">
      {/* Status icon */}
      <StatusIcon
        size={13}
        className={`shrink-0 ${cfg.color} ${state.status === "running" ? "animate-spin" : ""}`}
      />

      {/* Label */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className={`truncate text-[12px] ${
              state.status === "completed" ? "text-dls-secondary line-through" : "text-dls-text"
            }`}
          >
            {state.nodeIndex + 1}. {state.nodeLabel}
          </span>
          {KindIcon ? <KindIcon size={10} className="shrink-0 text-dls-secondary/60" /> : null}
          {state.isTimeout ? (
            <Clock size={10} className="shrink-0 text-red-9" />
          ) : null}
        </div>
        <div className={`text-[10px] ${cfg.color}`}>{cfg.label}</div>
      </div>

      {/* Retry button */}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text group-hover:block"
        >
          重跑
        </button>
      ) : null}

      {/* Connector line */}
      {!isLast ? null : null}
    </div>
  );
}
