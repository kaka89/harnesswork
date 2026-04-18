---
feature: knowledge-system
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
related-sdd: [SDD-008, SDD-009, SDD-010]
created: "2026-04-15"
updated: "2026-04-18"
---

# 个人知识库（独立版）

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F011 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-06](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md)、[SDD-010](spec/SDD-010-solo-knowledge-base.md)（本特性详细设计） |
| 前置 SDD | [SDD-008](../knowledge-scanner-dir-compat/spec/SDD-009-knowledge-scanner-dir-structure-compat.md)（fileRead/fileWrite 降级链）、[SDD-009](../knowledge-scanner-dir-compat/spec/SDD-009-knowledge-scanner-dir-structure-compat.md)（YAML 多格式扫描） |
| 关联特性 | [memory-capability](../memory-capability/memory-capability.md)（记忆能力，上层消费方） |
| 创建日期 | 2026-04-15 |
| 最后更新 | 2026-04-18 |

## 特性描述

星静独立版的个人知识库，由 6 个协作服务 + 10 个 UI 组件组成，实现知识的索引、检索、扫描、健康度管理、沉淀和行为分析的完整闭环。知识来源包括：

1. **行为知识**（OpenWork Skill API）——团队共享的最佳实践、架构模式
2. **工作空间文档**（dir-graph.yaml 驱动扫描）——PRD / SDD / Task / Hypothesis / Knowledge 等活文档与增量文档

两源知识在 `knowledge-index` 中聚合为统一索引，UI 层分三组展示（产品文档 / 个人笔记 / 行为知识）。

## 核心服务

| 服务 | 路径 | 职责 | 大小 |
|------|------|------|------|
| knowledge-index | `services/knowledge-index.ts` | 两源知识索引构建，TF-IDF 倒排索引，多维排序 | 470 行 |
| knowledge-retrieval | `services/knowledge-retrieval.ts` | 统一检索入口，5 分钟内存缓存，Markdown 格式化 | 212 行 |
| knowledge-scanner | `services/knowledge-scanner.ts` | dir-graph.yaml 驱动文档扫描，台账优先 + 文件系统降级 | 689 行 |
| knowledge-health | `services/knowledge-health.ts` | stale 检测(90天)、一致性校验、晋升推荐 | 366 行 |
| knowledge-sink | `services/knowledge-sink.ts` | Agent 产出按 agentId 分类沉淀，去重 1 分钟窗口 | 334 行 |
| knowledge-behavior | `services/knowledge-behavior.ts` | OpenWork Skill API 适配层，行为知识 CRUD | 199 行 |

## UI 组件

| 组件 | 路径 | 职责 |
|------|------|------|
| SoloKnowledge | `pages/solo/knowledge/index.tsx` | 知识库主页面，三栏布局入口 (327 行) |
| KnowledgeTreeNav | `components/knowledge/knowledge-tree-nav.tsx` | 左侧文档树导航 |
| KnowledgeDocViewer | `components/knowledge/knowledge-doc-viewer.tsx` | 文档阅读器 |
| KnowledgeGridView | `components/knowledge/knowledge-grid-view.tsx` | 文档网格视图 |
| KnowledgeSearchBar | `components/knowledge/knowledge-search-bar.tsx` | 搜索栏（源/类型/场景过滤） |
| KnowledgeHealthDashboard | `components/knowledge/knowledge-health-dashboard.tsx` | 健康度仪表盘 |
| DocRelationPanel | `components/knowledge/doc-relation-panel.tsx` | 右侧文档关联面板 |
| DocChainBreadcrumb | `components/knowledge/doc-chain-breadcrumb.tsx` | 文档链路面包屑 |
| QuickAITaskDialog | `components/knowledge/quick-ai-task-dialog.tsx` | 快速 AI 任务对话框 |
| CreateNoteModal | `components/knowledge/create-note-modal.tsx` | 笔记创建模态框 |
| StructuredDocViewer | `components/knowledge/structured-doc-viewer.tsx` | 结构化文档查看器 |
| DocMetaHeader | `components/knowledge/doc-meta-header.tsx` | 文档元数据头部 |

## 两源知识架构

