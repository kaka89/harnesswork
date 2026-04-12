import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  todayFocus as mockTodayFocus,
  businessMetrics as mockBusinessMetrics,
  soloTasks as mockSoloTasks,
  SoloTask,
  BusinessMetric,
  FocusItem,
} from '../../../mock/solo';
import { readYamlDir, writeYaml } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';

const priorityConfig: Record<string, { label: string; color: string; bg: string; border: string; tagClass: string }> = {
  urgent:    { label: '紧急', color: 'chartColors.error', bg: 'themeColors.surface2f0', border: 'themeColors.errorBorder', tagClass: 'bg-red-100 text-red-700' },
  important: { label: '重要', color: 'chartColors.warning', bg: 'themeColors.surfacebe6', border: 'themeColors.warningBorder', tagClass: 'bg-yellow-100 text-yellow-700' },
  normal:    { label: '普通', color: 'chartColors.success', bg: 'themeColors.successBg', border: 'themeColors.successBorder', tagClass: 'bg-green-100 text-green-700' },
};

const modeCards = [
  {
    route: '/solo/build',
    icon: '💻',
    label: '开发模式',
    desc: '修 Bug · 写功能 · 深度专注',
    color: 'themeColors.primaryBg',
    border: 'themeColors.primaryBorder',
  },
  {
    route: '/solo/product',
    icon: '💡',
    label: '产品模式',
    desc: '验证假设 · 规划想法 · 用户洞察',
    color: 'themeColors.purpleBg',
    border: 'themeColors.purpleBorder',
  },
  {
    route: '/solo/review',
    icon: '📈',
    label: '运营模式',
    desc: '看数据 · 回复反馈 · 写内容',
    color: 'themeColors.successBg',
    border: 'themeColors.successBorder',
  },
];

