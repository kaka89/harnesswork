# AI 虚拟团队 Drawer 左侧拖拽调宽设计

**日期**: 2026-04-14  
**状态**: 已批准  
**目标文件**: `harnesswork/apps/app/src/app/xingjing/components/ai/ai-chat-drawer.tsx`

---

## 背景

AI 虚拟团队 Drawer 当前使用固定宽度 440px，从屏幕右侧弹出。用户希望能够根据内容需要（如查看长 Agent 输出、多列调度卡片）自由向左拉伸会话框宽度。

---

## 需求

- 用户可通过左侧拖拽手柄调整 Drawer 宽度
- 宽度范围：最小 380px，最大 900px
- 宽度会话内保持（当前标签页刷新/重启后恢复默认 440px）
- 手柄视觉样式：可见拖拽条，始终存在，hover 和拖拽时有明确视觉反馈
- 拖拽时光标全局显示 `col-resize`，防止拖出 Drawer 区域时光标跳变

---

## 架构

**修改范围**：仅 `ai-chat-drawer.tsx` 一个文件，不修改 `main-layout.tsx` 或任何 props 接口。

### 状态

```ts
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 380;
const MAX_WIDTH = 900;

const [drawerWidth, setDrawerWidth] = createSignal(DEFAULT_WIDTH);
const [isResizing, setIsResizing] = createSignal(false);
```

### 拖拽逻辑

```
handleResizeStart(e: MouseEvent)
  ├── 记录 startX = e.clientX，startWidth = drawerWidth()
  ├── setIsResizing(true)
  ├── document.body.style.userSelect = 'none'
  ├── document.body.style.cursor = 'col-resize'
  ├── 注册 document.addEventListener('mousemove', handleMouseMove)
  └── 注册 document.addEventListener('mouseup', handleMouseUp)

handleMouseMove(e: MouseEvent)
  ├── delta = startX - e.clientX  （向左移动 → X 减小 → delta 为正 → 宽度增大）
  └── setDrawerWidth(clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH))

handleMouseUp()
  ├── setIsResizing(false)
  ├── document.body.style.userSelect = ''
  ├── document.body.style.cursor = ''
  ├── document.removeEventListener('mousemove', handleMouseMove)
  └── document.removeEventListener('mouseup', handleMouseUp)

onCleanup()
  └── handleMouseUp()  （组件卸载时确保清理，防内存泄漏）
```

---

## 组件结构

### Drawer 容器宽度

将静态 class `w-[440px]` 替换为动态内联 style：

```tsx
<div
  class="relative bg-[var(--dls-surface)] shadow-2xl flex flex-col h-full"
  style={{ width: `${drawerWidth()}px` }}
>
```

### 拖拽手柄

插入在 Drawer 容器最前面（`absolute left-0`），宽度 6px：

```tsx
<div
  class="absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-10 group flex items-center justify-center"
  onMouseDown={handleResizeStart}
>
  <div
    class="h-full w-px transition-all duration-150"
    style={{
      background: isResizing()
        ? accentColor()
        : 'var(--dls-border)',
      width: isResizing() ? '2px' : '1px',
      opacity: isResizing() ? '1' : '0.5',
    }}
  />
</div>
```

- 默认：1px 细线，50% 透明度，颜色 `var(--dls-border)`
- hover（通过 group-hover CSS）：opacity 提升至 100%
- 拖拽中：2px，颜色变为主题色（独立版绿 / 团队版紫）

### 拖拽时防选中

拖拽中给 Drawer 容器加 `select-none`，在全局 body 设置 `cursor: col-resize` 确保鼠标移出 Drawer 时光标不跳变。

---

## 不受影响的部分

| 部分 | 原因 |
|------|------|
| `MentionInput` 下拉菜单定位 | 使用 `getBoundingClientRect()` 动态计算，跟随输入框 |
| `main-layout.tsx` | 无需修改 |
| Props 接口 | 无需修改 |
| Backdrop（`fixed inset-0`）| 宽度独立，不受影响 |
| 浮动按钮位置 | `fixed bottom-6 right-6`，独立定位 |

---

## 验收标准

1. Drawer 左边缘出现可见的拖拽指示线
2. 鼠标 hover 时指示线变亮，光标变为 `col-resize`
3. 拖拽时 Drawer 宽度实时更新，无抖动
4. 宽度不能超出 [380px, 900px] 范围
5. 拖出 Drawer 区域后光标仍保持 `col-resize`，松手后恢复正常
6. 刷新页面后宽度恢复默认 440px
7. 快速打开/关闭 Drawer 不产生内存泄漏
