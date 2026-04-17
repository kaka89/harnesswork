# SDD-005 · 星静独立版知识库页面重构

> **状态**: 草案  
> **范围**: `apps/app/src/app/xingjing/pages/solo/knowledge/`  
> **目标**: 将单一的"个人笔记卡片格"升级为以产品 workspace 文档结构为主轴、三源统一的产品知识库，支持查看与 AI 使用两种模式

---

## 1. 问题现状

### 1.1 当前页面的本质缺陷

现有的 `solo/knowledge/index.tsx` 是一个简单的卡片列表页：

```
┌─────────────────────────────────────────────────────────────┐
│  [搜索框]   [分类 Tab]   [健康评分 badge]                    │
│                                                              │
│  [私有知识 卡片] [私有知识 卡片] [私有知识 卡片]              │
│  [私有知识 卡片] [私有知识 卡片] [私有知识 卡片]              │
│                                                              │
│  [行为知识 卡片] [行为知识 卡片]                              │
└─────────────────────────────────────────────────────────────┘
```

**根本问题**：它只暴露了知识体系的最末一层（个人笔记），却完全忽略了一个产品 workDir 下已经存在的完整文档树：

| 文档层 | 实际存在 | 当前 UI 可见？ |
|--------|---------|--------------|
| `product/overview.md` 产品概述 | ✅ | ❌ |
| `product/features/*/PRD.md` 需求文档 | ✅ | ❌ |
| `product/features/*/SDD.md` 设计文档 | ✅ | ❌ |
| `iterations/hypotheses/` 产品假设 | ✅ | ❌ |
| `iterations/tasks/` 执行任务 | ✅ | ❌ |
| `adrs.yml` 架构决策 | ✅ | ❌ |
| `knowledge/pitfalls/` 踩坑笔记 | ✅ | ✅ |
| `knowledge/insights/` 用户洞察 | ✅ | ✅ |
| `knowledge/tech-notes/` 技术笔记 | ✅ | ✅ |
| OpenWork Skill 行为知识 | ✅ | ✅ |

更大的问题：底层的 `knowledge-index.ts` 已经实现了三源聚合（行为知识 + 私有笔记 + 工作区文档）、文档链感知排序、多维倒排索引——但 UI 层完全没有承接这些能力。

### 1.2 "使用"维度的缺失

现有页面只是被动展示，没有任何"将知识注入 AI 工作流"的交互路径：

- 无法"把这个 PRD 发给 AI 作为上下文"
- 无法"引用此文档"产生可追踪的 ref 关系
- 无法"基于此文档启动 Autopilot 任务"
- Agent 输出沉淀为知识（`knowledge-sink.ts`）之后，没有入口看"这条知识是从哪次 AI 对话来的"

---

## 2. 设计目标

1. **文档树视图**：以 workspace 文件结构为主轴，呈现所有文档类型
2. **三源统一阅读**：产品文档 / 迭代记录 / 个人笔记 / 行为知识，一个界面全覆盖
3. **文档链导航**：PRD → SDD → MODULE → PLAN → TASK 的上下游可视化
4. **AI 使用路径**：从任何文档直达"发送给 AI"、"启动任务"、"引用到对话"
5. **知识沉淀追踪**：AI 自动沉淀的知识可溯源到原始 Agent 会话

---

## 3. 信息架构

### 3.1 知识源分类体系

