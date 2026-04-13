import { For } from "solid-js";

// P2 阶段接入真实 VCS / CI 数据源
const IS_MOCK = true;

const MOCK_COMMITS = [
  { id: "a1b2c3d", author: "张三",   message: "feat: add theme token support",      time: "10m ago" },
  { id: "e4f5g6h", author: "李四",   message: "fix: correct active tab border color", time: "1h ago" },
  { id: "i7j8k9l", author: "王五",   message: "chore: update dependencies",           time: "3h ago" },
  { id: "m0n1o2p", author: "赵六",   message: "docs: add SDD-005 spec",               time: "5h ago" },
];

const MOCK_PRS = [
  { id: 42, title: "Feature/theme-aware-ui",      status: "open",   reviewer: "李四",   comments: 3 },
  { id: 41, title: "Fix/cockpit-tab-navigation",  status: "merged", reviewer: "张三",   comments: 7 },
  { id: 40, title: "Chore/upgrade-solidjs-router", status: "open",  reviewer: "王五",   comments: 1 },
];

const MOCK_METRICS = [
  { label: "代码覆盖率",  value: "78%",  trend: "+2%" },
  { label: "技术债务",    value: "12h",  trend: "-3h" },
  { label: "本周提交数",  value: "24",   trend: "+6" },
  { label: "Open Issues", value: "8",    trend: "-2" },
];

const PR_STATUS_CLASS: Record<string, string> = {
  open:   "bg-blue-3 text-blue-11",
  merged: "bg-green-3 text-green-11",
  closed: "bg-gray-4 text-gray-10",
};

export default function EngineeringTab() {
  return (
    <div class="flex flex-col gap-0 h-full overflow-y-auto" data-testid="engineering-tab">
      {/* Mock 提示 */}
      {IS_MOCK && (
        <div class="px-4 py-2 bg-yellow-3/50 border-b border-yellow-7 text-yellow-11 text-xs">
          ⚠ 当前数据仅供演示（IS_MOCK = true）— P2 阶段接入真实 VCS / CI API
        </div>
      )}

      <div class="grid grid-cols-2 gap-4 p-4 flex-1">
        {/* 工程健康指标 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border col-span-2">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">工程健康指标</h3>
          <div class="grid grid-cols-4 gap-3">
            <For each={MOCK_METRICS}>
              {(m) => (
                <div class="bg-gray-4 rounded p-3 text-center">
                  <div class="text-xs text-gray-10 mb-1">{m.label}</div>
                  <div class="text-lg font-bold text-gray-12">{m.value}</div>
                  <div class="text-xs text-green-11 mt-1">{m.trend}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* 最近提交 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">最近提交</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_COMMITS}>
              {(commit) => (
                <div class="flex items-start gap-3 p-2 bg-gray-4 rounded">
                  <code class="text-xs text-blue-11 font-mono shrink-0">{commit.id}</code>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12 truncate">{commit.message}</div>
                    <div class="text-xs text-gray-9">{commit.author} · {commit.time}</div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Pull Requests */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">Pull Requests</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_PRS}>
              {(pr) => (
                <div class="flex items-center gap-3 p-2 bg-gray-4 rounded">
                  <span class="text-xs text-gray-9 shrink-0">#{pr.id}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12 truncate">{pr.title}</div>
                    <div class="text-xs text-gray-9">reviewer: {pr.reviewer} · {pr.comments} comments</div>
                  </div>
                  <span class={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${PR_STATUS_CLASS[pr.status] ?? "bg-gray-4 text-gray-10"}`}>
                    {pr.status}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
