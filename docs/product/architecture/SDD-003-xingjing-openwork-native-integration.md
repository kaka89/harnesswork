---
meta:
  id: SDD-003
  title: 星静全面接入 OpenWork 原生能力——设计方案
  status: proposed
  author: tech-lead
  created: "2026-04-16"
  updated: "2026-04-16"
---

# SDD-003 星静全面接入 OpenWork 原生能力——设计方案

## 1. 核心命题

ADR-001 识别了"星静重复实现了哪些 OpenWork 已有能力"。本文档回答更深的问题：

> **如果从第一天就以 OpenWork 为底座设计星静，每个功能域应该怎么做？**

OpenWork 提供了三层原生能力栈：

```
┌──────────────────────────────────────────────────────┐
│   OpenWork Server API  (/workspace/:id/*)             │  ← 工作区级配置/能力管理
│   skills · commands · plugins · mcp · scheduler      │
│   inbox · artifacts · audit · events · export        │
├──────────────────────────────────────────────────────┤
│   OpenCode SDK  (client.*)                            │  ← AI 执行原语
│   session · find · file · permission · config        │
├──────────────────────────────────────────────────────┤
│   OpenCode 原语  (.opencode/*)                        │  ← 可移植文件约定
│   agents · skills · commands · plugins · opencode.json│
└──────────────────────────────────────────────────────┘
```

星静的每一个业务功能都应先从这三层中找到原生接入点，只有在真正找不到对应能力时，才自行建设。

---

## 2. 核心概念对齐：产品 = 工作区

星静最重要的概念映射关系：

| 星静概念 | OpenWork 概念 | 说明 |
|---------|------------|------|
| `XingjingProduct` | `WorkspaceInfo` | 每个产品 = 一个 OpenWork 工作区 |
| `product.workDir` | `workspace.path` | 同一文件系统路径 |
| `product.id` | `workspace.id` | `workspaceIdForPath(workDir)` 确定性哈希 |
| 产品切换 | 工作区切换 (`workspace/:id/activate`) | 激活当前活跃工作区 |
| `~/.xingjing/products.yaml` | OpenWork workspace 注册表 | 由 OpenWork server 统一维护 |

**改造核心：停止维护 `products.yaml`，改为读写 OpenWork workspace 列表。**

```typescript
// 改造前：自维护 products.yaml
const data = await readYaml<XingjingProductsFile>(PRODUCTS_FILE, { products: [] });
setProducts(data.products);

// 改造后：读 OpenWork workspace 列表
const { items } = await openworkServer.listWorkspaces();
// items: WorkspaceInfo[] — 每个 item.path 即产品工作目录
setProducts(items.map(workspaceToProduct));
```

---

## 3. 功能域全面接入方案

### 3.1 产品创建与初始化

**现状：** `product-store.ts` + `product-dir-structure.ts` 自行创建目录、生成模板文件、执行 Git init（约 1750 行）。

**原生能力：** `POST /workspaces/local` → `ensureWorkspaceFiles(path, preset)` 自动在工作区注入 Skills / Agents / Commands / opencode.json + `.opencode/` 目录结构。**Blueprint Sessions** 机制在工作区首次加载时自动种子预置会话（`.opencode/openwork.json` 的 `blueprint.sessions` 字段）。

#### 接入方案

**Step 1：产品创建改调 `/workspaces/local`**

```typescript
// product-store.ts — 改造后的 createProduct
async function createProduct(input: {
  name: string;
  workDir: string;
  type: 'solo' | 'team';
}) {
  // 1. 通过 OpenWork server 创建并初始化工作区
  const workspace = await openworkServer.createLocalWorkspace({
    folderPath: input.workDir,
    name: input.name,
    preset: input.type === 'solo' ? 'xingjing-solo' : 'xingjing-team',
  });

  // 2. 向工作区写入星静专属 Blueprint（首次加载时自动种子会话）
  await openworkServer.patchWorkspaceConfig(workspace.id, {
    blueprint: buildXingjingBlueprint(input.type),
  });

  // 3. 安装星静专属 Skills（PM 助手、工程助手等）
  await installXingjingSkills(workspace.id, input.type);

  // 4. 写入星静专属 Agents（Product Brain / Eng Brain 等）
  await seedXingjingAgents(workspace.id, input.type);

  return workspace;
}
```

**Step 2：目录结构通过 Blueprint 种子，而非手写文件列表**

