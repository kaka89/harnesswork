/** @jsxImportSource react */
import { useState } from "react";
import { Plus, FileText, Loader2, Settings, CheckCircle2, Clock, Circle } from "lucide-react";
import type { DevDesignTask, DevDesignTaskStatus, DesignOutputArtifact, WorkbenchLaunchProps } from "../../types/dev-workbench";
import { MOCK_DESIGN_TASKS } from "../../mock/mock-dev-workbench";
import { usePipelineDefinitions } from "../../hooks/use-pipeline-definitions";
import { usePipelineLauncher } from "../../hooks/use-pipeline-launcher";
import { PipelineLaunchDialog } from "../pipeline/pipeline-launch-dialog";
import type { PipelineDefinition } from "../../pipeline/types";

// ── 状态 Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DevDesignTaskStatus }) {
  if (status === "in-progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-3 px-2 py-0.5 text-[10px] font-medium text-blue-11">
        <Loader2 size={9} className="animate-spin" />
        进行中
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-3 px-2 py-0.5 text-[10px] font-medium text-green-11">
        <CheckCircle2 size={9} />
        已完成
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-dls-hover px-2 py-0.5 text-[10px] text-dls-secondary">
      <Clock size={9} />
      待处理
    </span>
  );
}

// ── 产出物 Badge ─────────────────────────────────────────────────────────────

function ArtifactBadge({ artifact }: { artifact: DesignOutputArtifact }) {
  if (artifact.status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-green-3 px-2 py-0.5 text-[11px] text-green-11">
        <CheckCircle2 size={10} />
        {artifact.name}
      </span>
    );
  }
  if (artifact.status === "generating") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-3 px-2 py-0.5 text-[11px] text-amber-11">
        <Loader2 size={10} className="animate-spin" />
        {artifact.name}（生成中）
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-dls-hover px-2 py-0.5 text-[11px] text-dls-secondary">
      <Circle size={10} />
      {artifact.name}
    </span>
  );
}

// ── 空状态（无流水线） ────────────────────────────────────────────────────────

function NoPipelineHint({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
      <Settings size={20} className="text-dls-secondary/50" />
      <div className="space-y-1">
        <p className="text-[13px] text-dls-secondary">尚未配置架构设计流水线</p>
        <p className="text-[12px] text-dls-secondary/70">
          前往设置添加 scope 为「研发工坊」的流水线
        </p>
      </div>
      {onOpenSettings ? (
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md bg-dls-hover px-3 py-1.5 text-[12px] text-dls-secondary transition-colors hover:bg-dls-hover/80 hover:text-dls-text"
        >
          前往设置
        </button>
      ) : null}
    </div>
  );
}

// ── ArchDesignPanel 主组件 ────────────────────────────────────────────────────

export interface ArchDesignPanelProps {
  launchProps: WorkbenchLaunchProps;
}

/**
 * 架构设计 Tab 面板。
 *
 * 左侧：设计任务列表（Mock 数据）
 * 右侧：选中任务详情（INPUT 文档 + OUTPUT 产出物 + 启动 Agent 按钮）
 *
 * @see product/features/dev-workbench/SDD.md §3
 */
