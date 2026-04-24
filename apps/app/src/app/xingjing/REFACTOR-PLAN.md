# 星静独立版重构设计方案

## 一、重构核心原则

**一句话**：星静 = OpenWork 全能力集成的产品研发垂直 UI + OpenWork 不具备的业务逻辑层。

| 原则 | 描述 |
|------|------|
| **OpenWork 能力全面引入** | 六大扩展原语（Skills/Plugins/MCP/Agents/Commands/Bash）、会话、SSE、权限、文件浏览、模型配置、多渠道消息接入等 100% 使用 OpenWork 原生能力 |
| **概念层不可替代，实现层可复用** | 产品目录、知识图谱等业务抽象必须保留；底层 Client/SSE/Auth/文件操作一律复用 |
| **零独立 Client 创建** | 星静不再维护任何 OpenCode Client 实例，完全依赖 OpenWork props 注入 |
| **产品 = OpenWork Workspace 映射** | 星静的"产品切换"映射到 OpenWork 的 workspace 切换，不再维护独立产品注册表 |
| **文件夹访问默认全放行** | 星静产品工作目录下的文件夹访问默认设为 "always allow"，消除频繁权限弹窗 |
| **三种运行模式保留** | 桌面本地（Mode A）、Web/云（Mode B）、CLI 服务器（Mode C）三模式保留不动 |

---

## 二、能力拆分矩阵

### 2.1 可移除（OpenWork 已完全覆盖）

| 当前模块 | 文件 | 大小 | 替代方案 |
|---------|------|------|---------|
| OpenCode Client 管理 | `opencode-client.ts` 的 Client 创建/降级逻辑 | 91KB 中约 60% | 完全使用 `props.opencodeClient` 注入 |
| 认证服务 | `auth-service.ts` | 6.5KB | OpenWork 原生 Auth |
| 会话状态管理 | `session-store.ts` | 3.6KB | OpenWork `sessionStatusById` |
| 聊天会话持久化 | `chat-session-store.ts` | 4.0KB | OpenWork Session History |
| 消息累积器 | `message-accumulator.ts` | 11.7KB | OpenWork SSE 事件流直接消费 |
| 会话编排器 | `team-session-orchestrator.ts` | 17.5KB | OpenWork Session API (`session.create/prompt`) |
| 定时任务调度 | `scheduler-client.ts` | 4.6KB | 已有 OpenWork 原生化改造计划 |
| 独立 HTTP Client | `api/client.ts` | 67行 | OpenWork Server API |
| API 聚合层 | `api/index.ts` 中大部分端点 | 174行 | 文件操作走 OpenWork file API，AI 走 session API |
| Skill 管理 | `skill-manager.ts` | 3.9KB | OpenWork Skills Manager UI |
| 全部 Mock 数据 | `mock/*.ts`（14 个文件） | ~3200行 | 本地文件系统真实数据 |
| 四层降级通道 | `opencode-client.ts` 中 L0-L3 路由 | ~300行 | OpenWork 统一管理连接健康 |
| 星静独立大模型配置 | Settings 页面 LLM 配置部分 | - | 打通 OpenWork model/provider 管理 |

**预计可移除代码量**：约 **170KB+**（services + api + mock + 冗余设置）

### 2.2 需大幅瘦身重构

| 当前模块 | 文件 | 当前大小 | 重构方向 | 预估瘦身后 |
|---------|------|---------|---------|-----------|
| `opencode-client.ts` | services/ | 91KB | 移除 Client 管理/降级/SSE 管理，仅保留文件格式封装（YAML/frontmatter 读写）和 `fileRead/fileWrite` 薄代理 | ~15KB |
| `product-store.ts` | services/ | 21.5KB | 映射到 OpenWork workspace，移除独立产品注册表，仅保留 `.xingjing/config.yaml` 读写 | ~8KB |
| `file-store.ts` | services/ | 50.7KB | 移除多层降级探测逻辑，直接调用 OpenWork 注入的 file ops | ~15KB |
| `product-dir-structure.ts` | services/ | 72.8KB | 保留目录模板生成逻辑，移除 Team 六层结构（仅保留 Solo），简化代码 | ~25KB |

