# SDD-007 · 洞察→需求→研发全链路打通方案

**状态**: 设计稿  
**作者**: product-team  
**版本**: 1.0  
**创建日期**: 2026-04-20  
**适用页面**: `/solo/product`（产品洞察）+ `/solo/build`（产品研发）  
**前置条件**: SDD-006 完成（产品洞察 Agent 已落地）

---

## 一、背景与现状问题

### 1.1 现状架构

> **改造范围声明**：本次改造范围仅限**独立版**（`/solo/`），团队版开发工坊（`/dev`）保持现状不变，后续有需要时单独出 SDD。

```
产品洞察页 (/solo/product)
├── 假设验证看板（Kanban）
├── 功能注册（Feature Registry）  ← 对应 product/features/ 下的功能目录
├── 用户反馈
├── 外部洞察（InsightAgentPanel → InsightBoard）
└── AI 可生成 SoloRequirementOutput → 存入 iterations/requirements/{id}.yaml
                                                        ↓
                                              ❌ 断点：无法流向研发

产品研发页 (/solo/build)   → 从 iterations/tasks/{id}.yaml 读取
```

#### 功能注册（Feature Registry）概念说明

"功能注册"对应 `product/features/` 下的功能目录，每个 Feature 是一个**文档目录**，代表产品的一个功能模块：

```
product/features/
├── _index.yml              # 功能全景清单（功能注册索引）
├── paragraph-rewrite/      # 功能模块：段落重写
│   ├── PRD.md              # 该功能的产品需求文档
│   └── SDD.md              # 该功能的技术方案
├── writer-pricing/         # 功能模块：写作者套餐定价
│   ├── PRD.md
│   └── SDD.md
└── ...
```

- **Feature**：产品的功能模块（如"段落重写"、"写作者套餐"），是产品能力的基本单位
- **需求（Requirement）**：具体的产品需求条目，**必须关联到某个 Feature**
- 一个 Feature 下可以有多个需求，需求通过 `linkedFeatureId` 字段关联到所属 Feature

### 1.2 核心断点

| 断点编号 | 问题 | 影响 |
|---------|------|------|
| GAP-01 | 产品洞察页无"产品需求"独立 Tab | 需求隐藏在 AI 对话流中，无法统一管理 |
| GAP-02 | 需求没有状态流转机制（draft→review→accepted→in-dev） | 需求无法与研发侧对接 |
| GAP-03 | 需求到任务缺少"推送研发"桥接操作 | 洞察产出不能被开发领走 |
| GAP-04 | 需求未关联到具体功能模块（Feature） | 无法按功能维度管理需求和追踪交付 |
| GAP-05 | 无 Git 同步入口 | 所有产品文件仅本地，用户无法按需提交版本 |

---

## 二、设计目标

| 目标 | 描述 |
|------|------|
| 🔗 需求承接 | 洞察 → 需求（关联 Feature）→ Task → 产品研发页 一键流转 |
| 📋 需求可视化 | 产品洞察页新增"产品需求"Tab，统一展示和管理所有需求，按 Feature 分组 |
| 📦 Feature 关联 | 需求必须关联到具体功能模块，推送研发时自动继承 Feature 信息到 Task |
| ☁️ Git 同步 | 用户可通过 AI 对话或 UI 按钮手动触发 Git commit/push，产品文件纳入版本控制 |

---

## 三、数据模型变更

### 3.1 扩展 `SoloRequirementOutput`（在 file-store.ts 中）

```typescript
// iterations/requirements/{id}.yaml
export interface SoloRequirementOutput {
  // ─── 已有字段 ────────────────────────────────────────────────
  id: string;
  title: string;
  type: SoloRequirementType;    // 'user-story' | 'feature' | 'bug-fix' | 'tech-debt'
  content: string;              // Markdown 正文
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  linkedHypothesis?: string;    // 关联假设 ID
  createdAt: string;

  // ─── 新增字段 ────────────────────────────────────────────────
  linkedFeatureId?: string;     // ⭐ 新增：关联的功能模块 ID（product/features/ 下的目录名）
  status?: RequirementStatus;   // 新增：需求生命周期状态
  linkedTaskIds?: string[];     // 新增：拆解出的任务 ID 列表
  sourceInsightId?: string;     // 新增：来源洞察记录 ID
  sprintId?: string;            // 新增：所属 Sprint
  assignee?: string;            // 新增：负责人
  updatedAt?: string;           // 新增：最后更新时间
  acceptedAt?: string;          // 新增：需求被接受（进入研发）时间
}

export type RequirementStatus =
  | 'draft'      // AI 生成草稿，产品经理未审核
  | 'review'     // 产品经理正在审核
  | 'accepted'   // 已确认，进入 Backlog 等待排期
  | 'in-dev'     // 已排期/拆解为 Task，开发中
  | 'done'       // 对应 Task 全部完成
  | 'rejected';  // 被否决
```

