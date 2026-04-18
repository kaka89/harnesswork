---
meta:
  id: SDD-010
  title: 独立版个人知识库技术设计
  status: implemented
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: F011-knowledge-system
  revision: "1.0"
  created: "2026-04-18"
  updated: "2026-04-18"
sections:
  background: "星静独立版个人知识库的完整技术设计，涵盖两源知识索引、dir-graph 驱动扫描、多格式解析、四层降级文件操作、健康度检测、Agent 产出沉淀和三栏知识管理 UI"
  goals: "基于 dir-graph.yaml 权威文档地图实现零硬编码扫描；两源知识（行为 + 工作空间文档）统一索引与 7 维融合排序检索；四层降级文件操作确保离线可用；Agent 产出按角色自动分流沉淀"
  architecture: "6 服务 + 12 组件：knowledge-index（索引）→ knowledge-retrieval（检索）→ knowledge-scanner（扫描）→ knowledge-health（健康度）→ knowledge-sink（沉淀）→ knowledge-behavior（行为知识 Skill API 适配）"
  interfaces: "scanWorkspaceDocs, buildKnowledgeIndex, searchKnowledge, retrieveKnowledge, checkKnowledgeHealth, sinkAgentOutput, fileList, fileRead"
  nfr: "缓存命中时检索延迟 < 500ms；fileList 四层降级在 OpenCode 不可用时成功率 100%（Tauri 环境）；YAML 文档类型覆盖率 100%"
---

# SDD-010 独立版个人知识库技术设计

## 元信息

- 编号：SDD-010-solo-knowledge-base
- 状态：implemented
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-18
- 前置依赖：SDD-008（fileRead/fileWrite Tauri 兜底）、SDD-009（fileList Tauri 兜底 + YAML 多格式扫描）

---

## 1. 背景与问题域

### 1.1 系统定位

个人知识库是星静独立版的核心知识管理能力，为用户提供产品全生命周期的知识统一浏览、检索和 AI 集成。知识来源包括：

| 知识源 | 载体 | 管理方式 |
|--------|------|---------|
| 行为知识 | OpenWork Skill API（`.opencode/skills/knowledge-*`） | 团队共享，版本控制 |
| 工作空间文档 | 产品工作目录下的 Markdown/YAML 文件 | dir-graph.yaml 驱动扫描 |

### 1.2 与上下游 SDD 的关系

```
SDD-008 scope: fileRead ✅ / fileWrite ✅ / fileList ❌
SDD-009 scope: fileList Tauri 兜底 ✅ / YAML 多格式扫描 ✅
SDD-010 scope: 完整知识库系统设计（本文档）
    ↑ 依赖 SDD-008/009 的文件操作基础设施
    ↑ 依赖 SDD-002 星静扩展架构
    ↓ 被 memory-capability 消费（注入知识上下文到 Agent prompt）
```

### 1.3 前序修复记录

| 问题 | 根因 | 修复 | SDD |
|------|------|------|-----|
| fileList 三层降级全失败 | 缺少 OpenWork Server readdir 层 | 新增 Level 0 OpenWork readdir API | — |
| tauriNativeFileList 静默失败 | catch 块吞掉错误 | 改为输出 warn 日志 | — |
| "未命名" 幽灵 task 文件 | `_index.yml` 被当作普通文档扫描 | 新增 `isSystemIndexFile()` 排除 `_` 开头文件 | — |
| YAML 文件不被扫描 | scanFromFileSystem 只匹配 .md | `isScannableDoc()` 扩展 .yml/.yaml | SDD-009 |
| YAML 文件元数据丢失 | extractDocKnowledge 用 Markdown 格式解析 YAML | 差异化解析（parseYamlSimple vs parseFrontmatter） | SDD-009 |

---

## 2. 架构设计

### 2.1 系统架构总览

