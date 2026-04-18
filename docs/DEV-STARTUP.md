# 星静开发环境启动指南

## 前置条件

| 依赖 | 说明 |
|------|------|
| PostgreSQL | 本地运行，默认端口 **5432** |
| Go | 用于编译并运行 xingjing-server |
| pnpm | monorepo 包管理器 |
| Rust / Tauri CLI | 编译 Tauri 桌面端 |

> 如使用 Docker 启动 PostgreSQL，默认映射端口为 **5433**，需确认 `xingjing-server/config.yaml` 中 `database.port` 与实际端口一致。

---

## 正确启动顺序

### 第一步：清理残留进程

```bash
pkill -f "OpenWork-Dev" 2>/dev/null
pkill -f "tauri" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "xingjing-server" 2>/dev/null
pkill -f "opencode-aarch64" 2>/dev/null
lsof -ti:5173,4100,4096,3001 | xargs kill -9 2>/dev/null
```

### 第二步：启动后端服务（xingjing-server）

```bash
cd xingjing-server
go run ./cmd/server/
```

- 监听端口：**4100**
- 启动成功标志：日志出现 `Server listening on :4100`

### 第三步：启动桌面端（Tauri 统一管理 Vite）

```bash
cd harnesswork/apps/desktop
pnpm dev
```

- Tauri 会通过 `beforeDevCommand` 自动在端口 **5173** 启动 Vite
- 启动成功标志：日志出现 `[workspace] bootstrap`

> ⚠️ **禁止单独提前启动 Vite**（即不要单独执行 `pnpm --filter @openwork/app dev`）  
> 原因：Tauri 的 `beforeDevCommand` 会再次尝试启动 Vite，导致端口 5173 冲突，Tauri 进程退出，客户端白屏。

### 第四步：启动 OpenCode 服务

```bash
OPENWORK_DATA_DIR="$HOME/.openwork/openwork-orchestrator-dev" \
  harnesswork/apps/desktop/src-tauri/sidecars/opencode-aarch64-apple-darwin \
  serve --port 4096 --hostname 127.0.0.1
```

- 监听端口：**4096**
- 知识库扫描功能依赖此服务

---

## 验证各端就绪

```bash
for port in 5173 4100 4096; do
  (lsof -ti:$port > /dev/null && echo "✅ $port 在线") || echo "❌ $port 不在线"
done
```

---

## 常见问题

### 客户端白屏 / Failed to load resource

1. 检查 5173 是否在线：`lsof -ti:5173`
2. 检查是否有残留旧 Tauri 进程：`ps aux | grep OpenWork-Dev`
3. 若有旧进程：`kill <PID>`，再重走完整启动流程
4. **不要直接运行 `./target/debug/OpenWork-Dev` 二进制**，该方式不会注入 devUrl，WebView 将加载空白页

### 后端启动失败（数据库连接拒绝）

- 错误信息：`dial tcp 127.0.0.1:5433: connect: connection refused`
- 排查：确认 PostgreSQL 实际监听端口，修改 `xingjing-server/config.yaml` 中 `database.port`

### orchestrator shutdown 连接失败

```
[orchestrator] Failed to request shutdown: Connection refused (os error 61)
```

此为**正常现象**，Tauri 启动时尝试关闭上一次 orchestrator，若上次未运行则连接失败，不影响使用。

---

## 端口速查

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite 前端 | 5173 | 由 Tauri `pnpm dev` 自动启动 |
| 后端 API | 4100 | xingjing-server |
| OpenCode | 4096 | 知识库/AI 能力依赖 |
| PostgreSQL | 5432 / 5433 | 本地 / Docker |
