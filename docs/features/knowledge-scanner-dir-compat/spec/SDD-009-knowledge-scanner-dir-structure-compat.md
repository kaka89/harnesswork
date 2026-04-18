---
meta:
  id: SDD-009
  title: 知识库扫描器与 Workspace 目录结构契合修复
  status: proposed
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: SDD-008
  revision: "1.0"
  created: "2026-04-17"
  updated: "2026-04-17"
sections:
  background: "SDD-008 修复了 fileRead/fileWrite 的降级链盲区，但知识库扫描器仍无法正确按照 workspace 目录结构读取文件。根因在于 fileList 缺少 Tauri native fs 兜底导致目录展开全部失败，以及扫描器硬编码只识别 .md 文件，与 dir-graph.yaml 中定义的 YAML 文档类型不匹配"
  goals: "fileList 增加 Tauri readDir 兜底确保目录列表始终可用；扫描器支持 .yml/.yaml 文件匹配与解析；extractDocKnowledge 区分 YAML/Markdown 格式差异化提取；降级扫描同步扩展覆盖范围"
  architecture: "三层修复：① fileList 补齐 Level 4 Tauri native fs readDir；② knowledge-scanner 全链路扩展 YAML 文件支持；③ 移除 fileList 中错误使用的 readWorkspaceFile 目录列表降级"
  interfaces: "修改: opencode-client.ts fileList 降级链重构；修改: knowledge-scanner.ts scanFromFileSystem/extractDocKnowledge/collectMdFiles 多格式支持"
  nfr: "dir-graph 驱动扫描对 YAML 文档类型覆盖率 100%；fileList 在 OpenCode 不可用时成功率从 0% 提升到 100%（Tauri 环境）；Markdown 文档扫描行为零变更"
---

# SDD-009 知识库扫描器与 Workspace 目录结构契合修复

## 元信息

- 编号：SDD-009-knowledge-scanner-dir-structure-compat
- 状态：proposed
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-17
- 前置依赖：SDD-008（非 Markdown 文件读取支持）

---

## 1. 背景与问题域

### 1.1 问题描述

SDD-008 成功修复了 `fileRead`/`fileWrite` 的降级链盲区（Level 4 Tauri native fs 兜底），使得 `.xingjing/dir-graph.yaml` 等单文件读取恢复正常。但知识库扫描器（`knowledge-scanner.ts`）仍无法正确按照 workspace 目录结构读取出完整的文档知识。

**用户可观测症状**：知识库页面显示的文档列表不完整，部分或全部文档缺失，尤其是 YAML 格式的 Task/Release 文档完全不显示。

### 1.2 根因分析——五个不契合点

```
scanWorkspaceDocs(workDir)
 ├─ loadDirGraph()         ← ✅ SDD-008 已修复（fileRead 可读取 YAML）
 ├─ scanDocType()
 │   ├─ expandWildcardPaths()
 │   │   └─ fileList()     ← ❌ 问题1: 缺少 Tauri 兜底，返回 []
 │   ├─ extractDocKnowledge()
 │   │   └─ parseFrontmatter() ← ❌ 问题4: 对 YAML 文件用 MD 格式解析
 │   ├─ scanFromIndex()
 │   │   └─ fileRead()     ← ✅ SDD-008 已修复
 │   └─ scanFromFileSystem()
 │       ├─ fileList()     ← ❌ 问题1: 同上
 │       └─ .endsWith('.md') ← ❌ 问题3: 只匹配 .md，忽略 .yml/.yaml
 └─ fallbackScan()
     └─ collectMdFiles()   ← ❌ 问题5: 只收集 .md 文件
```

#### 问题 1 (致命): `fileList` 缺少 Tauri native fs 兜底

**位置**：`opencode-client.ts` L133-172

SDD-008 为 `fileRead`/`fileWrite` 添加了 Level 4 Tauri native fs 兜底，但 `fileList` 遗漏了。当 OpenCode SDK 不可用（ConfigInvalidError）且本地 OpenCode 服务不可达时：

- `fileList` 返回 `[]`
- `expandWildcardPaths()` 无法展开 `{feature}` 占位符 → 通配路径零结果
- `scanFromFileSystem()` 列不出任何文件 → 目录扫描全部跳过

**影响范围**：dir-graph.yaml 中所有含 `{placeholder}` 的 location 路径全部失效。