`product-dir-structure.ts` 的四层/六层目录模板改为：通过 `client.file.write()` 批量写入初始文档，或更好地——将目录结构编码到 **Skill** 中，让 AI 在首次对话时按 Skill 指引自动生成。

```markdown
<!-- .opencode/skills/xingjing-dir-structure.md -->
---
name: xingjing-dir-structure
description: 星静产品目录初始化规范
---

## 当产品目录刚创建时，建立如下四层结构
- governance-standards/（平台标准层，含 README.md）
- {product-line}/（产品线层）
  - {domain}/（领域层）
    - apps/{app}/（应用层，含 src/ tests/ docs/）
```

**削减代码：** `product-dir-structure.ts`（1200 行）可降至约 80 行（仅保留 Blueprint 配置构建函数）。

---

### 3.2 AI 对话与 Session 管理

**现状：** `ai-chat-drawer.tsx` + `opencode-client.ts::callAgent` 自行管理 SSE 流、session 生命周期、权限对话框、消息持久化。

**原生能力：** OpenCode SDK 完整的 `session.*` + `event.subscribe()` + `permission.reply()`。

#### 接入方案

**SSE 事件流 → 统一订阅**

OpenWork 主应用的 `context/workspace.ts` 已有全局 SSE 订阅（`/workspace/:id/events` → 代理到 OpenCode event stream）。星静的 AI 对话 **不应** 自建第二个 SSE 连接，而是：

```typescript
// ai-chat-drawer.tsx — 改造后
function AiChatDrawer(props) {
  const workspace = useWorkspace(); // OpenWork context
  const client = () => workspace.activeClient(); // 已有 client

  async function sendMessage(prompt: string) {
    // 1. 创建 / 复用 session（对应当前 product 的 workDir）
    const session = unwrap(await client().session.create({
      agentID: selectedAgent(),    // OpenCode 原生 Agents
      directory: props.workDir,
    }));

    // 2. 发送消息（SSE 流由全局 event 订阅驱动，无需自建）
    await client().session.prompt({
      sessionID: session.id,
      prompt,
    });
    // 3. UI 更新由已有 SSE 事件驱动
  }
}
```

**权限审批 → `permission.reply()`**

```typescript
// 全局 SSE 中处理 permission.request（替代 permission-dialog.tsx）
createEffect(() => {
  const unsubscribe = client().event.subscribe((event) => {
    if (event.type === 'permission.request') {
      setActivePermission(event); // 弹出 OpenWork 标准权限 UI
    }
  });
  onCleanup(unsubscribe);
});

// 用户审批
async function handleApprove(requestID: string, reply: 'once' | 'always' | 'reject') {
  await client().permission.reply({ requestID, reply });
}
```

**会话历史 → `session.list()` + `session.messages()`**

```typescript
// 改造后：历史会话列表
const sessions = unwrap(await client().session.list({
  directory: workDir,
}));

// 加载某次会话消息
const messages = unwrap(await client().session.messages({
  sessionID: id,
}));

// 会话摘要（替代 generateSessionSummary）
await client().session.summarize({
  sessionID: id,
  providerID: model.providerID,
  modelID: model.modelID,
});
```

**削减代码：** `chat-session-store.ts`、`memory-store.ts`、`memory-recall.ts` 共约 550 行可完全删除；`opencode-client.ts` 中 SSE 相关约 400 行可删除。

---

### 3.3 Agent 工坊

**现状：** Agent 工坊页面大量使用 Mock 数据，技能池展示来自 `mock/agentWorkshop.ts`，Agent 定义混合了内置常量和文件扫描（`agent-registry.ts`）。

**原生能力：** OpenWork Server 完整的三套能力管理 API：

| 功能 | OpenWork 原生 API | 说明 |
|-----|----------------|------|
| 技能（Skills）列表 | `GET /workspace/:id/skills` | project + global scope |
| 创建/更新技能 | `POST /workspace/:id/skills` | 写 `.opencode/skills/{name}/SKILL.md` |
| 从 Hub 安装技能 | `POST /workspace/:id/skills/hub/:name` | 从 `different-ai/openwork-hub` 安装 |
| 删除技能 | `DELETE /workspace/:id/skills/:name` | |
| 命令（Commands）列表 | `GET /workspace/:id/commands` | 可关联 Agent |
| 创建命令（= 工作流步骤） | `POST /workspace/:id/commands` | frontmatter: `agent`, `subtask` |
| 插件（Plugins）列表 | `GET /workspace/:id/plugins` | |
| 安装插件 | `POST /workspace/:id/plugins` | 写 opencode.json |
| MCP 服务器列表 | `GET /workspace/:id/mcp` | |

