import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  loadTodayFocus,
  loadSoloMetrics,
  loadSoloTasks,
  saveSoloTask,
  type SoloFocusItem,
  type SoloBusinessMetric,
  type SoloTaskRecord,
} from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';

const priorityConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  urgent:    { label: '紧急', color: chartColors.error, bg: themeColors.errorBg, border: themeColors.errorBorder },
  important: { label: '重要', color: chartColors.warning, bg: themeColors.warningBg, border: themeColors.warningBorder },
  normal:    { label: '普通', color: chartColors.success, bg: themeColors.successBg, border: themeColors.successBorder },
};

const modeCards = [
  {
    route: '/solo/build',
    icon: '💻',
    label: '开发模式',
    desc: '修 Bug · 写功能 · 深度专注',
    color: themeColors.primaryBg,
    border: themeColors.primaryBorder,
  },
  {
    route: '/solo/product',
    icon: '💡',
    label: '产品模式',
    desc: '验证假设 · 规划想法 · 用户洞察',
    color: themeColors.purpleBg,
    border: themeColors.purpleBorder,
  },
  {
    route: '/solo/review',
    icon: '📈',
    label: '运营模式',
    desc: '看数据 · 回复反馈 · 写内容',
    color: themeColors.successBg,
    border: themeColors.successBorder,
  },
];

const typeStyleMap: Record<string, { bg: string; color: string }> = {
  dev: { bg: themeColors.primaryBg, color: chartColors.primary },
  product: { bg: themeColors.purpleBg, color: themeColors.purple },
  ops: { bg: themeColors.warningBg, color: themeColors.warningDark },
  growth: { bg: themeColors.successBg, color: chartColors.success },
};
const typeLabel: Record<string, string> = {
  dev: '开发', product: '产品', ops: '运营', growth: '增长',
};

