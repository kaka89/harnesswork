/**
 * 星静 OpenCode 客户端封装
 *
 * 复用 OpenWork 主应用已有的 @opencode-ai/sdk 连接，
 * 为星静各功能模块提供统一的 AI 能力 + 本地文件读写能力。
 *
 * HeyAPI SDK 参数传递约定：query/path 参数均展平到顶层 options 对象，
 * 例如：client.file.list({ path: '/foo', directory: '/bar' })
 */

import { createClient } from '../../lib/opencode';

// ─── Client 管理（OpenWork 注入）────────────────────────────────────────────

let _sharedClient: ReturnType<typeof createClient> | null = null;
let _fallbackClient: ReturnType<typeof createClient> | null = null;
let _baseUrl = 'http://127.0.0.1:4096';
let _directory = '';

/** 当 OpenWork 注入的 SDK 客户端不可用时，裸 fetch 兜底到默认端口 */
const FALLBACK_OPENCODE_URL = 'http://127.0.0.1:4096';

// ─── OpenWork 文件操作注入 ─────────────────────────────────────────

let _owFileOps: {
  read: (wsId: string, path: string) => Promise<{ content: string } | null>;
  write: (wsId: string, payload: { path: string; content: string; force?: boolean }) => Promise<boolean>;
} | null = null;
let _workspaceId: string | null = null;

/**
 * 由 app-store 在初始化后注入 shared client。
 * 优先返回此 client，避免维护独立单例。
 */
export function setSharedClient(client: ReturnType<typeof createClient> | null) {
  _sharedClient = client;
  // 注入新 client 时，清除兜底缓存，避免后续误用旧兜底实例
  _fallbackClient = null;
}

/**
 * 注入 OpenWork 文件操作能力。
 * 由 AppStoreProvider 在 OpenWork 上下文和 workspace 解析完成后调用。
 */
export function setOpenworkFileOps(
  ops: typeof _owFileOps,
  workspaceId: string | null,
) {
  _owFileOps = ops;
  _workspaceId = workspaceId;
}

/** 断线重试退避时间（ms）：1s / 2s / 5s */
const RETRY_DELAYS = [1000, 2000, 5000] as const;

/** SSE 事件流无活动超时（ms）：90 秒内无任何新事件则视为连接挂起，触发 sse-fail 重试 */
const SSE_INACTIVITY_TIMEOUT_MS = 90_000;

/** 首事件等待超时（ms）：prompt 发送后若 30 秒内未收到任何 SSE 事件，
 *  高概率为 API Key 未配置 / 模型不可用等配置问题，提前报错而非等满 90 秒 */
const SSE_FIRST_EVENT_TIMEOUT_MS = 30_000;

/** 内容空闲超时（ms）：已有累积内容后，若指定时间内无新内容增长，
 *  视为模型已完成输出但 OpenCode 未发 completion 信号，直接判定完成。
 *  注：此值为兜底上限，正常情况下 owSessionStatusById 会更早检测到完成。 */
const CONTENT_IDLE_TIMEOUT_MS = 8_000;

/** 首次内容到达后延迟多久开始检柡（ms）：避免模型还在生成时过早检测 */
const SESSION_POLL_START_DELAY_MS = 1_000;

/** 不应重置无活动计时器的 SSE 事件类型（服务器级 keep-alive，非会话进度） */
const NON_ACTIVITY_EVENT_TYPES = new Set(['server.heartbeat', 'server.connected']);

/** 异步等待指定毫秒 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 设置当前工作目录（产品切换时调用）。
 * @param baseUrl 可选，同时更新 baseUrl（用于 SSE EventSource 和裸 fetch 兜底）
 */
export function setWorkingDirectory(directory: string, baseUrl?: string) {
  _directory = directory;
  if (baseUrl) _baseUrl = baseUrl;
}

/**
 * 获取 OpenCode Client（来自 OpenWork 注入的统一实例）。
 * OpenWork 未连接时自动使用本地 OpenCode 地址兜底（独立版场景）。
 */
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (_sharedClient) return _sharedClient;
  // 兜底：独立版场景下 OpenWork 未连接，直接使用本地 OpenCode
  if (!_fallbackClient) {
    const fallbackUrl = _baseUrl || FALLBACK_OPENCODE_URL;
    console.warn('[xingjing] OpenWork Client 未注入，使用本地兜底地址:', fallbackUrl);
    _fallbackClient = createClient(fallbackUrl);
  }
  return _fallbackClient;
}

// ─── 文件 API ───────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  absolute: string;
  type: 'file' | 'directory';
  ignored: boolean;
}

export interface FileContent {
  type: 'text';
  content: string;
}

/**
 * 列出目录下的文件和子目录
 * 注意：HeyAPI SDK 将 query 参数展平到 options 顶层
 */
export async function fileList(
  path: string,
  directory?: string,
): Promise<FileNode[]> {
  // 1. 尝试 OpenWork 注入的 SDK 客户端
  try {
    const client = getXingjingClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.file.list as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return result.data as FileNode[];
  } catch { /* fall through */ }

  // 2. 兜底：裸 fetch 到默认 OpenCode 端口
  try {
    const url = new URL('/file', FALLBACK_OPENCODE_URL);
    url.searchParams.set('path', path);
    const dir = directory ?? (_directory || '');
    if (dir) url.searchParams.set('directory', dir);
    const resp = await fetch(url.toString());
    if (resp.ok) return (await resp.json()) as FileNode[];
  } catch { /* ignore */ }
  return [];
}

/**
 * 将绝对路径转换为相对于工作目录的相对路径。
 * 如果 path 以 _directory + '/' 开头，则去掉前缀；否则原样返回。
 * 用于修正向 OpenWork Server API 传递绝对路径导致的路径重复 Bug。
 */
function toWorkspaceRelativePath(path: string): string {
  if (_directory && path.startsWith(_directory + '/')) {
    return path.slice(_directory.length + 1);
  }
  return path;
}

/**
 * 读取文件内容（文本）
 * 优先使用 OpenWork Server API，回退到 OpenCode file API。
 */
