---
meta:
  id: SDD-010
  title: 独立版驾驶舱模型选择 OpenWork 原生化
  status: proposed
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: SDD-007
  revision: "1.0"
  created: "2026-04-17"
  updated: "2026-04-17"
sections:
  background: "SDD-007 将 API Key 管理迁移到 OpenCode Provider Store，但独立版驾驶舱（solo/autopilot）的模型选择系统仍依赖旧的 providerKeys 本地缓存机制，导致 dispatch 模式被阻断、模型选择器永远为空"
  goals: "将 OpenWork 的 providerConnectedIds、modelOptions、submitProviderApiKey 通过 Context 桥接层注入星静，替换旧的静态模型列表和本地 Key 缓存，修复 SDD-007 后驾驶舱 AI 会话能力的断裂"
  architecture: "扩展 XingjingOpenworkContext 接口和 xingjing-native.tsx 桥接层，透传 OpenWork 动态 Provider/Model 状态；重写 autopilot/index.tsx 的 configuredModels/getSessionModel 函数；修复 team-session-orchestrator 的 model 传递"
  interfaces: "复用 OpenWork: providerConnectedIds Memo / modelConfig.modelOptions() / submitProviderApiKey()；修改: app.tsx props / xingjing-native.tsx / app-store.tsx / autopilot/index.tsx / enhanced-composer.tsx / team-session-orchestrator.ts"
  nfr: "Provider 连接后模型列表实时更新；无 Provider 连接时显示明确引导；静态 modelOptions 作为 OpenWork 不可用时的兜底"
---

# SDD-010 独立版驾驶舱模型选择 OpenWork 原生化

## 元信息

- 编号：SDD-010-autopilot-model-openwork-integration
- 状态：proposed
- 作者：architect-agent
- 前置依赖：SDD-007（LLM Provider 管理 OpenWork 原生化）
- 修订版本：1.0
- 创建日期：2026-04-17

---

## 1. 背景与问题域

### 1.1 SDD-007 遗留问题

SDD-007 成功将 API Key 存储迁移到 OpenCode Provider Store，完成了：
- `provider-bridge.ts` 桥接层创建
- `opencode-client.ts` 中 `setProviderAuth`/`callAgentDirect` 删除
- `app-store.tsx` 中 `ensureApiKey` 删除
- LLMTab 设置页重写

但**独立版驾驶舱**（`solo/autopilot/index.tsx`）的模型选择系统未被改造，仍依赖旧机制：

| 断裂点 | 位置 | 问题描述 |
|--------|------|---------|
| `providerKeys` 信号 | L614 | 从 `state.llmConfig.apiKey`（现为 `''`）和 `loadProjectSettings().llmProviderKeys`（迁移后被清除）读取，永远为空 |
| `configuredModels()` | L619-624 | 按 `providerKeys` 过滤静态 `modelOptions`，结果永远为空数组 |
| `getSessionModel()` | L626-631 | 依赖 `providerKeys` 判定可用性，永远返回 `undefined` |
| dispatch 门控 | L958 | `!getSessionModel() && configuredModels().length === 0` 永远为真，阻断所有 dispatch |
| orchestrator model | L831-835 | `getSessionModel()` 返回 null → orchestrator 无 model |
| EnhancedComposer | L1679 | `configuredModels()` 为空 → 显示"未配置模型" |
| promptAsync 无 model | orchestrator L149, L258 | `opts.model()` 未被传递给 `promptAsync` 调用 |

### 1.2 OpenWork 已有但未被利用的能力

OpenWork 平台已完整实现动态模型管理链路：

```
GlobalSyncProvider (SSE)
  └── provider.all / provider.connected / provider.default
        │
createProvidersStore()
  └── refreshProviders() / submitProviderApiKey() / providerConnectedIds
        │
createModelConfigStore()
  └── modelOptions() — 含 isConnected / isRecommended / disabled / behaviorOptions
        │
app.tsx 已有实例
  └── providerConnectedIds (L431 Memo)
  └── modelConfig.modelOptions() (L446)
  └── submitProviderApiKey (L835)
```

这些数据源在 `app.tsx` 中已实例化，但未透传给星静。

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | 驾驶舱模型选择器显示 OpenWork 动态 Provider 模型列表（仅已连接） | P0 |
| FR-02 | dispatch 模式基于 `providerConnectedIds` 判定可用性，不再依赖本地 Key | P0 |
| FR-03 | orchestrator/agent 的 `promptAsync` 调用携带用户选定的 model | P0 |
| FR-04 | Chat 模式 `callAgent` 正确传递 model（已由 app-store fallback 覆盖） | P0 |
| FR-05 | 无 Provider 连接时，模型选择器显示"未连接 Provider · 请在设置中配置" | P0 |
| FR-06 | Provider 连接状态变更时，模型列表实时更新（SolidJS 响应式） | P1 |
| FR-07 | OpenWork 不可用时，静态 `modelOptions` + `connectedIds` 作为兜底 | P1 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 版本隔离 | 仅改动独立版（Solo）代码路径 |
| 框架 | SolidJS 响应式，通过 Context 注入 |
| 兼容 | 新增 props 均为可选，不影响 OpenWork 主应用行为 |
| 依赖 | SDD-007 已完成的 provider-bridge.ts 和 app-store.tsx 改造 |

