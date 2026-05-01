import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";

/** Read a workspace-relative file path; returns null on any error. */
export async function readFile(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
): Promise<string | null> {
  try {
    const result = await client.readWorkspaceFile(workspaceId, path);
    return result.content;
  } catch {
    return null;
  }
}

/** Write content to a workspace-relative file path; returns false on any error. */
export async function writeFile(
  client: OpenworkServerClient,
  workspaceId: string,
  path: string,
  content: string,
): Promise<boolean> {
  try {
    const result = await client.writeWorkspaceFile(workspaceId, { path, content });
    return result.ok;
  } catch {
    return false;
  }
}
