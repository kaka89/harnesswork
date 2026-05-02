/** @jsxImportSource react */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Plus, CheckCircle2, Clock, Loader2, AlertCircle,
  ExternalLink, GitPullRequest,
} from "lucide-react";
import type { DevExecutionTask, DevExecStatus, DevExecNode } from "../../types/dev-workbench";
import { MOCK_DEV_TASKS } from "../../mock/mock-dev-workbench";

// ── 状态 Badge ──────────────────────────────────────────────────────────────

function ExecStatusBadge({ status }: { status: DevExecStatus }) {
  const map: Record<DevExecStatus, { label: string; cls: string; icon: ReactNode }> = {
    running:  { label: "运行中", cls: "bg-amber-3 text-amber-11", icon: <Loader2 size={9} className="animate-spin" /> },
    pending:  { label: "待处理", cls: "bg-dls-hover text-dls-secondary", icon: <Clock size={9} /> },
    done:     { label: "已完成", cls: "bg-green-3 text-green-11", icon: <CheckCircle2 size={9} /> },
    blocked:  { label: "已阻塞", cls: "bg-red-2 text-red-11", icon: <AlertCircle size={9} /> },
  };
  const { label, cls, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ── 进度条 ──────────────────────────────────────────────────────────────────

function ProgressBar({ progress, status }: { progress: number; status: DevExecStatus }) {
  const colorMap: Record<DevExecStatus, string> = {
    running: "bg-amber-9",
    pending: "bg-dls-secondary/30",
    done:    "bg-green-9",
    blocked: "bg-red-6",
  };
  return (
    <div className="h-[3px] overflow-hidden rounded-full bg-dls-border">
      <div
        className={`h-full rounded-full transition-all ${colorMap[status]}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ── Pipeline 节点状态行 ────────────────────────────────────────────────────

function NodeRow({ node }: { node: DevExecNode }) {
  if (node.status === "done") {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <CheckCircle2 size={13} className="shrink-0 text-green-9" />
        <span className="text-[12px] text-dls-text">{node.label}</span>
        <span className="ml-auto text-[11px] text-dls-secondary">完成</span>
      </div>
    );
  }
  if (node.status === "in-progress") {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <Loader2 size={13} className="shrink-0 animate-spin text-amber-9" />
        <span className="text-[12px] font-medium text-amber-11">{node.label}</span>
        <span className="ml-auto text-[11px] text-amber-9">进行中</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="h-[13px] w-[13px] shrink-0 rounded-full border border-dls-border" />
      <span className="text-[12px] text-dls-secondary">{node.label}</span>
      <span className="ml-auto text-[11px] text-dls-secondary">等待</span>
    </div>
  );
}

// ── DevExecutionPanel 主组件 ─────────────────────────────────────────────────

export interface DevExecutionPanelProps {
  /** 切换回驾驶舱（cockpit section） */
  onGoToCockpit: () => void;
}

/**
 * 开发执行 Tab 面板。
 *
 * 左侧：开发任务列表（含进度条）
 * 右侧：选中任务的 Pipeline 节点进度 + 「查看执行详情」按钮
 *
 * @see product/features/dev-workbench/SDD.md §4
 */
export function DevExecutionPanel({ onGoToCockpit }: DevExecutionPanelProps) {
  const [tasks, setTasks] = useState<DevExecutionTask[]>(MOCK_DEV_TASKS);
  const [selectedId, setSelectedId] = useState<string>(tasks[0]?.id ?? "");

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  const handleAddTask = () => {
    const id = `dev-${Date.now()}`;
    const newTask: DevExecutionTask = {
      id,
      title: `新建开发任务 ${tasks.length + 1}`,
      status: "pending",
      progress: 0,
      nodes: [],
    };
    setTasks((prev) => [newTask, ...prev]);
    setSelectedId(id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── 左侧任务列表 ─────────────────────────────────────────────── */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-dls-border">
        <div className="flex items-center justify-between border-b border-dls-border px-3 py-2">
          <span className="text-[12px] font-semibold text-dls-text">开发任务</span>
          <button
            type="button"
            onClick={handleAddTask}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text"
          >
            <Plus size={11} />
            新建
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {tasks.map((task) => {
            const isSelected = task.id === selectedId;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedId(task.id)}
                className={`w-full rounded-md border p-2 text-left transition-colors ${
                  isSelected
                    ? "border-amber-6 bg-amber-2/50"
                    : "border-dls-border bg-dls-surface hover:bg-dls-hover/50"
                }`}
              >
                <div className={`mb-1.5 text-[12px] font-medium leading-snug ${isSelected ? "text-amber-11" : "text-dls-text"}`}>
                  {task.title}
                </div>
                <ProgressBar progress={task.progress} status={task.status} />
                <div className="mt-1.5 flex items-center justify-between">
                  <ExecStatusBadge status={task.status} />
                  {task.prLink ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-10">
                      <GitPullRequest size={9} />
                      PR {task.prLink}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 右侧详情区 ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedTask ? (
          <div className="flex h-full flex-col p-5">
            {/* 标题行 */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-dls-text">{selectedTask.title}</h3>
                <p className="mt-0.5 text-[12px] text-dls-secondary">
                  {selectedTask.pipelineId
                    ? `Pipeline · ${selectedTask.pipelineId}`
                    : selectedTask.blockedReason
                    ? `阻塞原因：${selectedTask.blockedReason}`
                    : "尚未关联 Pipeline"}
                </p>
              </div>
              {/* 查看执行详情 */}
              {selectedTask.status === "running" ? (
                <button
                  type="button"
                  onClick={onGoToCockpit}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-9 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-amber-10"
                >
                  <ExternalLink size={12} />
                  查看执行详情
                </button>
              ) : null}
              {selectedTask.status === "done" && selectedTask.prLink ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-3 px-3 py-1.5 text-[12px] font-medium text-green-11">
                  <GitPullRequest size={12} />
                  PR {selectedTask.prLink}
                </span>
              ) : null}
            </div>

            {/* Pipeline 节点进度 */}
            {selectedTask.nodes.length > 0 ? (
              <div className="rounded-lg border border-dls-border bg-dls-surface p-3">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-dls-secondary">
                  PIPELINE 执行进度
                </div>
                <div className="divide-y divide-dls-border/50">
                  {selectedTask.nodes.map((node) => (
                    <NodeRow key={node.label} node={node} />
                  ))}
                </div>
              </div>
            ) : selectedTask.status === "blocked" ? (
              <div className="rounded-lg border border-red-4 bg-red-2 p-4 text-center">
                <AlertCircle size={18} className="mx-auto mb-2 text-red-9" />
                <p className="text-[13px] text-red-11">
                  {selectedTask.blockedReason ?? "任务被阻塞"}
                </p>
                <p className="mt-1 text-[12px] text-red-9/70">
                  请先完成前置依赖后再启动此任务
                </p>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[13px] text-dls-secondary">
                暂无执行记录
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
            选择左侧任务查看详情
          </div>
        )}
      </div>
    </div>
  );
}
