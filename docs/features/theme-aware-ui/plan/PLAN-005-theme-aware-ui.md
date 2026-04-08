# PLAN-005 模式选择页与工程驾驶舱主题自适应

## 元信息
- 编号：PLAN-005
- 状态：draft
- 作者：tech-lead
- 来源 SDD：[SDD-005](../spec/SDD-005-theme-aware-ui.md)
- 覆盖 MODULE：[MODULE-005](../spec/MODULE-005-theme-aware-ui.md)
- 拆出 TASK：[TASK-005-01](../task/TASK-005-01-theme-token-replacement.md)
- 目标迭代：Sprint-01-W15

## 目标与范围

### 包含
- 将 9 个 UI 组件/页面中所有硬编码深色 Tailwind 类替换为 DLS 语义 Token 或 Radix 主题 Token
- 确保替换后在亮色、暗色、跟随系统三种主题下所有行为规格（BH-01 ~ BH-22）通过人工验收
- 向 PRD-002 writeback 新增 FR-11（主题自适应）

### 不包含
- 主题系统本身改造（`theme.ts`、`index.css`）
- 其他页面样式（SessionView、SettingsShell 等已是主题自适应）
- 视觉回归测试 CI 接入（P2，本次不交付）

## 里程碑

| 里程碑 | 完成标准 | 目标日期 |
|--------|---------|---------|
| M1 编码完成 | 9 个文件样式替换完成，本地构建通过 | 04-08 |
| M2 验收通过 | BH-01 ~ BH-22 全部人工验收通过（亮色 + 暗色） | 04-08 |
| M3 writeback | PRD-002 新增 FR-11，台账更新完成 | 04-08 |

## 任务拆解

| TASK | 描述 | 负责人 | 工作量 | 依赖 |
|------|------|--------|--------|------|
| TASK-005-01 | 9 个 UI 文件主题 Token 全量替换 + writeback PRD-002 | dev | 1d | — |

## 前置依赖
- 内部：SDD-005 approved（已满足，draft 状态，本次随编码一并推进）
- 内部：DLS 变量已在 `index.css` 中定义，Radix 色阶已在 `colors.css` 中就绪（已满足）
- 内部：`tailwind.config.ts` safelist 需包含 Radix 动态色阶类名（待 TASK-005-01 编码前确认）

## 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| Tailwind safelist 缺失导致 Token 类名被 purge | 低 | 生产环境样式缺失 | 编码前检查 `tailwind.config.ts`，必要时补充 safelist |
| `prose` 无 `prose-invert` 暗色主题 typography 显示异常 | 低 | 暗色下 Markdown 不可读 | 人工验收时重点核查 BH-14 |

## 验收标准
- MODULE-005 行为规格 BH-01 ~ BH-22 全部人工验收通过
- 亮色主题、暗色主题、跟随系统三种场景均覆盖
- 现有单元测试（`pnpm test`）全绿
- PRD-002 新增 FR-11 已 writeback
