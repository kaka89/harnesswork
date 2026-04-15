# Agent 断线重试机制设计

**日期**: 2026-04-14  
**状态**: 已批准  
**影响范围**: 独立版驾驶舱（Standalone Edition）

---

## 背景

当前 Agent 执行中断后没有任何自动恢复机制：SSE 事件流异常断开时，若已有部分内容则直接以 `onDone` 处理半截输出；若无内容则以 `onError` 报错。整个执行链路无重试、无重连。

---

## 目标

在 `callAgent` / `callAgentWithClient` 内部实现**两层静默自动重试**，对上层调用者（`autopilot-executor.ts`、页面组件）完全透明，不改变任何回调接口。

---

## 设计决策

| 维度 | 决策 |
|------|------|
| 用户感知 | 静默，重试期间无 UI 变化，耗尽后才 `onError` |
| 重试粒度 | 两层：SSE 连接层优先，Agent 调用层兜底 |
| 重试次数 | 每层最多 3 次 |
| 退避间隔 | 指数退避：1s / 2s / 5s |
| 并发隔离 | 每个 `callAgent` 调用独立计数，互不影响 |

---

## 架构

### 两层重试流程

```
SSE 流异常断开（非 abort）
    │
    └─ Layer 1: SSE 重连（最多 3 次，1s/2s/5s）
           复用同一 sessionId，重新 client.event.subscribe()
           ├─ 成功 → 继续累加 accumulated，正常完成
           └─ 3 次全失 → Layer 2
                │
                └─ Layer 2: 全新 Agent 调用（最多 3 次，1s/2s/5s）
                       清空 accumulated，重新 session.create() + promptAsync()
                       ├─ 成功 → 正常完成
                       └─ 3 次全失 → opts.onError('重试耗尽: ...')
```

### 退避时间常量

```typescript
const RETRY_DELAYS = [1000, 2000, 5000]; // ms
```

---

## 改动范围

### 文件 1：`services/opencode-client.ts`

**新增工具函数**：
- `sleep(ms: number): Promise<void>` — 异步等待
- `subscribeWithRetry(...)` — SSE 层重连逻辑（Layer 1）

**改造 `callAgent`**：
- 将现有 SSE catch 块的 `onError` 替换为 `subscribeWithRetry` 调用
- `subscribeWithRetry` 失败后执行 `callAgentRetry`（Layer 2）

**改造 `callAgentWithClient`**：
- 同上，保持两个函数接口一致

### 文件 2：`autopilot-executor.ts`

**无需改动** — 重试逻辑完全封装在底层，上层回调接口不变。

---

## 关键实现约束

1. **accumulated 处理**：
   - Layer 1（SSE 重连）：保留已有 `accumulated`，新事件继续累加。`message.part.updated` 事件携带全量 `text`，已有防重复保障。
   - Layer 2（全新调用）：清空 `accumulated = ''`，从头接收。

2. **done 标志保护**：重试前检查 `done` 状态，若已被 abort 则不重试。

3. **sessionId 有效性**：Layer 1 重连前不重新创建 session，复用原 `sessionId`。若 OpenCode 已重启导致 session 失效，Layer 1 会因收不到事件或收到 `session.error` 而失败，自然触发 Layer 2。

4. **不影响直连降级路径**：`callAgentDirect`（直连 LLM API）是独立函数，不纳入本次重试改造范围。

---

## 测试验证点

- [ ] 网络短暂抖动（< 1s）：Layer 1 第 1 次重连成功，输出完整
- [ ] OpenCode 短暂重启（< 8s）：Layer 1 耗尽后 Layer 2 成功，重新输出
- [ ] 持续不可用：Layer 1 + Layer 2 全部耗尽，`onError` 正确触发
- [ ] 并发 Agent 中某一个失败：其他 Agent 不受影响（已有 Promise.all 隔离）
- [ ] TypeCheck 零错误
