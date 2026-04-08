import { For } from "solid-js";

// P2 阶段替换为真实 CI/CD API
const IS_MOCK = true;

const MOCK_PIPELINES = [
  { id: "pipe-001", name: "Deploy to Production", status: "success", stages: ["Build", "Test", "Deploy"] },
  { id: "pipe-002", name: "Staging Release",      status: "running", stages: ["Build", "Test", "Deploy"] },
  { id: "pipe-003", name: "Hotfix v1.2.1",        status: "failed",  stages: ["Build", "Test"] },
];

const MOCK_DEPLOYMENTS = [
  { id: "dep-001", version: "v1.2.0", env: "prod",    status: "success", time: "2026-04-07 14:30" },
  { id: "dep-002", version: "v1.1.9", env: "staging", status: "success", time: "2026-04-06 10:15" },
  { id: "dep-003", version: "v1.1.8", env: "dev",     status: "success", time: "2026-04-05 09:00" },
];

const MOCK_ENVS = [
  { name: "prod",    health: "healthy",  uptime: "99.9%" },
  { name: "staging", health: "healthy",  uptime: "99.5%" },
  { name: "dev",     health: "degraded", uptime: "98.1%" },
];

const MOCK_ALERTS = [
  { id: "alert-001", level: "warning", message: "CPU 使用率 > 80%（dev 环境）", time: "5m ago" },
  { id: "alert-002", level: "info",    message: "Staging 部署完成",             time: "1h ago" },
];

const PIPELINE_STATUS_CLASS: Record<string, string> = {
  success: "bg-green-500",
  running: "bg-blue-500 animate-pulse",
  failed:  "bg-red-500",
};

const ENV_HEALTH_CLASS: Record<string, string> = {
  healthy:  "text-green-11",
  degraded: "text-yellow-11",
  down:     "text-red-11",
};

export default function ReleaseTab() {
  return (
    <div class="flex flex-col gap-0 h-full overflow-y-auto" data-testid="release-tab">
      {/* Mock 提示 */}
      {IS_MOCK && (
        <div class="px-4 py-2 bg-yellow-3/50 border-b border-yellow-7 text-yellow-11 text-xs">
          ⚠ 当前数据仅供演示（IS_MOCK = true）— P2 阶段接入真实 CI/CD API
        </div>
      )}

      <div class="grid grid-cols-2 gap-4 p-4 flex-1">
        {/* 流水线执行视图 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">流水线执行</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_PIPELINES}>
              {(pipe) => (
                <div class="flex items-center gap-3 p-2 bg-gray-4 rounded">
                  <span class={`w-2 h-2 rounded-full shrink-0 ${PIPELINE_STATUS_CLASS[pipe.status] ?? "bg-gray-500"}`} />
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12 truncate">{pipe.name}</div>
                    <div class="text-xs text-gray-9">{pipe.stages.join(" → ")}</div>
                  </div>
                  <span class="text-xs text-gray-10 shrink-0">{pipe.status}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* 部署历史时间轴 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">部署历史</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_DEPLOYMENTS}>
              {(dep) => (
                <div class="flex items-center gap-3 p-2 border-l-2 border-green-7 pl-3">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12">{dep.version} → <span class="text-gray-10">{dep.env}</span></div>
                    <div class="text-xs text-gray-9">{dep.time}</div>
                  </div>
                  <span class="text-xs text-green-11">{dep.status}</span>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* 多环境健康看板 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">环境健康</h3>
          <div class="flex gap-3">
            <For each={MOCK_ENVS}>
              {(env) => (
                <div class="flex-1 bg-gray-4 rounded p-3 text-center">
                  <div class="text-xs text-gray-10 mb-1">{env.name}</div>
                  <div class={`text-sm font-semibold ${ENV_HEALTH_CLASS[env.health] ?? "text-gray-10"}`}>
                    {env.health}
                  </div>
                  <div class="text-xs text-gray-9 mt-1">{env.uptime}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* 告警摘要面板 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">告警摘要</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_ALERTS}>
              {(alert) => (
                <div class="flex items-start gap-2 p-2 bg-gray-4 rounded">
                  <span class="text-sm shrink-0">
                    {alert.level === "critical" ? "🔴" : alert.level === "warning" ? "⚠️" : "ℹ️"}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12">{alert.message}</div>
                    <div class="text-xs text-gray-9">{alert.time}</div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
