# SDD-004 · AI 虚拟团队对话能力重构

> **状态**: 草案  
> **范围**: `apps/app/src/app/xingjing/pages/autopilot/`  
> **目标**: 用 OpenWork 原生对话能力全面替代 xingjing 自研的文本流渲染，同时保留虚拟团队的编排调度价值

---

## 1. 问题现状

### 1.1 当前架构的核心缺陷

xingjing 的"AI 虚拟团队"页面通过 `callAgent()` 调用各 Agent，该函数内部虽然创建了真实的 OpenCode Session，但只向外暴露一个 `onText` 文本流回调——Session 本身被当成一次性的"文字生成器"用完即丢：

```
User → autopilot-executor.ts
         → callAgent() [封装层]
             → session.create() + prompt()  [真实 Session，但外部不可见]
                 → SSE events → 只提取 text parts → 累积字符串
                     → onText(accumulated) → 自定义气泡渲染
```

**丢失的原生能力（全部在 OpenWork 中已实现）：**

| 丢失能力 | 影响 |
|---------|------|
| `tool` parts 可视化 | 看不到工具调用执行过程，不知道 Agent 做了什么 |
| `reasoning` parts | 无法展示模型思考链 |
| `file` parts | 文件附件无法在对话中显示 |
| 嵌套 Task 线程 | Agent 使用 `task` tool 派生子任务时，子任务不可见 |
| Session 持久性 | 关闭页面后对话历史丢失（仅靠本地 JSON 模拟） |
| Session 内回复 | 无法在某个 Agent 的上下文中追加消息 |
| 全文搜索 | 无跨 Agent 对话内容搜索 |
| Permission 流 | 工具权限申请被自定义 Modal 处理，与原生体验割裂 |
| Question 流 | 模型向用户提问被 auto-reject，根本没有 UI |

### 1.2 核心矛盾

OpenWork 已经有一套完整的 `MessageList` + `createSessionStore` + SSE 渲染管线，  
xingjing 在同一个 app bundle 内，却绕过它另起炉灶，造成功能倒退。

---

## 2. 设计目标

1. **零能力损失**：OpenWork 原生 Session 页面支持的全部交互形式，在虚拟团队页面同等可用
2. **保留编排价值**：Orchestrator 派发、并行执行、Pipeline 门控、@mention 直连——这些是 xingjing 的差异化能力，必须保留
3. **Session 永久化**：每个 Agent 的 Session 是真实的 OpenWork Session，可以被持久化、搜索、回溯
4. **渐进式迁移**：分层实施，每一层完成后独立可测

---

## 3. 核心架构

### 3.1 Session-per-Agent 模型

每次编排运行，为参与的每个 Agent 创建一个真实的 OpenWork Session：

```
用户提交目标
  │
  ▼
OrchestratorSession (真实 OpenWork Session, agent=orchestrator)
  │  SSE 流: 接收 DISPATCH 计划
  │
  ▼ parseDispatchPlan()
  ├─ AgentSession["pm-agent"]     ┐
  ├─ AgentSession["architect"]   ├── 真实 Sessions, 并行创建
  └─ AgentSession["dev-agent"]   ┘
       │
       ▼
   每个 Session 的 SSE 流全量接入 MessageList 渲染
   (text / tool / reasoning / file / nested-task 全部原生展示)
```

**对比**：

| | 当前 | 重构后 |
|--|-----|-------|
| Agent 执行载体 | 匿名 Session（内部创建，外部不可见） | 具名 Session（workspaceID + agentID，可溯源） |
| 消息渲染 | 自定义文本气泡 | OpenWork `MessageList`（全 Part 类型） |
| 持久化 | `autopilot-history.json`（本地） | OpenWork Session Store（server-side） |
| 多轮对话 | ❌ 不支持 | ✅ 支持（在任意 Agent Session 内追加消息） |

