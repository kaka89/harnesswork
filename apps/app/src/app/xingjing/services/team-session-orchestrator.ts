/**
 * Team Session Orchestrator
 *
 * 核心编排器：为 Orchestrator 和每个 Agent 创建真实 OpenWork Session，
 * 通过 createMessageAccumulator 订阅每个 Session 的 SSE 流，
 * 对外暴露响应式的 TeamRunState。
 */

import { createSignal, createEffect, Accessor, batch } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { Client, MessageWithParts, PendingPermission, PendingQuestion, ModelRef } from '../../types';
import type { Session } from '@opencode-ai/sdk/v2/client';
import { createMessageAccumulator, type MessageAccumulator } from './message-accumulator';
import { parseDispatchPlan, type DispatchItem, type AutopilotAgent, type AgentExecutionStatus } from './autopilot-executor';
import type { SkillApiAdapter } from './knowledge-behavior';

export interface AgentSessionSlot {
  agentId: string;
  sessionId: string;
  status: () => AgentExecutionStatus;
  /** OpenWork Session 对象（从 store 读取） */
  session: () => Session | null;
  /** 该 Session 的所有消息（live，响应式） */
  messages: () => MessageWithParts[];
  /** 该 Session 当前是否有待处理的权限请求 */
  pendingPermission: () => PendingPermission | null;
  /** 该 Session 当前是否有待处理的提问 */
  pendingQuestion: () => PendingQuestion | null;
  /** 该 Session 是否正在 streaming */
  isStreaming: () => boolean;
  /** 内部累积器（用于清理） */
  _accumulator: MessageAccumulator;
}

export interface TeamRunState {
  orchestratorSessionId: string | null;
  agentSlots: Map<string, AgentSessionSlot>;
  activeTabId: string; // 'orchestrator' | agentId
  isRunning: boolean;
  dispatchPlan: DispatchItem[] | null;
}

export interface TeamSessionOrchestrator {
  state: Accessor<TeamRunState>;

  /** 发起一次团队执行（Orchestrator → 并行 Agents） */
  run(goal: string): Promise<void>;

  /** 在指定 Agent 的 Session 中追加消息（多轮对话） */
  sendTo(agentId: string, message: string): Promise<void>;

  /** 直接派发给特定 Agent（@mention bypass） */
  runDirect(agentId: string, task: string): Promise<void>;

  /** 取消当前运行 */
  abort(): void;

  /** 重置全部运行状态（新建会话时使用） */
  resetState(): void;

  /** 切换活动 tab */
  setActiveTab(tabId: string): void;

  /** 获取当前活动的 Agent Session Slot */
  getActiveSlot(): AgentSessionSlot | null;

  /** 回复某个 Agent Session 的权限申请 */
  replyPermission(agentId: string, permissionId: string, action: 'once' | 'always' | 'reject'): void;

  /** 回复某个 Agent Session 的提问 */
  replyQuestion(agentId: string, requestId: string, answers: string[][]): void;

  /** 跨 Session 查询（支持嵌套 task 线程） */
  getSessionById(id: string | null): Session | null;
  getMessagesBySessionId(id: string | null): MessageWithParts[];
  ensureSessionLoaded(id: string): Promise<void>;
  sessionLoadingById(id: string | null): boolean;
}

export interface TeamSessionOrchestratorOptions {
  client: () => ReturnType<typeof import('../../lib/opencode').createClient> | null;
  workspaceId: () => string | null;
  workDir: () => string;
  availableAgents: AutopilotAgent[];
  model: () => ModelRef | null;
  skillApi: SkillApiAdapter | null;
  onArtifactExtracted?: (artifact: {
    agentId: string;
    sessionId: string;
    title: string;
    content: string;
  }) => void;
  /**
   * 每当 orchestrator 内部成功创建任何 session 后立即回调。
   * 外部可在此时机写 sidecar mode，无需等待 run 完成。
   * 支持返回 Promise，orchestrator 会 await 它，确保 sidecar 落盘后再继续。
   * @param sessionId 新创建的 session ID
   * @param role 'orchestrator' | 'agent'
   */
  onSessionCreated?: (sessionId: string, role: 'orchestrator' | 'agent') => void | Promise<void>;
  /** session.create 前确保 API Key 已同步到 OpenCode */
  ensureAuth?: () => Promise<void>;
}

