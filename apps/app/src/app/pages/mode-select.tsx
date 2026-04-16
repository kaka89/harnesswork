import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";

export default function ModeSelectPage() {
  const navigate = useNavigate();

  // 使用 localStorage 记忆上次选择的模式，高亮对应卡片
  const storageKey = "harnesswork:mode-preference";
  const [preference, setPreference] = createSignal<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(storageKey) : null
  );

  const savePreference = (mode: string) => {
    localStorage.setItem(storageKey, mode);
    setPreference(mode);
  };

  const handleSelectOpenwork = () => {
    savePreference("openwork");
    navigate("/session");
  };

  const handleSelectXingjingSolid = () => {
    savePreference("xingjing-solid");
    // 进入星静时，强制重置为团队版模式，确保默认打开团队版驾驶舱
    try {
      const raw = localStorage.getItem('xingjing:preferences');
      const prefs = raw ? JSON.parse(raw) : { activeProductId: null };
      prefs.viewMode = 'team';
      localStorage.setItem('xingjing:preferences', JSON.stringify(prefs));
    } catch { /* ignore */ }
    navigate("/xingjing-solid");
  };

  return (
    <div
      class="flex items-center justify-center min-h-screen bg-[var(--dls-app-bg)] text-gray-12"
      data-testid="mode-select-page"
    >
      <div class="flex flex-col items-center gap-8 max-w-4xl w-full px-8">
        {/* 标题区 */}
        <div class="text-center">
          <h1 class="text-3xl font-bold mb-2">选择工作模式</h1>
          <p class="text-gray-10 text-sm">根据当前工作场景选择最适合的模式</p>
        </div>

        {/* 模式卡片区 */}
        <div class="flex gap-6 w-full">
          {/* openwork 原始版本卡片 */}
          <button
            class={`flex-1 flex flex-col gap-3 p-6 rounded-xl border cursor-pointer bg-dls-surface transition-all text-left ${
              preference() === "openwork"
                ? "border-gray-7 ring-2 ring-gray-7/60 hover:border-gray-8 hover:bg-dls-hover"
                : "border-gray-6 hover:border-gray-7 hover:bg-dls-hover"
            }`}
            onClick={handleSelectOpenwork}
            data-testid="mode-openwork"
          >
            <div class="text-2xl">⚡</div>
            <div>
              <div class="font-semibold text-gray-12 text-lg">openwork 原始版本</div>
              <div class="text-gray-10 text-sm mt-1">AI 编码工作流</div>
            </div>
            <div class="text-gray-9 text-xs mt-auto">
              沉浸式 AI 编码体验，快速上手
            </div>
          </button>

          {/* 星静卡片 */}
          <button
            class={`flex-1 flex flex-col gap-3 p-6 rounded-xl border cursor-pointer bg-dls-surface transition-all text-left ${
              preference() === "xingjing-solid"
                ? "border-green-8 ring-2 ring-green-8/60 hover:border-green-9 hover:bg-green-3"
                : "border-green-7 hover:border-green-8 hover:bg-green-3"
            }`}
            onClick={handleSelectXingjingSolid}
            data-testid="mode-xingjing-solid"
          >
            <div class="text-2xl">✨</div>
            <div>
              <div class="font-semibold text-green-11 text-lg">星静</div>
              <div class="text-gray-10 text-sm mt-1">All-in-One 研发平台 · 独立/团队双模式</div>
            </div>
            <div class="text-gray-9 text-xs mt-auto">
              产品规划 / 需求 / 研发 / 质量 / 发布一体化
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