```
产品知识库
├── 产品文档（Workspace Docs）                ← scanWorkspaceDocs()
│   ├── 概述层
│   │   ├── overview.md（产品概述）
│   │   └── roadmap.md（路线图）
│   ├── 需求层
│   │   └── features/{feat}/PRD.md
│   ├── 设计层
│   │   └── features/{feat}/SDD.md
│   └── 架构决策
│       └── adrs.yml
│
├── 迭代记录（Iteration Records）             ← file-store.ts
│   ├── iterations/hypotheses/（产品假设）
│   ├── iterations/tasks/（执行任务）
│   ├── iterations/releases/（版本记录）
│   └── iterations/feedbacks/（用户反馈）
│
├── 个人笔记（Private Notes）                 ← loadSoloKnowledge()
│   ├── knowledge/pitfalls/（踩坑记录）
│   ├── knowledge/insights/（用户洞察）
│   └── knowledge/tech-notes/（技术笔记）
│
└── 行为知识（Behavior Knowledge）            ← Skill API (knowledge-*)
    ├── 词汇表（glossary）
    ├── 最佳实践（best-practice）
    ├── 架构知识（architecture）
    ├── 流程规范（process）
    └── 场景案例（scenario）
```

### 3.2 文档链模型

每种文档类型在 `dir-graph.yaml` 中定义了上下游关系，形成有向链：

```
                    ┌──────────┐
                    │ GLOSSARY │  ← 词汇基础（被所有层引用）
                    └────┬─────┘
                         │ 被引用
              ┌──────────▼──────────┐
              │        PRD          │  产品需求文档
              └──────────┬──────────┘
                         │ 驱动
              ┌──────────▼──────────┐
              │        SDD          │  系统设计文档
              └──────────┬──────────┘
                         │ 细化
              ┌──────────▼──────────┐
              │       MODULE        │  模块规格
              └──────────┬──────────┘
                         │ 拆解
              ┌──────────▼──────────┐
              │        PLAN         │  项目计划
              └──────────┬──────────┘
                         │ 执行
              ┌──────────▼──────────┐
              │        TASK         │  具体任务
              └─────────────────────┘
```

---

## 4. 页面布局

### 4.1 整体结构（三栏布局）

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 [全局知识搜索 — 跨所有来源]           [刷新索引] [健康度 82分]   │
├───────────────┬────────────────────────────────┬────────────────────┤
│  左侧导航栏   │         主内容区                │   关联面板         │
│  (240px)      │    (flex-1)                     │   (280px)          │
│               │                                 │                    │
│ ▾ 产品文档    │   ┌─────────────────────────┐  │  📎 文档关联        │
│   📄 概述     │   │  文档阅读器 /           │  │  ─────────────────  │
│   🗺 路线图   │   │  知识卡片               │  │  ↑ 上游: PRD-001   │
│  ▾ 需求文档   │   │                         │  │  ↓ 下游: TASK-003  │
│    登录重构   │   │  [文档标题]             │  │  ⧖ 引用: 3次       │
│    支付流程   │   │                         │  │                    │
│  ▾ 设计文档   │   │  [状态chip][owner]      │  │  🤖 AI 使用         │
│    登录SDD    │   │  [层级][日期]           │  │  ─────────────────  │
│               │   │                         │  │  [发送给 AI ▶]     │
│ ▾ 迭代记录    │   │  ── 文档内容 ──        │  │  [启动 Autopilot]  │
│  ▾ 假设       │   │                         │  │  [引用到对话]      │
│    H-001 ✅   │   │  Markdown 渲染内容      │  │                    │
│    H-002 🧪   │   │  全量展示              │  │  📊 知识溯源        │
│  ▾ 任务       │   │                         │  │  ─────────────────  │
│    T-001 ✅   │   │                         │  │  由 🧠 product-brain│
│    T-002 🔄   │   │                         │  │  沉淀于 3天前      │
│               │   └─────────────────────────┘  │  [查看原始对话]    │
│ ▾ 个人笔记    │                                 │                    │
│  ▾ 踩坑       │   (或: 无选中时显示卡片网格)    │  ⚕ 健康状态        │
│    IME问题    │                                 │  ─────────────────  │
│    异步陷阱   │                                 │  ✅ 有下游引用      │
│  ▾ 洞察       │                                 │  ⚠️ 91天未更新     │
│    用户研究   │                                 │  💡 可升级为行为知识│
│               │                                 │                    │
│ ▾ 行为知识    │                                 │                    │
│   架构模式    │                                 │                    │
│   API规范     │                                 │                    │
└───────────────┴────────────────────────────────┴────────────────────┘
```

### 4.2 两种内容模式切换

**浏览模式**（无选中节点时）：中央区域显示聚合卡片网格

```
┌────────────────────────────────────────────────────────────────┐
│  [全部] [产品文档] [迭代记录] [个人笔记] [行为知识]  [↑↓排序]   │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ 📄 PRD           │  │ ✅ SDD           │  │ 🏷 踩坑     │ │
│  │ 用户登录重构     │  │ 支付模块设计     │  │ IME选区问题 │ │
│  │ ─────────────── │  │ ─────────────── │  │ ──────────  │ │
│  │ approved · PM   │  │ reviewing · Arch │  │ 2天前       │ │
│  │ ↓ SDD-001       │  │ ↑ PRD-001       │  │ #prosemirror│ │
│  └──────────────────┘  └──────────────────┘  └─────────────┘ │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ...             │
└────────────────────────────────────────────────────────────────┘
```

**阅读模式**（选中一个节点后）：中央区域显示完整文档阅读器

```
┌────────────────────────────────────────────────────────────────┐
│  ← 返回列表   文档链导航: GLOSSARY → [PRD-001] → SDD-001       │
│                                                                │
│  # 用户登录重构需求文档                                         │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 状态: ✅ approved  所有者: @product-brain                 │  │
│  │ 层级: application  创建: 2026-04-01  更新: 2026-04-15   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ## 背景                                                        │
│  当前登录流程存在三个核心问题...                                │
│                                                                │
│  ## 目标用户                                                    │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. 核心组件设计

