---
meta:
  id: SDD-008
  title: 非 Markdown 文件读取支持——Server API 扩展 + 客户端降级增强
  status: proposed
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: null
  revision: "1.0"
  created: "2026-04-17"
  updated: "2026-04-17"
sections:
  background: "OpenWork Server readWorkspaceFile API 硬编码仅支持 Markdown 文件，导致星静知识库扫描器无法通过主通道读取 .xingjing/dir-graph.yaml，且 OpenCode SDK 降级链在 ConfigInvalidError 或本地服务不可达时全链失败，造成知识库功能间歇性不可用"
  goals: "服务端扩展支持的文件类型白名单（+yaml/yml/json），客户端增加 Tauri 原生文件系统作为终极兜底，并对已知非 Markdown 文件智能跳过 Level 1，消除三级降级链的覆盖盲区"
  architecture: "双管齐下：① Server API 扩展文件类型白名单；② 客户端 fileRead 增加 Level 4 Tauri native fs 兜底 + 非 Markdown 文件智能路由"
  interfaces: "修改: server.ts GET/POST /workspace/:id/files/content 文件类型校验；修改: opencode-client.ts fileRead/fileWrite 降级链；新增: Tauri plugin-fs readTextFile 兜底层"
  nfr: "dir-graph.yaml 读取成功率从间歇性失败提升到 100%；非 Markdown 文件读取延迟 <500ms；Markdown 文件读取行为零变更"
---

# SDD-008 非 Markdown 文件读取支持——Server API 扩展 + 客户端降级增强

## 元信息

- 编号：SDD-008-file-read-non-markdown-support
- 状态：proposed
- 作者：architect-agent
- 修订版本：1.0
- 创建日期：2026-04-17

---

## 1. 背景与问题域

### 1.1 Bug 复现路径

星静知识库扫描器（`knowledge-scanner.ts`）启动时调用 `loadDirGraph()` 读取 `.xingjing/dir-graph.yaml`，触发 `fileRead('.xingjing/dir-graph.yaml', workDir)` 三级降级链。在特定环境条件下，三级全部失败，导致知识库功能不可用：

```
scanWorkspaceDocs(workDir)
  └─ loadDirGraph(workDir)
     └─ fileRead('.xingjing/dir-graph.yaml', workDir)
        ├─ Level 1: OpenWork API → 400 "Only markdown files supported" ✗ 必定失败
        ├─ Level 2: OpenCode SDK → ConfigInvalidError              ✗ 条件性失败
        └─ Level 3: tauriFetch → 127.0.0.1:4096 不可达            ✗ 条件性失败
```

日志表现：`[xingjing] fileRead OpenWork API 返回空内容, path:".xingjing/dir-graph.yaml"`

### 1.2 "已修复又重现"的原因

| 时间线 | 状态 | 根因 |
|--------|------|------|
| 首次发现 | Bug | fileRead 传入绝对路径 → Level 1 路径解析错误 |
| 上次修复 | 正常 | 路径修正为相对路径 + Level 2/3 碰巧可用（OpenCode 配置正常） |
| 再次重现 | Bug | Level 1 仍因 YAML 类型限制失败；Level 2 因 ConfigInvalidError 失败；Level 3 因本地服务不可达失败 |

**核心矛盾**：上次修复解决了"路径"问题，但未解决"文件类型限制"这个结构性缺陷。当 Level 2/3 恰好可用时表现正常，不可用时就重现。

### 1.3 受影响文件类型

星静在工作区中需要读写的非 Markdown 文件：

| 文件 | 用途 | 调用方 |
|------|------|--------|
| `.xingjing/dir-graph.yaml` | 知识库文档地图 | knowledge-scanner.ts |
| `.xingjing/solo/knowledge/_doc-index.json` | 文档扫描缓存 | knowledge-scanner.ts |
| `*/_index.yaml` | 目录台账 | knowledge-scanner.ts |
| `.xingjing/memory/index.json` | 记忆索引 | memory-store.ts |
| `.xingjing/memory/sessions/*.json` | 会话记忆 | memory-store.ts |
| `.xingjing/global-settings.yaml` | 全局设置 | file-store.ts |

