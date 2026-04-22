/**
 * 星静 SolidJS 原生集成版
 *
 * 直接在 openwork 主应用内以原生 SolidJS 组件渲染星静，
 * 使用嵌套 Router (base="/xingjing-solid") 处理子路由，
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

// 团队版页面
const Autopilot = lazy(() => import('../xingjing/pages/autopilot'));
const Dashboard = lazy(() => import('../xingjing/pages/dashboard'));
const AgentWorkshop = lazy(() => import('../xingjing/pages/agent-workshop'));
const RequirementWorkshop = lazy(() => import('../xingjing/pages/requirements'));
const PRDEditor = lazy(() => import('../xingjing/pages/requirements/prd-editor'));
const ProductPlanning = lazy(() => import('../xingjing/pages/planning'));
const DesignWorkshop = lazy(() => import('../xingjing/pages/design'));
const DevWorkshop = lazy(() => import('../xingjing/pages/dev'));
const PRSubmit = lazy(() => import('../xingjing/pages/dev/pr-submit'));
const SprintCenter = lazy(() => import('../xingjing/pages/sprint'));
const SprintPlan = lazy(() => import('../xingjing/pages/sprint/sprint-plan'));
const QualityCenter = lazy(() => import('../xingjing/pages/quality'));
const ReleaseOps = lazy(() => import('../xingjing/pages/release-ops'));
const KnowledgeCenter = lazy(() => import('../xingjing/pages/knowledge'));
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
}

export default function XingjingNativePage(props: XingjingNativePageProps) {
  // 使用外层 Router 的 navigate，通过 Context 传入 MainLayout 的返回按钟
  const outerNavigate = useNavigate();

  // 构建 XingjingOpenworkContext，将 OpenWork 能力注入到星静内部
  // 使用 createMemo 确保 openworkServerClient 连接/断开时响应式更新
  const openworkCtx = createMemo<XingjingOpenworkContext | undefined>(() =>
    props.openworkServerClient
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
              <Router base="/xingjing-solid" root={MainLayout}>
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