#### 接入方案：Agent 工坊页面全面重构

```typescript
// pages/solo/agent-workshop/index.tsx — 改造后
function AgentWorkshop() {
  const { openworkServer, selectedWorkspaceId } = useWorkspace();

  // 读取真实 Skills（替代 mock/agentWorkshop.ts 的 soloSkillPool）
  const [skills, setSkills] = createSignal<OpenworkSkillItem[]>([]);
  onMount(async () => {
    const items = await openworkServer.listSkills(selectedWorkspaceId(), { includeGlobal: true });
    setSkills(items);
  });

  // 读取真实 Commands（替代 mock 的 soloOrchestrations）
  const [commands, setCommands] = createSignal<CommandItem[]>([]);
  onMount(async () => {
    const items = await openworkServer.listCommands(selectedWorkspaceId());
    setCommands(items);
  });

  // Agent 定义：从 .opencode/agents/ 读取（用 client.file.list + read）
  // 写入新 Agent：通过 client.file.write('.opencode/agents/{id}.md', content)
  // 然后调用 markReloadRequired()

  async function createSkill(name: string, content: string, description: string) {
    await openworkServer.upsertSkill(selectedWorkspaceId(), { name, content, description });
    await markReloadRequired('skill_added', 'user');
  }

  async function createCommand(name: string, template: string, agentId: string) {
    await openworkServer.upsertCommand(selectedWorkspaceId(), {
      name, template, agent: agentId, subtask: true
    });
  }
}
```

**Skills = 行为知识的统一出口**

星静的"三源知识"中，"行为知识"应完全等同于 OpenWork 的 Skills。不再需要 `knowledge-behavior.ts` 的适配层——直接读 `listSkills(workspaceId)` 即为行为知识列表：

```typescript
// knowledge-behavior.ts 完全替换为：
async function listBehaviorKnowledge(workspaceId: string) {
  return openworkServer.listSkills(workspaceId, { includeGlobal: true });
}
```

Skills 的**创建和更新**（`knowledge-sink.ts` 的 Agent 产出沉淀）可通过：

```typescript
// knowledge-sink.ts — Agent 产出沉淀改为写入 Skill
await openworkServer.upsertSkill(workspaceId, {
  name: `learned-${kebabCase(topic)}`,
  content: agentOutput,
  description: `从 Autopilot 产出学到的：${topic}`,
});
await markReloadRequired('skill_updated');
```

---

### 3.4 Autopilot 多 Agent 编排

**现状：** `autopilot-executor.ts` 自建了两阶段编排协议（`<DISPATCH>` 标签 + JSON）和并发 SSE session 管理。

**原生能力：** OpenCode 的 **Commands** + **subtask** 机制 + **Agents** 原语联合实现真正的多 Agent 编排：

```
用户输入 → Orchestrator Agent Session
              ↓ 解析意图，调用 /command 触发子任务
    ┌─────────────────────────────────┐
    │ subtask command: analyze-prd     │  ← agent: product-brain
    │ subtask command: design-system   │  ← agent: eng-brain
    │ subtask command: growth-strategy │  ← agent: growth-brain
    └─────────────────────────────────┘
              ↓ 各 subtask 独立 session 并发执行
              ↓ 结果汇聚到 Orchestrator Session
```

#### 接入方案

**Step 1：将 Orchestrator 注册为正式 Agent**

```markdown
<!-- .opencode/agents/orchestrator.md -->
---
description: 星静 Autopilot 编排器，解析用户目标并分发给专业 Agent
mode: primary
temperature: 0.1
---

你是 Autopilot Orchestrator。当收到一个目标时：
1. 分析目标，决定需要哪些 Agent 协作
2. 对每个 Agent 发起 /delegate 命令（subtask 模式）
3. 等待所有 subtask 完成后汇总结果

可用 Agent 命令：
- /pm-task [描述] — 分配给 Product Brain
- /eng-task [描述] — 分配给 Engineering Brain
- /growth-task [描述] — 分配给 Growth Brain
- /ops-task [描述] — 分配给 Ops Brain
```

**Step 2：将各专业 Agent 的任务封装为 Commands（subtask: true）**

