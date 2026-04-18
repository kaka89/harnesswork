---
meta:
  id: SDD-011
  title: 全局配置路径误入 OpenWork API——路径路由守卫增强
  status: proposed
  author: architect-agent
  reviewers: [tech-lead]
  source_spec: SDD-008
  revision: "1.0"
  created: "2026-04-18"
  updated: "2026-04-18"
sections:
  background: "opencode-client.ts 的 fileRead/fileWrite Level 1 路径路由判断缺少对 ~ 和 / 开头全局路径的排除，导致 ~/.xingjing/ 下的三个全局配置文件被当作 workspace 相对路径写入 OpenWork API，在产品工作目录下产生字面量 ~/​ 子目录和脏文件"
  goals: "在 Level 1 OpenWork API 路由守卫中增加全局路径排除判断，确保以 ~ 或 / 开头的绝对路径永远不经由 OpenWork workspace API 读写，而直接降级到后续通道"
  architecture: "单文件变更：opencode-client.ts 的 owApiAvailable / owWriteAvailable 条件表达式增加 isWorkspaceRelativePath(path) 守卫"
  interfaces: "无 API 签名变更，纯内部路由逻辑修正"
  nfr: "全局配置读写路径零脏文件泄露；workspace 内相对路径文件的 OpenWork API 通道行为零回归"
---

# SDD-011 全局配置路径误入 OpenWork API——路径路由守卫增强

## 元信息

- 编号：SDD-011-global-path-routing-fix
- 状态：proposed
- 作者：architect-agent
- 评审人：tech-lead
- 关联文档：SDD-008（降级链架构基础）
- 修订版本：1.0
- 创建日期：2026-04-18

---

## 1. 背景与问题域

### 1.1 Bug 现象

用户在产品 workspace 目录下发现了不应存在的脏文件/目录：

```
{workspace}/
  └─ ~/                          ← 字面量 "~" 目录（不是符号链接）
     └─ .xingjing/
        ├─ preferences.yaml
        ├─ products.yaml
        └─ global-settings.yaml
```

这三个文件本应位于用户主目录 `~/.xingjing/` 下，却被错误地写入了 workspace 根目录。

### 1.2 根因追溯

三个全局配置文件的路径常量定义：

| 常量 | 值 | 定义位置 |
|------|------|---------|
| `PRODUCTS_FILE` | `~/.xingjing/products.yaml` | `product-store.ts` L105 |
| `PREFERENCES_FILE` | `~/.xingjing/preferences.yaml` | `product-store.ts` L106 |
| `GLOBAL_SETTINGS_FILE` | `~/.xingjing/global-settings.yaml` | `file-store.ts` L343 |

当 OpenWork 上下文注入完成（`_owFileOps` 和 `_workspaceId` 均已设置）后，`fileWrite` 的 Level 1 路由判断：

```typescript
// opencode-client.ts L384-385 — 当前代码
const owWriteAvailable = _owFileOps && _workspaceId && isServerSupportedFile(path)
    && (!directory || !_directory || directory === _directory);
```

**缺陷**：此条件仅检查了：
1. OpenWork 文件操作已注入 ✓
2. 文件类型受支持（`.yaml` 在 SDD-008 扩展后已支持）✓
3. directory 与当前 workspace 匹配 ✓

**缺少**：路径是否为 workspace 相对路径的判断。以 `~` 或 `/` 开头的路径是**全局/绝对路径**，不属于任何 workspace。

### 1.3 完整触发链路

```
saveProducts(products)
  └─ writeYaml('~/.xingjing/products.yaml', data)
     └─ fileWrite('~/.xingjing/products.yaml', content)
        │
        ├─ owWriteAvailable 判断：
        │    _owFileOps ✓ && _workspaceId ✓
        │    && isServerSupportedFile('.yaml') ✓
        │    && (!directory=undefined ✓)
        │    → true（错误！应为 false）
        │
        └─ _owFileOps.write(wsId, {
             path: toWorkspaceRelativePath('~/.xingjing/products.yaml')
             // ↑ 不以 _directory+'/' 开头 → 原样返回 '~/.xingjing/products.yaml'
           })
           │
           └─ OpenWork Server 将 path 解释为 workspace 相对路径
              → 写入 {workspace_root}/~/.xingjing/products.yaml
              → 创建字面量 '~' 目录 ✗
```

`fileRead` 的 Level 1 存在**完全相同**的缺陷（L316-317），但 read 操作不会创建脏文件，只是读取失败后静默降级。

### 1.4 为什么 SDD-008 未覆盖此问题

