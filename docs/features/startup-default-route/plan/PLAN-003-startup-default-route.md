---
meta:
  id: PLAN-003-startup-default-route
  title: 启动默认路由至模式选择页
  status: draft
  author: tech-lead
  source_prd: [PRD-002-dual-mode-workspace]
  source_sdd: [SDD-003-startup-default-route]
  specs: [MODULE-003]
  sprint: Sprint-01-W15
  created: "2026-04-08"
  updated: "2026-04-08"
---

# PLAN-003 启动默认路由至模式选择页

## 概述

本迭代计划覆盖 F003（startup-default-route）特性的全部交付，对应 PRD-002 中 FR-08 的行为调整。  
变更范围极小（2 个文件），1 个 TASK 即可完成全部实现。

## 里程碑

| 里程碑 | 内容 | 目标 |
|-------|------|------|
| M1 | FR-08 行为调整上线 | 冷启动默认进入 `/mode-select`，高亮上次所选 |

## TASK 列表与依赖关系

```
Wave 0（无前置依赖，可立即执行）
└── TASK-003-01：冷启动路由重定向 + 模式选择高亮（entry.tsx + mode-select.tsx）
```

| TASK | 标题 | 工作量 | 影响文件 | 依赖 |
|------|------|--------|---------|------|
| TASK-003-01 | 冷启动默认路由 + 模式高亮 | 0.5d | `entry.tsx`, `mode-select.tsx` | 无 |

## 工作量估算

| 类型 | 估算 |
|------|------|
| 开发 | 0.5d |
| 合计 | 0.5d |

## 交付规范

- 分支：`feature/TASK-003-01-startup-default-route`
- Worktree：`../.worktrees/TASK-003-01`
- 合入策略：squash merge 回 main
- 门控：代码阶段需人工 approve（code review）
