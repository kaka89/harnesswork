/**
 * usePipelineSupervisor — 流水线执行正确性看门狗（§I 闸门 3）
 *
 * 职责：
 * 1. 订阅 session 的 todo 状态（todoKey）
 * 2. 将 todo 列表与 PipelineDefinition.nodes 对账（按约定 id 前缀匹配）
 * 3. 检测：跳节点 / 假完成 / 超时
 * 4. 返回每个节点的派生状态供 PipelineProgressPanel 渲染
 *
 * Todo ID 约定（由 compiler.ts 写入 system prompt）：
 *   pipeline-<pipelineId>:node-<index>   例：pipeline-abc123:node-0
 *
 * v1 约束：
 * - 仅检测 todo 状态跳跃（不检测文件是否存在，因为 Tauri 文件 watch 不在前端）
 * - 超时告警基于 todo 进入 in_progress 时间（通过本地时间戳记录）
 */

import { useMemo, useSyncExternalStore } from "react";
import type { Todo } from "@opencode-ai/sdk/v2/client";
import { getReactQueryClient } from "../../../infra/query-client";
import { todoKey } from "../../session/sync/session-sync";
import type { PipelineDefinition } from "../pipeline/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeSupervisorStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "awaiting-approval"
  | "unknown";

export interface NodeSupervisorState {
  nodeIndex: number;
  nodeLabel: string;
  status: NodeSupervisorStatus;
  /** 匹配到的 todo 内容（用于 UI 显示） */
  todoContent: string | null;
  /** 进入 in_progress 的本地时间戳（用于超时检测） */
  startedAt?: number;
  /** 是否超时（超过 timeoutMs） */
  isTimeout: boolean;
}

export interface PipelineSupervisorResult {
  nodeStates: NodeSupervisorState[];
  /** 是否有异常（跳节点/超时） */
  hasAnomaly: boolean;
  /** 异常描述列表 */
  anomalies: string[];
  /** 整体完成进度 0~1 */
  progress: number;
}

// ── 稳定空数组常量（避免 useSyncExternalStore 快照每次返回新引用引发无限循环）────
const EMPTY_TODOS: Todo[] = [];

// ── 本地存储：记录节点进入 in_progress 的时间 ─────────────────────────────────

const inProgressTimestamps = new Map<string, number>();

function markNodeInProgress(todoId: string) {
  if (!inProgressTimestamps.has(todoId)) {
    inProgressTimestamps.set(todoId, Date.now());
  }
}

function clearNodeInProgress(todoId: string) {
  inProgressTimestamps.delete(todoId);
}

const nodeContentPrefix = (pipelineId: string, nodeIndex: number) =>
  `[pipeline-${pipelineId}:node-${nodeIndex}]`;

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UsePipelineSupervisorParams {
  workspaceId: string | null;
  sessionId: string | null;
  def: PipelineDefinition | null;
  /** 超时阈值（ms），默认 10 分钟 */
  timeoutMs?: number;
}

export function usePipelineSupervisor({
  workspaceId,
  sessionId,
  def,
  timeoutMs = 10 * 60 * 1000,
}: UsePipelineSupervisorParams): PipelineSupervisorResult {
  const queryClient = getReactQueryClient();

  // 订阅 todo 状态
  const todos = useSyncExternalStore(
    (callback) => queryClient.getQueryCache().subscribe(callback),
    () => {
      if (!workspaceId || !sessionId) return EMPTY_TODOS;
      return queryClient.getQueryData<Todo[]>(todoKey(workspaceId, sessionId)) ?? EMPTY_TODOS;
    },
    () => EMPTY_TODOS,
  );

  const result = useMemo<PipelineSupervisorResult>(() => {
    if (!def || !sessionId) {
      return { nodeStates: [], hasAnomaly: false, anomalies: [], progress: 0 };
    }

    const anomalies: string[] = [];
    const now = Date.now();

    const nodeStates: NodeSupervisorState[] = def.nodes.map((node, idx) => {
      const contentPrefix = nodeContentPrefix(def.id, idx);

      // 找到匹配的 todo（按 content 前缀匹配）
      const todo = todos.find(
        (t) =>
          typeof t.content === "string" &&
          (t.content === node.label ||
            t.content.startsWith(contentPrefix) ||
            t.content.includes(`[node-${idx}]`)),
      );

      let status: NodeSupervisorStatus = "unknown";
      let startedAt: number | undefined;
      let isTimeout = false;
      const trackKey = `${def.id}:node-${idx}`;

      if (!todo) {
        // 还没有对应的 todo（pipeline 尚未写入 todo 列表）
        status = "pending";
      } else {
        const todoStatus = todo.status?.toLowerCase() ?? "";

        if (todoStatus === "completed") {
          status = "completed";
          clearNodeInProgress(trackKey);
        } else if (todoStatus === "cancelled") {
          status = "skipped";
          clearNodeInProgress(trackKey);
        } else if (todoStatus === "in_progress" || todoStatus === "in-progress") {
          // 检查是否是 human_approval 节点
          if (node.kind === "human_approval") {
            status = "awaiting-approval";
          } else {
            status = "running";
          }
          markNodeInProgress(trackKey);
          startedAt = inProgressTimestamps.get(trackKey);
          if (startedAt && now - startedAt > timeoutMs) {
            isTimeout = true;
            anomalies.push(`节点 ${idx + 1}「${node.label}」已超时 ${Math.floor((now - startedAt) / 60000)} 分钟`);
          }
        } else {
          // pending 状态
          status = "pending";
        }
      }

      return {
        nodeIndex: idx,
        nodeLabel: node.label,
        status,
        todoContent: todo?.content ?? null,
        startedAt,
        isTimeout,
      };
    });

    // 检测跳节点：N+1 已 completed 但 N 仍为 pending/unknown
    for (let i = 0; i < nodeStates.length - 1; i++) {
      const curr = nodeStates[i];
      const next = nodeStates[i + 1];
      if (
        (curr.status === "pending" || curr.status === "unknown") &&
        next.status === "completed"
      ) {
        anomalies.push(`检测到跳节点：节点 ${i + 2}「${next.nodeLabel}」已完成，但节点 ${i + 1}「${curr.nodeLabel}」仍未开始`);
      }
    }

    const completedCount = nodeStates.filter(
      (n) => n.status === "completed" || n.status === "skipped",
    ).length;
    const progress = def.nodes.length > 0 ? completedCount / def.nodes.length : 0;

    return {
      nodeStates,
      hasAnomaly: anomalies.length > 0,
      anomalies,
      progress,
    };
  }, [todos, def, sessionId, timeoutMs]);

  return result;
}
