# Agent/Skill 效能度量设计

## 概述

为星静独立版（Solo）构建 AI 搭档效能度量体系。基于 OpenWork 审计日志，前端计算 Agent/Skill 的产能和质量指标，新建独立的「AI 效能中心」页面。Server 端仅需新增一个审计写入端点（~15 行），其余全部在前端完成。

## 决策记录

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 目标用户 | 独立开发者（Solo） | 与当前开发重心一致，设计上预留团队版扩展点 |
| D2 | 核心关注 | 产能为主 + 质量为辅 | Solo 用户最关心 AI 帮了多少忙 |
| D3 | 数据来源 | 审计日志驱动 | 仅需 Server 端新增 1 个写入端点（~15 行），所有指标由前端从审计日志计算 |
| D4 | 展示方式 | 新建独立页面 | Solo 版首个效能类页面，专注 AI 搭档产能维度（现有 Dashboard 仅在团队版路由中） |
| D5 | 实现方案 | Action 编码（方案 A） | 零类型变更，通过结构化 action 命名 + summary 编码元数据 |

---

## 1. 审计事件分类体系

### 1.1 Action 命名约定

所有 Agent/Skill 相关的审计事件使用 `<entity>.<verb>` 格式：

| action | target | summary 约定 | 示例 |
|--------|--------|-------------|------|
| `agent.complete` | agent ID | `{agentName}\|duration:{ms}\|tokens:{n}\|model:{modelID}` | `AI产品搭档\|duration:12500\|tokens:3500\|model:deepseek-chat` |
| `agent.error` | agent ID | `{agentName}\|error:{reason}\|model:{modelID}` | `AI开发搭档\|error:timeout\|model:deepseek-chat` |
| `skill.invoke` | skill name | `{description}\|duration:{ms}` | `PRD生成\|duration:8200` |
| `session.create` | session ID | `{title}\|agent:{agentId}` | `需求分析\|agent:product-brain` |
| `session.complete` | session ID | `{title}\|duration:{ms}\|messages:{n}` | `需求分析\|duration:45000\|messages:12` |
| `session.error` | session ID | `{title}\|error:{reason}` | `代码生成\|error:context_limit` |

> **设计说明**：不记录 `agent.start` 事件。`agent.complete` 和 `agent.error` 已包含所有度量所需信息（含 model），避免每次调用产生两条审计记录的写入开销。

### 1.2 Summary 解析规则

Summary 使用 `|` 分隔的 key:value 对，第一段为可读描述：

```typescript
// services/audit-helpers.ts
interface ParsedSummary {
  label: string;
  meta: Record<string, string>;
}

function parseSummary(summary: string): ParsedSummary {
  const parts = summary.split('|');
  const label = parts[0];
  const meta: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, ...rest] = parts[i].split(':');
    if (key) meta[key.trim()] = rest.join(':').trim();
  }
  return { label, meta };
}
```

### 1.3 Summary 构建辅助函数

```typescript
// services/audit-helpers.ts
function buildSummary(label: string, meta: Record<string, string | number>): string {
  const parts = [label];
  for (const [key, value] of Object.entries(meta)) {
    parts.push(`${key}:${value}`);
  }
  return parts.join('|');
}
```

---

## 2. 度量计算引擎

### 2.1 核心指标定义

**产能指标（主）：**

| 指标 | 计算方式 |
|------|---------|
| AI 调用总次数 | count(`agent.complete`) + count(`agent.error`) |
| AI 成功率 | count(`agent.complete`) / total |
| AI 累计执行时长 | sum(duration from `agent.complete` summary) |
| 每日 AI 活跃度 | 按天分组的 agent 事件数 |
| 各 Agent 调用分布 | 按 target 分组的 `agent.complete` 计数 |
| 各 Skill 调用排行 | 按 target 分组的 `skill.invoke` 计数 |
| 平均会话时长 | avg(duration from `session.complete` summary) |
| 最活跃 Agent | 调用次数最多的 agent target |

**质量指标（辅）：**

| 指标 | 计算方式 |
|------|---------|
| 会话完成率 | `session.complete` / (`session.complete` + `session.error`) |
| Agent 错误率 | `agent.error` / total, 按 agent 分组 |
| 平均响应耗时 | avg(duration) 按 agent 分组 |

### 2.2 MetricsResult 类型定义