### 2.3 必须保留（OpenWork 不具备的星静独有能力）

#### A. 产品目录工程

| 模块 | 文件 | 说明 |
|------|------|------|
| 目录结构生成 | `product-dir-structure.ts`（瘦身后） | Solo 五层扁平目录 + `dir-graph.yaml` 生成 |
| 文件格式服务 | `file-store.ts`（瘦身后） | YAML/Markdown frontmatter 解析序列化 |
| Git 同步 | `git-sync.ts` | 产品级 git push/pull/commit |
| 产品配置 | `product-store.ts`（瘦身后） | `.xingjing/config.yaml` 读写、产品元数据 |

#### B. 知识库子系统（6 服务 + 12 组件）

| 模块 | 文件 | 说明 |
|------|------|------|
| 知识扫描 | `knowledge-scanner.ts` (28KB) | dir-graph.yaml 驱动的文档扫描引擎 |
| 知识索引 | `knowledge-index.ts` (16KB) | TF-IDF 倒排索引 + 7 维融合排序 |
| 知识检索 | `knowledge-retrieval.ts` (7KB) | 缓存管理 + 条件搜索 |
| 知识健康度 | `knowledge-health.ts` (11KB) | 文档完整性评估 + 过期检测 |
| 知识沉淀 | `knowledge-sink.ts` (12KB) | Agent 产出按角色自动分流 |
| 知识行为 | `knowledge-behavior.ts` (6KB) | Skill API 适配层 |
| 知识库 UI 组件 | `components/knowledge/*` (11 个) | 三栏布局、文档树、搜索等 |

#### C. Autopilot 编排引擎（简化）

| 模块 | 文件 | 说明 |
|------|------|------|
| 编排执行器 | `autopilot-executor.ts` (改造瘦身) | 移除独立 Agent 分派，改为通过 OpenWork @mention + session API 调度 |
| Agent 注册表 | `agent-registry.ts` (13KB) | 6 个 Solo Agent 定义与发现（保留） |
| Agent 日志 | `agent-logger.ts` (1.6KB) | 执行日志追踪（保留） |
| Pipeline 配置 | `pipeline-config.ts` (5KB) | DAG 拓扑配置（保留） |
| Pipeline 执行器 | `pipeline-executor.ts` (16KB) | 拓扑排序分层执行（保留） |
| Skill 注册表 | `skill-registry.ts` (5KB) | 内置 Skill 定义与自动写入（保留） |

#### D. 洞察与记忆引擎

| 模块 | 文件 | 说明 |
|------|------|------|
| 洞察执行器 | `insight-executor.ts` (19KB) | AI 驱动的运营洞察生成 |
| 洞察存储 | `insight-store.ts` (9KB) | 洞察记录 CRUD |
| 记忆存储 | `memory-store.ts` (13KB) | 长期记忆持久化 |
| 记忆检索 | `memory-recall.ts` (5KB) | 上下文相关记忆召回 |

#### E. 业务桥接

| 模块 | 文件 | 说明 |
|------|------|------|
| 需求-开发桥 | `requirement-dev-bridge.ts` (5KB) | 假设验证 -> 需求 -> 开发任务流转 |
| Web 搜索 | `web-search.ts` (4KB) | AI 辅助的外部信息检索 |

#### F. Solo 模式 UI 页面

| 页面 | 路由 | 核心价值 | 变更说明 |
|------|------|---------|----------|
| 驾驶舱 | `/solo/autopilot` | 统一 AI 会话界面，复用 OpenWork 原生会话能力 | **大幅简化**（见下方详细设计） |
| 今日焦点 | `/solo/focus` | 每日启动页（AI 简报 + 任务清单 + 商业快照） | 保留不变 |
| 产品洞察 | `/solo/product` | 10 路并发数据加载 + 假设看板 + AI 突发奇想 | 保留不变 |
| 产品研发 | `/solo/build` | 任务卡片 + DoD + 代码审查面板 | 保留不变 |
| 发布管理 | `/solo/release` | 一键部署 + 特性开关 + 发布时间轴 | 保留不变 |
| 数据复盘 | `/solo/review` | 商业指标仪表盘 + AI 洞察 | 保留不变 |
| 个人知识库 | `/solo/knowledge` | 三栏布局 + 四源统一浏览 + TF-IDF 检索 | 保留不变 |
| AI 搭档工坊 | `/solo/agent-workshop` | Agent/Skill 可视化管理与拖拽分配 | 保留不变 |
| 设置 | `/solo/settings` | 星静专属配置 + OpenWork 原生能力页签集成 | **重构**（见下方详细设计） |

