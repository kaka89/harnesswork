/**
 * Autopilot Executor
 * 两阶段 Agent 调度：Orchestrator 解析意图 → 并发调用子 Agent
 * 支持 @mention 直接调用，零后端存储，OpenCode 不可用时降级 mock。
 *
 * Agent 发现机制：
 * - 统一从 ~/.xingjing/agents/ 文件加载（纯文件驱动）
 * - 通过 agent-registry.ts 统一管理
 */
import { callAgent, type CallAgentOptions } from './opencode-client';
import { listAllAgents, type RegisteredAgent } from './agent-registry';
import { retrieveKnowledge } from './knowledge-retrieval';
import { recallRelevantContext } from './memory-recall';
import type { SkillApiAdapter } from './knowledge-behavior';
import { sinkAgentOutput } from './knowledge-sink';
import { injectSkillContext } from './skill-manager';

// ─── Agent 定义 ─────────────────────────────────────────────────

export interface AutopilotAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  bgColor: string;
  borderColor: string;
  emoji: string;
  /** UI 展示用标签（如 '需求分析'、'PRD 生成'） */
  skills: string[];
  /** 实际从 .opencode/skills/ 注入的 Skill ID（如 'product-hypothesis'） */
  injectSkills?: string[];
  description: string;
  /** 直接传给 callAgent systemPrompt 的角色设定 */
  systemPrompt: string;
  /** Agent 模式：solo = 独立版, team = 团队版 */
  mode?: 'solo' | 'team';
  /** Agent 来源：seed = 内置种子, custom = 用户自定义 */
  source?: 'seed' | 'custom';
  /** 是否可在 Workshop 中编辑/删除（种子 Agent 不可删除） */
  editable?: boolean;
}


// ─── Orchestrator Prompt Builder ────────────────────────────────

export function buildOrchestratorSystemPrompt(agents: AutopilotAgent[]): string {
  const list = agents.map((a) => `- ${a.id} (${a.name}): ${a.description}`).join('\n');
  return `你是 Autopilot Orchestrator，负责根据用户目标决定调用哪些 Agent 以及分配给每个 Agent 的具体子任务。

可用的 Agent：
${list}

请根据用户目标，选择 2-4 个最相关的 Agent，为每个 Agent 分配具体的子任务描述。
严格按照以下格式输出（不输出任何其他内容）：

<DISPATCH>[
  {"agentId": "pm-agent", "task": "针对[目标]，分析需求并拆解用户故事..."},
  {"agentId": "dev-agent", "task": "基于需求，实现[具体功能]..."}
]</DISPATCH>

⚠️ 重要：如果用户的目标与上述所有 Agent 的职责均不相关（例如日常问答、闲聊、通用知识查询、数学计算等），
请【不要】输出 <DISPATCH> 标签，而是直接用 Markdown 格式友好地回答用户的问题。`;
}

// ─── Dispatch Plan Parser ────────────────────────────────────────

export interface DispatchItem {
  agentId: string;
  task: string;
}

export function parseDispatchPlan(text: string): DispatchItem[] {
  const match = text.match(/<DISPATCH>([\s\S]*?)<\/DISPATCH>/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is DispatchItem =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.agentId === 'string' &&
          typeof item.task === 'string',
      );
    }
    return [];
  } catch {
    return [];
  }
}

// ─── @mention Parser ─────────────────────────────────────────────

export interface MentionParseResult {
  targetAgent: AutopilotAgent | null;
  /** @skill:xxx 匹配到的 Skill 名称（绕过 Pipeline 直接注入执行） */
  targetSkill: string | null;
  cleanText: string;
}

/**
 * 解析 @mention 语法。支持：
 * - @agentId / @agentName → 直接调用 Agent
 * - @skill:skillName → 直接以 Skill 上下文执行（绕过 Pipeline）
 */
export function parseMention(text: string, agents: AutopilotAgent[]): MentionParseResult {
  const match = text.match(/^@(\S+)\s*([\s\S]*)$/);
  if (!match) return { targetAgent: null, targetSkill: null, cleanText: text };
  const ref = match[1];
  const cleanText = (match[2] || text).trim() || text;

  // @skill:xxx → 直接调用 Skill，绕过 Pipeline
  const skillMatch = ref.match(/^skill:(.+)$/);
  if (skillMatch) {
    return { targetAgent: null, targetSkill: skillMatch[1], cleanText };
  }

  // @agentId / @agentName → 直接调用 Agent
  const agent = agents.find((a) => a.id === ref || a.name === ref);
  return { targetAgent: agent ?? null, targetSkill: null, cleanText };
}

