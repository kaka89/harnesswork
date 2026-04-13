/**
 * 向已有团队版产品新增 Domain 或 App 的弹窗
 * - 创建独立子目录（{workDir}/{domainSlug}/ 或 {workDir}/apps/{appSlug}/）
 * - git init 并可选绑定远端 Git 地址
 * - 更新产品注册表
 */
import { Component, createSignal, Show } from 'solid-js';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { isTauriRuntime } from '../../../utils';
import { runGitLsRemote } from '../../../lib/tauri';
import { getGitToken, setGitToken, type XingjingProduct } from '../../services/product-store';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 目标团队版产品 */
  product: XingjingProduct;
  /** 新增类型 */
  mode: 'domain' | 'app';
}

type GitCheckStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'warn';

// ─── Git 检测（复用逻辑，与 new-product-modal 保持一致） ──────────────────

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
    return { valid: true, warn: true, reason: 'SSH 格式正确（浏览器侧无法验证连通性）' };
  }
  let urlObj: URL;
  try { urlObj = new URL(trimmed); }
  catch { return { valid: false, reason: 'URL 解析失败，请检查地址格式' }; }
  const host = urlObj.hostname.toLowerCase();
  if (host === 'github.com') {
    const parts = urlObj.pathname.replace(/\.git$/, '').replace(/^\//, '').split('/');
    if (parts.length < 2) return { valid: false, reason: 'GitHub 仓库地址格式不正确' };
    const [owner, repo] = parts;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        method: 'GET', headers, signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.status === 200) return { valid: true };
      if (res.status === 404) return { valid: false, reason: '远端仓库不存在' };
      if (res.status === 401) return { valid: false, reason: 'Token 无效或权限不足' };
      if (res.status === 403) return { valid: true, warn: true };
      return { valid: false, reason: `GitHub API 返回状态码 ${res.status}` };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { valid: false, reason: '检测超时' };
      return { valid: false, reason: '无法访问 GitHub API' };
    }
  }
  if (isTauriRuntime()) {
    const { fetch: tf } = await import('@tauri-apps/plugin-http');
    const base = trimmed.replace(/\.git\s*$/, '');
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await (tf as unknown as typeof fetch)(`${base}.git/info/refs?service=git-upload-pack`, {
        method: 'GET', signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.status === 200) return { valid: true };
      if (res.status === 401 || res.status === 403) return { valid: true, warn: true, reason: '私有仓库或需认证' };
      if (res.status === 404) return { valid: false, reason: '远端仓库不存在' };
      return { valid: false, reason: `状态码 ${res.status}` };
    } catch { return { valid: false, reason: '无法连接到该地址' }; }
  }
  return { valid: true, warn: true, reason: '⚠ 浏览器侧只能校验 GitHub 仓库' };
}

// ─── 主组件 ────────────────────────────────────────────────────────────────