#### G. 驾驶舱（Autopilot）简化设计

当前驾驶舱存在 "会话模式" 和 "团队模式" 双模切换、独立 Agent 面板、独立产出物工作区等重复建设。重构后合二为一：

**移除**：
- Agent 侧边面板（各角色实时执行状态展示）
- 产出物工作区面板（可 resize/悬浮的 artifact viewer）
- "团队模式" 与 "会话模式" 的双模切换 UI
- 独立的 SSE 流式消息处理逻辑（`message-accumulator.ts`）

**保留并改造**：
- EnhancedComposer 输入框 -- 保留 @mention Agent 和 /slash 命令能力，底层改为调用 OpenWork `sendPrompt()`
- 会话历史侧边栏 -- 复用 OpenWork 原生 `workspace-session-list` 组件
- 知识注入能力 -- 执行前自动检索知识注入上下文（星静独有）

**新增/替代**：
- 消息流渲染 -- 直接复用 OpenWork 的 `MessageList` + `part-view` 组件，获得原生的工具调用展示、Markdown 渲染、artifact 链接检测
- 产出物浏览 -- 当用户需要查看产出物时，跳转/嵌入 OpenWork 原生 session 页面，复用其 artifact 侧边栏（支持文件打开、代码高亮、working files 追踪）
- 权限审批 -- 复用 OpenWork 原生 permission dialog

**最终效果**：驾驶舱简化为「星静定制 Composer + OpenWork 原生消息流/产出物/权限能力」的组合体，代码量预计减少 60%+。

#### H. 设置页面重构设计

当前星静设置页面维护独立的 LLM 配置和有限的配置项。重构后完整引入 OpenWork 六大扩展原语：

**新增页签（路由到 OpenWork 原生页面或嵌入）**：

| 页签 | 对应 OpenWork 页面 | 说明 |
|------|-------------------|------|
| 模型管理 | `settings/model` | 替代星静独立 LLM 配置，打通 Provider/模型选择/API Key 管理 |
| 扩展中心 | `pages/extensions.tsx` | MCP 服务器 + Plugins 双标签，统一管理 |
| Plugins | `pages/plugins.tsx` | 插件安装/启用/禁用/作用域切换（project/global） |
| MCP | `pages/mcp.tsx` | MCP 服务器连接状态/配置/快速接入目录 |
| Skills | `pages/skills.tsx` | 已安装 Skill / Cloud Hub / 分享 / 安装 |
| 自动化 | `pages/automations.tsx` | 定时任务模板/Cron 调度/执行追踪 |
| 消息通道 | `pages/identities.tsx` | Slack/Telegram 多渠道消息接入配置 |
| 文件浏览 | OpenWork file browser | 工作区文件浏览与搜索（`client.find.*`） |
| 外观 | `settings/appearance` | 主题/语言/标题栏 |

**保留的星静专属页签**：
- 产品配置（`.xingjing/config.yaml` 读写）
- Git 同步配置
- 知识库健康度总览

---

## 三、重构后架构分层

