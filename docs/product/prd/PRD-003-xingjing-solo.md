---
meta:
  id: PRD-003-xingjing-solo
  title: 星静独立版产品能力
  status: approved
  author: product-owner
  priority: P0
  revision: "1.0"
  impact_scope: single-app
  created: "2026-04-15"
  updated: "2026-04-15"
---

# PRD-003 星静独立版产品能力

<!--
  PRD 是产品知识的活文档（Living Document），始终描述当前产品的真实状态。
  本文档由逆向分析 xingjing 模块源码生成，描述星静独立版在 harnesswork 上的全部扩展能力。
-->

## 元信息
- 编号：PRD-003-xingjing-solo
- 作者：product-owner
- 修订版本：1.0
- 创建日期：2026-04-15
- 更新日期：2026-04-15

## 1. 背景

harnesswork 在继承 OpenWork 基础能力（PRD-001）和双模式工作区（PRD-002）的基础上，进一步扩展了星静（Xingjing）独立版产品能力。星静独立版面向创业者和小型团队，提供 AI 驱动的全流程产品开发协作平台，覆盖产品管理、AI 对话、自动化工作流、知识系统、Agent 工坊等核心领域。

**核心定位**：
- 本地优先、离线可用的 AI 产品研发助手
- Solo Monorepo 模式为主，兼容 Team 多仓库模式
- 通过 Autopilot 两阶段编排实现多 Agent 协作
- 三源知识融合提供上下文感知的 AI 辅助

## 2. 目标用户

| 用户角色 | 描述 | 核心诉求 |
|---------|------|---------|
| 创业者（Solo 模式） | 独立开发者或早期创业团队 | 用一个工具管理产品全链路，AI 辅助提效 |
| 产品经理 | 负责需求文档和产品规划 | 结构化管理 PRD/SDD，AI 辅助文档生成 |
| 工程师 | 负责代码开发和 Agent 配置 | AI 对话辅助编码，Autopilot 自动化任务 |
| 技术负责人 | 负责架构决策和质量管控 | 知识沉淀、流水线编排、DORA 指标监控 |

## 3. 功能说明

### 3.1 用户故事

**产品管理**
> As a 创业者,
> I want to 创建产品并自动初始化标准化目录结构（文档/代码/配置），
> So that 从项目第一天就有规范的工程结构，避免后期重构。

**AI 对话**
> As a 工程师,
> I want to 在侧边抽屉中与 AI 对话，获得流式实时回复和工具调用结果，
> So that 不离开当前工作界面即可获得 AI 编码辅助。

**Autopilot 自动化**
> As a 技术负责人,
> I want to 输入一个目标，由 Orchestrator 自动分解任务并分派给多个专业 Agent 并发执行，
> So that 复杂任务可以自动化完成，减少人工协调开销。

**知识检索**
> As a 工程师,
> I want to Agent 在执行任务前自动检索相关知识（行为知识/私有笔记/工作空间文档）并注入上下文，
> So that AI 回答更准确，避免重复回答已有文档覆盖的问题。

**Agent 工坊**
> As a 工程师,
> I want to 在可视化界面中发现、配置和测试 Agent，
> So that 无需手动编辑 Markdown 文件即可管理 AI 工作流。

### 3.2 功能清单