### 5.1 `KnowledgeTreeNav`（左侧文档树）

```typescript
// components/knowledge/knowledge-tree-nav.tsx

interface KnowledgeTreeNode {
  id: string;
  label: string;
  type: 'section' | 'doc' | 'note' | 'skill';
  docType?: string;           // PRD | SDD | TASK | pitfall | ...
  status?: string;            // approved | reviewing | draft
  filePath?: string;          // 相对于 workDir 的路径
  children?: KnowledgeTreeNode[];
  hasAiAlert?: boolean;       // 需要注意
  isStale?: boolean;          // 超过90天未更新
  layer?: string;             // application | domain | product-line
}

interface KnowledgeTreeNavProps {
  workDir: string;
  selectedId: string | null;
  onSelect: (node: KnowledgeTreeNode) => void;
  onCreateNote?: (category: 'pitfall' | 'user-insight' | 'tech-note') => void;
  onRefresh?: () => void;
}
```

**树节点渲染规则：**

| 节点类型 | 图标 | 右侧状态 |
|---------|------|---------|
| 产品文档（PRD） | 📄 | `approved` ✅ / `reviewing` ⏳ / `draft` ✏️ |
| 设计文档（SDD） | 🔧 | 同上 |
| 假设（Hypothesis） | 💡 | `validated` ✅ / `testing` 🧪 / `pending` ○ |
| 任务（Task） | ✅ | `done` / `in-progress` 🔄 / `todo` |
| 踩坑笔记 | 🕳 | 日期 |
| 洞察 | 👁 | 日期 |
| 行为知识 | 📚 | `stable` / `living` |
| 架构决策（ADR） | ⚖️ | `accepted` / `superseded` |

**数据加载策略：**
- `onMount`: 调用 `buildKnowledgeIndex(workDir, skillApi)` 构建完整索引
- 索引中的 `filePath` 字段用于树节点定位
- 使用 `loadCachedIndex` 避免重复扫描（5分钟 TTL）
- 树结构本地排序：按 section 固定顺序 → section 内按 date 降序

### 5.2 `KnowledgeDocViewer`（主内容区阅读器）

