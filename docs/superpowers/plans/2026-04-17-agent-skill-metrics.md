# Agent/Skill 效能度量实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为星静独立版（Solo）构建 AI 搭档效能度量体系，新建「AI 效能中心」页面展示 Agent/Skill 产能和质量指标。

**Architecture:** 前端通过 OpenWork 审计日志记录 Agent/Skill 调用事件（action 编码 + summary 元数据），AI 效能页面读取审计日志后由纯前端计算引擎聚合度量指标。Server 端仅新增 POST 写入端点（~20 行）+ 提高 GET limit 上限。

**Tech Stack:** SolidJS, TailwindCSS, ECharts, OpenWork Server (Node.js), pnpm monorepo

**Spec 文档:** `harnesswork/docs/superpowers/specs/2026-04-17-agent-skill-metrics-design.md`

---

## Task 总览（16 个小任务）

| # | Task | 文件 | 动作 | 依赖 |
|---|------|------|------|------|
| 1 | 创建 audit-helpers.ts | `services/audit-helpers.ts` | Create | 无 |
| 2 | metrics-engine: 类型定义 | `services/metrics-engine.ts` | Create | T1 |
| 3 | metrics-engine: 辅助函数 | `services/metrics-engine.ts` | Modify | T2 |
| 4 | metrics-engine: computeSlice | `services/metrics-engine.ts` | Modify | T3 |
| 5 | metrics-engine: computeMetrics | `services/metrics-engine.ts` | Modify | T4 |
| 6 | 创建 Mock 数据 | `mock/ai-metrics.ts` | Create | T1 |
| 7 | Server: POST 端点 | `server/src/server.ts` | Modify | 无 |
| 8 | Server: GET limit 提高 | `server/src/server.ts` | Modify | T7 |
| 9 | Client: recordAudit 方法 | `lib/openwork-server.ts` | Modify | T7 |
| 10 | Store: recordAudit 接口+Action | `stores/app-store.tsx` | Modify | T9 |
| 11 | Context 桥接: recordAudit | `pages/xingjing-native.tsx` | Modify | T9,T10 |
| 12 | callAgent 写入审计事件 | `stores/app-store.tsx` | Modify | T1,T10 |
| 13 | 创建 AI 效能页面 | `pages/solo/ai-metrics/index.tsx` | Create | T5,T6 |
| 14 | 路由注册 | `pages/xingjing-native.tsx` | Modify | T13 |
| 15 | 侧边栏菜单项 | `layouts/main-layout.tsx` | Modify | T13 |
| 16 | 构建验证 | — | Verify | All |

**可并行**: T1 与 T7 可同时执行；T6 与 T2-T5 可并行；T14 与 T15 可并行。

---

## File Structure

| Action | File Path | Responsibility |
|--------|-----------|----------------|
| Create | `apps/app/src/app/xingjing/services/audit-helpers.ts` | Summary 解析/构建工具函数 |
| Create | `apps/app/src/app/xingjing/services/metrics-engine.ts` | 度量计算引擎 |
| Create | `apps/app/src/app/xingjing/mock/ai-metrics.ts` | AI 效能 Mock 数据 |
| Create | `apps/app/src/app/xingjing/pages/solo/ai-metrics/index.tsx` | AI 效能页面 |
| Modify | `apps/server/src/server.ts:1688-1695` | POST 端点 + GET limit 上限 1000 |
| Modify | `apps/app/src/app/lib/openwork-server.ts:1409-1414` | recordAudit 客户端方法 |
| Modify | `apps/app/src/app/xingjing/stores/app-store.tsx:82,160,420-502` | recordAudit 上下文 + callAgent 审计记录 |
| Modify | `apps/app/src/app/pages/xingjing-native.tsx:37-45,129-131,212-222` | 路由注册 + 上下文桥接 |
| Modify | `apps/app/src/app/xingjing/components/layouts/main-layout.tsx:72-90` | soloMenuItems 新增菜单 |

---

### Task 1: 创建 audit-helpers.ts — Summary 解析/构建工具

**File:** Create `harnesswork/apps/app/src/app/xingjing/services/audit-helpers.ts`

- [ ] **Step 1: 创建文件**

完整代码见 Spec 1.2 和 1.3 节。包含：
- `ParsedSummary` 接口
- `parseSummary(summary: string): ParsedSummary`
- `buildSummary(label: string, meta: Record<string, string | number>): string`

```typescript
export interface ParsedSummary {
  label: string;
  meta: Record<string, string>;
}

export function parseSummary(summary: string): ParsedSummary {
  const parts = summary.split('|');
  const label = parts[0] ?? '';
  const meta: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, ...rest] = parts[i].split(':');
    if (key) meta[key.trim()] = rest.join(':').trim();
  }
  return { label, meta };
}

export function buildSummary(label: string, meta: Record<string, string | number>): string {
  const parts = [label];
  for (const [key, value] of Object.entries(meta)) {
    parts.push(`${key}:${value}`);
  }
  return parts.join('|');
}
```

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add audit summary parse/build helpers"`