#### 问题 2 (致命): `fileList` Level 2 使用了错误的 API

**位置**：`opencode-client.ts` L152-159

```typescript
// 当前代码——用"文件内容读取"API 来"列目录"，逻辑错误
const result = await _owFileOps.read(_workspaceId, path);
if (result?.content) {
  try { return JSON.parse(result.content) as FileNode[]; } catch { /* not JSON */ }
}
```

`_owFileOps.read` 是 `readWorkspaceFile`——读文件内容的 API。传入目录路径只会返回 404 或 400 错误，**永远无法成功列目录**。

#### 问题 3 (严重): `scanFromFileSystem` 只匹配 `.md` 文件

**位置**：`knowledge-scanner.ts` L347

```typescript
if (file.type === 'file' && file.name.endsWith('.md') && matchesNaming(file.name, docTypeDef.naming))
```

但 dir-graph.yaml 定义了多种 YAML 文档类型：

| doc-type | naming 约定 | 被扫描? |
|----------|------------|---------|
| PRD | `PRD.md` | ✅ |
| SDD | `SDD.md` | ✅ |
| Hypothesis | `H-{NNN}-{name}.md` | ✅ |
| **Task** | `T-{NNN}-{name}.yml` | ❌ 遗漏 |
| **Release** | `v{x.y.z}.yml` | ❌ 遗漏 |
| Knowledge | `K-{NNN}-{name}.md` | ✅ |

#### 问题 4 (严重): `extractDocKnowledge` 对所有文件使用 Markdown 解析

**位置**：`knowledge-scanner.ts` L383

```typescript
const { frontmatter: fm, body } = parseFrontmatter(content);
```

YAML 文件的内容本身就是结构化数据，不是 Markdown+frontmatter 格式。用 `parseFrontmatter` 解析 `.yml` 文件会得到：
- `frontmatter` = `{}`（空对象）
- `body` = 整个 YAML 原文

导致 title/tags/summary/owner 等关键元数据全部丢失。

#### 问题 5 (中等): `collectMdFiles` 降级扫描只收集 `.md`

**位置**：`knowledge-scanner.ts` L549

```typescript
if (file.type === 'file' && file.name.endsWith('.md'))
```

降级扫描（dir-graph.yaml 不存在时）同样遗漏所有 YAML 文件。

### 1.3 受影响场景

| 场景 | 影响 | 严重度 |
|------|------|--------|
| OpenCode 未配置 + 本地服务不可达 | `fileList` 全部失败，知识库为空 | P0 |
| dir-graph 含 `{feature}` 通配路径 | 占位符无法展开，PRD/SDD 全部缺失 | P0 |
| dir-graph 定义 Task/Release 文档类型 | YAML 文件不被扫描，任务/发布文档缺失 | P1 |
| YAML 文件被扫描到 | 元数据提取全部错误，搜索排序失效 | P1 |
| dir-graph 不存在时的降级扫描 | 仅覆盖 .md 文件，YAML 文档缺失 | P2 |

### 1.4 与 SDD-008 的关系

SDD-008 解决了**单文件读取**的降级链问题（fileRead/fileWrite），本 SDD 解决**目录扫描**和**多格式解析**的契合问题。两者互补：

```
SDD-008 scope: fileRead ✅ / fileWrite ✅ / fileList ❌
SDD-009 scope: fileList ✅ / scanFromFileSystem ✅ / extractDocKnowledge ✅ / collectMdFiles ✅
```

---

## 2. 设计目标与约束

### 2.1 功能需求

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | `fileList` 增加 Level 4 Tauri native fs readDir 兜底 | P0 |
| FR-02 | `fileList` 移除错误的 Level 2 readWorkspaceFile 降级 | P0 |
| FR-03 | `scanFromFileSystem` 扩展匹配 `.yml`/`.yaml` 文件 | P0 |
| FR-04 | `extractDocKnowledge` 区分 YAML/Markdown 格式差异化解析 | P0 |
| FR-05 | `collectMdFiles` → `collectDocFiles` 支持 YAML 收集 | P1 |
| FR-06 | 降级链日志增强，标注 fileList 各层级结果 | P2 |

### 2.2 约束