### 1.4 Server API 文件类型限制源码

`apps/server/src/server.ts` L3112-3114：

```typescript
const isMarkdown = lowered.endsWith(".md") || lowered.endsWith(".mdx") || lowered.endsWith(".markdown");
if (!isMarkdown) {
  throw new ApiError(400, "invalid_path", "Only markdown files are supported");
}
```

此限制同时应用于 GET 和 POST 两个 endpoint（L3144-3146），影响 readWorkspaceFile 和 writeWorkspaceFile。

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | Server API 扩展支持 `.yaml`/`.yml`/`.json` 文件读写 | P0 |
| FR-02 | 客户端 fileRead 对非 Markdown 文件智能跳过 Level 1（当 Server 未升级时） | P0 |
| FR-03 | 客户端增加 Level 4：Tauri 原生文件系统 readTextFile 兜底 | P0 |
| FR-04 | fileWrite 同步扩展，支持写入 `.yaml`/`.json` 文件 | P1 |
| FR-05 | 完善降级链日志，区分"文件类型不支持"和"真正的空内容" | P1 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 服务端变更 | 仅修改文件类型白名单，不改变 API 签名和鉴权逻辑 |
| 安全限制 | 扩展白名单仅限文本格式，不允许二进制文件（如 .exe/.zip/.png） |
| 前端框架 | SolidJS，fileRead/fileWrite 签名不变 |
| 版本兼容 | 客户端必须兼容未升级的 Server（智能跳过 + Tauri 兜底） |
| 版本隔离 | 仅改动独立版代码路径，不影响团队版 |

### 2.3 不在范围内

- 支持任意二进制文件读写
- 修改 OpenWork 的 File Session API（批量文件操作）
- 重构整个 fileRead 降级链架构
- 替换 OpenCode SDK 的 file.read 实现

---

## 3. 系统架构

### 3.1 变更前：三级降级链（存在覆盖盲区）

```
fileRead(path, directory)
  ├─ Level 1: OpenWork API (_owFileOps.read)
  │    ⚠️ 仅支持 .md/.mdx/.markdown → 非 Markdown 必定失败
  ├─ Level 2: OpenCode SDK (client.file.read)
  │    ⚠️ ConfigInvalidError 时全部 SDK 调用失败
  └─ Level 3: tauriFetch (127.0.0.1:4096)
       ⚠️ 本地 OpenCode 服务未启动时失败
  → 三级全败时 return null（知识库不可用）
```

### 3.2 变更后：四级降级链 + 智能路由

```
fileRead(path, directory)
  ├─ 路由判断：isServerSupportedFile(path)
  │    ├─ true  → Level 1: OpenWork API (扩展后支持 yaml/json)
  │    └─ false → 跳过 Level 1，直接 Level 2
  ├─ Level 2: OpenCode SDK (client.file.read)
  ├─ Level 3: tauriFetch (127.0.0.1:4096)
  └─ Level 4 [NEW]: Tauri native fs (readTextFile)
       ✅ 无网络依赖，直接读本地文件，Tauri 环境下始终可用
  → 至少 Level 4 兜底成功
```

### 3.3 变更点总览

| 变更点 | 文件 | 类型 | 描述 |
|--------|------|------|------|
| A | `apps/server/src/server.ts` | 修改 | 扩展 GET/POST `/workspace/:id/files/content` 的文件类型白名单 |
| B | `apps/app/src/app/xingjing/services/opencode-client.ts` | 修改 | fileRead 增加智能路由 + Level 4 Tauri native fs |
| C | `apps/app/src/app/xingjing/services/opencode-client.ts` | 修改 | fileWrite 同步扩展 Level 4 |
| D | `apps/app/src/app/pages/xingjing-native.tsx` | 观察 | readWorkspaceFile 的 .catch(() => null) 无需变更，但 Level 1 失败原因日志需增强 |

---

## 4. 详细设计

### 4.1 变更 A：Server API 文件类型白名单扩展

**文件**：`apps/server/src/server.ts`

