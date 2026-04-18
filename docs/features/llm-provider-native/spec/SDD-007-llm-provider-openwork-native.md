---
meta:
  id: SDD-007
  title: LLM Provider 管理 OpenWork 原生化
  status: proposed
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: null
  revision: "1.0"
  created: "2026-04-17"
  updated: "2026-04-17"
sections:
  background: "星静自建了一套 API Key 管理体系（~/.xingjing/global-settings.yaml + 内存缓存 + 直连降级），与 OpenWork 原生 Provider Store 双写不同步，导致重复代码 800+ 行和安全隐患"
  goals: "全面委托 OpenWork Provider Store 管理 API Key 生命周期，消除自建存储、直连降级和硬编码默认 Key，实现单一认证来源"
  architecture: "Settings LLMTab 改为调用 OpenWork Provider Store API（provider.list / auth.set / submitProviderApiKey），删除 callAgentDirect 直连降级，app-store 启动时从 Provider Store 读取连接状态而非自读 YAML"
  interfaces: "复用 OpenWork: client.provider.list() / client.provider.auth() / client.auth.set() / createProvidersStore()；修改: LLMTab / app-store.tsx / opencode-client.ts"
  nfr: "首次连接测试 <3s；OpenWork 未连接时显示明确引导而非静默失败；迁移兼容：首次启动自动迁移旧 YAML 配置"
---

# SDD-007 LLM Provider 管理 OpenWork 原生化

## 元信息

- 编号：SDD-007-llm-provider-openwork-native
- 状态：proposed
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-17

---

## 1. 背景与问题域

星静（Xingjing）运行在 harnesswork（OpenWork）平台之上，通过 OpenCode SDK 调用 LLM 完成 AI 对话。当前的 API Key 管理存在**两套并行体系**：

### 1.1 现状问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **双写不同步** | 星静自维护 `~/.xingjing/global-settings.yaml`，同时调用 `client.auth.set()` 注入 OpenCode — 两处存储可能不一致 | 切换 workspace 后 key 丢失、重启后状态不匹配 |
| **硬编码默认 Key** | `DEFAULT_LLM_CONFIG` 中硬编码 DeepSeek Key `sk-b31d...` | 安全隐患：Key 暴露在源码和构建产物中 |
| **重复实现** | `callAgentDirect()` 自建 600+ 行的 HTTP 直连降级逻辑（OpenAI + Anthropic 兼容） | 与 OpenCode 的 LLM 调用能力完全重叠 |
| **静态 Provider 列表** | `modelOptions` 硬编码 8 种 Provider | 新增 Provider 需修改源码，无法动态发现 |
| **无 OAuth 支持** | 仅支持 API Key 方式 | OpenAI 等支持 OAuth 的 Provider 无法使用更安全的认证方式 |
| **per-provider 缓存复杂** | `providerKeys` 信号 + `llmProviderKeys` YAML 字段实现多 Provider key 隔离 | 逻辑复杂、易出 bug（已修复过 2 次） |

### 1.2 OpenWork 已有能力

OpenWork 平台已提供完整的 Provider 认证管理栈：

```
┌─────────────────────────────────────────────────────────┐
│  UI 层：ProviderAuthModal                                │
│  - 动态 Provider 列表 + 连接状态                         │
│  - OAuth 流程 + API Key 输入                             │
│  - 连接/断开操作                                         │
├─────────────────────────────────────────────────────────┤
│  状态层：createProvidersStore()                           │
│  - refreshProviders() / submitProviderApiKey()           │
│  - startProviderAuth() / completeProviderAuthOAuth()     │
│  - disconnectProvider()                                  │
│  - providerConnectedIds / providerDefaults               │
├─────────────────────────────────────────────────────────┤
│  数据层：GlobalSyncProvider → globalStore.provider        │
│  - client.provider.list() → { all, connected, default }  │
│  - client.provider.auth() → 认证方法发现                  │
│  - client.auth.set() → 持久化到 ~/.config/opencode/auth/ │
└─────────────────────────────────────────────────────────┘
```

