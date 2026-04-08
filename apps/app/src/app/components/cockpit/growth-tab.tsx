import { For } from "solid-js";

// P2 阶段替换为真实数据平台 API（Amplitude/Mixpanel/PostHog）
const IS_MOCK = true;

const MOCK_DAU = [
  { date: "04-02", dau: 1240, mau: 18200 },
  { date: "04-03", dau: 1380, mau: 18500 },
  { date: "04-04", dau: 1290, mau: 18700 },
  { date: "04-05", dau: 890,  mau: 18800 },
  { date: "04-06", dau: 760,  mau: 18900 },
  { date: "04-07", dau: 1410, mau: 19100 },
  { date: "04-08", dau: 1520, mau: 19300 },
];

const MOCK_RETENTION = [
  { cohort: "2026-03-01", day1: "62%", day7: "38%", day30: "21%" },
  { cohort: "2026-03-08", day1: "65%", day7: "40%", day30: "23%" },
  { cohort: "2026-03-15", day1: "61%", day7: "37%", day30: null },
];

const MOCK_FEEDBACK = [
  { id: "fb-001", channel: "App Store",  content: "文档功能很好用，期待更多模板", time: "2h ago",  sentiment: "positive" },
  { id: "fb-002", channel: "GitHub",     content: "研发 Tab 的 AI 响应有点慢",   time: "5h ago",  sentiment: "neutral"  },
  { id: "fb-003", channel: "用户调研",   content: "希望能有暗色主题",             time: "1d ago",  sentiment: "neutral"  },
  { id: "fb-004", channel: "App Store",  content: "模式选择体验很流畅",           time: "2d ago",  sentiment: "positive" },
];

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "text-green-11",
  neutral:  "text-gray-10",
  negative: "text-red-11",
};

export default function GrowthTab() {
  return (
    <div class="flex flex-col gap-0 h-full overflow-y-auto" data-testid="growth-tab">
      {/* Mock 提示 */}
      {IS_MOCK && (
        <div class="px-4 py-2 bg-yellow-3/50 border-b border-yellow-7 text-yellow-11 text-xs">
          ⚠ 当前数据仅供演示（IS_MOCK = true）— P2 阶段接入真实数据平台 API
        </div>
      )}

      <div class="flex flex-col gap-4 p-4 flex-1">
        {/* DAU/MAU 趋势表格 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">DAU / MAU 趋势</h3>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-10 border-b border-dls-border">
                <th class="text-left pb-2">日期</th>
                <th class="text-right pb-2">DAU</th>
                <th class="text-right pb-2">MAU</th>
              </tr>
            </thead>
            <tbody>
              <For each={MOCK_DAU}>
                {(row) => (
                  <tr class="border-b border-dls-border last:border-0">
                    <td class="py-1.5 text-gray-11">{row.date}</td>
                    <td class="py-1.5 text-right text-gray-12 font-medium">{row.dau.toLocaleString()}</td>
                    <td class="py-1.5 text-right text-gray-10">{row.mau.toLocaleString()}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        {/* 用户留存面板 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">用户留存</h3>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-10 border-b border-dls-border">
                <th class="text-left pb-2">Cohort</th>
                <th class="text-right pb-2">Day 1</th>
                <th class="text-right pb-2">Day 7</th>
                <th class="text-right pb-2">Day 30</th>
              </tr>
            </thead>
            <tbody>
              <For each={MOCK_RETENTION}>
                {(row) => (
                  <tr class="border-b border-dls-border last:border-0">
                    <td class="py-1.5 text-gray-11">{row.cohort}</td>
                    <td class="py-1.5 text-right text-gray-12">{row.day1}</td>
                    <td class="py-1.5 text-right text-gray-12">{row.day7}</td>
                    <td class="py-1.5 text-right text-gray-10">{row.day30 ?? "--"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        {/* 用户反馈聚合 */}
        <div class="bg-dls-surface rounded-lg p-4 border border-dls-border">
          <h3 class="text-sm font-semibold text-gray-12 mb-3">用户反馈</h3>
          <div class="flex flex-col gap-2">
            <For each={MOCK_FEEDBACK}>
              {(fb) => (
                <div class="flex items-start gap-3 p-2 bg-gray-4 rounded">
                  <span class={`text-xs shrink-0 mt-0.5 font-medium ${SENTIMENT_CLASS[fb.sentiment] ?? "text-gray-10"}`}>
                    {fb.sentiment === "positive" ? "★" : "◆"}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-12">{fb.content}</div>
                    <div class="flex gap-2 mt-0.5">
                      <span class="text-xs text-blue-11">{fb.channel}</span>
                      <span class="text-xs text-gray-9">{fb.time}</span>
                    </div>
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
