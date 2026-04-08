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

  const handleSelectOpenwork = () => {
    storage.setItem("mode-preference", "openwork");
    navigate("/");
  };

  const handleSelectCockpit = () => {
    storage.setItem("mode-preference", "cockpit");
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
            class="flex-1 flex flex-col gap-3 p-6 rounded-xl border border-gray-700 hover:border-gray-400 cursor-pointer bg-gray-900 hover:bg-gray-800 transition-all text-left"
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
            class="flex-1 flex flex-col gap-3 p-6 rounded-xl border border-blue-600 hover:border-blue-400 cursor-pointer bg-gray-900 hover:bg-blue-950 transition-all text-left"
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
