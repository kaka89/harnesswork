/**
 * 星静流水线 workspace 同步器
 *
 * 职责：
 * 1. seedDefaults(client, ws, templates) — workspace 首次 mount 时写入预置模板
 * 2. syncPipelineToWorkspace(client, ws, def) — 单条 pipeline 编译产物写入 workspace
 * 3. syncAllPipelinesToWorkspace(client, ws) — 所有 pipeline 编译产物批量同步
 *
 * 触发时机：
 * - workspace mount 时（global-sdk-provider.tsx 或星静 shell useEffect）
 * - 用户在 Editor 点"保存并编译"后（use-pipeline-save.ts 调用）
 *
 * @see SDD §4 存储策略
 * @see compiler.ts agentFilePath / commandFilePath
 */

import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { PipelineDefinition } from "./types";
import { createPipelineStorage } from "./storage";
import {
  compilePipelineToAgentMd,
  compilePipelineToCommandMd,
  agentFilePath,
  commandFilePath,
} from "./compiler";
import { DEFAULT_PIPELINE_TEMPLATES } from "./default-templates";

// ── 工具 ─────────────────────────────────────────────────────────────────────

async function writeFile(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
  content: string,
): Promise<void> {
  await client.writeWorkspaceFile(workspaceId, { path, content, force: true });
}

// ── 核心接口 ─────────────────────────────────────────────────────────────────

/**
 * 将单条 pipeline 的编译产物写入 workspace：
 * - `.opencode/agents/xingjing-pipeline-<id>.md`
 * - `.opencode/command/<triggerCommand>.md`
 *
 * 每次保存后调用，确保 OpenCode 热加载到最新 agent + slash command。
 */
export async function syncPipelineToWorkspace(
  client: OpenworkServerClient,
  workspaceId: string,
  def: PipelineDefinition,
): Promise<void> {
  const agentMd = compilePipelineToAgentMd(def);
  const commandMd = compilePipelineToCommandMd(def);

  await Promise.all([
    writeFile(client, workspaceId, agentFilePath(def.id), agentMd),
    writeFile(client, workspaceId, commandFilePath(def.triggerCommand), commandMd),
  ]);
}

/**
 * 批量同步 workspace 的所有 pipeline 编译产物。
 * workspace mount 时调用，确保编排 agent/command 与 pipeline 定义一致。
 */
export async function syncAllPipelinesToWorkspace(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<void> {
  const storage = createPipelineStorage(client);
  const pipelines = await storage.list(workspaceId);
  if (pipelines.length === 0) return;

  await Promise.all(
    pipelines.map((def) => syncPipelineToWorkspace(client, workspaceId, def)),
  );
}

/**
 * 首次 seed 预置模板并同步编译产物。
 * 已存在（manifest 含同 id）则跳过，尊重用户修改。
 *
 * @param templates 预置模板列表，默认使用 DEFAULT_PIPELINE_TEMPLATES
 */
export async function seedAndSyncDefaults(
  client: OpenworkServerClient,
  workspaceId: string,
  templates: PipelineDefinition[] = DEFAULT_PIPELINE_TEMPLATES,
): Promise<void> {
  const storage = createPipelineStorage(client);

  // 1. seed 定义文件（已存在则跳过），返回本次新增的列表
  const newlySeeded = await storage.seedDefaults(workspaceId, templates);

  // 2. 只同步新增的 pipeline（避免每次 mount 都重写全部 agent 文件，触发 reload 提示）
  if (newlySeeded.length > 0) {
    await Promise.all(
      newlySeeded.map((def) => syncPipelineToWorkspace(client, workspaceId, def)),
    );
  }
}
