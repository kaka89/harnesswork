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
import { createSignal, onCleanup } from 'solid-js';
import { engineInfo } from '../../lib/tauri';
import { isTauriRuntime } from '../../utils';

// ─── Client 单例 ────────────────────────────────────────────────────────────

let _client: ReturnType<typeof createClient> | null = null;
let _baseUrl = 'http://127.0.0.1:4096';
let _directory = '';
let _username = '';
let _password = '';

/** 断线重试退避时间（ms）：1s / 2s / 5s */
const RETRY_DELAYS = [1000, 2000, 5000] as const;

/** SSE 事件流无活动超时（ms）：90 秒内无任何新事件则视为连接挂起，触发 sse-fail 重试 */
const SSE_INACTIVITY_TIMEOUT_MS = 90_000;

/** 首事件等待超时（ms）：prompt 发送后若 30 秒内未收到任何 SSE 事件，
 *  高概率为 API Key 未配置 / 模型不可用等配置问题，提前报错而非等满 90 秒 */
const SSE_FIRST_EVENT_TIMEOUT_MS = 30_000;

/** 内容空闲超时（ms）：已有累积内容后，若指定时间内无新内容增长，
 *  视为模型已完成输出但 OpenCode 未发 completion 信号，直接判定完成。
 *  注：此值为兜底上限，正常情况下 session 状态轮询会更早检测到完成。 */
const CONTENT_IDLE_TIMEOUT_MS = 8_000;

/** 内容停止后 session 状态轮询间隔（ms）：每 2 秒通过 REST API 主动查询 session 状态，
 *  解决 OpenCode 对 deny-all session 不发 idle/completed SSE 事件的问题 */
const SESSION_POLL_INTERVAL_MS = 2_000;

/** 首次内容到达后延迟多久开始轮询（ms）：避免模型还在生成时过早轮询 */
const SESSION_POLL_START_DELAY_MS = 1_000;

/** 不应重置无活动计时器的 SSE 事件类型（服务器级 keep-alive，非会话进度） */
const NON_ACTIVITY_EVENT_TYPES = new Set(['server.heartbeat', 'server.connected']);

/** 异步等待指定毫秒 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function initXingjingClient(baseUrl: string, directory: string, auth?: { username?: string; password?: string }) {
  _baseUrl = baseUrl;
  _directory = directory;
  _username = auth?.username ?? '';
  _password = auth?.password ?? '';
  _client = createClient(baseUrl, directory, _username && _password ? { username: _username, password: _password } : undefined);
}

/**
 * 返回 Basic Auth 请求头值（用于裸 fetch 调用的认证）
 */
export function getAuthHeader(): string | null {
  if (!_username || !_password) return null;
  try {
    const encoded = btoa(`${_username}:${_password}`);
    return `Basic ${encoded}`;
  } catch {
    return null;
  }
}

export function getXingjingClient() {
  if (!_client) {
    _client = createClient(_baseUrl, _directory);
  }
  return _client;
}

/**
 * 刷新 baseUrl：Tauri 运行时从 engineInfo 动态获取最新端口，
 * 解决 OpenCode 重启后动态端口变更导致 SSE 连接失败的问题。
 */
async function refreshBaseUrl(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      const info = await engineInfo();
      if (info.running && info.baseUrl) {
        const url = info.baseUrl.replace(/\/$/, '');
        const username = info.opencodeUsername?.trim() ?? '';
        const password = info.opencodePassword?.trim() ?? '';
        const urlChanged = url !== _baseUrl;
        const authChanged = username !== _username || password !== _password;
        if (urlChanged || authChanged) {
          _baseUrl = url;
          _username = username;
          _password = password;
          _client = createClient(url, _directory, username && password ? { username, password } : undefined);
        }
        return url;
      }
    } catch { /* 降级到缓存值 */ }
  }
  return _baseUrl;
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
  const client = getXingjingClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.file.list as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return result.data as FileNode[];
    return [];
  } catch {
    return [];
  }
}

/**
 * 读取文件内容（文本）
 * 注意：HeyAPI SDK 将 query 参数展平到 options 顶层
 */