### 2.3 不在范围内

- 团队版 Provider 管理
- 驾驶舱引入 OpenWork ModelPickerModal（保持轻量 select 组件）
- Settings LLMTab 进一步改造（已在 SDD-007 完成）

---

## 3. 系统架构

### 3.1 数据流改造

**改造前（断裂）：**

```
app.tsx (OpenWork)
  └── selectedModel → xingjing-native.tsx → app-store.tsx → callAgent fallback ✅
  ✗ providerConnectedIds (未透传)
  ✗ modelOptions (未透传)

solo/autopilot/index.tsx
  └── loadProjectSettings() → providerKeys → configuredModels → ❌ 空
  └── getSessionModel() → ❌ undefined
  └── dispatch 门控 → ❌ 永远阻断
  └── orchestrator.model() → ❌ null
```

**改造后（联通）：**

```
app.tsx (OpenWork)
  ├── selectedModel ──────────────→ ✅ 已有
  ├── providerConnectedIds ───────→ 🆕 新增透传
  ├── modelOptions ───────────────→ 🆕 新增透传
  └── submitProviderApiKey ───────→ 🆕 新增透传（预留）
        │
  xingjing-native.tsx (桥接)
        │
  app-store.tsx (XingjingOpenworkContext)
        │
  solo/autopilot/index.tsx
    ├── configuredModels() → owModels.filter(isConnected) ✅
    ├── getSessionModel() → 从 configuredModels 选取 ✅
    ├── dispatch 门控 → configuredModels().length > 0 ✅
    └── orchestrator.model() → getSessionModel() ✅
              │
    team-session-orchestrator.ts
      └── promptAsync({ model }) ✅
```

### 3.2 模块变更清单

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `app.tsx` L2348-2360 | **修改** | 新增 3 个 props 传递给 XingjingNativePage |
| `pages/xingjing-native.tsx` L47-134 | **修改** | 扩展 Props 接口 + Context 构建 |
| `xingjing/stores/app-store.tsx` L51-100 | **修改** | 扩展 XingjingOpenworkContext 接口 |
| `xingjing/pages/solo/autopilot/index.tsx` | **重写** | 替换模型选择系统 |
| `xingjing/components/autopilot/enhanced-composer.tsx` L574 | **修改** | 空状态提示文案 |
| `xingjing/services/team-session-orchestrator.ts` L149, L258 | **修改** | promptAsync 增加 model |
| `xingjing/services/provider-bridge.ts` | **标记** | fetchProviderState/connectProvider 标记为过渡 |

---

## 4. 详细设计

### 4.1 Context 桥接层扩展

**XingjingOpenworkContext 新增字段**（app-store.tsx）：

```typescript
export interface XingjingOpenworkContext {
  // ... 已有字段 ...

  /** OpenWork 已连接的 Provider ID 列表（响应式） */
  providerConnectedIds?: () => string[];
  /** OpenWork 动态模型选项列表（含连接状态、推荐标记） */
  modelOptions?: () => Array<{
    providerID: string;
    modelID: string;
    title: string;
    isConnected: boolean;
    isRecommended?: boolean;
  }>;
  /** 通过 OpenWork Provider Store 提交 API Key */
  submitProviderApiKey?: (providerId: string, apiKey: string) => Promise<string>;
}
```

**XingjingNativePageProps 新增**（xingjing-native.tsx）：

```typescript
interface XingjingNativePageProps {
  // ... 已有 props ...
  providerConnectedIds?: () => string[];
  modelOptions?: () => Array<{
    providerID: string; modelID: string; title: string;
    isConnected: boolean; isRecommended?: boolean;
  }>;
  submitProviderApiKey?: (providerId: string, apiKey: string) => Promise<string>;
}
```

**app.tsx 注入**（L2348-2360）：

```typescript
<XingjingNativePage
  // ... 已有 props ...
  providerConnectedIds={providerConnectedIds}
  modelOptions={() => modelConfig.modelOptions().map(o => ({
    providerID: o.providerID, modelID: o.modelID,
    title: o.title, isConnected: o.isConnected,
    isRecommended: o.isRecommended,
  }))}
  submitProviderApiKey={submitProviderApiKey}
/>
```

### 4.2 Autopilot 模型选择重写

**删除旧代码**：`providerKeys`、`configuredModels()`、`getSessionModel()`、`onMount` 中 `loadProjectSettings + providerKeys`

**新增 OpenWork 驱动逻辑**：

