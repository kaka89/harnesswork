/**
 * XingjingBridge — 星静与 OpenWork 的全能力桥接层
 *
 * 替代原 opencode-client.ts 中的 Client 管理逻辑，
 * 作为星静与 OpenWork 之间的唯一集成点。
 *
 * 设计原则：
 * - 零 Client 创建：所有能力均由 OpenWork 注入，不创建任何 OpenCode Client
 * - 纯薄代理：不包含降级/重试/健康检查逻辑
 * - 响应式就绪信号：通过 isReady() 判断 OpenWork 是否已注入
 * - 产品工作目录默认 always-allow：消除频繁权限弹窗
 */

import { createSignal } from 'solid-js';
import type { createClient } from '../../lib/opencode';
import type { MessageWithParts } from '../../types';
import type {
  OpenworkSkillItem,
  OpenworkSkillContent,
  OpenworkCommandItem,
  OpenworkAuditEntry,
} from '../../lib/openwork-server';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** OpenWork 注入的文件操作能力 */
export interface BridgeFileOps {
  read: (wsId: string, path: string) => Promise<{ content: string } | null>;
  write: (wsId: string, payload: { path: string; content: string; force?: boolean }) => Promise<boolean>;
  list?: (absPath: string) => Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }> | null>;
}

/** OpenWork 注入的会话能力 */
export interface BridgeSessionApi {
  /** 从 OpenWork 全局 store 获取 session 状态映射 */
  statusById: () => Record<string, string>;
  /** 从全局 store 获取指定 session 的消息列表 */
  messagesBySessionId: (sessionId: string | null) => MessageWithParts[];
  /** 确保 session 消息已加载到全局 store */
  ensureSessionLoaded: (sessionId: string) => Promise<void>;
  /** 删除 session */
  deleteSession: (workspaceId: string, sessionId: string) => Promise<boolean>;
}

/** OpenWork 注入的扩展能力（六大原语） */
export interface BridgeExtensionsApi {
  /** Skills */
  listSkills: (wsId: string) => Promise<OpenworkSkillItem[]>;
  getSkill: (wsId: string, name: string) => Promise<OpenworkSkillContent | null>;
  upsertSkill: (wsId: string, name: string, content: string, description?: string) => Promise<boolean>;
  deleteSkill?: (wsId: string, name: string) => Promise<boolean>;
  /** Hub Skills */
  listHubSkills?: () => Promise<Array<{ name: string; description: string }>>;
  installHubSkill?: (wsId: string, name: string) => Promise<boolean>;
  /** MCP */
  listMcp: (wsId: string) => Promise<Array<{ name: string; config: Record<string, unknown> }>>;
  addMcp?: (wsId: string, payload: { name: string; config: Record<string, unknown> }) => Promise<boolean>;
  removeMcp?: (wsId: string, name: string) => Promise<boolean>;
  logoutMcpAuth?: (wsId: string, name: string) => Promise<boolean>;
  /** Commands */
  listCommands: (wsId: string) => Promise<OpenworkCommandItem[]>;
  /** Audit */
  listAudit: (wsId: string, limit?: number) => Promise<OpenworkAuditEntry[]>;
  /** OpenCode Config */
  readOpencodeConfig: (wsId: string) => Promise<unknown>;
  writeOpencodeConfig: (wsId: string, content: string) => Promise<boolean>;
}

/** OpenWork 注入的消息通道能力 */
export interface BridgeMessagingApi {
  // Slack/Telegram identities routing — 通过 navigateTo('identities') 管理
  // 此接口为未来直接 API 调用预留
}

/** OpenWork 注入的文件浏览/搜索能力 */
export interface BridgeFileBrowserApi {
  /** 列出目录内容（绝对路径） */
  listDir: (absPath: string) => Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }> | null>;
  // 以下 find API 将在 Task 8 中扩展
  // findText?: (wsId: string, query: string) => Promise<unknown>;
  // findFiles?: (wsId: string, pattern: string) => Promise<unknown>;
  // findSymbols?: (wsId: string, query: string) => Promise<unknown>;
}

/** OpenWork 注入的权限管理能力 */
export interface BridgePermissionsApi {
  /** 将指定目录设为 always-allow（产品工作目录初始化时调用） */
  autoAuthorize: (dir: string) => Promise<void>;
}

/** OpenWork 注入的 Workspace 能力 */
export interface BridgeWorkspaceApi {
  resolveByDir: (productDir: string) => Promise<string | null>;
  createByDir: (productDir: string, productName: string) => Promise<string | null>;
}