### 3.2 扩展 `SoloTaskRecord`（在 file-store.ts 中）

```typescript
// iterations/tasks/{id}.yaml
export interface SoloTaskRecord {
  // ─── 已有字段 ────────────────────────────────────────────────
  id: string;
  title: string;
  type: SoloTaskType;           // 'dev' | 'product' | 'ops' | 'growth'
  status: SoloTaskStatusType;   // 'todo' | 'doing' | 'done'
  est: string;
  dod: string[];
  note?: string;
  createdAt: string;
  feature?: string;             // ⭐ 已有字段：关联的 Feature ID（继承自需求的 linkedFeatureId）
  hypothesis?: string;
  completedAt?: string;
  archived?: boolean;

  // ─── 新增字段 ────────────────────────────────────────────────
  requirementId?: string;       // 新增：来源需求 ID（向上溯源）
  sprintId?: string;            // 新增：所属 Sprint
  linkedReqTitle?: string;      // 新增：冗余存储来源需求标题，方便展示
}
```

> **Feature 关联约束**：“推送至研发”时，桥接服务自动将需求的 `linkedFeatureId` 继承到 Task 的 `feature` 字段，确保任务可溯源到对应功能模块。

### 3.3 文件存储完整结构

```
{workDir}/
├── product/
│   ├── overview.md              # 产品概述（已有）
│   ├── roadmap.md               # 路线图（已有）
│   ├── backlog.yaml             # Backlog 列表（已有，未完善）
│   └── features/
│       └── _index.yml           # 功能注册（已有）
├── iterations/
│   ├── requirements/            # 需求文档（已有）
│   │   └── {id}.yaml            #   ← 新增 status/linkedTaskIds 字段
│   └── tasks/                   # 开发任务（已有）
│       └── {id}.yaml            #   ← 新增 requirementId/sprintId 字段
└── .xingjing/
    ├── sprints/
    │   └── current.yaml         # 当前 Sprint（已有）
    └── insights/                # 外部洞察（已有，SDD-006）
        ├── index.yaml
        └── {id}.md
```

---

## 四、链路设计

### 4.1 完整数据流

```
[产品洞察 Agent]
      │
      │  onRequirementSave() / handleConvertSuggestionToRequirement()
      ▼
[SoloRequirementOutput] ──── status: 'draft'
 iterations/requirements/{id}.yaml
      │
      │  产品经理在"产品需求"Tab 中：点击"确认需求" 
      ▼
status: 'accepted' ──── 写回 file
      │
      │  点击"推送至研发" 按钮（新 UI 操作）
      ▼
[research-to-dev-bridge.ts] ← 新增服务
  1. 将需求 status 改为 'in-dev'
  2. 调用 dev-agent 自动拆解任务（可选）
  3. 创建 SoloTaskRecord(s) → iterations/tasks/{id}.yaml
     - 自动继承需求的 linkedFeatureId 到 Task 的 feature 字段
  4. 更新需求的 linkedTaskIds 字段
      │
      ▼
[产品研发页 /solo/build]
  读取 iterations/tasks/*.yaml（status = todo/doing）
  任务卡片上显示 [来源需求 →] + [所属功能] 溯源链接
```

### 4.2 Git 同步时机

Git 同步**不自动触发**，完全由用户主动发起：

| 触发方式 | 操作 |
|---------|------|
| 用户在 AI 对话中要求同步（如"帮我提交一下变更"、"同步到 Git"） | Agent 调用 `commitNow()` + 可选 `pushToRemote()` |
| 用户点击 UI 上的"同步到 Git"按钮 | 执行 `commitNow()` + 可选 `pushToRemote()` |

