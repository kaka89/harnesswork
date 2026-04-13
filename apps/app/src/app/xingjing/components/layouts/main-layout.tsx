import { ParentComponent, createSignal, onMount, onCleanup, For, Show, createContext, useContext, createEffect } from 'solid-js';
import { useNavigate, useLocation } from '@solidjs/router';

/**
 * BackNavigationContext
 * XingjingNativePage 通过此 context 将外层 Router 的 navigate('/mode-select') 传入 MainLayout，
 * 避免在内层嵌套 Router 中直接操作 window.location 带来的兼容性问题。
 */
export const BackNavigationContext = createContext<() => void>(() => {
  // 降级处理：直接操作 window.location（Tauri HashRouter / Web）
  if (typeof window !== 'undefined') {
    if (window.location.hash && window.location.hash.length > 1) {
      window.location.hash = '/mode-select';
    } else {
      window.history.pushState({}, '', '/mode-select');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }
});
import { useAppStore, type Role } from '../../stores/app-store';
import ProductSwitcher from '../product/product-switcher';
import { callAgent } from '../../services/opencode-client';
import {
  Zap, TrendingUp, FileText, Palette, Code, Timer, CheckCircle, Cloud,
  BarChart3, BookOpen, Bot, Settings, PlayCircle, Lightbulb, Rocket, Sun, Moon
} from 'lucide-solid';
import { themeColors } from '../../utils/colors';

const roleOptions: { value: Role; label: string }[] = [
  { value: 'pm', label: '产品经理' },
  { value: 'architect', label: '架构师' },
  { value: 'developer', label: '开发人员' },
  { value: 'qa', label: 'QA' },
  { value: 'sre', label: 'SRE' },
  { value: 'manager', label: '管理层' },
];

const slogans = [
  '复命曰常，知常曰明',
  '道可道，非常道',
  '为学日益，为道日损',
  '归根曰静，是谓复命',
  '夫物芸芸，各复归其根',
  '万物并作，吾以观其复',
];

const teamMenuItems = [
  {
    key: '/autopilot-group',
    iconFn: () => <Zap size={16} />,
    label: '自动驾驶',
    children: [
      { key: '/autopilot', iconFn: () => <Zap size={15} />, label: '驾驶舱' },
      { key: '/planning', iconFn: () => <TrendingUp size={15} />, label: '产品规划工坊' },
      { key: '/requirements', iconFn: () => <FileText size={15} />, label: '需求工坊' },
      { key: '/design', iconFn: () => <Palette size={15} />, label: '设计工坊' },
      { key: '/dev', iconFn: () => <Code size={15} />, label: '开发工坊' },
      { key: '/sprint', iconFn: () => <Timer size={15} />, label: '迭代中心' },
      { key: '/quality', iconFn: () => <CheckCircle size={15} />, label: '质量中心' },
      { key: '/release-ops', iconFn: () => <Cloud size={15} />, label: '发布与运维' },
      { key: '/dashboard', iconFn: () => <BarChart3 size={15} />, label: '效能驾驶舱' },
      { key: '/knowledge', iconFn: () => <BookOpen size={15} />, label: '知识中心' },
    ],
  },
  { key: '/agent-workshop', iconFn: () => <Bot size={16} />, label: 'AI搭档' },
  { key: '/settings', iconFn: () => <Settings size={16} />, label: '设置' },
];

const soloMenuItems = [
  {
    key: '/solo/autopilot-group',
    iconFn: () => <PlayCircle size={16} />,
    label: '自动驾驶',
    navigateTo: '/solo/autopilot',
    children: [
      { key: '/solo/autopilot', iconFn: () => <PlayCircle size={15} />, label: '驾驶舱' },
      { key: '/solo/focus', iconFn: () => <Zap size={15} />, label: '今日焦点' },
      { key: '/solo/product', iconFn: () => <Lightbulb size={15} />, label: '产品洞察' },
      { key: '/solo/build', iconFn: () => <Code size={15} />, label: '构建中' },
      { key: '/solo/release', iconFn: () => <Rocket size={15} />, label: '发布管理' },
      { key: '/solo/review', iconFn: () => <BarChart3 size={15} />, label: '数据复盘' },
      { key: '/solo/knowledge', iconFn: () => <BookOpen size={15} />, label: '个人知识库' },
    ],
  },
  { key: '/solo/agent-workshop', iconFn: () => <Bot size={16} />, label: 'AI搭档' },
  { key: '/solo/settings', iconFn: () => <Settings size={16} />, label: '设置' },
];

// AI Chat state for the drawer
const [aiMessages, setAiMessages] = createSignal<{ role: string; content: string }[]>([
  {
    role: 'assistant',
    content: '你好！我是你的 AI 虚拟团队。我了解你的产品所有决策、技术笔记和用户洞察。\n\n你可以问我：\n· 「当前最高优先级任务是什么？」\n· 「段落重写功能的用户假设验证结果如何？」\n· 「今天应该先做哪件事？」',
  },
]);
const [aiInput, setAiInput] = createSignal('');
const [aiDrawerOpen, setAiDrawerOpen] = createSignal(false);
const [aiLoading, setAiLoading] = createSignal(false);

const MainLayout: ParentComponent = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions } = useAppStore();

  const [openKeys, setOpenKeys] = createSignal<string[]>([]);
  const [currentSlogan, setCurrentSlogan] = createSignal(
    slogans[Math.floor(Math.random() * slogans.length)]
  );
  const [energyMode, setEnergyMode] = createSignal<'deep' | 'light'>('deep');

  // 名言轮播
  onMount(() => {
    const timer = setInterval(() => {
      setCurrentSlogan((prev) => {
        const rest = slogans.filter((s) => s !== prev);
        return rest[Math.floor(Math.random() * rest.length)];
      });
    }, 10000);
    onCleanup(() => clearInterval(timer));
  });

  // 主题切换效果
  createEffect(() => {
    const root = document.documentElement;
    if (state.themeMode === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
  });

  const isSoloMode = () => state.appMode === 'solo';
  const menuItems = () => isSoloMode() ? soloMenuItems : teamMenuItems;

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleModeSwitch = (mode: 'team' | 'solo') => {
    actions.setAppMode(mode);
    if (mode === 'solo') {
      navigate('/solo/autopilot');
      setOpenKeys(['/solo/autopilot-group']);
    } else {
      navigate('/autopilot');
      setOpenKeys(['/autopilot-group']);
    }
  };

  // Initialize open group based on current path
  onMount(() => {
    if (location.pathname.startsWith('/solo')) {
      actions.setAppMode('solo');
      setOpenKeys(['/solo/autopilot-group']);
    } else {
      // 默认设置为团队版模式
      actions.setAppMode('team');
      setOpenKeys(['/autopilot-group']);
      // 在根路径时显式导航到驾驶舱页面
      if (location.pathname === '/' || location.pathname === '') {
        navigate('/autopilot');
      }
    }
  });

  const soloProducts = () => state.products.filter(p => p.mode === 'solo');
  const teamProducts = () => state.products.filter(p => p.mode === 'team');
  const currentProducts = () => isSoloMode() ? soloProducts() : teamProducts();

  const handleAiSend = () => {
    if (!aiInput().trim() || aiLoading()) return;
    const q = aiInput().trim();
    setAiMessages(prev => [...prev, { role: 'user', content: q }]);
    setAiInput('');
    setAiLoading(true);

    // 添加空的 assistant 消息用于流式填充
    const assistantIdx = aiMessages().length; // user 刚加入后的下一个位置
    setAiMessages(prev => [...prev, { role: 'assistant', content: '正在思考中...' }]);

    // 构造上下文提示词
    const modeLabel = isSoloMode() ? '独立开发者' : '企业团队';
    const roleLabel = roleOptions.find(r => r.value === state.currentRole)?.label || state.currentRole;
    const product = currentProducts().length > 0 ? currentProducts()[0] : null;
    const productName = product?.name || '未选择产品';
    const systemPrompt = `你是「星静」智能研发平台的 AI 虚拟团队助手。\n当前模式：${modeLabel}\n当前角色：${roleLabel}\n当前产品：${productName}\n\n请根据用户的问题提供专业、简洁的回答。如果涉及任务管理、产品规划、技术建议等，请结合当前角色给出具体可执行的建议。`;

    const llmCfg = state.llmConfig;
    callAgent({
      systemPrompt,
      userPrompt: q,
      title: `星静对话-${productName}`,
      model: llmCfg.providerID && llmCfg.modelID && llmCfg.providerID !== 'custom'
        ? { providerID: llmCfg.providerID, modelID: llmCfg.modelID }
        : undefined,
      onText: (text) => {
        setAiMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: text } : m
        ));
      },
      onDone: () => {
        setAiLoading(false);
      },
      onError: () => {
        // 降级到 mock 回复
        let reply = '';
        if (q.includes('优先') || q.includes('今天')) {
          reply = '根据你的任务列表和商业指标，今天最优先的 3 件事是：\n\n1. 🔴 修复 Editor 光标丢失 bug（5 位用户反馈，已拖 2 天）\n2. 🟡 回复 Product Hunt 8 条评论（趁热度在，及时转化）\n3. 🟡 开始邀请用户内测段落重写（本周最高优先级假设验证）';
        } else if (q.includes('重写') || q.includes('假设')) {
          reply = '段落重写功能假设（h1）当前状态：验证中\n\n验证方式：邀请 5 位活跃用户内测 Beta，观察 3 天使用频率。\n\n相关任务：st2（实现 MVP）和 st3（邀请内测）均在待办状态，建议今天优先推进 st3（只需 1h）。';
        } else if (q.includes('用户') || q.includes('留存')) {
          reply = '根据知识库中的用户洞察：\n\n· 78% 的用户活跃时间在 20:00-23:00（推送策略可优化）\n· Onboarding 第 3 步骤流失率 42%（选项过多）\n· 最新反馈：4 条正面 / 1 条负面（延迟问题）\n\n当前 7 日留存 68%，相对稳定但有提升空间。';
        } else {
          reply = '我已加载你的产品知识库、任务列表和用户反馈。请告诉我你想了解哪方面，我来帮你分析。';
        }
        setAiMessages(prev => prev.map((m, i) =>
          i === assistantIdx ? { ...m, content: `⚠️ OpenCode 未连接，使用本地知识库回复：\n\n${reply}` } : m
        ));
        setAiLoading(false);
      },
    });
  };

  // 优先使用外层 Router 的 navigate（由 XingjingNativePage 通过 Context 提供）
  const backToModeSelect = useContext(BackNavigationContext);
  const handleBackToModeSelect = () => backToModeSelect();

  return (
    <div class="flex h-full bg-[var(--dls-app-bg)]">
      {/* Sidebar */}
      <aside class="w-56 border-r border-[var(--dls-border)] bg-[var(--dls-surface)] flex flex-col relative">
        {/* Logo */}
        <div
          class="flex flex-col items-center justify-center border-b border-[var(--dls-border)] cursor-pointer hover:bg-[var(--dls-hover)] gap-1"
          style={{ height: '56px', padding: '6px 0' }}
          onClick={() => isSoloMode() ? navigate('/solo/focus') : navigate('/autopilot')}
        >
          <div class="flex items-center gap-2">
            <div class={`${isSoloMode() ? 'text-[var(--green-9)]' : 'text-[var(--purple-9)]'}`}>
              <Bot size={20} />
            </div>
            <span class={`text-lg font-bold ${isSoloMode() ? 'text-[var(--green-9)]' : 'text-[var(--purple-9)]'}`}>星静</span>
          </div>
          <span class="text-xs text-[var(--dls-text-muted)]">{currentSlogan()}</span>
        </div>

        {/* Mode Switcher */}
        <div class="p-3 border-b border-[var(--dls-border)]">
          <div class="flex gap-1 p-1 bg-[var(--dls-border-light)] rounded-lg">
            <button
              class={`flex-1 px-3 py-1.5 text-sm rounded transition-all ${
                state.appMode === 'team'
                  ? 'bg-[var(--dls-selected-bg)] text-[var(--dls-selected-text)] shadow-[var(--dls-selected-shadow)]'
                  : 'text-[var(--dls-unselected-text)] hover:text-[var(--dls-text-primary)]'
              }`}
              onClick={() => handleModeSwitch('team')}
            >
              团队版
            </button>
            <button
              class={`flex-1 px-3 py-1.5 text-sm rounded transition-all ${
                state.appMode === 'solo'
                  ? 'bg-[var(--dls-selected-bg)] text-[var(--dls-selected-text)] shadow-[var(--dls-selected-shadow)]'
                  : 'text-[var(--dls-unselected-text)] hover:text-[var(--dls-text-primary)]'
              }`}
              onClick={() => handleModeSwitch('solo')}
            >
              独立版
            </button>
          </div>
        </div>

        {/* Menu */}
        <nav class="flex-1 overflow-y-auto py-1 pb-20">
          <For each={menuItems()}>
            {(item) => (
              <div>
                <Show
                  when={item.children}
                  fallback={
                    <button
                      class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
                        isActive(item.key)
                          ? (isSoloMode() ? 'bg-[var(--green-9)]/10 text-[var(--green-9)] font-medium' : 'bg-[var(--purple-9)]/10 text-[var(--purple-9)] font-medium')
                          : 'text-[var(--dls-text-secondary)]'
                      }`}
                      onClick={() => navigate(item.key)}
                    >
                      <div class="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">{(item as any).iconFn?.()}</div>
                      <span>{item.label}</span>
                    </button>
                  }
                >
                  <div>
                    {/* Group header */}
                    <button
                      class={`w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
                        isSoloMode() ? 'text-[var(--green-9)]' : 'text-[var(--purple-9)]'
                      }`}
                      onClick={() => {
                        if ((item as any).navigateTo) navigate((item as any).navigateTo);
                        const isOpen = openKeys().includes(item.key);
                        setOpenKeys(isOpen ? [] : [item.key]);
                      }}
                    >
                      <div class="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">{(item as any).iconFn?.()}</div>
                      <span>{item.label}</span>
                      <span class="ml-auto text-xs text-[var(--dls-text-muted)]">{openKeys().includes(item.key) ? '∨' : '›'}</span>
                    </button>
                    <Show when={openKeys().includes(item.key)}>
                      <div>
                        <For each={item.children}>
                          {(child) => (
                            <button
                              class={`w-full pl-10 pr-3 py-2 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors rounded mx-1 ${
                                isActive(child.key)
                                  ? (isSoloMode()
                                    ? 'bg-[var(--green-9)]/10 text-[var(--green-9)]'
                                    : 'bg-[var(--purple-9)]/10 text-[var(--purple-9)]')
                                  : 'text-[var(--dls-text-secondary)]'
                              }`}
                              style={{ width: 'calc(100% - 8px)' }}
                              onClick={() => navigate(child.key)}
                            >
                              <div class="flex items-center justify-center w-[16px] h-[16px] flex-shrink-0">{(child as any).iconFn?.()}</div>
                              <span>{child.label}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </nav>

        {/* Energy Mode (Solo only) */}
        <Show when={isSoloMode()}>
          <div class="absolute bottom-0 left-0 right-0 p-3 border-t border-[var(--dls-border)] bg-[var(--dls-surface)]">
            <div class="text-xs text-[var(--dls-text-secondary)] mb-2">今日工作模式</div>
            <div class="flex gap-1 p-1 bg-[var(--dls-border-light)] rounded-lg">
              <button
                class={`flex-1 px-2 py-1 text-xs rounded transition-all ${
                  energyMode() === 'deep'
                    ? 'bg-[var(--dls-selected-bg)] text-[var(--dls-selected-text)] shadow-[var(--dls-selected-shadow)]'
                    : 'text-[var(--dls-unselected-text)]'
                }`}
                onClick={() => setEnergyMode('deep')}
              >
                🔥 专注
              </button>
              <button
                class={`flex-1 px-2 py-1 text-xs rounded transition-all ${
                  energyMode() === 'light'
                    ? 'bg-[var(--dls-selected-bg)] text-[var(--dls-selected-text)] shadow-[var(--dls-selected-shadow)]'
                    : 'text-[var(--dls-unselected-text)]'
                }`}
                onClick={() => setEnergyMode('light')}
              >
                ☕ 碎片
              </button>
            </div>
            <div class="text-xs text-[var(--dls-text-secondary)] mt-1 text-center">
              {energyMode() === 'deep' ? '深度工作时间 · 减少打扰' : '碎片时间 · 处理轻量任务'}
            </div>
          </div>
        </Show>
      </aside>

      {/* Main Content */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header class="h-14 border-b border-[var(--dls-border)] bg-[var(--dls-surface)] flex items-center justify-between px-6 flex-shrink-0">
          <div class="text-sm text-[var(--dls-text-secondary)] italic tracking-wide">
            {currentSlogan()}
          </div>
          <div class="flex items-center gap-3">
            {/* Solo mode stats */}
            <Show when={isSoloMode()}>
              <span class="text-xs px-2 py-1 bg-[var(--green-9)]/10 text-[var(--green-9)] rounded-full">MRR $1,240</span>
              <span class="text-xs px-2 py-1 bg-[var(--blue-9)]/10 text-[var(--blue-9)] rounded-full">v1.2.3 生产中</span>
            </Show>

            {/* Product Selector */}
            <ProductSwitcher />

            {/* Role Selector */}
            <select
              class="h-7 pl-2 pr-6 text-sm border border-[var(--dls-border)] rounded-md bg-[var(--dls-surface)] text-[var(--dls-text-primary)] cursor-pointer hover:border-[var(--dls-border-light)]"
              style={{ "min-width": "110px" }}
              value={state.currentRole}
              onChange={(e) => actions.setRole(e.target.value as Role)}
            >
              <For each={roleOptions}>
                {(opt) => <option value={opt.value}>{opt.label}</option>}
              </For>
            </select>

            {/* Theme Toggle */}
            <button
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: themeColors.hover, color: themeColors.textSecondary }}
              onClick={() => actions.setThemeMode(state.themeMode === 'dark' ? 'light' : 'dark')}
              title={state.themeMode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              <Show when={state.themeMode === 'dark'} fallback={<Moon size={16} />}>
                <Sun size={16} />
              </Show>
            </button>

            {/* User Avatar */}
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm cursor-pointer ${isSoloMode() ? 'bg-[var(--green-9)]' : 'bg-[var(--purple-9)]'}`}
            >
              {state.currentUser[0]}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main class="flex-1 overflow-auto p-6">
          {props.children}
        </main>
      </div>

      {/* AI Float Button */}
      <button
        class={`fixed bottom-6 right-6 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 ${isSoloMode() ? 'bg-[var(--green-9)] hover:bg-[var(--green-11)]' : 'bg-[var(--purple-9)] hover:bg-[var(--purple-10)]'}`}
        style={{
          "box-shadow": isSoloMode()
            ? "0 4px 16px rgba(82, 196, 26, 0.4)"
            : "0 4px 16px rgba(139, 92, 246, 0.4)"
        }}
        onClick={() => setAiDrawerOpen(true)}
      >
        <Bot size={24} />
      </button>

      {/* AI Drawer */}
      <Show when={aiDrawerOpen()}>
        <div class="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div class="absolute inset-0 bg-black/20" onClick={() => setAiDrawerOpen(false)} />
          {/* Drawer */}
          <div class="relative w-[400px] bg-[var(--dls-surface)] shadow-xl flex flex-col h-full">
            {/* Header */}
            <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--dls-border)]">
              <div class="flex items-center gap-2">
                <div class={isSoloMode() ? 'text-[var(--green-9)]' : 'text-[var(--purple-9)]'}>
                  <Bot size={16} />
                </div>
                <span class="font-semibold text-sm text-[var(--dls-text-primary)]">AI 虚拟团队</span>
                <span class="text-xs px-2 py-0.5 bg-[var(--dls-success-bg)] text-[var(--green-9)] rounded-full border border-[var(--dls-success-border)]">已加载知识库</span>
              </div>
              <button
                class="text-[var(--dls-text-secondary)] hover:text-[var(--dls-text-primary)] text-lg"
                onClick={() => setAiDrawerOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              <For each={aiMessages()}>
                {(msg) => (
                  <div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      class={`max-w-[85%] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? (isSoloMode() ? 'bg-[var(--green-9)]' : 'bg-[var(--purple-9)]') + ' text-white rounded-2xl rounded-br-sm'
                          : 'bg-[var(--dls-chat-assist-bg)] text-[var(--dls-chat-assist-text)] rounded-2xl rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Quick Questions */}
            <div class="px-4 py-2 border-t border-[var(--dls-border-light)] flex flex-wrap gap-2">
              <For each={['今天先做什么？', '假设验证进展', '用户留存分析']}>
                {(q) => (
                  <button
                    class="text-xs px-3 py-1 bg-[var(--dls-hover)] hover:bg-[var(--dls-border-light)] rounded-full border border-[var(--dls-border)] transition-colors text-[var(--dls-text-secondary)]"
                    onClick={() => setAiInput(q)}
                  >
                    {q}
                  </button>
                )}
              </For>
            </div>

            {/* Input */}
            <div class="p-3 flex gap-2">
              <input
                value={aiInput()}
                onInput={(e) => setAiInput(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading()) handleAiSend(); }}
                placeholder={aiLoading() ? 'AI 正在回复中...' : '问我任何关于产品的问题...'}
                class={`flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-[var(--dls-surface)] text-[var(--dls-text-primary)] border-[var(--dls-border)] focus:border-[${isSoloMode() ? 'var(--green-9)' : 'var(--purple-9)'}]`}
              />
              <button
                onClick={handleAiSend}
                disabled={aiLoading()}
                class={`rounded-lg px-3 py-2 text-sm transition-colors text-white ${
                  isSoloMode()
                    ? 'bg-[var(--green-9)] hover:bg-[var(--green-11)]'
                    : 'bg-[var(--purple-9)] hover:bg-[var(--purple-10)]'
                }`}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default MainLayout;