| 约束 | 说明 |
|------|------|
| 向后兼容 | 纯 Markdown 工作区扫描行为零变更 |
| 最小变更 | 仅修改 `opencode-client.ts` 和 `knowledge-scanner.ts` 两个文件 |
| Tauri 选择性 | Tauri native fs 仅在桌面端可用，浏览器端自动跳过 |
| 性能约束 | `fileList` 新增兜底层不应增加 >100ms 延迟 |
| SDD-008 一致性 | 复用 SDD-008 建立的 `isTauriRuntime()` 判断和动态 import 模式 |

### 2.3 非目标

- 不修改 OpenWork Server API（已在 SDD-008 扩展）
- 不新增 Server 端目录列表 API（复用 OpenCode SDK 和 Tauri native fs）
- 不重构知识索引结构（`knowledge-index.ts` 保持不变）

---

## 3. 架构设计

### 3.1 fileList 降级链重构

**当前（有缺陷）**：

```
fileList(path, directory)
  ├─ Level 1: client.file.list (OpenCode SDK)         ← 受 ConfigInvalidError 影响
  ├─ Level 2: _owFileOps.read  (❌ 错误：文件内容API) ← 永远失败
  └─ Level 3: tauriFetch /file (直连 OpenCode)        ← 依赖本地服务可达
  → 全部失败 → 返回 []
```

**修复后**：

```
fileList(path, directory)
  ├─ Level 1: client.file.list (OpenCode SDK)         ← 不变
  ├─ Level 2: tauriFetch /file (直连 OpenCode)        ← 上移，移除错误的 readWorkspaceFile
  ├─ Level 3: Tauri native fs readDir (NEW)           ← 终极兜底，无网络依赖
  → 至少一层成功 → 返回 FileNode[]
```

### 3.2 Tauri native readDir 实现

```typescript
/**
 * Level 3 兜底：通过 Tauri 原生文件系统 API 列举目录内容。
 * 将 Tauri readDir 结果适配为 FileNode[] 格式。
 */
async function tauriNativeFileList(
  path: string,
  directory?: string,
): Promise<FileNode[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const fullPath = directory ? `${directory}/${path}` : path;
    const entries = await readDir(fullPath);
    return entries.map(entry => ({
      name: entry.name,
      path: `${path}/${entry.name}`,
      absolute: `${fullPath}/${entry.name}`,
      type: entry.isDirectory ? 'directory' : 'file',
      ignored: entry.name.startsWith('.'),
    }));
  } catch {
    return null;
  }
}
```

**FileNode 适配规则**：

| Tauri readDir 字段 | FileNode 字段 | 转换规则 |
|--------------------|--------------|---------|
| `entry.name` | `name` | 直接映射 |
| — | `path` | `${relativePath}/${entry.name}` |
| — | `absolute` | `${fullPath}/${entry.name}` |
| `entry.isDirectory` | `type` | `true → 'directory'` / `false → 'file'` |
| `entry.name` | `ignored` | `.` 开头视为忽略 |

### 3.3 knowledge-scanner 多格式解析

#### 3.3.1 文件匹配扩展

`scanFromFileSystem` 和 `collectDocFiles` 的文件匹配条件统一为：

```typescript
/** 知识扫描器支持的文档文件扩展名 */
const SCANNABLE_DOC_EXTENSIONS = ['.md', '.yml', '.yaml'];

function isScannableDoc(fileName: string): boolean {
  return SCANNABLE_DOC_EXTENSIONS.some(ext => fileName.endsWith(ext));
}
```

#### 3.3.2 差异化格式解析

`extractDocKnowledge` 根据文件扩展名选择解析策略：

```typescript
let fm: Record<string, unknown>;
let body: string;

if (relativePath.endsWith('.yml') || relativePath.endsWith('.yaml')) {
  // YAML 文件：整体解析为结构化数据
  const parsed = parseYamlSimple(content);
  fm = parsed;
  // 将结构化数据的关键字段拼接为 body，供摘要提取使用
  body = Object.entries(parsed)
    .filter(([_, v]) => typeof v === 'string')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
} else {
  // Markdown 文件：标准 frontmatter + body 解析
  const result = parseFrontmatter(content);
  fm = result.frontmatter;
  body = result.body;
}
```

**YAML 文件元数据映射规则**：

| YAML 字段 | WorkspaceDocKnowledge 字段 | 优先级 |
|-----------|--------------------------|--------|
| `title` / `name` | `title` | 优先 `title`，其次 `name` |
| `description` / `summary` | `summary` | 优先 `description` |
| `tags` / `labels` | `tags` | 合并 |
| `owner` / `assignee` | `owner` | 优先 `owner` |
| `status` | `frontmatter.status` | 直接映射 |
| `created` / `date` | `indexedAt` | 用于时效性排序 |

