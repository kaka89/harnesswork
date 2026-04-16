---
meta:
  id: PRD-001-core-product
  title: OpenWork 核心产品能力
  status: approved
  author: product-owner
  priority: P0
  revision: "1.0"
  impact_scope: single-app
  created: "2026-04-05"
  updated: "2026-04-05"
---

# PRD-001 OpenWork 核心产品能力

<!--
  PRD 是产品知识的活文档（Living Document），始终描述当前产品的真实状态。
  本文档由逆向分析 openwork fork 源码生成，描述 harnesswork 继承的基础能力。
-->

## 元信息
- 编号：PRD-001-core-product
- 作者：product-owner
- 修订版本：1.0
- 创建日期：2026-04-05
- 更新日期：2026-04-05

## 1. 背景

当前 CLI 和 GUI 工具（如 opencode CLI/TUI）主要面向开发者，聚焦于文件 diff、工具名称等技术细节，扩展能力依赖 CLI 暴露，难以面向非技术用户和团队协作场景。

harnesswork 基于 [OpenWork](https://github.com/different-ai/openwork) fork，OpenWork 是 Claude Code/Codex 桌面应用的开源替代品。OpenWork 在 opencode（AI 编码引擎）之上，提供面向个人和团队的可扩展 AI 工作流体验层——包含桌面端、服务端、CLI 编排器多种运行形态。

**产品定位**：
- OpenCode 是**引擎**：提供 AI 编码能力和 API
- OpenWork 是**体验层**：提供引导式上手、安全权限管理、进度可视化、工件管理和高品质 UI

## 2. 目标用户

| 用户角色 | 描述 | 核心诉求 |
|---------|------|---------|
| 工程师（Bob）| 负责创建和配置 AI 工作流的技术人员 | 便捷地创建、分享、管理 Skills/Agent 配置 |
| 业务用户（Susan）| 消费 AI 工作流的非技术用户 | 零门槛地触发和使用自动化流程 |
| 团队管理员 | 负责团队 Skill Hub 和权限管理 | 统一分发审批过的 Skills，管理成员访问 |

## 3. 功能说明

### 3.1 用户故事

**Host 模式 — 本地 AI 运行时**
> As a 工程师,
> I want to 在本地一键启动 OpenCode 运行时并通过 UI 驱动它,
> So that 无需手动操作 CLI 即可享受完整的 AI 编码辅助能力。

**Client 模式 — 远程服务连接**
> As a 工程师,
> I want to 通过 URL 连接远程 OpenCode Server（包括 OpenWork Cloud Workers）,
> So that 可以在任何设备上访问团队共享的 AI 工作流。

**Session 管理**
> As a 工程师,
> I want to 创建、切换会话并向 AI 发送指令,
> So that 可以管理多个并行的 AI 工作上下文。

**实时进度查看**
> As a 工程师,
> I want to 以时间轴形式查看 AI 执行的 TODO 步骤和进度流,
> So that 随时了解 AI 正在做什么，任务完成情况一目了然。

**权限管理**
> As a 工程师,
> I want to 对 AI 发起的敏感操作（文件写入、命令执行）进行逐步授权,
> So that 保持对 AI 行为的可控性，避免误操作。

**Skills 管理**
> As a 工程师,
> I want to 安装、管理本地 Skills 并从团队 Skill Hub 导入审批过的 Skills,
> So that 快速扩展 AI 工作流能力而无需手动配置文件。

**Automations 自动化**
> As a 工程师,
> I want to 配置 Background Agent 定时自动执行任务,
> So that 重复性工作可以无人值守地完成。

**Templates 工作流模板**
> As a 工程师,
> I want to 将常用的 AI 工作流保存为可复用的模板,
> So that 一键复现成功的操作序列。

### 3.2 功能清单

| 编号 | 功能模块 | 优先级 | 描述 |
|------|---------|--------|------|
| FR-01 | Host 模式 | P0 | 本地启动 opencode 运行时（openwork-orchestrator 或 direct 模式），管理本地 opencode 进程生命周期 |
| FR-02 | Client 模式 | P0 | 通过 URL 连接已有 OpenCode Server，支持 `Add a worker → Connect remote` |
| FR-03 | Session 管理 | P0 | 创建/选择 Session，发送 Prompt，查看历史消息；折叠/展开 workspace session 列表 |
| FR-04 | 实时 SSE 流 | P0 | 订阅 `/event` SSE 端点，实时展示 AI 输出；批量批次防止闪烁（stream batch） |
| FR-05 | Execution Plan | P0 | 将 opencode todos 渲染为时间轴/进度视图 |
| FR-06 | 权限审批 | P0 | 拦截工具调用权限请求（allow once / always / deny），支持 auto 和手动两种模式 |
| FR-07 | Skills 管理 | P1 | 列出已安装 `.opencode/skills`，导入本地 Skill 目录，从团队 Skill Hub 发现和安装 Skills |
| FR-08 | Plugin 管理 | P1 | 读写 `opencode.json`，管理 Project/Global 范围的 opencode 插件（MCP、工具等） |
| FR-09 | Automations | P1 | 配置 Background Agent 和定时/触发式任务，管理自动化任务的运行状态 |
| FR-10 | Templates | P1 | 保存/复用常用工作流模板（本地存储） |
| FR-11 | Workspace 管理 | P0 | Folder Picker（Tauri dialog plugin），工作目录选择与切换 |
| FR-12 | 连接管理 | P0 | 管理多个 OpenCode Server 连接，支持本地和远程服务器 |
| FR-13 | 调试导出 | P2 | 从 Settings → Debug 导出运行时调试报告和开发者日志 |
| FR-14 | Den Cloud 集成 | P2 | OpenWork Cloud 鉴权（OAuth/邮箱），Cloud Worker 管理，Org 团队 Skill Hub |
| FR-15 | i18n 多语言 | P2 | 前端国际化支持（en 为基准语言，已提取 session、pages 等区域翻译） |

### 3.3 非功能需求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首次渲染时间 | < 2s | 桌面端冷启动到 UI 可交互 |
| SSE 流延迟 | < 200ms | 服务端到 UI 渲染的端到端延迟 |
| 并发 Session | ≥ 10 | 单客户端同时活跃的 Session 数 |
| 离线可用性 | Host 模式完整可用 | 不依赖网络可正常运行本地工作流 |
| 平台兼容性 | macOS / Linux；Windows（付费支持） | 通过 Tauri 多平台构建 |
| 安全 — 权限隔离 | Dev 模式独立 opencode 状态 | `OPENWORK_DEV_MODE=1` 隔离个人全局配置 |

## 4. 验收标准

- [x] 桌面端可本地启动（Host 模式）并建立 opencode 连接
- [x] 可创建/选择 Session 并发送 Prompt，接收 SSE 实时流
- [x] Execution Plan 以时间轴形式显示 AI todos 进度
- [x] 权限请求弹窗可正常响应（allow once / always / deny）
- [x] Skills 管理器可列出、导入本地 Skill
- [x] Workspace Folder Picker 可正常选择目录
- [x] 可通过 URL 连接远程 OpenCode Server（Client 模式）
- [ ] Automations Background Agent 定时任务全流程可用
- [ ] Den Cloud Worker 连接与 Org Skill Hub 分发

## 5. 影响范围

### 5.1 影响分类
single-app — harnesswork 为独立桌面客户端应用，无跨应用依赖。

### 5.2 受影响应用/领域
| 应用/领域 | 影响类型 | 关联 PRD | 说明 |
|-----------|---------|---------|------|
| harnesswork（本应用）| 主要 | — | 核心产品能力全量覆盖 |

### 5.3 跨应用数据/事件依赖
- **上游依赖**：opencode CLI（`@opencode-ai/sdk/v2/client`），通过 REST + SSE 通信
- **云端依赖**（可选）：OpenWork Cloud（Den）服务，用于 Cloud Worker 和 Org 功能

## 6. 关联扩展

本 PRD 描述 harnesswork 继承的 OpenWork 基础能力。星静（Xingjing）在此基础上的扩展能力详见：
- [PRD-003 星静独立版产品能力](PRD-003-xingjing-solo.md) — 产品管理、AI 对话、Autopilot、知识系统、Agent 工坊等
- [PRD-002 双模式工作区](PRD-002-dual-mode-workspace.md) — 入口选择页与工程驾驶舱

## 7. 修订历史

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| 1.0 | 2026-04-05 | 初始版本 — 基于 openwork fork 源码逆向生成，覆盖 harnesswork 继承的全部基础能力 |
| 1.1 | 2026-04-15 | 补充关联扩展章节，指向 PRD-002 和 PRD-003 |
