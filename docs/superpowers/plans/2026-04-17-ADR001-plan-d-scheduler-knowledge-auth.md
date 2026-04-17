# Plan D: R4 调度迁移 + R6 知识瘦身 + R9 认证精简

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** scheduler-client 迁移到 OpenWork Automations，删除 knowledge-behavior.ts，精简 auth-service.ts

**Worktree:** `worktrees/feature/TASK-ADR001-plan-d`

**Files:**
- Modify: `apps/app/src/app/xingjing/services/scheduler-client.ts`
- Delete: `apps/app/src/app/xingjing/services/knowledge-behavior.ts`
- Modify: `apps/app/src/app/xingjing/services/knowledge-retrieval.ts`
- Modify: `apps/app/src/app/xingjing/services/auth-service.ts`

---

## Task 1: 定时任务迁移 (R4)

- [ ] **Step 1: 重写 scheduler-client.ts 为适配层**

删除三层降级逻辑（Tauri→OpenCode→文件存储），改为通过注入函数透传 OpenWork Automations。

保留 `XingjingScheduledTask` / `CreateTaskInput` 类型定义。

新增注入接口：
```typescript
let _listJobs: (() => Promise<any[]>) | null = null;
let _deleteJob: ((name: string) => Promise<void>) | null = null;

export function setSchedulerApi(api: {
  listJobs: () => Promise<any[]>;
  deleteJob: (name: string) => Promise<void>;
} | null) {
  _listJobs = api?.listJobs ?? null;
  _deleteJob = api?.deleteJob ?? null;
}
```

重写核心函数：
```typescript
export async function listScheduledTasks(workDir?: string): Promise<XingjingScheduledTask[]> {
  if (!_listJobs) return [];
  try {
    const jobs = await _listJobs();
    return jobs.map((job: any) => ({
      id: job.slug ?? job.name ?? '',
      name: job.name ?? '',
      cron: job.schedule ?? '',
      agentId: job.run?.agent ?? '',
      agentName: job.run?.agent ?? job.name ?? '',
      prompt: job.run?.prompt ?? job.prompt ?? '',
      description: job.run?.title ?? job.name ?? '',
      enabled: true,
      lastRunAt: job.lastRunAt,
      source: 'scheduler' as const,
    }));
  } catch { return []; }
}

export async function deleteScheduledTask(
  workDir: string, taskId: string, taskName?: string,
): Promise<void> {
  if (!_deleteJob || !taskName) return;
  try { await _deleteJob(taskName); } catch { /* silent */ }
}
```

删除的函数：`getTauriScheduler()`、`createScheduledTask()`（依赖 Tauri/文件兜底的部分）、`getAvailableAgentsForScheduler()`。

- [ ] **Step 2: 搜索 scheduler-client 所有导入方并适配**

```bash
grep -rn "scheduler-client" apps/app/src/app/xingjing/
```

重点检查 UI 组件中的 `createScheduledTask` / `deleteScheduledTask` / `listScheduledTasks` 调用。

- [ ] **Step 3: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R4 — scheduler-client 迁移到 OpenWork Automations"
```

---

## Task 2: 删除 knowledge-behavior.ts (R6-A)

- [ ] **Step 1: 搜索所有 knowledge-behavior 导入方**

```bash
grep -rn "knowledge-behavior" apps/app/src/app/xingjing/
```

确认哪些文件依赖 `SkillApiAdapter` 类型。

- [ ] **Step 2: 将 SkillApiAdapter 类型迁移**

在 `knowledge-retrieval.ts` 顶部新增 `SkillApiAdapter` 类型定义（从 knowledge-behavior.ts 复制）：

```typescript
export interface SkillApiAdapter {
  listSkills: () => Promise<Array<{ name: string; description?: string }>>;
  getSkill: (name: string) => Promise<{ content: string } | null>;
  upsertSkill: (name: string, content: string, description?: string) => Promise<boolean>;
}
```

- [ ] **Step 3: 更新所有导入方**

将所有 `from './knowledge-behavior'` 中的 `SkillApiAdapter` 导入改为 `from './knowledge-retrieval'`。
涉及文件：`pipeline-executor.ts`、`team-session-orchestrator.ts`、`app-store.tsx`。

- [ ] **Step 4: 删除 knowledge-behavior.ts**

确认无残留引用后删除文件。

- [ ] **Step 5: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R6-A — 删除 knowledge-behavior.ts，SkillApiAdapter 迁入 retrieval"
```

---

## Task 3: auth-service.ts 最小化 (R9)

- [ ] **Step 1: 精简 auth-service.ts**

保留：
- `AuthUser` 类型
- `getAuthToken()` / `setAuthToken()` / `clearAuthToken()` token 工具
- `login()` / `logout()` / `fetchMe()` 核心 API

删除：
- `createSignal` 响应式封装 → 改为简单 `let _currentUser: AuthUser | null = null`
- `authLoading` 信号 → 删除，由调用方自行管理加载状态
- `updateProfile()` / `changePassword()` / `deleteAccount()` → 如 UI 未使用则删除

目标：从 208 行降到 ~100 行。

- [ ] **Step 2: 搜索所有 auth-service 导入方并适配**

```bash
grep -rn "auth-service" apps/app/src/app/xingjing/
```

重点检查 `currentUser` / `authLoading` 信号的使用方，改为函数调用。

- [ ] **Step 3: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R9 — 最小化 auth-service.ts"
```