const SoloFocus: Component = () => {
  const navigate = useNavigate();
  const { productStore } = useAppStore();

  // State — initialized with mock data, updated when file data loads
  const [metrics, setMetrics] = createSignal<BusinessMetric[]>(mockBusinessMetrics);
  const [tasks, setTasks] = createSignal<SoloTask[]>(mockSoloTasks);
  const [focusItems] = createSignal<FocusItem[]>(mockTodayFocus);
  const [checkedTasks, setCheckedTasks] = createSignal<Set<string>>(new Set());

  // Load data from file store on mount (graceful fallback to mock)
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    // Load tasks from directory
    const taskFiles = await readYamlDir<SoloTask>('.xingjing/solo/tasks', workDir);
    if (taskFiles.length > 0) {
      setTasks(taskFiles);
    }
  });

  const todayTasks = (): SoloTask[] => [
    ...tasks().filter((t) => t.status === 'doing'),
    ...tasks().filter((t) => t.status === 'todo').slice(0, 4),
  ].slice(0, 5);

  const toggleTask = async (id: string) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Persist task status change
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const task = tasks().find((t) => t.id === id);
    if (!task) return;
    const newStatus = checkedTasks().has(id) ? 'done' : 'doing';
    const updated = { ...task, status: newStatus as SoloTask['status'] };
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    await writeYaml(`.xingjing/solo/tasks/${id}.yaml`, updated as unknown as Record<string, unknown>, workDir);
  };

  const dateStr = new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' });

  const typeColorMap: Record<string, string> = {
    dev: 'bg-blue-100 text-blue-700',
    product: 'bg-purple-100 text-purple-700',
    ops: 'bg-orange-100 text-orange-700',
    growth: 'bg-green-100 text-green-700',
  };
  const typeLabel: Record<string, string> = {
    dev: '开发', product: '产品', ops: '运营', growth: '增长',
  };

  return (
    <div>
      {/* Page Header */}
      <div class="flex justify-between items-center mb-5">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
            <span class="text-yellow-500">⚡</span>
            今日焦点
          </h2>
          <p class="text-sm text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        <span class="text-xs px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full font-medium">🔥 专注模式已开启</span>
      </div>

      {/* AI Daily Brief */}
      <div class="mb-5 p-4 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg flex-shrink-0">
            🤖
          </div>
          <div class="flex-1">
            <div class="font-semibold text-sm text-gray-800 mb-2">AI 今日简报</div>
            <p class="text-sm text-gray-600 mb-3">
              今天有 <strong>{focusItems().length} 件最重要的事</strong>需要你关注。
            </p>
            <div class="flex flex-col gap-2">
              <For each={focusItems()}>
                {(item, idx) => {
                  const cfg = priorityConfig[item.priority] ?? priorityConfig['normal'];
                  return (
                    <div
                      class="flex items-start gap-3 rounded-lg px-3 py-2.5 border"
                      style={{ background: cfg.bg, 'border-color': cfg.border }}
                    >
                      <div
                        class="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5"
                        style={{ background: cfg.color }}
                      >
                        {idx() + 1}
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-0.5">
                          <span class="font-semibold text-sm text-gray-900">{item.title}</span>
                          <span class={`text-xs px-1.5 py-0.5 rounded ${cfg.tagClass}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p class="text-xs text-gray-500 m-0">{item.reason}</p>
                      </div>
                      <Show when={item.linkedRoute}>
                        <button
                          class="text-xs text-blue-600 hover:text-blue-700 flex-shrink-0 font-medium"
                          onClick={() => navigate(item.linkedRoute!)}
                        >
                          {item.action} →
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div class="grid grid-cols-12 gap-4">
        {/* Left: Tasks + Mode Cards */}
        <div class="col-span-8">
          {/* Today's Task List */}
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm text-gray-800">今日任务清单</span>
                <span class="text-xs text-gray-500">
                  Top {todayTasks().length} · {checkedTasks().size}/{todayTasks().length} 完成
                </span>
              </div>
              <button
                class="text-xs text-blue-600 hover:text-blue-700"
                onClick={() => navigate('/solo/build')}
              >
                全部任务 →
              </button>
            </div>
            <div class="p-4 flex flex-col gap-2.5">
              <For each={todayTasks()}>
                {(task) => {
                  const done = () => checkedTasks().has(task.id);
                  return (
                    <div
                      class={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        done()
                          ? 'bg-gray-50 border-gray-100 opacity-60'
                          : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                      }`}
                      onClick={() => toggleTask(task.id)}
                    >
                      {/* Checkbox */}
                      <div
                        class={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-white text-xs ${
                          done() ? 'bg-green-500 border-green-500' : 'border-gray-300'
                        }`}
                      >
                        {done() && '✓'}
                      </div>
                      <div class="flex-1">
                        <span
                          class={`text-sm ${done() ? 'line-through text-gray-400' : 'text-gray-800'}`}
                        >
                          <Show when={task.status === 'doing' && !done()}>
                            <span class="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5 animate-pulse" />
                          </Show>
                          {task.title}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <span class={`text-xs px-1.5 py-0.5 rounded ${typeColorMap[task.type]}`}>
                          {typeLabel[task.type]}
                        </span>
                        <span class="text-xs text-gray-400">{task.est}</span>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Work Mode Cards */}
          <div class="bg-white rounded-xl shadow-sm border border-gray-100">
            <div class="px-4 py-3 border-b border-gray-100">
              <span class="font-semibold text-sm text-gray-800">切换工作模式</span>
            </div>
            <div class="p-4 grid grid-cols-3 gap-3">
              <For each={modeCards}>
                {(mode) => (
                  <button
                    class="flex flex-col items-center p-3 rounded-xl border cursor-pointer text-center hover:-translate-y-0.5 transition-transform"
                    style={{ background: mode.color, 'border-color': mode.border }}
                    onClick={() => navigate(mode.route)}
                  >
                    <span class="text-2xl mb-1.5">{mode.icon}</span>
                    <div class="font-semibold text-sm text-gray-800 mb-0.5">{mode.label}</div>
                    <div class="text-xs text-gray-500 leading-tight">{mode.desc}</div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Right: Business Health */}
        <div class="col-span-4">
          {/* Business Metrics */}
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span class="font-semibold text-sm text-gray-800">商业健康快照</span>
              <button
                class="text-xs text-blue-600 hover:text-blue-700"
                onClick={() => navigate('/solo/review')}
              >
                详细数据 →
              </button>
            </div>
            <div class="p-3 grid grid-cols-2 gap-3">
              <For each={metrics()}>
                {(m) => (
                  <div class="p-3 rounded-xl border" style={{ 'border-color': m.color + '33', background: m.color + '08' }}>
                    <div class="text-xs text-gray-500 mb-1">{m.label}</div>
                    <div class="text-xl font-bold" style={{ color: m.color }}>
                      <Show when={m.trend === 'up'}>
                        <span class="text-sm text-green-500 mr-1">↑</span>
                      </Show>
                      {m.value}
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5">{m.trendValue}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Streak Card */}
          <div class="rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100 p-4">
            <div class="flex items-center gap-3 mb-3">
              <span class="text-3xl">🔥</span>
              <div>
                <div class="font-bold text-base text-gray-800">连续构建 14 天 🔥</div>
                <div class="text-xs text-gray-500">保持每日发布节奏，用户感知到你在快速迭代</div>
              </div>
            </div>
            <div class="flex gap-1 flex-wrap">
              <For each={Array.from({ length: 14 })}>
                {() => (
                  <div
                    class="w-3.5 h-3.5 rounded-sm"
                    style={{ background: 'chartColors.warning' }}
                  />
                )}
              </For>
              <For each={Array.from({ length: 7 })}>
                {() => (
                  <div class="w-3.5 h-3.5 rounded-sm bg-gray-200" />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoloFocus;
