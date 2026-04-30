/**
 * usePipelineLauncher — 启动流水线的核心 hook
 *
 * 职责：
 * 1. 创建新 OpenCode session
 * 2. 将 /<triggerCommand> + goal 组合为初始 prompt 发送
 * 3. 调用 onSessionCreated 通知上层导航到新 session
 */

import { useState, useCallback } from "react";
import { createClient, unwrap } from "../../../../app/lib/opencode";
import type { PipelineDefinition } from "../pipeline/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UsePipelineLauncherParams {
  /** OpenCode workspace base URL（不含 trailing slash） */
  opencodeBaseUrl: string;
  /** OpenWork auth token */
  token: string;
  /** workspace 本地路径（可选，缺省由 server 自动推断） */
  workspacePath?: string;
  /**
   * 新 session 创建 + 初始 prompt 发送完毕后回调。
   * 上层应导航到该 session 并切换 activeSection 为 "cockpit"。
   */
  onSessionCreated: (sessionId: string) => void;
}

export interface UsePipelineLauncherReturn {
  launch: (
    def: PipelineDefinition,
    goal: string,
    inputValues?: Record<string, string>,
    options?: LaunchOptions,
  ) => Promise<void>;
  launching: boolean;
  launchError: string | null;
  clearError: () => void;
}

/** 启动选项（可选，默认 new-session） */
export interface LaunchOptions {
  /** 启动模式：new-session（默认）或 current-session（在当前 session 续跑） */
  mode?: "new-session" | "current-session";
  /** current-session 模式下必填，指定继续执行的 session id */
  parentSessionId?: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * 启动流水线：创建新 session + 发送 /<triggerCommand> 初始 prompt。
 *
 * opencodeBaseUrl 或 token 为空时，launch() 会立即设置 launchError 并返回。
 *
 * @example
 * ```tsx
 * const { launch, launching, launchError } = usePipelineLauncher({
 *   opencodeBaseUrl,
 *   token,
 *   workspacePath,
 *   onSessionCreated: (id) => {
 *     setActiveSection("cockpit");
 *     navigate(`/session/${id}`);
 *   },
 * });
 * ```
 */
export function usePipelineLauncher({
  opencodeBaseUrl,
  token,
  workspacePath,
  onSessionCreated,
}: UsePipelineLauncherParams): UsePipelineLauncherReturn {
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const clearError = useCallback(() => setLaunchError(null), []);

  const launch = useCallback(
    async (
      def: PipelineDefinition,
      goal: string,
      inputValues: Record<string, string> = {},
      options: LaunchOptions = {},
    ) => {
      if (!opencodeBaseUrl || !token) {
        setLaunchError("OpenCode 服务未连接，请先连接 Workspace");
        return;
      }

      const mode = options.mode ?? "new-session";
      const parentSessionId = options.parentSessionId;

      setLaunching(true);
      setLaunchError(null);

      try {
        const client = createClient(
          opencodeBaseUrl,
          workspacePath?.trim() || undefined,
          { token, mode: "openwork" },
        );

        // 构建初始 prompt
        const promptText = buildLaunchPrompt(def, goal, inputValues);

        if (mode === "current-session" && parentSessionId) {
          // 在当前 session 继续执行，不创建新 session
          const result = await client.session.promptAsync({
            sessionID: parentSessionId,
            parts: [{ type: "text", text: promptText }],
          });
          if (result.error) {
            throw new Error(
              result.error instanceof Error ? result.error.message : String(result.error),
            );
          }
          // current-session 模式不创建新 session，不调用 onSessionCreated
        } else {
          // new-session：创建新 session + 发送初始 prompt
          const session = unwrap(
            await client.session.create({
              directory: workspacePath?.trim() || undefined,
            }),
          );

          const result = await client.session.promptAsync({
            sessionID: session.id,
            parts: [{ type: "text", text: promptText }],
          });
          if (result.error) {
            throw new Error(
              result.error instanceof Error
                ? result.error.message
                : String(result.error),
            );
          }

          // 写入 localStorage ，记录该 session 由哪个 pipeline 启动
          // 将被 usePipelineSupervisor / PipelineProgressPanel 读取
          try {
            const key = "xingjing.pipeline-sessions";
            const existing = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
              string,
              { pipelineId: string; launchedAt: number }
            >;
            existing[session.id] = { pipelineId: def.id, launchedAt: Date.now() };
            localStorage.setItem(key, JSON.stringify(existing));
          } catch {
            // localStorage 不可用时静默失败
          }

          // 通知上层导航到新 session
          onSessionCreated(session.id);
        }
      } catch (err) {
        setLaunchError(
          err instanceof Error ? err.message : "启动流水线时发生未知错误",
        );
      } finally {
        setLaunching(false);
      }
    },
    [opencodeBaseUrl, token, workspacePath, onSessionCreated],
  );

  return { launch, launching, launchError, clearError };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * 将用户填写的 goal + inputValues 组合为初始 prompt 文本。
 *
 * 格式：
 * ```
 * /triggerCommand
 * 目标：<goal>
 * <fieldLabel>：<value>   (非空 input 字段)
 * ```
 */
function buildLaunchPrompt(
  def: PipelineDefinition,
  goal: string,
  inputValues: Record<string, string>,
): string {
  const lines: string[] = [`/${def.triggerCommand}`];

  if (goal.trim()) {
    lines.push(`目标：${goal.trim()}`);
  }

  for (const field of def.inputs) {
    const val = inputValues[field.key]?.trim();
    if (val) {
      lines.push(`${field.label}：${val}`);
    }
  }

  return lines.join("\n");
}
