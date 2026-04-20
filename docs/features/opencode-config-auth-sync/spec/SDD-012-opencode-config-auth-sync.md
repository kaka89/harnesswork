---
meta:
  id: SDD-012
  title: OpenCode 配置格式修正与 Auth 同步全链路治理
  status: implemented
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: null
  revision: "3.0"
  created: "2026-04-17"
  updated: "2026-04-19"
sections:
  background: "独立版 AI 会话调用 session.create 时报 ConfigInvalidError 和 Request timed out，根因是 (v1) 配置格式不合法，(v2) SSE 消息过滤误判，(v3) ensureAuth 将 auth.set+dispose 耦合到 session.create 热路径导致配置重载期间 10s 超时"
  goals: "修正 opencode.jsonc 格式、完善 Auth 同步流程、将 auth 同步从 session.create 热路径解耦、对齐 OpenWork 原生模式"
  architecture: "v3 架构：settings handleSave 一次性完成 auth.set+dispose+waitForHealthy+session端点就绪检测；session.create 前仅做 health check，不再触发任何 auth 操作"
  interfaces: "opencode-client.ts: setProviderAuth / callAgent / runAgentSession; settings/index.tsx: handleSave; app-store.tsx: onMount 启动同步"
  nfr: "首次对话零额外延迟（auth 在启动/设置时已完成）；编译零新增错误；四层日志前缀支持快速定位故障点"
---

# SDD-012 OpenCode 配置格式修正与 Auth 同步全链路治理

## 元信息

- 编号：SDD-012-opencode-config-auth-sync
- 状态：implemented
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-17

---

## 1. 背景与问题域

### 1.1 产品背景

星静（Xingjing）独立版的核心 AI 对话能力依赖以下调用链：

```
用户发送消息 → handleChatSend → callAgent → runAgentSession
  → health check（前置探测）
  → session.create（创建 OpenCode 会话）
  → promptAsync（发送 prompt）
  → SSE 流式接收 AI 响应
```

Auth 同步已从 session.create 路径中完全移除，改为在设置页保存和应用启动时一次性完成（对齐 OpenWork 原生模式）。

### 1.2 故障现象

独立版 AI 对话持续报错 **"大模型未配置，请在设置页配置 API Key 后重试"**，错误代码 `ConfigInvalidError`。

日志链路显示：
- `setProviderAuth auth.set 成功` ✓
- `setProviderAuth instance.dispose 完成` ✓
- `setProviderAuth OpenCode 已就绪` ✓
- **`session.create ConfigInvalidError`** ✗

### 1.3 根因分析

通过系统化调试（增加诊断日志 → 打印完整 error.data），定位到 **三层叠加根因**：

| 层级 | 根因 | 影响 |
|------|------|------|
| **L1: 配置格式** | settings `handleSave` 生成的 `opencode.jsonc` 包含非法字段 `model: {provider, id}` 和 `providers: {apiKey}` | OpenCode schema 验证失败 → `ConfigInvalidError` |
| **L2: Auth 同步** | `setProviderAuth` 仅调用 `auth.set()` 而缺少 `instance.dispose()` + `waitForHealthy()` | API Key 写入磁盘但 OpenCode 内存未刷新 |
| **L3: 缓存失效** | `provider.list()` 返回值 `{all:[...]}` 被错误当作数组解析 → 验证永远失败 → 但旧版缓存逻辑在 auth.set 后即缓存 | 二次请求跳过完整流程，无法触发 dispose |

---

## 2. 设计目标

| 目标 | 指标 |
|------|------|
| 独立版 AI 对话正常工作 | session.create 成功创建会话、AI 正常响应 |
| opencode.jsonc 符合 OpenCode schema | `$schema` 声明、`model` 为字符串、无非法字段 |
| Auth 同步完整可靠 | auth.set → dispose → waitForHealthy → provider.list 验证 |
| 失败自恢复 | session.create 失败 → 清缓存 → 下次重试自动触发完整同步 |
| 全链路可观测 | 四层日志前缀，5 分钟内定位故障点 |

