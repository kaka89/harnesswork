/**
 * Autopilot Executor
 * 两阶段 Agent 调度：Orchestrator 解析意图 → 并发调用子 Agent
 * 支持 @mention 直接调用，零后端存储，OpenCode 不可用时降级 mock。
 */
import { callAgent, type CallAgentOptions } from './opencode-client';

// ─── Agent 定义 ─────────────────────────────────────────────────

export interface AutopilotAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  bgColor: string;
  borderColor: string;
  emoji: string;
  skills: string[];
  description: string;
  /** 直接传给 callAgent systemPrompt 的角色设定 */
  systemPrompt: string;
}

const OUTPUT_FORMAT: string = `
输出格式（严格遵循 Markdown）：
## 执行动作
（一句话概括你的行动）

## 执行结果
（要点列表，不超过 6 条，每行以"• "开头）

### 产出物：{产出物名称}
（产出内容，不超过 10 行）`;

export const TEAM_AGENTS: AutopilotAgent[] = [
  {
    id: 'pm-agent', name: 'AI产品搭档', role: '产品经理',
    color: '#1264e5', bgColor: '#e6f0ff', borderColor: '#91c5ff', emoji: '📋',
    skills: ['需求分析', 'PRD 生成', '优先级排序', '用户故事'],
    description: '分析需求、拆解用户故事、生成 PRD 草稿',
    systemPrompt: `你是 AI 产品搭档（PM Agent），专注于需求分析、用户故事拆解和 PRD 生成。你负责：1. 分析目标，识别核心用户故事；2. 拆解验收标准；3. 输出简洁 PRD 要点。${OUTPUT_FORMAT}`,
  },
  {
    id: 'arch-agent', name: 'AI架构搭档', role: '架构师',
    color: '#722ed1', bgColor: '#f9f0ff', borderColor: '#d3adf7', emoji: '🏗️',
    skills: ['系统设计', 'SDD 生成', 'API 规范', 'ADR 记录'],
    description: '评审 PRD、设计系统架构、生成 SDD 与接口契约',
    systemPrompt: `你是 AI 架构搭档（Architect Agent），专注于系统设计和技术决策。你负责：1. 评审需求，识别架构影响；2. 设计系统结构，输出选型决策；3. 生成 SDD 要点和 API 契约。${OUTPUT_FORMAT}`,
  },
  {
    id: 'dev-agent', name: 'AI开发搭档', role: '开发人员',
    color: '#08979c', bgColor: '#e6fffb', borderColor: '#87e8de', emoji: '💻',
    skills: ['代码生成', 'PR 提交', '单元测试', 'Code Review'],
    description: '按 SDD 实现功能、提交 PR、生成单元测试',
    systemPrompt: `你是 AI 开发搭档（Dev Agent），专注于功能实现和代码质量。你负责：1. 按需求设计实现方案；2. 描述具体实现步骤和涉及文件；3. 规划单元测试覆盖。${OUTPUT_FORMAT}`,
  },
  {
    id: 'qa-agent', name: 'AI测试搭档', role: 'QA 工程师',
    color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591', emoji: '🧪',
    skills: ['测试用例', '自动化测试', '回归测试', '质量门控'],
    description: '生成测试用例、执行自动化测试、输出质量报告',
    systemPrompt: `你是 AI 测试搭档（QA Agent），专注于质量保障。你负责：1. 生成测试用例（正向+边界）；2. 设计自动化测试方案；3. 输出质量报告。${OUTPUT_FORMAT}`,
  },
  {
    id: 'sre-agent', name: 'AI运维搭档', role: 'SRE',
    color: '#389e0d', bgColor: '#f6ffed', borderColor: '#b7eb8f', emoji: '🚀',
    skills: ['CI/CD', '发布管理', '监控告警', '回滚决策'],
    description: '触发流水线、执行部署、配置监控告警',
    systemPrompt: `你是 AI 运维搭档（SRE Agent），专注于部署和可靠性。你负责：1. 规划 CI/CD 流水线步骤；2. 描述部署策略和回滚方案；3. 配置监控和告警规则。${OUTPUT_FORMAT}`,
  },
  {
    id: 'mgr-agent', name: 'AI管理搭档', role: '管理层',
    color: '#cf1322', bgColor: '#fff2f0', borderColor: '#ffccc7', emoji: '📊',
    skills: ['进度汇总', '风险预警', '迭代报告', '效能分析'],
    description: '汇总执行结果、生成迭代报告、分析效能数据',
    systemPrompt: `你是 AI 管理搭档（Manager Agent），专注于进度汇总和效能分析。你负责：1. 汇总各角色执行结果；2. 识别风险点和阻碍项；3. 生成简洁迭代报告。${OUTPUT_FORMAT}`,
  },
];

