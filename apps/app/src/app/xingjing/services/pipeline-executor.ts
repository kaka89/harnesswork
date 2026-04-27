/**
 * Pipeline DAG 执行器
 *
 * 基于 pipeline-config.ts 解析的 PipelineConfig 执行多阶段长流程。
 * 支持：
 * - 拓扑排序分层执行（同层可并行）
 * - 门控审批（await-approval 暂停等待用户决策）
 * - 单阶段失败重试（maxRetries）
 * - Agent 动态发现与 OpenCode Session 指定
 */

import type { PipelineConfig, PipelineStage } from './pipeline-config';
import { topologicalSort } from './pipeline-config';
import { discoverAgents } from './agent-registry';
import type { CallAgentOptions } from './opencode-client';
import { callAgent } from './opencode-client';
import { retrieveKnowledge } from './knowledge-retrieval';
import { recallRelevantContext } from './memory-recall';
import type { SkillApiAdapter } from './knowledge-behavior';
import { sinkAgentOutput } from './knowledge-sink';

// ─── 执行选项 ─────────────────────────────────────────────────

export interface PipelineRunOpts {
  /** Pipeline 配置 */
  config: PipelineConfig;
  /** 用户目标（会作为上下文传递给每个 Stage Agent） */
  goal: string;
  /** 工作目录 */
  workDir?: string;
  /** 使用的模型 */
  model?: { providerID: string; modelID: string };
  /** 注入 callAgent 实现（复用 store.actions.callAgent） */
  callAgentFn?: (opts: CallAgentOptions) => Promise<void>;
  /** OpenWork Skill API 适配器（用于知识检索） */
  skillApi?: SkillApiAdapter | null;
  /** 工具权限请求回调 */
  onPermissionAsked?: CallAgentOptions['onPermissionAsked'];

  // ── 回调 ──
  /** 阶段开始执行 */
  onStageStart?: (stageId: string, stage: PipelineStage) => void;
  /** 阶段流式文本输出 */
  onStageStream?: (stageId: string, text: string) => void;
  /** 阶段执行完成 */
  onStageComplete?: (stageId: string, result: string) => void;
  /** 阶段执行失败 */
  onStageFailed?: (stageId: string, error: string) => void;
  /** 门控等待审批（返回 approve 继续，reject 跳过） */
  onGateWaiting?: (stageId: string, stageName: string) => Promise<'approve' | 'reject'>;
  /** Stage Session 创建回调（用于 UI 绑定） */
  onStageSessionCreated?: (stageId: string, sessionId: string) => void;
  /** 全部完成 */
  onDone?: (results: Record<string, string>) => void;
  /** 整体失败 */
  onError?: (err: string) => void;
}

// ─── 执行器 ───────────────────────────────────────────────────

/**
 * 执行 Pipeline 长流程。
 *
 * 流程：
 * 1. 拓扑排序获取执行层级
 * 2. 逐层执行：同层 stage 可并行（如 parallel=true）
 * 3. gate='await-approval' 时暂停等待用户审批
 * 4. gate='auto' 时自动进入下一阶段
 * 5. 单阶段失败重试（最多 maxRetries 次）
 * 6. 聚合全部 stage 结果返回
 */
