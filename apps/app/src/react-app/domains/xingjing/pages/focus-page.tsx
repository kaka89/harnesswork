/** @jsxImportSource react */
import { useState, useCallback } from "react";
import { RefreshCw, Zap } from "lucide-react";
import type { FocusTask, AiReport } from "../types/focus";
import {
  MOCK_TASKS,
  MOCK_REPORTS,
  MOCK_BRIEFING,
} from "../mock/mock-focus-data";
import { AiBriefingBanner } from "../components/focus/ai-briefing-banner";
import { AiReportsPanel } from "../components/focus/ai-reports-panel";
import { KanbanBoard } from "../components/focus/kanban-board";
import { FocusDetailPanel } from "../components/focus/focus-detail-panel";
import { AllReportsPage } from "../components/focus/all-reports-page";
import { AllBriefingPage } from "../components/focus/all-briefing-page";

// ── 类型 ──────────────────────────────────────────────────────────────────────

type XingjingNavSection =
  | "cockpit"
  | "focus"
  | "product-insight"
  | "product-dev"
  | "release"
  | "data-review"
  | "knowledge"
  | "ai-partner"
  | "settings";

export interface FocusPageProps {
  onNavigate?: (section: XingjingNavSection) => void;
}

// ── 日期格式化 ────────────────────────────────────────────────────────────────

function formatToday(): string {
  const d = new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDay = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${month}月${day}日 星期${weekDay}`;
}

// ── Action → Section 映射 ────────────────────────────────────────────────────

const ACTION_TO_SECTION: Record<string, XingjingNavSection> = {
  cockpit: "cockpit",
  "product-insight": "product-insight",
  "product-dev": "product-dev",
  knowledge: "knowledge",
  "ai-partner": "ai-partner",
};

// ── FocusPage 主组件 ──────────────────────────────────────────────────────────

export function FocusPage({ onNavigate }: FocusPageProps) {
  const [tasks, setTasks] = useState<FocusTask[]>(MOCK_TASKS);
  const [reports] = useState<AiReport[]>(MOCK_REPORTS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTaskId,   setSelectedTaskId]   = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showAllReports,   setShowAllReports]   = useState(false);
  const [showAllBriefing,  setShowAllBriefing]  = useState(false);

  const selectedTask   = tasks.find((t) => t.id === selectedTaskId)   ?? null;
  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;

  // 刷新：重置为 mock 初始数据
  const handleRefresh = useCallback(() => {
    setTasks([...MOCK_TASKS]);
    setRefreshKey((k) => k + 1);
    setSelectedTaskId(null);
    setSelectedReportId(null);
  }, []);

  // 简报 action 跳转
  const handleBriefingAction = useCallback(
    (action: string) => {
      const section = ACTION_TO_SECTION[action];
      if (section && onNavigate) {
        onNavigate(section);
      }
    },
    [onNavigate],
  );

  // 任务更新
  const handleUpdateTask = useCallback(
    (updated: FocusTask) => {
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    },
    [],
  );

  // 关闭详情面板
  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedReportId(null);
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-[#f7f8fa]">
      {/* ── 左侧：头部 + 主体内容 ────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* ── 顶部栏 ──────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-orange-500" />
          <span className="text-[15px] font-semibold text-dls-text">
            今日焦点
          </span>
        </div>

        {/* 日期 */}
        <span className="text-xs text-dls-secondary">
          {formatToday()}
        </span>

        <div className="flex-1" />

        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={handleRefresh}
          title="重置数据"
          className="rounded-lg p-1.5 transition-colors text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      {/* ── 主体内容区 ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* 上半区：AI 简报（左60%）+ AI 搭档报告（右40%）并排 */}
        <div
          key={`top-${refreshKey}`}
          className="grid shrink-0 gap-3 overflow-hidden"
          style={{ gridTemplateColumns: "3fr 2fr", height: "280px" }}
        >
          {/* 左：AI 今日简报 */}
          <div className="min-w-0 overflow-hidden" style={{ height: "100%" }}>
            <AiBriefingBanner
              briefing={MOCK_BRIEFING}
              onAction={handleBriefingAction}
              onViewAll={() => setShowAllBriefing(true)}
            />
          </div>

          {/* 右：AI 搭档报告 */}
          <div className="min-w-0 overflow-hidden" style={{ height: "100%" }}>
            <AiReportsPanel
              reports={reports}
              onSelectReport={(id) => { setSelectedReportId(id); setSelectedTaskId(null); }}
              onViewAllReports={() => setShowAllReports(true)}
            />
          </div>
        </div>

        {/* 下半区：任务看板（全宽） */}
        <div className="min-h-0 flex-1">
          <KanbanBoard
            tasks={tasks}
            onTasksChange={setTasks}
            onSelectTask={(id) => { setSelectedTaskId(id); setSelectedReportId(null); }}
          />
        </div>
      </div>
      </div>

      {/* ── 右侧：详情面板 */}
      {(selectedTask || selectedReport) && (
        <FocusDetailPanel
          task={selectedTask}
          report={selectedReport}
          onClose={handleClosePanel}
          onUpdateTask={handleUpdateTask}
          onNavigate={(section) => onNavigate?.(section as XingjingNavSection)}
        />
      )}

      {/* ── 全部报告覆盖层 */}
      {showAllReports && (
        <div className="absolute inset-0 z-50 flex flex-col overflow-hidden">
          <AllReportsPage
            reports={reports}
            onBack={() => setShowAllReports(false)}
            onSelectReport={(id) => setSelectedReportId(id)}
            selectedReportId={selectedReportId}
          />
        </div>
      )}

      {/* ── 全部简报覆盖层 */}
      {showAllBriefing && (
        <div className="absolute inset-0 z-50 flex flex-col overflow-hidden">
          <AllBriefingPage
            briefing={MOCK_BRIEFING}
            onBack={() => setShowAllBriefing(false)}
            onAction={handleBriefingAction}
          />
        </div>
      )}
    </div>
  );
}
