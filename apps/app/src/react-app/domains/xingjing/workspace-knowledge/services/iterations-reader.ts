import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph } from "../types/dir-graph";
import { readFile } from "./fs-primitives";

/** Read active iteration: reads _index.yml then the most recent in-progress task file.
 *  iterations 节点的 buckets 中 tasks bucket 存放任务文件。
 */
export async function readActiveIterationTodo(
  client: OpenworkServerClient,
  workspaceId: string,
  graph: DirGraph,
  maxBytes = 3000,
): Promise<string | null> {
  const iterationsPath = graph.nodes.iterations?.path ?? "iterations";
  // tasks 在 iterations/tasks 子目录（buckets[1]）
  const tasksPath = `${iterationsPath}/tasks`;

  const indexContent = await readFile(client, workspaceId, `${tasksPath}/_index.yml`);
  if (!indexContent) return null;

  // Find latest task file marked in-progress or the last task id
  const match = indexContent.match(/^- id:\s*(\S+)[\s\S]*?status:\s*(in-progress|active)/m);
  const taskId = match?.[1] ?? indexContent.match(/^- id:\s*(\S+)/m)?.[1];
  if (!taskId) return null;

  const doc = await readFile(client, workspaceId, `${tasksPath}/${taskId}.md`);
  return doc ? doc.slice(0, maxBytes) : null;
}
