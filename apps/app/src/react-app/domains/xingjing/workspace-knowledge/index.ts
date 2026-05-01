// Types
export type {
  DirGraph, DirGraphNodes, DirGraphNode,
  LiveDocNode, FeatureTreeNode, IncrementalNode, PersonalKbNode, RuntimeYmlNode,
  DirGraphConventions, DirGraphContextInjection, ValidationWarning,
} from "./types/dir-graph";

// Services
export { loadDirGraph, defaultMerge, validateDirGraph, resolveNodePath,
         serializeDirGraphTemplate, parseSimpleYaml,
         DEFAULT_DIR_GRAPH, DIR_GRAPH_PATH } from "./services/dir-graph-loader";
export { readFile, writeFile } from "./services/fs-primitives";
export { ensureWorkspace, ensureNode } from "./services/ensure";
export { readActiveFeatureHead } from "./services/features-reader";
export { readActiveIterationTodo } from "./services/iterations-reader";
export { searchKnowledge } from "./services/knowledge-reader";
export { readFocus, readRecentAudit } from "./services/runtime-reader";
export { registerSkills, listRegisteredSkills, WK_SKILLS } from "./services/skills-registry";
export { registerCommands, listRegisteredCommands, WK_COMMANDS } from "./services/commands-registry";
export { reloadEngine, ReloadError } from "./services/reload";
export { listAuditTrail } from "./services/audit";
export { buildWorkspaceContext } from "./services/context-builder";

// Hooks
export { useDirGraph } from "./hooks/use-dir-graph";
export { useWorkspaceKnowledge } from "./hooks/use-workspace-knowledge";
export { useFeatureDoc } from "./hooks/use-feature-doc";
export { useIterations } from "./hooks/use-iterations";
export { useKnowledgeSearch } from "./hooks/use-knowledge-search";
export { useSkillsRegistry } from "./hooks/use-skills-registry";
export { useCommandsRegistry } from "./hooks/use-commands-registry";
export { useAudit } from "./hooks/use-audit";

// Assets
export { SKILL_CONTENTS } from "./assets/skill-contents";

// Components
export { WorkspaceHealthPanel } from "./components/WorkspaceHealthPanel";
