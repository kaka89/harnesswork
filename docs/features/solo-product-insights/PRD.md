---
feat: solo-product-insights
title: 独立版·产品洞察（数据加载与刷新）
status: implemented
lifecycle: living
created-at: 2026-04-21
updated-at: 2026-04-21
version: v1.0
---

# 独立版·产品洞察 — 产品需求文档

## 概述

产品洞察页面是星静独立版的核心功能页面之一，为独立开发者提供产品全生命周期数据的统一视图。页面通过 **10 路并发数据加载** 从用户 workspace 目录中读取结构化文件，呈现产品模块、产品假设、外部洞察、用户反馈、需求输出等多维度数据。

本文档聚焦于 **数据加载流程** 和 **刷新按钮交互** 的需求定义，是产品洞察页面数据层的 SSOT（Single Source of Truth）。

## 背景

- 独立版用户的产品数据以结构化文件（YAML / Markdown with Frontmatter）存储在本地 workspace 目录中
- 数据目录结构由 `dir-graph.yaml` 统一定义，是唯一权威来源
- 页面需要从多个目录并发加载数据，保证快速响应的同时处理各类异常

## 用户故事

1. **作为**独立版用户，**我希望**打开产品洞察页面时自动加载所有产品数据，**以便**快速掌握产品全貌
2. **作为**独立版用户，**我希望**点击刷新按钮能重新加载最新数据，**以便**在编辑文件后看到更新
3. **作为**独立版用户，**我希望**加载失败时能看到清晰的错误提示和重试按钮，**以便**自助恢复
4. **作为**独立版用户，**我希望**快速连续点击刷新时不会出现数据错乱，**以便**获得一致的数据视图

## 功能需求

### FR-01: 10 路并发数据加载

页面需通过 `loadAllData()` 函数并发加载以下 10 类数据：

| 序号 | 数据类型 | 加载函数 | 数据源路径 | 文件格式 |
|------|---------|---------|-----------|---------|
| 1 | 产品假设 | `loadHypotheses` | `iterations/hypotheses/_index.yml` + `*.md` | YAML 索引 + Markdown |
| 2 | 需求输出 | `loadRequirementOutputs` | `iterations/requirements/*.yaml` | YAML |
| 3 | 用户反馈 | `loadUserFeedbacks` | `iterations/feedbacks/*.md` | Markdown |
| 4 | 产品模块 | `loadProductFeatures` | `product/features/_index.yml` | YAML |
| 5 | 产品概述 | `loadProductOverview` | `product/overview.md` | Markdown |
| 6 | 产品路线图 | `loadProductRoadmap` | `product/roadmap.md` | Markdown |
| 7 | 业务指标 | `loadSoloMetrics` | `metrics.yml` | YAML |
| 8 | 外部洞察 | `loadInsightRecords` | `knowledge/insights/*.md` | Markdown (Knowledge 格式) |
| 9 | PRD 文档 | `loadPrds` | `product/features/{feat}/PRD.md` | Markdown |
| 10 | SDD 文档 | `loadSdds` | `product/features/{feat}/SDD.md` | Markdown |

**约束**：
- 所有数据源路径必须遵循 `dir-graph.yaml` 中的定义
- 所有路径为 **workspace 相对路径**，不得使用绝对路径
- 目录不存在或文件为空时，静默降级返回空数组/空字符串
- 10 路加载通过 `Promise.all` 并发执行，单路失败不影响其他路

### FR-02: 刷新按钮

| 属性 | 规格 |
|------|------|
| 位置 | 页面顶部操作栏 |
| 图标 | `TbRefresh`（Tabler Icons） |
| 禁用条件 | 数据正在加载中（`pageLoading() === true`） |
| 加载动画 | 图标旋转 `animate-spin` |
| 触发动作 | 调用 `loadAllData()` |
| 通道保留 | **不**重置文件通道偏好（`resetChannelPreferences`），保留上轮探测到的最优通道级别 |