```typescript
// 安装时自动注册 subtask commands
await openworkServer.upsertCommand(workspaceId, {
  name: 'pm-task',
  description: 'Product Brain 子任务',
  template: '{{task}}',
  agent: 'product-brain',
  subtask: true,
});
```

**Step 3：Autopilot 执行改为单次 session.prompt**

```typescript
// autopilot-executor.ts — 改造后
async function executeAutopilot(goal: string, workDir: string) {
  const client = getXingjingClient();

  // 创建 Orchestrator session
  const session = unwrap(await client.session.create({
    agentID: 'orchestrator',
    directory: workDir,
  }));

  // 一次 prompt，Orchestrator 通过 subtask commands 自动分发
  await client.session.prompt({
    sessionID: session.id,
    prompt: goal,
  });

  // 事件流驱动 UI 更新（工件、进度、子任务结果均通过 SSE 事件推送）
}
```

**削减代码：** `autopilot-executor.ts` 约 462 行中，`<DISPATCH>` 协议 + 并发 SSE 管理（约 300 行）可完全删除；Agent 常量定义保留用于 UI 展示。

---

### 3.5 定时任务调度

**现状：** `scheduler-client.ts`（200 行）三层降级逻辑，与 `context/automations.ts` 完全重叠。

**原生能力：**
- `GET /workspace/:id/scheduler/jobs` — 列出该工作区的定时任务
- `DELETE /workspace/:id/scheduler/jobs/:name` — 删除任务
- 创建任务：通过 `session.prompt()` 向 `opencode-scheduler` 插件发指令（OpenWork automations 已实现的路径）

#### 接入方案

```typescript
// pages/planning/index.tsx — 改造后（定时任务管理）

// 列出任务：直接用 OpenWork server API
const jobs = await openworkServer.listScheduledJobs(workspaceId);

// 创建任务：沿用 automations.ts 的 buildCreateAutomationPrompt
import { buildCreateAutomationPrompt } from '../context/automations';

const plan = buildCreateAutomationPrompt({
  name: '每日站会摘要',
  prompt: '汇总今日任务状态，生成站会报告到 .xingjing/reports/standup-{date}.md',
  schedule: '0 9 * * 1-5',   // 工作日早 9 点
  workdir: workDir,
});

if (plan.ok) {
  // 通过 opencode-scheduler 插件创建任务（利用现有 Automations 路径）
  await executeAutomationPrompt(plan.prompt, workDir);
}
```

**星静 Agent 定时任务的语义：** 定时 prompt → 指定 Agent → 写入产出到工作区文件 → 存入 Artifacts。这个完整路径通过 OpenWork scheduler + Agents + Artifacts 原生支持，无需自建。

---

### 3.6 知识检索体系

**分层重构：** 保留有差异化价值的层，替换可用原生能力覆盖的层。

#### 可完全替换：行为知识 + 全文检索

```
星静 knowledge-behavior.ts + TF-IDF 检索
          ↓ 替换为
openworkServer.listSkills(workspaceId)     ← 行为知识
client.find.text({ query, directory })     ← 全文检索
client.find.files({ pattern, directory })  ← 文件发现
```

#### 保留并强化：三源知识的差异化层

`knowledge-scanner.ts`（dir-graph.yaml 驱动的文档层级扫描）和 `knowledge-health.ts`（知识过期检测）是星静真正的差异化能力，OpenWork 中无对应实现。但这两个服务可以在原生能力基础上**大幅简化**：

```typescript
// knowledge-scanner.ts — 简化后
// 不再需要手写文件扫描（用 client.find.files），
// 只需解析 dir-graph.yaml 定义的文档类型映射
async function scanWorkspaceDocuments(workDir: string) {
  const dirGraph = await loadDirGraph(workDir); // 保留

  // 文件发现改用 OpenCode find API（替代手写目录遍历）
  for (const docType of Object.keys(dirGraph.docTypes)) {
    const pattern = dirGraph.docTypes[docType].naming;
    const files = unwrap(await client.find.files({
      pattern,
      directory: workDir,
    }));
    // ...处理 files
  }
}
```

`knowledge-scanner.ts` 可从 462 行削减至约 200 行（保留业务语义，删除文件系统遍历代码）。

#### 知识沉淀（knowledge-sink）→ Skills + Artifacts

Agent 产出的知识沉淀有两个原生渠道：

