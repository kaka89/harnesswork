---
meta:
  id: SDD-006
  title: AI 效能中心——Agent/Skill 效能度量（Solo 独立版）
  status: approved
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: 2026-04-17-agent-skill-metrics-design
  revision: "1.0"
  created: "2026-04-17"
  updated: "2026-04-17"
sections:
  background: "星静独立版缺乏对 AI 搭档使用效果的量化度量，开发者无法了解 Agent/Skill 的实际产能贡献"
  goals: "基于 OpenWork 审计日志，前端计算 Agent/Skill 的产能和质量指标，新建 /solo/ai-metrics 效能中心页面"
  architecture: "Action 编码方案：callAgent 完成/失败时通过新增的 POST /workspace/:id/audit 写入审计事件，前端 computeMetrics 引擎从日志计算指标"
  interfaces: "Server: POST /workspace/:id/audit（新增）、GET /workspace/:id/audit limit↑1000；Client: recordAudit 方法；Store: recordAudit action"
  nfr: "审计写入静默失败不影响主流程；指标计算纯前端（O(n)）；Mock 降级保证页面始终可用"
---

# SDD-006 AI 效能中心——Agent/Skill 效能度量（Solo 独立版）

## 元信息

- 编号：SDD-006-ai-metrics-solo
- 状态：approved
- 作者：architect-agent
- 来源 Spec：[2026-04-17-agent-skill-metrics-design](../../../superpowers/specs/2026-04-17-agent-skill-metrics-design.md)
- 修订版本：1.0
- 创建日期：2026-04-17

---

## 1. 背景与问题域

星静（Xingjing）是运行在 harnesswork（OpenWork）平台之上的 AI 驱动研发工具。独立开发者（Solo 模式）每天通过 Agent/Skill 完成需求分析、代码编写、测试、发布等工作，但**目前缺乏可量化的度量体系**，开发者无法回答以下问题：

- 过去 7 天调用了多少次 AI Agent？成功率如何？
- 哪个 Agent 是我最频繁使用的？哪个 Skill 产出最多？
- AI 到底帮我节省（执行）了多少时间？

**根本原因**：OpenWork 审计日志（`audit.jsonl`）目前只记录 workspace 系统操作（create/rename/delete/config），不记录 AI Session/Agent 调用事件。Server 端也没有允许前端自由写入审计事件的端点。

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | callAgent 完成时写入 `agent.complete` 审计事件 | P0 |
| FR-02 | callAgent 失败时写入 `agent.error` 审计事件 | P0 |
| FR-03 | 新建 `/solo/ai-metrics` 页面展示效能指标 | P0 |
| FR-04 | 概览卡片：AI 调用次数、成功率、累计执行时长、最活跃 Agent | P0 |
| FR-05 | 趋势对比：与上一时间窗口的百分比变化 | P0 |
| FR-06 | 每日 AI 活跃度折线图、Agent 调用分布饼图 | P0 |
| FR-07 | Agent 效能详情表格（各 Agent 调用次数/成功率/耗时） | P0 |
| FR-08 | Skill 调用排行 Top 10 | P1 |
| FR-09 | 会话完成率 + Agent 平均响应耗时 | P1 |
| FR-10 | 时间窗口切换（7天/30天/全部），纯前端过滤 | P0 |
| FR-11 | OpenWork 未连接时降级展示 Mock 演示数据 | P0 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 服务端变更 | 仅新增 POST /workspace/:id/audit 端点（~20 行），不改变 AuditEntry 类型 |
| 前端框架 | SolidJS（`createSignal`/`createMemo`），复用 ECharts、themeColors、chartColors |
| 数据来源 | 纯审计日志驱动，零额外 API |
| 版本隔离 | 仅改动 Solo 版路由和菜单，不影响团队版 |
| 审计安全 | POST 端点通过 `ALLOWED_AUDIT_PREFIXES` 白名单限制写入事件类型 |

### 2.3 不在范围内

- 团队版度量（另立 SDD）
- Prometheus/Grafana 集成
- xingjing-server metrics API 实装
- Agent Logger（`agent-logger.ts`）重构或替换
- AuditEntry 类型扩展

---

## 3. 系统架构

### 3.1 整体数据流

