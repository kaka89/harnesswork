# 05g · OpenWork 多进程 Sidecar 运行时

> 同级文档：[./05-openwork-platform-overview.md](./05-openwork-platform-overview.md) · [./05a-openwork-session-message.md](./05a-openwork-session-message.md) · [./05b-openwork-skill-agent-mcp.md](./05b-openwork-skill-agent-mcp.md) · [./05c-openwork-workspace-fileops.md](./05c-openwork-workspace-fileops.md) · [./05d-openwork-model-provider.md](./05d-openwork-model-provider.md) · [./05e-openwork-permission-question.md](./05e-openwork-permission-question.md) · [./05f-openwork-settings-persistence.md](./05f-openwork-settings-persistence.md) · [./05h-openwork-state-architecture.md](./05h-openwork-state-architecture.md)

本篇聚焦 OpenWork 桌面端（Tauri）在运行时拉起的 **多进程 Sidecar 编排体系**：有哪些子进程、谁启动谁、端口如何分配、通信走什么协议、失败如何重试。所有断言只以 `apps/desktop/src-tauri/`、`apps/server/`、`apps/orchestrator/`、`apps/opencode-router/` 源码为准。

---

## 1. 打包清单与 Sidecar 物理构成

[tauri.conf.json#L43-L50](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/tauri.conf.json#L43-L50) 的 `bundle.externalBin` 一共声明 **6 个条目**：

| # | Sidecar 文件（仓库相对路径） | 是否进程 | 由谁直接拉起 | 说明 |
|---|---|---|---|---|
| 1 | `sidecars/opencode` | 是 | Tauri Rust（Direct 模式）或 openwork-orchestrator 子进程（Orchestrator 模式） | OpenCode CLI，会话/消息/工具执行核心引擎 |
| 2 | `sidecars/openwork-server` | 是 | Tauri Rust | 文件系统 API + 远端连接入口（Bun.serve） |
| 3 | `sidecars/opencode-router` | 是 | Tauri Rust | Slack / Telegram bridge + `/health` 探活（node http） |
| 4 | `sidecars/openwork-orchestrator` | 是 | Tauri Rust | 守护进程，负责管生 opencode，对外暴露 HTTP 控制面 |
| 5 | `sidecars/chrome-devtools-mcp` | 否（被调） | OpenCode 内部 MCP 子进程调用 | 仅随包分发，Rust 端不主动 spawn |
| 6 | `sidecars/versions.json` | 否（元数据） | — | 构建产物版本对照表，不是可执行文件 |

对应磁盘产物见 [sidecars 目录](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/sidecars)（每个 sidecar 都带 `-aarch64-apple-darwin`、`-bun-darwin-arm64` 等目标三元组后缀以适配 Tauri 的 sidecar 选择逻辑）。

---

## 2. Rust 端四个 Manager

所有 sidecar 进程句柄（`CommandChild`）都由 Tauri `.manage()` 单例承载。见 [run()](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/lib.rs#L157-L166)：

```
.manage(EngineManager::default())
.manage(OrchestratorManager::default())
.manage(OpenworkServerManager::default())
.manage(OpenCodeRouterManager::default())
```

| Manager | 字段 | 生命周期源文件 |
|---------|------|---------------|
| [EngineManager](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/engine/manager.rs#L7-L68) | `runtime / child / base_url / port / opencode_username / opencode_password` | `engine/manager.rs` |
| [OrchestratorManager](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/manager.rs#L7-L50) | `child / data_dir / last_stdout / last_stderr` | `orchestrator/manager.rs` |
| [OpenworkServerManager](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/manager.rs#L7-L77) | `child / host / port / base_url / connect_url / client_token / host_token / owner_token` | `openwork_server/manager.rs` |
| [OpenCodeRouterManager](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/opencode_router/manager.rs#L7-L59) | `child / version / workspace_path / opencode_url / health_port` | `opencode_router/manager.rs` |

每个 Manager 都遵循相同套路：
1. `Arc<Mutex<State>>` 包装字段；
2. `snapshot_locked(&mut state)` 输出 UI 可消费的 `*Info`；
3. `stop_locked(&mut state)` 杀进程并清空字段；
4. stdout/stderr 由 `tauri::async_runtime::spawn` 订阅，截断到 8000 字节后写回 `last_stdout/last_stderr`。

---

## 3. 两种运行时（EngineRuntime）

`EngineRuntime` 枚举决定 opencode 由谁负责启动：

| 运行时 | 触发 | 启动者 | 进程关系 |
|-------|------|-------|---------|
| **Direct** | UI 传 `runtime="Direct"` | Tauri Rust 直接 `spawn_engine` | Tauri → opencode |
| **Orchestrator**（默认） | 缺省或 `runtime="Orchestrator"` | Tauri Rust 拉 openwork-orchestrator，orchestrator 内部拉 opencode | Tauri → openwork-orchestrator → opencode |

默认偏好见 [engine_start L362](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L362)：

```
let runtime = runtime.unwrap_or(EngineRuntime::Orchestrator);
```

> Direct 路径保留用于 doctor / 旧客户端降级；本 Monorepo 的桌面 UI 默认始终走 Orchestrator。

---

## 4. 进程拓扑总览（ASCII）

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Tauri main process (Rust)                           │
│                                                                           │
│  EngineManager     OrchestratorManager    OpenworkServerManager           │
│     │                    │                      │                         │
│     │  CommandChild      │  CommandChild        │  CommandChild           │
│     │                    │                      │                         │
│     │                    ▼                      ▼                         │
│     │         ┌──────────────────────┐ ┌─────────────────────┐            │
│     │         │ openwork-orchestrator│ │   openwork-server   │            │
│     │         │ (Bun single binary)  │ │   (Bun single bin)  │            │
│     │         │                      │ │                     │            │
│     │         │  daemon HTTP:        │ │  Bun.serve:         │            │
│     │         │  127.0.0.1:{daemon}  │ │  {host}:{port}      │            │
│     │         │                      │ │                     │            │
│     │         │   ↓ internally spawn │ │  port ∈ 48000..51000│            │
│     │         │                      │ │  host = 127.0.0.1   │            │
│     │         │  ┌────────────────┐  │ │         or 0.0.0.0  │            │
│     └──────── ┼─►│   opencode CLI │  │ │  ▲    (remote=true) │            │
│  (Direct模式) │  │  127.0.0.1:Port│◄─┼─┼──┘                  │            │
│               │  │  basic-auth    │  │ │  /opencode/*        │            │
│               │  └────────────────┘  │ │  /opencode-router/* │            │
│               └──────────────────────┘ └─────────────────────┘            │
│                                              ▲                            │
│                                              │                            │
│                          OpenCodeRouterManager                            │
│                                 CommandChild                              │
│                                      ▼                                    │
│                         ┌──────────────────────────┐                      │
│                         │     opencode-router      │                      │
│                         │  (node http server)      │                      │
│                         │  127.0.0.1:{health_port} │ ← ephemeral          │
│                         │  Slack/Telegram bridge   │                      │
│                         └──────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────┘
           ▲                                           ▲
           │ Tauri IPC (invoke / emit)                 │ HTTP + SSE
           │                                           │
  ┌────────────────┐                        ┌───────────────────┐
  │  UI (Webview)  │                        │  Remote clients   │
  │  SolidJS       │                        │  (phones, second  │
  └────────────────┘                        │   laptops, etc.)  │
                                            └───────────────────┘
```

---

## 5. 启动顺序（以 Orchestrator 模式为准）

主入口 [engine_start](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L323-L591)：

```
① 校验 project_dir 非空、尝试 create_dir_all
② read_opencode_config / 若不存在则 write 一份骨架 opencode.json
③ workspace_paths 归一：去重 + 将 project_dir 置首
④ 计算 bind_host=127.0.0.1、port=find_free_port()（该 port 只作 Direct 回退用）
⑤ dev_mode = OPENWORK_DEV_MODE==1 或 debug 构建
⑥ 生成 managed opencode 基本认证（username/password 各 512 字符，UUID 拼接）
⑦ EngineManager::stop_locked + OrchestratorManager::stop_locked（幂等清理）
⑧ resolve_engine_path → opencode 二进制候选（sidecar | PATH | 用户安装）
⑨ 若 runtime == Orchestrator：
   ⑨.1 data_dir = OPENWORK_DATA_DIR 或 ~/.openwork/openwork-orchestrator
   ⑨.2 daemon_port = find_free_port()   （random 127.0.0.1:ephemeral）
   ⑨.3 spawn_orchestrator_daemon(OrchestratorSpawnOptions{...})
        → Tauri shell 执行：
          openwork-orchestrator daemon run
            --data-dir <dir>
            --daemon-host 127.0.0.1
            --daemon-port <daemon_port>
            --opencode-bin <path>
            --opencode-host 127.0.0.1
            --opencode-workdir <project_dir>
            --opencode-port <port>
            --cors "*"
            --allow-external
        env: OPENWORK_OPENCODE_USERNAME / _PASSWORD / OPENCODE_ENABLE_EXA /
             OPENWORK_DEV_MODE / OPENWORK_INTERNAL_ALLOW_OPENCODE_CREDENTIALS=1
   ⑨.4 write_orchestrator_auth(data_dir, username, password, project_dir)
        （落盘到 openwork-orchestrator-auth.json，供下次冷启动 attach 复用）
   ⑨.5 tauri::async_runtime::spawn 订阅 stdout/stderr 写回 state
   ⑨.6 wait_for_orchestrator(http://127.0.0.1:{daemon_port}, timeout)
        • 默认 180_000 ms（3 分钟，可被 OPENWORK_ORCHESTRATOR_START_TIMEOUT_MS 覆盖）
        • 200 ms 轮询 GET /health
        • health.ok=true 且 health.opencode 存在时成功
   ⑨.7 opencode_port = health.opencode.port
        opencode_base_url = http://127.0.0.1:{opencode_port}
   ⑨.8 EngineManager 回填：runtime=Orchestrator, child=None (由 daemon 托管),
        port=opencode_port, base_url=..., opencode_username, opencode_password
   ⑨.9 resolve_opencode_router_health_port()
        → 占用 127.0.0.1:0 一个 ephemeral port，立刻释放后作为 health_port
   ⑨.10 start_openwork_server(..., opencode_base_url, health_port, remote_access)
        （见 §6）
   ⑨.11 opencodeRouter_start(project_dir, opencode_base_url, health_port)
        （见 §7）
   ⑨.12 返回 EngineInfo{running: true, runtime: Orchestrator, base_url,
                         project_dir, port, opencode_username, opencode_password}
⑩ 否则（Direct 模式）：spawn_engine(...) + 2 秒 warmup 检测立即退出 + 同样
   顺序拉起 openwork-server、opencode-router
```

**关键时序约束**：

1. openwork-orchestrator 的 `/health` 必须等到 OpenCode 自身健康后才返回 `ok: true`，所以 180s 超时主要覆盖 OpenCode 首启 SQLite 迁移窗口。
2. openwork-server 需要 opencode 的 `base_url` 才能启动（通过 `--opencode-base-url` 参数 + `OPENCODE_SERVER_USERNAME/PASSWORD` env 注入）。
3. opencode-router 的 `health_port` 必须提前解析好并同时通过环境变量 `OPENCODE_ROUTER_HEALTH_PORT` 传给 **openwork-server 和 opencode-router 两端**，因为 openwork-server 要反向代理到 `/opencode-router/health`（见 [spawn.rs L197-L199](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/spawn.rs#L197-L199)）。

---

## 6. openwork-orchestrator：守护进程与 HTTP 控制面

### 6.1 Rust 端 spawn

[spawn_orchestrator_daemon](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/mod.rs#L213-L293)：

- 首选 `app.shell().sidecar("openwork-orchestrator")`，失败时回退到 PATH 上的 `openwork`；
- 统一通过 `bun_env::bun_env_overrides()` 注入 Bun 单文件二进制所需的 BUN_* 环境变量；
- `OPENWORK_INTERNAL_ALLOW_OPENCODE_CREDENTIALS=1` 授予守护进程读写 opencode basic-auth 的权限；
- Tauri `resource_dir` 与当前二进制目录追加到 PATH 前缀，让 orchestrator 能通过 PATH 找到其它 sidecar 二进制。

### 6.2 Bun 端守护进程实现

入口 [cli.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/orchestrator/src/cli.ts) 是单文件 8639 行，`openwork daemon run` 子命令进入 `runDaemonCommand`。核心 HTTP 路由在 [L6007-L6263](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/orchestrator/src/cli.ts#L6007-L6263)：

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/health` | 返回 `{ ok, daemon, opencode, activeId, workspaceCount, cliVersion, sidecar, binaries }` |
| GET | `/workspaces` | 列出已登记 workspace（含 `activeId`） |
| POST | `/workspaces` | 注册本地 workspace（`path` 必填），写 state 文件 |
| POST | `/workspaces/remote` | 注册远端 workspace（`baseUrl` 必填，可选 `directory`） |
| GET | `/workspaces/:id` | 单个 workspace 详情 |
| POST | `/workspaces/:id/dispose` | 释放该 workspace 占用的 opencode 实例 |
| POST | `/shutdown` | 优雅关停：`server.close` + `stopChild(opencodeChild)` + `process.exit(0)` |

返回给 Tauri 的 `/health` schema 见 [Rust 端反序列化结构](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/mod.rs#L44-L55)：`ok / daemon / opencode / cliVersion / sidecar / binaries / activeId / workspaceCount`。

### 6.3 opencode 实例托管

`ensureOpencode()`（见 [cli.ts L5946-L6003](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/orchestrator/src/cli.ts#L5946-L6003)）是幂等函数：

1. 如果 state 中记录的 opencode 实例仍可连通健康端点，复用；
2. 否则 `stopChild(opencodeChild)` 后 `startOpencode(...)` 重新 spawn；
3. `waitForOpencodeHealthy(client)` 用 OpenCode SDK 的 `/health` 等到就绪；
4. 将 `{ pid, port, baseUrl, startedAt }` 写回 `state.opencode` 并落盘到 `openwork-orchestrator-state.json`。

### 6.4 状态文件落盘

[resolve_orchestrator_data_dir](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/mod.rs#L80-L98)：

```
OPENWORK_DATA_DIR 环境变量（非空）
  ↓ 否则
~/.openwork/openwork-orchestrator
```

目录下常见文件：

| 文件 | 作者 | 内容 |
|------|------|------|
| `openwork-orchestrator-state.json` | orchestrator 守护进程 | `daemon / opencode / cliVersion / workspaces / activeId / sidecar / binaries` |
| `openwork-orchestrator-auth.json` | Tauri Rust | `opencodeUsername / opencodePassword / projectDir / updatedAt` — 冷启后 Tauri 可复用凭据 attach |

---

## 7. openwork-server：文件系统 API 与远端入口

### 7.1 Rust 端 spawn

[start_openwork_server](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L304-L431)：

1. `remote_access_enabled ? "0.0.0.0" : "127.0.0.1"` 决定是否允许 LAN 接入；
2. `read_preferred_openwork_port(active_workspace)`：
   - 先查 `openwork-server-state.json` 的 `workspace_ports[{workspaceKey}]`；
   - 否则回退到单机 `preferred_port`（历史遗产，v3 schema 会把 legacy 固定 8787 迁移为空）；
3. `reserved_openwork_ports` 把其它 workspace 的端口排除，避免抢占；
4. [resolve_openwork_port](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/spawn.rs#L30-L66) 三级尝试：
   - ① preferred_port 可用且未被保留 → 用它；
   - ② 在 `48_000..=51_000` 范围内从随机起点线性探测；
   - ③ 都失败则回退到 ephemeral 端口；
5. [load_or_create_workspace_tokens](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L195-L223) 读 / 生成 `{ clientToken, hostToken, ownerToken? }`，落盘到 `openwork-server-tokens.json`；
6. [spawn_openwork_server](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/spawn.rs#L162-L220) 启动：
   - 固定参数：`--host --port --cors "*" --approval auto`；
   - 每个 `workspace_path` 追加一个 `--workspace` 参数；
   - `--opencode-base-url {opencode_base_url}` + `--opencode-directory {active_workspace}`；
   - env：`OPENWORK_TOKEN=clientToken`、`OPENWORK_HOST_TOKEN=hostToken`、`OPENCODE_ROUTER_HEALTH_PORT`、`OPENWORK_OPENCODE_USERNAME/PASSWORD`；
7. 等待 10s 内 `/health` 返回 2xx（[wait_for_openwork_health](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L248-L268)）；
8. 若 ownerToken 缺失，调用 `POST /tokens` 使用 hostToken 申请一个 scope=owner 的长期 token 并落盘；
9. 构建 connect 信息：`build_urls(port)` 用 `gethostname()` 生成 `.local` mDNS URL，`local_ip()` 生成 LAN URL（仅远程模式下写回 state）。

### 7.2 Bun 端运行态

CLI 入口 [server/src/cli.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/server/src/cli.ts) 调 `startServer(config)` → [server.ts L431](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/server/src/server.ts#L431)：

```
const server = Bun.serve(serverOptions);   // idleTimeout=120
```

路由分类（详见 [./05a-openwork-session-message.md](./05a-openwork-session-message.md)、[./05b-openwork-skill-agent-mcp.md](./05b-openwork-skill-agent-mcp.md)、[./05c-openwork-workspace-fileops.md](./05c-openwork-workspace-fileops.md)）：

- 会话/消息：`/sessions`、`/sessions/:id/message`、`/events`（SSE）；
- 文件：`/files`、`/workspaces/:id/files`；
- skill/agent/mcp：`/skills`、`/agents`、`/mcp/*`；
- 鉴权：`/tokens`；
- **opencode 反向代理**：`/opencode/*` → `config.opencodeBaseUrl`；
- **opencode-router 健康代理**：`/opencode-router/health` → `127.0.0.1:{OPENCODE_ROUTER_HEALTH_PORT}`。

### 7.3 端口持久化

`OPENWORK_SERVER_STATE_VERSION = 3` 的 JSON schema：

```
{
  "version": 3,
  "workspace_ports": { "<workspace-abs-path>": 48123, ... },
  "preferred_port": null
}
```

迁移规则（[load_openwork_server_state](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L105-L128)）：

- v<2 且 `preferred_port == 8787`（legacy 固定端口）→ 置空；
- v<3 同上兜底；
- 每次成功启动后 [persist_preferred_openwork_port](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L177-L193) 会把当前 workspace 的端口写回，保证下次冷启动尽可能同端口，从而让远端客户端的已保存连接仍然可达。

---

## 8. opencode-router：IM bridge + health 探针

### 8.1 Rust 端 spawn

[spawn_opencode_router](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/opencode_router/spawn.rs#L34-L73)：

```
opencode-router serve <workspace_path> [--opencode-url <url>]
env: OPENCODE_ROUTER_HEALTH_PORT=<ephemeral>
     OPENCODE_SERVER_USERNAME / _PASSWORD
     BUN_* overrides
```

端口分配：[resolve_opencode_router_health_port](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/opencode_router/spawn.rs#L12-L18) 始终取 ephemeral，避免多开桌面时互相抢占 `DEFAULT_OPENCODE_ROUTER_HEALTH_PORT = 3005`（该常量在 Rust 端实际不被用于绑定，只作名义默认）。

### 8.2 Bun 端运行态

CLI 入口 [opencode-router/src/cli.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/cli.ts)：

- `start / serve <workspace-path>`：拉 Slack + Telegram bridge（`startBridge` from [bridge.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/bridge.ts)）；
- 若 `config.healthPort` 存在，`startHealthServer(port, getStatus)`（[health.ts L154-L694](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/health.ts#L154-L694)）启动 node http server 监听 `/health`；
- 端口占用时直接抛错：`Failed to start health server on {host}:{port}. Port is in use.`；
- `health` 子命令（非常驻）单次调 OpenCode SDK `global.health()` 然后按 healthy 与否 `process.exit(0|1)`；
- `status` 子命令输出配置摘要（`config path / healthPort / telegram bots / slack apps`）。

### 8.3 健康聚合

Tauri Rust 并不直接访问 `127.0.0.1:{health_port}`，而是：
1. 把 `health_port` 同时作为 env 传给 **openwork-server**；
2. openwork-server 在 `/opencode-router/health` 路由反向代理；
3. UI 或 orchestrator 通过 `GET {openworkBaseUrl}/opencode-router/health` 聚合读取，见 [orchestrator/cli.ts L3425-L3430](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/orchestrator/src/cli.ts#L3425-L3430)。

---

## 9. 通信协议矩阵

| Producer → Consumer | 协议 | 传输细节 | 源码锚点 |
|---|---|---|---|
| UI → Tauri Rust | Tauri IPC | `invoke(cmdName, args)` / `emit(event, payload)` | [invoke_handler](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/lib.rs#L167-L228) |
| Tauri Rust → sidecar | stdio + signal | `tauri_plugin_shell` 的 `CommandChild.kill` + `CommandEvent::Stdout/Stderr/Terminated` | [spawn_engine](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/engine/spawn.rs#L163-L166) |
| Tauri Rust → orchestrator | HTTP | `ureq::get` 轮询 `/health`；优雅关停 `POST /shutdown` | [wait_for_orchestrator](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/mod.rs#L171-L186)、[request_orchestrator_shutdown](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/mod.rs#L188-L211) |
| Tauri Rust → openwork-server | HTTP | `/health` 轮询 + `POST /tokens` 申请 ownerToken | [wait_for_openwork_health](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L248-L268)、[issue_owner_token](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/mod.rs#L270-L287) |
| orchestrator → opencode | 子进程 stdio + HTTP | `stopChild` 信号；`/session /event` 通过 OpenCode SDK | [ensureOpencode](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/orchestrator/src/cli.ts#L5946-L6003) |
| openwork-server → opencode | HTTP（反向代理） | `/opencode/*` 透传 + basic-auth | `--opencode-base-url` / `OPENWORK_OPENCODE_USERNAME/PASSWORD` |
| openwork-server → opencode-router | HTTP | `/opencode-router/*` 反代到 `127.0.0.1:{health_port}` | env `OPENCODE_ROUTER_HEALTH_PORT` |
| opencode-router → opencode | HTTP（SDK） | `@opencode-ai/sdk` 的 `createClient({ baseUrl, directory, headers })` | [opencode-router/src/opencode.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/opencode.ts) |
| 远端客户端 → openwork-server | HTTP + SSE | REST + `/events` server-sent events；CORS `*`；Bearer = clientToken | [Bun.serve](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/server/src/server.ts#L431) |
| Slack/Telegram → opencode-router | Slack Socket Mode / Telegram grammy | bridge.ts 内消息泵 | [bridge.ts](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/bridge.ts) |

---

## 10. 端口与环境变量全景

### 10.1 端口策略

| 组件 | Host | Port 来源 | 覆盖方式 |
|------|------|----------|---------|
| openwork-orchestrator daemon | 127.0.0.1 | `find_free_port()` ephemeral | `--daemon-port` 命令行 / `OPENWORK_DAEMON_PORT` env（orchestrator 端） |
| opencode（Orchestrator 模式） | 127.0.0.1 | Rust 侧 `find_free_port()` 预计算并传给 orchestrator `--opencode-port` | `--opencode-port` |
| opencode（Direct 模式） | 127.0.0.1 | `find_free_port()` ephemeral | — |
| openwork-server | 127.0.0.1 或 0.0.0.0 | 范围 `48_000..=51_000` 优先；否则 ephemeral | `workspace_ports[...]` 或 `preferred_port` 持久化 |
| opencode-router health | 127.0.0.1 | ephemeral（每次冷启新分配） | `OPENCODE_ROUTER_HEALTH_PORT` env（多开互斥） |

**端口冲突回退**：唯一强语义是 openwork-server（见 §7.1 三级尝试）。其它组件若 `listen` 失败会直接启动失败并把错误写入 `last_stderr`（UI 通过 `engine_info` 读取）。

### 10.2 环境变量清单

| Env | 作用 | 消费者 | 注入者 |
|-----|------|-------|--------|
| `OPENWORK_DEV_MODE` | 启用 dev paths / 沙箱化 XDG 目录 | Rust + orchestrator + server | Rust debug build 自动；手动 `=1` |
| `OPENWORK_DATA_DIR` | 覆盖 orchestrator data dir | Rust | 用户/CI |
| `OPENWORK_ORCHESTRATOR_START_TIMEOUT_MS` | daemon 健康等待超时（≥1000） | Rust [engine.rs L503-L507](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L503-L507) | 用户 |
| `OPENCODE_CLIENT=openwork` / `OPENWORK=1` | 让 OpenCode 感知自己跑在 OpenWork 壳内 | opencode | Rust `spawn_engine` |
| `OPENCODE_SERVER_USERNAME` / `_PASSWORD` | opencode HTTP basic-auth | opencode | Rust（Direct + opencode-router 透传） |
| `OPENWORK_OPENCODE_USERNAME` / `_PASSWORD` | basic-auth 同一对凭据，换名注入给 orchestrator / openwork-server | orchestrator + openwork-server | Rust |
| `OPENWORK_INTERNAL_ALLOW_OPENCODE_CREDENTIALS=1` | 守护进程内部授权读取凭据 | orchestrator | Rust `spawn_orchestrator_daemon` |
| `OPENCODE_ENABLE_EXA=1` | 启用 Exa 搜索 plugin | opencode | Rust（由 UI 的 `opencode_enable_exa` 决定） |
| `OPENWORK_TOKEN` / `OPENWORK_HOST_TOKEN` | 客户端/主机端 bearer token | openwork-server | Rust `spawn_openwork_server` |
| `OPENCODE_ROUTER_HEALTH_PORT` | opencode-router 健康端口 | openwork-server + opencode-router | Rust（ephemeral） |
| `XDG_CONFIG_HOME` / `XDG_DATA_HOME` / `XDG_CACHE_HOME` / `XDG_STATE_HOME` / `OPENCODE_CONFIG_DIR` | dev 模式沙箱隔离 | opencode | Rust [resolve_dev_mode_paths](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/engine/spawn.rs#L23-L52) |
| `OPENCODE_BIN_PATH` | 覆盖 opencode 二进制解析 | Rust `engine_doctor` / `engine_start` | UI（EnvVarGuard 作用域内生效） |
| `BUN_*` overrides | Bun 单文件二进制所需 | 所有 Bun sidecar | Rust [bun_env_overrides](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/bun_env.rs) |

---

## 11. 关停与清理

### 11.1 App 退出路径

[lib.rs L235-L265](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/lib.rs#L235-L265) 监听 `RunEvent::ExitRequested` 和 `RunEvent::Exit`，统一回调 `stop_managed_services`：

```
stop_managed_services(app_handle)
  ├─ EngineManager::stop_locked         # kill opencode 子进程（Direct 模式才有 child）
  ├─ OrchestratorManager::stop_locked   # 先 POST /shutdown 优雅，失败再 kill
  ├─ OpenworkServerManager::stop_locked # 直接 kill
  └─ OpenCodeRouterManager::stop_locked # 直接 kill
```

### 11.2 orchestrator 优雅关停

[OrchestratorManager::stop_locked](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/orchestrator/manager.rs#L21-L49) 的三步走：

```
① data_dir = state.data_dir 或 resolve_orchestrator_data_dir()
② 调 request_orchestrator_shutdown(data_dir)：
   2a. 从 openwork-orchestrator-state.json 读 daemon.baseUrl
   2b. ureq POST {base_url}/shutdown，1500ms 超时
   2c. 成功返回 true，让 daemon 自己杀 opencode 子进程
③ 若 shutdown_requested == false，则对 child 执行 child.kill()
④ clear_orchestrator_auth(data_dir)：删除 openwork-orchestrator-auth.json
⑤ 清空所有 state 字段
```

### 11.3 engine_stop Tauri 命令

UI 主动调 [engine_stop](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L179-L198)，依次 stop OrchestratorManager → EngineManager → OpenworkServerManager → OpenCodeRouterManager，语义与退出时一致但不清 auth（auth 仅在 App 退出时清）。

### 11.4 macOS 隐藏窗口特殊路径

macOS 下主窗口的 `CloseRequested` 被 `api.prevent_close()` 拦截并改为 `hide_main_window`（[lib.rs L238-L245](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/lib.rs#L238-L245)），此路径**不**触发 sidecar 关停——只有 `ExitRequested` 才会。

---

## 12. 失败与恢复

| 失败场景 | 行为 | 源码锚点 |
|---------|------|---------|
| opencode 立即退出（<2s） | `engine_start` 聚合 stdout/stderr 后返回错误字串 `OpenCode exited immediately with status {code}.\n\nstdout:... stderr:...` | [engine.rs L662-L707](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L662-L707) |
| orchestrator 健康超时 | 返回 `Failed to start orchestrator (waited {timeout}ms): {last_error}` | [engine.rs L509-L512](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L509-L512) |
| opencode-router health 端口被占 | `Failed to start health server on {host}:{port}. Port is in use.` 写入 state.last_stderr | [health.ts L682-L685](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/opencode-router/src/health.ts#L682-L685) |
| openwork-server 健康超时 | `start_openwork_server` 返回错误但**不**阻塞 engine_start；错误写入 EngineManager.last_stderr | [engine.rs L547-L561](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L547-L561) |
| opencode binary 找不到 | 返回包含 `OpenCode CLI not found` + pinned 安装命令 的错误字串，UI 引导用户跑 `engine_install` | [engine.rs L396-L402](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L396-L402) |
| orchestrator 存活跨应用重启 | `engine_info` 走 orchestrator 分支时，用 `read_orchestrator_auth` 从磁盘恢复 basic-auth 凭据 | [engine.rs L147-L174](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/commands/engine.rs#L147-L174) |
| orchestrator 端口冲突自动退让 | openwork-server 的 workspace_ports 会记住上次选中端口；三级回退保证必有结果 | [spawn.rs L30-L66](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/openwork_server/spawn.rs#L30-L66) |

---

## 13. Tauri Command 与运行时的对照

UI 可通过以下 `tauri::command` 操纵 sidecar 运行时：

| Command | 作用 | Manager |
|---------|------|--------|
| `engine_start` | 启动完整栈（orchestrator → opencode → openwork-server → opencode-router） | 四者 |
| `engine_stop` | 停止完整栈 | 四者 |
| `engine_restart` | 用记忆中的 `project_dir` 重走 `engine_start` | 四者 |
| `engine_info` | 读取 EngineManager 快照（Orchestrator 模式下会主动 fetch `/health`） | Engine + Orchestrator |
| `engine_doctor` | 探测 opencode 二进制位置与 `serve --help` 支持性 | — |
| `engine_install` | 非 Windows：`curl -fsSL https://opencode.ai/install | bash` | — |
| `orchestrator_status` | 直接 fetch orchestrator `/health` + `/workspaces` | Orchestrator |
| `orchestrator_workspace_activate` / `orchestrator_instance_dispose` | 对 orchestrator 发控制面 POST | Orchestrator |
| `orchestrator_start_detached` | 独立启动一个非桌面绑定的 orchestrator（给沙箱/CI 用） | Orchestrator |
| `openwork_server_info` / `openwork_server_restart` | 快照 / 重启 openwork-server | OpenworkServer |
| `opencodeRouter_start` / `opencodeRouter_stop` / `opencodeRouter_status` / `opencodeRouter_info` / `opencodeRouter_config_set` | opencode-router 运维 | OpenCodeRouter |

完整注册表见 [invoke_handler!](file:///Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/apps/desktop/src-tauri/src/lib.rs#L167-L228)。

---

## 14. Direct vs Orchestrator 运行时对照

| 维度 | Direct | Orchestrator |
|------|--------|--------------|
| opencode 生命周期主 | Tauri Rust | openwork-orchestrator |
| opencode 重启策略 | UI 调 `engine_restart` | orchestrator `ensureOpencode` 健康检查失败自动重启 |
| opencode basic-auth | Rust 现生成 | Rust 生成后 `write_orchestrator_auth` 落盘，冷启可复用 |
| 可跨 App 重启存活 | 否 | 是（orchestrator 是独立守护进程） |
| 端口管理 | ephemeral（退出即释放） | ephemeral + state.json 记录，状态文件驱动 |
| 多 workspace 并行 | 单 workspace | 支持（`/workspaces` 控制面） |
| 关停 | `child.kill()` | 优先 `POST /shutdown`，失败回退 `kill` |

**结论**：桌面 UI 的默认路径是 Orchestrator，Direct 仅作回退/调试。

---

## 15. 本篇不覆盖

以下内容在其它文档展开，避免重复：

| 话题 | 去处 |
|------|------|
| opencode-router / openwork-server HTTP 协议字段 | [./05a-openwork-session-message.md](./05a-openwork-session-message.md)、[./05c-openwork-workspace-fileops.md](./05c-openwork-workspace-fileops.md) |
| MCP sidecar 注册链路 | [./05b-openwork-skill-agent-mcp.md](./05b-openwork-skill-agent-mcp.md) |
| 模型与 provider 环境变量 | [./05d-openwork-model-provider.md](./05d-openwork-model-provider.md) |
| 权限与 approval 决策 | [./05e-openwork-permission-question.md](./05e-openwork-permission-question.md) |
| 设置与持久化键表 | [./05f-openwork-settings-persistence.md](./05f-openwork-settings-persistence.md) |
| 四层 Provider 与 UI 状态流 | [./05h-openwork-state-architecture.md](./05h-openwork-state-architecture.md) |
| xingjing 与 OpenWork 的 bridge 契约 | [./06-openwork-bridge-contract.md](./06-openwork-bridge-contract.md) |
| xingjing-server（Go） | 不在本文档集范围 |
