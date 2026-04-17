# 星静 OpenCode Client 架构优化方案（基于 OpenWork 原生能力）

## 核心原则

**完全复用 OpenWork 的 Client 管理机制，移除星静的独立 Client 创建逻辑**

## 当前架构分析

### OpenWork 的 Client 管理（app.tsx）

```typescript
// app.tsx:767-823
workspaceStore = createWorkspaceStore({
  client,              // ← OpenWork 统一管理的 OpenCode client signal
  setClient,
  baseUrl,
  setBaseUrl,
  clientDirectory,
  setClientDirectory,
  // ... 其他配置
});

// app.tsx:2354
<XingjingNativePage
  opencodeClient={client()}  // ← 直接传递 OpenWork 的 client
  selectedModel={() => {
    const m = modelConfig.selectedSessionModel();
    return m ? { providerID: m.providerID, modelID: m.modelID } : null;
  }}
  sessionStatusById={activeSessionStatusById}
/>
```

**关键发现**：
1. OpenWork 已经有完整的 `workspaceStore` 管理 client 生命周期
2. `client()` signal 由 OpenWork 统一维护，包括：
   - 连接状态管理
   - 重连逻辑
   - Provider 认证
   - Session 状态同步
3. 星静通过 `XingjingNativePage` props 接收 OpenWork 的 client

### 星静的 Client 管理（opencode-client.ts）

```typescript
// opencode-client.ts:15-99
let _sharedClient: ReturnType<typeof createClient> | null = null;
let _fallbackClient: ReturnType<typeof createClient> | null = null;

export function setSharedClient(client: ReturnType<typeof createClient> | null) {
  _sharedClient = client;
  _fallbackClient = null;  // 清除兜底缓存
}

export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  
  // 兜底：独立版场景下 OpenWork 未连接，直接使用本地 OpenCode
  if (!_fallbackClient) {
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] OpenWork Client 未注入，使用本地兜底地址:', fallbackUrl);
    _fallbackClient = createClient(fallbackUrl);  // ❌ 问题：缺少认证信息
  }
  return _fallbackClient;
}
```

**问题**：
1. 维护了双路径逻辑（shared + fallback）
2. Fallback 路径缺少认证信息注入
3. 与 OpenWork 的 client 管理机制重复

## 优化方案：完全依赖 OpenWork Client

### 方案设计

**核心思路**：星静不再维护独立的 client 创建逻辑，完全依赖 OpenWork 注入的 client。

### 实施步骤

#### Step 1：简化 opencode-client.ts

```typescript
// apps/app/src/app/xingjing/services/opencode-client.ts

import { createClient } from '../../lib/opencode';

// ─── Client 管理（OpenWork 注入）────────────────────────────────────────────

let _sharedClient: ReturnType<typeof createClient> | null = null;
let _baseUrl = 'http://127.0.0.1:4096';
let _directory = '';

/**
 * 由 app-store 在初始化后注入 shared client。
 * 星静完全依赖 OpenWork 的 client 管理，不再维护独立的 fallback 逻辑。
 */
export function setSharedClient(client: ReturnType<typeof createClient> | null) {
  _sharedClient = client;
}

/**
 * 获取 OpenCode Client（来自 OpenWork 注入的统一实例）。
 * 
 * ⚠️ 重要：此函数要求在 OpenWork 环境中运行。
 * 如果 client 未注入，说明：
 * 1. OpenWork 尚未完成初始化（等待 workspaceStore 就绪）
 * 2. OpenCode 服务未启动（检查 OpenWork 连接状态）
 * 3. 配置错误（检查 app-store 的 setSharedClient 调用）
 */
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (!_sharedClient) {
    throw new Error(
      '[xingjing] OpenCode Client 未初始化。' +
      '请确保：1) 在 OpenWork 环境中运行；2) OpenCode 服务已启动；3) workspaceStore 已就绪。'
    );
  }
  return _sharedClient;
}

/**
 * 检查 client 是否已就绪（用于 UI 条件渲染）
 */
export function isClientReady(): boolean {
  return _sharedClient !== null;
}

// ─── 其余代码保持不变 ───────────────────────────────────────────────────────
// fileList, fileRead, fileWrite, sessionCreate, callAgent 等函数
// 都通过 getXingjingClient() 获取 client，无需修改
```

