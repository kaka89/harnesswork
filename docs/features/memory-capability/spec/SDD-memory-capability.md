---
doc-type: SDD
feature: memory-capability
status: draft
version: "0.1"
created: "2026-04-15"
---

# SDD — 记忆能力技术设计规格

## 1. 设计原则

### 1.1 对齐 OpenWork 分层记忆模型

源自 `workspace-init.ts` 默认 Agent 定义：

| 记忆层 | 定义 | 存储位置 | 版本控制 |
|--------|------|---------|----------|
| 行为记忆 | 可团队共享的知识、规约、Skill | `.opencode/skills/**`、`.opencode/agents/**` | 是（in git） |
| 私有记忆 | 会话历史、个人偏好、引用热度 | `.xingjing/` (gitignored) | 否 |

### 1.2 文件写入通道规范

源自 `ARCHITECTURE.md`：

- 行为记忆写入 **必须** 通过 OpenWork Server API (`writeWorkspaceFile` / `upsertSkill`)
- 私有记忆写入 使用 OpenCode file API 或本地 localStorage（降级安全）
- 禁止使用 `opencode-client.fileWrite()`，统一走 `openwork-server.ts` 的 `writeWorkspaceFile`

---

## 2. 现状分析与能力缺口

| 能力 | 现有实现 | 核心文件 | 缺口 |
|------|---------|---------|------|
| Chat 会话历史 | localStorage + Tauri 文件备份，最多100条 | `services/chat-session-store.ts` | 无摘要压缩、无跨会话关联 |
| Autopilot 历史 | JSON 文件，最多20条 | `services/file-store.ts` L1188-L1229 | 与 Chat 历史完全独立，两套数据模型 |
| 知识条目存储 | Markdown+frontmatter，Solo 三分类 | `services/file-store.ts` L1120-L1158 | 有 CRUD 但无检索、无注入 |
| Agent 上下文注入 | `systemPrompt + "---" + userPrompt` 拼接 | `services/opencode-client.ts` L838-L840 | 无任何知识注入 |
| Pipeline 上下文 | 目标 + 阶段描述 + 前置产出 | `services/pipeline-executor.ts` L150-L166 | 无知识注入 |
| 知识规约 | 产品初始化时生成 AGENTS.md + Agent.md + Skill.md | `services/product-dir-structure.ts` | 仅模板生成，未在运行时读取和消费 |
| OpenWork Skill API | 完整 CRUD（listSkills/getSkill/upsertSkill） | `lib/openwork-server.ts`、`stores/app-store.tsx` | 已有但未用于知识管理 |
| OpenWork File Session | 批量读写 + 事件流 + 冲突检测 + 审计 | `apps/server/src/server.ts` L2753+ | 已有但未用于知识索引 |
| OpenWork writeWorkspaceFile | Markdown 文件读写 + 冲突检测 + 审计 | `lib/openwork-server.ts` L1520-L1533 | 已有但未替代 fileWrite |

---

## 3. 三源知识架构总览

| 来源 | 读取方式 | 存储位置 | 记忆层 |
|------|---------|---------|--------|
| 行为知识（Skill） | OpenWork Skill API | `.opencode/skills/knowledge-*/` | 行为记忆 |
| 私有知识（手动/AI沉淀） | 本地文件扫描 | `.xingjing/solo/knowledge/{id}.md` | 私有记忆 |
| Workspace 文档知识 | dir-graph.yaml 驱动 + File Session 批量读 | 产品 workspace 原始目录 | 行为记忆（只读） |

---

## 4. 核心数据模型

### 4.1 统一会话模型（私有记忆层）

```typescript
// services/memory-store.ts
export interface MemoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  agentName?: string;
  ts: string;
}

export interface MemorySession {
  id: string;
  type: 'chat' | 'autopilot' | 'pipeline';
  summary: string;
  goal?: string;
  tags: string[];
  messages: MemoryMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryIndex {
  version: 1;
  sessions: Array<{
    id: string;
    type: MemorySession['type'];
    summary: string;
    tags: string[];
    createdAt: string;
    messageCount: number;
  }>;
}
```

