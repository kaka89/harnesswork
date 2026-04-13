# Autopilot 融合 OpenWork Orchestrator 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将团队版和独立版 Autopilot 的 `handleStart()` 替换为两阶段真实 AI 调度：Phase 1 调用 Orchestrator 解析意图 → 输出 `<DISPATCH>` JSON 计划 → Phase 2 并发调用各 Agent，每个 Agent 独立 SSE session 独立流式输出到 UI；同时支持在输入框中 `@mention` 直接跳过 Orchestrator 调用指定 Agent。后端零存储，OpenCode 不可用时降级至 mock 动画。

**Architecture:** 新增 `services/autopilot-executor.ts` 封装两阶段调度逻辑（内置 Agent 定义 + system prompt + `parseDispatchPlan` + `runOrchestratedAutopilot` + `runDirectAgent`），新增 `components/autopilot/mention-input.tsx` 提供 @mention 自动补全，两个 Autopilot 页面改用新执行器替换原有 mock/aiSessionsApi 逻辑，原有 mock 动画保留作为 fallback。

**Tech Stack:** SolidJS · `callAgent()` (opencode-client.ts) · OpenCode SSE streaming

---

## 文件结构

| 路径（相对 harnesswork/apps/app/src/app/xingjing/） | 操作 | 说明 |
|---|---|---|
| `services/autopilot-executor.ts` | 新增 | 内置 Agent 定义、orchestrator prompt 构建、dispatch 解析、两阶段执行器 |
| `components/autopilot/mention-input.tsx` | 新增 | @mention 自动补全 textarea |
| `pages/autopilot/index.tsx` | 修改 | 团队版：替换 handleStart、state、timeline |
| `pages/solo/autopilot/index.tsx` | 修改 | 独立版：替换 handleStart、state |

---

### Task 1：创建 `services/autopilot-executor.ts`

**Files:**
- Create: `apps/app/src/app/xingjing/services/autopilot-executor.ts`