**关键变化**：
1. ✅ 移除 `_fallbackClient` 和相关逻辑
2. ✅ `getXingjingClient()` 在 client 未就绪时抛出明确错误
3. ✅ 新增 `isClientReady()` 用于 UI 条件渲染
4. ✅ 减少代码量：~100 行 → ~30 行

#### Step 2：优化 app-store 的 client 注入时机

```typescript
// apps/app/src/app/xingjing/stores/app-store.tsx

// ── 注入 OpenWork Client 到 opencode-client 模块 ──
createEffect(() => {
  const client = props.openworkCtx?.opencodeClient?.();
  setSharedClient(client ?? null);
  
  // 诊断日志
  if (client) {
    console.log('[xingjing] OpenWork Client 已注入');
  } else {
    console.warn('[xingjing] OpenWork Client 未就绪，星静功能将受限');
  }
});
```

**无需修改**：当前逻辑已经正确，只需添加诊断日志。

#### Step 3：在 UI 层添加 Client 就绪检查

```typescript
// apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx

import { isClientReady } from '../../../services/opencode-client';

const SoloAutopilot = () => {
  const { state, productStore, actions, resolvedWorkspaceId, openworkCtx } = useAppStore();
  
  // ── Client 就绪检查 ──
  const [clientReady, setClientReady] = createSignal(false);
  
  createEffect(() => {
    setClientReady(isClientReady());
  });
  
  // ── UI 渲染 ──
  return (
    <Show
      when={clientReady()}
      fallback={
        <div style={{
          display: 'flex', 'flex-direction': 'column', 'align-items': 'center',
          'justify-content': 'center', height: '100%', gap: '12px',
        }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: chartColors.primary }} />
          <div style={{ 'font-size': '14px', color: themeColors.text }}>
            正在连接 OpenCode 服务...
          </div>
          <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>
            请确保 OpenWork 已启动并选择了工作区
          </div>
        </div>
      }
    >
      {/* 原有的 Autopilot UI */}
    </Show>
  );
};
```

**关键变化**：
1. ✅ 使用 `isClientReady()` 检查 client 状态
2. ✅ 未就绪时显示友好的加载提示
3. ✅ 避免在 client 未就绪时调用 AI 功能

#### Step 4：移除 API Key 缓存逻辑（不再需要）

```typescript
// 删除以下代码（不再需要）：
// - _providerApiKeys 缓存
// - setProviderAuth 中的 API Key 缓存逻辑
// - getXingjingClient 中的 API Key 注入逻辑

// 原因：OpenWork 的 workspaceStore 已经管理了 Provider 认证
// 通过 app.tsx:839-852 的 createProvidersStore 统一处理
```

### 架构对比

#### 优化前（当前架构）

```
┌─────────────────────────────────────────────────────────────┐
│ OpenWork (app.tsx)                                          │
│  ├─ workspaceStore                                          │
│  │   ├─ client() signal                                     │
│  │   ├─ Provider 认证管理                                   │
│  │   └─ Session 状态同步                                    │
│  └─ XingjingNativePage                                      │
│      └─ props.opencodeClient ──┐                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 星静 (opencode-client.ts)                                   │
│  ├─ _sharedClient ◄─────────── 注入                         │
│  ├─ _fallbackClient ◄────────── 独立创建（❌ 缺少认证）     │
│  ├─ _providerApiKeys ◄────────── 手动缓存（❌ 重复逻辑）    │
│  └─ getXingjingClient()                                     │
│      ├─ if (_sharedClient) return _sharedClient            │
│      └─ else return _fallbackClient  ◄── ❌ 问题根源        │
└─────────────────────────────────────────────────────────────┘
```