**现状**（L3112-3114）：
```typescript
const isMarkdown = lowered.endsWith(".md") || lowered.endsWith(".mdx") || lowered.endsWith(".markdown");
if (!isMarkdown) {
  throw new ApiError(400, "invalid_path", "Only markdown files are supported");
}
```

**变更为**：
```typescript
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  // Markdown
  ".md", ".mdx", ".markdown",
  // Data/Config（星静知识库 + 配置文件）
  ".yaml", ".yml", ".json",
]);
const ext = "." + relativePath.split(".").pop()?.toLowerCase();
if (!SUPPORTED_TEXT_EXTENSIONS.has(ext)) {
  throw new ApiError(400, "invalid_path", `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_TEXT_EXTENSIONS].join(", ")}`);
}
```

**影响范围**：
- GET `/workspace/:id/files/content`（L3107-3133）— 读取
- POST `/workspace/:id/files/content`（L3135-3180）— 写入

**安全考量**：白名单方式确保只允许已知的文本格式，不会打开任意文件读取漏洞。

### 4.2 变更 B：fileRead 智能路由 + Level 4 兜底

**文件**：`apps/app/src/app/xingjing/services/opencode-client.ts`

#### 4.2.1 新增：文件类型判断工具函数

```typescript
/** 服务端当前支持的文件扩展名（与 server.ts SUPPORTED_TEXT_EXTENSIONS 保持同步） */
const SERVER_SUPPORTED_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.yaml', '.yml', '.json',
]);

/**
 * 判断文件路径是否为 Server API 支持的类型。
 * 用于 fileRead 智能路由：不支持的类型直接跳过 Level 1，避免无意义的 400 错误。
 */
function isServerSupportedFile(path: string): boolean {
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx < 0) return false;
  return SERVER_SUPPORTED_EXTENSIONS.has(path.slice(dotIdx).toLowerCase());
}
```

#### 4.2.2 新增：Level 4 Tauri 原生文件系统读取

```typescript
import { readTextFile } from '@tauri-apps/plugin-fs';

/**
 * Level 4 兜底：通过 Tauri 原生文件系统 API 直接读取本地文件。
 * 无网络依赖，Tauri 环境下始终可用。
 * 非 Tauri 环境（浏览器）跳过此层。
 */
async function tauriNativeFileRead(
  path: string,
  directory?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const fullPath = directory ? `${directory}/${path}` : path;
    const content = await readTextFile(fullPath);
    return content || null;
  } catch {
    return null;
  }
}
```

#### 4.2.3 修改：fileRead 增加智能路由 + Level 4

```typescript
export async function fileRead(
  path: string,
  directory?: string,
): Promise<string | null> {
  // 1. 优先：OpenWork 文件 API（仅对服务端支持的文件类型尝试）
  if (_owFileOps && _workspaceId && isServerSupportedFile(path)) {
    try {
      const relativePath = directory ? path : toWorkspaceRelativePath(path);
      console.debug('[xingjing] fileRead 尝试 OpenWork API, path:', relativePath);
      const result = await _owFileOps.read(_workspaceId, relativePath);
      if (result?.content !== undefined) return result.content;
      console.warn('[xingjing] fileRead OpenWork API 返回空内容, path:', relativePath);
    } catch (e) {
      console.warn('[xingjing] fileRead OpenWork API 失败:', (e as Error)?.message ?? e);
    }
  }

  // 2. OpenCode SDK 客户端
  try {
    const client = getXingjingClient();
    const result = await (client.file.read as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return (result.data as FileContent).content;
    console.warn('[xingjing] fileRead SDK no data, error:', (result as any)?.error?.name ?? result.error);
  } catch (e) {
    console.warn('[xingjing] fileRead SDK failed:', (e as Error)?.message ?? e);
  }

  // 3. tauriFetch 直连 OpenCode
  try {
    const url = new URL('/file/content', _baseUrl);
    url.searchParams.set('path', path);
    const dir = directory ?? (_directory || '');
    if (dir) url.searchParams.set('directory', dir);
    const resp = await safeFetch()(url.toString());
    if (resp.ok) {
      const data = await resp.json();
      return (data as FileContent).content ?? null;
    }
  } catch { /* fall through to Level 4 */ }

  // 4. [NEW] 终极兜底：Tauri 原生文件系统
  const nativeResult = await tauriNativeFileRead(path, directory);
  if (nativeResult !== null) {
    console.debug('[xingjing] fileRead 通过 Tauri native fs 成功, path:', path);
    return nativeResult;
  }

  console.warn('[xingjing] fileRead 所有通道均失败, path:', path);
  return null;
}
```