---

### Task 2: 创建 metrics-engine.ts — 类型定义

**File:** Create `harnesswork/apps/app/src/app/xingjing/services/metrics-engine.ts`

- [ ] **Step 1: 创建文件，写入所有类型 + 导出**

包含：`AgentMetric`, `SkillMetric`, `DailyActivity`, `MetricsResult`, `TimeWindow`, `AuditRow` 接口。

```typescript
import { parseSummary } from './audit-helpers';

export interface AgentMetric {
  agentId: string;
  agentName: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface SkillMetric {
  skillName: string;
  invokeCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface DailyActivity {
  date: string;
  agentCalls: number;
  skillInvokes: number;
  sessions: number;
}

export interface MetricsResult {
  totalAgentCalls: number;
  totalSuccessRate: number;
  totalWorkTimeMs: number;
  mostActiveAgent: { name: string; count: number } | null;
  dailyActivity: DailyActivity[];
  agentMetrics: AgentMetric[];
  skillRanking: SkillMetric[];
  avgSessionDurationMs: number;
  sessionCompletionRate: number;
  trends: {
    callsTrend: number;
    successTrend: number;
    workTimeTrend: number;
  };
}

export type TimeWindow = 7 | 30 | 'all';

export interface AuditRow {
  action: string;
  target: string;
  summary: string;
  timestamp: number;
}
```

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add metrics engine types"`

---

### Task 3: metrics-engine.ts — 内部辅助函数

**File:** Modify `harnesswork/apps/app/src/app/xingjing/services/metrics-engine.ts`

- [ ] **Step 1: 在类型定义后添加内部辅助函数**

包含：
- `dayKey(ts)` — 时间戳转 YYYY-MM-DD
- `filterByWindow(entries, window, now)` — 按时间窗口过滤
- `getPreviousWindow(entries, window, now)` — 获取前一个时间窗口

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterByWindow(entries: AuditRow[], window: TimeWindow, now: number): AuditRow[] {
  if (window === 'all') return entries;
  return entries.filter(e => e.timestamp >= now - window * DAY_MS);
}

function getPreviousWindow(entries: AuditRow[], window: TimeWindow, now: number): AuditRow[] {
  const days = window === 'all' ? 30 : window;
  const start = now - 2 * days * DAY_MS;
  const end = now - days * DAY_MS;
  return entries.filter(e => e.timestamp >= start && e.timestamp < end);
}
```

---

### Task 4: metrics-engine.ts — computeSlice 函数

**File:** Modify `harnesswork/apps/app/src/app/xingjing/services/metrics-engine.ts`

- [ ] **Step 1: 添加 computeSlice 函数**

负责从一组审计条目中统计 agent/skill/session 指标。解析每条 entry 的 action + summary，按 target 聚合。

关键逻辑：
- `agent.complete` → success+1，totalMs += duration
- `agent.error` → error+1
- `skill.invoke` → count+1，totalMs += duration
- `session.complete` → sessionComplete+1
- `session.error` → sessionError+1

返回 `SliceResult`（与 `MetricsResult` 相同但无 `trends` 和 `dailyActivity`）。

---

### Task 5: metrics-engine.ts — computeMetrics 主入口

**File:** Modify `harnesswork/apps/app/src/app/xingjing/services/metrics-engine.ts`

- [ ] **Step 1: 添加导出函数 `computeMetrics`**

```typescript
export function computeMetrics(entries: AuditRow[], window: TimeWindow): MetricsResult
```

逻辑：
1. `filterByWindow` 获取当前窗口数据
2. `getPreviousWindow` 获取前一个窗口数据
3. 分别调用 `computeSlice`
4. 计算 trends（百分比变化）
5. 构建 dailyActivity（按天分组）

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add metrics computation engine"`

---

### Task 6: 创建 ai-metrics.ts — Mock 数据

**File:** Create `harnesswork/apps/app/src/app/xingjing/mock/ai-metrics.ts`

- [ ] **Step 1: 创建文件**

包含 `generateMockAuditEntries(days = 30): AuditRow[]`，生成模拟的 agent/skill/session 审计条目。

关键设计：
- 4 个 Agent：`product-brain`, `dev-copilot`, `architect-advisor`, `qa-guardian`
- 8 个 Skill：PRD生成、代码审查、SDD编写、测试用例生成...
- 每天 3-12 次 agent 调用，5% 错误率，60% 概率伴随 skill
- 每天 1-3 个 session，8% session 错误率

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add AI metrics mock data generator"`

---

### Task 7: Server — 新增 POST /workspace/:id/audit 端点

