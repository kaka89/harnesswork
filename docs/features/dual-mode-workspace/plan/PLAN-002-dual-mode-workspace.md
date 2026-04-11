---
meta:
  id: PLAN-002
  title: 双模式工作区——入口选择页 & 全链路工程驾驶舱
  status: draft
  author: tech-lead
  source_prd: [PRD-002]
  source_sdd: [SDD-002]
  specs: [MODULE-002]
  tasks: [TASK-002]
  sprint: Sprint-01-W15
  created: "2026-04-08"
  updated: "2026-04-08"
---

# PLAN-002 双模式工作区——入口选择页 & 全链路工程驾驶舱

## 元信息

- 编号：PLAN-002
- 状态：draft
- 作者：tech-lead
- 来源 PRD：[PRD-002-dual-mode-workspace]
- 来源 SDD：[SDD-002-dual-mode-workspace]
- 覆盖 MODULE：[MODULE-002-dual-mode-workspace]
- 拆出 TASK：[TASK-002-01, TASK-002-02, TASK-002-03, TASK-002-04, TASK-002-05, TASK-002-06, TASK-002-07, TASK-002-08]
- 目标迭代：Sprint-01-W15（2026-04-08 ~ 2026-04-30）

---

## 目标与范围

### 包含（P1 MVP）

- FR-01：`/mode-select` 模式选择页，支持两模式跳转
- FR-02：`/cockpit` 工程驾驶舱容器页（上下分栏布局）
- FR-03：CockpitTabNav 四 Tab 导航（产品/研发/发布&运维/运营），键盘导航
- FR-04：产品 Tab（DocTreePanel 文档树 + DocViewerPanel Markdown 渲染）
- FR-05：研发 Tab（复用 SessionView，懒加载嵌入）
- FR-06（P1 Mock）：发布&运维 Tab 静态 Mock 展示，IS_MOCK 开关控制
- FR-07（P1 Mock）：运营 Tab 静态 Mock 展示，IS_MOCK 开关控制
- FR-08（部分）：LocalStorage 模式偏好写入，驾驶舱顶部返回模式选择入口
- OpenWork Server：GET /docs 与 GET /docs/:path 两个端点

### 不包含

- FR-06 真实 CI/CD API 接入（P2，另立 SDD）
- FR-07 真实运营数据平台接入（P2，另立 SDD）
- FR-09 响应式适配（P3，< 1280px 降级布局）
- 任何 Tauri 原生 Command 新增
- openwork 原始 `/` 路由修改

---

## 里程碑

| 里程碑 | 完成标准 | 目标日期 |
|--------|---------|---------|
| M1 模式选择页上线 | 路由 `/mode-select` 可达；两个模式按钮可点击并分别跳转 `/` 和 `/cockpit`；LocalStorage 写入成功；TASK-002-01、TASK-002-02 合入 main | 2026-04-11 |
| M2 产品 & 研发 Tab 上线 | `/cockpit` 加载 < 500ms；Tab 切换 < 100ms；产品 Tab 文档树首次加载 < 1s；研发 Tab SessionView 正常嵌入；TASK-002-03 ~ 006 合入 main | 2026-04-18 |
| M3 发布&运维 & 运营 Tab Mock 上线 | 发布&运维 Tab 与运营 Tab 静态 Mock 数据正常展示，IS_MOCK=true；Tab 切换无报错；TASK-002-07、TASK-002-08 合入 main | 2026-04-24 |
| M4 集成验收 | MODULE-002 所有 BH-01 ~ BH-25 行为规格测试通过；新增组件单元测试覆盖率 > 70%；Pact 契约验证通过；SonarQube 无 Critical 问题 | 2026-04-30 |

---

## 任务拆解