```
┌──────────────────────────────────────────────────────────────┐
│                    知识库页面 (SoloKnowledge)                  │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │ 文档树    │  │ 阅读器 / 网格   │  │ 关联面板            │  │
│  │ (240px)  │  │ (flex-1)       │  │ (260px)            │  │
│  └──────────┘  └────────────────┘  └─────────────────────┘  │
│       搜索栏 + 健康度仪表盘                                    │
└──────────────────────┬───────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │ knowledge-index │
              │ TF-IDF 倒排索引  │
              │ 多维排序(7维加权) │
              └───┬─────────┬───┘
                  │         │
    ┌─────────────┘         └─────────────┐
    │                                     │
  行为知识                            工作空间文档
  (OpenWork Skill API)           (dir-graph.yaml 驱动)
  knowledge-behavior              knowledge-scanner
    │                                     │
    └──────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
  检索        健康度      沉淀
  retrieval   health     sink
```

## 文件操作降级链

知识库页面通过 `opencode-client.ts` 的文件操作函数访问工作区文件，采用多层降级确保可用性：

### fileList（目录列表）——四层降级

| Level | 通道 | 说明 |
|-------|------|------|
| 0 | OpenWork Server readdir API | 通过 `_owFileOps.list()` 调用，接受绝对路径 |
| 1 | OpenCode SDK `client.file.list()` | HeyAPI SDK 标准调用 |
| 2 | tauriFetch 直连 OpenCode | 绕过 CORS，`GET /file?path=...` |
| 3 | Tauri native `readDir()` | 终极兜底，无网络依赖（SDD-009） |

### fileRead（文件读取）——四层降级

| Level | 通道 | 说明 |
|-------|------|------|
| 1 | OpenWork Server 文件 API | `_owFileOps.read()`，仅支持文本类型 |
| 2 | OpenCode SDK `client.file.read()` | HeyAPI SDK |
| 3 | tauriFetch 直连 OpenCode | `GET /file/content?path=...` |
| 4 | Tauri native `readTextFile()` | 终极兜底（SDD-008） |

## 知识条目结构

```typescript
interface KnowledgeEntry {
  id: string;
  source: 'behavior' | 'private' | 'workspace-doc';
  title: string;
  summary: string;
  tags: string[];
  category: string;           // baseline | process-delivery | process-research
  applicableScenes: string[]; // product-planning | requirement-design | ...
  docType?: string;           // PRD | SDD | Task | Hypothesis | Knowledge ...
  layer?: string;             // product | iterations | knowledge | runtime | code
  owner?: string;             // Agent ID（product-brain / eng-brain 等）
  upstream?: string[];        // 上游文档链路
  downstream?: string[];      // 下游文档链路
  lifecycle: 'living' | 'stable';
  date?: string;              // indexedAt 时间
  filePath?: string;          // 相对于 workDir 的文件路径
  sourceAgentId?: string;     // 溯源：生成此知识的 Agent ID
  sourceSessionId?: string;   // 溯源：原始会话 ID
}
```

## dir-graph.yaml 驱动的扫描流程

```
scanWorkspaceDocs(workDir)
 ├─ loadDirGraph()              读取 .xingjing/dir-graph.yaml
 ├─ 遍历 doc-types
 │   ├─ resolvePathVars()       解析 path-vars（如 {feature}）
 │   ├─ expandWildcardPaths()   通配符展开（列举子目录）
 │   ├─ scanFromIndex()         台账优先：解析 _index.yml → items[]
 │   │   └─ 过滤条件：items 非空
 │   └─ scanFromFileSystem()    降级：文件系统扫描（递归≤2层）
 │       └─ 过滤条件：isScannableDoc(.md/.yml/.yaml)
 │                    && !isSystemIndexFile(_开头排除)
 │                    && matchesNaming(命名约定)
 ├─ extractDocKnowledge()       差异化提取
 │   ├─ YAML 文件 → parseYamlSimple() 整体解析
 │   └─ Markdown 文件 → parseFrontmatter() 分离 frontmatter + body
 └─ fallbackScan()              dir-graph 不存在时的通用降级扫描
```

