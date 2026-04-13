# MODULE-005 主题自适应 UI 行为规格

## 元信息
- 编号：MODULE-005
- 状态：draft
- 作者：tech-lead
- 来源 SDD：[SDD-005](SDD-005-theme-aware-ui.md)
- 修订版本：1.0
- 对应 OpenAPI：N/A（纯前端，无 REST 接口）
- 契约测试文件：N/A

## 接口清单

本 MODULE 为纯前端 UI 规格，无 REST 接口。所有行为规格描述 UI 组件在不同主题下的视觉与交互行为。

---

## 主题自适应渲染规格

### 行为规格（每条对应一个人工验收用例）

#### 模式选择页（mode-select.tsx）

- **MODULE-005-BH-01**：亮色主题下打开 `/mode-select` → 页面根元素背景色为 `var(--dls-app-bg)`（白色系），标题文字与副标题文字深色可读（对比度 ≥ 4.5:1）
- **MODULE-005-BH-02**：暗色主题下打开 `/mode-select` → 页面根元素背景色为深色，文字为浅色，与切换前行为一致
- **MODULE-005-BH-03**：亮色主题下，openwork 卡片边框（`border-gray-6`）与背景（`bg-dls-surface`）可见，hover 时背景变化可感知
- **MODULE-005-BH-04**：亮色主题下，cockpit 卡片蓝色边框（`border-blue-7`）与蓝色标题（`text-blue-11`）可读，hover 时背景（`bg-blue-3`）为浅蓝可见
- **MODULE-005-BH-05**：用户有偏好（`mode-preference` 存在）时，对应卡片高亮（ring-2）在亮色/暗色主题下均可见

#### 工程驾驶舱容器（cockpit.tsx）

- **MODULE-005-BH-06**：亮色主题下打开 `/cockpit` → header 背景跟随 `var(--dls-app-bg)`，header 底边框（`border-dls-border`）可见，返回按钮文字（`text-gray-10`）深色可读
- **MODULE-005-BH-07**：亮色主题下，Tab 导航激活项显示蓝色下划线（`border-blue-9`）和蓝色文字（`text-blue-11`），非激活项文字为灰色（`text-gray-10`）

#### Tab 导航（tab-nav.tsx）

- **MODULE-005-BH-08**：亮色主题下，激活 Tab 背景（`bg-dls-hover`）与页面背景有明显区分，hover 时非激活 Tab 背景变化可感知

#### 产品 Tab（product-tab.tsx + doc-tree-panel.tsx）

- **MODULE-005-BH-09**：亮色主题下，文档树侧边栏右边框（`border-dls-border`）可见
- **MODULE-005-BH-10**：亮色主题下，文档分组标题文字（`text-gray-10`）和文档列表文字（`text-gray-11`）深色可读
- **MODULE-005-BH-11**：状态标签在亮色主题下颜色对比度合格：draft（灰底深字）/ approved（浅绿底绿字）/ released（浅蓝底蓝字）
- **MODULE-005-BH-12**：文档树 loading 骨架屏（`bg-gray-4`）在亮色主题下与背景有明显区别（非纯白）

#### 文档查看器（doc-viewer-panel.tsx）

- **MODULE-005-BH-13**：亮色主题下，Markdown 文章文字（`text-gray-12`）深色可读，标题层级颜色正常
- **MODULE-005-BH-14**：移除 `prose-invert` 后，暗色主题下 prose 排版颜色仍正常（由 CSS 变量驱动，非 prose-invert 强制白色）
- **MODULE-005-BH-15**：doc-viewer loading 骨架屏（`bg-gray-4`）在亮色主题下可见

#### 发布&运维 Tab（release-tab.tsx）

- **MODULE-005-BH-16**：亮色主题下，4 个面板背景（`bg-dls-surface`）与边框（`border-dls-border`）正常显示
- **MODULE-005-BH-17**：流水线状态点（`bg-green-500`/`bg-blue-500`/`bg-red-500`，原有状态色保留不变）在亮色主题下仍可识别
- **MODULE-005-BH-18**：健康状态文字（healthy `text-green-11` / degraded `text-yellow-11` / down `text-red-11`）在亮色主题下颜色对比度合格

#### 运营 Tab（growth-tab.tsx）

- **MODULE-005-BH-19**：亮色主题下，DAU/MAU 趋势表格行文字（`text-gray-12/11/10`）层次清晰
- **MODULE-005-BH-20**：用户反馈条目背景（`bg-gray-4`）在亮色主题下与面板背景（`bg-dls-surface`）有层次区分
- **MODULE-005-BH-21**：情感色（positive `text-green-11` / neutral `text-gray-10` / negative `text-red-11`）在亮色主题下可辨识

#### 即时生效

- **MODULE-005-BH-22**：用户在应用内切换主题（Settings → Appearance），当前已打开的 `/mode-select` 或 `/cockpit` 页面即时重绘，无需刷新，无白屏或闪烁

### 非功能约束

- 主题切换渲染延迟：< 16ms（CSS 变量由浏览器原生处理）
- 包体积变化：0（仅替换 Tailwind 类名）
- 现有测试（`data-testid` 断言）不受影响，全绿

---

## 技术设计评审日志

| 轮次 | 日期       | 评审人     | 结论   | 关键意见 |
|------|------------|------------|--------|---------|
| R1   | 2026-04-08 | tech-lead  | 待评审 | —       |
