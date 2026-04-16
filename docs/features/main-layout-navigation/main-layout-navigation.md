---
feature: main-layout-navigation
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# 主布局与导航

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F013 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-07](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 创建日期 | 2026-04-15 |

## 特性描述

星静独立版的应用主布局组件，提供完整的页面框架结构。包括左侧侧边栏（Logo、产品切换器、Energy Mode 选择器、角色菜单）、顶部 Header（面包屑、操作按钮）、AI 悬浮按钮、AI 对话抽屉，以及主内容区。支持 Solo/Team 双模式菜单切换和主题自适应。

## 核心组件

| 组件 | 路径 | 职责 | 大小 |
|------|------|------|------|
| MainLayout | `components/layouts/main-layout.tsx` | 应用主布局容器 | 653 行 |
| ProductSwitcher | `components/product/product-switcher.tsx` | 产品切换下拉组件 | 126 行 |
| AiChatDrawer | `components/ai/ai-chat-drawer.tsx` | AI 对话抽屉（由 MainLayout 管理打开/关闭） | 1204 行 |

## 布局结构

```
┌──────────────────────────────────────────────────┐
│ MainLayout                                        │
├──────┬───────────────────────────────────────────┤
│      │ Header                                     │
│      │ ┌─────────────────────────────────────────┐│
│ Side │ │ 面包屑导航          操作按钮 主题切换    ││
│ bar  │ └─────────────────────────────────────────┘│
│      │                                            │
│ Logo │ Main Content Area                          │
│ ──── │                                            │
│ 产品  │ ┌──────────────────────┐                  │
│ 切换  │ │                      │  ┌─────────────┐ │
│ ──── │ │    页面内容区          │  │ AI Chat     │ │
│Energy│ │    (Router Outlet)    │  │ Drawer      │ │
│ Mode │ │                      │  │ (可展开)     │ │
│ ──── │ │                      │  │             │ │
│ 菜单  │ │                      │  └─────────────┘ │
│ 项目  │ └──────────────────────┘                  │
│      │                              [AI Float]    │
└──────┴───────────────────────────────────────────┘
```

## 侧边栏组成

### Logo 区域
- 高度 56px，显示星静品牌 Logo
- 点击可返回模式选择页

### 产品切换器（ProductSwitcher）
- 下拉选择当前活跃产品
- 切换产品时更新 OpenCode 客户端连接
- 显示产品名称和类型标记（Solo/Team）

### Energy Mode 选择器
- 切换 Solo（独立版）和 Team（团队版）模式
- Solo 用绿色系，Team 用紫色系
- 切换后菜单项自动更新

### 角色菜单项

**Solo 模式菜单**：

| 菜单项 | 路径 | 图标 | 说明 |
|--------|------|------|------|
| 产品 | `/solo/product` | Package | 产品管理与文档树 |
| 研发 | `/solo/focus` | Code | 焦点开发模式 |
| 知识 | `/solo/knowledge` | BookOpen | 知识管理 |
| Autopilot | `/solo/autopilot` | Rocket | 自动化工作流 |
| Agent 工坊 | `/solo/agent-workshop` | Bot | Agent 管理 |
| 构建 | `/solo/build` | Hammer | 构建管理 |
| 发布 | `/solo/release` | Ship | 发布管理 |
| 评审 | `/solo/review` | CheckCircle | 代码评审 |
| 设置 | `/settings` | Settings | 系统设置 |

**Team 模式菜单**：
Team 模式在 Solo 菜单基础上增加团队协作相关项（需求工坊、Sprint 中心、质量中心等）。

## AI 悬浮按钮

- 固定在页面右下角
- 可拖拽移动，位置持久化到 localStorage
- 点击打开/关闭 AI 对话抽屉
- 悬停效果使用主题色阴影

## 主题切换

MainLayout 通过 `createEffect` 监听 `themeMode` 信号，支持：
- 亮色主题（Light）
- 暗色主题（Dark）
- 跟随系统（System）

所有颜色使用 DLS 语义 Token（`--dls-surface-overlay` 等）和 Radix 色阶（`bg-gray-4`、`text-green-11` 等），主题切换即时生效无需刷新。

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 布局方式 | 固定侧边栏 + 流式主内容区 | 经典 Dashboard 布局，信息密度高 |
| D2 | 模式切换 | Energy Mode 选择器控制菜单 | 避免频繁进入模式选择页 |
| D3 | AI 入口 | 悬浮按钮 + 侧边抽屉 | 随时可调用，不遮挡主内容 |
| D4 | 主题实现 | DLS Token + Radix 色阶 | 统一设计语言，与 OpenWork 保持一致 |
| D5 | 侧边栏折叠 | 支持折叠/展开 | 小屏适配，最大化内容区域 |

## 行为规格

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 应用启动 | 侧边栏展开，显示 Logo + 产品切换器 + 菜单 |
| BH-02 | 切换 Energy Mode | 菜单项动态更新为对应模式 |
| BH-03 | 点击菜单项 | 路由跳转到对应页面，当前菜单高亮 |
| BH-04 | 点击 AI 悬浮按钮 | 打开 AI 对话抽屉 |
| BH-05 | 切换主题 | 所有组件即时切换颜色方案 |
| BH-06 | 切换产品 | ProductSwitcher 更新，页面数据刷新 |
| BH-07 | 折叠侧边栏 | 菜单收起为图标模式，主内容区扩展 |

## 验收标准

- [x] 侧边栏正确展示 Logo、产品切换器、Energy Mode、菜单项
- [x] Solo/Team 模式切换后菜单正确更新
- [x] 路由跳转和当前菜单高亮正常
- [x] AI 悬浮按钮可拖拽，位置持久化
- [x] AI 对话抽屉正常打开/关闭
- [x] 亮色/暗色/跟随系统主题切换即时生效
- [x] 侧边栏折叠/展开正常工作
