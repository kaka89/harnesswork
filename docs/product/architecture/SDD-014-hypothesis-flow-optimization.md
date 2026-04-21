---
meta:
  id: SDD-014
  title: 产品假设数据流优化——PRD回写自动触发 + 上下文治理 + 假设转需求入口
  status: draft
  author: architect-agent
  reviewers: [tech-lead]
  revision: "1.0"
  created: "2026-04-21"
  updated: "2026-04-21"
sections:
  background: "产品假设页签审查发现4项数据流断点：假设验证后PRD回写未实现、productContext无上限保护且存在重复注入、假设卡片缺乏直接转需求入口"
  goals: "补全假设→PRD→需求的结构化数据流，治理AI上下文膨胀隐患，提供假设到需求的一键转化能力"
  architecture: "三阶段实施：Phase 1 上下文治理（slice截断+去重）；Phase 2 PRD回写自动触发（onDrop钩子扩展）；Phase 3 假设转需求UI入口（卡片操作按钮+转化逻辑）"
  interfaces: "export appendHypothesisResultToPrd(); export convertHypothesisToRequirement(); buildProductContext()重构"
  nfr: "上下文总量不超过2000 tokens；PRD回写为fire-and-forget不阻塞拖拽UI；转化操作可撤销"
  test_strategy: "手动验证：拖拽假设到已证实列→检查PRD.md追加内容；验证productContext长度截断生效；点击转为需求→检查iterations/requirements/新增文件"
---

# SDD-014 · 产品假设数据流优化

## 元信息
- 编号：SDD-014
- 状态：draft
- 作者：architect-agent
- 评审人：tech-lead
- 修订版本：1.0
- 创建日期：2026-04-21
- 更新日期：2026-04-21
- 前置条件：SDD-006（产品洞察 Agent）、SDD-007（洞察→需求→研发全链路）
- 适用页面：`/solo/product`（产品洞察）

---

## 一、背景与现状问题

> **改造范围声明**：本次改造范围仅限**独立版**（`/solo/`），团队版保持现状不变。

### 1.1 现状架构

```
产品假设看板 (hypotheses tab)
├── 创建：手动新增 / AI突发奇想 / 洞察建议转化
├── 流转：拖拽 testing → validated / invalidated
├── 持久化：saveHypothesis() → iterations/hypotheses/{id}.md
└── 缓存失效：invalidateKnowledgeCache()
         ↓
    ❌ 断点：无后续自动化操作
```

### 1.2 审查发现的4项断点

| 断点编号 | 问题 | 影响 | 严重度 |
|---------|------|------|--------|
| HF-01 | dir-graph 定义的假设验证后 PRD 回写规则未实现 | 假设验证结论无法自动沉淀到关联功能的 PRD 文档中 | 中 |
| HF-02a | productContext 注入无上限保护（假设/需求/模块无 slice） | 当数据量 >30 条时挤占有效对话窗口，降低 AI 回答质量 | 低 |
| HF-02b | enrichedSystemPrompt 与 productContext 重复注入假设摘要 | 浪费 300-1000 tokens，增加调用成本 | 低 |
| HF-03 | 假设卡片缺乏"转为需求"直接入口 | 假设到需求的转化依赖 AI 间接完成，结构化流转缺失 | 中 |

### 1.3 涉及的现有代码位置

| 文件 | 行号 | 现状 |
|------|------|------|
| `pages/solo/product/index.tsx` | L1101-1109 | productContext 构建，假设/需求/模块无截断 |
| `pages/solo/product/index.tsx` | L588-600 | enrichedSystemPrompt 重复拼接假设摘要 |
| `pages/solo/product/index.tsx` | onDrop handler | 仅 saveHypothesis + invalidateKnowledgeCache，无 PRD 回写 |
| `services/product-dir-structure.ts` | dir-graph 规范 | 定义了 hypothesis.status → PRD.md 的触发规则 |
| `services/file-store.ts` | SoloHypothesis 类型 | feature 字段可为空，需校验后才能回写 |

---

## 二、设计目标

