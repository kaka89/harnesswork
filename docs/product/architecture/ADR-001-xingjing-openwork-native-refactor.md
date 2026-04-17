---
meta:
  id: ADR-001
  title: 星静模块重复建设识别与 OpenWork 原生能力改造方案
  status: proposed
  author: tech-lead
  created: "2026-04-16"
  updated: "2026-04-16"
---

# ADR-001 星静（Xingjing）模块重复建设识别与 OpenWork 原生能力改造方案

## 1. 背景

星静模块（`apps/app/src/app/xingjing/`）是在 OpenWork 之上二次开发的扩展，核心服务层共 **21 个 service 文件、约 9500 行代码**。

经逐文件对比分析，其中有 **9 个核心领域**存在不同程度的重复建设——即在 OpenWork 已提供原生能力的地方另起炉灶，导致两套并行实现同时维护，产生额外的 bug 面、维护成本和行为不一致风险。

本文档量化每个重复建设领域、分析根因、并给出基于 OpenWork 原生能力的改造方案与优先级排期。

---

## 2. 重复建设全景图

| # | 重复领域 | 星静自研文件 | 行数 | OpenWork 原生能力 | 重复程度 |
|---|---------|------------|------|-----------------|---------|
| R1 | OpenCode 客户端封装 | `opencode-client.ts` | 1439 | `lib/opencode.ts` + workspace client | 🔴 高 |
| R2 | 文件读写 + YAML 解析器 | `file-store.ts` + 三处手写解析器 | 1283 | `client.file.*` SDK | 🔴 高 |
| R3 | 会话历史存储 | `chat-session-store.ts` + `memory-store.ts` + `memory-recall.ts` | ~550 | `client.session.*` SDK | 🔴 高 |
| R4 | 定时任务调度 | `scheduler-client.ts` | 200 | `context/automations.ts` + Tauri scheduler API | 🟠 中 |
| R5 | Agent 注册表发现 | `agent-registry.ts` + 手写 frontmatter 解析器 | 200 | OpenCode Agents 原生加载 | 🟠 中 |
| R6 | 知识检索系统 | `knowledge-index/retrieval/scanner/health/sink/behavior` | ~1900 | `client.find.*` + Skills 原语 | 🟡 低 |
| R7 | 流水线 DAG 执行 | `pipeline-config.ts` + `pipeline-executor.ts` + 手写 YAML 解析器 | ~460 | OpenWork Orchestrator CLI | 🟡 低 |
| R8 | 权限审批 UI | `permission-dialog.tsx` | ~150 | `client.permission.reply()` + Event 订阅 | 🟠 中 |
| R9 | 认证服务 | `auth-service.ts` | 210 | OpenWork 工作区 client auth | 🟡 低 |

---

## 3. 逐领域分析与改造方案

---

### R1 — OpenCode 客户端封装（🔴 高优先级）

#### 现状

`opencode-client.ts`（1439 行）在 OpenWork 已有的 `lib/opencode.ts` `createClient()` 基础上，又创建了一个**全局单例客户端**，并在其上叠加了：

- 断线重试退避（1s/2s/5s）
- SSE 无活动超时（90s）、首事件超时（30s）、内容空闲超时（8s）
- Session 状态轮询兜底（每 2s 轮询 REST API，绕过 OpenCode 对 deny-all session 不发 idle 事件的问题）
- Tauri 运行时动态端口刷新（重启后端口变化）
- 文件操作薄包装（`fileList / fileRead / fileWrite / fileDelete`）

这与 OpenWork 主应用的 `context/workspace.ts` 中已管理的 workspace client **完全并行存在**，导致同一个运行时内有两个独立 OpenCode 连接逻辑。

#### 根因

星静开发时为了快速独立迭代，从 OpenWork 主应用的 workspace client 中完全剥离，自建了一套。SSE 超时和 Session 轮询是针对已知 OpenCode bug 的 workaround，但主应用中同样面对这些问题——维护了两份独立 workaround。

