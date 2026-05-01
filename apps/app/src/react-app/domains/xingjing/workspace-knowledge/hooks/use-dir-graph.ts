import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { loadDirGraph } from "../services/dir-graph-loader";
import type { DirGraph } from "../types/dir-graph";

export function useDirGraph(owClient: OpenworkServerClient | null | undefined) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  return useQuery<DirGraph>({
    queryKey: ["xj", "wk", wsId, "dir-graph"],
    queryFn: () => loadDirGraph(owClient!, wsId!),
    enabled: !!owClient && !!wsId,
    staleTime: 30_000,
  });
}
