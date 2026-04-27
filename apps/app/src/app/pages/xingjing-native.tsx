/**
 * 星静 SolidJS 原生集成版
 *
 * 直接在 openwork 主应用内以原生 SolidJS 组件渲染星静，
 * 使用嵌套 Router (base="/xingjing") 处理子路由，
 * 无需 iframe，实现深度融合。
 *
 * 认证守卫：onMount 时校验 xingjing-server token，
 * 未登录则渲染 AuthPage，登录后进入主应用。
 */
import { lazy, Suspense, createSignal, createMemo, onMount, Show } from 'solid-js';
import { Router, Route, useNavigate } from '@solidjs/router';
import { AppStoreProvider, type XingjingOpenworkContext } from '../xingjing/stores/app-store';
import MainLayout, { BackNavigationContext } from '../xingjing/components/layouts/main-layout';
import { checkAuth, currentUser } from '../xingjing/services/auth-service';
import AuthPage from '../xingjing/pages/auth';
import type { OpenworkServerClient, OpenworkCommandItem, OpenworkAuditEntry } from '../lib/openwork-server';
import type { createClient } from '../lib/opencode';
import type { MessageWithParts } from '../types';
import type { NavigationTarget } from '../xingjing/services/xingjing-bridge';

// 团队版页面（已迁移至 pages/team/ 目录）
const Autopilot = lazy(() => import('../xingjing/pages/team/autopilot'));
const Dashboard = lazy(() => import('../xingjing/pages/team/dashboard'));
const AgentWorkshop = lazy(() => import('../xingjing/pages/team/agent-workshop'));
const RequirementWorkshop = lazy(() => import('../xingjing/pages/team/requirements'));
const PRDEditor = lazy(() => import('../xingjing/pages/team/requirements/prd-editor'));
const ProductPlanning = lazy(() => import('../xingjing/pages/team/planning'));
const DesignWorkshop = lazy(() => import('../xingjing/pages/team/design'));
const DevWorkshop = lazy(() => import('../xingjing/pages/team/dev'));
const PRSubmit = lazy(() => import('../xingjing/pages/team/dev/pr-submit'));
const SprintCenter = lazy(() => import('../xingjing/pages/team/sprint'));
const SprintPlan = lazy(() => import('../xingjing/pages/team/sprint/sprint-plan'));
const QualityCenter = lazy(() => import('../xingjing/pages/team/quality'));
const ReleaseOps = lazy(() => import('../xingjing/pages/team/release-ops'));
const KnowledgeCenter = lazy(() => import('../xingjing/pages/team/knowledge'));
const Settings = lazy(() => import('../xingjing/pages/settings'));

// 独立版 Solo 页面
const SoloAutopilot = lazy(() => import('../xingjing/pages/solo/autopilot'));
const SoloFocus = lazy(() => import('../xingjing/pages/solo/focus'));
const SoloProduct = lazy(() => import('../xingjing/pages/solo/product'));
const SoloBuild = lazy(() => import('../xingjing/pages/solo/build'));
const SoloRelease = lazy(() => import('../xingjing/pages/solo/release'));
const SoloReview = lazy(() => import('../xingjing/pages/solo/review'));
const SoloKnowledge = lazy(() => import('../xingjing/pages/solo/knowledge'));
const SoloAgentWorkshop = lazy(() => import('../xingjing/pages/solo/agent-workshop'));