/** 从任务完成日期推算连续构建天数（从今天往回数连续有 done 任务的天数） */
function calcBuildStreak(tasks: SoloTaskRecord[]): number {
  const doneSet = new Set<string>();
  for (const t of tasks) {
    if (t.status === 'done' && t.completedAt) {
      // 只取日期部分 YYYY-MM-DD
      doneSet.add(t.completedAt.slice(0, 10));
    }
  }
  if (doneSet.size === 0) return 0;

  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (doneSet.has(key)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const STREAK_TOTAL_CELLS = 21;

const SoloFocus: Component = () => {
  const navigate = useNavigate();
  const { productStore } = useAppStore();

  const [metrics, setMetrics] = createSignal<SoloBusinessMetric[]>([]);
  const [tasks, setTasks] = createSignal<SoloTaskRecord[]>([]);
  const [focusItems, setFocusItems] = createSignal<SoloFocusItem[]>([]);
  const [checkedTasks, setCheckedTasks] = createSignal<Set<string>>(new Set());
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) {
      setLoading(false);
      return;
    }

    try {
      const [fileTasks, fileMetrics, fileFocus] = await Promise.all([
        loadSoloTasks(workDir),
        loadSoloMetrics(workDir),
        loadTodayFocus(workDir),
      ]);
      if (fileTasks.length > 0) {
        setTasks(fileTasks);
        // 回填已完成任务到 checkedTasks
        const doneIds = new Set(fileTasks.filter(t => t.status === 'done').map(t => t.id));
        setCheckedTasks(doneIds);
      }
      if (fileMetrics.businessMetrics.length > 0) setMetrics(fileMetrics.businessMetrics);
      if (fileFocus.length > 0) setFocusItems(fileFocus);
    } catch {
      // 加载失败时保持空状态
    } finally {
      setLoading(false);
    }
  });

  /** 今日任务：过滤已归档，优先展示 doing，再展示 todo，最多 5 个 */
  const todayTasks = () => {
    const active = tasks().filter(t => !t.archived);
    return [
      ...active.filter(t => t.status === 'doing'),
      ...active.filter(t => t.status === 'todo').slice(0, 4),
    ].slice(0, 5);
  };

  /** 连续构建天数 */
  const buildStreak = () => calcBuildStreak(tasks());

  const toggleTask = async (id: string) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const task = tasks().find((t) => t.id === id);
    if (!task) return;
    const now = new Date().toISOString().slice(0, 10);
    const newStatus = checkedTasks().has(id) ? 'done' : 'doing';
    const updated: SoloTaskRecord = {
      ...task,
      status: newStatus,
      ...(newStatus === 'done' ? { completedAt: task.completedAt ?? now } : {}),
    };
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    await saveSoloTask(workDir, updated);
  };

  const dateStr = new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Page Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <div>
          <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <span style={{ color: themeColors.warning }}>⚡</span>
            今日焦点
          </h2>
          <p style={{ 'font-size': '14px', color: themeColors.textMuted, 'margin-top': '2px' }}>{dateStr}</p>
        </div>
        <span style={{ 'font-size': '12px', padding: '4px 12px', background: themeColors.warningBg, color: themeColors.warningDark, 'border-radius': '9999px', 'font-weight': 500 }}>🔥 专注模式已开启</span>
      </div>

      {/* AI Daily Brief */}
      <div style={{ 'margin-bottom': '20px', padding: '16px', 'border-radius': '12px', border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.primaryBg }}>
        <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', 'border-radius': '50%', background: chartColors.primary, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'white', 'font-size': '18px', 'flex-shrink': 0 }}>
            🤖
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '8px' }}>AI 今日简报</div>
            <Show when={!loading() && focusItems().length === 0}>
              <p style={{ 'font-size': '13px', color: themeColors.textMuted }}>暂无焦点项，AI 将在下次驾驶舱运行时为你生成。</p>
            </Show>
            <Show when={focusItems().length > 0}>
              <p style={{ 'font-size': '14px', color: themeColors.textSecondary, 'margin-bottom': '12px' }}>
                今天有 <strong>{focusItems().length} 件最重要的事</strong>需要你关注。
              </p>
            </Show>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
              <For each={focusItems()}>
                {(item, idx) => {
                  const cfg = priorityConfig[item.priority] ?? priorityConfig['normal'];
                  return (
                    <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '12px', 'border-radius': '8px', padding: '8px 12px', border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                      <div style={{ width: '20px', height: '20px', 'border-radius': '50%', display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'white', 'font-weight': 700, 'font-size': '12px', 'flex-shrink': 0, 'margin-top': '2px', background: cfg.color }}>
                        {idx() + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '2px' }}>
                          <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{item.title}</span>
                          <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                            {cfg.label}
                          </span>
                        </div>
                        <p style={{ 'font-size': '12px', color: themeColors.textMuted, margin: 0 }}>{item.reason}</p>
                      </div>
                      <Show when={item.linkedRoute}>
                        <button
                          style={{ 'font-size': '12px', color: chartColors.primary, 'flex-shrink': 0, 'font-weight': 500, background: 'none', border: 'none', cursor: 'pointer' }}
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
      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        {/* Left: Tasks + Mode Cards */}
        <div>
          {/* Today's Task List */}
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, 'margin-bottom': '16px' }}>
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>今日任务清单</span>
                <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                  Top {todayTasks().length} · {checkedTasks().size}/{todayTasks().length} 完成
                </span>
              </div>
              <button style={{ 'font-size': '12px', color: chartColors.primary, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/solo/build')}>
                全部任务 →
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <Show when={!loading() && todayTasks().length === 0}>
                <div style={{ 'text-align': 'center', padding: '16px 0', color: themeColors.textMuted, 'font-size': '13px' }}>暂无任务</div>
              </Show>
              <For each={todayTasks()}>
                {(task) => {
                  const done = () => checkedTasks().has(task.id);
                  return (
                    <div
                      style={{ display: 'flex', 'align-items': 'center', gap: '12px', padding: '8px 12px', 'border-radius': '8px', border: `1px solid ${themeColors.borderLight}`, background: themeColors.bgSubtle, opacity: done() ? 0.6 : 1, cursor: 'pointer', transition: 'all 0.2s' }}
                      onClick={() => toggleTask(task.id)}
                    >
                      <div style={{ width: '16px', height: '16px', 'border-radius': '4px', border: done() ? `1px solid ${chartColors.success}` : `1px solid ${themeColors.border}`, 'flex-shrink': 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: 'white', 'font-size': '12px', background: done() ? chartColors.success : 'transparent' }}>
                        {done() && '✓'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ 'font-size': '14px', 'text-decoration': done() ? 'line-through' : 'none', color: done() ? themeColors.textMuted : themeColors.text }}>
                          <Show when={task.status === 'doing' && !done()}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', 'border-radius': '50%', background: chartColors.primary, 'margin-right': '6px' }} />
                          </Show>
                          {task.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-shrink': 0 }}>
                        <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: typeStyleMap[task.type]?.bg, color: typeStyleMap[task.type]?.color }}>
                          {typeLabel[task.type]}
                        </span>
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{task.est}</span>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Work Mode Cards */}
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>切换工作模式</span>
            </div>
            <div style={{ padding: '16px', display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '12px' }}>
              <For each={modeCards}>
                {(mode) => (
                  <button
                    style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', padding: '12px', 'border-radius': '12px', border: `1px solid ${mode.border}`, background: mode.color, cursor: 'pointer', 'text-align': 'center', transition: 'transform 0.2s' }}
                    onClick={() => navigate(mode.route)}
                  >
                    <span style={{ 'font-size': '24px', 'margin-bottom': '6px' }}>{mode.icon}</span>
                    <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '2px' }}>{mode.label}</div>
                    <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'line-height': '1.4' }}>{mode.desc}</div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Right: Business Health */}
        <div>
          {/* Business Metrics */}
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, 'margin-bottom': '16px' }}>
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>商业健康快照</span>
              <button style={{ 'font-size': '12px', color: chartColors.primary, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/solo/review')}>
                详细数据 →
              </button>
            </div>
            <div style={{ padding: '12px', display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '12px' }}>
              <Show when={!loading() && metrics().length === 0}>
                <div style={{ 'grid-column': 'span 2', 'text-align': 'center', padding: '16px 0', color: themeColors.textMuted, 'font-size': '13px' }}>暂无指标数据</div>
              </Show>
              <For each={metrics()}>
                {(m) => (
                  <div style={{ padding: '12px', 'border-radius': '12px', border: `1px solid ${m.color}33`, background: `${m.color}08` }}>
                    <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>{m.label}</div>
                    <div style={{ 'font-size': '20px', 'font-weight': 700, color: m.color }}>
                      <Show when={m.trend === 'up'}>
                        <span style={{ 'font-size': '14px', color: chartColors.success, 'margin-right': '4px' }}>↑</span>
                      </Show>
                      {m.value}
                    </div>
                    <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '2px' }}>{m.trendValue}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Streak Card */}
          <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.warningBorder}`, background: themeColors.warningBg, padding: '16px' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '12px', 'margin-bottom': '12px' }}>
              <span style={{ 'font-size': '30px' }}>🔥</span>
              <div>
                <div style={{ 'font-weight': 700, 'font-size': '16px', color: themeColors.text }}>
                  {buildStreak() > 0 ? `连续构建 ${buildStreak()} 天 🔥` : '开始你的连续构建之旅'}
                </div>
                <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                  {buildStreak() > 0 ? '保持每日发布节奏，用户感知到你在快速迭代' : '每天完成一个任务，点亮你的构建火焰图'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
              <For each={Array.from({ length: Math.min(buildStreak(), STREAK_TOTAL_CELLS) })}>
                {() => (
                  <div style={{ width: '14px', height: '14px', 'border-radius': '2px', background: chartColors.warning }} />
                )}
              </For>
              <For each={Array.from({ length: Math.max(0, STREAK_TOTAL_CELLS - buildStreak()) })}>
                {() => (
                  <div style={{ width: '14px', height: '14px', 'border-radius': '2px', background: themeColors.border }} />
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
