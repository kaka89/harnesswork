---
feature: openwork-back-button
status: released
prd: PRD-002-dual-mode-workspace
tasks: [TASK-004-01]
delivered: "2026-04-08"
---

# Feature: openwork 页面返回模式选择入口

<!--
  features/{特性名}/ 是单次需求交付的核心评审单元。
  本文件是产品侧评审对象，spec/ 下的 MODULE 文档是技术侧评审对象。
  关键技术/产品决策直接记录在"关键决策"章节，不再生成独立 ADR 文件。
-->

## 概述

| 属性       | 值                                         |
|-----------|---------------------------------------------|
| 特性编号   | F004                                        |
| 状态       | released                                    |
| 产品负责人 | product-owner                               |
| 技术负责人 | tech-lead                                   |
| 关联 PRD   | [PRD-002](../../product/prd/PRD-002-dual-mode-workspace.md) |
| 创建日期   | 2026-04-08                                  |
| 交付日期   | 2026-04-08                                  |

## 特性描述

在 openwork 原始版本页面（SessionView）左侧侧边栏顶部增加「← 返回模式选择」按钮，用户点击后可从 openwork 工作区直接跳回模式选择入口页（`/mode-select`）。这与工程驾驶舱（cockpit）已有的返回按钮保持行为一致，确保两种模式都可以便捷地回到入口选择页。

## 文档链路

```
openwork-back-button/
├── openwork-back-button.md  ← 特性概览（本文件，产品侧评审对象）
└── task/
    └── TASK-004-01-openwork-back-button.md
```

> 本特性为纯前端 UI 微调，无后端接口变更，不生成独立 MODULE/SPEC 文档。

## 关键决策

### 按钮位置：左侧侧边栏顶部

- **决策**：将返回按钮放置在 `session.tsx` 左侧 `<aside>` 侧边栏的最顶部，位于 Update Pill 和 WorkspaceSessionList 之上
- **备选方案 A**：放在顶部 Header 栏（与设置按钮并排）
- **备选方案 B**：在 WorkspaceSessionList 内部作为一个固定条目
- **选择理由**：侧边栏顶部是用户视线落点，不遮挡主工作区；与现有工程驾驶舱返回按钮的层级感一致（都在导航区）
- **代价**：侧边栏在移动端/小屏下通过 `hidden lg:flex` 隐藏，移动端暂无此入口

### 导航方式：useNavigate

- **决策**：在 `session.tsx` 中引入 `useNavigate` from `@solidjs/router`，点击时 `navigate("/mode-select")`
- **备选方案**：通过 props 向下传递 `onBackToModeSelect` 回调
- **选择理由**：session.tsx 已在 Router 上下文内，直接调用 useNavigate 更简洁，无需修改 SessionViewProps 和所有调用方
- **代价**：session.tsx 增加了对路由层的直接依赖

## 行为规格一览

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 用户在 openwork 页面点击「← 返回模式选择」 | 跳转至 `/mode-select`，显示模式选择页 |
| BH-02 | 跳回选择页时，上次偏好（openwork）高亮 | 选择页展示上次模式高亮（复用 F003 能力）|
| BH-03 | 移动端/小屏（< lg）访问 openwork 页面 | 侧边栏不显示，返回按钮暂不可见（降级处理） |
| BH-04 | 用户点击后再返回 openwork | 重新进入 openwork，sessionStorage 标记已存在，不触发冷启动重定向 |

## 交付进度

| 任务 | 负责人 | 状态 | 依赖 |
|------|--------|------|------|
| [TASK-004-01](task/TASK-004-01-openwork-back-button.md) 添加返回按钮 | dev | ✅ done | — |

## 验收标准

- [x] openwork 原始版本左侧侧边栏顶部出现「← 返回模式选择」按钮
- [x] 点击后跳转至 `/mode-select`，页面正确渲染模式选择页
- [x] 工程驾驶舱（cockpit）原有返回按钮行为不受影响
- [x] 无 TypeScript 编译错误

## 评审日志

| 轮次 | 日期 | 评审人 | 结论 | 关键意见 |
|------|------|--------|------|---------|
| R1 | 2026-04-08 | product-owner | 通过（追溯补录） | 代码已实现并验证，补录文档以合规 |