// ─── Execution Types ─────────────────────────────────────────────

export type AgentExecutionStatus =
  | 'idle' | 'pending' | 'thinking' | 'working' | 'done' | 'error';

export interface OrchestratedRunOpts {
  workDir?: string;
  availableAgents: AutopilotAgent[];
  /** Agent 发现模式：solo（独立版）或 team（团队版），用于动态发现时选择内置兜底 */
  mode?: 'solo' | 'team';
  model?: { providerID: string; modelID: string };
  /** 注入 callAgent 实现，优先使用 store.actions.callAgent（复用 OpenWork client）*/
  callAgentFn?: (opts: CallAgentOptions) => Promise<void>;
  /** OpenWork Skill API 适配器（用于知识检索） */
  skillApi?: SkillApiAdapter | null;
  /** 工具权限请求回调，透传给各 Agent 的 callAgent 调用 */
  onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
  onOrchestrating?: (text: string) => void;
  onOrchestratorDone?: (plan: DispatchItem[]) => void;
  onAgentStatus?: (agentId: string, status: AgentExecutionStatus) => void;
  onAgentStream?: (agentId: string, text: string) => void;
  onDone?: (results: Record<string, string>) => void;
  /** 当 Orchestrator 未生成调度计划时，以大模型直接回答用户（无 Agent 匹配时的降级路径）*/
  onDirectAnswer?: (text: string) => void;
  onError?: (err: string) => void;
}

// ─── runOrchestratedAutopilot ─────────────────────────────────────

