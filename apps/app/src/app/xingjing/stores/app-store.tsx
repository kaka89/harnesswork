import { createStore } from 'solid-js/store';
import { createContext, useContext, ParentComponent, createEffect, createSignal, onMount } from 'solid-js';
import type { MessageWithParts } from '../../types';
import type { PRD } from '../mock/prd';
import type { Task } from '../mock/tasks';
import type { BacklogItem } from '../mock/sprint';
import { createProductStore, type ProductStore } from '../services/product-store';
import {
  loadPrds, savePrd,
  loadTasks, saveTask,
  loadBacklog, saveBacklog,
  loadProjectSettings,
  loadGlobalSettings, saveGlobalSettings,
  ensureProductFiles,
} from '../services/file-store';
import { callAgent as _callAgent, setProviderAuth, setSharedClient, type CallAgentOptions } from '../services/opencode-client';
import { initBridge, destroyBridge, type NavigationTarget, type BridgeConfig } from '../services/xingjing-bridge';
import { setSchedulerApi } from '../services/scheduler-client';
import { ensureAgentsRegistered } from '../services/agent-registry';
import { ensureSkillsRegistered } from '../services/skill-registry';
import { appendAgentLog } from '../services/agent-logger';
import { currentUser } from '../services/auth-service';
import { DEFAULT_ALLOWED_TOOLS } from '../utils/defaults';
import type { createClient } from '../../lib/opencode';
import type { OpenworkSkillItem, OpenworkSkillContent, OpenworkCommandItem, OpenworkAuditEntry } from '../../lib/openwork-server';

export type Role = 'pm' | 'architect' | 'developer' | 'qa' | 'sre' | 'manager';
export type AppMode = 'team' | 'solo';

export interface LLMConfig {
  id?: string;
  modelName: string;
  modelID?: string;    // OpenCode 使用的 model ID
  providerID?: string; // OpenCode 使用的 provider ID
  apiUrl: string;
  apiKey: string;
}