export function createTeamSessionOrchestrator(opts: TeamSessionOrchestratorOptions): TeamSessionOrchestrator {
  const [state, setState] = createStore<TeamRunState>({
    orchestratorSessionId: null,
    agentSlots: new Map(),
    activeTabId: 'orchestrator',
    isRunning: false,
    dispatchPlan: null,
  });

  // 存储每个 Session 的权限和提问状态
  const [pendingPermissionsBySession, setPendingPermissionsBySession] = createSignal<
    Record<string, PendingPermission | null>
  >({});
  const [pendingQuestionsBySession, setPendingQuestionsBySession] = createSignal<
    Record<string, PendingQuestion | null>
  >({});

  // Session 缓存（用于跨 Session 查询）
  const [sessionCache, setSessionCache] = createSignal<Record<string, Session>>({});
  const [sessionLoadingSet, setSessionLoadingSet] = createSignal<Set<string>>(new Set());

  let orchestratorAccumulator: MessageAccumulator | null = null;

  /**
   * 创建 Orchestrator Session 并订阅
   */
  async function createOrchestratorSession(goal: string): Promise<string | null> {
    const client = opts.client();
    const workspaceId = opts.workspaceId();
    if (!client || !workspaceId) return null;

    try {
      // ▸ 确保 API Key 已同步到 OpenCode（防止 ConfigInvalidError）
      if (opts.ensureAuth) {
        try { await opts.ensureAuth(); } catch { /* silent */ }
      }

      const result = await client.session.create({
        body: {
          title: `xingjing-orchestrator-${Date.now()}`,
          agent: 'orchestrator',
        },
        directory: opts.workDir(),
      } as Parameters<typeof client.session.create>[0]);

      if (!result.data) return null;
      const session = result.data;

      // 创建消息累积器
      orchestratorAccumulator = createMessageAccumulator({
        client: opts.client,
        sessionId: () => session.id,
        directory: () => opts.workDir() || undefined,
        onPermissionAsked: (p) => {
          setPendingPermissionsBySession((prev) => ({ ...prev, [session.id]: p }));
        },
        onQuestionAsked: (q) => {
          setPendingQuestionsBySession((prev) => ({ ...prev, [session.id]: q }));
        },
      });

      // 发送 prompt
      await (client.session as any).promptAsync({
        sessionID: session.id,
        directory: opts.workDir(),
        parts: [{ type: 'text', text: goal }],
      });

      setState('orchestratorSessionId', session.id);
      setSessionCache((prev) => ({ ...prev, [session.id]: session }));

      // 立即通知外部：session 已创建，可写 sidecar（await 确保落盘完成）
      await opts.onSessionCreated?.(session.id, 'orchestrator');

      return session.id;
    } catch (err) {
      console.error('[team-orchestrator] Failed to create orchestrator session:', err);
      return null;
    }
  }

  /**
   * 为指定 Agent 创建 Session 并订阅
   */
  async function createAgentSession(
    agentId: string,
    task: string,
    agentDef: AutopilotAgent,
  ): Promise<AgentSessionSlot | null> {
    const client = opts.client();
    const workspaceId = opts.workspaceId();
    if (!client || !workspaceId) return null;

    try {
      // ▸ 确保 API Key 已同步到 OpenCode（防止 ConfigInvalidError）
      if (opts.ensureAuth) {
        try { await opts.ensureAuth(); } catch { /* silent */ }
      }

      const result = await client.session.create({
        body: {
          title: `xingjing-${agentId}-${Date.now()}`,
          agent: agentDef.id,
        },
        directory: opts.workDir(),
      } as Parameters<typeof client.session.create>[0]);

      if (!result.data) return null;
      const session = result.data;

      // 立即通知外部：agent session 已创建，可写 sidecar（await 确保落盘完成）
      await opts.onSessionCreated?.(session.id, 'agent');

      const [status, setStatus] = createSignal<AgentExecutionStatus>('pending');

      const accumulator = createMessageAccumulator({
        client: opts.client,
        sessionId: () => session.id,
        directory: () => opts.workDir() || undefined,
        onPermissionAsked: (p) => {
          setPendingPermissionsBySession((prev) => ({ ...prev, [session.id]: p }));
        },
        onQuestionAsked: (q) => {
          setPendingQuestionsBySession((prev) => ({ ...prev, [session.id]: q }));
        },
      });

      // 监听 streaming 状态变化
      createEffect(() => {
        if (accumulator.isStreaming()) {
          setStatus('working');
        } else {
          const msgs = accumulator.messages();
          if (msgs.length > 0) {
            setStatus('done');
          }
        }
      });

      // 监听消息变化，提取产出物
      createEffect(() => {
        const messages = accumulator.messages();
        if (messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.info.role !== 'assistant') return;

        // 提取文本内容
        const textParts = lastMsg.parts.filter((p) => p.type === 'text');
        const fullText = textParts.map((p) => (p as { text?: string }).text ?? '').join('');

        // 解析产出物标记
        const artifactRegex = new RegExp('###\\s*产出物[：:]\\s*(.+?)\\n([\\s\\S]*?)(?=\\n##|\\n---|\\n###|$)');
        const artifactMatch = fullText.match(artifactRegex);
        if (artifactMatch) {
          const title = artifactMatch[1].trim();
          const content = artifactMatch[2].trim();
          if (content.length >= 50 && opts.onArtifactExtracted) {
            opts.onArtifactExtracted({
              agentId,
              sessionId: session.id,
              title,
              content,
            });
          }
        }
      });

      const slot: AgentSessionSlot = {
        agentId,
        sessionId: session.id,
        status: () => status(),
        session: () => sessionCache()[session.id] ?? null,
        messages: accumulator.messages,
        pendingPermission: () => pendingPermissionsBySession()[session.id] ?? null,
        pendingQuestion: () => pendingQuestionsBySession()[session.id] ?? null,
        isStreaming: accumulator.isStreaming,
        _accumulator: accumulator,
      };

      setSessionCache((prev) => ({ ...prev, [session.id]: session }));

      // 发送任务
      await (client.session as any).promptAsync({
        sessionID: session.id,
        directory: opts.workDir(),
        parts: [{ type: 'text', text: task }],
      });

      setStatus('thinking');

      return slot;
    } catch (err) {
      console.error(`[team-orchestrator] Failed to create agent session for ${agentId}:`, err);
      return null;
    }
  }

  /**
   * 发起一次团队执行
   */
  async function run(goal: string): Promise<void> {
    setState('isRunning', true);
    setState('dispatchPlan', null);

    // 清理旧的 slots
    const oldSlots = state.agentSlots;
    oldSlots.forEach((slot) => slot._accumulator.cleanup());
    setState('agentSlots', new Map());

    // Phase 1: 创建 Orchestrator Session
    const orchestratorSessionId = await createOrchestratorSession(goal);
    if (!orchestratorSessionId) {
      setState('isRunning', false);
      return;
    }

    // 等待 Orchestrator 输出完成并解析 dispatch plan
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!orchestratorAccumulator) return;
        if (orchestratorAccumulator.isStreaming()) return;

        clearInterval(checkInterval);

        const messages = orchestratorAccumulator.messages();
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) {
          resolve();
          return;
        }

        // 提取文本内容
        const textParts = lastMsg.parts.filter((p) => p.type === 'text');
        const fullText = textParts.map((p) => (p as { text?: string }).text ?? '').join('');

        const plan = parseDispatchPlan(fullText);
        setState('dispatchPlan', plan);

        if (plan.length === 0) {
          setState('isRunning', false);
          resolve();
          return;
        }

        // Phase 2: 并发创建各 Agent Session
        Promise.all(
          plan.map(async ({ agentId, task }) => {
            const agentDef = opts.availableAgents.find((a) => a.id === agentId);
            if (!agentDef) return null;
            return createAgentSession(agentId, task, agentDef);
          }),
        ).then((slots) => {
          const newSlots = new Map<string, AgentSessionSlot>();
          slots.forEach((slot) => {
            if (slot) newSlots.set(slot.agentId, slot);
          });
          setState('agentSlots', newSlots);
          // 自动切换到第一个 Agent Tab，避免停留在 orchestrator 占位页
          if (newSlots.size > 0) {
            const firstAgentId = newSlots.keys().next().value;
            if (firstAgentId) setState('activeTabId', firstAgentId);
          }
          setState('isRunning', false);
          resolve();
        });
      }, 200);
    });
  }

  /**
   * 在指定 Agent 的 Session 中追加消息
   */
  async function sendTo(agentId: string, message: string): Promise<void> {
    const slot = state.agentSlots.get(agentId);
    if (!slot) return;

    const client = opts.client();
    if (!client) return;

    await (client.session as any).promptAsync({
      sessionID: slot.sessionId,
      directory: opts.workDir(),
      parts: [{ type: 'text', text: message }],
    });
  }

  /**
   * 直接派发给特定 Agent（@mention bypass）
   */
  async function runDirect(agentId: string, task: string): Promise<void> {
    const agentDef = opts.availableAgents.find((a) => a.id === agentId);
    if (!agentDef) return;

    setState('isRunning', true);

    const slot = await createAgentSession(agentId, task, agentDef);
    if (slot) {
      setState(
        produce((s) => {
          s.agentSlots.set(agentId, slot);
        }),
      );
      setState('activeTabId', agentId);
    }

    setState('isRunning', false);
  }

  /**
   * 取消当前运行：abort 所有活跃 Session 并清理 accumulator
   */
  function abort(): void {
    const client = opts.client();
    if (client) {
      // 取消 orchestrator session
      if (state.orchestratorSessionId) {
        (client.session as any).abort({ sessionID: state.orchestratorSessionId }).catch(() => {});
      }
      // 取消所有 agent sessions
      state.agentSlots.forEach((slot) => {
        (client.session as any).abort({ sessionID: slot.sessionId }).catch(() => {});
        slot._accumulator.cleanup();
      });
    }
    if (orchestratorAccumulator) {
      orchestratorAccumulator.cleanup();
    }
    setState('isRunning', false);
  }

  /**
   * 切换活动 tab
   */
  function setActiveTab(tabId: string): void {
    setState('activeTabId', tabId);
  }

  /**
   * 回复权限申请
   */
  function replyPermission(agentId: string, permissionId: string, action: 'once' | 'always' | 'reject'): void {
    const slot = state.agentSlots.get(agentId);
    if (!slot) return;

    const client = opts.client();
    if (!client) return;

    client.permission.reply({
      requestID: permissionId,
      reply: action,
    });

    setPendingPermissionsBySession((prev) => ({ ...prev, [slot.sessionId]: null }));
  }

  /**
   * 回复提问
   */
  function replyQuestion(agentId: string, requestId: string, answers: string[][]): void {
    const slot = state.agentSlots.get(agentId);
    if (!slot) return;

    const client = opts.client();
    if (!client) return;

    client.question.reply({
      requestID: requestId,
      answers,
    });

    setPendingQuestionsBySession((prev) => ({ ...prev, [slot.sessionId]: null }));
  }

  /**
   * 跨 Session 查询
   */
  function getSessionById(id: string | null): Session | null {
    if (!id) return null;
    return sessionCache()[id] ?? null;
  }

  function getMessagesBySessionId(id: string | null): MessageWithParts[] {
    if (!id) return [];

    // 检查 orchestrator
    if (state.orchestratorSessionId === id && orchestratorAccumulator) {
      return orchestratorAccumulator.messages();
    }

    // 检查各 agent slots
    for (const [, slot] of state.agentSlots) {
      if (slot.sessionId === id) {
        return slot.messages();
      }
    }

    return [];
  }

  async function ensureSessionLoaded(id: string): Promise<void> {
    if (sessionCache()[id]) return;
    if (sessionLoadingSet().has(id)) return;

    setSessionLoadingSet((prev) => new Set(prev).add(id));

    const client = opts.client();
    if (!client) return;

    try {
      const result = await client.session.get({ sessionID: id });
      if (result.data) {
        setSessionCache((prev) => ({ ...prev, [id]: result.data! }));
      }
    } catch (err) {
      console.error(`[team-orchestrator] Failed to load session ${id}:`, err);
    } finally {
      setSessionLoadingSet((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function sessionLoadingById(id: string | null): boolean {
    if (!id) return false;
    return sessionLoadingSet().has(id);
  }

  function getActiveSlot(): AgentSessionSlot | null {
    const activeId = state.activeTabId;
    if (activeId === 'orchestrator') return null;
    return state.agentSlots.get(activeId) ?? null;
  }

  function resetState(): void {
    abort();
    setState('orchestratorSessionId', null);
    setState('agentSlots', new Map());
    setState('isRunning', false);
    setState('dispatchPlan', null);
    setState('activeTabId', 'orchestrator');
  }

  return {
    state: () => state,
    run,
    sendTo,
    runDirect,
    abort,
    resetState,
    setActiveTab,
    getActiveSlot,
    replyPermission,
    replyQuestion,
    getSessionById,
    getMessagesBySessionId,
    ensureSessionLoaded,
    sessionLoadingById,
  };
}
