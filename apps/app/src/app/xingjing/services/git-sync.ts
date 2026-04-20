/**
 * Git 同步服务
 *
 * 策略：
 * - commit 和 push 均由用户主动触发，不做任何自动同步
 * - 用户可通过 AI 对话或 UI 按钮触发
 * - 通过 OpenWork Server 执行（遵循 ARCHITECTURE.md 规范）
 * - 降级方案：通过 callAgent 执行 shell 命令
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitCommitResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export interface GitPushResult {
  success: boolean;
  error?: string;
}

export interface GitStatus {
  uncommittedCount: number;
  lastCommit?: { hash: string; message: string; time: string };
  branch?: string;
  hasRemote: boolean;
}

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * 立即执行 Git commit
 * 用户点击"同步到 Git"按钮或通过 AI 对话触发
 */
export async function commitNow(
  workDir: string,
  message: string,
  paths?: string[],
): Promise<GitCommitResult> {
  try {
    // 优先通过 OpenWork Server API
    const serverUrl = getServerUrl();
    if (serverUrl) {
      const res = await fetch(`${serverUrl}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDir, message, paths }),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, hash: data.hash };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: (errData as any).error ?? `HTTP ${res.status}` };
    }

    // 降级方案：通过 shell 执行（仅 Host 模式）
    return await commitViaShell(workDir, message, paths);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 执行 Git push
 * 用户点击"推送到远端"或 AI 对话触发
 */
export async function pushToRemote(
  workDir: string,
  remote = 'origin',
  branch?: string,
): Promise<GitPushResult> {
  try {
    const serverUrl = getServerUrl();
    if (serverUrl) {
      const res = await fetch(`${serverUrl}/api/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDir, remote, branch }),
      });
      if (res.ok) return { success: true };
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: (errData as any).error ?? `HTTP ${res.status}` };
    }

    return await pushViaShell(workDir, remote, branch);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 获取当前 Git 状态（未提交变更数、最近 commit 等）
 * 用于 UI 展示 Git 状态徽章
 */
export async function getGitStatus(workDir: string): Promise<GitStatus> {
  try {
    const serverUrl = getServerUrl();
    if (serverUrl) {
      const res = await fetch(`${serverUrl}/api/git/status?workDir=${encodeURIComponent(workDir)}`);
      if (res.ok) return await res.json() as GitStatus;
    }

    // 降级：返回默认值
    return { uncommittedCount: 0, hasRemote: false };
  } catch {
    return { uncommittedCount: 0, hasRemote: false };
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getServerUrl(): string | null {
  // OpenWork Server 默认端口
  // 在 Tauri 环境中可通过 env/config 获取
  try {
    return (window as any).__OPENWORK_SERVER_URL__ ?? 'http://localhost:3456';
  } catch {
    return null;
  }
}

/**
 * 降级方案：通过 Tauri shell 执行 git commit
 */
async function commitViaShell(
  workDir: string,
  message: string,
  paths?: string[],
): Promise<GitCommitResult> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    // Stage files
    const addArgs = paths && paths.length > 0 ? paths : ['.'];
    await invoke('plugin:shell|execute', {
      program: 'git',
      args: ['-C', workDir, 'add', ...addArgs],
    });
    // Commit
    const result = await invoke('plugin:shell|execute', {
      program: 'git',
      args: ['-C', workDir, 'commit', '-m', message],
    }) as any;
    return { success: true, hash: result?.stdout?.trim()?.slice(0, 7) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 降级方案：通过 Tauri shell 执行 git push
 */
async function pushViaShell(
  workDir: string,
  remote: string,
  branch?: string,
): Promise<GitPushResult> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const args = ['-C', workDir, 'push', remote];
    if (branch) args.push(branch);
    await invoke('plugin:shell|execute', {
      program: 'git',
      args,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
