---
meta:
  id: MODULE-002
  title: 双模式工作区接口规格
  status: approved
  author: contracts-agent
  source_sdd: ["SDD-002"]
  openapi_file: openapi/cockpit-docs-v1.yaml
  contract_test_file: src/test/contract/pact/cockpit-docs-v1.test.ts
  revision: "1.0"
  created: "2026-04-08"
  updated: "2026-04-08"
---

# MODULE-002 双模式工作区接口规格

## 元信息

- 编号：MODULE-002
- 状态：approved
- 作者：contracts-agent
- 来源 SDD：[SDD-002]
- 修订版本：1.0
- 对应 OpenAPI：openapi/cockpit-docs-v1.yaml
- 契约测试文件：src/test/contract/pact/cockpit-docs-v1.test.ts
- 创建日期：2026-04-08
- 更新日期：2026-04-08

---

## 接口清单

### OpenWork Server 端点

| 接口     | 方法 | 路径            | 描述                                              |
|----------|------|-----------------|---------------------------------------------------|
| 文档目录 | GET  | /docs           | 列举工作区 docs/ 目录树，返回 `DocEntry[]`        |
| 文档内容 | GET  | /docs/{path}    | 读取指定路径的 Markdown 文件，返回原始文本        |

### 前端组件 Props 规格

| 组件              | Props 签名                                                          | 说明                                       |
|-------------------|---------------------------------------------------------------------|--------------------------------------------|
| `CockpitTabNav`   | `activeTab: TabId; onTabChange: (tab: TabId) => void`               | 无状态导航栏，状态由父组件 CockpitPage 持有 |
| `DocTreePanel`    | `onSelect: (path: string) => void`                                  | 文档节点选中回调，内部管理展开/折叠状态     |
| `DocViewerPanel`  | `path: string`                                                      | 接收文档路径，自行请求内容并渲染            |
| `EngineeringTab`  | `workspaceId?: string`                                              | 可选，透传给 SessionView 的工作区 ID        |

### 路由约定

| 路径           | 组件              | 注册位置                                       |
|----------------|-------------------|------------------------------------------------|
| `/mode-select` | `ModeSelectPage`  | `apps/app/src/index.tsx`，在 `*all` 之前注册   |
| `/cockpit`     | `CockpitPage`     | `apps/app/src/index.tsx`，在 `*all` 之前注册   |

### LocalStorage 键名约定

| 完整 Key                        | 值域                        | 读写 API                                                                              |
|---------------------------------|-----------------------------|---------------------------------------------------------------------------------------|
| `harnesswork:mode-preference`   | `"openwork"` \| `"cockpit"` | `platform.storage("harnesswork").getItem/setItem("mode-preference")`                  |

---

## 类型定义

```typescript
// apps/app/src/app/pages/cockpit.tsx
type TabId = "product" | "engineering" | "release" | "growth";

interface DocEntry {
  path:   string;  // docs/ 下相对路径，如 "product/prd/PRD-002.md"
  title:  string;  // frontmatter.title；无 frontmatter 时为文件名（含扩展名）
  type:   string;  // frontmatter.type 或路径推断；未知时为 "unknown"
  status: string;  // frontmatter.status；无 frontmatter 时为 "unknown"
}
```

---

## GET /docs

### 请求

无请求体。接口隐式使用 OpenWork Server 启动时绑定的工作区根目录，列举其 `docs/` 子目录。

### 请求头

| Header   | 必填 | 说明                       |
|----------|------|----------------------------|
| `Accept` | 否   | `application/json`（默认） |

### 成功响应 200

**Content-Type**: `application/json`

```json
[
  {
    "path": "product/prd/PRD-002.md",
    "title": "PRD-002 双模式工作区",
    "type": "prd",
    "status": "draft"
  },
  {
    "path": "product/architecture/SDD-002-dual-mode-workspace.md",
    "title": "双模式工作区——入口选择页 & 全链路工程驾驶舱",
    "type": "sdd",
    "status": "draft"
  }
]
```

**响应字段说明**

| 字段     | 类型   | 必填 | 说明                                                              |
|----------|--------|------|-------------------------------------------------------------------|
| `path`   | string | 是   | `docs/` 目录下的相对路径，使用 `/` 分隔符                         |
| `title`  | string | 是   | 文件 `frontmatter.title`；无 frontmatter 时为文件名（含扩展名）    |
| `type`   | string | 是   | 文件 `frontmatter.type` 或路径推断；无法推断时为 `"unknown"`       |
| `status` | string | 是   | 文件 `frontmatter.status`；无 frontmatter 时为 `"unknown"`        |

### 错误响应

| HTTP 状态码 | 错误码           | 触发条件                                        |
|-------------|------------------|-------------------------------------------------|
| 404         | `NOT_FOUND`      | `docs/` 目录不存在于当前工作区根路径下           |
| 500         | `INTERNAL_ERROR` | 文件系统读取失败（权限不足、IO 错误等）           |