export const SOLO_AGENTS: AutopilotAgent[] = [
  {
    id: 'product-brain', name: 'AI产品搭档', role: 'AI产品搭档',
    color: '#1264e5', bgColor: '#e6f0ff', borderColor: '#91c5ff', emoji: '🧠',
    skills: ['需求分析', '假设拆解', '用户洞察', '功能优先级'],
    description: '以产品经理视角分析目标，拆解为可验证的假设和功能点',
    systemPrompt: `你是 AI 产品搭档，以 solo 创业者视角分析目标。聚焦 MVP，识别最核心的用户价值，拆解为最小可验证的功能点。保持简洁，每个决策都要理由充分。${OUTPUT_FORMAT}`,
  },
  {
    id: 'eng-brain', name: 'AI工程搭档', role: 'AI工程搭档',
    color: '#08979c', bgColor: '#e6fffb', borderColor: '#87e8de', emoji: '⚙️',
    skills: ['技术方案', '代码实现', 'Bug 修复', '部署执行'],
    description: '选择最简技术方案，直接生成可运行代码，无需评审',
    systemPrompt: `你是 AI 工程搭档，偏好最简可用方案。直接给出技术选型、具体实现步骤和代码片段。不做过度设计，优先复用已有能力。${OUTPUT_FORMAT}`,
  },
  {
    id: 'growth-brain', name: 'AI增长搭档', role: 'AI增长搭档',
    color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591', emoji: '📈',
    skills: ['用户获取', '留存策略', '文案生成', '社区运营'],
    description: '制定增长策略，生成营销文案，规划用户触达方案',
    systemPrompt: `你是 AI 增长搭档，专注用户获取和留存。基于目标制定具体增长策略，生成可直接使用的营销文案和触达方案。${OUTPUT_FORMAT}`,
  },
  {
    id: 'ops-brain', name: 'AI运营搭档', role: 'AI运营搭档',
    color: '#389e0d', bgColor: '#f6ffed', borderColor: '#b7eb8f', emoji: '🔧',
    skills: ['数据监控', '发布管理', '客服回复', '故障处理'],
    description: '监控生产环境，处理用户反馈，执行日常运营任务',
    systemPrompt: `你是 AI 运营搭档，专注生产环境稳定和用户体验。规划监控方案、发布步骤，处理用户反馈，给出可直接执行的运营行动。${OUTPUT_FORMAT}`,
  },
];

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
]</DISPATCH>`;
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
  cleanText: string;
}

export function parseMention(text: string, agents: AutopilotAgent[]): MentionParseResult {
  const match = text.match(/^@(\S+)\s*([\s\S]*)$/);
  if (!match) return { targetAgent: null, cleanText: text };
  const ref = match[1];
  const agent = agents.find((a) => a.id === ref || a.name === ref);
  return {
    targetAgent: agent ?? null,
    cleanText: (match[2] || text).trim() || text,
  };
}

// ─── Execution Types ─────────────────────────────────────────────

export type AgentExecutionStatus =
  | 'idle' | 'pending' | 'thinking' | 'working' | 'done' | 'error';

export interface OrchestratedRunOpts {
  workDir?: string;
  availableAgents: AutopilotAgent[];
  model?: { providerID: string; modelID: string };
  /** 注入 callAgent 实现，优先使用 store.actions.callAgent（复用 OpenWork client）*/
  callAgentFn?: (opts: CallAgentOptions) => Promise<void>;
  onOrchestrating?: (text: string) => void;
  onOrchestratorDone?: (plan: DispatchItem[]) => void;
  onAgentStatus?: (agentId: string, status: AgentExecutionStatus) => void;
  onAgentStream?: (agentId: string, text: string) => void;
  onDone?: (results: Record<string, string>) => void;
  onError?: (err: string) => void;
}

// ─── runOrchestratedAutopilot ─────────────────────────────────────

export async function runOrchestratedAutopilot(
  goal: string,
  opts: OrchestratedRunOpts,
): Promise<void> {
  const { availableAgents, workDir, model } = opts;
  const invoke = opts.callAgentFn ?? callAgent;
  const orchestratorSystemPrompt = buildOrchestratorSystemPrompt(availableAgents);

  // Phase 1: Orchestrator 决定调用哪些 Agent
  let orchestratorOutput = '';
  let phase1Ok = false;

  await new Promise<void>((resolve) => {
    invoke({
      title: `xingjing-orchestrator-${Date.now()}`,
      directory: workDir,
      systemPrompt: orchestratorSystemPrompt,
      userPrompt: goal,
      model,
      onText: (accumulated) => {
        orchestratorOutput = accumulated;
        opts.onOrchestrating?.(accumulated);
      },
      onDone: (fullText) => {
        orchestratorOutput = fullText;
        phase1Ok = true;
        resolve();
      },
      onError: (err) => {
        opts.onError?.(`Orchestrator 调用失败: ${err}`);
        resolve();
      },
    });
  });

  if (!phase1Ok) return;

  const plan = parseDispatchPlan(orchestratorOutput);
  if (plan.length === 0) {
    opts.onError?.('Orchestrator 未输出有效的调度计划，请检查模型是否已配置');
    return;
  }

  opts.onOrchestratorDone?.(plan);

  // Phase 2: 并发调用各 Agent
  const results: Record<string, string> = {};

  await Promise.all(
    plan.map(({ agentId, task }) => {
      const agentDef = availableAgents.find((a) => a.id === agentId);
      if (!agentDef) return Promise.resolve();

      opts.onAgentStatus?.(agentId, 'thinking');

      return new Promise<void>((resolve) => {
        invoke({
          title: `xingjing-agent-${agentId}-${Date.now()}`,
          directory: workDir,
          systemPrompt: agentDef.systemPrompt,
          userPrompt: task,
          model,
          onText: (accumulated) => {
            opts.onAgentStatus?.(agentId, 'working');
            opts.onAgentStream?.(agentId, accumulated);
          },
          onDone: (fullText) => {
            results[agentId] = fullText;
            opts.onAgentStatus?.(agentId, 'done');
            resolve();
          },
          onError: (err) => {
            results[agentId] = `执行错误: ${err}`;
            opts.onAgentStatus?.(agentId, 'error');
            resolve();
          },
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
    onStatus?: (status: AgentExecutionStatus) => void;
    onStream?: (text: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  },
): Promise<void> {
  const invoke = opts.callAgentFn ?? callAgent;
  opts.onStatus?.('thinking');
  await new Promise<void>((resolve) => {
    void invoke({
      title: `xingjing-direct-${agent.id}-${Date.now()}`,
      directory: opts.workDir,
      systemPrompt: agent.systemPrompt,
      userPrompt: prompt,
      model: opts.model,
      onText: (accumulated) => {
        opts.onStatus?.('working');
        opts.onStream?.(accumulated);
      },
      onDone: (fullText) => {
        opts.onStatus?.('done');
        opts.onDone?.(fullText);
        resolve();
      },
      onError: (err) => {
        opts.onStatus?.('error');
        opts.onError?.(err);
        resolve();
      },
    });
  });
}
