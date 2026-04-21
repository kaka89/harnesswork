---
feature: solo-product-insights
title: 独立版·产品洞察 — 数据加载架构设计
status: implemented
created-at: 2026-04-21
updated-at: 2026-04-21
upstream: [PRD]
---

# 独立版·产品洞察 — 系统设计文档

## 架构概述

产品洞察页面的数据加载采用 **三层分离架构**：

```
┌─────────────────────────────────────────────────────┐
│  UI 层: product/index.tsx                           │
│  loadAllData() → 10 路 Promise.all → set*() 响应式  │
├─────────────────────────────────────────────────────┤
│  服务层: file-store.ts + insight-store.ts           │
│  load*() → readYaml / readMarkdownDir / fileList    │
├─────────────────────────────────────────────────────┤
│  I/O 层: opencode-client.ts                         │
│  fileRead / fileList → 4 级通道自适应降级            │
└─────────────────────────────────────────────────────┘
```

## 核心组件

| 组件 | 文件路径 | 职责 |
|------|---------|------|
| 产品洞察页面 | `pages/solo/product/index.tsx` | UI + loadAllData 编排 |
| 文件服务层 | `services/file-store.ts` | 9 个 load 函数 + 通用读写封装 |
| 洞察服务层 | `services/insight-store.ts` | InsightRecord CRUD |
| OpenCode 客户端 | `services/opencode-client.ts` | 文件 I/O 多通道路由 |

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 路径格式 | **相对路径 + workDir 参数** | 绝对路径在 Level 0-2 通道中无法正确解析（详见「路径规范」章节） |
| D2 | 通道偏好管理 | 刷新时**不重置**通道偏好 | 重置导致 10 路并发同时从 Level 0 探测，若 Level 0 不可用则全部静默返回空数据 |
| D3 | 竞态策略 | 递增版本号守卫 | 简单高效，无需 AbortController，兼容所有通道 |
| D4 | 洞察存储路径 | `knowledge/insights/` | 遵循 `dir-graph.yaml` 中 Knowledge 文档类型定义，禁止使用 `.xingjing/product/insights/` 私有路径 |
| D5 | 洞察格式兼容 | 双格式解析器 | 需同时支持 Knowledge 标准格式（K-*.md）和 InsightRecord 旧格式 |
| D6 | PRD/SDD 标识符 | `feat` 字段优先 | 项目 PRD/SDD 使用 `feat` 而非 `id` 作为标识符，部分文件无 frontmatter，需兜底到目录名 |

## 路径规范（CRITICAL）

### 正确模式：相对路径 + directory

```typescript
// ✅ 正确：相对路径 + workDir 作为 directory 参数
const data = await readYaml('product/features/_index.yml', fallback, workDir);
const nodes = await fileList('product/features', workDir);
const docs = await readMarkdownDir('iterations/hypotheses', workDir);
```

### 错误模式：绝对路径无 directory

```typescript
// ❌ 错误：绝对路径，不传 directory
const data = await readYaml(`${workDir}/product/features/_index.yml`, fallback);
const nodes = await fileList(`${workDir}/product/features`);
```

### 根因分析

OpenCode 客户端 `fileRead` / `fileList` 对路径的处理逻辑（4 级通道）：

```
Level 0 (OpenWork API):
  └─ isWorkspaceRelativePath(path) → 绝对路径返回 false → 跳过

Level 1 (SDK):
  └─ directory = path.startsWith('/') ? undefined : _directory
  └─ 绝对路径时 directory = undefined → SDK 无法定位 workspace

Level 2 (tauriFetch):
  └─ dir = path.startsWith('/') ? '' : _directory
  └─ 绝对路径时 dir = '' → 不发送 directory 参数

Level 3 (Tauri native):
  └─ 可处理绝对路径，但全局 _preferredReadLevel 可能不在此级别
```

**结论**：当 `_preferredReadLevel` 锁定在 Level 0-2 时，绝对路径请求全部失败，静默返回 null/空数组。使用相对路径 + 显式 directory 参数可在所有通道正确解析。

## 数据加载流水线

### loadAllData() 执行流程