### 3.2 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│  pages/autopilot/index.tsx  (编排协调层)                      │
│                                                              │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ 团队面板      │  │ 中央 Session 视图                     │  │
│  │ AgentRoster  │  │                                     │  │
│  │              │  │ ┌─────────────────────────────────┐ │  │
│  │ [PM] ●       │  │ │ SessionTabBar                   │ │  │
│  │ [Arch] ◐     │  │ │ [Orchestrator][PM][Arch][Dev]   │ │  │
│  │ [Dev] ○      │  │ └─────────────────────────────────┘ │  │
│  │              │  │ ┌─────────────────────────────────┐ │  │
│  │              │  │ │ AgentSessionView (active tab)   │ │  │
│  │              │  │ │                                 │ │  │
│  │              │  │ │  OpenWork MessageList           │ │  │
│  │              │  │ │  ├─ text parts                 │ │  │
│  │              │  │ │  ├─ tool steps (expandable)    │ │  │
│  │              │  │ │  ├─ reasoning (collapsible)    │ │  │
│  │              │  │ │  ├─ file attachments           │ │  │
│  │              │  │ │  └─ nested task threads        │ │  │
│  │              │  │ │                                 │ │  │
│  │              │  │ │  TeamChatComposer (bottom)     │ │  │
│  └──────────────┘  │ └─────────────────────────────────┘ │  │
│                    └─────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 右侧: Artifacts + Pipeline 模式 (保持不变)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 关键组件设计

### 4.1 `TeamSessionOrchestrator`（服务层）

```typescript
// services/team-session-orchestrator.ts

export interface AgentSessionSlot {
  agentId: string;
  sessionId: string;
  status: AgentExecutionStatus;
  /** OpenWork Session 对象（从 store 读取） */
  session: () => Session | null;
  /** 该 Session 的所有消息（live，响应式） */
  messages: () => MessageWithParts[];
  /** 该 Session 当前是否有待处理的权限请求 */
  pendingPermission: () => PendingPermission | null;
  /** 该 Session 当前是否有待处理的提问 */
  pendingQuestion: () => PendingQuestion | null;
}

export interface TeamRunState {
  orchestratorSessionId: string | null;
  agentSlots: Map<string, AgentSessionSlot>;
  activeTabId: string; // 'orchestrator' | agentId
  isRunning: boolean;
  dispatchPlan: DispatchItem[] | null;
}

/**
 * 核心编排器：
 * 1. 为 Orchestrator 和每个 Agent 创建真实 OpenWork Session
 * 2. 通过 createSessionStore 订阅每个 Session 的 SSE 流
 * 3. 对外暴露响应式的 TeamRunState
 */
export function createTeamSessionOrchestrator(opts: {
  client: () => ReturnType<typeof createClient> | null;
  workspaceId: () => string | null;
  workDir: () => string;
  availableAgents: AutopilotAgent[];
  model: () => ModelRef | null;
  skillApi: SkillApiAdapter | null;
}): TeamSessionOrchestrator
```

**关键方法：**

```typescript
interface TeamSessionOrchestrator {
  state: Accessor<TeamRunState>;

  /** 发起一次团队执行（Orchestrator → 并行 Agents） */
  run(goal: string): Promise<void>;

  /** 在指定 Agent 的 Session 中追加消息（多轮对话） */
  sendTo(agentId: string, message: string): Promise<void>;

  /** 直接派发给特定 Agent（@mention bypass） */
  runDirect(agentId: string, task: string): Promise<void>;

  /** 取消当前运行 */
  abort(): void;

  /** 切换活动 tab */
  setActiveTab(tabId: string): void;

  /** 回复某个 Agent Session 的权限申请 */
  replyPermission(agentId: string, permissionId: string, action: 'once' | 'always' | 'reject'): void;

  /** 回复某个 Agent Session 的提问 */
  replyQuestion(agentId: string, requestId: string, answers: string[][]): void;
}
```