```typescript
// components/knowledge/knowledge-doc-viewer.tsx

interface KnowledgeDocViewerProps {
  node: KnowledgeTreeNode;
  workDir: string;
  onNavigate: (nodeId: string) => void;
  onSendToAI: (content: string, title: string) => void;
  onStartAutopilot: (prompt: string) => void;
  onEdit?: (node: KnowledgeTreeNode) => void;
}
```

**渲染策略（按 docType 分支）：**

```typescript
// Markdown 文档类（PRD / SDD / MODULE / 笔记）
→ fileRead(node.filePath, workDir)
→ parseFrontmatter(content)
→ <DocMetaHeader> (status, owner, layer, dates)
→ <DocChainBreadcrumb> (PRD→SDD→MODULE 导航)
→ <MarkdownRenderer> (正文 Markdown，代码高亮)
→ <DocFooter> (引用此文档的其他文档列表)

// YAML 结构文档（Task / Hypothesis / ADR / Release）
→ readYaml(node.filePath, workDir)
→ <StructuredDocViewer> (字段-标签布局)

// Behavior Knowledge（来自 OpenWork Skill）
→ api.getSkill(name)
→ parseFrontmatter(content)
→ <BehaviorKnowledgeCard> (category badge + scenes + 正文)
```

### 5.3 `DocChainBreadcrumb`（文档链导航）

```typescript
// components/knowledge/doc-chain-breadcrumb.tsx

interface DocChainBreadcrumbProps {
  currentDocType: string;        // PRD | SDD | MODULE | PLAN | TASK
  currentDocId: string;
  upstream: Array<{ id: string; docType: string; title: string }>;
  downstream: Array<{ id: string; docType: string; title: string }>;
  onNavigate: (docId: string) => void;
}
```

**渲染示意：**

```
GLOSSARY → [PRD-001 ←当前] → SDD-001 → MODULE-001 → TASK-003
                                 ↓
                              MODULE-002 → TASK-004
```

- 当前文档高亮
- 上下游可点击跳转
- 如有多个下游，展开为多分支（树状展示）

### 5.4 `DocRelationPanel`（右侧关联面板）

```typescript
// components/knowledge/doc-relation-panel.tsx

interface DocRelationPanelProps {
  node: KnowledgeTreeNode;
  entry: KnowledgeEntry | null;         // 来自 knowledge-index
  workDir: string;
  onSendToAI: (content: string, title: string) => void;
  onStartAutopilot: (prompt: string) => void;
  onViewSourceSession?: (sessionId: string) => void;
}
```

**三个分区：**

**① 文档关联**
- 上游文档链接（来自 `KnowledgeEntry.upstream`）
- 下游文档链接（来自 `KnowledgeEntry.downstream`）
- 被引用次数 + 引用来源列表

**② AI 使用路径**
- **[发送给 AI ▶]**：将当前文档内容添加到知识检索上下文，并导航到 Autopilot 页面（预填 query）
- **[启动 Autopilot]**：以"基于此文档 + 当前文档类型"为 goal 预置到 Autopilot 输入框
- **[引用到对话]**：将 `[docType@layer docId]` 格式的引用片段复制到剪贴板

**③ 知识溯源**
- 若文档由 AI Agent 沉淀（`knowledge-sink.ts` 写入），显示"由 X agent 生成"
- 显示原始 sessionId（如有）
- 点击"查看原始对话" → 导航到对应 Session 历史

### 5.5 `KnowledgeSearchBar`（全局搜索）

```typescript
// components/knowledge/knowledge-search-bar.tsx

interface KnowledgeSearchBarProps {
  onSearch: (query: string, filters: SearchFilters) => void;
  onClear: () => void;
}

interface SearchFilters {
  sources: Array<'workspace-doc' | 'private' | 'behavior'>;
  docTypes: string[];           // PRD | SDD | pitfall | ...
  scenes: ApplicableScene[];
  layers: string[];
  lifecycle: Array<'living' | 'stable'>;
  dateRange?: { from: string; to: string };
}
```