export async function runPipeline(opts: PipelineRunOpts): Promise<void> {
  const { config, goal, workDir, model } = opts;
  const invoke = opts.callAgentFn ?? callAgent;
  const maxRetries = config.maxRetries ?? 2;

  // ── 知识检索与回忆（Pipeline 级别，仅执行一次，注入所有 Stage）──
  let knowledgeContext = '';
  let recallContext = '';
  try {
    const [knowledgeResult, recallResult] = await Promise.all([
      workDir
        ? retrieveKnowledge({
            workDir,
            skillApi: opts.skillApi ?? null,
            query: goal,
            scene: 'pipeline',
          })
        : Promise.resolve(''),
      workDir
        ? recallRelevantContext(workDir, goal).then(r => r.contextText)
        : Promise.resolve(''),
    ]);
    knowledgeContext = knowledgeResult;
    recallContext = recallResult;
  } catch (e) {
    console.warn('[pipeline-executor] knowledge/recall retrieval failed:', e);
  }

  // 拓扑排序分层（仅包含已启用的 Stage）
  const layers = topologicalSort(config.stages, true);
  if (layers.length === 0 && config.stages.filter((s) => s.enabled !== false).length > 0) {
    opts.onError?.('Pipeline 配置存在循环依赖，无法执行');
    return;
  }

  // 发现可用 Agent（用于 stage.agent → Agent 定义映射）
  const agents = await discoverAgents('solo', workDir);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // 聚合结果
  const results: Record<string, string> = {};

  // 逐层执行
  for (const layer of layers) {
    // 同层内：parallel=true 的并发，否则顺序
    const parallelStages = layer.filter((s) => s.parallel);
    const sequentialStages = layer.filter((s) => !s.parallel);

    // 并行执行
    if (parallelStages.length > 0) {
      await Promise.all(
        parallelStages.map((stage) =>
          executeStage(stage, {
            goal, workDir, model, invoke, maxRetries, agents: agentMap,
            results, opts, knowledgeContext, recallContext,
          }),
        ),
      );
    }

    // 顺序执行
    for (const stage of sequentialStages) {
      await executeStage(stage, {
        goal, workDir, model, invoke, maxRetries, agents: agentMap,
        results, opts, knowledgeContext, recallContext,
      });
    }
  }

  opts.onDone?.(results);
}

// ─── Pipeline Session 执行器（使用 OpenWork 原生 Session）──────

export interface PipelineSessionRunOpts {
  /** Pipeline 配置 */
  config: PipelineConfig;
  /** 用户目标 */
  goal: string;
  /** OpenWork Client */
  client: () => ReturnType<typeof import('../../lib/opencode').createClient> | null;
  /** Workspace ID */
  workspaceId: () => string | null;
  /** 工作目录 */
  workDir: () => string;
  /** 使用的模型 */
  model: () => { providerID: string; modelID: string } | null;

  // ── 回调 ──
  /** 阶段开始执行 */
  onStageStart?: (stageId: string, stage: PipelineStage) => void;
  /** Stage Session 创建回调 */
  onStageSessionCreated?: (stageId: string, sessionId: string) => void;
  /** 阶段执行完成 */
  onStageComplete?: (stageId: string, result: string) => void;
  /** 阶段执行失败 */
  onStageFailed?: (stageId: string, error: string) => void;
  /** 门控等待审批 */
  onGateWaiting?: (stageId: string, stageName: string) => Promise<'approve' | 'reject'>;
  /** 全部完成 */
  onDone?: (results: Record<string, string>) => void;
  /** 整体失败 */
  onError?: (err: string) => void;
}

/**
 * 使用 OpenWork 原生 Session 执行 Pipeline。
 * 每个 Stage 创建一个真实的 Session，支持完整的消息渲染、权限、提问等。
 */
export async function runPipelineWithSessions(opts: PipelineSessionRunOpts): Promise<void> {
  const { config, goal, client, workspaceId, workDir, model } = opts;
  const maxRetries = config.maxRetries ?? 2;

  const clientInstance = client();
  const wsId = workspaceId();
  if (!clientInstance || !wsId) {
    opts.onError?.('OpenWork client 或 workspace ID 未就绪');
    return;
  }

  // 拓扑排序分层（仅包含已启用的 Stage）
  const layers = topologicalSort(config.stages, true);
  if (layers.length === 0 && config.stages.filter((s) => s.enabled !== false).length > 0) {
    opts.onError?.('Pipeline 配置存在循环依赖，无法执行');
    return;
  }

  // 聚合结果
  const results: Record<string, string> = {};
  const sessionIds: Record<string, string> = {};

  // 逐层执行
  for (const layer of layers) {
    const parallelStages = layer.filter((s) => s.parallel);
    const sequentialStages = layer.filter((s) => !s.parallel);

    // 并行执行
    if (parallelStages.length > 0) {
      await Promise.all(
        parallelStages.map((stage) =>
          executeStageWithSession(stage, {
            goal,
            client: clientInstance,
            workspaceId: wsId,
            workDir: workDir(),
            model: model(),
            maxRetries,
            results,
            sessionIds,
            opts,
          }),
        ),
      );
    }

    // 顺序执行
    for (const stage of sequentialStages) {
      await executeStageWithSession(stage, {
        goal,
        client: clientInstance,
        workspaceId: wsId,
        workDir: workDir(),
        model: model(),
        maxRetries,
        results,
        sessionIds,
        opts,
      });
    }
  }

  opts.onDone?.(results);
}