export async function runOrchestratedAutopilot(
  goal: string,
  opts: OrchestratedRunOpts,
): Promise<void> {
  const { workDir, model } = opts;
  const invoke = opts.callAgentFn ?? callAgent;

  // ── 知识检索与回忆（异步并行，不阻塞主流程）──
  let knowledgeContext = '';
  let recallContext = '';
  try {
    const [knowledgeResult, recallResult] = await Promise.all([
      workDir
        ? retrieveKnowledge({
            workDir,
            skillApi: opts.skillApi ?? null,
            query: goal,
            scene: 'autopilot',
          })
        : Promise.resolve(''),
      workDir
        ? recallRelevantContext(workDir, goal).then(r => r.contextText)
        : Promise.resolve(''),
    ]);
    knowledgeContext = knowledgeResult;
    recallContext = recallResult;
  } catch (e) {
    console.warn('[autopilot-executor] knowledge/recall retrieval failed:', e);
  }

  // Agent 动态发现：如果调用方已提供 Agent 列表则直接使用，否则从 .opencode/agents/ 动态发现
  const availableAgents: AutopilotAgent[] = opts.availableAgents.length > 0
    ? opts.availableAgents
    : await listAllAgents(opts.mode ?? 'solo');

  const orchestratorSystemPrompt = buildOrchestratorSystemPrompt(availableAgents);

  // Phase 1: Orchestrator 决定调用哪些 Agent
  // agentId='orchestrator' → OpenCode 从 .opencode/agents/orchestrator.md 原生加载 systemPrompt
  // 不再手动传 systemPrompt（避免双重注入）
  let orchestratorOutput = '';
  let phase1Ok = false;

  await new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };
    invoke({
      title: `xingjing-orchestrator-${Date.now()}`,
      directory: workDir,
      // systemPrompt 由 OpenCode 从 orchestrator.md 原生加载，不重复注入
      userPrompt: goal,
      model,
      agentId: 'orchestrator',
      knowledgeContext,
      recallContext,
      onPermissionAsked: opts.onPermissionAsked,
      onText: (accumulated) => {
        orchestratorOutput = accumulated;
        opts.onOrchestrating?.(accumulated);
      },
      onDone: (fullText) => {
        orchestratorOutput = fullText;
        phase1Ok = true;
        safeResolve();
      },
      onError: (err) => {
        try { opts.onError?.(`Orchestrator 调用失败: ${err}`); } finally { safeResolve(); }
      },
    }).catch((err: unknown) => {
      try {
        const msg = err instanceof Error ? err.message : String(err);
        opts.onError?.(`Orchestrator 调用异常: ${msg}`);
      } finally {
        safeResolve();
      }
    });
  });

  if (!phase1Ok) return;

  const plan = parseDispatchPlan(orchestratorOutput);
  if (plan.length === 0) {
    // Orchestrator 未生成有效调度计划：
    // - 若模型已直接回答（有输出内容），走直接回答降级路径
    // - 若输出为空，说明调用本身失败，才报错
    if (orchestratorOutput.trim()) {
      opts.onDirectAnswer?.(orchestratorOutput);
    } else {
      opts.onError?.('Orchestrator 未输出有效的调度计划，请检查模型是否已配置');
    }
    return;
  }

  opts.onOrchestratorDone?.(plan);

  // Phase 2: 并发调用各 Agent
  const results: Record<string, string> = {};

  await Promise.all(
    plan.map(async ({ agentId, task }) => {
      const agentDef = availableAgents.find((a) => a.id === agentId);
      if (!agentDef) return;

      opts.onAgentStatus?.(agentId, 'thinking');

      // 动态注入 Agent 关联的 Skill 上下文（通过 system 参数独立注入）
      const skillContext = await injectSkillContext(agentDef.injectSkills ?? [], opts.skillApi ?? null);

      return new Promise<void>((resolve) => {
        let resolved = false;
        const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };
        invoke({
          title: `xingjing-agent-${agentId}-${Date.now()}`,
          directory: workDir,
          // systemPrompt 由 OpenCode 从 .md 原生加载，不重复注入
          userPrompt: task,
          model,
          skillContext,
          knowledgeContext,
          // 子 Agent 不重复注入回忆上下文（已在 Orchestrator 层使用）
          // 传递 OpenCode Agent ID（若来自文件发现则有值，否则 undefined）
          agentId: (agentDef as RegisteredAgent).opencodeAgentId,
          onPermissionAsked: opts.onPermissionAsked,
          onText: (accumulated) => {
            opts.onAgentStatus?.(agentId, 'working');
            opts.onAgentStream?.(agentId, accumulated);
          },
          onDone: (fullText) => {
            try {
              results[agentId] = fullText;
              opts.onAgentStatus?.(agentId, 'done');
              // 异步沉淀 Agent 产出
              void sinkAgentOutput({
                output: fullText,
                agentId,
                sessionId: `autopilot-${Date.now()}`,
                workDir: workDir ?? '',
                skillApi: opts.skillApi ?? null,
                goal,
              });
            } finally {
              safeResolve();
            }
          },
          onError: (err) => {
            try {
              results[agentId] = `执行错误: ${err}`;
              opts.onAgentStatus?.(agentId, 'error');
            } finally {
              safeResolve();
            }
          },
        }).catch((err: unknown) => {
          try {
            const msg = err instanceof Error ? err.message : String(err);
            results[agentId] = `执行异常: ${msg}`;
            opts.onAgentStatus?.(agentId, 'error');
          } finally {
            safeResolve();
          }
        });
      });
    }),
  );

  opts.onDone?.(results);
}

// ─── runDirectAgent ───────────────────────────────────────────────

