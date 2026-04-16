---
feature: api-integration-layer
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# API 集成层

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F012 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-10](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 创建日期 | 2026-04-15 |

## 特性描述

星静前端与后端之间的统一数据通信层。包含 HTTP 客户端封装、8 个业务 API 端点模块、SolidJS 数据获取 Hook（含 API/Mock 自动降级），以及 14 个 Mock 数据文件全覆盖。设计目标是前后端可独立开发，后端不可用时自动切换到 Mock 数据，UI 无感知。

## 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| HTTP 客户端 | `api/client.ts` | 统一 fetch 封装，自动 Bearer token 注入，错误处理 |
| API 端点 | `api/index.ts` | 8 个 API 模块定义（products/prds/tasks/backlog/sprints/knowledge/metrics/aiSessions） |
| 类型定义 | `api/types.ts` | 共享数据结构（Product, DoraMetrics, AiSession, Task 等） |
| useApi Hook | `hooks/useApi.ts` | API 优先 + Mock 自动降级，loading/error 状态管理 |
| Mock 数据层 | `mock/*.ts` (14 个文件) | 全覆盖业务场景的静态数据 |

## HTTP 客户端设计

```typescript
// api/client.ts
const api = {
  get<T>(path: string): Promise<T>,
  post<T>(path: string, body: unknown): Promise<T>,
  put<T>(path: string, body: unknown): Promise<T>,
  del(path: string): Promise<void>,
  patch<T>(path: string, body: unknown): Promise<T>,
};
```

特性：
- 自动注入 `Authorization: Bearer {token}`（从 auth-service 获取）
- 统一 JSON 序列化/反序列化
- 错误统一封装（HTTP 状态码 → Error 对象）
- BASE_URL 从环境变量或默认 `http://localhost:4100`

## API 端点模块

| 模块 | 端点前缀 | CRUD 操作 | 说明 |
|------|---------|----------|------|
| productsApi | `/api/products` | list / create / update / remove | 产品管理 |
| prdsApi | `/api/prds` | list / create / update / remove | PRD 文档管理 |
| tasksApi | `/api/tasks` | list / create / update / remove | 开发任务管理 |
| backlogApi | `/api/backlog` | list / create / update | 待办事项管理 |
| sprintsApi | `/api/sprints` | list / create / update | 迭代管理 |
| knowledgeApi | `/api/knowledge` | list / create / update | 知识文档管理 |
| metricsApi | `/api/metrics` | get / list | DORA 效能指标 |
| aiSessionsApi | `/api/ai-sessions` | list / create / get / poll | AI 会话管理（含轮询） |

## useApi Hook 降级机制

```typescript
function useApi<T>(
  apiFn: () => Promise<T>,     // API 调用函数
  fallbackData: T,              // Mock 降级数据
  options?: { immediate?: boolean }
): {
  data: Accessor<T>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  isUsingFallback: Accessor<boolean>;
  refetch: () => Promise<void>;
}
```

降级流程：
```
1. 调用 apiFn() 请求后端 API
   ├── 成功 → 返回真实数据，isUsingFallback = false
   └── 失败 → 返回 fallbackData，isUsingFallback = true
                  └── console.warn 记录降级日志
```

## Mock 数据覆盖

| Mock 文件 | 覆盖领域 | 说明 |
|----------|---------|------|
| `mock/autopilot.ts` | Autopilot Agent 定义与执行状态 | Agent 列表、执行历史 |
| `mock/knowledge.ts` | 五层分级知识体系 | 知识条目、分类、生命周期 |
| `mock/planning.ts` | 产品规划工坊 | 竞品分析、市场洞察、客户反馈 |
| `mock/tasks.ts` | 开发交付任务 | TASK 编号、估时、CI 状态、覆盖率 |
| `mock/sprint.ts` | 迭代中心 | Sprint 规划、Backlog、容量规划 |
| `mock/quality.ts` | 质量中心 | 通过率、缺陷分布 |
| `mock/releaseOps.ts` | 发布与运维 | 发布计划、灰度策略、巡检清单 |
| `mock/dora.ts` | DORA 效能指标 | 部署频率、变更前置时间、MTTR |
| `mock/contracts.ts` | API 契约 | OpenAPI 规格、模块规范 |
| `mock/prd.ts` | PRD 模板 | 产品需求文档结构 |
| `mock/sdd.ts` | SDD 模板 | 系统设计文档结构 |
| `mock/settings.ts` | 系统配置 | 偏好设置、主题配置 |
| `mock/agentWorkshop.ts` | Agent 工坊 | Agent 创建、技能编辑 |
| `mock/solo.ts` | 独立版专有 | 创业者模式特殊逻辑 |

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 降级策略 | useApi Hook 自动 API/Mock 切换 | 前后端可独立开发，UI 不阻塞 |
| D2 | Token 注入 | 自动从 auth-service 获取 | 统一认证，无需每个请求手动传 |
| D3 | Mock 覆盖度 | 14 个文件全覆盖 | 确保所有页面在无后端时可完整展示 |
| D4 | 错误处理 | 统一封装为 Error 对象 | 上层统一 catch，UI 统一 error 展示 |

## 验收标准

- [x] HTTP 客户端自动注入 Bearer token
- [x] 8 个 API 模块完整定义
- [x] useApi Hook 在 API 不可用时自动降级到 Mock
- [x] isUsingFallback 状态正确标记
- [x] 14 个 Mock 文件覆盖所有业务场景
- [x] loading/error 状态正确管理