### FR-03: 三个触发点

| 触发方式 | 场景 | 说明 |
|---------|------|------|
| 自动加载 | 页面首次挂载、workspace 切换 | 通过 `createEffect` 响应 `workDir` 信号变化 |
| 手动刷新 | 用户点击刷新按钮 | 刷新按钮调用 `loadAllData()` |
| 错误重试 | 加载失败后点击重试 | 错误提示区域的重试按钮，同样调用 `loadAllData()` |

### FR-04: 竞态保护

- 多次快速触发 `loadAllData()` 时，仅最后一次加载的结果生效
- 通过递增版本号 `loadVersion` 实现竞态守卫
- 过期版本的加载结果被静默丢弃，不更新页面状态

### FR-05: 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 单路加载失败 | 静默降级，返回空数据（空数组/空字符串） |
| 全部加载异常 | 显示统一错误提示「数据加载失败，请检查网络连接后刷新」 |
| 目录不存在 | 视为空数据，不报错 |
| 文件格式异常 | 该文件跳过，其余正常加载 |

### FR-06: 外部洞察 Knowledge 兼容

外部洞察（`loadInsightRecords`）需兼容两种文件格式：

| 格式 | frontmatter 字段 | 来源 |
|------|-----------------|------|
| Knowledge 标准格式 | `id, category(user-insight), title, tags, createdAt` | `knowledge/insights/K-*.md` |
| InsightRecord 格式 | `id, insightCategory, query, createdAt, linkedHypotheses` | 旧格式兼容 |

字段映射规则：
- `query`: 优先 `fm.query`，降级 `fm.title`
- `category`: 优先 `fm.insightCategory`，降级从 `fm.category` 映射（`user-insight` → `user`）
- `摘要`: 兼容 `## 摘要` 和 `## 洞察` 两种 Markdown 段标题

## 非功能需求

| 指标 | 要求 |
|------|------|
| 首次加载时间 | < 3 秒（10 路并发） |
| 刷新响应 | < 2 秒（通道偏好已确定） |
| 内存占用 | 无数据泄漏，竞态结果不残留 |
| 兼容性 | 支持 macOS / Windows / Linux 桌面端 |

## 验收标准

- [x] 10 路数据加载均使用 workspace 相对路径 + workDir 参数
- [x] 所有路径遵循 `dir-graph.yaml` 定义
- [x] 外部洞察从 `knowledge/insights/` 读取，兼容 Knowledge 标准格式
- [x] 刷新按钮在加载期间禁用，显示旋转动画
- [x] 快速连续刷新不产生数据错乱（竞态保护）
- [x] 目录不存在时静默降级为空数据
- [x] 全局错误时显示友好提示和重试按钮
- [x] TypeScript 零类型错误
- [x] solo007 测试 workspace 验证通过（13 features, 12+ hypotheses, 2 insights）

## 测试 Workspace 预期结果

以 `/Users/umasuo_m3pro/Desktop/xingjing-test/solo007` 为测试基准：

| 数据类型 | 预期条数 | 说明 |
|---------|---------|------|
| 产品模块 | 13 | `product/features/_index.yml` 含 13 条 feature 定义 |
| 产品假设 | 12+ | `_index.yml` 3 条 + 12 个 `.md` 合并去重 |
| 外部洞察 | 2 | `knowledge/insights/` 下 K-003, K-004 |
| PRD 文档 | ≥ 5 | 各 feature 子目录下的 PRD.md |
| SDD 文档 | ≥ 2 | 部分 feature 子目录下的 SDD.md |
| 用户反馈 | ≥ 6 | `iterations/feedbacks/` 下 7 个文件 |
| 需求输出 | 0 | `iterations/requirements/` 目录不存在，静默降级 |
| 产品概述 | 非空 | `product/overview.md` 存在 |
| 产品路线图 | 空 | `product/roadmap.md` 不存在，静默降级 |
| 业务指标 | 空 | `metrics.yml` 不存在，返回空结构 |