**搜索结果展示：**
- 命中词高亮（`searchHighlightQuery`）
- 结果按来源分组：`产品文档 (3)` | `个人笔记 (5)` | `行为知识 (2)`
- 每条结果：标题 + 来源 badge + 命中片段摘要
- 直接点击跳转到 Tree Nav 对应节点 + 打开阅读器

### 5.6 `KnowledgeGridView`（浏览模式卡片网格）

无选中节点时的默认视图，承接现有的卡片布局但大幅增强：

```typescript
// components/knowledge/knowledge-grid-view.tsx

interface KnowledgeGridViewProps {
  entries: KnowledgeEntry[];           // 来自 knowledge-index
  onSelect: (entry: KnowledgeEntry) => void;
  sourceFilter: string;
  sortBy: 'date' | 'relevance' | 'health';
}
```

**卡片增强（相比现有）：**

| 现有 | 增强后 |
|-----|-------|
| 标题 + 内容摘要 | + 文档类型 badge + 层级 badge |
| 分类 tag | + 上游/下游文档快速链接 |
| AI 警告 banner | + 健康度指示条 |
| 无 | + "发送给 AI" 快捷按钮 |
| 无 | + 被引用次数 |
| 无 | + 溯源 Agent 头像（若由 AI 生成） |

---

## 6. 数据流设计

### 6.1 索引加载流程

```
onMount
  ↓
loadCachedIndex(workDir)  ──有缓存──→ setIndex(cached)  →  renderTree()
  │
  └──无缓存──→ buildKnowledgeIndex(workDir, skillApi)
                  ├─ Skill API: listSkills() + getBehaviorKnowledge()
                  ├─ Private: loadSoloKnowledge(workDir)
                  └─ Workspace: scanWorkspaceDocs(workDir)
                       ↓
               setIndex(index)  →  renderTree() + renderGrid()
```

**性能策略：**
- 首次加载：先渲染 Tree 骨架（section 标题），后台加载文档内容
- 缓存命中：< 50ms 可交互
- 全量重建：后台线程（`queueMicrotask`），不阻塞 UI
- 文档阅读：按需 `fileRead()`，不预加载全部内容

### 6.2 文档阅读流程

```
用户点击 Tree 节点
  ↓
selectedNode.set(node)
  ↓
if (node.filePath) 
  → fileRead(node.filePath, workDir)
    → parseFrontmatter() / readYaml()
      → setDocContent(content)
        → KnowledgeDocViewer 渲染
else (行为知识，来自 Skill API)
  → getBehaviorKnowledge(skillApi, node.id)
    → setDocContent(knowledge)
      → BehaviorKnowledgeCard 渲染

同步触发:
  → updateReferenceMeta(workDir, node.id, node.type)  // 记录访问
  → 查找 entry 的 upstream/downstream → DocRelationPanel 更新
```

### 6.3 AI 使用路径

```
用户点击 [发送给 AI ▶] (DocRelationPanel)
  ↓
content = await fileRead(node.filePath, workDir)
context = `[${docType}@${layer}] ${title}\n\n${content}`
  ↓
选项 A: 导航到 Autopilot 页面
  → navigate('/solo/autopilot', { state: { preloadContext: context } })
  → Autopilot 页面 onMount 检测 preloadContext，注入到知识检索

选项 B: 弹出"快速 AI 任务"对话框
  → <QuickAITaskDialog>
       [基于此 PRD 生成 SDD ▶]
       [审查此文档的质量 ▶]
       [提取关键假设 ▶]
       [自定义任务...]
  → 用户选择后直接触发 runOrchestratedAutopilot()
```

---

## 7. 知识健康仪表板

在页面顶部搜索栏右侧，常驻显示"健康度"分数：

```
健康度: 82分 ✅   [查看报告]
```

点击展开健康报告面板（从 `checkKnowledgeHealth()` 获取数据）：

