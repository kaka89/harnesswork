import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { usePlatform } from "../context/platform";

export default function ModeSelectPage() {
  const navigate = useNavigate();
  const platform = usePlatform();
  const storage = platform.storage!("harnesswork") as {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };

  // F003: 读取上次选择的模式偏好，用于高亮对应卡片（BH-02）
  const [preference, setPreference] = createSignal<string | null>(
    storage.getItem("mode-preference")
  );

  const handleSelectOpenwork = () => {
    storage.setItem("mode-preference", "openwork");
    setPreference("openwork");
    navigate("/");
  };

  const handleSelectCockpit = () => {
    storage.setItem("mode-preference", "cockpit");
    setPreference("cockpit");
    navigate("/cockpit");
  };

  return (
    <div
      class="flex items-center justify-center min-h-screen bg-gray-950 text-white"
      data-testid="mode-select-page"
    >
      <div class="flex flex-col items-center gap-8 max-w-2xl w-full px-8">
        {/* 标题区 */}
        <div class="text-center">
          <h1 class="text-3xl font-bold mb-2">选择工作模式</h1>
          <p class="text-gray-400 text-sm">根据当前工作场景选择最适合的模式</p>
        </div>

        {/* 模式卡片区 */}
        <div class="flex gap-6 w-full">
          {/* openwork 原始版本卡片 */}
          <button
            class={`flex-1 flex flex-col gap-3 p-6 rounded-xl border cursor-pointer bg-gray-900 transition-all text-left ${
              preference() === "openwork"
                ? "border-gray-400 ring-2 ring-gray-300/60 hover:border-gray-300 hover:bg-gray-800"
                : "border-gray-700 hover:border-gray-400 hover:bg-gray-800"
            }`}
            onClick={handleSelectOpenwork}
            data-testid="mode-openwork"
          >
            <div class="text-2xl">⚡</div>
            <div>
              <div class="font-semibold text-white text-lg">openwork 原始版本</div>
              <div class="text-gray-400 text-sm mt-1">AI 编码工作流</div>
            </div>
            <div class="text-gray-500 text-xs mt-auto">
              沉浸式 AI 编码体验，快速上手
            </div>
          </button>

          {/* harnesswork 工程驾驶舱卡片 */}
          <button
            class={`flex-1 flex flex-col gap-3 p-6 rounded-xl border cursor-pointer bg-gray-900 transition-all text-left ${
              preference() === "cockpit"
                ? "border-blue-400 ring-2 ring-blue-400/60 hover:border-blue-300 hover:bg-blue-950"
                : "border-blue-600 hover:border-blue-400 hover:bg-blue-950"
            }`}
            onClick={handleSelectCockpit}
            data-testid="mode-cockpit"
          >
            <div class="text-2xl">🚀</div>
            <div>
              <div class="font-semibold text-blue-300 text-lg">harnesswork 工程驾驶舱</div>
              <div class="text-gray-400 text-sm mt-1">全链路研发协作</div>
            </div>
            <div class="text-gray-500 text-xs mt-auto">
              产品 / 研发 / 发布运维 / 运营一体化视图
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
