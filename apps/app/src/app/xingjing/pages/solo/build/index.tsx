import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { soloTasks as mockSoloTasks, adrs as mockAdrs, SoloTask, ADR } from '../../../mock/solo';
import { readYamlDir, writeYaml, readMarkdownDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { Code, Send, CheckCircle, Clock, PlayCircle, Plus } from 'lucide-solid';

const typeConfig: Record<string, { label: string; colorClass: string }> = {
  dev:     { label: '开发', colorClass: 'bg-blue-100 text-blue-700' },
  product: { label: '产品', colorClass: 'bg-purple-100 text-purple-700' },
  ops:     { label: '运营', colorClass: 'bg-orange-100 text-orange-700' },
  growth:  { label: '增长', colorClass: 'bg-green-100 text-green-700' },
};

const statusConfig = {
  todo:  { label: '待办', colorClass: 'bg-gray-100 text-gray-600' },
  doing: { label: '进行中', colorClass: 'bg-blue-100 text-blue-700' },
  done:  { label: '完成', colorClass: 'bg-green-100 text-green-700' },
};

const TaskCard: Component<{ task: SoloTask; active?: boolean }> = (props) => {
  const [checked, setChecked] = createSignal<Record<number, boolean>>({});

  const doneCount = () => props.task.dod.filter((_, i) => checked()[i]).length;
  const progress = () => Math.round((doneCount() / props.task.dod.length) * 100);

  return (
    <div
      class={`rounded-xl border p-3.5 ${
        props.active
          ? 'border-2 border-blue-500 bg-blue-50'
          : 'border-gray-100 bg-white'
      }`}
    >
      <div class="flex items-start gap-2 mb-2">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1.5">
            <Show when={props.active}>
              <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            </Show>
            <span class="font-semibold text-sm text-gray-900">{props.task.title}</span>
          </div>
          <div class="flex gap-1.5 flex-wrap mb-2">
            <span class={`text-xs px-1.5 py-0.5 rounded ${typeConfig[props.task.type].colorClass}`}>
              {typeConfig[props.task.type].label}
            </span>
            <span class={`text-xs px-1.5 py-0.5 rounded ${statusConfig[props.task.status].colorClass}`}>
              {statusConfig[props.task.status].label}
            </span>
            <span class="text-xs text-gray-400">预估 {props.task.est}</span>
          </div>
          <Show when={props.task.note}>
            <div class="mb-2 px-2.5 py-1.5 bg-yellow-50 rounded-lg text-xs text-yellow-800">
              📝 {props.task.note}
            </div>
          </Show>
        </div>
      </div>

      {/* DoD */}
      <div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-xs text-gray-400">DoD（完成标准）</span>
          <span class="text-xs text-gray-400">{doneCount()}/{props.task.dod.length}</span>
        </div>
        {/* Progress bar */}
        <div class="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
          <div
            class="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress()}%` }}
          />
        </div>
        <div class="flex flex-col gap-1">
          <For each={props.task.dod}>
            {(item, i) => (
              <label
                class="flex items-center gap-2 cursor-pointer"
                onClick={() => setChecked(prev => ({ ...prev, [i()]: !prev[i()] }))}
              >
                <div
                  class={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-white text-xs ${
                    checked()[i()] ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}
                >
                  {checked()[i()] && '✓'}
                </div>
                <span
                  class={`text-xs ${checked()[i()] ? 'line-through text-gray-400' : 'text-gray-700'}`}
                >
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
    {
      role: 'assistant',
      content: '我已加载当前任务上下文。\n\n需要我帮你分析解决方案吗？',
    },
  ]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    // Load tasks
    const taskFiles = await readYamlDir<SoloTask>('.xingjing/solo/tasks', workDir);
    if (taskFiles.length > 0) setTasks(taskFiles);

    // Load ADRs (stored as markdown with frontmatter)
    const adrFiles = await readMarkdownDir('.xingjing/solo/adrs', workDir);
    if (adrFiles.length > 0) setAdrs(adrFiles.map((f) => f.frontmatter as unknown as ADR));
  });

  const doingTasks = () => tasks().filter((t) => t.status === 'doing');
  const todoTasks = () => tasks().filter((t) => t.status === 'todo');
  const doneTasks = () => tasks().filter((t) => t.status === 'done');

  const addTask = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    const newTask: SoloTask = {
      id: `task-${Date.now()}`,
      title: '新任务',
      type: 'dev',
      status: 'todo',
      est: '1h',
      dod: ['完成实现', '本地测试通过'],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setTasks((prev) => [...prev, newTask]);
    if (workDir) {
      await writeYaml(`.xingjing/solo/tasks/${newTask.id}.yaml`, newTask as unknown as Record<string, unknown>, workDir);
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

  return (
    <div>
      {/* Page Header */}
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
          <span class="text-blue-600">💻</span>
          构建中
        </h2>
        <div class="flex gap-2">
          <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">{doingTasks().length} 进行中</span>
          <span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{todoTasks().length} 待办</span>
          <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">{doneTasks().length} 已完成</span>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-4">
        {/* Left: Tasks / ADR */}
        <div class="col-span-8">
          {/* Tab Switcher */}
          <div class="bg-white rounded-xl shadow-sm border border-gray-100">
            <div class="flex border-b border-gray-100">
              <button
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab() === 'tasks'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('tasks')}
              >
                💻 全部任务
                <span class="ml-1.5 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  {doingTasks().length} 进行中
                </span>
              </button>
              <button
                class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab() === 'adr'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('adr')}
              >
                🌲 架构决策 (ADR)
              </button>
            </div>

            <div class="p-4">
              <Show when={activeTab() === 'tasks'}>
                {/* Contrast note */}
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
                  <strong>💡 对比团队版：</strong> 无角色区分（PM/Dev/QA 分开看），无 Sprint 容量计算，无跨团队依赖管理。你就是全部角色，任务统一管理。
                </div>

                {/* Doing Tasks */}
                <Show when={doingTasks().length > 0}>
                  <div class="mb-5">
                    <div class="text-xs font-semibold text-gray-500 tracking-wide mb-2">🔥 当前进行中</div>
                    <div class="flex flex-col gap-2.5">
                      <For each={doingTasks()}>
                        {(t) => <TaskCard task={t} active />}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Todo Tasks */}
                <div class="mb-5">
                  <div class="text-xs font-semibold text-gray-500 tracking-wide mb-2">⬜ 待办</div>
                  <div class="flex flex-col gap-2">
                    <For each={todoTasks()}>
                      {(t) => <TaskCard task={t} />}
                    </For>
                  </div>
                  <button
                    class="mt-2.5 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                    onClick={addTask}
                  >
                    + 添加任务
                  </button>
                </div>

                {/* Done Tasks */}
                <div>
                  <div class="text-xs font-semibold text-gray-400 tracking-wide mb-2">✅ 最近完成</div>
                  <div class="flex flex-col gap-2 opacity-70">
                    <For each={doneTasks()}>
                      {(t) => <TaskCard task={t} />}
                    </For>
                  </div>
                </div>
              </Show>

              <Show when={activeTab() === 'adr'}>
                {/* ADR Contrast note */}
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
                  <strong>💡 对比团队版：</strong> 团队版有完整 SDD（含 Mermaid 架构图、CONTRACT、PLAN 分层）。独立版 ADR 极简：一个问题 + 一个决策 + 一个原因，写完就走。
                </div>
                <div class="flex flex-col gap-3">
                  <For each={adrs()}>
                    {(adr) => (
                      <div class="rounded-xl border border-gray-100 p-4">
                        <div class="flex justify-between items-start mb-3">
                          <span class="font-semibold text-sm text-gray-900">{adr.title}</span>
                          <div class="flex items-center gap-2 flex-shrink-0">
                            <span class={`text-xs px-2 py-0.5 rounded-full ${adr.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {adr.status === 'active' ? '有效' : '已废弃'}
                            </span>
                            <span class="text-xs text-gray-400">{adr.date}</span>
                          </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                          <div class="bg-yellow-50 rounded-lg p-2.5">
                            <div class="text-xs text-gray-500 mb-1">❓ 问题</div>
                            <div class="text-sm text-gray-800">{adr.question}</div>
                          </div>
                          <div class="bg-blue-50 rounded-lg p-2.5">
                            <div class="text-xs text-gray-500 mb-1">✅ 决策</div>
                            <div class="text-sm font-semibold text-gray-800">{adr.decision}</div>
                          </div>
                          <div class="bg-green-50 rounded-lg p-2.5">
                            <div class="text-xs text-gray-500 mb-1">💡 原因</div>
                            <div class="text-sm text-gray-800">{adr.reason}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                  <button class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors" onClick={() => setAdrModal(true)}>
                    + 记录架构决策
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Right: Dev Agent */}
        <div class="col-span-4">
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span class="text-blue-600">🤖</span>
              <span class="font-semibold text-sm">dev-agent</span>
              <span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">已加载任务上下文</span>
            </div>

            {/* Messages */}
            <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              <For each={agentMessages()}>
                {(msg) => (
                  <div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      class={`max-w-[90%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap font-mono ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Quick Questions */}
            <div class="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-1.5">
              <For each={['当前任务状态', '当前 DoD 进度', '架构决策记录']}>
                {(q) => (
                  <button
                    class="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-full border border-gray-200 transition-colors"
                    onClick={() => setAgentInput(q)}
                  >
                    {q}
                  </button>
                )}
              </For>
            </div>

            {/* Input */}
            <div class="p-3 flex gap-2">
              <input
                value={agentInput()}
                onInput={(e) => setAgentInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="问 dev-agent..."
                class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
              <button
                onClick={handleSend}
                class="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm transition-colors"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ADR Modal */}
      <Show when={adrModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: 'themeColors.surface', 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '480px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600 }}>记录架构决策</h3>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>决策标题</label>
              <input
                type="text"
                placeholder="输入决策标题..."
                value={adrTitle()}
                onInput={(e) => setAdrTitle(e.currentTarget.value)}
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>背景</label>
              <textarea
                rows={3}
                placeholder="描述问题背景..."
                value={adrBackground()}
                onInput={(e) => setAdrBackground(e.currentTarget.value)}
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>决策内容</label>
              <textarea
                rows={3}
                placeholder="描述做出的决策..."
                value={adrDecision()}
                onInput={(e) => setAdrDecision(e.currentTarget.value)}
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: 'themeColors.textSecondary' }}>后果</label>
              <textarea
                rows={3}
                placeholder="描述决策的后果和影响..."
                value={adrConsequences()}
                onInput={(e) => setAdrConsequences(e.currentTarget.value)}
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button
                style={{ background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => setAdrModal(false)}
              >取消</button>
              <button
                style={{ background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => setAdrModal(false)}
              >保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloBuild;
