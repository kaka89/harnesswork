# Plan C: R3 会话存储迁移

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** 将 chat-session-store / memory-store / memory-recall 三件套迁移到 OpenCode Session SDK

**Worktree:** `worktrees/feature/TASK-ADR001-plan-c`

**Files:**
- Modify: `apps/app/src/app/xingjing/services/chat-session-store.ts`
- Modify: `apps/app/src/app/xingjing/services/memory-store.ts`
- Modify: `apps/app/src/app/xingjing/services/memory-recall.ts`

---

## Task 1: chat-session-store 迁移到 SDK (R3-A)

- [ ] **Step 1: 重写 chat-session-store.ts**

保留 `SessionRecord` / `AiMessageRecord` 类型接口不变（供 UI 消费），底层改为 OpenCode SDK：

```typescript
/**
 * 聊天会话历史存储服务（已迁移至 OpenCode Session API）
 */
import { getXingjingClient } from './opencode-client';

export interface AiMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'chat' | 'dispatch' | 'direct-agent';
  agentName?: string;
  ts?: string;
}

export interface SessionRecord {
  id: string;
  summary: string;
  messages: AiMessageRecord[];
  ts: string;
}

export async function loadSessions(directory?: string): Promise<SessionRecord[]> {
  try {
    const client = getXingjingClient();
    const result = await client.session.list({
      ...(directory ? { directory } : {}),
    });
    if (!result.data) return [];
    const sessions = Array.isArray(result.data) ? result.data : [];
    return sessions.map((s: any) => ({
      id: s.id ?? '',
      summary: s.title ?? s.description ?? '',
      messages: [],
      ts: s.createdAt ?? new Date().toISOString(),
    }));
  } catch { return []; }
}

export async function loadSessionMessages(sessionId: string): Promise<AiMessageRecord[]> {
  try {
    const client = getXingjingClient();
    const result = await client.session.messages({ sessionID: sessionId });
    if (!result.data) return [];
    const messages = Array.isArray(result.data) ? result.data : [];
    return messages.map((m: any) => ({
      id: m.id ?? '',
      role: m.role === 'user' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content
        : (m.parts?.map((p: any) => p.text ?? '').join('') ?? ''),
      type: 'chat',
      ts: m.createdAt,
    }));
  } catch { return []; }
}

/** @deprecated OpenCode 自动持久化 */
export function saveSessions(_sessions: SessionRecord[]): void {}
```

- [ ] **Step 2: 搜索所有 chat-session-store 导入方并适配**

```bash
grep -rn "chat-session-store" apps/app/src/app/xingjing/
```

重点检查：
- `ai-chat-drawer.tsx`：`loadSessions()` 是否需要传 directory
- 其他组件中 `saveSessions()` 调用是否可以安全变为 no-op
- `loadSessionMessages()` 是新增函数，需要在加载单个会话详情时使用

- [ ] **Step 3: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R3-A — chat-session-store 迁移到 OpenCode Session API"
```

---

## Task 2: memory-store + memory-recall 迁移 (R3-B)

- [ ] **Step 1: 精简 memory-store.ts**

1. 保留类型定义：`MemorySession` / `MemoryIndexEntry` / `MemoryIndex`
2. 保留工具函数：`extractKeywords()`
3. 重写 `loadMemoryIndex()` 使用 SDK + sidecar：

```typescript
import { getXingjingClient } from './opencode-client';
import { fileRead } from './opencode-client';

export async function loadMemoryIndex(workDir: string): Promise<MemoryIndex> {
  try {
    const client = getXingjingClient();
    const result = await client.session.list({ directory: workDir });
    if (!result.data) return { sessions: [] };
    const sessions = Array.isArray(result.data) ? result.data : [];

    // sidecar 元数据（tags/goal）
    let sidecar: Record<string, { tags: string[]; goal?: string }> = {};
    try {
      const raw = await fileRead('.xingjing/memory/sidecar.json', workDir);
      if (raw) sidecar = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      sessions: sessions.map((s: any) => ({
        id: s.id,
        type: 'chat' as const,
        summary: s.title ?? '',
        tags: sidecar[s.id]?.tags ?? [],
        createdAt: s.createdAt ?? '',
        messageCount: 0,
      })),
    };
  } catch { return { sessions: [] }; }
}
```

4. 删除旧的文件 I/O 逻辑（`INDEX_PATH` / `SESSION_DIR` / `MAX_SESSIONS` 等）
5. 删除 `saveMemorySession()` / `pruneOldSessions()` 等写入函数（OpenCode 自动持久化）
6. 保留 `saveMemoryMeta()` 用于写入 sidecar：

```typescript
export async function saveMemoryMeta(
  workDir: string,
  sessionId: string,
  meta: { tags: string[]; goal?: string },
): Promise<void> {
  try {
    let sidecar: Record<string, any> = {};
    try {
      const raw = await fileRead('.xingjing/memory/sidecar.json', workDir);
      if (raw) sidecar = JSON.parse(raw);
    } catch { /* new file */ }
    sidecar[sessionId] = meta;
    await fileWrite('.xingjing/memory/sidecar.json', JSON.stringify(sidecar, null, 2), workDir);
  } catch { /* silent */ }
}
```

- [ ] **Step 2: 简化 memory-recall.ts**

保留 `recallRelevantContext()` 签名不变。内部仍用 TF-IDF 匹配（使用新的 `loadMemoryIndex()` 已走 SDK）。

确认 `extractKeywords` 正确从 memory-store 导入。

- [ ] **Step 3: 搜索所有 memory-store/memory-recall 导入方并适配**

```bash
grep -rn "memory-store\|memory-recall" apps/app/src/app/xingjing/
```

检查 `autopilot-executor.ts`、`pipeline-executor.ts` 等调用方是否需要适配。

- [ ] **Step 4: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R3-B — memory-store 迁移到 SDK + sidecar 元数据"
```
