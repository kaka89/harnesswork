---
feature: knowledge-system
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# 知识系统

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F011 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-06](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 关联特性 | [memory-capability](../memory-capability/memory-capability.md)（记忆能力，上层消费方） |
| 创建日期 | 2026-04-15 |

## 特性描述

星静的三源知识融合体系，由 6 个协作服务组成，实现知识的索引、检索、扫描、健康度管理、沉淀和行为分析的完整闭环。知识来源包括行为知识（OpenWork Skill API）、私有知识（本地 `.xingjing/` 目录）和工作空间文档（dir-graph.yaml 驱动扫描的 PRD/SDD/MODULE 等）。

## 核心服务

| 服务 | 路径 | 职责 | 大小 |
|------|------|------|------|
| knowledge-index | `services/knowledge-index.ts` | 三源知识索引构建，TF-IDF 倒排索引 | ~380 行 |
| knowledge-retrieval | `services/knowledge-retrieval.ts` | 统一检索入口，缓存管理，排序融合 | ~170 行 |
| knowledge-scanner | `services/knowledge-scanner.ts` | dir-graph.yaml 驱动的文档扫描 | ~400 行 |
| knowledge-health | `services/knowledge-health.ts` | 过期检测，一致性校验 | ~280 行 |
| knowledge-sink | `services/knowledge-sink.ts` | Agent 产出分流沉淀 | ~290 行 |
| knowledge-behavior | `services/knowledge-behavior.ts` | 行为知识分析 | ~140 行 |
| Knowledge 页面 | `pages/solo/knowledge/index.tsx` | 知识管理 UI | ~640 行 |

## 三源知识架构

```
┌─────────────────────────────────────────────────┐
│                 知识检索运行时                      │
│            knowledge-retrieval                    │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐   │
│  │ 行为知识   │ │ 私有知识   │ │ 工作空间文档   │   │
│  │ Behavior  │ │ Private   │ │ Workspace     │   │
│  └─────┬─────┘ └─────┬─────┘ └──────┬────────┘   │
│        │             │              │             │
│  OpenWork      .xingjing/     dir-graph.yaml      │
│  Skill API     solo/knowledge  驱动扫描            │
└─────────────────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │ knowledge-index │
              │ TF-IDF 倒排索引  │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
 knowledge-scanner  knowledge-health  knowledge-sink
 文档扫描           健康度检测        产出沉淀
```

## 知识条目结构

```typescript
interface KnowledgeEntry {
  id: string;
  source: 'behavior' | 'private' | 'workspace';
  type: string;           // prd | sdd | module | plan | task | note | skill
  title: string;
  content: string;
  tags: string[];
  layer: string;          // company | platform | product-line | domain | application
  applicable: string[];   // 适用场景（agentId 列表）
  upstream?: string[];    // 上游文档链路
  downstream?: string[];  // 下游文档链路
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;     // 过期时间
  referenceCount: number; // 引用次数
}
```

## 检索排序算法

检索时综合以下维度进行融合排序：

| 维度 | 权重 | 说明 |
|------|------|------|
| 场景匹配 | 高 | 当前 Agent 在知识条目的 `applicable` 列表中 |
| 文档链路距离 | 中 | 基于 upstream/downstream 关系计算链路距离，近链路优先 |
| TF-IDF 关键词相似度 | 中 | 查询文本与知识内容的关键词匹配度 |
| 层级近邻度 | 低 | 同层级（如同一 domain）的知识优先 |
| 时间衰减 | 低 | 新知识权重高于旧知识 |

## 缓存策略

| 缓存层 | TTL | 说明 |
|--------|-----|------|
| 内存缓存 | 5 分钟 | 热查询结果缓存 |
| 磁盘缓存 | 10 分钟 | 索引构建结果缓存 |
| 引用计数 | 5 秒防抖 | 批量更新引用计数，避免频繁写入 |

## 知识健康度管理

knowledge-health 服务提供以下检测能力：

- **过期检测**：根据 `expiresAt` 字段标记过期知识
- **一致性校验**：检查知识条目引用的文档是否仍然存在
- **治理仪表盘**：展示知识总量、过期数、健康度百分比
- **过期提醒**：知识临近过期时在 UI 中提示

## 知识沉淀流程

knowledge-sink 服务负责将 Agent 产出自动分流沉淀：

```
Agent 产出
    │
    ├── 类型判断
    │   ├── PRD/SDD/PLAN/TASK → 工作空间文档（写入 .docs/）
    │   ├── 技能定义/最佳实践 → 行为知识（通过 OpenWork Skill API）
    │   └── 个人笔记/摘要 → 私有知识（写入 .xingjing/solo/knowledge/）
    │
    └── 更新索引 → knowledge-index 增量更新
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
| D1 | 检索算法 | TF-IDF + 多维融合排序 | 无需向量数据库，无外部依赖 |
| D2 | 文档扫描驱动 | dir-graph.yaml 配置化 | 支持 Solo 四层和 Team 六层，不硬编码路径 |
| D3 | 沉淀通道 | 行为知识走 Skill API，私有知识走 file API | 遵循 SDD-001 写入通道规范 |
| D4 | 降级策略 | 知识检索失败时静默跳过 | 不阻塞 Agent 主流程 |
| D5 | 缓存分层 | 内存(5min) + 磁盘(10min) | 平衡响应速度和数据新鲜度 |

## 验收标准

- [x] 三源知识（行为/私有/工作空间）统一索引构建
- [x] TF-IDF 检索返回排序结果
- [x] dir-graph.yaml 驱动文档扫描正常工作
- [x] 知识健康度检测和过期提醒正常
- [x] Agent 产出按类型自动分流沉淀
- [x] 缓存命中时检索延迟 < 500ms
- [x] 检索失败时静默降级，不影响主流程