```
┌────────────────────────────────────────────────────────────────┐
│                    SoloKnowledge 页面                           │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────────┐    │
│  │ 文档树    │  │ 阅读器 / 网格   │  │ 关联面板            │    │
│  │ (240px)  │  │ (flex-1)       │  │ (260px)            │    │
│  └──────────┘  └────────────────┘  └─────────────────────┘    │
│       搜索栏 + 健康度仪表盘                                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │ knowledge-index │
                   │ 两源聚合索引      │
                   │ TF-IDF 倒排索引   │
                   │ 7 维融合排序       │
                   └───┬────────┬────┘
                       │        │
         ┌─────────────┘        └─────────────┐
         │                                     │
    行为知识                              工作空间文档
    knowledge-behavior                    knowledge-scanner
    (Skill API 适配)                     (dir-graph.yaml 驱动)
         │                                     │
         │                        ┌────────────┤
         │                        │            │
    OpenWork Skill API       台账优先扫描   文件系统降级扫描
    (.opencode/skills/)      (_index.yml)  (递归 ≤2 层)
                                  │            │
                             ┌────┴────────────┴────┐
                             │  fileList / fileRead  │
                             │  四层降级文件操作       │
                             └──────────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   │                   │                   │
            knowledge-retrieval   knowledge-health    knowledge-sink
            统一检索入口           健康度检测           Agent 产出沉淀
            5 分钟内存缓存         90天 stale 检测      agentId 分类
            Markdown 格式化        一致性校验           去重 1 分钟窗口
            引用计数防抖           晋升推荐
```

### 2.2 核心数据流

```
1. 页面加载
   SoloKnowledge.loadIndex()
   → scanWorkspaceDocs(workDir)
     → loadDirGraph() → 解析 .xingjing/dir-graph.yaml
     → 遍历 doc-types → scanDocType()
       → expandWildcardPaths() → fileList (展开 {feature} 占位符)
       → scanFromIndex() / scanFromFileSystem()
       → extractDocKnowledge() → 差异化解析 (YAML vs Markdown)
   → buildKnowledgeIndex(workDir, skillApi, scannedDocs)
     → listBehaviorKnowledge(skillApi) → Skill API 列表
     → 聚合 → 构建 tagIndex / sceneIndex / docTypeIndex / layerIndex / invertedIndex

2. 用户搜索
   searchKnowledge(index, context, maxResults)
   → 倒排索引 + 标签索引 + 场景索引 + 文档类型索引 → 收集候选 ID
   → rankKnowledgeResults() → 7 维加权排序
   → 返回 KnowledgeEntry[]

3. Agent 知识注入
   retrieveKnowledge(opts)
   → getOrBuildIndex() → 带 5 分钟 TTL 的内存缓存
   → searchKnowledge() → 最多 5 条结果
   → formatKnowledgeResults() → Markdown 块（[Skill] / [DOC@layer]）
   → scheduleRefUpdate() → 5 秒防抖批量更新引用计数

4. Agent 产出沉淀
   sinkAgentOutput(opts)
   → 前置检查（>200 字符 + 去重）
   → extractKnowledgeFromOutput() → 产出物块 > 执行结果块 > 最长段落
   → classifyByAgent() → 按 agentId 分类
   → sinkAsBehaviorKnowledge() 或 sinkAsPrivateKnowledge()
   → invalidateKnowledgeCache()
```

---

## 3. 接口设计

### 3.1 知识扫描器 (knowledge-scanner.ts, 689 行)

```typescript
// 主入口：扫描整个工作空间
export async function scanWorkspaceDocs(
  workDir: string,
): Promise<WorkspaceDocKnowledge[]>;

// 增量扫描：仅扫描指定路径
export async function scanSingleDoc(
  workDir: string,
  filePath: string,
): Promise<WorkspaceDocKnowledge | null>;
```

**内部函数调用链**：

| 函数 | 职责 | 输入 → 输出 |
|------|------|------------|
| `loadDirGraph` | 解析 dir-graph.yaml | workDir → DirGraphConfig \| null |
| `normalizeDirGraph` | 兼容 v1/v2 格式 | raw YAML → DirGraphConfig |
| `scanDocType` | 扫描单个文档类型 | docTypeKey + docTypeDef → WorkspaceDocKnowledge[] |
| `expandWildcardPaths` | 展开 {placeholder} | 路径模板 → 具体路径列表 |
| `scanFromIndex` | 台账优先扫描 | _index.yml 内容 → WorkspaceDocKnowledge[] |
| `scanFromFileSystem` | 文件系统扫描（递归≤2层） | 目录路径 → WorkspaceDocKnowledge[] |
| `extractDocKnowledge` | 差异化内容提取 | 文件路径 → WorkspaceDocKnowledge |
| `isScannableDoc` | 判断文件是否可扫描 | 文件名 → boolean (.md/.yml/.yaml) |
| `isSystemIndexFile` | 排除台账元数据文件 | 文件名 → boolean (\_开头) |
| `isYamlFile` | 判断是否 YAML 格式 | 文件路径 → boolean |
| `matchesNaming` | 命名约定匹配 | 文件名 + naming → boolean |
| `collectDocFiles` | 通用文档收集（降级） | 目录 + docType → void (写入 results) |
| `fallbackScan` | dir-graph 不存在时的降级 | workDir → WorkspaceDocKnowledge[] |

