import { Component, For, Show, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Timer, Zap, CheckCircle, AlertTriangle, Users, Bot } from 'lucide-solid';
import { currentSprint } from '../../mock/sprint';
import { useAppStore } from '../../stores/app-store';
import ECharts from '../../components/common/echarts';

const statusColumns: { status: string; title: string }[] = [
  { status: 'todo',      title: '待开发' },
  { status: 'in-dev',   title: '开发中' },
  { status: 'in-review', title: '评审中' },
  { status: 'done',     title: '完成' },
];

const SprintCenter: Component = () => {
  const navigate = useNavigate();
  const { state, actions } = useAppStore();

  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Sprint W17 健康度分析：当前 SPI 0.82，有 2 个高风险阻塞项。建议今天优先解决 TASK-001-04 的技术难点，同时跟进 TASK-001-08 的并行开发方案。' }
  ]);
  const [agentThinking, setAgentThinking] = createSignal(false);

  const burndownOption: Record<string, unknown> = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['理想线', '实际'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: currentSprint.burndown.map((d) => `Day${d.day}`),
    },
    yAxis: { type: 'value', name: '故事点' },
    series: [
      {
        name: '理想线',
        type: 'line',
        data: currentSprint.burndown.map((d) => d.ideal),
        lineStyle: { type: 'dashed', color: 'themeColors.border' },
        itemStyle: { color: 'themeColors.border' },
      },
      {
        name: '实际',
        type: 'line',
        data: currentSprint.burndown.filter((d) => d.actual > 0).map((d) => d.actual),
        lineStyle: { color: 'chartColors.primary' },
        itemStyle: { color: 'chartColors.primary' },
        areaStyle: { color: 'rgba(18,100,229,0.1)' },
      },
    ],
  };

  const handleDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer?.setData('taskId', taskId);
  };

  const handleDrop = (e: DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer?.getData('taskId');
    if (taskId) {
      actions.updateTaskStatus(taskId, targetStatus as 'todo' | 'in-dev' | 'in-review' | 'done');
    }
  };

  const handleAgentSend = (q?: string) => {
    const input = q ?? agentInput().trim();
    if (!input || agentThinking()) return;
    setAgentMessages((prev) => [...prev, { role: 'user', content: input }]);
    if (!q) setAgentInput('');
    setAgentThinking(true);
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const sprint = currentSprint;
    const completedTasks = state.tasks.filter((t) => t.status === 'done').length;
    const inDevTasks = state.tasks.filter((t) => t.status === 'in-dev').length;
    const contextSummary = `Sprint ${sprint.id}，第${sprint.currentDay}天/${sprint.totalDays}天
SPI: ${sprint.spiIndex}，完成率: ${Math.round((completedTasks / state.tasks.length) * 100)}%
进行中: ${inDevTasks} 个任务，已完成: ${completedTasks} 个任务
高风险项: ${sprint.risks.filter((r: {level: string}) => r.level === 'high').length} 个`;

    actions.callAgent({
      systemPrompt: `你是一个项目管理助手（project-manager-agent），专注于 Sprint 管理和团队效能。
你有以下能力：
- 分析 Sprint 健康度和风险
- 提供任务优先级建议
- 预测 Sprint 完成率
- 制定应对风险的行动方案

当前 Sprint 上下文：
${contextSummary}

请用中文回复，给出具体可执行的建议。`,
      userPrompt: input,
      title: `pm-agent-${Date.now()}`,
      onText: (text) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text };
          return updated;
        });
      },
      onDone: (fullText) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullText || '分析完成。' };
          return updated;
        });
        setAgentThinking(false);
      },
      onError: (_err) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '⚠️ AI 服务暂不可用，请检查配置。' };
          return updated;
        });
        setAgentThinking(false);
      },
    }).catch(() => { setAgentThinking(false); });
  };

  return (
    <div>
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px' }}>
        <h2 style={{ 'font-size': '16px', 'font-weight': 600, color: 'themeColors.text', margin: 0 }}>
          {currentSprint.id} (Day {currentSprint.currentDay}/{currentSprint.totalDays})
        </h2>
        <button
          style={{ padding: '6px 16px', background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '13px', cursor: 'pointer' }}
          onClick={() => navigate('/sprint/plan')}
        >
          下个 Sprint 规划
        </button>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px', 'margin-bottom': '16px' }}>
        {/* Burndown chart */}
        <div style={{ border: '1px solid themeColors.border', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
          <div style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary', 'margin-bottom': '8px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <Timer size={14} /> 燃尽图
          </div>
          <ECharts option={burndownOption} style={{ height: '250px' }} />
        </div>

        {/* Sprint health */}
        <div style={{ border: '1px solid themeColors.border', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
          <div style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary', 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <Zap size={14} /> Sprint 健康度
          </div>
          <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px', 'margin-bottom': '12px' }}>
            <div>
              <div style={{ 'font-size': '11px', color: 'themeColors.textMuted', 'margin-bottom': '4px' }}>速度 SPI</div>
              <div
                style={{ 'font-size': '24px', 'font-weight': 'bold', color: currentSprint.spiIndex < 0.9 ? 'chartColors.warning' : 'chartColors.success' }}
              >
                {currentSprint.spiIndex.toFixed(2)}
                <span style={{ 'font-size': '13px', 'margin-left': '4px' }}>{currentSprint.spiIndex < 0.9 ? '⚠️' : '✅'}</span>
              </div>
            </div>
            <div>
              <div style={{ 'font-size': '11px', color: 'themeColors.textMuted', 'margin-bottom': '4px' }}>完成率</div>
              <div style={{ 'font-size': '24px', 'font-weight': 'bold', color: 'themeColors.text' }}>{currentSprint.completionRate}%</div>
              <div style={{ 'font-size': '11px', color: 'themeColors.border' }}>计划 55%</div>
            </div>
            <div>
              <div style={{ 'font-size': '11px', color: 'themeColors.textMuted', 'margin-bottom': '4px' }}>阻塞 TASK</div>
              <div style={{ 'font-size': '24px', 'font-weight': 'bold', color: 'themeColors.text' }}>{currentSprint.blockedTasks}</div>
            </div>
            <div>
              <div style={{ 'font-size': '11px', color: 'themeColors.textMuted', 'margin-bottom': '4px' }}>预测完成</div>
              <div style={{ 'font-size': '13px', 'font-weight': 500, color: 'themeColors.text' }}>{currentSprint.predictedEnd}</div>
              <div style={{ 'font-size': '11px', color: 'themeColors.border' }}>原计划 {currentSprint.originalEnd}，+3天</div>
            </div>
          </div>
          <button style={{ width: '100%', padding: '8px', border: '1px solid themeColors.border', background: 'white', color: 'themeColors.textSecondary', 'border-radius': '6px', 'font-size': '13px', cursor: 'pointer', display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '6px' }}>
            <Bot size={14} /> 风险分析
          </button>
        </div>
      </div>

      {/* Task Kanban */}
      <div style={{ border: '1px solid themeColors.border', 'border-radius': '8px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
        <div style={{ padding: '12px 16px', 'border-bottom': '1px solid themeColors.border', 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary' }}>TASK 看板</div>
        <div style={{ padding: '16px', display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px' }}>
          <For each={statusColumns}>
            {(col) => {
              const colTasks = () => state.tasks.filter((t) => t.status === col.status);
              return (
                <div
                  style={{ 'min-height': '288px', background: 'themeColors.hover', 'border-radius': '6px', padding: '8px' }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, col.status)}
                >
                  <div style={{ 'font-weight': 600, 'font-size': '12px', color: 'themeColors.textMuted', 'margin-bottom': '8px', padding: '0 4px' }}>
                    {col.title} ({colTasks().length})
                  </div>
                  <For each={colTasks()}>
                    {(task) => (
                      <div
                        style={{ background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '12px', 'margin-bottom': '8px', cursor: 'grab' }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                      >
                        <div style={{ 'font-weight': 600, 'font-size': '12px', color: 'themeColors.text', 'margin-bottom': '4px' }}>{task.id}</div>
                        <div style={{ 'font-size': '12px', color: 'themeColors.text', 'margin-bottom': '4px' }}>{task.title}</div>
                        <Show when={task.actual && task.estimate && task.actual > task.estimate}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', background: 'themeColors.surface2f0', color: 'themeColors.error', 'border-radius': '4px', 'font-size': '11px', 'margin-bottom': '4px' }}>
                            超时{Math.round(((task.actual! - task.estimate) / task.estimate) * 100)}%
                          </span>
                        </Show>
                        <Show when={(task.dependencies?.length ?? 0) > 0}>
                          <span style={{ display: 'block', padding: '2px 8px', background: 'themeColors.surface7e6', color: 'themeColors.warning', 'border-radius': '4px', 'font-size': '11px', 'margin-top': '4px' }}>等待依赖</span>
                        </Show>
                        <Show when={!!task.assignee}>
                          <div style={{ 'font-size': '11px', color: 'themeColors.border', 'margin-top': '4px' }}>{task.assignee}</div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Risk warnings */}
      <div style={{ border: '1px solid themeColors.border', 'border-radius': '8px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
        <div style={{ padding: '12px 16px', 'border-bottom': '1px solid themeColors.border', 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> 实时风险预警
        </div>
        <div style={{ padding: '16px', 'display': 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <For each={currentSprint.risks}>
            {(risk) => (
              <div
                style={{
                  padding: '12px',
                  'border-radius': '6px',
                  border: '1px solid',
                  'font-size': '13px',
                  display: 'flex',
                  'align-items': 'flex-start',
                  gap: '8px',
                  background: risk.level === 'high' ? 'themeColors.surface2f0' : 'themeColors.surfacebe6',
                  'border-color': risk.level === 'high' ? 'themeColors.errorBorder' : 'themeColors.warningBorder',
                  color: risk.level === 'high' ? 'themeColors.error' : 'themeColors.warning',
                }}
              >
                <span>{risk.level === 'high' ? '🔴' : '🟡'}</span>
                <span>{risk.message}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* PM Agent panel */}
      <div style={{ 'margin-top': '16px', border: '1px solid themeColors.primaryBg', 'border-radius': '8px', background: 'themeColors.primaryBg', padding: '16px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'font-weight': 600, 'font-size': '13px', color: 'chartColors.primary', 'margin-bottom': '8px' }}>
          <Bot size={14} /> project-manager-agent
        </div>
        <div style={{ 'max-height': '200px', 'overflow-y': 'auto', 'margin-bottom': '8px', display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <For each={agentMessages()}>
            {(msg) => (
              <div style={{ padding: '8px 10px', background: msg.role === 'user' ? 'themeColors.primaryBg' : 'themeColors.surface', 'border-radius': '6px', 'font-size': '12px', 'white-space': 'pre-wrap' }}>
                <span style={{ 'font-weight': 600, 'font-size': '11px' }}>{msg.role === 'user' ? '你' : 'PM-agent'}：</span><br />
                {msg.content}
              </div>
            )}
          </For>
        </div>
        <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
          <For each={['分析当前风险', '预测完成率', '生成每日站会摘要']}>
            {(q) => (
              <button
                style={{ 'font-size': '12px', padding: '4px 10px', border: '1px solid themeColors.primaryBorder', color: 'chartColors.primary', 'border-radius': '6px', background: 'transparent', cursor: 'pointer' }}
                onClick={() => handleAgentSend(q)}
              >{q}</button>
            )}
          </For>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={agentInput()}
            onInput={(e) => setAgentInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
            placeholder="问 PM-agent..."
            style={{ flex: 1, padding: '6px 10px', border: '1px solid themeColors.primaryBorder', 'border-radius': '6px', 'font-size': '12px', outline: 'none', background: 'themeColors.surface' }}
          />
          <button
            onClick={() => handleAgentSend()}
            disabled={agentThinking()}
            style={{ padding: '6px 12px', background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '12px', cursor: agentThinking() ? 'not-allowed' : 'pointer', opacity: agentThinking() ? '0.6' : '1' }}
          >
            {agentThinking() ? '思考中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SprintCenter;
