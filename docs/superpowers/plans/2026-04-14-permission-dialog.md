# Permission Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立版驾驶舱 Agent 运行时，当模型请求工具权限时，弹出模态授权对话框（含 30 秒倒计时），让用户选择允许或拒绝。

**Architecture:** 在 SSE 事件循环中，收到 `permission.asked` 时若 `opts.onPermissionAsked` 存在，则 `await` 一个 Promise 暂停循环等待用户操作；UI 层用 SolidJS signal 管理权限队列，支持并发多个权限请求按序显示。

**Tech Stack:** SolidJS, TypeScript, lucide-solid, inline styles (themeColors), @opencode-ai/sdk permission.reply API

---

## 文件清单

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 修改 | `apps/app/src/app/xingjing/services/opencode-client.ts` | 增加回调字段 + 修改 permission.asked 处理 + session.create 条件权限规则 |
| 修改 | `apps/app/src/app/xingjing/services/autopilot-executor.ts` | runDirectAgent / OrchestratedRunOpts 增加 onPermissionAsked 并透传 |
| 新建 | `apps/app/src/app/xingjing/components/autopilot/permission-dialog.tsx` | 权限授权对话框组件（含 30s 倒计时） |
| 修改 | `apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx` | 权限队列状态 + 注入回调 + 渲染 Dialog |

> **注意**：`app-store.tsx` 使用 `wrappedOpts = { ...opts, ... }` 扩展，`onPermissionAsked` 自动透传，无需修改。

---

## Task 1 — opencode-client.ts：扩展 CallAgentOptions + 修改 permission.asked 处理

**Files:**
- Modify: `apps/app/src/app/xingjing/services/opencode-client.ts`

### 1a. 增加 `onPermissionAsked` 字段到 `CallAgentOptions`

- [ ] 找到 `export interface CallAgentOptions`（约第 521 行），在 `onError` 字段之后插入：

```typescript
  /** 工具权限请求回调（用户决定是否授权）。
   *  不提供时沿用自动拒绝兜底行为。
   *  提供时 SSE 循环将暂停等待 resolve 后继续。*/
  onPermissionAsked?: (params: {
    permissionId: string;
    sessionId: string;
    tool?: string;
    description?: string;
    input?: string;
    resolve: (action: 'once' | 'always' | 'reject') => void;
  }) => void;
```

### 1b. 修改 `session.create` — 有回调时不设置 deny-all 规则

- [ ] 找到 `runAgentSession` 内 `session.create` 调用（约第 592 行）：

原代码：
```typescript
      const denyAllPermission = [{ permission: '*', pattern: '*', action: 'deny' }];
      const result = await client.session.create({
        body: { ...(opts.title ? { title: opts.title } : { title: `xingjing-${Date.now()}` }) },
        permission: denyAllPermission,
        ...(opts.directory ?? _directory ? { directory: opts.directory ?? _directory } : {}),
      } as Parameters<typeof client.session.create>[0]);
```

替换为：
```typescript
      // 有 onPermissionAsked 时不设置 deny-all（否则 OpenCode 静默拒绝，不发 permission.asked 事件）
      const sessionPermission = opts.onPermissionAsked
        ? undefined
        : [{ permission: '*', pattern: '*', action: 'deny' }];
      const result = await client.session.create({
        body: { ...(opts.title ? { title: opts.title } : { title: `xingjing-${Date.now()}` }) },
        ...(sessionPermission ? { permission: sessionPermission } : {}),
        ...(opts.directory ?? _directory ? { directory: opts.directory ?? _directory } : {}),
      } as Parameters<typeof client.session.create>[0]);
```

### 1c. 修改 `permission.asked` 事件处理 — await 用户决策

- [ ] 找到 SSE 循环中 `// ── 工具权限请求：自动拒绝并继续` 注释块（约第 744 行）：