**Commit 消息规范（约定式提交 Conventional Commits）**：

| 操作 | Commit 消息模板 |
|------|---------------|
| 保存/更新需求 | `docs(req): update requirement {title} [{id}]` |
| 需求状态变更 | `feat(req): accept requirement {title} [{id}]` |
| 推送至研发 | `feat(dev): push requirement to dev - {title}` |
| 创建任务 | `feat(task): create task {title} [{id}]` |
| 任务完成 | `feat(task): complete task {title} [{id}]` |
| 保存假设 | `docs(insight): update hypothesis {id}` |
| 保存洞察 | `docs(insight): save insight record {id}` |
| 批量同步 | `chore: sync product files {timestamp}` |

---

## 五、新增/修改组件

### 5.1 产品洞察页：新增"产品需求"Tab

**修改文件**: `pages/solo/product/index.tsx`

```
Tab 列表变更：
旧：🧪 产品假设 | 📦 功能注册 | 💬 用户反馈 | 🔍 外部洞察
新：🧪 产品假设 | 📋 产品需求 ← 新增 | 📦 功能注册 | 💬 用户反馈 | 🔍 外部洞察
```

**产品需求 Tab 布局**：

```
┌── 产品需求 ──────────────────────────────────────────────────────────┐
│  筛选：[全部 ▼]  [功能模块 ▼]  [P0 ▼]  [状态 ▼]   [+ 手动新建需求]  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─ REQ-001 · 增加段落重写功能 ──────────── [P0] [草稿] ─────────┐  │
│  │  所属功能：📦 段落重写 (paragraph-rewrite)                      │  │
│  │  来源：💡 洞察 "Notion AI 竞品分析"  创建：2026-04-15          │  │
│  │  摘要：作为写作者，我希望选中段落后能一键重写...               │  │
│  │                                                                │  │
│  │  [查看详情]  [✅ 确认需求]  [🚀 推送至研发]  [❌ 否决]         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ REQ-002 · 写作者套餐定价 ─────────────── [P1] [已确认] ──────┐  │
│  │  所属功能：📦 写作者套餐 (writer-pricing)                       │  │
│  │  来源：💡 洞察 "AI写作工具市场趋势"                             │  │
│  │  [查看详情]  [🚀 推送至研发]  已关联任务：TASK-002-01          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**状态徽章颜色**：

| 状态 | 标签 | 颜色 |
|------|------|------|
| draft | 草稿 | 灰色 |
| review | 审核中 | 黄色 |
| accepted | 已确认 | 蓝色 |
| in-dev | 研发中 | 紫色 |
| done | 已完成 | 绿色 |
| rejected | 已否决 | 红色 |

**关键交互**：
- “功能模块”筛选器：从 `product/features/_index.yml` 加载候选列表
- 创建/编辑需求时必须选择“所属功能”（`linkedFeatureId`）
- AI 生成需求时可根据上下文自动关联 Feature，用户可修改
- “推送至研发”时自动继承 `linkedFeatureId` 到 Task 的 `feature` 字段

### 5.2 新增"推送至研发"操作面板

点击"推送至研发"按钮后，弹出 `PushToDevModal`：

```
┌── 🚀 推送至研发 ─────────────────────────────────────────────────────┐
│  需求：增加段落重写功能（P0）                                         │
│                                                                       │
│  任务拆解方式：                                                       │
│  ◉ AI 自动拆解（dev-agent 根据需求内容生成任务列表）                  │
│  ○  手动填写（自己填写任务标题和 DoD）                                │
│                                                                       │
│  加入 Sprint：                                                        │
│  ◉ 当前 Sprint（Sprint #3 · 2026-04-20 ~ 2026-05-03）                │
│  ○  下个 Sprint                                                       │
│  ○  仅加入 Backlog，暂不排期                                          │
│                                                                       │
│  任务类型：[开发 ▼]    估时：[3天 ▼]                                 │
│                                                                       │
│  ── AI 拆解预览（自动生成，可编辑）──────────────────────────────── │
│  ✓ 实现段落选中高亮 UI                    [dev]  [1天]               │
│  ✓ 实现重写 API 调用（POST /rewrite）     [dev]  [1天]               │
│  ✓ 单元测试 + E2E 测试                   [dev]  [0.5天]              │
│  + 添加任务                                                           │
│                                                                       │
│               [取消]  [🚀 确认推送]                                   │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.3 新增服务：`services/requirement-dev-bridge.ts`

