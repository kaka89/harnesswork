/**
 * 产品切换器
 * 显示当前产品名称，点击展开产品列表，支持切换和新建
 * UI 对齐 React 版本：空状态显示 inbox 图标 + "No data"，底部紫色"+ 新建产品"
 */
import { Component, createSignal, Show, For } from 'solid-js';
import { useAppStore } from '../../stores/app-store';
import { themeColors } from '../../utils/colors';
import NewProductModal from './new-product-modal';

const ProductSwitcher: Component = () => {
  const { productStore } = useAppStore();
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [newProductOpen, setNewProductOpen] = createSignal(false);

  const activeProduct = () => productStore.activeProduct();
  const products = () => productStore.products();

  const handleSwitch = async (id: string) => {
    await productStore.switchProduct(id);
    setDropdownOpen(false);
  };

  return (
    <>
      <div class="relative">
        {/* 触发按钮：样式对齐 React 版 Select 输入框 */}
        <button
          class="h-7 flex items-center gap-1 pl-2 pr-2 text-sm rounded-md cursor-pointer transition-colors"
          style={{
            "min-width": "140px",
            border: `1px solid ${themeColors.border}`,
            background: themeColors.surface,
          }}
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <span class="flex-1 text-left truncate" style={{ color: activeProduct() ? themeColors.text : themeColors.textMuted }}>
            {activeProduct()?.name ?? '选择或新建产品'}
          </span>
          <svg
            width="12" height="12" viewBox="0 0 12 12"
            fill="currentColor"
            style={{ color: themeColors.textMuted }}
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <Show when={dropdownOpen()}>
          {/* Backdrop */}
          <div
            class="fixed inset-0 z-40"
            onClick={() => setDropdownOpen(false)}
          />
          {/* Dropdown */}
          <div class="absolute top-full left-0 mt-1 w-52 rounded-lg shadow-lg z-50 overflow-hidden" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
            <Show
              when={products().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center py-6 px-3">
                  <svg
                    width="40" height="40" viewBox="0 0 64 64"
                    fill="none" xmlns="http://www.w3.org/2000/svg"
                    style={{ color: themeColors.textMuted }}
                    class="mb-2"
                  >
                    <path
                      d="M8 40h12l4 6h16l4-6h12V52a4 4 0 01-4 4H12a4 4 0 01-4-4V40z"
                      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                    />
                    <path
                      d="M8 40l8-24h32l8 24"
                      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                    />
                  </svg>
                  <span class="text-sm" style={{ color: themeColors.textMuted }}>No data</span>
                </div>
              }
            >
              <div class="py-1">
                <For each={products()}>
                  {(product) => (
                    <button
                      class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                      style={{
                        color: activeProduct()?.id === product.id ? themeColors.purple : themeColors.textSecondary,
                        'font-weight': activeProduct()?.id === product.id ? 500 : 400,
                      }}
                      onClick={() => handleSwitch(product.id)}
                    >
                      <span class="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: themeColors.purpleBg, color: themeColors.purple }}>
                        {product.name[0]}
                      </span>
                      <span class="truncate">{product.name}</span>
                      <Show when={activeProduct()?.id === product.id}>
                        <span class="ml-auto text-xs" style={{ color: themeColors.purple }}>✓</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            {/* 新建产品按钮：始终显示在底部 */}
            <div style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
              <button
                class="w-full text-left px-3 py-2 text-sm flex items-center gap-1.5 transition-colors"
                style={{ color: themeColors.purple }}
                onClick={() => { setDropdownOpen(false); setNewProductOpen(true); }}
              >
                <span class="text-sm font-medium">+</span>
                <span>新建产品</span>
              </button>
            </div>
          </div>
        </Show>
      </div>

      <NewProductModal
        open={newProductOpen()}
        onClose={() => setNewProductOpen(false)}
      />
    </>
  );
};

export default ProductSwitcher;
