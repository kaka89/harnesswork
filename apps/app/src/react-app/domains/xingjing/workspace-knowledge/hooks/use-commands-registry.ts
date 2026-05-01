import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useOpenworkStore } from "../../../../kernel/store";
import { registerCommands, listRegisteredCommands } from "../services/commands-registry";

export function useCommandsRegistry(owClient: OpenworkServerClient | null | undefined) {
  const wsId = useOpenworkStore((s) => s.activeWorkspaceId);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["xj", "wk", wsId, "commands"],
    queryFn: () => listRegisteredCommands(owClient!, wsId!),
    enabled: !!owClient && !!wsId,
    staleTime: 60_000,
  });

  const register = useMutation({
    mutationFn: () => registerCommands(owClient!, wsId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xj", "wk", wsId, "commands"] }),
  });

  return { ...query, register };
}
