import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { listAuditTrail } from "../services/audit";

export function useAudit(owClient: OpenworkServerClient | null | undefined, limit = 20) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  return useQuery({
    queryKey: ["xj", "wk", wsId, "audit", limit],
    queryFn: () => listAuditTrail(owClient!, wsId!, limit),
    enabled: !!owClient && !!wsId,
    staleTime: 30_000,
  });
}
