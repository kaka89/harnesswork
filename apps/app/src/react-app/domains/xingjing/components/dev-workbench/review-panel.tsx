/** @jsxImportSource react */
/**
 * 成果评审 Tab 面板入口
 *
 * 左侧：评审队列
 * 右侧：根据 type 分发到 ReviewDesignDetail 或 ReviewCodeDetail
 *
 * @see product/features/dev-workbench/SDD.md §5
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, Clock, FileCode2, FileSearch2,
} from "lucide-react";
import type {
  ReviewItem, ReviewType, ReviewStatus, WorkbenchLaunchProps,
} from "../../types/dev-workbench";
import { MOCK_REVIEW_ITEMS } from "../../mock/mock-dev-workbench";
import { usePipelineDefinitions } from "../../hooks/use-pipeline-definitions";
import { usePipelineLauncher } from "../../hooks/use-pipeline-launcher";
import { PipelineLaunchDialog } from "../pipeline/pipeline-launch-dialog";
import type { PipelineDefinition } from "../../pipeline/types";
import { ReviewDesignDetail } from "./review-design-detail";
import { ReviewCodeDetail } from "./review-code-detail";

// ── 状态 Badge ──────────────────────────────────────────────────────────

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "pass") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-3 px-2 py-0.5 text-[10px] font-medium text-green-11">
        <CheckCircle2 size={9} />已通过
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-2 px-2 py-0.5 text-[10px] font-medium text-red-11">
        <XCircle size={9} />未通过
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-3 px-2 py-0.5 text-[10px] font-medium text-amber-11">
      <Clock size={9} />待评审
    </span>
  );
}

// ── 类型 Badge ──────────────────────────────────────────────────────────

function ReviewTypeBadge({ type }: { type: ReviewType }) {
  if (type === "design") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-purple-3 px-1.5 py-0.5 text-[10px] text-purple-11">
        <FileSearch2 size={9} />设计评审
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-2 px-1.5 py-0.5 text-[10px] text-blue-11">
      <FileCode2 size={9} />代码评审
    </span>
  );
}

// ── ReviewPanel 主组件 ─────────────────────────────────────────────────

export interface ReviewPanelProps {
  launchProps: WorkbenchLaunchProps;
}

export function ReviewPanel({ launchProps }: ReviewPanelProps) {
  const [items, setItems] = useState<ReviewItem[]>(MOCK_REVIEW_ITEMS);
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? "");
  const [toast, setToast] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Pipeline 启动（修复 Agent）
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

  // ── 更新单条评审项 ───────────────────────────────────────────────
  const updateSelected = (updater: (it: ReviewItem) => ReviewItem) => {
    if (!selectedItem) return;
    setItems((prev) => prev.map((r) => (r.id === selectedItem.id ? updater(r) : r)));
  };

  // ── 三类操作 ───────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleConfirmPass = () => {
    if (!selectedItem) return;
    updateSelected((it) => ({ ...it, status: "pass" }));
    showToast("已标记为通过");
  };

  const handleReject = () => {
    if (!selectedItem) return;
    const hasSummary = (selectedItem.summaryComment ?? "").trim().length > 0;
    if (!hasSummary) {
      showToast("请先在整单总评中填写驳回理由");
      return;
    }
    updateSelected((it) => ({ ...it, status: "fail" }));
    showToast("已驳回");
  };

  const handleLaunchFix = () => {
    if (!selectedItem) return;
    clearError();
    const def = productDevPipelines[0] ?? null;
    if (!def) {
      showToast("请先配置研发工坊流水线");
      return;
    }
    const goal = `修复评审问题：${selectedItem.title}`;
    if (def.inputs.length === 0) {
      void launch(def, goal, {});
    } else {
      setLaunchDialogDef(def);
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Toast */}
      {toast ? (
        <div className="absolute right-4 top-4 z-20 rounded-md bg-dls-accent px-3 py-1.5 text-[12px] text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {/* 左侧评审队列 */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-dls-border">
        <div className="border-b border-dls-border px-3 py-2">
          <span className="text-[12px] font-semibold text-dls-text">评审队列</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            const borderColor =
              item.status === "pass"
                ? "border-green-5"
                : item.status === "fail"
                ? "border-red-5"
                : "border-amber-5";
            const bgColor =
              item.status === "pass"
                ? "bg-green-1/50"
                : item.status === "fail"
                ? "bg-red-1/50"
                : "bg-amber-1/50";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-md border p-2 text-left transition-colors ${
                  isSelected
                    ? `${borderColor} ${bgColor}`
                    : "border-dls-border bg-dls-surface hover:bg-dls-hover/50"
                }`}
              >
                <div
                  className={`mb-1.5 text-[12px] font-medium leading-snug ${
                    isSelected ? "text-dls-text" : "text-dls-secondary"
                  }`}
                >
                  {item.title}
                </div>
                <div className="flex flex-wrap gap-1">
                  <ReviewTypeBadge type={item.type} />
                  <ReviewStatusBadge status={item.status} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧详情：按 type 分发 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedItem ? (
          selectedItem.type === "design" ? (
            <ReviewDesignDetail
              key={selectedItem.id}
              item={selectedItem}
              onUpdate={updateSelected}
              onConfirmPass={handleConfirmPass}
              onReject={handleReject}
              onLaunchFix={handleLaunchFix}
              launchingFix={launching}
              launchError={launchError}
            />
          ) : (
            <ReviewCodeDetail
              key={selectedItem.id}
              item={selectedItem}
              onUpdate={updateSelected}
              onConfirmPass={handleConfirmPass}
              onReject={handleReject}
              onLaunchFix={handleLaunchFix}
              launchingFix={launching}
              launchError={launchError}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
            选择左侧评审项查看详情
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