**问题**：
- 双路径维护成本高
- Fallback 逻辑不完整
- 与 OpenWork 的 client 管理重复

#### 优化后（推荐架构）

```
┌─────────────────────────────────────────────────────────────┐
│ OpenWork (app.tsx)                                          │
│  ├─ workspaceStore                                          │
│  │   ├─ client() signal ◄────── 唯一的 Client 管理         │
│  │   ├─ Provider 认证管理                                   │
│  │   └─ Session 状态同步                                    │
│  └─ XingjingNativePage                                      │
│      └─ props.opencodeClient ──┐                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 星静 (opencode-client.ts)                                   │
│  ├─ _sharedClient ◄─────────── 注入（唯一来源）            │
│  └─ getXingjingClient()                                     │
│      ├─ if (_sharedClient) return _sharedClient            │
│      └─ else throw Error('Client 未初始化')  ◄── ✅ 明确错误│
└─────────────────────────────────────────────────────────────┘
```

**优势**：
- ✅ 单一职责：OpenWork 负责 client 管理
- ✅ 架构清晰：星静只消费，不创建
- ✅ 错误明确：未就绪时立即报错，而非静默失败
- ✅ 代码简化：减少 ~100 行重复逻辑

## 测试场景覆盖

### 场景 1：正常启动（OpenWork 已连接）

**流程**：
1. 用户启动 OpenWork 桌面应用
2. OpenWork 初始化 `workspaceStore`，创建 `client()`
3. 用户进入星静页面（`/xingjing-solid`）
4. `XingjingNativePage` 接收 `props.opencodeClient`
5. `app-store` 通过 `setSharedClient()` 注入
6. 星静 UI 检测到 `isClientReady() === true`，正常渲染
7. 用户使用 AI 对话功能，调用 `getXingjingClient()` 成功

**预期结果**：✅ 一切正常

### 场景 2：OpenWork 未连接（独立访问星静）

**流程**：
1. 用户直接访问 `http://localhost:3000/xingjing-solid`（无 OpenWork）
2. `props.opencodeClient` 为 `null`
3. `setSharedClient(null)` 被调用
4. 星静 UI 检测到 `isClientReady() === false`
5. 显示加载提示："正在连接 OpenCode 服务..."

**预期结果**：✅ 友好提示，不会崩溃

### 场景 3：OpenWork 启动中（Client 尚未就绪）

**流程**：
1. 用户启动 OpenWork，立即进入星静页面
2. `workspaceStore` 正在初始化，`client()` 暂时为 `null`
3. 星静 UI 显示加载提示
4. 2-3 秒后，`client()` 就绪
5. `createEffect` 触发，`setSharedClient(client)` 被调用
6. 星静 UI 自动切换到正常状态

**预期结果**：✅ 平滑过渡，无需刷新页面

### 场景 4：OpenCode 服务崩溃（运行时断连）

**流程**：
1. 用户正在使用星静 AI 对话
2. OpenCode 服务意外崩溃
3. OpenWork 的 `workspaceStore` 检测到断连，`client()` 变为 `null`
4. `createEffect` 触发，`setSharedClient(null)` 被调用
5. 星静 UI 检测到 `isClientReady() === false`
6. 显示错误提示："OpenCode 服务已断开，请检查连接"

**预期结果**：✅ 及时反馈，避免静默失败

## 迁移路径

### Phase 1：代码修改（1 天）

1. ✅ 修改 `opencode-client.ts`：移除 fallback 逻辑
2. ✅ 修改 `solo/autopilot/index.tsx`：添加 client 就绪检查
3. ✅ 修改其他使用 `callAgent` 的页面：添加就绪检查
4. ✅ 更新单元测试：Mock `setSharedClient` 调用