export async function fileRead(
  path: string,
  directory?: string,
): Promise<string | null> {
  // 当显式传入 directory（且与全局工作目录不同）时，必须使用能正确携带 directory
  // 参数的 OpenCode SDK，因为 OpenWork Server API 会忽略 directory 参数。
  const useOpenworkApi = _owFileOps && _workspaceId && !directory;
  if (useOpenworkApi) {
    try {
      // 将绝对路径转为相对路径，避免 OpenWork Server 二次拼接 workspace 根目录导致路径重复
      const result = await _owFileOps!.read(_workspaceId!, toWorkspaceRelativePath(path));
      return result?.content ?? null;
    } catch { /* fall through to SDK */ }
  }

  // 1. 尝试 OpenWork 注入的 SDK 客户端
  try {
    const client = getXingjingClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.file.read as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return (result.data as FileContent).content;
  } catch { /* fall through */ }

  // 2. 兜底：裸 fetch 到默认 OpenCode 端口
  try {
    const url = new URL('/file/content', FALLBACK_OPENCODE_URL);
    url.searchParams.set('path', path);
    const dir = directory ?? (_directory || '');
    if (dir) url.searchParams.set('directory', dir);
    const resp = await fetch(url.toString());
    if (resp.ok) {
      const data = await resp.json();
      return (data as FileContent).content ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 写入文件内容
 * 优先使用 OpenWork Server API，回退到裸 fetch（过渡期）。
 */
export async function fileWrite(
  path: string,
  content: string,
  directory?: string,
): Promise<boolean> {
  // 优先使用 OpenWork Server API
  if (_owFileOps && _workspaceId) {
    try {
      // 将绝对路径转为相对路径，避免 OpenWork Server 二次拼接 workspace 根目录导致路径重复
      return await _owFileOps.write(_workspaceId, { path: toWorkspaceRelativePath(path), content });
    } catch { /* fall through to raw fetch */ }
  }
  // 回退到裸 fetch（过渡期）
  const dir = directory ?? _directory;
  try {
    const url = `${_baseUrl}/file/content`;
    const body = { path, content, ...(dir ? { directory: dir } : {}) };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch {
    console.warn('[xingjing] fileWrite: OpenCode file write not available, operating in read-only mode');
    return false;
  }
}

/**
 * 删除文件（通过 DELETE /file/content 或降级）
 */
export async function fileDelete(
  path: string,
  directory?: string,
): Promise<boolean> {
  const dir = directory ?? _directory;
  try {
    const url = `${_baseUrl}/file/content`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, ...(dir ? { directory: dir } : {}) }),
    });
    return resp.ok;
  } catch {
    console.warn('[xingjing] fileDelete: not supported, operating in read-only mode');
    return false;
  }
}

// ─── Session API ─────────────────────────────────────────────────────────────

export interface XingjingSessionOptions {
  title?: string;
  parentId?: string;
  directory?: string;
}

/**
 * 创建 AI 会话
 * HeyAPI buildClientParams 展平规则：parentID/title/permission 应在顶层，directory 同样在顶层
 */
export async function sessionCreate(
  opts?: XingjingSessionOptions,
): Promise<string | null> {
  const client = getXingjingClient();
  try {
    const result = await client.session.create({
      ...(opts?.parentId ? { parentID: opts.parentId } : {}),
      ...(opts?.title ? { title: opts.title } : {}),
      ...(opts?.directory ?? _directory ? { directory: opts?.directory ?? _directory } : {}),
    } as Parameters<typeof client.session.create>[0]);
    if (result.data) return (result.data as { id: string }).id;
    return null;
  } catch {
    return null;
  }
}

/**
 * 向 AI 会话发送指令（异步）
 */
