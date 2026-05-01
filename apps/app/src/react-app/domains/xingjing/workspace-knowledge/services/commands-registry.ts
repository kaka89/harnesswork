import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";

export interface CommandDef {
  name: string;
  description: string;
  template: string;
}

export const WK_COMMANDS: CommandDef[] = [
  { name: "ws-init",      description: "Initialize workspace skeleton",        template: "Initialize workspace knowledge structure for the current workspace." },
  { name: "ws-reload",    description: "Reload workspace engine",              template: "Reload the workspace engine and refresh all skills and commands." },
  { name: "ws-audit",     description: "Show workspace audit trail",           template: "Show the last 20 workspace audit events." },
  { name: "ws-health",    description: "Check workspace health",               template: "Run a health check on the workspace knowledge configuration." },
  { name: "ws-context",   description: "Show current workspace context",       template: "Display the current workspace context that will be injected into pipelines." },
];

export async function registerCommands(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<void> {
  for (const cmd of WK_COMMANDS) {
    await client.upsertCommand(workspaceId, {
      name: cmd.name,
      description: cmd.description,
      template: cmd.template,
    });
  }
}

export async function listRegisteredCommands(
  client: OpenworkServerClient,
  workspaceId: string,
) {
  const all = await client.listCommands(workspaceId);
  const names = new Set(WK_COMMANDS.map((c) => c.name));
  return (Array.isArray(all) ? all : (all as { items?: unknown[] }).items ?? []).filter(
    (c) => names.has((c as { name: string }).name),
  );
}