// ─── 单阶段 Session 执行 ──────────────────────────────────────

interface StageSessionExecContext {
  goal: string;
  client: ReturnType<typeof import('../../lib/opencode').createClient>;
  workspaceId: string;
  workDir: string;
  model: { providerID: string; modelID: string } | null;
  maxRetries: number;
  results: Record<string, string>;
  sessionIds: Record<string, string>;
  opts: PipelineSessionRunOpts;
}

async function executeStageWithSession(
  stage: PipelineStage,
  ctx: StageSessionExecContext,
): Promise<void> {
  const { goal, client, workspaceId, workDir, model, maxRetries, results, sessionIds, opts } = ctx;

  // 1. 门控检查
  if (stage.gate === 'await-approval') {
    if (opts.onGateWaiting) {
      const decision = await opts.onGateWaiting(stage.id, stage.name);
      if (decision === 'reject') {
        stage.outputStatus = 'skipped';
        results[stage.id] = `[已跳过] ${stage.name}`;
        return;
      }
    }
  }

  // 2. 构建上下文 prompt
  const contextParts: string[] = [`## 用户目标\n${goal}`];
  if (stage.description) {
    contextParts.push(`## 当前阶段任务\n${stage.description}`);
  }

  // 注入前置阶段的产出
  if (stage.dependsOn.length > 0) {
    const depOutputs = stage.dependsOn
      .filter((depId) => results[depId])
      .map((depId) => `### ${depId} 产出\n${results[depId]}`);
    if (depOutputs.length > 0) {
      contextParts.push(`## 前置阶段产出\n${depOutputs.join('\n\n')}`);
    }
  }

  const userPrompt = contextParts.join('\n\n');

  // 3. 带重试执行
  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      opts.onStageStart?.(stage.id, stage);
      stage.outputStatus = 'running';

      // 创建 Session
      const sessionResult = await client.session.create({
        directory: workDir,
      });

      if (!sessionResult.data) {
        throw new Error('Failed to create session');
      }

      const session = sessionResult.data;
      sessionIds[stage.id] = session.id;
      opts.onStageSessionCreated?.(stage.id, session.id);

      // 发送 prompt
      await (client.session as any).promptAsync({
        sessionID: session.id,
        directory: workDir,
        parts: [{ type: 'text', text: userPrompt }],
      });

      // 等待 Session 完成（简化版，实际应该通过 SSE 监听）
      // TODO: 集成 MessageAccumulator 监听 Session 状态
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 获取 Session 消息
      const messagesResult = await client.session.messages({ sessionID: session.id });
      const messages = messagesResult.data ?? [];

      // 提取最后一条消息的文本内容
      const lastMessage = messages[messages.length - 1];
      let stageResult = '';
      if (lastMessage && lastMessage.parts) {
        const textParts = lastMessage.parts.filter((p: any) => p.type === 'text');
        stageResult = textParts.map((p: any) => p.text ?? '').join('');
      }

      // 成功
      stage.outputStatus = 'success';
      results[stage.id] = stageResult;
      opts.onStageComplete?.(stage.id, stageResult);

      return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // 重试耗尽
  stage.outputStatus = 'failed';
  results[stage.id] = `[失败] ${lastError}`;
  opts.onStageFailed?.(stage.id, lastError);
}

