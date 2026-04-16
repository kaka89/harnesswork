# harnesswork（OpenWork）

## 产品定位

harnesswork 是基于 [OpenWork](https://github.com/different-ai/openwork) fork 的工程客户端，OpenWork 是 Claude Code/Codex 桌面应用的开源替代品。本项目在 OpenWork 基础上，针对 Harness Engineering 工程规范进行定制扩展，提供面向工程团队的 AI 辅助交付驾驶舱能力。

## 业务目标

- 为工程师提供本地优先的 AI 编码辅助桌面客户端
- 通过 Skill/Plugin 机制支持可扩展的 AI 工作流
- 在 OpenWork 基础上叠加工程驾驶舱（Engineering Cockpit）能力
- 支持本地运行和远程服务器两种部署模式

## 系统边界

- **上游**：opencode CLI（AI 后端，由 OpenWork 管理）
- **下游**：Harness Engineering 文档体系（PRD/SDD/TASK 等）
- **基础设施**：Tauri（桌面壳层）、SolidJS（前端）、pnpm monorepo

## 技术栈

- 前端框架：SolidJS
- 桌面壳层：Tauri（Rust）
- 包管理：pnpm（workspace monorepo）
- 构建工具：turbo
- AI 运行时：opencode CLI（通过 openwork-server 托管）

## 文档导航

> **快速入口**：[INDEX.md](INDEX.md) — 功能地图与文档索引（包含所有功能模块到文档的映射）

### product/ — 活文档区（产品真相）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| PRD | `docs/product/prd/` | 产品需求文档（活文档） |
| | `PRD-001-core-product.md` | OpenWork 核心产品能力 |
| | `PRD-002-dual-mode-workspace.md` | 双模式工作区 |
| | `PRD-003-xingjing-solo.md` | **星静独立版产品能力** |
| SDD | `docs/product/architecture/` | 技术架构设计文档（活文档） |
| | `SDD-001-core-architecture.md` | OpenWork 核心架构 |
| | `SDD-002-xingjing-extension.md` | **星静扩展架构设计** |
| CONTRACTS | `docs/product/contracts/` | 对外协议文档：API 规格 + OpenAPI + 事件契约（活文档） |

### features/ — 特性文档区（决策、分析 & 特性聚合视图）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| 特性文档 | `docs/features/{feature-name}/{feature-name}.md` | 特性需求，含关键决策和评审日志 |
| Benchmark | `docs/features/benchmark/` | 竞品对标与 GAP 分析 |

**已有特性文档（含本次补齐）：**

| 特性 | 状态 | 说明 |
|------|------|------|
| [dual-mode-workspace](features/dual-mode-workspace/dual-mode-workspace.md) | 已交付 | 双模式工作区 |
| [startup-default-route](features/startup-default-route/startup-default-route.md) | 草稿 | 默认启动路由 |
| [openwork-back-button](features/openwork-back-button/openwork-back-button.md) | 已发布 | openwork 返回按钮 |
| [theme-aware-ui](features/theme-aware-ui/plan/PLAN-005-theme-aware-ui.md) | 已交付 | 主题自适应 |
| [workspace-file-tree](features/workspace-file-tree/workspace-file-tree.md) | 已交付 | 工作空间文件树 |
| [memory-capability](features/memory-capability/memory-capability.md) | 进行中 | 记忆能力 |
| [solo-product-management](features/solo-product-management/solo-product-management.md) | 已实现 | Solo 产品管理 |
| [ai-chat-system](features/ai-chat-system/ai-chat-system.md) | 已实现 | AI 对话系统 |
| [autopilot-workflow](features/autopilot-workflow/autopilot-workflow.md) | 已实现 | Autopilot 自动化 |
| [agent-workshop](features/agent-workshop/agent-workshop.md) | 已实现 | Agent 工坊 |
| [knowledge-system](features/knowledge-system/knowledge-system.md) | 已实现 | 知识系统 |
| [api-integration-layer](features/api-integration-layer/api-integration-layer.md) | 已实现 | API 集成层 |
| [main-layout-navigation](features/main-layout-navigation/main-layout-navigation.md) | 已实现 | 主布局与导航 |

### delivery/ — 交付文档区（执行态）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| PLAN | `docs/delivery/plan/` | 迭代交付计划 |
| TASK | `docs/delivery/task/` | 开发执行任务 |

### ops/ — 运维文档区

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| Runbook | `docs/ops/runbook/` | 运维手册 |

### superpowers/ — 超级能力特性

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| Plans | `docs/superpowers/plans/` | 6 个实施计划文档 |
| Specs | `docs/superpowers/specs/` | 5 个技术设计文档 |
