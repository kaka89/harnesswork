import { Component, createSignal, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Bot, Code, CheckCircle, XCircle, Clock, PlayCircle, Zap, GitBranch } from 'lucide-solid';
import { useAppStore } from '../../../stores/app-store';
import { themeColors } from '../../../utils/colors';

const ciStatusMap: Record<string, { color: string; label: string }> = {
  running: { color: '#1890ff', label: '运行中' },
  passed:  { color: '#52c41a', label: '通过' },
  failed:  { color: '#ff4d4f', label: '失败' },
  pending: { color: '#faad14', label: '等待' },
};

const DevWorkshop: Component = () => {
  const navigate = useNavigate();
  const { state, actions } = useAppStore();
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal<{ role: string; content: string }[]>([]);
  const [agentThinking, setAgentThinking] = createSignal(false);

  const myTasks = () => state.tasks.filter((t) => t.assignee === '张开发');
  const inProgressTasks = () => myTasks().filter((t) => t.status === 'in-dev');
  const doneTasks = () => myTasks().filter((t) => t.status === 'done');
  const unclaimedTasks = () => state.tasks.filter((t) => !t.assignee && t.status === 'todo');

  const teamMembers = [
    { name: '张开发', taskId: 'TASK-001-02', status: 'in-dev' },
    { name: '李前端', taskId: 'TASK-001-05', status: 'in-dev' },
    { name: '王测试', taskId: 'TASK-001-07', status: 'todo' },
  ];

  const handleClaim = (taskId: string) => {
    actions.claimTask(taskId, state.currentUser);
  };

  const handleAgentSend = (overrideInput?: string) => {
    const q = overrideInput ?? agentInput().trim();
    if (!q || agentThinking()) return;
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    if (!overrideInput) setAgentInput('');
    setAgentThinking(true);

    const currentTask = inProgressTasks()[0];
    const contextSummary = currentTask
      ? `当前任务：${currentTask.id} - ${currentTask.title}\nDoD进度：${currentTask.dod.filter((d: { done: boolean }) => d.done).length}/${currentTask.dod.length}\n分支：${currentTask.branch ?? '未知'}\nCI状态：${currentTask.ciStatus ?? '未知'}`
      : '暂无进行中任务';

    // 先插入空的 assistant 消息，用于流式更新
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    actions.callAgent({
      systemPrompt: `你是一个开发助手（dev-agent），专注于帮助开发者完成编码任务。
你有以下能力：
- 根据任务需求生成单元测试骨架
- 检查 DoD（Definition of Done）完成情况
- 解释行为规格（BH）和契约测试（CONTRACT）
- 提供代码审查建议和最佳实践

当前上下文：
${contextSummary}

请用中文回复，保持专业简洁。`,
      userPrompt: q,
      title: `dev-agent-${Date.now()}`,
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
          updated[updated.length - 1] = { role: 'assistant', content: fullText || '已完成分析。' };
          return updated;
        });
        setAgentThinking(false);
      },
      onError: (_err) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '⚠️ AI 服务暂不可用，请检查 OpenCode 连接或 LLM 配置。' };
          return updated;
        });
        setAgentThinking(false);
      },
    }).catch(() => {
      setAgentThinking(false);
    });
  };

  return (
    <div>
      <h2 style={{ 'font-size': '20px', 'font-weight': 600, 'margin-bottom': '16px', 'margin-top': '0' }}>
        开发工坊 <span style={{ 'font-size': '14px', 'font-weight': 400, color: themeColors.textSecondary }}>@{state.currentUser}</span>
      </h2>

      {/* In-progress tasks */}
      <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', 'margin-bottom': '16px', background: themeColors.surface }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
          <Zap size={16} style={{ color: '#ff4d4f' }} />
          <span style={{ 'font-weight': 600, 'font-size': '14px' }}>进行中</span>
        </div>
        <div style={{ padding: '16px', 'display': 'flex', 'flex-direction': 'column', gap: '12px' }}>
          <For each={inProgressTasks()}>
            {(task) => {
              const dodDone = task.dod.filter((d) => d.done).length;
              const dodTotal = task.dod.length;
              const ci = task.ciStatus ? ciStatusMap[task.ciStatus] : null;
              const overtime = task.actual && task.estimate ? ((task.actual - task.estimate) / task.estimate * 100).toFixed(0) : null;

              return (
                <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap', 'margin-bottom': '8px' }}>
                        <span style={{ 'font-weight': 600, 'font-size': '13px' }}>{task.id}:</span>
                        <span style={{ 'font-size': '13px' }}>{task.title}</span>
                        <Show when={overtime && Number(overtime) > 0}>
                          <span style={{ padding: '0 7px', background: '#fff2f0', color: '#ff4d4f', 'border-radius': '4px', 'font-size': '12px', border: '1px solid #ffccc7' }}>超时 {overtime}%</span>
                        </Show>
                      </div>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px', 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px' }}>
                        <Show when={task.branch}>
                          <span style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
                            <GitBranch size={12} /> {task.branch}
                          </span>
                        </Show>
                        <Show when={ci}>
                          <span style={{ color: ci!.color }}>CI {ci!.label}</span>
                        </Show>
                        <Show when={task.coverage !== undefined}>
                          <span>覆盖率: {task.coverage}%</span>
                        </Show>
                      </div>
                      <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>DoD 进度: {dodDone}/{dodTotal}</div>
                      <div style={{ background: themeColors.borderLight, 'border-radius': '100px', height: '8px', 'margin-bottom': '8px' }}>
                        <div
                          style={{ background: themeColors.primary, height: '100%', 'border-radius': '100px', width: `${Math.round((dodDone / dodTotal) * 100)}%`, transition: 'width 0.3s' }}
                        />
                      </div>
                      <div>
                        <For each={task.dod}>
                          {(d) => (
                            <div style={{ 'font-size': '13px', color: d.done ? '#52c41a' : '#8c8c8c', 'margin-bottom': '2px', display: 'flex', 'align-items': 'center', gap: '8px', padding: '4px 0' }}>
                              {d.done ? <CheckCircle size={14} /> : <XCircle size={14} />} {d.label}
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'margin-left': '16px', 'flex-shrink': 0 }}>
                      <button style={{ padding: '0 7px', height: '24px', border: `1px solid ${themeColors.border}`, background: 'white', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer' }}>查看 TASK</button>
                      <button style={{ padding: '0 7px', height: '24px', border: `1px solid ${themeColors.border}`, background: 'white', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer' }}>关联 CONTRACT</button>
                      <button style={{ padding: '0 7px', height: '24px', border: `1px solid ${themeColors.border}`, background: 'white', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '4px' }}>
                        <Bot size={12} /> 问 dev-agent
                      </button>
                      <button
                        style={{ padding: '0 7px', height: '24px', background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '4px' }}
                        onClick={() => navigate(`/dev/pr/${task.id}`)}
                      >
                        <PlayCircle size={12} /> 提交 PR
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
          <Show when={inProgressTasks().length === 0}>
            <div style={{ 'text-align': 'center', color: themeColors.textMuted, 'font-size': '13px', padding: '16px 0' }}>暂无进行中的任务</div>
          </Show>
        </div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px' }}>
        {/* Unclaimed tasks */}
        <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', background: themeColors.surface }}>
          <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, 'font-weight': 600, 'font-size': '14px' }}>待认领</div>
          <div style={{ padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={unclaimedTasks()}>
              {(task) => (
                <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', padding: '12px', transition: 'box-shadow 0.2s, transform 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ 'font-weight': 600, 'font-size': '13px', 'margin-bottom': '4px' }}>{task.id}</div>
                  <div style={{ 'font-size': '13px', 'margin-bottom': '4px' }}>{task.title}</div>
                  <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '4px' }}>
                    估时: {task.estimate}天
                    <Show when={(task.dependencies?.length ?? 0) > 0}>
                      <span style={{ 'margin-left': '8px', padding: '0 7px', background: '#fffbe6', color: '#d48806', 'border-radius': '4px', border: '1px solid #ffe58f', 'font-size': '12px' }}>等待依赖</span>
                    </Show>
                  </div>
                  <button
                    style={{ padding: '0 7px', height: '24px', 'font-size': '12px', background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', cursor: 'pointer', 'margin-top': '4px' }}
                    onClick={() => handleClaim(task.id)}
                  >
                    认领
                  </button>
                </div>
              )}
            </For>
            <Show when={unclaimedTasks().length === 0}>
              <div style={{ 'text-align': 'center', color: themeColors.textMuted, 'font-size': '12px', padding: '16px 0' }}>暂无待认领任务</div>
            </Show>
          </div>
        </div>

        {/* Done tasks */}
        <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', background: themeColors.surface }}>
          <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, 'font-weight': 600, 'font-size': '14px' }}>已完成（本Sprint）</div>
          <div style={{ padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
            <For each={doneTasks()}>
              {(task) => (
                <div style={{ 'font-size': '13px', display: 'flex', 'align-items': 'center', gap: '6px', padding: '4px 0' }}>
                  <CheckCircle size={14} style={{ color: '#52c41a' }} /> {task.id} {task.title}
                </div>
              )}
            </For>
            <Show when={doneTasks().length === 0}>
              <div style={{ 'text-align': 'center', color: themeColors.textMuted, 'font-size': '12px', padding: '16px 0' }}>暂无已完成任务</div>
            </Show>
          </div>
        </div>

        {/* Team board */}
        <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', background: themeColors.surface }}>
          <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, 'font-weight': 600, 'font-size': '14px' }}>团队看板</div>
          <div style={{ padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={teamMembers}>
              {(m) => (
                <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'font-size': '13px', padding: '4px 0' }}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                    <span>👤</span>
                    <span>{m.name}</span>
                  </div>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                    <span style={{ 'font-size': '12px', color: themeColors.textSecondary }}>{m.taskId}</span>
                    <span
                      style={{ width: '8px', height: '8px', 'border-radius': '50%', background: m.status === 'in-dev' ? '#1890ff' : themeColors.border }}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Agent panel */}
      <div style={{ 'margin-top': '16px', border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '8px', background: 'linear-gradient(135deg, #f0f5ff 0%, #e8f4f8 100%)', padding: '16px' }}>
        <div style={{ 'font-weight': 600, 'font-size': '14px', color: '#1264e5', 'margin-bottom': '8px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <Bot size={14} /> dev-agent（已加载 TASK-001-02 上下文）
        </div>
        <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>已读取：TASK-001-02 + CONTRACT-001 + SDD-001 §3</div>
        <For each={agentMessages()}>
          {(msg) => (
            <div
              style={{ 'margin-bottom': '8px', padding: '6px 10px', background: msg.role === 'user' ? 'var(--dls-info-bg)' : 'var(--dls-surface)', 'border-radius': '6px', 'font-size': '13px', 'white-space': 'pre-wrap' }}
            >
              <span style={{ 'font-weight': 600, 'font-size': '12px' }}>{msg.role === 'user' ? '你' : 'dev-agent'}：</span><br />
              {msg.content}
            </div>
          )}
        </For>
        <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
          <For each={['生成单元测试骨架', '解释 BH 规格', '检查 DoD']}>
            {(q) => (
              <button
                style={{ 'font-size': '12px', padding: '0 7px', height: '24px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', background: 'transparent', cursor: 'pointer' }}
                onClick={() => handleAgentSend(q)}
              >
                {q}
              </button>
            )}
          </For>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={agentInput()}
            onInput={(e) => setAgentInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
            placeholder="问我..."
            style={{ flex: 1, padding: '4px 11px', height: '32px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', 'font-size': '14px', outline: 'none', background: themeColors.surface }}
          />
          <button
            onClick={() => handleAgentSend()}
            disabled={agentThinking()}
            style={{ padding: '4px 15px', height: '32px', background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '14px', cursor: agentThinking() ? 'not-allowed' : 'pointer', opacity: agentThinking() ? '0.65' : '1' }}
          >
            {agentThinking() ? '思考中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevWorkshop;
