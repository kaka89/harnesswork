# OpenWork Memory API 调研报告

## 调研日期
2024-01-XX

## SDK 版本
@opencode-ai/sdk@1.1.39

---

## 调研结果总结

### ✅ 已支持的原生 API

#### 1. **Session 搜索功能**
```typescript
// 来源：sdk.gen.d.ts L257-263
session.list<ThrowOnError extends boolean = false>(parameters?: {
  directory?: string;
  roots?: boolean;
  start?: number;
  search?: string;  // ✅ 原生搜索支持！
  limit?: number;
}, options?: Options<never, ThrowOnError>)
```

**功能：**
- 通过 `search` 参数进行全文搜索
- 返回匹配的 session 列表
- 支持分页（`start` + `limit`）

**星静当前实现：**
- 自建 `searchSessions()` 函数（memory-store.ts L226-251）
- 手动关键词匹配

**优化方案：**
✅ **迁移到原生 API**，保留本地搜索作为降级

---

#### 2. **Session 元数据更新**
```typescript
// 来源：sdk.gen.d.ts L306-313
session.update<ThrowOnError extends boolean = false>(parameters: {
  sessionID: string;
  directory?: string;
  title?: string;  // ✅ 可以更新标题
  time?: {
    archived?: number;  // ✅ 可以标记归档时间
  };
}, options?: Options<never, ThrowOnError>)
```

**功能：**
- 更新 session 标题（可用于存储摘要）
- 标记归档时间

**星静当前实现：**
- 自建 `sidecar.json` 存储 tags/goal/mode

**限制：**
❌ **不支持自定义 metadata 字段**（如 tags、goal、mode）

**优化方案：**
⚠️ **保留 sidecar.json**，因为 OpenWork 不支持自定义元数据

---

#### 3. **Session 类型定义**
```typescript
// 来源：types.gen.d.ts
export type Session = {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: Array<FileDiff>;
  };
  share?: {
    url: string;
  };
  title: string;  // ✅ 可用于存储摘要
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;  // ✅ 归档时间
  };
  permission?: PermissionRuleset;
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
};
```

**可用字段：**
- `title` - 可用于存储 AI 生成的摘要
- `time.archived` - 可用于标记会话归档状态
- `summary` - 代码变更摘要（自动生成）

**不可用字段：**
- ❌ 无 `tags` 字段
- ❌ 无 `goal` 字段
- ❌ 无 `metadata` 字段
- ❌ 无 `mode` 字段（chat/dispatch）

---

### ❌ 不支持的功能

#### 1. **自定义元数据存储**
OpenWork Session 不支持存储自定义 metadata（如 tags、goal、mode）。

**影响：**
- 星静的 tags 分类功能无法迁移
- goal 字段（用于上下文回忆）无法迁移
- mode 字段（chat/dispatch 区分）无法迁移

**解决方案：**
✅ **保留 sidecar.json**，继续使用本地文件存储自定义元数据

---

#### 2. **AI 摘要生成 API**
OpenWork 没有 `session.generateSummary()` API。

**影响：**
- 需要继续使用自建的 LLM 调用生成摘要

**解决方案：**
✅ **保留现有实现**，优化为异步生成 + fallback 先返回

---

## 优化建议

### 高优先级

#### 1. **迁移搜索功能到原生 API**
```typescript
// 修改前（memory-store.ts L226-251）
export async function searchSessions(
  workDir: string,
  query: string,
  maxResults = 10,
): Promise<MemoryIndexEntry[]> {
  const index = await loadMemoryIndex(workDir);
  // 自建关键词匹配
}

// 修改后
export async function searchSessions(
  workDir: string,
  query: string,
  maxResults = 10,
): Promise<MemoryIndexEntry[]> {
  try {
    const client = getXingjingClient();
    const result = await client.session.list({
      directory: workDir,
      search: query,  // ✅ 使用原生搜索
      limit: maxResults,
    });
    return transformToMemoryIndex(result.data ?? []);
  } catch {
    // 降级到本地搜索
    return localSearchSessions(workDir, query, maxResults);
  }
}
```

