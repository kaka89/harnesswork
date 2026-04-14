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
import { currentUser } from '../../services/auth-service';
import ProductSwitcher from '../product/product-switcher';
import AiChatDrawer from '../ai/ai-chat-drawer';
import {
  Zap, TrendingUp, FileText, Palette, Code, Timer, CheckCircle, Cloud,
  BarChart3, BookOpen, Bot, Settings, PlayCircle, Lightbulb, Rocket, Sun, Moon,
  ChevronLeft, ChevronRight
} from 'lucide-solid';
import { themeColors } from '../../utils/colors';
import { useOpenCodeStatus } from '../../hooks/use-opencode-status';

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
      { key: '/solo/build', iconFn: () => <Code size={15} />, label: '产品研发' },
      { key: '/solo/release', iconFn: () => <Rocket size={15} />, label: '发布管理' },
      { key: '/solo/review', iconFn: () => <BarChart3 size={15} />, label: '数据复盘' },
      { key: '/solo/knowledge', iconFn: () => <BookOpen size={15} />, label: '个人知识库' },
    ],
  },
  { key: '/solo/agent-workshop', iconFn: () => <Bot size={16} />, label: 'AI搭档' },
  { key: '/solo/settings', iconFn: () => <Settings size={16} />, label: '设置' },
];

// aiDrawerOpen: 控制 AiChatDrawer 显示，状态保留在模块级以跨实例共享
const [aiDrawerOpen, setAiDrawerOpen] = createSignal(false);

