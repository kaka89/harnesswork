// ── 今日焦点 — 数据类型定义 ──────────────────────────────────────────────────

/**
 * 任务状态（7 种，与敏捷看板对齐）
 * backlog     → 待办：尚未安排，存入待办池
 * todo        → 计划：已计划，准备执行
 * in_progress → 进行中：正在处理
 * in_review   → 评审中：等待评审/验证
 * done        → 已完成：已完成
 * blocked     → 已阻塞：被阻塞，需外部解除
 * cancelled   → 已取消：不再处理
 */
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

/**
 * 任务优先级（4 级）
 * urgent    → 紧急（红色）
 * important → 重要（橙色）
 * normal    → 普通（黄色）
 * low       → 低优（灰色）
 */
export type TaskPriority = "urgent" | "important" | "normal" | "low";

/** 任务来源（谁提交的需求） */
export type TaskSource = "product" | "dev" | "growth" | "ops";

/** AI 报告类型 */
export type AiReportType =
  | "competitive-analysis"
  | "user-feedback"
  | "market-trend"
  | "custom";

// ── 核心数据结构 ──────────────────────────────────────────────────────────────

/** 任务活动记录（用于详情面板时间轴） */
export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: "created" | "status_change" | "priority_change" | "edited" | "comment";
  content: string;
}

/** 看板任务 */
export interface FocusTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  /** 用户可编辑 */
  priority: TaskPriority;
  /** 用户自定义标签，如 ["后端", "用户体验"] */
  tags: string[];
  source: TaskSource;
  /** 链接到原始 feature/PRD 路径 */
  sourceRef?: string;
  /** 截止时间展示标签，如 "3h" / "2d" / "本周" */
  dueLabel?: string;
  createdAt: string;
  completedAt?: string;
  /** 活动记录（详情面板时间轴） */
  activity?: ActivityEntry[];
}

/** AI 搭档生成的报告 */
export interface AiReport {
  id: string;
  /** 哪个 AI 搭档生成 */
  agentName: string;
  /** emoji 图标 */
  agentIcon: string;
  reportType: AiReportType;
  title: string;
  /** 摘要（≤ 120 字） */
  summary: string;
  generatedAt: string;
  status: "new" | "read" | "important";
  /** 跳转到 session 查看完整报告 */
  sessionId?: string;
  /** 关键发现（详情面板展示） */
  keyFindings?: string[];
  /** 建议行动（详情面板展示） */
  recommendations?: string[];
}

/** AI 简报中单条焦点项 */
export interface FocusBriefingItem {
  id: string;
  title: string;
  priority: TaskPriority;
  /** 优先级原因说明 */
  reason: string;
  /** 跳转到哪个 section，如 "cockpit" / "product-insight" */
  action?: string;
}

/** AI 今日简报（整体） */
export interface FocusBriefing {
  summary: string;
  items: FocusBriefingItem[];
}
