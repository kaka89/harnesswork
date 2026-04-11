#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# 星静平台 — 本地开发一键启动脚本
# 启动三个服务：xingjing-server、xingjing UI、openwork UI
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "  🌙 星静平台 — 本地开发环境启动"
echo "  ──────────────────────────────────"
echo "  xingjing-server  → http://localhost:4100"
echo "  xingjing UI      → http://localhost:3001"
echo "  openwork UI      → http://localhost:5173"
echo ""

# 检查 bun
if ! command -v bun &> /dev/null; then
  echo "  ⚠️  未找到 bun，请先安装：https://bun.sh"
  exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "  ⚠️  未找到 pnpm，请先安装：npm i -g pnpm"
  exit 1
fi

# 确保 concurrently 存在
cd "$ROOT_DIR"
if ! pnpm list concurrently --depth=0 &>/dev/null; then
  echo "  📦 安装依赖..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi

echo "  ▶ 启动所有服务（Ctrl+C 全部停止）"
echo ""

# 启动 xingjing-server + xingjing UI + openwork UI（三合一）
pnpm dev:xingjing-full