export function ArchDesignPanel({ launchProps }: ArchDesignPanelProps) {
  const [tasks, setTasks] = useState<DevDesignTask[]>(MOCK_DESIGN_TASKS);
  const [selectedId, setSelectedId] = useState<string>(tasks[0]?.id ?? "");

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  // Pipeline 集成
  const { pipelines } = usePipelineDefinitions(
    launchProps.openworkServerClient,
    launchProps.workspaceId,
  );
  const productDevPipelines = pipelines.filter((p) => p.scope === "product-dev");

  const { launch, launching, launchError, clearError } = usePipelineLauncher({
    opencodeBaseUrl: launchProps.opencodeBaseUrl,
    token: launchProps.token,
    workspacePath: launchProps.workspacePath,
    onSessionCreated: launchProps.onSessionCreated,
  });

  const [launchDialogDef, setLaunchDialogDef] = useState<PipelineDefinition | null>(null);

  const handleLaunchAgent = () => {
    if (!selectedTask) return;
    clearError();
    const def = productDevPipelines[0] ?? null;
    if (!def) return;
    if (def.inputs.length === 0) {
      void launch(def, selectedTask.title, {});
    } else {
      setLaunchDialogDef(def);
    }
  };

  // 新建 Mock 任务
  const handleAddTask = () => {
    const id = `design-${Date.now()}`;
    const newTask: DevDesignTask = {
      id,
      title: `新建设计任务 ${tasks.length + 1}`,
      status: "pending",
      prdRefs: [],
      outputArtifacts: [],
      agentRunning: false,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
    setSelectedId(id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── 左侧任务列表 ─────────────────────────────────────────────── */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-dls-border">
        <div className="flex items-center justify-between border-b border-dls-border px-3 py-2">
          <span className="text-[12px] font-semibold text-dls-text">设计任务</span>
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
                    ? "border-blue-6 bg-blue-2/60"
                    : "border-dls-border bg-dls-surface hover:bg-dls-hover/50"
                }`}
              >
                <div className={`text-[12px] font-medium leading-snug ${isSelected ? "text-blue-11" : "text-dls-text"}`}>
                  {task.title}
                </div>
                <div className="mt-1.5">
                  <StatusBadge status={task.status} />
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
                  架构设计 · {new Date(selectedTask.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              {/* 启动 Agent 按钮 */}
              {productDevPipelines.length > 0 ? (
                <button
                  type="button"
                  disabled={launching || selectedTask.agentRunning}
                  onClick={handleLaunchAgent}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-9 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-10 disabled:opacity-60"
                >
                  {launching || selectedTask.agentRunning ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : null}
                  启动架构设计 Agent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={launchProps.onNavigateToSettings}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-dls-border px-3 py-1.5 text-[12px] text-dls-secondary transition-colors hover:bg-dls-hover"
                >
                  <Settings size={12} />
                  配置流水线
                </button>
              )}
            </div>

            {launchError ? (
              <div className="mb-3 rounded-md bg-red-2 px-3 py-2 text-[12px] text-red-11">
                {launchError}
              </div>
            ) : null}

            {/* INPUT 区 */}
            <div className="mb-3 rounded-lg border border-dls-border bg-dls-surface p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-dls-secondary">
                INPUT · 关联需求文档
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTask.prdRefs.length > 0 ? (
                  selectedTask.prdRefs.map((ref) => (
                    <span
                      key={ref}
                      className="inline-flex items-center gap-1 rounded bg-blue-2 px-2 py-0.5 text-[11px] text-blue-11"
                    >
                      <FileText size={10} />
                      {ref}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-dls-secondary/60">暂无关联文档</span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-dashed border-dls-border px-2 py-0.5 text-[11px] text-dls-secondary transition-colors hover:bg-dls-hover"
                >
                  <Plus size={10} />
                  添加文档
                </button>
              </div>
            </div>

            {/* OUTPUT 区 */}
            <div className="rounded-lg border border-dls-border bg-dls-surface p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-dls-secondary">
                OUTPUT · 设计产出
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTask.outputArtifacts.length > 0 ? (
                  selectedTask.outputArtifacts.map((artifact) => (
                    <ArtifactBadge key={artifact.name} artifact={artifact} />
                  ))
                ) : (
                  <span className="text-[12px] text-dls-secondary/60">
                    启动 Agent 后将在此展示产出物
                  </span>
                )}
              </div>
            </div>

            {/* 无流水线时的提示 */}
            {productDevPipelines.length === 0 ? (
              <NoPipelineHint onOpenSettings={launchProps.onNavigateToSettings} />
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
            选择左侧任务查看详情
          </div>
        )}
      </div>

      {/* Pipeline 启动对话框 */}
      <PipelineLaunchDialog
        open={Boolean(launchDialogDef)}
        def={launchDialogDef}
        launching={launching}
        launchError={launchError}
        onLaunch={(def, goal, inputValues) => {
          setLaunchDialogDef(null);
          void launch(def, goal, inputValues);
        }}
        onClose={() => {
          setLaunchDialogDef(null);
          clearError();
        }}
      />
    </div>
  );
}
