---
meta:
  id: SDD-013
  title: AI 对话 Git 认证注入——bash push Token 自动携带 + GitHub MCP 本地化
  status: approved
  author: architect-agent
  reviewers: [tech-lead]
  revision: "1.0"
  created: "2026-04-18"
  updated: "2026-04-18"
sections:
  background: "驾驶舱 AI 对话中用户要求提交代码时，bash 工具无 Token 导致私有仓库推送失败；GitHub MCP 仅支持 OAuth 无法复用已有 PAT"
  goals: "用户一次配置 PAT 后，bash git push 和 GitHub MCP 工具双路自动认证"
  architecture: "两函数扩展：buildGitSystemContext 在 system prompt 注入认证 URL；syncGitTokensToMcpConfig 在 Token 保存时将 PAT 写入 opencode.jsonc 切换为本地 MCP server"
  interfaces: "export buildGitSystemContext(gitUrl?)、export syncGitTokensToMcpConfig(readConfig, writeConfig)"
  nfr: "无感知：无 Token 时 system prompt 与原来完全一致；同步为 fire-and-forget 不阻塞 UI"
  test_strategy: "手动验证：配置 PAT → 驾驶舱请求提交 → 观察 bash git push 命令含 Token；检查 opencode.jsonc mcp.github 字段切换为 local"
---

# SDD-013 AI 对话 Git 认证注入

## 元信息
- 编号：SDD-013
- 状态：approved
- 作者：architect-agent
- 评审人：tech-lead
- 修订版本：1.0
- 创建日期：2026-04-18
- 更新日期：2026-04-18

---

## 1. 背景与问题域

### 1.1 执行路径回顾

星静独立版驾驶舱的 AI 对话执行路径为：

```
用户输入消息
  → handleChatSend()  [solo/autopilot/index.tsx]
  → app-store.callAgent()  [autoApproveTools 包装]
  → opencode-client.callAgent()
  → runAgentSession() → OpenCode 会话创建
  → SSE permission.asked → bash 工具自动授权
  → OpenCode bash 工具执行 git 命令
```

### 1.2 两个未解决问题

**问题 1 — bash 工具无 Token**

AI 通过 bash 工具执行 `git push origin main` 时，没有任何凭证注入机制，私有仓库推送失败。Token 存储在 `localStorage['xingjing:git-tokens']`，但从未在 AI 会话路径中使用。

**问题 2 — GitHub MCP 仅支持 OAuth**

`opencode.jsonc` 中的 GitHub MCP 配置为：

```json
{
  "mcp": {
    "github": { "type": "remote", "url": "https://api.githubcopilot.com/mcp/" }
  }
}
```

该 remote MCP 端点要求 GitHub Copilot OAuth，与用户在「平台 Token 管理」中配置的 Personal Access Token (PAT) 不兼容，导致 GitHub MCP 工具（PR 创建、Issues 查询等）无法正常使用。

### 1.3 现有基础

- `readGitTokensFromStorage()` 已在 `opencode-client.ts` 中定义（本地 localStorage 读取，无循环依赖）
- `product.gitUrl` 存储在产品对象中（`XingjingProduct.gitUrl`）
- `actions.readOpencodeConfig()` / `actions.writeOpencodeConfig()` 已在 app-store 中封装

---

## 2. 设计目标与约束

### 2.1 目标

| 编号 | 目标 |
|------|------|
| G1 | 用户在「平台 Token 管理」配置 PAT 一次后，驾驶舱 AI 对话中执行的 bash git push 自动携带认证 |
| G2 | 同一个 PAT 同时授权 GitHub MCP 工具，无需额外 OAuth 流程 |
| G3 | 无 Token 时行为与修改前完全一致（零回归风险） |

### 2.2 约束

- **不修改 autoApproveTools 逻辑**：认证信息通过 system prompt 传递，不改变权限模型
- **不引入循环依赖**：`opencode-client.ts` 已被 `product-store.ts` 导入，不能反向导入
- **不阻塞 UI**：MCP 配置同步为 `void`（fire-and-forget）

---

## 3. 架构设计

### 3.1 方案选型

| 方案 | 描述 | 选择 |
|------|------|------|
| A. system prompt 注入 | 将带 Token 的认证 URL 写入 system prompt，AI 执行 bash 时引用 | ✅ 选用（bash push 路径） |
| B. git credential store | 写入 `~/.git-credentials`，git 全局生效 | ❌ 修改全局 git 配置，影响用户环境 |
| C. SSH 密钥 | 一次性配置 SSH key | ❌ 配置复杂，超出当前范围 |
| D. 本地 MCP server + GITHUB_TOKEN env | 切换为 `@github/github-mcp-server`，PAT 注入环境变量 | ✅ 选用（GitHub MCP 路径） |

### 3.2 整体架构

```
Token 存储（localStorage）
      │
      ├─── bash 认证路径 ──────────────────────────────────────
      │    buildGitSystemContext(product.gitUrl)
      │    ↓ 构建 "https://TOKEN@github.com/user/repo.git"
      │    ↓ 注入 handleChatSend() systemPrompt
      │    ↓ AI 在 bash 工具中使用该 URL 执行 git push
      │
      └─── MCP 认证路径 ───────────────────────────────────────
           syncGitTokensToMcpConfig(readConfig, writeConfig)
           ↓ 在 Token 保存时触发（handleAddToken / handleUpdateToken）
           ↓ 读取 opencode.jsonc → 修改 mcp.github/mcp.gitlab
           ↓ 写回 opencode.jsonc
           ↓ OpenCode 重载后 GitHub MCP 工具生效（PAT 认证）
```

### 3.3 数据流详图