```
可复用行为 → upsertSkill(workspaceId, { name, content })    ← .opencode/skills/
过程产物   → 写文件到 workDir，自动进入 /workspace/:id/artifacts  ← AI 产出记录
```

```typescript
// knowledge-sink.ts — 大幅简化后（约 60 行）
async function sinkAgentOutput(output: AgentOutput, workspaceId: string) {
  switch (output.category) {
    case 'reusable-skill':
      // 沉淀为 Skill（可重复调用的行为模式）
      await openworkServer.upsertSkill(workspaceId, {
        name: output.skillName,
        content: output.content,
        description: output.description,
      });
      break;

    case 'document':
      // 写入工作区文件（自动被 Artifacts 系统记录）
      await client.file.write({ path: output.path, content: output.content });
      break;
  }
}
```

---

### 3.7 流水线与 DAG 执行

**现状：** `pipeline-config.ts` + `pipeline-executor.ts`（约 460 行）+ 手写 YAML 解析器。

**原生能力：** OpenWork Server 的 `/workspace/:id/commands` 系统天然支持有向流程编排：

- 每个 Command 可指定 `agent`（执行主体）
- `subtask: true` 支持并发子任务
- 门控（await-approval）通过 `client.permission.reply()` 自然实现

#### 接入方案

**将 `orchestrator.yaml` 的 stages 注册为 Commands**

```typescript
// pipeline-config.ts 改为 pipeline-to-commands 转换器
async function installPipelineAsCommands(workspaceId: string, config: PipelineConfig) {
  for (const stage of config.stages) {
    await openworkServer.upsertCommand(workspaceId, {
      name: stage.id,
      description: stage.description,
      template: stage.agentPrompt ?? stage.description,
      agent: stage.agent,
      subtask: stage.parallel ?? false,
    });
  }
}
```

**流水线执行改为 Orchestrator 驱动**

```typescript
// pipeline-executor.ts 简化后 — 约 50 行
async function executePipeline(config: PipelineConfig, workDir: string) {
  const client = getXingjingClient();

  // 用 Orchestrator session 驱动整个流水线
  const session = unwrap(await client.session.create({
    agentID: 'orchestrator',
    directory: workDir,
  }));

  const pipelineGoal = buildPipelinePrompt(config); // 描述各阶段依赖关系
  await client.session.prompt({ sessionID: session.id, prompt: pipelineGoal });
  // Orchestrator 按依赖顺序调用 subtask commands，门控由 permission 系统处理
}
```

**削减：** `pipeline-executor.ts` 的 DAG 拓扑排序和并发执行逻辑（约 200 行）可完全删除；`pipeline-config.ts` 中的手写 YAML 解析器（约 120 行）替换为 `js-yaml`。

---

### 3.8 产品审计与 DORA 指标

**现状：** Dashboard 页面完全使用 Mock 数据，通过 `metricsApi` 调用 xingjing-server 后端，后端不存在真实数据。

**原生能力：** OpenWork Server 有**内置审计日志**系统（`/workspace/:id/audit`）：

```typescript
// 审计日志 Schema（来自 types.ts）
type AuditEntry = {
  type: string;          // 操作类型：session.prompt / skill.update / command.run 等
  actor: string;         // 执行者
  workspaceId: string;
  sessionId?: string;
  duration?: number;     // 执行耗时
  createdAt: number;
};
```

#### 接入方案：从审计日志计算 DORA 指标

```typescript
// 改造后的 Dashboard — 从 OpenWork 审计数据计算 DORA 指标
async function computeDoraMetrics(workspaceId: string) {
  const { items } = await openworkServer.getAuditEntries(workspaceId);

  // 部署频率 = session 执行成功次数 / 天
  const deployFreq = countByDay(items.filter(e => e.type === 'session.complete'));

  // 前置时间 = 需求创建到部署完成的平均 duration
  const leadTimes = computeLeadTimes(items);

  // 变更失败率 = session.error / session.complete
  const failRate = countErrors(items) / countCompletes(items);

  return { deployFreq, leadTimes, failRate };
}
```

这样 DORA 指标从"Mock 数据展示"变为**基于真实 AI 任务执行记录的计算**，符合星静"AI 驱动产品开发"的核心定位。

---

### 3.9 认证与多产品管理

**现状：** `auth-service.ts` 为单独的 `xingjing-server`（端口 4100）维护 JWT，用于 products/prds/tasks/backlog/sprints/knowledge/metrics/aiSessions 8 个 API 模块。

