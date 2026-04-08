# ═══════════════════════════════════════════
# Harness Engineering 标准 Makefile
# 由 `he init` 自动生成
#
# 使用: make <target>
# 帮助: make help
# ═══════════════════════════════════════════

APP_NAME ?= harnesswork
IMAGE    ?= registry.company.com/harnesswork/$(APP_NAME)
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.DEFAULT_GOAL := help

# ─── 开发 ───────────────────────────────

.PHONY: setup
setup: ## 初始化开发环境（安装 hooks + 依赖）
	@echo "── 配置 Git Hooks ──"
	git config core.hooksPath .githooks
	@echo "── 安装 Pre-commit ──"
	@command -v pre-commit >/dev/null 2>&1 && pre-commit install || echo "WARN: pre-commit 未安装，跳过 (pip install pre-commit)"
	@echo "── 安装 Node 依赖 ──"
	pnpm install
	@echo ""
	@echo "✔ 开发环境就绪"

.PHONY: dev
dev: ## 启动桌面端开发模式
	pnpm dev

.PHONY: dev-ui
dev-ui: ## 仅启动 Web UI 开发模式（无 Tauri）
	pnpm dev:ui

# ─── 代码质量 ─────────────────────────────

.PHONY: lint
lint: ## 代码静态检查
	pnpm lint

.PHONY: test
test: ## 运行单元测试
	pnpm test

.PHONY: typecheck
typecheck: ## TypeScript 类型检查
	pnpm typecheck

# ─── 构建 ───────────────────────────────

.PHONY: build
build: ## 构建应用
	pnpm build

.PHONY: build-desktop
build-desktop: ## 构建桌面端（Tauri）
	pnpm --filter @openwork/desktop build

# ─── 安全合规 ─────────────────────────────

.PHONY: secret-scan
secret-scan: ## 敏感信息检测（Gitleaks）
	@command -v gitleaks >/dev/null 2>&1 || { echo "ERROR: gitleaks 未安装"; exit 1; }
	gitleaks detect --source . --verbose

.PHONY: license-check
license-check: ## 许可证合规检查
	@command -v trivy >/dev/null 2>&1 || { echo "ERROR: trivy 未安装"; exit 1; }
	trivy fs --scanners license .

# ─── 项目健康 ─────────────────────────────

.PHONY: doctor
doctor: ## 检查项目结构完整性
	@echo "── Harness Engineering Doctor ──"
	@PASS=0; WARN=0; FAIL=0; \
	check() { if [ -e "$$1" ]; then echo "  PASS  $$2"; PASS=$$((PASS+1)); else echo "  $$3  $$2 ($$1)"; if [ "$$3" = "FAIL" ]; then FAIL=$$((FAIL+1)); else WARN=$$((WARN+1)); fi; fi; }; \
	echo ""; \
	echo "[结构检查]"; \
	check "docs/product/prd/_index.yaml" "PRD 台账" "FAIL"; \
	check "docs/product/architecture/_index.yaml" "SDD 台账" "FAIL"; \
	check "docs/product/contracts/_index.yaml" "CONTRACTS 台账" "FAIL"; \
	check "docs/delivery/plan/_index.yaml" "PLAN 台账" "FAIL"; \
	check "docs/delivery/task/_index.yaml" "TASK 台账" "FAIL"; \
	check "docs/overview.md" "产品概述" "FAIL"; \
	echo ""; \
	echo "[配置检查]"; \
	check ".gitignore" ".gitignore" "FAIL"; \
	check ".pre-commit-config.yaml" "Pre-commit 配置" "WARN"; \
	check ".editorconfig" "EditorConfig" "WARN"; \
	check ".env.example" "环境变量模板" "WARN"; \
	check "orchestrator.yaml" "Pipeline 编排配置" "WARN"; \
	echo ""; \
	echo "══════════════════════════════════"; \
	echo "  PASS: $$PASS  WARN: $$WARN  FAIL: $$FAIL"; \
	echo "══════════════════════════════════"

# ─── 清理 ───────────────────────────────

.PHONY: clean
clean: ## 清理构建产物
	@rm -rf dist/ out/ .turbo/ node_modules/ apps/*/node_modules/ apps/desktop/src-tauri/target/
	@echo "已清理构建产物"

# ─── 帮助 ───────────────────────────────

.PHONY: help
help: ## 显示可用命令
	@echo ""
	@echo "$(APP_NAME) — Harness Engineering 标准命令"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