```
用户触发(手动刷新/自动加载/错误重试)
  │
  ├─ 获取 workDir = productStore.activeProduct()?.workDir
  ├─ 递增 loadVersion (竞态守卫)
  ├─ setPageLoading(true), setLoadError(null)
  │
  ├─ Promise.all([
  │    loadHypotheses(workDir),           // → readYaml + readMarkdownDir
  │    loadRequirementOutputs(workDir),   // → readYamlDir
  │    loadUserFeedbacks(workDir),        // → readMarkdownDir
  │    loadProductFeatures(workDir),      // → readYaml
  │    loadProductOverview(workDir),      // → readFile
  │    loadProductRoadmap(workDir),       // → readFile
  │    loadSoloMetrics(workDir),          // → readYaml
  │    loadInsightRecords(workDir),       // → readMarkdownDir (knowledge/insights)
  │    loadPrds(workDir),                 // → fileList + readMarkdownWithFrontmatter
  │    loadSdds(workDir),                 // → fileList + readMarkdownWithFrontmatter
  │  ])
  │
  ├─ 竞态检查: currentVersion !== loadVersion → 丢弃
  ├─ 成功: set*() 更新 10+ SolidJS 信号
  ├─ 失败: setLoadError('数据加载失败...')
  └─ finally: setPageLoading(false)
```

### 各 load 函数调用链

#### loadProductFeatures (YAML 索引型)

```
loadProductFeatures(workDir)
  └─ readYaml('product/features/_index.yml', { features: [] }, workDir)
       └─ fileRead('product/features/_index.yml', workDir)
            └─ 4级通道路由 → 返回 YAML 文本
       └─ parseYamlSimple(content) → { features: [...] }
  └─ 映射: id/name/title/status/hypothesis/since/brief/description/path
  └─ 过滤: !!f.id || !!f.name
```

#### loadHypotheses (索引 + 文件双源合并型)

```
loadHypotheses(workDir)
  ├─ readYaml('iterations/hypotheses/_index.yml', ..., workDir)
  │    └─ → indexMap: Map<id, HypothesisIndexItem>
  ├─ readMarkdownDir('iterations/hypotheses', workDir)
  │    └─ fileList('iterations/hypotheses', workDir) → 筛选 .md
  │    └─ 逐个 readMarkdownWithFrontmatter(n.path, ..., workDir)
  │    └─ → mdMap: Map<id, SoloHypothesis>
  └─ 合并:
       ├─ md 文件优先, 补充 indexMap 中的 feature 字段
       └─ 仅在 index 中的条目 → 创建占位记录
```

#### loadInsightRecords (Knowledge 格式扫描型)

```
loadInsightRecords(workDir)
  └─ readMarkdownDir('knowledge/insights', workDir)
       └─ fileList → 筛选 .md
       └─ 逐个解析 frontmatter + body
  └─ parseKnowledgeToInsight(fm, body)
       ├─ id: fm.id
       ├─ query: fm.query ?? fm.title
       ├─ category: fm.insightCategory ?? categoryMap[fm.category]
       ├─ summary: body 中 ## 摘要 或 ## 洞察 段
       ├─ sources: body 中 ## 来源 或 ## 外部来源 段
       └─ suggestions: body 中 ## 产品建议 或 ## 建议方案 段
  └─ 过滤: !!r.id
```

#### loadPrds / loadSdds (目录遍历型)

```
loadPrds(workDir)
  └─ fileList('product/features', workDir) → 筛选 type=directory
  └─ 逐目录:
       └─ readMarkdownWithFrontmatter(`product/features/${dir}/PRD.md`, ..., workDir)
       └─ id: fm.id ?? fm.feat ?? dir.name
       └─ title: fm.title ?? extractFirstHeading(body) ?? dir.name
       └─ 附加 _featureSlug = dir.name, _body = doc.body
```

## 文件服务层 API

### 通用读写封装 (file-store.ts)

| 函数 | 签名 | 说明 |
|------|------|------|
| `readYaml<T>` | `(path, fallback, directory?) → T` | 读取 YAML 文件并解析 |
| `readFile` | `(path, directory?) → string \| null` | 读取原始文本 |
| `readDir` | `(dir, directory?) → FileNode[]` | 列出目录 |
| `readMarkdownDir<T>` | `(dir, directory?) → FrontmatterDoc<T>[]` | 扫描目录下所有 .md |
| `readMarkdownWithFrontmatter<T>` | `(path, fallback, directory?) → FrontmatterDoc<T>` | 读取单个 Markdown |
| `readYamlDir<T>` | `(dir, directory?) → T[]` | 扫描目录下所有 .yaml/.yml |
| `writeMarkdownWithFrontmatter<T>` | `(path, doc, directory?) → boolean` | 写入 Markdown |
| `deleteFile` | `(path, directory?) → boolean` | 删除文件 |