```
+---------------------------------------------------------------+
|  UI 层 (保留 + 简化)                                             |
|  pages/solo/* (9个页面) + components/*                           |
|  驾驶舱(简化) | 焦点 | 洞察 | 研发 | 发布 | 复盘 | 知识库 | 工坊 | 设置(扩展) |
+---------------------------------------------------------------+
|  星静业务服务层 (保留+瘦身)                                       |
|  知识库引擎 | Autopilot编排(简化) | 洞察引擎 | 记忆系统 | 产品目录工程 |
+---------------------------------------------------------------+
|  OpenWork 桥接层 (新建，薄代理)                                   |
|  XingjingBridge: 接收 OpenWork props，暴露统一 API               |
|  - client: OpenWork 注入的 OpenCode client                      |
|  - fileOps: OpenWork file read/write                            |
|  - session: OpenWork session API + sendPrompt                   |
|  - model: OpenWork model/provider config                        |
|  - workspace: OpenWork workspace context                        |
|  - messaging: OpenWork Router (Slack/Telegram) API              |
|  - fileBrowser: OpenWork find.text/files/symbols                |
|  - permissions: OpenWork permission (default always-allow)       |
|  - extensions: OpenWork MCP/Plugins/Skills/Commands/Agents/Bash  |
+---------------------------------------------------------------+
|  OpenWork 平台层 (不修改，只消费)                                  |
|  六大扩展原语 | 会话+SSE | 权限 | 文件浏览/搜索 | 模型管理         |
|  多渠道消息接入 | 三种运行模式 | Auth | Skill管理 | 自动化          |
+---------------------------------------------------------------+
```

---

## 四、核心重构任务

### Task 1: 新建 XingjingBridge 桥接层

**目标**：替代当前 `opencode-client.ts` 中的 Client 管理逻辑，建立星静与 OpenWork 的全能力桥接。

**文件**：`services/xingjing-bridge.ts`（新建，约 300 行）

**职责**：
- 接收 OpenWork 注入的 `opencodeClient`、`sessionStatusById`、`selectedModel`
- 接收 OpenWork 注入的 `fileOps`（read/write/list）和 `workspaceId`
- 接收 OpenWork 原生页面路由回调（`goToSettings(tab)`、`goToSession(id)`）
- 接收 OpenWork 的 `messagesBySessionId`、`ensureSessionLoaded`、`sendPrompt` 能力
- 接收 OpenWork 的 `fileBrowser`（`find.text/files/symbols`）能力
- 接收 OpenWork 的 `messaging`（Router identities/bindings）能力
- 接收 OpenWork 的 `extensions`（MCP/Plugins 状态查询）能力
- 暴露统一 API：`getClient()`、`getFileOps()`、`getWorkspaceId()`、`navigateTo()`
- 提供 `isReady()` 信号用于 UI 层判断连接状态
- **不再有任何 Client 创建或降级逻辑**
- **默认将产品工作目录设为 always-allow 权限**

### Task 2: 瘦身 opencode-client.ts

**目标**：从 91KB 瘦身到 ~15KB。

**移除**：
- `_sharedClient`/`_localClient` 双路径管理
- `_preferredReadLevel`/`_preferredListLevel` 四层降级探测
- SSE 超时策略（`SSE_INACTIVITY_TIMEOUT_MS` 等）
- `waitForHealthy()` 健康检查
- `safeFetch()` Tauri fetch 兼容
- `RETRY_DELAYS` 断线重试

**保留**（重命名为 `services/file-ops.ts`）：
- `fileRead(path)` / `fileWrite(path, content)` — 薄代理，委托给 Bridge 层
- `fileList(dir)` — 薄代理
- `expandTildePath(path)` — 路径展开工具
- `setWorkingDirectory()` — 产品切换时更新工作目录

### Task 3: 产品注册表映射到 OpenWork Workspace

**目标**：消除 `~/.xingjing/products.yaml` 独立注册表，将产品概念映射到 OpenWork Workspace。

**重构 `product-store.ts`**：
- 创建产品 = 在指定目录下初始化 `.xingjing/` 骨架 + 在 OpenWork 中创建对应 Workspace
- 切换产品 = 切换 OpenWork Workspace（OpenWork 已有 workspace 切换 UI）
- 产品元数据（name/code/productType）保留在 `.xingjing/config.yaml`
- 产品列表由 OpenWork workspace 列表驱动，`.xingjing/config.yaml` 存在则标识为星静产品
- **移除** localStorage 兜底、独立偏好文件、resolveOpenCodeBaseUrl 等

### Task 4: 移除独立认证层

**移除文件**：`auth-service.ts`