export async function fileRead(
  path: string,
  directory?: string,
): Promise<string | null> {
  const client = getXingjingClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.file.read as any)({
      path,
      directory: directory ?? (_directory || undefined),
    });
    if (result.data) return (result.data as FileContent).content;
    return null;
  } catch {
    return null;
  }
}

/**
 * 写入文件内容（通过直接 POST 到 OpenCode file API）
 * 若 OpenCode 不支持写入，则优雅降级（仅日志）
 */
export async function fileWrite(
  path: string,
  content: string,
  directory?: string,
): Promise<boolean> {
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
    // OpenCode 当前版本可能不支持 file write，优雅降级
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
 * SessionCreateData: { body?: { parentID?, title? }, query?: { directory? } }
 * HeyAPI 展平后：{ body: { parentID?, title? }, directory? }
 */
export async function sessionCreate(
  opts?: XingjingSessionOptions,
): Promise<string | null> {
  const client = getXingjingClient();
  try {
    const result = await client.session.create({
      body: {
        ...(opts?.parentId ? { parentID: opts.parentId } : {}),
        ...(opts?.title ? { title: opts.title } : {}),
      },
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

// ─── SSE 事件订阅 ─────────────────────────────────────────────────────────────

export type XingjingEvent =
  | { type: 'session.progress'; sessionId: string; progress: number }
  | { type: 'session.done'; sessionId: string }
  | { type: 'session.error'; sessionId: string; message: string }
  | { type: 'unknown'; raw: unknown };

/**
 * SolidJS reactive 工具：订阅 OpenCode SSE 事件
 */
export function createOpenCodeEvents(
  onEvent: (event: XingjingEvent) => void,
) {
  const [connected, setConnected] = createSignal(false);

  const eventSource = new EventSource(`${_baseUrl}/event`);
  eventSource.onopen = () => setConnected(true);
  eventSource.onerror = () => setConnected(false);
  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as Record<string, unknown>;
      if (data.type === 'session.completed') {
        onEvent({ type: 'session.done', sessionId: String(data.sessionID ?? '') });
      } else if (data.type === 'session.error') {
        onEvent({
          type: 'session.error',
          sessionId: String(data.sessionID ?? ''),
          message: String(data.message ?? ''),
        });
      } else {
        onEvent({ type: 'unknown', raw: data });
      }
    } catch { /* ignore */ }
  };

  onCleanup(() => eventSource.close());

  return { connected };
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

// ─── SolidJS Reactive 辅助 ─────────────────────────────────────────────────

/**
 * 创建响应式文件资源：读取文件内容，不可用时降级到 mock
 */
export function createFileResource<T>(
  getPath: () => string,
  parseFn: (content: string) => T,
  mockFallback: T,
): () => T {
  const [value, setValue] = createSignal<T>(mockFallback);

  const path = getPath();
  if (path) {
    fileRead(path).then((content) => {
      if (content) {
        try {
          setValue(() => parseFn(content));
        } catch {
          // parse error, keep mock fallback
        }
      }
    });
  }

  return value as () => T;
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

/** 简单解析 Markdown YAML frontmatter */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    // 简单 YAML 数组：- item
    if (raw === '') {
      // multiline — skip for simplicity
      continue;
    }
    result[key] = raw.replace(/^["']|["']$/g, '');
  }
  // 处理 skills 数组（取紧跟在 skills: 后面的 - 行）
  const skillsMatch = content.match(/^skills:\s*\n((?:\s*-\s*.+\n?)*)/m);
  if (skillsMatch) {
    result['skills'] = skillsMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return result;
}

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
          const meta = parseFrontmatter(content);
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
        const meta = parseFrontmatter(content ?? '');
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
        const meta = parseFrontmatter(content ?? '');
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
  /** 是否启用工具调用（默认 false，保持 deny-all 安全策略）。
   *  设为 true 时不设置会话级权限限制，使用 Agent 定义的默认权限。*/
  enableTools?: boolean;
    /** 自动授权的工具名称列表。
     *  在白名单中的工具会自动通过权限审批（reply 'always'），
     *  不在白名单中的工具会被自动拒绝（reply 'reject'）。
     *  优先级：autoApproveTools > enableTools > deny-all。 */
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
}

/**
 * 将 SDK event.subscribe() 返回的原始事件解析为 { type, props } 格式。
 * 兼容两种包装：直接 { type, properties } 或嵌套 { payload: { type, properties } }.
 */
function normalizeRawEvent(raw: unknown): { type: string; props: Record<string, unknown> } | null {
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
      // 权限策略：默认 deny-all 防止工具调用卡死 SSE；enableTools=true 时放开使用 Agent 默认权限
      const sessionPermission = (() => {
        if (opts.autoApproveTools?.length) {
          return [
            ...opts.autoApproveTools.map(t => ({ permission: t, pattern: '*', action: 'allow' })),
            { permission: '*', pattern: '*', action: 'deny' },
          ];
        }
        if (opts.enableTools) return undefined;
        // 有权限回调时不设 deny-all，让 OpenCode 发送 permission.asked 事件
        if (opts.onPermissionAsked) return undefined;
        return [{ permission: '*', pattern: '*', action: 'deny' }];
      })();
      const result = await client.session.create({
        body: {
          ...(opts.title ? { title: opts.title } : { title: `xingjing-${Date.now()}` }),
          ...(opts.agentId ? { agent: opts.agentId } : {}),
        },
        ...(sessionPermission ? { permission: sessionPermission } : {}),
        ...(opts.directory ?? _directory ? { directory: opts.directory ?? _directory } : {}),
      } as Parameters<typeof client.session.create>[0]);
      sid = (result.data as { id: string } | undefined)?.id ?? null;
    } catch { /* fall through */ }

    if (!sid) {
      return { status: 'hard-error', accumulated: acc, sessionId: null, error: '无法创建 AI 会话，请检查 OpenCode 服务是否已启动' };
    }
  }

  const finalSid = sid;

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
      if (!isFirst) firstEventReceived = true; // 标记已收到首事件
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
    // 解决 OpenCode 不发 session.completed 但 heartbeat 持续重置 inactivity timer 的问题
    let contentIdleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastAccLen = 0;
    const resetContentIdleTimer = () => {
      if (contentIdleTimer) clearTimeout(contentIdleTimer);
      if (done) return;
      if (acc.length === 0) return; // 无内容时不启动
      if (acc.length === lastAccLen) return; // 内容未变化，不重置（让计时器继续倒计时）
      lastAccLen = acc.length;
      contentIdleTimer = setTimeout(() => {
        if (!done && acc.length > 0) {
          console.warn(`[xingjing-diag] Content idle timeout: ${CONTENT_IDLE_TIMEOUT_MS / 1000}s no new content, accLen=${acc.length}, treating as done, sid=${finalSid}`);
          finishSession('content-idle-timeout');
        }
      }, CONTENT_IDLE_TIMEOUT_MS);
    };

    // ── Session 状态主动轮询 ──
    // OpenCode 对 deny-all 权限策略的 session 不发 idle/completed SSE 事件，
    // 导致会话只能等超时。此轮询机制在内容停止增长后主动查询 session 状态，
    // 一旦检测到 idle/completed 立即结束，避免等待超时。
    let sessionPollTimer: ReturnType<typeof setInterval> | null = null;
    let sessionPollDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let pollStarted = false;
    const startSessionPoll = () => {
      if (pollStarted || done) return;
      pollStarted = true;
      // 延迟启动：首次内容到达后等 SESSION_POLL_START_DELAY_MS 再开始轮询
      sessionPollDelayTimer = setTimeout(() => {
        if (done) return;
        sessionPollDelayTimer = null;
        sessionPollTimer = setInterval(async () => {
          if (done) { stopSessionPoll(); return; }
          try {
            const result = await client.session.get({ sessionID: finalSid } as Parameters<typeof client.session.get>[0]);
            const sessionData = result.data as Record<string, unknown> | undefined;
            if (!sessionData || done) return;
            // 检查 session 状态
            const statusObj = sessionData.status;
            const statusType = typeof statusObj === 'object' && statusObj !== null
              ? String((statusObj as Record<string, unknown>).type ?? '')
              : String(statusObj ?? '');
            console.log(`[xingjing-diag] Session poll: statusType="${statusType}", accLen=${acc.length}, sid=${finalSid}`);
            if (statusType === 'idle' || statusType === 'completed') {
              console.log(`[xingjing-diag] Session poll detected completion: statusType="${statusType}", accLen=${acc.length}, sid=${finalSid}`);
              finishSession('session-poll-idle');
            }
          } catch (e) {
            // 轮询失败不影响主流程，继续等待 SSE 事件或超时
            console.warn(`[xingjing-diag] Session poll error:`, e instanceof Error ? e.message : e);
          }
        }, SESSION_POLL_INTERVAL_MS);
      }, SESSION_POLL_START_DELAY_MS);
    };
    const stopSessionPoll = () => {
      if (sessionPollDelayTimer) { clearTimeout(sessionPollDelayTimer); sessionPollDelayTimer = null; }
      if (sessionPollTimer) { clearInterval(sessionPollTimer); sessionPollTimer = null; }
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
      // 合成 prompt：system + 知识上下文 + 回忆上下文 + 用户输入
      const promptParts: string[] = [];
      if (opts.systemPrompt) promptParts.push(opts.systemPrompt);
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
 * 使用外部注入的 client（来自 OpenWork）调用 AI Agent。
 *
 * 采用 SDK 的 client.event.subscribe() 替代原生 EventSource，
 * 确保在 Tauri/WKWebView 环境下正确使用 tauriFetch 并携带认证头。
 */
export async function callAgentWithClient(
  client: ReturnType<typeof createClient>,
  opts: CallAgentOptions,
): Promise<void> {
  await refreshBaseUrl();

  const getClient = () => client;
  let sessionId: string | null = null;
  let accumulated = '';

  // ── Layer 1: SSE 重连（复用 sessionId，不重发 prompt）──
  for (let sseTry = 0; sseTry <= RETRY_DELAYS.length; sseTry++) {
    if (sseTry > 0) await sleep(RETRY_DELAYS[sseTry - 1]);

    console.log(`[xingjing-diag] callAgentWithClient Layer1 try=${sseTry}, sessionId=${sessionId}, accLen=${accumulated.length}`);
    const r = await runAgentSession(
      getClient,
      sseTry === 0 ? null : sessionId,
      sseTry === 0 ? '' : accumulated,
      sseTry === 0,
      opts,
    );

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    console.log(`[xingjing-diag] callAgentWithClient Layer1 result: status=${r.status}, error=${r.error ?? 'none'}, accLen=${accumulated.length}, sid=${sessionId}`);

    if (r.status === 'done') {
      console.log(`[xingjing-diag] callAgentWithClient Layer1 DONE, calling onDone with accLen=${accumulated.length}`);
      opts.onDone?.(accumulated);
      return;
    }
    if (r.status === 'hard-error' && !r.error?.includes('无法创建')) break;
    if (!sessionId) break;
  }

  // ── Layer 2: 全新调用（新 session + 重发 prompt）──
  for (let callTry = 0; callTry <= RETRY_DELAYS.length; callTry++) {
    if (callTry > 0) await sleep(RETRY_DELAYS[callTry - 1]);

    console.log(`[xingjing-diag] callAgentWithClient Layer2 try=${callTry}`);
    const r = await runAgentSession(getClient, null, '', true, opts);

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    console.log(`[xingjing-diag] callAgentWithClient Layer2 result: status=${r.status}, error=${r.error ?? 'none'}, accLen=${accumulated.length}, sid=${sessionId}`);

    if (r.status === 'done') {
      console.log(`[xingjing-diag] callAgentWithClient Layer2 DONE, calling onDone with accLen=${accumulated.length}`);
      opts.onDone?.(accumulated);
      return;
    }

    if (callTry === RETRY_DELAYS.length) {
      console.error(`[xingjing-diag] callAgentWithClient all retries exhausted, calling onError`);
      opts.onError?.(r.error ?? '重试耗尽（外部 client）');
      return;
    }
  }

  console.error(`[xingjing-diag] callAgentWithClient fell through, calling onError`);
  opts.onError?.('重试耗尽（外部 client）');
}
/**
 * 调用 AI Agent：创建会话 → 发送提示词 → 流式接收结果 → 完成回调
 *
 * 采用 SDK 的 client.event.subscribe() 替代原生 EventSource，
 * 确保在 Tauri/WKWebView 环境下正确使用 tauriFetch。
 * 支持两层静默重试：Layer 1 复用 sessionId 重连 SSE，Layer 2 全新调用。
 */
export async function callAgent(opts: CallAgentOptions): Promise<void> {
  await refreshBaseUrl();

  const getClient = () => getXingjingClient();
  let sessionId: string | null = null;
  let accumulated = '';

  // ── Layer 1: SSE 重连（复用 sessionId，不重发 prompt）──
  for (let sseTry = 0; sseTry <= RETRY_DELAYS.length; sseTry++) {
    if (sseTry > 0) await sleep(RETRY_DELAYS[sseTry - 1]);

    console.log(`[xingjing-diag] callAgent Layer1 try=${sseTry}, sessionId=${sessionId}, accLen=${accumulated.length}`);
    const r = await runAgentSession(
      getClient,
      sseTry === 0 ? null : sessionId,
      sseTry === 0 ? '' : accumulated,
      sseTry === 0,
      opts,
    );

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    console.log(`[xingjing-diag] callAgent Layer1 result: status=${r.status}, error=${r.error ?? 'none'}, accLen=${accumulated.length}, sid=${sessionId}`);

    if (r.status === 'done') {
      console.log(`[xingjing-diag] callAgent Layer1 DONE, calling onDone with accLen=${accumulated.length}`);
      opts.onDone?.(accumulated);
      return;
    }
    // 服务端硬错误（session.error）：不做 Layer 1 重试，直接进 Layer 2
    if (r.status === 'hard-error' && !r.error?.includes('无法创建')) {
      break;
    }

    // session 创建失败：无法 Layer 1 重连，直接进 Layer 2
    if (!sessionId) break;
  }

  // ── Layer 2: 全新调用（新 session + 重发 prompt）──
  for (let callTry = 0; callTry <= RETRY_DELAYS.length; callTry++) {
    if (callTry > 0) await sleep(RETRY_DELAYS[callTry - 1]);

    console.log(`[xingjing-diag] callAgent Layer2 try=${callTry}`);
    const r = await runAgentSession(
      getClient,
      null,
      '',
      true,
      opts,
    );

    accumulated = r.accumulated;
    sessionId = r.sessionId;
    console.log(`[xingjing-diag] callAgent Layer2 result: status=${r.status}, error=${r.error ?? 'none'}, accLen=${accumulated.length}, sid=${sessionId}`);

    if (r.status === 'done') {
      console.log(`[xingjing-diag] callAgent Layer2 DONE, calling onDone with accLen=${accumulated.length}`);
      opts.onDone?.(accumulated);
      return;
    }

    if (callTry === RETRY_DELAYS.length) {
      const errMsg = r.error ?? '重试耗尽，请检查网络连接或 OpenCode 服务状态';
      console.error(`[xingjing-diag] callAgent all retries exhausted, calling onError: ${errMsg}`);
      opts.onError?.(errMsg);
      return;
    }
  }

  console.error(`[xingjing-diag] callAgent fell through, calling onError`);
  opts.onError?.('重试耗尽，请检查网络连接或 OpenCode 服务状态');
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
 * 在指定工作目录初始化 Git 仓库
 */
export async function gitInit(
  workDir: string,
): Promise<{ ok: boolean; output: string }> {
  return execViaAgent('git init', workDir);
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

/**
 * 克隆远程 Git 仓库
 * @param url 远程仓库 URL
 * @param workDir 目标目录
 */
export async function gitClone(
  url: string,
  workDir: string,
): Promise<{ ok: boolean; output: string }> {
  return execViaAgent(`git clone ${url} .`, workDir);
}
