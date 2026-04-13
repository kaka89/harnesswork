# Menu Active Highlight 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复星静融合版侧边栏菜单选中态高亮——使用 Radix 命名色阶替换无效的 CSS 变量透明度写法，让 Solo/Team 模式的菜单选中态有清晰可见的背景色与文字颜色。

**Architecture:** 仅修改 `main-layout.tsx` 中的 Tailwind class 字符串。将 `bg-[var(--green-9)]/15` 等无效写法替换为 `bg-green-3 text-green-11 border-green-9` 等已注册的 Radix 命名类。顺带移除上次遗留的无效辅助函数。

**Tech Stack:** SolidJS · Tailwind CSS v3 · Radix UI Colors

**Spec:** `docs/superpowers/specs/2026-04-13-menu-active-highlight-design.md`

---

### Task 1：重构 main-layout.tsx 中的菜单激活态 class

**Files:**
- Modify: `apps/app/src/app/xingjing/components/layouts/main-layout.tsx`

- [ ] **Step 1：移除上一次留下的无效辅助函数**

  找到 `isActive` 函数之后、`handleModeSwitch` 之前的以下代码块，将其全部删除：

  ```tsx
  // 判断某个分组下是否有子菜单处于激活状态
  const isGroupActive = (children: { key: string }[]) => { ... };

  // 根据当前模式生成激活态 class（背景 + 文字颜色）
  const activeClass = () => ...;

  // 子菜单激活态（带圆角和 margin）
  const activeChildClass = () => ...;

  // 分组父级激活态（子菜单有选中时高亮标题）
  const activeGroupClass = () => ...;
  ```

  保留 `isGroupActive` 函数本身（逻辑正确），只删除 `activeClass`、`activeChildClass`、`activeGroupClass` 三个返回错误 class 的函数。

- [ ] **Step 2：写出正确的激活态 class 辅助函数**

  在 `isGroupActive` 之后紧接着添加：

  ```tsx
  // Solo 模式：green-3 背景 + green-11 文字 + green-9 左边框
  // Team 模式：purple-3 背景 + purple-11 文字 + purple-9 左边框
  const activeItemClass = () =>
    isSoloMode()
      ? 'bg-green-3 text-green-11 font-medium border-l-2 border-green-9'
      : 'bg-purple-3 text-purple-11 font-medium border-l-2 border-purple-9';

  // 分组父级（子项选中时稍浅）
  const activeGroupHeaderClass = () =>
    isSoloMode()
      ? 'bg-green-2 text-green-10 font-semibold border-l-2 border-green-9'
      : 'bg-purple-2 text-purple-10 font-semibold border-l-2 border-purple-9';

  // 未选中时的边框占位（保持布局稳定）
  const inactiveBorder = 'border-l-2 border-transparent';
  ```

- [ ] **Step 3：更新顶层独立菜单项（fallback 按钮）的 class**

  将 fallback 中按钮的 class 从：
  ```tsx
  class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors border-l-2 ${
    isActive(item.key)
      ? activeClass() + (isSoloMode() ? ' border-[var(--green-9)]' : ' border-[var(--purple-9)]')
      : 'text-[var(--dls-text-secondary)] border-transparent'
  }`}
  ```
  改为：
  ```tsx
  class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
    isActive(item.key) ? activeItemClass() : `text-[var(--dls-text-secondary)] ${inactiveBorder}`
  }`}
  ```

- [ ] **Step 4：更新分组父级标题按钮的 class**

  将分组标题按钮的 class 从：
  ```tsx
  class={`w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors border-l-2 ${
    isGroupActive(item.children!)
      ? activeGroupClass() + (isSoloMode() ? ' border-[var(--green-9)]' : ' border-[var(--purple-9)]')
      : (isSoloMode() ? 'text-[var(--green-9)] border-transparent' : 'text-[var(--purple-9)] border-transparent')
  }`}
  ```
  改为：
  ```tsx
  class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
    isGroupActive(item.children!)
      ? activeGroupHeaderClass()
      : `${isSoloMode() ? 'text-green-9' : 'text-purple-9'} font-semibold ${inactiveBorder}`
  }`}
  ```

- [ ] **Step 5：更新子菜单项的 class**

  将子菜单项的 class 从：
  ```tsx
  class={`w-full pl-10 pr-3 py-2 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors rounded mx-1 border-l-2 ${
    isActive(child.key)
      ? activeChildClass() + (isSoloMode() ? ' border-[var(--green-9)]' : ' border-[var(--purple-9)]')
      : 'text-[var(--dls-text-secondary)] border-transparent'
  }`}
  ```
  改为：
  ```tsx
  class={`w-full pl-10 pr-3 py-2 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors rounded mx-1 ${
    isActive(child.key) ? activeItemClass() : `text-[var(--dls-text-secondary)] ${inactiveBorder}`
  }`}
  ```

- [ ] **Step 6：提交变更**

  ```bash
  cd /path/to/worktree
  git add apps/app/src/app/xingjing/components/layouts/main-layout.tsx
  git commit -m "feat(xingjing): fix menu active highlight using Radix named color classes"
  ```

---

### Task 2：构建验证

**Files:**
- 无文件改动，仅运行命令

- [ ] **Step 1：在 worktree 目录运行 app 构建**

  ```bash
  cd /path/to/worktree
  pnpm --filter @openwork/app build
  ```
  预期：`✓ built in Xs`，无 TypeScript 错误，无 Vite 错误。

- [ ] **Step 2：确认 Tailwind 类已生成**

  构建后检查 dist 中生成的 CSS 包含以下类名（任意一个即可）：
  ```bash
  grep -r "bg-green-3\|bg-purple-3" dist/ | head -5
  ```
  预期：找到对应的 CSS 规则，说明 Tailwind 已识别并输出这些类。

- [ ] **Step 3：若构建通过，推进合并流程**

  调用 `finishing-a-development-branch` skill，按指引将 feature 分支合并到 `dev`。
