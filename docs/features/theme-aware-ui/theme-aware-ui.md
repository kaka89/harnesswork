# Feature: 模式选择页与工程驾驶舱页面主题自适应

<!--
  features/theme-aware-ui/ 是单次需求交付的核心评审单元。
  本 README 是产品侧评审对象，spec/ 下的 MODULE 文档是技术侧评审对象。
  关键技术/产品决策直接记录在"关键决策"章节，不再生成独立 ADR 文件。
-->

## 概述

| 属性       | 值                                                                                       |
|-----------|------------------------------------------------------------------------------------------|
| 特性编号   | F005                                                                                     |
| 状态       | draft                                                                                    |
| 产品负责人 | product-owner                                                                            |
| 技术负责人 | tech-lead                                                                                |
| 关联 PRD   | [PRD-002](../../product/prd/PRD-002-dual-mode-workspace.md)                              |
| 创建日期   | 2026-04-08                                                                               |
| 目标上线   | TBD                                                                                      |

## 特性描述

harnesswork 的模式选择页（`/mode-select`）和工程驾驶舱（`/cockpit`）所有子页面目前使用硬编码深色样式（`bg-gray-950`、`text-white`、`border-gray-800` 等），导致在亮色或系统跟随主题下显示完全异常（白背景上白字、边框不可见）。本特性将全部 9 个 UI 文件中的硬编码颜色替换为 DLS 语义 Token 及 Radix 主题 Token，使上述页面能够与应用全局外观设置（亮色 / 暗色 / 跟随系统）保持一致。

## 文档链路

```
theme-aware-ui/
├── theme-aware-ui.md          ← 特性概览（本文件，产品侧评审对象）
├── spec/                      ← 接口规格 & 行为规格（技术侧评审对象）
│   └── MODULE-005-theme-aware-ui.md
├── plan/
│   └── PLAN-005-theme-aware-ui.md
└── task/
    └── TASK-005-01-theme-token-replacement.md
```

## 关键决策

### 颜色 Token 策略：DLS 变量 vs Radix 语义色

- **决策**：优先使用 DLS CSS 变量（`var(--dls-app-bg)`、`bg-dls-surface`、`border-dls-border` 等）处理页面级背景和边框；对文字颜色使用 Radix 语义色（`text-gray-12`、`text-gray-10`、`text-gray-9`）；状态色（green/blue/yellow/red）使用 Radix 语义阶（`-11` 系列）
- **备选方案**：Tailwind `dark:` 变体；全量 CSS-in-JS 运行时方案
- **选择理由**：DLS 变量已在 `index.css` 中随 `[data-theme="dark"]` 切换，与现有主题系统零耦合；Radix 色阶在 `colors.css` 中同步定义了亮色/暗色双模，无需额外配置；Tailwind `dark:` 依赖 `.dark` class 但应用使用 `data-theme` 属性，不匹配
- **代价**：Tailwind 静态扫描可能漏扫部分动态 Token，需在 safelist 中确认覆盖

### prose 渲染模式

- **决策**：`doc-viewer-panel.tsx` 中移除 `prose-invert`，改用 `text-gray-12` + 基础 `prose`
- **选择理由**：`prose-invert` 强制白色文字，在亮色主题下不可读；Radix `gray-12` 会随主题自动切换为深色/浅色，`prose` 排版规则本身不影响颜色
- **代价**：如有自定义 `prose` 颜色覆盖需在 CI 视觉回归测试中验证

## 行为规格一览

| 编号  | 场景                                           | 预期                                         |
|-------|------------------------------------------------|----------------------------------------------|
| BH-01 | 用户在设置中切换至「亮色」主题                 | 模式选择页背景变为白色，文字变为深色，边框可见 |
| BH-02 | 用户在设置中切换至「暗色」主题                 | 模式选择页恢复深色背景，与切换前视觉一致       |
| BH-03 | 用户在设置中切换至「跟随系统」，OS 为亮色      | 自动应用亮色主题，页面显示正常                 |
| BH-04 | 工程驾驶舱 cockpit 页面在亮色主题下打开        | header、Tab 导航、所有子 Tab 面板均正常可读    |
| BH-05 | 产品 Tab 文档树在亮色主题下                    | 分组标题、文档列表、状态标签颜色均适配主题     |
| BH-06 | 发布&运维 / 运营 Tab 面板在亮色主题下          | 卡片背景、表格行、状态指示色均使用语义 Token   |
| BH-07 | 骨架屏（loading 状态）在亮色主题下             | 骨架色块可见（不与背景融合）                   |
| BH-08 | 主题切换后无需刷新页面                         | 切换即时生效，无白屏或闪烁                     |

## 交付进度

| 任务 | 负责人 | 状态 | 依赖 |
|------|--------|------|------|
| [TASK-005-01](task/TASK-005-01-theme-token-replacement.md) 9 个 UI 文件 Token 替换 | dev | todo | — |

## 验收标准

- [ ] 模式选择页在亮色主题下背景为白/浅色，文字深色，边框可见
- [ ] harnesswork 工程驾驶舱卡片（蓝色高亮）在亮色主题下仍可辨识
- [ ] 所有 Tab 导航激活态、hover 态在两种主题下均有明显视觉反馈
- [ ] 文档树状态标签（draft/approved/released）在亮色主题下颜色对比度合格
- [ ] 骨架屏 loading 块在亮色主题下可见
- [ ] doc-viewer 文章内容在亮色主题下文字深色可读
- [ ] 主题切换即时生效，无需刷新
- [ ] 9 个涉及文件无残留硬编码深色类（`bg-gray-900`、`bg-gray-950`、`text-white`、`border-gray-800/700` 等）

## 评审日志

| 轮次 | 日期       | 评审人       | 结论   | 关键意见 |
|------|------------|--------------|--------|---------|
| R1   | 2026-04-08 | product-owner | 待评审 | —       |
