import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph } from "../types/dir-graph";
import { readFile } from "./fs-primitives";

/** Simple keyword search: reads knowledge/_index.yml, then reads matching entry files. */
export async function searchKnowledge(
  client: OpenworkServerClient,
  workspaceId: string,
  graph: DirGraph,
  query: string,
  maxResults = 3,
  maxBytesEach = 1500,
): Promise<string[]> {
  const knowledgePath = graph.nodes.knowledge?.path ?? "knowledge";

  const indexContent = await readFile(client, workspaceId, `${knowledgePath}/_index.yml`);
  if (!indexContent) return [];

  const lq = query.toLowerCase();
  const ids: string[] = [];
  for (const line of indexContent.split("\n")) {
    if (line.toLowerCase().includes(lq)) {
      const m = line.match(/id:\s*(\S+)/);
      if (m) ids.push(m[1]);
      if (ids.length >= maxResults) break;
    }
  }

  const results: string[] = [];
  for (const id of ids) {
    const content = await readFile(client, workspaceId, `${knowledgePath}/${id}.md`);
    if (content) results.push(content.slice(0, maxBytesEach));
  }
  return results;
}