**影响范围**：
- Settings 页面的认证配置 → 指向 OpenWork Settings
- `api/client.ts` 中的 JWT Token 注入 → 不再需要
- xingjing-server 的 auth 端点仍保留（SaaS 付费场景），但前端不再独立管理

### Task 5: 移除独立会话管理层 + 驾驶舱简化

**移除文件**：
- `session-store.ts` → 复用 OpenWork `sessionStatusById`
- `chat-session-store.ts` → 复用 OpenWork Session History
- `message-accumulator.ts` → SSE 事件直接消费 OpenWork 事件流

**改造 `autopilot-executor.ts`**：
- `createSession()` 改为调用 Bridge 层的 `bridge.session.create()`
- `promptSession()` 改为调用 OpenWork 原生 `sendPrompt()` 而非手动 `session.command()`
- SSE 事件消费改为监听 OpenWork 的全局消息 store（`messagesBySessionId`）
- 移除独立的 Agent 分派面板逻辑，Agent 调度通过 @mention 在 Composer 中完成

**驾驶舱页面改造** (`pages/solo/autopilot/index.tsx`)：
- 移除：Agent 面板、产出物工作区面板、"团队/会话" 双模切换
- 保留：EnhancedComposer（改为调用 `sendPrompt`）、知识注入、会话侧边栏
- 新增：复用 OpenWork `MessageList` + `part-view` 渲染消息流
- 新增：产出物浏览跳转到 OpenWork 原生 session 页面（`goToSession(id)`）

### Task 6: 移除 API 聚合层和 Mock 层

**移除文件**：
- `api/client.ts` — 独立 HTTP Client
- `api/index.ts` — 中的 `productsApi`、`prdsApi`、`tasksApi`、`backlogApi`、`sprintsApi`、`knowledgeApi`、`metricsApi` 全部移除（数据来源改为本地文件系统通过 file-ops 读写）
- `api/index.ts` — 中的 `aiSessionsApi` 移除（改用 OpenWork session API）
- `mock/*.ts` — 全部 14 个 Mock 文件

**保留**：
- `api/types.ts` — 类型定义仍有价值
- 如需与 xingjing-server 通信的端点（license/subscription/payment/ai-usage），新建 `services/saas-api.ts`

### Task 7: 设置页面重构 — 六大扩展原语 + 模型管理打通 + 多渠道接入

**目标**：星静设置页面完整引入 OpenWork 六大扩展原语管理能力，打通模型配置，接入多渠道消息。

**实现方式**：通过 Bridge 层的 `navigateTo()` 路由到 OpenWork 原生页面，或嵌入 OpenWork 组件。

**新增页签**：

| 页签 | 实现方式 | 对应 OpenWork 原生页面 |
|------|---------|----------------------|
| 模型管理 | 路由跳转 | `settings/model` — Provider 配置 + API Key 管理 + 默认模型选择 |
| Plugins | 路由跳转 | `pages/plugins.tsx` — 建议插件 + 安装向导 + 作用域切换 |
| MCP 服务器 | 路由跳转 | `pages/mcp.tsx` — 连接状态 + 快速接入目录（Notion/Linear/Sentry/Chrome DevTools 等） |
| Skills | 路由跳转 | `pages/skills.tsx` — 已安装/Cloud Hub/分享/安装 |
| 自动化 | 路由跳转 | `pages/automations.tsx` — 定时任务模板 + Cron 调度 |
| 消息通道 | 路由跳转 | `pages/identities.tsx` — Slack/Telegram 消息接入配置 |
| 外观 | 路由跳转 | `settings/appearance` — 主题/语言 |

**改造现有页签**：
- 「大模型配置」 → 移除星静独立的 LLM 配置 UI，替换为跳转到 OpenWork `settings/model`
- 星静专属配置（产品元数据、Git 同步、知识库健康度）保留

### Task 8: 文件浏览器与搜索能力引入

**目标**：在星静中提供 OpenWork 原生的文件浏览和搜索能力。

**实现方式**：
- 通过 Bridge 层暴露 `fileBrowser` API（`client.find.text()`, `client.find.files()`, `client.find.symbols()`）
- 在知识库页面和产品研发页面中集成文件搜索能力
- 设置页面新增「文件浏览」页签，可浏览当前产品工作区文件树
- 复用 OpenWork 的 `context-panel` 或 `inbox-panel` 组件展示工作区文件