---

## 3. 技术方案

### 3.1 opencode.jsonc 格式修正

**变更文件**: `pages/settings/index.tsx` — `handleSave` 函数

**旧格式（非法）:**
```json
{
  "model": { "provider": "deepseek", "id": "deepseek-chat" },
  "providers": { "deepseek": { "apiKey": "sk-..." } }
}
```

**新格式（符合 OpenCode schema）:**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-chat",
  "default_agent": "openwork",
  "plugin": ["opencode-scheduler"],
  "mcp": { ... }
}
```

**实现策略: read-merge-write**

```
读取现有 opencode.jsonc
  → 保留合法字段（$schema, default_agent, mcp, plugin）
  → 更新 model 为 "providerID/modelID" 字符串
  → 删除非法字段（providers）
  → 确保 $schema 存在
  → 写回
```

**向后兼容**: `readOpencodeConfig` 同时支持新格式（`"deepseek/deepseek-chat"` 字符串）和旧格式（`{provider, id}` 对象）。

### 3.2 setProviderAuth 四步完整流程

**变更文件**: `services/opencode-client.ts`

对齐 OpenWork 设置页 `submitProviderApiKey` → `refreshProviders({ dispose: true })` 的完整流程：

```
Step 1: auth.set()
  │  将 API Key 写入磁盘 (~/.config/opencode/auth/{provider}.json)
  ▼
Step 2: instance.dispose()
  │  强制 OpenCode 进程重新加载配置到内存
  ▼
Step 3: waitForHealthy(8s, 250ms)
  │  轮询 global.health() 直到 OpenCode 重启完成
  ▼
Step 4: provider.list() 验证
  │  确认目标 provider 出现在 {all: [...]} 列表中
  │  仅验证通过才缓存 _lastVerifiedAuthKey
  ▼
完成
```

**缓存策略**:
- 缓存 key: `${providerID}:${apiKey.slice(-8)}`
- 仅在 `provider.list()` 确认包含目标 provider 后才设置缓存
- `session.create` 失败时调用 `clearProviderAuthCache()` 清除缓存
- 下次请求自动执行完整流程（含 dispose）

### 3.3 session.create 失败处理（v3 简化）

**变更文件**: `services/opencode-client.ts` — `runAgentSession` 函数

```
session.create 返回错误
  → 打印完整 error.data（含 configPath + issues）
  → 返回 hard-error（不再清缓存，避免恶性循环）
  
用户重试
  → 直接 health check → session.create
  → 若仍失败 → 提示用户检查设置页配置
```

> **v3 变更**: 移除了 `clearProviderAuthCache()` 调用。旧版在 session.create 失败时清缓存会导致下次重试触发完整 setProviderAuth（含 dispose），而 dispose 触发配置重载又会导致 session 端点阻塞，形成 session.create 超时 → 清缓存 → 重试 dispose → 再次超时 的恶性循环。

### 3.4 autopilot Bug 修复

**变更文件**: `pages/solo/autopilot/index.tsx`

| Bug | 修复 |
|-----|------|
| handleChatSend 缺模型验证 | 添加 `getSessionModel()` + `configuredModels()` 前置检查 |
| onCleanup 缺 orchestrator 清理 | 新增 `orchestrator.abort()` |
| handleStart catch 缺资源清理 | 新增 `clearTimers()` + `orchestrator.abort()` |

### 3.5 四层诊断日志体系

| 前缀 | 层级 | 职责 | 示例 |
|------|------|------|------|
| `[solo-chat]` | 页面入口 | handleStart / handleChatSend 入口状态 | mode, hasModel, modelID |
| `[xingjing]` | 业务层 | callAgent / setProviderAuth | providerID, maskedKey |
| `[xingjing-diag]` | 诊断层 | session.create / promptAsync 详细参数 | params, raw response |
| `[app-store]` | 状态层 | ensureAuth 钩子 | providerID, hasApiKey |

---

## 4. 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `xingjing/pages/settings/index.tsx` | 修改 | handleSave read-merge-write + readOpencodeConfig 双格式兼容 |
| `xingjing/services/opencode-client.ts` | 修改 | setProviderAuth 四步流程 + session 就绪检测；移除 ensureAuth/clearProviderAuthCache |
| `xingjing/stores/app-store.tsx` | 修改 | 启动后台 auth 同步；移除 registerEnsureAuth 和产品切换时 setProviderAuth |
| `xingjing/pages/solo/autopilot/index.tsx` | 修改 | 模型前置验证 + onCleanup/catch 资源清理 + 诊断日志 |

---

## 5. 数据流

### 5.1 设置保存流程

```
用户点击「保存」
  → setLlmConfig(cfg)                    // 更新内存
  → setProviderAuth(providerID, apiKey)   // 同步到 OpenCode（4步）
  → readOpencodeConfig()                  // 读取现有配置
  → merge { model: "provider/modelID" }   // 合并模型
  → delete config.providers              // 移除非法字段
  → writeOpencodeConfig(merged)           // 写回
  → saveGlobalSettings(yaml)              // 本地持久化