**关键规范**：所有函数的 `directory` 参数用于传递 `workDir`，`path` 参数必须为 workspace 相对路径。

### 洞察存储 API (insight-store.ts)

| 函数 | 说明 |
|------|------|
| `loadInsightRecords(workDir)` | 从 `knowledge/insights/` 扫描加载 |
| `saveInsightRecord(workDir, record)` | 序列化为 Knowledge 兼容 frontmatter 后写入 |
| `deleteInsightRecord(workDir, id)` | 删除 `knowledge/insights/{id}.md` |

保存时 frontmatter 格式：
```yaml
id: "K-003-evening-active"
category: "user-insight"         # Knowledge 标准 category
title: "晚间活跃用户洞察"         # 映射自 record.query
tags: ["来源1标题", "来源2标题"]
createdAt: "2026-04-18"
insightCategory: "user"          # 保留 InsightRecord 原始分类
linkedHypotheses: ["H-001"]
```

## 4 级文件通道系统

```
Level 0: OpenWork Server API (workspace 匹配 + 文件类型支持时可用)
  ↓ 失败/不可用
Level 1: OpenCode SDK (client.file.read / client.file.list)
  ↓ 失败/超时
Level 2: tauriFetch 直连 OpenCode HTTP API (绕过 CORS)
  ↓ 失败/超时
Level 3: Tauri 原生文件系统 (终极兜底)
```

通道特性：
- 全局偏好 `_preferredReadLevel` / `_preferredListLevel` 记录探测到的最优通道
- 通道降级仅在 **超时/网络错误** 时触发，正常的 404/空响应不触发降级
- 每通道 2 秒超时 (`withFileTimeout`)
- `~` 开头路径直达 Level 3（Tauri 不支持通过 OpenCode 展开 `~`）
- **刷新时不重置通道偏好**（D2 决策）

## 测试覆盖

| 场景 | 验证方法 | 结果 |
|------|---------|------|
| solo007 workspace 全量加载 | 手动测试 | 13 features + 12+ hypotheses + 2 insights |
| 目录不存在（requirements） | 自动降级 | 返回空数组，无报错 |
| 文件格式兼容（Knowledge 双格式） | 解析验证 | K-003/K-004 正确解析 |
| TypeScript 类型检查 | `pnpm --filter app typecheck` | 零错误 |
| 路径规范一致性 | 代码审查 | 10 个 load 函数全部使用相对路径 + workDir |

## 已知问题与修复记录

### BUG-001: 绝对路径导致数据为空

- **症状**: 产品模块、产品假设等数据为空，仅外部洞察能加载
- **根因**: 9 个 load 函数使用 `${workDir}/relative/path` 绝对路径且不传 `directory` 参数，Level 0-2 通道无法正确解析
- **修复**: 统一改为 `'relative/path'` + `workDir` 作为 `directory` 参数
- **影响范围**: loadPrds, loadSdds, loadHypotheses, loadProductFeatures, loadProductOverview, loadProductRoadmap, loadSoloMetrics, loadRequirementOutputs, loadUserFeedbacks

### BUG-002: 洞察存储路径违规

- **症状**: 洞察数据从 `.xingjing/product/insights/` 读取，违反 dir-graph.yaml
- **根因**: insight-store.ts 硬编码私有路径
- **修复**: 路径改为 `knowledge/insights/`，CRUD 全部重写，兼容 Knowledge 标准格式
- **影响范围**: loadInsightRecords, saveInsightRecord, deleteInsightRecord

### BUG-003: 正则表达式换行转义

- **症状**: insight-store.ts 出现 "Unterminated regular expression literal" 语法错误
- **根因**: JSON 工具调用中 `\n` 被展开为真实换行，导致正则字面量跨行
- **修复**: 将 3 个正则从 `/pattern/` 改为 `new RegExp('pattern')` 构造器