SDD-008 关注的是**文件类型**路由（`.yaml`/`.json` vs `.md`），引入了 `isServerSupportedFile()` 守卫。路径扩展后 `.yaml` 被纳入支持列表，反而让原本因"文件类型不支持"而意外跳过 Level 1 的全局路径，现在能够进入 Level 1 了——**SDD-008 的文件类型扩展无意中暴露了这个路径路由缺陷**。

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 需求 | 优先级 |
|------|------|--------|
| FR-01 | `fileRead` Level 1 排除以 `~` 或 `/` 开头的非 workspace 路径 | P0 |
| FR-02 | `fileWrite` Level 1 排除以 `~` 或 `/` 开头的非 workspace 路径 | P0 |
| FR-03 | 排除逻辑抽取为独立守卫函数，职责清晰 | P1 |
| FR-04 | 增强日志输出，区分"路径非 workspace 相对"和其他跳过原因 | P1 |

### 2.2 约束

| 类型 | 约束 |
|------|------|
| 变更范围 | 仅修改 `opencode-client.ts`，不改变 API 签名 |
| 向后兼容 | workspace 相对路径的读写行为零变更 |
| 版本隔离 | 仅改动独立版代码路径 |
| 性能 | 纯字符串前缀检查，零性能影响 |

### 2.3 不在范围内

- 重构整个降级链架构
- 修改 OpenWork Server API 的路径解析逻辑
- 处理 Windows 盘符路径（`C:\`）——Tauri 目前仅支持 macOS/Linux

---

## 3. 系统架构

### 3.1 变更前：路径路由盲区

```
fileRead / fileWrite(path, directory)
  │
  ├─ isServerSupportedFile(path) ── 文件类型守卫 ✓ (SDD-008)
  ├─ directory 匹配守卫          ── workspace 归属守卫 ✓
  ├─ ❌ 缺少：路径是否为 workspace 相对路径的守卫
  │
  └─ 全局路径 '~/.xingjing/...' 通过所有守卫 → 错误进入 OpenWork API
```

### 3.2 变更后：三重守卫完备

```
fileRead / fileWrite(path, directory)
  │
  ├─ isServerSupportedFile(path) ── 文件类型守卫 ✓ (SDD-008)
  ├─ directory 匹配守卫          ── workspace 归属守卫 ✓
  ├─ isWorkspaceRelativePath(path) ── 路径归属守卫 ✓ (SDD-011 新增)
  │    ├─ ~  开头 → false（用户主目录路径）
  │    ├─ /  开头 → false（绝对路径）
  │    └─ 其他   → true（workspace 相对路径）
  │
  └─ 全局路径被正确排除 → 直接降级到 Level 2/3/4
```

### 3.3 变更点总览

| 变更点 | 文件 | 类型 | 描述 |
|--------|------|------|------|
| A | `opencode-client.ts` | 新增函数 | `isWorkspaceRelativePath(path)` 守卫函数 |
| B | `opencode-client.ts` L316 | 修改条件 | `fileRead` 的 `owApiAvailable` 增加守卫 |
| C | `opencode-client.ts` L384 | 修改条件 | `fileWrite` 的 `owWriteAvailable` 增加守卫 |
| D | `opencode-client.ts` L328-329 | 增强日志 | 区分跳过原因：路径非 workspace / 文件类型不支持 / workspace 不匹配 |

---

## 4. 详细设计

### 4.1 变更 A：新增 `isWorkspaceRelativePath` 守卫函数

**位置**：`opencode-client.ts`，紧接 `isServerSupportedFile` 之后

```typescript
/**
 * 判断路径是否为 workspace 相对路径。
 * 以 ~ 开头（用户主目录）或 / 开头（绝对路径）的路径不属于任何 workspace，
 * 不应通过 OpenWork workspace API 读写。
 * SDD-011 新增。
 */
function isWorkspaceRelativePath(path: string): boolean {
  return !path.startsWith('~') && !path.startsWith('/');
}
```

**设计决策**：
- 使用**排除法**而非枚举法——只排除已知的非 workspace 前缀，其他一律视为相对路径
- 不检查 Windows 盘符（`C:\`），因当前产品仅支持 macOS/Linux（AGENTS.md 约束）
- 函数命名采用肯定式（`isWorkspaceRelativePath`）而非否定式（`isAbsolutePath`），与调用处 `&&` 连接更自然可读

### 4.2 变更 B：`fileRead` 路由守卫增强

**现状**（L316-317）：
```typescript
const owApiAvailable = _owFileOps && _workspaceId && isServerSupportedFile(path)
    && (!directory || !_directory || directory === _directory);
```

**变更为**：
```typescript
const owApiAvailable = _owFileOps && _workspaceId
    && isWorkspaceRelativePath(path)
    && isServerSupportedFile(path)
    && (!directory || !_directory || directory === _directory);
