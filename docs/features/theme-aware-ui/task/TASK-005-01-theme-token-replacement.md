# TASK-005-01 9 个 UI 文件主题 Token 全量替换

## 元信息
- 编号：TASK-005-01
- 状态：todo
- 负责人：dev
- 来源 PLAN：[PLAN-005](../plan/PLAN-005-theme-aware-ui.md)
- 关联 MODULE：[MODULE-005](../spec/MODULE-005-theme-aware-ui.md)
- 关联行为规格：MODULE-005-BH-01 ~ BH-22（全部）
- 预计工作量：1d
- 目标分支：feature/theme-aware-ui
- Worktree 路径：../.worktrees/TASK-005-01
- 影响文件：
  - `apps/app/src/app/pages/mode-select.tsx`
  - `apps/app/src/app/pages/cockpit.tsx`
  - `apps/app/src/app/components/cockpit/tab-nav.tsx`
  - `apps/app/src/app/components/cockpit/engineering-tab.tsx`
  - `apps/app/src/app/components/cockpit/product-tab.tsx`
  - `apps/app/src/app/components/cockpit/doc-tree-panel.tsx`
  - `apps/app/src/app/components/cockpit/doc-viewer-panel.tsx`
  - `apps/app/src/app/components/cockpit/release-tab.tsx`
  - `apps/app/src/app/components/cockpit/growth-tab.tsx`

## 任务描述

将上述 9 个 UI 文件中所有硬编码深色 Tailwind 静态色阶（如 `bg-gray-950`、`text-white`、`border-gray-800`）替换为 DLS 语义 Token（`bg-dls-surface`、`text-gray-12`、`border-dls-border` 等）或 Radix 主题色阶（`bg-gray-4`、`text-gray-11` 等），使这两个页面完全跟随 `document.documentElement.dataset.theme` 的亮色/暗色切换。

### 包含
- 9 个文件的样式类名替换（仅 className，不改逻辑）
- 确认 `tailwind.config.ts` safelist 包含所需动态 Token
- writeback PRD-002：新增 FR-11 主题自适应功能项

### 不包含（本 TASK 不负责）
- 主题系统本身（`theme.ts`、`index.css`）的任何变更
- 视觉回归测试 CI 配置

## 实现要点

### 前置检查
- [ ] 确认 `tailwind.config.ts` safelist 包含 `bg-gray-{1-12}`、`bg-blue-{3,4}`、`bg-green-{3,4}`、`bg-yellow-{3,4}`、`text-gray-{8-12}`、`text-green-11`、`text-yellow-11`、`text-red-11`、`text-blue-11`、`border-dls-border` 等；如缺失则补充

### mode-select.tsx
- [ ] 页面根容器：`bg-gray-950 text-white min-h-screen` → `bg-[var(--dls-app-bg)] text-gray-12 min-h-screen`
- [ ] 头部副标题：`text-gray-400` → `text-gray-10`
- [ ] 底部提示文字：`text-gray-500` → `text-gray-9`
- [ ] openwork 卡片默认背景：`bg-gray-900 border-gray-700` → `bg-dls-surface border-gray-6`
- [ ] openwork 卡片 hover：`hover:border-gray-600 hover:bg-gray-800` → `hover:border-gray-7 hover:bg-dls-hover`
- [ ] cockpit 卡片默认背景：`bg-gray-900 border-blue-800` → `bg-dls-surface border-blue-7`
- [ ] cockpit 卡片 hover：`hover:border-blue-600 hover:bg-blue-900/30` → `hover:border-blue-8 hover:bg-blue-3`
- [ ] 卡片标题（openwork）：`text-gray-300` → `text-gray-11`
- [ ] 卡片标题（cockpit）：`text-blue-400` → `text-blue-11`
- [ ] 卡片描述文字：`text-gray-500` → `text-gray-9`
- [ ] 功能列表项文字：`text-gray-400` → `text-gray-10`
- [ ] 功能列表项图标色（cockpit）：`text-blue-400` → `text-blue-11`

### cockpit.tsx
- [ ] 页面根容器：`bg-gray-950 text-white` → `bg-[var(--dls-app-bg)] text-gray-12`
- [ ] header 边框：`border-gray-800` → `border-dls-border`
- [ ] 返回按钮文字：`text-gray-400 hover:text-gray-200` → `text-gray-10 hover:text-gray-12`

### tab-nav.tsx
- [ ] Tab 容器背景：`bg-gray-900 border-gray-800` → `bg-[var(--dls-app-bg)] border-dls-border`
- [ ] 激活 Tab：`border-blue-400 text-blue-400` → `border-blue-9 text-blue-11`
- [ ] 激活 Tab 背景：`bg-gray-800` → `bg-dls-hover`
- [ ] 非激活 Tab：`text-gray-400 hover:text-gray-200 hover:bg-gray-800` → `text-gray-10 hover:text-gray-12 hover:bg-dls-hover`

### engineering-tab.tsx（骨架屏）
- [ ] 骨架屏卡片边框：`border-gray-800` → `border-dls-border`
- [ ] 骨架屏填充块：`bg-gray-800` → `bg-gray-4`

