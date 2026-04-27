/**
 * 星静 OpenCode 客户端封装
 *
 * 复用 OpenWork 主应用已有的 @opencode-ai/sdk 连接，
 * 为星静各功能模块提供统一的 AI 能力。
 *
 * HeyAPI SDK 参数传递约定：query/path 参数均展平到顶层 options 对象，
 * 例如：client.file.list({ path: '/foo', directory: '/bar' })
 */

import { createClient } from '../../lib/opencode';
import { isTauriRuntime } from '../../utils';
import type { ComposerAttachment, MessageWithParts } from '../../types';


// ─── Client 管理（OpenWork 注入）────────────────────────────────────────────

let _sharedClient: ReturnType<typeof createClient> | null = null;
let _directory = '';

/**
 * 由 app-store 在初始化后注入 shared client。
 *
 * 幂等：相同引用直接跳过，避免上游 createEffect 多次触发时日志/副作用反复执行。
 * 返回值表示 client 引用是否真的发生了变化。
 */
export function setSharedClient(client: ReturnType<typeof createClient> | null): boolean {
  if (_sharedClient === client) return false;
  _sharedClient = client;
  return true;
}

/** 断线重试退避时间（ms）：1s / 2s / 5s */
const RETRY_DELAYS = [1000, 2000, 5000] as const;

/** 异步等待指定毫秒 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 设置当前工作目录（产品切换时调用）。
 */
export function setWorkingDirectory(directory: string): void {
  _directory = directory;
}

/**
 * 获取 OpenCode Client。
 * 返回 OpenWork 注入的 shared client，未注入时抛异常。
 */
export function getXingjingClient(): ReturnType<typeof createClient> {
  if (!_sharedClient) {
    throw new Error('[xingjing] OpenWork Client 未注入，无法使用 AI 能力');
  }
  return _sharedClient;
}

/**
 * 检查 client 是否已就绪（用于 UI 条件渲染）
 */
export function isClientReady(): boolean {
  return _sharedClient !== null;
}


