# TASK-004-01 openwork 页面添加返回模式选择按钮

## 元信息

- 编号：TASK-004-01
- 状态：done
- 负责人：dev
- 关联特性：[openwork-back-button](../openwork-back-button.md)
- 关联 PRD：PRD-002-dual-mode-workspace（FR-10）
- 预计工作量：0.5h
- 实际交付：2026-04-08
- 目标分支：`feature/openwork-back-button`（追溯补录，已在 main 实现）
- 影响文件：
  - `apps/app/src/app/pages/session.tsx`（添加 useNavigate 导入 + navigate 调用 + 返回按钮 UI）

---

## 任务描述

在 `session.tsx` 左侧侧边栏（`<aside>`）顶部新增「← 返回模式选择」按钮，点击后通过 `navigate("/mode-select")` 跳回模式选择入口页。

---

## 实现要点

### 1. 添加 `useNavigate` 导入

```typescript
// 在 import { t } from "../../i18n"; 上方追加
import { useNavigate } from "@solidjs/router";
```

### 2. 在 `SessionView` 组件内初始化 navigate

```typescript
export default function SessionView(props: SessionViewProps) {
  const FLUSH_PROMPT_EVENT = "openwork:flushPromptDraft";
  const navigate = useNavigate();  // ← 新增
  // ...
```

### 3. 在 `<aside>` 顶部插入返回按钮

位于 `<aside>` 内、Update Pill `<div class="shrink-0">` 之前：

```tsx
{/* 返回模式选择按钮 */}
<div class="shrink-0 px-1 pb-2">
  <button
    type="button"
    class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-10 hover:text-gray-12 hover:bg-gray-4 transition-colors w-full"
    onClick={() => navigate("/mode-select")}
    data-testid="back-to-mode-select"
  >
    ← 返回模式选择
  </button>
</div>
```

---

## DoD（完成定义）

- [x] `session.tsx` 无 TypeScript 编译错误
- [x] 左侧侧边栏顶部出现「← 返回模式选择」按钮
- [x] 点击后正确跳转至 `/mode-select`
- [x] 工程驾驶舱返回按钮行为不受影响
- [x] 代码风格符合项目规范（使用 DLS Token 类名）

## PR Checklist

- [x] 单一职责：仅修改 session.tsx，变更范围最小
- [x] 无引入新依赖（@solidjs/router 已是项目依赖）
- [x] data-testid 已添加，便于 E2E 测试