### Task 9: 文件夹访问默认 always-allow

**目标**：消除星静产品工作目录下的频繁权限弹窗。

**实现方式**：
- 在产品初始化（`product-store.ts` 创建产品）时，自动将产品工作目录加入 OpenWork 的 authorized folders（`client.permission.reply({ reply: 'always' })`）
- 在 XingjingBridge 初始化时，检查当前产品工作目录是否已授权，未授权则自动授权
- 保留 OpenWork 原生的权限审批 UI 用于工作目录之外的文件访问

### Task 10: 迁移 Team 模式页面至 `pages/team/` 目录

**依据**：AGENTS.md 明确声明 "All current feature development target the Standalone Edition ONLY"。Team 页面暂时保留不做改造，仅做路径归整。

**迁移规则**：将当前散落在 `pages/` 根目录下的 Team 页面统一迁移到 `pages/team/` 子目录。

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `pages/dashboard/` | `pages/team/dashboard/` | Team DORA 仪表板 |
| `pages/autopilot/` | `pages/team/autopilot/` | Team Autopilot |
| `pages/agent-workshop/` | `pages/team/agent-workshop/` | Team Agent Workshop |
| `pages/requirements/` | `pages/team/requirements/` | Team 需求管理 |
| `pages/design/` | `pages/team/design/` | Team SDD 管理 |
| `pages/sprint/` | `pages/team/sprint/` | Team 迭代管理 |
| `pages/release-ops/` | `pages/team/release-ops/` | Team 发布运维 |
| `pages/planning/` | `pages/team/planning/` | Team 产品规划 |
| `pages/quality/` | `pages/team/quality/` | Team 质量中心 |
| `pages/knowledge/` | `pages/team/knowledge/` | Team 知识中心 |
| `pages/auth/` | `pages/team/auth/` | 独立认证页面 |
| `pages/dev/` | `pages/team/dev/` | 开发工作室 |

**注意事项**：
- 仅做路径迁移，不改造任何 Team 页面代码逻辑
- 更新所有引用这些页面的 import 路径（路由配置、导航组件等）
- Team 路由前缀统一为 `/team/*`，与 Solo 的 `/solo/*` 对称
- `product-dir-structure.ts` 中的 Team 六层结构代码暂时保留，不做删除

### Task 11: 瘦身 file-store.ts

**目标**：从 50.7KB 瘦身到 ~15KB。

**移除**：
- 多层降级探测逻辑
- 重复的通道偏好缓存机制
- 冗余的错误恢复路径

**保留**：
- `readYaml/writeYaml` — YAML 序列化/反序列化
- `readMarkdownWithFrontmatter/writeMarkdownWithFrontmatter` — Markdown frontmatter 处理
- `readDir/readFile/writeFile/deleteFile` — 薄代理，委托给 Bridge 层

---

## 五、重构后文件结构

