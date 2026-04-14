# Permission Dialog — 工具权限授权设计文档

**日期**：2026-04-14  
**范围**：独立版（Standalone Edition）驾驶舱  
**状态**：已审批，待实施

---

## 背景

当 OpenCode 中运行的 Agent 模型需要调用工具（bash、file read/write 等）时，会触发 `permission.asked` SSE 事件。当前实现对该事件采用静默自动拒绝策略，导致模型无法执行需要工具支撑的任务。

本次需求：**在用户界面弹出授权确认对话框，让用户决定是否允许工具调用。**

---

## 功能设计

### 交互流程

```
Agent 运行中
    ↓
permission.asked SSE 事件抵达 runAgentSession
    ↓
opts.onPermissionAsked 回调存在？
    ├─ 是：创建 waitForUser Promise，暂停 SSE for-await 循环
    │       ↓ 调用回调 → UI 弹出 Dialog + 启动 30s 倒计时
    │       ↓ 用户点击 OR 倒计时归零（→ auto 'once'）
    │       ↓ 调用 permission.reply({ reply: 'once' | 'always' | 'reject' })
    │       ↓ Promise resolve → for-await 循环继续
    └─ 否（兜底）：自动 reject（保留现有行为）
```

### Dialog 界面

```
┌──────────────────────────────────────────────┐
│  🔐  Agent 请求工具权限                        │
│                                              │
│  工具：bash                                   │
│  操作：执行 Shell 命令                         │
│  内容：ls -la /Users/xxx/project              │
│                                              │
│  ─────────────────────────────────────────   │
│  Agent 执行已暂停，请确认是否允许               │
│  将在 28s 后自动允许                ████░░░░   │
│                                              │
│  [拒绝]    [允许一次]    [始终允许本次会话]     │
└──────────────────────────────────────────────┘
```

- **倒计时**：30 秒，进度条从满到空，数字实时递减
- **到期行为**：自动触发"允许一次"（`reply: 'once'`）
- **拒绝**：`reply: 'reject'`，模型收到拒绝后继续以纯文本完成响应
- **允许一次**：`reply: 'once'`，本次工具调用执行
- **始终允许本次会话**：`reply: 'always'`，后续同类权限自动允许

---

## 数据结构

### `CallAgentOptions` 新增字段

```typescript
// opencode-client.ts
export interface CallAgentOptions {
  // ...现有字段...

  /** 工具权限请求回调（用户决定是否授权）
   *  不提供时沿用自动拒绝兜底行为 */
  onPermissionAsked?: (params: {
    permissionId: string;
    sessionId: string;
    tool?: string;       // 工具名，如 "bash"、"read"
    description?: string; // OpenCode 给出的操作描述
    input?: string;      // 操作路径/参数（展示用）
    resolve: (action: 'once' | 'always' | 'reject') => void;
  }) => void;
}
```

### `PermissionRequest` 页面状态类型

```typescript
// pages/solo/autopilot/index.tsx（局部类型）
interface PermissionRequest {
  permissionId: string;
  sessionId: string;
  tool?: string;
  description?: string;
  input?: string;
  resolve: (action: 'once' | 'always' | 'reject') => void;
}
```

---

## 修改范围

### Task 1 — `opencode-client.ts`

**`CallAgentOptions`**：增加 `onPermissionAsked` 可选字段。

**`runAgentSession` 中 `permission.asked` 处理逻辑**：

```typescript
if (evt.type === 'permission.asked') {
  const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
  if (evtSid && evtSid !== finalSid) continue;
  const permId = typeof p.id === 'string' ? p.id : null;

  if (permId && opts.onPermissionAsked) {
    // 暂停 SSE 循环，等待用户决策
    const action = await new Promise<'once' | 'always' | 'reject'>((res) => {
      opts.onPermissionAsked!({
        permissionId: permId,
        sessionId: finalSid,
        tool: typeof p.tool === 'string' ? p.tool : undefined,
        description: typeof p.description === 'string' ? p.description : undefined,
        input: typeof p.input === 'string' ? p.input : undefined,
        resolve: res,
      });
    });
    void (getClient().permission as any).reply({ requestID: permId, reply: action }).catch(() => {});
  } else if (permId) {
    // 兜底：自动拒绝（保留原有行为）
    void (getClient().permission as any).reply({ requestID: permId, reply: 'reject' }).catch(() => {});
  }
  continue;
}
```

### Task 2 — `autopilot-executor.ts`

**`runDirectAgent` opts** 增加 `onPermissionAsked` 字段，并在调用 `invoke` 时传入：

```typescript
opts: {
  // ...现有字段...
  onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
}

// invoke 调用时加入：
onPermissionAsked: opts.onPermissionAsked,
```

**`OrchestratedRunOpts`** 增加 `onPermissionAsked` 字段，在 `invoke` 调用（Orchestrator 和各 Agent）时传入。

### Task 3 — `PermissionDialog` 组件

新建 `harnesswork/apps/app/src/app/xingjing/components/autopilot/permission-dialog.tsx`。

组件接收 props：
```typescript
interface PermissionDialogProps {
  request: PermissionRequest;
  onResolve: (action: 'once' | 'always' | 'reject') => void;
}
```

内部使用 `createSignal` 管理倒计时（30s），`setInterval` 驱动递减，到期调用 `onResolve('once')`。

### Task 4 — `pages/solo/autopilot/index.tsx`

1. 增加 `const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(null);`
2. 定义 `handlePermissionAsked` 回调，调用 `setPendingPermission`
3. 在 `callAgentFn` 注入点注入 `onPermissionAsked`：
   ```tsx
   callAgentFn: (callOpts) => actions.callAgent({
     ...callOpts,
     onPermissionAsked: handlePermissionAsked,
   })
   ```
   （`runDirectAgent` 和 `runOrchestratedAutopilot` 两处都需要注入）
4. 在 JSX 中渲染 `<Show when={pendingPermission()}><PermissionDialog ... /></Show>`

---

## 边界情况处理

| 场景 | 处理方式 |
|---|---|
| 同一会话连续出现多个 `permission.asked` | 按序处理，前一个未 resolve 时后一个在 for-await 循环阻塞中等待 |
| Dialog 显示时用户关闭整个驾驶舱页面 | SolidJS `onCleanup` 触发 SSE abort，SSE loop 捕获 AbortError 退出，Promise 自然不再被 resolve（不会内存泄漏） |
| 没有 `onPermissionAsked` 的调用路径（如 `callAgent` 直接调用） | 自动拒绝兜底，现有行为不变 |
| `permission.reply` API 调用失败 | `.catch(() => {})` 静默忽略，模型会因超时自动处理 |

---

## 不修改范围

- `app-store.tsx` — 不需要改，注入在 `callAgentFn` 包装层完成
- `callAgent`（直接调用）、`callAgentDirect`（降级路径）— 均不添加 Dialog 逻辑
- 团队版相关代码 — 完全不涉及
