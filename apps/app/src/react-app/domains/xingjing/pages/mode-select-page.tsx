/** @jsxImportSource react */
import { useNavigate } from "react-router-dom";

export const APP_MODE_KEY = "xingjing.app-mode";

/**
 * 模式选择页。
 *
 * 两个入口：
 *  - openwork 原始版本 → 清除 localStorage mode key → /session（渲染 SessionPage）
 *  - 星静 React 版     → 写入 localStorage mode key → /session（渲染 XingjingSessionPage）
 */
export function ModeSelectPage() {
  const navigate = useNavigate();

  const selectMode = (mode: "openwork" | "xingjing") => {
    if (mode === "openwork") {
      localStorage.removeItem(APP_MODE_KEY);
    } else {
      localStorage.setItem(APP_MODE_KEY, "xingjing");
    }
    navigate("/session");
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#f0f0f2] p-8">
      <h1 className="mb-2 text-3xl font-semibold text-gray-12">选择工作模式</h1>
      <p className="mb-12 text-[15px] text-dls-secondary">根据当前工作场景选择最适合的模式</p>

      <div className="flex gap-6">
        {/* 卡片1: openwork 原始版本 */}
        <button
          type="button"
          className="flex w-[240px] flex-col rounded-2xl border border-dls-border bg-white p-6 text-left shadow-sm transition-all hover:border-gray-6 hover:shadow-md active:scale-[0.99]"
          onClick={() => selectMode("openwork")}
        >
          <span className="mb-4 text-3xl">⚡</span>
          <h3 className="mb-1 text-[15px] font-semibold text-gray-12">openwork 原始版本</h3>
          <p className="mb-4 text-[13px] text-dls-secondary">AI 编码工作流</p>
          <p className="mt-auto text-[12px] text-dls-secondary/70">
            沉浸式 AI 编码体验，快速上手
          </p>
        </button>

        {/* 卡片2: 星静 React 版 */}
        <button
          type="button"
          className="flex w-[240px] flex-col rounded-2xl border-2 border-green-7 bg-white p-6 text-left shadow-[0_0_0_4px_rgba(34,197,94,0.12)] transition-all hover:shadow-[0_0_0_4px_rgba(34,197,94,0.2)] active:scale-[0.99]"
          onClick={() => selectMode("xingjing")}
        >
          <span className="mb-4 text-3xl">🌙</span>
          <h3 className="mb-1 text-[15px] font-semibold text-green-11">星静 React 版</h3>
          <p className="mb-4 text-[13px] text-dls-secondary">All-in-One 研发平台</p>
          <p className="mt-auto text-[12px] text-dls-secondary/70">
            产品规划 / 需求 / 研发 / 质量 / 发布一体化
          </p>
        </button>
      </div>
    </div>
  );
}
