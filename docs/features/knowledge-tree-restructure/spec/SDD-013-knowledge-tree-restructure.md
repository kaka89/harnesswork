---
meta:
  id: SDD-013
  title: 知识库导航树语义分层重构
  status: draft
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: SDD-010
  revision: "1.0"
  created: "2026-04-18"
  updated: "2026-04-18"
sections:
  background: "当前知识库导航树按 docType 扁平分组（PRD/SDD/TASK/...），缺乏'产品设计 vs 迭代'语义分层；knowledge/ 目录文件被归入 workspace-doc 而非'个人笔记'"
  goals: "将产品文档拆分为'产品设计'（Overview/Roadmap/产品特性树）和'迭代'（反馈/产品假设/发布/任务/归档）两个语义子分类；将 knowledge/ 目录文件正确归入个人笔记分组"
  architecture: "修改 groupEntriesForTree 按 filePath 前缀重分类；重写 knowledge-tree-nav.tsx 用递归 DocTreeSection 组件渲染多级折叠树；补充 dir-graph Feedback docType"
  interfaces: "groupEntriesForTree, classifyWorkspaceDocs, DocTreeSection, TreeSectionNode"
  nfr: "树形渲染无卡顿；折叠/展开响应 < 50ms；向后兼容现有知识索引和检索链路"
---

# SDD-013 知识库导航树语义分层重构

## 元信息

- 编号：SDD-013-knowledge-tree-restructure
- 状态：draft
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-18
- 前置依赖：SDD-010（独立版个人知识库技术设计）

---

## 1. 背景与问题域

### 1.1 当前状态

知识库导航树由 `groupEntriesForTree()` 生成三个顶级分组：

| 分组 | source | 当前子分组方式 | 问题 |
|------|--------|--------------|------|
| 产品文档 | workspace-doc | 按 docType 扁平分组（PRD/SDD/MODULE/PLAN/TASK/GLOSSARY） | 缺乏语义分层，用户无法区分"产品设计"和"迭代过程" |
| 个人笔记 | private | 按 category 分组（踩坑记录/用户洞察/技术笔记） | **始终为空** — buildKnowledgeIndex 不产出 source='private' 条目 |
| 行为知识 | behavior | 平铺列表 | 无问题 |

### 1.2 核心问题

1. **语义缺失**：`product/overview.md`、`product/features/*/PRD.md` 和 `iterations/tasks/*.yml` 混在同一个"产品文档"分组下，仅按 docType 区分，用户无法直观看到"我的产品设计长什么样"和"我的迭代进展如何"
2. **knowledge/ 归类错误**：`knowledge/` 目录被 dir-graph 以 docType=Knowledge 扫描，归入 `workspace-doc`，而非预期的"个人笔记"
3. **Feature 树缺失**：产品特性（product/features/{feature}/PRD.md + SDD.md）没有按 feature 目录分组，用户无法浏览完整的功能全景
4. **反馈目录遗漏**：`iterations/feedbacks/` 已在产品初始化时创建，但 dir-graph 模板缺少 Feedback docType 定义

### 1.3 与上下游 SDD 的关系

```
SDD-010 scope: 完整知识库系统设计（索引/扫描/检索/健康度/沉淀）
    ↓
SDD-013 scope: 知识库导航树 UI 层语义分层重构（本文档）
    ↑ 复用 SDD-010 的 KnowledgeIndex / KnowledgeEntry 数据模型
    ↑ 不修改 scanner、retrieval、health、sink 核心链路
```

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 目标 |
|------|------|
| FR-01 | 产品文档分为"产品设计"和"迭代"两个语义子分类 |
| FR-02 | 产品设计包含 Overview、Roadmap、产品特性（按 feature 目录分组，每个 feature 含 PRD/SDD） |
| FR-03 | 迭代包含反馈、产品假设、发布、任务、归档五个子目录 |
| FR-04 | knowledge/ 目录文件归入"个人笔记"分组，按用户洞察/踩坑记录/技术笔记三类展示 |
| FR-05 | dir-graph 模板新增 Feedback docType，支持新建产品自动生成反馈目录配置 |
| FR-06 | fallbackScan 细化迭代子目录映射，无 dir-graph 时也能正确分类 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 数据模型 | 不修改 KnowledgeEntry / KnowledgeIndex / WorkspaceDocKnowledge 接口 |
| 扫描层 | 不修改 knowledge-scanner.ts 的核心扫描逻辑（scanDocType/extractDocKnowledge） |
| 检索层 | 不修改 knowledge-retrieval.ts / knowledge-index.ts 的 searchKnowledge |
| 兼容性 | 已有产品（无 Feedback docType）仍能正常加载 |