### 4.3 变更 C：fileWrite 同步扩展

**文件**：`apps/app/src/app/xingjing/services/opencode-client.ts`

fileWrite 需同步增加：
1. **智能路由**：对不支持的文件类型跳过 OpenWork API
2. **Level 3 Tauri native fs**：增加 `writeTextFile` 兜底

```typescript
import { writeTextFile } from '@tauri-apps/plugin-fs';

// fileWrite 中增加 Tauri native fs 兜底
async function tauriNativeFileWrite(
  path: string,
  content: string,
  directory?: string,
): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const fullPath = directory ? `${directory}/${path}` : path;
    await writeTextFile(fullPath, content);
    return true;
  } catch {
    return false;
  }
}
```

### 4.4 变更 D：日志增强

在 Level 1 跳过时增加 debug 日志，便于调试：

```typescript
if (!isServerSupportedFile(path)) {
  console.debug('[xingjing] fileRead 跳过 OpenWork API（文件类型不支持）, path:', path);
}
```

---

## 5. 关键设计决策（ADR）

### ADR-001: 服务端白名单扩展 vs 客户端绕过

**背景**：OpenWork Server 的 Markdown-only 限制是否应该放宽？

**决策**：采用方案 C（双管齐下）——同时扩展服务端白名单 + 客户端增加 Tauri 兜底。

**备选方案**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| A：仅扩展 Server | 最简洁，一处修改 | 客户端仍依赖 Server 可用性 |
| B：仅客户端绕过 | 不需要改 Server | Level 2/3 不可靠，问题仍在 |
| **C：双管齐下** | **Server 升级后主通道直接可用；未升级时客户端自主降级** | **两处修改，需同步白名单** |

**后果**：
- 需要维护两处白名单的一致性（SERVER_SUPPORTED_EXTENSIONS）
- 客户端版本 > Server 版本时，智能路由自动跳过 Level 1，无需等待 Server 升级

### ADR-002: 白名单方式 vs 黑名单方式

**决策**：使用白名单（仅允许已知安全的文本格式），而非黑名单（禁止已知危险格式）。

**理由**：白名单更安全——未知格式默认拒绝，避免意外打开二进制文件读取。扩展新格式需显式添加，有代码审查保障。

### ADR-003: Level 4 使用 Tauri native fs 而非其他方案

**决策**：使用 `@tauri-apps/plugin-fs` 的 `readTextFile` 作为 Level 4。

**备选方案**：
- 使用 `fs.readFile`（Node.js）—— 不适用，前端 SolidJS 环境无 Node API
- 使用 `fetch('file://')` —— 浏览器安全限制，不可行
- 使用 IndexedDB 缓存 —— 无法读取首次未缓存的文件

**后果**：
- Level 4 仅在 Tauri 环境（桌面端）可用，浏览器端无此兜底
- 浏览器端在 Level 1-3 全失败时仍返回 null（可接受，浏览器端始终有 Server 可用）

---

## 6. 非功能实现方案

### 6.1 性能设计

| 场景 | 设计方案 | 预期效果 |
|------|---------|---------|
| Markdown 文件读取 | 行为零变更，仍走 Level 1 | 延迟不变 |
| YAML/JSON 文件读取（Server 已升级） | Level 1 直接成功 | <200ms |
| YAML/JSON 文件读取（Server 未升级） | 跳过 Level 1 → Level 2/3/4 | <500ms |
| Tauri native fs 读取 | 本地文件 I/O | <50ms |