原代码：
```typescript
          // ── 工具权限请求：自动拒绝并继续，让 model 以文本形式完成响应 ──
          // 原先视为 hard-error 会导致 UI 卡在 streaming 状态后进入漫长重试
          if (evt.type === 'permission.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            const permId = typeof p.id === 'string' ? p.id : null;
            if (permId) {
              // 自动拒绝权限请求，model 收到拒绝后会继续以纯文本形式生成响应
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: 'reject' }).catch(() => {});
            }
            continue; // 继续等待 session 完成
          }
```

替换为：
```typescript
          // ── 工具权限请求 ──
          if (evt.type === 'permission.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            const permId = typeof p.id === 'string' ? p.id : null;
            if (permId && opts.onPermissionAsked) {
              // 有回调：暂停 SSE 循环，等待用户在 UI 上做决策
              const action = await new Promise<'once' | 'always' | 'reject'>((res) => {
                opts.onPermissionAsked!({
                  permissionId: permId,
                  sessionId: finalSid,
                  tool: typeof p.tool === 'string' ? p.tool : undefined,
                  description: typeof p.description === 'string' ? p.description : undefined,
                  input: typeof p.input === 'string' ? p.input : (typeof p.path === 'string' ? p.path : undefined),
                  resolve: res,
                });
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: action }).catch(() => {});
            } else if (permId) {
              // 无回调兜底：自动拒绝，model 继续以纯文本生成响应
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: 'reject' }).catch(() => {});
            }
            continue; // 继续等待 session 完成
          }
```

- [ ] 运行类型检查，确认无编译错误：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
pnpm --filter @openwork/app tsc --noEmit 2>&1 | head -30
```

期望：无错误或只有不相关的预存警告。

- [ ] 提交：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
git add apps/app/src/app/xingjing/services/opencode-client.ts
git commit -m "feat(xingjing): add onPermissionAsked to CallAgentOptions with user-await flow"
```

---

## Task 2 — autopilot-executor.ts：透传 onPermissionAsked

**Files:**
- Modify: `apps/app/src/app/xingjing/services/autopilot-executor.ts`

### 2a. `runDirectAgent` opts 增加字段并透传

- [ ] 找到 `export async function runDirectAgent` 的 opts 类型定义（约第 314 行）：

原代码：
```typescript
  opts: {
    workDir?: string;
    model?: { providerID: string; modelID: string };
    /** 注入 callAgent 实现，优先使用 store.actions.callAgent（复用 OpenWork client）*/
    callAgentFn?: (options: CallAgentOptions) => Promise<void>;
    onStatus?: (status: AgentExecutionStatus) => void;
    onStream?: (text: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  },
```

替换为：
```typescript
  opts: {
    workDir?: string;
    model?: { providerID: string; modelID: string };
    /** 注入 callAgent 实现，优先使用 store.actions.callAgent（复用 OpenWork client）*/
    callAgentFn?: (options: CallAgentOptions) => Promise<void>;
    /** 工具权限请求回调，透传给 callAgent */
    onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
    onStatus?: (status: AgentExecutionStatus) => void;
    onStream?: (text: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (err: string) => void;
  },
```

- [ ] 找到 `runDirectAgent` 内 `invoke({` 调用处（约第 331 行），在 `model: opts.model,` 行之后加一行：

原代码（invoke 调用内）：
```typescript
      invoke({
        title: `xingjing-direct-${agent.id}-${Date.now()}`,
        directory: opts.workDir,
        systemPrompt: agent.systemPrompt,
        userPrompt: prompt,
        model: opts.model,
        onText: (accumulated) => {
```

替换为：
```typescript
      invoke({
        title: `xingjing-direct-${agent.id}-${Date.now()}`,
        directory: opts.workDir,
        systemPrompt: agent.systemPrompt,
        userPrompt: prompt,
        model: opts.model,
        onPermissionAsked: opts.onPermissionAsked,
        onText: (accumulated) => {
```

### 2b. `OrchestratedRunOpts` 增加字段并透传

