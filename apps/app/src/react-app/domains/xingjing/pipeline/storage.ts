/**
 * 星静流水线存储层（v1 · workspace-local JSON）
 *
 * 设计决策（详见 SDD §4）：
 * - 不引入 `@tauri-apps/plugin-fs`、`js-yaml`：零新依赖
 * - 每条 pipeline 存为 `<workspace>/.xingjing/pipelines/<id>.json`
 * - 由 `.xingjing/pipelines/_manifest.json` 维护 id 列表（OpenWork 无 listDir API）
 * - 删除采用 tombstone：从 manifest 移除 id，磁盘文件保留（无 delete API）
 * - IO 通道：OpenworkServerClient.{read,write}WorkspaceFile
 *
 * 线程/并发：save/remove 非原子；v1 单 workspace 单用户编辑，暂不加锁。
 * 若未来出现多端并发编辑，需改用 optimistic concurrency（baseUpdatedAt）。
 */

import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type {
  PipelineDefinition,
  PipelineManifest,
  PipelineScope,
} from "./types";

// ── 常量 ─────────────────────────────────────────────────────────────────────

export const PIPELINES_DIR = ".xingjing/pipelines";
export const MANIFEST_PATH = `${PIPELINES_DIR}/_manifest.md`;

const EMPTY_MANIFEST: PipelineManifest = {
  version: 1,
  ids: [],
  defaultByScope: {},
  updatedAt: new Date(0).toISOString(),
};

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function pipelineFilePath(id: string): string {
  return `${PIPELINES_DIR}/${id}.md`;
}

/** 从 OpenworkWorkspaceFileContent 兼容返回值中取出文本内容 */
function extractText(result: unknown): string {
  const r = result as { content?: string; text?: string } | null;
  if (!r) return "";
  return r.content ?? r.text ?? "";
}

