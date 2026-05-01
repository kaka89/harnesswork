import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { readActiveIterationTodo } from "../services/iterations-reader";
import { useDirGraph } from "./use-dir-graph";

export function useIterations(owClient: OpenworkServerClient | null | undefined) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  const { data: graph } = useDirGraph(owClient);

  return useQuery<string | null>({
    queryKey: ["xj", "wk", wsId, "iteration-todo"],
    queryFn: () => readActiveIterationTodo(owClient!, wsId!, graph!),
    enabled: !!owClient && !!wsId && !!graph,
    staleTime: 60_000,
  });
}
