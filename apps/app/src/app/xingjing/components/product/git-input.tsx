/**
 * 共享 Git 输入行组件与工具函数
 * 供 new-product-modal.tsx 和 edit-product-modal.tsx 复用
 */
import { Component, createSignal, Show } from 'solid-js';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { themeColors, chartColors } from '../../utils/colors';
import { isTauriRuntime } from '../../../utils';
import { runGitLsRemote } from '../../../lib/tauri';
import { getGitToken, setGitToken } from '../../services/product-store';

// ─── Git 检测状态类型 ─────────────────────────────────────────────────────────

export type GitCheckStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'warn';

// ─── Git 地址校验工具函数 ─────────────────────────────────────────────────────

export function isGitFormatValid(url: string): boolean {
  if (!url.trim()) return false;
  const sshRe = /^git@[\w.-]+:[\w./-]+(\.git)?$/;
  const httpsRe = /^https?:\/\/[\w.-]+(:[0-9]+)?\/[\w./-]+(\.git)?$/;
  return sshRe.test(url.trim()) || httpsRe.test(url.trim());
}

export function parseGitHost(url: string): string | null {
  const t = url.trim();
  if (t.startsWith('git@') || t.startsWith('ssh://')) return null;
  try { return new URL(t).hostname.toLowerCase(); }
  catch { return null; }
}

async function checkViaGitHubApi(
  pathname: string,
  token?: string,
): Promise<{ valid: boolean; warn?: boolean; reason?: string }> {
  const parts = pathname.replace(/\.git$/, '').replace(/^\//, '').split('/');
  if (parts.length < 2) {
    return { valid: false, reason: 'GitHub 仓库地址格式不正确，应为 github.com/owner/repo' };
  }
  const [owner, repo] = parts;
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'GET', headers, signal: controller.signal,
    });
    clearTimeout(tid);
    if (res.status === 200) return { valid: true };
    if (res.status === 404) {
      return token
        ? { valid: false, reason: '远端仓库不存在，请确认地址和 Token 是否正确' }
        : { valid: false, reason: '远端仓库不存在（私有仓库请填写 Token）' };
    }
    if (res.status === 401) return { valid: false, reason: 'Token 无效或权限不足，请检查 Personal Access Token' };
    if (res.status === 403) return { valid: true, warn: true };
    return { valid: false, reason: `GitHub API 返回状态码 ${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { valid: false, reason: '检测超时，请确认网络连接' };
    return { valid: false, reason: '无法访问 GitHub API，请检查网络连接' };
  }
}

async function checkViaSmartHttp(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ valid: boolean; warn?: boolean; reason?: string }> {
  const base = url.replace(/\.git\s*$/, '');
  const probeUrl = `${base}.git/info/refs?service=git-upload-pack`;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    const res = await fetchImpl(probeUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(tid);
    if (res.status === 200) return { valid: true };
    if (res.status === 401 || res.status === 403) {
      return { valid: true, warn: true, reason: '私有仓库或需认证（无法确认仓库是否存在）' };
    }
    if (res.status === 404) return { valid: false, reason: '远端仓库不存在，请确认地址是否正确' };
    return { valid: false, reason: `服务器返回异常状态码 ${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { valid: false, reason: '检测超时' };
    return { valid: false, reason: '无法连接到该地址，请确认主机名或网络是否可用' };
  }
}

export async function checkGitUrl(
  url: string,
  token?: string,
): Promise<{ valid: boolean; warn?: boolean; reason?: string }> {
  const trimmed = url.trim();
  if (!isGitFormatValid(trimmed)) {
    return { valid: false, reason: 'Git 地址格式不正确' };
  }
  if (trimmed.startsWith('git@') || trimmed.startsWith('ssh://')) {
    if (isTauriRuntime()) {
      const { reachable, error } = await runGitLsRemote(trimmed);
      return reachable ? { valid: true } : { valid: false, reason: error };
    }
    return { valid: true, warn: true, reason: 'SSH 格式正确（浏览器侧无法验证连通性，请在桌面端检测）' };
  }
  let urlObj: URL;
  try { urlObj = new URL(trimmed); }
  catch { return { valid: false, reason: 'URL 解析失败，请检查地址格式' }; }
  const host = urlObj.hostname.toLowerCase();
  if (host === 'github.com') {
    return checkViaGitHubApi(urlObj.pathname, token);
  }
  if (isTauriRuntime()) {
    return checkViaSmartHttp(trimmed, tauriFetch as unknown as typeof fetch);
  }
  return { valid: true, warn: true, reason: '⚠ 浏览器侧只能校验 GitHub 仓库，其他平台请在桌面端验证' };
}

// ─── GitInputRow 子组件 Props ─────────────────────────────────────────────────

export interface GitInputRowProps {
  label: string;
  placeholder?: string;
  value: string;
  onInput: (v: string) => void;
  onBlur?: () => void;
  onCheck: () => void;
  status: GitCheckStatus;
  statusMsg: string;
  platform: string | null;
  token: string;
  onTokenInput: (v: string) => void;
  saveToken: boolean;
  onSaveTokenChange: (v: boolean) => void;
}