```
用户触发 AI 搭档
       │
       ▼
app-store.tsx: callAgent()
       │ onDone → POST /workspace/:id/audit { "agent.complete", agentId, summary }
       │ onError → POST /workspace/:id/audit { "agent.error", agentId, summary }
       ▼
OpenWork Server: recordAudit() → JSONL 追加写入
       │
       ▼
~/.openwork/openwork-server/audit/{workspaceId}.jsonl
       │
       ▼
AI 效能页面 onMount: GET /workspace/:id/audit?limit=500
       │
       ▼
metrics-engine.ts: computeMetrics(entries, window)
       │
       ▼
页面渲染：概览卡片 + ECharts 图表 + 效能表格
```

### 3.2 降级策略

| 场景 | 行为 |
|------|------|
| OpenWork 已连接，审计日志有 AI 事件 | 正常计算展示 |
| OpenWork 已连接，审计日志无 AI 事件 | 显示空状态引导 |
| OpenWork 未连接 | `generateMockAuditEntries()` 生成演示数据，标注「演示数据」标签 |
| 审计写入失败（POST 端点异常） | 静默失败（try/catch），不影响主流程 |

---

## 4. API 设计

### 4.1 新增：POST /workspace/:id/audit

**端点：** `POST /workspace/:id/audit`  
**认证：** `"client"` scope  
**用途：** 允许前端写入 agent/skill/session 类审计事件

**请求体：**
```json
{
  "action": "agent.complete",
  "target": "product-brain",
  "summary": "AI产品搭档|duration:12500|tokens:3500|model:deepseek-chat"
}
```

**响应：**
- `201 Created`: `{ "ok": true }`
- `400 Bad Request`: action 或 target 缺失
- `403 Forbidden`: action 前缀不在白名单

**安全白名单：**
```typescript
const ALLOWED_AUDIT_PREFIXES = ["agent.", "skill.", "session."];
```

### 4.2 修改：GET /workspace/:id/audit

将 `Math.min(parsed, 200)` 改为 `Math.min(parsed, 1000)`，支持 AI 效能页面请求 500 条。

### 4.3 新增：Client recordAudit 方法

在 `openwork-server.ts` `createOpenworkServerClient()` 中添加：

```typescript
recordAudit: (workspaceId: string, entry: { action: string; target: string; summary: string }) =>
  requestJson<{ ok: boolean }>(baseUrl, `/workspace/${workspaceId}/audit`, {
    token, hostToken, method: 'POST', body: entry,  // body 为对象，requestJson 内部 JSON.stringify
  }),
```

---

## 5. 审计事件规格

### 5.1 Action 命名约定

所有事件使用 `<entity>.<verb>` 格式：

| action | target | summary 格式 |
|--------|--------|--------------|
| `agent.complete` | agent ID（如 `product-brain`） | `{agentName}\|duration:{ms}\|tokens:{n}\|model:{modelID}` |
| `agent.error` | agent ID | `{agentName}\|error:{reason}\|model:{modelID}` |
| `skill.invoke` | skill 名称 | `{description}\|duration:{ms}` |
| `session.create` | session ID | `{title}\|agent:{agentId}` |
| `session.complete` | session ID | `{title}\|duration:{ms}\|messages:{n}` |
| `session.error` | session ID | `{title}\|error:{reason}` |

> **设计说明**：不记录 `agent.start` 事件，`agent.complete/error` 已包含全部所需信息，避免双倍写入开销。

### 5.2 Summary 格式

`|` 分隔的 key:value 对，第一段为人类可读描述：

```
AI产品搭档|duration:12500|tokens:3500|model:deepseek-chat
```

解析由 `audit-helpers.ts` 的 `parseSummary()` 负责；构建由 `buildSummary()` 负责。

---

## 6. 数据模型

### 6.1 AuditRow（计算引擎输入）

```typescript
interface AuditRow {
  action: string;    // agent.complete / agent.error / skill.invoke / session.*
  target: string;    // agent ID / skill 名称 / session ID
  summary: string;   // pipe 分隔的 key:value 元数据
  timestamp: number; // Unix 毫秒时间戳
}
```

### 6.2 MetricsResult（计算引擎输出）

