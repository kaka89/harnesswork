import { Component, createSignal, For, Show } from 'solid-js';
import { Palette, Bot, Github, Clock, ShieldCheck, Sun, Moon, Save, FlaskConical, Zap } from 'lucide-solid';
import { useAppStore } from '../../stores/app-store';
import {
  defaultLLMConfig, modelOptions, LLMConfig,
  defaultGitRepos, GitRepoConfig,
  defaultScheduledTasks, ScheduledTask,
  defaultGateNodes, GateNode,
} from '../../mock/settings';

// ===================== Tab1: Theme =====================
const ThemeTab: Component = () => {
  const { state, actions } = useAppStore();

  const previewColors = () => state.themeMode === 'light'
    ? { bg: 'themeColors.surfacefff', text: 'themeColors.text000', card: 'themeColors.backgroundSecondary', border: 'themeColors.border' }
    : { bg: 'themeColors.text', text: 'themeColors.surfacefffd9', card: 'themeColors.text', border: 'themeColors.textSecondary' };

  const colorSwatches = () => [
    { label: '主色', color: 'themeColors.primary' },
    { label: '背景色', color: previewColors().bg },
    { label: '卡片色', color: previewColors().card },
    { label: '文字色', color: previewColors().text },
    { label: '边框色', color: previewColors().border },
  ];

  return (
    <div class="space-y-4">
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="font-semibold text-sm text-gray-800 mb-3">界面主题</div>
        <div class="flex gap-2">
          <For each={(['light', 'dark'] as const)}>
            {(mode) => (
              <button
                class={`px-6 py-2 text-sm rounded-lg border transition-colors ${
                  state.themeMode === mode
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => actions.setThemeMode(mode)}
              >
                {mode === 'light' ? <><Sun size={14} class="inline mr-1" />明亮模式</> : <><Moon size={14} class="inline mr-1" />暗黑模式</>}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="font-semibold text-sm text-gray-800 mb-3">当前主题预览</div>
        <div class="flex gap-4">
          <For each={colorSwatches()}>
            {(item) => (
              <div class="text-center">
                <div
                  class="w-14 h-14 rounded-lg border border-gray-200 mx-auto mb-2"
                  style={{ background: item.color }}
                />
                <div class="text-xs text-gray-500">{item.label}</div>
                <div class="text-xs font-mono text-gray-400">{item.color}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

// ===================== Tab2: LLM Config =====================
const LLMTab: Component = () => {
  const { state, actions } = useAppStore();
  const [config, setConfig] = createSignal<LLMConfig>({ ...state.llmConfig });
  const [testing, setTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal('');

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const resp = await fetch(`${config().apiUrl}/models`, {
        headers: { Authorization: `Bearer ${config().apiKey}` },
      });
      if (resp.ok) {
        setTestResult('连接成功！模型响应正常');
      } else {
        setTestResult(`连接失败（${resp.status}），请检查 API Key 和地址`);
      }
    } catch {
      setTestResult('连接超时，请检查 API 地址是否正确');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div class="bg-white border border-gray-200 rounded-xl p-4 max-w-lg">
      <div class="space-y-4">
        <div>
          <label class="text-xs text-gray-600 block mb-1">模型名称</label>
          <select
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            value={config().modelName}
            onChange={(e) => setConfig({ ...config(), modelName: e.currentTarget.value })}
          >
            <For each={modelOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-600 block mb-1">API 地址</label>
          <input
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            value={config().apiUrl}
            onInput={(e) => setConfig({ ...config(), apiUrl: e.currentTarget.value })}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div>
          <label class="text-xs text-gray-600 block mb-1">API Key</label>
          <input
            type="password"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            value={config().apiKey}
            onInput={(e) => setConfig({ ...config(), apiKey: e.currentTarget.value })}
            placeholder="输入 API Key"
          />
        </div>
        <div>
          <label class="text-xs text-gray-600 block mb-1">Temperature: {config().temperature}</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="w-full"
            value={config().temperature}
            onInput={(e) => setConfig({ ...config(), temperature: parseFloat(e.currentTarget.value) })}
          />
        </div>
        <div>
          <label class="text-xs text-gray-600 block mb-1">Max Tokens</label>
          <input
            type="number"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            value={config().maxTokens}
            onInput={(e) => setConfig({ ...config(), maxTokens: parseInt(e.currentTarget.value) })}
            min={256}
            max={128000}
            step={256}
          />
        </div>
        <div class="flex gap-2 items-center">
          <button
            class="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:border-gray-300 transition-colors disabled:opacity-60"
            onClick={handleTest}
            disabled={testing()}
          >
            {testing() ? '测试中...' : <><FlaskConical size={13} class="inline mr-1" />测试连接</>}
          </button>
          <button
            class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            onClick={() => { actions.setLlmConfig(config()); setTestResult('✓ 配置已保存'); }}
          >
            <Save size={13} class="inline mr-1" />保存配置
          </button>
          <Show when={testResult()}>
            <span class="text-xs text-green-600">{testResult()}</span>
          </Show>
        </div>
      </div>
    </div>
  );
};

// ===================== Tab3: Git repos =====================
const GitTab: Component = () => {
  const [repos, setRepos] = createSignal<GitRepoConfig[]>([...defaultGitRepos]);
  const [editRepo, setEditRepo] = createSignal<GitRepoConfig | null>(null);
  const [editForm, setEditForm] = createSignal<Partial<GitRepoConfig>>({});

  const openEdit = (repo: GitRepoConfig) => {
    setEditRepo(repo);
    setEditForm({ ...repo });
  };

  const handleSave = () => {
    const repo = editRepo();
    if (!repo) return;
    const form = editForm();
    setRepos(repos().map((r) =>
      r.id === repo.id
        ? { ...r, ...form, tokenConfigured: !!(form.accessToken && form.accessToken !== '') }
        : r
    ));
    setEditRepo(null);
  };

  return (
    <div class="space-y-4">
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        每个产品项目对应一个 Git 仓库配置，用于 Agent 自动提交代码和创建 PR。
      </div>
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-xs">
          <thead class="bg-gray-50">
            <tr>
              <For each={['产品名称', '仓库 URL', '默认分支', 'Token 状态', '操作']}>
                {(h) => <th class="text-left py-3 px-4 text-gray-500 font-medium">{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={repos()}>
              {(repo) => (
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                  <td class="py-3 px-4 font-medium text-gray-900">{repo.productName}</td>
                  <td class="py-3 px-4 text-gray-600 font-mono text-xs truncate max-w-xs">{repo.repoUrl}</td>
                  <td class="py-3 px-4">
                    <span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{repo.defaultBranch}</span>
                  </td>
                  <td class="py-3 px-4">
                    <span class={`px-1.5 py-0.5 rounded ${repo.tokenConfigured ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {repo.tokenConfigured ? '● 已配置' : '● 未配置'}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <button
                      class="text-blue-600 hover:text-blue-800 text-xs"
                      onClick={() => openEdit(repo)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      <Show when={editRepo()}>
        <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 class="font-semibold text-base text-gray-900 mb-4">编辑仓库配置</h3>
            <div class="space-y-3">
              <div>
                <label class="text-xs text-gray-500 block mb-1">产品名称</label>
                <input
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={editForm().productName ?? ''}
                  disabled
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">仓库 URL *</label>
                <input
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={editForm().repoUrl ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), repoUrl: e.currentTarget.value })}
                  placeholder="https://github.com/org/repo.git"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">默认分支 *</label>
                <input
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={editForm().defaultBranch ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), defaultBranch: e.currentTarget.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Access Token</label>
                <input
                  type="password"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={editForm().accessToken ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), accessToken: e.currentTarget.value })}
                  placeholder="GitHub Personal Access Token"
                />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-gray-300 transition-colors"
                onClick={() => setEditRepo(null)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ===================== Tab4: Cron tasks =====================
const CronTab: Component = () => {
  const [tasks, setTasks] = createSignal<ScheduledTask[]>([...defaultScheduledTasks]);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal({ name: '', cron: '', agentName: '', description: '' });

  const toggleTask = (id: string, val: boolean) => {
    setTasks(tasks().map((t) => t.id === id ? { ...t, enabled: val } : t));
  };

  const handleAdd = () => {
    const f = form();
    if (!f.name || !f.cron || !f.agentName) return;
    setTasks([...tasks(), {
      id: `cron-${Date.now()}`,
      ...f,
      enabled: true,
      lastRun: '-',
    }]);
    setModalOpen(false);
    setForm({ name: '', cron: '', agentName: '', description: '' });
  };

  return (
    <div class="space-y-4">
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-xs">
          <thead class="bg-gray-50">
            <tr>
              <For each={['任务名称', 'Cron 表达式', '关联 Agent', '描述', '状态', '上次执行']}>
                {(h) => <th class="text-left py-3 px-3 text-gray-500 font-medium">{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={tasks()}>
              {(task) => (
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                  <td class="py-3 px-3 font-medium text-gray-900">{task.name}</td>
                  <td class="py-3 px-3">
                    <code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{task.cron}</code>
                  </td>
                  <td class="py-3 px-3">
                    <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded flex items-center gap-1 w-fit"><Zap size={11} />{task.agentName}</span>
                  </td>
                  <td class="py-3 px-3 text-gray-600 max-w-xs">{task.description}</td>
                  <td class="py-3 px-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        class="sr-only peer"
                        checked={task.enabled}
                        onChange={(e) => toggleTask(task.id, e.currentTarget.checked)}
                      />
                      <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0 after:left-0 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                  </td>
                  <td class="py-3 px-3 text-gray-400">{task.lastRun}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <button
        class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 transition-colors"
        onClick={() => setModalOpen(true)}
      >
        + 新建定时任务
      </button>

      {/* Add modal */}
      <Show when={modalOpen()}>
        <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 class="font-semibold text-base text-gray-900 mb-4">新建定时任务</h3>
            <div class="space-y-3">
              <div>
                <label class="text-xs text-gray-500 block mb-1">任务名称 *</label>
                <input
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={form().name}
                  onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
                  placeholder="如：每日编码任务执行"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Cron 表达式 *</label>
                <input
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={form().cron}
                  onInput={(e) => setForm({ ...form(), cron: e.currentTarget.value })}
                  placeholder="0 2 * * *"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">关联 Agent *</label>
                <select
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  value={form().agentName}
                  onChange={(e) => setForm({ ...form(), agentName: e.currentTarget.value })}
                >
                  <option value="">选择执行 Agent</option>
                  <For each={['编码 Agent', '效能分析 Agent', '质量守护 Agent', '需求分析 Agent', '架构设计 Agent']}>
                    {(opt) => <option value={opt}>{opt}</option>}
                  </For>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">描述</label>
                <textarea
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 resize-none"
                  rows={2}
                  value={form().description}
                  onInput={(e) => setForm({ ...form(), description: e.currentTarget.value })}
                  placeholder="任务描述..."
                />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:border-gray-300 transition-colors"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                onClick={handleAdd}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ===================== Tab5: Gate nodes =====================
const GateTab: Component = () => {
  const [nodes, setNodes] = createSignal<GateNode[]>([...defaultGateNodes]);

  const toggleNode = (id: string) => {
    setNodes(nodes().map((n) => n.id === id ? { ...n, requireHuman: !n.requireHuman } : n));
  };

  const setAll = (requireHuman: boolean) => {
    setNodes(nodes().map((n) => ({ ...n, requireHuman })));
  };

  return (
    <div class="space-y-4">
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <strong>节点门控配置：</strong>配置 Agent 自动驾驶流程中哪些节点需要人工介入审批，哪些可以自动通过。开启表示需要人工确认，关闭表示 Agent 可自行完成。
      </div>
      <div class="flex items-center gap-2">
        <button
          class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded hover:border-gray-300 transition-colors"
          onClick={() => setAll(false)}
        >
          全部自动
        </button>
        <button
          class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded hover:border-gray-300 transition-colors"
          onClick={() => setAll(true)}
        >
          全部人工
        </button>
        <span class="text-xs text-gray-400 ml-2">
          当前 {nodes().filter((n) => n.requireHuman).length} 个节点需人工介入，{nodes().filter((n) => !n.requireHuman).length} 个自动通过
        </span>
      </div>
      <div class="space-y-2">
        <For each={nodes()}>
          {(node, idx) => (
            <div
              class="bg-white border rounded-xl p-4 flex items-center justify-between"
              style={{ 'border-left': `3px solid ${node.requireHuman ? 'themeColors.warning' : 'themeColors.success'}` }}
            >
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="font-semibold text-sm text-gray-900">{idx() + 1}. {node.name}</span>
                  <span
                    class="px-1.5 py-0.5 rounded text-xs"
                    style={{
                      color: node.requireHuman ? 'themeColors.warning' : 'themeColors.success',
                      background: node.requireHuman ? 'themeColors.surface7e6' : 'themeColors.successBg',
                    }}
                  >
                    {node.requireHuman ? '人工介入' : '自动通过'}
                  </span>
                </div>
                <div class="text-xs text-gray-500">{node.description}</div>
              </div>
              <label class="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  checked={node.requireHuman}
                  onChange={() => toggleNode(node.id)}
                />
                <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-400 relative" />
              </label>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

// ===================== Main page =====================
const renderTabIcon = (key: string) => {
  const map: Record<string, any> = {
    theme: Palette, llm: Bot, git: Github, cron: Clock, gate: ShieldCheck,
  };
  const I = map[key];
  return I ? <I size={14} class="inline mr-1" /> : null;
};
const TABS = [
  { key: 'theme', label: '主题外观' },
  { key: 'llm',   label: '大模型配置' },
  { key: 'git',   label: 'Git 仓库' },
  { key: 'cron',  label: '定时任务' },
  { key: 'gate',  label: '节点门控' },
];

const Settings: Component = () => {
  const [activeTab, setActiveTab] = createSignal('theme');

  return (
    <div>
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-gray-900 mt-0 mb-1">系统设置</h2>
        <p class="text-xs text-gray-500 m-0">管理平台主题、大模型接入、代码仓库、定时任务与流程门控配置</p>
      </div>

      {/* Tab bar */}
      <div class="flex gap-1 border-b border-gray-200 mb-4">
        <For each={TABS}>
          {(tab) => (
            <button
              class={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab() === tab.key
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {renderTabIcon(tab.key)}
              {tab.label}
            </button>
          )}
        </For>
      </div>

      {/* Tab content */}
      <Show when={activeTab() === 'theme'}><ThemeTab /></Show>
      <Show when={activeTab() === 'llm'}><LLMTab /></Show>
      <Show when={activeTab() === 'git'}><GitTab /></Show>
      <Show when={activeTab() === 'cron'}><CronTab /></Show>
      <Show when={activeTab() === 'gate'}><GateTab /></Show>
    </div>
  );
};

export default Settings;
