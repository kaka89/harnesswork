/**
 * 新建产品弹窗
 * 用户输入产品名称、工作目录、可选 Git 地址后，创建 .xingjing/ 骨架结构
 */
import { Component, createSignal, Show } from 'solid-js';
import { useAppStore } from '../../stores/app-store';

interface Props {
  open: boolean;
  onClose: () => void;
}

const NewProductModal: Component<Props> = (props) => {
  const { productStore } = useAppStore();

  const [name, setName] = createSignal('');
  const [workDir, setWorkDir] = createSignal('');
  const [gitUrl, setGitUrl] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim()) { setError('请填写产品名称'); return; }
    if (!workDir().trim()) { setError('请填写工作目录路径'); return; }

    setError('');
    setCreating(true);
    try {
      // 初始化目录结构
      await productStore.initializeProductDir(workDir().trim(), name().trim());
      // 注册产品
      await productStore.addProduct({
        name: name().trim(),
        workDir: workDir().trim(),
        gitUrl: gitUrl().trim() || undefined,
        description: '',
      });
      // 重置表单
      setName('');
      setWorkDir('');
      setGitUrl('');
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Show when={props.open}>
      {/* 背景遮罩 */}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold text-gray-900">新建产品</h2>
            <button
              class="text-gray-400 hover:text-gray-600 text-xl leading-none"
              onClick={props.onClose}
            >×</button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* 产品名称 */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                产品名称 <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="例：我的 SaaS 产品"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </div>

            {/* 工作目录 */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                工作目录 <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                placeholder="/Users/me/projects/my-product"
                value={workDir()}
                onInput={(e) => setWorkDir(e.currentTarget.value)}
              />
              <p class="text-xs text-gray-400 mt-1">
                星静会在此目录下创建 <code class="bg-gray-100 px-1 rounded">.xingjing/</code> 数据目录
              </p>
            </div>

            {/* Git 地址（可选） */}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Git 地址 <span class="text-gray-400 font-normal">（可选）</span>
              </label>
              <input
                type="text"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                placeholder="git@github.com:me/my-product.git"
                value={gitUrl()}
                onInput={(e) => setGitUrl(e.currentTarget.value)}
              />
              <p class="text-xs text-gray-400 mt-1">
                配置后可将产品数据自动同步至私有仓库
              </p>
            </div>

            {/* 错误提示 */}
            <Show when={error()}>
              <p class="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error()}</p>
            </Show>

            {/* 提交按钮 */}
            <div class="flex gap-3 mt-2">
              <button
                type="button"
                class="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={props.onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating()}
                class="flex-1 bg-purple-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