```
┌─────────────────────────────────────────────────────┐
│  知识库健康报告                         82 / 100    │
│                                                    │
│  ● 行为知识: 91分  ████████████████████░           │
│  ● 私有笔记: 78分  ██████████████████░░░           │
│  ● 产品文档: 76分  ██████████████████░░░           │
│                                                    │
│  ⚠️ 需要关注 (3项)                                 │
│  • SDD-003 · 支付模块设计 — 47天未更新，无下游引用  │
│  • 踩坑笔记 #k-007 — 可升级为行为知识（被引用5次）  │
│  • PRD-002 · 国际化需求 — 缺少对应 SDD             │
│                                                    │
│  💡 优化建议                                        │
│  • 2条私有笔记可提升为行为知识                      │
│  • 词汇表中有 3 个术语存在定义冲突                  │
└─────────────────────────────────────────────────────┘
```

---

## 8. 编辑与创建入口

### 8.1 个人笔记创建（保留现有能力）

Left Panel 的"个人笔记"Section 头部有 `+` 按钮，点击弹出创建 Modal：

```typescript
interface CreateNoteModalProps {
  category: 'pitfall' | 'user-insight' | 'tech-note';
  onSave: (note: SoloKnowledgeItem) => void;
}
```

创建后调用 `saveSoloKnowledge(workDir, note)`，同时触发索引增量更新 `scanSingleDoc()`。

### 8.2 产品文档的创建/编辑

产品文档（PRD/SDD等）的编辑不在知识库页面处理，而是导航到专用的编辑页面（`requirements/prd-editor`），知识库页面只做**只读阅读**。

但在文档上有快捷按钮：
- **[在需求工作台打开 →]**：导航到 `/solo/product` 的对应文档编辑器
- **[用 AI 生成下游文档]**：以当前 PRD 为输入，导航到 Autopilot 并预填任务

### 8.3 行为知识管理

行为知识（来自 OpenWork Skill）的阅读在知识库页面；创建/编辑通过：
- **[编辑]** 按钮：仅在 `item.lifecycle === 'living'` 时显示
- 点击 → 弹出编辑 Modal（复用现有 `saveBehaviorKnowledge()` 逻辑）

---

## 9. 实施计划

### Phase 1：数据层打通（2天）

确保现有服务能被新 UI 调用：

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `services/knowledge-scanner.ts` | 验证 `scanWorkspaceDocs()` 在实际 workDir 下的输出是否完整 |
| 1.2 | `services/knowledge-index.ts` | 暴露 `getNodeByFilePath(index, filePath)` 辅助函数 |
| 1.3 | `services/file-store.ts` | 添加 `loadAdrList(workDir)` 统一加载接口（当前通过 readYaml 散装读取）|
| 1.4 | `stores/app-store.tsx` | 新增 `actions.scanKnowledgeIndex(workDir)` action，供页面调用 |

### Phase 2：左侧导航树（2天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `components/knowledge/knowledge-tree-nav.tsx`（新） | 树状节点渲染，四大分类 Section，节点状态 badge |
| 2.2 | `components/knowledge/knowledge-tree-nav.tsx` | 数据加载：`buildKnowledgeIndex()` → 树形结构转换 |
| 2.3 | `components/knowledge/knowledge-tree-nav.tsx` | 节点交互：点击选中、折叠/展开、右键菜单（创建笔记） |

### Phase 3：文档阅读器（2天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `components/knowledge/knowledge-doc-viewer.tsx`（新） | Markdown 文档渲染（frontmatter 解析 + 正文渲染） |
| 3.2 | `components/knowledge/knowledge-doc-viewer.tsx` | YAML 结构文档渲染（任务、假设、ADR、版本） |
| 3.3 | `components/knowledge/doc-chain-breadcrumb.tsx`（新） | 文档链可视化导航 |
| 3.4 | `components/knowledge/doc-meta-header.tsx`（新） | 状态/owner/层级/日期 元信息头部 |

