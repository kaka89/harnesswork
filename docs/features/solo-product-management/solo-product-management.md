---
feature: solo-product-management
status: implemented
prd: PRD-003-xingjing-solo
sdd: SDD-002-xingjing-extension
created: "2026-04-15"
---

# Solo 产品管理

## 特性概述

| 属性 | 值 |
|------|-----|
| 特性编号 | F007 |
| 状态 | implemented |
| 关联 PRD | [PRD-003 FR-01~02](../../product/prd/PRD-003-xingjing-solo.md) |
| 关联 SDD | [SDD-002](../../product/architecture/SDD-002-xingjing-extension.md) |
| 创建日期 | 2026-04-15 |

## 特性描述

星静独立版的产品全生命周期管理能力，支持 Solo（Monorepo）和 Team（多仓库）两种产品模式。用户通过模态框创建产品后，系统自动生成标准化目录结构并初始化 Git 仓库。产品信息统一持久化至 `~/.xingjing/products.yaml`，支持跨会话保留。

## 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| product-store | `services/product-store.ts` | 产品注册表与偏好管理，CRUD 操作，模式切换 |
| product-dir-structure | `services/product-dir-structure.ts` | Solo 四层 / Team 六层目录文件模板生成 |
| NewProductModal | `components/product/new-product-modal.tsx` | 新建产品模态框（630 行） |
| EditProductModal | `components/product/edit-product-modal.tsx` | 编辑产品模态框 |
| AddDomainAppModal | `components/product/add-domain-app-modal.tsx` | 添加域/应用模态框（Team 模式） |
| GitInput | `components/product/git-input.tsx` | Git 仓库 URL 输入组件 |
| ProductSwitcher | `components/product/product-switcher.tsx` | 产品切换器下拉组件 |

## 关键设计决策

| 编号 | 决策 | 结论 | 理由 |
|------|------|------|------|
| D1 | 产品存储位置 | `~/.xingjing/products.yaml` 全局配置 | 跨工作区共享产品信息，不随项目目录变化 |
| D2 | 持久化通道 | OpenCode file API 优先，localStorage 兜底 | 遵循 SDD-001 文件系统写操作规范 |
| D3 | 目录初始化方式 | Tauri `initProductDir` invoke | 需要操作系统级文件创建，非 OpenCode API 能力 |
| D4 | 产品模式区分 | `productType` 字段（'solo' / 'team'） | Solo 为默认值，向后兼容旧数据 |

## Solo 模式四层目录结构

```
{workDir}/
├── governance-standards/          ← 平台治理层
│   └── docs/
├── {product-line}/                ← 产品线层
│   ├── .docs/
│   │   ├── prd/
│   │   ├── sdd/
│   │   ├── plan/
│   │   └── task/
│   ├── .agents/
│   └── .xingjing/config.yaml
├── {domain}/                      ← 领域层
│   ├── docs/
│   └── tests/
└── apps/{app}/                    ← 应用层
    ├── src/
    ├── docs/
    └── tests/
```

## Team 模式六层目录结构

```
{workDir}/
├── {pl-slug}/                     ← 产品线仓库（独立 Git）
│   ├── .xingjing/config.yaml
│   ├── .docs/
│   └── .opencode/
├── {domain-slug}/                 ← 领域仓库（独立 Git）
│   ├── docs/
│   └── src/
└── apps/{app-slug}/               ← 应用仓库（独立 Git）
    ├── src/
    └── docs/
```

## 行为规格

| 编号 | 场景 | 预期 |
|------|------|------|
| BH-01 | 用户点击新建产品 | 弹出 NewProductModal，可选择 Solo/Team 模式 |
| BH-02 | 填写产品信息并确认（Solo） | 创建四层目录 + Git init + 写入 products.yaml |
| BH-03 | 填写产品信息并确认（Team） | 创建六层目录 + 各仓库独立 Git init |
| BH-04 | 产品切换 | 通过 ProductSwitcher 切换活跃产品，更新 OpenCode 客户端 baseUrl |
| BH-05 | 产品编辑 | 弹出 EditProductModal，可修改名称/描述/Git URL |
| BH-06 | 产品删除 | 仅删除注册表记录，不删除磁盘文件 |
| BH-07 | 应用启动加载 | 从 products.yaml 加载产品列表，恢复上次活跃产品 |
| BH-08 | OpenCode 不可用 | 降级到 localStorage 读写产品数据 |

## 验收标准

- [x] NewProductModal 可正常创建 Solo/Team 产品
- [x] Solo 模式四层目录自动生成
- [x] Team 模式六层多仓库目录自动生成
- [x] 产品信息持久化到 `~/.xingjing/products.yaml`
- [x] ProductSwitcher 可切换产品并更新 OpenCode 客户端
- [x] EditProductModal 可编辑产品信息
- [x] 应用启动时自动恢复产品列表和活跃产品
