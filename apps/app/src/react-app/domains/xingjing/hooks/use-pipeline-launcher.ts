/**
 * usePipelineLauncher — 启动流水线的核心 hook
 *
 * 职责：
 * 1. 创建新 OpenCode session（或在当前 session 续跑）
 * 2. 将 /<triggerCommand> + goal 组合为初始 prompt 发送
 * 3. 调用 onSessionCreated 通知上层导航到新 session（仅 new-session 模式）
 *
 * Hook 本身只维护 launching/launchError UI state；真正的启动逻辑被抽取为
 * 独立的纯函数 `launchPipelineCore`，便于在 hook 之外（例如 session-route
 * 的 onSendDraft 拦截 @xingjing-pipeline-<id> mention 时）复用同一套
 * 启动 + 日志埋点链路。
 */

import { useState, useCallback } from "react";
import { createClient, unwrap } from "../../../../app/lib/opencode";
import type { PipelineDefinition } from "../pipeline/types";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../kernel/store";
import { loadDirGraph } from "../workspace-knowledge/services/dir-graph-loader";
import { buildWorkspaceContext } from "../workspace-knowledge/services/context-builder";

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
  /** OpenWork server client（可选），用于注入 <workspace_context> */
  owClient?: OpenworkServerClient | null;
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

/** launchPipelineCore 入参：完整自包含，无 React 状态依赖 */
export interface LaunchPipelineCoreDeps {
  opencodeBaseUrl: string;
  token: string;
  workspacePath?: string;
  def: PipelineDefinition;
  goal: string;
  inputValues?: Record<string, string>;
  mode?: "new-session" | "current-session";
  /** current-session 模式下必填 */
  parentSessionId?: string;
  /** OpenWork server client，用于注入 <workspace_context>（可选） */
  owClient?: OpenworkServerClient | null;
  /** workspaceId，用于 loadDirGraph；如未传则从 store 读取 */
  workspaceId?: string | null;
}

/** launchPipelineCore 返回结果 */
export interface LaunchPipelineCoreResult {
  /** 实际使用的 sessionId：new-session 模式为新建 id；current-session 为 parentSessionId */
  sessionId: string;
  mode: "new-session" | "current-session";
}

// ── Pure core ─────────────────────────────────────────────────────────────────

/**
 * 启动流水线的纯函数实现：不依赖 React，无 UI state。
 *
 * - 复用 createClient + 三层 override 的 logContext 透传
 * - 自带 `[pipeline:<id>][launcher]` 结构化日志，覆盖完整生命周期
 * - 失败时直接 throw（由调用方负责 UI 反馈）
 */
