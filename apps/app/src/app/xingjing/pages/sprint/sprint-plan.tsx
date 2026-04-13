import { Component, createMemo, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { historyVelocity } from '../../mock/sprint';
import { useAppStore } from '../../stores/app-store';
import { themeColors } from '../../utils/colors';
import ECharts from '../../components/common/echarts';
import { Bot } from 'lucide-solid';

const SprintPlan: Component = () => {
  const navigate = useNavigate();
  const { state, actions } = useAppStore();

  const sprintCapacity = 32;

  const planned = createMemo(() =>
    state.backlog.filter((b) => b.inSprint).reduce((sum, b) => sum + b.estimate, 0)
  );
  const remaining = createMemo(() => sprintCapacity - planned());

  const velocityOption: Record<string, unknown> = {
    tooltip: {},
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: historyVelocity.map((v) => v.sprint) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: historyVelocity.map((v) => v.points),
        itemStyle: { color: '#1264e5' },
        barWidth: 30,
      },
    ],
  };

  const confidence = createMemo(() => {
    const p = planned();
    if (p > 0 && p <= sprintCapacity * 0.8) return '82% ✅';
    if (p > sprintCapacity) return '低 ⚠️';
    return '待评估';
  });

  return (
    <div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-gray-900 m-0">Sprint 规划 — SPRINT-2026-W19</h2>
        <div class="flex gap-4 text-xs text-gray-500">
          <span>时间：2026-05-06 ~ 2026-05-16</span>
          <span>容量：{sprintCapacity} 人天</span>
        </div>
      </div>

      <div class="grid grid-cols-5 gap-4">
        {/* Left: Backlog */}
        <div class="col-span-2 space-y-3">
          <div class="bg-white border border-gray-200 rounded-xl">
            <div class="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Backlog（可加入）</div>
            <div class="p-3 space-y-2">
              <For each={state.backlog}>
                {(item) => (
                  <div
                    class="border rounded-lg p-3 cursor-pointer transition-all hover:border-blue-300"
                    style={{ opacity: item.inSprint ? 0.5 : 1, 'border-color': item.inSprint ? themeColors.border : themeColors.border }}
                    onClick={() => actions.toggleBacklogItem(item.id)}
                  >
                    <div class="flex justify-between items-center mb-1">
                      <div class="flex items-center gap-2">
                        <span
                          class="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{
                            color: item.priority === 'P0' ? themeColors.error : item.priority === 'P1' ? themeColors.warning : themeColors.primary,
                            background: item.priority === 'P0' ? themeColors.errorBg : item.priority === 'P1' ? themeColors.warningBg : themeColors.primaryBg,
                          }}
                        >
                          {item.priority}
                        </span>
                        <span class="font-semibold text-xs text-gray-900">{item.id}</span>
                      </div>
                      <span class="text-xs text-gray-500">{item.estimate}天</span>
                    </div>
                    <div class="text-xs text-gray-700 mb-2">{item.title}</div>
                    <button
                      class={`text-xs px-2 py-1 rounded transition-colors ${
                        item.inSprint
                          ? 'border border-gray-200 text-gray-600 hover:border-gray-300'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {item.inSprint ? '移出 Sprint' : '加入 Sprint →'}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Historical velocity */}
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="font-semibold text-sm text-gray-700 mb-2">历史速度参考</div>
            <ECharts option={velocityOption} style={{ height: '150px' }} />
            <div class="text-xs text-gray-400 mt-1">建议 Sprint 容量: ≤ 26 点</div>
          </div>
        </div>

        {/* Right: Sprint plan */}
        <div class="col-span-3 space-y-3">
          <div class="bg-white border border-gray-200 rounded-xl">
            <div class="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">本 Sprint 计划</div>
            <div class="p-4">
              <div class="mb-3">
                <div class="text-xs text-gray-600 mb-1">已计划: {planned()}/{sprintCapacity} 人天</div>
                <div class="w-full bg-gray-100 rounded-full h-2">
                  <div
                    class="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(Math.round((planned() / sprintCapacity) * 100), 100)}%`,
                      background: planned() > sprintCapacity ? themeColors.error : themeColors.primary,
                    }}
                  />
                </div>
              </div>

              <div class="space-y-2">
                <For each={state.backlog.filter((b) => b.inSprint)}>
                  {(item) => (
                    <div class="border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-xs text-gray-900">{item.id}</span>
                        <span class="text-xs text-gray-700">{item.title}</span>
                      </div>
                      <span class="text-xs text-gray-500">{item.estimate}天</span>
                    </div>
                  )}
                </For>
                <Show when={state.backlog.filter((b) => b.inSprint).length === 0}>
                  <div class="text-xs text-gray-400 text-center py-4">点击左侧 Backlog 中的任务加入 Sprint</div>
                </Show>
              </div>

              <div class="flex justify-between mt-4 text-xs text-gray-500">
                <span>剩余容量: {remaining().toFixed(1)} 人天</span>
                <span>置信度: {confidence()}</span>
              </div>
            </div>
          </div>

          {/* Plan agent */}
          <div class="border border-blue-200 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 p-4">
            <div class="font-semibold text-sm text-blue-800 mb-2 flex items-center gap-1.5"><Bot size={14} /> plan-agent 自动规划建议</div>
            <p class="text-sm text-gray-700 mb-3">
              "基于 {sprintCapacity} 人天容量和历史速度，建议本 Sprint 计划 20-24 人天
              (留 25% buffer)。我已自动排列高优先级 TASK，关键路径
              7天，在 Sprint 内可完成。TASK-002-03 建议移到下个 Sprint
              因为外部 API 依赖不确定性较高。"
            </p>
            <div class="flex gap-2">
              <button class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">采用建议</button>
              <button class="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded hover:bg-blue-100 transition-colors">手动调整</button>
              <button class="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded hover:bg-blue-100 transition-colors">查看关键路径</button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-gray-300 transition-colors"
          onClick={() => navigate('/sprint')}
        >
          取消
        </button>
        <button
          class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          onClick={() => navigate('/sprint')}
        >
          确认 Sprint 计划
        </button>
      </div>
    </div>
  );
};

export default SprintPlan;