/** OpenWork 注入的 Provider/Model 能力 */
export interface BridgeModelApi {
  /** OpenWork 当前选中的模型 */
  selectedModel: () => { providerID: string; modelID: string } | null;
  /** 已连接的 Provider ID 列表 */
  providerConnectedIds: () => string[];
  /** 可用的模型选项 */
  modelOptions: () => Array<{ providerID: string; modelID: string; name: string }>;
  /** 提交 Provider API Key */
  submitProviderApiKey: (providerID: string, apiKey: string) => Promise<string>;
}

/** OpenWork 注入的定时任务能力 */
export interface BridgeSchedulerApi {
  listJobs: (wsId: string) => Promise<unknown[]>;
  deleteJob: (wsId: string, name: string) => Promise<void>;
}

/** OpenWork 注入的 Engine 管理能力 */
export interface BridgeEngineApi {
  reload: (wsId: string) => Promise<boolean>;
}

/** 导航目标 — OpenWork 原生页面或设置页签 */
export type NavigationTarget =
  | 'settings/model'
  | 'settings/appearance'
  | 'plugins'
  | 'mcp'
  | 'skills'
  | 'automations'
  | 'identities'
  | 'extensions'
  | { session: string }  // goToSession(id)
  | { settings: string }; // goToSettings(tab)

/** Bridge 配置 — 由 AppStoreProvider 初始化时传入 */
export interface BridgeConfig {
  client: () => ReturnType<typeof createClient> | null;
  fileOps: BridgeFileOps | null;
  workspaceId: () => string | null;
  session?: Partial<BridgeSessionApi>;
  extensions: BridgeExtensionsApi;
  model?: Partial<BridgeModelApi>;
  fileBrowser?: Partial<BridgeFileBrowserApi>;
  scheduler?: Partial<BridgeSchedulerApi>;
  engine?: Partial<BridgeEngineApi>;
  workspace: BridgeWorkspaceApi;
  serverStatus: () => 'connected' | 'disconnected' | 'limited';
  /** 导航回调 — 跳转到 OpenWork 原生页面 */
  navigateTo?: (target: NavigationTarget) => void;
}

// ─── Bridge 单例 ─────────────────────────────────────────────────────────────

let _bridge: BridgeConfig | null = null;
const [_ready, _setReady] = createSignal(false);

/**
 * 初始化 Bridge（由 AppStoreProvider 在 OpenWork 上下文就绪后调用）
 *
 * 幂等：上游 createEffect 在 OpenWork 状态/重连过程中可能多次触发，
 * 仅在「从未就绪 → 就绪」的边沿打印日志，避免日志反复刷屏。
 */
export function initBridge(config: BridgeConfig): void {
  const wasReady = _bridge !== null;
  _bridge = config;
  _setReady(true);
  if (!wasReady) {
    console.log('[xingjing-bridge] Bridge 已初始化');
  }
}

/**
 * 销毁 Bridge（应用卸载时调用）
 *
 * 幂等：仅在「就绪 → 未就绪」的边沿打印日志。
 */
export function destroyBridge(): void {
  if (_bridge === null) return;
  _bridge = null;
  _setReady(false);
  console.log('[xingjing-bridge] Bridge 已销毁');
}

/**
 * Bridge 是否就绪（OpenWork 已注入且 Client 可用）
 */
export function isReady(): boolean {
  return _ready() && _bridge !== null && _bridge.client() !== null;
}

/**
 * OpenWork 连接状态
 */
export function serverStatus(): 'connected' | 'disconnected' | 'limited' {
  return _bridge?.serverStatus() ?? 'disconnected';
}

// ─── Client API ──────────────────────────────────────────────────────────────

/**
 * 获取 OpenWork 注入的 OpenCode Client
 * 不创建任何本地 Client，如果未注入则返回 null
 */
export function getClient(): ReturnType<typeof createClient> | null {
  return _bridge?.client() ?? null;
}

/**
 * 获取当前 workspace ID
 */
export function getWorkspaceId(): string | null {
  return _bridge?.workspaceId() ?? null;
}

// ─── File Operations API ─────────────────────────────────────────────────────

/**
 * 读取文件内容
 * 委托给 OpenWork 注入的 fileOps
 */
export async function fileRead(path: string): Promise<string | null> {
  const wsId = _bridge?.workspaceId();
  if (!_bridge?.fileOps || !wsId) {
    console.warn('[xingjing-bridge] fileRead: Bridge 未就绪或 workspace 未解析');
    return null;
  }
  try {
    const result = await _bridge.fileOps.read(wsId, path);
    return result?.content ?? null;
  } catch (e) {
    console.warn('[xingjing-bridge] fileRead 失败:', path, (e as Error)?.message);
    return null;
  }
}

