import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { readFile, writeFile } from "./fs-primitives";
import { DIR_GRAPH_PATH, serializeDirGraphTemplate } from "./dir-graph-loader";

/** Idempotently create .xingjing/dir-graph.yaml if missing. */
export async function ensureWorkspace(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<void> {
  const existing = await readFile(client, workspaceId, DIR_GRAPH_PATH);
  if (!existing) {
    await writeFile(client, workspaceId, DIR_GRAPH_PATH, serializeDirGraphTemplate());
  }
}

/** Idempotently create a node file if missing. */
export async function ensureNode(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
  defaultContent: string,
): Promise<void> {
  const existing = await readFile(client, workspaceId, path);
  if (!existing) {
    await writeFile(client, workspaceId, path, defaultContent);
  }
}