**File:** Modify `harnesswork/apps/server/src/server.ts`
**位置:** L1688 GET 路由前方

- [ ] **Step 1: 在 GET 路由前插入 POST 路由**

```typescript
const ALLOWED_AUDIT_PREFIXES = ["agent.", "skill.", "session."];

addRoute(routes, "POST", "/workspace/:id/audit", "client", async (ctx) => {
  ensureWritable(config);
  const workspace = await resolveWorkspace(config, ctx.params.id);
  const body = await readJsonBody(ctx.request);
  const action = typeof body.action === "string" ? body.action : "";
  const target = typeof body.target === "string" ? body.target : "";
  const summary = typeof body.summary === "string" ? body.summary : "";
  if (!action || !target) return jsonResponse({ error: "action and target required" }, 400);
  if (!ALLOWED_AUDIT_PREFIXES.some((p) => action.startsWith(p)))
    return jsonResponse({ error: "action prefix not allowed" }, 403);
  await recordAudit(workspace.path, {
    id: shortId(), workspaceId: workspace.id,
    actor: ctx.actor ?? { type: "host" }, action, target, summary, timestamp: Date.now(),
  });
  return jsonResponse({ ok: true }, 201);
});
```

- [ ] **Step 2: Commit** — `git commit -m "feat(server): add POST /workspace/:id/audit endpoint"`

---

### Task 8: Server — 提高 GET limit 上限到 1000

**File:** Modify `harnesswork/apps/server/src/server.ts`
**位置:** L1692 `Math.min(parsed, 200)`

- [ ] **Step 1: 将 200 改为 1000**

```diff
- const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
+ const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 50;
```

- [ ] **Step 2: 验证 server 编译** — `npx turbo build --filter=@opencode/server`
- [ ] **Step 3: Commit** — `git commit -m "feat(server): raise GET /audit limit to 1000"`

---

### Task 9: Client — openwork-server.ts 添加 recordAudit 方法

**File:** Modify `harnesswork/apps/app/src/app/lib/openwork-server.ts`
**位置:** L1414 `listAudit` 方法之后

- [ ] **Step 1: 添加 recordAudit 方法**

```typescript
recordAudit: (workspaceId: string, entry: { action: string; target: string; summary: string }) =>
  requestJson<{ ok: boolean }>(
    baseUrl,
    `/workspace/${workspaceId}/audit`,
    { token, hostToken, method: 'POST', body: entry },
  ),
```

> `body: entry`（对象），`requestJson` 内部会 `JSON.stringify`。

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add recordAudit to openwork server client"`

---

### Task 10: app-store.tsx — 添加 recordAudit 接口和 Action

**File:** Modify `harnesswork/apps/app/src/app/xingjing/stores/app-store.tsx`

- [ ] **Step 1: XingjingOpenworkContext 接口添加 recordAudit**

在 L82 `listAudit` 后添加：

```typescript
recordAudit?: (workspaceId: string, entry: { action: string; target: string; summary: string }) => Promise<unknown>;
```

- [ ] **Step 2: actions 类型添加 recordAudit**

在约 L160 `listAudit` 后添加：

```typescript
recordAudit: (entry: { action: string; target: string; summary: string }) => Promise<void>;
```

- [ ] **Step 3: actions 实现添加 recordAudit**

在 L424 `listAudit` action 后添加：

```typescript
recordAudit: async (entry: { action: string; target: string; summary: string }): Promise<void> => {
  const wsId = resolvedWorkspaceId();
  if (!wsId || !props.openworkCtx?.recordAudit) return;
  try { await props.openworkCtx.recordAudit(wsId, entry); } catch { /* silent */ }
},
```

- [ ] **Step 4: Commit** — `git commit -m "feat(metrics): add recordAudit to store interface and actions"`

---

### Task 11: xingjing-native.tsx — 桥接 recordAudit

**File:** Modify `harnesswork/apps/app/src/app/pages/xingjing-native.tsx`
**位置:** L131 `listAudit` 桥接之后

- [ ] **Step 1: 添加 recordAudit 桥接**

```typescript
recordAudit: (workspaceId: string, entry: { action: string; target: string; summary: string }) =>
  props.openworkServerClient!.recordAudit(workspaceId, entry)
    .then(() => undefined as unknown).catch(() => undefined),
```

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): bridge recordAudit in xingjing-native context"`

---

### Task 12: callAgent 中写入审计事件

**File:** Modify `harnesswork/apps/app/src/app/xingjing/stores/app-store.tsx`
**位置:** L1 import 区 + L426-502 callAgent 函数

- [ ] **Step 1: 添加 import**

```typescript
import { buildSummary } from '../services/audit-helpers';
```

- [ ] **Step 2: 在 onDone 回调中添加审计写入**

在 L468 `void appendAgentLog(...)` 之后：