```
xingjing/
├── pages/
│   ├── solo/                        # 9 个独立版页面（本次重构重点）
│   │   ├── autopilot/               # [大幅简化] 统一会话界面，复用 OpenWork 原生消息流
│   │   ├── focus/                    # [保留] 今日焦点
│   │   ├── product/                  # [保留] 产品洞察
│   │   ├── build/                    # [保留] 产品研发
│   │   ├── release/                  # [保留] 发布管理
│   │   ├── review/                   # [保留] 数据复盘
│   │   ├── knowledge/                # [保留] 个人知识库
│   │   ├── agent-workshop/           # [保留] AI 搭档工坊
│   │   └── settings/                 # [重构] 六大原语 + 模型管理 + 消息通道 + 文件浏览
│   └── team/                        # 12 个 Team 页面（暂保留，仅做路径归整，不改造）
│       ├── dashboard/               # Team DORA 仪表板
│       ├── autopilot/               # Team Autopilot
│       ├── agent-workshop/          # Team Agent Workshop
│       ├── requirements/            # Team 需求管理
│       ├── design/                  # Team SDD 管理
│       ├── sprint/                  # Team 迭代管理
│       ├── release-ops/             # Team 发布运维
│       ├── planning/                # Team 产品规划
│       ├── quality/                 # Team 质量中心
│       ├── knowledge/               # Team 知识中心
│       ├── auth/                    # 独立认证页面
│       └── dev/                     # 开发工作室
├── components/
│   ├── autopilot/                   # [瘦身] 移除 Agent 面板/产出物面板相关组件
│   ├── knowledge/                   # [保留] 知识库 UI 组件
│   ├── insight/                     # [保留] 洞察 UI 组件
│   ├── product/                     # [保留] 产品管理 UI 组件
│   └── common/                      # [保留] 通用组件
├── services/
│   ├── xingjing-bridge.ts           # [新建] OpenWork 全能力桥接层
│   ├── file-ops.ts                  # [重命名+瘦身] 文件操作薄代理
│   ├── file-store.ts                # [瘦身] YAML/Markdown 格式服务
│   ├── product-store.ts             # [瘦身] 产品配置 + Workspace 映射 + 自动授权
│   ├── product-dir-structure.ts     # [瘦身] Solo 目录结构生成
│   ├── git-sync.ts                  # [保留] Git 同步
│   ├── autopilot-executor.ts        # [改造] 改用 OpenWork sendPrompt + messagesBySessionId
│   ├── agent-registry.ts            # [保留] Agent 注册表
│   ├── agent-logger.ts              # [保留] Agent 日志
│   ├── pipeline-config.ts           # [保留] Pipeline 配置
│   ├── pipeline-executor.ts         # [保留] Pipeline 执行
│   ├── skill-registry.ts            # [保留] Skill 注册表
│   ├── knowledge-scanner.ts         # [保留] 知识扫描
│   ├── knowledge-index.ts           # [保留] 知识索引
│   ├── knowledge-retrieval.ts       # [保留] 知识检索
│   ├── knowledge-health.ts          # [保留] 知识健康度
│   ├── knowledge-sink.ts            # [保留] 知识沉淀
│   ├── knowledge-behavior.ts        # [保留] 知识行为
│   ├── insight-executor.ts          # [保留] 洞察引擎
│   ├── insight-store.ts             # [保留] 洞察存储
│   ├── memory-store.ts              # [保留] 记忆系统
│   ├── memory-recall.ts             # [保留] 记忆检索
│   ├── requirement-dev-bridge.ts    # [保留] 需求-开发桥
│   ├── web-search.ts                # [保留] Web 搜索
│   └── saas-api.ts                  # [新建] xingjing-server SaaS 端点
├── stores/
│   └── app-store.tsx                # [瘦身] 移除 Client 注入逻辑
├── types/                           # [保留]
└── utils/
    └── frontmatter.ts               # [保留]
```

**移除的文件/目录清单**：
- `services/opencode-client.ts`（被 `xingjing-bridge.ts` + `file-ops.ts` 替代）
- `services/auth-service.ts`
- `services/session-store.ts`
- `services/chat-session-store.ts`
- `services/message-accumulator.ts`
- `services/team-session-orchestrator.ts`
- `services/scheduler-client.ts`
- `services/skill-manager.ts`
- `api/`（整个目录）
- `mock/`（整个目录，14 个文件）
- `hooks/`（整个目录）
- `components/autopilot/` 中的 Agent 面板和产出物面板组件

**迁移的文件/目录清单**（从 `pages/` 根迁移到 `pages/team/`，保留不改造）：
- `pages/dashboard/` → `pages/team/dashboard/`
- `pages/autopilot/` → `pages/team/autopilot/`
- `pages/agent-workshop/` → `pages/team/agent-workshop/`
- `pages/requirements/` → `pages/team/requirements/`
- `pages/design/` → `pages/team/design/`
- `pages/sprint/` → `pages/team/sprint/`
- `pages/release-ops/` → `pages/team/release-ops/`
- `pages/planning/` → `pages/team/planning/`
- `pages/quality/` → `pages/team/quality/`
- `pages/knowledge/` → `pages/team/knowledge/`
- `pages/auth/` → `pages/team/auth/`
- `pages/dev/` → `pages/team/dev/`

