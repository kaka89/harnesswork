import { createStore } from 'solid-js/store';
import { createContext, useContext, ParentComponent, createEffect, onMount } from 'solid-js';
import { PRD, prdList as initialPrds } from '../mock/prd';
import { Task, taskList as initialTasks } from '../mock/tasks';
import { BacklogItem, backlogItems as initialBacklog } from '../mock/sprint';
import { createProductStore, type ProductStore } from '../services/product-store';
import {
  loadPrds, savePrd,
  loadTasks, saveTask,
  loadBacklog, saveBacklog,
  loadProjectSettings, saveProjectSettings,
} from '../services/file-store';
import { callAgent, type CallAgentOptions } from '../services/opencode-client';

export type Role = 'pm' | 'architect' | 'developer' | 'qa' | 'sre' | 'manager';
export type AppMode = 'team' | 'solo';

export interface LLMConfig {
  id?: string;
  modelName: string;
  modelID?: string;    // OpenCode 使用的 model ID
  providerID?: string; // OpenCode 使用的 provider ID
  apiUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface Product {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  type: 'web' | 'mobile' | 'enterprise' | 'saas' | 'tool' | 'other';
  mode: 'team' | 'solo';
  techStack?: string;
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
  llmConfig: LLMConfig;
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  modelName: 'GPT-4o',
  modelID: 'gpt-4o',
  providerID: 'openai',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
};

const roleUserMap: Record<Role, string> = {
  pm: '张PM',
  architect: '王架构',
  developer: '张开发',
  qa: '王测试',
  sre: '陈SRE',
  manager: '张总',
};

const AppStoreContext = createContext<{
  state: AppState;
  productStore: ProductStore;
  actions: {
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
    setLlmConfig: (config: LLMConfig) => void;
    callAgent: (opts: CallAgentOptions) => Promise<void>;
  };
}>();

export const AppStoreProvider: ParentComponent = (props) => {
  // ProductStore: persists product list + preferences to ~/.xingjing/
  const productStore = createProductStore();

  const [state, setState] = createStore<AppState>({
    currentRole: 'pm',
    currentProject: '',
    currentUser: '张PM',
    prds: [...initialPrds],
    tasks: [...initialTasks],
    backlog: [...initialBacklog],
    aiPanelOpen: false,
    appMode: (productStore.viewMode() as AppMode) ?? 'team',
    themeMode: 'light',
    products: [],
    llmConfig: { ...DEFAULT_LLM_CONFIG },
  });

  // ── 从文件系统加载项目数据 ──
  async function loadFromFiles(workDir: string) {
    try {
      // 加载项目级设置（LLM 配置等）
      const settings = await loadProjectSettings(workDir);
      if (settings.llm) {
        setState('llmConfig', { ...DEFAULT_LLM_CONFIG, ...settings.llm });
      }

      // 加载 PRDs（如果文件存在，覆盖 mock 数据；否则保留 mock 数据作为初始种子）
      const prds = await loadPrds(workDir);
      if (prds.length > 0) {
        setState('prds', prds as unknown as PRD[]);
      }

      // 加载 Tasks
      const tasks = await loadTasks(workDir);
      if (tasks.length > 0) {
        setState('tasks', tasks as unknown as Task[]);
      }

      // 加载 Backlog
      const backlog = await loadBacklog(workDir);
      if (backlog.length > 0) {
        setState('backlog', backlog as unknown as BacklogItem[]);
      }
    } catch {
      // 文件不存在时保留 mock 数据（首次使用），静默降级
    }
  }

  // ── 当活跃产品切换时，加载对应项目数据 ──
  createEffect(() => {
    const product = productStore.activeProduct();
    if (product?.workDir) {
      setState('currentProject', product.name);
      loadFromFiles(product.workDir).catch(() => {/* silent */});
    }
  });

  // NOTE: 不再双向同步 productStore.viewMode() → appMode。
  // 初始值已从 productStore.viewMode() 读取，setAppMode 已双向回写。
  // 异步 loadFromFile 完成后不应覆盖 MainLayout.onMount 设置的默认团队模式。

  // Attempt to load products from file on mount
  onMount(() => {
    productStore.loadFromFile().catch(() => {/* silent */});
  });

  // ── 获取当前活跃产品的 workDir ──
  const getWorkDir = () => productStore.activeProduct()?.workDir ?? '';

  const actions = {
    setRole: (role: Role) => {
      setState('currentRole', role);
      setState('currentUser', roleUserMap[role]);
    },
    setAppMode: (mode: AppMode) => {
      setState('appMode', mode);
      productStore.setViewMode(mode).catch(() => {/* silent */});
    },
    setThemeMode: (mode: 'light' | 'dark') => setState('themeMode', mode),
    setProject: (project: string) => setState('currentProject', project),
    setAiPanelOpen: (open: boolean) => setState('aiPanelOpen', open),

    updatePrdStatus: (id: string, status: PRD['status']) => {
      setState('prds', (prd) => prd.id === id, 'status', status);
      // 异步落盘
      const workDir = getWorkDir();
      if (workDir) {
        const updated = state.prds.find((p) => p.id === id);
        if (updated) {
          savePrd(workDir, { ...updated, status } as unknown as Parameters<typeof savePrd>[1]).catch(() => {});
        }
      }
    },

    updateTaskStatus: (id: string, status: Task['status']) => {
      setState('tasks', (task) => task.id === id, 'status', status);
      const workDir = getWorkDir();
      if (workDir) {
        const updated = state.tasks.find((t) => t.id === id);
        if (updated) {
          saveTask(workDir, { ...updated, status } as unknown as Parameters<typeof saveTask>[1]).catch(() => {});
        }
      }
    },

    claimTask: (id: string, assignee: string) => {
      setState('tasks', (task) => task.id === id, {
        assignee,
        status: 'in-dev' as const,
      });
      const workDir = getWorkDir();
      if (workDir) {
        const updated = state.tasks.find((t) => t.id === id);
        if (updated) {
          saveTask(workDir, { ...updated, assignee, status: 'in-dev' } as unknown as Parameters<typeof saveTask>[1]).catch(() => {});
        }
      }
    },

    addPrd: (prd: PRD) => {
      setState('prds', (prds) => [...prds, prd]);
      const workDir = getWorkDir();
      if (workDir) {
        savePrd(workDir, prd as unknown as Parameters<typeof savePrd>[1]).catch(() => {});
      }
    },

    toggleBacklogItem: (id: string) => {
      setState('backlog', (item) => item.id === id, 'inSprint', (inSprint) => !inSprint);
      const workDir = getWorkDir();
      if (workDir) {
        saveBacklog(workDir, state.backlog as unknown as Parameters<typeof saveBacklog>[1]).catch(() => {});
      }
    },

    addProduct: (product: Product) => {
      setState('products', (products) => [...products, product]);
      setState('currentProject', product.name);
    },

    removeProduct: (id: string) => {
      setState('products', (products) => products.filter((p) => p.id !== id));
    },

    setLlmConfig: (config: LLMConfig) => {
      setState('llmConfig', config);
      // 持久化到项目级 settings.yaml
      const workDir = getWorkDir();
      if (workDir) {
        saveProjectSettings(workDir, { llm: config }).catch(() => {});
      }
    },

    callAgent: (opts: CallAgentOptions) => {
      const workDir = getWorkDir();
      return callAgent({ ...opts, directory: opts.directory ?? workDir });
    },
  };

  return (
    <AppStoreContext.Provider value={{ state, productStore, actions }}>
      {props.children}
    </AppStoreContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return context;
};