### 3.4 变更影响矩阵

| 文件 | 变更类型 | 影响范围 |
|------|---------|---------|
| `opencode-client.ts` | 重构 `fileList` | fileList 调用方（knowledge-scanner, file-store） |
| `knowledge-scanner.ts` | 4 处逻辑修改 | 知识扫描结果、知识索引 |
| — | 不变 | knowledge-index.ts, knowledge-retrieval.ts |

---

## 4. 详细设计

### 4.1 opencode-client.ts — fileList 重构

#### 4.1.1 新增 `tauriNativeFileList` 函数

在 SDD-008 的 `tauriNativeFileRead`/`tauriNativeFileWrite` 之后新增：

```typescript
async function tauriNativeFileList(
  path: string,
  directory?: string,
): Promise<FileNode[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const fullPath = directory ? `${directory}/${path}` : path;
    const entries = await readDir(fullPath);
    return entries
      .filter(e => e.name != null)
      .map(entry => ({
        name: entry.name!,
        path: `${path.replace(/\/$/, '')}/${entry.name}`,
        absolute: `${fullPath.replace(/\/$/, '')}/${entry.name}`,
        type: (entry.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
        ignored: entry.name!.startsWith('.'),
      }));
  } catch {
    return null;
  }
}
```

#### 4.1.2 重构 `fileList` 函数

```typescript
export async function fileList(
  path: string,
  directory?: string,
): Promise<FileNode[]> {
  // Level 1: OpenCode SDK 客户端（优先）
  try {
    const client = getXingjingClient();
    const result = await (client.file.list as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return result.data as FileNode[];
    console.warn('[xingjing] fileList SDK returned no data, error:',
      (result as any)?.error?.name ?? result.error);
  } catch (e) {
    console.warn('[xingjing] fileList SDK failed:', (e as Error)?.message ?? e);
  }

  // Level 2: tauriFetch 直连 OpenCode（绕过 CORS）
  // 注：移除了原 Level 2 的 _owFileOps.read 错误降级（readWorkspaceFile 是文件内容 API，不是目录列表）
  try {
    const url = new URL('/file', _baseUrl);
    url.searchParams.set('path', path);
    const dir = directory ?? (_directory || '');
    if (dir) url.searchParams.set('directory', dir);
    const resp = await safeFetch()(url.toString());
    if (resp.ok) return (await resp.json()) as FileNode[];
    console.warn('[xingjing] fileList tauriFetch 失败, status:', resp.status);
  } catch (e) {
    console.warn('[xingjing] fileList tauriFetch 异常:', (e as Error)?.message ?? e);
  }

  // Level 3: Tauri 原生文件系统（SDD-009 新增，终极兜底）
  const nativeResult = await tauriNativeFileList(path, directory);
  if (nativeResult !== null) {
    console.debug('[xingjing] fileList 通过 Tauri native fs 成功, path:', path,
      'count:', nativeResult.length);
    return nativeResult;
  }

  console.warn('[xingjing] fileList 所有通道均失败, path:', path);
  return [];
}
```

#### 4.1.3 Tauri Capabilities 补充

SDD-008 已添加 `fs:allow-read-text-file`/`fs:allow-write-text-file` 权限。`readDir` 需要额外权限：

```json
{
  "permissions": [
    "fs:allow-read-dir"
  ]
}
```

确认在 `apps/desktop/src-tauri/capabilities/default.json` 中补充此权限。

### 4.2 knowledge-scanner.ts — 多格式扫描

#### 4.2.1 新增文件类型判断工具函数

```typescript
/** 知识扫描器支持的文档文件扩展名 */
const SCANNABLE_DOC_EXTENSIONS = ['.md', '.yml', '.yaml'];

/** 判断文件是否为可扫描的文档类型 */
function isScannableDoc(fileName: string): boolean {
  return SCANNABLE_DOC_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

/** 判断文件是否为 YAML 格式 */
function isYamlFile(filePath: string): boolean {
  return filePath.endsWith('.yml') || filePath.endsWith('.yaml');
}
```

#### 4.2.2 修改 `extractDocKnowledge` — 差异化格式解析

