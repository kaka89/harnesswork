/**
 * usePipelineSave — pipeline 保存/克隆/删除/设默认
 *
 * 每次写操作后：
 * 1. 调用 storage 写 `.xingjing/pipelines/<id>.json` + 更新 manifest
 * 2. 调用 syncPipelineToWorkspace 写编译产物（agent + command）
 * 3. invalidate React Query 缓存 ["xingjing","pipelines",workspaceId]
 *
 * @see SDD §4 存储策略 / §5 编译器
 */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { PipelineDefinition, PipelineValidationError } from "../pipeline/types";
import { PIPELINE_SCOPE_LABELS } from "../pipeline/types";
import { createPipelineStorage } from "../pipeline/storage";
import { validatePipeline } from "../pipeline/compiler";
import { syncPipelineToWorkspace } from "../pipeline/sync";
import { pipelineListKey } from "./use-pipeline-definitions";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type UsePipelineSaveReturn = {
  /** 保存当前 pipeline（写盘 + 编译 + 同步）；返回保存后的定义 */
  save: (
    def: PipelineDefinition,
    opts?: { knownAgentNames?: Set<string>; knownSkillNames?: Set<string> },
  ) => Promise<{ ok: true; def: PipelineDefinition } | { ok: false; errors: PipelineValidationError[] }>;

  /** 从空白模板新建 pipeline */
  createFromBlank: () => PipelineDefinition;

  /** 克隆现有 pipeline（新 id，名称加"副本"，清除默认标记）*/
  clone: (def: PipelineDefinition) => PipelineDefinition;

  /** 从 manifest 移除 pipeline（tombstone）；同时删除编译产物 agent/command */
  remove: (id: string) => Promise<void>;

  /** 将某条 pipeline 设为该 scope 默认 */
  setDefault: (id: string) => Promise<void>;

  saveStatus: SaveStatus;
  saveError: string | null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePipelineSave(
  client: OpenworkServerClient | null,
  workspaceId: string | null,
): UsePipelineSaveReturn {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    if (!workspaceId) return;
    void queryClient.invalidateQueries({ queryKey: pipelineListKey(workspaceId) });
  }, [queryClient, workspaceId]);

  // ── save ────────────────────────────────────────────────────────────────────
  const save = useCallback(
    async (
      def: PipelineDefinition,
      opts: { knownAgentNames?: Set<string>; knownSkillNames?: Set<string> } = {},
    ): Promise<{ ok: true; def: PipelineDefinition } | { ok: false; errors: PipelineValidationError[] }> => {
      if (!client || !workspaceId) {
        return { ok: false, errors: [] };
      }

      // 编译期校验
      const errors = validatePipeline(def, opts);
      if (errors.length > 0) {
        return { ok: false, errors };
      }

      setSaveStatus("saving");
      setSaveError(null);
      try {
        const storage = createPipelineStorage(client);

        // 1. 写 pipeline 定义文件 + 更新 manifest
        const saved = await storage.save(workspaceId, def);

        // 2. 编译写出 agent + command
        await syncPipelineToWorkspace(client, workspaceId, saved);

        // 3. 失效缓存 → 触发 usePipelineDefinitions 重新请求
        invalidate();

        setSaveStatus("saved");
        return { ok: true, def: saved };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSaveError(msg);
        setSaveStatus("error");
        return { ok: false, errors: [] };
      }
    },
    [client, workspaceId, invalidate],
  );

  // ── createFromBlank ─────────────────────────────────────────────────────────
  const createFromBlank = useCallback((): PipelineDefinition => {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      name: "新建流水线",
      description: "",
      triggerCommand: `pipeline-${Date.now().toString(36)}`,
      scope: "custom",
      inputs: [
        {
          key: "goal",
          label: "目标",
          type: "textarea",
          required: true,
          placeholder: "本次流水线要完成什么？",
        },
      ],
      nodes: [],
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  // ── clone ───────────────────────────────────────────────────────────────────
  const clone = useCallback((def: PipelineDefinition): PipelineDefinition => {
    const now = new Date().toISOString();
    return {
      ...def,
      id: generateId(),
      name: `${def.name}（副本）`,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  // ── remove ──────────────────────────────────────────────────────────────────
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!client || !workspaceId) return;
      const storage = createPipelineStorage(client);

      // 先从 manifest 移除（tombstone）
      await storage.remove(workspaceId, id);

      // 尝试删除编译产物：覆写空内容标记 hidden（OpenWork 无 delete API）
      // agent md：覆写 hidden:true 可让 OpenCode 从列表过滤
      try {
        await client.writeWorkspaceFile(workspaceId, {
          path: `.opencode/agents/xingjing-pipeline-${id}.md`,
          content: `---\nname: xingjing-pipeline-${id}\nhidden: true\n---\n`,
          force: true,
        });
      } catch {
        // 忽略（文件可能不存在）
      }

      invalidate();
    },
    [client, workspaceId, invalidate],
  );

  // ── setDefault ──────────────────────────────────────────────────────────────
  const setDefault = useCallback(
    async (id: string): Promise<void> => {
      if (!client || !workspaceId) return;
      const storage = createPipelineStorage(client);
      await storage.setDefault(workspaceId, id);
      invalidate();
    },
    [client, workspaceId, invalidate],
  );

  return {
    save,
    createFromBlank,
    clone,
    remove,
    setDefault,
    saveStatus,
    saveError,
  };
}

// 使 PIPELINE_SCOPE_LABELS 对 tree-shaking 友好
void PIPELINE_SCOPE_LABELS;
