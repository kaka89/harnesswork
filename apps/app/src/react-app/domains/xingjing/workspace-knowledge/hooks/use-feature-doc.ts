import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { readFile } from "../services/fs-primitives";
import { useDirGraph } from "./use-dir-graph";

export function useFeatureDoc(
  owClient: OpenworkServerClient | null | undefined,
  featureId: string | null | undefined,
) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  const { data: graph } = useDirGraph(owClient);

  return useQuery<string | null>({
    queryKey: ["xj", "wk", wsId, "feature-doc", featureId],
    queryFn: async () => {
      const featuresPath = graph?.nodes.features?.path ?? "product/features";
      if (!featureId) return null;
      for (const name of ["SDD.md", "PRD.md", "README.md"]) {
        const doc = await readFile(owClient!, wsId!, `${featuresPath}/${featureId}/${name}`);
        if (doc) return doc;
      }
      return null;
    },
    enabled: !!owClient && !!wsId && !!featureId && !!graph,
    staleTime: 60_000,
  });
}