### Solo 模式 dir-graph.yaml 文档类型

| 文档类型 | 分类 | 路径模板 | 命名约定 | 格式 |
|---------|------|---------|---------|------|
| PRD | living | `product/features/{feature}/PRD.md` | 固定文件名 | Markdown |
| SDD | living | `product/features/{feature}/SDD.md` | 固定文件名 | Markdown |
| Hypothesis | incremental | `iterations/hypotheses/` | `H-{NNN}-{name}.md` | Markdown |
| Task | incremental | `iterations/tasks/` | `T-{NNN}-{name}.yml` | YAML |
| Release | incremental | `iterations/releases/` | `v{x.y.z}.yml` | YAML |
| Knowledge | knowledge | `knowledge/{category}/` | `K-{NNN}-{name}.md` | Markdown |

## 检索排序算法

多维融合排序（7 个维度加权）：

| 维度 | 权重 | 说明 |
|------|------|------|
| 场景匹配 | 0.25 | 当前场景在知识条目的 `applicableScenes` 列表中 |
| 标签相关性 | 0.20 | 查询关键词与 title/summary/tags 的匹配率 |
| 文档链路近邻度 | 0.20 | 基于 DOC_CHAIN_ORDER 计算链路距离（GLOSSARY→PRD→SDD→MODULE→PLAN→TASK） |
| 时效性 | 0.10 | <7天 0.10 / <30天 0.08 / <90天 0.05 / 其他 0.02 |
| 热度 | 0.10 | 基于 referenceCount（阶段三实现，当前基础分 0.03） |
| 知识层级近邻度 | 0.10 | 同层级优先（feature > application > domain > product-line > platform） |
| 生命周期 | 0.05 | stable 0.05 / living 0.02 |

## 缓存策略

| 缓存层 | TTL | 说明 |
|--------|-----|------|
| 内存缓存 | 5 分钟 | 索引构建结果缓存（knowledge-retrieval 管理） |
| 引用计数 | 5 秒防抖 | 批量更新引用计数，避免频繁写入 |

## 知识健康度管理

knowledge-health 服务提供以下检测能力：

| 能力 | 说明 |
|------|------|
| **stale 检测** | 超过 90 天未更新且无引用的条目标记为 stale |
| **一致性校验** | 术语一致性（GLOSSARY 交叉引用）+ 文档链路完整性（doc-chain 引用验证） |
| **晋升推荐** | 引用次数 ≥ 5 的私有知识自动推荐晋升为行为知识 |
| **健康度评分** | overall = 各源均值 × 0.7 + 一致性分 × 0.3 - stale 惩罚(3分/条) |
| **治理仪表盘** | 展示知识总量、健康度百分比、stale 条目列表、晋升候选 |

## 知识沉淀流程

knowledge-sink 服务负责将 Agent 产出自动分流沉淀：

```
Agent 产出 (输出 > 200 字符时触发)
    │
    ├── 去重检查（同 agentId + sessionId，1 分钟窗口）
    │
    ├── 知识提取（优先级：产出物块 > 执行结果块 > 最长结构化段落）
    │
    ├── 按 Agent 分类
    │   ├── pm-agent / product-brain → 行为知识（process / 产品规划）
    │   ├── arch-agent → 行为知识（architecture / 技术设计）
    │   ├── eng-brain / dev-agent / qa-agent → 行为知识（best-practice / 代码开发）
    │   └── growth-brain / ops-brain / sre-agent / mgr-agent → 私有知识
    │
    ├── 沉淀执行
    │   ├── 行为知识 → Skill API（saveBehaviorKnowledge）
    │   │   └── 失败时降级 → 私有知识
    │   └── 私有知识 → 本地文件（saveSoloKnowledge → .xingjing/solo/knowledge/）
    │
    └── 更新索引 → invalidateKnowledgeCache()
```

## 与 memory-capability 的关系

知识系统（本特性）关注**持久化知识的管理**——索引、检索、扫描、健康度。
记忆能力（memory-capability）关注**会话历史的记忆**——摘要、压缩、回忆。