| 目标 | 描述 |
|------|------|
| 上下文可控 | productContext 总量不超过约 2000 tokens，消除重复注入 |
| PRD 自动沉淀 | 假设验证（validated/invalidated）后，验证结论自动追加到关联 Feature 的 PRD.md |
| 一键转需求 | 假设卡片提供"转为需求"操作，结构化创建 SoloRequirementOutput 并关联来源 |
| 非阻塞 | 所有新增操作（PRD 回写、上下文构建）不阻塞主 UI 交互 |

### 约束

| 约束 | 说明 |
|------|------|
| 仅改动独立版 | 团队版不受影响 |
| 向后兼容 | 不改变现有 SoloHypothesis 数据模型结构 |
| PRD 回写为追加模式 | 不覆盖已有 PRD 内容，仅在末尾追加"假设验证记录"章节 |
| 与 SDD-007 互补 | 本 SDD 补全假设→需求环节，SDD-007 负责需求→研发环节 |

---

## 三、架构设计

### Phase 1：productContext 上下文治理（HF-02a + HF-02b）

#### 3.1.1 列表截断策略

在 `product/index.tsx` 的 productContext 构建处，对假设/需求/模块列表加 `slice(0, 20)` 截断：

```typescript
// product/index.tsx L1101-1109 修改
productContext={[
  productOverview() ? `## 产品概述\n${productOverview()}` : '',
  productRoadmap() ? `## 路线图\n${productRoadmap()}` : '',
  metrics().length > 0 ? `## 业务指标\n${metrics().map(...).join('\n')}` : '',
  // ⭐ 加 slice(0, 20) 截断
  `## 当前产品假设\n${hypotheses().slice(0, 20).map(h => `- [${h.status}] ${h.belief}${h.feature ? ` (功能: ${h.feature})` : ''}`).join('\n') || '（暂无）'}`,
  features().slice(0, 20).length > 0 ? `## 产品模块\n${features().slice(0, 20).map(...).join('\n')}` : '',
  feedbacks().length > 0 ? `## 用户反馈摘要\n${feedbacks().slice(0, 5).map(...).join('\n')}` : '',
  // ⭐ 加 slice(0, 20) 截断
  requirements().slice(0, 20).length > 0 ? `## 已有需求文档\n${requirements().slice(0, 20).map(r => `- [${r.priority}] ${r.title}`).join('\n')}` : '',
].filter(Boolean).join('\n\n')}
```

#### 3.1.2 消除 enrichedSystemPrompt 重复注入

在 `product/index.tsx` L588-600 的 enrichedSystemPrompt 构建中，移除独立拼接的假设摘要段落，改为引用说明：

```typescript
// 修改前（L594-600）
const enrichedSystemPrompt = `${productBrainAgent.systemPrompt}

当前产品假设：
${hypothesisSummary}      ← 重复！productContext 已包含

已有需求文档：
${reqSummary}             ← 重复！productContext 已包含
...`;

// 修改后
const enrichedSystemPrompt = `${productBrainAgent.systemPrompt}

注意：当前产品假设、已有需求文档等完整上下文已通过 productContext 注入，你可以直接引用。

【需求文档生成规则】当用户要求写某个模块的需求、细化需求或输出需求文档时，...（保留原有生成规则不变）`;
```

**预估收益**：消除 300-1000 tokens 冗余，总 productContext 控制在 ~1200 tokens 以内（20条假设 × ~50字/条 ≈ 1000字 ≈ 300 tokens for 假设段落）。

---

### Phase 2：假设验证后 PRD 自动回写（HF-01）

#### 3.2.1 新增服务函数

在 `services/file-store.ts` 中新增：

```typescript
/**
 * 将假设验证结论追加到关联 Feature 的 PRD.md 文件末尾。
 * 
 * 触发条件：hypothesis.status 变更为 'validated' 或 'invalidated'
 * 前置条件：hypothesis.feature 字段非空（能关联到具体功能模块）
 * 
 * 追加格式：
 * ---
 * ## 假设验证记录
 * ### [日期] 假设 {id} — {状态}
 * **假设**: {belief}
 * **验证方式**: {method}
 * **结论**: {result || '未填写'}
 * **影响**: {impact}
 */
