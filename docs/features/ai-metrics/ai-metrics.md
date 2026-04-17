---
feature: ai-metrics
status: planned
sdd: SDD-006-ai-metrics-solo
plan: 2026-04-17-agent-skill-metrics
created: "2026-04-17"
---

# AI 效能中心（Solo）

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F015 |
| 状态 | planned |
| 目标版本 | Solo 独立版 |
| 关联 SDD | [SDD-006](spec/SDD-006-ai-metrics-solo.md) |
| 实现计划 | [2026-04-17-agent-skill-metrics](../../superpowers/plans/2026-04-17-agent-skill-metrics.md) |
| 设计 Spec | [2026-04-17-agent-skill-metrics-design](../../superpowers/specs/2026-04-17-agent-skill-metrics-design.md) |
| 创建日期 | 2026-04-17 |

## 特性描述

为星静独立版（Solo）构建 AI 搭档效能度量体系，通过 OpenWork 审计日志记录每次 Agent/Skill 调用事件，前端计算并展示「AI 效能中心」页面，帮助独立开发者量化 AI 工具的实际产能贡献。

## 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| audit-helpers | `services/audit-helpers.ts` | Summary 字段解析/构建工具 |
| metrics-engine | `services/metrics-engine.ts` | 前端度量计算引擎 |
| ai-metrics mock | `mock/ai-metrics.ts` | 演示数据生成器 |
| AI 效能页面 | `pages/solo/ai-metrics/index.tsx` | 效能中心主页面 |
| Server POST 端点 | `apps/server/src/server.ts` | 审计事件写入 API |
| Client recordAudit | `lib/openwork-server.ts` | 写入方法 |

## 关键决策

| 编号 | 决策 | 结论 |
|------|------|------|
| D1 | 目标用户 | Solo 独立开发者 |
| D2 | 核心关注 | 产能为主 + 质量为辅 |
| D3 | 数据来源 | 审计日志驱动（前端计算） |
| D4 | 展示方式 | 新建独立页面 /solo/ai-metrics |
| D5 | 实现方案 | Action 编码（零服务端类型变更） |

## 验收标准

- [ ] 侧边栏出现「AI 效能」菜单，点击导航到 /solo/ai-metrics
- [ ] 概览卡片展示 AI 调用次数、成功率、累计执行时长、最活跃 Agent（含趋势箭头）
- [ ] 每日活跃度折线图正常渲染
- [ ] Agent 调用分布饼图正常渲染
- [ ] Agent 效能详情表格展示各 Agent 的调用次数、成功率、平均耗时
- [ ] Skill 调用排行 Top 10 展示
- [ ] 会话完成率 + Agent 平均响应耗时图表展示
- [ ] 时间窗口切换（7天/30天/全部）数据实时更新（无需重新请求）
- [ ] OpenWork 未连接时展示 Mock 演示数据并标注「演示数据」
- [ ] callAgent 完成/失败时自动写入审计日志