#### 改造方案

```
改造前：
  xingjing 组件 → initXingjingClient() → _client 单例 → OpenCode

改造后：
  xingjing 组件 → useWorkspace() → workspace.client → OpenCode
```

**具体步骤：**

1. 删除 `initXingjingClient()` 和 `_client` 单例，改为从 SolidJS Context 消费已有的 workspace client：

```typescript
// 改造后：复用 OpenWork 已有 client
import { useWorkspace } from '../../context/workspace';

export function getXingjingClient() {
  const workspace = useWorkspace();
  return workspace.activeClient();  // 已有、已管理的 client
}
```

2. SSE 超时/Session 轮询的 workaround 应迁移到 OpenWork 主应用层统一处理，或提 issue 等 OpenCode 修复。

3. 文件操作薄包装（`fileRead / fileWrite` 等）可保留但改为透传 workspace client，不持有单独 baseUrl。

**收益：** 消除 ~1000 行冗余封装代码；端口切换、重连、认证统一由 OpenWork 管理；两套 workaround 合并为一。

---

### R2 — 文件读写与 YAML 解析器（🔴 高优先级）

#### 现状

`file-store.ts`（1283 行）包含：

- 极简 YAML 解析器（`parseYamlSimple`）和序列化器（`stringifyYamlSimple`）
- YAML 值类型推断（布尔/数字/字符串/数组）
- Markdown frontmatter 解析器
- 所有业务实体的 CRUD：PRD、SDD、Task、Sprint、Knowledge、Settings

此外，`pipeline-config.ts`、`agent-registry.ts` 中还各有一套独立的手写 YAML / frontmatter 解析器。**全库共有 3 套独立 YAML 解析器**，均为手写、均不完整支持 YAML 规格。

#### 根因

为了"零依赖"，刻意回避引入 `js-yaml` / `yaml` 库，结果在三处各自实现了不兼容的子集解析器。OpenCode file API（`client.file.read() / write()`）已正确封装，但上层数据格式解析没有复用。

#### 改造方案

**第一步：统一引入标准 YAML 库**

```bash
pnpm add js-yaml
pnpm add -D @types/js-yaml
```

**第二步：删除三套手写解析器，统一替换**

```typescript
// 改造后：统一用 js-yaml
import yaml from 'js-yaml';

export function parseYaml<T>(content: string): T {
  return yaml.load(content) as T;
}

export function stringifyYaml(data: unknown): string {
  return yaml.dump(data, { indent: 2 });
}
```

`file-store.ts` 的业务 CRUD 逻辑（loadProducts / saveSprint 等）可以保留，只是将解析层替换为 js-yaml，体积可从 1283 行降至 ~400 行。

**第三步：`pipeline-config.ts` 和 `agent-registry.ts` 中的 frontmatter 解析器合并为一个工具函数**

```typescript
// utils/frontmatter.ts
import yaml from 'js-yaml';

export function parseFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  return {
    meta: yaml.load(match[1]) as Record<string, unknown>,
    body: match[2].trim(),
  };
}
```

**收益：** 消除 ~2 个手写解析器（约 400 行冗余代码）；YAML 兼容性从"部分子集"提升到标准规格；三处行为统一。

---

### R3 — 会话历史存储（🔴 高优先级）

#### 现状

星静实现了**双层会话存储**：

- `chat-session-store.ts`（140 行）：`localStorage` 主存储 + Tauri invoke 文件备份
- `memory-store.ts`（280 行）：OpenCode file API 主存储，index+detail 分离，支持 200 条裁剪，自定义关键词搜索，LLM 摘要生成
- `memory-recall.ts`（130 行）：历史会话检索与 prompt 注入

这套能力与 OpenWork 通过 OpenCode SDK 提供的原生 Session 持久化完全重叠：

