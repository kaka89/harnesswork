/** @jsxImportSource react */
import { useState, useRef, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import type { FocusTask, TaskPriority, TaskSource, TaskStatus } from "../../types/focus";

// ── 状态列配置 ────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; dot: string; columnBg: string; dragBg: string }
> = {
  backlog:     { label: "待办",   dot: "#d9d9d9", columnBg: "#f6f7f9", dragBg: "#e8e8e8" },
  todo:        { label: "计划",   dot: "#faad14", columnBg: "#fafafa", dragBg: "#e8e8e8" },
  in_progress: { label: "进行中", dot: "#1677ff", columnBg: "#fef9ed", dragBg: "#fde68a" },
  in_review:   { label: "评审中", dot: "#13c2c2", columnBg: "#eef8f1", dragBg: "#bbf7d0" },
  done:        { label: "已完成", dot: "#52c41a", columnBg: "#eef4fb", dragBg: "#bfdbfe" },
  blocked:     { label: "已阻塞", dot: "#ff4d4f", columnBg: "#fbeeef", dragBg: "#fecaca" },
  cancelled:   { label: "已取消", dot: "#bfbfbf", columnBg: "#f6f6f6", dragBg: "#e5e7eb" },
};

// ── 来源标签配置 ──────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<TaskSource, { label: string; bg: string; color: string }> = {
  dev:     { label: "开发", bg: "#e6f4ff", color: "#1677ff" },
  product: { label: "产品", bg: "#f9f0ff", color: "#722ed1" },
  growth:  { label: "增长", bg: "#f6ffed", color: "#389e0d" },
  ops:     { label: "运维", bg: "#fff7e6", color: "#d46b08" },
};

// ── 优先级 ────────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "紧急", important: "重要", normal: "普通", low: "低优",
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0, important: 1, normal: 2, low: 3,
};

// ── 视图筛选 ──────────────────────────────────────────────────────────────────

type ViewMode = "active" | "all" | "blocked" | "cancelled";

const ALL_STATUSES: TaskStatus[]    = ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"];
const ACTIVE_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review"];

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "active",    label: "活跃" },
  { key: "all",       label: "全部" },
  { key: "blocked",   label: "已阻塞" },
  { key: "cancelled", label: "已取消" },
];

function getVisibleStatuses(view: ViewMode): TaskStatus[] {
  if (view === "active")    return ACTIVE_STATUSES;
  if (view === "blocked")   return ["blocked"];
  if (view === "cancelled") return ["cancelled"];
  return ALL_STATUSES;
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  isDone,
  onSelect,
  onPointerDown,
}: {
  task:          FocusTask;
  isDone:        boolean;
  onSelect:      (id: string) => void;
  onPointerDown: (id: string, x: number, y: number) => void;
}) {
  const srcCfg = SOURCE_CONFIG[task.source];

  return (
    <div
      data-task-id={task.id}
      onMouseDown={(e) => {
        e.stopPropagation();
        onPointerDown(task.id, e.clientX, e.clientY);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(task.id);
      }}
      style={{
        background:   "#fff",
        borderRadius: "8px",
        padding:      "10px 12px",
        cursor:       "grab",
        userSelect:   "none",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.07)",
        outline:      "1px solid rgba(0,0,0,0.04)",
        transition:   "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.07)"; }}
    >
      {/* 标题 */}
      <div style={{
        fontSize:       "12.5px",
        fontWeight:     500,
        color:          isDone ? "#999" : "#1a1a1a",
        textDecoration: isDone ? "line-through" : "none",
        lineHeight:     1.4,
        marginBottom:   "6px",
      }}>
        {task.title}
      </div>

      {/* 标签行 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
        <span style={{
          background: srcCfg.bg, color: srcCfg.color,
          fontSize: "10px", padding: "0 5px", lineHeight: "16px", borderRadius: "4px", fontWeight: 500,
        }}>
          {srcCfg.label}
        </span>
        {task.tags.map((tag) => (
          <span key={tag} style={{
            background: "#f3f4f6", color: "#555",
            fontSize: "10px", padding: "0 5px", lineHeight: "16px", borderRadius: "4px",
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* 底部：优先级 + 截止 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: "#888" }}>{PRIORITY_LABEL[task.priority]}</span>
        {task.dueLabel && <span style={{ color: "#aaa" }}>{task.dueLabel}</span>}
      </div>
    </div>
  );
}

// ── KanbanColumn ──────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  isOver,
  onSelect,
  onCardMouseDown,
  onAddTask,
}: {
  status:          TaskStatus;
  tasks:           FocusTask[];
  isOver:          boolean;
  onSelect:        (id: string) => void;
  onCardMouseDown: (id: string, x: number, y: number) => void;
  onAddTask:       (status: TaskStatus) => void;
}) {
  const cfg    = STATUS_CONFIG[status];
  const isDone = status === "done";

  return (
    <div
      data-kanban-status={status}
      style={{
        minWidth:      0,
        display:       "flex",
        flexDirection: "column",
        borderRadius:  "10px",
        padding:       "10px",
        background:    isOver ? cfg.dragBg : cfg.columnBg,
        outline:       isOver ? "2px solid #93c5fd" : "none",
        transition:    "background 0.15s",
      }}
    >
      {/* 列标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", padding: "0 2px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#444" }}>{cfg.label}</span>
        <span style={{
          background: "#e5e7eb", color: "#666",
          fontSize: "10px", padding: "0 5px", lineHeight: "16px", borderRadius: "4px", fontWeight: 500,
        }}>
          {tasks.length}
        </span>
      </div>

      {/* 任务卡片列表区域 — 也携带 data-kanban-status 方便 elementsFromPoint 识别 */}
      <div
        data-kanban-status={status}
        style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 0%", minHeight: "48px" }}
      >
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            isDone={isDone}
            onSelect={onSelect}
            onPointerDown={onCardMouseDown}
          />
        ))}
      </div>

      {/* 添加任务 */}
      <button
        type="button"
        onClick={() => onAddTask(status)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            "4px",
          marginTop:      "8px",
          width:          "100%",
          background:     "none",
          border:         "1px dashed #d9d9d9",
          borderRadius:   "6px",
          padding:        "5px 0",
          fontSize:       "11px",
          color:          "#aaa",
          cursor:         "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "#555";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#aaa";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "#aaa";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#d9d9d9";
        }}
      >
        <Plus size={11} />
        添加任务
      </button>
    </div>
  );
}