#### 3.3.1 bash push 路径

```
handleChatSend()
  │
  ├── productStore.activeProduct()?.gitUrl  →  "https://github.com/user/repo.git"
  │
  ├── buildGitSystemContext(gitUrl)
  │     ├── gitUrl 规范化（SSH → HTTPS）
  │     ├── 提取 hostname → 查 localStorage token
  │     ├── token 为空 → 返回 ''  （不影响 systemPrompt）
  │     └── token 存在 → 返回 "## Git 操作认证信息\n- 推送命令: git push 'https://TOKEN@...'"
  │
  └── callAgent({ systemPrompt: "...角色设定..." + gitContext })
        → AI 收到认证信息 → bash 工具执行 git push 携带 Token URL
```

#### 3.3.2 MCP 配置同步路径

```
handleAddToken() / handleUpdateToken()  [settings/index.tsx]
  │
  ├── setGitToken(host, token)  →  写入 localStorage
  │
  └── syncGitTokensToMcpConfig(readConfig, writeConfig)
        ├── readGitTokensFromStorage() → { 'github.com': 'ghp_xxx', ... }
        ├── readConfig() → 读取当前 opencode.jsonc
        ├── 构造 mcp.github: { type:'local', command:['npx','-y','@github/github-mcp-server'], env:{ GITHUB_TOKEN } }
        ├── 构造 mcp.gitlab: { type:'local', command:['npx','-y','@gitlab-org/gitlab-mcp-server'], env:{ GITLAB_TOKEN } }
        │     （无 token 时恢复 remote 配置）
        └── writeConfig(JSON.stringify(updated))  →  写回 opencode.jsonc
```

---

## 4. 接口概述

### 4.1 `buildGitSystemContext`

```typescript
// 位置：harnesswork/apps/app/src/app/xingjing/services/opencode-client.ts
export function buildGitSystemContext(gitUrl?: string): string
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `gitUrl` | `string \| undefined` | 产品的 git 仓库地址，支持 HTTPS 和 SSH 格式 |

**返回值**：
- 有 Token：多行字符串，含产品仓库地址和带 Token 的 push 命令示例
- 无 Token 或解析失败：空字符串 `''`

**调用位置**：`handleChatSend()` 拼接到 `systemPrompt` 末尾（不阻塞，无异步开销）

### 4.2 `syncGitTokensToMcpConfig`

```typescript
// 位置：harnesswork/apps/app/src/app/xingjing/services/opencode-client.ts
export async function syncGitTokensToMcpConfig(
  readConfig: () => Promise<unknown>,
  writeConfig: (content: string) => Promise<boolean>,
): Promise<void>
```

| 参数 | 说明 |
|------|------|
| `readConfig` | 读取 opencode.jsonc 的回调（由 app-store 注入，避免循环依赖） |
| `writeConfig` | 写回 opencode.jsonc 的回调 |

**行为**：
- `github.com` token 存在 → `mcp.github` 切换为本地 `@github/github-mcp-server`
- `gitlab.com` token 存在 → `mcp.gitlab` 切换为本地 `@gitlab-org/gitlab-mcp-server`
- token 为空 → 恢复 `remote` 配置（OAuth 流程由 OpenCode 处理）

**调用位置**：`handleAddToken()` 和 `handleUpdateToken()` 末尾，以 `void` 调用（不等待结果）

---

## 5. 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `apps/app/src/app/xingjing/services/opencode-client.ts` | 新增函数 | 新增 `buildGitSystemContext`、`syncGitTokensToMcpConfig` 并 export |
| `apps/app/src/app/xingjing/pages/solo/autopilot/index.tsx` | 修改 | import `buildGitSystemContext`，`handleChatSend` systemPrompt 末尾拼接 git 上下文 |
| `apps/app/src/app/xingjing/pages/settings/index.tsx` | 修改 | import `syncGitTokensToMcpConfig`，`GitTab` 解构 `actions`，`handleAddToken`/`handleUpdateToken` 末尾触发同步 |

---

## 6. 非功能性需求

| 指标 | 目标 | 说明 |
|------|------|------|
| 零回归 | 无 Token 时 system prompt 与修改前完全一致 | `buildGitSystemContext` 返回空字符串时无任何副作用 |
| 安全：Token 可见性 | Token 仅存在于 system prompt 和 opencode.jsonc（均为已有存储层） | 不出现在用户可见 UI 气泡中 |
| 安全：MCP Token 存储 | opencode.jsonc 明文存储，与 API Key 存储方式相同 | 已有先例，可接受 |
| 性能：MCP 同步 | fire-and-forget，不阻塞 Token 保存 UI 响应 | `void` 调用 |
| 运行时依赖：npx | `@github/github-mcp-server` 首次调用自动下载缓存 | 需 Node/npm 环境（项目已有） |

---

## 7. 待决事项与风险

| 编号 | 问题/风险 | 说明 |
|------|----------|------|
| Q1 | GitLab MCP server 包名待验证 | `@gitlab-org/gitlab-mcp-server` 为预期包名，若不存在需替换为社区实现 |
| Q2 | 分支动态化 | 当前 push 命令示例固定为 `main`，可从 `settings.git.defaultBranch` 读取 |
| R1 | Token 在 system prompt 中的泄露风险 | OpenCode 服务端会收到 system prompt；风险与设置页 Git 同步按钮相同，可接受 |
| R2 | opencode.jsonc 不存在时的降级 | `readConfig` 返回 `null` 时 `existing` 为 `{}`，写入后结构正确 |

---

## 8. 修订历史

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| 1.0 | 2026-04-18 | 初始版本——基于已完成实现逆向沉淀 |