### 行为规格（Behavior Spec）

- **MODULE-002-BH-01**（正常）：`docs/` 目录存在且含 `.md` 文件 → 返回 `200 OK`，响应体为非空 `DocEntry[]`，每项包含 `path`、`title`、`type`、`status` 四个字段
- **MODULE-002-BH-02**（正常）：`.md` 文件含有效 YAML frontmatter（包含 `title` 和 `status`）→ 响应条目的 `title` 和 `status` 与 frontmatter 值完全一致
- **MODULE-002-BH-03**（异常）：`docs/` 目录在工作区根路径下不存在 → 返回 `404 NOT_FOUND`
- **MODULE-002-BH-04**（异常）：读取文件系统时发生 IO 错误或权限不足 → 返回 `500 INTERNAL_ERROR`
- **MODULE-002-BH-05**（边界）：`docs/` 下存在深度超过 4 层的 `.md` 文件（如 `a/b/c/d/e.md`）→ 该文件**不**纳入响应（仅收录深度 ≤ 4 层）
- **MODULE-002-BH-06**（边界）：文件无 frontmatter 或 frontmatter 缺少 `title`/`status` → `title` 置为文件名（含扩展名），`status` 置为 `"unknown"`
- **MODULE-002-BH-07**（边界）：`docs/` 目录存在但无任何 `.md` 文件 → 返回 `200 OK`，响应体为空数组 `[]`

### 非功能约束

- 接口延迟：P99 < 1000ms（继承自 SDD-002 NFR — 文档树首次加载 < 1s）
- 幂等性：是（GET 只读，多次调用结果一致）
- 并发安全：只读操作，无状态修改，天然并发安全

---

## GET /docs/{path}

### 请求

无请求体。`path` 为 URL path parameter，值为 `docs/` 目录下的相对路径（需 URL 编码），支持 `/` 作为路径分隔符。

**路径参数**

| 参数   | 类型   | 必填 | 说明                                                                            |
|--------|--------|------|---------------------------------------------------------------------------------|
| `path` | string | 是   | `docs/` 下的相对文件路径，URL 编码，如 `product%2Fprd%2FPRD-002.md`            |

### 请求头

| Header   | 必填 | 说明                               |
|----------|------|------------------------------------|
| `Accept` | 否   | `text/markdown` 或 `*/*`           |

### 成功响应 200

**Content-Type**: `text/markdown; charset=utf-8`

响应 body 为目标文件的**原始 Markdown 文本**，不经任何转换或渲染。

```
---
meta:
  id: PRD-002-dual-mode-workspace
  title: 双模式工作区——入口选择页 & 全链路工程驾驶舱
  status: draft
---

# PRD-002 双模式工作区
...
```

### 错误响应

| HTTP 状态码 | 错误码           | 触发条件                                                                            |
|-------------|------------------|-------------------------------------------------------------------------------------|
| 403         | `FORBIDDEN`      | `path` 解析后 resolved path 超出 `docs/` 目录范围（含 `../` 路径穿越）              |
| 404         | `NOT_FOUND`      | 目标文件在 `docs/` 目录下不存在                                                      |
| 500         | `INTERNAL_ERROR` | 文件读取失败（权限不足、IO 错误等）                                                   |

### 行为规格（Behavior Spec）

- **MODULE-002-BH-08**（正常）：`path` 为合法相对路径且文件存在 → 返回 `200 OK`，`Content-Type: text/markdown; charset=utf-8`，body 为文件原始 Markdown 内容
- **MODULE-002-BH-09**（异常）：`path` 指向的文件在 `docs/` 下不存在 → 返回 `404 NOT_FOUND`
- **MODULE-002-BH-10**（异常）：`path` 含 `../` 序列或 URL 解码后 resolved path 超出 `docs/` 目录 → 返回 `403 FORBIDDEN`（路径穿越防护，server 端以 `docs/` 开头验证）
- **MODULE-002-BH-11**（异常）：文件存在但读取时发生 IO 错误或权限不足 → 返回 `500 INTERNAL_ERROR`
- **MODULE-002-BH-12**（边界）：`path` 为 URL 编码格式（如 `product%2Fprd%2FPRD-002.md`）→ server 端正确 URL 解码后读取，返回 `200 OK` 及文件内容

### 非功能约束

- 接口延迟：P99 < 200ms（继承自 SDD-002 NFR — `/docs/:path` 响应时间 < 200ms）
- 幂等性：是（GET 只读）
- 并发安全：只读操作，天然并发安全

---

## 前端组件 Props 规格

### CockpitTabNav

**职责**：无状态 Tab 导航栏，渲染四 Tab，高亮当前选中，支持键盘导航，切换时回调父组件。

```typescript
interface CockpitTabNavProps {
  activeTab:    TabId;                        // required — 当前激活的 Tab ID
  onTabChange:  (tab: TabId) => void;         // required — Tab 切换回调，父组件更新 Signal
}
```