// ── 拖拽幽灵卡片工具函数 ──────────────────────────────────────────────────────

function createGhostEl(title: string, srcLabel: string, srcColor: string, srcBg: string): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.style.cssText = [
    "position:fixed",
    "pointer-events:none",
    "z-index:9999",
    "background:#fff",
    "border-radius:8px",
    "padding:10px 12px",
    "box-shadow:0 8px 28px rgba(0,0,0,0.18)",
    "width:180px",
    "opacity:0.92",
    "transform:rotate(2deg) scale(1.03)",
    "transition:none",
    "font-family:inherit",
  ].join(";");

  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size:12.5px;font-weight:500;color:#1a1a1a;margin-bottom:6px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical";
  titleEl.textContent = title;

  const badge = document.createElement("span");
  badge.style.cssText = `background:${srcBg};color:${srcColor};font-size:10px;padding:0 5px;line-height:16px;border-radius:4px;font-weight:500`;
  badge.textContent = srcLabel;

  ghost.appendChild(titleEl);
  ghost.appendChild(badge);
  return ghost;
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  tasks:         FocusTask[];
  onTasksChange: (tasks: FocusTask[]) => void;
  onSelectTask?: (taskId: string) => void;
}

export function KanbanBoard({ tasks, onTasksChange, onSelectTask }: KanbanBoardProps) {
  const [view,           setView]           = useState<ViewMode>("all");
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  // 拖拽状态（用 ref 避免闭包陈旧值问题）
  const dragTaskId    = useRef<string | null>(null);
  const dragStartPos  = useRef<{ x: number; y: number } | null>(null);
  const isDragging    = useRef(false);
  const tasksRef      = useRef(tasks);
  tasksRef.current    = tasks;

  // 幽灵卡片
  const ghostRef      = useRef<HTMLDivElement | null>(null);
  // 拖拽后防止 click 触发详情面板
  const clickGuard    = useRef(false);

  // 基于 mousedown/mousemove/mouseup 的拖拽（绕过 Tauri WKWebView 拦截 HTML5 drag 问题）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragTaskId.current || !dragStartPos.current) return;

      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;

      // 5px 阈值区分点击与拖拽
      if (!isDragging.current && Math.hypot(dx, dy) < 5) return;

      if (!isDragging.current) {
        // 第一次超过阈值：创建幽灵卡片
        isDragging.current = true;
        document.body.style.cursor = "grabbing";

        const task = tasksRef.current.find((t) => t.id === dragTaskId.current);
        if (task) {
          const src = SOURCE_CONFIG[task.source];
          const ghost = createGhostEl(task.title, src.label, src.color, src.bg);
          ghost.style.left = `${e.clientX + 14}px`;
          ghost.style.top  = `${e.clientY - 14}px`;
          document.body.appendChild(ghost);
          ghostRef.current = ghost;
        }
      } else if (ghostRef.current) {
        // 幽灵卡片跟随鼠标
        ghostRef.current.style.left = `${e.clientX + 14}px`;
        ghostRef.current.style.top  = `${e.clientY - 14}px`;
      }

      // 识别目标列（先隐藏幽灵避免自遮）
      if (ghostRef.current) ghostRef.current.style.display = "none";
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      if (ghostRef.current) ghostRef.current.style.display = "";

      const col = els.find(
        (el) => el instanceof HTMLElement && (el as HTMLElement).dataset.kanbanStatus,
      ) as HTMLElement | undefined;
      setDragOverStatus((col?.dataset.kanbanStatus as TaskStatus) ?? null);
    };

    const onUp = (e: MouseEvent) => {
      if (!dragTaskId.current) return;

      const taskId        = dragTaskId.current;
      const wasActualDrag = isDragging.current;

      // 清理拖拽状态
      dragTaskId.current   = null;
      dragStartPos.current = null;
      isDragging.current   = false;
      document.body.style.cursor = "";
      setDragOverStatus(null);

      // 移除幽灵
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current);
        ghostRef.current = null;
      }

      if (!wasActualDrag) return;

      // 防止松手后 click 事件触发打开详情面板
      clickGuard.current = true;
      setTimeout(() => { clickGuard.current = false; }, 150);

      // 识别目标列
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const col = els.find(
        (el) => el instanceof HTMLElement && (el as HTMLElement).dataset.kanbanStatus,
      ) as HTMLElement | undefined;
      const targetStatus = col?.dataset.kanbanStatus as TaskStatus | undefined;

      if (targetStatus) {
        onTasksChange(
          tasksRef.current.map((t) =>
            t.id === taskId ? { ...t, status: targetStatus } : t,
          ),
        );
      }
    };

    // 拖拽超出窗口时也要清理
    const onLeave = () => {
      if (!isDragging.current) return;
      dragTaskId.current   = null;
      dragStartPos.current = null;
      isDragging.current   = false;
      document.body.style.cursor = "";
      setDragOverStatus(null);
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current);
        ghostRef.current = null;
      }
    };

    document.addEventListener("mousemove",  onMove);
    document.addEventListener("mouseup",    onUp);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove",  onMove);
      document.removeEventListener("mouseup",    onUp);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [onTasksChange]);

  const handleCardMouseDown = useCallback((id: string, x: number, y: number) => {
    dragTaskId.current   = id;
    dragStartPos.current = { x, y };
    isDragging.current   = false;
  }, []);

  const handleCardSelect = useCallback((id: string) => {
    if (clickGuard.current) return; // 拖拽结束后忽略 click
    onSelectTask?.(id);
  }, [onSelectTask]);

  // 新建任务
  const handleAddTask = useCallback((status: TaskStatus) => {
    const newTask: FocusTask = {
      id:          `task-${Date.now()}`,
      title:       "新任务",
      status,
      priority:    "normal",
      source:      "dev",
      tags:        [],
      description: "",
      createdAt:   new Date().toISOString(),
    };
    onTasksChange([...tasksRef.current, newTask]);
  }, [onTasksChange]);

  const visibleStatuses = getVisibleStatuses(view);
  const grouped = visibleStatuses.reduce<Record<string, FocusTask[]>>((acc, s) => {
    acc[s] = tasks
      .filter((t) => t.status === s)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return acc;
  }, {});
  const colCount = visibleStatuses.length;

  return (
    <div style={{
      height:        "100%",
      display:       "flex",
      flexDirection: "column",
      background:    "#fff",
      border:        "1px solid #e5e7eb",
      borderRadius:  "12px",
      overflow:      "hidden",
    }}>
      {/* 头部：标题 + Tabs */}
      <div style={{ padding: "12px 20px 0", flexShrink: 0, borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>任务看板</span>
          <span style={{ fontSize: "12px", color: "#888" }}>
            {tasks.filter((t) => t.status === "done").length}/{tasks.length} 完成
          </span>
        </div>

        <div style={{ display: "flex", gap: "2px" }}>
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              style={{
                fontSize:     "12px",
                fontWeight:   view === tab.key ? 600 : 400,
                color:        view === tab.key ? "#1677ff" : "#888",
                background:   "none",
                border:       "none",
                borderBottom: view === tab.key ? "2px solid #1677ff" : "2px solid transparent",
                padding:      "4px 10px",
                cursor:       "pointer",
                marginBottom: "-1px",
                transition:   "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 看板列区域 */}
      <div
        style={{
          flex:                "1 1 0%",
          overflowX:           "auto",
          overflowY:           "hidden",
          padding:             "12px 16px",
          display:             "grid",
          gridTemplateColumns: `repeat(${colCount}, minmax(180px, 1fr))`,
          gap:                 "10px",
          alignItems:          "start",
        }}
      >
        {visibleStatuses.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            tasks={grouped[s] ?? []}
            isOver={dragOverStatus === s}
            onSelect={handleCardSelect}
            onCardMouseDown={handleCardMouseDown}
            onAddTask={handleAddTask}
          />
        ))}
      </div>
    </div>
  );
}