两者通过以下接口协作：
- `retrieveKnowledge()` 被 Autopilot 和 Pipeline 调用，注入知识上下文
- `recallRelevantContext()` 被同时调用，注入历史会话上下文
- 两者结果合并后作为 Agent 的增强 System Prompt

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 检索算法 | TF-IDF + 7 维融合排序 | 无需向量数据库，零外部依赖 |
| D2 | 文档扫描驱动 | dir-graph.yaml 配置化 | 支持 Solo 四层和 Team 六层，不硬编码路径 |
| D3 | 扫描策略 | 台账优先 + 文件系统降级 | 台账有权威性（_index.yml），文件系统作为兜底保障 |
| D4 | 台账文件排除 | `_` 开头文件视为系统元数据 | 防止 `_index.yml` 被当作普通文档重复扫描（幽灵文档问题） |
| D5 | 多格式支持 | .md + .yml/.yaml 差异化解析 | YAML 整体解析 + 伪 body 拼接，复用现有摘要提取逻辑 |
| D6 | 沉淀通道 | 行为知识走 Skill API，私有知识走 file API | 遵循 SDD-001 写入通道规范，行为知识失败自动降级 |
| D7 | 降级策略 | 知识检索失败时静默跳过 | 不阻塞 Agent 主流程 |
| D8 | 缓存策略 | 纯内存 5 分钟 TTL | 索引构建轻量，无需磁盘缓存 |
| D9 | 文件操作降级 | 四层降级链（OpenWork → OpenCode SDK → tauriFetch → Tauri native） | 保证离线/断网/配置异常场景下仍可正常工作 |

## 行为规格

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 打开知识库页面 | 自动执行 dir-graph 扫描 + 行为知识加载，构建索引 |
| BH-02 | 搜索关键词 | TF-IDF + 多维排序返回匹配结果 |
| BH-03 | 按源过滤 | 可按「产品文档 / 个人笔记 / 行为知识」过滤 |
| BH-04 | 按文档类型过滤 | 可按 PRD / SDD / Task / Hypothesis 等类型过滤 |
| BH-05 | 选中文档 | 中央阅读器展示完整内容，右侧显示关联文档 |
| BH-06 | 文档链路导航 | 可通过上下游链路在 PRD↔SDD↔PLAN↔TASK 间跳转 |
| BH-07 | 发送给 AI | 将知识条目作为上下文导航到 Autopilot 页面 |
| BH-08 | 启动 Autopilot | 弹出快速任务对话框，填写目标后跳转 Autopilot |
| BH-09 | 复制引用 | 复制 `[DOC_TYPE@layer title]` 格式引用到剪贴板 |
| BH-10 | 创建笔记 | 通过 CreateNoteModal 创建个人笔记，保存到 .xingjing/solo/knowledge/ |
| BH-11 | 健康度检查 | 自动计算并展示健康度评分，标记 stale 条目 |
| BH-12 | 刷新索引 | 点击刷新按钮清除缓存并重新扫描 |
| BH-13 | 产品切换 | activeProduct 变化时自动重新加载索引 |
| BH-14 | _index.yml 为空台账 | scanFromIndex 返回 0 条，降级到文件系统扫描，`_index.yml` 自身不被扫描为文档 |
| BH-15 | OpenCode 不可用 | fileList/fileRead 自动降级到 Tauri native fs，知识库正常加载 |

## 验收标准

- [x] 两源知识（行为/工作空间文档）统一索引构建
- [x] TF-IDF + 7 维融合排序检索返回正确结果
- [x] dir-graph.yaml 驱动文档扫描正常工作（Markdown + YAML）
- [x] 台账文件（`_` 开头）不被当作普通文档扫描
- [x] fileList 四层降级链在 OpenCode 不可用时仍能工作
- [x] 知识健康度检测、一致性校验和晋升推荐正常
- [x] Agent 产出按 agentId 自动分流沉淀
- [x] 缓存命中时检索延迟 < 500ms
- [x] 检索失败时静默降级，不影响主流程
- [x] 三栏布局 UI 正常展示（文档树/阅读器/关联面板）
- [x] AI 路径集成正常（发送给 AI / 启动 Autopilot / 复制引用）
- [x] 笔记创建与保存正常
