# SDD-007 LLM Provider OpenWork 原生化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面委托 OpenWork Provider Store 管理 API Key，删除星静自建的直连降级和 YAML 双写体系

**Architecture:** 通过 `getXingjingClient().provider.list()` 动态获取 Provider 列表和连接状态，通过 `client.auth.set()` 提交 API Key（持久化到 `~/.config/opencode/auth/`），删除 `callAgentDirect` / `setProviderAuth` / 硬编码 Key / YAML LLM 配置

**Tech Stack:** SolidJS, OpenCode SDK (`@opencode-ai/sdk/v2/client`), TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `services/opencode-client.ts` | **精简** | 删除 `callAgentDirect`(L1221-1357)、`DirectLLMConfig`(L1207-1212)、`setProviderAuth`(L384-397) |
| `stores/app-store.tsx` | **简化** | 删除硬编码 Key；删除 `ensureApiKey`；简化 `onMount` 的 LLM 加载；简化 `setLlmConfig` |
| `pages/settings/index.tsx` LLMTab | **重写** | 动态 Provider 列表 + 连接状态 + `client.auth.set()` 提交；删除 providerKeys 缓存、YAML 读写、直连测试 |
| `mock/settings.ts` | **精简** | 删除 `defaultLLMConfig` 中的硬编码 Key |
| `services/provider-bridge.ts` | **新建** | Provider 列表获取、连接状态查询、API Key 提交、旧配置迁移 |
| `services/file-store.ts` | **保留** | `loadGlobalSettings`/`saveGlobalSettings` 保留（allowedTools 和迁移用） |

---

### Task 1: 新建 provider-bridge.ts 桥接层

**Files:**
- Create: `apps/app/src/app/xingjing/services/provider-bridge.ts`

- [ ] **Step 1: 创建 provider-bridge.ts**

```typescript
// services/provider-bridge.ts
// 星静与 OpenWork Provider Store 的桥接层
import { getXingjingClient } from './opencode-client';
import { loadGlobalSettings, saveGlobalSettings } from './file-store';

export interface ProviderInfo {
  id: string;
  name: string;
  models: Array<{ id: string; name?: string }>;
  connected: boolean;
}

export interface ProviderBridgeState {
  providers: ProviderInfo[];
  connectedIds: string[];
  defaults: Record<string, string>;
  ready: boolean;
  error?: string;
}

/** 从 OpenCode 获取 Provider 列表和连接状态 */
export async function fetchProviderState(): Promise<ProviderBridgeState> {
  try {
    const client = getXingjingClient();
    const result = await client.provider.list();
    const data = result.data as any;
    if (!data) return { providers: [], connectedIds: [], defaults: {}, ready: false, error: 'No data' };
    const connectedSet = new Set<string>(data.connected ?? []);
    const providers: ProviderInfo[] = (data.all ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? p.id,
      models: (p.models ?? []).map((m: any) => ({ id: m.id, name: m.name ?? m.id })),
      connected: connectedSet.has(p.id),
    }));
    return {
      providers,
      connectedIds: data.connected ?? [],
      defaults: data.default ?? {},
      ready: true,
    };
  } catch (e) {
    return { providers: [], connectedIds: [], defaults: {}, ready: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 提交 API Key 连接 Provider */
export async function connectProvider(providerID: string, apiKey: string): Promise<boolean> {
  try {
    const client = getXingjingClient();
    await (client.auth as any).set({
      providerID,
      auth: { type: 'api', key: apiKey },
    });
    return true;
  } catch (e) {
    console.warn('[provider-bridge] connectProvider failed:', e);
    return false;
  }
}

/** 从旧 YAML 配置迁移 API Key 到 OpenCode 原生存储 */
export async function migrateFromYaml(): Promise<{ migrated: string[]; failed: string[]; skipped: boolean }> {
  try {
    const g = await loadGlobalSettings();
    if ((g as any)._llmMigratedToOpenCode === true) {
      return { migrated: [], failed: [], skipped: true };
    }
    const migrated: string[] = [];
    const failed: string[] = [];
    // 迁移当前 llm 配置中的 key
    if (g.llm?.providerID && g.llm?.apiKey && g.llm.apiKey.length > 4) {
      if (await connectProvider(g.llm.providerID, g.llm.apiKey)) {
        migrated.push(g.llm.providerID);
      } else {
        failed.push(g.llm.providerID);
      }
    }
    // 迁移 per-provider keys
    for (const [pid, key] of Object.entries(g.llmProviderKeys ?? {})) {
      if (migrated.includes(pid) || !key || key.length <= 4) continue;
      if (await connectProvider(pid, key)) {
        migrated.push(pid);
      } else {
        failed.push(pid);
      }
    }
    // 标记迁移完成
    if (migrated.length > 0) {
      await saveGlobalSettings({
        ...g,
        _llmMigratedToOpenCode: true,
        llm: g.llm ? { ...g.llm, apiKey: '' } : undefined,
        llmProviderKeys: undefined,
      } as any);
    }
    return { migrated, failed, skipped: false };
  } catch {
    return { migrated: [], failed: [], skipped: false };
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -20`