**原生能力 + 改造方向：**

这些 API 模块代表了星静的**业务数据层**（需求、任务、Sprint 等）。有两个方向：

**方向 A（推荐）：文件驱动，消除 xingjing-server 依赖**

将业务数据改为本地文件存储（`.opencode/` 目录下的 YAML/Markdown 文件），通过 `client.file.*` 读写，同时天然进入 Git 版本控制：

```
product-root/
  .opencode/
    openwork.json          ← 工作区配置（已有）
    skills/                ← 行为知识（已有）
    agents/                ← Agent 定义（已有）
    commands/              ← 工作流命令（已有）
  docs/
    prds/                  ← PRD 文档（Markdown，版本化）
    sdds/                  ← SDD 文档
  .xingjing/
    tasks/                 ← 任务（YAML，gitignored）
    sprints/               ← Sprint 数据（YAML）
    backlog/               ← Backlog（YAML）
```

`xingjing-server` 的 8 个 API 模块全部替换为本地文件操作，`auth-service.ts` 可完全删除。

**方向 B（保留 xingjing-server 但改为 MCP）**

将 `xingjing-server` 封装为 MCP 服务，通过 `/workspace/:id/mcp` 注册，这样 AI 可以直接调用 xingjing-server 的业务 API（不需要前端 HTTP 层）：

```typescript
// opencode.json — 改造后
{
  "mcp": {
    "xingjing": {
      "type": "local",
      "command": ["xingjing-server", "--mcp-mode"]
    }
  }
}
```

前端的 `productsApi / tasksApi / sprintsApi` 等可以删除，让 AI 直接通过 MCP 操作业务数据。

---

### 3.10 Reload 机制

**现状：** 星静在修改 `.opencode/agents/`、技能等之后没有触发 reload，导致 OpenCode 无法感知变更。

**原生能力：** OpenWork 的统一 reload 流程（`markReloadRequired(reason, trigger)` + `/workspace/:id/engine/reload`）。

**所有修改 OpenCode 启动配置的操作后都应触发：**

```typescript
// 在以下操作后调用 markReloadRequired：
// - 写入/删除 .opencode/agents/*.md
// - 写入/删除 .opencode/skills/*
// - 写入/删除 .opencode/commands/*.md
// - 修改 opencode.json（plugins / mcp / default_agent）

import { useSystemState } from '../context/system-state';
const { markReloadRequired } = useSystemState();

async function saveAgentDefinition(workspaceId: string, agentId: string, content: string) {
  await client.file.write({
    path: `.opencode/agents/${agentId}.md`,
    content,
  });
  markReloadRequired('agent_updated', 'user');  // 触发标准 reload 提示
}
```

---

