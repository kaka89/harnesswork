/**
 * 星静页面
 *
 * 通过 iframe 嵌入独立运行的星静平台（localhost:3003），
 * 避免 React/SolidJS 双框架共存的兼容性问题。
 */
import { useNavigate } from "@solidjs/router";

export default function XingjingPage() {
  const navigate = useNavigate();

  return (
    <div
      class="flex flex-col h-screen bg-[var(--dls-app-bg)] text-gray-12"
      data-testid="xingjing-page"
    >
      {/* 顶部固定栏 */}
      <header class="flex items-center gap-4 border-b border-dls-border px-4 py-2 shrink-0">
        <button
          class="flex items-center gap-1 text-gray-10 hover:text-gray-12 text-sm transition-colors"
          onClick={() => navigate("/mode-select")}
          data-testid="back-to-mode-select"
        >
          ← 返回模式选择
        </button>
        <span class="text-lg">🌙</span>
        <span class="font-semibold text-purple-11 text-base">星静 React 版</span>
        <span class="text-gray-10 text-sm">All-in-One 研发平台</span>
      </header>

      {/* iframe 嵌入星静平台 */}
      <main class="flex-1 overflow-hidden">
        <iframe
          src="http://127.0.0.1:3003"
          class="w-full h-full border-none"
          title="星静平台"
          allow="*"
        />
      </main>
    </div>
  );
}

