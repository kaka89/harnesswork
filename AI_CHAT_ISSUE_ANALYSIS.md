# 星静·独立版 AI 对话能力问题分析报告

## 问题现象
用户已配置 DeepSeek 大模型，但在独立版中使用 AI 对话功能时报错：
```
调用失败：无法创建 AI 会话，请检查 OpenCode 服务是否已启动
```

## 环境检查结果

### ✅ OpenCode 服务状态
- **服务运行正常**：端口 4096 上有 OpenCode 实例运行
- **API 可访问**：`/config/providers` 端点返回正常
- **Session 创建成功**：直接 curl 测试可以成功创建 session

### ✅ 大模型配置
- **Provider**: deepseek
- **Model**: deepseek-chat
- **API Key**: 已配置（sk-b31d2dbf7c3e4aa193e76ed9d60b217e）
- **API URL**: https://api.deepseek.com/v1

## 根本原因分析

### 问题定位
通过代码分析，问题出在 **OpenCode Client 初始化和注入流程**：

#### 1. **独立版场景下的 Client 获取逻辑**
```typescript
// opencode-client.ts:90-99
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  // 兜底：独立版场景下 OpenWork 未连接，直接使用本地 OpenCode
  if (!_fallbackClient) {
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] OpenWork Client 未注入，使用本地兜底地址:', fallbackUrl);
    _fallbackClient = createClient(fallbackUrl);
  }
  return _fallbackClient;
}
```

**关键问题**：
- `_sharedClient` 由 OpenWork 注入（app-store.tsx:217）
- 独立版场景下 `openworkCtx` 为 `undefined`，导致 `_sharedClient` 始终为 `null`
- 兜底逻辑会创建 `_fallbackClient`，但 **没有传递认证信息**

#### 2. **createClient 需要认证参数**
```typescript
// opencode.ts:219
export function createClient(baseUrl: string, directory?: string, auth?: OpencodeAuth)
```

**问题**：
- `_fallbackClient = createClient(fallbackUrl)` 只传了 `baseUrl`
- 没有传递 `auth` 参数（包含 API Key 等认证信息）
- OpenCode 在创建 session 时可能需要验证 provider 的 API Key

#### 3. **API Key 注入时机问题**
```typescript
// app-store.tsx:286-289
const cfg = state.llmConfig;
if (cfg.providerID && cfg.providerID !== 'custom' && cfg.apiKey && cfg.apiKey.length > 4) {
  setProviderAuth(cfg.providerID, cfg.apiKey).catch(() => {/* silent */});
}
```

**问题**：
- `setProviderAuth` 在产品切换时调用
- 但如果 OpenCode Client 创建失败，这个调用也会失败
- 错误被静默吞掉（`catch(() => {/* silent */})`）

#### 4. **Session 创建失败的真实原因**
```typescript
// opencode-client.ts:635-639
sid = (result.data as { id: string } | undefined)?.id ?? null;
if (!sid) {
  console.error('[xingjing] session.create returned no id. error:', result.error,
    '| data:', result.data);
}
```

可能的失败原因：
1. **Client 未正确初始化**（最可能）
2. **Provider 未配置 API Key**
3. **Directory 参数问题**
4. **网络连接问题**

## 解决方案

### 方案 1：修复 Fallback Client 创建逻辑（推荐）

**修改位置**：`apps/app/src/app/xingjing/services/opencode-client.ts`

```typescript
// 在文件顶部添加全局 API Key 存储
let _providerApiKeys: Record<string, string> = {};

// 修改 setProviderAuth 函数，同时缓存 API Key
export async function setProviderAuth(providerID: string, apiKey: string): Promise<boolean> {
  // 缓存 API Key 供 fallback client 使用
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

// 修改 getXingjingClient，在创建 fallback client 后立即注入 API Key
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  
  if (!_fallbackClient) {
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] OpenWork Client 未注入，使用本地兜底地址:', fallbackUrl);
    _fallbackClient = createClient(fallbackUrl);
    
    // 立即注入已缓存的 API Keys
    for (const [providerID, apiKey] of Object.entries(_providerApiKeys)) {
      (async () => {
        try {
          await (_fallbackClient!.auth as any).set({
            providerID,
            auth: { type: 'api', key: apiKey },
          });
          console.log(`[xingjing] Fallback client: 已注入 ${providerID} API Key`);
        } catch (e) {
          console.warn(`[xingjing] Fallback client: 注入 ${providerID} API Key 失败:`, e);
        }
      })();
    }
  }
  return _fallbackClient;
}
```

### 方案 2：在 Solo Autopilot 初始化时主动注入 API Key

**修改位置**：`apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx`