**优势：**
- 更快的搜索速度（服务端索引）
- 更准确的全文匹配
- 减少客户端计算负担

---

#### 2. **优化摘要存储**
```typescript
// 使用 session.update 更新 title 字段存储摘要
export async function saveSessionSummary(
  sessionId: string,
  summary: string,
): Promise<void> {
  try {
    const client = getXingjingClient();
    await client.session.update({
      sessionID: sessionId,
      title: summary.slice(0, 200),  // ✅ 存储到 title 字段
    });
  } catch (e) {
    console.warn('[memory] saveSessionSummary failed:', e);
  }
}
```

**优势：**
- 摘要与 session 数据一起存储
- 无需额外的 sidecar 文件
- 与 OpenWork 主应用保持一致

---

### 中优先级

#### 3. **保留 sidecar.json 用于自定义元数据**
```typescript
/**
 * 星静特有元数据存储（OpenWork 不支持 custom metadata）
 * 
 * 存储内容：
 * - tags: 会话标签（用于分类和搜索）
 * - goal: 会话目标（用于上下文回忆）
 * - mode: 会话模式（chat/dispatch，用于 UI 展示）
 * 
 * 原因：OpenWork Session 类型不包含这些字段，
 * 需要通过本地文件补充存储。
 */
export async function saveMemoryMeta(
  workDir: string,
  sessionId: string,
  meta: { tags: string[]; goal?: string; mode?: 'chat' | 'dispatch' },
): Promise<void> {
  // 保持现有实现
}
```

**原因：**
- OpenWork 不支持自定义 metadata
- 这些字段对星静的功能至关重要
- 本地存储是唯一可行方案

---

#### 4. **优化摘要生成流程**
```typescript
// 修改前：同步生成，阻塞 UI
const summary = await generateSessionSummary(messages, callAgentFn);

// 修改后：异步生成 + fallback 先返回
export async function generateSessionSummary(
  messages: MemoryMessage[],
  callAgentFn: CallAgentFn,
): Promise<SummaryResult> {
  // 1. 立即返回 fallback 摘要
  const fallback = extractFallbackSummary(messages);
  
  // 2. 异步生成 AI 摘要（不阻塞 UI）
  setTimeout(() => {
    callAgentFn({
      userPrompt: SUMMARY_PROMPT + dialogText,
      onDone: (fullText) => {
        const parsed = parseAISummary(fullText);
        // 生成后更新到 OpenWork session.title
        void saveSessionSummary(sessionId, parsed.summary);
      },
    });
  }, 0);
  
  return { summary: fallback, tags: [] };
}
```

**优势：**
- UI 不阻塞，用户体验更好
- AI 摘要生成失败不影响功能
- 摘要生成后自动更新

---

## 实施计划

### 阶段 1：搜索功能迁移（2-3 小时）
- [ ] 修改 `searchSessions()` 使用 `session.list({ search })`
- [ ] 保留本地搜索作为降级
- [ ] 测试搜索准确性

### 阶段 2：摘要存储优化（2-3 小时）
- [ ] 修改 `generateSessionSummary()` 为异步模式
- [ ] 使用 `session.update({ title })` 存储摘要
- [ ] 保留 fallback 摘要逻辑

### 阶段 3：文档和注释（1 小时）
- [ ] 为 `sidecar.json` 添加详细注释说明原因
- [ ] 更新 Memory 系统文档
- [ ] 添加 API 限制说明

---

## 结论

### 可以迁移的功能
✅ **搜索功能** - 使用 `session.list({ search })`
✅ **摘要存储** - 使用 `session.update({ title })`

### 必须保留的自建实现
⚠️ **自定义元数据** - 继续使用 `sidecar.json`（tags/goal/mode）
⚠️ **AI 摘要生成** - 继续使用自建 LLM 调用

### 总体评估
- **迁移价值：中等**（搜索功能有明显提升）
- **实施风险：低**（保留降级方案）
- **维护成本：降低**（减少自建逻辑）

建议优先实施搜索功能迁移，摘要存储优化可以作为第二阶段。
