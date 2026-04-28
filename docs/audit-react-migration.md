# audit-react-migration · SolidJS → React 迁移参考手册

> 本文档是所有其他 docs/ 文档改写的**唯一参考基准**。所有结论均从实际代码中提取；不引用任何已废弃的旧文档内容。

---

## 1. 迁移摘要

| 时间线 | 关键事件 |
|---|---|
| v0.11.x | 主分支基于 SolidJS + `@solidjs/router` |
| v0.12.0 | 完整迁移至 React 19 + React Router 7 + Zustand + React Query（`b5882f88` 提交：`chore: sync upstream openwork dev (v0.12.0, Tauri→Electron migration)`） |
| 当前状态 | 仓库 `master` 分支已是纯 React 19 代码库；SolidJS 代码**已完全移除** |

迁移涵盖：

- 前端框架：`solid-js` → `react` ^19.1.1
- 路由：`@solidjs/router` → `react-router-dom` ^7.14.1
- 全局状态：`createStore`（Solid） → `zustand` ^5.0.12
- 服务端状态：`createResource`（Solid） → `@tanstack/react-query` ^5.90.3
- 虚拟列表：`@tanstack/solid-virtual` → `@tanstack/react-virtual` ^3.13.23
- 图标库：`lucide-solid` → `lucide-react` ^0.577.0
- 入口文件：`apps/app/src/index.tsx` → `apps/app/src/index.react.tsx`

---

## 2. 符号映射表（完整）

### 2.1 核心框架 primitives

| 旧符号（SolidJS） | 新符号（React 19） |
|---|---|
| `createSignal<T>()` | `useState<T>()` |
| `createStore<T>()` | `useState<T>()` 或 `useReducer<T>()` |
| `createMemo(fn)` | `useMemo(fn, deps)` |
| `createEffect(fn)` | `useEffect(fn, deps)` |
| `createContext()` | `createContext()` |
| `useContext(ctx)` | `useContext(ctx)` |
| `onMount(fn)` | `useEffect(fn, [])` |
| `onCleanup(fn)` | `useEffect(() => fn, deps)` 返回值 |
| `createResource(fetcher)` | `useQuery({ queryFn: fetcher })` |
| `<For each={list}>` | `list.map(item => <...>)` |
| `<Show when={cond}>` | `{cond && <...>}` 或 `{cond ? <A/> : <B/>}` |
| `<Switch>/<Match when>` | `if/else` 或 ternary JSX |
| `<Suspense>` | `<Suspense>` （React 原生） |
| `<ErrorBoundary>` | class `ErrorBoundary` 或第三方 `react-error-boundary` |
| `Component<Props>` | `FC<Props>` 或 `(props: Props) => ReactNode` |
| `ParentProps` | `{ children: ReactNode }` |
| `JSX.Element` | `ReactNode` |

### 2.2 路由

| 旧符号（@solidjs/router） | 新符号（react-router-dom v7） |
|---|---|
| `<Router>` | `<HashRouter>` / `<BrowserRouter>` |
| `<Route path="/x" component={C}/>` | `<Route path="/x" element={<C/>}/>` |
| `useNavigate()` | `useNavigate()` |
| `useLocation()` | `useLocation()` |
| `useParams()` | `useParams()` |
| `<A href="/x">` | `<Link to="/x">` |
| `<Navigate href="/x"/>` | `<Navigate to="/x" replace/>` |

### 2.3 主要上下文文件

| 旧路径（已删除） | 新路径（现存） | 说明 |
|---|---|---|
| `apps/app/src/app/context/global-sdk.tsx` | `apps/app/src/react-app/kernel/global-sdk-provider.tsx` | SDK 客户端 + SSE 事件流 |
| `apps/app/src/app/context/global-sync.tsx` | `apps/app/src/react-app/kernel/global-sync-provider.tsx` | 全局状态同步（health/config/provider/mcp/lsp/workspace） |
| `apps/app/src/app/context/session.ts` | `apps/app/src/react-app/domains/session/sync/` | 会话与消息状态（拆分为 session-sync.ts、actions-store.ts 等） |
| `apps/app/src/app/context/workspace.ts` | `apps/app/src/react-app/kernel/store.ts` | Zustand store（server state / activeWorkspaceId / selectedSessionId） |
| `apps/app/src/app/entry.tsx` | `apps/app/src/react-app/shell/providers.tsx` | Provider 链（AppProviders） |
| `apps/app/src/app/app.tsx` | `apps/app/src/react-app/shell/app-root.tsx` | 路由根组件（AppRoot） |
| `apps/app/src/index.tsx` | `apps/app/src/index.react.tsx` | 应用入口，ReactDOM.createRoot |

