---
meta:
  id: MODULE-003-startup-default-route
  title: 启动默认路由至模式选择页——行为规格
  status: approved
  source_sdd: SDD-003-startup-default-route
  revision: "1.0"
  created: "2026-04-08"
  updated: "2026-04-08"
---

# MODULE-003 启动默认路由至模式选择页——行为规格

> 本特性为纯前端路由行为变更，无新增服务端接口。  
> 行为规格覆盖两个组件的变更点：`AppEntry`（entry.tsx）和 `ModeSelectPage`（mode-select.tsx）。

---

## 接口概述

| 接口 | 说明 |
|------|------|
| 无新增 API | 本特性仅修改前端路由跳转逻辑和 UI 高亮状态，不新增任何 HTTP 接口 |

---

## 行为规格

### BH-01 首次冷启动无偏好记录

**场景**：用户首次启动 harnesswork（localStorage 中无 `harnesswork:mode-preference`，sessionStorage 中无 `harnesswork:started`）

**前置条件**：
- `localStorage.getItem("harnesswork:mode-preference")` 返回 `null`
- `sessionStorage.getItem("harnesswork:started")` 返回 `null`

**预期行为**：
1. AppEntry `onMount` 检测到 `sessionStorage` 无 `harnesswork:started` 标记
2. 写入 `sessionStorage.setItem("harnesswork:started", "1")`
3. `navigate("/mode-select")` 跳转到模式选择页
4. ModeSelectPage 渲染双卡片，**两张卡片均无高亮**

**验收**：`data-testid="mode-select-page"` 存在，无任何卡片包含 `ring-2` 高亮类

---

### BH-02 有偏好记录的冷启动（高亮上次所选）

**场景**：用户已选择过模式，再次冷启动（页面刷新或重新打开）

**前置条件**：
- `localStorage.getItem("harnesswork:mode-preference")` 返回 `"cockpit"` 或 `"openwork"`
- `sessionStorage.getItem("harnesswork:started")` 返回 `null`（刷新清除了 sessionStorage）

**预期行为**：
1. AppEntry `onMount` 检测到 `sessionStorage` 无标记 → 写入标记 → `navigate("/mode-select")`
2. ModeSelectPage 读取 `localStorage("harnesswork:mode-preference")`
3. 对应卡片应用高亮样式（`ring-2 ring-white/60`）
4. **用户需主动点击卡片**才能进入对应模式，不自动跳转

**验收**：
- `preference === "cockpit"` 时：`data-testid="mode-cockpit"` 包含 `ring-2` 类；`data-testid="mode-openwork"` 不含
- `preference === "openwork"` 时：`data-testid="mode-openwork"` 包含 `ring-2` 类；`data-testid="mode-cockpit"` 不含

---

### BH-03 会话内导航到 `/` 路由（不触发重定向）

**场景**：用户在同一会话内（未刷新页面）从其他页面导航回 `/`（openwork 原始首页）

**前置条件**：
- `sessionStorage.getItem("harnesswork:started")` 返回 `"1"`（冷启动时已写入）

**预期行为**：
1. AppEntry `onMount` 仅在挂载时执行一次；会话内 navigate 到 `/` 不再触发 onMount
2. 用户在 ModeSelectPage 点击"openwork 原始版本"→ `navigate("/")` → 正常显示 openwork 首页
3. **不重定向回 `/mode-select`**

**约束**：`sessionStorage` 仅存 `"1"` 字符串，不存储其他信息

---

### BH-04 从驾驶舱返回模式选择（回归验证）

**场景**：用户在 `/cockpit` 页面点击"返回模式选择"按钮

**前置条件**：当前路由为 `/cockpit`

**预期行为**：
1. 点击返回按钮 → `navigate("/mode-select")`
2. ModeSelectPage 渲染，**高亮 `cockpit` 卡片**（preference 已记录）

**说明**：此为 PRD-002 已有功能，本特性不改变该逻辑，仅做回归验证

---

### BH-05 清除 localStorage 后重启恢复无预选

**场景**：用户或工具清除了 `localStorage`，然后刷新页面

**前置条件**：
- `localStorage.getItem("harnesswork:mode-preference")` 返回 `null`（已清除）
- `sessionStorage.getItem("harnesswork:started")` 返回 `null`（刷新清除）

**预期行为**：等同 BH-01，无高亮，双卡片均未选中

**说明**：sessionStorage 与 localStorage 相互独立；localStorage 清除不影响冷启动检测（sessionStorage 在刷新时已自动清除）

---

## 组件接口变更说明

### AppEntry（`apps/app/src/app/entry.tsx`）

| 属性 | 变更类型 | 说明 |
|------|---------|------|
| Props | 无变化 | AppEntry 不接受外部 Props |
| `onMount` 逻辑 | **修改** | 移除旧的 `preference=cockpit → navigate("/cockpit")`；改为 `sessionStorage` 冷启动检测 → `navigate("/mode-select")` |
| 外部依赖 | 新增 `sessionStorage` 读写 | 使用原生 `window.sessionStorage`，无需引入新依赖 |

### ModeSelectPage（`apps/app/src/app/pages/mode-select.tsx`）

| 属性 | 变更类型 | 说明 |
|------|---------|------|
| Props | 无变化 | 无外部 Props |
| 内部 state | **新增** | `preference` 信号，初始值从 `platform.storage("harnesswork").getItem("mode-preference")` 读取 |
| openwork 卡片样式 | **新增条件类** | `preference() === "openwork"` 时追加 `ring-2 ring-gray-300/60` |
| cockpit 卡片样式 | **新增条件类** | `preference() === "cockpit"` 时追加 `ring-2 ring-blue-400/60` |
| 点击行为 | 无变化 | 仍写入 localStorage 并 navigate |

---

## 存储契约

| 存储类型 | Key | 值域 | 读写方 | 生命周期 |
|---------|-----|------|--------|---------|
| `localStorage` | `harnesswork:mode-preference` | `"openwork"` \| `"cockpit"` | ModeSelectPage（写）/ ModeSelectPage（读） | 持久，直到用户手动清除 |
| `sessionStorage` | `harnesswork:started` | `"1"` | AppEntry（写+读） | 随页面会话结束自动清除 |
