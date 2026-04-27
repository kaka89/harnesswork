/**
 * 流程编排共享配置管理服务
 *
 * 持久化链路：
 *   UI 编辑 → 写入 ~/.xingjing/workflow.yaml（全局共享源）
 *            → 同步到 {workDir}/orchestrator.yaml（工作区副本，供 Pipeline 引擎读取）
 *
 * 加载链路：
 *   打开 workspace → 读取 ~/.xingjing/workflow.yaml
 *                   → 同步写入 {workDir}/orchestrator.yaml
 *                   → Pipeline 引擎从 {workDir}/orchestrator.yaml 加载执行
 */

import type { WorkflowConfig, WorkflowStage } from '../types/settings';
import { readYaml } from './file-store';
import { fileRead, fileWrite } from './file-ops';
import { parsePipelineYaml, serializePipelineYaml } from './pipeline-config';
import type { PipelineConfig } from './pipeline-config';
import yaml from 'js-yaml';

// ─── 常量 ────────────────────────────────────────────────────

const SHARED_WORKFLOW_FILE = '~/.xingjing/workflow.yaml';

// ─── 默认 6 阶段模板（对齐 orchestrator.yaml）────────────────

export const defaultWorkflowStages: WorkflowStage[] = [
  {
    id: 'prd',
    name: '需求文档生成',
    description: '基于用户输入生成标准化 PRD',
    agent: 'product-agent',
    skills: ['gen-prd', 'validate-schema', 'evaluate-doc-quality'],
    gate: 'await-approval',
    dependsOn: [],
    output: { doc: 'docs/product/prd/PRD-{XXX}-{简称}.md' },
    enabled: true,
  },
  {
    id: 'sdd',
    name: '系统设计',
    description: '基于 approved PRD 生成 SDD 架构设计',
    agent: 'architect-agent',
    skills: ['gen-sdd', 'validate-schema', 'evaluate-doc-quality'],
    gate: 'await-approval',
    dependsOn: ['prd'],
    output: { doc: 'docs/product/architecture/SDD-{XXX}-{简称}.md' },
    enabled: true,
  },
  {
    id: 'module',
    name: '模块规格定义',
    description: '基于 approved SDD 生成 MODULE + OpenAPI + 契约测试骨架',
    agent: 'module-agent',
    skills: ['gen-module', 'validate-schema', 'check-doc-chain'],
    gate: 'auto',
    dependsOn: ['sdd'],
    output: { doc: 'docs/product/contracts/MODULE-{XXX}-{简称}.md' },
    enabled: true,
  },
  {
    id: 'plan',
    name: '迭代计划与任务拆解',
    description: '生成 PLAN + 批量 TASK',
    agent: 'plan-agent',
    skills: ['gen-plan', 'gen-task', 'validate-schema'],
    gate: 'await-approval',
    dependsOn: ['module'],
    output: { plan: 'docs/delivery/plan/PLAN-{XXX}-{简称}.md' },
    enabled: true,
  },
  {
    id: 'code',
    name: '编码实现',
    description: '逐 TASK 编码，每个 TASK 独立评估',
    agent: 'dev-agent',
    skills: ['evaluate-code-quality'],
    gate: 'await-approval',
    dependsOn: ['plan'],
    parallel: true,
    output: { source: 'apps/**', tests: 'src/test/**' },
    enabled: true,
  },
  {
    id: 'finalize',
    name: '收尾校验',
    description: '更新台账，执行全链路完整性校验',
    agent: '',
    skills: ['update-index', 'check-doc-chain'],
    gate: 'auto',
    dependsOn: ['code'],
    enabled: true,
  },
];

export const defaultWorkflowConfig: WorkflowConfig = {
  app: 'xingjing',
  mode: 'supervised',
  maxRetries: 2,
  stages: defaultWorkflowStages,
};

// ─── WorkflowConfig ↔ PipelineConfig 转换 ───────────────────

/** WorkflowConfig → PipelineConfig（供 Pipeline 引擎使用） */
export function workflowToPipelineConfig(wf: WorkflowConfig): PipelineConfig {
  return {
    app: wf.app,
    mode: wf.mode,
    maxRetries: wf.maxRetries,
    stages: wf.stages.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      agent: s.agent,
      skills: s.skills,
      gate: s.gate,
      dependsOn: s.dependsOn,
      parallel: s.parallel,
      output: s.output,
      outputStatus: 'pending' as const,
      enabled: s.enabled,
    })),
  };
}

/** PipelineConfig → WorkflowConfig（从 YAML 导入时使用） */
export function pipelineToWorkflowConfig(pc: PipelineConfig): WorkflowConfig {
  return {
    app: pc.app,
    mode: pc.mode,
    maxRetries: pc.maxRetries,
    stages: pc.stages.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      agent: s.agent,
      skills: s.skills,
      gate: s.gate,
      dependsOn: s.dependsOn,
      parallel: s.parallel,
      output: s.output,
      enabled: s.enabled !== false,
    })),
  };
}

// ─── 共享配置读写 ────────────────────────────────────────────

/**
 * 从 ~/.xingjing/workflow.yaml 加载全局共享流程编排配置。
 * 文件不存在时返回默认模板。
 */
export async function loadSharedWorkflow(): Promise<WorkflowConfig> {
  try {
    const content = await fileRead(SHARED_WORKFLOW_FILE);
    if (!content) {
      return { ...defaultWorkflowConfig };
    }
    const pc = parsePipelineYaml(content);
    if (!pc || pc.stages.length === 0) {
      return { ...defaultWorkflowConfig };
    }
    return pipelineToWorkflowConfig(pc);
  } catch {
    console.warn('[workflow-sync] 无法读取共享配置，使用默认模板');
    return { ...defaultWorkflowConfig };
  }
}

/**
 * 保存流程编排配置到 ~/.xingjing/workflow.yaml（全局共享源）。
 */
export async function saveSharedWorkflow(config: WorkflowConfig): Promise<boolean> {
  try {
    const pc = workflowToPipelineConfig(config);
    const yamlContent = serializePipelineYaml(pc);
    // writeYaml 期望对象，但我们已有 YAML 字符串，直接用 fileWrite
    return await fileWrite(SHARED_WORKFLOW_FILE, yamlContent);
  } catch {
    console.error('[workflow-sync] 保存共享配置失败');
    return false;
  }
}

/**
 * 将共享配置同步到指定工作区的 orchestrator.yaml。
 * 在打开 workspace 时自动调用。
 */
export async function syncWorkflowToWorkspace(workDir: string): Promise<boolean> {
  if (!workDir) return false;
  try {
    const config = await loadSharedWorkflow();
    const pc = workflowToPipelineConfig(config);
    const yamlContent = serializePipelineYaml(pc);
    return await fileWrite('orchestrator.yaml', yamlContent, workDir);
  } catch {
    console.warn('[workflow-sync] 同步到工作区失败:', workDir);
    return false;
  }
}

/**
 * 保存共享配置并同步到当前工作区。
 * UI 保存时的统一入口。
 */
export async function saveAndSyncWorkflow(
  config: WorkflowConfig,
  workDir?: string,
): Promise<boolean> {
  const saved = await saveSharedWorkflow(config);
  if (!saved) return false;
  if (workDir) {
    await syncWorkflowToWorkspace(workDir);
  }
  return true;
}
