/**
 * 新建产品弹窗
 * 支持两种产品类型：
 *   - 团队版（team）：产品线 / Domain / App 各自独立 git 仓库，位于父工作目录下
 *   - 独立版（solo）：Solo Monorepo，单一工作目录
 */
import { Component, createSignal, Show, For } from 'solid-js';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { isTauriRuntime } from '../../../utils';
import { pickDirectory, checkGitInstalled, installGit } from '../../../lib/tauri';
import { GitInputRow, useGitInput } from './git-input';
import type { SoloProductType } from '../../services/product-dir-structure';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 产品类型 */
type ProductType = 'team' | 'solo';

// ─── 主组件 ────────────────────────────────────────────────────────────────

/** 编码格式校验：仅允许英文字母和数字，不允许空格或特殊字符 */
function isValidCode(code: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(code.trim());
}

const NewProductModal: Component<Props> = (props) => {
  const { productStore, actions } = useAppStore();

  // ── 通用字段 ──
  const [productType, setProductType] = createSignal<ProductType>('team');
  const [name, setName] = createSignal('');
  const [productCode, setProductCode] = createSignal('');
  const [workDir, setWorkDir] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');

  // ── Git 安装确认弹窗状态 ──
  const [showGitInstallDialog, setShowGitInstallDialog] = createSignal(false);
  const [gitInstalling, setGitInstalling] = createSignal(false);
  const [gitInstallError, setGitInstallError] = createSignal('');
  // 暂存提交事件，待 git 安装完成后继续执行
  let pendingSubmitFn: (() => Promise<void>) | null = null;

  // ── 独立版（Solo）专用 ──
  const soloGit = useGitInput();
  const [soloProductType, setSoloProductType] = createSignal<SoloProductType>('web');

  const soloProductTypeOptions: { value: SoloProductType; label: string; desc: string }[] = [
    { value: 'web', label: '纯 Web', desc: '前端应用、落地页、官网' },
    { value: 'saas', label: 'SaaS', desc: '前端 + 后端全栈平台' },
    { value: 'h5', label: 'H5', desc: '移动端 H5 页面' },
  ];

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
      // Solo 模式只需产品名称和编码，不需要额外的应用层参数
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

    // 桌面端：先检测 git 是否可用
    if (isTauriRuntime()) {
      const { installed } = await checkGitInstalled();
      if (!installed) {
        // 暂存创建逻辑，待用户确认安装后继续
        pendingSubmitFn = doCreateProduct;
        setGitInstallError('');
        setShowGitInstallDialog(true);
        return;
      }
    }

    await doCreateProduct();
  };

  /** 实际创建产品的逻辑（检测 git 通过后执行） */
  const doCreateProduct = async () => {
    setError('');
    setCreating(true);
    try {
      if (productType() === 'solo') {
        soloGit.commitToken();
        await productStore.initializeProductDir(
          workDir().trim(),
          name().trim(),
          productCode().trim(),
          soloProductType(),
        );
        const newSoloProduct = await productStore.addProduct({
          name: name().trim(),
          code: productCode().trim(),
          workDir: workDir().trim(),
          gitUrl: soloGit.gitUrl().trim() || undefined,
          description: '',
          productType: 'solo',
          soloProductType: soloProductType(),
        });
        // 非首个产品不会自动激活，确保新产品处于活跃状态
        if (productStore.activeProduct()?.id !== newSoloProduct.id) {
          await productStore.switchProduct(newSoloProduct.id);
        }
        // 在 OpenWork 中为产品目录创建 workspace（静默失败，不阻断产品创建流程）
        await actions.ensureWorkspaceForActiveProduct().catch(() => null);
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
        const newTeamProduct = await productStore.addProduct({
          name: name().trim(),
          code: productCode().trim(),
          workDir: workDir().trim(),
          description: '',
          productType: 'team',
          teamStructure,
        });
        // 非首个产品不会自动激活，确保新产品处于活跃状态
        if (productStore.activeProduct()?.id !== newTeamProduct.id) {
          await productStore.switchProduct(newTeamProduct.id);
        }
        // 在 OpenWork 中为产品目录创建 workspace（静默失败，不阻断产品创建流程）
        await actions.ensureWorkspaceForActiveProduct().catch(() => null);
      }
      resetForm();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  /** 用户确认安装 git */
  const handleConfirmInstallGit = async () => {
    setGitInstalling(true);
    setGitInstallError('');
    const result = await installGit();
    setGitInstalling(false);
    if (result.ok) {
      setShowGitInstallDialog(false);
      // 安装成功，继续执行创建
      if (pendingSubmitFn) {
        pendingSubmitFn = null;
        await doCreateProduct();
      }
    } else {
      setGitInstallError(result.output ?? '安装失败，请手动安装 git');
    }
  };

  const resetForm = () => {
    setName('');
    setProductCode('');
    setWorkDir('');
    setDomainName('');
    setDomainCode('');
    setFirstAppName('');
    setFirstAppCode('');
    soloGit.reset();
    setSoloProductType('web');
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
        {/* Git 安装确认弹窗 */}
        <Show when={showGitInstallDialog()}>
          <div
            class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              class="rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
              style={{ background: themeColors.surface }}
            >
              <h3 class="text-base font-semibold mb-3" style={{ color: themeColors.text }}>
                需要安装 Git
              </h3>
              <p class="text-sm mb-4" style={{ color: themeColors.textSecondary }}>
                Git 未安装，OpenWork 需要安装 Git 才能初始化仓库。是否立即安装？
              </p>
              <Show when={gitInstallError()}>
                <p
                  class="text-xs rounded-lg px-3 py-2 mb-3"
                  style={{ color: chartColors.error, background: themeColors.errorBg }}
                >
                  {gitInstallError()}
                </p>
              </Show>
              <div class="flex gap-3">
                <button
                  type="button"
                  disabled={gitInstalling()}
                  class="flex-1 rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
                  style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
                  onClick={() => { setShowGitInstallDialog(false); pendingSubmitFn = null; }}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={gitInstalling()}
                  class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: themeColors.purple, color: 'white' }}
                  onClick={handleConfirmInstallGit}
                >
                  {gitInstalling() ? '正在安装 Git…' : '立即安装'}
                </button>
              </div>
            </div>
          </div>
        </Show>
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
                {productType() === 'team'
                  ? <>作为目录名使用：产品线目录 = <code>{productCode() || 'code'}-pl</code></>
                  : <>用于产品配置标识</>}
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
                  : '星静会在此目录下初始化产品目录结构（product/、iterations/、knowledge/ 等）'}
              </p>
            </div>

            {/* ── 独立版（Solo）专用字段 ── */}
            <Show when={productType() === 'solo'}>
              {/* Solo 产品类型选择 */}
              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.textSecondary }}>
                  产品类型
                </label>
                <div class="flex gap-2">
                  <For each={soloProductTypeOptions}>{(opt) =>
                    <button
                      type="button"
                      class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
                      style={{
                        background: soloProductType() === opt.value ? themeColors.purple : themeColors.bgSubtle,
                        color: soloProductType() === opt.value ? 'white' : themeColors.textSecondary,
                        border: `1px solid ${soloProductType() === opt.value ? themeColors.purple : themeColors.border}`,
                      }}
                      onClick={() => setSoloProductType(opt.value)}
                    >
                      {opt.label}
                      <span class="block text-xs font-normal mt-0.5 opacity-75">{opt.desc}</span>
                    </button>
                  }</For>
                </div>
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
                  : productType() === 'team' ? '创建团队版产品' : '创建独立版产品'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};

export default NewProductModal;