### 3.2 知识索引 (knowledge-index.ts, 470 行)

```typescript
// 构建两源索引
export async function buildKnowledgeIndex(
  workDir: string,
  skillApi: SkillApiAdapter | null,
  preloadedDocs?: WorkspaceDocKnowledge[],
): Promise<KnowledgeIndex>;

// 搜索索引
export function searchKnowledge(
  index: KnowledgeIndex,
  context: SearchContext,
  maxResults?: number,
): KnowledgeEntry[];

// 更新引用元数据
export async function updateReferenceMeta(
  workDir: string,
  knowledgeId: string,
  source: PrivateKnowledgeMeta['source'],
): Promise<void>;

// 按来源分组（UI 文档树）
export function groupEntriesForTree(index: KnowledgeIndex): KnowledgeTreeGroup[];
```

**KnowledgeIndex 结构**：

```typescript
interface KnowledgeIndex {
  version: 1;
  entries: KnowledgeEntry[];
  tagIndex: Record<string, string[]>;       // tag → entryIds
  sceneIndex: Record<string, string[]>;     // scene → entryIds
  docTypeIndex: Record<string, string[]>;   // docType → entryIds
  layerIndex: Record<string, string[]>;     // layer → entryIds
  invertedIndex: Record<string, string[]>;  // keyword → entryIds (TF-IDF)
  builtAt: string;
}
```

### 3.3 知识检索 (knowledge-retrieval.ts, 212 行)

```typescript
// 统一检索入口（返回格式化 Markdown，可直接注入 prompt）
export async function retrieveKnowledge(opts: RetrieveKnowledgeOpts): Promise<string>;

// 强制刷新索引缓存
export async function refreshKnowledgeIndex(
  workDir: string,
  skillApi: SkillApiAdapter | null,
): Promise<void>;

// 使缓存失效
export function invalidateKnowledgeCache(): void;
```

**格式化输出标注规则**：
- `[Skill]` — 行为知识
- `[笔记]` — 私有知识
- `[PRD@product]` — 工作空间文档（`[docType@layer]`）

### 3.4 知识健康度 (knowledge-health.ts, 366 行)

```typescript
export async function checkKnowledgeHealth(
  workDir: string,
  index: KnowledgeIndex,
): Promise<KnowledgeHealthScore>;
```

**KnowledgeHealthScore 结构**：

```typescript
interface KnowledgeHealthScore {
  overall: number;                    // 0-100 分
  bySource: {
    behavior: SourceHealthDetail;     // 行为知识分项
    private: SourceHealthDetail;      // 私有知识分项
    workspaceDoc: SourceHealthDetail; // 工作空间文档分项
  };
  staleEntries: StaleEntry[];         // >90天未更新 + 无引用
  promotionCandidates: PromotionCandidate[]; // 引用 ≥5 次推荐晋升
  consistency: ConsistencyReport;     // 术语一致性 + 文档链路完整性
  generatedAt: string;
}
```

**评分公式**：
```
overall = max(0, round(sourceAvg × 0.7 + consistency.score × 0.3 - stale × 3))
```

### 3.5 知识沉淀 (knowledge-sink.ts, 334 行)

```typescript
export async function sinkAgentOutput(opts: SinkAgentOutputOpts): Promise<SinkResult>;
```

**Agent 分类映射**：

| Agent ID | 知识类型 | 分类 | 场景 |
|----------|---------|------|------|
| pm-agent / product-brain | 行为知识 | process | product-planning |
| arch-agent | 行为知识 | architecture | technical-design |
| eng-brain / dev-agent / qa-agent | 行为知识 | best-practice | code-development |
| growth-brain / ops-brain / sre-agent / mgr-agent | 私有知识 | — | — |