interface XingjingNativePageProps {
  /** OpenWork 服务客户端，用于查找 workspace、读写 Skill/Config */
  openworkServerClient?: OpenworkServerClient | null;
  /** OpenWork 连接状态 */
  openworkServerStatus?: () => 'connected' | 'disconnected' | 'limited';
  /** OpenWork 已初始化的 OpenCode client（复用） */
  opencodeClient?: ReturnType<typeof createClient> | null;
  /** OpenWork 当前选中的模型 */
  selectedModel?: () => { providerID: string; modelID: string } | null;
  /** OpenWork 全局 SSE 维护的 session 状态映射（复用） */
  sessionStatusById?: () => Record<string, string>;
  // ── SDD-010：Provider/Model 状态透传 ──
  /** OpenWork 已连接的 Provider ID 列表（响应式） */
  providerConnectedIds?: () => string[];
  /** OpenWork 动态模型选项列表（含连接状态、推荐标记） */
  modelOptions?: () => Array<{
    providerID: string; modelID: string; title: string;
    isConnected: boolean; isRecommended?: boolean;
  }>;
  /** 通过 OpenWork Provider Store 提交 API Key */
  submitProviderApiKey?: (providerId: string, apiKey: string) => Promise<string>;
  // ── SDD-015：OpenWork 全局 session store 消息读取 ──
  messagesBySessionId?: (id: string | null) => MessageWithParts[];
  ensureSessionLoaded?: (id: string) => Promise<void>;
  // ── 导航回调：跳转到 OpenWork 原生页面 ──
  navigateTo?: (target: NavigationTarget) => void;
  /** 星静页面的完整可访问 URL（由外层 app.tsx 计算并传入） */
  xingjingUrl?: () => string | null;
  /** OpenWork Server 解析后的 BaseURL（响应式 accessor，随 settings 更新） */
  openworkServerBaseUrl?: () => string | null;
  /** 触发 OpenWork 重连 */
  reconnectOpenworkServer?: () => Promise<boolean>;
  /** 更新 OpenWork 连接设置 */
  updateOpenworkServerSettings?: (next: { urlOverride?: string; portOverride?: number; token?: string; [k: string]: unknown }) => void;
  /** 当前 OpenWork token（用于展示） */
  currentOpenworkToken?: () => string | null;
  // ── 内嵌 OpenWork 原生视图所需 ──
  /** OpenWork Server URL（IdentitiesView 显示用） */
  openworkServerUrl?: string;
  /** OpenWork 重连中标记 */
  openworkReconnectBusy?: boolean;
  /** 重启本地 Server */
  restartLocalServer?: () => Promise<boolean>;
  /** OpenWork runtime workspace ID */
  runtimeWorkspaceId?: string | null;
  /** 开发者模式 */
  developerMode?: boolean;
  /** 重载 workspace engine */
  reloadWorkspaceEngine?: () => Promise<void>;
  /** 重载中标记 */
  reloadBusy?: boolean;
  /** 是否可重载 workspace */
  canReloadWorkspace?: boolean;
  /** 确保 OpenCode client 可用（无 workspace 时按需创建） */
  ensureClient?: () => Promise<boolean>;
}

