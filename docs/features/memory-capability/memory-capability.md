---
feature: memory-capability
status: in-progress
sdd: SDD-memory-capability
plan: PLAN-memory-capability
tasks: []
created: "2026-04-15"
---

# 记忆能力（Memory Capability）

## 特性概述

为星静（Xingjing）独立版构建完整的记忆能力体系，使 Agent 具备跨会话的知识积累、检索和注入能力。核心架构为"三源知识融合"：

1. **统一会话记忆**：将 Chat 和 Autopilot 两套会话历史统一为一套存储（私有记忆层），增加 AI 摘要压缩，支持上下文回忆
2. **三源知识检索**：融合行为知识（OpenWork Skill API）、私有知识（本地文件）、Workspace 文档知识（dir-graph.yaml 驱动扫描），构建统一检索运行时
3. **Agent 知识注入闭环**：在所有 Agent 调用路径中自动注入知识上下文，并将 Agent 产出按类型分流沉淀
4. **知识治理与自进化**：自动过期检测、一致性校验、治理仪表盘，支持知识从私有到行为的自然晋升

## 关联文档

- SDD：[SDD-memory-capability](spec/SDD-memory-capability.md)
- PLAN：[PLAN-memory-capability](plan/PLAN-memory-capability.md)

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 记忆分层模型 | 对齐 OpenWork 行为记忆 + 私有记忆双层模型 | 行为记忆（`.opencode/skills/`）可共享可版本控制；私有记忆（`.xingjing/`）个人数据不入 git |
| D2 | 知识架构 | 三源融合（行为 + 私有 + Workspace 文档） | 充分利用产品 workspace 中已有的 PRD/SDD/MODULE 等文档作为知识来源 |
| D3 | 文档扫描策略 | dir-graph.yaml 驱动，非硬编码路径 | dir-graph.yaml 是产品初始化时自动生成的结构化目录图谱，支持 Solo 四层和 Team 六层 |
| D4 | 检索排序 | 融合文档链路距离（doc-chain）和知识层级近邻度 | 利用 doc-chain 上下游关系计算链路距离，近层优先 |
| D5 | 文件写入通道 | 行为记忆走 OpenWork Server API，私有记忆走 OpenCode file API | 遵循 ARCHITECTURE.md 写入通道规范 |
| D6 | 降级策略 | OpenWork 不可用时降级为仅私有记忆模式 | 知识检索/注入失败时静默跳过，不阻塞 Agent 主流程 |
| D7 | 向量检索 | 不引入向量数据库，使用简单 TF-IDF / 关键词匹配 | 无新外部依赖，渐进增强 |

## 交付进度

| 阶段 | 标题 | 预估工期 | 状态 |
|------|------|---------|------|
| 阶段一 | 统一会话记忆 + 摘要压缩 | 3-4 天 | pending |
| 阶段二 | 知识检索运行时（三源融合） | 5-6 天 | pending |
| 阶段三 | Agent 知识注入闭环 | 4-5 天 | pending |
| 阶段四 | 知识治理与自进化 | 4-5 天 | pending |

## 验收标准

- [ ] Chat 和 Autopilot 会话历史统一存储在 `.xingjing/memory/` 目录
- [ ] 会话归档时自动生成 AI 摘要（150 字以内 + 3-5 个标签）
- [ ] Agent 调用前自动检索三源知识并注入 Prompt
- [ ] 行为知识以 `knowledge-*` Skill 形式存储，通过 OpenWork Skill API 管理
- [ ] Workspace 文档通过 dir-graph.yaml 驱动扫描，支持 Solo 四层和 Team 六层
- [ ] 知识检索排序融合文档链路距离和知识层级近邻度
- [ ] Agent 产出按类型自动分流沉淀到行为记忆或私有记忆
- [ ] 知识健康度检测和过期提醒正常工作
- [ ] OpenWork 不可用时平滑降级为仅私有记忆模式
- [ ] 所有变更限于 `harnesswork/apps/app/src/app/xingjing/` 目录（独立版 Only）
