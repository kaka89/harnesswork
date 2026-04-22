# xingjing × OpenWork 原生能力替换分析报告

> 审查日期：2026-04-22  
> 代码库：harnesswork（OpenWork fork + xingjing 模块）

---

## 背景

xingjing 模块（`apps/app/src/app/xingjing/`）是在 OpenWork 基础上自建的垂直领域应用，包含产品管理、需求管理、知识库、自动驾驶等功能。由于初期以 Demo 为目标快速迭代，许多基础能力采用了独立实现，与 OpenWork 原生能力存在大量重叠，造成：

- **维护双份代码**：同一问题在两处修复
- **状态不同步**：xingjing 自管状态与 OpenWork 全局状态脱节
- **功能缺漏**：缺少 OpenWork 已解决的错误处理、鉴权、重连等机制
- **扩展受限**：无法享受 OpenWork 后续迭代的原生增强

本报告识别 **8 个可替换模块**，按优先级给出替换原因和具体计划。

---

## 一、可替换模块总览

| 优先级 | 模块 | xingjing 文件 | OpenWork 对应 | 重叠度 | 替换收益 |
|--------|------|--------------|--------------|--------|---------|
| **P0** | HTTP 客户端 | `api/client.ts` | `lib/opencode.ts` | 100% | 去除冗余鉴权逻辑 |
| **P0** | 消息累积 | `services/message-accumulator.ts` | `context/session.ts` | 100% | 消除状态双写 |
| **P1** | 会话管理 | `services/session-store.ts` | `context/session.ts` | 95% | 统一会话生命周期 |
| **P1** | Skill 管理 | `services/skill-manager.ts` | `server/skills.ts` | 100% | 获得 Hub 安装等完整功能 |
| **P1** | Agent 注册 | `services/agent-registry.ts` | `.opencode/agents/` + server | 95% | 统一 Agent 发现机制 |
| **P2** | 连接状态检测 | `hooks/use-opencode-status.ts` | `context/global-sdk.tsx` | 90% | 去除重复心跳轮询 |
| **P2** | 定时任务 | `services/scheduler-client.ts` | `server/scheduler.ts` | 90% | 获得生产级持久化和历史 |
| **P3** | 文件操作 | `services/file-store.ts` | `lib/openwork-server.ts` | 85% | 文件权限隔离和错误处理 |

---

## 二、逐模块详析

### P0-1｜HTTP 客户端（`api/client.ts`）

#### 当前问题

xingjing 在 `api/client.ts` 中自实现了完整的 HTTP 包装：

```typescript
// xingjing/api/client.ts — 自己管鉴权、自己处理错误
export async function apiRequest<T>(
  endpoint: string, method: string, body?: unknown
): Promise<T> {
  const token = await authService.getToken()        // 独立鉴权流
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }   // 硬编码 token 注入
  })
  ...
}
```

与此同时，`lib/opencode.ts` 已提供了完整的 OpenCode SDK 客户端，自动处理鉴权（从 localStorage 读取）、Tauri 环境切换（浏览器 fetch vs 原生 fetch）以及错误格式统一。

#### 替换原因

- xingjing 的 `auth-service` 是另一套独立鉴权流，两套 token 管理并存容易出现 token 不一致
- 缺少 Tauri 环境适配，桌面端文件操作可能失效
- OpenCode SDK 已处理 SSE 订阅等高级场景，xingjing 无法复用

#### 替换计划

```
1. 删除 xingjing/api/client.ts 和 xingjing/api/types.ts
2. 所有调用方改为通过 createOpenCodeClient() 获取 SDK 实例
3. 删除 xingjing/services/auth-service.ts 中冗余的 token 管理部分
   （仅保留业务特有的用户信息获取逻辑）
预计工作量：3-4 小时，影响范围：api/ 目录所有调用方
```

---

### P0-2｜消息累积（`services/message-accumulator.ts`）

#### 当前问题

xingjing 实现了独立的 SSE 消息累积器，订阅 OpenCode 的事件流并在本地合并：