| 星静自研 | OpenWork 原生 |
|--------|------------|
| `loadSessions()` / `saveSessions()` | `client.session.list({ directory })` |
| `loadSession(id)` / `saveSession()` | `client.session.get({ sessionID })` + `client.session.messages()` |
| `generateSessionSummary()` | `client.session.summarize()` |
| `searchSessions(query)` | `client.find.text({ query })` |
| localStorage 备份 | OpenCode 服务端持久化（内置） |
| 200 条裁剪 | OpenCode 原生会话管理 |

#### 根因

开发时对 OpenCode SDK 的 `session.*` API 认知不足，误认为需要自己持久化会话数据。

#### 改造方案

```typescript
// 改造后：用 OpenCode session API 替换自研存储

// 获取会话列表（替代 loadSessions）
const sessions = unwrap(await client.session.list({ directory: workDir }));

// 获取会话消息（替代 loadSession）
const messages = unwrap(await client.session.messages({ sessionID: id }));

// 生成摘要（替代 generateSessionSummary）
await client.session.summarize({
  sessionID: id,
  providerID: model.providerID,
  modelID: model.modelID,
});

// 搜索（替代 searchSessions 的 TF-IDF）
const results = unwrap(await client.find.text({ query, directory: workDir }));
```

**注意事项：** `memory-store.ts` 中存储的是**星静私有元数据**（tags、goal 字段）。迁移时需保留这部分扩展元数据，可通过 OpenCode 会话标题或文件侧车（sidecar）方式挂载，不需要完整重写存储逻辑。

**收益：** 消除 ~550 行存储代码；会话数据由 OpenCode 统一管理，不再出现两处历史不同步的问题；localStorage 备份冗余消除。

---

### R4 — 定时任务调度（🟠 中优先级）

#### 现状

`scheduler-client.ts`（200 行）实现了三层降级：
1. Tauri `schedulerListJobs` / `schedulerDeleteJob`
2. OpenCode session prompt 创建（通过 opencode-scheduler 插件）
3. `.xingjing/settings.yaml` 文件存储兜底

但 OpenWork 主应用中的 `context/automations.ts` 已经完整实现了同样的三层逻辑，包括 `buildCreateAutomationPrompt()`、`buildRunAutomationPrompt()`，并已接入 `pages/automations.tsx` 作为正式 UI。

#### 改造方案

```typescript
// 改造前：星静自研 scheduler-client
import { listScheduledTasks, createScheduledTask } from './scheduler-client';

// 改造后：直接消费 OpenWork AutomationsStore
import { useAutomations } from '../../context/automations';

const automations = useAutomations();
const jobs = automations.jobs();  // 已有的 ScheduledJob[]
```

**收益：** 删除 200 行冗余调度逻辑；星静任务与 OpenWork automations 页面共享数据，用户不再需要在两处分别管理定时任务。

---

### R5 — Agent 注册表发现（🟠 中优先级）

#### 现状

`agent-registry.ts`（200 行）通过 `client.file.list('.opencode/agents')` + 手写 frontmatter 解析器自行实现 Agent 发现，并维护一个 `RegisteredAgent` 注册表，用于 `autopilot-executor.ts` 的 Agent 调度。

OpenCode 在启动时**原生加载** `.opencode/agents/*.md`——这正是 Agents 原语的设计。星静只需要通过 `client.session.create({ agentID: 'product-brain' })` 传入 Agent ID，OpenCode 会自动将对应的 agent 文件加载为 system prompt。

#### 改造方案

```typescript
// 改造前：自行扫描文件、解析 frontmatter、维护注册表
const agents = await discoverAgents('solo', workDir);
const agent = agents.find(a => a.id === agentId);
await callAgent({ systemPrompt: agent.systemPrompt, ... });

// 改造后：直接用 session.create 的 agentID 参数
const session = unwrap(await client.session.create({
  agentID: agentId,   // OpenCode 原生加载 .opencode/agents/{agentID}.md
  directory: workDir,
}));
await client.session.prompt({ sessionID: session.id, prompt: task });
```