```typescript
/**
 * 需求→研发桥接服务
 * 
 * 职责：
 * 1. 将 SoloRequirementOutput 状态推进到 'in-dev'
 * 2. 创建对应的 SoloTaskRecord(s)
 * 3. 维护双向引用（需求 ↔ 任务）
 * 4. 触发 Git 同步
 */

export interface PushToDevOptions {
  workDir: string;
  requirement: SoloRequirementOutput;
  tasks: TaskDraft[];            // 用户确认后的任务列表
  sprintId?: string;             // 目标 Sprint（null = 仅加入 Backlog）
  callAgentFn?: CallAgentOptions['callAgent'];  // 用于 AI 自动拆解
  onProgress?: (msg: string) => void;
}

export interface TaskDraft {
  title: string;
  type: SoloTaskType;
  est: string;
  dod: string[];
}

/**
 * 主函数：将需求推送到研发侧
 */
export async function pushRequirementToDev(opts: PushToDevOptions): Promise<{
  taskIds: string[];
  success: boolean;
}>;

/**
 * 使用 dev-agent 自动拆解需求为任务列表（草稿）
 * 返回 TaskDraft[] 供用户确认
 */
export async function decomposeRequirementWithAgent(
  requirement: SoloRequirementOutput,
  callAgentFn: CallAgentOptions['callAgent'],
  onStream?: (text: string) => void,
): Promise<TaskDraft[]>;

/**
 * 解析 Agent 输出中的任务列表 JSON
 * Agent 约定输出格式：
 * ```tasks
 * [
 *   {"title": "...", "type": "dev", "est": "1天", "dod": ["单元测试通过", "UI符合设计稿"]},
 *   ...
 * ]
 * ```
 */
export function parseTasksFromAgentOutput(text: string): TaskDraft[];
```

**dev-agent 拆解 System Prompt（追加到现有基础上）**：

```
当用户要求将需求拆解为开发任务时，输出格式如下：
\`\`\`tasks
[
  {
    "title": "任务标题（动宾结构，如：实现用户登录 API）",
    "type": "dev",
    "est": "1天",
    "dod": [
      "单元测试覆盖率 ≥ 80%",
      "API 文档已更新",
      "Code Review 通过"
    ]
  }
]
\`\`\`
每个任务应独立可测试，DoD 条件应可量化。
```

### 5.4 新增服务：`services/git-sync.ts`

```typescript
/**
 * Git 同步服务
 * 
 * 策略：
 * - commit 和 push 均由用户主动触发，不做任何自动同步
 * - 用户可通过 AI 对话或 UI 按钮触发
 * - 通过 OpenWork Server 执行（遵循 ARCHITECTURE.md 规范）
 */

/**
 * 立即执行 Git commit
 * 用户点击"同步到 Git"按钮或通过 AI 对话触发
 */
export async function commitNow(
  workDir: string,
  message: string,
  paths?: string[],
): Promise<{ success: boolean; hash?: string; error?: string }>;

/**
 * 执行 Git push
 * 用户点击"推送到远端"或 AI 对话触发
 */
export async function pushToRemote(
  workDir: string,
  remote?: string,
  branch?: string,
): Promise<{ success: boolean; error?: string }>;

/**
 * 获取当前 Git 状态（未提交变更数、最近 commit 等）
 * 用于 UI 展示 Git 状态徽章
 */
export async function getGitStatus(workDir: string): Promise<{
  uncommittedCount: number;
  lastCommit?: { hash: string; message: string; time: string };
  branch?: string;
  hasRemote: boolean;
}>;
```

---

### 5.5 产品研发页补充：`pages/solo/build/index.tsx`

“推送至研发”后创建的任务会流入产品研发页（`/solo/build`），该页已从 file-store 读取任务。本次补充：
- 任务卡片新增“来源需求”字段展示（`linkedReqTitle`）
- 任务卡片新增“所属功能”字段展示（`feature`）
- 任务完成时反向更新需求状态（当所有关联 Task 完成时，需求 status 变为 `'done'`）