```

### 5.2 Chat 模式对话流程（v3 简化）

```
用户发送消息
  → handleChatSend()
  │   ├─ 模型前置验证 (getSessionModel)
  │   └─ callAgent(opts)
  │       └─ executeAgentWithRetry()
  │           └─ runAgentSession()
  │               ├─ refreshLocalClient（Tauri 端口刷新）
  │               ├─ health check（3s 超时）
  │               ├─ session.create(title, directory)
  │               │   ├─ 成功 → promptAsync → SSE 流
  │               │   └─ 失败 → hard-error（提示用户检查设置）
  │               └─ SSE 事件分流
  │                   ├─ message.updated → 追踪 userMsgId
  │                   ├─ message.part.updated → 过滤 user 消息 → 累积 AI 文本
  │                   ├─ message.part.delta → 增量追加
  │                   └─ session.completed/idle → onDone
  └─ 用户重试（如失败）
      └─ 直接 health check → session.create（无 auth 操作）
```

> **v3 关键变更**: session.create 前不再调用 ensureAuth，不再触发 auth.set/dispose/waitForHealthy。

### 5.3 Dispatch 模式调度流程

```
用户发送消息
  → handleStart()
  │   └─ orchestrator.run(goal)
  │       ├─ Phase 1: createOrchestratorSession → promptAsync → 解析 dispatchPlan
  │       └─ Phase 2: Promise.all(createAgentSession × N)
  │           ├─ 设置 agentSlots
  │           ├─ 自动切换 activeTabId → 第一个 Agent Tab
  │           └─ 各 Agent 的 MessageAccumulator 独立订阅 SSE → messages() 响应式更新
  └─ UI 渲染
      ├─ activeTabId !== 'orchestrator' → AgentSessionView 显示实时 AI 输出
      └─ SessionTabBar 展示各 Agent 状态与切换
