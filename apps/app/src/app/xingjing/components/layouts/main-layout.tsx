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
import { engineInfo } from '../../../lib/tauri';
import { isTauriRuntime } from '../../../utils';

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
  const { state, actions, openworkStatus, openworkCtx } = useAppStore();
  const opencodeStatus = useOpenCodeStatus();

  const [openKeys, setOpenKeys] = createSignal<string[]>([]);
  const [currentSlogan, setCurrentSlogan] = createSignal(
    slogans[Math.floor(Math.random() * slogans.length)]
  );
  const [energyMode, setEnergyMode] = createSignal<'deep' | 'light'>('deep');
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);
  const [opencodeBaseUrl, setOpencodeBaseUrl] = createSignal<string | null>(null);
  // OpenWork URL 直接从 openworkCtx.serverBaseUrl 读取（响应式）
  const openworkBaseUrl = () => openworkCtx?.serverBaseUrl?.() ?? null;
  // 星静页面完整可访问 URL（纯前端计算，不依赖 context）
  const xingjingUrl = () => {
    if (typeof window === 'undefined') return null;
    return window.location.origin + '/xingjing';
  };

  // 连接配置 Popover 状态
  const [showConnectPopover, setShowConnectPopover] = createSignal(false);
  const [connectFormUrl, setConnectFormUrl] = createSignal('');
  const [connectFormToken, setConnectFormToken] = createSignal('');
  const [connectFormBusy, setConnectFormBusy] = createSignal(false);
  const [connectFormError, setConnectFormError] = createSignal('');
  // token 复制反馈
  const [tokenCopied, setTokenCopied] = createSignal(false);
  // 邀请链接复制反馈
  const [inviteCopied, setInviteCopied] = createSignal(false);

  // 生成带 ow_url + ow_token 的完整星静邀请链接
  const buildInviteUrl = () => {
    if (typeof window === 'undefined') return null;
    const owUrl = openworkBaseUrl();
    const owToken = openworkCtx?.currentOpenworkToken?.();
    if (!owUrl) return null;
    const base = window.location.origin + '/xingjing';
    const params = new URLSearchParams();
    params.set('ow_url', owUrl);
    if (owToken) params.set('ow_token', owToken);
    params.set('ow_startup', 'server');
    params.set('ow_auto_connect', '1');
    return `${base}?${params.toString()}`;
  };

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

  // 初始化服务连接地址（用于左下角连接状态显示）
  onMount(async () => {
    if (isTauriRuntime()) {
      try {
        const info = await engineInfo();
        if (info.running && info.baseUrl) setOpencodeBaseUrl(info.baseUrl);
      } catch { /* ignore */ }
    }
  });

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
  const ROUTER_BASE = '/xingjing';

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
                          : opencodeStatus() === 'reconnecting'
                            ? 'var(--amber-9, #d97706)'
                            : 'var(--red-9, #dc2626)',
                  }}
                />
              </div>
            }
          >
            <div class="relative">
              {/* 连接配置 Popover */}
              <Show when={showConnectPopover()}>
                <div
                  class="absolute bottom-full left-0 right-0 mx-2 mb-1 z-50
                         bg-[var(--dls-surface)] border border-[var(--dls-border)]
                         rounded-xl shadow-lg p-4 text-xs"
                >
                  {/* 标题行 */}
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-[var(--dls-text-primary)] font-medium text-[11px]">连接配置</span>
                    <button
                      class="text-[var(--dls-text-muted)] hover:text-[var(--dls-text-primary)] transition-colors p-0.5"
                      onClick={() => setShowConnectPopover(false)}
                    >✕</button>
                  </div>

                  {/* OpenWork URL */}
                  <div class="mb-2">
                    <label class="block text-[10px] text-[var(--dls-text-muted)] mb-1">OpenWork 地址</label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:3000"
                      value={connectFormUrl()}
                      onInput={(e) => setConnectFormUrl(e.currentTarget.value)}
                      class="w-full bg-[var(--dls-bg-subtle)] border border-[var(--dls-border)]
                             rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--dls-text-primary)]
                             placeholder-[var(--dls-text-muted)] outline-none
                             focus:border-[var(--dls-accent)] transition-colors"
                    />
                  </div>

                  {/* Token */}
                  <div class="mb-3">
                    <label class="block text-[10px] text-[var(--dls-text-muted)] mb-1">Token</label>
                    <input
                      type="password"
                      placeholder="粘贴访问 Token"
                      value={connectFormToken()}
                      onInput={(e) => setConnectFormToken(e.currentTarget.value)}
                      class="w-full bg-[var(--dls-bg-subtle)] border border-[var(--dls-border)]
                             rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--dls-text-primary)]
                             placeholder-[var(--dls-text-muted)] outline-none
                             focus:border-[var(--dls-accent)] transition-colors"
                    />
                  </div>

                  {/* 错误提示 */}
                  <Show when={connectFormError()}>
                    <p class="text-[10px] text-red-400 mb-2">{connectFormError()}</p>
                  </Show>

                  {/* 操作按钮 */}
                  <div class="flex gap-2">
                    <button
                      disabled={connectFormBusy()}
                      onClick={async () => {
                        const url = connectFormUrl().trim();
                        const token = connectFormToken().trim();
                        if (!url) { setConnectFormError('请填写 OpenWork 地址'); return; }
                        setConnectFormBusy(true);
                        setConnectFormError('');
                        try {
                          openworkCtx?.updateOpenworkSettings?.({ urlOverride: url, token });
                          if (!openworkCtx?.reconnect) {
                            setShowConnectPopover(false);
                            return;
                          }
                          const ok = await openworkCtx.reconnect();
                          if (ok === true) {
                            setShowConnectPopover(false);
                          } else {
                            setConnectFormError('连接失败，请检查 OpenWork 地址和 Token 是否正确');
                          }
                        } catch (_e) {
                          setConnectFormError('连接出错，请稍后重试');
                        } finally {
                          setConnectFormBusy(false);
                        }
                      }}
                      class="flex-1 bg-[var(--dls-accent)] hover:opacity-90 disabled:opacity-50
                             text-white rounded-lg py-1.5 text-[11px] font-medium transition-opacity"
                    >
                      {connectFormBusy() ? '连接中...' : '保存并连接'}
                    </button>
                    <button
                      onClick={() => setShowConnectPopover(false)}
                      class="px-3 bg-[var(--dls-hover)] hover:opacity-80
                             text-[var(--dls-text-muted)] rounded-lg py-1.5 text-[11px] transition-opacity"
                    >取消</button>
                  </div>
                </div>
              </Show>

              {/* 点击整个连接区域：未连接时弹出配置表单，已连接时复制邀请链接 */}
              <div
                class="px-3 py-2 transition-colors cursor-pointer hover:bg-[var(--dls-hover-bg,rgba(0,0,0,0.04))]"
                onClick={() => {
                  if (openworkStatus() === 'disconnected') {
                    // 未连接：弹出配置框
                    setConnectFormUrl(openworkBaseUrl() ?? '');
                    setConnectFormToken(openworkCtx?.currentOpenworkToken?.() ?? '');
                    setConnectFormError('');
                    setShowConnectPopover(true);
                  } else {
                    // 已连接：复制完整邀请链接
                    const url = buildInviteUrl();
                    if (!url) return;
                    navigator.clipboard.writeText(url).then(() => {
                      setInviteCopied(true);
                      setTimeout(() => setInviteCopied(false), 2000);
                    }).catch(() => {});
                  }
                }}
              >
                {/* 邀请链接复制反馈 */}
                <Show when={inviteCopied()}>
                  <div class="text-[10px] text-[var(--green-9,#16a34a)] pb-1 leading-tight">
                    ✓ 邀请链接已复制
                  </div>
                </Show>
                {/* 星静访问地址 */}
                <Show when={xingjingUrl()}>
                  <div class="flex items-center gap-1 py-1">
                    <span class="text-[10px] text-[var(--dls-text-muted)] flex-shrink-0">星静</span>
                    <div class="text-[10px] text-[var(--dls-text-muted)] leading-tight select-text cursor-text truncate">
                      {xingjingUrl()}
                    </div>
                  </div>
                </Show>
                {/* OpenWork 连接状态行 */}
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
                {/* OpenWork 地址显示 */}
                <Show when={openworkBaseUrl() && openworkStatus() !== 'disconnected'}>
                  <div class="text-[10px] text-[var(--dls-text-muted)] pl-3 pb-0.5 leading-tight select-text cursor-text">
                    {openworkBaseUrl()}
                  </div>
                  <Show when={openworkCtx?.currentOpenworkToken?.()}>
                    <div
                      class="text-[10px] text-[var(--dls-text-muted)] pl-3 pb-1 leading-tight cursor-pointer opacity-60 truncate hover:opacity-100 transition-opacity select-none"
                      title="点击复制 Token"
                      onClick={(e) => {
                        e.stopPropagation();
                        const t = openworkCtx?.currentOpenworkToken?.();
                        if (!t) return;
                        navigator.clipboard.writeText(t).then(() => {
                          setTokenCopied(true);
                          setTimeout(() => setTokenCopied(false), 1500);
                        }).catch(() => {});
                      }}
                    >
                      {tokenCopied() ? '✓ 已复制' : `token: ${openworkCtx?.currentOpenworkToken?.()}`}
                    </div>
                  </Show>
                </Show>
                {/* OpenCode 连接状态行 */}
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
                              : opencodeStatus() === 'reconnecting'
                                ? 'var(--amber-9, #d97706)'
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
                            : opencodeStatus() === 'reconnecting'
                              ? 'var(--amber-9, #d97706)'
                              : 'var(--red-9, #dc2626)',
                    }}
                  >
                    {openworkStatus() !== 'disconnected'
                      ? '通过 OpenWork'
                      : opencodeStatus() === 'connected'
                        ? '已连接'
                        : opencodeStatus() === 'reconnecting'
                          ? '重连中...'
                          : '断开'}
                  </span>
                </div>
                {/* OpenCode 地址显示 */}
                <Show when={opencodeBaseUrl() && (openworkStatus() !== 'disconnected' || opencodeStatus() === 'connected')}>
                  <div class="text-[10px] text-[var(--dls-text-muted)] pl-3 pb-0.5 leading-tight select-text cursor-text">
                    {opencodeBaseUrl()}
                    <span class="ml-1 opacity-60">(需 Basic Auth)</span>
                  </div>
                </Show>
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
      <Show when={floatPos() !== null && !aiDrawerOpen()}>
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
