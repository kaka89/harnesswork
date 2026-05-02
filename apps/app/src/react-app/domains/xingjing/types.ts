import type { WorkspacePreset } from "../../../app/types";
import type { OpenworkSkillItem, OpenworkWorkspaceInfo } from "../../../app/lib/openwork-server";

/**
 * 星静产品 = OpenWork workspace + 已知的 WorkspacePreset。
 * 每个产品对应一个 workspace，preset 决定预装的 Skill/Agent 集合。
 *
 * preset 三值语义（来自 10-product-shell.md §8）：
 * - starter:    新手引导，预装基础 Skill 包 + 默认 Agent
 * - automation: Autopilot 流水线，预装 Autopilot 系 Skill + 指令型 Agent
 * - minimal:    极简通用，无预装 Skill，白盒 Agent
 */
export type XingjingProduct = OpenworkWorkspaceInfo & {
  preset: WorkspacePreset;
};

/**
 * Autopilot session 状态（对应 30-autopilot.md §7 的 session.status 事件）。
 * - idle:  会话空闲，Composer 可发送新 prompt
 * - busy:  会话执行中，等待 LLM + 工具完成
 * - retry: 会话正在重试（暂时失败，含重试信息）
 */
export type AutopilotStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

/**
 * 产出物面板三 tab（来自 30-autopilot.md §9）：
 * - artifacts: LLM 写入 .opencode/docs/ 的文件
 * - tools:     工具调用记录（tool-call/tool-result）
 * - todos:     SSE todo.updated 事件产生的待办项
 */
export type ArtifactPanelTab = "artifacts" | "tools" | "todos" | "pipeline";

// ── AI 搭档（Agent）类型 ──────────────────────────────────────────────────────

/**
 * 星静扩展字段，写入 Agent 文件的 `options` 对象。
 * OpenWork 允许 unknown keys 自动归入 options，不破坏兼容性。
 */
export interface XingjingAgentOptions {
  /** 卡片图标 emoji，如 "🧠"，默认 "🤖" */
  icon?: string;
  /** 展示名，如 "AI产品搭档"（缺省用文件名/name 字段）*/
  displayName?: string;
  /** 卡片副标题，如 "产品搭档" */
  subtitle?: string;
  /** 关联的 skill slug 列表（仅存引用，不内嵌 Skill 定义）*/
  skills?: string[];
}

/**
 * Agent 文件解析后的元数据（frontmatter 字段）。
 * 对应 OpenWork 官方字段集（prds/new-plugin-arch/config-types/agents.md）。
 */
export interface XingjingAgentMeta {
  /** 文件名即 slug，也作为唯一标识 */
  name: string;
  /** LLM 模型 */
  model?: string;
  /** 模型变体（如推理模式）*/
  variant?: string;
  /** 采样温度 */
  temperature?: number;
  /** 核心采样 */
  top_p?: number;
  /** 运行模式：subagent / primary / all */
  mode?: "subagent" | "primary" | "all";
  /** 是否隐藏 */
  hidden?: boolean;
  /** 是否禁用 */
  disable?: boolean;
  /** 描述（搜索/展示用）*/
  description?: string;
  /** 最大步骤数 */
  steps?: number;
  /** UI 颜色 */
  color?: string;
  /** 星静扩展字段 */
  options?: XingjingAgentOptions & Record<string, unknown>;
  /** system prompt（文件 body）*/
  systemPrompt?: string;
  /** 文件路径（相对 workspace root） */
  filePath?: string;
}

/**
 * 视图层辅助类型：XingjingAgentMeta + 已解析的 Skill 对象列表。
 * resolvedSkills 由 useAgents() hook 在返回数据前注入。
 */
export type XingjingAgentView = XingjingAgentMeta & {
  /** 已解析的 Skill 对象列表（缺失 Skill 以 null 填充）*/
  resolvedSkills: (OpenworkSkillItem | null)[];
};