- [ ] 找到 `export interface OrchestratedRunOpts`（约第 188 行），在 `callAgentFn` 行之后插入：

```typescript
  /** 工具权限请求回调，透传给各 Agent 的 callAgent 调用 */
  onPermissionAsked?: CallAgentOptions['onPermissionAsked'];
```

- [ ] 找到 `runOrchestratedAutopilot` 中 Orchestrator 的 `invoke({` 调用（约第 221 行），在 `model,` 行后加：

原代码（Orchestrator invoke 内）：
```typescript
    invoke({
      title: `xingjing-orchestrator-${Date.now()}`,
      directory: workDir,
      systemPrompt: orchestratorSystemPrompt,
      userPrompt: goal,
      model,
      onText: (accumulated) => {
```

替换为：
```typescript
    invoke({
      title: `xingjing-orchestrator-${Date.now()}`,
      directory: workDir,
      systemPrompt: orchestratorSystemPrompt,
      userPrompt: goal,
      model,
      onPermissionAsked: opts.onPermissionAsked,
      onText: (accumulated) => {
```

- [ ] 找到各 Agent 并发调用的 `invoke({`（约第 277 行），同样添加：

原代码（Agent invoke 内）：
```typescript
        invoke({
          title: `xingjing-agent-${agentId}-${Date.now()}`,
          directory: workDir,
          systemPrompt: agentDef.systemPrompt,
          userPrompt: task,
          model,
          onText: (accumulated) => {
```

替换为：
```typescript
        invoke({
          title: `xingjing-agent-${agentId}-${Date.now()}`,
          directory: workDir,
          systemPrompt: agentDef.systemPrompt,
          userPrompt: task,
          model,
          onPermissionAsked: opts.onPermissionAsked,
          onText: (accumulated) => {
```

- [ ] 类型检查：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
pnpm --filter @openwork/app tsc --noEmit 2>&1 | head -30
```

- [ ] 提交：

```bash
git add apps/app/src/app/xingjing/services/autopilot-executor.ts
git commit -m "feat(xingjing): forward onPermissionAsked through runDirectAgent and runOrchestratedAutopilot"
```

---

## Task 3 — 新建 PermissionDialog 组件

**Files:**
- Create: `apps/app/src/app/xingjing/components/autopilot/permission-dialog.tsx`

- [ ] 创建文件，内容如下：

```typescript
/**
 * PermissionDialog — 工具权限授权对话框
 *
 * 当 Agent 请求工具权限时显示，含 30 秒倒计时。
 * 倒计时归零自动触发"允许一次"。
 */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { ShieldQuestion, Clock } from 'lucide-solid';
import { themeColors } from '../../utils/colors';

export interface PermissionRequest {
  permissionId: string;
  sessionId: string;
  tool?: string;
  description?: string;
  input?: string;
  resolve: (action: 'once' | 'always' | 'reject') => void;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onResolve: (action: 'once' | 'always' | 'reject') => void;
}

const COUNTDOWN_SECONDS = 30;

