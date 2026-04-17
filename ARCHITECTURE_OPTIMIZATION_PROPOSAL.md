# 星静 OpenCode Client 架构优化方案

## 问题核心

**当前设计**：`getXingjingClient()` 维护了双路径逻辑：
1. **主路径**：使用 OpenWork 注入的 `_sharedClient`
2. **兜底路径**：独立创建 `_fallbackClient`

**你的质疑**：这个兜底路径是否合理？是否应该完全依赖 OpenWork？

## 架构分析

### 1. 当前设计的初衷（来自 ADR-001）

根据 `ADR-001-xingjing-openwork-native-refactor.md` 的记录：

```typescript
// 8.2 — R1 / R4 集成方式偏差：注入模式替代 Context 直连

**偏离原因：**
1. **解耦需要**：xingjing 模块需维持与 OpenWork 平台的松耦合
2. **向后兼容**：注入模式允许 xingjing 在非 OpenWork 环境（如独立测试、未来独立部署）中正常运行
3. **初始化时序**：xingjing service 层的初始化早于 SolidJS Context Provider 挂载
```

**关键点**：设计者预留了"未来独立部署"的可能性。

### 2. 实际使用场景分析

#### 场景 A：OpenWork 集成模式（主要场景）
- **环境**：用户通过 OpenWork 桌面应用使用星静
- **Client 来源**：OpenWork 已启动 OpenCode 服务，通过 `openworkCtx.opencodeClient()` 注入
- **状态**：`_sharedClient` 有值，直接使用
- **问题**：✅ 无问题

#### 场景 B：独立运行模式（当前问题场景）
- **环境**：用户直接访问星静 Web 界面（无 OpenWork 桌面应用）
- **Client 来源**：`openworkCtx` 为 `undefined`，走 fallback 路径
- **状态**：`_fallbackClient` 被创建，但**缺少认证信息**
- **问题**：❌ **这就是当前 Bug 的根源**

#### 场景 C：测试环境
- **环境**：单元测试、集成测试
- **Client 来源**：Mock client 或本地 OpenCode
- **状态**：需要 fallback 路径
- **问题**：✅ 合理需求

### 3. 架构决策：保留还是移除 Fallback？

#### 方案 A：完全移除 Fallback（激进方案）

```typescript
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (!_sharedClient) {
    throw new Error('OpenCode Client 未初始化，请确保在 OpenWork 环境中运行');
  }
  return _sharedClient;
}
```

**优点**：
- 架构清晰，强制依赖 OpenWork
- 消除双路径维护成本
- 问题暴露更早（启动时就报错，而非使用时）

**缺点**：
- ❌ **破坏独立部署能力**（违背 ADR-001 的设计初衷）
- ❌ **测试困难**（必须启动完整 OpenWork 环境）
- ❌ **开发体验差**（本地开发必须依赖桌面应用）

#### 方案 B：修复 Fallback 逻辑（渐进方案，推荐）

```typescript
let _providerApiKeys: Record<string, string> = {};

export function setProviderAuth(providerID: string, apiKey: string): Promise<boolean> {
  // 缓存 API Key
  _providerApiKeys[providerID] = apiKey;
  
  const client = getXingjingClient();
  try {
    await (client.auth as any).set({
      providerID,
      auth: { type: 'api', key: apiKey },
    });
    return true;
  } catch (e) {
    console.warn('[xingjing] setProviderAuth failed:', e);
    return false;
  }
}

export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  
  // Fallback: 独立模式
  if (!_fallbackClient) {
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] 独立模式：创建本地 OpenCode Client');
    _fallbackClient = createClient(fallbackUrl);
    
    // 立即注入已缓存的 API Keys
    for (const [providerID, apiKey] of Object.entries(_providerApiKeys)) {
      (async () => {
        try {
          await (_fallbackClient!.auth as any).set({
            providerID,
            auth: { type: 'api', key: apiKey },
          });
          console.log(`[xingjing] 已注入 ${providerID} API Key`);
        } catch (e) {
          console.warn(`[xingjing] 注入 ${providerID} API Key 失败:`, e);
        }
      })();
    }
  }
  return _fallbackClient;
}
```

**优点**：
- ✅ **保留独立部署能力**
- ✅ **修复当前 Bug**
- ✅ **向后兼容**
- ✅ **测试友好**

**缺点**：
- 需要维护双路径逻辑
- API Key 缓存增加了状态管理复杂度

#### 方案 C：环境检测 + 明确错误提示（折中方案）