**变更点**：L380-384，替换固定的 `parseFrontmatter` 为格式感知解析。

```typescript
async function extractDocKnowledge(
  workDir: string,
  relativePath: string,
  docTypeKey: string,
  docTypeDef: DirGraphConfig['docTypes'][string],
  dirGraph: DirGraphConfig,
): Promise<WorkspaceDocKnowledge | null> {
  try {
    const content = await fileRead(relativePath, workDir);
    if (!content) return null;

    // ── SDD-009: 格式感知解析 ──
    let fm: Record<string, unknown>;
    let body: string;

    if (isYamlFile(relativePath)) {
      // YAML 文件：整体解析为结构化数据
      fm = parseYamlSimple(content);
      // 将字符串类型的字段拼接为伪 body，供摘要提取复用
      body = Object.entries(fm)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    } else {
      // Markdown 文件：标准 frontmatter 解析
      const parsed = parseFrontmatter(content);
      fm = parsed.frontmatter;
      body = parsed.body;
    }

    const title = String(
      fm['title'] ?? fm['name'] ?? fm['doc-type'] ?? extractTitleFromBody(body)
    );
    const tags = extractTags(fm, body);
    const summary = extractSummary(docTypeKey, fm, body);
    const layer = inferLayer(relativePath, dirGraph);
    // ... 后续逻辑不变
  } catch {
    return null;
  }
}
```

#### 4.2.3 修改 `scanFromFileSystem` — 扩展文件匹配

**变更点**：L347，将 `.endsWith('.md')` 替换为 `isScannableDoc()`。

```typescript
// Before:
if (file.type === 'file' && file.name.endsWith('.md') && matchesNaming(file.name, docTypeDef.naming))

// After:
if (file.type === 'file' && isScannableDoc(file.name) && matchesNaming(file.name, docTypeDef.naming))
```

同步修改 `expandWildcardPaths` 中的文件路径匹配（L209）：

```typescript
// Before:
if (/\.(md|yml|yaml)$/.test(expanded)) {

// After（已正确，无需修改）:
if (/\.(md|yml|yaml)$/.test(expanded)) {
```

> 注：`expandWildcardPaths` 内的正则已包含 yml/yaml，无需变更。

#### 4.2.4 修改 `collectMdFiles` → `collectDocFiles`

**变更点**：
1. 函数重命名 `collectMdFiles` → `collectDocFiles`
2. 文件匹配条件扩展
3. YAML 文件使用差异化解析

```typescript
async function collectDocFiles(
  workDir: string,
  dir: string,
  docType: string,
  results: WorkspaceDocKnowledge[],
  seen: Set<string>,
): Promise<void> {
  let files: FileNode[];
  try {
    files = await fileList(dir, workDir);
  } catch { return; }
  if (!files) return;

  for (const file of files) {
    // SDD-009: 扩展匹配 .yml/.yaml 文件
    if (file.type === 'file' && isScannableDoc(file.name)) {
      const filePath = `${dir}/${file.name}`;
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      try {
        const content = await fileRead(filePath, workDir);
        if (!content) continue;

        // SDD-009: 格式感知解析
        let fm: Record<string, unknown>;
        let body: string;
        if (isYamlFile(filePath)) {
          fm = parseYamlSimple(content);
          body = Object.entries(fm)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');
        } else {
          const parsed = parseFrontmatter(content);
          fm = parsed.frontmatter;
          body = parsed.body;
        }

        const inferredDocType =
          String(fm['doc-type'] ?? fm['docType'] ?? fm['type'] ?? docType).toUpperCase();
        const title = String(
          fm['title'] ?? fm['name'] ?? extractTitleFromBody(body) ?? file.name.replace(/\.(md|yml|yaml)$/, '')
        );
        results.push({
          id: `scan-${inferredDocType}-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
          docType: inferredDocType,
          category: 'baseline',
          layer: inferLayerFromPath(filePath),
          title,
          summary: body.slice(0, 500),
          tags: extractTags(fm, body),
          filePath,
          owner: String(fm['owner'] ?? fm['assignee'] ?? ''),
          upstream: [],
          downstream: [],
          frontmatter: fm,
          lifecycle: ((fm['lifecycle'] as string) === 'stable' ? 'stable' : 'living'),
          indexedAt: new Date().toISOString(),
        });
      } catch { /* silent */ }
    } else if (file.type === 'directory' && !file.name.startsWith('.')) {
      await collectDocFiles(workDir, `${dir}/${file.name}`, docType, results, seen);
    }
  }
}
```

#### 4.2.5 `fallbackScan` 调用更新

```typescript
// Before:
await collectMdFiles(workDir, dir, docType, results, seen);

