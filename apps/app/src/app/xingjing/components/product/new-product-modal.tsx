/**
 * 新建产品弹窗
 * 支持两种产品类型：
 *   - 团队版（team）：产品线 / Domain / App 各自独立 git 仓库，位于父工作目录下
 *   - 独立版（solo）：Solo Monorepo，单一工作目录
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

/** 产品类型 */
type ProductType = 'team' | 'solo';

// ─── Git 检测工具函数（复用） ───────────────────────────────────────────────

function isGitFormatValid(url: string): boolean {
  if (!url.trim()) return false;
  const sshRe = /^git@[\w.-]+:[\w./-]+(\.git)?$/;
  const httpsRe = /^https?:\/\/[\w.-]+(:[0-9]+)?\/[\w./-]+(\.git)?$/;
  return sshRe.test(url.trim()) || httpsRe.test(url.trim());
}

function parseGitHost(url: string): string | null {
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

async function checkGitUrl(
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

// ─── 复用的 Git 输入行子组件 ────────────────────────────────────────────────

interface GitInputRowProps {
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

const GitInputRow: Component<GitInputRowProps> = (props) => {
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

// ─── 辅助 Hook：管理单个 Git 输入行状态 ────────────────────────────────────

function useGitInput() {
  const [gitUrl, setGitUrl] = createSignal('');
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

  const reset = () => {
    setGitUrl('');
    setGitStatus('idle');
    setGitStatusMsg('');
    setGitPlatform(null);
    setPlatformToken('');
    setSaveToken(false);
  };

  return {
    gitUrl, handleInput, runCheck, commitToken, reset,
    gitStatus, gitStatusMsg, gitPlatform, platformToken, setPlatformToken,
    saveToken, setSaveToken,
  };
}

// ─── 主组件 ────────────────────────────────────────────────────────────────

/** 编码格式校验：仅允许英文字母和数字，不允许空格或特殊字符 */
function isValidCode(code: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(code.trim());
}

const NewProductModal: Component<Props> = (props) => {
  const { productStore } = useAppStore();

  // ── 通用字段 ──
  const [productType, setProductType] = createSignal<ProductType>('team');
  const [name, setName] = createSignal('');
  const [productCode, setProductCode] = createSignal('');
  const [workDir, setWorkDir] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');

  // ── 独立版（Solo）专用 ──
  const [appName, setAppName] = createSignal('');
  const [soloAppCode, setSoloAppCode] = createSignal('');
  const soloGit = useGitInput();

  // ── 团队版（Team）专用 ──
  const [domainName, setDomainName] = createSignal('');
  const [domainCode, setDomainCode] = createSignal('');
  const [firstAppName, setFirstAppName] = createSignal('');
  const [firstAppCode, setFirstAppCode] = createSignal('');
  const plGit = useGitInput();
  const domainGit = useGitInput();
  const appGit = useGitInput();

  // ── 工作目录选择 ──
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

  // ── 提交 ──
  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim()) { setError('请填写产品名称'); return; }
    if (!productCode().trim() || !isValidCode(productCode())) {
      setError('产品编码只能包含英文字母和数字，不能有空格或特殊字符');
      return;
    }
    if (!workDir().trim()) { setError('请选择工作目录'); return; }

    if (productType() === 'solo') {
      if (!appName().trim()) { setError('请填写首个应用名'); return; }
      if (!soloAppCode().trim() || !isValidCode(soloAppCode())) {
        setError('应用编码只能包含英文字母和数字，不能有空格或特殊字符');
        return;
      }
    } else {
      if (!domainName().trim()) { setError('请填写首个 Domain 名称'); return; }
      if (!domainCode().trim() || !isValidCode(domainCode())) {
        setError('Domain 编码只能包含英文字母和数字，不能有空格或特殊字符');
        return;
      }
      if (!firstAppName().trim()) { setError('请填写首个 App 名称'); return; }
      if (!firstAppCode().trim() || !isValidCode(firstAppCode())) {
        setError('App 编码只能包含英文字母和数字，不能有空格或特殊字符');
        return;
      }
    }

    setError('');
    setCreating(true);
    try {
      if (productType() === 'solo') {
        soloGit.commitToken();
        await productStore.initializeProductDir(
          workDir().trim(),
          name().trim(),
          appName().trim(),
          productCode().trim(),
          soloAppCode().trim(),
        );
        await productStore.addProduct({
          name: name().trim(),
          code: productCode().trim(),
          workDir: workDir().trim(),
          gitUrl: soloGit.gitUrl().trim() || undefined,
          description: '',
          productType: 'solo',
        });
      } else {
        plGit.commitToken();
        domainGit.commitToken();
        appGit.commitToken();
        const teamStructure = await productStore.initializeTeamProduct(
          workDir().trim(),
          name().trim(),
          domainName().trim(),
          firstAppName().trim(),
          {
            productCode: productCode().trim(),
            domainCode: domainCode().trim(),
            appCode: firstAppCode().trim(),
          },
          {
            pl: plGit.gitUrl().trim() || undefined,
            domain: domainGit.gitUrl().trim() || undefined,
            app: appGit.gitUrl().trim() || undefined,
          },
        );
        await productStore.addProduct({
          name: name().trim(),
          code: productCode().trim(),
          workDir: workDir().trim(),
          description: '',
          productType: 'team',
          teamStructure,
        });
      }
      resetForm();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName('');
    setProductCode('');
    setWorkDir('');
    setAppName('');
    setSoloAppCode('');
    setDomainName('');
    setDomainCode('');
    setFirstAppName('');
    setFirstAppCode('');
    soloGit.reset();
    plGit.reset();
    domainGit.reset();
    appGit.reset();
  };

  const inputStyle = () => ({
    border: `1px solid ${themeColors.border}`,
    background: themeColors.surface,
    color: themeColors.text,
  });

  const typeBtnStyle = (type: ProductType) => ({
    background: productType() === type ? themeColors.purple : themeColors.bgSubtle,
    color: productType() === type ? 'white' : themeColors.textSecondary,
    border: `1px solid ${productType() === type ? themeColors.purple : themeColors.border}`,
  });

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          class="rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 overflow-y-auto"
          style={{ background: themeColors.surface, 'max-height': '90vh' }}
        >
          {/* 标题 */}
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold" style={{ color: themeColors.text }}>新建产品</h2>
            <button
              class="text-xl leading-none"
              style={{ color: themeColors.textMuted }}
              onClick={props.onClose}
            >×</button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* 产品类型切换 */}
            <div>
              <label class="block text-sm font-medium mb-2" style={{ color: themeColors.textSecondary }}>
                产品类型
              </label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
                  style={typeBtnStyle('team')}
                  onClick={() => setProductType('team')}
                >
                  团队版
                  <span class="block text-xs font-normal mt-0.5 opacity-75">多仓库 · 产品线/Domain/App 各自独立</span>
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
                  style={typeBtnStyle('solo')}
                  onClick={() => setProductType('solo')}
                >
                  独立版
                  <span class="block text-xs font-normal mt-0.5 opacity-75">单仓库 · Solo Monorepo</span>
                </button>
              </div>
            </div>

            {/* 产品名称（通用） */}
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

            {/* 产品编码（通用） */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                产品编码 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={inputStyle()}
                placeholder="例：myproduct（仅英文字母和数字）"
                value={productCode()}
                onInput={(e) => setProductCode(e.currentTarget.value)}
              />
              <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                作为目录名使用：产品线目录 = <code>{productCode() || 'code'}-pl</code>
              </p>
            </div>

            {/* 工作目录（通用，团队版为父目录） */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                {productType() === 'team' ? '父工作目录' : '工作目录'}
                {' '}<span style={{ color: chartColors.error }}>*</span>
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
                {productType() === 'team'
                  ? '星静将在此目录下创建产品线、Domain、App 三个独立子仓库'
                  : '星静会在此目录下初始化完整的 Solo Monorepo 目录结构'}
              </p>
            </div>

            {/* ── 独立版（Solo）专用字段 ── */}
            <Show when={productType() === 'solo'}>
              <div>
                <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                  首个应用名 <span style={{ color: chartColors.error }}>*</span>
                </label>
                <input
                  type="text"
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle()}
                  placeholder="例：支付服务"
                  value={appName()}
                  onInput={(e) => setAppName(e.currentTarget.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                  应用编码 <span style={{ color: chartColors.error }}>*</span>
                </label>
                <input
                  type="text"
                  class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                  style={inputStyle()}
                  placeholder="例：paymentapi（仅英文字母和数字）"
                  value={soloAppCode()}
                  onInput={(e) => setSoloAppCode(e.currentTarget.value)}
                />
                <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                  App 目录名 = <code>{soloAppCode() || 'code'}</code>
                </p>
              </div>

              <GitInputRow
                label="Git 地址"
                placeholder="git@github.com:me/my-product.git"
                value={soloGit.gitUrl()}
                onInput={soloGit.handleInput}
                onBlur={() => { if (soloGit.gitUrl().trim()) soloGit.runCheck(); }}
                onCheck={soloGit.runCheck}
                status={soloGit.gitStatus()}
                statusMsg={soloGit.gitStatusMsg()}
                platform={soloGit.gitPlatform()}
                token={soloGit.platformToken()}
                onTokenInput={soloGit.setPlatformToken}
                saveToken={soloGit.saveToken()}
                onSaveTokenChange={soloGit.setSaveToken}
              />
            </Show>

            {/* ── 团队版（Team）专用字段 ── */}
            <Show when={productType() === 'team'}>
              {/* 产品线 Git */}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: themeColors.textMuted }}>
                  产品线仓库
                </div>
                <GitInputRow
                  label="产品线 Git 地址"
                  placeholder="git@github.com:org/my-product-pl.git"
                  value={plGit.gitUrl()}
                  onInput={plGit.handleInput}
                  onBlur={() => { if (plGit.gitUrl().trim()) plGit.runCheck(); }}
                  onCheck={plGit.runCheck}
                  status={plGit.gitStatus()}
                  statusMsg={plGit.gitStatusMsg()}
                  platform={plGit.gitPlatform()}
                  token={plGit.platformToken()}
                  onTokenInput={plGit.setPlatformToken}
                  saveToken={plGit.saveToken()}
                  onSaveTokenChange={plGit.setSaveToken}
                />
              </div>

              {/* 首个 Domain */}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: themeColors.textMuted }}>
                  首个 Domain
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                    Domain 名称 <span style={{ color: chartColors.error }}>*</span>
                  </label>
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle()}
                    placeholder="例：支付域"
                    value={domainName()}
                    onInput={(e) => setDomainName(e.currentTarget.value)}
                  />
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                    Domain 编码 <span style={{ color: chartColors.error }}>*</span>
                  </label>
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                    style={inputStyle()}
                    placeholder="例：paymentdomain（仅英文字母和数字）"
                    value={domainCode()}
                    onInput={(e) => setDomainCode(e.currentTarget.value)}
                  />
                  <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                    Domain 目录名 = <code>{domainCode() || 'code'}</code>
                  </p>
                </div>
                <GitInputRow
                  label="Domain Git 地址"
                  placeholder="git@github.com:org/user-domain.git"
                  value={domainGit.gitUrl()}
                  onInput={domainGit.handleInput}
                  onBlur={() => { if (domainGit.gitUrl().trim()) domainGit.runCheck(); }}
                  onCheck={domainGit.runCheck}
                  status={domainGit.gitStatus()}
                  statusMsg={domainGit.gitStatusMsg()}
                  platform={domainGit.gitPlatform()}
                  token={domainGit.platformToken()}
                  onTokenInput={domainGit.setPlatformToken}
                  saveToken={domainGit.saveToken()}
                  onSaveTokenChange={domainGit.setSaveToken}
                />
              </div>

              {/* 首个 App */}
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: themeColors.textMuted }}>
                  首个 App
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                    App 名称 <span style={{ color: chartColors.error }}>*</span>
                  </label>
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle()}
                    placeholder="例：支付服务"
                    value={firstAppName()}
                    onInput={(e) => setFirstAppName(e.currentTarget.value)}
                  />
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                    App 编码 <span style={{ color: chartColors.error }}>*</span>
                  </label>
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                    style={inputStyle()}
                    placeholder="例：paymentapi（仅英文字母和数字）"
                    value={firstAppCode()}
                    onInput={(e) => setFirstAppCode(e.currentTarget.value)}
                  />
                  <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                    App 目录名 = <code>{firstAppCode() || 'code'}</code>
                  </p>
                </div>
                <GitInputRow
                  label="App Git 地址"
                  placeholder="git@github.com:org/api-server.git"
                  value={appGit.gitUrl()}
                  onInput={appGit.handleInput}
                  onBlur={() => { if (appGit.gitUrl().trim()) appGit.runCheck(); }}
                  onCheck={appGit.runCheck}
                  status={appGit.gitStatus()}
                  statusMsg={appGit.gitStatusMsg()}
                  platform={appGit.gitPlatform()}
                  token={appGit.platformToken()}
                  onTokenInput={appGit.setPlatformToken}
                  saveToken={appGit.saveToken()}
                  onSaveTokenChange={appGit.setSaveToken}
                />
              </div>
            </Show>

            {/* 错误提示 */}
            <Show when={error()}>
              <p
                class="text-sm rounded-lg px-3 py-2"
                style={{ color: chartColors.error, background: themeColors.errorBg }}
              >{error()}</p>
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
                {creating()
                  ? '创建中…'
                  : productType() === 'team' ? '创建团队版产品' : '创建产品'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};

export default NewProductModal;