### 4.2 `AgentSessionView`（渲染层）

```typescript
// components/autopilot/agent-session-view.tsx

interface AgentSessionViewProps {
  slot: AgentSessionSlot;
  /** 跨 Session 的会话查询（支持嵌套 task 线程） */
  getSessionById: (id: string | null) => Session | null;
  getMessagesBySessionId: (id: string | null) => MessageWithParts[];
  ensureSessionLoaded: (id: string) => Promise<void>;
  sessionLoadingById: (id: string | null) => boolean;
  /** 权限 / 提问回调（转发到 TeamSessionOrchestrator） */
  onPermissionReply: (permissionId: string, action: 'once' | 'always' | 'reject') => void;
  onQuestionReply: (requestId: string, answers: string[][]) => void;
  /** 追加消息（多轮） */
  onSendMessage: (text: string) => void;
  developerMode: boolean;
  showThinking: boolean;
}

/**
 * 直接复用 OpenWork 的 MessageList，包裹 Permission/Question UI
 */
export function AgentSessionView(props: AgentSessionViewProps): JSX.Element
```

**内部实现要点：**
- `MessageList` 直接 import 自 `../../components/session/message-list`
- Permission 弹层复用现有 `PermissionDialog`，但由 slot 的响应式状态驱动
- Question 弹层新增（目前 xingjing 缺失）
- 底部 Composer：简单 textarea + Enter 提交，触发 `onSendMessage`
- 工具步骤、嵌套 task 线程、文件附件——全部由 MessageList 原生处理

### 4.3 `SessionTabBar`（导航层）

```typescript
// components/autopilot/session-tab-bar.tsx

interface SessionTabBarProps {
  slots: AgentSessionSlot[];
  orchestratorSessionId: string | null;
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}
```

**Tab 显示规则：**

```
[Orchestrator]  [PM ●]  [Arch ◐ 🔴]  [Dev ○]
                              ↑
                       红点 = 有待处理的 permission
                       ◐ = working / streaming
                       ● = done
                       ○ = pending / idle
```

- 每个 Tab 的徽标从 `slot.pendingPermission()` 和 `slot.status` 派生
- Orchestrator Tab 始终第一个，显示派发计划文本（可展开）

### 4.4 `TeamChatComposer`（输入层）

```typescript
// components/autopilot/team-chat-composer.tsx

interface TeamChatComposerProps {
  activeTabId: string;
  isRunning: boolean;
  availableAgents: AutopilotAgent[];
  /** 发送到整个团队（经 Orchestrator） */
  onSend: (text: string) => void;
  /** 在当前活动 Agent Session 内追加消息（多轮） */
  onSendToAgent: (agentId: string, text: string) => void;
  onAbort: () => void;
}
```

**两种发送语义：**

| 用户操作 | 行为 |
|---------|------|
| Orchestrator Tab 下发送 | 触发新一轮团队编排 |
| Agent Tab 下发送 | 在该 Agent Session 内追加消息（多轮对话） |
| `@pm-agent ...` | 无论在哪个 Tab，直接派发给 PM Agent |

---

## 5. 数据流设计

### 5.1 Session 创建与订阅

```
run(goal)
  │
  ├─ 1. client.session.create({ agentID: 'orchestrator', workspaceID })
  │      → orchestratorSessionId
  │
  ├─ 2. client.prompt({ sessionID: orchestratorSessionId, parts: [{text: goal}] })
  │
  ├─ 3. subscribeToSession(orchestratorSessionId)
  │      → SSE: message.part.delta (text streaming)
  │      → 检测 <DISPATCH>...</DISPATCH> 标记
  │      → parseDispatchPlan() → plan
  │
  ├─ 4. plan.forEach: client.session.create({ agentID, workspaceID })
  │      → 为每个 Agent 获取 sessionId
  │
  ├─ 5. Promise.all: plan.map → client.prompt({ sessionID, parts: [{text: task}] })
  │
  └─ 6. subscribeToSession(agentSessionId) × N
         → SSE 流 → 全量 Part 类型 → MessageList 实时渲染
```