存储路径：`.xingjing/memory/index.json`（索引）+ `.xingjing/memory/sessions/{id}.json`（单会话详情）

写入通道：私有记忆使用 OpenCode file API（`fileRead`/`fileWrite`），因为 `.xingjing/` 是 gitignored 的本地数据。

### 4.2 行为知识模型

```typescript
// services/knowledge-index.ts
export interface BehaviorKnowledge {
  id: string;
  title: string;
  category: 'glossary' | 'best-practice' | 'architecture' | 'process' | 'scenario';
  applicableScenes: Array<'product-planning' | 'requirement-design' | 'technical-design' | 'code-development'>;
  tags: string[];
  content: string;
  lifecycle: 'living' | 'stable';
  refs: string[];
}
```

存储为 OpenWork Skill（`.opencode/skills/knowledge-{id}/SKILL.md`），通过 `upsertSkill()` API 写入。

### 4.3 Workspace 文档知识模型

```typescript
export interface WorkspaceDocKnowledge {
  id: string;              // 如 'PRD-001-user-login'
  docType: string;         // 对应 dir-graph.yaml 中的 doc-types key
  category: 'baseline' | 'process-delivery' | 'process-research';
  layer: 'platform' | 'product-line' | 'domain' | 'application' | 'feature' | 'form';
  title: string;
  summary: string;         // 从 frontmatter.description 或正文前 500 字提取
  tags: string[];
  filePath: string;        // workspace 内相对路径
  owner: string;           // 从 dir-graph.yaml agents.{brain}.outputs 映射
  upstream: string[];      // 上游文档类型（从 doc-chain 解析）
  downstream: string[];    // 下游文档类型
  frontmatter: Record<string, unknown>;
  lifecycle: 'living' | 'stable';
  indexedAt: string;
}
```

### 4.4 dir-graph 配置模型

```typescript
export interface DirGraphConfig {
  version: string;
  mode: 'solo' | 'team';
  pathVars: Record<string, string | string[]>;
  layers: Array<{ id: string; path: string; contains: string[] }>;
  docTypes: Record<string, {
    category: 'baseline' | 'process-delivery' | 'process-research';
    naming: string; locations: string[]; owner: string;
    upstream?: string[]; downstream?: string[];
    index?: string;  // _index.yaml 台账文件名
  }>;
  docChain: Array<{ from: string; to: string; gate: string }>;
  agents: Record<string, { outputs: Array<{ type: string; path: string }> }>;
}
```

### 4.5 私有知识元数据

```typescript
export interface PrivateKnowledgeMeta {
  knowledgeId: string;
  source: 'behavior' | 'private' | 'workspace-doc';
  lastReferencedAt?: string;
  referenceCount: number;
  personalNotes?: string;
}
```

---

## 5. 核心服务模块设计

### 5.1 memory-store（统一会话存储）

文件：`services/memory-store.ts`

| 方法 | 职责 |
|------|------|
| `loadMemoryIndex(workDir)` | 加载会话索引 |
| `loadSession(workDir, sessionId)` | 按需加载单个会话详情 |
| `saveSession(workDir, session)` | 保存会话并更新索引 |
| `searchSessions(workDir, query)` | 基于关键词/标签的会话搜索 |
| `pruneOldSessions(workDir, maxCount)` | 超限时裁剪旧会话（保留索引摘要，删除详情文件） |
| `generateSessionSummary(messages, callAgentFn)` | 调用 LLM 生成 150 字摘要 + 3-5 标签 |

### 5.2 memory-recall（上下文回忆）

文件：`services/memory-recall.ts`

| 方法 | 职责 |
|------|------|
| `recallRelevantContext(workDir, currentPrompt)` | 从索引中按关键词匹配最相关的 1-3 个历史会话摘要 |

匹配算法：提取当前 prompt 的关键词，与索引中 tags/summary 做 TF-IDF 相似度排序（纯本地计算）。