```typescript
// message-accumulator.ts — 独立 SSE 订阅
export function createMessageAccumulator(sessionId: string) {
  const unsubscribe = event.subscribe(["message", "part.delta"], (evt) => {
    // 本地状态合并逻辑
    messages.update(m => mergeMessage(m, evt))
  })
}
```

而 OpenWork 的 `context/session.ts` 已经做了完全相同的事情——全局订阅 SSE、合并 message/part delta、维护 `messages` 响应式状态——并且还额外处理了时间窗口批量更新、优先级消息插队、错误恢复等边缘情况。

#### 替换原因

- 两处 SSE 订阅同时存在，同一事件被消费两次，存在状态不一致风险
- OpenWork 的版本已处理 part delta 的顺序性问题（out-of-order patch），xingjing 版本没有
- xingjing 组件展示数据时选择读哪个 store 不一致（有些读自己的，有些读全局的）

#### 替换计划

```
1. 删除 xingjing/services/message-accumulator.ts
2. 所有消息读取改为调用 useSessionStore() 或 context/session.ts 的全局 store
3. 检查 autopilot/ 和 agent-session-view.tsx 中的消息渲染逻辑，
   确认统一使用全局 messages 数组
预计工作量：4-5 小时，风险：中（需逐个检查消费方）
```

---

### P1-1｜会话管理（`services/session-store.ts`）

#### 当前问题

`session-store.ts` 是对 OpenCode SDK `client.session.*` 的薄封装，但封装方式与 `context/session.ts` 的全局管理冲突：

```typescript
// session-store.ts
export async function listSessions(workDir: string) {
  return client.session.list({ workdir: workDir })  // 直接调用 SDK
}

// context/session.ts — 已维护相同数据的全局缓存
const sessions = createStore<Session[]>([])  // 全局响应式 store
```

xingjing 组件调用 `listSessions()` 得到的是一次性快照；而 OpenWork 的全局 store 是实时响应的——Session 新增/删除时 UI 自动更新。

#### 替换原因

- 快照式读取导致 xingjing 页面的 Session 列表在新 Session 创建后不自动刷新
- `deleteSession` 在 session-store.ts 中是空占位（`// TODO`），实际删除功能缺失
- 全局 store 提供的 `currentSession`、`sessionMessages` 等派生状态 xingjing 未能复用

#### 替换计划

```
1. 删除 xingjing/services/session-store.ts
2. 各页面/组件改为从 context/session.ts 读取响应式 store
3. 修复因快照转响应式带来的 UI 刷新问题（通常只需删除手动 reload 调用）
预计工作量：3 小时，风险：低
```

---

### P1-2｜Skill 管理（`services/skill-manager.ts`）

#### 当前问题

xingjing 实现了自己的 Skill 发现和注入逻辑：

```typescript
// skill-manager.ts
export async function discoverAllSkills(workDir: string) {
  const workspaceSkills = await readDir(`${workDir}/.opencode/skills/`)
  const hubSkills = await client.skill.list()       // Hub 技能
  return [...workspaceSkills, ...hubSkills]
}

export async function injectSkillContext(skillName: string) {
  const content = await readFile(`.opencode/skills/${skillName}/SKILL.md`)
  return content  // 手动读取拼装
}
```

OpenWork Server 的 `server/skills.ts` 已实现了：`listSkills()` / `readSkill()` / `writeSkill()` / Hub 安装 / 热重载通知，并且 `app-store.tsx` 的 `openworkContext` 已经注入了这些能力。

#### 替换原因

- skill-manager.ts 的 `installSkillFromHub()` 实现不完整，缺少依赖解析
- xingjing 手动读文件，无法感知 Skill 的热更新（需刷新页面才生效）
- OpenWork skills API 支持 SKILL.md 的结构化解析，xingjing 只是原始字符串

#### 替换计划

```
1. 删除 xingjing/services/skill-manager.ts
2. 在 app-store.tsx 中通过 openworkContext.skills.list() 获取 Skill 列表
3. Skill 安装改用 openworkContext.skills.installFromHub()
4. Skill 内容注入改用 openworkContext.skills.read(name)
预计工作量：2-3 小时，风险：低（接口已在 context 中暴露）
```

---

