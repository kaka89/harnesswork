# harnesswork 文档索引（功能地图）

> 本文件是 harnesswork 项目文档体系的主入口，提供功能全景图、文档状态总览和代码目录对照表。
> 最后更新：2026-04-15

---

## 一、项目概览

harnesswork 是基于 OpenWork fork 的工程客户端，在 OpenWork AI 编码体验之上扩展了星静（Xingjing）全链路工程驾驶舱。核心价值：

- **双模式工作区**：openwork 原始模式 + harnesswork 工程驾驶舱自由切换
- **AI 驱动研发**：Autopilot 两阶段编排 + 多 Agent 并发执行
- **知识融合**：三源知识（行为/私有/工作空间文档）统一检索与注入
- **全链路覆盖**：产品 → 研发 → 发布&运维 → 运营四个节点

---

## 二、功能全景图

### 2.1 基础平台（继承自 OpenWork）

| 功能模块 | PRD | SDD | 状态 |
|---------|-----|-----|------|
| Host 模式（本地 OpenCode 运行时） | [PRD-001 FR-01](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |
| Client 模式（远程连接） | [PRD-001 FR-02](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |
| Session 管理 | [PRD-001 FR-03](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |
| 实时 SSE 流 | [PRD-001 FR-04](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |
| 权限审批 | [PRD-001 FR-06](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |
| Skills 管理 | [PRD-001 FR-07](product/prd/PRD-001-core-product.md) | [SDD-001](product/architecture/SDD-001-core-architecture.md) | 已交付 |

### 2.2 星静扩展（Xingjing）

| 功能模块 | PRD | SDD | Feature Doc | 状态 |
|---------|-----|-----|-------------|------|
| 双模式工作区 | [PRD-002](product/prd/PRD-002-dual-mode-workspace.md) | — | [dual-mode-workspace](features/dual-mode-workspace/dual-mode-workspace.md) | 已交付 |
| 默认启动路由 | [PRD-002 FR-08](product/prd/PRD-002-dual-mode-workspace.md) | — | [startup-default-route](features/startup-default-route/startup-default-route.md) | 草稿 |
| openwork 返回按钮 | [PRD-002 FR-10](product/prd/PRD-002-dual-mode-workspace.md) | — | [openwork-back-button](features/openwork-back-button/openwork-back-button.md) | 已发布 |
| 主题自适应 | [PRD-002 FR-11](product/prd/PRD-002-dual-mode-workspace.md) | — | [theme-aware-ui](features/theme-aware-ui/plan/PLAN-005-theme-aware-ui.md) | 已交付 |
| 工作空间文件树 | [PRD-002 FR-04](product/prd/PRD-002-dual-mode-workspace.md) | — | [workspace-file-tree](features/workspace-file-tree/workspace-file-tree.md) | 已交付 |
| Solo 产品管理 | [PRD-003 FR-01~02](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [solo-product-management](features/solo-product-management/solo-product-management.md) | 已实现 |
| AI 对话系统 | [PRD-003 FR-03](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [ai-chat-system](features/ai-chat-system/ai-chat-system.md) | 已实现 |
| Autopilot 自动化 | [PRD-003 FR-04](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [autopilot-workflow](features/autopilot-workflow/autopilot-workflow.md) | 已实现 |
| Agent 工坊 | [PRD-003 FR-05](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [agent-workshop](features/agent-workshop/agent-workshop.md) | 已实现 |
| 知识系统 | [PRD-003 FR-06](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [knowledge-system](features/knowledge-system/knowledge-system.md) | 已实现 |
| 记忆能力 | [PRD-003 FR-06](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [memory-capability](features/memory-capability/memory-capability.md) | 进行中 |
| 主布局与导航 | [PRD-003 FR-07](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [main-layout-navigation](features/main-layout-navigation/main-layout-navigation.md) | 已实现 |
| API 集成层 | [PRD-003 FR-10](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | 已实现 |
| 认证服务 | [PRD-003 FR-08](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | — | 已实现 |
| 流水线与调度 | [PRD-003 FR-09](product/prd/PRD-003-xingjing-solo.md) | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | — | 已实现 |

---

## 三、文档体系结构

```
docs/
├── INDEX.md                              ← 本文件（功能地图与文档索引）
├── overview.md                           ← 项目概览与文档导航
├── product/                              ← 活文档区（产品真相）
│   ├── prd/
│   │   ├── PRD-001-core-product.md       ← OpenWork 核心产品能力
│   │   ├── PRD-002-dual-mode-workspace.md← 双模式工作区
│   │   └── PRD-003-xingjing-solo.md      ← 星静独立版产品能力
│   ├── architecture/
│   │   ├── SDD-001-core-architecture.md  ← OpenWork 核心架构
│   │   └── SDD-002-xingjing-extension.md ← 星静扩展架构
│   └── contracts/                        ← API 契约（待补充）
├── features/                             ← 特性文档区
│   ├── dual-mode-workspace/              ← 双模式工作区（已交付）
│   ├── startup-default-route/            ← 默认启动路由（草稿）
│   ├── openwork-back-button/             ← openwork 返回按钮（已发布）
│   ├── theme-aware-ui/                   ← 主题自适应（已交付）
│   ├── workspace-file-tree/              ← 工作空间文件树（已交付）
│   ├── memory-capability/                ← 记忆能力（进行中）
│   ├── solo-product-management/          ← Solo 产品管理（已实现）
│   ├── ai-chat-system/                   ← AI 对话系统（已实现）
│   ├── autopilot-workflow/               ← Autopilot 自动化（已实现）
│   ├── agent-workshop/                   ← Agent 工坊（已实现）
│   ├── knowledge-system/                 ← 知识系统（已实现）
│   ├── api-integration-layer/            ← API 集成层（已实现）
│   └── main-layout-navigation/           ← 主布局与导航（已实现）
├── delivery/                             ← 交付文档区
│   ├── plan/_index.yaml                  ← 迭代计划台账
│   └── task/_index.yaml                  ← 开发任务台账
├── ops/runbook/                          ← 运维手册（待补充）
└── superpowers/                          ← 超级能力特性
    ├── plans/                            ← 6 个实施计划
    └── specs/                            ← 5 个技术设计
```

---

## 四、代码目录与文档对照表

以下为 `apps/app/src/app/xingjing/` 目录下各模块与文档的映射：

| 代码目录/文件 | 文档映射 | 说明 |
|-------------|---------|------|
| `api/client.ts` | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | HTTP 客户端封装 |
| `api/index.ts` | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | 8 个 API 端点定义 |
| `api/types.ts` | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | 共享类型定义 |
| `hooks/useApi.ts` | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | API/Mock 降级 Hook |
| `components/ai/ai-chat-drawer.tsx` | [ai-chat-system](features/ai-chat-system/ai-chat-system.md) | AI 对话抽屉 |
| `components/autopilot/*` | [autopilot-workflow](features/autopilot-workflow/autopilot-workflow.md) | Autopilot 组件集 |
| `components/layouts/main-layout.tsx` | [main-layout-navigation](features/main-layout-navigation/main-layout-navigation.md) | 主布局 |
| `components/product/*` | [solo-product-management](features/solo-product-management/solo-product-management.md) | 产品管理组件 |
| `services/product-store.ts` | [solo-product-management](features/solo-product-management/solo-product-management.md) | 产品注册表 |
| `services/product-dir-structure.ts` | [solo-product-management](features/solo-product-management/solo-product-management.md) | 目录结构模板 |
| `services/opencode-client.ts` | [ai-chat-system](features/ai-chat-system/ai-chat-system.md) | OpenCode 客户端 |
| `services/chat-session-store.ts` | [ai-chat-system](features/ai-chat-system/ai-chat-system.md) | 聊天会话存储 |
| `services/autopilot-executor.ts` | [autopilot-workflow](features/autopilot-workflow/autopilot-workflow.md) | Autopilot 执行器 |
| `services/agent-registry.ts` | [agent-workshop](features/agent-workshop/agent-workshop.md) | Agent 注册表 |
| `services/agent-logger.ts` | [agent-workshop](features/agent-workshop/agent-workshop.md) | Agent 日志 |
| `services/knowledge-index.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识索引 |
| `services/knowledge-retrieval.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识检索 |
| `services/knowledge-scanner.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识扫描 |
| `services/knowledge-health.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识健康度 |
| `services/knowledge-sink.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识沉淀 |
| `services/knowledge-behavior.ts` | [knowledge-system](features/knowledge-system/knowledge-system.md) | 知识行为分析 |
| `services/memory-store.ts` | [memory-capability](features/memory-capability/memory-capability.md) | 记忆存储 |
| `services/memory-recall.ts` | [memory-capability](features/memory-capability/memory-capability.md) | 记忆回忆 |
| `services/auth-service.ts` | [PRD-003 FR-08](product/prd/PRD-003-xingjing-solo.md) | 认证服务 |
| `services/pipeline-config.ts` | [PRD-003 FR-09](product/prd/PRD-003-xingjing-solo.md) | 流水线配置 |
| `services/pipeline-executor.ts` | [PRD-003 FR-09](product/prd/PRD-003-xingjing-solo.md) | 流水线执行 |
| `services/scheduler-client.ts` | [PRD-003 FR-09](product/prd/PRD-003-xingjing-solo.md) | 定时调度 |
| `services/file-store.ts` | [SDD-002](product/architecture/SDD-002-xingjing-extension.md) | YAML/JSON 读写 |
| `mock/*` (14 个文件) | [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | Mock 数据层 |
| `pages/solo/*` | [PRD-003](product/prd/PRD-003-xingjing-solo.md) | Solo 模式页面 |
| `pages/agent-workshop/*` | [agent-workshop](features/agent-workshop/agent-workshop.md) | Agent 工坊页面 |

---

## 五、文档状态总览

| 状态 | 数量 | 文档列表 |
|------|------|---------|
| approved（已批准） | 3 | PRD-001, PRD-002, SDD-001 |
| delivered（已交付） | 3 | dual-mode-workspace, theme-aware-ui, workspace-file-tree |
| released（已发布） | 1 | openwork-back-button |
| in-progress（进行中） | 1 | memory-capability |
| draft（草稿） | 1 | startup-default-route |
| 新建（本次补齐） | 9 | PRD-003, SDD-002, 7 个 feature docs |

---

## 六、快速导航

- **项目概览** → [overview.md](overview.md)
- **产品需求** → [product/prd/](product/prd/)
- **技术架构** → [product/architecture/](product/architecture/)
- **特性文档** → [features/](features/)
- **交付计划** → [delivery/plan/_index.yaml](delivery/plan/_index.yaml)
- **开发任务** → [delivery/task/_index.yaml](delivery/task/_index.yaml)
- **超级能力** → [superpowers/](superpowers/)
