import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";

export class ReloadError extends Error {
  constructor(message: string, public readonly attempt: number) {
    super(message);
    this.name = "ReloadError";
  }
}

/** Reload workspace engine with 1 retry on failure. */
export async function reloadEngine(
  client: OpenworkServerClient,
  workspaceId: string,
  retryDelayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await client.reloadEngine(workspaceId);
      return;
    } catch (err) {
      if (attempt === 2) throw new ReloadError(String(err), attempt);
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
}
