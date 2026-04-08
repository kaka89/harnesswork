import { createSignal, Match, Switch } from "solid-js";
import { useNavigate } from "@solidjs/router";
import CockpitTabNav from "../components/cockpit/tab-nav";
import ProductTab from "../components/cockpit/product-tab";
import EngineeringTab from "../components/cockpit/engineering-tab";
import ReleaseTab from "../components/cockpit/release-tab";
import GrowthTab from "../components/cockpit/growth-tab";

export type TabId = "product" | "engineering" | "release" | "growth";

export default function CockpitPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = createSignal<TabId>("product");

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white" data-testid="cockpit-page">
      {/* 顶部固定栏：返回入口 + Tab 导航 */}
      <header class="flex items-center gap-4 border-b border-gray-800 px-4 py-2 shrink-0">
        <button
          class="flex items-center gap-1 text-gray-400 hover:text-gray-200 text-sm transition-colors"
          onClick={() => navigate("/mode-select")}
          data-testid="back-to-mode-select"
        >
          ← 返回模式选择
        </button>
        <CockpitTabNav activeTab={activeTab()} onTabChange={setActiveTab} />
      </header>
      {/* 内容区：撑满剩余高度 */}
      <main class="flex-1 overflow-hidden">
        <Switch>
          <Match when={activeTab() === "product"}>
            <ProductTab />
          </Match>
          <Match when={activeTab() === "engineering"}>
            <EngineeringTab />
          </Match>
          <Match when={activeTab() === "release"}>
            <ReleaseTab />
          </Match>
          <Match when={activeTab() === "growth"}>
            <GrowthTab />
          </Match>
        </Switch>
      </main>
    </div>
  );
}
