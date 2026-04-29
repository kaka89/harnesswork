import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import type { Todo } from "@opencode-ai/sdk/v2/client";

import {
  transcriptKey,
  todoKey,
} from "../../session/sync/session-sync";

/**
 * 产出物文件条目（来自 LLM 写入 .opencode/docs/ 的文件引用）。
 * 对应 30-autopilot.md §9 右侧抽屉 Artifacts tab。
 */
export type ArtifactEntry = {
  id: string;
  /** 文件绝对路径（来自 message file part 引用） */
  path: string;
  /** 显示名称（文件 basename） */
  name: string;
  /** 产生该产出物的消息 ID */
  messageId: string;
};

/**
 * 工具调用条目（来自 SSE message.part.updated 的 tool-invocation part）。
 * 对应 30-autopilot.md §9 右侧抽屉 Tools tab。
 */
export type ToolEntry = {
  id: string;
  /** 工具名称（如 read_file / write_file / bash） */
  toolName: string;
  /** 工具调用输入（格式化 JSON 字符串） */
  input: string;
  /** 工具调用输出（格式化 JSON 字符串；执行中时为空字符串） */
  output: string;
  /** 产生该工具调用的消息 ID */
  messageId: string;
};

export type UseXingjingArtifactsReturn = {
  /** 本 session 产出的文件列表（.opencode/docs/ 等落盘文件） */
  artifacts: ArtifactEntry[];
  /** 本 session 的工具调用列表 */
  tools: ToolEntry[];
  /** 本 session 的 todo 列表（来自 SSE todo.updated） */
  todos: Todo[];
};

/**
 * 产出物聚合 hook。
 *
 * 从 React Query 缓存中提取当前 session 的产出物面板数据：
 * artifacts（文件）、tools（工具调用）、todos（待办项）。
 *
 * 对应 30-autopilot.md §9 右侧抽屉三 tab 的数据源。
 * 不建立额外订阅——与 useXingjingAutopilot 读取同一缓存键。
 *
 * @param workspaceId - 当前 workspace ID（null 表示未就绪）
 * @param sessionId   - 当前 session ID（null 表示无活跃 session）
 *
 * @example
 * ```tsx
 * const { artifacts, tools, todos } = useXingjingArtifacts(
 *   activeWorkspaceId,
 *   selectedSessionId,
 * );
 * ```
 */
export function useXingjingArtifacts(
  workspaceId: string | null,
  sessionId: string | null,
): UseXingjingArtifactsReturn {
  const safeWsId = workspaceId ?? "";
  const safeSid = sessionId ?? "";
  const enabled = Boolean(workspaceId && sessionId);

  const { data: messagesRaw = null } = useQuery<UIMessage[] | null>({
    queryKey: transcriptKey(safeWsId, safeSid),
    enabled,
    staleTime: Infinity,
  });
  const messages = messagesRaw ?? [];

  const { data: todosRaw = null } = useQuery<Todo[] | null>({
    queryKey: todoKey(safeWsId, safeSid),
    enabled,
    staleTime: Infinity,
  });
  const todos = todosRaw ?? [];

  const { artifacts, tools } = useMemo(
    () => extractFromMessages(messages),
    [messages],
  );

  return { artifacts, tools, todos };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface FilePart {
  type: "file";
  path?: string;
  url?: string;
  name?: string;
}

interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation?: {
    toolCallId: string;
    toolName: string;
    args: unknown;
    result?: unknown;
    state?: string;
  };
}

/**
 * 从 UIMessage[] 中提取 artifact 文件引用和工具调用条目。
 */
function extractFromMessages(messages: UIMessage[]): {
  artifacts: ArtifactEntry[];
  tools: ToolEntry[];
} {
  const artifacts: ArtifactEntry[] = [];
  const tools: ToolEntry[] = [];
  const seenPaths = new Set<string>();
  const seenToolIds = new Set<string>();

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue;

    for (const part of msg.parts) {
      if (!part || typeof part !== "object") continue;

      // --- artifact: file part with a path ---
      if ((part as { type: string }).type === "file") {
        const filePart = part as FilePart;
        const path = filePart.path ?? filePart.url ?? "";
        if (path && !seenPaths.has(path)) {
          seenPaths.add(path);
          artifacts.push({
            id: `${msg.id}-${path}`,
            path,
            name: filePart.name ?? path.split("/").at(-1) ?? path,
            messageId: msg.id,
          });
        }
      }

      // --- tool call: tool-invocation part ---
      if ((part as { type: string }).type === "tool-invocation") {
        const toolPart = part as unknown as ToolInvocationPart;
        const inv = toolPart.toolInvocation;
        if (inv && !seenToolIds.has(inv.toolCallId)) {
          seenToolIds.add(inv.toolCallId);
          tools.push({
            id: inv.toolCallId,
            toolName: inv.toolName,
            input: safeJsonStringify(inv.args),
            output: safeJsonStringify(inv.result),
            messageId: msg.id,
          });
        }
      }
    }
  }

  return { artifacts, tools };
}

function safeJsonStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