```typescript
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  
  // 检测是否在独立模式下
  const isStandaloneMode = !window.__OPENWORK_CONTEXT__;
  
  if (!_fallbackClient) {
    if (!isStandaloneMode) {
      // OpenWork 环境但 client 未注入 → 配置错误
      throw new Error('OpenWork Client 未正确初始化，请检查 app-store 配置');
    }
    
    // 独立模式：创建本地 client
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] 独立模式：使用本地 OpenCode 服务');
    _fallbackClient = createClient(fallbackUrl);
    
    // 检查是否有缓存的 API Keys
    if (Object.keys(_providerApiKeys).length === 0) {
      console.warn('[xingjing] 独立模式：尚未配置 API Key，请先在设置中配置大模型');
    } else {
      // 注入 API Keys
      for (const [providerID, apiKey] of Object.entries(_providerApiKeys)) {
        // ... 注入逻辑
      }
    }
  }
  return _fallbackClient;
}
```

**优点**：
- ✅ **明确区分两种模式**
- ✅ **错误提示更友好**
- ✅ **保留独立部署能力**

**缺点**：
- 依赖全局变量检测环境
- 仍需维护双路径

### 4. 深层架构问题：星静的定位

#### 问题本质：星静到底是什么？

**定位 A：OpenWork 的内嵌模块**
- 完全依赖 OpenWork 基础设施
- 不支持独立部署
- 简化架构，移除 fallback

**定位 B：可独立部署的产品**
- 可以脱离 OpenWork 运行
- 需要完整的 fallback 机制
- 架构复杂度更高

**当前状态：模糊的中间态**
- 代码中保留了独立部署的接口（fallback）
- 但实现不完整（缺少认证注入）
- 导致"看起来支持独立部署，实际不可用"

### 5. 推荐方案

#### 短期（修复 Bug）：方案 B
实施 API Key 缓存和注入逻辑，修复当前独立模式下的 session 创建失败问题。

#### 中期（架构明确）：产品定位决策
需要产品层面明确：
1. **如果星静定位为 OpenWork 专属模块** → 移除 fallback，简化架构
2. **如果星静定位为可独立部署产品** → 完善 fallback 机制，包括：
   - 独立的配置管理
   - 独立的 OpenCode 服务启动
   - 独立的认证体系

#### 长期（架构重构）：统一 Client 管理
无论选择哪个定位，都应该：
1. **统一初始化入口**：在 app-store 或更上层统一管理 client 生命周期
2. **明确依赖关系**：通过依赖注入而非全局变量
3. **环境适配层**：抽象出 `OpenCodeClientProvider` 接口，不同环境提供不同实现

```typescript
// 理想架构
interface OpenCodeClientProvider {
  getClient(): ReturnType<typeof createClient>;
  isReady(): boolean;
  onReady(callback: () => void): void;
}

class OpenWorkClientProvider implements OpenCodeClientProvider {
  constructor(private openworkCtx: XingjingOpenworkContext) {}
  getClient() { return this.openworkCtx.opencodeClient(); }
  // ...
}

class StandaloneClientProvider implements OpenCodeClientProvider {
  private client: ReturnType<typeof createClient> | null = null;
  
  constructor(private config: { baseUrl: string; apiKeys: Record<string, string> }) {}
  
  getClient() {
    if (!this.client) {
      this.client = createClient(this.config.baseUrl);
      // 注入 API Keys
      for (const [providerID, apiKey] of Object.entries(this.config.apiKeys)) {
        this.client.auth.set({ providerID, auth: { type: 'api', key: apiKey } });
      }
    }
    return this.client;
  }
  // ...
}

// 使用
const provider = isOpenWorkMode 
  ? new OpenWorkClientProvider(openworkCtx)
  : new StandaloneClientProvider({ baseUrl, apiKeys });

export function getXingjingClient() {
  return provider.getClient();
}
```

## 结论

### 回答你的问题：`getXingjingClient` 的存在是否合理？

**答案：设计初衷合理，但实现不完整。**

1. **设计初衷合理**：
   - ADR-001 明确提出"向后兼容"和"未来独立部署"需求
   - 注入模式确实比直接依赖 Context 更灵活
   - 测试场景确实需要 fallback 机制

2. **实现不完整**：
   - Fallback 路径缺少认证信息注入
   - 没有明确的环境检测和错误提示
   - 双路径逻辑维护成本被低估

3. **是否应该直接用 OpenWork 的？**
   - **如果星静定位为 OpenWork 专属** → 是的，应该移除 fallback
   - **如果星静定位为可独立部署** → 不，应该完善 fallback
   - **当前状态** → 需要产品决策明确定位

### 立即行动建议

1. **修复当前 Bug**：实施方案 B（API Key 缓存和注入）
2. **产品决策**：明确星静的产品定位（专属 vs 独立）
3. **架构重构**：根据产品定位，选择简化或完善架构

### 代码改动优先级

**P0（立即修复）**：
- 实施 API Key 缓存和注入逻辑
- 添加详细的错误日志

**P1（本周完成）**：
- 添加环境检测和友好错误提示
- 更新文档说明独立模式的使用方法

**P2（下个迭代）**：
- 产品定位决策
- 根据决策简化或完善架构
