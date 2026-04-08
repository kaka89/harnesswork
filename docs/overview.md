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

### product/ — 活文档区（产品真相）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| PRD | `docs/product/prd/` | 产品需求文档（活文档） |
| SDD | `docs/product/architecture/` | 技术架构设计文档（活文档） |
| CONTRACTS | `docs/product/contracts/` | 对外协议文档：API 规格 + OpenAPI + 事件契约（活文档） |

### features/ — 特性文档区（决策、分析 & 特性聚合视图）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| 特性文档 | `docs/features/{feature-name}/{feature-name}.md` | 特性需求，含关键决策和评审日志 |
| Benchmark | `docs/features/benchmark/` | 竞品对标与 GAP 分析 |

### delivery/ — 交付文档区（执行态）

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| PLAN | `docs/delivery/plan/` | 迭代交付计划 |
| TASK | `docs/delivery/task/` | 开发执行任务 |

### ops/ — 运维文档区

| 文档类型 | 路径 | 说明 |
|---------|------|------|
| Runbook | `docs/ops/runbook/` | 运维手册 |