export async function runDirectAgent(
  agent: AutopilotAgent,
  prompt: string,
  opts: {
    workDir?: string;
    model?: { providerID: string; modelID: string };
    /** 注入 callAgent 实现，优先使用 store.actions.callAgent（复用 OpenWork client）*/
    callAgentFn?: (options: CallAgentOptions) => Promise<void>;
    /** OpenWork Skill API 适配器（用于动态 Skill 注入） */
    skillApi?: SkillApiAdapter | null;
    /** 工具权限请求回调，透传给 callAgent */
    onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
    onStatus?: (status: AgentExecutionStatus) => void;
    onStream?: (text: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  },
): Promise<void> {
  const invoke = opts.callAgentFn ?? callAgent;
  opts.onStatus?.('thinking');

  // 动态注入 Agent 关联的 Skill 上下文（通过 system 参数独立注入）
  const skillContext = await injectSkillContext(agent.injectSkills ?? [], opts.skillApi ?? null);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };
    invoke({
      title: `xingjing-direct-${agent.id}-${Date.now()}`,
      directory: opts.workDir,
      // systemPrompt 由 OpenCode 从 .md 原生加载，不重复注入
      userPrompt: prompt,
      model: opts.model,
      skillContext,
      // 传递 OpenCode Agent ID（若来自文件发现则有值）
      agentId: (agent as RegisteredAgent).opencodeAgentId,
      onPermissionAsked: opts.onPermissionAsked,
      onText: (accumulated) => {
        opts.onStatus?.('working');
        opts.onStream?.(accumulated);
      },
      onDone: (fullText) => {
        try {
          opts.onStatus?.('done');
          opts.onDone?.(fullText);
        } finally {
          safeResolve();
        }
      },
      onError: (err) => {
        try {
          opts.onStatus?.('error');
          opts.onError?.(err);
        } finally {
          safeResolve();
        }
      },
    }).catch((err: unknown) => {
      try {
        opts.onStatus?.('error');
        const msg = err instanceof Error ? err.message : String(err);
        opts.onError?.(`调用异常: ${msg}`);
      } finally {
        safeResolve();
      }
    });
  });
}

// ─── runDirectSkill ─────────────────────────────────────────────

/**
 * 直接以指定 Skill 上下文执行用户 prompt，绕过 Pipeline。
 * Skill 内容通过 injectSkillContext 注入到 session，使用默认 Agent 执行。
 *
 * 使用方式：用户输入 @skill:brainstorming 帮我分析这个需求
 */
export async function runDirectSkill(
  skillName: string,
  prompt: string,
  opts: {
    workDir?: string;
    model?: { providerID: string; modelID: string };
    callAgentFn?: (options: CallAgentOptions) => Promise<void>;
    skillApi?: SkillApiAdapter | null;
    onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
    onStatus?: (status: AgentExecutionStatus) => void;
    onStream?: (text: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  },
): Promise<void> {
  const invoke = opts.callAgentFn ?? callAgent;
  opts.onStatus?.('thinking');

  // 获取 Skill 内容注入为上下文
  const skillContext = await injectSkillContext([skillName], opts.skillApi ?? null);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => { if (!resolved) { resolved = true; resolve(); } };
    invoke({
      title: `xingjing-skill-${skillName}-${Date.now()}`,
      directory: opts.workDir,
      userPrompt: prompt,
      model: opts.model,
      skillContext,
      onPermissionAsked: opts.onPermissionAsked,
      onText: (accumulated) => {
        opts.onStatus?.('working');
        opts.onStream?.(accumulated);
      },
      onDone: (fullText) => {
        try {
          opts.onStatus?.('done');
          opts.onDone?.(fullText);
        } finally {
          safeResolve();
        }
      },
      onError: (err) => {
        try {
          opts.onStatus?.('error');
          opts.onError?.(err);
        } finally {
          safeResolve();
        }
      },
    }).catch((err: unknown) => {
      try {
        opts.onStatus?.('error');
        const msg = err instanceof Error ? err.message : String(err);
        opts.onError?.(`调用异常: ${msg}`);
      } finally {
        safeResolve();
      }
    });
  });
}

// ─── 原生 Session 调用（接入 OpenCode Agents 原语）─────────────────────────────

/**
 * 通过 OpenCode 原生 agentID 创建 session 并执行任务
 * OpenCode 会自动加载 .opencode/agents/{agentID}.md 作为 system prompt
 *
 * @param agentID  .opencode/agents/ 目录下的文件名（不含 .md）
 * @param task     发送给 Agent 的任务描述
 * @param workDir  产品工作目录
 * @param opts     回调选项
 */
export async function runAgentByNativeId(
  agentID: string,
  task: string,
  workDir: string,
  opts: {
    onToken?: (token: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  } = {},
): Promise<void> {
  await callAgent({
    agentId: agentID,           // 传给 session.create（OpenCode 原生加载对应 .md 文件）
    userPrompt: task,
    directory: workDir,
    onText: opts.onToken,
    onDone: opts.onDone,
    onError: opts.onError,
  });
}