export default function XingjingNativePage(props: XingjingNativePageProps) {
  // 使用外层 Router 的 navigate，通过 Context 传入 MainLayout 的返回按钟
  const outerNavigate = useNavigate();

  // 构建 XingjingOpenworkContext，将 OpenWork 能力注入到星静内部
  //
  // ⚠️ 关键设计：此 memo 只依赖 openworkServerClient 的「有/无」布尔状态，
  // 不依赖 openworkServerStatus / opencodeClient 等其它 prop。
  // 这样可以避免 OpenWork 状态频繁切换（connected ↔ limited ↔ reconnecting）
  // 时，下游 createMemo 反复返回新对象引用，导致 AppStoreProvider 内的
  // initBridge/destroyBridge、setSharedClient 等 effect 反复销毁重建，
  // 出现日志反复刷出「Bridge 已销毁」「OpenWork Client 未就绪」的现象。
  //
  // ctx 对象内部所有方法通过闭包动态读取最新 props，因此即使对象引用稳定，
  // 仍能拿到最新的 client / status / model 等响应式值。
  const hasOpenworkClient = createMemo(() => !!props.openworkServerClient);
  const openworkCtx = createMemo<XingjingOpenworkContext | undefined>(() =>
    hasOpenworkClient()
      ? {
          resolveWorkspaceByDir: async (productDir: string) => {
            const list = await props.openworkServerClient!.listWorkspaces().catch(() => null);
            const match = list?.items?.find((w) => w.path === productDir)
              ?? list?.workspaces?.find((w) => w.path === productDir);
            return match?.id ?? null;
          },
          serverStatus: () => props.openworkServerStatus?.() ?? 'disconnected',
          opencodeClient: () => props.opencodeClient ?? null,
          selectedModel: () => props.selectedModel?.() ?? null,
          sessionStatusById: props.sessionStatusById ?? (() => ({})),
          listSkills: (workspaceId) =>
            props.openworkServerClient!.listSkills(workspaceId)
              .then((r) => r.items).catch(() => []),
          getSkill: (workspaceId, name) =>
            props.openworkServerClient!.getSkill(workspaceId, name).catch(() => null),
          upsertSkill: (workspaceId, name, content, description) =>
            props.openworkServerClient!.upsertSkill(workspaceId, { name, content, description })
              .then(() => true).catch(() => false),
          readOpencodeConfig: (workspaceId) =>
            props.openworkServerClient!.readOpencodeConfigFile(workspaceId, 'project').catch(() => null),
          writeOpencodeConfig: (workspaceId, content) =>
            props.openworkServerClient!.writeOpencodeConfigFile(workspaceId, 'project', content)
              .then(() => true).catch(() => false),
          createWorkspaceByDir: async (productDir: string, productName: string) => {
            // 创建 OpenWork 本地工作区
            await props.openworkServerClient!.createLocalWorkspace({
              folderPath: productDir,
              name: productName,
              preset: 'starter',
            }).catch(() => null);
            // 创建后重新查询列表以获取新工作区 ID
            const list = await props.openworkServerClient!.listWorkspaces().catch(() => null);
            const match = list?.items?.find((w) => w.path === productDir)
              ?? list?.workspaces?.find((w) => w.path === productDir);
            return match?.id ?? null;
          },
          activateWorkspaceById: async (workspaceId: string) => {
            // 先查询当前活跃 workspace，若已是目标则短路，避免无谓的 POST
            // 触发 OpenWork host 端 client() 重建、SSE 重连等副作用
            try {
              const list = await props.openworkServerClient!.listWorkspaces().catch(() => null);
              if (list?.activeId === workspaceId) return true;
            } catch { /* ignore */ }
            try {
              await props.openworkServerClient!.activateWorkspace(workspaceId);
              return true;
            } catch {
              return false;
            }
          },
          listMcp: (workspaceId) =>
            props.openworkServerClient!.listMcp(workspaceId)
              .then((r) => r.items.map((i) => ({ name: i.name, config: i.config }))).catch(() => []),
          addMcp: (workspaceId, payload) =>
            props.openworkServerClient!.addMcp(workspaceId, payload)
              .then(() => true).catch(() => false),
          removeMcp: (workspaceId, name) =>
            props.openworkServerClient!.removeMcp(workspaceId, name)
              .then(() => true).catch(() => false),
          logoutMcpAuth: (workspaceId, name) =>
            props.openworkServerClient!.logoutMcpAuth(workspaceId, name)
              .then(() => true).catch(() => false),
          readWorkspaceFile: (workspaceId, path) =>
            props.openworkServerClient!.readWorkspaceFile(workspaceId, path)
              .then((r) => ({ content: r.content })).catch(() => null),
          writeWorkspaceFile: (workspaceId, payload) =>
            props.openworkServerClient!.writeWorkspaceFile(workspaceId, payload)
              .then((r) => r.ok).catch(() => false),
          deleteSession: (workspaceId, sessionId) =>
            props.openworkServerClient!.deleteSession(workspaceId, sessionId)
              .then((r) => r.ok).catch(() => false),
          listHubSkills: () =>
            props.openworkServerClient!.listHubSkills()
              .then((r) => r.items.map((i) => ({ name: i.name, description: i.description }))).catch(() => []),
          installHubSkill: (workspaceId, name) =>
            props.openworkServerClient!.installHubSkill(workspaceId, name)
              .then((r) => r.ok).catch(() => false),
          reloadEngine: (workspaceId) =>
            props.openworkServerClient!.reloadEngine(workspaceId)
              .then((r) => r.ok).catch(() => false),
          // SDD-010: Provider/Model 状态透传
          providerConnectedIds: () => props.providerConnectedIds?.() ?? [],
          modelOptions: () => props.modelOptions?.() ?? [],
          submitProviderApiKey: props.submitProviderApiKey ?? (async () => ''),
          listCommands: (workspaceId: string) =>
            props.openworkServerClient!.listCommands(workspaceId)
              .then((r) => r.items as OpenworkCommandItem[]).catch(() => []),
          listAudit: (workspaceId: string, limit?: number) =>
            props.openworkServerClient!.listAudit(workspaceId, limit)
              .then((r) => r.items as OpenworkAuditEntry[]).catch(() => []),
          listDir: (absPath: string) =>
            props.openworkServerClient!.readdir(absPath).catch(() => null),
          listScheduledJobs: (workspaceId: string) =>
            props.openworkServerClient!.listScheduledJobs(workspaceId)
              .then((r) => r.items).catch(() => []),
          deleteScheduledJob: (workspaceId: string, name: string) =>
            props.openworkServerClient!.deleteScheduledJob(workspaceId, name)
              .then(() => undefined).catch(() => undefined),
          // SDD-015: 全局 store 消息读取
          messagesBySessionId: props.messagesBySessionId,
          ensureSessionLoaded: props.ensureSessionLoaded,
          // 导航回调
          navigateTo: props.navigateTo,
          // OpenWork Server 访问地址（优先使用响应式 baseUrl accessor，fallback 到 client.baseUrl）
          serverBaseUrl: props.openworkServerBaseUrl ?? (() => props.openworkServerClient?.baseUrl ?? null),
          // 星静页面完整 URL
          xingjingUrl: props.xingjingUrl ?? (() => null),
          // 连接配置回调
          reconnect: props.reconnectOpenworkServer,
          updateOpenworkSettings: props.updateOpenworkServerSettings
            ? (next: { urlOverride: string; token: string }) =>
                props.updateOpenworkServerSettings!({ urlOverride: next.urlOverride, token: next.token })
            : undefined,
          currentOpenworkToken: props.currentOpenworkToken,
          // 内嵌 OpenWork 原生视图所需
          openworkServerUrl: props.openworkServerUrl,
          openworkReconnectBusy: props.openworkReconnectBusy,
          restartLocalServer: props.restartLocalServer,
          openworkRuntimeWorkspaceId: props.runtimeWorkspaceId,
          developerMode: props.developerMode,
          reloadWorkspaceEngine: props.reloadWorkspaceEngine,
          reloadBusy: props.reloadBusy,
          canReloadWorkspace: props.canReloadWorkspace,
          // OpenWork 原生 ensureClient 能力透传
          ensureClient: props.ensureClient,
        }
      : undefined
  );

  // ── 认证状态 ────────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = createSignal(false);

  onMount(() => {
    checkAuth().finally(() => setAuthChecked(true));
  });

  // ── 认证守卫 ────────────────────────────────────────────────────────────────
  return (
    <Show
      when={authChecked()}
      fallback={
        <div class="flex items-center justify-center h-screen bg-[var(--dls-app-bg)] text-gray-10 text-sm">
          验证身份中...
        </div>
      }
    >
      <Show
        when={currentUser()}
        fallback={<AuthPage onSuccess={() => setAuthChecked(true)} />}
      >
        <XingjingApp outerNavigate={outerNavigate} openworkCtx={openworkCtx()} />
      </Show>
    </Show>
  );
}