### 5.3 knowledge-behavior（行为知识管理）

文件：`services/knowledge-behavior.ts`

| 方法 | 职责 |
|------|------|
| `listBehaviorKnowledge(workspaceId)` | 通过 Skill API 获取 `knowledge-*` Skills |
| `getBehaviorKnowledge(workspaceId, id)` | 读取单个行为知识完整内容 |
| `saveBehaviorKnowledge(workspaceId, item)` | 通过 `upsertSkill()` 写入行为知识 |

### 5.4 knowledge-scanner（dir-graph 驱动文档扫描器）

文件：`services/knowledge-scanner.ts`

核心设计：不硬编码扫描路径，解析 `.xingjing/dir-graph.yaml` 作为权威文档地图。

**扫描流程（三步）：**

**Step 1 — 解析 dir-graph.yaml**
- 读取 `.xingjing/dir-graph.yaml`，获取 mode、path-vars、doc-types、doc-chain、agents
- 将 path-vars 中的占位符替换为实际目录名
- Solo 模式识别四层结构，Team 模式识别六层结构

**Step 2 — 台账优先扫描**
- 对每个 docType，先检查其 index 字段指向的 `_index.yaml` 台账文件是否存在
- 若台账存在：直接解析台账获取文档清单、状态、引用关系
- 若台账不存在：通过 File Session `catalog/snapshot?prefix={location}` 扫描目录

**Step 3 — 差异化提取**
- 通过 File Session `read-batch` 批量读取文档内容
- 按文档类型差异化解析：

| 文档类型 | 提取策略 | 关键字段 |
|---------|---------|----------|
| PRD | frontmatter + "功能需求"/"用户故事"章节 | title, status, version, FR-列表 |
| SDD | frontmatter + "接口设计"/"数据模型"章节 | title, status, refs(PRD), 技术方案摘要 |
| MODULE | frontmatter + "行为规格 BH-XX"章节 | title, status, BH-列表, OpenAPI引用 |
| GLOSSARY | 全文解析为术语表 | 术语名称到定义映射 |
| PLAN/TASK | frontmatter + 状态/关联 | status, refs(SDD/MODULE), version |
| JOURNEY/SCENARIO | frontmatter + 正文前 500 字 | 场景描述、参与角色 |
| 其他 | frontmatter + 正文前 500 字 | 通用摘要 |

**降级策略：**
- 若 dir-graph.yaml 不存在（老产品），回退为硬编码路径扫描
- 若 File Session API 不可用，回退为逐文件 fileRead

### 5.5 knowledge-index（三源索引构建器）

文件：`services/knowledge-index.ts`

| 方法 | 职责 |
|------|------|
| `buildKnowledgeIndex(workDir, workspaceId)` | 聚合三源知识构建索引 |
| `rankKnowledgeResults(items, context)` | 融合文档链路距离的优先级排序 |

索引结构：
- `Map<tag, Set<knowledgeId>>` — 标签索引
- `Map<scene, Set<knowledgeId>>` — 场景索引
- `Map<docType, Set<knowledgeId>>` — 文档类型索引
- `Map<layer, Set<knowledgeId>>` — 知识层级索引
- 全文倒排索引（简单分词）

排序因子（权重）：
1. 场景匹配（0.25）
2. 标签相关性（0.20）
3. 文档链路近邻度（0.20）— doc-chain 距离
4. 时效性（0.10）
5. 热度（0.10）
6. 知识层级近邻度（0.10）— 近层优先
7. 生命周期（0.05）— stable > living

增量更新三触发源：
- OpenWork `.opencode/skills/**` 变更事件 → 重建行为知识部分
- File Session `catalog/events` 文档变更事件 → 重建 workspace 文档部分
- `.xingjing/dir-graph.yaml` 变更 → 触发全量重建

### 5.6 knowledge-retrieval（统一检索入口）

文件：`services/knowledge-retrieval.ts`