**核心结论**：星静不应该自建 API Key 管理，应全面委托 OpenWork Provider Store。

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | LLMTab 从 OpenWork Provider Store 动态获取 Provider 列表，替代硬编码 `modelOptions` | P0 |
| FR-02 | API Key 提交通过 `submitProviderApiKey()` 写入 OpenCode 原生存储，不再写 YAML | P0 |
| FR-03 | 删除 `callAgentDirect()` 直连降级逻辑，统一通过 OpenCode 调用 LLM | P0 |
| FR-04 | 删除 `DEFAULT_LLM_CONFIG` 中的硬编码 API Key | P0 |
| FR-05 | app-store 启动时从 Provider Store 读取已连接 Provider 和默认模型 | P0 |
| FR-06 | 首次启动时自动迁移 `~/.xingjing/global-settings.yaml` 中的遗留 Key | P1 |
| FR-07 | 支持 OAuth 认证方式（复用 OpenWork ProviderAuthModal） | P1 |
| FR-08 | Provider 连接状态实时展示（已连接/未连接/断开） | P0 |
| FR-09 | OpenWork 未连接时显示明确引导，而非静默失败 | P0 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 版本隔离 | 仅改动独立版（Solo）代码路径，不影响团队版 |
| 框架 | SolidJS 响应式，复用 OpenWork context/providers/ 模块 |
| 兼容性 | 旧版 `~/.xingjing/global-settings.yaml` 配置自动迁移，用户无感 |
| OpenCode 依赖 | 必须 OpenCode 服务可用才能管理 Provider（无自建降级） |

### 2.3 不在范围内

- 团队版 Provider 管理（另立 SDD）
- OpenCode 引擎本身的 Provider 实现修改
- xingjing-server 后端 API Key 管理
- 自定义 Provider（custom）的完整保留（简化为 OpenCode 原生配置）

---

## 3. 系统架构

### 3.1 改造前后对比

**改造前（双写体系）：**

```
用户输入 API Key
       │
       ├──→ state.llmConfig（内存）
       ├──→ ~/.xingjing/global-settings.yaml（自建 YAML）
       ├──→ client.auth.set()（注入 OpenCode）
       └──→ .qoder/opencode.json（OpenWork 工作区配置）
       
callAgent()
       ├──→ OpenCode session.promptAsync()
       └──→ callAgentDirect()（自建 HTTP 直连降级）
```

**改造后（单一来源）：**

```
用户输入 API Key
       │
       └──→ submitProviderApiKey() → client.auth.set()
            → 持久化到 ~/.config/opencode/auth/{provider}.json
            → refreshProviders() 刷新连接状态

callAgent()
       └──→ OpenCode session.promptAsync()（唯一路径）
```

### 3.2 模块变更清单

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `pages/settings/index.tsx` LLMTab | **重写** | Provider 列表动态获取；API Key 通过 Provider Store 提交；删除 providerKeys 本地缓存；删除直连测试逻辑 |
| `stores/app-store.tsx` | **简化** | 删除 `DEFAULT_LLM_CONFIG` 硬编码 Key；`onMount` 改读 Provider Store 连接状态；删除 `setLlmConfig` 写 YAML 逻辑 |
| `services/opencode-client.ts` | **精简** | 删除 `callAgentDirect()`（~300 行）；删除 `setProviderAuth()` 包装（由 Provider Store 接管）；删除 `_providerApiKeys` 内存缓存 |
| `services/file-store.ts` | **保留** | `loadGlobalSettings` / `saveGlobalSettings` 保留用于迁移和 allowedTools 等非 LLM 配置 |
| `mock/settings.ts` | **精简** | 删除 `defaultLLMConfig`；`modelOptions` 降级为 fallback（OpenWork 不可用时的静态列表） |
| **新增** `services/provider-bridge.ts` | **新建** | 星静与 OpenWork Provider Store 的桥接层，封装 Provider 列表获取、连接状态查询、API Key 提交、迁移逻辑 |

