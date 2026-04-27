import App from "./app";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";
import { isWebDeployment } from "./lib/openwork-deployment";
import { isTauriRuntime } from "./utils";

export default function AppEntry() {
  const defaultUrl = (() => {
    // Tauri 桌面端本地 engine 端口由 engine_info() 动态分配（随机），
    // 绝对不能硬编码为 4096 —— 否则 ServerProvider 会拿这个无效端口
    // 每 10 秒打一次 /global/health 失败，叠加 Tauri ipc:// 负载触发 webview reload。
    // 返回空串让 ServerProvider 走 no-op 分支，engine 端口由 app.tsx 的 engineInfo 提供。
    if (isTauriRuntime()) return "";

    // When running the web UI against an OpenWork server (e.g. Docker dev stack),
    // use the server's `/opencode` proxy instead of loopback.
    const openworkUrl =
      typeof import.meta.env?.VITE_OPENWORK_URL === "string"
        ? import.meta.env.VITE_OPENWORK_URL.trim()
        : "";
    if (openworkUrl) {
      return `${openworkUrl.replace(/\/+$/, "")}/opencode`;
    }

    // When the hosted web deployment is served by the OpenWork server,
    // OpenCode is proxied at same-origin `/opencode`.
    if (isWebDeployment() && import.meta.env.PROD && typeof window !== "undefined") {
      return `${window.location.origin}/opencode`;
    }

    // Dev fallback (Vite) - allow overriding for remote debugging.
    const envUrl =
      typeof import.meta.env?.VITE_OPENCODE_URL === "string"
        ? import.meta.env.VITE_OPENCODE_URL.trim()
        : "";
    return envUrl || "http://127.0.0.1:4096";
  })();

  return (
    <ServerProvider defaultUrl={defaultUrl}>
      <GlobalSDKProvider>
        <GlobalSyncProvider>
          <LocalProvider>
            <App />
          </LocalProvider>
        </GlobalSyncProvider>
      </GlobalSDKProvider>
    </ServerProvider>
  );
}