Agent 的**显示元数据**（name / emoji / color）可以保留在硬编码常量中（SOLO_AGENTS / TEAM_AGENTS），因为这属于 UI 展示信息，OpenCode 并不管理。

**收益：** 消除 ~150 行文件扫描 + 解析代码；Agent 定义与 OpenCode 原语对齐，`.opencode/agents/` 目录成为单一真相源。

---

### R6 — 知识检索系统（🟡 低优先级）

#### 现状

知识系统是星静最重的自研模块，由 6 个 service 文件组成（约 1900 行）：

- `knowledge-index.ts`（496 行）：三源聚合 + TF-IDF 倒排索引 + 缓存
- `knowledge-retrieval.ts`（239 行）：统一检索入口 + TTL 缓存 + 多维排序融合
- `knowledge-scanner.ts`（462 行）：`dir-graph.yaml` 驱动的文档扫描
- `knowledge-health.ts`（280 行）：过期检测 + 一致性校验
- `knowledge-sink.ts`（290 行）：Agent 产出分流沉淀
- `knowledge-behavior.ts`（140 行）：Skills API 适配器

OpenWork 提供了两个原生能力：

1. **`client.find.text(query)`**：全文检索（对应 TF-IDF 检索需求）
2. **Skills 原语**：`.opencode/skills/*.md` 自动注入会话上下文（对应行为知识注入需求）

#### 重叠分析

| 星静自研 | OpenWork 原生 | 重叠度 |
|--------|------------|------|
| TF-IDF 关键词检索 | `client.find.text()` | 🔴 完全重叠 |
| 文件扫描（`client.file.list`） | `client.find.files()` | 🟠 部分重叠 |
| Skills 行为知识适配 | `.opencode/skills/` + 原生注入 | 🔴 完全重叠 |
| workspace 文档多维排序 | 无原生等价（有差异化价值） | ⬜ 独有 |
| 知识健康度检测 | 无原生等价 | ⬜ 独有 |
| Agent 产出沉淀 | 无原生等价 | ⬜ 独有 |

#### 改造方案（分层处理）

**Phase A：可替换部分**

```typescript
// 行为知识：将现有 skills 文件规范化为 .opencode/skills/ 目录格式
// OpenCode 会在创建 session 时自动注入——无需 knowledge-behavior.ts

// 全文检索：替换 TF-IDF 实现
const results = unwrap(await client.find.text({
  query,
  directory: workDir,
}));
```

**Phase B：保留的独有价值**

`knowledge-scanner.ts`（dir-graph 驱动的文档层级扫描）、`knowledge-health.ts`（过期检测）、`knowledge-sink.ts`（产出沉淀）三个模块在 OpenWork 中无对应实现，属于星静的差异化能力，应予保留并优化。

**收益：** 可削减约 700 行可替换代码（knowledge-behavior + 检索核心）；Skills 统一到 `.opencode/skills/` 后，Agent workshop 与 OpenWork skills 页面自动打通。

---

### R7 — 流水线 DAG 执行（🟡 低优先级）

#### 现状

`pipeline-config.ts`（230 行）包含一套手写 YAML 解析器，用于解析 `orchestrator.yaml`；`pipeline-executor.ts`（230 行）实现拓扑排序、并行/串行混合执行和 await-approval 门控。

OpenWork 架构文档中明确列出了 `/apps/orchestrator/` 作为流水线编排的原生组件，设计目标与星静 pipeline-executor 完全重合。

#### 改造方案

短期：将 `pipeline-config.ts` 中的手写 YAML 解析器替换为 `js-yaml`（与 R2 联动）。

中期：调研 `/apps/orchestrator/` 的 API 表面，将 `pipeline-executor.ts` 中的 DAG 执行委托给 Orchestrator CLI，保留星静的 UI 层（进度可视化、门控 UI）。

**收益：** 消除 ~230 行手写 YAML 解析器；DAG 执行由 Orchestrator 统一管理，多产品流水线不再各自维护一份执行引擎。

---

### R8 — 权限审批 UI（🟠 中优先级）