### P1-3｜Agent 注册（`services/agent-registry.ts`）

#### 当前问题

`agent-registry.ts` 实现了三源 Agent 发现机制：

```typescript
// agent-registry.ts — 三处发现，各自独立
const globalAgents  = readDir('~/.xingjing/agents/')   // 全局 xingjing 目录
const builtinAgents = [...SOLO_AGENTS, ...TEAM_AGENTS] // 硬编码常量
const workspaceAgents = readDir('.opencode/agents/')   // OpenWork 标准路径
```

OpenWork 的标准路径是 `.opencode/agents/`，Server 端统一处理发现、解析和注册。全局 `~/.xingjing/agents/` 是 xingjing 独创的路径，与 OpenWork 生态不兼容。

#### 替换原因

- `~/.xingjing/agents/` 路径导致 Agent 无法被 OpenWork 其他工具（CLI、桌面端）识别
- 硬编码的 `SOLO_AGENTS` / `TEAM_AGENTS` 常量无法热更新，修改需要重新部署
- OpenWork Server 的 Agent 发现支持 YAML frontmatter 解析（name/description/tools），xingjing 只读文件名

#### 替换计划

```
1. 将 SOLO_AGENTS / TEAM_AGENTS 内置定义写入 .opencode/agents/*.md 文件
2. 删除 agent-registry.ts，改为调用 openworkContext.agents.list()
3. 全局 Agent 安装路径改为用户 workspace 根目录下的 .opencode/agents/
4. 保留 Agent 的 systemPrompt 内容（xingjing 业务定制，无需改动）
预计工作量：4-5 小时，风险：中（Agent 定义迁移需逐个验证）
```

---

### P2-1｜连接状态检测（`hooks/use-opencode-status.ts`）

#### 当前问题

```typescript
// use-opencode-status.ts — 自己实现心跳
const intervalId = setInterval(async () => {
  const ok = await ping()   // GET /health
  setStatus(ok ? 'connected' : 'disconnected')
}, 10_000)
```

`context/global-sdk.tsx` 中的 `GlobalSDK` 已经维护了 OpenCode 的连接状态，包含指数退避重连、SSE 连接健康监测，状态值可直接从 `useGlobalSDK().status` 读取。

#### 替换原因

- 两套心跳并发，对 OpenCode 服务造成双倍无意义的轮询压力
- xingjing 的 10 秒轮询与 OpenWork 的 SSE 状态感知（实时）相比，响应延迟高
- 重连退避逻辑 xingjing 未完整实现（固定 10 秒间隔）

#### 替换计划

```
1. 删除 hooks/use-opencode-status.ts
2. 所有引用改为 import { useGlobalSDK } from '../context/global-sdk'
   const { status } = useGlobalSDK()
3. 状态值映射：connected/disconnected/reconnecting 三态均已支持
预计工作量：1-2 小时，风险：极低
```

---

### P2-2｜定时任务（`services/scheduler-client.ts`）

#### 当前问题

```typescript
// scheduler-client.ts — 注入式 API，无真正持久化
export async function createScheduledTask(params) {
  return _createJob({            // 调用注入进来的 _createJob 函数
    prompt: buildPrompt(params), // 手动构建 prompt
    cron: params.cronExpression,
  })
}
```

`server/scheduler.ts` 提供了完整的 cron job 实现：文件持久化（JSON）、执行历史、手动触发、暂停/恢复、下次执行时间计算。xingjing 的 scheduler-client 是对外部注入函数的透传，没有自己的持久化。

#### 替换原因

- xingjing 的定时任务在进程重启后无法恢复（无持久化）
- 缺少执行历史查询（排查失败任务困难）
- `getAvailableAgentsForScheduler()` 依赖的是 xingjing 自己的 Agent 注册，在 P1-3 完成后自然消除

#### 替换计划

```
1. 删除 xingjing/services/scheduler-client.ts
2. 前端调用改为 openworkContext.scheduler.create/list/delete()
3. 定时任务的 prompt 构建逻辑可封装为 xingjing 的帮助函数保留
4. 执行历史 UI 可直接复用 OpenWork 的 automations 页面或在 xingjing 中查询
预计工作量：3-4 小时，风险：中（需验证 cron 表达式格式兼容性）
```

