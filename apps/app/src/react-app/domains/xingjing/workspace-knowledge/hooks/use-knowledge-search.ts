import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { searchKnowledge } from "../services/knowledge-reader";
import { useDirGraph } from "./use-dir-graph";

export function useKnowledgeSearch(
  owClient: OpenworkServerClient | null | undefined,
  query: string,
) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  const { data: graph } = useDirGraph(owClient);

  return useQuery<string[]>({
    queryKey: ["xj", "wk", wsId, "knowledge-search", query],
    queryFn: () => searchKnowledge(owClient!, wsId!, graph!, query),
    enabled: !!owClient && !!wsId && !!graph && query.length > 0,
    staleTime: 30_000,
  });
}
