import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { useDirGraph } from "./use-dir-graph";
import { readActiveFeatureHead } from "../services/features-reader";
import { readActiveIterationTodo } from "../services/iterations-reader";
import { readFocus } from "../services/runtime-reader";

export interface WorkspaceKnowledgeSnapshot {
  focus: string | null;
  activeFeatureHead: string | null;
  activeIterationTodo: string | null;
}

export function useWorkspaceKnowledge(owClient: OpenworkServerClient | null | undefined) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  const { data: graph } = useDirGraph(owClient);

  return useQuery<WorkspaceKnowledgeSnapshot>({
    queryKey: ["xj", "wk", wsId, "snapshot"],
    queryFn: async () => ({
      focus: await readFocus(owClient!, wsId!, graph!),
      activeFeatureHead: await readActiveFeatureHead(owClient!, wsId!, graph!),
      activeIterationTodo: await readActiveIterationTodo(owClient!, wsId!, graph!),
    }),
    enabled: !!owClient && !!wsId && !!graph,
    staleTime: 60_000,
  });
}