---

## 4. 详细设计

### 4.1 Provider Bridge 服务（新建）

```typescript
// services/provider-bridge.ts
// 星静与 OpenWork Provider Store 的桥接层

import type { ProviderListItem } from '../../../../types';
import type { ProviderAuthMethod } from '../../../../context/providers/store';

export interface ProviderBridgeState {
  providers: ProviderListItem[];           // 动态 Provider 列表
  connectedIds: string[];                  // 已连接的 Provider ID 列表
  defaults: Record<string, string>;        // 默认 Provider→Model 映射
  authMethods: Record<string, ProviderAuthMethod[]>; // 各 Provider 支持的认证方法
  ready: boolean;                          // Provider Store 是否就绪
}

/** 从 OpenWork GlobalSync 读取 Provider 列表和连接状态 */
export function readProviderState(globalSync): ProviderBridgeState;

/** 获取当前活跃的默认模型配置 */
export function getActiveModel(state: ProviderBridgeState): {
  providerID: string;
  modelID: string;
  modelName: string;
} | null;

/** 检查指定 Provider 是否已连接 */
export function isProviderConnected(
  state: ProviderBridgeState,
  providerID: string,
): boolean;

/** 从旧 YAML 配置迁移 API Key 到 OpenCode 原生存储 */
export async function migrateFromYaml(
  client: OpencodeClient,
  globalSettings: GlobalSettings,
): Promise<{ migrated: string[]; failed: string[] }>;
```

### 4.2 LLMTab 重写方案

**改造前后接口对比：**

| 功能 | 改造前 | 改造后 |
|------|--------|--------|
| Provider 列表 | 硬编码 `modelOptions`（8 项） | `globalSync.provider.all` 动态获取 |
| 连接状态 | 无（仅检查 apiKey 是否非空） | `globalSync.provider.connected` 实时状态 |
| 保存 Key | `saveGlobalSettings()` + `setProviderAuth()` + `writeOpencodeConfig()` | `submitProviderApiKey()` 一步完成 |
| 连接测试 | 自建 `fetch()` 直连 API | 通过 OpenCode `callAgent` 快速验证 |
| 模型选择 | 下拉选择 → 手动填 Key | Provider 卡片列表 + 连接/断开操作 |

**新 LLMTab UI 结构：**

```
┌─────────────────────────────────────────────────────────┐
│  大模型配置                                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [已连接的 Provider 卡片]                          │   │
│  │  ✅ DeepSeek  deepseek-chat  [断开] [设为默认]    │   │
│  │  ✅ OpenAI    gpt-4o         [断开] [设为默认]    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [未连接的 Provider 列表]                          │   │
│  │  ○ Anthropic   [连接]                             │   │
│  │  ○ Qwen        [连接]                             │   │
│  │  ○ OpenRouter   [连接]                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [默认模型选择]                                    │   │
│  │  当前默认：DeepSeek / deepseek-chat               │   │
│  │  [模型下拉选择] ← 仅显示已连接 Provider 的模型    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [测试连接]  ← 通过 OpenCode callAgent 验证             │
└─────────────────────────────────────────────────────────┘
```

### 4.3 app-store.tsx 简化方案

**删除项：**

| 现有代码 | 处理 |
|---------|------|
| `DEFAULT_LLM_CONFIG`（含硬编码 Key） | 删除 Key 字段，仅保留模型名称作为 UI 默认显示 |
| `state.llmConfig.apiKey` | 删除 — Key 不再存储在星静 store 中 |
| `setLlmConfig()` 写 YAML | 改为仅更新内存中的模型选择（providerID + modelID） |
| `onMount → loadGlobalSettings().then(g => setState('llmConfig'))` | 改为从 Provider Store 读取 connected + defaults |
| 产品切换 `createEffect` 中的 `setProviderAuth()` 调用 | 删除 — OpenCode 已持久化认证，无需每次注入 |

