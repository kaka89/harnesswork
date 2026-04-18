/**
 * 编辑产品弹窗
 * 与新建产品弹窗保持功能一致：
 *   - 产品名称、描述（可编辑）
 *   - 独立版：Git 仓库地址（带检测按钮 + Token 支持）
 *   - 团队版：产品线 Git 地址（带检测按钮 + Token 支持）
 *   - 产品类型 / workDir / code（只读展示）
 */
import { Component, createSignal, Show } from 'solid-js';
import { Pencil, FolderOpen } from 'lucide-solid';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { type XingjingProduct } from '../../services/product-store';
import { GitInputRow, useGitInput } from './git-input';

interface Props {
  open: boolean;
  product: XingjingProduct;
  onClose: () => void;
}

const inputStyle = () => ({
  border: `1px solid ${themeColors.border}`,
  background: themeColors.surface,
  color: themeColors.text,
});

const EditProductModal: Component<Props> = (props) => {
  const { productStore } = useAppStore();

  // ── 可编辑字段 ──
  const [name, setName] = createSignal(props.product.name);
  const [description, setDescription] = createSignal(props.product.description ?? '');
  const [defaultBranch, setDefaultBranch] = createSignal(props.product.defaultBranch ?? 'main');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');

  // ── Git 输入（独立版：主 Git；团队版：产品线 Git）──
  const gitInput = useGitInput(
    props.product.productType === 'team'
      ? (props.product.teamStructure?.plGitUrl ?? '')
      : (props.product.gitUrl ?? ''),
  );

  // 当弹窗打开/产品切换时重置表单
  const resetForm = () => {
    setName(props.product.name);
    setDescription(props.product.description ?? '');
    setDefaultBranch(props.product.defaultBranch ?? 'main');
    setError('');
    gitInput.reset(
      props.product.productType === 'team'
        ? (props.product.teamStructure?.plGitUrl ?? '')
        : (props.product.gitUrl ?? ''),
    );
  };

  const handleClose = () => {
    if (saving()) return;
    props.onClose();
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmedName = name().trim();
    if (!trimmedName) { setError('产品名称不能为空'); return; }

    setError('');
    setSaving(true);
    try {
      // 提交 Token（如果用户勾选了记住）
      gitInput.commitToken();

      const patch: Partial<XingjingProduct> = {
        name: trimmedName,
        description: description().trim() || undefined,
      };

      if (props.product.productType === 'team') {
        // 更新产品线 Git 地址
        if (props.product.teamStructure) {
          patch.teamStructure = {
            ...props.product.teamStructure,
            plGitUrl: gitInput.gitUrl().trim() || undefined,
          };
        }
      } else {
        // solo 产品：更新主 Git 地址和默认分支
        patch.gitUrl = gitInput.gitUrl().trim() || undefined;
        patch.defaultBranch = defaultBranch().trim() || 'main';
      }

      await productStore.updateProduct(props.product.id, patch);
      props.onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div
          class="rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 overflow-y-auto"
          style={{ background: themeColors.surface, 'max-height': '90vh' }}
        >
          {/* 标题 */}
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-2">
              <Pencil size={18} style={{ color: chartColors.primary }} />
              <h2 class="text-lg font-semibold" style={{ color: themeColors.text }}>编辑产品</h2>
            </div>
            <button
              class="text-xl leading-none"
              style={{ color: themeColors.textMuted }}
              onClick={handleClose}
            >×</button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* 只读信息区 */}
            <div
              class="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: themeColors.bgSubtle, border: `1px solid ${themeColors.border}` }}
            >
              <div class="flex items-center gap-2">
                <span
                  class="text-xs px-2 py-0.5 rounded font-medium"
                  style={{
                    background: props.product.productType === 'team' ? '#7c3aed22' : '#0284c722',
                    color: props.product.productType === 'team' ? '#7c3aed' : '#0284c7',
                  }}
                >
                  {props.product.productType === 'team' ? '团队版' : '独立版'}
                </span>
                <Show when={props.product.code}>
                  <span class="text-xs font-mono" style={{ color: themeColors.textMuted }}>
                    编码：{props.product.code}
                  </span>
                </Show>
              </div>
              <div class="flex items-center gap-1 text-xs font-mono" style={{ color: themeColors.textMuted }}>
                <FolderOpen size={11} />
                <span class="truncate" title={props.product.workDir}>{props.product.workDir}</span>
              </div>
            </div>

            {/* 产品名称 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                产品名称 <span style={{ color: chartColors.error }}>*</span>
              </label>
              <input
                type="text"
                class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle()}
                placeholder="请输入产品名称"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                disabled={saving()}
              />
            </div>

            {/* 描述 */}
            <div>
              <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                描述 <span class="font-normal" style={{ color: themeColors.textMuted }}>（可选）</span>
              </label>
              <textarea
                class="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={inputStyle()}
                placeholder="简要描述该产品"
                rows={3}
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                disabled={saving()}
              />
            </div>

            {/* 独立版：主 Git 仓库地址 */}
            <Show when={props.product.productType !== 'team'}>
              <GitInputRow
                label="Git 地址"
                placeholder="git@github.com:me/my-product.git"
                value={gitInput.gitUrl()}
                onInput={gitInput.handleInput}
                onBlur={() => { if (gitInput.gitUrl().trim()) gitInput.runCheck(); }}
                onCheck={gitInput.runCheck}
                status={gitInput.gitStatus()}
                statusMsg={gitInput.gitStatusMsg()}
                platform={gitInput.gitPlatform()}
                token={gitInput.platformToken()}
                onTokenInput={gitInput.setPlatformToken}
                saveToken={gitInput.saveToken()}
                onSaveTokenChange={gitInput.setSaveToken}
              />
              {/* 默认分支 */}
              <div>
                <label class="block text-sm font-medium mb-1" style={{ color: themeColors.textSecondary }}>
                  默认分支
                </label>
                <input
                  type="text"
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                  style={inputStyle()}
                  placeholder="main"
                  value={defaultBranch()}
                  onInput={(e) => setDefaultBranch(e.currentTarget.value)}
                  disabled={saving()}
                />
                <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                  Agent 自动提交时使用的目标分支
                </p>
              </div>
            </Show>

            {/* 团队版：产品线 Git 地址 */}
            <Show when={props.product.productType === 'team'}>
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: themeColors.textMuted }}>
                  产品线仓库
                </div>
                <GitInputRow
                  label="产品线 Git 地址"
                  placeholder="git@github.com:org/my-product-pl.git"
                  value={gitInput.gitUrl()}
                  onInput={gitInput.handleInput}
                  onBlur={() => { if (gitInput.gitUrl().trim()) gitInput.runCheck(); }}
                  onCheck={gitInput.runCheck}
                  status={gitInput.gitStatus()}
                  statusMsg={gitInput.gitStatusMsg()}
                  platform={gitInput.gitPlatform()}
                  token={gitInput.platformToken()}
                  onTokenInput={gitInput.setPlatformToken}
                  saveToken={gitInput.saveToken()}
                  onSaveTokenChange={gitInput.setSaveToken}
                />
                <p class="text-xs mt-1" style={{ color: themeColors.textMuted }}>
                  各 Domain / App 的 Git 地址请在产品详情「新增 Domain / App」中管理
                </p>
              </div>
            </Show>

            {/* 错误提示 */}
            <Show when={error()}>
              <p
                class="text-sm rounded-lg px-3 py-2"
                style={{ color: chartColors.error, background: themeColors.errorBg }}
              >{error()}</p>
            </Show>

            {/* 操作按钮 */}
            <div class="flex gap-3 mt-2">
              <button
                type="button"
                disabled={saving()}
                class="flex-1 rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
                style={{
                  border: `1px solid ${themeColors.border}`,
                  color: themeColors.textSecondary,
                  background: themeColors.surface,
                }}
                onClick={handleClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving()}
                class="flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: themeColors.purple, color: 'white' }}
              >
                {saving() ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};

export default EditProductModal;
