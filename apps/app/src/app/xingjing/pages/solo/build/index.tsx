import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { soloTasks as mockSoloTasks, adrs as mockAdrs, SoloTask, ADR } from '../../../mock/solo';
import {
  loadSoloTasks,
  saveSoloTask,
  loadAdrs,
  saveAdr,
  type SoloTaskRecord,
  type SoloAdr,
} from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { Code, Send, CheckCircle, Clock, PlayCircle, Plus } from 'lucide-solid';

const typeStyleMap: Record<string, { bg: string; color: string }> = {
  dev:     { bg: themeColors.primaryBg, color: chartColors.primary },
  product: { bg: themeColors.purpleBg, color: themeColors.purple },
  ops:     { bg: themeColors.warningBg, color: themeColors.warningDark },
  growth:  { bg: themeColors.successBg, color: chartColors.success },
};

const statusStyleMap: Record<string, { bg: string; color: string }> = {
  todo:  { bg: themeColors.hover, color: themeColors.textSecondary },
  doing: { bg: themeColors.primaryBg, color: chartColors.primary },
  done:  { bg: themeColors.successBg, color: chartColors.success },
};

const typeLabel: Record<string, string> = { dev: '开发', product: '产品', ops: '运营', growth: '增长' };
const statusLabel: Record<string, string> = { todo: '待办', doing: '进行中', done: '完成' };

