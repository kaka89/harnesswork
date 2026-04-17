# Plan A: R1 Client单例消除 + R8 权限审批迁移

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** 消除 opencode-client.ts 双套客户端单例，权限审批改接 OpenCode SDK

**Worktree:** `worktrees/feature/TASK-ADR001-plan-a`

**Files:**
- Modify: `apps/app/src/app/xingjing/services/opencode-client.ts`
- Modify: `apps/app/src/app/xingjing/stores/app-store.tsx`
- Modify: `apps/app/src/app/xingjing/components/autopilot/permission-dialog.tsx`

---

## Task 1: 消除双套客户端单例 (R1)

- [ ] **Step 1: 删除 `_owClient` 及 `setOpenworkClient()`**

在 `opencode-client.ts` 中：
1. 删除 `let _owClient` 声明（第16行）
2. 删除 `let _baseUrl = 'http://127.0.0.1:4096'` 声明（第18行）
3. 删除 `setOpenworkClient()` 函数（第73-79行）
4. 修改 `getXingjingClient()` 删除 `_owClient` 回退分支，仅使用 `_sharedClient`

改造后的 `getXingjingClient()`：
```typescript
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (!_sharedClient) {
    throw new Error('[xingjing] OpenWork Client 未初始化，请确认 OpenWork 服务已启动');
  }
  return _sharedClient;
}
```

- [ ] **Step 2: 修复 fileDelete 不再依赖 `_baseUrl`**

当前 `fileDelete()` 使用 `_baseUrl` 拼接 URL 做 raw fetch。改为通过 client：
```typescript
export async function fileDelete(path: string, directory?: string): Promise<boolean> {
  const dir = directory ?? _directory;
  try {
    if (_owFileOps && _workspaceId) {
      console.warn('[xingjing] fileDelete: OpenWork 无原生 delete API，操作跳过');
      return false;
    }
    const client = getXingjingClient();
    const result = await (client.file as any).delete?.({ path, directory: dir });
    return !!result;
  } catch {
    console.warn('[xingjing] fileDelete: not supported');
    return false;
  }
}
```

- [ ] **Step 3: 更新 app-store.tsx 注入逻辑**

1. 从 import 中删除 `setOpenworkClient`
2. 简化注入 Effect：
```typescript
createEffect(() => {
  const client = props.openworkCtx?.opencodeClient?.();
  setSharedClient(client ?? null);
});
```

- [ ] **Step 4: 全局搜索 `setOpenworkClient` 引用并清理**

```bash
grep -rn "setOpenworkClient" apps/app/src/app/xingjing/
```

删除所有剩余引用。

- [ ] **Step 5: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R1 — 消除 opencode-client 双套客户端单例"
```

---

## Task 2: 权限审批改接 OpenCode SDK (R8)

- [ ] **Step 1: 修改 permission-dialog.tsx 的 resolve 回调**

在 `permission-dialog.tsx` 中，新增 `getXingjingClient` 导入：
```typescript
import { getXingjingClient } from '../../services/opencode-client';
```

修改按钮 onClick 处理函数，增加 `client.permission.reply()` 调用：
```typescript
const handleResolve = async (action: 'once' | 'always' | 'reject') => {
  try {
    const client = getXingjingClient();
    await (client.permission as any).reply({
      requestID: props.request.permissionId,
      reply: action === 'reject' ? 'deny' : action,
    });
  } catch (e) {
    console.warn('[xingjing] permission reply failed:', e);
  }
  props.onResolve(action);
};
```

替换现有的3个按钮 onClick 为 `() => handleResolve('once')` / `'always'` / `'reject'`。

- [ ] **Step 2: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R8 — permission-dialog 改接 OpenCode permission.reply"
```