// ─── 文件操作已迁移到 file-ops.ts ──────────────────────────────────────────────
// 文件操作（fileList/fileRead/fileWrite/fileDelete）已由 file-ops.ts + xingjing-bridge.ts 替代。
// discoverAllSkills 等函数仍需文件操作，从 file-ops.ts 导入。
import { fileList, fileRead } from './file-ops';

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
  try {
    const client = getXingjingClient();
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

// setProviderAuth 已删除 —— Provider 认证统一通过 OpenWork 原生 submitProviderApiKey 完成。
// 参见 providers/store.ts L382-406（auth.set + refreshProviders({ dispose: true })）。

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


// ─── 附件工具函数（对齐 OpenWork actions-store.ts fileToDataUrl）────────────────

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read attachment: ${file.name}`));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });

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
  /** Skill 上下文（由 injectSkillContext 获取后注入，Markdown 格式）*/
  skillContext?: string;
  /** 工具权限请求回调（用户决定是否授权）。
   *  不提供时沿用自动拒绝兜底行为。
   *  提供时将在 store 轮询中检测 pending permissions 并触发回调。*/
  onPermissionAsked?: (params: {
    permissionId: string;
    sessionId: string;
    tool?: string;
    description?: string;
    input?: string;
    resolve: (action: 'once' | 'always' | 'reject') => void;
  }) => void;
  /**
   * OpenWork 全局 SSE 维护的 session 状态映射（必需）。
   * 用于完成检测：监听 status[sessionId] 变为 'idle'，零网络请求。
   */
  owSessionStatusById?: () => Record<string, string>;
  /**
   * 从 OpenWork 全局 store 获取指定 session 的消息列表（必需）。
   * 替代独立 SSE 事件流，由 OpenWork 全局 SSE 维护。
   */
  owMessagesBySessionId?: (sid: string | null) => MessageWithParts[];
  /**
   * 确保指定 session 的消息已加载到 OpenWork 全局 store。
   * 幂等调用，未加载时发起 HTTP 加载。
   */
  owEnsureSessionLoaded?: (sid: string) => Promise<void>;
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
  /** 附件列表（图片/PDF，对齐 OpenWork ComposerAttachment 类型） */
  attachments?: ComposerAttachment[];
}

/**
 * 将 SDK event.subscribe() 返回的原始事件解析为 { type, props } 格式。
 * 兼容两种包装：直接 { type, properties } 或嵌套 { payload: { type, properties } }.
 * @deprecated 仅 Team Edition 的 message-accumulator.ts 使用，Solo 已切换为 store 轮询。
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
 * 从 OpenWork store 的 MessageWithParts[] 中提取全部 AI 文本内容。
 * 跳过 role='user' 的消息，将所有 assistant text parts 拼接。
 */
function extractTextFromStoreMessages(messages: MessageWithParts[]): string {
  const textParts: string[] = [];
  for (const msg of messages) {
    const info = msg.info as Record<string, unknown>;
    if (info.role === 'user') continue;
    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (p.type === 'text' && typeof p.text === 'string') {
        textParts.push(p.text as string);
      }
    }
  }
  return textParts.join('');
}

/**
 * 从 OpenWork store 的 MessageWithParts[] 中提取工具调用/结果事件。
 * 返回当前所有 tool-use 和 tool-result parts 的 ID 集合，
 * 供调用方对比上一次轮询结果以触发增量回调。
 */
function extractToolPartsFromMessages(messages: MessageWithParts[]): Array<{
  partId: string;
  type: 'tool-use' | 'tool-result';
  name: string;
  input?: Record<string, unknown>;
  resultText?: string;
}> {
  const results: Array<{
    partId: string;
    type: 'tool-use' | 'tool-result';
    name: string;
    input?: Record<string, unknown>;
    resultText?: string;
  }> = [];
  for (const msg of messages) {
    const info = msg.info as Record<string, unknown>;
    if (info.role === 'user') continue;
    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      const partId = String(p.id ?? '');
      if (!partId) continue;
      if (p.type === 'tool-use' || p.type === 'tool_use') {
        const name = String(p.name ?? p.tool ?? '');
        let input: Record<string, unknown> = {};
        const inputRaw = p.input ?? p.arguments ?? p.parameters;
        if (typeof inputRaw === 'object' && inputRaw !== null) {
          input = inputRaw as Record<string, unknown>;
        } else if (typeof inputRaw === 'string') {
          try { input = JSON.parse(inputRaw) as Record<string, unknown>; } catch { /* partial */ }
        }
        results.push({ partId, type: 'tool-use', name, input });
      } else if (p.type === 'tool-result' || p.type === 'tool_result') {
        const name = String(p.name ?? p.tool ?? '');
        const content = p.content;
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
        results.push({ partId, type: 'tool-result', name, resultText });
      }
    }
  }
  return results;
}

/**
 * 执行一次 Agent 会话初始化：创建 session → 发送 prompt → 立即返回。
 *
 * 对齐 OpenWork 原生方案（actions-store.ts createReadySession + sendPrompt）：
 * - session.create 传 directory（对齐 OpenWork L342-344）
 * - promptAsync 不传 directory（对齐 OpenWork L533-540，directory 已在创建时设置）
 * - 完成检测由调用方通过 SolidJS reactive effect 监听 sessionStatusById 实现
 * - 不再自建 polling 机制
 *
 * @param getClient   返回 OpenCode client 的工厂函数
 * @param sessionId   已有 session ID（多轮对话复用）；为 null 时新建 session
 * @param sendPrompt  是否发送 prompt
 * @param opts        原始 CallAgentOptions
 * @returns
 *   - { status: 'prompt-sent', sessionId }              — prompt 已发送，等待 UI reactive 完成检测
 *   - { status: 'hard-error', sessionId, error }         — 不可重试错误
 */
async function runAgentSession(
  getClient: () => ReturnType<typeof createClient>,
  sessionId: string | null,
  sendPrompt: boolean,
  opts: CallAgentOptions,
): Promise<{
  status: 'prompt-sent' | 'hard-error';
  sessionId: string | null;
  error?: string;
}> {
  const client = getClient();
  let sid = sessionId;

  // 新建 session（首次调用或重试时）
  if (!sid) {

    // ▸ 连接状态前置探测（对齐 OpenWork 原生 session/actions-store.ts 模式）
    let pingOk = false;
    try {
      await Promise.race([
        client.global.health(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('health timeout')), 3000)),
      ]);
      pingOk = true;
      console.log('[xingjing-diag] session.create 前置探测：OpenCode 可达');
    } catch (healthErr) {
      console.warn('[xingjing] session.create 前置探测：OpenCode 不可达', healthErr);
    }

    if (!pingOk) {
      console.warn('[xingjing] OpenCode 不可达，跳过 session.create，由重试层处理恢复');
      return { status: 'hard-error' as const, sessionId: null, error: 'OpenCode 服务不可达，正在重试...' };
    }

    let lastErrName: string | undefined;
        let lastErrConfigPath = '';
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
      // 完整记录原始响应，便于诊断
      console.log('[xingjing-diag] session.create raw response', {
        hasData: !!result.data,
        dataKeys: result.data ? Object.keys(result.data as Record<string, unknown>) : [],
        hasError: !!result.error,
        errorFull: result.error,
        responseStatus: result.response?.status,
        responseUrl: result.response?.url,
      });
      sid = (result.data as { id: string } | undefined)?.id ?? null;
      if (sid) {
        console.log('[xingjing-diag] session.create 成功', { sessionId: sid });
      }
      if (!sid) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = result.error as any;
        const errName = err?.name;
        lastErrName = errName;
        lastErrConfigPath = err?.data?.path ?? '';
        // 单独打印 error.data.issues（ConfigInvalidError 的核心诊断信息）
        console.error('[xingjing] session.create 失败', {
          name: errName,
          message: err?.message,
          configPath: err?.data?.path,
          issues: err?.data?.issues,
        });
        // 完整错误对象（区分网络错误与 API 错误）
        console.error('[xingjing] session.create error.data:', err?.data === undefined ? '– undefined' : JSON.stringify(err?.data, null, 2));
        // 网络层错误诊断：当 name/message 均 undefined 时，说明非 API 响应，可能是端口不匹配或连接被拒
        if (!errName && !err?.message) {
          console.error('[xingjing] session.create 疑似网络错误（非 API 响应），error 原始值:', String(err), '| typeof:', typeof err);
          console.error('[xingjing] response.url:', (result as any)?.response?.url, '| response.status:', (result as any)?.response?.status);
        }
      }
    } catch (e) {
      console.error('[xingjing] session.create threw:', e);
      /* fall through */
    }

    if (!sid) {
      let msg: string;
      if (lastErrName === 'ConfigInvalidError') {
        // 区分 agent 配置错误与模型配置错误，给出更准确的提示
        const configPath = lastErrConfigPath;
        msg = configPath.includes('/agents/')
          ? 'Agent 配置无效，正在自动修复…请重试'
          : '大模型未配置，请在设置页配置 API Key 后重试';
      } else {
        msg = '无法创建 AI 会话，请检查 OpenCode 服务是否已启动';
      }
      return { status: 'hard-error', sessionId: null, error: msg };
    }
  }

  const finalSid = sid;

  // ── 触发 onSessionCreated（在 promptAsync 启动前）──
  opts.onSessionCreated?.(finalSid);

  // ── 确保 OpenWork 全局 store 加载该 session 的消息 ──
  if (opts.owEnsureSessionLoaded) {
    try {
      await opts.owEnsureSessionLoaded(finalSid);
    } catch { /* 非致命，store 可能稍后同步 */ }
  }

  // 让出一个微任务 tick，使 SolidJS 响应式系统处理 store 更新
  await Promise.resolve();

  // ── 发送 prompt（首次调用或重试时）──
  if (sendPrompt) {
    // 1) 构建 system 上下文（通过 promptAsync 的 system 参数独立注入）
    //    agentId 已指定时，基础 systemPrompt 由 OpenCode 从 .md 原生加载，不重复注入
    const systemParts: string[] = [];
    if (opts.systemPrompt && !opts.agentId) {
      systemParts.push(opts.systemPrompt);
    }
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'long', hour12: false,
    });
    systemParts.push(`## 当前系统时间\n${timeStr}`);
    if (opts.knowledgeContext) systemParts.push(`## 相关知识上下文\n${opts.knowledgeContext}`);
    if (opts.recallContext) systemParts.push(`## 相关历史上下文\n${opts.recallContext}`);
    if (opts.skillContext) systemParts.push(opts.skillContext);
    const systemStr = systemParts.length > 0 ? systemParts.join('\n\n---\n\n') : undefined;

    // 2) user prompt 只包含纯用户输入
    try {
      console.log('[xingjing-diag] promptAsync 发送', { sessionId: finalSid, hasModel: !!opts.model, modelID: opts.model?.modelID, attachmentCount: opts.attachments?.length ?? 0, hasSystem: !!systemStr });
      const parts: Array<{ type: string; [key: string]: unknown }> = [
        { type: 'text', text: opts.userPrompt },
      ];
      if (opts.attachments?.length) {
        for (const att of opts.attachments) {
          parts.push({
            type: 'file',
            url: await fileToDataUrl(att.file),
            filename: att.name,
            mime: att.mimeType,
          });
        }
      }
      // 3) 通过 system 参数注入系统上下文，对齐 OpenWork 原生模式
      //    [ALIGN] agent 参数 per-prompt 透传，与 OpenWork 原生 `session.promptAsync({ ..., agent })` 对齐，
      //    确保复用 existingSessionId 的多轮对话中仍能按当前 agentId 路由
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client.session as any).promptAsync({
        sessionID: finalSid,
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.agentId ? { agent: opts.agentId } : {}),
        ...(systemStr ? { system: systemStr } : {}),
        parts,
      });
      console.log('[xingjing-diag] promptAsync 已发送', { sessionId: finalSid, hasSystem: !!systemStr, agent: opts.agentId });
    } catch {
      return { status: 'hard-error', sessionId: finalSid, error: '发送提示词失败' };
    }
  }

  // 对齐 OpenWork 原生方案：prompt 发送后立即返回。
  // 完成检测由调用方通过 SolidJS reactive effect 监听 sessionStatusById[sid] 实现，
  // 与 OpenWork 自身的 session UI 一致（SSE → store → reactive read）。
  console.log(`[xingjing-diag] prompt sent, returning prompt-sent, sid=${finalSid}`);
  return { status: 'prompt-sent', sessionId: finalSid };
}

