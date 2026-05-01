import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";

export interface AuditEntry {
  timestamp: string;
  action: string;
  detail?: string;
}

export async function listAuditTrail(
  client: OpenworkServerClient,
  workspaceId: string,
  limit = 20,
): Promise<AuditEntry[]> {
  try {
    const result = await client.listAudit(workspaceId);
    const items = Array.isArray(result) ? result : (result as unknown as { items?: AuditEntry[] }).items ?? [];
    return (items as AuditEntry[]).slice(-limit);
  } catch {
    return [];
  }
}