### product-tab.tsx
- [ ] 侧边栏边框：`border-gray-800` → `border-dls-border`

### doc-tree-panel.tsx
- [ ] STATUS_CLASS：
  - `draft`：`bg-gray-700 text-gray-300` → `bg-gray-4 text-gray-11`
  - `approved`：`bg-green-900 text-green-300` → `bg-green-3 text-green-11`
  - `released`：`bg-blue-900 text-blue-300` → `bg-blue-3 text-blue-11`
- [ ] 文档分组标题：`text-gray-400` → `text-gray-10`
- [ ] 文档列表项文字：`text-gray-300` → `text-gray-11`
- [ ] 选中项背景：`bg-gray-800 text-white` → `bg-dls-hover text-gray-12`
- [ ] hover 背景：`hover:bg-gray-800` → `hover:bg-dls-hover`
- [ ] 骨架屏填充块：`bg-gray-800` → `bg-gray-4`

### doc-viewer-panel.tsx
- [ ] 面板背景：`bg-gray-900` → `bg-dls-surface`
- [ ] 文章包装器：`text-gray-100 prose prose-invert prose-sm` → `text-gray-12 prose prose-sm`（移除 `prose-invert`）
- [ ] 空状态提示文字：`text-gray-500` → `text-gray-9`
- [ ] 骨架屏填充块：`bg-gray-800` → `bg-gray-4`

### release-tab.tsx
- [ ] Mock 横幅：`bg-yellow-900/30 border-yellow-800 text-yellow-400` → `bg-yellow-3/50 border-yellow-7 text-yellow-11`
- [ ] 4 个面板根容器：`bg-gray-900 border-gray-800` → `bg-dls-surface border-dls-border`
- [ ] 面板标题：`text-white` → `text-gray-12`
- [ ] 次级文字：`text-gray-400` → `text-gray-10`
- [ ] 最弱文字：`text-gray-500` → `text-gray-9`
- [ ] ENV_HEALTH_CLASS：
  - `healthy`：`text-green-400` → `text-green-11`
  - `degraded`：`text-yellow-400` → `text-yellow-11`
  - `down`：`text-red-400` → `text-red-11`
- [ ] 状态点颜色（`bg-green-500/bg-blue-500/bg-red-500`）保留不变（非语义色，表征确定状态）
- [ ] 行分隔线：`border-gray-800` → `border-dls-border`

### growth-tab.tsx
- [ ] Mock 横幅：与 release-tab 同规则
- [ ] 3 个面板根容器：`bg-gray-900 border-gray-800` → `bg-dls-surface border-dls-border`
- [ ] 面板标题：`text-white` → `text-gray-12`
- [ ] 次级文字：`text-gray-400` → `text-gray-10`
- [ ] SENTIMENT_CLASS：
  - `positive`：`text-green-400` → `text-green-11`
  - `neutral`：`text-gray-400` → `text-gray-10`
  - `negative`：`text-red-400` → `text-red-11`
- [ ] 反馈条目背景：`bg-gray-800` → `bg-gray-4`
- [ ] 渠道色 `text-blue-400` → `text-blue-11`
- [ ] 行分隔线：`border-gray-800` → `border-dls-border`

### writeback PRD-002
- [ ] 在 PRD-002 的 `功能需求` 章节末尾追加 FR-11：主题自适应

## 数据库变更（如有）
无

## 测试要求

| 测试类型 | 文件 | 覆盖行为规格 |
|---------|------|------------|
| 人工验收（亮色主题） | 目标 App | BH-01 ~ BH-22 |
| 人工验收（暗色主题） | 目标 App | BH-02, BH-14 重点核查 |
| 现有单元测试 | 项目既有 test 文件 | 全绿（不受 className 变更影响） |

## 完成标准 DoD
- [ ] 实现要点全部完成（含前置 safelist 检查）
- [ ] `pnpm build` 无报错
- [ ] 亮色 + 暗色主题人工验收通过（BH-01 ~ BH-22）
- [ ] 现有单元测试全绿
- [ ] PR 描述填写完整（含关联 TASK-005-01 编号）
- [ ] Code Review 至少 1 人 approve
- [ ] PRD-002 writeback FR-11 完成，台账同步更新

## PR Checklist（提交 PR 时自检）
- [ ] 代码符合团队编码规范
- [ ] 异常信息不暴露内部细节
- [ ] 关联 SPEC 行为规格编号（MODULE-005-BH-01 ~ BH-22）已在 PR 描述中注明
- [ ] 无硬编码的密钥 / 密码 / 连接串
- [ ] 无新增 TODO/FIXME 未处理

## 并行开发注意事项
- 并行 TASK：无
- 文件冲突风险：无（9 个文件为本次专属修改文件）
- 本地开发：在 `feature/theme-aware-ui` 分支上直接编码

## 备注
- Token 映射规范的完整参考见 [SDD-005 §3.3](../spec/SDD-005-theme-aware-ui.md)
- Tailwind DLS token 别名（`dls.surface`、`dls.hover`、`dls.border`）定义在 `apps/app/tailwind.config.ts`
- Radix 色阶（`gray-1` ~ `gray-12`）在 `colors.css` 中定义，通过 `[data-theme="dark"]` 选择器切换
