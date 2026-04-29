# harnesswork/docs/ — 已迁移

> **本目录已于 2026-04-29 迁移至根仓库。** 请通过下方索引访问新位置。
>
> 迁移原因：根仓库 `xingjing/` 采用 Solo 工程规范（`knowledge/ENGINEERING-STRUCTURE-SOLO.md`），
> 产品活文档（PRD / SDD）须在 `product/features/` 统一管控。虽然 harnesswork 是 OpenWork
> 的二开，但 OpenWork 平台本身的功能也可能在本项目中被修订，因此 OpenWork 平台文档
> 亦纳入 `product/features/` 管理，用 `scope: openwork-platform` 字段区分。

---

## 新位置索引

### 星静自建功能（scope: xingjing） → `product/features/`

| 原文件 | 新位置 |
|---|---|
| `10-product-shell.md` | [`product/features/xingjing-shell/SDD.md`](../../product/features/xingjing-shell/SDD.md) |
| `30-autopilot.md` | [`product/features/autopilot/SDD.md`](../../product/features/autopilot/SDD.md) |
| `40-agent-workshop.md` | [`product/features/agent-workshop/SDD.md`](../../product/features/agent-workshop/SDD.md) |
| `50-product-mode.md` | [`product/features/product-mode/SDD.md`](../../product/features/product-mode/SDD.md) |
| `60-knowledge-base.md` | [`product/features/knowledge-base/SDD.md`](../../product/features/knowledge-base/SDD.md) |
| `70-review.md` | [`product/features/review/SDD.md`](../../product/features/review/SDD.md) |
| `80-settings.md` | [`product/features/settings/SDD.md`](../../product/features/settings/SDD.md) |

### OpenWork 平台文档（scope: openwork-platform） → `product/features/`

| 原文件 | 新位置 |
|---|---|
| `00-overview.md` | [`product/features/platform-overall-design/SDD.md`](../../product/features/platform-overall-design/SDD.md) |
| `05-openwork-platform-overview.md` | [`product/features/openwork-platform/SDD.md`](../../product/features/openwork-platform/SDD.md) |
| `05a-openwork-session-message.md` | [`product/features/openwork-session-message/SDD.md`](../../product/features/openwork-session-message/SDD.md) |
| `05b-openwork-skill-agent-mcp.md` | [`product/features/openwork-skill-agent-mcp/SDD.md`](../../product/features/openwork-skill-agent-mcp/SDD.md) |
| `05c-openwork-workspace-fileops.md` | [`product/features/openwork-workspace-fileops/SDD.md`](../../product/features/openwork-workspace-fileops/SDD.md) |
| `05d-openwork-model-provider.md` | [`product/features/openwork-model-provider/SDD.md`](../../product/features/openwork-model-provider/SDD.md) |
| `05e-openwork-permission-question.md` | [`product/features/openwork-permission-question/SDD.md`](../../product/features/openwork-permission-question/SDD.md) |
| `05f-openwork-settings-persistence.md` | [`product/features/openwork-settings-persistence/SDD.md`](../../product/features/openwork-settings-persistence/SDD.md) |
| `05g-openwork-process-runtime.md` | [`product/features/openwork-process-runtime/SDD.md`](../../product/features/openwork-process-runtime/SDD.md) |
| `05h-openwork-state-architecture.md` | [`product/features/openwork-state-architecture/SDD.md`](../../product/features/openwork-state-architecture/SDD.md) |
| `06-openwork-bridge-contract.md` | [`product/features/openwork-bridge-contract/SDD.md`](../../product/features/openwork-bridge-contract/SDD.md) |

### 一次性审计记录 → `knowledge/tech-notes/`

| 原文件 | 新位置 |
|---|---|
| `audit-react-migration.md` | [`knowledge/tech-notes/openwork-react-migration-audit.md`](../../knowledge/tech-notes/openwork-react-migration-audit.md) |
| `polished-squishing-cookie.md` | [`knowledge/tech-notes/xingjing-design-optimization-audit.md`](../../knowledge/tech-notes/xingjing-design-optimization-audit.md) |

---

## 后续规则

- 新增/修改产品设计文档 → 直接在 `product/features/<id>/` 下操作，**不再**在本目录新建文件。
- 每个 feature 目录固定两份：`SDD.md`（实现/架构）+ `PRD.md`（需求/用户故事）。
- OpenWork 平台层功能若被二开修订，需在对应 `openwork-*` feature 目录下更新 SDD，并把 `status` 由 `ga` 切至 `dev` / `beta`。
- 功能台账维护在 [`product/features/_index.yml`](../../product/features/_index.yml)。

## 已完成的后续修复

SDD 内部相对跳转链接（如 `[./30-autopilot.md]`）已于 2026-04-29 批量重写为新路径（18 个 SDD、223 条链接更新）：

- 同为 feature 的引用：`[./XX.md]` → `[../<target-id>/SDD.md]`
- 对审计文档的引用：`[./audit-*.md]` → `[../../knowledge/tech-notes/<name>.md]`
- 锚点（`#xxx`）整体保留。
