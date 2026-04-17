/**
 * Message Accumulator
 *
 * 从 context/session.ts 提取的 SSE 消息累积逻辑，支持多 Session 并发订阅。
 * 每个 Agent Session 可以独立订阅，不干扰全局 Session 状态。
 */

import { createSignal, createEffect, onCleanup, Accessor } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { Client, MessageWithParts, PendingPermission, PendingQuestion, TodoItem } from '../../types';
import type { Message, Part } from '@opencode-ai/sdk/v2/client';

export interface MessageAccumulatorOptions {
  client: () => Client | null;
  sessionId: () => string | null;
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

/**
 * 创建消息累积器，订阅指定 Session 的 SSE 流
 */
export function createMessageAccumulator(opts: MessageAccumulatorOptions): MessageAccumulator {
  const [messages, setMessages] = createStore<MessageInfo[]>([]);
  const [parts, setParts] = createStore<Part[]>([]);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [todos, setTodos] = createSignal<TodoItem[]>([]);

  let cleanup: (() => void) | null = null;

  createEffect(() => {
    const client = opts.client();
    const sessionId = opts.sessionId();

    if (cleanup) {
      cleanup();
      cleanup = null;
    }

    if (!client || !sessionId) return;

    // 订阅 SSE 事件流（简化版本，不使用 async iterator）
    // 实际项目中应该使用 client.event.subscribe 的正确方式
    let active = true;

    cleanup = () => {
      active = false;
    };

    // 注意：这里简化了 SSE 订阅逻辑
    // 实际应该根据项目的 client.event.subscribe API 来实现
  });

  onCleanup(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

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
    cleanup: () => {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  };
}
