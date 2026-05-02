/**
 * 星静流水线（Pipeline）类型定义
 *
 * 设计依据：
 * - product/features/xingjing-pipeline/SDD.md §3 数据模型
 * - product/features/xingjing-pipeline/PRD.md
 *
 * 核心数据流：
 *   PipelineDefinition --(compiler.ts)--> OpenCode agent + slash command
 *   用户在 Composer 触发 --> session 执行 --> SSE 事件回流
 *   Supervisor 以 PipelineLaunchContext 为对账锚点
 */

// ── 节点类型 ─────────────────────────────────────────────────────────────────

/**
 * Pipeline 节点种类。
 *
 * - `agent`:          派发 `@agent-name` 子 session，由子 session 产出 node-<N>.md
 * - `skill`:          将 skill 内容作为 user message 注入，assistant 回复落 node-<N>.md
 * - `review`:         双阶段评审（默认 spec-reviewer + code-quality-reviewer）
 * - `human_approval`: 暂停等待用户勾选 Todo (`Awaiting approval: <label>`)
 * - `branch`:         条件分支，按 `branchCondition` 表达式结果路由到后续节点
 */
export type PipelineNodeKind =
  | "agent"
  | "skill"
  | "review"
  | "human_approval"
  | "branch";

/**
 * 节点失败策略。
 *
 * - `abort`: 立即终止整条流水线
 * - `retry`: 由编排 agent 重试（编译期注入默认最多 1 次）
 * - `skip`:  仅适用于非关键节点，跳过后续走下一节点
 */
export type PipelineNodeFailStrategy = "abort" | "retry" | "skip";

/**
 * 单个流水线节点。
 *
 * `prompt` 中可使用以下占位符（由 compiler + launcher 共用 renderPrompt 处理）：
 * - `{{goal}}`          → PipelineLaunchContext.goal
 * - `{{inputs.<key>}}`  → PipelineLaunchContext.inputValues[key] ?? field.default
 * - `{{attachments}}`   → `@path1 @path2` 拼接
 * - `{{knowledge}}`     → 星静知识库条目标题+摘要
 * - `{{prev.output}}`   → 上一节点 `node-<N-1>.md` 路径（首节点为空）
 */
export interface PipelineNode {
  /** 稳定 uuid，作为 `node-<N>.md` 文件前缀与 Todo id（`pipeline-<pipelineId>:node-<id>`）锚点 */
  id: string;
  kind: PipelineNodeKind;
  /** 节点显示名，如「需求分析」「用例评审」 */
  label: string;
  /** agent 名 / skill 名 / review 时使用；kind=branch / human_approval 留空 */
  ref?: string;
  /** 给子 agent 的指令模板（见 docstring 顶部占位符说明） */
  prompt?: string;
  /** 失败策略，缺省视为 "abort" */
  onFail?: PipelineNodeFailStrategy;
  /** true 则与「紧邻的前一节点」作为同一 parallel 组并发执行；首节点忽略 */
  parallel?: boolean;
  /** kind=branch 时必填：条件表达式字符串，编排 agent 按结果路由 */
  branchCondition?: string;
  /** kind=branch 时使用：表达式为真/假时跳转到的目标 node id */
  branchTrueTargetId?: string;
  branchFalseTargetId?: string;
  /** kind=review 时使用：指定 reviewer agent 列表；缺省 spec-reviewer + code-quality-reviewer */
  reviewers?: string[];
  /** kind=human_approval 时使用：审批提示文本，默认沿用 label */
  approvalPrompt?: string;
  /** 单节点超时（分钟），用于 Supervisor 监控；缺省 10 */
  timeoutMinutes?: number;
}

// ── 作用域 ───────────────────────────────────────────────────────────────────

/**
 * Pipeline 作用域，与 xingjing-session-page 二级菜单 section 对齐。
 *
 * 设置 scope 的作用：
 * 1. `PipelineTriggerBar` 在对应 section 顶部自动展示该 scope 的默认 pipeline
 * 2. `PipelineLauncherMenu`（SessionHeader ⚡按钮）按 scope 分组
 * 3. 一个 scope 最多一条 `isDefault=true` 的 pipeline
 * 4. `custom` 不参与菜单自动触发，仅通过 SessionHeader ⚡ 手动选择
 */