const AddDomainAppModal: Component<Props> = (props) => {
  const { productStore } = useAppStore();

  const [itemName, setItemName] = createSignal('');
  const [itemCode, setItemCode] = createSignal('');
  const [gitUrl, setGitUrl] = createSignal('');
  const [gitStatus, setGitStatus] = createSignal<GitCheckStatus>('idle');
  const [gitStatusMsg, setGitStatusMsg] = createSignal('');
  const [gitPlatform, setGitPlatform] = createSignal<string | null>(null);
  const [platformToken, setPlatformToken] = createSignal('');
  const [saveToken, setSaveToken] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const modeLabel = () => props.mode === 'domain' ? 'Domain' : 'App';
  const namePlaceholder = () =>
    props.mode === 'domain' ? '例：支付域' : '例：支付服务';
  const codePlaceholder = () =>
    props.mode === 'domain' ? '例：paymentdomain（仅英文字母和数字）' : '例：paymentapi（仅英文字母和数字）';

  const handleGitInput = (val: string) => {
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
    const token = platformToken().trim() || undefined;
    const { valid, warn, reason } = await checkGitUrl(url, token);
    if (valid && !warn) {
      setGitStatus('valid'); setGitStatusMsg(reason ?? '仓库可访问');
    } else if (valid && warn) {
      setGitStatus('warn'); setGitStatusMsg(reason ?? '格式正确（无法确认连通性）');
    } else {
      setGitStatus('invalid'); setGitStatusMsg(reason ?? '地址无效');
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!itemName().trim()) { setError(`请填写 ${modeLabel()} 名称`); return; }
    if (!itemCode().trim() || !/^[a-zA-Z0-9]+$/.test(itemCode().trim())) {
      setError(`${modeLabel()} 编码只能包含英文字母和数字，不能有空格或特殊字符`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (saveToken() && gitPlatform() && platformToken().trim()) {
        setGitToken(gitPlatform()!, platformToken().trim());
      }
      if (props.mode === 'domain') {
        await productStore.addDomainToTeamProduct(props.product.id, {
          name: itemName().trim(),
          code: itemCode().trim(),
          gitUrl: gitUrl().trim() || undefined,
        });
      } else {
        await productStore.addAppToTeamProduct(props.product.id, {
          name: itemName().trim(),
          code: itemCode().trim(),
          gitUrl: gitUrl().trim() || undefined,
        });
      }
      setItemName('');
      setItemCode('');
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
      setSubmitting(false);
    }
  };

  const inputStyle = () => ({
    border: `1px solid ${themeColors.border}`,
    background: themeColors.surface,
    color: themeColors.text,
  });

  const gitStatusColor = () => {
    const s = gitStatus();
    if (s === 'valid') return chartColors.success ?? '#22c55e';
    if (s === 'warn') return chartColors.warning ?? '#f59e0b';
    if (s === 'invalid') return chartColors.error;
    return themeColors.textMuted;
  };

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
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          class="rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
          style={{ background: themeColors.surface }}
        >
          {/* 标题 */}
          <div class="flex items-center justify-between mb-5">
            <div>
              <h2 class="text-lg font-semibold" style={{ color: themeColors.text }}>
                新增 {modeLabel()}
              </h2>
              <p class="text-xs mt-0.5" style={{ color: themeColors.textMuted }}>
                产品：{props.product.name}
              </p>
            </div>
            <button
              class="text-xl leading-none"
              style={{ color: themeColors.textMuted }}
              onClick={props.onClose}
            >×</button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* 名称 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                {modeLabel()} 名称 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
                placeholder={namePlaceholder()}
                value={itemName()}
                onInput={(e) => setItemName(e.currentTarget.value)}
              />
            </div>

            {/* 编码 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                {modeLabel()} 编码 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={inputStyle()}
                placeholder={codePlaceholder()}
                value={itemCode()}
                onInput={(e) => setItemCode(e.currentTarget.value)}
              />
              <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                {props.mode === 'domain'
                  ? `Domain 目录名 = ${itemCode() || 'code'}（将在 ${props.product.workDir}/ 下创建）`
                  : `App 目录名 = ${itemCode() || 'code'}（将在 ${props.product.workDir}/apps/ 下创建）`}
              </p>
            </div>

            {/* Git 地址（可选） */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                Git 地址 <span class="font-normal" style={{ color: themeColors.textMuted }}>（可选）</span>
              </label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <input
                    type="text"
                    class="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
                    style={{
                      ...inputStyle(),
                      'padding-right': gitStatus() !== 'idle' ? '1.8rem' : undefined,
                    }}
                    placeholder="git@github.com:org/repo.git"
                    value={gitUrl()}
                    onInput={(e) => handleGitInput(e.currentTarget.value)}
                    onBlur={() => { if (gitUrl().trim()) runCheck(); }}
                  />
                  <Show when={gitStatus() !== 'idle'}>
                    <span
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-sm select-none"
                      style={{ color: gitStatusColor() }}
                    >{gitStatusIcon()}</span>
                  </Show>
                </div>
                <button
                  type="button"
                  disabled={!gitUrl().trim() || gitStatus() === 'checking'}
                  class="rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid ${themeColors.border}`,
                    color: themeColors.textSecondary,
                    background: themeColors.hover,
                  }}
                  onClick={runCheck}
                >
                  {gitStatus() === 'checking' ? '检测中…' : '检测'}
                </button>
              </div>

              {/* Token 输入 */}
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

              <Show when={gitStatusMsg()}>
                <p class="text-xs mt-1" style={{ color: gitStatusColor() }}>
                  {gitStatusIcon()} {gitStatusMsg()}
                </p>
              </Show>
            </div>

            {/* 错误提示 */}
            <Show when={error()}>
              <p
                class="text-sm rounded-lg px-3 py-2"
                style={{ color: chartColors.error, background: themeColors.errorBg }}
              >{error()}</p>
            </Show>

            {/* 按钮 */}
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
                disabled={submitting()}
                class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: themeColors.purple, color: 'white' }}
              >
                {submitting() ? '创建中…' : `新增 ${modeLabel()}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};

export default AddDomainAppModal;