### 3.6 行为知识管理 (knowledge-behavior.ts, 199 行)

```typescript
export async function listBehaviorKnowledge(api: SkillApiAdapter): Promise<BehaviorKnowledge[]>;
export async function getBehaviorKnowledge(api: SkillApiAdapter, id: string): Promise<BehaviorKnowledge | null>;
export async function saveBehaviorKnowledge(api: SkillApiAdapter, item: BehaviorKnowledge): Promise<boolean>;
```

**Skill 存储格式约定**（Markdown + frontmatter）：

```markdown
---
id: auto-xxx
title: 知识标题
category: best-practice
applicableScenes: [code-development]
tags: [架构, API]
lifecycle: living
refs: [PRD-001]
---
知识正文内容
```

### 3.7 文件操作降级链 (opencode-client.ts)

#### fileList（四层降级）

```
fileList(path, directory)
  ├─ Level 0: _owFileOps.list() (OpenWork Server readdir API)
  │   └─ 接受绝对路径，返回 {name, path, type, ext}[]
  │   └─ 路径拼接：directory + path → absPath
  ├─ Level 1: client.file.list() (OpenCode SDK)
  │   └─ HeyAPI SDK 标准调用
  ├─ Level 2: tauriFetch GET /file (直连 OpenCode)
  │   └─ 绕过 CORS
  └─ Level 3: tauriNativeFileList() (Tauri readDir)
      └─ 无网络依赖，仅桌面端可用
      └─ readDir → FileNode[] 格式适配
```

#### fileRead（四层降级）

```
fileRead(path, directory)
  ├─ Level 1: _owFileOps.read() (OpenWork Server 文件 API)
  │   └─ 仅支持 .md/.yml/.yaml/.json 等文本类型
  │   └─ 仅当 workspace 与目标目录匹配时使用
  ├─ Level 2: client.file.read() (OpenCode SDK)
  ├─ Level 3: tauriFetch GET /file/content (直连 OpenCode)
  └─ Level 4: tauriNativeFileRead() (Tauri readTextFile)
      └─ 支持 ~ 路径展开（expandTildePath）
```

---

## 4. 数据模型

### 4.1 核心类型

```typescript
/** Workspace 文档知识（由 dir-graph.yaml 驱动扫描） */
interface WorkspaceDocKnowledge {
  id: string;
  docType: string;       // PRD | SDD | Task | Hypothesis | Release | Knowledge
  category: 'baseline' | 'process-delivery' | 'process-research';
  layer: string;         // product | iterations | knowledge | runtime | code
  title: string;
  summary: string;
  tags: string[];
  filePath: string;      // 相对于 workDir 的路径
  owner: string;         // Agent ID
  upstream: string[];    // doc-chain 上游
  downstream: string[];  // doc-chain 下游
  frontmatter: Record<string, unknown>;
  lifecycle: 'living' | 'stable';
  indexedAt: string;
}

/** dir-graph 配置模型 */
interface DirGraphConfig {
  version: string;
  mode: 'solo' | 'team';
  pathVars: Record<string, string | string[]>;
  layers: Array<{ id: string; path: string; contains: string[] }>;
  docTypes: Record<string, {
    category: 'baseline' | 'process-delivery' | 'process-research';
    naming: string;
    locations: string[];
    owner: string;
    upstream?: string[];
    downstream?: string[];
    index?: string;
  }>;
  docChain: Array<{ from: string; to: string; gate: string }>;
  agents: Record<string, { outputs: Array<{ type: string; path: string }> }>;
}
```

### 4.2 dir-graph.yaml 格式（Solo 模式示例）

```yaml
version: "2.0"
mode: solo
areas:
  - id: product
    name: 活文档
    path: product/
  - id: iterations
    name: 增量文档
    path: iterations/
  - id: knowledge
    name: 个人知识库
    path: knowledge/
  - id: code
    name: 源代码
    path: code/
doc-types:
  PRD:
    name: 产品需求文档（活文档）
    category: living
    location: "product/features/{feature}/PRD.md"
    owner: product-brain
  SDD:
    name: 系统设计文档（活文档）
    category: living
    location: "product/features/{feature}/SDD.md"
    owner: eng-brain
    upstream: [PRD]
  Task:
    name: 开发任务
    category: incremental
    naming: "T-{NNN}-{name}.yml"
    location: "iterations/tasks/"
    owner: eng-brain
    index: _index.yml
  Hypothesis:
    name: 产品假设
    category: incremental
    naming: "H-{NNN}-{name}.md"
    location: "iterations/hypotheses/"
    owner: product-brain
    index: _index.yml
```

