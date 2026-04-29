import type { WorkspacePreset } from "../../../app/types";
import type { OpenworkWorkspaceInfo } from "../../../app/lib/openwork-server";

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
export type ArtifactPanelTab = "artifacts" | "tools" | "todos";
