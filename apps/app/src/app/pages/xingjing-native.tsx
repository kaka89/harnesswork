/**
 * 星静 SolidJS 原生集成版
 *
 * 直接在 openwork 主应用内以原生 SolidJS 组件渲染星静，
 * 使用嵌套 Router (base="/xingjing-solid") 处理子路由，
 * 无需 iframe，实现深度融合。
 */
import { lazy, Suspense } from 'solid-js';
import { Router, Route, useNavigate } from '@solidjs/router';
import { AppStoreProvider } from '../xingjing/stores/app-store';
import MainLayout, { BackNavigationContext } from '../xingjing/components/layouts/main-layout';

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

export default function XingjingNativePage() {
  // 使用外层 Router 的 navigate，通过 Context 传入 MainLayout 的返回按钮
  const outerNavigate = useNavigate();

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
        <span class="font-semibold text-purple-11 text-base">星静 openwork融合版</span>
        <span class="text-gray-10 text-sm">All-in-One 研发平台</span>
      </header>

      {/* 原生 SolidJS 星静 */}
      <div class="flex-1 overflow-hidden">
        <BackNavigationContext.Provider value={() => outerNavigate('/mode-select')}>
          <AppStoreProvider>
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