```

**语义**：先判断路径归属（廉价的字符串前缀检查），再判断文件类型（Set 查找），最后判断 workspace 匹配。

### 4.3 变更 C：`fileWrite` 路由守卫增强

**现状**（L384-385）：
```typescript
const owWriteAvailable = _owFileOps && _workspaceId && isServerSupportedFile(path)
    && (!directory || !_directory || directory === _directory);
```

**变更为**：
```typescript
const owWriteAvailable = _owFileOps && _workspaceId
    && isWorkspaceRelativePath(path)
    && isServerSupportedFile(path)
    && (!directory || !_directory || directory === _directory);
```

### 4.4 变更 D：日志增强

**现状**（L328-329）：
```typescript
} else if (_owFileOps && _workspaceId && !owApiAvailable) {
    console.debug('[xingjing] fileRead 跳过 OpenWork API（文件类型不支持或 workspace 不匹配）, path:', path);
}
```

**变更为**：
```typescript
} else if (_owFileOps && _workspaceId && !owApiAvailable) {
    const reason = !isWorkspaceRelativePath(path) ? '全局/绝对路径'
      : !isServerSupportedFile(path) ? '文件类型不支持'
      : 'workspace 不匹配';
    console.debug(`[xingjing] fileRead 跳过 OpenWork API（${reason}）, path:`, path);
}
```

---

## 5. 关键设计决策

### ADR-1：守卫放在条件表达式 vs. 函数入口 early-return

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 条件表达式（选中）** | 最小变更，与现有 SDD-008 风格一致 | 条件链较长 |
| B. 函数入口 early-return | 逻辑独立清晰 | 改变了函数控制流，影响面更大 |

**决策**：选择 A。变更仅在两行条件表达式中插入一个新守卫项，风格与 SDD-008 引入的 `isServerSupportedFile` 完全一致，Review 成本最低。

### ADR-2：守卫函数是否需要考虑 `directory` 参数中的全局路径

当前三个全局配置文件调用 `fileRead`/`fileWrite` 时，`directory` 参数均为 `undefined`（不传），因此只需守卫 `path` 参数即可。若未来出现 `directory` 为 `~` 的场景，现有的 `directory === _directory` 守卫已经能正确排除（`~/.xingjing` ≠ 当前 workspace 路径）。

**决策**：守卫仅检查 `path` 参数，无需额外检查 `directory`。

---

## 6. 测试策略

### 6.1 手动验证步骤

1. **复现确认**：在修复前，切换产品并保存设置，检查 workspace 目录下是否出现 `~/` 字面量目录
2. **修复验证**：应用变更后，重复上述操作，确认 workspace 目录下无脏文件
3. **正确性验证**：确认 `~/.xingjing/` 下的三个文件内容正确更新
4. **回归验证**：workspace 内的相对路径文件（如 `.xingjing/dir-graph.yaml`）仍能通过 OpenWork API 正常读写

### 6.2 自动化验证点

| 场景 | 输入 | 期望 |
|------|------|------|
| 全局路径写入 | `fileWrite('~/.xingjing/products.yaml', ...)` | 跳过 Level 1，降级到 Level 2+ |
| 绝对路径写入 | `fileWrite('/tmp/test.yaml', ...)` | 跳过 Level 1，降级到 Level 2+ |
| workspace 相对路径写入 | `fileWrite('.xingjing/dir-graph.yaml', ...)` | 正常走 Level 1 OpenWork API |
| 全局路径读取 | `fileRead('~/.xingjing/global-settings.yaml')` | 跳过 Level 1，降级到 Level 2+ |
| 日志输出 | 全局路径跳过时 | 日志显示"全局/绝对路径"原因 |

---

## 7. 实施计划

| 任务 | 描述 | 预估 | 依赖 |
|------|------|------|------|
| T1 | 新增 `isWorkspaceRelativePath` 函数 | 5min | 无 |
| T2 | 修改 `fileRead` 的 `owApiAvailable` 条件 | 5min | T1 |
| T3 | 修改 `fileWrite` 的 `owWriteAvailable` 条件 | 5min | T1 |
| T4 | 增强跳过原因日志 | 5min | T1 |
| T5 | 手动验证 + 清理 workspace 残留脏文件 | 10min | T2, T3 |

**总预估**：30 分钟

---

## 8. 修订历史

| 版本 | 日期 | 变更摘要 |
|------|------|---------|
| 1.0 | 2026-04-18 | 初始版本——识别 Level 1 路径路由守卫缺陷，提出 `isWorkspaceRelativePath` 守卫方案 |