export interface Product {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  type: 'web' | 'mobile' | 'enterprise' | 'saas' | 'tool' | 'other';
  mode: 'team' | 'solo';
  techStack?: string;
  workDir?: string;
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
  /**
   * 根据产品目录在 OpenWork 中创建一个本地工作区。
   * 成功时返回新建的 workspace ID，失败返回 null。
   */
  createWorkspaceByDir: (productDir: string, productName: string) => Promise<string | null>;
  /** 列出指定工作区的 MCP 服务器 */
  listMcp: (workspaceId: string) => Promise<Array<{ name: string; config: Record<string, unknown> }>>;
  /** 添加/更新一个 MCP 服务器配置 */
  addMcp?: (workspaceId: string, payload: { name: string; config: Record<string, unknown> }) => Promise<boolean>;
  /** 删除一个 MCP 服务器 */
  removeMcp?: (workspaceId: string, name: string) => Promise<boolean>;
  /** 注销 MCP OAuth 认证 */
  logoutMcpAuth?: (workspaceId: string, name: string) => Promise<boolean>;
  /** 列出指定工作区的 Command 列表 */
  listCommands: (workspaceId: string) => Promise<OpenworkCommandItem[]>;
  /** 获取指定工作区的审计日志 */
  listAudit: (workspaceId: string, limit?: number) => Promise<OpenworkAuditEntry[]>;
  /**
   * OpenWork 全局 SSE 维护的 session 状态映射。
   * key = sessionID，value = 'idle' | 'running' | 'retry' 等。
   * 星静复用此状态检测 session 完成，避免独立 REST 轮询。
   */
  sessionStatusById?: () => Record<string, string>;
  // ── 新增：文件操作（通过 OpenWork Server API）──
  readWorkspaceFile?: (workspaceId: string, path: string) => Promise<{ content: string } | null>;
  writeWorkspaceFile?: (workspaceId: string, payload: { path: string; content: string; force?: boolean }) => Promise<boolean>;
  // ── 新增：Session 管理 ──
  deleteSession?: (workspaceId: string, sessionId: string) => Promise<boolean>;
  // ── 新增：Hub Skill ──
  listHubSkills?: () => Promise<Array<{ name: string; description: string }>>;
  installHubSkill?: (workspaceId: string, name: string) => Promise<boolean>;
  // ── 新增：删除 workspace Skill ──
  deleteSkill?: (workspaceId: string, name: string) => Promise<boolean>;
  // ── 新增：Engine 管理 ──
  reloadEngine?: (workspaceId: string) => Promise<boolean>;
  // ── 新增：目录列表（OpenWork Server readdir）──
  listDir?: (absPath: string) => Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }> | null>;
  // ── 新增：Scheduler API（定时任务）──
  listScheduledJobs?: (workspaceId: string) => Promise<any[]>;
  deleteScheduledJob?: (workspaceId: string, name: string) => Promise<any>;
  // ── SDD-015：OpenWork 全局 session store 消息读取 ──
  /** 从全局 store 获取指定 session 的消息列表（Part-based，响应式） */
  messagesBySessionId?: (sessionId: string | null) => MessageWithParts[];
  /**
   * 确保指定 session 的消息已加载到全局 store（仅加载，不切换 selectedSessionId）。
   * 幂等：已加载时立即返回，未加载时发起 HTTP 加载。
   */
  ensureSessionLoaded?: (sessionId: string) => Promise<void>;
  // ── 导航回调：跳转到 OpenWork 原生页面 ──
  navigateTo?: (target: NavigationTarget) => void;
  /** OpenWork Server 的访问地址（如 http://127.0.0.1:3000） */
  serverBaseUrl?: () => string | null;
  /** 星静页面的完整访问地址（OpenWork connectUrl + /xingjing） */
  xingjingUrl?: () => string | null;
  /** 触发 OpenWork Server 重连（同步 token/url 后重新握手） */
  reconnect?: () => Promise<boolean>;
  /** 更新 OpenWork Server 连接设置（urlOverride + token），立即生效 */
  updateOpenworkSettings?: (next: { urlOverride: string; token: string }) => void;
  /** 当前 OpenWork 连接使用的 token（用于显示） */
  currentOpenworkToken?: () => string | null;
  // ── 内嵌 OpenWork 原生视图所需字段 ──
  /** OpenWork Server URL（IdentitiesView 显示用） */
  openworkServerUrl?: string;
  /** OpenWork 重连中标记 */
  openworkReconnectBusy?: boolean;
  /** 重启本地 Server */
  restartLocalServer?: () => Promise<boolean>;
  /** OpenWork runtime workspace ID */
  openworkRuntimeWorkspaceId?: string | null;
  /** 开发者模式 */
  developerMode?: boolean;
  /** 重载 workspace engine */
  reloadWorkspaceEngine?: () => Promise<void>;
  /** 重载中标记 */
  reloadBusy?: boolean;
  /** 是否可重载 workspace */
  canReloadWorkspace?: boolean;
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
  /** 允许 AI 自动调用的工具名称列表 */
  allowedTools: string[];
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  modelName: 'DeepSeek-V3',
  modelID: 'deepseek-chat',
  providerID: 'deepseek',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-b31d2dbf7c3e4aa193e76ed9d60b217e',
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
  openworkCtx?: XingjingOpenworkContext;
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
    setAllowedTools: (tools: string[]) => void;
    listMcp: () => Promise<Array<{ name: string; config: Record<string, unknown> }>>;
    addMcp: (payload: { name: string; config: Record<string, unknown> }) => Promise<boolean>;
    removeMcp: (name: string) => Promise<boolean>;
    logoutMcpAuth: (name: string) => Promise<boolean>;
    callAgent: (opts: CallAgentOptions) => Promise<void>;
    // OpenWork Skill/Config API
    listOpenworkSkills: () => Promise<OpenworkSkillItem[]>;
    listHubSkills: () => Promise<Array<{ name: string; description: string }>>;
    installHubSkill: (name: string) => Promise<boolean>;
    listCommands: () => Promise<OpenworkCommandItem[]>;
    listAudit: (limit?: number) => Promise<OpenworkAuditEntry[]>;
    getOpenworkSkill: (name: string) => Promise<OpenworkSkillContent | null>;
    upsertOpenworkSkill: (name: string, content: string, description?: string) => Promise<boolean>;
    deleteOpenworkSkill: (name: string) => Promise<boolean>;
    readOpencodeConfig: () => Promise<unknown>;
    writeOpencodeConfig: (content: string) => Promise<boolean>;
    /**
     * 确保当前活跃产品已关联 OpenWork 工作区。
     * 若无匹配工作区，则根据产品 workDir 自动创建一个，并更新 resolvedWorkspaceId。
     * 返回最终的 workspaceId（成功）或 null（失败/不可用）。
     */
    ensureWorkspaceForActiveProduct: () => Promise<string | null>;
    scanKnowledgeIndex: (skillApi: import('../services/knowledge-behavior').SkillApiAdapter) => Promise<import('../services/knowledge-index').KnowledgeIndex | null>;
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
    prds: [] as PRD[],
    tasks: [] as Task[],
    backlog: [] as BacklogItem[],
    aiPanelOpen: false,
    appMode: (productStore.viewMode() as AppMode) ?? 'team',
    themeMode: 'light',
    products: [],
    llmConfig: { ...DEFAULT_LLM_CONFIG },
    allowedTools: [],
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
        .then((wsId: string | null) => {
          if (wsId) {
            setResolvedWorkspaceId(wsId);
          } else {
            // 工作区不存在，自动创建
            console.warn('[xingjing] workspace 未找到，尝试自动创建:', product.workDir);
            props.openworkCtx!.createWorkspaceByDir(product.workDir, product.name)
              .then((newWsId: string | null) => {
                if (newWsId) {
                  console.log('[xingjing] workspace 自动创建成功:', newWsId);
                  setResolvedWorkspaceId(newWsId);
                } else {
                  console.warn('[xingjing] workspace 自动创建失败');
                  setResolvedWorkspaceId(null);
                }
              })
              .catch(() => setResolvedWorkspaceId(null));
          }
        })
        .catch(() => setResolvedWorkspaceId(null));
    }
  });

  // ── 注入 OpenWork Client 到 opencode-client 模块 ──
  createEffect(() => {
    const client = props.openworkCtx?.opencodeClient?.();
    setSharedClient(client ?? null);

    // 诊断日志
    if (client) {
      console.log('[xingjing] OpenWork Client 已注入，星静 AI 功能可用');
    } else {
      console.warn('[xingjing] OpenWork Client 未就绪，星静 AI 功能将受限。请确保 OpenWork 已启动并选择了工作区。');
    }
  });

  // ── 文件操作已迁移到 file-ops.ts，通过 Bridge 获取 OpenWork 能力 ──

  // ── 注入 OpenWork Scheduler API（定时任务）──
  createEffect(() => {
    const ctx = props.openworkCtx;
    const wsId = resolvedWorkspaceId();
    if (ctx?.listScheduledJobs && ctx?.deleteScheduledJob && wsId) {
      setSchedulerApi({
        listJobs: () => ctx.listScheduledJobs!(wsId),
        deleteJob: (name: string) => ctx.deleteScheduledJob!(wsId, name).then(() => {}),
      });
    } else {
      setSchedulerApi(null);
    }
  });

  // ── 工作区就绪后，确保内置 Agent 已注册到 .opencode/agents/ ──
  createEffect(() => {
    const wsId = resolvedWorkspaceId();
    if (wsId) {
      const mode = state.appMode;
      void ensureAgentsRegistered(mode);
      // 同步确保内置 Skill 已注册到 .opencode/skills/
      void ensureSkillsRegistered(
        mode,
        (name, content, description) => {
          if (!props.openworkCtx) return Promise.resolve(false);
          return props.openworkCtx.upsertSkill(wsId, name, content, description);
        },
        async () => {
          if (!props.openworkCtx) return [];
          const items = await props.openworkCtx.listSkills(wsId);
          return items.map(s => ({ name: s.name }));
        },
      );
    }
  });

  // ── 初始化 XingjingBridge（将 OpenWork 全能力注入 Bridge 单例）──
  createEffect(() => {
    const ctx = props.openworkCtx;
    const wsId = resolvedWorkspaceId();
    if (ctx && wsId) {
      const bridgeConfig: BridgeConfig = {
        client: () => ctx.opencodeClient?.() ?? null,
        fileOps: (ctx.readWorkspaceFile && ctx.writeWorkspaceFile)
          ? { read: ctx.readWorkspaceFile, write: ctx.writeWorkspaceFile, list: ctx.listDir ?? undefined }
          : null,
        workspaceId: () => resolvedWorkspaceId(),
        extensions: {
          listSkills: () => ctx.listSkills(wsId),
          getSkill: (_, name) => ctx.getSkill(wsId, name),
          upsertSkill: (_, name, content, desc) => ctx.upsertSkill(wsId, name, content, desc),
          deleteSkill: ctx.deleteSkill ? (_, name) => ctx.deleteSkill!(wsId, name) : undefined,
          listHubSkills: ctx.listHubSkills,
          installHubSkill: ctx.installHubSkill ? (_, name) => ctx.installHubSkill!(wsId, name) : undefined,
          listMcp: () => ctx.listMcp(wsId),
          addMcp: ctx.addMcp ? (_, payload) => ctx.addMcp!(wsId, payload) : undefined,
          removeMcp: ctx.removeMcp ? (_, name) => ctx.removeMcp!(wsId, name) : undefined,
          logoutMcpAuth: ctx.logoutMcpAuth ? (_, name) => ctx.logoutMcpAuth!(wsId, name) : undefined,
          listCommands: () => ctx.listCommands(wsId),
          listAudit: (_, limit) => ctx.listAudit(wsId, limit),
          readOpencodeConfig: () => ctx.readOpencodeConfig(wsId),
          writeOpencodeConfig: (_, content) => ctx.writeOpencodeConfig(wsId, content),
        },
        workspace: {
          resolveByDir: ctx.resolveWorkspaceByDir,
          createByDir: ctx.createWorkspaceByDir,
        },
        serverStatus: () => ctx.serverStatus?.() ?? 'disconnected',
        fileBrowser: ctx.listDir ? { listDir: ctx.listDir } : undefined,
        scheduler: (ctx.listScheduledJobs && ctx.deleteScheduledJob)
          ? { listJobs: () => ctx.listScheduledJobs!(wsId), deleteJob: (name: string) => ctx.deleteScheduledJob!(wsId, name) }
          : undefined,
        navigateTo: ctx.navigateTo,
      };
      initBridge(bridgeConfig);
    } else {
      destroyBridge();
    }
  });

  // ── 从文件系统加载项目数据（不包含 LLM 配置，已改为全局加载）──
  async function loadFromFiles(workDir: string) {
    try {
      // ① 自动初始化缺失的必要文件（首次打开或者旧项目迁移时）
      await ensureProductFiles(workDir);

      // ② 加载项目级设置（不包含 LLM， LLM 已统一从全局配置加载）
      await loadProjectSettings(workDir);

      // ③ 加载 PRDs（从 product/features/*/PRD.md）
      const prds = await loadPrds(workDir);
      if (prds.length > 0) {
        setState('prds', prds as unknown as PRD[]);
      }

      // ④ 加载 Tasks（从 iterations/tasks/）
      const tasks = await loadTasks(workDir);
      if (tasks.length > 0) {
        setState('tasks', tasks as unknown as Task[]);
      }

      // ⑤ 加载 Backlog（从 product/backlog.yaml）
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

  // ── 当活跃产品切换时，加载对应项目数据，并将全局 LLM 配置注入 OpenCode ──
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
    // 加载全局 LLM 配置（~/.xingjing/global-settings.yaml）
    loadGlobalSettings().then((g) => {
      if (g.llm) {
        setState('llmConfig', { ...DEFAULT_LLM_CONFIG, ...g.llm });
      }
      if (g.allowedTools?.length) {
        // 用户已有自定义配置，直接使用
        setState('allowedTools', g.allowedTools);
      } else {
        // 首次启动：使用默认工具列表并持久化
        setState('allowedTools', DEFAULT_ALLOWED_TOOLS);
        saveGlobalSettings({ ...g, allowedTools: DEFAULT_ALLOWED_TOOLS }).catch(() => {});
      }
      // ★ 启动时一次性后台同步 API Key 到 OpenCode（对齐 OpenWork 设置页模式）
      // 若 global-settings.yaml 无 llm 配置，回退到 DEFAULT_LLM_CONFIG（预置 DeepSeek Key）
      const llm = g.llm ?? DEFAULT_LLM_CONFIG;
      if (llm?.providerID && llm.providerID !== 'custom' && llm?.apiKey && llm.apiKey.length > 4) {
        setProviderAuth(llm.providerID, llm.apiKey).catch(() => {/* silent */});
      }
    }).catch(() => {/* silent */});
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
      // 持久化到全局配置（~/.xingjing/global-settings.yaml，不再依赖 workDir）
      saveGlobalSettings({ llm: config }).catch(() => {});
    },

    setAllowedTools: (tools: string[]) => {
      setState('allowedTools', tools);
      // 持久化：读取现有全局配置后合并写回
      loadGlobalSettings().then((g) => {
        saveGlobalSettings({ ...g, allowedTools: tools }).catch(() => {});
      }).catch(() => {});
    },

    listMcp: async (): Promise<Array<{ name: string; config: Record<string, unknown> }>> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.listMcp) return [];
      return props.openworkCtx.listMcp(wsId);
    },

    addMcp: async (payload: { name: string; config: Record<string, unknown> }): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.addMcp) return false;
      return props.openworkCtx.addMcp(wsId, payload);
    },

    removeMcp: async (name: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.removeMcp) return false;
      return props.openworkCtx.removeMcp(wsId, name);
    },

    logoutMcpAuth: async (name: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.logoutMcpAuth) return false;
      return props.openworkCtx.logoutMcpAuth(wsId, name);
    },

    listCommands: async (): Promise<OpenworkCommandItem[]> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.listCommands) return [];
      return props.openworkCtx.listCommands(wsId);
    },

    listAudit: async (limit?: number): Promise<OpenworkAuditEntry[]> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.listAudit) return [];
      return props.openworkCtx.listAudit(wsId, limit);
    },

    callAgent: (opts: CallAgentOptions) => {
      const workDir = getWorkDir();
      const dir = opts.directory ?? workDir;
      const model = opts.model ?? props.openworkCtx?.selectedModel?.() ?? undefined;
      const owSessionStatusById = props.openworkCtx?.sessionStatusById;
      const llmCfg = state.llmConfig;
      const currentProductName = productStore.activeProduct()?.name ?? '';
      // 固定住调用时刻的 workspaceId，避免长对话中产品切换导致 session 误删
      const workspaceIdSnapshot = resolvedWorkspaceId();

      const start = Date.now();
      const promptLen = (opts.systemPrompt?.length ?? 0) + opts.userPrompt.length;
      const logBase = {
        ts: new Date().toISOString(),
        title: opts.title,
        product: currentProductName,
        provider: model?.providerID ?? llmCfg.providerID,
        model: model?.modelID ?? llmCfg.modelID,
        promptLen,
      };

      const wrappedOpts: CallAgentOptions = {
        ...opts,
        directory: dir,
        model,
        owSessionStatusById,
        owMessagesBySessionId: props.openworkCtx?.messagesBySessionId ?? (() => []),
        owEnsureSessionLoaded: props.openworkCtx?.ensureSessionLoaded,
        autoApproveTools: opts.autoApproveTools ?? (state.allowedTools.length ? state.allowedTools : undefined),
        // 不自动删除 session：多轮对话需保留 session，清理由 UI 显式管理
        onDone: (text: string) => {
          void appendAgentLog({
            ...logBase,
            path: 'opencode',
            success: true,
            durationMs: Date.now() - start,
            responseLen: text.length,
          });
          opts.onDone?.(text);
        },
        onError: (errMsg: string) => {
          void appendAgentLog({
            ...logBase,
            path: 'opencode',
            success: false,
            durationMs: Date.now() - start,
            error: errMsg,
          });
          opts.onError?.(errMsg);
        },
      };

      // 完全通过 OpenWork 注入的 Client 调用，无降级路径
      return _callAgent(wrappedOpts).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        void appendAgentLog({
          ...logBase,
          path: 'opencode',
          success: false,
          durationMs: Date.now() - start,
          error: errMsg,
        });
        opts.onError?.(errMsg);
      });
    },

    // ── OpenWork Skill/Config API ──
    listOpenworkSkills: (): Promise<OpenworkSkillItem[]> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve([]);
      return props.openworkCtx.listSkills(wsId);
    },
    listHubSkills: async (): Promise<Array<{ name: string; description: string }>> => {
      if (!props.openworkCtx?.listHubSkills) return [];
      return props.openworkCtx.listHubSkills();
    },
    installHubSkill: async (name: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.installHubSkill) return false;
      return props.openworkCtx.installHubSkill(wsId, name);
    },
    deleteOpenworkSkill: async (name: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx?.deleteSkill) return false;
      return props.openworkCtx.deleteSkill(wsId, name);
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
    readOpencodeConfig: async (): Promise<unknown> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return null;
      const raw = await props.openworkCtx.readOpencodeConfig(wsId);
      // readOpencodeConfig 返回 { path, exists, content } 包装对象，
      // 需提取 content 字段并解析为 JSON，避免 path/exists/content 污染配置文件
      if (raw && typeof raw === 'object' && 'content' in raw) {
        const content = (raw as { content: string | null }).content;
        if (content && typeof content === 'string') {
          try { return JSON.parse(content); } catch { return null; }
        }
        return null;
      }
      return raw;
    },
    writeOpencodeConfig: (content: string): Promise<boolean> => {
      const wsId = resolvedWorkspaceId();
      if (!wsId || !props.openworkCtx) return Promise.resolve(false);
      return props.openworkCtx.writeOpencodeConfig(wsId, content);
    },
    ensureWorkspaceForActiveProduct: async (): Promise<string | null> => {
      if (!props.openworkCtx) return null;
      const product = productStore.activeProduct();
      if (!product?.workDir) return null;
      // 先尝试再查一次（避免竞争条件）
      const existing = await props.openworkCtx.resolveWorkspaceByDir(product.workDir).catch(() => null);
      if (existing) {
        setResolvedWorkspaceId(existing);
        return existing;
      }
      // 创建新工作区
      const newWsId = await props.openworkCtx.createWorkspaceByDir(product.workDir, product.name).catch(() => null);
      if (newWsId) {
        setResolvedWorkspaceId(newWsId);
      }
      return newWsId;
    },
    scanKnowledgeIndex: async (skillApi: import('../services/knowledge-behavior').SkillApiAdapter) => {
      const workDir = getWorkDir();
      if (!workDir) return null;
      try {
        const { buildKnowledgeIndex } = await import('../services/knowledge-index');
        return await buildKnowledgeIndex(workDir, skillApi);
      } catch {
        return null;
      }
    },
    getWorkDir,
  };

  const openworkStatus = (): 'connected' | 'disconnected' | 'limited' =>
    props.openworkCtx?.serverStatus?.() ?? 'disconnected';

  return (
    <AppStoreContext.Provider value={{ state, productStore, openworkStatus, resolvedWorkspaceId, openworkCtx: props.openworkCtx, actions }}>
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
