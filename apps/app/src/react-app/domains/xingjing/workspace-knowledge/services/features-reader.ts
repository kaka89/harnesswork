import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph } from "../types/dir-graph";
import { readFile } from "./fs-primitives";

/** Read active feature head: finds status=dev feature and returns its doc truncated to maxBytes. */
export async function readActiveFeatureHead(
  client: OpenworkServerClient,
  workspaceId: string,
  graph: DirGraph,
  maxBytes = 3000,
): Promise<string | null> {
  const featuresPath = graph.nodes.features?.path ?? "product/features";

  // Read _index.yml to find active (status: dev) feature id
  const indexContent = await readFile(client, workspaceId, `${featuresPath}/_index.yml`);
  if (!indexContent) return null;

  const match = indexContent.match(/^- id:\s*(\S+)[\s\S]*?status:\s*dev/m);
  const featureId = match?.[1];
  if (!featureId) return null;

  // Try SDD.md first, then PRD.md
  for (const docName of ["SDD.md", "PRD.md", "README.md"]) {
    const doc = await readFile(client, workspaceId, `${featuresPath}/${featureId}/${docName}`);
    if (doc) return doc.slice(0, maxBytes);
  }
  return null;
}