```typescript
interface MetricsResult {
  // 概览（4 张卡片）
  totalAgentCalls: number;
  totalSuccessRate: number;         // 0~1
  totalWorkTimeMs: number;          // agent.complete 的 duration 之和
  mostActiveAgent: { name: string; count: number } | null;

  // 图表数据
  dailyActivity: DailyActivity[];   // 按天分组
  agentMetrics: AgentMetric[];      // 按 agent 分组，按 callCount 降序
  skillRanking: SkillMetric[];      // 按 invokeCount 降序

  // 质量指标
  avgSessionDurationMs: number;
  sessionCompletionRate: number;    // 0~1

  // 趋势（与前一时间窗口对比，百分比变化）
  trends: {
    callsTrend: number;     // +20 = 增长 20%
    successTrend: number;
    workTimeTrend: number;
  };
}
```

### 6.3 TimeWindow

```typescript
type TimeWindow = 7 | 30 | 'all';
// window='all' 时趋势对比基于最近 30 天 vs 更早 30 天
```

---

## 7. 组件规格

### 7.1 页面文件

```
pages/solo/ai-metrics/
  └── index.tsx        # 页面容器 + 所有子组件（内联，超 500 行时拆分到 components/）
```

### 7.2 页面布局

```
┌────────────────────────────────────────────────────────┐
│  AI 效能中心                           [7天|30天|全部]  │
├────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ AI调用   │ │ 成功率   │ │ 执行时长  │ │ 最活跃  │  │
│  │ 128次    │ │ 96.5%    │ │ 12.5小时  │ │ AI开发  │  │
│  │ ↑+20%    │ │ ↑+1.2%   │ │ ↑+35%    │ │ (52次)  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │ 每日 AI 活跃度（折线图） │ │ Agent 调用分布（饼图）│  │
│  └─────────────────────────┘ └──────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 各 Agent 效能详情（表格）                          │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │ Skill 调用排行 Top 10    │ │ 会话完成率 + 响应耗时 │  │
│  └─────────────────────────┘ └──────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 7.3 子组件清单

| 组件 | 职责 |
|------|------|
| `AiMetricsPage` | 页面容器，管理 `window` 状态，加载审计数据，调用 `computeMetrics` |
| `MetricCard` | 概览卡片（数字 + 趋势箭头 + 变化百分比） |
| `TrendBadge` | 趋势标志（+N%/-N%），绿色/红色/灰色 |
| `Card` | 通用容器卡片（标题 + 内容插槽） |
| `DailyActivityChart` | 每日活跃度折线图（ECharts） |
| `AgentDistributionChart` | Agent 调用分布饼图（ECharts） |
| `AgentPerformanceTable` | Agent 效能详情表格 |
| `SkillRankingList` | Skill 调用排行列表 |
| `SessionQualityPanel` | 会话完成率 + Agent 平均响应耗时柱状图 |

### 7.4 数据加载策略

```typescript
onMount(async () => {
  if (openworkStatus() === 'connected') {
    const logs = await actions.listAudit(500);   // GET limit=500
    const aiRows = logs.filter(e =>
      e.action.startsWith('agent.') ||
      e.action.startsWith('skill.') ||
      e.action.startsWith('session.')
    );
    if (aiRows.length > 0) { setEntries(aiRows); return; }
  }
  setEntries(generateMockAuditEntries(30));       // Mock 降级
  setIsMock(true);
});