### 2.4 依赖包

| 旧依赖 | 新依赖 |
|---|---|
| `solid-js` | `react` ^19.1.1、`react-dom` ^19.1.1 |
| `@solidjs/router` | `react-router-dom` ^7.14.1 |
| `lucide-solid` | `lucide-react` ^0.577.0 |
| `@solid-primitives/event-bus` | `react` 原生 `useEffect` + `useRef` 自定义事件系统 |
| `@solid-primitives/storage` | `zustand` ^5.0.12 + `localStorage` 直接读写 |
| `@tanstack/solid-virtual` | `@tanstack/react-virtual` ^3.13.23 |
| `@tanstack/solid-query` | `@tanstack/react-query` ^5.90.3 |

---

## 3. 目录映射（旧路径 → 新路径）

| 旧路径（已删除） | 新路径（现存） |
|---|---|
| `apps/app/src/app/context/` | `apps/app/src/react-app/kernel/`（全局 Provider）<br/>`apps/app/src/react-app/domains/*/sync/`（领域状态） |
| `apps/app/src/app/xingjing/` | **已完全移除**（见第 4 节） |
| `apps/app/src/app/pages/` | `apps/app/src/react-app/shell/`（路由组件） |
| `apps/app/src/app/components/` | `apps/app/src/react-app/domains/`（各领域 UI 组件） |
| `apps/app/src/app/lib/` | `apps/app/src/app/lib/`（**保留，部分仍存在**） |
| `apps/app/src/app/stores/` | `apps/app/src/react-app/kernel/store.ts`（Zustand） |
| `apps/app/src/index.tsx` | `apps/app/src/index.react.tsx` |

### 3.1 现存顶层目录（apps/app/src/）

```
apps/app/src/
├── index.react.tsx          ← 应用入口
├── app/                     ← 共用 lib/utils/types（非组件层）
│   ├── lib/                 ← opencode.ts、openwork-server.ts 等底层工具
│   ├── utils/
│   ├── types.ts
│   ├── constants.ts
│   └── index.css
├── i18n/                    ← 国际化
├── react-app/               ← React 组件层（主体）
│   ├── kernel/              ← 全局 Provider + Zustand store
│   ├── shell/               ← AppRoot、AppProviders、路由
│   ├── domains/             ← 领域组件（session/workspace/settings/cloud/…）
│   ├── infra/               ← queryClient 等基础设施
│   └── design-system/       ← 共享 UI 原语
└── styles/
```

### 3.2 react-app/kernel/ 文件清单

| 文件 | 职责 |
|---|---|
| `global-sdk-provider.tsx` | SDK 客户端实例 + SSE 事件流（`createOpencodeClient`） |
| `global-sync-provider.tsx` | 全局 health/config/provider/mcp/lsp/project/vcs 同步 |
| `local-provider.tsx` | 本地 UI 偏好（showThinking/defaultModel/releaseChannel/view/tab） |
| `server-provider.tsx` | 服务器 URL 管理 + 健康检查 |
| `store.ts` | Zustand store（`useOpenworkStore`）：server state、activeWorkspaceId、selectedSessionId |
| `platform.tsx` | 运行时平台抽象（desktop/web 的 fetch 差异） |
| `selectors.ts` | 常用 store selectors |
| `system-state.ts` | 系统级状态工具 |
| `model-config.ts` | 默认模型读取 |

### 3.3 react-app/domains/ 子目录

| 子目录 | 职责 |
|---|---|
| `session/` | 会话列表、聊天 UI、消息流、工具调用 |
| `workspace/` | 工作区创建/切换/共享 |
| `settings/` | 设置页面 |
| `cloud/` | Den 认证、桌面配置、限制提示 |
| `connections/` | 服务器连接管理 |
| `shell-feedback/` | 全局 feedback / toast |
| `bundles/` | bundle 相关 |

---

## 4. 已完全移除的文件与目录

