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
  opts?: { directory?: string; model?: { providerID: string; modelID: string } },
): Promise<boolean> {
  const client = getXingjingClient();
  try {
    // Use the extended promptAsync from opencode.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.session as any).promptAsync({
      sessionID: sessionId,
      directory: opts?.directory ?? (_directory || undefined),
      ...(opts?.model ? { model: opts.model } : {}),
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
  /** 流式文本回调（每次收到新文本片段时触发，参数为累积全文） */
  onText?: (accumulatedText: string) => void;
  /** 完成回调 */
  onDone?: (fullText: string) => void;
  /** 错误回调 */
  onError?: (errMsg: string) => void;
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

  let sessionId: string | null = null;
  try {
    const result = await client.session.create({
      body: { ...(opts.title ? { title: opts.title } : {}) },
      ...(opts.directory ? { directory: opts.directory } : {}),
    } as Parameters<typeof client.session.create>[0]);
    sessionId = (result.data as { id: string } | undefined)?.id ?? null;
  } catch { /* fall through */ }

  if (!sessionId) {
    opts.onError?.('无法创建 AI 会话（外部 client）');
    return;
  }

  let accumulated = '';
  let done = false;
  const controller = new AbortController();
  // 跟踪本会话关联的 messageID，用于过滤 message.part.delta 事件
  const sessionMsgIds = new Set<string>();

  const cleanup = () => {
    if (!done) {
      done = true;
      controller.abort();
    }
  };

  // 启动事件流监听（fire-and-forget，回调式通知结果）
  // 传入 opts.directory 作为订阅目录，确保收到该 Session 所属目录的事件
  void (async () => {
    try {
      const sub = await client.event.subscribe(
        opts.directory ? { directory: opts.directory } : undefined,
        { signal: controller.signal },
      );
      for await (const raw of sub.stream as AsyncIterable<unknown>) {
        if (done) break;
        const evt = normalizeRawEvent(raw);
        if (!evt) continue;
        const p = evt.props;

        // ── 新格式: message.part.updated ──
        if (evt.type === 'message.part.updated') {
          const part = p.part as Record<string, unknown> | undefined;
          if (!part || String(part.sessionID ?? '') !== sessionId) continue;
          if (part.messageID) sessionMsgIds.add(String(part.messageID));
          if (part.type === 'text') {
            const fullText = String(part.text ?? '');
            if (fullText.length >= accumulated.length) {
              accumulated = fullText;
              opts.onText?.(accumulated);
            } else if (typeof p.delta === 'string' && p.delta) {
              accumulated += p.delta;
              opts.onText?.(accumulated);
            }
          }
          continue;
        }

        // ── 新格式: message.part.delta ──
        if (evt.type === 'message.part.delta') {
          const msgId = typeof p.messageID === 'string' ? p.messageID : null;
          if (msgId && sessionMsgIds.has(msgId)) {
            const delta = typeof p.delta === 'string' ? p.delta : '';
            const field = typeof p.field === 'string' ? p.field : '';
            if (delta && field === 'text') {
              accumulated += delta;
              opts.onText?.(accumulated);
            }
          }
          continue;
        }

        // ── 旧格式: message.part ──
        if (evt.type === 'message.part') {
          if (String(p.sessionID ?? '') !== sessionId) continue;
          const part = p.part as Record<string, unknown> | undefined;
          if (part?.type === 'text') {
            const text = String(part.text ?? part.content ?? '');
            accumulated += text;
            opts.onText?.(accumulated);
          }
          continue;
        }

        // ── 错误: session.error ──
        if (evt.type === 'session.error') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid && sid !== sessionId) continue;
          cleanup();
          const errObj = p.error as Record<string, unknown> | undefined;
          const errMsg = errObj
            ? String(errObj.message ?? errObj.name ?? '未知错误')
            : String(p.message ?? '未知错误');
          opts.onError?.(errMsg);
          return;
        }

        // ── 完成: session.completed (旧) ──
        if (evt.type === 'session.completed') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid && sid !== sessionId) continue;
          cleanup();
          opts.onDone?.(accumulated);
          return;
        }

        // ── 完成: session.idle (新) ──
        if (evt.type === 'session.idle') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid !== sessionId) continue;
          cleanup();
          opts.onDone?.(accumulated);
          return;
        }

        // ── 完成: session.status + idle (新) ──
        if (evt.type === 'session.status') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid !== sessionId) continue;
          // p.status 是 SessionStatus 对象 { type: 'idle' | 'busy' | 'retry' }，不是字符串
          const statusObj = p.status;
          const statusType = typeof statusObj === 'object' && statusObj !== null
            ? String((statusObj as Record<string, unknown>).type ?? '')
            : String(statusObj ?? '');
          if (statusType === 'idle' || statusType === 'completed') {
            cleanup();
            opts.onDone?.(accumulated);
            return;
          }
        }
      }

      // 事件流结束但未收到完成信号
      if (!done) {
        cleanup();
        if (accumulated) opts.onDone?.(accumulated);
        else opts.onError?.('SSE 事件流意外结束（外部 client）');
      }
    } catch (e) {
      if (done) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('abort')) return;
      cleanup();
      if (accumulated) opts.onDone?.(accumulated);
      else opts.onError?.(`SSE 连接失败: ${msg}`);
    }
  })();

  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}`
    : opts.userPrompt;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.session as any).promptAsync({
      sessionID: sessionId,
      directory: opts.directory ?? (_directory || undefined),
      ...(opts.model ? { model: opts.model } : {}),
      parts: [{ type: 'text', text: fullPrompt }],
    });
  } catch {
    cleanup();
    opts.onError?.('发送提示词失败（外部 client）');
  }
}

/**
 * 调用 AI Agent：创建会话 → 发送提示词 → 流式接收结果 → 完成回调
 *
 * 采用 SDK 的 client.event.subscribe() 替代原生 EventSource，
 * 确保在 Tauri/WKWebView 环境下正确使用 tauriFetch。
 */
export async function callAgent(opts: CallAgentOptions): Promise<void> {
  await refreshBaseUrl();

  const client = getXingjingClient();
  let sessionId: string | null = null;
  try {
    const result = await client.session.create({
      body: {
        ...(opts.title ? { title: opts.title } : { title: `xingjing-${Date.now()}` }),
      },
      ...(opts.directory ?? _directory ? { directory: opts.directory ?? _directory } : {}),
    } as Parameters<typeof client.session.create>[0]);
    sessionId = (result.data as { id: string } | undefined)?.id ?? null;
  } catch { /* fall through */ }

  if (!sessionId) {
    opts.onError?.('无法创建 AI 会话，请检查 OpenCode 服务是否启动');
    return;
  }

  let accumulated = '';
  let done = false;
  const controller = new AbortController();
  const sessionMsgIds = new Set<string>();

  const cleanup = () => {
    if (!done) {
      done = true;
      controller.abort();
    }
  };

  // 启动事件流监听
  // 传入 opts.directory 作为订阅目录，确保收到该 Session 所属目录的事件
  void (async () => {
    try {
      const eventDir = opts.directory ?? (_directory || undefined);
      const sub = await client.event.subscribe(
        eventDir ? { directory: eventDir } : undefined,
        { signal: controller.signal },
      );
      for await (const raw of sub.stream as AsyncIterable<unknown>) {
        if (done) break;
        const evt = normalizeRawEvent(raw);
        if (!evt) continue;
        const p = evt.props;

        if (evt.type === 'message.part.updated') {
          const part = p.part as Record<string, unknown> | undefined;
          if (!part || String(part.sessionID ?? '') !== sessionId) continue;
          if (part.messageID) sessionMsgIds.add(String(part.messageID));
          if (part.type === 'text') {
            const fullText = String(part.text ?? '');
            if (fullText.length >= accumulated.length) {
              accumulated = fullText;
              opts.onText?.(accumulated);
            } else if (typeof p.delta === 'string' && p.delta) {
              accumulated += p.delta;
              opts.onText?.(accumulated);
            }
          }
          continue;
        }

        if (evt.type === 'message.part.delta') {
          const msgId = typeof p.messageID === 'string' ? p.messageID : null;
          if (msgId && sessionMsgIds.has(msgId)) {
            const delta = typeof p.delta === 'string' ? p.delta : '';
            const field = typeof p.field === 'string' ? p.field : '';
            if (delta && field === 'text') {
              accumulated += delta;
              opts.onText?.(accumulated);
            }
          }
          continue;
        }

        if (evt.type === 'message.part') {
          if (String(p.sessionID ?? '') !== sessionId) continue;
          const part = p.part as Record<string, unknown> | undefined;
          if (part?.type === 'text') {
            const text = String(part.text ?? part.content ?? '');
            accumulated += text;
            opts.onText?.(accumulated);
          }
          continue;
        }

        if (evt.type === 'session.error') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid && sid !== sessionId) continue;
          cleanup();
          const errObj = p.error as Record<string, unknown> | undefined;
          const errMsg = errObj
            ? String(errObj.message ?? errObj.name ?? '未知错误')
            : String(p.message ?? '未知错误');
          opts.onError?.(errMsg);
          return;
        }

        if (evt.type === 'session.completed') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid && sid !== sessionId) continue;
          cleanup();
          opts.onDone?.(accumulated);
          return;
        }

        if (evt.type === 'session.idle') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid !== sessionId) continue;
          cleanup();
          opts.onDone?.(accumulated);
          return;
        }

        if (evt.type === 'session.status') {
          const sid = typeof p.sessionID === 'string' ? p.sessionID : null;
          if (sid !== sessionId) continue;
          // p.status 是 SessionStatus 对象 { type: 'idle' | 'busy' | 'retry' }，不是字符串
          const statusObj = p.status;
          const statusType = typeof statusObj === 'object' && statusObj !== null
            ? String((statusObj as Record<string, unknown>).type ?? '')
            : String(statusObj ?? '');
          if (statusType === 'idle' || statusType === 'completed') {
            cleanup();
            opts.onDone?.(accumulated);
            return;
          }
        }
      }

      if (!done) {
        cleanup();
        if (accumulated) opts.onDone?.(accumulated);
        else opts.onError?.('SSE 事件流意外结束');
      }
    } catch (e) {
      if (done) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('abort')) return;
      cleanup();
      if (accumulated) opts.onDone?.(accumulated);
      else opts.onError?.(`SSE 连接失败: ${msg}`);
    }
  })();

  // 发送提示词
  const fullPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n---\n\n${opts.userPrompt}`
    : opts.userPrompt;

  const ok = await sessionPrompt(sessionId, fullPrompt, {
    directory: opts.directory,
    model: opts.model,
  });
  if (!ok) {
    cleanup();
    opts.onError?.('发送提示词失败，请检查 OpenCode 连接');
  }
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
  maxTokens?: number;
  temperature?: number;
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

  // 构建消息列表
  const systemContent = opts.systemPrompt ?? '';
  const userContent = opts.userPrompt;
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
      max_tokens: llmConfig.maxTokens ?? 4096,
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
      max_tokens: llmConfig.maxTokens ?? 4096,
      temperature: llmConfig.temperature ?? 0.7,
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