export async function launchPipelineCore(
  deps: LaunchPipelineCoreDeps,
): Promise<LaunchPipelineCoreResult> {
  const {
    opencodeBaseUrl,
    token,
    workspacePath,
    def,
    goal,
    inputValues = {},
    mode = "new-session",
    parentSessionId,
    owClient,
    workspaceId,
  } = deps;

  // Structured logger: prefix `[pipeline:<id>][launcher]`, payload always
  // carries { pipelineId, triggerCommand, sessionId?, ts } for devtools
  // filtering. sessionId is backfilled after session.create succeeds.
  const tag = `[pipeline:${def.id}][launcher]`;
  let base: { pipelineId: string; triggerCommand: string; sessionId?: string } = {
    pipelineId: def.id,
    triggerCommand: def.triggerCommand,
  };
  const log = (event: string, extra?: object) =>
    console.log(`${tag} ${event}`, { ...base, ts: Date.now(), ...extra });
  const warn = (event: string, extra?: object) =>
    console.warn(`${tag} ${event}`, { ...base, ts: Date.now(), ...extra });
  const err = (event: string, extra?: object) =>
    console.error(`${tag} ${event}`, { ...base, ts: Date.now(), ...extra });

  log("start", {
    mode,
    parentSessionId,
    nodeCount: def.nodes.length,
    goalPreview: goal.slice(0, 200),
  });

  if (!opencodeBaseUrl || !token) {
    warn("abort-missing-connection", {
      hasBaseUrl: Boolean(opencodeBaseUrl),
      hasToken: Boolean(token),
    });
    throw new Error("OpenCode 服务未连接，请先连接 Workspace");
  }

  if (mode === "current-session" && !parentSessionId) {
    warn("abort-missing-parent-session", {});
    throw new Error("current-session 模式下必须提供 parentSessionId");
  }

  const client = createClient(
    opencodeBaseUrl,
    workspacePath?.trim() || undefined,
    { token, mode: "openwork" },
    { pipelineId: def.id, triggerCommand: def.triggerCommand },
  );

  // 构建初始 prompt
  let promptText = buildLaunchPrompt(def, goal, inputValues);

  // 注入 workspace context（静默降级：任何失败都不阻塞 launch）
  const wsId = workspaceId ?? useOpenworkStore.getState().activeWorkspaceId;
  if (owClient && wsId) {
    try {
      const graph = await loadDirGraph(owClient, wsId);
      const ctx = await buildWorkspaceContext(owClient, wsId, graph);
      if (ctx) {
        promptText = ctx + "\n\n" + promptText;
        log("context-injected", {
          owClientPresent: true,
          ctxBytes: ctx.length,
        });
      } else {
        log("context-injected", {
          owClientPresent: true,
          ctxBytes: 0,
          note: "empty-context",
        });
      }
    } catch (e) {
      warn("context-inject-failed", { error: String(e) });
      // silent degradation
    }
  } else {
    log("context-inject-skipped", {
      owClientPresent: Boolean(owClient),
      wsId,
    });
  }

  if (mode === "current-session" && parentSessionId) {
    base = { ...base, sessionId: parentSessionId };
    log("prompt-send-request", {
      promptPreview: promptText.slice(0, 200),
      promptBytes: promptText.length,
    });
    // 在当前 session 继续执行，不创建新 session
    const result = await client.session.promptAsync({
      sessionID: parentSessionId,
      parts: [{ type: "text", text: promptText }],
    });
    if (result.error) {
      const errMsg =
        result.error instanceof Error ? result.error.message : String(result.error);
      err("prompt-send-error", { error: errMsg });
      throw new Error(errMsg);
    }
    log("prompt-send-ok", {});
    persistPipelineSession(parentSessionId, def.id, warn);
    return { sessionId: parentSessionId, mode: "current-session" };
  }

  // new-session：创建新 session + 发送初始 prompt
  log("session-create-request", {
    workspacePath: workspacePath?.trim() || null,
  });
  const session = unwrap(
    await client.session.create({
      directory: workspacePath?.trim() || undefined,
    }),
  );
  base = { ...base, sessionId: session.id };
  log("session-created", { sessionId: session.id });

  log("prompt-send-request", {
    promptPreview: promptText.slice(0, 200),
    promptBytes: promptText.length,
  });
  const result = await client.session.promptAsync({
    sessionID: session.id,
    parts: [{ type: "text", text: promptText }],
  });
  if (result.error) {
    const errMsg =
      result.error instanceof Error ? result.error.message : String(result.error);
    err("prompt-send-error", { error: errMsg });
    throw new Error(errMsg);
  }
  log("prompt-send-ok", {});

  // 写入 localStorage ，记录该 session 由哪个 pipeline 启动
  // 将被 usePipelineSupervisor / PipelineProgressPanel 读取
  persistPipelineSession(session.id, def.id, warn);

  return { sessionId: session.id, mode: "new-session" };
}

/**
 * 将 session -> pipeline 映射写入 localStorage。
 *
 * 两种启动模式（new-session / current-session）使用同一 key、同一结构，
 * 保证 session-route 的 @pipeline 拦截分支可以一致地检查"当前会话是否
 * 已由某条 pipeline 启动"。存储异常静默失败（内部 warn 日志），不影响
 * 核心启动流程。
 */
function persistPipelineSession(
  sessionId: string,
  pipelineId: string,
  warn: (event: string, extra?: object) => void,
) {
  try {
    const key = "xingjing.pipeline-sessions";
    const existing = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<
      string,
      { pipelineId: string; launchedAt: number }
    >;
    existing[sessionId] = { pipelineId, launchedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    warn("pipeline-session-persist-failed", { error: String(e) });
    // localStorage 不可用时静默失败
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * 启动流水线：创建新 session + 发送 /<triggerCommand> 初始 prompt。
 *
 * Hook 是 `launchPipelineCore` 的薄壳：仅维护 launching/launchError state，
 * 真正的启动逻辑（含日志埋点、context 注入、localStorage 持久化）位于
 * 纯函数 `launchPipelineCore`。
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
  owClient,
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
      setLaunching(true);
      setLaunchError(null);
      try {
        const result = await launchPipelineCore({
          opencodeBaseUrl,
          token,
          workspacePath,
          def,
          goal,
          inputValues,
          mode: options.mode,
          parentSessionId: options.parentSessionId,
          owClient,
        });
        // 仅 new-session 模式通知上层导航
        if (result.mode === "new-session") {
          onSessionCreated(result.sessionId);
          console.log(`[pipeline:${def.id}][launcher] navigated`, {
            pipelineId: def.id,
            triggerCommand: def.triggerCommand,
            sessionId: result.sessionId,
            ts: Date.now(),
          });
        }
      } catch (e) {
        setLaunchError(
          e instanceof Error ? e.message : "启动流水线时发生未知错误",
        );
      } finally {
        setLaunching(false);
      }
    },
    [opencodeBaseUrl, token, workspacePath, onSessionCreated, owClient],
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
