# Drawer 左侧拖拽调宽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 虚拟团队 Drawer 的左侧边缘添加可拖拽的宽度调整手柄，允许用户向左拉伸会话框宽度（380px ~ 900px），宽度会话内保持。

**Architecture:** 纯 SolidJS 信号驱动，在 `AiChatDrawer` 组件内部添加 `drawerWidth` / `isResizing` 两个信号，通过 `document.mousemove` / `mouseup` 事件监听实现拖拽逻辑，用 `onCleanup` 防止内存泄漏。Drawer 容器宽度从静态 class 改为动态 style，左侧插入 6px 宽的拖拽手柄元素。

**Tech Stack:** SolidJS (`createSignal`, `onCleanup`), TailwindCSS, TypeScript

---

## 文件变更清单

| 操作 | 文件 |
|------|------|
| **Modify** | `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx` |

---

### Task 1: 创建 worktree 并切换到功能分支

**Files:**
- N/A（git 操作）

- [ ] **Step 1: 在 harnesswork 目录中创建 worktree**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
git worktree add ../worktrees/feature/TASK-drawer-resize -b feature/TASK-drawer-resize dev
```

Expected output: 成功创建 `../worktrees/feature/TASK-drawer-resize` 目录

- [ ] **Step 2: 切换到 worktree 工作目录**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-drawer-resize
```

---

### Task 2: 添加宽度状态信号和拖拽常量

**Files:**
- Modify: `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx`

目标：在 `AiChatDrawer` 组件内部（`const [messages, ...]` 之前）添加宽度常量和两个信号。

- [ ] **Step 1: 在组件顶部添加宽度常量和信号**

找到文件第 379 行附近的组件定义：

```tsx
const AiChatDrawer: Component<AiChatDrawerProps> = (props) => {
  const [messages, setMessages] = createSignal<AiMessage[]>([WELCOME_MESSAGE]);
```

在 `const [messages` 这行**之前**插入：

```tsx
  // ─── 拖拽调宽 ─────────────────────────────────────────────────────────────
  const DEFAULT_WIDTH = 440;
  const MIN_WIDTH = 380;
  const MAX_WIDTH = 900;
  const [drawerWidth, setDrawerWidth] = createSignal(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = createSignal(false);
```

- [ ] **Step 2: 确认 `onCleanup` 已导入**

检查文件顶部 import：

```tsx
import {
  createSignal, For, Show, onCleanup,
  type Component,
} from 'solid-js';
```

若 `onCleanup` 尚未在导入列表中，将其加入。

---

### Task 3: 实现拖拽逻辑函数

**Files:**
- Modify: `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx`

目标：在宽度信号声明之后，添加三个拖拽处理函数。

- [ ] **Step 1: 在宽度信号声明正下方插入拖拽逻辑**

```tsx
  // ─── 拖拽处理 ─────────────────────────────────────────────────────────────
  // 保存当前拖拽的清理函数引用，供 onCleanup 调用
  let cleanupResize: (() => void) | null = null;

  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = drawerWidth();
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // 向左拖 → delta 为正 → 宽度增大
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupResize = null;
    };

    cleanupResize = handleMouseUp;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // onCleanup 在组件初始化阶段注册，组件卸载时调用已保存的清理引用
  onCleanup(() => { cleanupResize?.(); });
```

---

### Task 4: 替换 Drawer 容器静态宽度为动态宽度

**Files:**
- Modify: `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx` (约第 591 行)

- [ ] **Step 1: 将静态 `w-[440px]` 替换为动态 style**

找到（约第 591 行）：

```tsx
        <div class="relative w-[440px] bg-[var(--dls-surface)] shadow-2xl flex flex-col h-full">
```

替换为：

```tsx
        <div
          class={`relative bg-[var(--dls-surface)] shadow-2xl flex flex-col h-full${isResizing() ? ' select-none' : ''}`}
          style={{ width: `${drawerWidth()}px` }}
        >
```

---

### Task 5: 插入左侧拖拽手柄 DOM

**Files:**
- Modify: `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx` (约第 592 行)

目标：在 Drawer 容器内部最顶部（`{/* ── Header ── */}` 注释之前）插入手柄元素。

- [ ] **Step 1: 插入拖拽手柄**

在 `{/* ── Header ── */}` 注释行**之前**插入：

```tsx
          {/* ── 左侧拖拽手柄 ── */}
          <div
            class="absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-10 group"
            onMouseDown={handleResizeStart}
          >
            <div
              class="h-full transition-all duration-150 mx-auto"
              style={{
                width: isResizing() ? '2px' : '1px',
                background: isResizing() ? accentColor() : 'var(--dls-border)',
                opacity: isResizing() ? '1' : '0.4',
              }}
            />
          </div>
```

---

### Task 6: 手动验证功能

- [ ] **Step 1: 启动开发服务器**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-drawer-resize
pnpm dev --filter @harnesswork/app
```

- [ ] **Step 2: 验证以下行为**

1. 打开 AI 虚拟团队 Drawer，左边缘出现半透明细线
2. 鼠标 hover 到左边缘，光标变为 `col-resize`
3. 拖拽时细线变亮（主题色）、Drawer 宽度实时跟随
4. 宽度拖到最小值 380px 后无法继续缩小
5. 宽度拖到最大值 900px 后无法继续扩大
6. 拖出 Drawer 区域松手后宽度保持，光标恢复正常
7. 关闭再打开 Drawer，宽度保持（会话内）
8. 快速多次打开/关闭 Drawer 不报错

- [ ] **Step 3: 提交**

```bash
git add apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx
git commit -m "feat(xingjing): add left-side resize handle to AI chat drawer"
```

---

### Task 7: 构建验证（lint + build）

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-drawer-resize
pnpm --filter @harnesswork/app tsc --noEmit
```

Expected: 无 TS 错误

- [ ] **Step 2: 运行 lint**

```bash
pnpm --filter @harnesswork/app lint
```

Expected: 无 lint 错误

- [ ] **Step 3: 运行 build**

```bash
pnpm --filter @harnesswork/app build
```

Expected: Build 成功，无报错

---

### Task 8: 合并到 dev 分支

- [ ] **Step 1: 切回 harnesswork 主目录**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
```

- [ ] **Step 2: 合并功能分支**

```bash
git merge feature/TASK-drawer-resize --no-ff -m "feat(xingjing): drawer left-side resize handle"
```

- [ ] **Step 3: 移除 worktree（保留分支，等待人工确认删除）**

```bash
git worktree remove ../worktrees/feature/TASK-drawer-resize
```

Expected: worktree 目录被清理，分支 `feature/TASK-drawer-resize` 保留

---

## 验收标准回顾

| # | 验收项 | 对应 Task |
|---|--------|-----------|
| 1 | Drawer 左边缘出现可见拖拽指示线 | Task 5 |
| 2 | hover 时指示线变亮，光标变为 col-resize | Task 5 |
| 3 | 拖拽时宽度实时更新，无抖动 | Task 3 |
| 4 | 宽度限制在 [380px, 900px] 范围内 | Task 3 |
| 5 | 拖出区域松手后光标恢复正常 | Task 3 |
| 6 | 刷新后恢复默认 440px | Task 2（无 localStorage） |
| 7 | 快速开关 Drawer 不内存泄漏 | Task 3（onCleanup） |
