import React from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PRD, prdList as initialPrds } from '../mock/prd';
import { Task, taskList as initialTasks } from '../mock/tasks';
import { BacklogItem, backlogItems as initialBacklog } from '../mock/sprint';

export type Role = 'pm' | 'architect' | 'developer' | 'qa' | 'sre' | 'manager';
export type AppMode = 'team' | 'solo';

export interface Product {
  id: string;
  name: string;
  appSlug?: string;       // 英文简称，用于目录命名
  tagline?: string;       // Solo 模式：产品 slogan
  description: string;
  type: 'web' | 'mobile' | 'enterprise' | 'saas' | 'tool' | 'other';
  mode: 'team' | 'solo';  // 归属哪个模式
  techStack?: string;    // Solo 模式可选
  createdAt: string;
  dirInitialized?: boolean; // 目录结构是否已初始化
}

interface AppState {
  currentRole: Role;
  currentProject: string;
  currentUser: string;
  prds: PRD[];
  tasks: Task[];
  backlog: BacklogItem[];
  aiPanelOpen: boolean;
  appMode: AppMode;
  themeMode: 'light' | 'dark';
  products: Product[];
  lastTeamProject: string;
  lastSoloProject: string;

  setRole: (role: Role) => void;
  setAppMode: (mode: AppMode) => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setProject: (project: string) => void;
  setAiPanelOpen: (open: boolean) => void;
  updatePrdStatus: (id: string, status: PRD['status']) => void;
  updateTaskStatus: (id: string, status: Task['status']) => void;
  claimTask: (id: string, assignee: string) => void;
  addPrd: (prd: PRD) => void;
  toggleBacklogItem: (id: string) => void;
  addProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
}

const roleUserMap: Record<Role, string> = {
  pm: '张PM',
  architect: '王架构',
  developer: '张开发',
  qa: '王测试',
  sre: '陈SRE',
  manager: '张总',
};

/**
 * 自定义 hook：等待 persist 中间件 hydration 完成后再渲染
 * 解决首次渲染使用默认空状态导致空卡片 flash 的问题
 * 使用惰性初始化：若挂载时 store 已经 hydrated，直接跳过 false 阶段
 */
export function useHasHydrated() {
  // 惰性初始化：组件挂载时如果 store 已 hydrated，直接返回 true，避免不必要的 false→true 跳变
  const [hydrated, setHydrated] = React.useState(
    () => useAppStore.persist?.hasHydrated?.() ?? false,
  );
  React.useEffect(() => {
    if (useAppStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useAppStore.persist?.onFinishHydration?.(() => setHydrated(true));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return hydrated;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentRole: 'pm',
      currentProject: '',
      currentUser: '张PM',
      prds: [...initialPrds],
      tasks: [...initialTasks],
      backlog: [...initialBacklog],
      aiPanelOpen: false,
      appMode: 'team',
      themeMode: 'light' as const,
      products: [],
      lastTeamProject: '',
      lastSoloProject: '',

      setRole: (role) => set({ currentRole: role, currentUser: roleUserMap[role] }),
      setAppMode: (mode) => set({ appMode: mode }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setProject: (project) =>
        set((state) => {
          const update: Partial<AppState> = { currentProject: project };
          if (state.appMode === 'team') {
            update.lastTeamProject = project;
          } else {
            update.lastSoloProject = project;
          }
          return update;
        }),
      setAiPanelOpen: (open) => set({ aiPanelOpen: open }),

      updatePrdStatus: (id, status) =>
        set((state) => ({
          prds: state.prds.map((p) => (p.id === id ? { ...p, status } : p)),
        })),

      updateTaskStatus: (id, status) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        })),

      claimTask: (id, assignee) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, assignee, status: 'in-dev' as const } : t
          ),
        })),

      addPrd: (prd) => set((state) => ({ prds: [...state.prds, prd] })),

      toggleBacklogItem: (id) =>
        set((state) => ({
          backlog: state.backlog.map((b) =>
            b.id === id ? { ...b, inSprint: !b.inSprint } : b
          ),
        })),

      addProduct: (product) =>
        set((state) => {
          const update: Partial<AppState> = {
            products: [...state.products, product],
            currentProject: product.name,
          };
          if (product.mode === 'team') {
            update.lastTeamProject = product.name;
          } else {
            update.lastSoloProject = product.name;
          }
          return update;
        }),

      removeProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),
    }),
    {
      name: 'xingjing-app-store',
      partialize: (state) => ({
        products: state.products,
        currentProject: state.currentProject,
        appMode: state.appMode,
        lastTeamProject: state.lastTeamProject,
        lastSoloProject: state.lastSoloProject,
      }),
    },
  ),
);
