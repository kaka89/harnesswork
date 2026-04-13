/**
 * 新建产品弹窗
 * 用户选择本地工作目录、填写产品名称，可选填 Git 地址（支持私有仓库 Token 认证与检测）
 */
import { Component, createSignal, Show } from 'solid-js';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { isTauriRuntime } from '../../../utils';
import { pickDirectory, runGitLsRemote } from '../../../lib/tauri';
import { getGitToken, setGitToken } from '../../services/product-store';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Git 地址有效性状态 */
type GitCheckStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'warn';

/**
 * 简单校验 git 地址格式
 * SSH:   git@host:user/repo.git
 * HTTPS: https://host/user/repo.git
 */
function isGitFormatValid(url: string): boolean {
  if (!url.trim()) return false;
  const sshRe = /^git@[\w.-]+:[\w./-]+(\.git)?$/;
  const httpsRe = /^https?:\/\/[\w.-]+(:[0-9]+)?\/[\w./-]+(\.git)?$/;
  return sshRe.test(url.trim()) || httpsRe.test(url.trim());
}

/**
 * 解析 HTTPS git URL 的域名，返回 null 表示是 SSH/非 HTTP 地址
 */
function parseGitHost(url: string): string | null {
  const t = url.trim();
  if (t.startsWith('git@') || t.startsWith('ssh://')) return null;
  try { return new URL(t).hostname.toLowerCase(); }
  catch { return null; }
}