const MainLayout: ParentComponent = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions, openworkStatus } = useAppStore();
  const opencodeStatus = useOpenCodeStatus();

  const [openKeys, setOpenKeys] = createSignal<string[]>([]);
  const [currentSlogan, setCurrentSlogan] = createSignal(
    slogans[Math.floor(Math.random() * slogans.length)]
  );
  const [energyMode, setEnergyMode] = createSignal<'deep' | 'light'>('deep');
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  // AI 悬浮按钮拖拽状态
  const FLOAT_BTN_SIZE = 56;
  const FLOAT_BTN_MARGIN = 24;
  const [floatPos, setFloatPos] = createSignal<{ x: number; y: number } | null>(null);
  let isDragging = false;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartPos = { x: 0, y: 0 };
  let hasMoved = false;

  const defaultPos = () => ({
    x: window.innerWidth - FLOAT_BTN_SIZE - FLOAT_BTN_MARGIN,
    y: window.innerHeight - FLOAT_BTN_SIZE - FLOAT_BTN_MARGIN,
  });

  const clampPos = (x: number, y: number) => ({
    x: Math.max(0, Math.min(x, window.innerWidth - FLOAT_BTN_SIZE)),
    y: Math.max(0, Math.min(y, window.innerHeight - FLOAT_BTN_SIZE)),
  });

  const handlePointerDown = (e: PointerEvent) => {
    isDragging = true;
    hasMoved = false;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    const pos = floatPos()!;
    dragStartPos = { x: pos.x, y: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartMouse.x;
    const dy = e.clientY - dragStartMouse.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true;
    if (hasMoved) {
      setFloatPos(clampPos(dragStartPos.x + dx, dragStartPos.y + dy));
    }
  };

  const handlePointerUp = (_e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    if (!hasMoved) {
      setAiDrawerOpen(true);
    } else {
      const pos = floatPos()!;
      localStorage.setItem('ai-float-btn-pos', JSON.stringify(pos));
    }
  };

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

  // Router base path — must match the base prop in xingjing-native.tsx
  const ROUTER_BASE = '/xingjing-solid';

  // Strip the router base prefix so menu keys (e.g. '/autopilot') can be
  // compared against location.pathname which includes the base prefix.
  const normPath = () => {
    const p = location.pathname;
    return p.startsWith(ROUTER_BASE) ? p.slice(ROUTER_BASE.length) || '/' : p;
  };

  const isActive = (path: string) => {
    const p = normPath();
    return p === path || p.startsWith(path + '/');
  };

  // 判断某个分组下是否有子菜单处于激活状态
  const isGroupActive = (children: { key: string }[]) =>
    children.some(child => isActive(child.key));

  // Solo: green-3 背景 + green-11 文字 + green-9 左边框
  // Team: purple-3 背景 + purple-11 文字 + purple-9 左边框
  const activeItemClass = () =>
    isSoloMode()
      ? 'bg-green-3 text-green-11 font-medium border-l-2 border-green-9'
      : 'bg-purple-3 text-purple-11 font-medium border-l-2 border-purple-9';

  // 分组父级标题激活态（子项选中时稍浅背景）
  const activeGroupHeaderClass = () =>
    isSoloMode()
      ? 'bg-green-2 text-green-10 font-semibold border-l-2 border-green-9'
      : 'bg-purple-2 text-purple-10 font-semibold border-l-2 border-purple-9';

  // 未选中时的边框占位，保持布局稳定不抖动
  const inactiveBorder = 'border-l-2 border-transparent';

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
  // 初始化悬浮按钮位置（从 localStorage 恢复或使用右下角默认值）
  onMount(() => {
    const saved = localStorage.getItem('ai-float-btn-pos');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setFloatPos(clampPos(pos.x, pos.y));
      } catch {
        setFloatPos(defaultPos());
      }
    } else {
      setFloatPos(defaultPos());
    }
  });

  onMount(() => {
    const p = normPath();
    if (p.startsWith('/solo')) {
      actions.setAppMode('solo');
      setOpenKeys(['/solo/autopilot-group']);
    } else {
      // 默认设置为团队版模式
      actions.setAppMode('team');
      setOpenKeys(['/autopilot-group']);
      // 在根路径时显式导航到驾驶舱页面
      if (p === '/' || p === '') {
        navigate('/autopilot');
      }
    }
  });

  const soloProducts = () => state.products.filter((p: { mode: string }) => p.mode === 'solo');
  const teamProducts = () => state.products.filter((p: { mode: string }) => p.mode === 'team');
  const currentProducts = () => isSoloMode() ? soloProducts() : teamProducts();
  const currentProductName = () => currentProducts().length > 0 ? currentProducts()[0].name : undefined;
  const activeWorkDir = () => currentProducts()[0]?.workDir;

  // 优先使用外层 Router 的 navigate（由 XingjingNativePage 通过 Context 提供）
  const backToModeSelect = useContext(BackNavigationContext);
  const handleBackToModeSelect = () => backToModeSelect();

  return (
    <div class="flex h-full bg-[var(--dls-app-bg)]">
      {/* Sidebar */}
      <aside class={`${sidebarCollapsed() ? 'w-14' : 'w-56'} border-r border-[var(--dls-border)] bg-[var(--dls-surface)] flex flex-col relative transition-all duration-300 ease-in-out overflow-hidden`}>
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
            <Show when={!sidebarCollapsed()}>
              <span class={`text-lg font-bold ${isSoloMode() ? 'text-[var(--green-9)]' : 'text-[var(--purple-9)]'}`}>星静</span>
            </Show>
          </div>
          <Show when={!sidebarCollapsed()}>
            <span class="text-xs text-[var(--dls-text-muted)]">{currentSlogan()}</span>
          </Show>
        </div>

        {/* Mode Switcher */}
        <Show when={!sidebarCollapsed()}>
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
        </Show>

        {/* Menu */}
        <nav class={`flex-1 overflow-y-auto py-1 ${
          sidebarCollapsed() ? 'pb-14' : isSoloMode() ? 'pb-[168px]' : 'pb-20'
        }`}>
          <For each={menuItems()}>
            {(item) => (
              <Show
                when={!sidebarCollapsed()}
                fallback={
                  <button
                    title={item.label}
                    class={`w-full py-3 flex justify-center items-center hover:bg-[var(--dls-hover)] transition-colors ${
                      (item.children ? isGroupActive(item.children) : isActive(item.key))
                        ? (isSoloMode() ? 'bg-green-3 text-green-11' : 'bg-purple-3 text-purple-11')
                        : 'text-[var(--dls-text-secondary)]'
                    }`}
                    onClick={() => {
                      const target = (item as any).navigateTo ?? (item.children?.[0]?.key ?? item.key);
                      navigate(target);
                    }}
                  >
                    <div class="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
                      {(item as any).iconFn?.()}
                    </div>
                  </button>
                }
              >
                <div>
                  <Show
                    when={item.children}
                    fallback={
                      <button
                        class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
                          isActive(item.key)
                            ? activeItemClass()
                            : `text-[var(--dls-text-secondary)] ${inactiveBorder}`
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
                        class={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--dls-hover)] flex items-center gap-3 transition-colors ${
                          isGroupActive(item.children!)
                            ? activeGroupHeaderClass()
                            : `${isSoloMode() ? 'text-green-9' : 'text-purple-9'} font-semibold ${inactiveBorder}`
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
                                    ? activeItemClass()
                                    : `text-[var(--dls-text-secondary)] ${inactiveBorder}`
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
              </Show>
            )}
          </For>
        </nav>

        {/* Bottom section — unified: Energy Mode (Solo) + Connection Status + Toggle */}
        <div class="absolute left-0 right-0 bottom-0 flex flex-col border-t border-[var(--dls-border)] bg-[var(--dls-surface)]">
          {/* Energy Mode (Solo only, hidden when collapsed) */}
          <Show when={isSoloMode() && !sidebarCollapsed()}>
            <div class="p-3 border-b border-[var(--dls-border)]">
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

          {/* Connection Status */}
          <Show
            when={!sidebarCollapsed()}
            fallback={
              <div class="flex flex-col items-center gap-1.5 py-2">
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      openworkStatus() === 'connected'
                        ? 'var(--green-9, #16a34a)'
                        : openworkStatus() === 'limited'
                          ? 'var(--amber-9, #d97706)'
                          : 'var(--red-9, #dc2626)',
                  }}
                />
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      openworkStatus() !== 'disconnected'
                        ? 'var(--green-9, #16a34a)'
                        : opencodeStatus() === 'connected'
                          ? 'var(--green-9, #16a34a)'
                          : 'var(--red-9, #dc2626)',
                  }}
                />
              </div>
            }
          >
            <div class="px-3 py-2">
              <div class="flex items-center justify-between py-1">
                <div class="flex items-center gap-1.5">
                  <span
                    class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background:
                        openworkStatus() === 'connected'
                          ? 'var(--green-9, #16a34a)'
                          : openworkStatus() === 'limited'
                            ? 'var(--amber-9, #d97706)'
                            : 'var(--red-9, #dc2626)',
                    }}
                  />
                  <span class="text-xs text-[var(--dls-text-secondary)]">OpenWork</span>
                </div>
                <span
                  class="text-xs"
                  style={{
                    color:
                      openworkStatus() === 'connected'
                        ? 'var(--green-9, #16a34a)'
                        : openworkStatus() === 'limited'
                          ? 'var(--amber-9, #d97706)'
                          : 'var(--red-9, #dc2626)',
                  }}
                >
                  {openworkStatus() === 'connected' ? '已连接' : openworkStatus() === 'limited' ? '受限' : '断开'}
                </span>
              </div>
              <div class="flex items-center justify-between py-1">
                <div class="flex items-center gap-1.5">
                  <span
                    class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background:
                        openworkStatus() !== 'disconnected'
                          ? 'var(--green-9, #16a34a)'
                          : opencodeStatus() === 'connected'
                            ? 'var(--green-9, #16a34a)'
                            : 'var(--red-9, #dc2626)',
                    }}
                  />
                  <span class="text-xs text-[var(--dls-text-secondary)]">OpenCode</span>
                </div>
                <span
                  class="text-xs"
                  style={{
                    color:
                      openworkStatus() !== 'disconnected'
                        ? 'var(--green-9, #16a34a)'
                        : opencodeStatus() === 'connected'
                          ? 'var(--green-9, #16a34a)'
                          : 'var(--red-9, #dc2626)',
                  }}
                >
                  {openworkStatus() !== 'disconnected'
                    ? '通过 OpenWork'
                    : opencodeStatus() === 'connected'
                      ? '已连接'
                      : '断开'}
                </span>
              </div>
            </div>
          </Show>

          {/* Collapse Toggle */}
          <button
            class="w-full flex justify-center items-center py-1.5 text-[var(--dls-text-muted)] hover:text-[var(--dls-text-primary)] hover:bg-[var(--dls-hover)] transition-colors border-t border-[var(--dls-border)]"
            title={sidebarCollapsed() ? '展开菜单' : '收起菜单'}
            onClick={() => setSidebarCollapsed(v => !v)}
          >
            <Show when={sidebarCollapsed()} fallback={<ChevronLeft size={14} />}>
              <ChevronRight size={14} />
            </Show>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header class="h-14 border-b border-[var(--dls-border)] bg-[var(--dls-surface)] flex items-center justify-between px-6 flex-shrink-0">
          <div class="text-sm text-[var(--dls-text-secondary)] italic tracking-wide">
            {currentSlogan()}
          </div>
          <div class="flex items-center gap-3">
            {/* Product Selector */}
            <ProductSwitcher />

            {/* Role Selector — 仅团队版显示 */}
            <Show when={!isSoloMode()}>
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
            </Show>

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
              class={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm cursor-pointer overflow-hidden ${isSoloMode() ? 'bg-[var(--green-9)]' : 'bg-[var(--purple-9)]'}`}
              onClick={() => navigate(isSoloMode() ? '/solo/settings?tab=profile' : '/settings?tab=profile')}
              title="个人信息"
            >
              <Show
                when={currentUser()?.avatar_url}
                fallback={<span>{state.currentUser[0]}</span>}
              >
                {(url) => (
                  <img src={url()} alt="头像" class="w-full h-full object-cover" />
                )}
              </Show>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main class="flex-1 overflow-auto p-6">
          {props.children}
        </main>
      </div>

      {/* AI Float Button — 可拖拽 */}
      <Show when={floatPos() !== null}>
        <button
          class={`fixed w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center select-none touch-none
            ${isSoloMode() ? 'bg-[var(--green-9)]' : 'bg-[var(--purple-9)]'}`}
          style={{
            left: `${floatPos()!.x}px`,
            top: `${floatPos()!.y}px`,
            "box-shadow": isSoloMode()
              ? "0 4px 16px rgba(82, 196, 26, 0.4)"
              : "0 4px 16px rgba(139, 92, 246, 0.4)",
            transition: isDragging ? 'none' : 'transform 0.2s',
            "z-index": 9999,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <Bot size={24} />
        </button>
      </Show>

      {/* AI Chat Drawer */}
      <AiChatDrawer
        open={aiDrawerOpen()}
        onClose={() => setAiDrawerOpen(false)}
        isSoloMode={isSoloMode()}
        callAgentFn={(opts) => actions.callAgent(opts)}
        openworkStatus={openworkStatus()}
        llmConfig={state.llmConfig}
        currentProductName={currentProductName()}
        workDir={activeWorkDir()}
      />
    </div>
  );
};

export default MainLayout;