---

## 六、预期收益

| 指标 | 重构前 | 重构后 | 变化 |
|------|--------|--------|------|
| services/ 总代码量 | ~530KB (31 文件) | ~230KB (22 文件) | -57% |
| pages/ 总目录数 | 14 个（散落根目录） | 9 Solo + 12 Team（归整为 solo/ + team/ 两大分区） | 结构清晰化 |
| mock/ 代码量 | ~3200 行 (14 文件) | 0 | -100% |
| api/ 代码量 | ~300 行 (3 文件) | ~50 行 (1 文件) | -83% |
| OpenCode Client 实例管理 | 双路径(shared+fallback) | 零实例（纯注入） | 消除复杂性 |
| 认证逻辑 | 独立 JWT 管理 | OpenWork 原生 | 消除重复 |
| SSE 管理 | 独立超时/重连策略 | OpenWork 原生 | 消除重复 |
| 扩展原语管理 | 仅 Skill（部分） | 六大原语全覆盖 | 能力全面提升 |
| 模型管理 | 独立 LLM 配置 | OpenWork Provider 体系打通 | 消除重复 |
| 消息通道 | 无 | Slack/Telegram 完整接入 | 新增能力 |
| 文件浏览/搜索 | 无 | OpenWork find API 全覆盖 | 新增能力 |
| 权限体验 | 每次弹窗 | 产品目录 always-allow | 体验提升 |
| 驾驶舱页面复杂度 | 双模式+Agent面板+产出物面板 | 单模式+复用OpenWork原生会话 | -60% 代码量 |

---

## 七、OpenWork 能力引入全景图

| OpenWork 能力 | 星静引入方式 | 引入位置 |
|--------------|------------|----------|
| **六大扩展原语** | | |
| - Skills | 设置页签路由到 `pages/skills.tsx` | Settings |
| - Plugins | 设置页签路由到 `pages/plugins.tsx` | Settings |
| - MCP | 设置页签路由到 `pages/mcp.tsx` | Settings |
| - Agents | 通过 @mention 在 Composer 中调用 | Autopilot |
| - Commands | 通过 /slash 在 Composer 中调用 | Autopilot |
| - Bash | 通过 Agent 工具调用自动执行 | Autopilot |
| **文件夹访问** | 默认 always-allow，Bridge 初始化自动授权 | 全局 |
| **多渠道消息接入** | 设置页签路由到 `pages/identities.tsx` | Settings |
| **模型管理** | 替代星静独立 LLM 配置，路由到 `settings/model` | Settings |
| **文件浏览/搜索** | Bridge 暴露 `find.text/files/symbols`，集成到知识库和研发页面 | Knowledge/Build/Settings |
| **三种运行模式** | 保留不动（Desktop/Web-Cloud/CLI） | 全局 |
| **原生会话能力** | 驾驶舱复用 `MessageList` + `part-view` + `sendPrompt` | Autopilot |
| **产出物浏览** | 跳转 OpenWork 原生 session 页面查看 artifact | Autopilot |
| **权限审批 UI** | 复用 OpenWork permission dialog（工作目录外场景） | 全局 |
| **会话历史** | 复用 OpenWork `workspace-session-list` | Autopilot |

---

## 八、执行顺序建议

建议按依赖关系分 5 个阶段执行：

1. **基础层**（Task 1, 2, 11）：先建 Bridge（含六大原语/文件浏览/消息通道接口），瘦身 opencode-client 和 file-store
2. **移除冗余层**（Task 4, 5, 6）：移除 auth、session、API、mock；同步完成驾驶舱简化
3. **能力引入层**（Task 7, 8, 9）：设置页面重构（六大原语页签 + 模型管理打通 + 消息通道 + 文件浏览）；权限自动授权
4. **架构对齐**（Task 3, 10）：产品映射 Workspace，Team 页面迁移至 `pages/team/`
5. **验证与回归**：确保 9 个 Solo 页面功能正常；六大原语管理可用；Slack/Telegram 消息通道可配置；文件浏览/搜索工作正常；驾驶舱会话流畅