// 时间窗口切换：纯前端过滤，无需重新请求
const metrics = createMemo(() => computeMetrics(entries(), window()));
```

---

## 8. 服务层规格

### 8.1 audit-helpers.ts

```typescript
// 解析
parseSummary(summary: string): ParsedSummary
// 构建
buildSummary(label: string, meta: Record<string, string | number>): string
```

### 8.2 metrics-engine.ts

```typescript
computeMetrics(entries: AuditRow[], window: TimeWindow): MetricsResult
```

- `window=7`：过滤最近 7 天；趋势对比前 7 天
- `window=30`：过滤最近 30 天；趋势对比前 30 天
- `window='all'`：不过滤；趋势对比最近 30 天 vs 更早 30 天

---

## 9. Store 集成

### 9.1 XingjingOpenworkContext（app-store.tsx）

新增可选方法：
```typescript
recordAudit?: (workspaceId: string, entry: { action: string; target: string; summary: string }) => Promise<unknown>;
```

### 9.2 actions（app-store.tsx）

新增 `recordAudit` action，封装静默失败：
```typescript
recordAudit: async (entry) => {
  const wsId = resolvedWorkspaceId();
  if (!wsId || !props.openworkCtx?.recordAudit) return;
  try { await props.openworkCtx.recordAudit(wsId, entry); } catch { /* silent */ }
}
```

### 9.3 callAgent 审计集成（app-store.tsx）

在现有 `appendAgentLog` 调用后添加，**不阻塞主流程**：

```typescript
// onDone
void actions.recordAudit({
  action: 'agent.complete',
  target: opts.title ?? 'agent',
  summary: buildSummary(opts.title ?? productName, {
    duration: Date.now() - start,
    tokens: text.length,
    model: model?.modelID ?? llmCfg.modelID ?? '',
  }),
});

// onError / catch
void actions.recordAudit({
  action: 'agent.error',
  target: opts.title ?? 'agent',
  summary: buildSummary(opts.title ?? productName, {
    error: errMsg.slice(0, 100),
    model: model?.modelID ?? llmCfg.modelID ?? '',
  }),
});
```

---

## 10. 路由与导航

### 10.1 路由注册（xingjing-native.tsx）

```typescript
// import
const SoloAiMetrics = lazy(() => import('../xingjing/pages/solo/ai-metrics'));
// 路由
<Route path="/solo/ai-metrics" component={SoloAiMetrics} />
```

完整 URL：`/xingjing-solid/solo/ai-metrics`

### 10.2 侧边栏菜单（main-layout.tsx）

在 `soloMenuItems` 的 `/solo/agent-workshop` 与 `/solo/settings` 之间插入：

```typescript
{ key: '/solo/ai-metrics', iconFn: () => <Activity size={16} />, label: 'AI效能' },
```

图标：`Activity`（来自 `lucide-solid`）

---

## 11. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 计算 500 条 entries 的 `computeMetrics` < 50ms |
| 可用性 | 审计写入失败不影响 Agent 调用主流程 |
| 降级 | OpenWork 未连接时页面始终可用（Mock 数据） |
| 安全 | POST 端点限制写入前缀，防止伪造系统级审计事件 |
| 扩展性 | `MetricsResult` 预留 `groupBy` 参数位，支持未来团队版复用 |

---

## 12. 实现文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `apps/server/src/server.ts` | Modify | 新增 POST 端点（~20 行）+ GET limit 1000 |
| `apps/app/src/app/lib/openwork-server.ts` | Modify | 新增 recordAudit 客户端方法 |
| `apps/app/src/app/xingjing/services/audit-helpers.ts` | Create | parseSummary / buildSummary |
| `apps/app/src/app/xingjing/services/metrics-engine.ts` | Create | computeMetrics 引擎 |
| `apps/app/src/app/xingjing/mock/ai-metrics.ts` | Create | generateMockAuditEntries |
| `apps/app/src/app/xingjing/stores/app-store.tsx` | Modify | recordAudit 接口/action + callAgent 集成 |
| `apps/app/src/app/pages/xingjing-native.tsx` | Modify | 路由注册 + context 桥接 |
| `apps/app/src/app/xingjing/components/layouts/main-layout.tsx` | Modify | soloMenuItems 新增菜单 |
| `apps/app/src/app/xingjing/pages/solo/ai-metrics/index.tsx` | Create | AI 效能中心页面 |

---

## 13. 风险与缓解

| 风险 | 等级 | 缓解方案 |
|------|------|---------|
| 审计日志写入量大影响磁盘 | 低 | 每次 callAgent 仅 1 条记录（~200 字节），1000 次调用 < 200KB |
| GET limit=1000 响应体过大 | 低 | JSON 解析 1000 条 < 500KB，前端可承受 |
| Mock 数据随机导致测试不稳定 | 低 | Mock 仅用于演示，不参与自动化测试 |
| callAgent opts.title 为空 | 中 | 兜底使用 `productName`，target 不能为空但不影响功能 |
