---
doc-type: PLAN
feature: memory-capability
status: active
version: "0.1"
sdd-ref: SDD-memory-capability
created: "2026-04-15"
---

# PLAN — 记忆能力分阶段实施计划

## 总览

总预估工期：16-20 天，分四阶段渐进交付。每阶段独立可用，前一阶段未完成不影响已有功能。

| 阶段 | 标题 | 工期 | 核心产出 |
|------|------|------|---------|
| 一 | 统一会话记忆 + 摘要压缩 | 3-4 天 | memory-store.ts, memory-recall.ts |
| 二 | 知识检索运行时（三源融合） | 5-6 天 | knowledge-index.ts, knowledge-scanner.ts, knowledge-retrieval.ts |
| 三 | Agent 知识注入闭环 | 4-5 天 | callAgent 中间件, knowledge-sink.ts |
| 四 | 知识治理与自进化 | 4-5 天 | knowledge-health.ts, 知识中心 UI |

所有代码变更限于 `harnesswork/apps/app/src/app/xingjing/` 目录。

---

## 阶段一：统一会话记忆 + 摘要压缩（约 3-4 天）

目标：将 Chat 和 Autopilot 两套会话历史统一为一套存储（私有记忆层），增加 AI 摘要压缩，支持上下文回忆。

### Task 1.1 — 设计统一会话数据模型

- 新建 `services/memory-store.ts`
- 定义 `MemoryMessage`、`MemorySession`、`MemoryIndex` 接口
- 存储路径：`.xingjing/memory/index.json` + `.xingjing/memory/sessions/{id}.json`
- 写入通道：OpenCode file API（私有记忆）

### Task 1.2 — 实现统一存储层

在 `memory-store.ts` 中实现：
- `loadMemoryIndex(workDir)` — 加载索引
- `loadSession(workDir, sessionId)` — 按需加载单个会话详情
- `saveSession(workDir, session)` — 保存会话并更新索引
- `searchSessions(workDir, query)` — 基于关键词/标签的会话搜索
- `pruneOldSessions(workDir, maxCount)` — 超限时裁剪旧会话

### Task 1.3 — AI 摘要生成

在 `memory-store.ts` 中新增 `generateSessionSummary(messages, callAgentFn)`：
- 将会话消息压缩为 150 字以内的摘要 + 3-5 个标签
- 使用现有 `callAgent` 接口调用 LLM（复用 `store.actions.callAgent`）
- 会话归档时自动触发（延迟异步执行，不阻塞 UI）

### Task 1.4 — 迁移 Chat 会话存储

修改 `components/ai/ai-chat-drawer.tsx`：
- `archiveCurrentSession()` 改为调用 `memory-store.saveSession()`
- `onMount` 中的 `loadSessions()` 改为从 `memory-store.loadMemoryIndex()` 加载
- 保留 localStorage 作为降级兜底

### Task 1.5 — 迁移 Autopilot 会话存储

修改 `pages/autopilot/index.tsx` L393-L405：
- `saveAutopilotHistory()` 替换为 `memory-store.saveSession()`（type='autopilot'）
- `loadAutopilotHistory()` 替换为从统一索引加载

### Task 1.6 — 上下文回忆注入

新建 `services/memory-recall.ts`：
- `recallRelevantContext(workDir, currentPrompt)` — 从索引中按关键词匹配最相关的 1-3 个历史会话摘要
- 匹配算法：TF-IDF 相似度排序（纯本地计算）
- 注入到 userPrompt 前部：`## 相关历史上下文\n{摘要列表}\n\n---\n\n{原始 userPrompt}`

---

## 阶段二：知识检索运行时 / 三源融合（约 5-6 天）

目标：建立三源知识体系（行为记忆 + 私有记忆 + Workspace 文档），让 Agent 执行前自动检索相关知识。

### Task 2.1 — 三源知识数据模型

新建 `services/knowledge-index.ts`，定义：
- `BehaviorKnowledge` — 行为知识（存为 Skill）
- `WorkspaceDocKnowledge` — Workspace 文档知识（dir-graph 驱动扫描）
- `PrivateKnowledgeMeta` — 私有知识元数据
- 沿用现有 `SoloKnowledgeItem` 作为私有知识

### Task 2.2 — 行为知识 Skill API 管理

新建 `services/knowledge-behavior.ts`：
- `listBehaviorKnowledge(workspaceId)` — 调用 Skill API 获取 `knowledge-*` Skills
- `getBehaviorKnowledge(workspaceId, id)` — 读取完整内容
- `saveBehaviorKnowledge(workspaceId, item)` — 通过 `upsertSkill()` 写入

### Task 2.3 — 知识索引构建器（三源聚合）

在 `services/knowledge-index.ts` 中实现 `buildKnowledgeIndex()`：
- 聚合三源：行为知识（Skill API）+ 私有知识（本地文件）+ Workspace 文档（_doc-index.json）
- 构建四维索引：tag / scene / docType / layer + 全文倒排
- 缓存到 `.xingjing/solo/knowledge/_index.json`
- 增量更新：Skill 变更事件 / File Session 事件 / dir-graph.yaml 变更

### Task 2.4 — 知识优先级排序（融合文档链路）

在 `knowledge-index.ts` 中实现 `rankKnowledgeResults()`：
- 7 维排序因子：场景匹配(0.25) + 标签相关性(0.20) + 文档链路近邻度(0.20) + 时效性(0.10) + 热度(0.10) + 层级近邻度(0.10) + 生命周期(0.05)
- 利用 doc-chain 计算链路距离
- 返回 Top-N（默认 N=5，总 token 不超过 2000 字符）