### 5.6 UI Git 状态面板

在产品洞察页 Header 区域右侧新增 Git 状态徽章：

```
┌─── Header ─────────────────────────────────────────────────────────┐
│  产品洞察  ·  harnesswork       [● 3 未提交]  [↑ 同步到 Git]       │
└─────────────────────────────────────────────────────────────────┘
```

- 点击“同步到 Git”触发 `commitNow()` + 可选 `pushToRemote()`，结果通过 Toast 提示
- 用户也可通过 AI 对话触发（如“帮我提交一下变更”“同步到 Git”）

---

## 六、文件改造清单

### 6.1 修改文件

| 文件 | 修改内容 |
|------|---------|
| `services/file-store.ts` | 扩展 `SoloRequirementOutput`（新增 `linkedFeatureId`/`status`/`linkedTaskIds` 等字段）和 `SoloTaskRecord`（新增 `requirementId`/`sprintId`），新增 `updateRequirementStatus()` 便捷函数 |
| `pages/solo/product/index.tsx` | 新增"产品需求" Tab；实现"确认需求"、"推送至研发"按钮；集成 `PushToDevModal`；新增"功能模块"筛选器 |
| `pages/solo/build/index.tsx` | 新增"来源需求"和"所属功能"字段展示；任务全部完成时反向更新需求状态 |

### 6.2 新增文件

| 文件 | 职责 |
|------|------|
| `services/requirement-dev-bridge.ts` | 需求推送至研发的核心逻辑；AI 任务拆解；自动继承 Feature 关联 |
| `services/git-sync.ts` | Git commit/push 抽象；状态查询（纯用户触发，无自动同步） |
| `components/requirement/requirement-card.tsx` | 需求卡片组件（状态徽章 + 所属功能 + 操作按钮） |
| `components/requirement/push-to-dev-modal.tsx` | 推送至研发模态框（AI 拆解预览 + 确认） |
| `components/common/git-status-badge.tsx` | Git 状态徽章（显示未提交数、同步按钮） |

---

## 七、Git 同步集成点

### 7.1 用户触发方式

Git 同步不自动触发，用户有两种方式主动同步：

**方式 A：UI 按钮触发**
- 产品洞察页 Header 右侧的“同步到 Git”按钮
- 点击后执行 `commitNow()` 提交所有未提交变更，可选执行 `pushToRemote()`

**方式 B：AI 对话触发**
- 用户在对话中说“帮我提交一下变更”“同步到 Git”等
- Agent 调用 `commitNow()` + `pushToRemote()` 执行

### 7.2 OpenWork Server 执行路径（遵循 ARCHITECTURE.md 规范）

Git 操作通过 OpenWork Server 而非 Tauri 直接调用，保持远程/本地一致性：

```
UI (SolidJS)
    │  POST /api/git/commit { workDir, message, paths }
    ▼
OpenWork Server（apps/server）
    │  execa('git', ['add', ...paths], { cwd: workDir })
    │  execa('git', ['commit', '-m', message], { cwd: workDir })
    ▼
本地 Git 仓库（workDir）
```

如 OpenWork Server 不支持 Git API，降级方案：通过现有 `callAgent` 执行 shell 命令（仅 Host 模式下可用）。

---

## 八、实施计划

### Phase 1：数据模型扩展（0.5天）
- [ ] `file-store.ts`: 扩展 `SoloRequirementOutput`（新增 `linkedFeatureId`/`status`/`linkedTaskIds`/`sourceInsightId`/`sprintId`/`assignee`/`updatedAt`）
- [ ] `file-store.ts`: 扩展 `SoloTaskRecord`（新增 `requirementId`/`sprintId`/`linkedReqTitle`）
- [ ] `file-store.ts`: 新增 `updateRequirementStatus(workDir, id, status)` 便捷函数
- [ ] TypeScript 编译零错误验证

**关键文件**: `services/file-store.ts`

