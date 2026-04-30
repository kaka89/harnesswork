/**
 * 星静流水线模块 · 屏障导出
 *
 * @see ../../../../../product/features/xingjing-pipeline/SDD.md
 */

// ── 类型 ──
export type {
  PipelineNode,
  PipelineNodeKind,
  PipelineNodeFailStrategy,
  PipelineScope,
  PipelineInputField,
  PipelineInputFieldType,
  PipelineDefinition,
  PipelineLaunchContext,
  PipelineValidationError,
  PipelineManifest,
  PipelineNodeRuntimeStatus,
  PipelineNodeRuntimeInfo,
  PipelineRuntimeSnapshot,
  PipelineAnomaly,
} from "./types";

export {
  PIPELINE_SCOPES_WITH_MENU,
  PIPELINE_SCOPE_LABELS,
  PIPELINE_LIMITS,
} from "./types";

// ── 存储 ──
export {
  createPipelineStorage,
  readManifest,
  PIPELINES_DIR,
  MANIFEST_PATH,
  type PipelineStorage,
} from "./storage";

// ── 编译器 ──
export {
  validatePipeline,
  compilePipelineToAgentMd,
  compilePipelineToCommandMd,
  renderPrompt,
  agentFilePath,
  commandFilePath,
  nodeOutputPath,
} from "./compiler";

// ── 同步 ──
export {
  syncPipelineToWorkspace,
  syncAllPipelinesToWorkspace,
  seedAndSyncDefaults,
} from "./sync";

// ── 预置模板 ──
export { DEFAULT_PIPELINE_TEMPLATES } from "./default-templates";
