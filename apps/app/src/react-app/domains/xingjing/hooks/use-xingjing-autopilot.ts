import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import type { SessionStatus, Todo } from "@opencode-ai/sdk/v2/client";

import {
  transcriptKey,
  statusKey,
  todoKey,
} from "../../session/sync/session-sync";
import type { AutopilotStatus } from "../types";

export type UseXingjingAutopilotReturn = {
  /**
   * 当前 session 的消息列表（UIMessage[]）。
   * 由 GlobalSDKProvider SSE 事件流经 session-sync 写入 React Query 缓存；
   * 本 hook 只读缓存，不建立新的 SSE 连接（遵循 06-bridge-contract §4.4）。
   */
  messages: UIMessage[];
  /**
   * 当前 autopilot session 状态。
   * idle = Composer 可发送；busy = 执行中；retry = 重试中。
   * 对应 30-autopilot.md §7 SSE event: session.status。
   */
  status: AutopilotStatus;
  /**
   * 当前 session 的 todo 列表。
   * 对应 30-autopilot.md §7 SSE event: todo.updated。
   */
  todos: Todo[];
  /**
   * 数据是否仍在首次加载（无 sessionId 时始终为 false）。
   */
  isLoading: boolean;
};

/**
 * Autopilot session 生命周期 hook。
 *
 * 通过 React Query 订阅当前 session 的消息流、状态和 todo。
 * 不自建 SSE 连接——依赖 session-sync.ts 已维护的 React Query 缓存。
 *
 * 发送 prompt 的入口在 session-route.tsx 管理的 actions-store.sendPrompt；
 * 本 hook 仅提供只读的状态订阅层。
 *
 * 遵循 30-autopilot.md §10 时序图和 06-bridge-contract §4 设计。
 *
 * @param workspaceId - 当前活跃 workspace ID（null 表示未就绪）
 * @param sessionId   - 当前选中 session ID（null 表示无活跃 session）
 *
 * @example
 * ```tsx
 * const { messages, status, todos } = useXingjingAutopilot(
 *   activeWorkspaceId,
 *   selectedSessionId,
 * );
 * ```
 */
export function useXingjingAutopilot(
  workspaceId: string | null,
  sessionId: string | null,
): UseXingjingAutopilotReturn {
  const safeWsId = workspaceId ?? "";
  const safeSid = sessionId ?? "";
  const enabled = Boolean(workspaceId && sessionId);

  const { data: messagesRaw = null, isLoading: messagesLoading } = useQuery<
    UIMessage[] | null
  >({
    queryKey: transcriptKey(safeWsId, safeSid),
    enabled,
    // session-sync 负责主动更新缓存，无需定期重拉
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000, // 5 分钟后 GC 未被使用的 session 缓存
  });
  const messages = messagesRaw ?? [];

  const { data: rawStatus, isLoading: statusLoading } =
    useQuery<SessionStatus | null>({
      queryKey: statusKey(safeWsId, safeSid),
      enabled,
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000,
    });

  const { data: todosRaw = null, isLoading: todosLoading } = useQuery<Todo[] | null>({
    queryKey: todoKey(safeWsId, safeSid),
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
  const todos = todosRaw ?? [];

  const status: AutopilotStatus = normalizeStatus(rawStatus);

  return {
    messages,
    status,
    todos,
    isLoading: enabled && (messagesLoading || statusLoading || todosLoading),
  };
}

/**
 * 将 SDK 的 SessionStatus 规范化为 AutopilotStatus。
 * 未知状态降级为 idle。
 */
function normalizeStatus(raw: SessionStatus | null | undefined): AutopilotStatus {
  if (!raw) return { type: "idle" };
  if (raw.type === "idle") return { type: "idle" };
  if (raw.type === "busy") return { type: "busy" };
  if (raw.type === "retry") {
    const r = raw as {
      type: "retry";
      attempt?: number;
      message?: string;
      next?: number;
    };
    return {
      type: "retry",
      attempt: r.attempt ?? 0,
      message: r.message ?? "",
      next: r.next ?? 0,
    };
  }
  return { type: "idle" };
}