**保留项：**

| 现有代码 | 原因 |
|---------|------|
| `state.allowedTools` + `saveGlobalSettings({ allowedTools })` | 工具白名单与 LLM Key 无关，保留 |
| `loadGlobalSettings()` / `saveGlobalSettings()` | 仍用于 allowedTools 等非 LLM 配置 |
| `callAgent()` 包装 | 保留但移除 callAgentDirect 降级分支 |

### 4.4 opencode-client.ts 精简方案

**删除项（约 500 行）：**

```typescript
// 以下函数/变量将被删除：
let _providerApiKeys: Record<string, string>;  // 内存缓存
export async function setProviderAuth();         // Provider Store 接管
export async function callAgentDirect();         // 直连降级（~300 行）
export interface DirectLLMConfig;                // 直连配置类型
```

**保留项：**

```typescript
// 以下函数保留不变：
export function getXingjingClient();             // Client 获取（shared → local 降级）
export async function sessionCreate();           // Session 创建
export async function sessionPrompt();           // Session Prompt
export async function configGetModels();         // 模型列表查询（降级备用）
export function callAgent();                     // 主调用入口（移除 callAgentDirect 分支）
```

### 4.5 迁移策略

```typescript
// services/provider-bridge.ts — migrateFromYaml()

async function migrateFromYaml(client, globalSettings) {
  const migrated: string[] = [];
  const failed: string[] = [];
  
  // 1. 迁移当前 llm 配置中的 key
  if (globalSettings.llm?.providerID && globalSettings.llm?.apiKey) {
    try {
      await client.auth.set({
        providerID: globalSettings.llm.providerID,
        auth: { type: 'api', key: globalSettings.llm.apiKey },
      });
      migrated.push(globalSettings.llm.providerID);
    } catch { failed.push(globalSettings.llm.providerID); }
  }
  
  // 2. 迁移 per-provider keys
  for (const [pid, key] of Object.entries(globalSettings.llmProviderKeys ?? {})) {
    if (migrated.includes(pid)) continue; // 已迁移
    try {
      await client.auth.set({
        providerID: pid,
        auth: { type: 'api', key },
      });
      migrated.push(pid);
    } catch { failed.push(pid); }
  }
  
  // 3. 标记迁移完成（写回 YAML，后续启动跳过）
  if (migrated.length > 0) {
    await saveGlobalSettings({
      ...globalSettings,
      _llmMigratedToOpenCode: true,  // 迁移标记
      llm: globalSettings.llm ? { ...globalSettings.llm, apiKey: '' } : undefined,
      llmProviderKeys: undefined,    // 清除冗余数据
    });
  }
  
  return { migrated, failed };
}
```

**迁移触发时机**：`app-store.tsx` 的 `onMount` 中，检测 `globalSettings._llmMigratedToOpenCode !== true` 时执行一次。

---

## 5. 接口定义

### 5.1 复用 OpenWork 已有接口

| 接口 | 用途 | 调用方 |
|------|------|--------|
| `client.provider.list()` | 获取 Provider 列表 + 连接状态 + 默认模型 | LLMTab onMount、app-store onMount |
| `client.provider.auth()` | 获取各 Provider 支持的认证方式 | LLMTab 连接按钮点击时 |
| `client.auth.set({ providerID, auth })` | 提交 API Key | LLMTab handleSave |
| `client.provider.oauth.authorize()` | 发起 OAuth 流程 | ProviderAuthModal |
| `client.provider.oauth.callback()` | 完成 OAuth 流程 | ProviderAuthModal |

### 5.2 星静内部新增接口

| 接口 | 签名 | 说明 |
|------|------|------|
| `readProviderState()` | `(globalSync) → ProviderBridgeState` | 从 GlobalSync 读取 Provider 状态 |
| `getActiveModel()` | `(state) → { providerID, modelID, modelName } | null` | 获取当前默认模型 |
| `migrateFromYaml()` | `(client, settings) → Promise<{ migrated, failed }>` | 旧配置迁移 |

