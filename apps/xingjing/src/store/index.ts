import { create } from 'zustand';
import { PRD, prdList as initialPrds } from '../mock/prd';
import { Task, taskList as initialTasks } from '../mock/tasks';
import { BacklogItem, backlogItems as initialBacklog } from '../mock/sprint';

export type Role = 'pm' | 'architect' | 'developer' | 'qa' | 'sre' | 'manager';
export type AppMode = 'team' | 'solo';

export interface Product {
  id: string;
  name: string;
  tagline?: string;       // Solo 模式：产品 slogan
  description: string;
  type: 'web' | 'mobile' | 'enterprise' | 'saas' | 'tool' | 'other';
  mode: 'team' | 'solo';  // 归属哪个模式
  techStack?: string;    // Solo 模式可选
  createdAt: string;
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

export const useAppStore = create<AppState>((set) => ({
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

  setRole: (role) => set({ currentRole: role, currentUser: roleUserMap[role] }),
  setAppMode: (mode) => set({ appMode: mode }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setProject: (project) => set({ currentProject: project }),
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
    set((state) => ({
      products: [...state.products, product],
      currentProject: product.name,
    })),

  removeProduct: (id) =>
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    })),
}));
