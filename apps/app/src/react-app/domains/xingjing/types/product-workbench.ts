import type { Dispatch, SetStateAction } from "react";
import type { XingjingAgentView } from "../types";

// ── Tab id ──────────────────────────────────────────────────────────
export type WorkbenchTabId =
  | "planning"
  | "competitor"
  | "market-insight"
  | "requirement-writer"
  | "requirement-search";

// ── Planning ───────────────────────────────────────────────────────
export type GoalStatus = "planning" | "active" | "at-risk" | "done";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface ProductGoal {
  id: string;
  title: string;
  quarter: Quarter;
  status: GoalStatus;
  /** 0~100 */
  progress: number;
  owner: { name: string; avatar?: string };
  /** 指向 RequirementIndexItem.id 的数组 */
  linkedRequirementIds: string[];
  summary: string;
}

// ── Competitor ─────────────────────────────────────────────────────
export type CompetitorTagTone = "blue" | "purple" | "green" | "amber";

export interface CompetitorTag {
  label: string;
  tone: CompetitorTagTone;
}

export interface CompetitorUpdate {
  date: string;
  title: string;
  source?: string;
}

export interface Competitor {
  id: string;
  name: string;
  logoEmoji?: string;
  website?: string;
  positioning: string;
  tags: CompetitorTag[];
  updates: CompetitorUpdate[];
  addedAt: string;
}

// ── Market Insight ─────────────────────────────────────────────────
export type InsightCategory =
  | "industry-trend"
  | "user-voice"
  | "pricing"
  | "regulation";

export interface MarketInsight {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: InsightCategory;
  source: string;
  publishedAt: string;
  pinned?: boolean;
}

// ── Requirement Draft（需求编写）─────────────────────────────────
export type DraftStatus = "draft" | "reviewing" | "locked";

export interface RequirementDraft {
  id: string;
  title: string;
  content: string;
  status: DraftStatus;
  updatedAt: string;
  /** 若由市场洞察归档而来 */
  fromInsightId?: string;
}

// ── Requirement Index（需求检索）─────────────────────────────────
export type RequirementStatus = "draft" | "reviewing" | "approved" | "released";

export interface RequirementIndexItem {
  id: string;
  title: string;
  status: RequirementStatus;
  owner: string;
  tags: string[];
  updatedAt: string;
  summary: string;
  content: string;
}

// ── Skill 注册项 ──────────────────────────────────────────────────
export interface SkillAction {
  slug: string;
  label: string;
  description?: string;
}

// ── Toast ─────────────────────────────────────────────────────────
export type ToastKind = "info" | "success" | "error";

// ── 各 Panel 共享的上下文（从页面透传） ───────────────────────────
export interface PanelContext {
  /**
   * 外层 relative 容器的 DOM 节点引用。
   * 各 Panel 使用 createPortal 将抽屉/Modal 渲染进此容器，
   * 避免 fixed 定位遮挡导航侧边栏。
   */
  overlayRoot: HTMLElement | null;
  /** 可用的 AI 搭档列表（由 useAgents 提供，可能为空）*/
  agents: XingjingAgentView[];
  /**
   * 调用指定搭档；本迭代 mock，~1800ms 后 resolve 回复文本。
   * 约 5% 概率 reject 模拟失败。
   */
  onAgentInvoke: (agentName: string, intent: string) => Promise<string>;
  /**
   * 触发 pipeline。若 slug 在真实 PipelineDefinition 中命中，走 usePipelineLauncher；
   * 否则 setTimeout(2000) 模拟并 resolve(true)。
   */
  onPipelineLaunch: (
    slug: string,
    inputs?: Record<string, string>,
  ) => Promise<boolean>;
  /** 通知 */
  toast: (msg: string, kind?: ToastKind) => void;
  /** 返回 AI 回复模板（按 Tab kind）*/
  getAgentReplyTemplate: (
    kind: "default" | "planning" | "requirement",
    intent: string,
  ) => string;
}

// ── 各 Panel 的 Props ───────────────────────────────────────────
export interface PlanningPanelProps extends PanelContext {
  goals: ProductGoal[];
  setGoals: Dispatch<SetStateAction<ProductGoal[]>>;
  requirementIndex: RequirementIndexItem[];
  onOpenRequirement: (id: string) => void;
  skills: SkillAction[];
}

export interface CompetitorPanelProps extends PanelContext {
  items: Competitor[];
  setItems: Dispatch<SetStateAction<Competitor[]>>;
  onArchiveToInsight: (insight: MarketInsight) => void;
  skills: SkillAction[];
}

export interface MarketInsightPanelProps extends PanelContext {
  insights: MarketInsight[];
  setInsights: Dispatch<SetStateAction<MarketInsight[]>>;
  onArchiveToDraft: (insight: MarketInsight) => void;
  skills: SkillAction[];
}

export interface RequirementWriterPanelProps extends PanelContext {
  drafts: RequirementDraft[];
  setDrafts: Dispatch<SetStateAction<RequirementDraft[]>>;
  /** 跨 Panel 联动：归档洞察后预选中的草稿 id */
  preselectDraftId?: string | null;
  skills: SkillAction[];
}

export interface RequirementSearchPanelProps extends PanelContext {
  items: RequirementIndexItem[];
  /** 跨 Panel 联动：从 Planning 跳转过来时预选中的需求 id */
  preselectId?: string | null;
  skills: SkillAction[];
  /** 当前打开的需求详情 id（由父级 ProductWorkbenchPage 管理） */
  detailId: string | null;
  /** 通知父级打开/关闭需求详情 */
  onDetailChange: (id: string | null) => void;
}