- [ ] **Step 1：创建文件，写入类型定义和内置 Agent 数据**

  创建文件 `apps/app/src/app/xingjing/services/autopilot-executor.ts`，内容如下（第一段：类型 + Agent 定义）：

  ```typescript
  /**
   * Autopilot Executor
   * 两阶段 Agent 调度：Orchestrator 解析意图 → 并发调用子 Agent
   * 支持 @mention 直接调用，零后端存储，OpenCode 不可用时降级 mock。
   */
  import { callAgent } from './opencode-client';

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

  const OUTPUT_FORMAT = `
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
  ```

- [ ] **Step 2：追加 Orchestrator prompt 构建 + dispatch 解析函数**

  在同一文件尾部追加：

  ```typescript
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
  ```

- [ ] **Step 3：追加执行器类型和核心函数**

  继续在同一文件尾部追加：

  ```typescript
  // ─── Execution Types ─────────────────────────────────────────────

  export type AgentExecutionStatus =
    | 'idle' | 'pending' | 'thinking' | 'working' | 'done' | 'error';

  export interface OrchestratedRunOpts {
    workDir?: string;
    availableAgents: AutopilotAgent[];
    model?: { providerID: string; modelID: string };
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
    const orchestratorSystemPrompt = buildOrchestratorSystemPrompt(availableAgents);

    // Phase 1: Orchestrator 决定调用哪些 Agent
    let orchestratorOutput = '';
    let phase1Ok = false;

    await new Promise<void>((resolve) => {
      callAgent({
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
          callAgent({
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
      onStatus?: (status: AgentExecutionStatus) => void;
      onStream?: (text: string) => void;
      onDone?: (fullText: string) => void;
      onError?: (err: string) => void;
    },
  ): Promise<void> {
    opts.onStatus?.('thinking');
    callAgent({
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
      },
      onError: (err) => {
        opts.onStatus?.('error');
        opts.onError?.(err);
      },
    });
  }
  ```

- [ ] **Step 4：确认文件无 TypeScript 错误**

  在 harnesswork 目录运行：
  ```bash
  cd harnesswork && pnpm --filter @harnesswork/app exec tsc --noEmit 2>&1 | head -30
  ```
  若报 `callAgent` 相关类型错误，检查 `opencode-client.ts` 中 `CallAgentOptions` 导出是否正确。

- [ ] **Step 5：提交**

  ```bash
  cd harnesswork
  git add apps/app/src/app/xingjing/services/autopilot-executor.ts
  git commit -m "feat(autopilot): add autopilot-executor service - orchestrator + dispatch parser + agent defs"
  ```

---

### Task 2：创建 `components/autopilot/mention-input.tsx`

**Files:**
- Create: `apps/app/src/app/xingjing/components/autopilot/mention-input.tsx`

- [ ] **Step 1：创建文件**

  创建 `apps/app/src/app/xingjing/components/autopilot/mention-input.tsx`：

  ```tsx
  import { createSignal, Show, For } from 'solid-js';
  import type { AutopilotAgent } from '../../services/autopilot-executor';
  import { themeColors } from '../../utils/colors';

  interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    agents: AutopilotAgent[];
    style?: Record<string, string>;
  }

  const MentionInput = (props: MentionInputProps) => {
    const [showDropdown, setShowDropdown] = createSignal(false);
    const [mentionQuery, setMentionQuery] = createSignal('');
    let textareaRef: HTMLTextAreaElement | undefined;

    const filteredAgents = () => {
      const q = mentionQuery().toLowerCase();
      return props.agents.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      );
    };

    const handleInput = (e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
      const value = e.currentTarget.value;
      props.onChange(value);
      const lastAt = value.lastIndexOf('@');
      if (lastAt >= 0) {
        const after = value.slice(lastAt + 1);
        if (!after.includes(' ') && !after.includes('\n')) {
          setMentionQuery(after);
          setShowDropdown(true);
          return;
        }
      }
      setShowDropdown(false);
    };

    const selectAgent = (agent: AutopilotAgent) => {
      const val = props.value;
      const lastAt = val.lastIndexOf('@');
      const newValue =
        lastAt >= 0 ? val.slice(0, lastAt) + `@${agent.id} ` : val;
      props.onChange(newValue);
      setShowDropdown(false);
      textareaRef?.focus();
    };

    return (
      <div style={{ position: 'relative', ...props.style }}>
        <textarea
          ref={textareaRef}
          value={props.value}
          onInput={handleInput}
          disabled={props.disabled}
          placeholder={props.placeholder}
          style={{
            width: '100%',
            'min-height': '80px',
            'font-size': '14px',
            padding: '8px 12px',
            border: `1px solid ${themeColors.border}`,
            'border-radius': '6px',
            'font-family': 'inherit',
            resize: 'vertical',
            'box-sizing': 'border-box',
          }}
        />
        <Show when={showDropdown() && filteredAgents().length > 0}>
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '0',
              'margin-bottom': '4px',
              background: themeColors.surface,
              border: `1px solid ${themeColors.border}`,
              'border-radius': '8px',
              'box-shadow': '0 4px 16px rgba(0,0,0,0.12)',
              'z-index': '200',
              'min-width': '220px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                'font-size': '11px',
                color: themeColors.textMuted,
                'border-bottom': `1px solid ${themeColors.border}`,
              }}
            >
              直接调用 Agent（跳过 Orchestrator）
            </div>
            <For each={filteredAgents()}>
              {(agent) => (
                <div
                  onClick={() => selectAgent(agent)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '10px',
                    'align-items': 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      themeColors.hover;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      'transparent';
                  }}
                >
                  <span style={{ 'font-size': '20px' }}>{agent.emoji}</span>
                  <div>
                    <div
                      style={{
                        'font-weight': '600',
                        'font-size': '13px',
                        color: themeColors.text,
                      }}
                    >
                      {agent.name}
                    </div>
                    <div
                      style={{ 'font-size': '11px', color: themeColors.textMuted }}
                    >
                      @{agent.id} · {agent.description}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    );
  };

  export default MentionInput;
  ```

- [ ] **Step 2：提交**

  ```bash
  cd harnesswork
  git add apps/app/src/app/xingjing/components/autopilot/mention-input.tsx
  git commit -m "feat(autopilot): add MentionInput component with @mention autocomplete"
  ```

---

### Task 3：改造团队版 Autopilot (`pages/autopilot/index.tsx`)

**Files:**
- Modify: `apps/app/src/app/xingjing/pages/autopilot/index.tsx`

- [ ] **Step 1：替换 import 语句**

  找到文件顶部 import 区域，将：
  ```tsx
  import { useAppStore } from '../../stores/app-store';
  import { aiSessionsApi } from '../../api';
  import { themeColors, chartColors } from '../../utils/colors';
  ```
  替换为：
  ```tsx
  import { useAppStore } from '../../stores/app-store';
  import { themeColors, chartColors } from '../../utils/colors';
  import {
    TEAM_AGENTS,
    runOrchestratedAutopilot,
    runDirectAgent,
    parseMention,
    parseDispatchPlan,
    type DispatchItem,
    type AgentExecutionStatus,
  } from '../../services/autopilot-executor';
  import MentionInput from '../../components/autopilot/mention-input';
  ```
  同时删除 `import { teamAgents, ... } from '../../mock/autopilot'` 中的 `teamAgents`（保留 `teamWorkflowSteps` 和 `teamSampleGoals` 用于 mock 降级）：
  ```tsx
  import {
    teamWorkflowSteps,
    teamSampleGoals,
    type AgentDef,
    type WorkflowStep,
    type AgentStatus,
  } from '../../mock/autopilot';
  ```

- [ ] **Step 2：在 `EnterpriseAutopilot` 组件中添加新状态信号**

  找到 `const [sessionResult, setSessionResult] = createSignal` 和 `const [sessionId, setSessionId] = createSignal` 和 `const [isUsingApi, setIsUsingApi] = createSignal` 这三行，将它们全部替换为：

  ```tsx
  const [orchestratorText, setOrchestratorText] = createSignal('');
  const [dispatchPlan, setDispatchPlan] = createSignal<DispatchItem[]>([]);
  const [agentStreamTexts, setAgentStreamTexts] = createSignal<Record<string, string>>({});
  const [agentExecStatuses, setAgentExecStatuses] = createSignal<Record<string, AgentExecutionStatus>>({});
  ```

- [ ] **Step 3：更新 `reset()` 函数**

  找到 `const reset = () => {` 函数，将其全部替换为：

  ```tsx
  const reset = () => {
    clearTimers();
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(TEAM_AGENTS.map((a) => [a.id, 'idle'])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setProgress(0);
    setOrchestratorText('');
    setDispatchPlan([]);
    setAgentStreamTexts({});
    setAgentExecStatuses({});
  };
  ```

- [ ] **Step 4：替换 `handleStart` 函数**

  找到整个 `const handleStart = async () => {` 函数（从函数定义到第一个 `};`，即 `onCleanup(cleanup);` 那段），将其整体替换为：

  ```tsx
  const handleStart = async () => {
    if (!goal().trim()) return;
    reset();
    setRunState('running');

    const workDir = store.productStore.activeProduct()?.workDir;
    const { targetAgent, cleanText } = parseMention(goal(), TEAM_AGENTS);

    if (targetAgent) {
      // @mention 直接调用模式：跳过 Orchestrator
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        onStatus: (status) => {
          const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
            idle: 'idle', pending: 'waiting', thinking: 'thinking',
            working: 'working', done: 'done', error: 'done',
          };
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: legacyMap[status] }));
        },
        onStream: (text) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: text }));
          setProgress(50);
        },
        onDone: (fullText) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: fullText }));
          setProgress(100);
          setRunState('done');
        },
        onError: (err) => {
          console.warn('[autopilot] direct agent failed, falling back to mock:', err);
          startMockSimulation();
        },
      });
      return;
    }

    // Orchestrated 模式：两阶段调度
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: TEAM_AGENTS,
      workDir,
      onOrchestrating: (text) => {
        setOrchestratorText(text);
        setProgress(10);
      },
      onOrchestratorDone: (plan) => {
        setDispatchPlan(plan);
        const statuses: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => {
          statuses[agentId] = 'pending';
        });
        setAgentExecStatuses(statuses);
        setProgress(20);
      },
      onAgentStatus: (agentId, status) => {
        setAgentExecStatuses((prev) => ({ ...prev, [agentId]: status }));
        const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
          idle: 'idle', pending: 'waiting', thinking: 'thinking',
          working: 'working', done: 'done', error: 'done',
        };
        setAgentStatuses((prev) => ({ ...prev, [agentId]: legacyMap[status] }));
      },
      onAgentStream: (agentId, text) => {
        setAgentStreamTexts((prev) => ({ ...prev, [agentId]: text }));
        const doneCount = Object.values(agentExecStatuses()).filter(
          (s) => s === 'done',
        ).length;
        setProgress(
          20 + Math.round((doneCount / Math.max(dispatchPlan().length, 1)) * 70),
        );
      },
      onDone: (results) => {
        // 从 Agent 输出中提取产出物
        const artifactSteps: WorkflowStep[] = [];
        Object.entries(results).forEach(([agentId, text]) => {
          const agent = TEAM_AGENTS.find((a) => a.id === agentId);
          const artMatch = text.match(/###\s+产出物[：:]\s*(.+)\n([\s\S]+)/);
          if (artMatch && agent) {
            artifactSteps.push({
              id: `real-${agentId}`,
              agentId,
              agentName: agent.name,
              action: '执行完成',
              output: '',
              durationMs: 0,
              artifact: {
                title: artMatch[1].trim(),
                content: artMatch[2].trim().slice(0, 500),
              },
            });
          }
        });
        setArtifacts(artifactSteps);
        setProgress(100);
        setRunState('done');
      },
      onError: (err) => {
        console.warn('[autopilot] orchestration failed, falling back to mock:', err);
        startMockSimulation();
      },
    });
  };
  ```

- [ ] **Step 5：更新 AgentCard 数据源（TEAM_AGENTS → mock teamAgents 类型兼容）**

  找到 `<For each={teamAgents}>` 所在位置，将其替换为：
  ```tsx
  <For each={TEAM_AGENTS}>
  ```
  （TEAM_AGENTS 与原 teamAgents 字段完全兼容：id, name, role, color, bgColor, borderColor, emoji, skills, description 均存在。）

- [ ] **Step 6：替换 Goal Input 区的 `<textarea>` 为 `<MentionInput>`**

  找到 `<textarea` 节点（`value={goal()}` 那一段），将整个 `<textarea ... />` 替换为：

  ```tsx
  <MentionInput
    value={goal()}
    onChange={setGoal}
    disabled={runState() === 'running'}
    placeholder="描述你的目标，或输入 @ 直接调用某个 Agent，例如：为苍穹财务增加「智能费用报销审批」功能..."
    agents={TEAM_AGENTS}
    style={{ 'margin-bottom': '12px' }}
  />
  ```

- [ ] **Step 7：在执行时间轴中添加 orchestrator + 流式 Agent 输出渲染**

  找到 timeline 区域中 `{visibleSteps().length === 0 ?` 这个条件渲染块。在整个条件渲染前（找到 `<div ref={timelineRef}` 外面的父 div），在 `<Show when={visibleSteps().length === 0}>` 的空状态 div **之后**、`<For each={visibleSteps()}>` **之前**，插入以下内容：

  ```tsx
  {/* Phase 1: Orchestrator 思考输出 */}
  <Show when={orchestratorText() && dispatchPlan().length === 0}>
    <div style={{
      padding: '10px 12px',
      background: themeColors.primaryBg,
      border: `1px solid ${themeColors.primaryBorder}`,
      'border-radius': '6px',
      'margin-bottom': '8px',
    }}>
      <div style={{ 'font-size': '12px', 'font-weight': 600, color: chartColors.primary, 'margin-bottom': '4px' }}>
        Orchestrator 规划中...
      </div>
      <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'white-space': 'pre-wrap', 'max-height': '120px', 'overflow-y': 'auto' }}>
        {orchestratorText()}
      </div>
    </div>
  </Show>

  {/* Phase 2: 各 Agent 流式输出 */}
  <For each={dispatchPlan()}>
    {(item) => {
      const agent = TEAM_AGENTS.find((a) => a.id === item.agentId);
      const text = () => agentStreamTexts()[item.agentId] ?? '';
      const execStatus = () => agentExecStatuses()[item.agentId] ?? 'pending';
      const isStreaming = () => execStatus() === 'thinking' || execStatus() === 'working';
      if (!agent) return null;
      return (
        <div style={{ 'padding-bottom': '12px', display: 'flex', gap: '12px' }}>
          <div style={{
            width: '20px', height: '20px', 'border-radius': '50%', 'flex-shrink': 0,
            'background-color': execStatus() === 'done' ? agent.color : 'transparent',
            border: isStreaming() ? `2px solid ${agent.color}` : `2px solid ${themeColors.border}`,
            display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          }}>
            <Show when={isStreaming()}>
              <Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} />
            </Show>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
              <span style={{
                display: 'inline-block', background: agent.color, color: 'white',
                padding: '0 6px', 'border-radius': '4px', 'font-size': '11px',
              }}>
                {agent.name}
              </span>
              <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
                {item.task.slice(0, 40)}...
              </span>
            </div>
            <Show when={text()}>
              <div style={{
                'font-size': '11px', color: themeColors.textSecondary,
                'white-space': 'pre-wrap', 'line-height': '1.6',
                'max-height': '200px', 'overflow-y': 'auto',
                background: themeColors.hover, padding: '6px 8px', 'border-radius': '4px',
              }}>
                {text()}
              </div>
            </Show>
          </div>
        </div>
      );
    }}
  </For>
  ```

- [ ] **Step 8：删除不再使用的 `sessionResult` 相关渲染**

  找到 timeline 底部的 `runState() === 'done'` 完成提示块中：
  ```tsx
  {sessionResult() && (
    <div style={{ ... }}>
      实际结果：{sessionResult()}
    </div>
  )}
  ```
  将这段删除。

- [ ] **Step 9：确认构建无错误**

  ```bash
  cd harnesswork && pnpm --filter @harnesswork/app exec tsc --noEmit 2>&1 | head -40
  ```

- [ ] **Step 10：提交**

  ```bash
  cd harnesswork
  git add apps/app/src/app/xingjing/pages/autopilot/index.tsx
  git commit -m "feat(autopilot): integrate orchestrator into team autopilot - real AI dispatch with @mention support"
  ```

---

### Task 4：改造独立版 Autopilot (`pages/solo/autopilot/index.tsx`)

**Files:**
- Modify: `apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx`

- [ ] **Step 1：替换 import 语句**

  找到文件顶部的 `import { callAgent } from '../../../services/opencode-client';`，替换为：

  ```tsx
  import {
    SOLO_AGENTS,
    runOrchestratedAutopilot,
    runDirectAgent,
    parseMention,
    type DispatchItem,
    type AgentExecutionStatus,
  } from '../../../services/autopilot-executor';
  import MentionInput from '../../../components/autopilot/mention-input';
  ```

  同时将 mock import 改为（移除 `soloAgents`，保留用于 mock 降级的其他数据）：
  ```tsx
  import { soloWorkflowSteps, soloSampleGoals } from '../../../mock/autopilot';
  import type { AgentStatus, WorkflowStep } from '../../../mock/autopilot';
  ```

- [ ] **Step 2：在 `SoloAutopilot` 组件中添加新状态信号**

  在 `const [progress, setProgress] = createSignal(0);` 之后追加：

  ```tsx
  const [orchestratorText, setOrchestratorText] = createSignal('');
  const [dispatchPlan, setDispatchPlan] = createSignal<DispatchItem[]>([]);
  const [agentStreamTexts, setAgentStreamTexts] = createSignal<Record<string, string>>({});
  const [agentExecStatuses, setAgentExecStatuses] = createSignal<Record<string, AgentExecutionStatus>>({});
  ```

- [ ] **Step 3：更新 `reset()` 函数**

  找到 `const reset = () => {` 函数，在 `setProgress(0);` 之后追加：

  ```tsx
  setOrchestratorText('');
  setDispatchPlan([]);
  setAgentStreamTexts({});
  setAgentExecStatuses({});
  ```
  同时将 `setAgentStatuses(Object.fromEntries(soloAgents.map(...)))` 改为：
  ```tsx
  setAgentStatuses(Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle'])));
  ```

- [ ] **Step 4：替换 `handleStart` 函数**

  找到整个 `const handleStart = () => {` 函数（从函数定义到对应的 `};`），将其完整替换为：

  ```tsx
  const handleStart = async () => {
    if (!goal().trim()) return;
    reset();
    setRunState('running');

    const workDir = productStore.activeProduct()?.workDir;
    const { targetAgent, cleanText } = parseMention(goal(), SOLO_AGENTS);

    if (targetAgent) {
      // @mention 直接调用模式
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        onStatus: (status) => {
          const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
            idle: 'idle', pending: 'waiting', thinking: 'thinking',
            working: 'working', done: 'done', error: 'done',
          };
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: legacyMap[status] }));
        },
        onStream: (text) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: text }));
          setProgress(50);
        },
        onDone: (fullText) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: fullText }));
          setProgress(100);
          setRunState('done');
        },
        onError: (err) => {
          console.warn('[solo-autopilot] direct agent failed, fallback to mock:', err);
          runMockSimulation();
        },
      });
      return;
    }

    // Orchestrated 两阶段模式
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: SOLO_AGENTS,
      workDir,
      onOrchestrating: (text) => {
        setOrchestratorText(text);
        setProgress(10);
      },
      onOrchestratorDone: (plan) => {
        setDispatchPlan(plan);
        const statuses: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => { statuses[agentId] = 'pending'; });
        setAgentExecStatuses(statuses);
        setProgress(20);
      },
      onAgentStatus: (agentId, status) => {
        setAgentExecStatuses((prev) => ({ ...prev, [agentId]: status }));
        const legacyMap: Record<AgentExecutionStatus, AgentStatus> = {
          idle: 'idle', pending: 'waiting', thinking: 'thinking',
          working: 'working', done: 'done', error: 'done',
        };
        setAgentStatuses((prev) => ({ ...prev, [agentId]: legacyMap[status] }));
      },
      onAgentStream: (agentId, text) => {
        setAgentStreamTexts((prev) => ({ ...prev, [agentId]: text }));
        const doneCount = Object.values(agentExecStatuses()).filter(
          (s) => s === 'done',
        ).length;
        setProgress(
          20 + Math.round((doneCount / Math.max(dispatchPlan().length, 1)) * 70),
        );
      },
      onDone: (results) => {
        // 将 Agent 结果解析为 visibleSteps 供现有 UI 展示
        const steps: WorkflowStep[] = [];
        Object.entries(results).forEach(([agentId, text]) => {
          const agent = SOLO_AGENTS.find((a) => a.id === agentId);
          const actionMatch = text.match(/##\s+执行动作\s*\n([^\n]+)/);
          const artMatch = text.match(/###\s+产出物[：:]\s*(.+)\n([\s\S]+)/);
          if (agent) {
            steps.push({
              id: `real-${agentId}`,
              agentId,
              agentName: agent.name,
              action: actionMatch?.[1]?.trim() ?? '执行完成',
              output: text.slice(0, 200),
              durationMs: 0,
              artifact: artMatch
                ? { title: artMatch[1].trim(), content: artMatch[2].trim().slice(0, 500) }
                : undefined,
            });
          }
        });
        setVisibleSteps(steps);
        setArtifacts(steps.filter((s) => s.artifact));
        setProgress(100);
        setRunState('done');
      },
      onError: (err) => {
        console.warn('[solo-autopilot] orchestration failed, fallback to mock:', err);
        runMockSimulation();
      },
    });
  };
  ```

- [ ] **Step 5：更新 SoloBrainCard 数据源**

  找到 `<For each={soloAgents}>` 并替换为：
  ```tsx
  <For each={SOLO_AGENTS}>
  ```
  找到初始化 `agentStatuses` 的地方（`Object.fromEntries(soloAgents.map...)`），改为：
  ```tsx
  Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle']))
  ```
  找到初始化 `agentDone` 的地方（`Object.fromEntries(soloAgents.map...)`），改为：
  ```tsx
  Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 0]))
  ```

- [ ] **Step 6：替换 Goal Input 区的 `<textarea>` 为 `<MentionInput>`**

  找到 `<textarea` 节点（`value={goal()}` 那段，在 Goal Input 区），将整个 `<textarea ... />` 替换为：

  ```tsx
  <MentionInput
    value={goal()}
    onChange={setGoal}
    disabled={runState() === 'running'}
    placeholder="描述你的目标，或输入 @ 直接调用某个 Agent，例如：实现「段落一键重写」功能..."
    agents={SOLO_AGENTS}
    style={{ 'margin-bottom': '12px' }}
  />
  ```

- [ ] **Step 7：确认构建无错误**

  ```bash
  cd harnesswork && pnpm --filter @harnesswork/app exec tsc --noEmit 2>&1 | head -40
  ```

- [ ] **Step 8：提交**

  ```bash
  cd harnesswork
  git add apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx
  git commit -m "feat(autopilot): integrate orchestrator into solo autopilot - real AI dispatch with @mention support"
  ```

---

### Task 5：端到端验证

- [ ] **Step 1：启动开发服务器**

  ```bash
  cd harnesswork && pnpm dev
  ```

- [ ] **Step 2：验证 @mention 自动补全**

  打开 Autopilot 页（团队版或独立版），在输入框中输入 `@`，确认弹出 Agent 下拉列表。输入 `@pm` 确认过滤生效。选中一个 Agent，确认 `@agent-id ` 被插入输入框。

- [ ] **Step 3：验证 @mention 直接调用**

  输入 `@dev-agent 分析一下这个需求` 点击启动，确认只有 dev-agent 卡片进入 working 状态，其余保持 idle。OpenCode 可用时，确认 dev-agent 有流式文本输出。

- [ ] **Step 4：验证 Orchestrated 模式（OpenCode 可用时）**

  输入一个业务目标（无 @mention），点击启动。确认：
  - 进度条推进到 10%，Timeline 出现 "Orchestrator 规划中..." 面板
  - Orchestrator 输出后进度到 20%，Agent 卡片进入 pending/thinking 状态
  - 各 Agent 并发开始流式输出，Timeline 中每个 Agent 有独立文本卡片
  - 全部完成后产出物面板有数据

- [ ] **Step 5：验证 mock 降级（OpenCode 不可用时）**

  停止 OpenCode 服务（或断网），再次启动 Autopilot。确认：
  - 控制台出现 `[autopilot] orchestration failed, falling back to mock:` 警告
  - mock 动画正常播放，产出物正常出现

- [ ] **Step 6：最终提交**

  ```bash
  cd harnesswork
  git add .
  git commit -m "feat(autopilot): complete orchestrator integration - @mention, two-phase dispatch, streaming UI"
  ```