/**
 * 写入文件内容
 */
export async function fileWrite(path: string, content: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!_bridge?.fileOps || !wsId) {
    console.warn('[xingjing-bridge] fileWrite: Bridge 未就绪或 workspace 未解析');
    return false;
  }
  try {
    return await _bridge.fileOps.write(wsId, { path, content, force: true });
  } catch (e) {
    console.warn('[xingjing-bridge] fileWrite 失败:', path, (e as Error)?.message);
    return false;
  }
}

/**
 * 列出目录内容
 */
export async function fileList(absPath: string): Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }>> {
  if (!_bridge?.fileOps?.list) {
    console.warn('[xingjing-bridge] fileList: listDir 能力未注入');
    return [];
  }
  try {
    const result = await _bridge.fileOps.list(absPath);
    return result ?? [];
  } catch (e) {
    console.warn('[xingjing-bridge] fileList 失败:', absPath, (e as Error)?.message);
    return [];
  }
}

// ─── Session API ─────────────────────────────────────────────────────────────

/**
 * 获取 session 状态映射（响应式）
 */
export function sessionStatusById(): Record<string, string> {
  return _bridge?.session?.statusById?.() ?? {};
}

/**
 * 获取指定 session 的消息列表（响应式）
 */
export function messagesBySessionId(sessionId: string | null): MessageWithParts[] {
  return _bridge?.session?.messagesBySessionId?.(sessionId) ?? [];
}

/**
 * 确保 session 消息已加载
 */
export async function ensureSessionLoaded(sessionId: string): Promise<void> {
  return _bridge?.session?.ensureSessionLoaded?.(sessionId);
}

/**
 * 创建 AI 会话（通过 OpenWork Client）
 */
export async function sessionCreate(opts?: {
  title?: string;
  parentId?: string;
  directory?: string;
}): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const result = await client.session.create({
      ...(opts?.parentId ? { parentID: opts.parentId } : {}),
      ...(opts?.title ? { title: opts.title } : {}),
      ...(opts?.directory ? { directory: opts.directory } : {}),
    } as Parameters<typeof client.session.create>[0]);
    if (result.data) return (result.data as { id: string }).id;
    return null;
  } catch {
    return null;
  }
}

/**
 * 向 AI 会话发送指令
 */
export async function sessionPrompt(
  sessionId: string,
  content: string,
  opts?: { directory?: string; model?: { providerID: string; modelID: string }; disableTools?: boolean },
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.session as any).promptAsync({
      sessionID: sessionId,
      directory: opts?.directory ?? undefined,
      ...(opts?.model ? { model: opts.model } : {}),
      ...(opts?.disableTools ? { tools: {} } : {}),
      parts: [{ type: 'text', text: content }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除 AI 会话
 */
export async function sessionDelete(sessionId: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.session?.deleteSession) return false;
  return _bridge.session.deleteSession(wsId, sessionId);
}

// ─── Extensions API (六大原语) ───────────────────────────────────────────────

/** Skills */
export async function listSkills(): Promise<OpenworkSkillItem[]> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return [];
  return _bridge.extensions.listSkills(wsId);
}

export async function getSkill(name: string): Promise<OpenworkSkillContent | null> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return null;
  return _bridge.extensions.getSkill(wsId, name);
}

export async function upsertSkill(name: string, content: string, description?: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return false;
  return _bridge.extensions.upsertSkill(wsId, name, content, description);
}

export async function deleteSkill(name: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions?.deleteSkill) return false;
  return _bridge.extensions.deleteSkill(wsId, name);
}

/** Hub Skills */
export async function listHubSkills(): Promise<Array<{ name: string; description: string }>> {
  if (!_bridge?.extensions?.listHubSkills) return [];
  return _bridge.extensions.listHubSkills();
}

export async function installHubSkill(name: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions?.installHubSkill) return false;
  return _bridge.extensions.installHubSkill(wsId, name);
}

/** MCP */
export async function listMcp(): Promise<Array<{ name: string; config: Record<string, unknown> }>> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return [];
  return _bridge.extensions.listMcp(wsId);
}

export async function addMcp(payload: { name: string; config: Record<string, unknown> }): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions?.addMcp) return false;
  return _bridge.extensions.addMcp(wsId, payload);
}

export async function removeMcp(name: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions?.removeMcp) return false;
  return _bridge.extensions.removeMcp(wsId, name);
}

export async function logoutMcpAuth(name: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions?.logoutMcpAuth) return false;
  return _bridge.extensions.logoutMcpAuth(wsId, name);
}