---

### P3｜文件操作（`services/file-store.ts`）

#### 当前问题

```typescript
// file-store.ts — 直接通过 OpenCode SDK 操作文件
export async function readFile(path: string) {
  return openCodeClient.file.read({ path })  // 无路径隔离
}
export async function writeFile(path: string, content: string) {
  return openCodeClient.file.write({ path, content })  // 无工作区权限检查
}
```

OpenWork Server 的文件 API（`/workspace/:id/files`）在读写时进行工作区路径隔离，防止越权访问其他工作区的文件，并提供统一的错误处理。

#### 替换原因

- xingjing 的路径无隔离，不同 Product 的文件可能互相覆盖（若路径计算有误）
- `writeWorkspaceFile` / `readWorkspaceFile` 已在 `app-store.tsx` 的 `openworkContext` 中暴露，无需重新封装
- 错误处理不统一（file-store.ts 的错误格式与其他模块不一致）

#### 替换计划

```
1. 逐步将 file-store.ts 的调用迁移到 openworkContext.workspace.readFile()
2. YAML 配置读写（product.yaml / prd.yaml）保持逻辑不变，仅替换底层 IO
3. file-store.ts 可最终删除，或保留为对 openworkContext 的业务语义封装
预计工作量：5-6 小时，风险：中（文件路径需逐一验证）
```

---

## 三、建议保留的部分

以下是 xingjing 的核心业务创新，**不应被替换**：

| 模块 | 原因 |
|------|------|
| `stores/app-store.tsx` 的业务状态（Product/PRD/Task/Backlog） | xingjing 的领域模型，OpenWork 无对应抽象 |
| `services/autopilot-executor.ts` 的编排逻辑 | Orchestrator 两阶段解析是 xingjing 差异化能力 |
| `services/knowledge-*.ts`（7 个知识库服务） | 知识库索引、检索、健康检查是 xingjing 独有功能 |
| `services/insight-executor.ts` | 洞察 Agent 的假设-验证闭环是 xingjing 核心 |
| `components/autopilot/permission-dialog.tsx` 的 UI | 30 秒倒计时 UI 体验好，保留组件，仅改后端调用 |
| Agent 的 systemPrompt 内容定义 | 产品经理/工程师等角色 prompt 是 xingjing 业务知识 |

---

## 四、整体迁移路线图

```
Week 1（P0，低风险热身）
  ├── 删除 api/client.ts，改用 OpenCode SDK       [3h]
  └── 删除 message-accumulator.ts，改用全局 store  [5h]

Week 2（P1，中等风险，核心统一）
  ├── 合并 session-store.ts 到全局 session        [3h]
  ├── 删除 skill-manager.ts，改用 server/skills   [3h]
  └── Agent 定义迁移到 .opencode/agents/          [5h]

Week 3（P2，基础设施收尾）
  ├── 删除 use-opencode-status.ts 改用 GlobalSDK  [2h]
  └── 定时任务迁移到 OpenWork Scheduler           [4h]

Week 4（P3，文件层补全 + 验收）
  ├── file-store.ts 迁移到 openworkContext 文件 API [6h]
  └── 全链路回归测试（Solo 模式 + Team 模式）     [4h]

总计：~35 小时  代码减少：约 800-1000 行  维护成本降低预估：30-40%
```

---

## 五、迁移后的架构目标

```
xingjing（业务层）
  │  只负责：Product/PRD/Task 领域模型、知识库、Autopilot 编排逻辑
  │
  ▼  通过以下接口调用
OpenWork 原生层（基础设施）
  ├── openworkContext.session.*    — 会话管理、消息流
  ├── openworkContext.skills.*     — Skill 发现与执行
  ├── openworkContext.agents.*     — Agent 注册与调用
  ├── openworkContext.workspace.*  — 文件读写、工作区隔离
  ├── openworkContext.scheduler.*  — 定时任务
  └── GlobalSDK.status             — 连接状态
```

这样 xingjing 专注于**领域逻辑**，OpenWork 负责**基础设施**，边界清晰，双向受益。