### 5.2 响应式状态绑定

```typescript
// 在 createTeamSessionOrchestrator 内部

// 为每个 Agent Session 创建轻量级 per-session store
function createAgentSessionStore(sessionId: string) {
  const [messages, setMessages] = createStore<MessageWithParts[]>([]);
  const [pendingPermission, setPendingPermission] = createSignal<PendingPermission | null>(null);
  const [pendingQuestion, setPendingQuestion] = createSignal<PendingQuestion | null>(null);

  // 复用 opencode-client 的 subscribeToSession 逻辑
  // 或直接使用 context/session.ts 的 createSessionStore
  const unsub = client().event.subscribe(/* ... */);

  return { messages, pendingPermission, pendingQuestion, unsub };
}
```

**关于是否复用 `createSessionStore`：**

`context/session.ts` 的 `createSessionStore` 是为"当前激活的单一 Session"设计的，它依赖全局的 `selectedSessionId`，并且维护了复杂的重载检测、热更新、压缩状态等全局逻辑。

**推荐做法**：提取 `createSessionStore` 中的"消息累积 + SSE 订阅"核心逻辑为独立函数 `createMessageAccumulator`，供多 Session 并发使用：

```typescript
// context/session.ts 新增导出（或 xingjing 内新建 session-accumulator.ts）
export function createMessageAccumulator(opts: {
  client: () => Client | null;
  sessionId: () => string | null;
  onPermissionAsked?: (p: PendingPermission) => void;
  onQuestionAsked?: (q: PendingQuestion) => void;
}): {
  messages: Accessor<MessageWithParts[]>;
  isStreaming: Accessor<boolean>;
  todos: Accessor<TodoItem[]>;
}
```

这样每个 Agent 的 Session 都可以独立订阅，而不干扰全局 Session 状态。

### 5.3 跨 Session 查询（嵌套 Task 线程）

`MessageList` 需要 `getSessionById` 和 `getMessagesBySessionId` 来渲染嵌套 task 子线程：

```typescript
// TeamSessionOrchestrator 对外暴露：
getSessionById(id: string | null): Session | null {
  // 先查 orchestrator session，再查各 agent sessions
  // 再调用 OpenWork server API 作为兜底
  for (const [, slot] of agentSlots) {
    if (slot.sessionId === id) return slot.session();
  }
  return owSessionStore.getById(id);
}

getMessagesBySessionId(id: string | null): MessageWithParts[] {
  for (const [, slot] of agentSlots) {
    if (slot.sessionId === id) return slot.messages();
  }
  return owSessionStore.getMessagesById(id);
}
```

---

## 6. Pipeline 模式适配

Pipeline 模式（`orchestrator.yaml`）保持架构不变，但每个 Stage 的执行也改为创建真实 Session：

```typescript
// autopilot-executor.ts: runAutopilotWithNativeAgents() 增强

async function runPipelineStage(
  stage: PipelineStage,
  client: ReturnType<typeof createClient>,
  workspaceId: string,
  opts: PipelineRunOpts,
): Promise<{ sessionId: string }> {
  const session = await client.session.create({
    agentID: stage.agent,
    workspaceID: workspaceId,
  });
  await client.prompt({
    sessionID: session.id,
    parts: [{ type: 'text', text: buildStagePrompt(stage) }],
  });
  opts.onStageSessionCreated?.(stage.id, session.id);
  return { sessionId: session.id };
}
```

Pipeline 视图右侧保留 Stage 列表，点击任意 Stage 可在中央 Panel 查看其 Session 内容（全原生渲染）。

---

## 7. 权限与提问处理

### 7.1 Permission 流

