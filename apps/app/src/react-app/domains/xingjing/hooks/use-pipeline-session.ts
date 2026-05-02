/**
 * usePipelineSession — 检测当前 session 是否由 pipeline 启动
 *
 * 职责：
 * 1. 读取 localStorage['xingjing.pipeline-sessions'] 获取 pipelineId
 * 2. 通过 usePipelineDefinitions 找到对应的 PipelineDefinition
 * 3. 返回 { pipelineId, def, isPipelineSession }
 *
 * v1 约束：
 * - localStorage 读取使用 useMemo（不订阅 storage 事件），session 切换时重新计算
 * - client / workspaceId 为 null 时直接返回空结果
 */

import { useMemo } from "react";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { PipelineDefinition } from "../pipeline/types";
import { usePipelineDefinitions } from "./use-pipeline-definitions";

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_SESSIONS_KEY = "xingjing.pipeline-sessions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineSessionEntry {
  pipelineId: string;
  launchedAt: number;
}

export interface UsePipelineSessionResult {
  /** 该 session 对应的 pipeline id，非 pipeline session 时为 null */
  pipelineId: string | null;
  /** 找到的 PipelineDefinition，未找到时为 null */
  def: PipelineDefinition | null;
  /** 是否是 pipeline 启动的 session */
  isPipelineSession: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * 检测给定 sessionId 是否由流水线启动，并返回对应的 PipelineDefinition。
 *
 * @example
 * ```tsx
 * const { def, isPipelineSession } = usePipelineSession(client, workspaceId, sessionId);
 * if (isPipelineSession && def) {
 *   // 渲染 PipelineProgressPanel
 * }
 * ```
 */
export function usePipelineSession(
  client: OpenworkServerClient | null,
  workspaceId: string | null,
  sessionId: string | null,
): UsePipelineSessionResult {
  // 从 localStorage 读取 pipelineId（依赖 sessionId 变化重新计算）
  const pipelineId = useMemo<string | null>(() => {
    if (!sessionId) return null;
    try {
      const raw = localStorage.getItem(PIPELINE_SESSIONS_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, PipelineSessionEntry>;
      return map[sessionId]?.pipelineId ?? null;
    } catch {
      return null;
    }
  }, [sessionId]);

  // 订阅 workspace 所有 pipeline（有缓存则不发请求）
  const { pipelines } = usePipelineDefinitions(client, workspaceId);

  // 在列表中找到对应的 def
  const def = useMemo<PipelineDefinition | null>(() => {
    if (!pipelineId) return null;
    return pipelines.find((p) => p.id === pipelineId) ?? null;
  }, [pipelineId, pipelines]);

  return {
    pipelineId,
    def,
    isPipelineSession: Boolean(pipelineId),
  };
}