### Phase 2：产品需求 Tab（1天）
- [ ] 新增 `components/requirement/requirement-card.tsx`（状态徽章 + 操作按钮）
- [ ] `pages/solo/product/index.tsx`: 新增 `'requirements'` Tab 类型
- [ ] `pages/solo/product/index.tsx`: 新增需求列表渲染（过滤/排序/操作）
- [ ] 需求"确认"操作：调用 `updateRequirementStatus(workDir, id, 'accepted')`
- [ ] 需求"否决"操作：调用 `updateRequirementStatus(workDir, id, 'rejected')`
- [ ] 同步更新：AI 生成需求时初始 status 设为 `'draft'`

**关键文件**: `pages/solo/product/index.tsx`, `components/requirement/requirement-card.tsx`

### Phase 3：推送至研发（1.5天）
- [ ] 创建 `services/requirement-dev-bridge.ts`
  - [ ] `decomposeRequirementWithAgent()` — dev-agent 拆解需求
  - [ ] `parseTasksFromAgentOutput()` — 解析 ```tasks 代码块
  - [ ] `pushRequirementToDev()` — 主函数
- [ ] 新增 `components/requirement/push-to-dev-modal.tsx`
  - [ ] Sprint 选择
  - [ ] AI 拆解触发 + 流式预览
  - [ ] 任务列表可编辑
  - [ ] 确认推送
- [ ] `pages/solo/product/index.tsx`: 接入 `PushToDevModal`

**关键文件**: `services/requirement-dev-bridge.ts`, `components/requirement/push-to-dev-modal.tsx`

### Phase 4：产品研发页补充（0.5天）
- [ ] `pages/solo/build/index.tsx`: 任务卡片新增“来源需求”字段展示（`linkedReqTitle`）
- [ ] `pages/solo/build/index.tsx`: 任务卡片新增“所属功能”字段展示（`feature`）
- [ ] 任务全部完成时反向更新需求 status 为 `'done'`

**关键文件**: `pages/solo/build/index.tsx`

### Phase 5：Git 同步入口（0.5天）
- [ ] 创建 `services/git-sync.ts`（commitNow / pushToRemote / getGitStatus，无自动同步逻辑）
- [ ] 新增 `components/common/git-status-badge.tsx`
- [ ] 产品洞察页 Header 集成 Git 状态徽章 + “同步到 Git”按钮
- [ ] OpenWork Server 侧新增 `/api/git/commit` 和 `/api/git/push` 端点（或降级方案）

**关键文件**: `services/git-sync.ts`, `components/common/git-status-badge.tsx`

---

## 九、验收标准

| 场景 | 验收条件 |
|------|----------|
| 需求 Tab 可见 | 产品洞察页有"产品需求"Tab，展示所有 `iterations/requirements/` 中的需求 |
| AI 生成需求初始状态 | InsightAgent 生成的需求初始 status = `'draft'` |
| 需求确认 | 点击"确认需求"→ status 变为 `'accepted'`，文件持久化 |
| AI 拆解任务 | 点击"推送至研发"→ AI 返回任务列表 → 可编辑确认 |
| 任务创建 | 确认推送后 `iterations/tasks/` 目录新增对应任务文件，含 `requirementId` 字段 |
| Git commit | 用户触发“同步到 Git”后，git log 出现约定式 commit |
| Git push | 点击"同步到远端"按钮后，远端 Git 仓库收到 push |
| 离线降级 | OpenWork Server 不可用时，Git 操作静默失败并在 UI 提示，不影响核心功能 |
| TS 零错误 | `tsc --noEmit` 零错误 |

---

## 十、关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 需求状态存储位置 | 直接在 `iterations/requirements/{id}.yaml` 扩展 status 字段 | 避免双表同步；YAML 天然支持增量字段；与现有 file-store 模式一致 |
| D2 | 任务→需求引用方式 | 双向引用（需求的 `linkedTaskIds` + 任务的 `requirementId`） | 允许独立查询；冗余换取 O(1) 查找，数据量小不存在一致性风险 |
| D3 | Git 操作执行路径 | 优先通过 OpenWork Server `/api/git/*` | 遵循 ARCHITECTURE.md：文件系统变更路由经 Server，保持本地/远程一致性 |
| D4 | Git commit 时机 | 纯用户手动触发（UI 按钮或 AI 对话） | 不干扰用户工作流；用户对提交时机有完全控制权 |
| D5 | Git push 策略 | 纯手动触发 | push 涉及网络/认证，用户应明确知道何时推送到远端 |
