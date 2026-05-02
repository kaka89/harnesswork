/**
 * 研发工作台（Dev Workbench）数据类型定义
 *
 * 设计依据：product/features/dev-workbench/SDD.md §6
 */
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";

// ── Tab ID ─────────────────────────────────────────────────────────────────

export type DevWorkbenchTabId = "arch-design" | "dev-execution" | "review";

// ── 启动 Props（共享给各 Panel）───────────────────────────────────────────────────────

/** Pipeline 启动所需的公共 Props，共享给各工作台 Panel。 */
export interface WorkbenchLaunchProps {
  openworkServerClient: OpenworkServerClient | null;
  workspaceId: string | null;
  opencodeBaseUrl: string;
  token: string;
  workspacePath?: string;
  onNavigateToSettings: () => void;
  onSessionCreated: (sessionId: string) => void;
}

// ── Tab 1: 架构设计（ArchDesign）─────────────────────────────────────────────

export type DevDesignTaskStatus = "in-progress" | "pending" | "done";

export interface DesignOutputArtifact {
  /** 文件名，如 "系统架构图.md" */
  name: string;
  status: "done" | "generating" | "pending";
}

export interface DevDesignTask {
  id: string;
  /** 任务标题，如 "PRD-005 用户认证模块" */
  title: string;
  status: DevDesignTaskStatus;
  /** 关联需求文档名列表，如 ["PRD-005.md", "技术约束.md"] */
  prdRefs: string[];
  outputArtifacts: DesignOutputArtifact[];
  agentRunning: boolean;
  createdAt: string;
}

// ── Tab 2: 开发执行（DevExecution）──────────────────────────────────────────

export type DevExecStatus = "running" | "pending" | "done" | "blocked";

export interface DevExecNode {
  label: string;
  status: "pending" | "in-progress" | "done";
}

export interface DevExecutionTask {
  id: string;
  title: string;
  status: DevExecStatus;
  /** 执行进度 0-100 */
  progress: number;
  pipelineId?: string;
  nodes: DevExecNode[];
  /** status=done 时可选 */
  prLink?: string;
  /** status=blocked 时说明 */
  blockedReason?: string;
}

// ── Tab 3: 成果评审（Review）────────────────────────────────────────────────

export type ReviewType = "design" | "code";
export type ReviewStatus = "pending" | "pass" | "fail";

/** AI Review 发现严重度 */
export type FindingSeverity = "high" | "medium" | "low";

/** AI Review 发现条目 */
export interface AiReviewFinding {
  id: string;
  severity: FindingSeverity;
  /** 分类，如 "错误处理" / "命名规范" / "测试覆盖" */
  category: string;
  description: string;
  /** 代码评审：定位文件 */
  file?: string;
  /** 代码评审：行号（基于新文件侧 1-based） */
  line?: number;
}

/** 架构评审的段落级人工批注 */
export interface DesignAnnotation {
  id: string;
  /** 绑定段落 anchor，如 "block-0" / "block-3" */
  anchor: string;
  content: string;
  resolved: boolean;
  createdAt: string;
}

/** 代码评审的行级人工评论 */
export interface CodeLineComment {
  id: string;
  file: string;
  /** 1-based 行号 */
  line: number;
  /** left=原文件（删除侧）, right=新文件（新增侧） */
  side: "left" | "right";
  content: string;
  resolved: boolean;
  createdAt: string;
}

/** 代码评审的 diff 文件（每文件一份原文/新文完整内容） */
export interface CodeDiffFile {
  file: string;
  oldContent: string;
  newContent: string;
}

export interface ReviewItem {
  id: string;
  title: string;
  type: ReviewType;
  status: ReviewStatus;
  /** 执行评审的 reviewer agent 名，如 "code-quality-reviewer" */
  reviewer: string;
  /** AI Review 发现列表 */
  findings: AiReviewFinding[];

  /** 架构评审：Markdown 文档 */
  designDoc?: { markdown: string };
  /** 架构评审：段落级人工批注 */
  designAnnotations?: DesignAnnotation[];

  /** 代码评审：diff 文件列表（支持多文件） */
  codeDiffFiles?: CodeDiffFile[];
  /** 代码评审：行级人工评论 */
  lineComments?: CodeLineComment[];

  /** 整单人工总评（驳回理由、通过说明） */
  summaryComment?: string;
}