#### 现状

`permission-dialog.tsx` 实现了"allow once / allow always / deny"三选项对话框，并通过自研 `callAgent` 中的 `onPermissionRequest` 回调触发。

OpenWork 已有完整的权限审批流：通过 `client.event.subscribe()` 监听 `permission.request` 事件，并通过 `client.permission.reply({ requestID, reply })` 响应。主应用中已有对应 UI 组件（在 `components/session/` 下）。

#### 改造方案

```typescript
// 改造前：自定义 permission-dialog.tsx
onPermissionRequest?.({ requestId, path, description, onReply });

// 改造后：复用 OpenWork permission 事件流
createEffect(() => {
  const unsubscribe = client.event.subscribe((event) => {
    if (event.type === 'permission.request') {
      // 触发已有 OpenWork 权限 UI，或直接 auto-approve
      client.permission.reply({
        requestID: event.requestID,
        reply: 'once',
      });
    }
  });
  onCleanup(unsubscribe);
});
```

**收益：** 权限审批行为与 OpenWork 主应用一致；消除约 150 行独立 UI 代码。

---

### R9 — 认证服务（🟡 低优先级）

#### 现状

`auth-service.ts`（210 行）为独立的 `xingjing-server`（端口 4100）实现了完整 JWT 认证流程，包括 SolidJS 响应式信号（`currentUser` / `authLoading`）和 localStorage token 管理。

这套 auth 与 OpenWork 的认证体系（OpenCode Basic Auth + OpenWork server auth）**完全独立**，是专为 xingjing-server 额外服务维护的，不存在能直接复用 OpenWork auth 的路径。

#### 改造方案

两个方向：

1. **合并到 OpenWork auth**：将 xingjing-server 的认证迁移到 OpenWork server，利用 OpenWork 已有的 workspace 认证机制（推荐，长期方向）。
2. **保持独立但最小化**：如果 xingjing-server 必须独立存在，则保留 auth-service.ts，但去掉 SolidJS 响应式封装中的冗余代码，改为简单的 token util 函数（约可减至 80 行）。

---

## 4. 影响评估（删除/替换代码量估算）

| 领域 | 当前行数 | 改造后估算 | 可削减 |
|-----|---------|----------|-------|
| R1 opencode-client.ts | 1439 | ~300（仅保留文件工具函数） | ~1100 行 |
| R2 file-store.ts + 3x YAML 解析器 | 1283 + ~400 | ~500 | ~1180 行 |
| R3 会话存储三件套 | ~550 | ~100（扩展元数据 sidecar） | ~450 行 |
| R4 scheduler-client.ts | 200 | 0 | 200 行 |
| R5 agent-registry.ts | 200 | ~50（UI 元数据常量） | ~150 行 |
| R6 知识系统（可替换部分） | ~700 | 0 | ~700 行 |
| R7 pipeline 手写 YAML 解析器 | ~230 | 0（用 js-yaml） | ~230 行 |
| R8 permission-dialog.tsx | ~150 | 0 | ~150 行 |
| **合计** | **约 5150 行** | | **约 4160 行（~81% 可削减）** |

---

## 5. 改造路线图

### Phase 1 — 基础层修复（建议 Sprint 1，约 3 天）

**目标：消除最高风险的重复，打通 client 单例问题**

- [ ] **R2-A**：引入 `js-yaml`，替换 `file-store.ts` 中的手写解析器（同步更新 `pipeline-config.ts`、`agent-registry.ts` 中的解析器）
- [ ] **R1**：将 `initXingjingClient()` 改为消费 workspace context，删除 `_client` 单例
- [ ] 验证：现有 xingjing 页面正常运行（无 regression）

**交付物：** `js-yaml` 接入、三处解析器统一、client 单例消除

---

### Phase 2 — Session 层迁移（建议 Sprint 2，约 4 天）

**目标：会话历史改用 OpenCode SDK 原生 API**

