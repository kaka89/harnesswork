import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph } from "../types/dir-graph";
import { readFocus } from "./runtime-reader";
import { readActiveFeatureHead } from "./features-reader";
import { readActiveIterationTodo } from "./iterations-reader";
import { readRecentAudit } from "./runtime-reader";

function slot(tag: string, content: string | null): string {
  if (!content?.trim()) return "";
  return `<${tag}>\n${content.trim()}\n</${tag}>\n`;
}

/**
 * Build <workspace_context> XML string (≤budget_bytes budget).
 * Returns null if all slots are empty. Silent on any individual slot failure.
 */
export async function buildWorkspaceContext(
  client: OpenworkServerClient,
  workspaceId: string,
  graph: DirGraph,
): Promise<string | null> {
  const budget = graph.context_injection?.budget_bytes ?? 16_000;
  const order = graph.context_injection?.order ?? ["focus", "active_feature_head", "active_iteration_todo", "recent_audit"];

  const [focus, featureHead, iterationTodo, recentAudit] = await Promise.allSettled([
    readFocus(client, workspaceId, graph),
    readActiveFeatureHead(client, workspaceId, graph),
    readActiveIterationTodo(client, workspaceId, graph),
    readRecentAudit(client, workspaceId, 5),
  ]);

  const slotMap: Record<string, PromiseSettledResult<string | null>> = {
    focus,
    active_feature_head:   featureHead,
    active_iteration_todo: iterationTodo,
    recent_audit:          recentAudit,
  };

  const parts: string[] = [];
  for (const tag of order) {
    const r = slotMap[tag];
    if (r?.status === "fulfilled") parts.push(slot(tag, r.value));
  }

  const body = parts.filter(Boolean).join("\n");
  if (!body) return null;

  const xml = `<workspace_context>\n${body}</workspace_context>`;
  return new TextEncoder().encode(xml).length > budget
    ? xml.slice(0, budget) + "\n</workspace_context>"
    : xml;
}