```

---

## 6. 非功能性需求

| 维度 | 要求 | 实现 |
|------|------|------|
| **性能** | 对话零额外延迟 | auth 同步在启动/设置时完成，session.create 前仅 health check（3s） |
| **缓存** | 同 Provider/Key 不重复 dispose | `_lastVerifiedAuthKey` 缓存 + provider.list 验证 |
| **解耦** | auth 与 session.create 完全分离 | 移除 ensureAuth 钩子，session.create 路径零 auth 操作 |
| **可观测** | 5 分钟内定位故障 | 四层日志前缀 + session.create error.data.issues |
| **兼容性** | 旧配置无损读取 | readOpencodeConfig 支持 string 和 object 两种 model 格式 |
| **安全** | API Key 不出现在日志 | maskedKey: `sk-b...217e` 脱敏 |

---

## 7. SSE 消息过滤与 Tab 显示修复（v2.0 新增）

### 7.1 Dispatch 模式 Tab 不自动切换

**根因**: `orchestrator.run()` Phase 2 完成后 `activeTabId` 仍停留在 `'orchestrator'`，渲染条件 `activeTabId !== 'orchestrator' && getActiveSlot()` 为 false，用户只看到占位文案 "点击上方 Tab 查看"。对比 `runDirect()` 有显式 `setState('activeTabId', agentId)` 切换。

**修复**: Phase 2 `Promise.all` 完成后，自动切换 `activeTabId` 到第一个 Agent。

### 7.2 Chat 模式 userMsgId 误判

**根因**: 旧代码 `sendPrompt && !userMsgId && partMsgId` 回退逻辑将首个到达且无 `role` 的消息无条件标记为用户消息。若 AI 响应先于 prompt 回显到达（或 `part.role` 未定义），AI 消息 ID 被误设为 `userMsgId` → 所有 AI 文本被过滤 → `onText` 永远不被调用。

**修复**: 移除激进回退，仅通过以下两个可靠路径识别用户消息：
1. `message.updated` 事件的 `msg.role === 'user'`（message 级别最可靠）
2. `message.part.updated` 事件的 `part.role === 'user'`（part 级别补充）

### 7.3 Delta 事件竞态

**根因**: `message.part.delta` 处理要求 `sessionMsgIds.has(msgId)` 预注册，但 delta 可能先于 `message.part.updated` 到达。

**修复**: 放宽条件为 `msgId !== userMsgId` 即可处理 delta，并自动将 msgId 注册到 `sessionMsgIds`。

### 7.4 缺少 message.updated 事件处理

**根因**: `runAgentSession` 只处理 `message.part.*` 事件，不处理 `message.updated`。而 `message.updated` 是 OpenCode 中携带可靠 `msg.role` 字段的事件类型。

**修复**: 新增 `message.updated` handler，从 `msg.role` 可靠追踪 userMsgId 和 assistantMsgId，并注册到 `sessionMsgIds`。

---

## 8. Auth 同步从 session.create 热路径解耦（v3.0 新增）

### 8.1 问题根因

v1/v2 的架构将 `setProviderAuth`（auth.set + dispose + waitForHealthy）通过 `ensureAuth` 钩子插入 `runAgentSession` 的 session.create 前：

```
session.create 调用链（v1/v2）:
  health check → ensureAuth → auth.set → dispose → waitForHealthy → session.create
                                    │
                                    └─ auth.set 触发 OpenCode 配置热重载
                                       → health 端点可达但 session 端点阻塞
                                       → session.create 10s 超时
```

失败后的恶性循环：
```
session.create 超时 → clearProviderAuthCache → 下次重试必走完整 setProviderAuth
  → 再次 auth.set → 再次配置重载 → 再次超时 → 无限循环
```

### 8.2 OpenWork 原生模式对比

| 维度 | OpenWork 原生 | 星静 v1/v2 | 星静 v3（修复后） |
|------|-------------|----------|----------------|
| auth.set 时机 | Settings 页保存时 | session.create 前（ensureAuth） | Settings 页保存 + 启动时 |
| dispose 时机 | Settings 页保存时 | session.create 前（ensureAuth） | Settings 页保存时 |
| session.create 前置 | health check 仅 | health check + ensureAuth | health check 仅 |
| 失败恢复 | 提示用户检查设置 | clearProviderAuthCache → 恶性循环 | 提示用户检查设置 |

### 8.3 技术方案

**变更文件**:

| 文件 | 变更 |
|------|------|
| `services/opencode-client.ts` | 移除 `_ensureAuthFn`/`registerEnsureAuth`/`clearProviderAuthCache`；runAgentSession 不再调用 ensureAuth；dispose 前探测改用 health()；新增 session 端点就绪轮询 |
| `stores/app-store.tsx` | 移除 `registerEnsureAuth` 注册；移除产品切换时 setProviderAuth；改为启动后台同步 |

**Auth 同步时机（v3）**:

```
1. 应用启动
   loadGlobalSettings() → setState(llmConfig) → setProviderAuth() [后台]