### Phase 4：关联面板与 AI 使用路径（2天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 4.1 | `components/knowledge/doc-relation-panel.tsx`（新） | 三分区：文档关联 + AI 使用 + 知识溯源 |
| 4.2 | `components/knowledge/quick-ai-task-dialog.tsx`（新） | "发送给 AI / 启动 Autopilot" 快捷对话框 |
| 4.3 | `pages/solo/autopilot/index.tsx` | 接收 `preloadContext` 路由 state，注入到初始知识检索 |

### Phase 5：主页面重组（1天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 5.1 | `pages/solo/knowledge/index.tsx` | 替换为三栏布局：TreeNav + DocViewer + RelationPanel |
| 5.2 | `pages/solo/knowledge/index.tsx` | 集成搜索栏 + 健康度仪表板 |
| 5.3 | `pages/solo/knowledge/index.tsx` | 浏览模式（无选中）→ 渲染增强卡片网格 `KnowledgeGridView` |

### Phase 6：搜索与健康度（1天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 6.1 | `components/knowledge/knowledge-search-bar.tsx`（新） | 全文搜索 + 多维过滤器 |
| 6.2 | `components/knowledge/knowledge-health-dashboard.tsx`（新） | 健康报告展开面板 |
| 6.3 | `pages/solo/knowledge/index.tsx` | 搜索结果 → 高亮 Tree 节点 + 中央区渲染搜索结果列表 |

---

## 10. 新旧能力对比

| 能力 | 现有页面 | 重构后 |
|------|:-------:|:------:|
| 个人笔记（踩坑/洞察/技术笔记） | ✅ | ✅ |
| 行为知识（Skill API） | ✅ | ✅ |
| 产品文档（PRD/SDD）浏览 | ❌ | ✅ |
| 迭代记录（假设/任务/版本）浏览 | ❌ | ✅ |
| 架构决策（ADR）浏览 | ❌ | ✅ |
| 文档链导航（上下游） | ❌ | ✅ |
| 全文搜索 | 仅私有笔记 | ✅ 三源全搜索 |
| 多维过滤（来源/层级/场景） | ❌ | ✅ |
| AI 使用路径（发送给 AI） | ❌ | ✅ |
| 启动 Autopilot（预填上下文） | ❌ | ✅ |
| 知识溯源（AI 生成的知识追踪） | ❌ | ✅ |
| 健康度报告（可交互） | 仅 badge | ✅ 可展开+导航 |
| 笔记创建入口 | ✅ 独立 Modal | ✅ Tree 右键 |
| 行为知识编辑 | ✅ | ✅ |
| 产品文档编辑入口 | ❌ | ✅（跳转到专用编辑器） |

---

## 11. 文件变更清单

**新增组件：**
- `components/knowledge/knowledge-tree-nav.tsx`
- `components/knowledge/knowledge-doc-viewer.tsx`
- `components/knowledge/doc-chain-breadcrumb.tsx`
- `components/knowledge/doc-meta-header.tsx`
- `components/knowledge/doc-relation-panel.tsx`
- `components/knowledge/knowledge-grid-view.tsx`
- `components/knowledge/knowledge-search-bar.tsx`
- `components/knowledge/knowledge-health-dashboard.tsx`
- `components/knowledge/quick-ai-task-dialog.tsx`

**修改文件：**
- `pages/solo/knowledge/index.tsx`（完整重写，新三栏布局）
- `services/knowledge-index.ts`（新增 `getNodeByFilePath` 辅助）
- `services/file-store.ts`（统一 ADR 加载接口）
- `stores/app-store.tsx`（新增 `scanKnowledgeIndex` action）
- `pages/solo/autopilot/index.tsx`（接收 `preloadContext`）

**不变文件（后端服务层已就绪）：**
- `services/knowledge-behavior.ts` ✅
- `services/knowledge-sink.ts` ✅
- `services/knowledge-retrieval.ts` ✅
- `services/knowledge-scanner.ts` ✅