以下路径在 v0.12.0 迁移后**不再存在**，所有旧文档中引用这些路径均需更新：

| 已删除路径 | 替代位置 |
|---|---|
| `apps/app/src/index.tsx` | `apps/app/src/index.react.tsx` |
| `apps/app/src/app/entry.tsx` | `apps/app/src/react-app/shell/providers.tsx` |
| `apps/app/src/app/app.tsx` | `apps/app/src/react-app/shell/app-root.tsx` |
| `apps/app/src/app/context/` | `apps/app/src/react-app/kernel/` + `domains/*/sync/` |
| `apps/app/src/app/xingjing/` | **完全移除**，星静模块需重新设计为集成进 OpenWork 原生页面 |
| `apps/app/src/app/pages/xingjing-native.tsx` | 无直接替代；星静将集成进 `/session` 和 `/settings` 等现有路由 |
| `apps/app/src/app/stores/` | `apps/app/src/react-app/kernel/store.ts` |
| `apps/app/src/app/components/` | `apps/app/src/react-app/domains/` |

---

## 5. Provider 链变化

### 旧（SolidJS，entry.tsx，4 层）

```tsx
// apps/app/src/app/entry.tsx（已删除）
<ServerProvider>
  <GlobalSDKProvider>
    <GlobalSyncProvider>
      <LocalProvider>
        <App />
      </LocalProvider>
    </GlobalSyncProvider>
  </GlobalSDKProvider>
</ServerProvider>
```

### 新（React，providers.tsx + index.react.tsx，多层）

```tsx
// apps/app/src/index.react.tsx
<React.StrictMode>
  <QueryClientProvider client={queryClient}>
    <PlatformProvider value={platform}>
      <AppProviders>          {/* apps/app/src/react-app/shell/providers.tsx */}
        <Router>
          <AppRoot />          {/* apps/app/src/react-app/shell/app-root.tsx */}
        </Router>
      </AppProviders>
    </PlatformProvider>
  </QueryClientProvider>
</React.StrictMode>
```

`AppProviders` 内部展开（`apps/app/src/react-app/shell/providers.tsx`）：

```tsx
<BootStateProvider>
  <ServerProvider defaultUrl={defaultUrl}>
    <DesktopRuntimeBoot />
    <DenAuthProvider>
      <DesktopConfigProvider>
        <RestrictionNoticeProvider>
          <LocalProvider>
            <ReloadCoordinatorProvider>
              {children}
            </ReloadCoordinatorProvider>
          </LocalProvider>
        </RestrictionNoticeProvider>
      </DesktopConfigProvider>
    </DenAuthProvider>
    <MigrationPrompt />
  </ServerProvider>
</BootStateProvider>
```

**注意**：`GlobalSDKProvider` 和 `GlobalSyncProvider` 在新架构中**不再**位于 `providers.tsx` 顶层，而是由需要它们的叶子组件（如 `SessionRoute`）按需引入或由 `kernel/` 中的 hooks 懒加载。

---

## 6. 星静（Xingjing）集成策略变更

| 项目 | 旧方案（SolidJS 时代） | 新方案（React 19） |
|---|---|---|
| 源码位置 | `apps/app/src/app/xingjing/`（已删除） | 待设计，集成进 OpenWork 原生 React 页面 |
| 路由方式 | `/xingjing` 独立路由，`XingjingNativePage` | 无独立路由；集成进 `/session`、`/settings` 等现有路由 |
| 上下文注入 | `XingjingOpenworkContext` + 24 个 props 透传 | 直接使用 `useOpenworkStore`、`useGlobalSDK`、`useGlobalSync` |
| Bridge 单例 | `xingjing-bridge.ts`、`opencode-client.ts`（setSharedClient） | 直接调用 `react-app/kernel/` 中的 hooks |
| 事件流接入 | `XingjingOpenworkContext.events` | `useGlobalSDK().event` |

---

## 7. 关键 SDK 入口不变

以下文件在迁移前后**路径和职责均未改变**，各文档可继续引用：

| 文件 | 说明 |
|---|---|
| `apps/app/src/app/lib/opencode.ts` | `createClient`、`waitForHealthy`、`unwrap` |
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri 配置，版本 0.12.0，5 个 sidecar 声明 |
| `apps/app/package.json` | 依赖清单，版本 0.12.0 |