### Phase 2：测试验证（1 天）

1. ✅ 测试场景 1-4
2. ✅ 回归测试：确保现有功能无 regression
3. ✅ 性能测试：确认无性能下降

### Phase 3：文档更新（0.5 天）

1. ✅ 更新 `ADR-001`：记录架构简化决策
2. ✅ 更新 `README`：说明星静依赖 OpenWork 运行
3. ✅ 更新开发文档：移除独立部署相关说明

## 风险评估

### 风险 1：破坏独立部署能力

**影响**：如果未来需要星静独立部署，需要重新实现 client 管理

**缓解措施**：
- 当前产品定位不明确，但代码显示星静深度集成 OpenWork
- 如果未来确实需要独立部署，可以：
  1. 创建独立的 `StandaloneClientProvider`
  2. 在入口处根据环境选择 Provider
  3. 不影响当前架构，只需添加新的 Provider 实现

**评估**：⚠️ 中等风险，但可控

### 风险 2：测试环境依赖

**影响**：单元测试需要 Mock `setSharedClient`

**缓解措施**：
- 提供测试工具函数：`setupTestClient()`
- 在测试 setup 中自动调用

**评估**：✅ 低风险，易解决

### 风险 3：用户体验下降

**影响**：Client 未就绪时，用户看到加载提示而非功能界面

**缓解措施**：
- OpenWork 的 `workspaceStore` 初始化很快（< 2 秒）
- 加载提示设计友好，提供明确的状态反馈
- 大多数用户场景下，进入星静时 client 已就绪

**评估**：✅ 低风险，体验可接受

## 收益总结

### 代码层面

- **减少代码量**：~100 行（fallback 逻辑 + API Key 缓存）
- **降低复杂度**：单一 client 来源，无双路径维护
- **提高可维护性**：client 管理逻辑集中在 OpenWork

### 架构层面

- **职责清晰**：OpenWork 负责基础设施，星静负责业务逻辑
- **依赖明确**：星静显式依赖 OpenWork，不再模糊
- **错误处理**：未就绪时立即报错，而非静默失败

### 用户体验层面

- **状态透明**：用户清楚知道 client 是否就绪
- **错误友好**：提供明确的错误提示和解决建议
- **性能一致**：复用 OpenWork 的连接池和缓存

## 推荐决策

### 立即执行（P0）

**实施优化方案**：移除 fallback 逻辑，完全依赖 OpenWork client

**理由**：
1. ✅ 当前 fallback 逻辑不完整，反而是 Bug 根源
2. ✅ 星静已深度集成 OpenWork，独立部署需求不明确
3. ✅ 架构简化带来的收益远大于风险
4. ✅ 如果未来需要独立部署，可以通过 Provider 模式扩展

### 后续评估（P1）

**产品定位决策**：明确星静是否需要支持独立部署

**如果需要独立部署**：
- 实施 `OpenCodeClientProvider` 接口
- 提供 `OpenWorkClientProvider` 和 `StandaloneClientProvider` 两种实现
- 在入口处根据环境选择 Provider

**如果不需要独立部署**：
- 保持当前优化后的架构
- 在文档中明确说明星静依赖 OpenWork 运行

## 总结

**核心观点**：星静应该完全复用 OpenWork 的 Client 管理能力，而不是维护独立的 fallback 逻辑。

**关键变化**：
1. 移除 `_fallbackClient` 和 API Key 缓存
2. `getXingjingClient()` 在 client 未就绪时抛出明确错误
3. UI 层添加 `isClientReady()` 检查，提供友好的加载提示

**预期效果**：
- ✅ 修复当前 Bug（session 创建失败）
- ✅ 简化架构（减少 ~100 行代码）
- ✅ 提高可维护性（单一 client 来源）
- ✅ 改善用户体验（明确的状态反馈）

**风险可控**：如果未来需要独立部署，可以通过 Provider 模式扩展，不影响当前架构。