/** 安全读取单个 JSON 文件；不存在或解析失败返回 null */
async function tryReadJson<T>(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
): Promise<T | null> {
  try {
    const res = await client.readWorkspaceFile(workspaceId, path);
    const text = extractText(res);
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
  data: unknown,
): Promise<void> {
  await client.writeWorkspaceFile(workspaceId, {
    path,
    content: JSON.stringify(data, null, 2),
    force: true,
  });
}

// ── Manifest ─────────────────────────────────────────────────────────────────

export async function readManifest(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<PipelineManifest> {
  const m = await tryReadJson<PipelineManifest>(client, workspaceId, MANIFEST_PATH);
  if (!m || m.version !== 1 || !Array.isArray(m.ids)) {
    return { ...EMPTY_MANIFEST, updatedAt: new Date().toISOString() };
  }
  return m;
}

async function writeManifest(
  client: OpenworkServerClient,
  workspaceId: string,
  manifest: PipelineManifest,
): Promise<void> {
  const next: PipelineManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(client, workspaceId, MANIFEST_PATH, next);
}

// ── Storage API ──────────────────────────────────────────────────────────────

export interface PipelineStorage {
  /** 读取 workspace 所有 pipeline 定义（按 manifest.ids 顺序） */
  list(workspaceId: string): Promise<PipelineDefinition[]>;
  /** 读取单条；不存在返回 null */
  get(workspaceId: string, id: string): Promise<PipelineDefinition | null>;
  /** 保存并更新 manifest；createdAt/updatedAt 自动补全 */
  save(workspaceId: string, def: PipelineDefinition): Promise<PipelineDefinition>;
  /** 从 manifest 移除 id（tombstone：不物理删除文件） */
  remove(workspaceId: string, id: string): Promise<void>;
  /** 将某条 pipeline 设为该 scope 的默认；同 scope 其他 pipeline 自动取消默认 */
  setDefault(workspaceId: string, id: string): Promise<void>;
  /** 首次 seed 预置模板；已存在（manifest 包含同 id）则跳过，尊重用户修改；返回本次新增的 pipeline 列表 */
  seedDefaults(
    workspaceId: string,
    defaults: PipelineDefinition[],
  ): Promise<PipelineDefinition[]>;
}

// ── 实现 ─────────────────────────────────────────────────────────────────────

export function createPipelineStorage(
  client: OpenworkServerClient,
): PipelineStorage {
  return {
    async list(workspaceId) {
      const manifest = await readManifest(client, workspaceId);
      if (manifest.ids.length === 0) return [];

      const results = await Promise.all(
        manifest.ids.map((id) =>
          tryReadJson<PipelineDefinition>(client, workspaceId, pipelineFilePath(id)),
        ),
      );
      return results.filter((d): d is PipelineDefinition => d !== null);
    },

    async get(workspaceId, id) {
      return tryReadJson<PipelineDefinition>(
        client,
        workspaceId,
        pipelineFilePath(id),
      );
    },

    async save(workspaceId, def) {
      const now = new Date().toISOString();
      const toWrite: PipelineDefinition = {
        ...def,
        createdAt: def.createdAt || now,
        updatedAt: now,
      };

      await writeJson(client, workspaceId, pipelineFilePath(toWrite.id), toWrite);

      // 更新 manifest
      const manifest = await readManifest(client, workspaceId);
      const nextIds = manifest.ids.includes(toWrite.id)
        ? manifest.ids
        : [...manifest.ids, toWrite.id];

      const nextDefault = { ...manifest.defaultByScope };
      if (toWrite.isDefault) {
        // 取消同 scope 其他默认 → 在写回时处理（避免在此处额外 write）
        nextDefault[toWrite.scope] = toWrite.id;
      } else if (nextDefault[toWrite.scope] === toWrite.id) {
        // 若之前是默认但 isDefault 被设为 false，清除反查
        delete nextDefault[toWrite.scope];
      }

      await writeManifest(client, workspaceId, {
        ...manifest,
        ids: nextIds,
        defaultByScope: nextDefault,
      });

      return toWrite;
    },

    async remove(workspaceId, id) {
      const manifest = await readManifest(client, workspaceId);
      if (!manifest.ids.includes(id)) return;

      const nextIds = manifest.ids.filter((x) => x !== id);
      const nextDefault = { ...manifest.defaultByScope };
      for (const scope of Object.keys(nextDefault) as PipelineScope[]) {
        if (nextDefault[scope] === id) {
          delete nextDefault[scope];
        }
      }

      await writeManifest(client, workspaceId, {
        ...manifest,
        ids: nextIds,
        defaultByScope: nextDefault,
      });
    },

    async setDefault(workspaceId, id) {
      const def = await tryReadJson<PipelineDefinition>(
        client,
        workspaceId,
        pipelineFilePath(id),
      );
      if (!def) {
        throw new Error(`Pipeline ${id} not found`);
      }

      // 1) 目标条打上 isDefault
      const now = new Date().toISOString();
      const updatedTarget: PipelineDefinition = {
        ...def,
        isDefault: true,
        updatedAt: now,
      };
      await writeJson(
        client,
        workspaceId,
        pipelineFilePath(id),
        updatedTarget,
      );

      // 2) 同 scope 其他条取消 isDefault
      const manifest = await readManifest(client, workspaceId);
      const peersSameScope = manifest.ids.filter((x) => x !== id);
      await Promise.all(
        peersSameScope.map(async (peerId) => {
          const peer = await tryReadJson<PipelineDefinition>(
            client,
            workspaceId,
            pipelineFilePath(peerId),
          );
          if (peer?.scope === def.scope && peer.isDefault) {
            await writeJson(client, workspaceId, pipelineFilePath(peerId), {
              ...peer,
              isDefault: false,
              updatedAt: now,
            });
          }
        }),
      );

      // 3) 更新 manifest 反查
      await writeManifest(client, workspaceId, {
        ...manifest,
        defaultByScope: { ...manifest.defaultByScope, [def.scope]: id },
      });
    },

    async seedDefaults(workspaceId, defaults) {
      const manifest = await readManifest(client, workspaceId);
      const existing = new Set(manifest.ids);

      const toSeed = defaults.filter((d) => !existing.has(d.id));
      if (toSeed.length === 0) return [];

      const now = new Date().toISOString();
      await Promise.all(
        toSeed.map((d) =>
          writeJson(client, workspaceId, pipelineFilePath(d.id), {
            ...d,
            createdAt: d.createdAt || now,
            updatedAt: now,
          }),
        ),
      );

      const nextIds = [...manifest.ids, ...toSeed.map((d) => d.id)];
      const nextDefault = { ...manifest.defaultByScope };
      for (const d of toSeed) {
        if (d.isDefault && !nextDefault[d.scope]) {
          nextDefault[d.scope] = d.id;
        }
      }

      await writeManifest(client, workspaceId, {
        ...manifest,
        ids: nextIds,
        defaultByScope: nextDefault,
      });

      return toSeed;
    },
  };
}