### 6.2 容错设计

```
Level 1 失败（400/网络错误）：
  → 静默降级到 Level 2
  → 日志区分"文件类型不支持"和"真正的 API 错误"

Level 2 失败（ConfigInvalidError/SDK 异常）：
  → 静默降级到 Level 3
  → warn 日志记录具体错误

Level 3 失败（连接超时/拒绝）：
  → 静默降级到 Level 4
  → 不再 ignore，记录 warn 日志

Level 4 失败（文件不存在/权限错误）：
  → 返回 null
  → warn 日志汇总"所有通道均失败"
```

### 6.3 向后兼容

- **Server 未升级**时：客户端智能路由跳过 Level 1，通过 Level 2-4 完成读取
- **Tauri 插件未安装**时：`readTextFile` import 需动态导入或 try-catch，不影响非 Tauri 环境
- **API 签名不变**：fileRead/fileWrite 的参数和返回值类型不变，调用方无需修改

---

## 7. 测试策略

### 7.1 单元测试覆盖点

| 测试函数 | 测试重点 |
|----------|---------|
| `isServerSupportedFile()` | .md/.yaml/.json 返回 true；.exe/.png/.ts 返回 false；无扩展名返回 false |
| `tauriNativeFileRead()` | 文件存在时返回内容；文件不存在时返回 null；非 Tauri 环境返回 null |
| `fileRead()` 智能路由 | .yaml 文件跳过 Level 1 直接走 Level 2；.md 文件仍走 Level 1 |

### 7.2 集成测试场景

| 场景 | 验证目标 |
|------|---------|
| Server 已升级 + 读取 dir-graph.yaml | Level 1 直接成功，返回正确内容 |
| Server 未升级 + 读取 dir-graph.yaml | Level 1 跳过，Level 4 兜底成功 |
| 读取不存在的 yaml 文件 | 四级全部返回 null，无异常抛出 |
| 读取 .md 文件（回归） | 行为与变更前完全一致 |
| 知识库扫描完整流程 | scanWorkspaceDocs 成功加载 dir-graph 并产出知识列表 |

### 7.3 手动验证

1. 启动应用 → 打开独立版知识库页面 → 控制台无 "fileRead OpenWork API 返回空内容" 警告
2. 重启后知识库自动加载 → dir-graph.yaml 正常解析 → 知识条目显示正确
3. 断开 OpenCode → 知识库仍可读取（通过 Tauri native fs 兜底）

---

## 8. 实施计划

### Task 1：Server API 文件类型白名单扩展

- **文件**：`apps/server/src/server.ts`
- **变更**：提取 `SUPPORTED_TEXT_EXTENSIONS` 常量，替换 GET/POST 两处 isMarkdown 判断
- **预估**：0.5h

### Task 2：客户端 fileRead 智能路由 + Level 4 兜底

- **文件**：`apps/app/src/app/xingjing/services/opencode-client.ts`
- **变更**：新增 `isServerSupportedFile()`、`tauriNativeFileRead()`，修改 `fileRead()` 逻辑
- **依赖**：确认 `@tauri-apps/plugin-fs` 已在 package.json 中
- **预估**：1h

### Task 3：客户端 fileWrite 同步扩展

- **文件**：`apps/app/src/app/xingjing/services/opencode-client.ts`
- **变更**：新增 `tauriNativeFileWrite()`，fileWrite 增加智能路由 + Level 3 Tauri 兜底
- **预估**：0.5h

### Task 4：日志增强 + Level 3 错误可观测性

- **文件**：`apps/app/src/app/xingjing/services/opencode-client.ts`
- **变更**：Level 3 的 catch 块增加 warn 日志；非 Markdown 跳过 Level 1 时增加 debug 日志
- **预估**：0.25h

### Task 5：构建验证 + 手动回归

- **命令**：`cd harnesswork && pnpm turbo build`
- **验证**：控制台无 dir-graph.yaml 读取失败日志
- **预估**：0.5h

---

*变更历史*

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-04-17 | 初稿：基于 bug 根因分析生成方案 C 设计 | architect-agent |