### 5.3 删除的接口

| 接口 | 原位置 | 删除原因 |
|------|--------|---------|
| `setProviderAuth()` | opencode-client.ts | Provider Store 接管 |
| `callAgentDirect()` | opencode-client.ts | 不再需要直连降级 |
| `DirectLLMConfig` | opencode-client.ts | 随 callAgentDirect 一起删除 |

---

## 6. 非功能需求

| 类型 | 要求 | 验证方式 |
|------|------|---------|
| **性能** | Provider 列表加载 <1s，连接测试 <3s | 手动测试 |
| **安全** | 源码中不含任何硬编码 API Key | `grep -r "sk-" src/` 零命中 |
| **兼容** | 旧版 YAML 配置自动迁移，用户无感 | 迁移单元测试 |
| **可用性** | OpenCode 不可用时，LLMTab 显示明确引导（"请先启动 OpenWork 服务"） | 手动测试 |
| **可维护性** | 删除 500+ 行自建代码，Provider 管理由 OpenWork 统一维护 | 代码审查 |

---

## 7. 风险与缓释

| 风险 | 影响 | 缓释措施 |
|------|------|---------|
| OpenCode 服务未启动，无法管理 Provider | 用户无法配置 API Key | LLMTab 检测 client 可用性，不可用时显示引导信息 |
| 旧 YAML 中存在 custom Provider 的 Key | custom Provider 无法迁移到 OpenCode | 迁移时跳过 custom，保留 YAML 中的 custom 配置作为 fallback |
| `modelOptions` 硬编码删除后，OpenCode 返回的 Provider 名称不友好 | UI 显示不佳 | 保留 `modelOptions` 作为名称映射 fallback，动态列表优先 |

---

## 8. 测试策略

| 场景 | 类型 | 验证内容 |
|------|------|---------|
| Provider 列表动态加载 | 手动 | 打开 LLMTab 后显示 OpenCode 中所有 Provider |
| API Key 提交并连接 | 手动 | 输入 Key → 保存 → Provider 状态变为"已连接" |
| 重启后 Key 仍有效 | 手动 | 重启应用 → 之前连接的 Provider 仍显示"已连接" |
| 旧 YAML 迁移 | 手动 | 有旧配置的环境首次启动 → Key 自动迁移到 OpenCode |
| OpenCode 不可用降级 | 手动 | 关闭 OpenCode → LLMTab 显示引导信息 |
| callAgent 无直连降级 | 手动 | 未连接任何 Provider → callAgent 返回明确错误 |
| 硬编码 Key 消除 | 自动 | `grep -r "sk-b31d" src/` 零命中 |

---

## 9. 实施路径

### Phase 1：核心切换（P0）
1. 新建 `provider-bridge.ts` 桥接层
2. 重写 LLMTab 使用 Provider Store
3. 简化 app-store.tsx（删除 YAML LLM 读写）
4. 精简 opencode-client.ts（删除直连降级）
5. 删除硬编码 API Key

### Phase 2：迁移与优化（P1）
6. 实现旧 YAML 配置自动迁移
7. 接入 OAuth 认证流程
8. OpenCode 不可用时的 UI 引导

---

## 附录 A：删除代码统计（预估）

| 文件 | 删除行数 | 新增行数 | 净变化 |
|------|---------|---------|--------|
| `opencode-client.ts` | ~500 | 0 | -500 |
| `pages/settings/index.tsx` LLMTab | ~430 | ~250 | -180 |
| `stores/app-store.tsx` | ~30 | ~20 | -10 |
| `mock/settings.ts` | ~10 | 0 | -10 |
| **新建** `provider-bridge.ts` | 0 | ~120 | +120 |
| **合计** | **~970** | **~390** | **-580** |