### 2.3 不在范围内

- 修改知识索引构建逻辑（buildKnowledgeIndex）
- 修改知识检索排序算法（rankKnowledgeResults）
- 修改知识沉淀链路（knowledge-sink）
- 修改网格视图分组方式（knowledge-grid-view）

---

## 3. 架构设计

### 3.1 目标导航树结构

```
产品文档 (workspace-doc, 排除 knowledge/ 路径)
  +-- 产品设计 (product/)
  |     +-- Overview (product/overview.md)
  |     +-- Roadmap (product/roadmap.md)
  |     +-- 产品特性 (product/features/)
  |           +-- {feature-name-A}
  |           |     +-- PRD
  |           |     +-- SDD
  |           +-- {feature-name-B}
  |                 +-- PRD
  |                 +-- SDD
  +-- 迭代 (iterations/)
        +-- 反馈       (iterations/feedbacks/)
        +-- 产品假设   (iterations/hypotheses/)
        +-- 发布       (iterations/releases/)
        +-- 任务       (iterations/tasks/)
        +-- 归档       (iterations/archive/)
个人笔记 (knowledge/ 路径条目重分类为 private)
  +-- 用户洞察   (knowledge/insights/)
  +-- 踩坑记录   (knowledge/pitfalls/)
  +-- 技术笔记   (knowledge/tech-notes/)
行为知识 (behavior)
  +-- (平铺列表)
```

### 3.2 数据流变更

```
变更前:
  groupEntriesForTree(index)
    → filter source === 'workspace-doc'  →  产品文档（含 knowledge/ 条目）
    → filter source === 'private'        →  个人笔记（始终为空）
    → filter source === 'behavior'       →  行为知识

  knowledge-tree-nav.tsx
    → subGroupWorkspaceDocs()  →  按 docType 扁平分组

变更后:
  groupEntriesForTree(index)
    → filter workspace-doc && !knowledge/  →  产品文档
    → filter workspace-doc && knowledge/   →  重分类为 private + 推断 category
    → filter source === 'private'          →  个人笔记（含重分类条目）
    → filter source === 'behavior'         →  行为知识

  knowledge-tree-nav.tsx
    → classifyWorkspaceDocs()  →  按 filePath 前缀分类为 DocTreeSection 树
    → TreeSectionNode 递归渲染  →  多级折叠
```

### 3.3 核心模块说明

| 模块 | 文件 | 变更类型 | 说明 |
|------|------|---------|------|
| 索引分组 | knowledge-index.ts | 修改 | groupEntriesForTree + 新增 inferKnowledgeCategory |
| 树形导航 | knowledge-tree-nav.tsx | 重写 | 新增 DocTreeSection + classifyWorkspaceDocs + TreeSectionNode |
| Dir-graph 模板 | product-dir-structure.ts | 修改 | buildSoloDirGraphSimple 新增 Feedback docType |
| 降级扫描 | knowledge-scanner.ts | 修改 | fallbackScan 细化迭代子目录 |

---

## 4. 接口设计

### 4.1 groupEntriesForTree 变更

```typescript
// 新增辅助函数
function inferKnowledgeCategory(filePath: string): string;
// 返回: 'pitfall' | 'user-insight' | 'tech-note'
// 规则: pitfalls/ → pitfall, insights/ → user-insight, tech-notes/ → tech-note
```