// ─── 单阶段执行 ──────────────────────────────────────────────

interface StageExecContext {
  goal: string;
  workDir?: string;
  model?: { providerID: string; modelID: string };
  invoke: (opts: CallAgentOptions) => Promise<void>;
  maxRetries: number;
  agents: Map<string, { id: string; systemPrompt: string; opencodeAgentId?: string }>;
  results: Record<string, string>;
  opts: PipelineRunOpts;
  /** 知识上下文（Pipeline 级别统一检索） */
  knowledgeContext: string;
  /** 回忆上下文（Pipeline 级别统一检索） */
  recallContext: string;
}

async function executeStage(
  stage: PipelineStage,
  ctx: StageExecContext,
): Promise<void> {
  const { goal, workDir, model, invoke, maxRetries, agents, results, opts, knowledgeContext, recallContext } = ctx;

  // 1. 门控检查（supervised 模式下 await-approval 暂停）
  if (stage.gate === 'await-approval') {
    if (opts.onGateWaiting) {
      const decision = await opts.onGateWaiting(stage.id, stage.name);
      if (decision === 'reject') {
        stage.outputStatus = 'skipped';
        results[stage.id] = `[已跳过] ${stage.name}`;
        return;
      }
    }
    // 无回调时自动通过（autonomous 降级行为）
  }

  // 2. 查找 Agent 定义
  const agentDef = agents.get(stage.agent);
  const systemPrompt = agentDef?.systemPrompt ?? '';
  const agentId = agentDef?.opencodeAgentId;

  // 3. 构建上下文 prompt（包含前置阶段产出）
  const contextParts: string[] = [`## 用户目标\n${goal}`];
  if (stage.description) {
    contextParts.push(`## 当前阶段任务\n${stage.description}`);
  }

  // 注入前置阶段的产出作为上下文
  if (stage.dependsOn.length > 0) {
    const depOutputs = stage.dependsOn
      .filter((depId) => results[depId])
      .map((depId) => `### ${depId} 产出\n${results[depId]}`);
    if (depOutputs.length > 0) {
      contextParts.push(`## 前置阶段产出\n${depOutputs.join('\n\n')}`);
    }
  }

  const userPrompt = contextParts.join('\n\n');

  // 4. 带重试执行
  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      opts.onStageStart?.(stage.id, stage);
      stage.outputStatus = 'running';

      const stageResult = await new Promise<string>((resolve, reject) => {
        let resolved = false;
        const safeResolve = (v: string) => { if (!resolved) { resolved = true; resolve(v); } };
        const safeReject = (e: string) => { if (!resolved) { resolved = true; reject(new Error(e)); } };

        invoke({
          title: `xingjing-pipeline-${stage.id}-${Date.now()}`,
          directory: workDir,
          systemPrompt,
          userPrompt,
          model,
          agentId,
          knowledgeContext,
          recallContext,
          onPermissionAsked: opts.onPermissionAsked,
          onText: (accumulated) => {
            opts.onStageStream?.(stage.id, accumulated);
          },
          onDone: (fullText) => {
            safeResolve(fullText);
          },
          onError: (err) => {
            safeReject(err);
          },
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          safeReject(msg);
        });
      });

      // 成功
      stage.outputStatus = 'success';
      results[stage.id] = stageResult;
      opts.onStageComplete?.(stage.id, stageResult);

      // 异步沉淀 Agent 产出
      void sinkAgentOutput({
        output: stageResult,
        agentId: stage.agent,
        sessionId: `pipeline-${stage.id}-${Date.now()}`,
        workDir: workDir ?? '',
        skillApi: opts.skillApi ?? null,
        goal,
      });

      return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) {
        // 等待后重试
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // 重试耗尽
  stage.outputStatus = 'failed';
  results[stage.id] = `[失败] ${lastError}`;
  opts.onStageFailed?.(stage.id, lastError);
}