| TASK | 描述 | 负责人 | 工作量 | 依赖 | 里程碑 |
|------|------|--------|--------|------|--------|
| TASK-002-01 | 路由注册与基础框架搭建（index.tsx 注册双路由，创建 ModeSelectPage/CockpitPage 骨架） | dev | 0.5d | — | M1 |
| TASK-002-02 | ModeSelectPage 完整实现（两模式按钮 + LocalStorage 读写 + navigate + AppEntry 自动跳转） | dev | 1d | TASK-002-01 | M1 |
| TASK-002-03 | CockpitPage 容器与 CockpitTabNav 实现（上下分栏 + 四 Tab 导航 + createSignal + 键盘导航 + 返回入口） | dev | 1.5d | TASK-002-01 | M2 |
| TASK-002-04 | 产品 Tab 页实现（ProductTab + DocTreePanel 调用 GET /docs + DocViewerPanel 渲染） | dev | 2d | TASK-002-03, TASK-002-06 | M2 |
| TASK-002-05 | 研发 Tab 页实现（EngineeringTab 三栏容器 + lazy() 嵌入 SessionView + 高度适配） | dev | 1d | TASK-002-03 | M2 |
| TASK-002-06 | OpenWork Server 文档端点（GET /docs + GET /docs/:path，路径穿越防护，frontmatter 解析） | dev | 1d | — | M2 |
| TASK-002-07 | 发布&运维 Tab Mock 实现（ReleaseTab 静态 Mock：流水线/部署历史/环境健康/告警，IS_MOCK 开关） | dev | 0.5d | TASK-002-03 | M3 |
| TASK-002-08 | 运营 Tab Mock 实现（GrowthTab 静态 Mock：DAU/留存/反馈，IS_MOCK 开关） | dev | 0.5d | TASK-002-03 | M3 |

**汇总工作量**：8d（约 2 个工作周）

---

## 任务依赖关系图（DAG）

```
TASK-002-01（基础框架）
    ├── TASK-002-02（ModeSelectPage）          → M1
    └── TASK-002-03（CockpitPage + TabNav）    → M2
            ├── TASK-002-04（ProductTab）      ← 还依赖 TASK-002-06
            ├── TASK-002-05（EngineeringTab）  → M2
            ├── TASK-002-07（ReleaseTab Mock） → M3
            └── TASK-002-08（GrowthTab Mock）  → M3

TASK-002-06（Server 端点）[可与 TASK-002-03 并行]
    └──（作为 TASK-002-04 的服务端前置）
```

**可并行执行**：
- TASK-002-01 完成后，TASK-002-02 与 TASK-002-03 可并行
- TASK-002-06 与 TASK-002-03 可并行（无代码冲突）
- TASK-002-03 完成后，TASK-002-05、TASK-002-07、TASK-002-08 可并行

---

## 前置依赖

- 外部：无外部团队依赖
- 内部：
  - SDD-002 已处于 draft 状态（已满足）
  - MODULE-002 已处于 approved 状态（已满足）
  - `apps/server` 可扩展新端点（需确认架构准入，待 tech-lead 确认）
  - `platform.storage(name)` API 接口为同步或异步（Q1，需 tech-lead 在 M1 开发前确认，见 SDD-002 Q1）
  - Markdown 渲染库选型（Q4：是否复用现有工具或引入 marked，需 M2 开发前确认）

---

## 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| R1：SessionView（133KB）在 Tab 嵌入时初始化超过 100ms 阈值 | 中 | Tab 切换响应 NFR 不达标 | 使用 `lazy()` 延迟加载；首次进入研发 Tab 时展示骨架屏；Tab 切换 < 100ms 仅计 UI 响应，不含数据加载 |
| R2：`platform.storage` 为异步接口，AppEntry 挂载时序问题 | 中 | 模式偏好恢复失败，用户每次启动需手动选模式 | M1 开发前通过代码审查确认 API 类型；若为异步，在 AppEntry 用 `createResource` 包裹，显示加载态等待偏好读取完成 |
| R3：`harnesswork:mode-preference` 在 Tauri WebView 数据清除后丢失 | 低 | 用户偏好失效，体验降级但不阻塞功能 | P1 阶段接受此行为；P2 阶段评估 Tauri store plugin 作为持久化备选方案（见 SDD-002 R3） |
| R4：GET /docs 路径穿越防护实现不完整导致安全漏洞 | 低 | 任意本地文件读取安全风险 | TASK-002-06 中强制校验 resolved path 以 `docs/` 开头（BH-10）；Code Review 必须覆盖安全检查点 |
| R5：P2 真实 CI/CD API 规划滞后，影响驾驶舱完整性承诺 | 中 | 发布&运维 Tab 长期停留 Mock 状态，用户体验期望落差 | M3 前 product-owner 制定 P2 SDD 计划（见 SDD-002 R2）；P1 Mock 中明确标注"数据仅供演示" |