export async function sessionPrompt(
  sessionId: string,
  content: string,
  opts?: { directory?: string; model?: { providerID: string; modelID: string }; disableTools?: boolean },
): Promise<boolean> {
  const client = getXingjingClient();
  try {
    // Use the extended promptAsync from opencode.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.session as any).promptAsync({
      sessionID: sessionId,
      directory: opts?.directory ?? (_directory || undefined),
      ...(opts?.model ? { model: opts.model } : {}),
      ...(opts?.disableTools ? { tools: {} } : {}),
      parts: [{ type: 'text', text: content }],
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Config API ──────────────────────────────────────────────────────────────

export interface XingjingModelConfig {
  providerID: string;
  modelID: string;
  name: string;
}

/**
 * 获取可用模型列表
 */
export async function configGetModels(): Promise<XingjingModelConfig[]> {
  const client = getXingjingClient();
  try {
    const result = await client.config.providers();
    if (!result.data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const providers = Array.isArray(data) ? data : (data.providers ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return providers.flatMap((p: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.models ?? []).map((m: any) => ({
        providerID: p.id,
        modelID: m.id,
        name: m.name ?? m.id,
      }))
    ) as XingjingModelConfig[];
  } catch {
    return [];
  }
}

/**
 * 为指定 Provider 设置 API Key（同步到 OpenCode，使 callAgent 调用时生效）
 *
 * 等同于 OpenWork 设置页中「连接 Provider」-> 输入 API Key 的操作
 */
export async function setProviderAuth(providerID: string, apiKey: string): Promise<boolean> {
  const client = getXingjingClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.auth as any).set({
      providerID,
      auth: { type: 'api', key: apiKey },
    });
    return true;
  } catch (e) {
    console.warn('[xingjing] setProviderAuth failed:', e);
    return false;
  }
}

// ─── 多平台 Skill 发现 ──────────────────────────────────────────────────────

/**
 * Skill 来源平台标识
 */
export type SkillPlatform = 'openwork' | 'opencode' | 'agents' | 'claude' | 'kiro';

/**
 * 统一 Skill 条目（聚合自多个平台目录）
 */
export interface XingjingSkillItem {
  id: string;           // 唯一标识，格式：<platform>:<name>
  name: string;         // 显示名称
  description: string;
  content?: string;     // 完整内容（懒加载）
  platform: SkillPlatform;
  path: string;         // 工作区中的相对路径
  editable: boolean;    // 仅 openwork 来源可写
}

/**
 * 统一 Agent 条目
 */
export interface XingjingAgentItem {
  id: string;
  name: string;
  description: string;
  skills: string[];     // skill id 列表
  platform: SkillPlatform;
  editable: boolean;
}

import { parseFrontmatterMeta } from '../utils/frontmatter';

// 各平台 Skill 目录配置
const SKILL_DIRS: { path: string; platform: SkillPlatform; isSubdirBased: boolean }[] = [
  { path: '.opencode/skills', platform: 'opencode', isSubdirBased: true },
  { path: '.agents/skills',   platform: 'agents',   isSubdirBased: true },
  { path: '.claude/skills',   platform: 'claude',   isSubdirBased: false },
  { path: '.kiro/skills',     platform: 'kiro',     isSubdirBased: false },
];

const AGENT_DIRS: { path: string; platform: SkillPlatform }[] = [
  { path: '.opencode/agent', platform: 'opencode' },
];

/**
 * 扫描工作区所有平台的 Skill / Agent 目录，返回聚合结果。
 * 每个条目 editable=false（仅 openwork 来源通过 API 可写）。
 */
export async function discoverAllSkills(workDir: string): Promise<{
  skills: XingjingSkillItem[];
  agents: XingjingAgentItem[];
}> {
  const skills: XingjingSkillItem[] = [];
  const agents: XingjingAgentItem[] = [];

  for (const dir of SKILL_DIRS) {
    const entries = await fileList(dir.path, workDir);
    for (const entry of entries) {
      if (dir.isSubdirBased && entry.type === 'directory') {
        // 子目录结构：读取目录内的 SKILL.md
        const content = await fileRead(`${dir.path}/${entry.name}/SKILL.md`, workDir);
        if (content) {
          const meta = parseFrontmatterMeta(content);
          skills.push({
            id: `${dir.platform}:${entry.name}`,
            name: (meta['name'] as string) ?? entry.name,
            description: (meta['description'] as string) ?? '',
            content,
            platform: dir.platform,
            path: `${dir.path}/${entry.name}/SKILL.md`,
            editable: false,
          });
        }
      } else if (!dir.isSubdirBased && entry.type === 'file' && entry.name.endsWith('.md')) {
        const content = await fileRead(`${dir.path}/${entry.name}`, workDir);
        const meta = parseFrontmatterMeta(content ?? '');
        skills.push({
          id: `${dir.platform}:${entry.name.replace('.md', '')}`,
          name: (meta['name'] as string) ?? entry.name.replace('.md', ''),
          description: (meta['description'] as string) ?? '',
          content: content ?? '',
          platform: dir.platform,
          path: `${dir.path}/${entry.name}`,
          editable: false,
        });
      }
    }
  }

  for (const dir of AGENT_DIRS) {
    const entries = await fileList(dir.path, workDir);
    for (const entry of entries) {
      if (entry.type === 'file' && entry.name.endsWith('.md')) {
        const content = await fileRead(`${dir.path}/${entry.name}`, workDir);
        const meta = parseFrontmatterMeta(content ?? '');
        agents.push({
          id: `${dir.platform}:${entry.name.replace('.md', '')}`,
          name: (meta['name'] as string) ?? entry.name.replace('.md', ''),
          description: (meta['description'] as string) ?? '',
          skills: (meta['skills'] as string[]) ?? [],
          platform: dir.platform,
          editable: false,
        });
      }
    }
  }

  return { skills, agents };
}

// ─── 高阶 Agent 调用 ──────────────────────────────────────────────────────────

/**
 * 获取当前 OpenCode 服务器地址（用于 SSE 订阅）
 */
export function getBaseUrl(): string {
  return _baseUrl;
}

export interface CallAgentOptions {
  /** Agent 系统提示（角色设定）*/
  systemPrompt?: string;
  /** 用户提示词 */
  userPrompt: string;
  /** 使用的具体模型（如不指定则使用 OpenCode 默认）*/
  model?: { providerID: string; modelID: string };
  /** 会话标题 */
  title?: string;
  /** 工作目录 */
  directory?: string;
  /** OpenCode Agent ID，对应 .opencode/agents/{agentId}.md，用于 session.create 指定 Agent 上下文 */
  agentId?: string;
    /** 自动授权的工具名称列表。
     *  在白名单中的工具会自动通过权限审批（reply 'always'），
     *  不在白名单中的工具会被自动拒绝（reply 'reject'）。*/
    autoApproveTools?: string[];
  /** 流式文本回调（每次收到新文本片段时触发，参数为累积全文） */
  onText?: (accumulatedText: string) => void;
  /** 完成回调 */
  onDone?: (fullText: string) => void;
  /** 错误回调 */
  onError?: (errMsg: string) => void;
  /** 三源知识上下文（由 knowledge-retrieval 检索后注入，Markdown 格式） */
  knowledgeContext?: string;
  /** 历史会话回忆上下文（由 memory-recall 检索后注入，Markdown 格式） */
  recallContext?: string;
  /** 工具权限请求回调（用户决定是否授权）。
   *  不提供时沿用自动拒绝兜底行为。
   *  提供时 SSE 循环将暂停等待 resolve 后继续。*/
  onPermissionAsked?: (params: {
    permissionId: string;
    sessionId: string;
    tool?: string;
    description?: string;
    input?: string;
    resolve: (action: 'once' | 'always' | 'reject') => void;
  }) => void;
  /**
   * OpenWork 全局 SSE 维护的 session 状态映射（可选）。
   * 提供时用于 L2 完成检测：监听 status[sessionId] 变为 'idle'，
   * 替代原来的 REST 轮询机制，零延迟、零网络请求。
   */
  owSessionStatusById?: () => Record<string, string>;
  /**
   * Session 清理回调（可选）。
   * 会话完成后调用，通过 OpenWork deleteSession API 清理已结束的 session，
   * 避免服务端 session 资源泄漏。
   */
  owDeleteSession?: (sessionId: string) => Promise<void>;
  /**
   * Agent 调用工具时触发（tool_use 阶段）。
   * 参数：工具名称、工具输入参数（可能不完整，流式积累中）。
   * 可用于 UI 展示"正在搜索..."等工具调用中间状态。
   */
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  /**
   * Agent 获得工具执行结果时触发（tool_result 阶段）。
   * 参数：工具名称、结果摘要文本（截断到合理长度）。
   * 可用于 UI 展示"搜索完成，找到 N 条结果"。
   */
  onToolResult?: (toolName: string, result: string) => void;
  /** 复用已有 Session ID（多轮对话同一 session），跳过 session.create */
  existingSessionId?: string;
  /** Session 建立回调（新建或复用），返回当前 sessionId，供调用方缓存以便后续复用 */
  onSessionCreated?: (sessionId: string) => void;
}

/**
 * 将 SDK event.subscribe() 返回的原始事件解析为 { type, props } 格式。
 * 兼容两种包装：直接 { type, properties } 或嵌套 { payload: { type, properties } }.
 */
export function normalizeRawEvent(raw: unknown): { type: string; props: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type === 'string') {
    return { type: r.type, props: (r.properties ?? r) as Record<string, unknown> };
  }
  if (r.payload && typeof r.payload === 'object') {
    const p = r.payload as Record<string, unknown>;
    if (typeof p.type === 'string') {
      return { type: p.type, props: (p.properties ?? p) as Record<string, unknown> };
    }
  }
  return null;
}

/**
 * 执行一次 Agent 会话生命周期：订阅 SSE 事件流 → 可选发送 prompt → 等待完成。
 *
 * @param getClient   返回 OpenCode client 的工厂函数
 * @param sessionId   已有 session ID（Layer 1 重连复用）；为 null 时新建 session
 * @param accumulated 已累积的文本（Layer 1 重连时保留；Layer 2 重试时传 ''）
 * @param sendPrompt  是否发送 prompt（Layer 1 重连不重发；Layer 2 全新调用发送）
 * @param opts        原始 CallAgentOptions
 * @returns
 *   - { status: 'done', accumulated, sessionId }     — 正常完成
 *   - { status: 'sse-fail', accumulated, sessionId } — SSE 网络断开，可重试
 *   - { status: 'hard-error', accumulated, sessionId, error } — 不可重试错误
 */
async function runAgentSession(
  getClient: () => ReturnType<typeof createClient>,
  sessionId: string | null,
  accumulated: string,
  sendPrompt: boolean,
  opts: CallAgentOptions,
): Promise<{
  status: 'done' | 'sse-fail' | 'hard-error';
  accumulated: string;
  sessionId: string | null;
  error?: string;
}> {
  const client = getClient();
  let sid = sessionId;
  const sessionMsgIds = new Set<string>();
  let acc = accumulated;
  let userMsgId: string | null = null;  // 追踪用户 prompt 消息 ID，用于过滤 SSE 回显

  // 新建 session（Layer 2 或首次调用）
  if (!sid) {
    try {
      // 权限策略：对齐 OpenWork 模式 —— 不在 session 创建时设置 deny-all 限制。
      // deny-all 会阻断 OpenCode 状态机，导致不发送 session.idle/completed 事件，
      // 使会话只能靠超时兜底。工具权限改为运行时按需处理：
      //   - autoApproveTools 白名单 → 白名单工具 allow，其余 deny（仍在创建时设置）
      //   - 其余情况 → 不限制，通过 SSE permission.asked 事件按需审批/拒绝
      const sessionPermission = (() => {
        if (opts.autoApproveTools?.length) {
          return [
            ...opts.autoApproveTools.map(t => ({ permission: t, pattern: '*', action: 'allow' })),
            { permission: '*', pattern: '*', action: 'deny' },
          ];
        }
        // 无白名单时不设权限限制（对齐 OpenWork），让 OpenCode 状态机正常运转
        return undefined;
      })();
      // HeyAPI SDK buildClientParams 约定：title/parentID/permission/directory 均展平到顶层，
      // 不能嵌套在 body 对象内（body key 会被 buildClientParams 静默忽略）。
      const createParams: Record<string, unknown> = {
        ...(opts.title ? { title: opts.title } : { title: `xingjing-${Date.now()}` }),
        ...(opts.agentId ? { agent: opts.agentId } : {}),
        ...(sessionPermission ? { permission: sessionPermission } : {}),
        ...(opts.directory ?? _directory ? { directory: opts.directory ?? _directory } : {}),
      };
      console.log('[xingjing-diag] session.create params:', JSON.stringify(createParams));
      const result = await client.session.create(
        createParams as Parameters<typeof client.session.create>[0]
      );
      sid = (result.data as { id: string } | undefined)?.id ?? null;
      if (!sid) {
        console.error('[xingjing] session.create returned no id. error:', result.error,
          '| data:', result.data);
      }
    } catch (e) {
      console.error('[xingjing] session.create threw:', e);
      /* fall through */
    }

    if (!sid) {
      return { status: 'hard-error', accumulated: acc, sessionId: null, error: '无法创建 AI 会话，请检查 OpenCode 服务是否已启动' };
    }
  }

  const finalSid = sid;

  // ── 工具调用追踪（用于 onToolUse / onToolResult 回调）──
  // key: toolUseId (part.id) → { name, inputJson }
  const pendingToolUses = new Map<string, { name: string; inputJson: string }>();

  // Promise 封装整个 SSE 生命周期
  return new Promise<{ status: 'done' | 'sse-fail' | 'hard-error'; accumulated: string; sessionId: string | null; error?: string }>((resolve) => {
    let done = false;
    const controller = new AbortController();

    // 无活动超时：若 SSE 流长时间无新事件（连接挂起），自动 abort 并触发 sse-fail 重试
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let firstEventReceived = false;
    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (done) return;
      const isFirst = !firstEventReceived;
      if (isFirst) firstEventReceived = true; // 标记已收到首事件
      const timeout = isFirst ? SSE_FIRST_EVENT_TIMEOUT_MS : SSE_INACTIVITY_TIMEOUT_MS;
      console.log(`[xingjing-diag] resetInactivityTimer: isFirst=${isFirst}, timeout=${timeout / 1000}s, sid=${finalSid}`);
      inactivityTimer = setTimeout(() => {
        if (!done) {
          done = true;
          controller.abort();
          const errMsg = isFirst
            ? `SSE 超时：${SSE_FIRST_EVENT_TIMEOUT_MS / 1000}s 内未收到任何事件，请检查大模型 API Key 是否已配置且有效`
            : `SSE 超时：${SSE_INACTIVITY_TIMEOUT_MS / 1000}s 内无新事件，已触发重试`;
          console.warn(`[xingjing-diag] SSE inactivity timeout fired: isFirst=${isFirst}, accLen=${acc.length}, sid=${finalSid}`);
          resolve({ status: 'sse-fail', accumulated: acc, sessionId: finalSid, error: errMsg });
        }
      }, timeout);
    };

    // 内容空闲超时：有累积内容后若 CONTENT_IDLE_TIMEOUT_MS 内无新内容，判定为完成
    // 注意：clearTimeout 必须在内容变化检查之后，否则 heartbeat/工具事件会不断清除定时器
    let contentIdleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastAccLen = 0;
    const resetContentIdleTimer = () => {
      if (done) return;
      if (acc.length === 0) return; // 无内容时不启动
      if (acc.length === lastAccLen) return; // 内容未变化，保留现有定时器继续倒计时
      // 内容增长了 → 清除旧定时器，重新开始 8s 倒计时
      if (contentIdleTimer) clearTimeout(contentIdleTimer);
      lastAccLen = acc.length;
      contentIdleTimer = setTimeout(() => {
        if (!done && acc.length > 0) {
          console.warn(`[xingjing-diag] Content idle timeout: ${CONTENT_IDLE_TIMEOUT_MS / 1000}s no new content, accLen=${acc.length}, treating as done, sid=${finalSid}`);
          finishSession('content-idle-timeout');
        }
      }, CONTENT_IDLE_TIMEOUT_MS);
    };

    // ── L2 Session 完成检测 ──
    // 复用 OpenWork 全局 SSE 维护的 sessionStatusById 状态，
    // 无需独立 REST 轮询。当 status[sid] 变为 'idle' 时表示完成。
    // 未提供 owSessionStatusById 时，依赖 SSE 事件和 L3 内容空闲超时。
    let owStatusWatchTimer: ReturnType<typeof setInterval> | null = null;
    let sessionPollDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let pollStarted = false;

    const startSessionPoll = () => {
      if (pollStarted || done) return;
      pollStarted = true;

      if (opts.owSessionStatusById) {
        // ── 复用 OpenWork 状态：定期检查 store 值（非网络请求，极低开销） ──
        sessionPollDelayTimer = setTimeout(() => {
          if (done) return;
          sessionPollDelayTimer = null;
          console.log(`[xingjing-diag] L2 status watch started (owSessionStatusById), sid=${finalSid}`);
          owStatusWatchTimer = setInterval(() => {
            if (done) { stopSessionPoll(); return; }
            const statuses = opts.owSessionStatusById!();
            const status = statuses[finalSid];
            if (status === 'idle') {
              console.log(`[xingjing-diag] L2 owSessionStatusById detected idle, accLen=${acc.length}, sid=${finalSid}`);
              finishSession('ow-status-idle');
            }
          }, 500); // 每 500ms 读一次 store，零网络开销
        }, SESSION_POLL_START_DELAY_MS);
      }
      // 无 owSessionStatusById 时不启动轮询，依赖 SSE 事件和 L3 内容空闲超时
    };
    const stopSessionPoll = () => {
      if (sessionPollDelayTimer) { clearTimeout(sessionPollDelayTimer); sessionPollDelayTimer = null; }
      if (owStatusWatchTimer) { clearInterval(owStatusWatchTimer); owStatusWatchTimer = null; }
    };

    /** 统一完成处理：清理所有计时器并 resolve */
    const finishSession = (reason: string) => {
      if (done) return;
      console.log(`[xingjing-diag] finishSession: reason=${reason}, accLen=${acc.length}, sid=${finalSid}`);
      cleanup();
      resolve({ status: 'done', accumulated: acc, sessionId: finalSid });
    };

    const cleanup = () => {
      if (!done) {
        done = true;
        controller.abort();
        if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
        if (contentIdleTimer) { clearTimeout(contentIdleTimer); contentIdleTimer = null; }
        stopSessionPoll();
      }
    };

    // ── SSE 订阅（fire-and-resolve 模式）──
    // 使用 directory scope 订阅：星静和 OpenWork 共用同一个 OpenCode 客户端，
    // 若都用全局 undefined 订阅会导致 SSE 连接互斥，事件流被截断。
    // directory scope 下内容事件（message.part.*）正常接收，
    // session 完成检测由 L2 REST 轮询 + L3 内容空闲超时兜底。
    void (async () => {
      try {
        const eventDir = opts.directory ?? (_directory || undefined);
        const sub = await client.event.subscribe(
          eventDir ? { directory: eventDir } : undefined,
          { signal: controller.signal },
        );

        resetInactivityTimer(); // 启动首次无活动计时器

        for await (const raw of sub.stream as AsyncIterable<unknown>) {
          if (done) break;
          firstEventReceived = true; // 标记已收到首事件
          const evt = normalizeRawEvent(raw);
          if (!evt) continue;

          // 只有非 keep-alive 事件才重置无活动计时器
          // server.heartbeat / server.connected 是服务器级心跳，不代表会话有进展
          if (!NON_ACTIVITY_EVENT_TYPES.has(evt.type)) {
            resetInactivityTimer();
          }

          const p = evt.props;
          // [诊断日志] 打印每个SSE事件类型和sessionID，用于排查完成信号丢失
          const evtSidForLog = typeof p.sessionID === 'string' ? p.sessionID : (typeof (p.part as Record<string, unknown> | undefined)?.sessionID === 'string' ? String((p.part as Record<string, unknown>).sessionID) : 'N/A');
          if (evt.type !== 'message.part.updated' && evt.type !== 'message.part.delta' && evt.type !== 'message.part') {
            console.log(`[xingjing-diag] SSE event: type=${evt.type}, evtSid=${evtSidForLog}, ourSid=${finalSid}, accLen=${acc.length}`);
          }

          // ── message.part.updated ──
          if (evt.type === 'message.part.updated') {
            const part = p.part as Record<string, unknown> | undefined;
            if (!part || String(part.sessionID ?? '') !== finalSid) continue;

            const partMsgId = part.messageID ? String(part.messageID) : null;

            // 检测并跳过用户 prompt 消息回显（含 Agent systemPrompt 等）
            const partRole = typeof part.role === 'string' ? part.role : null;
            if (partRole === 'user') {
              if (partMsgId) userMsgId = partMsgId;
              continue;
            }
            if (sendPrompt && !userMsgId && partMsgId) {
              userMsgId = partMsgId;
              continue;
            }
            if (partMsgId && partMsgId === userMsgId) {
              continue;
            }

            if (partMsgId) sessionMsgIds.add(partMsgId);

            // ── 工具调用（tool-use）部分 ──
            if (part.type === 'tool-use' || part.type === 'tool_use') {
              const toolId = String(part.id ?? partMsgId ?? '');
              const toolName = String(part.name ?? part.tool ?? '');
              if (toolId && toolName && opts.onToolUse) {
                // 积累 input JSON（可能分多个事件到达）
                const existingJson = pendingToolUses.get(toolId)?.inputJson ?? '';
                const inputRaw = part.input ?? part.arguments ?? part.parameters;
                const newJson = typeof inputRaw === 'string'
                  ? inputRaw
                  : (typeof inputRaw === 'object' ? JSON.stringify(inputRaw) : existingJson);
                pendingToolUses.set(toolId, { name: toolName, inputJson: newJson });
                // 尝试解析输入参数
                let parsedInput: Record<string, unknown> = {};
                try { parsedInput = JSON.parse(newJson) as Record<string, unknown>; } catch { /* partial */ }
                opts.onToolUse(toolName, parsedInput);
              }
              resetContentIdleTimer();
              startSessionPoll();
              continue;
            }

            // ── 工具结果（tool-result）部分 ──
            if (part.type === 'tool-result' || part.type === 'tool_result') {
              const toolUseId = String(part.toolUseID ?? part.tool_use_id ?? part.id ?? '');
              const pending = pendingToolUses.get(toolUseId);
              const toolName = pending?.name ?? String(part.name ?? part.tool ?? '');
              if (toolName && opts.onToolResult) {
                const content = part.content;
                let resultText = '';
                if (typeof content === 'string') {
                  resultText = content.slice(0, 500);
                } else if (Array.isArray(content)) {
                  resultText = (content as Array<Record<string, unknown>>)
                    .filter(c => c.type === 'text')
                    .map(c => String(c.text ?? ''))
                    .join('\n')
                    .slice(0, 500);
                }
                if (toolUseId) pendingToolUses.delete(toolUseId);
                opts.onToolResult(toolName, resultText);
              }
              resetContentIdleTimer();
              startSessionPoll();
              continue;
            }

            if (part.type === 'text') {
              const fullText = String(part.text ?? '');
              if (fullText.length >= acc.length) {
                acc = fullText;
                opts.onText?.(acc);
              } else if (typeof p.delta === 'string' && p.delta) {
                acc += p.delta;
                opts.onText?.(acc);
              }
            }
            resetContentIdleTimer(); // 内容变化，重置内容空闲计时器
            startSessionPoll(); // 首次内容到达后启动 session 状态轮询
            continue;
          }

          // ── message.part.delta ──
          if (evt.type === 'message.part.delta') {
            const msgId = typeof p.messageID === 'string' ? p.messageID : null;
            if (msgId && msgId === userMsgId) { resetContentIdleTimer(); continue; } // 跳过用户消息 delta
            if (msgId && sessionMsgIds.has(msgId)) {
              const delta = typeof p.delta === 'string' ? p.delta : '';
              const field = typeof p.field === 'string' ? p.field : '';
              if (delta && field === 'text') {
                acc += delta;
                opts.onText?.(acc);
              }
            }
            resetContentIdleTimer(); // 内容变化，重置内容空闲计时器
            startSessionPoll(); // 确保 session 状态轮询已启动
            continue;
          }

          // ── message.part (旧格式) ──
          if (evt.type === 'message.part') {
            if (String(p.sessionID ?? '') !== finalSid) continue;
            const part = p.part as Record<string, unknown> | undefined;
            // 跳过用户消息
            const partMsgId2 = part?.messageID ? String(part.messageID) : null;
            if (partMsgId2 && partMsgId2 === userMsgId) { resetContentIdleTimer(); continue; }
            if (part?.type === 'text') {
              const text = String(part.text ?? part.content ?? '');
              acc += text;
              opts.onText?.(acc);
            }
            resetContentIdleTimer(); // 内容变化，重置内容空闲计时器
            startSessionPoll(); // 确保 session 状态轮询已启动
            continue;
          }

          // ── session.error（服务端硬错误，不重试）──
          if (evt.type === 'session.error') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            cleanup();
            const errObj = p.error as Record<string, unknown> | undefined;
            const errMsg = errObj
              ? String(errObj.message ?? errObj.name ?? '未知错误')
              : String(p.message ?? '未知错误');
            resolve({ status: 'hard-error', accumulated: acc, sessionId: finalSid, error: errMsg });
            return;
          }

          // ── session.completed ──
          if (evt.type === 'session.completed') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            finishSession('session.completed');
            return;
          }

          // ── session.idle ──
          if (evt.type === 'session.idle') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue; // null-safe：与 session.completed 保持一致
            finishSession('session.idle');
            return;
          }

          // ── session.status ──
          if (evt.type === 'session.status') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue; // null-safe
            const statusObj = p.status;
            const statusType = typeof statusObj === 'object' && statusObj !== null
              ? String((statusObj as Record<string, unknown>).type ?? '')
              : String(statusObj ?? '');
            console.log(`[xingjing-diag] session.status: statusType="${statusType}", accLen=${acc.length}, sid=${finalSid}`);
            if (statusType === 'idle' || statusType === 'completed') {
              finishSession(`session.status:${statusType}`);
              return;
            }
          }

          // ── 工具权限请求 ──
          if (evt.type === 'permission.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            const permId = typeof p.id === 'string' ? p.id : null;
            const toolName = typeof p.tool === 'string' ? p.tool : '';
            console.warn(`[xingjing-diag] permission.asked: permId=${permId}, tool=${String(p.tool ?? 'N/A')}, desc=${String(p.description ?? 'N/A')}, hasCallback=${!!opts.onPermissionAsked}, sid=${finalSid}`);
          
            // 自动授权：工具名在白名单中 → 静默 reply 'always'
            if (permId && opts.autoApproveTools?.length) {
              const approved = opts.autoApproveTools.includes(toolName);
              if (approved) {
                console.log(`[xingjing-diag] permission.asked auto-approved: tool=${toolName}, sid=${finalSid}`);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                void (getClient().permission as any).reply({ requestID: permId, reply: 'always' }).catch(() => {});
                continue;
              }
              // 不在白名单：自动拒绝
              console.log(`[xingjing-diag] permission.asked auto-rejected: tool=${toolName}, sid=${finalSid}`);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: 'reject' }).catch(() => {});
              continue;
            }

            if (permId && opts.onPermissionAsked) {
              // 有回调：暂停 SSE 循环，等待用户在 UI 上做决策
              const action = await new Promise<'once' | 'always' | 'reject'>((res) => {
                opts.onPermissionAsked!({
                  permissionId: permId,
                  sessionId: finalSid,
                  tool: typeof p.tool === 'string' ? p.tool : undefined,
                  description: typeof p.description === 'string' ? p.description : undefined,
                  input: typeof p.input === 'string' ? p.input : (typeof p.path === 'string' ? p.path : undefined),
                  resolve: res,
                });
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: action }).catch(() => {});
            } else if (permId) {
              // 无回调兜底：自动拒绝，model 继续以纯文本生成响应
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().permission as any).reply({ requestID: permId, reply: 'reject' }).catch(() => {});
            }
            continue; // 继续等待 session 完成
          }

          // ── 澄清问题请求：自动拒绝并继续 ──
          if (evt.type === 'question.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== finalSid) continue;
            const reqId = typeof p.id === 'string' ? p.id : (typeof p.requestID === 'string' ? p.requestID : null);
            if (reqId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              void (getClient().question as any).reject({ requestID: reqId }).catch(() => {});
            }
            continue; // 继续等待 session 完成
          }
        }

        // 事件流结束但未收到完成信号
        if (!done) {
          console.warn(`[xingjing-diag] SSE stream ended without completion signal: accLen=${acc.length}, resolvingAs=${acc ? 'done' : 'sse-fail'}, sid=${finalSid}`);
          cleanup();
          resolve({
            status: acc ? 'done' : 'sse-fail',
            accumulated: acc,
            sessionId: finalSid,
            error: 'SSE 事件流意外结束',
          });
        }
      } catch (e) {
        if (done) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('abort')) return;
        cleanup();
        resolve({ status: 'sse-fail', accumulated: acc, sessionId: finalSid, error: `SSE 连接失败: ${msg}` });
      }
    })();

    // ── 发送 prompt（仅首次调用或 Layer 2 重试时）──
    if (sendPrompt) {
      // 合成 prompt：system + 当前时间 + 知识上下文 + 回忆上下文 + 用户输入
      const promptParts: string[] = [];
      if (opts.systemPrompt) promptParts.push(opts.systemPrompt);
      // 注入当前精确时间，使 LLM 能回答时间相关问题
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'long', hour12: false,
      });
      promptParts.push(`## 当前系统时间\n${timeStr}`);
      if (opts.knowledgeContext) promptParts.push(`## 相关知识上下文\n${opts.knowledgeContext}`);
      if (opts.recallContext) promptParts.push(`## 相关历史上下文\n${opts.recallContext}`);
      promptParts.push(opts.userPrompt);
      const fullPrompt = promptParts.join('\n\n---\n\n');

      void (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client.session as any).promptAsync({
            sessionID: finalSid,
            directory: opts.directory ?? (_directory || undefined),
            ...(opts.model ? { model: opts.model } : {}),
            // 不传 tools 参数：工具调用由 session 级权限规则控制。
            // 传 tools:{} 会导致 OpenCode 状态机无法从 busy 转为 idle，session 永远不完成。
            parts: [{ type: 'text', text: fullPrompt }],
          });
        } catch {
          if (!done) {
            cleanup();
            resolve({ status: 'hard-error', accumulated: acc, sessionId: finalSid, error: '发送提示词失败' });
          }
        }
      })();
    }
  });
}

