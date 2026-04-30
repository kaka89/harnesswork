/**
 * 星静（Xingjing）领域模块
 *
 * 通过组合 OpenWork 内置 hooks 为星静产品功能提供集成层。
 * 遵循 docs/06-openwork-bridge-contract.md 中定义的无 Bridge 单例集成契约：
 * 无独立路由、无 Bridge 单例、无 Props 注入，直接调用 OpenWork React hooks。
 *
 * 设计依据：
 * - 10-product-shell.md  壳层结构与 workspace 切换时序
 * - 30-autopilot.md      Autopilot session 生命周期与产出物
 * - 06-openwork-bridge-contract.md  React hooks 集成契约
 */

// ============================================================================
// Types
// ============================================================================

export type { XingjingProduct, AutopilotStatus, ArtifactPanelTab } from "./types";

// ============================================================================
// Hooks
// ============================================================================

/**
 * 产品（workspace）管理 hook。
 * 复用 useOpenworkStore，提供 WorkspacePreset-aware 的产品列表与切换能力。
 *
 * @see 10-product-shell.md §8
 * @see 06-openwork-bridge-contract.md §3
 */
export {
  useXingjingWorkspace,
  type UseXingjingWorkspaceReturn,
} from "./hooks/use-xingjing-workspace";

/**
 * Autopilot session 生命周期 hook。
 * 通过 React Query 订阅 session 消息流、状态、todo，不自建 SSE 连接。
 *
 * @see 30-autopilot.md §7 §10
 * @see 06-openwork-bridge-contract.md §4
 */
export {
  useXingjingAutopilot,
  type UseXingjingAutopilotReturn,
} from "./hooks/use-xingjing-autopilot";

/**
 * 产出物聚合 hook。
 * 从 React Query 缓存中提取 artifacts / tools / todos，
 * 为右侧产出物面板三 tab 提供数据。
 *
 * @see 30-autopilot.md §9
 */
export {
  useXingjingArtifacts,
  type UseXingjingArtifactsReturn,
  type ArtifactEntry,
  type ToolEntry,
} from "./hooks/use-xingjing-artifacts";

// ============================================================================
// Components
// ============================================================================

/**
 * 右侧产出物抽屉组件（折叠/展开，三 tab：Files / Tools / Tasks）。
 * 使用 useXingjingArtifacts 取数，渲染 30-autopilot.md §9.2 定义的右侧面板。
 *
 * @see 30-autopilot.md §9
 * @see 10-product-shell.md §4.1
 */
export {
  ArtifactsDrawer,
  type ArtifactsDrawerProps,
} from "./components/artifacts-drawer";

/**
 * 左侧历史会话抽屉组件（折叠/展开，按时间倒序列出当前 workspace 的历史会话）。
 *
 * @see 10-product-shell.md §4.1
 */
export {
  HistorySessionDrawer,
  type HistorySessionDrawerProps,
} from "./components/history-session-drawer";

// ============================================================================
// Pages
// ============================================================================

export { XingjingSessionPage } from "./pages/xingjing-session-page";
export { ModeSelectPage, APP_MODE_KEY } from "./pages/mode-select-page";

// ============================================================================
// Pipeline（流水线）
// ============================================================================

/**
 * 流水线功能模块：在设置页可视化编辑端到端产品交付流水线，
 * 编译为 OpenCode agent + slash command 在 Composer 触发。
 *
 * @see ../../../../product/features/xingjing-pipeline/SDD.md
 */
export type {
  PipelineDefinition,
  PipelineNode,
  PipelineNodeKind,
  PipelineScope,
  PipelineInputField,
  PipelineLaunchContext,
  PipelineValidationError,
  PipelineRuntimeSnapshot,
} from "./pipeline";

export {
  PIPELINE_SCOPES_WITH_MENU,
  PIPELINE_SCOPE_LABELS,
  PIPELINE_LIMITS,
  createPipelineStorage,
  PIPELINES_DIR,
  type PipelineStorage,
} from "./pipeline";