在 `onMount` 中添加：

```typescript
onMount(async () => {
  const workDir = productStore.activeProduct()?.workDir;
  if (workDir) {
    try {
      const settings = await loadProjectSettings(workDir);
      const keys: Record<string, string> = { ...(settings.llmProviderKeys ?? {}) };
      const cur = state.llmConfig;
      if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;
      setProviderKeys(keys);
      
      // 🔧 新增：主动注入 API Key 到 OpenCode
      if (cur.providerID && cur.providerID !== 'custom' && cur.apiKey) {
        const success = await setProviderAuth(cur.providerID, cur.apiKey);
        if (!success) {
          console.error('[solo-autopilot] 注入 API Key 失败');
        } else {
          console.log('[solo-autopilot] 已注入 API Key:', cur.providerID);
        }
      }
      
      // ... 其余代码
    } catch {}
  }
  // ...
});
```

### 方案 3：增强错误诊断（辅助）

在 `sessionCreate` 函数中添加详细日志：

```typescript
export async function sessionCreate(
  opts?: XingjingSessionOptions,
): Promise<string | null> {
  const client = getXingjingClient();
  console.log('[xingjing-diag] sessionCreate called, opts:', opts);
  console.log('[xingjing-diag] client type:', _sharedClient ? 'shared' : 'fallback');
  
  try {
    const result = await client.session.create({
      ...(opts?.parentId ? { parentID: opts.parentId } : {}),
      ...(opts?.title ? { title: opts.title } : {}),
      ...(opts?.directory ?? _directory ? { directory: opts?.directory ?? _directory } : {}),
    } as Parameters<typeof client.session.create>[0]);
    
    console.log('[xingjing-diag] session.create result:', result);
    
    if (result.data) return (result.data as { id: string }).id;
    
    // 详细错误日志
    console.error('[xingjing-diag] session.create failed:', {
      error: result.error,
      data: result.data,
      response: result.response?.status,
    });
    
    return null;
  } catch (e) {
    console.error('[xingjing-diag] session.create exception:', e);
    return null;
  }
}
```

## 验证步骤

### 1. 检查浏览器控制台日志
打开开发者工具，查找：
- `[xingjing] OpenWork Client 未注入` - 确认是否走 fallback 路径
- `[xingjing-diag] session.create` - 查看 session 创建的详细参数和结果
- `session.create returned no id` - 查看具体错误信息

### 2. 手动测试 API Key 注入
在浏览器控制台执行：
```javascript
// 获取 OpenCode client
const client = window.__xingjing_debug_client; // 需要先暴露到 window

// 测试 auth.set
await client.auth.set({
  providerID: 'deepseek',
  auth: { type: 'api', key: 'sk-b31d2dbf7c3e4aa193e76ed9d60b217e' }
});

// 测试 session 创建
const result = await client.session.create({ title: 'test' });
console.log('Session ID:', result.data?.id);
```

### 3. 验证 Provider 配置
```bash
curl http://127.0.0.1:4096/auth
```
检查返回的 JSON 中是否包含 `deepseek` provider 的配置。

## 临时解决方案（用户可立即尝试）

### 方法 1：通过 OpenWork 主应用配置
1. 打开 OpenWork 主应用
2. 进入设置 → 大模型配置
3. 配置 DeepSeek API Key
4. 返回星静独立版，应该可以正常使用

### 方法 2：重启应用
1. 完全退出星静应用
2. 重新启动
3. 等待 OpenCode 服务完全启动（约 5-10 秒）
4. 再次尝试 AI 对话

### 方法 3：检查工作目录
确保当前产品的 `workDir` 存在且可访问：
- 路径：产品设置中配置的工作目录
- 权限：应用需要有读写权限

## 后续优化建议

1. **统一 Client 管理**：独立版和 OpenWork 集成版应使用相同的 Client 初始化逻辑
2. **错误提示优化**：将 "OpenCode 服务未启动" 改为更准确的错误信息（如 "API Key 未配置"）
3. **健康检查**：在 UI 上显示 OpenCode 连接状态和 Provider 配置状态
4. **自动重试**：API Key 注入失败时自动重试 2-3 次
5. **配置持久化**：确保 API Key 配置在应用重启后仍然有效

## 总结

**核心问题**：独立版场景下，fallback OpenCode Client 创建时未传递认证信息，导致 session 创建失败。

**推荐修复**：实施方案 1（修复 Fallback Client 创建逻辑），同时添加方案 3（增强错误诊断）。

**预期效果**：修复后，独立版用户配置 API Key 后即可正常使用 AI 对话功能，无需依赖 OpenWork 主应用。