// ─── GitInputRow 组件 ─────────────────────────────────────────────────────────

export const GitInputRow: Component<GitInputRowProps> = (props) => {
  const statusColor = () => {
    const s = props.status;
    if (s === 'valid') return chartColors.success ?? '#22c55e';
    if (s === 'warn') return chartColors.warning ?? '#f59e0b';
    if (s === 'invalid') return chartColors.error;
    return themeColors.textMuted;
  };
  const statusIcon = () => {
    const s = props.status;
    if (s === 'checking') return '⟳';
    if (s === 'valid') return '✓';
    if (s === 'warn') return '⚠';
    if (s === 'invalid') return '✗';
    return '';
  };

  const inputStyle = () => ({
    border: `1px solid ${themeColors.border}`,
    background: themeColors.surface,
    color: themeColors.text,
  });

  return (
    <div>
      <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
        {props.label} <span class="font-normal" style={{ color: themeColors.textMuted }}>（可选）</span>
      </label>
      <div class="flex gap-2">
        <div class="relative flex-1">
          <input
            type="text"
            class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{
              ...inputStyle(),
              'padding-right': props.status !== 'idle' ? '1.8rem' : undefined,
            }}
            placeholder={props.placeholder ?? 'git@github.com:org/repo.git'}
            value={props.value}
            onInput={(e) => props.onInput(e.currentTarget.value)}
            onBlur={props.onBlur}
          />
          <Show when={props.status !== 'idle'}>
            <span
              class="absolute right-2 top-1/2 -translate-y-1/2 text-sm select-none"
              style={{ color: statusColor() }}
            >{statusIcon()}</span>
          </Show>
        </div>
        <button
          type="button"
          disabled={!props.value.trim() || props.status === 'checking'}
          class="rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            border: `1px solid ${themeColors.border}`,
            color: themeColors.textSecondary,
            background: themeColors.hover,
          }}
          onClick={props.onCheck}
        >
          {props.status === 'checking' ? '检测中…' : '检测'}
        </button>
      </div>
      <Show when={props.platform !== null}>
        <div class="flex items-center gap-2 mt-2">
          <input
            type="password"
            class="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle()}
            placeholder={`${props.platform} Access Token（私有仓库必填）`}
            value={props.token}
            onInput={(e) => props.onTokenInput(e.currentTarget.value)}
          />
          <label
            class="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer select-none"
            style={{ color: themeColors.textMuted }}
          >
            <input
              type="checkbox"
              checked={props.saveToken}
              onChange={(e) => props.onSaveTokenChange(e.currentTarget.checked)}
            />
            记住
          </label>
        </div>
      </Show>
      <Show when={props.statusMsg}>
        <p class="text-xs mt-1" style={{ color: statusColor() }}>
          {statusIcon()} {props.statusMsg}
        </p>
      </Show>
    </div>
  );
};

// ─── useGitInput Hook ─────────────────────────────────────────────────────────

export function useGitInput(initialUrl = '') {
  const [gitUrl, setGitUrl] = createSignal(initialUrl);
  const [gitStatus, setGitStatus] = createSignal<GitCheckStatus>('idle');
  const [gitStatusMsg, setGitStatusMsg] = createSignal('');
  const [gitPlatform, setGitPlatform] = createSignal<string | null>(null);
  const [platformToken, setPlatformToken] = createSignal('');
  const [saveToken, setSaveToken] = createSignal(false);

  const handleInput = (val: string) => {
    setGitUrl(val);
    setGitStatus('idle');
    setGitStatusMsg('');
    const host = parseGitHost(val);
    setGitPlatform(host);
    if (host) {
      const saved = getGitToken(host);
      if (saved) { setPlatformToken(saved); setSaveToken(true); }
      else { setPlatformToken(''); setSaveToken(false); }
    } else {
      setPlatformToken('');
      setSaveToken(false);
    }
  };

  const runCheck = async () => {
    const url = gitUrl().trim();
    if (!url) { setGitStatus('idle'); setGitStatusMsg(''); return; }
    setGitStatus('checking');
    setGitStatusMsg('');
    const token = platformToken().trim() || undefined;
    const { valid, warn, reason } = await checkGitUrl(url, token);
    if (valid && !warn) {
      setGitStatus('valid');
      setGitStatusMsg(reason ?? '仓库可访问');
    } else if (valid && warn) {
      setGitStatus('warn');
      setGitStatusMsg(reason ?? '格式正确（无法确认连通性）');
    } else {
      setGitStatus('invalid');
      setGitStatusMsg(reason ?? '地址无效');
    }
  };

  const commitToken = () => {
    if (saveToken() && gitPlatform() && platformToken().trim()) {
      setGitToken(gitPlatform()!, platformToken().trim());
    }
  };

  const reset = (url = '') => {
    setGitUrl(url);
    setGitStatus('idle');
    setGitStatusMsg('');
    setGitPlatform(null);
    setPlatformToken('');
    setSaveToken(false);
  };

  return {
    gitUrl, setGitUrl, handleInput, runCheck, commitToken, reset,
    gitStatus, gitStatusMsg, gitPlatform, platformToken, setPlatformToken,
    saveToken, setSaveToken,
  };
}
