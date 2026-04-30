/**
 * usePipelineDefinitions — 订阅 workspace 全部 pipeline 定义
 *
 * 基于 React Query，key = ["xingjing","pipelines",workspaceId]。
 * 由 usePipelineSave 保存/删除后 invalidate 缓存。
 *
 * @see SDD §13 React Query 键
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { PipelineDefinition, PipelineScope } from "../pipeline/types";
import { createPipelineStorage } from "../pipeline/storage";

// ── Query Key ─────────────────────────────────────────────────────────────────

export function pipelineListKey(workspaceId: string) {
  return ["xingjing", "pipelines", workspaceId] as const;
}

export function pipelineDefaultKey(workspaceId: string, scope: PipelineScope) {
  return ["xingjing", "pipelines", workspaceId, "default", scope] as const;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type UsePipelineDefinitionsReturn = {
  /** 所有 pipeline，按创建时间排序 */
  pipelines: PipelineDefinition[];
  /** 按 scope 分组的 pipeline map */
  byScope: Map<PipelineScope, PipelineDefinition[]>;
  /** 各 scope 的默认 pipeline */
  defaultByScope: Map<PipelineScope, PipelineDefinition>;
  isLoading: boolean;
  error: string | null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * 订阅当前 workspace 的所有 pipeline 定义。
 *
 * client 或 workspaceId 为 null 时返回空列表（钩子不发请求）。
 *
 * @example
 * ```tsx
 * const { pipelines, byScope, defaultByScope, isLoading } =
 *   usePipelineDefinitions(client, workspaceId);
 * ```
 */
export function usePipelineDefinitions(
  client: OpenworkServerClient | null,
  workspaceId: string | null,
): UsePipelineDefinitionsReturn {
  const query = useQuery({
    queryKey: workspaceId ? pipelineListKey(workspaceId) : ["xingjing", "pipelines", "__disabled__"],
    queryFn: async () => {
      if (!client || !workspaceId) return [];
      const storage = createPipelineStorage(client);
      return storage.list(workspaceId);
    },
    enabled: Boolean(client && workspaceId),
    staleTime: 30_000,
  });

  const pipelines = query.data ?? [];

  const byScope = useMemo(() => {
    const map = new Map<PipelineScope, PipelineDefinition[]>();
    for (const p of pipelines) {
      const list = map.get(p.scope) ?? [];
      list.push(p);
      map.set(p.scope, list);
    }
    return map;
  }, [pipelines]);

  const defaultByScope = useMemo(() => {
    const map = new Map<PipelineScope, PipelineDefinition>();
    for (const p of pipelines) {
      if (p.isDefault) {
        map.set(p.scope, p);
      }
    }
    return map;
  }, [pipelines]);

  return {
    pipelines,
    byScope,
    defaultByScope,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
  };
}