```typescript
export async function retrieveKnowledge(opts: {
  workDir: string;
  workspaceId: string | null;
  query: string;
  agentId: string;
  scene?: string;
  targetDocType?: string;
  maxTokens?: number;
}): Promise<string>
```

检索结果标注格式：
- `[Skill]` — 行为知识
- `[笔记]` — 私有知识
- `[PRD@应用层]` / `[GLOSSARY@产品层]` — workspace 文档

### 5.7 knowledge-sink（Agent 产出分流沉淀）

文件：`services/knowledge-sink.ts`

```typescript
export async function sinkAgentOutput(opts: {
  workDir: string;
  workspaceId: string | null;
  agentId: string;
  goal: string;
  output: string;
}): Promise<void>
```

分流策略：

| 知识类型 | 目标层 | 写入方式 |
|---------|--------|---------|
| 最佳实践/架构决策/业务规则 | 行为记忆 | `upsertSkill('knowledge-{id}')` |
| 个人笔记/问题记录/临时想法 | 私有记忆 | `saveSoloKnowledge()` |

### 5.8 knowledge-health（知识健康度检测）

文件：`services/knowledge-health.ts`

```typescript
export interface KnowledgeHealthReport {
  behavior: { total: number; stale: number; neverReferenced: number };
  private: { total: number; stale: number; neverReferenced: number };
  docs: { total: number; indexed: number; outdated: number };
  healthScore: number;  // 0-100
}
```

---

## 6. OpenWork 能力复用清单

| OpenWork 能力 | 用途 | 涉及模块 |
|--------------|------|---------|
| `upsertSkill()` / `getSkill()` / `listSkills()` | 行为知识 CRUD | knowledge-behavior, knowledge-sink |
| `writeWorkspaceFile()` / `readWorkspaceFile()` | 产品文档安全读写 | knowledge-scanner |
| File Session `read-batch` | 批量读取产品文档构建索引 | knowledge-scanner |
| File Session `catalog/snapshot` | 扫描目录文件清单 | knowledge-scanner |
| File Session `catalog/events` | 监听文件变更实现增量索引 | knowledge-index |
| `store.resolvedWorkspaceId()` | 获取当前 workspace ID | 全部模块 |
| `store.actions.callAgent()` | 复用 Agent 调用通道 | memory-store, knowledge-sink |
| OpenWork reload 事件 | Skill 变更时触发索引刷新 | knowledge-index |

---

## 7. Workspace 文档结构融合清单

| 文档结构资产 | 用途 | 涉及模块 |
|--------------|------|---------|
| `.xingjing/dir-graph.yaml` | 文档扫描权威地图 | knowledge-scanner |
| dir-graph `doc-types` | 文档类型注册表 | knowledge-scanner |
| dir-graph `doc-chain` | 文档上下游链路，链路距离计算 | knowledge-index |
| dir-graph `agents` | Agent 产出映射，场景匹配 | knowledge-index |
| dir-graph `layers` | 知识层级定义，层级近邻度排序 | knowledge-index |
| dir-graph `path-vars` | 路径变量，解析实际目录名 | knowledge-scanner |
| `_index.yaml` 台账文件 | 预构建的文档元数据索引 | knowledge-scanner |
| AGENTS.md + Agent.md + Skill.md | 知识规约体系 | knowledge-sink |
| Solo 四层 / Team 六层结构 | 模式感知扫描 | knowledge-scanner |

---

## 8. 关键约束

1. **仅改 Solo 模式**：所有变更限于 `harnesswork/apps/app/src/app/xingjing/` 目录
2. **对齐 OpenWork 分层记忆**：行为记忆通过 Skill API，私有记忆存 `.xingjing/`
3. **文件写入通道规范**：行为记忆走 OpenWork Server API，私有记忆走 OpenCode file API
4. **无新依赖**：不引入向量数据库或外部检索库
5. **渐进增强**：每阶段独立可用
6. **降级安全**：OpenWork 不可用时降级为仅私有记忆模式
