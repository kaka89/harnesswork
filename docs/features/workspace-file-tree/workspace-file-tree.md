# Feature: workspace-file-tree

## 概述

| 属性       | 值                                                                    |
|-----------|-----------------------------------------------------------------------|
| 特性编号   | F006                                                                  |
| 状态       | in-review                                                             |
| 产品负责人 | product-owner                                                         |
| 技术负责人 | tech-lead                                                             |
| 关联 PRD   | [PRD-002](../../product/prd/PRD-002-dual-mode-workspace.md)           |
| 创建日期   | 2026-04-08                                                            |
| 目标上线   | Sprint-01-W15（当前迭代）                                              |

## 特性描述

工程驾驶舱「产品」Tab 的左侧面板升级为**本地工作空间文件目录树**。用户首次进入时显示空状态与「选择工作目录」按钮，通过 Tauri 原生文件夹选择器选定目录后，左侧展示该目录的可展开文件树；选中文件在右侧预览（Markdown 渲染 / 纯文本）。所选路径持久化至 `localStorage`，刷新后自动恢复。

## 文档链路

```
workspace-file-tree/
├── workspace-file-tree.md        ← 本文件（产品侧评审对象）
├── spec/
│   ├── SDD-006-workspace-file-tree.md
│   └── MODULE-006-workspace-file-tree.md
├── plan/
│   └── PLAN-006-workspace-file-tree.md
└── task/
    └── TASK-006-01-workspace-file-tree-impl.md
```

## 关键决策

### 文件树数据源：Server HTTP vs Tauri invoke

- **决策**：通过 sidecar Server 新增 `GET /workspace/readdir` 和 `GET /workspace/file` 两个 HTTP 接口提供目录列表与文件内容，由前端 `fetch()` 消费
- **备选方案**：在 Rust 层新增 Tauri `invoke` 命令直接调用 `std::fs`；或安装 `@tauri-apps/plugin-fs`
- **选择理由**：Server 层（Bun）已有 `readdir` / `readFile` 导入，改动最小，无需重编 Rust；与现有 `/docs` 接口保持一致的模式
- **代价**：绕过 Tauri 能力权限控制，适用于桌面本地端，不适用于 Web 模式

### 工作空间路径持久化

- **决策**：使用 `localStorage`（key: `harnesswork:cockpit:ws-path`）持久化用户选定的工作目录路径
- **备选方案**：集成主 App `workspaceStore`；或使用 Tauri `store` 插件
- **选择理由**：CockpitPage 处于 `<Show>` fallback 分支，无法访问主 App Provider 树；`localStorage` 是最轻量的跨刷新持久化方案
- **代价**：路径不与 openwork 工作区系统同步，需用户手动切换

### 非 Markdown 文件预览

- **决策**：非 `.md/.mdx` 文件以 `<pre>` 纯文本展示，不支持语法高亮
- **备选方案**：引入 `highlight.js` 或 `shiki` 做代码着色
- **选择理由**：P1 阶段以功能完整性优先，代码高亮为 P2 优化项
- **代价**：代码文件可读性较差

## 行为规格一览

| 编号  | 场景                                | 预期                                               |
|-------|-------------------------------------|----------------------------------------------------|
| BH-01 | 首次进入产品 Tab，无已选工作目录     | 左侧显示「📂 未选择工作目录」+ 蓝色「选择工作目录」按钮 |
| BH-02 | 点击「选择工作目录」                 | 调用 Tauri `pickDirectory()`，弹出原生文件夹选择器  |
| BH-03 | 用户选择目录后取消                   | 左侧状态不变，继续显示空状态                        |
| BH-04 | 用户选择目录后确认                   | 左侧加载并展示该目录的文件树；header 显示目录名 + 「更换」按钮 |
| BH-05 | 文件树加载中                         | 显示骨架屏（7 行 animate-pulse）                    |
| BH-06 | 目录为空                             | 显示「目录为空」提示文字                            |
| BH-07 | 点击目录行                           | 展开/折叠子目录，懒加载子项                         |
| BH-08 | 点击文件行                           | 右侧面板加载并预览文件内容                          |
| BH-09 | 选中 `.md` 文件                      | 右侧以 Markdown 渲染（marked + DOMPurify）          |
| BH-10 | 选中非 Markdown 文件                 | 右侧以 `<pre>` 纯文本展示，HTML 实体转义            |
| BH-11 | 刷新页面                             | `localStorage` 恢复上次所选路径，自动加载文件树      |
| BH-12 | 点击「更换」按钮                     | 重新调用文件夹选择器，选定后替换当前工作目录         |
| BH-13 | 文件名以 `.` 开头（隐藏文件）        | 正常显示，字色降低对比度（`text-gray-7/8`）          |
| BH-14 | 目录优先排序                         | 同级目录显示在文件之前，各自按字母序排列             |

## 交付进度

| 任务 | 负责人 | 状态 | 依赖 |
|------|--------|------|------|
| [TASK-006-01](task/TASK-006-01-workspace-file-tree-impl.md) 完整实现 WorkspaceFileTreePanel + 服务端接口 | tech-lead | **done** | — |

> ⚠️ 注：代码已先于本 README 实现（工作流违规），本文件为追溯补录。

## 验收标准

- [x] 首次进入显示空状态与「选择工作目录」按钮
- [x] 选择目录后左侧展示可展开文件树
- [x] 目录懒加载子项，展开/折叠正常
- [x] `.md` 文件在右侧 Markdown 渲染；其他文件纯文本展示
- [x] `localStorage` 持久化，刷新自动恢复
- [x] 服务端新增 `/workspace/readdir` 与 `/workspace/file` 接口
- [ ] SonarQube 覆盖率 > 80%，无 Critical 问题
- [ ] 人工验收：Tauri 桌面端文件夹选择器正常弹出

## 评审日志

| 轮次 | 日期       | 评审人       | 结论   | 关键意见 |
|------|------------|--------------|--------|---------|
| R1   | 2026-04-08 | product-owner | 待确认 | — |
