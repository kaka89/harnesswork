---
feature: dual-mode-workspace
status: delivered
prd: PRD-002-dual-mode-workspace
sdd: SDD-002-dual-mode-workspace
plan: PLAN-002-dual-mode-workspace
tasks: [TASK-002-01, TASK-002-02, TASK-002-03, TASK-002-04, TASK-002-05, TASK-002-06, TASK-002-07, TASK-002-08]
delivered: "2026-04-08"
---

# 双模式工作区特性

## 特性概述

新增模式选择入口页（`/mode-select`）和工程驾驶舱页（`/cockpit`），支持用户在 openwork 原始模式和 harnesswork 全链路工程驾驶舱之间灵活切换。

## 关联文档

- PRD：[PRD-002-dual-mode-workspace](../../product/prd/PRD-002-dual-mode-workspace.md)
- SDD：[SDD-002-dual-mode-workspace](../../product/architecture/SDD-002-dual-mode-workspace.md)
- MODULE：[MODULE-002-dual-mode-workspace](../../product/contracts/MODULE-002-dual-mode-workspace.md)
- PLAN：[PLAN-002-dual-mode-workspace](../../delivery/plan/PLAN-002-dual-mode-workspace.md)

## 关键决策

| 编号 | 决策 | 结论 |
|------|------|------|
| D1 | 路由策略 | 新增 `/mode-select`，不覆盖 `/` 根路由 |
| D2 | Tab 状态 | `createSignal` 局部管理，无全局 store |
| D3 | LocalStorage key | `harnesswork:mode-preference` |
| D4 | 文档树读取 | 通过 OpenWork server GET /docs/:path |
| D5 | 研发 Tab | 复用现有 SessionView，lazy 懒加载 |
| D6 | P2 Tab | P1 使用 IS_MOCK 静态数据占位 |

## 交付进度

| TASK | 标题 | 状态 |
|------|------|------|
| TASK-002-01 | 路由注册与基础框架 | ✅ done |
| TASK-002-02 | ModeSelectPage | ✅ done |
| TASK-002-03 | CockpitPage + CockpitTabNav | ✅ done |
| TASK-002-04 | ProductTab + 文档树 | ✅ done |
| TASK-002-05 | EngineeringTab | ✅ done |
| TASK-002-06 | Server /docs 端点 | ✅ done |
| TASK-002-07 | ReleaseTab Mock | ✅ done |
| TASK-002-08 | GrowthTab Mock | ✅ done |

## 验收标准

- [x] 应用启动后可路由到 `/mode-select`，页面居中展示两个选项
- [x] 点击"openwork 原始版本"，跳转到 `/`
- [x] 点击"harnesswork 工程驾驶舱"，跳转到 `/cockpit`
- [x] `/cockpit` 页面顶部显示 4 个 Tab（产品/研发/发布&运维/运营）
- [x] 点击产品 Tab，左侧显示文档结构树，点击节点右侧渲染文档
- [x] 点击研发 Tab，嵌入 SessionView（懒加载）
- [x] 点击发布&运维 Tab，显示 Mock 流水线/部署历史/环境健康/告警
- [x] 点击运营 Tab，显示 Mock DAU/留存/反馈
- [x] 用户模式偏好记录到 LocalStorage，刷新后保留
- [x] 驾驶舱顶部提供返回模式选择入口
