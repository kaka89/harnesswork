/** @jsxImportSource react */
/**
 * 研发工作台主页面
 *
 * 功能：组装 Tab 导航栏 + 三个 Panel，管理 activeTab 状态。
 * 设计依据：product/features/dev-workbench/SDD.md §3
 */
import { useState } from "react";
import type { DevWorkbenchTabId, WorkbenchLaunchProps } from "../types/dev-workbench";
import { MOCK_DESIGN_TASKS, MOCK_DEV_TASKS, MOCK_REVIEW_ITEMS } from "../mock/mock-dev-workbench";
import { DevWorkbenchTabs } from "../components/dev-workbench/dev-workbench-tabs";
import { ArchDesignPanel } from "../components/dev-workbench/arch-design-panel";
import { DevExecutionPanel } from "../components/dev-workbench/dev-execution-panel";
import { ReviewPanel } from "../components/dev-workbench/review-panel";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DevWorkbenchPageProps {
  launchProps: WorkbenchLaunchProps;
  onGoToCockpit: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DevWorkbenchPage({ launchProps, onGoToCockpit }: DevWorkbenchPageProps) {
  const [activeTab, setActiveTab] = useState<DevWorkbenchTabId>("arch-design");

  // Tab 徽标数量（基于 Mock 数据中"待处理/进行中"条目）
  const counts: Record<DevWorkbenchTabId, number> = {
    "arch-design":   MOCK_DESIGN_TASKS.filter((t) => t.status !== "done").length,
    "dev-execution": MOCK_DEV_TASKS.filter((t) => t.status === "running" || t.status === "blocked").length,
    "review":        MOCK_REVIEW_ITEMS.filter((r) => r.status === "pending" || r.status === "fail").length,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab 导航栏 */}
      <DevWorkbenchTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={counts}
      />

      {/* Tab 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "arch-design" && (
          <ArchDesignPanel launchProps={launchProps} />
        )}
        {activeTab === "dev-execution" && (
          <DevExecutionPanel onGoToCockpit={onGoToCockpit} />
        )}
        {activeTab === "review" && (
          <ReviewPanel launchProps={launchProps} />
        )}
      </div>
    </div>
  );
}