/** Commands */
export async function listCommands(): Promise<OpenworkCommandItem[]> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return [];
  return _bridge.extensions.listCommands(wsId);
}

/** Audit */
export async function listAudit(limit?: number): Promise<OpenworkAuditEntry[]> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return [];
  return _bridge.extensions.listAudit(wsId, limit);
}

/** OpenCode Config */
export async function readOpencodeConfig(): Promise<unknown> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return null;
  const raw = await _bridge.extensions.readOpencodeConfig(wsId);
  // 提取 content 字段并解析为 JSON
  if (raw && typeof raw === 'object' && 'content' in raw) {
    const content = (raw as { content: string | null }).content;
    if (content && typeof content === 'string') {
      try { return JSON.parse(content); } catch { return null; }
    }
    return null;
  }
  return raw;
}

export async function writeOpencodeConfig(content: string): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.extensions) return false;
  return _bridge.extensions.writeOpencodeConfig(wsId, content);
}

// ─── Model API ───────────────────────────────────────────────────────────────

/**
 * 获取 OpenWork 当前选中的模型
 */
export function selectedModel(): { providerID: string; modelID: string } | null {
  return _bridge?.model?.selectedModel?.() ?? null;
}

/**
 * 获取已连接的 Provider ID 列表
 */
export function providerConnectedIds(): string[] {
  return _bridge?.model?.providerConnectedIds?.() ?? [];
}

/**
 * 获取可用的模型选项
 */
export function modelOptions(): Array<{ providerID: string; modelID: string; name: string }> {
  return _bridge?.model?.modelOptions?.() ?? [];
}

/**
 * 提交 Provider API Key
 */
export async function submitProviderApiKey(providerID: string, apiKey: string): Promise<string> {
  if (!_bridge?.model?.submitProviderApiKey) return '';
  return _bridge.model.submitProviderApiKey(providerID, apiKey);
}

// ─── Workspace API ───────────────────────────────────────────────────────────

export async function resolveWorkspaceByDir(productDir: string): Promise<string | null> {
  return _bridge?.workspace?.resolveByDir(productDir) ?? null;
}

export async function createWorkspaceByDir(productDir: string, productName: string): Promise<string | null> {
  return _bridge?.workspace?.createByDir(productDir, productName) ?? null;
}

// ─── Scheduler API ───────────────────────────────────────────────────────────

export async function listScheduledJobs(): Promise<unknown[]> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.scheduler?.listJobs) return [];
  return _bridge.scheduler.listJobs(wsId);
}

export async function deleteScheduledJob(name: string): Promise<void> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.scheduler?.deleteJob) return;
  return _bridge.scheduler.deleteJob(wsId, name);
}

// ─── Engine API ──────────────────────────────────────────────────────────────

export async function reloadEngine(): Promise<boolean> {
  const wsId = _bridge?.workspaceId();
  if (!wsId || !_bridge?.engine?.reload) return false;
  return _bridge.engine.reload(wsId);
}

// ─── Navigation API ──────────────────────────────────────────────────────────

/**
 * 导航到 OpenWork 原生页面
 * 用于设置页面中跳转到 OpenWork 的 Plugins、MCP、Skills 等页面
 */
export function navigateTo(target: NavigationTarget): void {
  _bridge?.navigateTo?.(target);
}

// ─── File Browser / Search API ───────────────────────────────────────────────

/**
 * 列出目录内容（绝对路径）— 文件浏览器专用
 */
export async function browseDir(absPath: string): Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; ext?: string }>> {
  if (!_bridge?.fileBrowser?.listDir) {
    // 降级到 fileOps.list
    return fileList(absPath);
  }
  try {
    const result = await _bridge.fileBrowser.listDir(absPath);
    return result ?? [];
  } catch {
    return [];
  }
}

// ─── Permissions API (always-allow) ──────────────────────────────────────────

/**
 * 将产品工作目录设为 always-allow 权限
 * 在产品初始化和 Bridge 初始化时自动调用
 */
export async function autoAuthorizeWorkDir(dir: string): Promise<void> {
  if (!dir) return;
  // 通过 OpenWork Client 的 permission API 设置 always-allow
  const client = getClient();
  if (!client) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const permApi = (client as any).permission;
    if (permApi?.reply) {
      await permApi.reply({ reply: 'always', path: dir });
      console.log('[xingjing-bridge] 产品工作目录已设为 always-allow:', dir);
    }
  } catch (e) {
    console.warn('[xingjing-bridge] autoAuthorize 失败:', (e as Error)?.message);
  }
}
