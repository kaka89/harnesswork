/**
 * Message Accumulator
 *
 * 从 context/session.ts 提取的 SSE 消息累积逻辑，支持多 Session 并发订阅。
 * 每个 Agent Session 可以独立订阅，不干扰全局 Session 状态。
 */

import { createSignal, createEffect, onCleanup, Accessor } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Client, MessageWithParts, PendingPermission, PendingQuestion, TodoItem } from '../../types';
import type { Message, Part } from '@opencode-ai/sdk/v2/client';
import { normalizeRawEvent } from './opencode-client';

export interface MessageAccumulatorOptions {
  client: () => Client | null;
  sessionId: () => string | null;
  /** SSE 订阅的 directory scope（避免与 OpenWork 全局订阅互斥） */
  directory: () => string | undefined;
  onPermissionAsked?: (p: PendingPermission) => void;
  onQuestionAsked?: (q: PendingQuestion) => void;
}

export interface MessageAccumulator {
  messages: Accessor<MessageWithParts[]>;
  isStreaming: Accessor<boolean>;
  todos: Accessor<TodoItem[]>;
  cleanup: () => void;
}

interface MessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time?: { created?: number; updated?: number };
  parentID?: string;
  modelID?: string;
  providerID?: string;
  mode?: string;
  agent?: string;
  path?: { cwd?: string; root?: string };
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

const sortById = <T extends { id: string }>(list: T[]) =>
  list.slice().sort((a, b) => a.id.localeCompare(b.id));

const upsertMessageInfo = (list: MessageInfo[], next: MessageInfo) => {
  const index = list.findIndex((m) => m.id === next.id);
  if (index === -1) return sortById([...list, next]);
  const copy = list.slice();
  copy[index] = next;
  return copy;
};

const upsertPartInfo = (list: Part[], next: Part) => {
  const index = list.findIndex((p) => p.id === next.id);
  if (index === -1) return sortById([...list, next]);
  const copy = list.slice();
  copy[index] = next;
  return copy;
};

const appendPartDelta = (list: Part[], partID: string, field: string, delta: string) => {
  if (!delta) return list;
  const index = list.findIndex((p) => p.id === partID);
  if (index === -1) return list;

  const existing = list[index] as Part & Record<string, unknown>;
  const current = existing[field];
  if (current !== undefined && typeof current !== 'string') return list;

  const nextValue = `${typeof current === 'string' ? current : ''}${delta}`;
  if (nextValue === current) return list;

  const copy = list.slice();
  copy[index] = { ...existing, [field]: nextValue } as Part;
  return copy;
};

/** 不代表会话有进展的事件类型（心跳/连接信号），不用于判断 streaming */
const NON_ACTIVITY_EVENTS = new Set([
  'server.heartbeat', 'server.connected', 'server.keepalive',
]);

/**
 * 创建消息累积器，订阅指定 Session 的 SSE 流。
 * 每个 Agent Session 可独立订阅，不干扰全局 Session 状态。
 */