export async function appendHypothesisResultToPrd(
  workDir: string,
  hypothesis: SoloHypothesis,
): Promise<{ success: boolean; prdPath?: string; error?: string }>;
```

#### 3.2.2 执行逻辑

```typescript
async function appendHypothesisResultToPrd(workDir, hypothesis) {
  // 1. 校验前置条件
  if (!hypothesis.feature) return { success: false, error: 'no-feature-linked' };
  if (!['validated', 'invalidated'].includes(hypothesis.status)) return { success: false, error: 'status-not-terminal' };

  // 2. 构建 PRD 路径
  const prdPath = `${workDir}/product/features/${hypothesis.feature}/PRD.md`;
  
  // 3. 读取现有 PRD 内容（允许不存在，则创建新文件）
  const existing = await readFileContent(prdPath) ?? '';
  
  // 4. 构建追加段落
  const statusLabel = hypothesis.status === 'validated' ? '已证实' : '已推翻';
  const date = new Date().toISOString().slice(0, 10);
  const appendBlock = `

---

## 假设验证记录

### [${date}] 假设 ${hypothesis.id} — ${statusLabel}

- **假设**: ${hypothesis.belief}
- **验证方式**: ${hypothesis.method}
- **结论**: ${hypothesis.result || '（未填写验证结论）'}
- **影响程度**: ${hypothesis.impact}
`;

  // 5. 检查是否已有"假设验证记录"章节（避免重复追加章节标题）
  const hasSection = existing.includes('## 假设验证记录');
  const contentToAppend = hasSection
    ? appendBlock.replace('---\n\n## 假设验证记录\n\n', '')  // 仅追加子章节
    : appendBlock;

  // 6. 写入文件
  await writeFileContent(prdPath, existing + contentToAppend);
  
  return { success: true, prdPath };
}
```

#### 3.2.3 集成到拖拽处理

在 `product/index.tsx` 的 `onDrop` handler 中，于 `saveHypothesis()` 之后追加调用：

```typescript
// onDrop handler 扩展
const handleDrop = async (targetStatus) => {
  // ... 现有逻辑：构建 updated 对象、setHypotheses()、saveHypothesis()
  
  // ⭐ 新增：验证状态变更时触发 PRD 回写
  if (['validated', 'invalidated'].includes(targetStatus) && updated.feature) {
    // fire-and-forget，不阻塞 UI
    appendHypothesisResultToPrd(workDir, updated).then(result => {
      if (result.success) {
        // 可选：toast 提示"验证结论已同步到 PRD"
      }
    });
  }
  
  invalidateKnowledgeCache();
};
```

---

### Phase 3：假设卡片"转为需求"直接入口（HF-03）

#### 3.3.1 新增服务函数

在 `services/file-store.ts` 中新增：

```typescript
/**
 * 将已证实的假设转化为产品需求（SoloRequirementOutput）。
 * 
 * 映射规则：
 * - title: hypothesis.belief
 * - content: 基于 hypothesis 构建的 Markdown 描述
 * - priority: 根据 hypothesis.impact 映射（high→P0, medium→P1, low→P2）
 * - linkedHypothesis: hypothesis.id
 * - linkedFeatureId: hypothesis.feature（如有）
 * - status: 'draft'
 */