- [ ] **R3**：`chat-session-store.ts` 替换为 `client.session.list() / messages()`
- [ ] **R3**：`memory-store.ts` 中私有元数据抽取为 sidecar JSON（保留 tags/goal 等星静独有字段）
- [ ] **R3**：`memory-recall.ts` 改用 `client.find.text()` 做历史检索
- [ ] **R8**：`permission-dialog.tsx` 改接 OpenWork event 流
- [ ] 验证：AI 对话抽屉、Autopilot 页面历史加载正常

**交付物：** 会话数据统一，localStorage 双写消除

---

### Phase 3 — Agent 与调度层对齐（建议 Sprint 3，约 3 天）

**目标：Agent 调度和定时任务接入 OpenWork 原语**

- [ ] **R5**：`agent-registry.ts` 改为通过 `client.session.create({ agentID })` 调用，删除文件扫描逻辑
- [ ] **R4**：`scheduler-client.ts` 替换为 `useAutomations()` Context 消费
- [ ] 验证：Autopilot @mention 调用、Agent Workshop 页面、定时任务管理正常

**交付物：** Agents/Skills/Automations 与 OpenWork 主应用打通，数据统一显示

---

### Phase 4 — 知识系统瘦身（建议 Sprint 4，约 5 天）

**目标：删除可替换知识模块，保留差异化能力**

- [ ] **R6-A**：删除 `knowledge-behavior.ts`，将行为知识规范化为 `.opencode/skills/` 格式
- [ ] **R6-B**：`knowledge-retrieval.ts` 核心检索改用 `client.find.text()`，保留多维排序融合
- [ ] **R6-C**：保留 `knowledge-scanner.ts`（dir-graph 驱动）、`knowledge-health.ts`、`knowledge-sink.ts`，这三个是星静差异化能力
- [ ] 验证：知识检索结果质量（A/B 对比）

**交付物：** 知识系统轻量化，Skills 与 OpenWork 统一管理

---

### Phase 5 — 流水线与认证收尾（建议 Sprint 5，约 3 天）

- [ ] **R7**：调研 Orchestrator CLI API，将 `pipeline-executor.ts` 委托给 Orchestrator（如 API 不成熟则推迟）
- [ ] **R9**：评估 xingjing-server auth 合并路径，最小化 `auth-service.ts`
- [ ] 全量回归测试

---

## 6. 风险与注意事项

| 风险 | 说明 | 缓解措施 |
|-----|------|---------|
| OpenCode API 不稳定 | `client.session.summarize()` 等 API 在旧版本可能不存在 | 保留 try-catch + 降级到现有实现，Phase 2 并行保留旧代码直到验证通过 |
| 会话数据迁移 | 现有用户的 localStorage 历史会话丢失 | Phase 2 上线时提供一次性迁移工具，将 localStorage 数据写入 OpenCode session |
| 知识搜索质量 | `client.find.text()` 是代码搜索导向，可能不如 TF-IDF 对文档检索友好 | Phase 4 引入 A/B 对比，如质量下降则保留 TF-IDF 作为文档检索补充 |
| Orchestrator API 成熟度 | `/apps/orchestrator/` 的 API 表面当前文档较少 | Phase 5 先调研再决定，`pipeline-executor.ts` 如无好的替代则暂保留 |

---

## 7. 收益总结

**代码层面：** 服务层约 9500 行 → 改造后约 5300 行（削减 ~44%）；手写 YAML 解析器从 3 套统一为 0 套；OpenCode client 单例从 2 个减为 1 个。

**架构层面：** 星静与 OpenWork 的会话数据、Agent 定义、Skills 定义、定时任务统一在一套数据模型中，消除数据不一致风险。

**维护层面：** OpenCode 的 bug workaround（SSE 超时、Session 轮询）集中到主应用一处维护，不再需要同步两份实现。

**用户体验层面：** 定时任务、历史会话、Agent 定义在 OpenWork 主界面和星静界面中数据统一，不再出现"两处配置不同步"的问题。