export type PipelineScope =
  | "product-planning"
  | "product-design"
  | "product-insight"
  | "product-dev"
  | "quality-assurance"
  | "project-management"
  | "release-ops"
  | "knowledge-center"
  | "custom";

/** 非 custom 的 scope 列表（用于 UI 渲染、校验） */
export const PIPELINE_SCOPES_WITH_MENU = [
  "product-planning",
  "product-design",
  "product-insight",
  "product-dev",
  "quality-assurance",
  "project-management",
  "release-ops",
  "knowledge-center",
] as const satisfies readonly PipelineScope[];

/** Scope → 中文标签（供 UI 展示） */
export const PIPELINE_SCOPE_LABELS: Record<PipelineScope, string> = {
  "product-planning": "产品规划",
  "product-design": "产品设计",
  "product-insight": "产品洞察",
  "product-dev": "研发工坊",
  "quality-assurance": "质量中心",
  "project-management": "项目管理",
  "release-ops": "发布运维",
  "knowledge-center": "知识中心",
  custom: "自定义",
};

// ── 输入字段 ─────────────────────────────────────────────────────────────────

/**
 * Pipeline 启动时要收集的变量定义。由每条 pipeline 自己声明，
 * `PipelineLaunchDialog` 根据 `def.inputs` 动态生成表单。
 *
 * prompt 中用 `{{inputs.<key>}}` 引用对应值。
 */
export type PipelineInputFieldType =
  | "text"          // 单行文本
  | "textarea"      // 多行文本
  | "enum"          // 下拉单选，必须提供 options
  | "file-picker"   // workspace 文件选择（返回路径字符串[]）
  | "knowledge-ref" // 星静知识库条目选择（返回条目 id[]）
  | "date";         // 日期选择（ISO 8601 date string）

export interface PipelineInputField {
  /** 引用键，用作 `{{inputs.<key>}}` */
  key: string;
  /** UI 标签 */
  label: string;
  type: PipelineInputFieldType;
  required: boolean;
  /** 默认值；required 字段空值时使用 */
  default?: string;
  placeholder?: string;
  description?: string;
  /** type=enum 时的可选项 */
  options?: string[];
}

// ── Pipeline 定义 ────────────────────────────────────────────────────────────

/**
 * Pipeline 定义（持久化到 `<workspace>/.xingjing/pipelines/<id>.json`）。
 *
 * 存储格式：JSON.stringify(def, null, 2)，字段顺序无关，读取容错（新增字段必填默认值）。
 */
export interface PipelineDefinition {
  /** uuid v4，也作为文件名 */
  id: string;
  /** 人类可读名字，如「标准研发流程」 */
  name: string;
  /** 描述（列表 chip + Editor 描述区展示） */
  description: string;
  /**
   * slash command 名（不含前缀斜杠），如 "dev-std"。
   * 编译产物是 `.opencode/command/<triggerCommand>.md`。
   */
  triggerCommand: string;
  scope: PipelineScope;
  inputs: PipelineInputField[];
  nodes: PipelineNode[];
  /** 该 scope 的默认 pipeline；同一 workspace 同一 scope 至多一条 true */
  isDefault?: boolean;
  /** ISO 8601，storage.save 时若缺失则补全 */
  createdAt: string;
  updatedAt: string;
}

// ── 启动上下文 ───────────────────────────────────────────────────────────────

/**
 * Pipeline 启动运行期参数（不落盘，仅传递给 launcher / compiler 的渲染器）。
 */
export interface PipelineLaunchContext {
  workspaceId: string;
  /**
   * - `new-session`:     `session.create` + `promptAsync`
   * - `current-session`: 在已有 session 继续 prompt，需提供 parentSessionId
   */
  mode: "new-session" | "current-session";
  /** mode=current-session 必填 */
  parentSessionId?: string;
  /** 用户填的"这次要做什么"，所有节点 prompt 的 {{goal}} 来源 */
  goal: string;
  /** 对应 def.inputs 的用户值；key 与 field.key 一一对应 */
  inputValues: Record<string, string | string[]>;
  /** 工作区文件路径（相对 workspace root） */
  attachments?: string[];
  /** 星静知识库条目 id */
  knowledgeRefs?: string[];
  /** 干跑：仅编译并预览，不真的派子 agent */
  dryRun?: boolean;
  /** dev-only：跳过所有 human_approval 节点 */
  skipApproval?: boolean;
  /** Supervisor 运行期覆写 */
  supervisorOverride?: {
    /** 单节点超时（分钟） */
    nodeTimeoutMinutes?: number;
    /** strict=true 时任一节点告警即终止 */
    strict?: boolean;
  };
}

