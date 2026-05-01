import React from "react";
import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import { useDirGraph } from "../hooks/use-dir-graph";
import { useSkillsRegistry } from "../hooks/use-skills-registry";
import { useCommandsRegistry } from "../hooks/use-commands-registry";
import { useAudit } from "../hooks/use-audit";
import { WK_SKILLS } from "../services/skills-registry";
import { WK_COMMANDS } from "../services/commands-registry";

interface Props {
  owClient: OpenworkServerClient | null | undefined;
}

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export function WorkspaceHealthPanel({ owClient }: Props) {
  const { data: graph, isLoading: graphLoading, error: graphError } = useDirGraph(owClient);
  const { data: skills } = useSkillsRegistry(owClient);
  const { data: commands } = useCommandsRegistry(owClient);
  const { data: audit } = useAudit(owClient, 5);

  const checks: CheckResult[] = [
    {
      label: "dir-graph.yaml",
      ok: !!graph && !graphError,
      detail: graphError ? String(graphError) : graph ? `${Object.keys(graph.nodes).length} nodes` : "loading...",
    },
    {
      label: "Skills registered",
      ok: Array.isArray(skills) && skills.length === WK_SKILLS.length,
      detail: `${Array.isArray(skills) ? skills.length : 0}/${WK_SKILLS.length}`,
    },
    {
      label: "Commands registered",
      ok: Array.isArray(commands) && commands.length === WK_COMMANDS.length,
      detail: `${Array.isArray(commands) ? commands.length : 0}/${WK_COMMANDS.length}`,
    },
    {
      label: "Node paths valid",
      ok: !!graph && Object.entries(graph.nodes)
        .filter(([k]) => k !== "openwork_native" && k !== "runtime")
        .every(([, n]) => n !== null && typeof n === "object" && "path" in n && typeof (n as { path: string }).path === "string"),
      detail: graph ? "all paths defined" : "-",
    },
    {
      label: "Audit trail readable",
      ok: Array.isArray(audit),
      detail: Array.isArray(audit) ? `${audit.length} entries` : "unavailable",
    },
  ];

  if (!owClient) return <div className="text-sm text-gray-400">No client available</div>;

  return (
    <div className="space-y-2 p-4">
      <h3 className="text-sm font-semibold">Workspace Knowledge Health</h3>
      {graphLoading && <div className="text-xs text-gray-400">Loading...</div>}
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-2 text-sm">
          <span className={c.ok ? "text-green-500" : "text-red-400"}>
            {c.ok ? "✓" : "✗"}
          </span>
          <span className="font-medium">{c.label}</span>
          {c.detail && <span className="text-gray-400 text-xs">{c.detail}</span>}
        </div>
      ))}
    </div>
  );
}