```typescript
// services/metrics-engine.ts

interface AgentMetric {
  agentId: string;
  agentName: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

interface SkillMetric {
  skillName: string;
  invokeCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

interface DailyActivity {
  date: string;        // YYYY-MM-DD
  agentCalls: number;
  skillInvokes: number;
  sessions: number;
}

interface MetricsResult {
  // 概览
  totalAgentCalls: number;
  totalSuccessRate: number;
  totalWorkTimeMs: number;
  mostActiveAgent: { name: string; count: number } | null;

  // 产能详情
  dailyActivity: DailyActivity[];
  agentMetrics: AgentMetric[];
  skillRanking: SkillMetric[];
  avgSessionDurationMs: number;

  // 质量
  sessionCompletionRate: number;

  // 趋势（与前一个时间窗口对比）
  trends: {
    callsTrend: number;      // 百分比变化，如 +20 表示增长 20%
    successTrend: number;
    workTimeTrend: number;
  };
}
```

### 2.3 计算引擎入口

```typescript
// services/metrics-engine.ts

type TimeWindow = 7 | 30 | 'all';

function computeMetrics(
  entries: Array<{ action: string; target: string; summary: string; timestamp: number }>,
  window: TimeWindow
): MetricsResult {
  // 1. 按时间窗口过滤 entries
  // 2. 分类统计 agent.* / skill.* / session.* 事件
  // 3. 从 summary 解析 duration/tokens 等元数据
  // 4. 聚合计算各项指标
  // 5. 与前一个时间窗口对比计算趋势
  //    - window=7: 对比前 7 天 vs 更早 7 天
  //    - window=30: 对比前 30 天 vs 更早 30 天
  //    - window='all': 对比最近 30 天 vs 更早 30 天（趋势始终基于 30 天粒度）
  // ... 实现细节见实现计划
}
```

---

## 3. AI 效能页面

### 3.1 路由

- 相对路径：`/solo/ai-metrics`（完整 URL：`/xingjing-solid/solo/ai-metrics`）
- 文件：`pages/solo/ai-metrics/index.tsx`
- 侧边栏位置：添加到 `soloMenuItems` 的「自动驾驶」分组末尾，菜单名「AI 效能」

### 3.2 页面布局

```
┌──────────────────────────────────────────────────────────────────┐
│  AI 效能中心                                    [7天|30天|全部]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ AI调用    │  │ 成功率    │  │ 执行时长  │  │ 最活跃 Agent    │ │
│  │ 128 次   │  │ 96.5%    │  │ 12.5 小时 │  │ AI开发搭档 (52)  │ │
│  │ ↑+20%    │  │ ↑+1.2%   │  │ ↑+35%    │  │                  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐ │
│  │  每日 AI 活跃度（折线图）        │  │  Agent 调用分布（饼图） │ │
│  └─────────────────────────────────┘  └────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  各 Agent 效能详情（表格）                                    │ │
│  │  Agent名称  |  调用次数  |  成功率  |  平均耗时  |  总耗时    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Skill 调用排行 Top 10                                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐ │
│  │  会话完成率（质量指标）          │  │  Agent 平均响应耗时     │ │
│  └─────────────────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 组件拆分

当页面代码超过 500 行时，将 ECharts 图表组件拆分到 `pages/solo/ai-metrics/components/` 子目录。初始实现可先内联在主文件中，超过阈值时重构拆分。

| 组件 | 职责 |
|------|------|
| `AiMetricsPage` | 页面容器，管理时间窗口状态，调用 computeMetrics |
| `MetricCard` | 概览卡片（数字 + 趋势箭头 + 变化百分比） |
| `DailyActivityChart` | 每日活跃度折线图（ECharts） |
| `AgentDistributionChart` | Agent 调用分布饼图（ECharts） |
| `AgentPerformanceTable` | Agent 效能详情表格 |
| `SkillRankingList` | Skill 调用排行列表 |
| `SessionCompletionCard` | 会话完成率卡片 |
| `AgentResponseTimeChart` | Agent 平均响应耗时柱状图（ECharts） |

### 3.4 数据加载策略

- `onMount` 调用 `actions.listAudit(500)` 获取最近 500 条审计日志
- 用 `computeMetrics(entries, window)` 计算指标
- 时间窗口切换时重新计算（无需重新请求，纯前端过滤）
- 审计日志为空时显示空状态引导

> **数据量限制**：当前 GET 端点最大返回 200 条，本次实现将 GET 端点的 limit 上限提高到 1000（`Math.min(parsed, 1000)`），以支持更大的时间窗口。后续若数据量进一步增长，可新增 `offset` 分页参数。

### 3.5 样式规范

复用现有的 `themeColors` 和 `chartColors`，保持与 Dashboard 页面一致的驾驶舱风格。

---

## 4. 数据流架构

```
用户操作 AI 搭档
       │
       ▼
app-store.tsx: callAgent()
       │ 调用后: POST /workspace/:id/audit {"agent.complete", agentId, buildSummary(...)}
       │ 异常时: POST /workspace/:id/audit {"agent.error", agentId, buildSummary(...)}
       ▼
OpenWork Server: recordAudit() → JSONL 文件
       │
       ▼
~/.openwork/openwork-server/audit/{workspaceId}.jsonl
       │
       ▼