### 4.3 文档链路标准顺序

```
GLOSSARY → PRD → SDD → MODULE → PLAN → TASK
```

用于计算检索排序中的「文档链路近邻度」维度，链路距离越近分数越高。

---

## 5. 注入链路

### 5.1 OpenWork 上下文注入链

知识库的文件操作能力通过以下注入链获取 OpenWork Server 能力：

```
openwork-server.ts         → 新增 readdir(absPath) 客户端方法
       ↓
xingjing-native.tsx        → 构造 openworkCtx.listDir = readdir().catch(null)
       ↓
app-store.tsx              → XingjingOpenworkContext 接口增加 listDir
       ↓ setOpenworkFileOps({ read, write, list: ctx.listDir })
opencode-client.ts         → _owFileOps.list 可用 → fileList Level 0 生效
```

### 5.2 XingjingOpenworkContext 接口（知识库相关字段）

```typescript
interface XingjingOpenworkContext {
  // 文件操作
  readWorkspaceFile?: (wsId: string, path: string) => Promise<{ content: string } | null>;
  writeWorkspaceFile?: (wsId: string, payload: { path: string; content: string }) => Promise<boolean>;
  listDir?: (absPath: string) => Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }> | null>;
  // Skill 管理（行为知识）
  listSkills: (wsId: string) => Promise<OpenworkSkillItem[]>;
  getSkill: (wsId: string, name: string) => Promise<OpenworkSkillContent | null>;
  upsertSkill: (wsId: string, name: string, content: string, description?: string) => Promise<boolean>;
}
```

---

## 6. 关键设计决策

### ADR-1: 两源索引而非三源

**决策**：索引层聚合两个源（behavior + workspace-doc），UI 层按三组展示。

**理由**：私有知识（.xingjing/solo/knowledge/）在磁盘上就是工作空间文件，由 dir-graph 的 `knowledge/` area 统一扫描覆盖。索引层无需单独维护第三个扫描通道，简化了架构。

### ADR-2: 台账优先 + 文件系统降级

**决策**：对每个文档类型，优先解析 `_index.yml` 台账文件获取文档清单，台账无有效条目时降级到文件系统扫描。

**理由**：
1. 台账是手动维护的权威数据源，可包含元数据（status、refs）
2. 台账为空（`items: []`）是合法初始状态，此时应降级到文件系统
3. 文件系统扫描作为兜底，确保手动创建的文件不被遗漏

### ADR-3: 以 `_` 开头文件视为系统元数据

**决策**：`isSystemIndexFile()` 排除所有以 `_` 开头的文件（`_index.yml`、`_plan.yaml` 等）。

**理由**：台账文件已通过 `scanFromIndex` 专门解析，若降级到 `scanFromFileSystem` 时不排除，会导致台账文件本身被当作普通文档重复扫描，产生"未命名文档"幽灵条目。

### ADR-4: YAML body 构造——字段拼接

**决策**：将 YAML 结构化数据的 string 字段拼接为 `key: value` 格式的伪 body。

**理由**：`extractSummary` 和 `extractTags` 已针对 Markdown body 设计了丰富的提取策略。将 YAML 字段转为类似文本的 body，可零修改复用现有摘要提取逻辑，不影响 frontmatter 直接映射的元数据字段。

### ADR-5: fileList Level 0 使用 OpenWork Server readdir

**决策**：在 fileList 降级链最前端新增 Level 0，通过 OpenWork Server 的 `GET /workspace/readdir?path=<absPath>` 端点获取目录列表。

**理由**：
1. 与 fileRead 的 OpenWork API Level 对齐，架构一致性
2. OpenWork Server readdir 不依赖 OpenCode 运行时，在 OpenCode ConfigInvalidError 场景下仍可用
3. 返回格式需要 `type: 'dir'|'file'` → `type: 'directory'|'file'` 适配

### ADR-6: 沉淀降级——行为知识写入失败自动降级为私有知识