```
SSE: permission.asked (agentSession)
  ↓
slot.pendingPermission.set(permission)
  ↓
SessionTabBar: 对应 Tab 显示红点
  ↓
用户点击 Tab → AgentSessionView 显示 PermissionDialog
  ↓
onPermissionReply → TeamSessionOrchestrator.replyPermission()
  ↓
client.permission.reply(permissionId, action)
  ↓
slot.pendingPermission.set(null) → 红点消失
```

**后台 Agent 的权限不会自动 reject**（当前行为），而是保持 pending 状态，通过 Tab 红点提醒用户。

### 7.2 Question 流（新增）

当前 xingjing 对所有 `question.asked` 事件调用 `question.reject()`，即 Agent 无法向用户提问。

重构后新增 `QuestionDialog` 组件（参照 OpenWork 原生实现）：

```typescript
// components/autopilot/question-dialog.tsx
interface QuestionDialogProps {
  question: PendingQuestion;
  onReply: (requestId: string, answers: string[][]) => void;
  onReject: (requestId: string) => void;
}
```

Question 的 UI 触发逻辑与 Permission 相同（Tab 黄点 → 点击展开）。

---

## 8. 迁移计划

### Phase 1：基础设施准备（2–3天）

**目标**：在不改变现有页面的情况下，建立新组件的骨架

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `services/message-accumulator.ts`（新） | 从 `context/session.ts` 提取 SSE 消息累积逻辑，支持多 Session 并发 |
| 1.2 | `services/team-session-orchestrator.ts`（新） | 创建 `TeamRunState` 状态 + `run()` / `sendTo()` 核心方法 |
| 1.3 | `autopilot-executor.ts` | 新增 `runOrchestratedWithSessions()` 函数（保留旧 `runOrchestratedAutopilot` 不动） |
| 1.4 | `components/autopilot/agent-session-view.tsx`（新） | 包裹 OpenWork `MessageList`，接入权限/提问 UI |
| 1.5 | `components/autopilot/session-tab-bar.tsx`（新） | Tab 导航 + 状态徽标 |
| 1.6 | `components/autopilot/question-dialog.tsx`（新） | 补齐缺失的 Question UI |

### Phase 2：中央面板替换（2–3天）

**目标**：替换中央 Chat Panel，原有功能逐一迁移

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `pages/autopilot/index.tsx` | 引入 `TeamSessionOrchestrator`，替换 `chatHistory` signal 驱动的渲染 |
| 2.2 | `pages/autopilot/index.tsx` | 中央 Panel 改为 `SessionTabBar` + `AgentSessionView` |
| 2.3 | `pages/autopilot/index.tsx` | `TeamChatComposer` 替换现有 textarea + 按钮 |
| 2.4 | `pages/autopilot/index.tsx` | 移除旧 `chatHistory`, `orchestratorOutput`, 自定义气泡渲染代码 |

### Phase 3：高级功能接入（1–2天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `team-session-orchestrator.ts` | 接入多轮对话（`sendTo`）+ Tab 内 Composer |
| 3.2 | `team-session-orchestrator.ts` | 跨 Session 查询（`getSessionById` / `getMessagesBySessionId`），支持嵌套 task 线程 |
| 3.3 | `team-session-orchestrator.ts` | Question 流完整实现 |
| 3.4 | `pages/autopilot/index.tsx` | Pipeline 模式 + Stage Session 绑定 |

### Phase 4：Solo Autopilot 同步（1天）

`pages/solo/autopilot/index.tsx` 使用相同 `AgentSessionView` + `MessageList`，逻辑已基本相同，只需复用新组件替换旧的文本气泡。

### Phase 5：回归与清理（1天）

- TypeScript 编译零报错验证
- 删除已不再使用的旧代码（自定义气泡 CSS、旧 `chatHistory` 存储逻辑）
- 确认 `autopilot-history.json` 历史会话可读

---

## 9. 关键技术决策

### 决策 A：复用 `MessageList` 还是自己实现？

**结论**：直接 import `../../components/session/message-list`。