const PermissionDialog = (props: PermissionDialogProps) => {
  const [countdown, setCountdown] = createSignal(COUNTDOWN_SECONDS);

  // 倒计时驱动：每秒递减，归零时自动允许一次
  onMount(() => {
    const timer = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(timer);
          props.onResolve('once');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  const progress = () => (countdown() / COUNTDOWN_SECONDS) * 100;

  const toolLabel = () => props.request.tool ?? '工具调用';
  const descLabel = () => props.request.description ?? '模型需要执行一个工具操作';
  const inputLabel = () => props.request.input ?? '';

  return (
    // 全屏遮罩
    <div
      style={{
        position: 'fixed',
        inset: '0',
        'z-index': '10000',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
      }}
    >
      {/* 对话框 */}
      <div
        style={{
          width: '440px',
          background: themeColors.surface,
          'border-radius': '12px',
          'box-shadow': '0 24px 64px rgba(0,0,0,0.25)',
          padding: '24px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '16px',
        }}
      >
        {/* 标题 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <ShieldQuestion size={20} color={themeColors.primary} />
          <span style={{ 'font-size': '16px', 'font-weight': '600', color: themeColors.text }}>
            Agent 请求工具权限
          </span>
        </div>

        {/* 权限详情 */}
        <div
          style={{
            background: themeColors.backgroundSecondary,
            'border-radius': '8px',
            padding: '12px 14px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>工具</span>
            <span
              style={{
                'font-size': '13px',
                'font-weight': '600',
                color: themeColors.primary,
                background: themeColors.primaryLight,
                padding: '2px 8px',
                'border-radius': '4px',
              }}
            >
              {toolLabel()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>描述</span>
            <span style={{ 'font-size': '13px', color: themeColors.text }}>{descLabel()}</span>
          </div>
          {inputLabel() && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>内容</span>
              <span
                style={{
                  'font-size': '12px',
                  color: themeColors.textSecondary,
                  'font-family': 'monospace',
                  'word-break': 'break-all',
                }}
              >
                {inputLabel()}
              </span>
            </div>
          )}
        </div>

        {/* 倒计时提示 */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <Clock size={13} color={themeColors.textMuted} />
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                Agent 执行已暂停，请确认是否允许
              </span>
            </div>
            <span style={{ 'font-size': '12px', color: countdown() <= 5 ? themeColors.warning : themeColors.textMuted }}>
              将在 {countdown()}s 后自动允许
            </span>
          </div>
          {/* 进度条 */}
          <div
            style={{
              height: '4px',
              background: themeColors.borderLight,
              'border-radius': '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress()}%`,
                background: countdown() <= 5 ? themeColors.warning : themeColors.primary,
                'border-radius': '2px',
                transition: 'width 0.9s linear',
              }}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '8px', 'justify-content': 'flex-end' }}>
          <button
            onClick={() => props.onResolve('reject')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent',
              color: themeColors.textSecondary,
              'font-size': '13px',
              cursor: 'pointer',
            }}
          >
            拒绝
          </button>
          <button
            onClick={() => props.onResolve('once')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.primaryBorder}`,
              background: themeColors.primaryLight,
              color: themeColors.primary,
              'font-size': '13px',
              cursor: 'pointer',
              'font-weight': '500',
            }}
          >
            允许一次
          </button>
          <button
            onClick={() => props.onResolve('always')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: 'none',
              background: themeColors.primary,
              color: '#fff',
              'font-size': '13px',
              cursor: 'pointer',
              'font-weight': '500',
            }}
          >
            始终允许本次会话
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
```

- [ ] 类型检查：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
pnpm --filter @openwork/app tsc --noEmit 2>&1 | head -30
```

- [ ] 提交：

```bash
git add apps/app/src/app/xingjing/components/autopilot/permission-dialog.tsx
git commit -m "feat(xingjing): add PermissionDialog component with 30s countdown auto-allow"
```

---

## Task 4 — autopilot/index.tsx：权限队列状态 + 注入回调 + 渲染 Dialog

**Files:**
- Modify: `apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx`

### 4a. 导入 PermissionDialog 和 PermissionRequest 类型

- [ ] 找到文件顶部的 import 区块（约第 21 行，`import ExpandableOverlay`行后），追加：

```typescript
import PermissionDialog, { type PermissionRequest } from '../../../components/autopilot/permission-dialog';
```

### 4b. 增加权限队列信号

- [ ] 找到页面组件内部的 signal 定义区（搜索 `const [runState, setRunState]`，约第 600 行附近），在附近添加：

```typescript
  // ─── 权限授权队列 ───
  // 队列头部为当前展示的 Dialog，resolve 后自动弹出下一个
  const [permissionQueue, setPermissionQueue] = createSignal<PermissionRequest[]>([]);
```

### 4c. 定义 handlePermissionAsked 和 handlePermissionResolve

- [ ] 在 `permissionQueue` signal 定义之后添加：

```typescript
  const handlePermissionAsked = (params: PermissionRequest) => {
    setPermissionQueue((prev) => [...prev, params]);
  };

  const handlePermissionResolve = (action: 'once' | 'always' | 'reject') => {
    const current = permissionQueue()[0];
    if (current) {
      current.resolve(action);
      setPermissionQueue((prev) => prev.slice(1));
    }
  };
```

### 4d. 在两处 callAgentFn 注入 onPermissionAsked

- [ ] 找到 `@mention` 直接调用处 `runDirectAgent` 调用（约第 691 行）：

原代码：
```typescript
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        model,
        callAgentFn: (callOpts) => actions.callAgent(callOpts),
```

替换为：
```typescript
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        model,
        onPermissionAsked: handlePermissionAsked,
        callAgentFn: (callOpts) => actions.callAgent(callOpts),
```

- [ ] 找到 Orchestrated 两阶段模式 `runOrchestratedAutopilot` 调用（约第 727 行）：

原代码：
```typescript
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: SOLO_AGENTS,
      workDir,
      model,
      callAgentFn: (callOpts) => actions.callAgent(callOpts),
```

替换为：
```typescript
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: SOLO_AGENTS,
      workDir,
      model,
      onPermissionAsked: handlePermissionAsked,
      callAgentFn: (callOpts) => actions.callAgent(callOpts),
```

### 4e. 在 JSX 中渲染 PermissionDialog

- [ ] 找到页面 JSX return 的根节点（通常是最外层 `<div>`），在其最后一个子元素之后（闭合 `</div>` 之前）添加：

```tsx
        {/* 工具权限授权 Dialog */}
        <Show when={permissionQueue().length > 0}>
          <PermissionDialog
            request={permissionQueue()[0]!}
            onResolve={handlePermissionResolve}
          />
        </Show>
```

- [ ] 类型检查：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
pnpm --filter @openwork/app tsc --noEmit 2>&1 | head -30
```

- [ ] 提交：

```bash
git add apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx
git commit -m "feat(xingjing): wire up permission dialog in solo autopilot page with queue"
```

---

## Task 5 — 内存更新：更新历史决策记录

- [ ] 将 `important_decision_experience` 中旧的"权限请求超时处理-60秒自动拒绝"记录更新为本次设计：**30 秒倒计时自动允许，用户可选拒绝 / 允许一次 / 始终允许本次会话**。

---

## Task 6 — 验证

- [ ] 确认无 TypeScript 编译错误：

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
pnpm --filter @openwork/app tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

期望：0 行错误输出。

- [ ] （可选）构建验证：

```bash
pnpm --filter @openwork/app build 2>&1 | tail -20
```

- [ ] 提交最终汇总 commit（如有遗漏文件）：

```bash
git status
```

---

## 自检结果

| Spec 要求 | 对应 Task |
|---|---|
| CallAgentOptions 增加 onPermissionAsked | Task 1a |
| session.create 有回调时不设 deny-all 规则 | Task 1b |
| permission.asked 事件：有回调时 await Promise | Task 1c |
| permission.asked 事件：无回调时保留自动拒绝 | Task 1c |
| runDirectAgent 透传 onPermissionAsked | Task 2a |
| OrchestratedRunOpts + invoke 透传 onPermissionAsked | Task 2b |
| PermissionDialog 组件（工具/描述/内容展示） | Task 3 |
| 30 秒倒计时进度条 + 自动允许一次 | Task 3 |
| 三个按钮：拒绝 / 允许一次 / 始终允许本次会话 | Task 3 |
| 页面权限队列状态管理 | Task 4b/4c |
| callAgentFn 注入点注入 onPermissionAsked | Task 4d |
| JSX 渲染 Dialog | Task 4e |