export function createMessageAccumulator(opts: MessageAccumulatorOptions): MessageAccumulator {
  const [messages, setMessages] = createStore<MessageInfo[]>([]);
  const [parts, setParts] = createStore<Part[]>([]);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [todos, setTodos] = createSignal<TodoItem[]>([]);

  let abortController: AbortController | null = null;

  const doCleanup = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  createEffect(() => {
    const client = opts.client();
    const sessionId = opts.sessionId();
    const directory = opts.directory();

    // 依赖变化时清理旧订阅
    doCleanup();

    // [FIX] 清空上一个 session 的残留数据，防止旧消息抢占渲染
    setMessages([]);
    setParts([]);
    setTodos([]);

    if (!client || !sessionId) return;

    const controller = new AbortController();
    abortController = controller;

    // 启动 SSE 订阅（fire-and-forget async IIFE）
    void (async () => {
      try {
        const sub = await (client as any).event.subscribe(
          directory ? { directory } : undefined,
          { signal: controller.signal },
        );

        setIsStreaming(true);

        for await (const raw of sub.stream as AsyncIterable<unknown>) {
          if (controller.signal.aborted) break;

          const evt = normalizeRawEvent(raw);
          if (!evt) continue;

          // 跳过心跳等非活动事件
          if (NON_ACTIVITY_EVENTS.has(evt.type)) continue;

          // 内容事件到达时重新激活 streaming 标记（处理同一 session 上多次命令执行的场景）
          // session.idle/completed 会将 isStreaming 置 false，后续命令触发的新内容事件需重新激活
          if (evt.type.startsWith('message.') && !isStreaming()) {
            setIsStreaming(true);
          }

          const p = evt.props;

          // ── message.updated ──
          if (evt.type === 'message.updated') {
            const msg = (p.message ?? p) as Record<string, unknown>;
            if (String(msg.sessionID ?? '') !== sessionId) continue;
            const msgInfo: MessageInfo = {
              id: String(msg.id ?? ''),
              sessionID: String(msg.sessionID ?? ''),
              role: (msg.role as 'user' | 'assistant') ?? 'assistant',
              time: msg.time as MessageInfo['time'],
              parentID: msg.parentID as string | undefined,
              modelID: msg.modelID as string | undefined,
              providerID: msg.providerID as string | undefined,
              mode: msg.mode as string | undefined,
              agent: msg.agent as string | undefined,
              path: msg.path as MessageInfo['path'],
              cost: msg.cost as number | undefined,
              tokens: msg.tokens as MessageInfo['tokens'],
            };
            if (msgInfo.id) {
              setMessages((prev) => upsertMessageInfo(prev, msgInfo));
            }
            continue;
          }

          // ── message.part.updated ──
          if (evt.type === 'message.part.updated' || evt.type === 'message.part') {
            const part = (p.part ?? p) as Record<string, unknown>;
            if (String(part.sessionID ?? '') !== sessionId) continue;

            const partObj = part as Part;
            if (partObj.id) {
              setParts((prev) => upsertPartInfo(prev, partObj));

              // 确保 parent message 存在
              const msgId = String(part.messageID ?? '');
              if (msgId && !messages.find((m) => m.id === msgId)) {
                setMessages((prev) =>
                  upsertMessageInfo(prev, {
                    id: msgId,
                    sessionID: sessionId,
                    role: (part.role as 'user' | 'assistant') ?? 'assistant',
                  }),
                );
              }
            }
            continue;
          }

          // ── message.part.delta ──
          if (evt.type === 'message.part.delta') {
            const msgId = typeof p.messageID === 'string' ? p.messageID : null;
            const partId = typeof p.partID === 'string' ? p.partID : (typeof p.id === 'string' ? p.id : null);
            const delta = typeof p.delta === 'string' ? p.delta : '';
            const field = typeof p.field === 'string' ? p.field : 'text';

            if (partId && delta) {
              // [FIX] delta 事件可能先于 message.part.updated 到达（SSE 事件竞态）
              // 如果 part 尚未注册，自动创建并初始化，避免 delta 内容被静默丢弃
              const existingPart = parts.find((pp) => pp.id === partId);
              if (!existingPart) {
                const newPart = {
                  id: partId,
                  messageID: msgId ?? '',
                  sessionID: sessionId,
                  type: 'text' as const,
                  text: field === 'text' ? delta : '',
                  ...(field !== 'text' ? { [field]: delta } : {}),
                } as unknown as Part;
                setParts((prev) => upsertPartInfo(prev, newPart));
                // 确保 parent message 存在
                if (msgId && !messages.find((m) => m.id === msgId)) {
                  setMessages((prev) =>
                    upsertMessageInfo(prev, {
                      id: msgId,
                      sessionID: sessionId,
                      role: 'assistant',
                    }),
                  );
                }
              } else {
                setParts((prev) => appendPartDelta(prev, partId, field, delta));
              }
            }
            continue;
          }

          // ── permission.asked ──
          if (evt.type === 'permission.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== sessionId) continue;
            if (opts.onPermissionAsked) {
              opts.onPermissionAsked({
                ...p,
                receivedAt: Date.now(),
              } as unknown as PendingPermission);
            }
            continue;
          }

          // ── question.asked ──
          if (evt.type === 'question.asked') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== sessionId) continue;
            if (opts.onQuestionAsked) {
              opts.onQuestionAsked({
                ...p,
                receivedAt: Date.now(),
              } as unknown as PendingQuestion);
            }
            continue;
          }

          // ── todo.updated ──
          if (evt.type === 'todo.updated') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== sessionId) continue;
            const items = p.items ?? p.todos;
            if (Array.isArray(items)) {
              setTodos(items as TodoItem[]);
            }
            continue;
          }

          // ── session 完成信号 ──
          if (
            evt.type === 'session.idle' ||
            evt.type === 'session.completed'
          ) {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== sessionId) continue;
            setIsStreaming(false);
            continue;
          }

          if (evt.type === 'session.status') {
            const evtSid = typeof p.sessionID === 'string' ? p.sessionID : null;
            if (evtSid && evtSid !== sessionId) continue;
            const statusObj = p.status;
            const statusType = typeof statusObj === 'object' && statusObj !== null
              ? String((statusObj as Record<string, unknown>).type ?? '')
              : String(statusObj ?? '');
            if (statusType === 'idle' || statusType === 'completed') {
              setIsStreaming(false);
            }
            continue;
          }
        }

        // SSE stream 结束（正常或被 abort）→ 标记非 streaming
        if (!controller.signal.aborted) {
          setIsStreaming(false);
        }
      } catch (err) {
        // AbortError 是正常清理，其他错误记录日志
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('[message-accumulator] SSE subscription error:', err);
        }
        setIsStreaming(false);
      }
    })();
  });

  onCleanup(doCleanup);

  // 合并 messages 和 parts 为 MessageWithParts[]
  const messagesWithParts = (): MessageWithParts[] => {
    return messages.map((msg) => ({
      info: msg as Message,
      parts: parts.filter((p) => p.messageID === msg.id),
    }));
  };

  return {
    messages: messagesWithParts,
    isStreaming,
    todos,
    cleanup: doCleanup,
  };
}