AI 效能页面: onMount → GET /workspace/:id/audit?limit=500
       │
       ▼
metrics-engine.ts: computeMetrics(entries, { days: 7|30|all })
       │
       ▼
页面渲染: 概览卡片 + ECharts 图表 + 效能表格
```

### 4.1 审计事件写入方式

**现状**：OpenWork Server 仅有 `GET /workspace/:id/audit` 端点（读取），没有 POST 端点。审计日志由 Server 端在 workspace 操作（create/rename/delete/config）时自动写入，不记录 AI session/agent 调用事件。

**解决方案：新增 POST /workspace/:id/audit 端点**

在 `harnesswork/apps/server/src/server.ts` 中新增一个路由（约 15 行代码），允许前端写入自定义审计条目：

```typescript
// server.ts — 新增（约 20 行）
const ALLOWED_AUDIT_PREFIXES = ["agent.", "skill.", "session."];

addRoute(routes, "POST", "/workspace/:id/audit", "client", async (ctx) => {
  const workspace = await resolveWorkspace(config, ctx.params.id);
  const body = await readJsonBody(ctx.request);
  const { action, target, summary } = body;
  if (!action || !target) return jsonResponse({ error: "action and target required" }, 400);
  // 安全限制：仅允许前端写入 agent.*/skill.*/session.* 前缀的事件
  if (!ALLOWED_AUDIT_PREFIXES.some(p => action.startsWith(p))) {
    return jsonResponse({ error: "action prefix not allowed" }, 403);
  }
  await recordAudit(workspace.path, {
    id: shortId(),
    workspaceId: workspace.id,
    actor: ctx.actor ?? { type: "host" },
    action,
    target,
    summary: summary ?? "",
    timestamp: Date.now(),
  });
  return jsonResponse({ ok: true }, 201);
});
```

前端 OpenWork Client 中新增对应的 `recordAudit` 方法：

```typescript
// openwork-server.ts — 新增
recordAudit: (workspaceId: string, entry: { action: string; target: string; summary: string }) =>
  requestJson(baseUrl, `/workspace/${workspaceId}/audit`, {
    token, hostToken, method: 'POST', body: JSON.stringify(entry),
  }),
```

然后在 `app-store.tsx` 的 `callAgent` 中调用此方法记录 Agent 调用事件。

> **注意**：这是唯一的 Server 端改动（约 20 行），且完全遵循现有 recordAudit 模式，不改变 AuditEntry 类型。POST 端点通过 `ALLOWED_AUDIT_PREFIXES` 白名单限制可写入的事件类型，防止伪造系统级审计事件。

### 4.2 降级策略

| 场景 | 行为 |
|------|------|
| OpenWork 已连接，审计日志有数据 | 正常计算展示 |
| OpenWork 已连接，审计日志为空 | 显示空状态引导 |
| OpenWork 未连接 | 使用 Mock 数据展示，标记「演示数据」 |

---

## 5. 实现范围

### IN（本次实现）

- `apps/server/src/server.ts` — 新增 POST /workspace/:id/audit 端点（~20 行，含前缀白名单验证），提高 GET 端点 limit 上限至 1000
- `apps/app/src/app/lib/openwork-server.ts` — 新增 recordAudit 客户端方法
- `apps/app/src/app/xingjing/services/audit-helpers.ts` — summary 解析/构建工具函数
- `apps/app/src/app/xingjing/services/metrics-engine.ts` — 度量计算引擎
- `apps/app/src/app/xingjing/pages/solo/ai-metrics/index.tsx` — AI 效能页面（含子组件）
- `apps/app/src/app/xingjing/mock/ai-metrics.ts` — AI 效能 Mock 数据
- `apps/app/src/app/xingjing/stores/app-store.tsx` — callAgent 中增加审计事件记录，新增 recordAudit action
- `apps/app/src/app/xingjing/components/layouts/main-layout.tsx` — soloMenuItems 新增「AI 效能」菜单项
- `apps/app/src/app/pages/xingjing-native.tsx` — 注册 `/solo/ai-metrics` 路由

### OUT（不在本次范围）

- Server 端 AuditEntry 类型变更（保持不变）
- 团队版度量
- Prometheus/Grafana 集成
- Agent Logger 重构
- xingjing-server metrics API 实装
- Skill 类型变更或 OpenCode 引擎层改动

---

## 6. 团队版扩展预留

虽然本次仅实现 Solo 版，但以下设计点已预留团队版扩展：

- `MetricsResult` 可增加 `groupBy: 'user' | 'team' | 'domain'` 参数
- `AuditEntry.actor` 已包含 `type` / `clientId` 字段，可区分不同用户
- 页面组件化设计，可在团队版中复用 `AgentPerformanceTable` 等组件
- 计算引擎与页面解耦，可独立被团队版调用