export function convertHypothesisToRequirement(
  hypothesis: SoloHypothesis,
): SoloRequirementOutput;
```

#### 3.3.2 转化逻辑

```typescript
function convertHypothesisToRequirement(hypothesis: SoloHypothesis): SoloRequirementOutput {
  const priorityMap: Record<string, string> = { high: 'P0', medium: 'P1', low: 'P2' };
  
  const content = `## 需求背景

本需求来源于产品假设验证：

- **假设**: ${hypothesis.belief}
- **验证方式**: ${hypothesis.method}
- **验证结论**: ${hypothesis.result || '（待补充）'}
- **影响程度**: ${hypothesis.impact}

## 用户故事

**作为** 产品用户，
**我希望** ${hypothesis.belief}，
**以便** （待细化）。

## 验收标准

- [ ] （待补充具体验收条件）
`;

  return {
    id: `req-hypo-${Date.now()}`,
    title: hypothesis.belief,
    type: 'user-story',
    content,
    priority: (priorityMap[hypothesis.impact] || 'P1') as any,
    linkedHypothesis: hypothesis.id,
    linkedFeatureId: hypothesis.feature,
    status: 'draft',
    createdAt: new Date().toISOString().slice(0, 10),
  };
}
```

#### 3.3.3 UI 集成

在假设卡片的操作区域新增"转为需求"按钮，仅对 `validated` 状态的假设显示（已证实的假设才有转化价值）：

```typescript
// 假设卡片 JSX 扩展
{h.status === 'validated' && (
  <button
    class="text-xs text-blue-600 hover:text-blue-800"
    onClick={() => handleConvertHypothesisToRequirement(h)}
  >
    📋 转为需求
  </button>
)}
```

处理函数：

```typescript
const handleConvertHypothesisToRequirement = async (h: SoloHypothesis) => {
  const req = convertHypothesisToRequirement(h);
  await saveRequirementOutput(workDir, req);
  // 刷新需求列表
  setRequirements(prev => [...prev, req]);
  invalidateKnowledgeCache();
  // toast 提示
  showToast(`已将假设"${h.belief.slice(0, 20)}..."转为需求草稿`);
};
```

---

## 四、接口概述

### 4.1 `appendHypothesisResultToPrd`

```typescript
// 位置：services/file-store.ts
export async function appendHypothesisResultToPrd(
  workDir: string,
  hypothesis: SoloHypothesis,
): Promise<{ success: boolean; prdPath?: string; error?: string }>;
```

| 参数 | 类型 | 说明 |
|------|------|------|
| workDir | string | 工作目录路径 |
| hypothesis | SoloHypothesis | 状态已变更为 validated/invalidated 的假设对象 |

**返回值**：成功时包含写入的 PRD 路径；失败时包含错误原因（`'no-feature-linked'` 或 `'status-not-terminal'`）

### 4.2 `convertHypothesisToRequirement`

```typescript
// 位置：services/file-store.ts
export function convertHypothesisToRequirement(
  hypothesis: SoloHypothesis,
): SoloRequirementOutput;
```

| 参数 | 类型 | 说明 |
|------|------|------|
| hypothesis | SoloHypothesis | 待转化的假设对象（建议仅对 validated 状态使用） |

**返回值**：构建好的 SoloRequirementOutput 对象，status 为 `'draft'`

### 4.3 `buildProductContext`（重构后）

现有行内构建逻辑建议抽取为独立函数（可选优化）：

```typescript
// 位置：pages/solo/product/index.tsx（可提取到 utils）
function buildProductContext(opts: {
  overview?: string;
  roadmap?: string;
  metrics: MetricItem[];
  hypotheses: SoloHypothesis[];
  features: SoloProductFeature[];
  feedbacks: FeedbackItem[];
  requirements: SoloRequirementOutput[];
}): string;
```

截断规则：假设/需求/模块各 `slice(0, 20)`，反馈 `slice(0, 5)` + 内容 60 字截断。

---

## 五、变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `services/file-store.ts` | 新增函数 | 新增 `appendHypothesisResultToPrd()`、`convertHypothesisToRequirement()` 并 export |
| `pages/solo/product/index.tsx` | 修改 | 1. productContext 构建加 `slice(0, 20)` 截断<br>2. enrichedSystemPrompt 去除重复假设/需求段落<br>3. onDrop handler 追加 PRD 回写调用<br>4. 假设卡片新增"转为需求"按钮及处理函数 |

---

## 六、非功能性需求

| 维度 | 要求 |
|------|------|
| 性能 | PRD 回写为 fire-and-forget（Promise 不 await），不阻塞拖拽 UI 响应 |
| 上下文控制 | productContext 总量不超过约 2000 tokens（~7000 字符） |
| 幂等性 | 同一假设重复拖拽到同一状态列，不会产生重复 PRD 追加记录（通过检查已有 `hypothesis.id` 实现） |
| 降级 | PRD 文件不存在时自动创建；feature 字段为空时静默跳过回写 |
| 可撤销 | "转为需求"操作创建的需求初始状态为 draft，用户可在需求 Tab 中否决 |

---

## 七、实施计划

### Phase 1：productContext 上下文治理（0.5h）
- [ ] `pages/solo/product/index.tsx` L1101-1109：假设/需求/模块列表加 `slice(0, 20)`
- [ ] `pages/solo/product/index.tsx` L594-600：enrichedSystemPrompt 移除重复的假设/需求段落
- [ ] 验证：构造 30+ 假设数据，确认 productContext 被正确截断

### Phase 2：PRD 回写自动触发（1h）
- [ ] `services/file-store.ts`：实现 `appendHypothesisResultToPrd()` 函数
- [ ] `pages/solo/product/index.tsx` onDrop handler：追加 PRD 回写调用（fire-and-forget）
- [ ] 验证：拖拽假设到"已证实"列 → 检查 `product/features/{feature}/PRD.md` 末尾追加了验证记录

### Phase 3：假设转需求入口（0.5h）
- [ ] `services/file-store.ts`：实现 `convertHypothesisToRequirement()` 函数
- [ ] `pages/solo/product/index.tsx`：假设卡片新增"转为需求"按钮（仅 validated 状态显示）
- [ ] `pages/solo/product/index.tsx`：实现 `handleConvertHypothesisToRequirement()` 处理函数
- [ ] 验证：点击"转为需求" → 检查 `iterations/requirements/` 新增文件 + 需求列表刷新

---

## 八、验收标准

| 场景 | 验收条件 |
|------|----------|
| 上下文截断 | 创建 25+ 假设后，productContext 中假设段落仅包含前 20 条 |
| 去重验证 | AI 搭档对话时，systemPrompt 中假设摘要不出现两次 |
| PRD 回写 | 拖拽假设到"已证实"列（该假设 feature 字段非空）→ 对应 PRD.md 末尾追加验证记录 |
| PRD 幂等 | 同一假设重复拖拽，PRD 中不产生重复记录 |
| 无 feature 降级 | 假设 feature 字段为空时，拖拽不报错，静默跳过 PRD 回写 |
| 转为需求 | 已证实假设卡片显示"转为需求"按钮，点击后需求 Tab 中出现新草稿 |
| 需求关联 | 转化后的需求 `linkedHypothesis` 字段正确指向来源假设 ID |
| TS 零错误 | `tsc --noEmit` 零错误 |

---

## 九、关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | PRD 回写模式 | 追加到文件末尾（不覆盖） | 保护用户已有 PRD 内容；追加模式最安全 |
| D2 | PRD 回写阻塞性 | fire-and-forget（不阻塞 UI） | 拖拽响应优先；回写失败不影响核心假设状态流转 |
| D3 | 截断上限数量 | 20 条 | solo 场景典型数据量 5-15 条，20 条留有余量且总 token 可控 |
| D4 | "转为需求"可见性 | 仅 validated 状态显示 | 未验证的假设不应直接进入需求池；已推翻的假设无转化价值 |
| D5 | 与 SDD-007 的关系 | 互补而非替代 | SDD-007 定义需求→研发链路；SDD-014 补全假设→需求环节 |
| D6 | enrichedSystemPrompt 去重方式 | 移除独立拼接的假设/需求段落 | productContext 已包含完整信息，统一入口避免维护两处 |

---

## 十、与 SDD-007 的关系

```
SDD-014（本文档）                    SDD-007
─────────────────────                ─────────────────────
[产品假设] (validated)                
       │                             
       ├─ PRD 回写（Phase 2）        
       │                             
       ├─ 转为需求（Phase 3）        
       │         │                   
       ▼         ▼                   
[SoloRequirementOutput] (draft) ──→ [需求确认] → [推送至研发] → [Task]
                                     ↑                          ↑
                                     SDD-007 Phase 2            SDD-007 Phase 3
```

- **SDD-014 输出**：假设验证后产生 `SoloRequirementOutput`（状态为 `'draft'`）
- **SDD-007 接力**：从 `SoloRequirementOutput` 开始，处理需求确认、推送至研发、任务拆解

---

## 十一、修订历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-04-21 | architect-agent | 初版——基于产品假设数据流审查报告生成 |