| 编号 | 功能模块 | 优先级 | 描述 |
|------|---------|--------|------|
| FR-01 | Solo 产品创建 | P0 | 通过 NewProductModal 创建产品，输入名称/英文编码/工作目录/Git URL；支持 Solo（Monorepo）和 Team（多仓库）两种产品类型；产品信息持久化至 `~/.xingjing/products.yaml` |
| FR-02 | 产品目录自动初始化 | P0 | Solo 模式四层目录：governance-standards（平台层）→ {product-line}（产品线层）→ {domain}（领域层）→ apps/{app}（应用层）；每层预生成标准文件（docs/、tests/、config）；Team 模式六层支持独立 Git 仓库 |
| FR-03 | AI 对话抽屉 | P0 | 侧边滑出式对话界面（默认 400px 宽，可拖拽调宽）；SSE 流式消息渲染；工具调用过程展示（名称/参数/结果）；支持权限审批（allow once / always / deny）；通过 OpenCode SDK 管理 Session |
| FR-04 | Autopilot 自动化工作流 | P0 | 两阶段编排：Orchestrator 解析用户意图生成 `<DISPATCH>` 计划 → 多 Agent 并发 SSE 执行；内置 Agent 集：产品脑（pm-agent）、工程脑（eng-agent）、增长脑（growth-agent）等；支持 @mention 直接调用指定 Agent；工件工作区展示执行结果 |
| FR-05 | Agent 工坊 | P1 | 文件驱动 Agent 发现（`.opencode/agents/*.md`）+ 内置常量兜底；Agent 注册表管理（YAML frontmatter 解析）；Agent 日志记录；可视化 Agent 创建、技能编辑、测试运行 |
| FR-06 | 知识体系 | P1 | 三源知识融合：行为知识（OpenWork Skill API）+ 私有知识（`.xingjing/` 目录）+ 工作空间文档（dir-graph.yaml 驱动扫描）；TF-IDF 关键词检索 + 多维排序（场景匹配/文档链路距离/层级近邻度/时间衰减）；知识健康度检测与过期提醒；知识沉淀（Agent 产出自动分流到行为/私有记忆） |
| FR-07 | 主布局与侧边导航 | P0 | 左侧侧边栏（Logo + 产品切换器 + Energy Mode 选择器 + 角色菜单）；顶部 Header（面包屑 + 操作按钮）；AI 悬浮按钮（可拖拽、位置持久化）；Solo/Team 双模式菜单项切换；主题切换（亮色/暗色/跟随系统） |
| FR-08 | 认证与身份管理 | P1 | JWT 认证流程（调用 xingjing-server `/api/v1/auth/*` 端点）；Token 持久化（localStorage key: `xingjing_auth_token`）；登录/注册/个人资料/密码修改/账户删除；SolidJS 响应式状态（currentUser/authLoading 信号） |
| FR-09 | 流水线与调度 | P2 | DAG 流程配置（orchestrator.yaml 驱动，手写 YAML 解析器）；拓扑排序分层执行（并行/串行混合）；门控策略（auto / await-approval 人工审批）；失败重试（maxRetries）；定时任务客户端（Cron 表达式，OpenWork Scheduler → 文件存储降级） |
| FR-10 | API 集成层与 Mock 降级 | P0 | 统一 HTTP 客户端（自动 Bearer token 注入）；8 个 API 模块（products/prds/tasks/backlog/sprints/knowledge/metrics/aiSessions）；useApi Hook（API 优先 + Mock 自动降级，loading/error/isUsingFallback 状态）；14 个 Mock 数据文件全覆盖 |

### 3.3 非功能需求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 离线可用性 | 100%（Solo 模式） | 所有数据本地持久化，不依赖网络 |
| 产品初始化时间 | < 3s | 含目录创建 + Git init |
| AI 对话首条消息延迟 | < 1s | SSE 流第一个 token 到达 UI |
| Autopilot 编排延迟 | < 5s | Orchestrator 意图解析到第一个 Agent 开始执行 |
| 知识检索延迟 | < 500ms | 含缓存命中场景 |
| 知识索引构建时间 | < 10s | 首次全量扫描（100+ 文档） |
| 存储占用 | < 50MB | `.xingjing/` 目录含 200 个历史会话 |
| Mock 降级切换 | 无感知 | API 不可用时自动降级，UI 无异常 |

## 4. 验收标准

- [x] 可通过 NewProductModal 创建 Solo/Team 产品，信息持久化到 `~/.xingjing/products.yaml`
- [x] Solo 模式自动生成四层标准目录结构
- [x] Team 模式自动生成六层多仓库目录结构
- [x] AI 对话抽屉可正常打开，流式展示 AI 回复
- [x] Autopilot 可接受用户目标并分派到多个 Agent 并发执行
- [x] @mention 可直接调用指定 Agent
- [x] Agent 工坊页面可发现和展示已注册 Agent
- [x] 知识检索可返回三源融合的排序结果
- [x] 主布局侧边栏正确展示 Solo/Team 模式菜单
- [x] 认证流程（登录/注册）可正常完成
- [x] API 不可用时自动降级到 Mock 数据
- [ ] 流水线 DAG 执行含人工审批门控全流程可用
- [ ] 定时调度 Cron 任务正常触发

## 5. 影响范围

### 5.1 影响分类
single-app — 星静独立版为 harnesswork 内嵌模块，所有变更限于 `apps/app/src/app/xingjing/` 目录。

### 5.2 受影响应用/领域
| 应用/领域 | 影响类型 | 关联 PRD | 说明 |
|-----------|---------|---------|------|
| harnesswork（本应用） | 主要 | PRD-001, PRD-002 | 在 OpenWork 基础能力上扩展星静独立版功能 |
| xingjing-server | 辅助 | — | 认证 API 后端（Go 服务） |

### 5.3 跨应用数据/事件依赖
- **内部依赖**：复用 PRD-001 的 Session 管理（FR-03）、权限审批（FR-06）、Skills 管理（FR-07）
- **内部依赖**：复用 PRD-002 的双模式工作区（FR-01~FR-03）、驾驶舱容器（FR-02）
- **外部依赖**：xingjing-server 提供 `/api/v1/auth/*` 认证端点
- **存储依赖**：`~/.xingjing/` 目录用于本地持久化（products.yaml、preferences.yaml、memory/）

## 6. 修订历史

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| 1.0 | 2026-04-15 | 初始版本 — 基于 xingjing 模块源码逆向生成，覆盖独立版全部扩展能力 |
