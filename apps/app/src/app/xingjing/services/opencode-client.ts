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

// ─── Client 单例 ────────────────────────────────────────────────────────────

let _client: ReturnType<typeof createClient> | null = null;
let _baseUrl = 'http://127.0.0.1:4096';
let _directory = '';

export function initXingjingClient(baseUrl: string, directory: string) {
  _baseUrl = baseUrl;
  _directory = directory;
  _client = createClient(baseUrl, directory);
}

export function getXingjingClient() {
  if (!_client) {
    _client = createClient(_baseUrl, _directory);
  }
  return _client;
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
 * 调用 AI Agent：创建会话 → 发送提示词 → 流式接收结果 → 完成回调
 *
 * 若 OpenCode 不可用，会自动降级并通过 onError 通知。
 */
export async function callAgent(opts: CallAgentOptions): Promise<void> {
  const sessionId = await sessionCreate({
    title: opts.title ?? `xingjing-${Date.now()}`,
    directory: opts.directory,
  });

  if (!sessionId) {
    opts.onError?.('无法创建 AI 会话，请检查 OpenCode 服务是否启动（端口 4096）');
    return;
  }

  let accumulated = '';
  let done = false;

  // 订阅 SSE 事件流
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource(`${_baseUrl}/event`);
  } catch {
    opts.onError?.('无法连接 SSE 事件流');
    return;
  }

  const cleanup = () => {
    if (!done) {
      done = true;
      try { eventSource?.close(); } catch { /* ignore */ }
    }
  };

  eventSource.onmessage = (e: MessageEvent) => {
    if (done) return;
    try {
      const data = JSON.parse(e.data as string) as Record<string, unknown>;
      // 过滤当前 session 的事件
      if (String(data.sessionID ?? '') !== sessionId) return;

      if (data.type === 'message.part') {
        // 流式文本片段
        const part = data.part as Record<string, unknown> | undefined;
        if (part?.type === 'text') {
          const text = String(part.text ?? part.content ?? '');
          accumulated += text;
          opts.onText?.(accumulated);
        }
      } else if (data.type === 'session.completed') {
        cleanup();
        opts.onDone?.(accumulated);
      } else if (data.type === 'session.error') {
        cleanup();
        opts.onError?.(String(data.message ?? '未知错误'));
      }
    } catch { /* ignore parse error */ }
  };

  eventSource.onerror = () => {
    if (!done) {
      cleanup();
      // 若没有累积到内容，则报错；否则视为完成
      if (accumulated) {
        opts.onDone?.(accumulated);
      } else {
        opts.onError?.('SSE 连接中断');
      }
    }
  };

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