---

### Task 2: 精简 opencode-client.ts — 删除直连降级

**Files:**
- Modify: `apps/app/src/app/xingjing/services/opencode-client.ts`

- [ ] **Step 1: 删除 `setProviderAuth` 函数** (L384-397)

由 provider-bridge.ts 的 `connectProvider` 替代。

- [ ] **Step 2: 删除 `DirectLLMConfig` 接口** (L1207-1212)

- [ ] **Step 3: 删除 `callAgentDirect` 函数** (L1221-1357)

整个 ~136 行直连降级逻辑删除。

- [ ] **Step 4: 删除 callAgentDirect 的导出引用**

搜索所有 `callAgentDirect` 和 `DirectLLMConfig` 的导入引用，确认无外部调用后安全删除。

- [ ] **Step 5: 验证编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -30`

---

### Task 3: 简化 app-store.tsx

**Files:**
- Modify: `apps/app/src/app/xingjing/stores/app-store.tsx`

- [ ] **Step 1: 删除 DEFAULT_LLM_CONFIG 中的硬编码 API Key**

```typescript
// 改造前
const DEFAULT_LLM_CONFIG: LLMConfig = {
  modelName: 'DeepSeek-V3',
  modelID: 'deepseek-chat',
  providerID: 'deepseek',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-b31d2dbf7c3e4aa193e76ed9d60b217e',
};

// 改造后
const DEFAULT_LLM_CONFIG: LLMConfig = {
  modelName: 'DeepSeek-V3',
  modelID: 'deepseek-chat',
  providerID: 'deepseek',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
};
```

- [ ] **Step 2: 删除 `setProviderAuth` 导入**

从 `import { callAgent as _callAgent, setProviderAuth, ... }` 中移除 `setProviderAuth`。

- [ ] **Step 3: 删除产品切换 createEffect 中的 setProviderAuth 调用**

```typescript
// 改造前 (L305-316)
createEffect(() => {
  const product = productStore.activeProduct();
  if (product?.workDir) {
    setState('currentProject', product.name);
    loadFromFiles(product.workDir).catch(() => {});
    const cfg = state.llmConfig;
    if (cfg.providerID && cfg.providerID !== 'custom' && cfg.apiKey && cfg.apiKey.length > 4) {
      setProviderAuth(cfg.providerID, cfg.apiKey).catch(() => {});
    }
  }
});

// 改造后
createEffect(() => {
  const product = productStore.activeProduct();
  if (product?.workDir) {
    setState('currentProject', product.name);
    loadFromFiles(product.workDir).catch(() => {});
    // API Key 由 OpenCode 原生存储管理，无需每次切换产品时注入
  }
});
```

- [ ] **Step 4: 简化 onMount — 添加迁移调用**

```typescript
// 在 onMount 中添加迁移逻辑
import { migrateFromYaml } from '../services/provider-bridge';

onMount(() => {
  productStore.loadFromFile().catch(() => {});
  // 加载全局配置（allowedTools 等非 LLM 配置）
  loadGlobalSettings().then((g) => {
    if (g.llm) {
      setState('llmConfig', { ...DEFAULT_LLM_CONFIG, ...g.llm });
    }
    if (g.allowedTools?.length) {
      setState('allowedTools', g.allowedTools);
    } else {
      setState('allowedTools', DEFAULT_ALLOWED_TOOLS);
      saveGlobalSettings({ ...g, allowedTools: DEFAULT_ALLOWED_TOOLS }).catch(() => {});
    }
  }).catch(() => {});
  // 自动迁移旧 YAML 中的 API Key 到 OpenCode 原生存储
  migrateFromYaml().then((r) => {
    if (r.migrated.length) console.log('[xingjing] Migrated API Keys:', r.migrated);
    if (r.failed.length) console.warn('[xingjing] Migration failed:', r.failed);
  }).catch(() => {});
});
```

- [ ] **Step 5: 删除 callAgent 包装中的 ensureApiKey**

```typescript
// 删除 ensureApiKey 函数及调用（L473-479 和 L516 的 ensureApiKey().then(...)）
// 改为直接调用
return _callAgent(wrappedOpts).catch((err) => { ... });
```

- [ ] **Step 6: 简化 setLlmConfig — 不再写 LLM key 到 YAML**

```typescript
// 改造后：仅更新内存状态和模型选择（不含 apiKey）
setLlmConfig: (config: LLMConfig) => {
  setState('llmConfig', config);
  // 仅持久化模型选择（不含 apiKey，key 由 OpenCode 管理）
  saveGlobalSettings({ llm: { ...config, apiKey: '' } }).catch(() => {});
},
```

- [ ] **Step 7: 验证编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -30`