// ── Inner app (only rendered when authenticated) ────────────────────────────────

function XingjingApp(props: { outerNavigate: ReturnType<typeof useNavigate>; openworkCtx?: XingjingOpenworkContext }) {
  const outerNavigate = props.outerNavigate;

  return (
    <div class="flex flex-col h-screen bg-[var(--dls-app-bg)] text-gray-12">
      {/* 顶部固定栏 */}
      <header class="flex items-center gap-4 border-b border-[var(--dls-border)] px-4 py-2 shrink-0">
        <button
          class="flex items-center gap-1 text-gray-10 hover:text-gray-12 text-sm transition-colors"
          onClick={() => outerNavigate('/mode-select')}
          data-testid="back-to-mode-select"
        >
          ← 返回模式选择
        </button>
        <span class="text-lg">🌙</span>
        <span class="font-semibold text-purple-11 text-base">星静</span>
        <span class="text-gray-10 text-sm">All-in-One 研发平台</span>
      </header>

      {/* 原生 SolidJS 星静 */}
      <div class="flex-1 overflow-hidden">
        <BackNavigationContext.Provider value={() => outerNavigate('/mode-select')}>
          <AppStoreProvider openworkCtx={props.openworkCtx}>
            <Suspense fallback={
              <div class="flex items-center justify-center h-full bg-gray-50 text-gray-500 text-sm">
                加载中...
              </div>
            }>
              <Router base="/xingjing" root={MainLayout}>
                {/* 团队版路由 */}
                <Route path="/" component={Autopilot} />
                <Route path="/autopilot" component={Autopilot} />
                <Route path="/planning" component={ProductPlanning} />
                <Route path="/requirements" component={RequirementWorkshop} />
                <Route path="/requirements/edit/:id" component={PRDEditor} />
                <Route path="/design" component={DesignWorkshop} />
                <Route path="/dev" component={DevWorkshop} />
                <Route path="/dev/pr/:taskId" component={PRSubmit} />
                <Route path="/sprint" component={SprintCenter} />
                <Route path="/sprint/plan" component={SprintPlan} />
                <Route path="/quality" component={QualityCenter} />
                <Route path="/release-ops" component={ReleaseOps} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/knowledge" component={KnowledgeCenter} />
                <Route path="/agent-workshop" component={AgentWorkshop} />
                <Route path="/settings" component={Settings} />

                {/* 独立版 Solo 路由 */}
                <Route path="/solo" component={SoloAutopilot} />
                <Route path="/solo/autopilot" component={SoloAutopilot} />
                <Route path="/solo/focus" component={SoloFocus} />
                <Route path="/solo/product" component={SoloProduct} />
                <Route path="/solo/build" component={SoloBuild} />
                <Route path="/solo/release" component={SoloRelease} />
                <Route path="/solo/review" component={SoloReview} />
                <Route path="/solo/knowledge" component={SoloKnowledge} />
                <Route path="/solo/agent-workshop" component={SoloAgentWorkshop} />
                <Route path="/solo/settings" component={Settings} />
              </Router>
            </Suspense>
          </AppStoreProvider>
        </BackNavigationContext.Provider>
      </div>
    </div>
  );
}
