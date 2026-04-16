---
feature: agent-workshop
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# Agent 工坊

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F010 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-05](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 创建日期 | 2026-04-15 |

## 特性描述

Agent 工坊提供可视化的 AI Agent 发现、配置、测试和管理能力。系统通过文件驱动的方式自动发现 `.opencode/agents/*.md` 目录下的 Agent 定义，结合内置常量兜底，构建统一的 Agent 注册表。用户可在工坊界面中查看 Agent 列表、编辑配置、运行测试。

## 核心组件

| 组件 | 路径 | 职责 | 大小 |
|------|------|------|------|
| agent-registry | `services/agent-registry.ts` | 统一 Agent 发现与注册表管理 | ~200 行 |
| agent-logger | `services/agent-logger.ts` | Agent 执行日志记录 | — |
| Agent Workshop 页面 | `pages/agent-workshop/index.tsx` | Agent 工坊主页面 | ~1600 行 |
| Solo Agent Workshop | `pages/solo/agent-workshop/index.tsx` | Solo 模式 Agent 工坊 | — |

## Agent 发现机制

### 发现优先级

```
1. 文件驱动发现
   └── 扫描 .opencode/agents/*.md 文件
   └── 解析 YAML frontmatter 提取 Agent 元数据
   
2. 内置常量兜底
   └── SOLO_AGENTS / TEAM_AGENTS 硬编码定义
   └── 确保即使无文件也有基础 Agent 可用
```

### Agent 元数据结构

```typescript
interface AgentMeta {
  id: string;           // Agent 唯一标识
  name: string;         // 显示名称
  description: string;  // 功能描述
  role: string;         // 角色（产品/工程/增长/质量/运维）
  skills: string[];     // 具备的技能列表
  systemPrompt: string; // System Prompt 内容
  icon?: string;        // 图标
  mode: 'solo' | 'team' | 'both';  // 适用模式
}
```

### YAML Frontmatter 解析

Agent 定义文件格式（`.opencode/agents/pm-agent.md`）：

```markdown
---
id: pm-agent
name: 产品脑
role: product
skills: [prd-writing, user-story, market-analysis]
---

# 产品脑 Agent

你是一个产品经理 Agent...（System Prompt 正文）
```

系统使用简易 YAML frontmatter 解析器（非 js-yaml 依赖），提取元数据后将 Markdown 正文作为 System Prompt。

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | Agent 定义格式 | Markdown + YAML frontmatter | 人类可读，与 OpenCode Skills 格式一致 |
| D2 | 发现机制 | 文件扫描 + 内置兜底 | 灵活性（用户可自定义）+ 可用性（始终有基础 Agent） |
| D3 | YAML 解析 | 手写简易解析器 | 避免引入 js-yaml 外部依赖 |
| D4 | 模式隔离 | Solo/Team 各有独立 Agent 集 | 不同模式的职责和协作模型不同 |

## 行为规格

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 进入 Agent 工坊 | 展示已注册 Agent 列表（卡片式） |
| BH-02 | 点击 Agent 卡片 | 展示 Agent 详情（名称/角色/技能/System Prompt） |
| BH-03 | 创建新 Agent | 通过表单创建 Agent 定义文件 |
| BH-04 | 编辑 Agent | 修改 Agent 配置和 System Prompt |
| BH-05 | 测试运行 Agent | 输入测试指令，查看 Agent 响应 |
| BH-06 | 切换 Solo/Team | Agent 列表自动切换为对应模式的 Agent 集 |
| BH-07 | 无 Agent 文件 | 显示内置默认 Agent 列表 |

## 验收标准

- [x] Agent 工坊页面可正常展示 Agent 列表
- [x] 文件驱动 Agent 发现正常工作
- [x] 内置 Agent 作为兜底正确显示
- [x] Solo/Team 模式切换 Agent 列表正确更新
- [x] Agent 元数据解析无错误