## 4. 全面接入后的架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                   星静 UI 层（改造后）                            │
│                                                                 │
│  NewProductModal  → POST /workspaces/local                      │
│  AiChatDrawer     → client.session.* + event.subscribe()        │
│  AgentWorkshop    → /workspace/:id/skills + commands + plugins  │
│  Autopilot        → client.session.create(agentID:'orchestrator')│
│  Pipeline UI      → /workspace/:id/commands (subtask)           │
│  Scheduler UI     → /workspace/:id/scheduler/jobs               │
│  Dashboard        → /workspace/:id/audit → DORA 计算            │
│  KnowledgeSystem  → /workspace/:id/skills + client.find.*       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌─────────────────────┐         ┌────────────────────────┐
│  OpenWork Server     │         │  OpenCode SDK           │
│  /workspace/:id/*    │         │  client.session.*       │
│  skills / commands   │         │  client.find.*          │
│  plugins / mcp       │         │  client.file.*          │
│  scheduler / audit   │         │  client.permission.*    │
│  inbox / artifacts   │         │  client.config.*        │
│  events / export     │         └────────────────────────┘
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  .opencode/  文件约定（可移植，版本化）                            │
│  agents/  ·  skills/  ·  commands/  ·  openwork.json            │
│  opencode.json (plugins / mcp / default_agent)                  │
└─────────────────────────────────────────────────────────────────┘
```

**消失的层：**
- `xingjing-server` REST API（替换为文件驱动 or MCP）
- `auth-service.ts`（JWT 认证）
- `opencode-client.ts` 单例（合并到 workspace client）
- `chat-session-store.ts` / `memory-store.ts`（OpenCode session 原生）
- 三套手写 YAML 解析器（js-yaml 统一）
- `agent-registry.ts` 文件扫描（OpenCode 原生加载）
- `pipeline-executor.ts` DAG 引擎（Commands + Orchestrator）
- `scheduler-client.ts`（automations context）
- `permission-dialog.tsx`（OpenWork permission 流）

---

## 5. 星静差异化能力（不可替换，应持续建设）

以下是星静真正超出 OpenWork 原生能力、具备独特业务价值的部分：

| 差异化能力 | 所在文件 | 核心价值 |
|-----------|---------|---------|
| 四层/六层产品目录语义 | `product-dir-structure.ts`（保留核心语义） | 将软件研发结构化为可被 AI 理解的目录语言 |
| Dir-Graph 文档知识扫描 | `knowledge-scanner.ts`（保留并简化） | 将 PRD→SDD→Task 的文档链路关系图结构化 |
| 知识健康度检测 | `knowledge-health.ts` | 文档过期/不一致检测，OpenWork 中无原生 |
| 两阶段 Autopilot 编排语义 | `autopilot-executor.ts`（保留 prompt 设计） | `<DISPATCH>` 格式可保留为 Orchestrator Agent 的思维模式，即使底层换成 Commands |
| DORA 指标计算与可视化 | `pages/dashboard/index.tsx` | 结合审计日志的业务指标层 |
| 产品上下文注入 | `memory-recall.ts`（核心逻辑保留） | 将产品特定上下文（当前 Sprint 目标、关键决策）注入 AI |

---

## 6. 改造优先级矩阵

| 改造项 | 难度 | 收益 | 优先级 |
|-------|------|------|-------|
| 产品 = 工作区（停用 products.yaml） | 中 | 🔴 高（数据统一） | P0 |
| Session 改用 client.session.* | 低 | 🔴 高（消除双存储） | P0 |
| js-yaml 替换三套手写解析器 | 低 | 🟠 中（稳定性） | P0 |
| Agent 工坊接入 /skills + /commands | 中 | 🔴 高（真实数据） | P1 |
| 权限 UI 接入 permission.reply() | 低 | 🟠 中（一致性） | P1 |
| Autopilot 改用 Agents + Commands | 高 | 🔴 高（可维护性） | P1 |
| Dashboard 从 audit 计算 DORA | 中 | 🔴 高（Mock→真实） | P1 |
| 定时任务接入 automations context | 低 | 🟠 中（统一管理） | P2 |
| knowledge-sink 改写 Skills/Artifacts | 中 | 🟠 中（知识闭环） | P2 |
| pipeline 改用 Commands subtask | 高 | 🟡 低（复杂度高） | P3 |
| xingjing-server 改为 MCP | 高 | 🟠 中（架构清晰） | P3 |

---

## 7. 接入后的代码量预估

| 模块 | 改造前（行） | 改造后（行） | 变化 |
|-----|-----------|-----------|------|
| `opencode-client.ts` | 1439 | ~250（文件工具函数） | -83% |
| `file-store.ts` | 1283 | ~350（业务 CRUD，js-yaml） | -73% |
| `product-store.ts` | 556 | ~120（调用 workspace API） | -78% |
| `product-dir-structure.ts` | 1200 | ~80（Blueprint 构建） | -93% |
| `autopilot-executor.ts` | 462 | ~150（Agent 定义 + Prompt 设计） | -67% |
| `chat-session-store.ts` | 140 | 0（删除） | -100% |
| `memory-store.ts` | 280 | 0（删除） | -100% |
| `memory-recall.ts` | 130 | ~60（上下文注入逻辑） | -54% |
| `agent-registry.ts` | 200 | ~40（UI 元数据常量） | -80% |
| `pipeline-config.ts` | 230 | ~80（结构定义 + js-yaml） | -65% |
| `pipeline-executor.ts` | 230 | ~50（session.prompt 委托） | -78% |
| `scheduler-client.ts` | 200 | 0（删除，用 automations） | -100% |
| `auth-service.ts` | 210 | 0（方向A）/ ~80（方向B） | -100% / -62% |
| `permission-dialog.tsx` | 150 | 0（删除） | -100% |
| `knowledge-behavior.ts` | 140 | 0（listSkills 替换） | -100% |
| **合计** | **~6850** | **~1230** | **-82%** |

**核心服务层从约 6850 行削减至约 1230 行，主体业务逻辑下沉到 OpenWork 原生层统一维护。**