/**
 * Agent 会话执行核心：创建 session + 发送 prompt + 返回。
 *
 * 对齐 OpenWork 原生方案：
 * - session.create({ directory }) — 在创建时设置工作目录
 * - promptAsync({ sessionID, model, parts }) — 不再传 directory
 * - 完成检测由 UI 层 SolidJS reactive effect 通过 sessionStatusById 驱动
 * - 不再自建 polling 或 SSE 完成检测
 * - 不自动删除 session（多轮对话需保留 session）
 */
async function executeAgentWithRetry(
  getClient: () => ReturnType<typeof createClient>,
  opts: CallAgentOptions,
): Promise<void> {
  let sessionId: string | null = opts.existingSessionId ?? null;

  // ── 重试：创建 session + 发送 prompt ──
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);

    console.log(`[xingjing-diag] executeAgent attempt=${attempt}, sessionId=${sessionId}`);
    const r = await runAgentSession(
      getClient,
      attempt === 0 ? (opts.existingSessionId ?? null) : sessionId,
      attempt === 0,
      opts,
    );

    sessionId = r.sessionId;

    if (r.status === 'prompt-sent') {
      // Prompt 已发送成功。完成检测由 UI reactive effect 管理。
      // 不在此处调用 onDone —— 调用方（autopilot）通过 sessionStatusById 检测完成。
      console.log(`[xingjing-diag] prompt-sent, session=${sessionId}, returning`);
      return;
    }

    // hard-error 且非服务不可达：不重试
    if (r.status === 'hard-error' && !r.error?.includes('不可达')) {
      opts.onError?.(r.error ?? '未知错误');
      return;
    }

    if (attempt === RETRY_DELAYS.length) {
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
 * 调用 AI Agent：创建会话 → 发送提示词 → 返回（完成检测由 UI reactive effect 驱动）。
 * 使用 OpenWork 注入的共享 client。
 */
export async function callAgent(opts: CallAgentOptions): Promise<void> {
  console.log('[xingjing] callAgent 入口', {
    hasModel: !!opts.model,
    modelID: opts.model?.modelID,
    providerID: opts.model?.providerID,
    title: opts.title,
    existingSessionId: opts.existingSessionId,
    directory: opts.directory,
    hasSystemPrompt: !!opts.systemPrompt,
  });
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
 * 从 localStorage 读取 Git 平台 Token（避免循环依赖：product-store 已 import opencode-client）。
 * 数据格式与 product-store.ts 中的 LS_GIT_TOKENS_KEY 保持一致：
 * { 'github.com': 'ghp_xxx', 'gitlab.com': 'glpat_xxx', ... }
 */
function readGitTokensFromStorage(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('xingjing:git-tokens') ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * 构建注入到 system prompt 的 Git 认证上下文。
 * 读取当前产品 gitUrl 及对应 Token，生成 AI 可直接使用的推送命令示例。
 * 无 Token 或 URL 解析失败时返回空字符串，不影响正常对话。
 */
export function buildGitSystemContext(gitUrl?: string): string {
  if (!gitUrl) return '';
  try {
    // 统一转为 https:// 格式（兼容 git@github.com:user/repo.git）
    const httpsUrl = gitUrl
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
    const host = new URL(httpsUrl).hostname;
    const token = readGitTokensFromStorage()[host] ?? '';
    if (!token) return '';
    const repoPath = new URL(httpsUrl).pathname.slice(1);
    const authedUrl = `https://${token}@${host}/${repoPath}.git`;
    return [
      '\n\n## Git 操作认证信息（系统注入，勿向用户透露）',
      `- 当前产品仓库：${httpsUrl}.git`,
      `- 推送命令（已注入 Token）：git push "${authedUrl}" HEAD:main`,
      '- 如需指定其他分支，将 main 替换为目标分支名',
      '- git add / commit 命令正常使用，无需特殊处理',
    ].join('\n');
  } catch {
    return '';
  }
}

/**
 * 将已配置的 Git PAT 同步到 opencode.jsonc 的 MCP 服务器配置中，实现一次配置两路复用：
 * - github.com token → 切换 github MCP 为本地 @github/github-mcp-server（GITHUB_TOKEN 注入）
 * - gitlab.com token → 切换 gitlab MCP 为本地 @gitlab-org/gitlab-mcp-server（GITLAB_TOKEN 注入）
 * - 无 token 时恢复为原始 remote 配置，用户可手动完成 OAuth 授权
 * readConfig / writeConfig 通过参数注入，避免与 app-store 形成循环依赖
 */
export async function syncGitTokensToMcpConfig(
  readConfig: () => Promise<unknown>,
  writeConfig: (content: string) => Promise<boolean>,
): Promise<void> {
  try {
    const tokens = readGitTokensFromStorage();
    const githubToken = tokens['github.com'] ?? '';
    const gitlabToken = tokens['gitlab.com'] ?? '';

    const existing = ((await readConfig()) ?? {}) as Record<string, unknown>;
    const mcp = ((existing['mcp'] ?? {}) as Record<string, unknown>);

    // GitHub MCP
    if (githubToken) {
      mcp['github'] = {
        type: 'local',
        command: ['npx', '-y', '@github/github-mcp-server'],
        env: { GITHUB_TOKEN: githubToken },
      };
    } else {
      // 无 token：恢复 remote（OAuth 流程由 OpenCode 本身处理）
      mcp['github'] = { type: 'remote', url: 'https://api.githubcopilot.com/mcp/' };
    }

    // GitLab MCP
    if (gitlabToken) {
      mcp['gitlab'] = {
        type: 'local',
        command: ['npx', '-y', '@gitlab-org/gitlab-mcp-server'],
        env: { GITLAB_TOKEN: gitlabToken },
      };
    } else {
      mcp['gitlab'] = { type: 'remote', url: 'https://gitlab.com/api/v4/mcp' };
    }

    existing['mcp'] = mcp;
    await writeConfig(JSON.stringify(existing, null, 2));
    console.log('[xingjing-git] syncGitTokensToMcpConfig 完成', {
      hasGithub: !!githubToken,
      hasGitlab: !!gitlabToken,
    });
  } catch (e) {
    console.warn('[xingjing-git] syncGitTokensToMcpConfig 失败', e);
  }
}

/** gitSync 的可选参数：显式指定推送目标，避免依赖 git remote 配置 */
export interface GitSyncOptions {
  /** 远程仓库 URL（如 https://github.com/user/repo），指定后直接推送到该地址 */
  repoUrl?: string;
  /** 认证 Token（嵌入到 push URL 中，优先级高于全局 localStorage 存储的 token） */
  token?: string;
  /** 目标分支（默认 main）*/
  branch?: string;
}

/**
 * 通过 Tauri Shell 直接调用 git 命令（不经过 AI 会话）
 * 使用 `git -C cwd` 替代 SpawnOptions.cwd，更可靠。
 */
async function runGit(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    // 使用 git -C <path> 设置工作目录，比 SpawnOptions.cwd 更可靠
    const output = await Command.create('git', ['-C', cwd, ...args]).execute();
    return {
      code: output.code ?? -1,
      stdout: output.stdout?.trim() ?? '',
      stderr: output.stderr?.trim() ?? '',
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[xingjing-git] runGit 异常', { args, cwd, msg });
    return { code: -1, stdout: '', stderr: msg };
  }
}

/**
 * 同步 Git 仓库（初始化检查 + 远端关联 + add + commit + push）。
 *
 * 使用 Tauri Shell 直接执行 git 命令，不再经过 AI 会话（避免权限被拒、超时等潜在问题）。
 * 自动处理以下场景：
 *   1. 本地目录未初始化 git → 自动 git init
 *   2. 未配置 git user 信息 → 使用默认占位符
 *   3. 远端 origin 未关联或地址不匹配 → 自动 add/set-url
 *   4. 没有可提交内容 → 跳过 commit，依然尝试 push
 */
export async function gitSync(
  workDir: string,
  message = 'xingjing sync',
  options?: GitSyncOptions,
): Promise<{ ok: boolean; output: string }> {
  const log: string[] = [];

  console.log('[xingjing-git] gitSync 入口 (Tauri Shell)', {
    workDir,
    repoUrl: options?.repoUrl,
    branch: options?.branch,
    hasToken: !!(options?.token),
    tokenLen: options?.token?.length ?? 0,
  });

  try {
    // 明文远端 URL（不含 Token，用于 git remote 配置）
    const plainRemoteUrl = options?.repoUrl
      ? options.repoUrl.replace(/\.git$/, '') + '.git'
      : '';

    // 步骤 1：确保是 git 仓库（用 git rev-parse --git-dir 检测，不依赖 fs.exists）
    const revParseR = await runGit(['rev-parse', '--git-dir'], workDir);
    console.log('[xingjing-git] 步骤 1 rev-parse', { code: revParseR.code, stdout: revParseR.stdout, stderr: revParseR.stderr });
    if (revParseR.code !== 0) {
      // 不是 git 仓库，初始化
      const initR = await runGit(['init'], workDir);
      log.push(`git init: code=${initR.code} ${initR.stdout || initR.stderr}`.trimEnd());
      console.log('[xingjing-git] git init', { code: initR.code });
      if (initR.code !== 0) return { ok: false, output: log.join('\n') };
    } else {
      log.push('[ok] git repo already initialized');
    }

    // 步骤 2：确保 git user 已配置
    const emailR = await runGit(['config', 'user.email'], workDir);
    console.log('[xingjing-git] 步骤 2 user.email', { code: emailR.code, val: emailR.stdout });
    if (!emailR.stdout) {
      await runGit(['config', '--local', 'user.email', 'xingjing-sync@local'], workDir);
      await runGit(['config', '--local', 'user.name', 'Xingjing Sync'], workDir);
      log.push('[set] git user.email = xingjing-sync@local');
    }

    // 步骤 3：确保 remote origin 已关联到正确地址
    if (plainRemoteUrl) {
      const remoteR = await runGit(['remote', 'get-url', 'origin'], workDir);
      console.log('[xingjing-git] 步骤 3 remote get-url', { code: remoteR.code, url: remoteR.stdout });
      if (remoteR.code !== 0) {
        const addR = await runGit(['remote', 'add', 'origin', plainRemoteUrl], workDir);
        log.push(`git remote add origin: code=${addR.code}`);
      } else if (remoteR.stdout !== plainRemoteUrl) {
        const setR = await runGit(['remote', 'set-url', 'origin', plainRemoteUrl], workDir);
        log.push(`git remote set-url: code=${setR.code} (was: ${remoteR.stdout})`);
      } else {
        log.push('[skip] remote origin already correct');
      }
    }

    // 步骤 4： git add -A
    const addR = await runGit(['add', '-A'], workDir);
    log.push(`git add -A: code=${addR.code} ${addR.stderr || ''}`.trimEnd());
    console.log('[xingjing-git] 步骤 4 git add', { code: addR.code, stderr: addR.stderr });
    if (addR.code !== 0) return { ok: false, output: log.join('\n') };

    // 步骤 5：检查是否有内容可提交
    const diffR = await runGit(['diff', '--staged', '--quiet'], workDir);
    console.log('[xingjing-git] 步骤 5 diff staged', { code: diffR.code });
    if (diffR.code !== 0) {
      const commitR = await runGit(['commit', '-m', message || 'xingjing sync'], workDir);
      log.push(`git commit: code=${commitR.code} ${commitR.stdout || commitR.stderr}`.trimEnd());
      console.log('[xingjing-git] git commit', { code: commitR.code });
      if (commitR.code !== 0) return { ok: false, output: log.join('\n') };
    } else {
      log.push('[skip] nothing to commit');
    }

    // 步骤 6： git push
    const branch = options?.branch || 'main';
    let pushArgs: string[];
    if (options?.repoUrl && options.token) {
      const base = options.repoUrl.replace(/\.git$/, '');
      const authedUrl = base.replace(/^https:\/\//, `https://${options.token}@`) + '.git';
      pushArgs = ['push', authedUrl, `HEAD:${branch}`];
      console.log('[xingjing-git] 步骤 6 push', { maskedUrl: authedUrl.replace(options.token, '****'), branch });
    } else {
      pushArgs = ['push', '--set-upstream', 'origin', branch];
      console.log('[xingjing-git] 步骤 6 push via origin', { branch });
    }

    const pushR = await runGit(pushArgs, workDir);
    const pushOut = [pushR.stdout, pushR.stderr].filter(Boolean).join(' | ');
    log.push(`git push: code=${pushR.code} ${pushOut}`.trimEnd());
    console.log('[xingjing-git] push 结果', { code: pushR.code, out: pushOut });

    if (pushR.code !== 0) return { ok: false, output: log.join('\n') };
    return { ok: true, output: log.join('\n') };

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[xingjing-git] gitSync 异常', { msg, log });
    return { ok: false, output: [...log, `异常: ${msg}`].join('\n') };
  }
}