```typescript
const configuredModels = () => {
  const owModels = openworkCtx?.modelOptions?.() ?? [];
  const connectedIds = openworkCtx?.providerConnectedIds?.() ?? [];
  // 优先用 OpenWork 动态列表
  if (owModels.length > 0) {
    return owModels
      .filter(o => o.isConnected)
      .map(o => ({ modelID: o.modelID, label: o.title, providerID: o.providerID }));
  }
  // 兜底：静态列表 + connectedIds
  if (connectedIds.length > 0) {
    return modelOptions
      .filter(o => o.providerID !== 'custom' && connectedIds.includes(o.providerID))
      .map(o => ({ modelID: o.modelID, label: o.label, providerID: o.providerID }));
  }
  return [];
};

const getSessionModel = () => {
  const models = configuredModels();
  if (models.length === 0) return undefined;
  const selected = models.find(o => o.modelID === sessionModelId());
  return selected ?? models[0];
};

// 自动选中首个可用模型
createEffect(() => {
  const models = configuredModels();
  if (models.length > 0 && !models.find(o => o.modelID === sessionModelId())) {
    setSessionModelId(models[0].modelID);
  }
});
```

### 4.3 Dispatch 门控修复

```typescript
// 旧: if (!getSessionModel() && configuredModels().length === 0)
// 新:
if (configuredModels().length === 0) {
  setAgentError('尚未连接任何大模型 Provider，请先前往「设置 → 大模型配置」连接 API Key');
  return;
}
```

### 4.4 Orchestrator Model 传递修复

```typescript
// createOrchestratorSession (L149)
const model = opts.model();
await (client.session as any).promptAsync({
  sessionID: session.id,
  directory: opts.workDir(),
  ...(model ? { model } : {}),
  parts: [{ type: 'text', text: goal }],
});

// createAgentSession (L258) — 同样添加
const model = opts.model();
await (client.session as any).promptAsync({
  sessionID: session.id,
  directory: opts.workDir(),
  ...(model ? { model } : {}),
  parts: [{ type: 'text', text: task }],
});
```

---

## 5. 接口定义

### 5.1 复用 OpenWork 已有数据

| 数据源 | 来源 | 用途 |
|--------|------|------|
| `providerConnectedIds` | `app.tsx` L431 Memo ← `globalSync.data.provider.connected` | 判定 Provider 可用性 |
| `modelConfig.modelOptions()` | `app.tsx` L446 `createModelConfigStore` | 动态模型列表（含 isConnected） |
| `submitProviderApiKey` | `app.tsx` L835 `createProvidersStore` | 预留：驾驶舱内直接连接 Provider |

### 5.2 星静内部修改接口

| 接口 | 变更 | 说明 |
|------|------|------|
| `XingjingOpenworkContext` | 新增 3 字段 | providerConnectedIds, modelOptions, submitProviderApiKey |
| `XingjingNativePageProps` | 新增 3 props | 同上透传 |
| `configuredModels()` | 重写 | 从 OpenWork 动态列表构建 |
| `getSessionModel()` | 重写 | 从 configuredModels 选取 |

---

## 6. 非功能需求

| 类型 | 要求 | 验证方式 |
|------|------|---------|
| **响应式** | Provider 连接/断开后，模型选择器实时更新 | 手动测试 |
| **兜底** | OpenWork modelOptions 为空时，静态 modelOptions + connectedIds 兜底 | 手动测试 |
| **兼容** | 新增 props 均为可选，不影响 OpenWork 主应用 | 编译检查 |
| **可维护** | 删除 providerKeys/loadProjectSettings 等旧逻辑约 40 行 | 代码审查 |

---

## 7. 风险与缓释

| 风险 | 影响 | 缓释措施 |
|------|------|---------|
| app.tsx 修改影响 OpenWork 主应用 | 主应用崩溃 | 新增 props 均为可选，不传时行为不变 |
| modelOptions 类型映射丢失信息 | 部分 UI 字段缺失 | 只映射必要字段，避免耦合内部类型 |
| OpenWork 未启动时 modelOptions 为空 | 模型列表为空 | configuredModels() 含兜底逻辑 |
| promptAsync model 参数格式不符 | session 创建失败 | HeyAPI SDK 已验证展平参数风格 |

---

## 8. 测试策略

| 场景 | 类型 | 验证内容 |
|------|------|---------|
| 连接 DeepSeek → 打开驾驶舱 | 手动 | 模型选择器显示 DeepSeek 模型 |
| Chat 模式发送消息 | 手动 | callAgent 携带正确 model |
| Dispatch 模式启动 | 手动 | 门控通过，orchestrator promptAsync 携带 model |
| 无 Provider 连接 | 手动 | 选择器显示"未连接 Provider"，dispatch 阻断并提示 |
| Provider 动态变更 | 手动 | 在设置页连接新 Provider 后返回驾驶舱，列表自动更新 |
| 编译检查 | 自动 | `pnpm tsc --noEmit` 零错误 |
| 废弃模式扫描 | 自动 | `grep -r "providerKeys\b"` 在 autopilot 中零命中 |

---

## 9. 实施路径

1. 扩展 Context 桥接层（app.tsx → xingjing-native.tsx → app-store.tsx）
2. 重写 autopilot 模型选择系统
3. 升级 EnhancedComposer 空状态提示
4. 修复 team-session-orchestrator model 传递
5. 简化 provider-bridge.ts（标记过渡函数）
6. 全量验证