2. 设置页保存
   handleSave() → setProviderAuth() → [auth.set+dispose+waitForHealthy+session就绪]

3. 用户发起对话
   runAgentSession() → health check → session.create → SSE 流
   （零 auth 操作）
```

**setProviderAuth 就绪检测增强**:

```
Step 1: auth.set() — 写入 API Key
Step 2: global.health() 探测 → dispose() — 触发重载
  [探测改用 health() 替代 session.list()，避免误判]
Step 3: waitForHealthy(8s, 250ms) — 等待 health 端点就绪
Step 3.5: session.list() 轮询(3s, 250ms) — 等待 session 端点就绪 [v3 新增]
  [消除“health 可达但 session 阻塞”的半就绪状态]
Step 4: provider.list() 验证 + 缓存
```

---

## 9. 风险与约束

| 风险 | 缓解 |
|------|------|
| `instance.dispose()` 在共享客户端上可能影响 OpenWork | dispose 仅在设置页保存和启动时触发，不在对话热路径上；dispose 是 OpenWork 自身 refreshProviders 的标准操作 |
| 启动时 OpenCode 未就绪 | setProviderAuth 后台执行，失败不阻断启动；用户发起对话时 health check 会检测到问题并触发重试层 |
| 用户修改 API Key 后未保存即发起对话 | session.create 会报 ConfigInvalidError，提示“请在设置页配置 API Key” |
| 旧版 opencode.jsonc 存量用户 | readOpencodeConfig 兼容旧格式；handleSave 自动迁移 |
| OpenCode schema 变更 | `$schema` 声明 + 仅使用标准字段（model/mcp/plugin） |

---

## 9. 验证清单

### v1.0 — ConfigInvalidError 修复
- [x] opencode.jsonc 生成格式符合 `https://opencode.ai/config.json` schema
- [x] setProviderAuth 四步流程（auth.set → dispose → waitForHealthy → provider.list）
- [x] provider.list 返回值正确解析 `{all: [...]}` 结构
- [x] session.create 失败时清除 auth 缓存
- [x] readOpencodeConfig 兼容新旧 model 格式
- [x] autopilot onCleanup/catch 资源清理
- [x] 诊断日志四层前缀覆盖全链路
- [x] 编译零新增错误（仅 2 个预存错误）
- [x] 批量修正存量 opencode.jsonc 文件（6 个产品目录）

### v2.0 — SSE 消息过滤与 Tab 显示修复
- [x] dispatch 模式 Phase 2 完成后自动切换到第一个 Agent Tab
- [x] 移除 userMsgId 激进回退逻辑，防止 AI 消息被误过滤
- [x] message.part.delta 放宽 sessionMsgIds 注册要求，修复竞态
- [x] 新增 message.updated 事件处理器，可靠追踪用户/助手消息 ID
- [x] 编译零新增错误

### v3.0 — Auth 同步从 session.create 热路径解耦
- [x] 移除 `_ensureAuthFn` / `registerEnsureAuth` 钩子机制
- [x] 移除 `runAgentSession` 中的 ensureAuth 调用，session.create 路径仅保留 health check
- [x] 移除 session.create 失败时的 `clearProviderAuthCache`，打断恶性循环
- [x] 移除产品切换时的 `setProviderAuth` 调用
- [x] 启动时一次性后台 `setProviderAuth`（loadGlobalSettings 完成后）
- [x] `setProviderAuth` dispose 前探测改用 `global.health()` 替代 `session.list()`
- [x] 新增 session 端点就绪轮询（Step 3.5），消除“半就绪”状态
- [x] 清理死代码 `clearProviderAuthCache` 导出
- [x] 编译零错误