```typescript
void actions.recordAudit({
  action: 'agent.complete',
  target: opts.title ?? 'agent',
  summary: buildSummary(opts.title ?? currentProductName, {
    duration: Date.now() - start,
    tokens: text.length,
    model: model?.modelID ?? llmCfg.modelID ?? '',
  }),
});
```

- [ ] **Step 3: 在 onError 回调中添加审计写入**

在 L478 `void appendAgentLog(...)` 之后：

```typescript
void actions.recordAudit({
  action: 'agent.error',
  target: opts.title ?? 'agent',
  summary: buildSummary(opts.title ?? currentProductName, {
    error: errMsg.slice(0, 100),
    model: model?.modelID ?? llmCfg.modelID ?? '',
  }),
});
```

- [ ] **Step 4: 在 catch 块中添加同样的 agent.error 写入**
- [ ] **Step 5: Commit** — `git commit -m "feat(metrics): record agent audit events in callAgent"`

---

### Task 13: 创建 AI 效能页面

**File:** Create `harnesswork/apps/app/src/app/xingjing/pages/solo/ai-metrics/index.tsx`

- [ ] **Step 1: 创建页面文件**

页面结构（见 Spec 3.2）：
- 标题栏 + 时间窗口切换按钮（7天/30天/全部）
- 4 个概览卡片：AI调用、成功率、累计执行时长、最活跃Agent
- 每日活跃度折线图（ECharts）+ Agent调用分布饼图
- Agent效能详情表格
- Skill调用排行 Top10
- 会话完成率 + Agent平均响应耗时柱状图

关键实现点：
- `onMount` 调用 `actions.listAudit(500)` 获取数据
- 未连接 OpenWork 时降级到 `generateMockAuditEntries()` + 显示「演示数据」标签
- `createMemo` 响应式计算 `computeMetrics(entries(), window())`
- 复用 `themeColors`/`chartColors`/`getChartColor` 主题系统
- 复用现有 `ECharts` 组件（`components/common/echarts.tsx`）
- 子组件：`MetricCard`、`Card`、`TrendBadge`（内联在同一文件）

- [ ] **Step 2: Commit** — `git commit -m "feat(metrics): add AI Metrics page"`

---

### Task 14: xingjing-native.tsx — 注册路由

**File:** Modify `harnesswork/apps/app/src/app/pages/xingjing-native.tsx`

- [ ] **Step 1: 添加 lazy import**

在 L45 `SoloAgentWorkshop` 之后：

```typescript
const SoloAiMetrics = lazy(() => import('../xingjing/pages/solo/ai-metrics'));
```

- [ ] **Step 2: 添加路由**

在 L221 `/solo/agent-workshop` 路由之后：

```tsx
<Route path="/solo/ai-metrics" component={SoloAiMetrics} />
```

- [ ] **Step 3: Commit** — `git commit -m "feat(metrics): register /solo/ai-metrics route"`

---

### Task 15: main-layout.tsx — 侧边栏菜单项

**File:** Modify `harnesswork/apps/app/src/app/xingjing/components/layouts/main-layout.tsx`

- [ ] **Step 1: 添加 Activity 图标 import**

在 lucide-solid import 中添加 `Activity`。

- [ ] **Step 2: soloMenuItems 添加菜单项**

在 `/solo/agent-workshop` 和 `/solo/settings` 之间插入：

```typescript
{ key: '/solo/ai-metrics', iconFn: () => <Activity size={16} />, label: 'AI效能' },
```

- [ ] **Step 3: Commit** — `git commit -m "feat(metrics): add AI Metrics sidebar menu item"`

---

### Task 16: 构建验证

- [ ] **Step 1:** `cd harnesswork && npx turbo build --filter=@opencode/server` — Server 编译通过
- [ ] **Step 2:** `cd harnesswork && npx turbo build --filter=app` — App 编译通过
- [ ] **Step 3:** 检查 TypeScript 类型 — `npx tsc --noEmit -p apps/app/tsconfig.json`
- [ ] **Step 4:** 修复任何构建错误并 commit

---

## Dependency Graph

```
T1 (audit-helpers) ─┬─► T2 (types) ─► T3 (helpers) ─► T4 (computeSlice) ─► T5 (computeMetrics) ─┐
                    ├─► T6 (mock) ───────────────────────────────────────────┼─► T13 (page) ─┬─► T14 (route)
                    └─► T12 (callAgent audit) ◄───── T10 (store) ◄─ T9 (client) ◄─ T7+T8 (server)      └─► T15 (menu)
T7 (POST) ─► T8 (GET limit) ─► T9 (client) ─► T10 (store) ─► T11 (bridge) ─► T12 (callAgent)   ─► T16 (verify)
```

**可并行执行**：
- T1 与 T7 可同时开始
- T2-T5 与 T8-T9 可并行
- T6 与 T3-T5 可并行
- T14 与 T15 可并行
