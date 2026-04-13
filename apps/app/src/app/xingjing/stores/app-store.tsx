import { createStore } from 'solid-js/store';
import { createContext, useContext, ParentComponent, createEffect, createSignal, onMount } from 'solid-js';
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
import { callAgent, callAgentWithClient, type CallAgentOptions } from '../services/opencode-client';
import { currentUser } from '../services/auth-service';
import type { createClient } from '../../lib/opencode';
import type { OpenworkSkillItem, OpenworkSkillContent } from '../../lib/openwork-server';

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

/**
 * OpenWork 上下文，由外层注入到 AppStoreProvider。
 * 星静中每个产品有自己的本地目录，该目录即对应 OpenWork 的一个 workspace。
 */
export interface XingjingOpenworkContext {
  /**
   * 根据产品目录查找匹配的 OpenWork workspace ID。
   * 如果 OpenWork 工作区列表中无匹配项，返回 null（降级到本地模式）。
   */
  resolveWorkspaceByDir: (productDir: string) => Promise<string | null>;
  /** OpenWork 连接状态 */
  serverStatus: () => 'connected' | 'disconnected' | 'limited';
  /** OpenWork 已初始化的 OpenCode client（复用，不重建） */
  opencodeClient: () => ReturnType<typeof createClient> | null;
  /** OpenWork 当前选中的模型 */
  selectedModel: () => { providerID: string; modelID: string } | null;
  /** 读取指定工作区的 Skill 列表 */
  listSkills: (workspaceId: string) => Promise<OpenworkSkillItem[]>;
  /** 读取单个 Skill 完整内容 */
  getSkill: (workspaceId: string, name: string) => Promise<OpenworkSkillContent | null>;
  /** 写入/更新一个 Skill */
  upsertSkill: (workspaceId: string, name: string, content: string, description?: string) => Promise<boolean>;
  /** 读取指定工作区的 OpenCode 配置文件 */
  readOpencodeConfig: (workspaceId: string) => Promise<unknown>;
  /** 写回指定工作区的 OpenCode 配置文件 */
  writeOpencodeConfig: (workspaceId: string, content: string) => Promise<boolean>;
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
  openworkStatus: () => 'connected' | 'disconnected' | 'limited';
  resolvedWorkspaceId: () => string | null;
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
    // OpenWork Skill/Config API
    listOpenworkSkills: () => Promise<OpenworkSkillItem[]>;
    getOpenworkSkill: (name: string) => Promise<OpenworkSkillContent | null>;
    upsertOpenworkSkill: (name: string, content: string, description?: string) => Promise<boolean>;
    readOpencodeConfig: () => Promise<unknown>;
    writeOpencodeConfig: (content: string) => Promise<boolean>;
    getWorkDir: () => string;
  };
}>();

export const AppStoreProvider: ParentComponent<{
  openworkCtx?: XingjingOpenworkContext;
}> = (props) => {
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

  // ── OpenWork workspace 解析 ──
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = createSignal<string | null>(null);

  // 当活跃产品切换时，根据产品目录向 OpenWork 查询对应的 workspace ID
  createEffect(() => {
    const product = productStore.activeProduct();
    if (!product?.workDir) {
      setResolvedWorkspaceId(null);
      return;
    }
    if (props.openworkCtx) {
      props.openworkCtx.resolveWorkspaceByDir(product.workDir)
        .then((wsId: string | null) => setResolvedWorkspaceId(wsId))
        .catch(() => setResolvedWorkspaceId(null));
    }
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

  // ── 将真实登录用户名同步到 state.currentUser ──
  createEffect(() => {
    const user = currentUser();
    if (user?.name) {
      setState('currentUser', user.name);
    }
  });

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
      // 优先使用 OpenWork 的 client（已初始化、复用）
      const owClient = props.openworkCtx?.opencodeClient?.() ?? null;
      const dir = opts.directory ?? workDir;
      const model = opts.model ?? props.openworkCtx?.selectedModel?.() ?? undefined;
      if (owClient) {
        return callAgentWithClient(owClient, { ...opts, directory: dir, model });
      }
      return callAgent({ ...opts, directory: dir, model });
    },

    // ── OpenWork Skill/Config API ──
    listOpenworkSkills: (): Promise<OpenworkSkillItem[]> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve([]);
      return props.openworkCtx.listSkills(wsId);
    },
    getOpenworkSkill: (name: string): Promise<OpenworkSkillContent | null> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve(null);
      return props.openworkCtx.getSkill(wsId, name);
    },
    upsertOpenworkSkill: (name: string, content: string, description?: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve(false);
      return props.openworkCtx.upsertSkill(wsId, name, content, description);
    },
    readOpencodeConfig: (): Promise<unknown> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve(null);
      return props.openworkCtx.readOpencodeConfig(wsId);
    },
    writeOpencodeConfig: (content: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve(false);
      return props.openworkCtx.writeOpencodeConfig(wsId, content);
    },
    getWorkDir,
  };

  const openworkStatus = (): 'connected' | 'disconnected' | 'limited' =>
    props.openworkCtx?.serverStatus?.() ?? 'disconnected';

  return (
    <AppStoreContext.Provider value={{ state, productStore, openworkStatus, resolvedWorkspaceId, actions }}>
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