---

## 验收标准

> 映射到 MODULE-002 行为规格编号

### M1 验收

- [ ] MODULE-002-BH-22：点击"harnesswork 工程驾驶舱" → LocalStorage 写入 `cockpit` → navigate `/cockpit`
- [ ] MODULE-002-BH-23：点击"openwork 原始版本" → LocalStorage 写入 `openwork` → navigate `/`
- [ ] MODULE-002-BH-24：AppEntry 挂载，偏好为 `cockpit` 且当前路由 `/` → 自动跳转 `/cockpit`
- [ ] MODULE-002-BH-25：AppEntry 挂载，偏好为 `null` 或 `openwork` → 保持默认路由，不跳转

### M2 验收

- [ ] MODULE-002-BH-13：activeTab 对应 Tab 项渲染 active 样式
- [ ] MODULE-002-BH-14：点击非当前 Tab → onTabChange 触发，父组件更新 activeTab
- [ ] MODULE-002-BH-15：键盘 Arrow/Tab/Enter/Space 导航行为正确
- [ ] MODULE-002-BH-01：GET /docs 返回非空 DocEntry[]，字段完整
- [ ] MODULE-002-BH-02：frontmatter 含 title/status → 响应字段与 frontmatter 一致
- [ ] MODULE-002-BH-06：文件无 frontmatter → title 为文件名，status 为 "unknown"
- [ ] MODULE-002-BH-07：docs/ 无 .md 文件 → 返回 200 空数组
- [ ] MODULE-002-BH-08：GET /docs/:path 文件存在 → 200，Content-Type: text/markdown
- [ ] MODULE-002-BH-10：路径含 ../ → 403 FORBIDDEN
- [ ] MODULE-002-BH-12：URL 编码路径 → 正确解码后返回文件内容
- [ ] MODULE-002-BH-16：DocTreePanel 挂载调用 GET /docs，渲染层级树及状态标签
- [ ] MODULE-002-BH-17：点击文档节点 → onSelect(path) 触发
- [ ] MODULE-002-BH-18：GET /docs 返回空数组 → 显示"暂无文档"空状态
- [ ] MODULE-002-BH-19：DocViewerPanel path 更新 → 自动拉取并渲染 Markdown
- [ ] MODULE-002-BH-20：GET /docs/:path 404 → 显示"文档未找到"
- [ ] MODULE-002-BH-21：GET /docs/:path 403/500 → 显示"加载失败，请重试"

### M3 验收

- [ ] 发布&运维 Tab 静态 Mock 数据正常渲染（流水线/部署历史/环境健康/告警）
- [ ] 运营 Tab 静态 Mock 数据正常渲染（DAU/留存/反馈）
- [ ] IS_MOCK 常量存在且有效控制数据来源

### M4 整体验收

- [ ] 所有 MODULE-002-BH-01 ~ BH-25 行为规格单元/集成测试全绿
- [ ] 新增组件单元测试行覆盖率 > 70%
- [ ] Pact 契约测试验证 GET /docs 与 GET /docs/:path 通过
- [ ] SonarQube 质量门禁：无 Critical/Blocker 问题
- [ ] NFR 达标：模式选择页首屏 < 500ms，Tab 切换 < 100ms，文档树加载 < 1s
- [ ] 本地 Tauri 桌面环境功能可用