---

### Task 4: 重写 LLMTab 组件

**Files:**
- Modify: `apps/app/src/app/xingjing/pages/settings/index.tsx` (LLMTab section)

- [ ] **Step 1: 替换 LLMTab 导入和状态**

删除 `providerKeys` / `owSyncStatus` 状态，新增 `providerState` / `apiKeyInput`。
新增 `fetchProviderState` / `connectProvider` 导入。
保留 `modelOptions` 作为 Provider 名称映射 fallback。

- [ ] **Step 2: 重写 onMount — 从 OpenCode 获取 Provider 列表**

```typescript
onMount(async () => {
  const state = await fetchProviderState();
  setProviderState(state);
});
```

- [ ] **Step 3: 重写 handleSave — 仅通过 connectProvider 提交**

```typescript
const handleSave = async () => {
  setSaving(true);
  setTestResult('');
  try {
    const key = apiKeyInput().trim();
    const pid = selectedProvider();
    if (!pid || !key) { setTestResult('⚠️ 请选择 Provider 并输入 API Key'); return; }
    const ok = await connectProvider(pid, key);
    if (ok) {
      setTestResult(`✅ ${pid} 已连接成功，API Key 已保存`);
      // 刷新 Provider 列表
      const updated = await fetchProviderState();
      setProviderState(updated);
      setApiKeyInput('');
      // 更新内存中的默认模型选择
      actions.setLlmConfig({ ...state.llmConfig, providerID: pid, apiKey: '' });
    } else {
      setTestResult('❌ 连接失败，请检查 API Key');
    }
  } finally { setSaving(false); }
};
```

- [ ] **Step 4: 简化 handleTest — 仅通过 callAgent 测试**

删除直连 fetch 测试逻辑，统一通过 `actions.callAgent()` 验证。

- [ ] **Step 5: 重写 handleChatSend — 删除直连分支**

删除 L266-338 的直连 fetch 逻辑，统一通过 `actions.callAgent()` 发送。

- [ ] **Step 6: 重写 JSX — Provider 卡片列表 + 连接操作**

新 UI 结构：
- 已连接 Provider 列表（带模型信息和"断开"按钮）
- 未连接 Provider 列表（带"连接"按钮）
- 选中 Provider 后显示 API Key 输入框和保存按钮
- 测试连接和会话测试按钮（保留）

- [ ] **Step 7: 验证编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -30`

---

### Task 5: 清理 mock/settings.ts

**Files:**
- Modify: `apps/app/src/app/xingjing/mock/settings.ts`

- [ ] **Step 1: 删除 defaultLLMConfig 的硬编码 Key**

```typescript
// 改造后
export const defaultLLMConfig: LLMConfig = {
  id: 'llm-1',
  modelName: 'DeepSeek-V3',
  modelID: 'deepseek-chat',
  providerID: 'deepseek',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
};
```

- [ ] **Step 2: 验证编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -30`

---

### Task 6: 全量编译验证与硬编码扫描

- [ ] **Step 1: 全量 TypeScript 编译**

Run: `cd harnesswork && npx tsc --noEmit --project apps/app/tsconfig.json`
Expected: 0 errors

- [ ] **Step 2: 硬编码 API Key 扫描**

Run: `grep -r "sk-b31d" apps/app/src/`
Expected: 0 matches

- [ ] **Step 3: callAgentDirect 引用扫描**

Run: `grep -r "callAgentDirect\|DirectLLMConfig" apps/app/src/`
Expected: 0 matches

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(xingjing): SDD-007 LLM Provider OpenWork 原生化 — 删除直连降级和自建Key管理，委托OpenCode Provider Store"
```