### Task 2.5 — dir-graph 驱动的文档知识扫描器

新建 `services/knowledge-scanner.ts`：
- Step 1：解析 dir-graph.yaml（mode, path-vars, doc-types, doc-chain, agents）
- Step 2：台账优先扫描（_index.yaml 存在时直接解析，否则 catalog/snapshot 扫描）
- Step 3：差异化提取（按文档类型差异化解析：PRD/SDD/MODULE/GLOSSARY 等）
- 产出 `WorkspaceDocKnowledge[]` 存入 `_doc-index.json`
- 降级：无 dir-graph.yaml 时回退硬编码路径；无 File Session 时逐文件读取

### Task 2.6 — 知识检索服务整合

新建 `services/knowledge-retrieval.ts`：
- `retrieveKnowledge()` — 统一检索入口
- 加载三源索引 → 搜索匹配 → 排序 → 格式化为 Markdown（带来源+层级标注）
- 降级：OpenWork 不可用时仅检索私有知识

---

## 阶段三：Agent 知识注入闭环（约 4-5 天）

目标：在所有 Agent 调用路径中自动注入知识上下文，Agent 产出按类型分流沉淀。

### Task 3.1 — callAgent 知识注入中间件

修改 `services/opencode-client.ts` L838-L840：
- 扩展 `CallAgentOptions` 增加 `knowledgeContext` 和 `recallContext` 可选字段
- Prompt 合成逻辑增加知识上下文和历史上下文段

### Task 3.2 — Autopilot 执行器注入

修改 `services/autopilot-executor.ts`：
- 在 `runOrchestratedAutopilot()` 中调用 `retrieveKnowledge()` 获取知识
- 传入 `store.resolvedWorkspaceId()` 作为 workspaceId
- 子 Agent 按 agentId + task 检索对应知识

### Task 3.3 — Pipeline 执行器注入

修改 `services/pipeline-executor.ts` 的 `executeStage()`：
- 在 contextParts 构建前新增知识和回忆检索
- `PipelineRunOpts` 新增 `workspaceId` 字段

### Task 3.4 — Agent 产出分流沉淀

新建 `services/knowledge-sink.ts`：
- `sinkAgentOutput()` — 在 Agent 完成后异步触发
- 分流策略：行为知识走 upsertSkill，私有知识走 saveSoloKnowledge
- 仅当 output 长度 > 200 字时触发
- 行为知识写入失败时降级为私有记忆

### Task 3.5 — 知识引用反馈

在 `knowledge-retrieval.ts` 中：
- 每次检索命中更新 `_meta/{id}.json` 中的 lastReferencedAt 和 referenceCount
- 异步写回（防抖 5s，批量更新）

---

## 阶段四：知识治理与自进化（约 4-5 天）

目标：自动过期检测、一致性校验、治理仪表盘。

### Task 4.1 — 知识健康度检测

新建 `services/knowledge-health.ts`：
- `checkKnowledgeHealth()` — 返回 `KnowledgeHealthReport`
- 行为/私有/文档三栏健康数据
- 标记超过 90 天未更新 + 无引用的条目为 stale

### Task 4.2 — 知识一致性校验

- `checkGlossaryConsistency()` — 术语一致性检测
- `checkDocChainIntegrity()` — 文档链引用完整性检测

### Task 4.3 — 知识中心 UI 面板

在 `pages/` 中新增知识面板组件：
- 左侧：双层分类树（行为知识 + 私有知识）
- 右侧：知识列表（卡片式）
- 顶部：搜索框 + 健康度分数
- 操作：CRUD、提升、废弃

### Task 4.4 — 知识过期提醒与自动晋升

- Solo Cockpit 概览区显示健康度分数
- stale 知识提醒徽章
- 私有知识 referenceCount >= 5 时建议晋升为行为知识（Skill）

---

## 实施依赖关系

```
阶段一 (统一会话记忆 — 私有记忆层)
  |- Task 1.1-1.2 (数据模型+存储层) -- 无依赖
  |- Task 1.3 (AI 摘要) -- 依赖 1.1
  |- Task 1.4-1.5 (迁移) -- 依赖 1.2
  |- Task 1.6 (上下文回忆) -- 依赖 1.2, 1.3
       |
阶段二 (知识检索运行时 — 三源融合)
  |- Task 2.1 (三源数据模型) -- 无依赖（可与阶段一并行）
  |- Task 2.2 (行为知识 Skill API) -- 依赖 OpenWork 集成（已有）
  |- Task 2.5 (dir-graph 驱动文档扫描) -- 依赖 2.1
  |- Task 2.3 (三源索引) -- 依赖 2.1, 2.2, 2.5
  |- Task 2.4 (链路感知排序) -- 依赖 2.3
  |- Task 2.6 (三源统一检索) -- 依赖 2.3, 2.4
       |
阶段三 (Agent 知识注入闭环)
  |- Task 3.1 (callAgent 中间件) -- 依赖阶段二 Task 2.6
  |- Task 3.2-3.3 (Autopilot/Pipeline 注入) -- 依赖 3.1 + 阶段一 Task 1.6
  |- Task 3.4 (产出分流沉淀) -- 依赖阶段二 Task 2.2
  |- Task 3.5 (引用反馈) -- 依赖阶段二 Task 2.6
       |
阶段四 (知识治理与自进化)
  |- Task 4.1-4.2 (健康检测) -- 依赖阶段三 Task 3.5
  |- Task 4.3 (UI 面板) -- 依赖阶段二 Task 2.6
  |- Task 4.4 (过期提醒+自动晋升) -- 依赖 4.1
```