### 4.2 DocTreeSection 接口（新增）

```typescript
interface DocTreeSection {
  id: string;
  label: string;
  icon: string;
  entries?: KnowledgeEntry[];   // 叶节点条目
  children?: DocTreeSection[];  // 子分组
}
```

### 4.3 classifyWorkspaceDocs 函数（新增）

```typescript
function classifyWorkspaceDocs(entries: KnowledgeEntry[]): DocTreeSection[];
// 输入: workspace-doc 条目列表
// 输出: [{ id: 'product-design', children: [...] }, { id: 'iterations', children: [...] }]
```

### 4.4 dir-graph 新增 Feedback docType

```yaml
Feedback:
  name: 用户反馈
  category: incremental
  naming: "FB-{NNN}-{name}.md"
  location: "iterations/feedbacks/"
  owner: product-brain
  index: _index.yml
```

---

## 5. 关键设计决策

### ADR-7: knowledge/ 条目在分组层重分类

**决策**：在 `groupEntriesForTree` 中按 filePath 前缀将 knowledge/ 条目从 workspace-doc 重分类为 private，而非修改 scanner 层。

**理由**：
1. Scanner 层的 source='workspace-doc' 语义正确——knowledge/ 文件确实是 workspace 中的文件
2. 重分类仅影响 UI 展示分组，不影响索引和检索链路
3. 避免修改 scanner 层引入回归风险

### ADR-8: 路径前缀分类 + 递归组件渲染

**决策**：树形导航采用 filePath 前缀分类（product/ vs iterations/），用递归 DocTreeSection 组件渲染多级折叠。

**理由**：
1. filePath 是 KnowledgeEntry 已有字段，无需新增数据
2. 目录结构由 ENGINEERING-STRUCTURE-SOLO.md 规范化，路径前缀稳定可靠
3. 递归组件统一处理各层级渲染，代码复用度高

---

## 6. 非功能需求

| 指标 | 要求 |
|------|------|
| 树形渲染帧率 | 60fps（无卡顿） |
| 折叠/展开响应 | < 50ms |
| 向后兼容 | 已有产品无 Feedback docType 仍正常加载 |
| 数据模型零变更 | KnowledgeEntry / KnowledgeIndex 接口不修改 |

---

## 7. 测试验证

| # | 场景 | 预期结果 |
|---|------|---------|
| T-01 | 打开知识库页面 | 产品文档下显示"产品设计"和"迭代"两个子分类 |
| T-02 | 展开产品设计 | 显示 Overview、Roadmap、产品特性三个子项 |
| T-03 | 展开产品特性 | 按 feature 目录名分组，每个 feature 下有 PRD/SDD |
| T-04 | 展开迭代 | 显示反馈、产品假设、发布、任务、归档五个子项 |
| T-05 | knowledge/ 目录有文件 | 出现在"个人笔记"分组而非"产品文档" |
| T-06 | 个人笔记展开 | 按用户洞察/踩坑记录/技术笔记三类显示 |
| T-07 | 已有产品无 Feedback docType | 迭代下反馈子项为空，不报错 |
| T-08 | 新建产品 | dir-graph.yaml 包含 Feedback docType 定义 |

---

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `services/knowledge-index.ts` | 修改 | groupEntriesForTree 路径重分类 + inferKnowledgeCategory |
| `components/knowledge/knowledge-tree-nav.tsx` | 重写 | DocTreeSection + classifyWorkspaceDocs + TreeSectionNode 递归渲染 |
| `services/product-dir-structure.ts` | 修改 | buildSoloDirGraphSimple 新增 Feedback docType |
| `services/knowledge-scanner.ts` | 修改 | fallbackScan 细化迭代子目录映射 |

---

## 9. 修订历史

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| 1.0 | 2026-04-18 | 初始版本 — 知识库导航树语义分层重构设计 |