/**
 * Agent 会话执行核心：两层静默重试策略。
 * Layer 1 复用 sessionId 重连 SSE，Layer 2 全新调用。
 *
 * 采用 SDK 的 client.event.subscribe() 替代原生 EventSource，
 * 确保在 Tauri/WKWebView 环境下正确使用 tauriFetch 并携带认证头。
 */
async function executeAgentWithRetry(
  getClient: () => ReturnType<typeof createClient>,
  opts: CallAgentOptions,
): Promise<void> {
  let sessionId: string | null = opts.existingSessionId ?? null;
  let accumulated = '';

  // ── Layer 1: SSE 重连（复用 sessionId，不重发 prompt）──
  for (let sseTry = 0; sseTry <= RETRY_DELAYS.length; sseTry++) {
    if (sseTry > 0) await sleep(RETRY_DELAYS[sseTry - 1]);

    console.log(`[xingjing-diag] executeAgent Layer1 try=${sseTry}, sessionId=${sessionId}, accLen=${accumulated.length}`);
    const r = await runAgentSession(
      getClient,
      sseTry === 0 ? (opts.existingSessionId ?? null) : sessionId,
      sseTry === 0 ? '' : accumulated,
      sseTry === 0,
      opts,
    );

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    if (r.sessionId) opts.onSessionCreated?.(r.sessionId);

    if (r.status === 'done') {
      opts.onDone?.(accumulated);
      if (sessionId) opts.owDeleteSession?.(sessionId).catch(() => {});
      return;
    }
    // 服务端硬错误（session.error）：不做 Layer 1 重试，直接进 Layer 2
    if (r.status === 'hard-error' && !r.error?.includes('无法创建')) break;
    // session 创建失败：无法 Layer 1 重连，直接进 Layer 2
    if (!sessionId) break;
  }

  // ── Layer 2: 全新调用（新 session + 重发 prompt）──
  for (let callTry = 0; callTry <= RETRY_DELAYS.length; callTry++) {
    if (callTry > 0) await sleep(RETRY_DELAYS[callTry - 1]);

    const r = await runAgentSession(getClient, null, '', true, opts);

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    if (r.sessionId) opts.onSessionCreated?.(r.sessionId);

    if (r.status === 'done') {
      opts.onDone?.(accumulated);
      if (sessionId) opts.owDeleteSession?.(sessionId).catch(() => {});
      return;
    }

    if (callTry === RETRY_DELAYS.length) {
      const errMsg = r.error ?? '重试耗尽，请检查网络连接或 OpenCode 服务状态';
      opts.onError?.(errMsg);
      return;
    }
  }

  opts.onError?.('重试耗尽，请检查网络连接或 OpenCode 服务状态');
}