// ── 校验错误 ─────────────────────────────────────────────────────────────────

/**
 * compiler.ts 编译期 / Editor 保存时返回的校验错误。
 * `PipelineEditor` 按 code 映射为 inline 红色提示。
 */
export type PipelineValidationError =
  | { code: "NODES_EXCEED_LIMIT"; max: number; actual: number }
  | {
      code: "PARALLEL_GROUP_EXCEED_LIMIT";
      max: number;
      groupStartNodeId: string;
      actual: number;
    }
  | { code: "DUPLICATE_TRIGGER_COMMAND"; command: string }
  | { code: "UNKNOWN_AGENT_REF"; nodeId: string; ref: string }
  | { code: "UNKNOWN_SKILL_REF"; nodeId: string; ref: string }
  | { code: "AGENT_REF_REQUIRED"; nodeId: string }
  | { code: "BRANCH_TARGET_NOT_FOUND"; nodeId: string; target: string }
  | { code: "REVIEWER_IS_SELF"; nodeId: string; ref: string }
  | { code: "MISSING_REQUIRED_FIELD"; nodeId: string; field: string };

// ── 常量（限额） ─────────────────────────────────────────────────────────────

/**
 * §10.2 Pipeline 自强制并发限额。compiler.ts 与 launcher 共享。
 */
export const PIPELINE_LIMITS = {
  /** 单组 parallel 节点上限 */
  parallelGroupSize: 4,
  /** 单条 pipeline 总节点上限 */
  totalNodes: 20,
  /** 单节点子 session 默认超时（分钟） */
  defaultNodeTimeoutMinutes: 10,
  /** 单 workspace 同时运行 pipeline 上限 */
  maxConcurrentPerWorkspace: 1,
} as const;

// ── Supervisor 对账状态 ──────────────────────────────────────────────────────

/**
 * 单节点运行期状态（Supervisor 合并 todo + file part 推断得到）。
 */
export type PipelineNodeRuntimeStatus =
  | "pending"     // todo 已创建但未开始
  | "in-progress" // todo in_progress，或已有子 session 运行
  | "awaiting-approval" // human_approval 等待用户勾选
  | "completed"   // todo completed + node-<N>.md 校验通过
  | "skipped"     // branch 未走分支 / onFail=skip
  | "failed"      // 超时、重试耗尽、退出条件不满足
  | "timeout";

export interface PipelineNodeRuntimeInfo {
  nodeId: string;
  status: PipelineNodeRuntimeStatus;
  todoId: string;              // "pipeline-<pipelineId>:node-<nodeId>"
  outputFilePath?: string;     // ".opencode/docs/pipeline-<id>/node-<N>.md"
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  /** Supervisor 检测到的异常 */
  anomalies?: PipelineAnomaly[];
}

export type PipelineAnomaly =
  | { code: "NODE_SKIPPED_WITHOUT_OUTPUT"; previousNodeId: string }
  | { code: "FAKE_COMPLETION"; expectedMinChars: number; actualChars: number }
  | { code: "TIMEOUT"; thresholdMinutes: number }
  | { code: "REVIEW_REJECTED"; reviewerRef: string }
  | { code: "FILE_MISSING"; expectedPath: string };

export interface PipelineRuntimeSnapshot {
  pipelineId: string;
  sessionId: string;
  startedAt: string;
  /** 按 def.nodes 顺序排列 */
  nodes: PipelineNodeRuntimeInfo[];
  overallStatus: "running" | "succeeded" | "failed" | "aborted";
  anomalies: PipelineAnomaly[];
}

// ── Manifest（workspace-local 索引） ─────────────────────────────────────────

/**
 * `.xingjing/pipelines/_manifest.json` 的内容。
 *
 * v1 用 manifest 维护 id 列表（workspace file API 无 listDir）。
 * 任何 save/remove 都会先读 manifest → 修改 → 原子写回。
 */
export interface PipelineManifest {
  version: 1;
  ids: string[];
  /** scope → default pipeline id 的反查表，避免遍历所有定义 */
  defaultByScope: Partial<Record<PipelineScope, string>>;
  updatedAt: string;
}