**决策**：`sinkAsBehaviorKnowledge` 失败时自动调用 `sinkAsPrivateKnowledge`。

**理由**：知识沉淀不应因 Skill API 不可用而丢失。降级为本地文件存储确保知识不丢失，用户可在后续手动晋升。

---

## 7. 非功能需求

| 指标 | 要求 | 当前状态 |
|------|------|---------|
| 检索延迟（缓存命中） | < 500ms | ✅ 达标 |
| 索引构建时间 | < 3s（100 个文档以内） | ✅ 达标 |
| fileList 离线成功率 | 100%（Tauri 环境） | ✅ 达标（Level 3 兜底） |
| YAML 文档覆盖率 | 100%（dir-graph 定义的所有类型） | ✅ 达标 |
| Markdown 行为零变更 | 纯 Markdown 工作区与修复前一致 | ✅ 达标 |
| 内存占用 | 索引 < 10MB（1000 条目以内） | ✅ 达标 |
| 沉淀去重 | 同 agentId + sessionId 1 分钟窗口 | ✅ 达标 |

---

## 8. 测试验证

### 8.1 手动验证场景

| # | 场景 | 预期结果 |
|---|------|---------|
| T-01 | 打开知识库页面 | 自动加载索引，文档树显示三组（产品文档/个人笔记/行为知识） |
| T-02 | 搜索关键词 | TF-IDF + 多维排序返回匹配结果 |
| T-03 | 选中文档 | 中央阅读器展示完整内容，右侧显示关联文档 |
| T-04 | OpenCode 不可用 | fileList/fileRead 降级到 Tauri native fs，知识库正常加载 |
| T-05 | _index.yml 为空（items: []） | scanFromIndex 返回 0，降级到文件系统扫描，`_index.yml` 不被扫描为文档 |
| T-06 | dir-graph 含 {feature} 通配路径 | 占位符正确展开，PRD/SDD 全部扫到 |
| T-07 | iterations/tasks/ 下有 .yml 文件 | Task 文档被扫描，title/status 正确提取 |
| T-08 | 点击"发送给 AI" | 导航到 Autopilot 页面，携带知识上下文 |
| T-09 | 创建笔记 | 笔记保存到 .xingjing/solo/knowledge/，刷新后出现在索引中 |
| T-10 | 健康度仪表盘 | 显示 overall 分数和各源分项数据 |
| T-11 | 切换产品 | 索引自动重新加载，显示新产品的知识 |
| T-12 | 纯 Markdown 工作区 | 扫描行为与修复前完全一致 |

### 8.2 日志验证

```
✅ [xingjing] fileList 通过 OpenWork readdir 成功, path: product/features, count: 3
✅ [xingjing] fileRead 通过 Tauri native fs 成功, path: iterations/tasks/T-001-init.yml
✅ [knowledge-scanner] dir-graph scan returned N docs
```

---

## 9. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `services/knowledge-scanner.ts` | 核心实现 | dir-graph 驱动扫描 + 台账优先 + YAML 支持 + isSystemIndexFile |
| `services/knowledge-index.ts` | 核心实现 | 两源索引构建 + TF-IDF + 7 维排序 |
| `services/knowledge-retrieval.ts` | 核心实现 | 统一检索入口 + 5 分钟缓存 + Markdown 格式化 |
| `services/knowledge-health.ts` | 核心实现 | 健康度检测 + 一致性校验 + 晋升推荐 |
| `services/knowledge-sink.ts` | 核心实现 | Agent 产出分流沉淀 + 去重 |
| `services/knowledge-behavior.ts` | 核心实现 | Skill API 适配层 |
| `services/opencode-client.ts` | 基础设施 | fileList 四层降级 + fileRead 四层降级 |
| `pages/solo/knowledge/index.tsx` | UI | 三栏布局页面入口 |
| `components/knowledge/*.tsx` | UI | 12 个知识库 UI 组件 |
| `stores/app-store.tsx` | 注入 | XingjingOpenworkContext 接口定义 |
| `pages/xingjing-native.tsx` | 注入 | OpenWork readdir 能力注入 |
| `lib/openwork-server.ts` | 注入 | readdir 客户端方法 |
| `services/product-dir-structure.ts` | 配置 | Solo dir-graph.yaml 生成模板 |