/**
 * 使用外部注入的 client（来自 OpenWork）调用 AI Agent。
 */
export async function callAgentWithClient(
  client: ReturnType<typeof createClient>,
  opts: CallAgentOptions,
): Promise<void> {
  return executeAgentWithRetry(() => client, opts);
}

/**
 * 调用 AI Agent：创建会话 → 发送提示词 → 流式接收结果 → 完成回调。
 * 使用 OpenWork 注入的共享 client。
 */
export async function callAgent(opts: CallAgentOptions): Promise<void> {
  return executeAgentWithRetry(() => getXingjingClient(), opts);
}

// ─── 直连 LLM API（OpenCode 不可用时的降级路径）────────────────────────────

/**
 * 直连 LLM 配置（独立于 OpenCode）
 */
export interface DirectLLMConfig {
  apiUrl: string;
  apiKey: string;
  modelID?: string;
  providerID?: string;
}

/**
 * 直连 LLM API 调用 Agent（OpenCode 不可用时的降级实现）。
 *
 * 支持 OpenAI 兼容接口（POST /chat/completions，stream=true）和
 * Anthropic 接口（POST /messages）。
 * 调用方通过 opts.onText / opts.onDone / opts.onError 接收结果（与 callAgent 接口一致）。
 */
export async function callAgentDirect(
  opts: CallAgentOptions,
  llmConfig: DirectLLMConfig,
): Promise<void> {
  if (!llmConfig.apiKey) {
    opts.onError?.('直连模式需要配置 API Key');
    return;
  }

  const apiUrl = llmConfig.apiUrl.replace(/\/$/,  '');
  const modelId = llmConfig.modelID || 'deepseek-chat';
  const isAnthropic = llmConfig.providerID === 'anthropic';

  // 构建消息列表（注入知识上下文和回忆上下文）
  const systemContent = opts.systemPrompt ?? '';
  const userParts: string[] = [];
  if (opts.knowledgeContext) userParts.push(`## 相关知识上下文\n${opts.knowledgeContext}`);
  if (opts.recallContext) userParts.push(`## 相关历史上下文\n${opts.recallContext}`);
  userParts.push(opts.userPrompt);
  const userContent = userParts.join('\n\n---\n\n');
  const messages: Array<{ role: string; content: string }> = [];
  if (!isAnthropic && systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }
  messages.push({ role: 'user', content: userContent });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let endpoint: string;
  let body: unknown;

  if (isAnthropic) {
    headers['x-api-key'] = llmConfig.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    endpoint = `${apiUrl}/messages`;
    body = {
      model: modelId,
      max_tokens: 4096,
      ...(systemContent ? { system: systemContent } : {}),
      messages: [{ role: 'user', content: userContent }],
      stream: true,
    };
  } else {
    headers['Authorization'] = `Bearer ${llmConfig.apiKey}`;
    endpoint = `${apiUrl}/chat/completions`;
    body = {
      model: modelId,
      messages,
      stream: true,
    };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opts.onError?.(`直连 API 网络错误: ${msg}`);
    return;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json() as { error?: { message?: string }; message?: string };
      detail = errJson.error?.message ?? errJson.message ?? '';
    } catch {
      detail = (await response.text()).slice(0, 120);
    }
    opts.onError?.(`直连 API 错误 ${response.status}: ${detail}`);
    return;
  }

  // 流式读取
  const reader = response.body?.getReader();
  if (!reader) {
    opts.onError?.('直连 API 未返回可读流');
    return;
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let streamDone = false;

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) { streamDone = true; break; }
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { streamDone = true; break; }
        try {
          if (isAnthropic) {
            // Anthropic stream events: content_block_delta
            const parsed = JSON.parse(data) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const delta = parsed.delta.text ?? '';
              if (delta) {
                accumulated += delta;
                opts.onText?.(accumulated);
              }
            }
          } else {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              opts.onText?.(accumulated);
            }
            if (parsed.choices?.[0]?.finish_reason === 'stop') {
              streamDone = true;
            }
          }
        } catch { /* 忽略单行解析错误 */ }
      }
    }
    opts.onDone?.(accumulated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (accumulated) {
      opts.onDone?.(accumulated);
    } else {
      opts.onError?.(`直连 API 流式读取失败: ${msg}`);
    }
  }
}

// ─── Git 同步能力 ────────────────────────────────────────────────────────────
// 通过 OpenCode sessionPrompt 执行 git 命令

/**
 * 通过 AI 会话执行 shell 命令并等待完成
 * @returns 执行是否成功
 */
async function execViaAgent(
  command: string,
  directory?: string,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    callAgent({
      title: `xingjing-git-${Date.now()}`,
      directory,
      systemPrompt: '你是一个 Git 操作助手。请直接执行用户要求的 git 命令，不要解释。只输出命令执行结果。',
      userPrompt: `请执行以下命令：\n\`\`\`bash\n${command}\n\`\`\``,
      onText: (text) => { output = text; },
      onDone: (fullText) => resolve({ ok: true, output: fullText }),
      onError: (err) => resolve({ ok: false, output: err }),
    });
  });
}

/**
 * 同步 Git 仓库（add + commit + push）
 * @param workDir 工作目录
 * @param message commit 消息（默认 "xingjing sync"）
 */
export async function gitSync(
  workDir: string,
  message = 'xingjing sync',
): Promise<{ ok: boolean; output: string }> {
  const cmd = `git add -A && git commit -m "${message.replace(/"/g, '\\"')}" && git push`;
  return execViaAgent(cmd, workDir);
}
