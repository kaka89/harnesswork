# 菜单选中态高亮样式设计规范

**日期：** 2026-04-13  
**作者：** Qoder Agent  
**状态：** 已审核，待实施

---

## 背景

星静融合版（SolidJS）的侧边栏菜单缺乏清晰的选中高亮效果。
之前尝试使用 `bg-[var(--green-9)]/15` 语法，但因 Tailwind CSS 的透明度修饰符不支持包含十六进制值的 CSS 变量（`rgb(hex / opacity)` 非法），导致样式未生效。

## 根本原因

```
// 期望效果
bg-[var(--green-9)]/15

// Tailwind 生成的 CSS
background-color: rgb(var(--green-9) / 0.15)

// var(--green-9) 实际值 = #52c41a（十六进制）
// rgb(#52c41a / 0.15) ← 非法 CSS，浏览器忽略
```

## 设计方案（方案 A）

使用项目已有的 Radix UI 命名色阶 Tailwind 类，这些类已在 `tailwindSafelist` 中，不会被 purge。

### 颜色体系

| 场景 | Solo 模式 | Team 模式 |
|------|-----------|-----------|
| 选中背景 | `bg-green-3` | `bg-purple-3` |
| 选中文字 | `text-green-11` | `text-purple-11` |
| 左侧竖条 | `border-green-9` | `border-purple-9` |
| 父级分组背景 | `bg-green-2` | `bg-purple-2` |
| 父级分组文字 | `text-green-10` | `text-purple-10` |

### 色值参考（亮色模式）

| CSS 变量 | 色值 | 用途语义 |
|---------|------|---------|
| `--green-3` | `#d6f1e3` | 浅绿背景，适合选中态 |
| `--green-11` | `#218358` | 深绿文字，可读性好 |
| `--green-9` | `#30a46c` | 中绿，作为边框强调色 |
| `--purple-3` | `#f7edfe` | 浅紫背景 |
| `--purple-11` | `#8145b5` | 深紫文字 |
| `--purple-9` | `#8e4ec6` | 中紫边框 |

暗色模式下 CSS 变量自动切换，无需额外处理。

### 三类菜单项样式规则

#### 1. 顶层独立菜单项（AI搭档、设置）

```tsx
isActive(item.key)
  ? `bg-green-3 text-green-11 font-medium border-l-2 border-green-9`  // Solo
  : `bg-purple-3 text-purple-11 font-medium border-l-2 border-purple-9` // Team
  
// 未选中
'text-[var(--dls-text-secondary)] border-l-2 border-transparent'
```

#### 2. 分组父级标题（自动驾驶）

当组内有子项被选中时，父级标题展示较浅的高亮，以指示当前所在区域：

```tsx
isGroupActive(item.children)
  ? `bg-green-2 text-green-10 font-semibold border-l-2 border-green-9` // Solo
  : `bg-purple-2 text-purple-10 font-semibold border-l-2 border-purple-9` // Team

// 未激活（保持主题色字体，无背景）
isSoloMode() ? 'text-green-9 font-semibold border-l-2 border-transparent'
             : 'text-purple-9 font-semibold border-l-2 border-transparent'
```

#### 3. 子菜单项（驾驶舱、今日焦点等）

```tsx
isActive(child.key)
  ? `bg-green-3 text-green-11 font-medium border-l-2 border-green-9`  // Solo
  : `bg-purple-3 text-purple-11 font-medium border-l-2 border-purple-9` // Team

// 未选中
'text-[var(--dls-text-secondary)] border-l-2 border-transparent'
```

## 实施范围

**仅修改：**
- `harnesswork/apps/app/src/app/xingjing/components/layouts/main-layout.tsx`

**同时回退：**
- 上次遗留的 `bg-[var(--green-9)]/15`、`bg-[var(--purple-9)]/15` 等无效语法

**不修改：**
- `harnesswork/apps/xingjing/`（React 演示版，已归档）
- 其他任何文件

## 验证标准

- `pnpm build` 无错误
- 亮色/暗色模式下，选中菜单项有清晰可见的背景色和文字颜色变化
- Solo 模式选中态为绿色系，Team 模式为紫色系
- 非选中项无背景色，视觉干净
