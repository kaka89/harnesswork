import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph } from "../types/dir-graph";
import { readFile } from "./fs-primitives";

/** Read focus: tries runtime-yml files list from dir-graph, falls back to focus.yml. */
export async function readFocus(
  client: OpenworkServerClient,
  workspaceId: string,
  graph: DirGraph,
  maxBytes = 2000,
): Promise<string | null> {
  const runtimeFiles = graph.nodes.runtime?.files ?? ["focus.yml"];
  const focusFile = runtimeFiles.find((f) => f.includes("focus")) ?? "focus.yml";
  const content = await readFile(client, workspaceId, focusFile);
  return content ? content.slice(0, maxBytes) : null;
}

/** Read recent audit trail from listAudit API (last N entries summarized). */
export async function readRecentAudit(
  client: OpenworkServerClient,
  workspaceId: string,
  limit = 10,
): Promise<string | null> {
  try {
    const result = await client.listAudit(workspaceId);
    const items = (result as { items?: Record<string, unknown>[] }).items ?? [];
    const tail = items.slice(-limit);
    if (tail.length === 0) return null;
    return tail.map((e) => `[${e["timestamp"] ?? ""}] ${e["action"] ?? e["event"] ?? JSON.stringify(e)}`).join("\n");
  } catch {
    return null;
  }
}