理由：
- 两者在同一个 Vite 应用包内，无额外开销
- `MessageList` 的 prop interface 完全可以用 xingjing 的数据满足
- 自己重写意味着持续维护两套，且永远是功能子集

唯一需要处理的是 `scrollElement` 和 DLS token CSS 变量——xingjing 页面已有相同的 CSS 环境（`var(--dls-*)` 全局可用），无需额外处理。

### 决策 B：`createSessionStore` 复用 vs 提取 `createMessageAccumulator`？

**结论**：提取 `createMessageAccumulator`（Phase 1.1）。

`createSessionStore` 耦合了全局单 Session 的生命周期管理（热更新、重载检测、压缩状态），在多 Session 并发场景会相互干扰。提取核心"SSE → MessageWithParts[]"逻辑为独立工具函数，更干净。

### 决策 C：Session 历史如何迁移？

**结论**：双读（新旧并存），逐步切换。

旧的 `autopilot-history.json` 文件继续可读，作为"历史归档"展示在 Session 列表底部。新的运行记录统一进入 OpenWork Session Store，通过 workspaceId 关联。

### 决策 D：Orchestrator 的 DISPATCH 格式是否需要改变？

**结论**：不需要改变。

`<DISPATCH>[{"agentId":"pm-agent","task":"..."},...]</DISPATCH>` 格式继续有效，`parseDispatchPlan()` 不变。唯一变化是 Phase 2 中 dispatch 的执行方式改为创建真实 Session，而不是调用 `callAgent()`。

---

## 10. 能力对齐矩阵

重构完成后，与 OpenWork 原生 Session 页面的能力对齐情况：

| 能力 | OpenWork 原生 | 重构前 | 重构后 |
|------|:---:|:---:|:---:|
| 文本 streaming | ✅ | ✅ | ✅ |
| Tool 执行可视化 | ✅ | ❌ | ✅ |
| Reasoning/思考链 | ✅ | ❌ | ✅ |
| 文件附件展示 | ✅ | ❌ | ✅ |
| 嵌套 Task 线程 | ✅ | ❌ | ✅ |
| Permission 弹层 | ✅ | ✅（自定义） | ✅（原生） |
| Question 弹层 | ✅ | ❌ | ✅ |
| 多轮对话 | ✅ | ❌ | ✅ |
| Session 持久化 | ✅ | 半（JSON） | ✅ |
| 全文搜索 | ✅ | ❌ | ✅（基于 SessionID） |
| 虚拟滚动 | ✅ | ❌ | ✅ |
| Agent 选择 | ✅ | ✅（固定列表） | ✅（动态发现） |
| Model 选择 | ✅ | ✅ | ✅ |
| 多 Agent 编排 | ❌ | ✅ | ✅（保留差异化） |
| Pipeline 门控 | ❌ | ✅ | ✅（保留差异化） |
| @mention 直连 | ❌ | ✅ | ✅（保留差异化） |
| Artifact 工作区 | ❌ | ✅ | ✅（保留差异化） |

---

## 11. 文件变更清单

**新增：**
- `services/message-accumulator.ts`
- `services/team-session-orchestrator.ts`
- `components/autopilot/agent-session-view.tsx`
- `components/autopilot/session-tab-bar.tsx`
- `components/autopilot/team-chat-composer.tsx`
- `components/autopilot/question-dialog.tsx`

**修改：**
- `services/autopilot-executor.ts`（新增 `runOrchestratedWithSessions`）
- `pages/autopilot/index.tsx`（中央面板全量替换）
- `pages/solo/autopilot/index.tsx`（复用新组件，Phase 4）

**删除（Phase 5 清理）：**
- `pages/autopilot/index.tsx` 内的旧气泡渲染 JSX
- 旧 `chatHistory` / `orchestratorOutput` 相关 signal
- 旧 Flow Tab（被 Orchestrator Session View 替代）