const TaskCard: Component<{ task: SoloTask; active?: boolean }> = (props) => {
  const [checked, setChecked] = createSignal<Record<number, boolean>>({});

  const doneCount = () => props.task.dod.filter((_, i) => checked()[i]).length;
  const progress = () => Math.round((doneCount() / props.task.dod.length) * 100);

  return (
    <div style={{
      'border-radius': '12px', padding: '14px',
      border: props.active ? `2px solid ${chartColors.primary}` : `1px solid ${themeColors.borderLight}`,
      background: props.active ? themeColors.primaryBg : themeColors.surface,
    }}>
      <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '8px', 'margin-bottom': '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '6px' }}>
            <Show when={props.active}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', 'border-radius': '50%', background: chartColors.primary, 'flex-shrink': 0 }} />
            </Show>
            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{props.task.title}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'margin-bottom': '8px' }}>
            <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: typeStyleMap[props.task.type]?.bg, color: typeStyleMap[props.task.type]?.color }}>
              {typeLabel[props.task.type]}
            </span>
            <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: statusStyleMap[props.task.status]?.bg, color: statusStyleMap[props.task.status]?.color }}>
              {statusLabel[props.task.status]}
            </span>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>预估 {props.task.est}</span>
          </div>
          <Show when={props.task.note}>
            <div style={{ 'margin-bottom': '8px', padding: '6px 10px', background: themeColors.warningBg, 'border-radius': '8px', 'font-size': '12px', color: themeColors.warning }}>
              📝 {props.task.note}
            </div>
          </Show>
        </div>
      </div>

      {/* DoD */}
      <div>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '6px' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>DoD（完成标准）</span>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{doneCount()}/{props.task.dod.length}</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: themeColors.hover, 'border-radius': '9999px', 'margin-bottom': '8px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: chartColors.primary, 'border-radius': '9999px', transition: 'all 0.3s', width: `${progress()}%` }} />
        </div>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <For each={props.task.dod}>
            {(item, i) => (
              <label
                style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer' }}
                onClick={() => setChecked(prev => ({ ...prev, [i()]: !prev[i()] }))}
              >
                <div style={{
                  width: '14px', height: '14px', 'border-radius': '4px', 'flex-shrink': 0,
                  display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                  color: 'white', 'font-size': '12px',
                  border: checked()[i()] ? `1px solid ${chartColors.success}` : `1px solid ${themeColors.border}`,
                  background: checked()[i()] ? chartColors.success : 'transparent',
                }}>
                  {checked()[i()] && '✓'}
                </div>
                <span style={{ 'font-size': '12px', 'text-decoration': checked()[i()] ? 'line-through' : 'none', color: checked()[i()] ? themeColors.textMuted : themeColors.textSecondary }}>
                  {item}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

const SoloBuild: Component = () => {
  const { productStore } = useAppStore();
  const [activeTab, setActiveTab] = createSignal<'tasks' | 'adr'>('tasks');
  const [tasks, setTasks] = createSignal<SoloTask[]>(mockSoloTasks);
  const [adrs, setAdrs] = createSignal<ADR[]>(mockAdrs);
  const [adrModal, setAdrModal] = createSignal(false);
  const [adrTitle, setAdrTitle] = createSignal('');
  const [adrBackground, setAdrBackground] = createSignal('');
  const [adrDecision, setAdrDecision] = createSignal('');
  const [adrConsequences, setAdrConsequences] = createSignal('');
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal([
    { role: 'assistant', content: '我已加载当前任务上下文。\n\n需要我帮你分析解决方案吗？' },
  ]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const [fileTasks, fileAdrs] = await Promise.all([
        loadSoloTasks(workDir),
        loadAdrs(workDir),
      ]);
      if (fileTasks.length > 0) setTasks(fileTasks as unknown as SoloTask[]);
      if (fileAdrs.length > 0) setAdrs(fileAdrs as unknown as ADR[]);
    } catch {
      // Mock fallback
    }
  });

  const doingTasks = () => tasks().filter((t) => t.status === 'doing');
  const todoTasks = () => tasks().filter((t) => t.status === 'todo');
  const doneTasks = () => tasks().filter((t) => t.status === 'done');

  const addTask = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    const newTask: SoloTask = {
      id: `task-${Date.now()}`, title: '新任务', type: 'dev', status: 'todo', est: '1h',
      dod: ['完成实现', '本地测试通过'], createdAt: new Date().toISOString().slice(0, 10),
    };
    setTasks((prev) => [...prev, newTask]);
    if (workDir) {
      await saveSoloTask(workDir, newTask as unknown as SoloTaskRecord);
    }
  };

  const handleSend = () => {
    if (!agentInput().trim()) return;
    const q = agentInput().trim();
    setAgentMessages(prev => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (q.includes('光标') || q.includes('IME') || q.includes('bug')) {
        reply = '根据你知识库中的笔记，这个 bug 的解法是：\n\n```js\nlet composing = false;\neditor.on("compositionstart", () => { composing = true; });\neditor.on("compositionend", () => {\n  composing = false;\n  // restore saved selection\n});\n```\n\n核心：在 compositionstart 时缓存 selection，compositionend 时恢复。';
      } else if (q.includes('测试') || q.includes('DoD')) {
        reply = '当前进行中任务的 DoD 可以在左侧卡片中逐项确认。建议先写最小复现用例，验证 fix 是否正确，再部署。';
      } else {
        reply = '我已读取你的 ADR 和当前代码架构。有什么具体问题需要我帮你分析？';
      }
      setAgentMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    }, 700);
  };

  const tabStyle = (isActive: boolean): Record<string, string | number> => ({
    padding: '8px 16px', 'font-size': '14px', 'font-weight': 500,
    'border-bottom': isActive ? `2px solid ${chartColors.primary}` : '2px solid transparent',
    color: isActive ? chartColors.primary : themeColors.textMuted,
    background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s',
  });

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Page Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: chartColors.primary }}>💻</span>
          构建中
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>{doingTasks().length} 进行中</span>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.hover, color: themeColors.textSecondary, 'border-radius': '9999px' }}>{todoTasks().length} 待办</span>
          <span style={{ 'font-size': '12px', padding: '4px 8px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>{doneTasks().length} 已完成</span>
        </div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        {/* Left: Tasks / ADR */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            <div style={{ display: 'flex', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <button style={tabStyle(activeTab() === 'tasks')} onClick={() => setActiveTab('tasks')}>
                💻 全部任务
                <span style={{ 'margin-left': '6px', 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>{doingTasks().length} 进行中</span>
              </button>
              <button style={tabStyle(activeTab() === 'adr')} onClick={() => setActiveTab('adr')}>
                🌲 架构决策 (ADR)
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              <Show when={activeTab() === 'tasks'}>
                <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 对比团队版：</strong> 无角色区分（PM/Dev/QA 分开看），无 Sprint 容量计算，无跨团队依赖管理。你就是全部角色，任务统一管理。
                </div>

                <Show when={doingTasks().length > 0}>
                  <div style={{ 'margin-bottom': '20px' }}>
                    <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>🔥 当前进行中</div>
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
                      <For each={doingTasks()}>
                        {(t) => <TaskCard task={t} active />}
                      </For>
                    </div>
                  </div>
                </Show>

                <div style={{ 'margin-bottom': '20px' }}>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>⬜ 待办</div>
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                    <For each={todoTasks()}>
                      {(t) => <TaskCard task={t} />}
                    </For>
                  </div>
                  <button style={{ 'margin-top': '10px', width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }} onClick={addTask}>
                    + 添加任务
                  </button>
                </div>

                <div>
                  <div style={{ 'font-size': '12px', 'font-weight': 600, color: themeColors.textMuted, 'letter-spacing': '0.05em', 'margin-bottom': '8px' }}>✅ 最近完成</div>
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', opacity: 0.7 }}>
                    <For each={doneTasks()}>
                      {(t) => <TaskCard task={t} />}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={activeTab() === 'adr'}>
                <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
                  <strong>💡 对比团队版：</strong> 团队版有完整 SDD（含 Mermaid 架构图、CONTRACT、PLAN 分层）。独立版 ADR 极简：一个问题 + 一个决策 + 一个原因，写完就走。
                </div>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <For each={adrs()}>
                    {(adr) => (
                      <div style={{ 'border-radius': '12px', border: `1px solid ${themeColors.borderLight}`, padding: '16px' }}>
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '12px' }}>
                          <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>{adr.title}</span>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-shrink': 0 }}>
                            <span style={{ 'font-size': '12px', padding: '1px 8px', 'border-radius': '9999px', background: adr.status === 'active' ? themeColors.successBg : themeColors.hover, color: adr.status === 'active' ? chartColors.success : themeColors.textMuted }}>
                              {adr.status === 'active' ? '有效' : '已废弃'}
                            </span>
                            <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{adr.date}</span>
                          </div>
                        </div>
                        <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '8px' }}>
                          <div style={{ background: themeColors.warningBg, 'border-radius': '8px', padding: '10px' }}>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>❓ 问题</div>
                            <div style={{ 'font-size': '14px', color: themeColors.text }}>{adr.question}</div>
                          </div>
                          <div style={{ background: themeColors.primaryBg, 'border-radius': '8px', padding: '10px' }}>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>✅ 决策</div>
                            <div style={{ 'font-size': '14px', 'font-weight': 600, color: themeColors.text }}>{adr.decision}</div>
                          </div>
                          <div style={{ background: themeColors.successBg, 'border-radius': '8px', padding: '10px' }}>
                            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>💡 原因</div>
                            <div style={{ 'font-size': '14px', color: themeColors.text }}>{adr.reason}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                  <button style={{ width: '100%', padding: '8px', border: `2px dashed ${themeColors.border}`, 'border-radius': '8px', 'font-size': '14px', color: themeColors.textMuted, background: 'transparent', cursor: 'pointer' }} onClick={() => setAdrModal(true)}>
                    + 记录架构决策
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right: Dev Agent */}
        <div>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface, display: 'flex', 'flex-direction': 'column', height: 'calc(100vh - 200px)' }}>
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span style={{ color: chartColors.primary }}>🤖</span>
              <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>dev-agent</span>
              <span style={{ 'font-size': '12px', padding: '1px 6px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>已加载任务上下文</span>
            </div>

            <div style={{ flex: 1, 'overflow-y': 'auto', padding: '12px', display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <For each={agentMessages()}>
                {(msg) => (
                  <div style={{ display: 'flex', 'justify-content': msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ 'max-width': '90%', padding: '8px 12px', 'font-size': '12px', 'line-height': '1.6', 'white-space': 'pre-wrap', 'font-family': 'monospace', ...(msg.role === 'user' ? { background: chartColors.primary, color: 'white', 'border-radius': '16px 16px 4px 16px' } : { background: themeColors.hover, color: themeColors.text, 'border-radius': '16px 16px 16px 4px' }) }}>
                      {msg.content}
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div style={{ padding: '8px 12px', 'border-top': `1px solid ${themeColors.borderLight}`, display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
              <For each={['当前任务状态', '当前 DoD 进度', '架构决策记录']}>
                {(q) => (
                  <button style={{ 'font-size': '12px', padding: '4px 10px', background: themeColors.hover, 'border-radius': '9999px', border: `1px solid ${themeColors.border}`, cursor: 'pointer', color: themeColors.textSecondary }} onClick={() => setAgentInput(q)}>
                    {q}
                  </button>
                )}
              </For>
            </div>

            <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="问 dev-agent..."
                style={{ flex: 1, border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '8px 12px', 'font-size': '12px', outline: 'none', background: themeColors.surface, color: themeColors.text }}
              />
              <button onClick={handleSend} style={{ background: chartColors.primary, color: 'white', 'border-radius': '8px', padding: '8px 12px', 'font-size': '14px', border: 'none', cursor: 'pointer' }}>
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ADR Modal */}
      <Show when={adrModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: themeColors.surface, 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '480px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600, color: themeColors.text }}>记录架构决策</h3>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>决策标题</label>
              <input type="text" placeholder="输入决策标题..." value={adrTitle()} onInput={(e) => setAdrTitle(e.currentTarget.value)} style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }} />
            </div>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>背景</label>
              <textarea rows={3} placeholder="描述问题背景..." value={adrBackground()} onInput={(e) => setAdrBackground(e.currentTarget.value)} style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }} />
            </div>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>决策内容</label>
              <textarea rows={3} placeholder="描述做出的决策..." value={adrDecision()} onInput={(e) => setAdrDecision(e.currentTarget.value)} style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }} />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>后果</label>
              <textarea rows={3} placeholder="描述决策的后果和影响..." value={adrConsequences()} onInput={(e) => setAdrConsequences(e.currentTarget.value)} style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box', background: themeColors.surface, color: themeColors.text }} />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px', color: themeColors.text }} onClick={() => setAdrModal(false)}>取消</button>
              <button style={{ background: chartColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }} onClick={() => setAdrModal(false)}>保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloBuild;