// After:
await collectDocFiles(workDir, dir, docType, results, seen);
```

---

## 5. ADR（架构决策记录）

### ADR-1: fileList Level 2 直接移除而非修复

**决策**：移除 `fileList` 中错误使用 `_owFileOps.read()` 的 Level 2，而非改为调用 OpenWork Server 的 `/workspace/readdir` 端点。

**理由**：
1. `/workspace/readdir` 需要绝对路径，但 `fileList` 接收的是相对路径，路径转换引入复杂性
2. OpenWork Server 的 readdir 端点返回格式（`type: 'dir'|'file'`）与 FileNode（`type: 'directory'|'file'`）不一致
3. Tauri native readDir 已能 100% 覆盖此场景，无需引入额外的 Server API 依赖

### ADR-2: YAML body 构造策略——字段拼接

**决策**：将 YAML 结构化数据的 string 字段拼接为 `key: value` 格式的伪 body。

**理由**：
1. `extractSummary` 和 `extractTags` 函数已针对 Markdown body 设计了丰富的提取策略
2. 将 YAML 字段转为类似文本的 body，可以**零修改复用**现有摘要提取逻辑
3. 不影响 frontmatter 直接映射的元数据字段（title/owner/tags 从 `fm` 对象直接取）

### ADR-3: readDir Capabilities 权限粒度

**决策**：添加 `fs:allow-read-dir` 权限。

**理由**：
1. `readDir` 需要独立于 `readTextFile` 的权限声明
2. Tauri 2.x 的权限模型要求显式声明每个 fs 操作类型
3. SDD-008 已建立了 fs 权限管理的模式，本次仅做增量补充

---

## 6. 测试策略

### 6.1 手动验证场景

| # | 场景 | 预期结果 |
|---|------|---------|
| T-01 | OpenCode 已配置且可达 | fileList Level 1 成功，扫描正常 |
| T-02 | OpenCode ConfigInvalidError + 本地不可达 | fileList Level 3 (Tauri) 成功，扫描正常 |
| T-03 | dir-graph 含 `{feature}` 通配路径 | 占位符正确展开，PRD/SDD 全部扫到 |
| T-04 | iterations/tasks/ 下有 `.yml` 文件 | Task 文档被扫描，title/status 正确提取 |
| T-05 | YAML Task 文件出现在知识搜索结果中 | 搜索 "任务" 可命中 Task 文档 |
| T-06 | dir-graph 不存在时的降级扫描 | `.yml` 文件也被收集 |
| T-07 | 纯 Markdown 工作区 | 行为与修复前完全一致 |

### 6.2 日志验证

```
✅ [xingjing] fileList 通过 Tauri native fs 成功, path: product/features, count: 3
✅ [xingjing] fileRead 通过 Tauri native fs 成功, path: iterations/tasks/T-001-init.yml
```

---

## 7. 实施计划

### Task 1: fileList 降级链重构 (opencode-client.ts)

- [ ] 新增 `tauriNativeFileList` 函数
- [ ] 重构 `fileList`：移除错误的 Level 2 readWorkspaceFile，添加 Level 3 Tauri native readDir
- [ ] 补充 `fs:allow-read-dir` 到 capabilities/default.json

### Task 2: 扫描器多格式支持 (knowledge-scanner.ts)

- [ ] 新增 `SCANNABLE_DOC_EXTENSIONS`/`isScannableDoc`/`isYamlFile` 工具函数
- [ ] 修改 `extractDocKnowledge`：差异化格式解析
- [ ] 修改 `scanFromFileSystem`：扩展文件匹配条件
- [ ] 重命名 `collectMdFiles` → `collectDocFiles`，扩展 YAML 支持
- [ ] 更新 `fallbackScan` 调用

### Task 3: 构建验证

- [ ] `pnpm turbo build --filter=@openwork/app` 通过
- [ ] `pnpm turbo build --filter=openwork-server` 通过（无变更，回归确认）

### Task 4: 手动验证

- [ ] 重启 tauri dev（Rust capabilities 变更需重启）
- [ ] 验证 T-01 到 T-07 测试场景
