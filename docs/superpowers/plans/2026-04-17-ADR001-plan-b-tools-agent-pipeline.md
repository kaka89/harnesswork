# Plan B: R2 Frontmatter统一 + R5 Agent精简 + R7 Pipeline注释

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** 创建共享 frontmatter.ts，统一三处解析器，精简 agent-registry.ts，清理 pipeline 过时注释

**Worktree:** `worktrees/feature/TASK-ADR001-plan-b`

**Files:**
- Create: `apps/app/src/app/xingjing/utils/frontmatter.ts`
- Modify: `apps/app/src/app/xingjing/services/file-store.ts`
- Modify: `apps/app/src/app/xingjing/services/agent-registry.ts`
- Modify: `apps/app/src/app/xingjing/services/pipeline-config.ts`

---

## Task 1: 创建共享 frontmatter.ts (R2)

- [ ] **Step 1: 创建 `utils/frontmatter.ts`**

```typescript
/**
 * 统一的 Markdown frontmatter 解析/序列化工具
 */
import yaml from 'js-yaml';

export interface FrontmatterDoc<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(content: string): FrontmatterDoc<T> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {} as T, body: content };
  const frontmatter = (yaml.load(match[1]) as T) ?? ({} as T);
  return { frontmatter, body: match[2] ?? '' };
}

export function stringifyFrontmatter<T extends Record<string, unknown>>(doc: FrontmatterDoc<T>): string {
  const yamlStr = yaml.dump(doc.frontmatter, { indent: 2 }).trimEnd();
  return `---\n${yamlStr}\n---\n${doc.body}`;
}

export function parseFrontmatterMeta(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try { return (yaml.load(match[1]) as Record<string, unknown>) ?? {}; }
  catch { return {}; }
}

export function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}
```

- [ ] **Step 2: 替换 file-store.ts 中的 parseFrontmatter/stringifyFrontmatter**

1. 删除 `file-store.ts` 中的 `FrontmatterDoc` 类型定义、`parseFrontmatter()`、`stringifyFrontmatter()` 函数
2. 新增导入：`import { parseFrontmatter, stringifyFrontmatter, type FrontmatterDoc } from '../utils/frontmatter';`
3. 更新注释 `// ─── 简单 YAML 序列化/反序列化（无外部依赖）` → `// ─── YAML 工具（基于 js-yaml）`

- [ ] **Step 3: 替换 agent-registry.ts 中的解析函数**

1. 删除 `agent-registry.ts` 中第32-48行的 `parseFrontmatter()` 和 `extractBody()` 函数
2. 新增导入：`import { parseFrontmatterMeta, extractBody } from '../utils/frontmatter';`
3. 将 `parseAgentMarkdown()` 中 `parseFrontmatter(content)` → `parseFrontmatterMeta(content)`

- [ ] **Step 4: 替换 pipeline-config.ts 中的 parseSimpleYaml**

1. 删除 `pipeline-config.ts` 中第53-59行的 `parseSimpleYaml()` 函数
2. 将调用处改为直接使用 `yaml.load(content) as Record<string, unknown>`
3. 更新文件头注释，删除"手写 YAML 解析器"

- [ ] **Step 5: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R2 — 统一 frontmatter 解析器为共享工具"
```

---

## Task 2: Agent 注册表精简 (R5)

- [ ] **Step 1: 删除 parseAgentMarkdown 及相关代码**

在 `agent-registry.ts` 中：
1. 删除 `parseAgentMarkdown()` 函数（第61-87行）
2. 更新文件头注释，删除"双源发现机制"等过时描述
3. 保留：`discoverAgents()`、`getBuiltinAgents()`、`ensureAgentsRegistered()`、`RegisteredAgent` 类型

- [ ] **Step 2: 全局搜索 `parseAgentMarkdown` 引用并清理**

```bash
grep -rn "parseAgentMarkdown" apps/app/src/app/xingjing/
```

删除或替换所有调用方。如有 export，同步从 index 中删除。

- [ ] **Step 3: 构建验证**

```bash
pnpm turbo run build --filter=app
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor(xingjing): R5 — 精简 agent-registry，删除 parseAgentMarkdown"
```

---

## Task 3: Pipeline 注释清理 (R7)

- [ ] **Step 1: 清理 pipeline-config.ts 过时注释**

更新模块头注释，标明已使用 js-yaml 标准库。

- [ ] **Step 2: 提交**

```bash
git add -A && git commit -m "chore(xingjing): R7 — 清理 pipeline-config.ts 过时注释"
```
