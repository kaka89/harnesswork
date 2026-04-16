---
feature: autopilot-workflow
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# Autopilot 自动化工作流

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F009 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-04](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 创建日期 | 2026-04-15 |

## 特性描述

星静的 AI 自动化工作流核心能力。采用两阶段编排架构：第一阶段由 Orchestrator 解析用户意图并生成任务分派计划（`<DISPATCH>` 格式），第二阶段将任务并发分派给多个专业 Agent 独立执行。支持 @mention 直接调用指定 Agent 跳过 Orchestrator。执行结果通过工件工作区可视化展示。

## 核心组件

| 组件 | 路径 | 职责 | 大小 |
|------|------|------|------|
| autopilot-executor | `services/autopilot-executor.ts` | 两阶段编排引擎，Agent 调度与执行 | ~450 行 |
| ArtifactWorkspace | `components/autopilot/artifact-workspace.tsx` | 工件工作区，展示执行结果 | 616 行 |
| PermissionDialog | `components/autopilot/permission-dialog.tsx` | 权限审批对话框 | 217 行 |
| MentionInput | `components/autopilot/mention-input.tsx` | @mention 输入组件 | 180 行 |
| ExpandableOverlay | `components/autopilot/expandable-overlay.tsx` | 可展开覆盖层 | 193 行 |
| Autopilot 页面 | `pages/solo/autopilot/index.tsx` | Solo Autopilot 主页面 | ~2200 行 |

## 两阶段编排架构

### 阶段一：Orchestrator 意图解析

用户输入目标文本后，Orchestrator Agent 根据 System Prompt 分析意图，生成结构化的任务分派计划：

```
<DISPATCH>
[
  { "agentId": "pm-agent", "task": "分析产品市场定位" },
  { "agentId": "eng-agent", "task": "评估技术可行性" },
  { "agentId": "growth-agent", "task": "制定增长策略" }
]
</DISPATCH>
```

### 阶段二：多 Agent 并发执行

解析 DISPATCH 计划后，并发调用各 Agent，每个 Agent 拥有独立的 OpenCode SSE session，结果实时流式更新到 UI。

### @mention 直接调用

用户输入 `@pm-agent 请分析市场` 时，跳过 Orchestrator，直接调用指定 Agent。

## 内置 Agent 集

### Solo 模式 Agent

| Agent ID | 名称 | 职责 |
|----------|------|------|
| pm-agent | 产品脑 | 需求分析、PRD 编写、用户故事拆解 |
| eng-agent | 工程脑 | 技术方案评估、SDD 编写、代码架构设计 |
| growth-agent | 增长脑 | 增长策略、运营数据分析、A/B 测试设计 |
| qa-agent | 质量脑 | 测试策略、质量指标分析、缺陷分析 |
| devops-agent | 运维脑 | CI/CD 流水线、部署策略、监控告警 |

### Team 模式 Agent

Team 模式在 Solo Agent 基础上增加团队协作相关 Agent（如架构评审、代码评审等）。

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 编排架构 | 两阶段（Orchestrator + Agent 并发） | 避免单点串行瓶颈，支持真正并发 |
| D2 | Agent 通信 | 每个 Agent 独立 OpenCode session | SSE 流独立，互不阻塞 |
| D3 | 降级策略 | OpenCode 不可用时 Mock 动画序列 | 保证 UI 可演示，前端开发不阻塞 |
| D4 | DISPATCH 格式 | JSON 数组包裹在 XML 标签中 | 便于从自由文本中提取结构化数据 |

## 行为规格

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 用户输入目标文本 | Orchestrator 分析意图，生成 DISPATCH 计划 |
| BH-02 | DISPATCH 计划生成后 | 并发调用各 Agent，UI 展示各 Agent 执行状态 |
| BH-03 | Agent 执行中 | SSE 流式更新，实时展示中间结果 |
| BH-04 | Agent 执行完成 | 结果展示在工件工作区 |
| BH-05 | @mention 输入 | 跳过 Orchestrator，直接调用指定 Agent |
| BH-06 | Agent 请求权限 | 弹出 PermissionDialog |
| BH-07 | OpenCode 不可用 | Mock 降级，播放预设动画序列 |
| BH-08 | Agent 执行失败 | 显示错误信息，其他 Agent 不受影响 |

## 验收标准

- [x] Orchestrator 可正确解析用户意图并生成 DISPATCH 计划
- [x] 多 Agent 可并发执行，各自独立 SSE 流
- [x] @mention 直接调用指定 Agent 正常工作
- [x] 工件工作区正确展示执行结果
- [x] 权限审批对话框正常弹出和响应
- [x] OpenCode 不可用时平滑降级到 Mock 模式
- [x] Agent 执行失败不影响其他 Agent