/**
 * 通过 GitHub REST API 检测仓库是否存在（有 CORS 头，浏览器可用）
 * 带 token 时可识别公开 + 私有仓库；无 token 时私有仓库返回 404
 */
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
    if (res.status === 403) return { valid: true, warn: true }; // rate limited
    return { valid: false, reason: `GitHub API 返回状态码 ${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { valid: false, reason: '检测超时，请确认网络连接' };
    return { valid: false, reason: '无法访问 GitHub API，请检查网络连接' };
  }
}

/** Git HTTP Smart Protocol 检测（Tauri 原生 HTTP，绕过 CORS） */
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

/**
 * 入口：按地址类型与平台选择最优检测策略
 * @param url   Git 地址
 * @param token 可选 HTTPS 平台 Access Token
 */
async function checkGitUrl(
  url: string,
  token?: string,
): Promise<{ valid: boolean; warn?: boolean; reason?: string }> {
  const trimmed = url.trim();
  if (!isGitFormatValid(trimmed)) {
    return { valid: false, reason: 'Git 地址格式不正确' };
  }

  // SSH 地址： Tauri 环境用系统 git ls-remote（依赖本地 SSH Key）
  if (trimmed.startsWith('git@') || trimmed.startsWith('ssh://')) {
    if (isTauriRuntime()) {
      const { reachable, error } = await runGitLsRemote(trimmed);
      return reachable ? { valid: true } : { valid: false, reason: error };
    }
    // 浏览器侧仅格式校验
    return { valid: true, warn: true, reason: 'SSH 格式正确（浏览器侧无法验证连通性，请在桌面端检测）' };
  }

  // HTTPS 地址——解析平台
  let urlObj: URL;
  try { urlObj = new URL(trimmed); }
  catch { return { valid: false, reason: 'URL 解析失败，请检查地址格式' }; }
  const host = urlObj.hostname.toLowerCase();

  // GitHub：始终用 REST API（不受 CORS/Smart-HTTP-401 干扰）
  if (host === 'github.com') {
    return checkViaGitHubApi(urlObj.pathname, token);
  }

  // 其他平台：Tauri 用原生 HTTP + Smart Protocol
  if (isTauriRuntime()) {
    return checkViaSmartHttp(trimmed, tauriFetch as unknown as typeof fetch);
  }
  // 浏览器无法可靠跨域检测
  return { valid: true, warn: true, reason: '⚠ 浏览器侧只能校验 GitHub 仓库，其他平台请在桌面端验证' };
}

const NewProductModal: Component<Props> = (props) => {
  const { productStore } = useAppStore();

  const [name, setName] = createSignal('');
  const [appName, setAppName] = createSignal('');
  const [workDir, setWorkDir] = createSignal('');
  const [gitUrl, setGitUrl] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');

  // Git 检测状态
  const [gitStatus, setGitStatus] = createSignal<GitCheckStatus>('idle');
  const [gitStatusMsg, setGitStatusMsg] = createSignal('');

  // 平台 Token
  const [gitPlatform, setGitPlatform] = createSignal<string | null>(null); // 'github.com' 等
  const [platformToken, setPlatformToken] = createSignal('');
  const [saveToken, setSaveToken] = createSignal(false);

  // ───── 工作目录选择 ─────
  const handlePickDir = async () => {
    if (isTauriRuntime()) {
      const result = await pickDirectory({ title: '选择工作目录' });
      if (result && typeof result === 'string') setWorkDir(result);
    } else {
      document.getElementById('xingjing-dir-picker')?.click();
    }
  };

  const handleWebDirPick = (e: Event) => {
    const files = (e.currentTarget as HTMLInputElement).files;
    if (files && files.length > 0) {
      const fullPath: string = (files[0] as any).path ||
        (files[0].webkitRelativePath.split('/')[0] ?? '');
      const dirName = files[0].webkitRelativePath.split('/')[0];
      setWorkDir(fullPath || dirName);
    }
  };

  // ───── Git 地址输入联动——平台检测 + 自动预填已存储 Token ─────
  const handleGitUrlInput = (val: string) => {
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
      // SSH 地址：无平台 Token
      setPlatformToken('');
      setSaveToken(false);
    }
  };

  // ───── Git 仓库检测 ─────
  const runGitCheck = async () => {
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

  const handleGitBlur = () => {
    if (gitUrl().trim()) runGitCheck();
  };

  // ───── 提交 ─────
  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim()) { setError('请填写产品名称'); return; }
    if (!appName().trim()) { setError('请填写首个应用名'); return; }
    if (!workDir().trim()) { setError('请选择工作目录'); return; }

    setError('');
    setCreating(true);
    try {
      // 保存 Token
      if (saveToken() && gitPlatform() && platformToken().trim()) {
        setGitToken(gitPlatform()!, platformToken().trim());
      }
      await productStore.initializeProductDir(workDir().trim(), name().trim(), appName().trim());
      await productStore.addProduct({
        name: name().trim(),
        workDir: workDir().trim(),
        gitUrl: gitUrl().trim() || undefined,
        description: '',
      });
      // 重置表单
      setName('');
      setAppName('');
      setWorkDir('');
      setGitUrl('');
      setGitStatus('idle');
      setGitStatusMsg('');
      setGitPlatform(null);
      setPlatformToken('');
      setSaveToken(false);
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = () => ({
    border: `1px solid ${themeColors.border}`,
    background: themeColors.surface,
    color: themeColors.text,
  });

  // Git 状态颜色
  const gitStatusColor = () => {
    const s = gitStatus();
    if (s === 'valid') return chartColors.success ?? '#22c55e';
    if (s === 'warn') return chartColors.warning ?? '#f59e0b';
    if (s === 'invalid') return chartColors.error;
    return themeColors.textMuted;
  };

  // Git 状态图标
  const gitStatusIcon = () => {
    const s = gitStatus();
    if (s === 'checking') return '⟳';
    if (s === 'valid') return '✓';
    if (s === 'warn') return '⚠';
    if (s === 'invalid') return '✗';
    return '';
  };

  return (
    <Show when={props.open}>
      {/* 背景遮罩 */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" style={{ background: themeColors.surface }}>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold" style={{ color: themeColors.text }}>新建产品</h2>
            <button
              class="text-xl leading-none"
              style={{ color: themeColors.textMuted }}
              onClick={props.onClose}
            >×</button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* 产品名称 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                产品名称 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
                placeholder="例：我的 SaaS 产品"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </div>

            {/* 首个应用名 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                首个应用名 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
                placeholder="例：api-server"
                value={appName()}
                onInput={(e) => setAppName(e.currentTarget.value)}
              />
              <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                Solo Monorepo 的首个应用名，将用于 apps/ 目录结构
              </p>
            </div>

            {/* 工作目录 —— 选择器 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                工作目录 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <div class="flex gap-2">
                <div
                  class="flex-1 rounded-lg px-3 py-2 text-sm font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    ...inputStyle(),
                    color: workDir() ? themeColors.text : themeColors.textMuted,
                    cursor: 'default',
                  }}
                  title={workDir()}
                >
                  {workDir() || '尚未选择目录'}
                </div>
                <button
                  type="button"
                  class="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors"
                  style={{
                    border: `1px solid ${themeColors.border}`,
                    color: themeColors.textSecondary,
                    background: themeColors.hover,
                  }}
                  onClick={handlePickDir}
                >
                  浏览…
                </button>
              </div>
              <input
                id="xingjing-dir-picker"
                type="file"
                // @ts-ignore webkitdirectory is non-standard
                webkitdirectory
                class="hidden"
                onChange={handleWebDirPick}
              />
              <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                星静会在此目录下初始化完整的 Solo Monorepo 目录结构
              </p>
            </div>

            {/* Git 地址（可选） */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                Git 地址 <span class="font-normal" style={{ color: themeColors.textMuted }}>（可选）</span>
              </label>
              {/* Git URL 输入行 */}
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                    style={{
                      ...inputStyle(),
                      'padding-right': gitStatus() !== 'idle' ? '1.8rem' : undefined,
                    }}
                    placeholder="git@github.com:me/my-product.git"
                    value={gitUrl()}
                    onInput={(e) => handleGitUrlInput(e.currentTarget.value)}
                    onBlur={handleGitBlur}
                  />
                  <Show when={gitStatus() !== 'idle'}>
                    <span
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-sm select-none"
                      style={{ color: gitStatusColor() }}
                    >
                      {gitStatusIcon()}
                    </span>
                  </Show>
                </div>
                {/* 手动检测按钮 */}
                <button
                  type="button"
                  disabled={!gitUrl().trim() || gitStatus() === 'checking'}
                  class="rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid ${themeColors.border}`,
                    color: themeColors.textSecondary,
                    background: themeColors.hover,
                  }}
                  onClick={runGitCheck}
                >
                  {gitStatus() === 'checking' ? '检测中…' : '检测'}
                </button>
              </div>

              {/* HTTPS 平台 Token 输入行（SSH 地址时隐藏） */}
              <Show when={gitPlatform() !== null}>
                <div class="flex items-center gap-2 mt-2">
                  <input
                    type="password"
                    class="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle()}
                    placeholder={`${gitPlatform()} Access Token（私有仓库必填）`}
                    value={platformToken()}
                    onInput={(e) => setPlatformToken(e.currentTarget.value)}
                  />
                  <label
                    class="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer select-none"
                    style={{ color: themeColors.textMuted }}
                  >
                    <input
                      type="checkbox"
                      checked={saveToken()}
                      onChange={(e) => setSaveToken(e.currentTarget.checked)}
                    />
                    记住
                  </label>
                </div>
              </Show>

              {/* 检测状态提示 */}
              <Show when={gitStatusMsg()}>
                <p class="text-xs mt-1" style={{ color: gitStatusColor() }}>
                  {gitStatusIcon()} {gitStatusMsg()}
                </p>
              </Show>
              <Show when={!gitStatusMsg()}>
                <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                  支持 SSH（自动使用系统 Key）和 HTTPS（私有仓库需填 Token）
                </p>
              </Show>
            </div>

            {/* 错误提示 */}
            <Show when={error()}>
              <p class="text-sm rounded-lg px-3 py-2" style={{ color: chartColors.error, background: themeColors.errorBg }}>{error()}</p>
            </Show>

            {/* 提交按钮 */}
            <div class="flex gap-3 mt-2">
              <button
                type="button"
                class="flex-1 rounded-lg py-2 text-sm transition-colors"
                style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
                onClick={props.onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating()}
                class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: themeColors.purple, color: 'white' }}
              >
                {creating() ? '创建中…' : '创建产品'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};

export default NewProductModal;