**行为规格**

- **MODULE-002-BH-13**（正常）：`activeTab` 为有效 `TabId` → 对应 Tab 项渲染 active 样式，其余 Tab 渲染默认样式
- **MODULE-002-BH-14**（正常）：用户点击非当前 Tab → 调用 `onTabChange(newTabId)`，父组件更新 `activeTab` 信号后重新渲染
- **MODULE-002-BH-15**（边界）：键盘 Arrow/Tab 键导航 → 焦点在四个 Tab 间循环移动；按 Enter/Space 触发 `onTabChange`

---

### DocTreePanel

**职责**：挂载时调用 `GET /docs` 拉取文档列表，渲染 PRD/SDD/PLAN/TASK/MODULE 层级树，内部管理展开/折叠状态。

```typescript
interface DocTreePanelProps {
  onSelect: (path: string) => void;           // required — 节点选中回调，传递 docs/ 下相对路径
}
```

**行为规格**

- **MODULE-002-BH-16**（正常）：组件挂载时调用 `GET /docs` → 成功后按路径前缀分组，渲染层级文档树，每项附带状态标签（draft/approved/released）
- **MODULE-002-BH-17**（正常）：用户点击叶子节点（文档文件）→ 调用 `onSelect(path)`，传递该节点对应的 `path` 值
- **MODULE-002-BH-18**（边界）：`GET /docs` 返回空数组 → 显示"暂无文档"空状态提示，不渲染树

---

### DocViewerPanel

**职责**：接收文档路径 prop，自行调用 `GET /docs/{path}` 获取内容，使用 Markdown 渲染库展示。

```typescript
interface DocViewerPanelProps {
  path: string;                               // required — docs/ 下相对路径，用于请求文档内容
}
```

**行为规格**

- **MODULE-002-BH-19**（正常）：`path` prop 更新 → 组件自动发起 `GET /docs/{path}`，成功后渲染返回的 Markdown 内容
- **MODULE-002-BH-20**（异常）：`GET /docs/{path}` 返回 `404` → 显示"文档未找到"错误提示
- **MODULE-002-BH-21**（异常）：`GET /docs/{path}` 返回 `403` 或 `500` → 显示"加载失败，请重试"错误提示

---

### EngineeringTab

**职责**：研发 Tab 容器，包裹现有 `SessionView` 组件，透传工作区上下文，适配 Tab 内容区高度约束。

```typescript
interface EngineeringTabProps {
  workspaceId?: string;                       // optional — 透传给 SessionView 的工作区 ID
}
```

---

## LocalStorage 契约

| 完整 Key                       | 读写 API                                                                             | 值域                          | 默认值   |
|--------------------------------|--------------------------------------------------------------------------------------|-------------------------------|----------|
| `harnesswork:mode-preference`  | `platform.storage("harnesswork").getItem/setItem("mode-preference")`                 | `"openwork"` \| `"cockpit"`   | `null`   |

**行为规格**

- **MODULE-002-BH-22**（正常）：用户在 `ModeSelectPage` 点击"harnesswork 工程驾驶舱" → `setItem("mode-preference", "cockpit")` 写入，随即 `navigate("/cockpit")`
- **MODULE-002-BH-23**（正常）：用户在 `ModeSelectPage` 点击"openwork 原始版本" → `setItem("mode-preference", "openwork")` 写入，随即 `navigate("/")`
- **MODULE-002-BH-24**（正常）：`AppEntry` 挂载，`getItem("mode-preference")` 返回 `"cockpit"` 且当前路由为 `/` → 自动 `navigate("/cockpit")`
- **MODULE-002-BH-25**（边界）：`AppEntry` 挂载，`getItem("mode-preference")` 返回 `null` 或 `"openwork"` → 保持默认路由行为，不触发跳转

---

## 路由约定

注册位置：`apps/app/src/index.tsx`，在 `<Route path="*all">` 通配之前。

```tsx
<RouterComponent root={AppEntry}>
  <Route path="/mode-select" component={ModeSelectPage} />
  <Route path="/cockpit"     component={CockpitPage} />
  <Route path="*all"         component={() => null} />   {/* 保持现有 openwork 默认行为 */}
</RouterComponent>
```

**约束**：`/` 根路由不变，`*all` 通配继续由现有 openwork App 处理；路由跳转时间 P99 < 50ms（继承自 SDD-002 NFR）。

---

## 技术设计评审日志

| 轮次 | 日期       | 评审人              | 结论 | 关键意见                                                                         |
|------|------------|---------------------|------|----------------------------------------------------------------------------------|
| R1   | 2026-04-08 | tech-lead, architect | 通过 | 接口定义完整，BH 规格（BH-01~BH-25）覆盖正常/异常/边界场景；NFR 继承 SDD-002 基准 |
