/**
 * Pipeline 配置解析 — orchestrator.yaml 驱动的 DAG 长流程
 *
 * 从产品根目录读取 orchestrator.yaml，解析为 PipelineConfig 结构。
 * 使用 js-yaml 标准库解析 YAML。
 * 提供拓扑排序将 DAG 依赖图分层，供 pipeline-executor 顺序/并行执行。
 */

import yaml from 'js-yaml';
import { fileRead } from './file-ops';

// ─── 类型定义 ─────────────────────────────────────────────────

export interface PipelineStage {
  /** 阶段唯一标识（从 YAML key 推导） */
  id: string;
  /** 阶段显示名称 */
  name: string;
  /** 阶段描述 */
  description: string;
  /** 负责执行的 Agent ID */
  agent: string;
  /** 阶段需要的技能 */
  skills: string[];
  /** 门控策略：auto = 自动通过，await-approval = 等待人工审批 */
  gate: 'auto' | 'await-approval';
  /** 依赖的前置阶段 ID 列表 */
  dependsOn: string[];
  /** 是否可与同层其他阶段并行执行 */
  parallel?: boolean;
  /** 阶段产出记录 */
  output?: Record<string, string>;
  /** 阶段执行状态（运行时填充） */
  outputStatus?: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  /** 是否启用（支持部分执行，默认 true） */
  enabled?: boolean;
}

export interface PipelineConfig {
  /** 应用名称 */
  app: string;
  /** 执行模式：supervised = 关键节点需人工审批，autonomous = 全自动 */
  mode: 'supervised' | 'autonomous';
  /** 单阶段最大重试次数 */
  maxRetries: number;
  /** 阶段列表 */
  stages: PipelineStage[];
}

// ─── orchestrator.yaml → PipelineConfig ───────────────────────

/**
 * 从产品工作目录加载 Pipeline 配置。
 * 路径：{workDir}/orchestrator.yaml
 *
 * @returns PipelineConfig 或 null（文件不存在 / 解析失败时）
 */
export async function loadPipelineConfig(workDir: string): Promise<PipelineConfig | null> {
  try {
    const content = await fileRead('orchestrator.yaml', workDir);
    if (!content) return null;
    return parsePipelineYaml(content);
  } catch {
    console.warn('[pipeline-config] 无法读取 orchestrator.yaml');
    return null;
  }
}

/**
 * 将 orchestrator.yaml 原始内容解析为 PipelineConfig
 */
export function parsePipelineYaml(yamlContent: string): PipelineConfig | null {
  try {
    const raw = (yaml.load(yamlContent) as Record<string, unknown>) ?? {};
    const app = String(raw.app ?? raw.name ?? 'unknown');
    const mode = raw.mode === 'autonomous' ? 'autonomous' : 'supervised';
    const maxRetries = typeof raw.maxRetries === 'number' ? raw.maxRetries : 2;

    const rawStages = raw.stages;
    if (!Array.isArray(rawStages) || rawStages.length === 0) {
      return { app, mode, maxRetries, stages: [] };
    }

    const stages: PipelineStage[] = rawStages.map((s: Record<string, unknown>, idx: number) => {
      const id = String(s.id ?? s.name ?? `stage-${idx}`);
      const dependsOnRaw = s.dependsOn ?? s.depends_on ?? [];
      const skillsRaw = s.skills ?? [];

      return {
        id,
        name: String(s.name ?? id),
        description: String(s.description ?? ''),
        agent: String(s.agent ?? ''),
        skills: Array.isArray(skillsRaw) ? skillsRaw.map(String) : [],
        gate: s.gate === 'await-approval' ? 'await-approval' : 'auto',
        dependsOn: Array.isArray(dependsOnRaw) ? dependsOnRaw.map(String) : [],
        parallel: s.parallel === true || s.parallel === 'true',
        output: (s.output && typeof s.output === 'object') ? s.output as Record<string, string> : undefined,
        outputStatus: 'pending',
        enabled: s.enabled !== false, // 默认 true，仅显式 false 时禁用
      };
    });

    return { app, mode, maxRetries, stages };
  } catch {
    console.warn('[pipeline-config] YAML 解析失败');
    return null;
  }
}

// ─── 拓扑排序 ─────────────────────────────────────────────────

/**
 * 将 DAG 依赖图中的 stages 分层（拓扑排序）。
 * 返回二维数组：每层包含可并行执行的 stage 集合。
 * 无依赖的 stage 归入第一层。
 *
 * @throws 检测到循环依赖时返回空数组
 */
export function topologicalSort(stages: PipelineStage[], enabledOnly = false): PipelineStage[][] {
  const filtered = enabledOnly ? stages.filter((s) => s.enabled !== false) : stages;
  if (filtered.length === 0) return [];

  const stageMap = new Map(filtered.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // 初始化
  for (const s of filtered) {
    inDegree.set(s.id, 0);
    adjList.set(s.id, []);
  }

  // 构建邻接表和入度（仅考虑过滤后的节点）
  for (const s of filtered) {
    for (const dep of s.dependsOn) {
      if (stageMap.has(dep)) {
        adjList.get(dep)!.push(s.id);
        inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
      }
    }
  }

  const layers: PipelineStage[][] = [];
  let remaining = filtered.length;

  while (remaining > 0) {
    // 找出所有入度为 0 的节点
    const layer: PipelineStage[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        const stage = stageMap.get(id);
        if (stage) layer.push(stage);
      }
    }

    if (layer.length === 0) {
      // 循环依赖，无法排序
      console.error('[pipeline-config] 检测到循环依赖');
      return [];
    }

    layers.push(layer);

    // 移除已处理节点
    for (const s of layer) {
      inDegree.delete(s.id);
      for (const next of adjList.get(s.id) ?? []) {
        if (inDegree.has(next)) {
          inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
        }
      }
    }

    remaining -= layer.length;
  }

  return layers;
}

// ─── 序列化 PipelineConfig → YAML ─────────────────────────

/**
 * 将 PipelineConfig 序列化为 YAML 字符串。
 * 支持导出和持久化场景。
 */
export function serializePipelineYaml(config: PipelineConfig): string {
  const obj: Record<string, unknown> = {
    app: config.app,
    mode: config.mode,
    max_retries: config.maxRetries,
    stages: config.stages.map((s) => {
      const stage: Record<string, unknown> = {
        id: s.id,
        name: s.name,
        description: s.description,
        agent: s.agent,
        skills: s.skills,
        gate: s.gate,
      };
      if (s.dependsOn.length > 0) stage.depends_on = s.dependsOn;
      if (s.parallel) stage.parallel = true;
      if (s.output && Object.keys(s.output).length > 0) stage.output = s.output;
      if (s.enabled === false) stage.enabled = false;
      return stage;
    }),
  };
  return yaml.dump(obj, { lineWidth: -1, noRefs: true });
}
