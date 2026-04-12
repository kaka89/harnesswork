/**
 * 星静产品注册表与偏好管理
 *
 * 产品信息存储在本地全局配置 ~/.xingjing/products.yaml
 * 当前模式偏好存储在 ~/.xingjing/preferences.yaml
 *
 * 通过 OpenCode file API 读写，降级到 localStorage 兜底。
 */

import { createSignal, createEffect } from 'solid-js';
import { readYaml, writeYaml } from './file-store';
import { initXingjingClient } from './opencode-client';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface XingjingProduct {
  id: string;
  name: string;
  workDir: string;
  gitUrl?: string;
  createdAt: string;
  description?: string;
}

export interface XingjingPreferences {
  activeProductId: string | null;
  viewMode: 'team' | 'solo';
}

export interface XingjingProductsFile {
  products: XingjingProduct[];
}

// ─── 路径常量 ────────────────────────────────────────────────────────────────

const PRODUCTS_FILE = '~/.xingjing/products.yaml';
const PREFERENCES_FILE = '~/.xingjing/preferences.yaml';
const XINGJING_DIR_STRUCTURE = [
  '.xingjing/config.yaml',
  '.xingjing/prds/',
  '.xingjing/sdds/',
  '.xingjing/contracts/',
  '.xingjing/tasks/',
  '.xingjing/sprints/',
  '.xingjing/planning/',
  '.xingjing/knowledge/',
  '.xingjing/quality/',
  '.xingjing/releases/',
  '.xingjing/metrics/',
  '.xingjing/solo/hypotheses/',
  '.xingjing/solo/feature-ideas/',
  '.xingjing/solo/adrs/',
  '.xingjing/solo/knowledge/',
  '.xingjing/solo/feedbacks/',
];

// ─── localStorage 兜底 ───────────────────────────────────────────────────────

const LS_PRODUCTS_KEY = 'xingjing:products';
const LS_PREFS_KEY = 'xingjing:preferences';

function lsGetProducts(): XingjingProduct[] {
  try {
    const raw = localStorage.getItem(LS_PRODUCTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as XingjingProduct[];
  } catch {
    return [];
  }
}

function lsSetProducts(products: XingjingProduct[]) {
  try {
    localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(products));
  } catch { /* ignore */ }
}

function lsGetPrefs(): XingjingPreferences {
  try {
    const raw = localStorage.getItem(LS_PREFS_KEY);
    if (!raw) return { activeProductId: null, viewMode: 'solo' };
    return JSON.parse(raw) as XingjingPreferences;
  } catch {
    return { activeProductId: null, viewMode: 'solo' };
  }
}

function lsSetPrefs(prefs: XingjingPreferences) {
  try {
    localStorage.setItem(LS_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ─── 产品注册表 Store ─────────────────────────────────────────────────────────

export function createProductStore() {
  const [products, setProducts] = createSignal<XingjingProduct[]>(lsGetProducts());
  const [preferences, setPreferences] = createSignal<XingjingPreferences>(lsGetPrefs());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const activeProduct = () => {
    const prefs = preferences();
    if (!prefs.activeProductId) return null;
    return products().find((p) => p.id === prefs.activeProductId) ?? null;
  };

  const viewMode = () => preferences().viewMode;

  // ── Load from file ──
  async function loadFromFile() {
    setLoading(true);
    try {
      const productsData = await readYaml<XingjingProductsFile>(
        PRODUCTS_FILE,
        { products: [] },
      );
      const prefsData = await readYaml<XingjingPreferences>(
        PREFERENCES_FILE,
        { activeProductId: null, viewMode: 'solo' },
      );

      const loadedProducts = productsData.products ?? [];
      const loadedPrefs = prefsData;

      if (loadedProducts.length > 0) {
        setProducts(loadedProducts);
        lsSetProducts(loadedProducts);
      }
      setPreferences(loadedPrefs);
      lsSetPrefs(loadedPrefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  // ── Save to file ──
  async function saveProducts(updatedProducts: XingjingProduct[]) {
    lsSetProducts(updatedProducts);
    await writeYaml(PRODUCTS_FILE, { products: updatedProducts } as unknown as Record<string, unknown>);
  }

  async function savePreferences(updatedPrefs: XingjingPreferences) {
    lsSetPrefs(updatedPrefs);
    await writeYaml(PREFERENCES_FILE, updatedPrefs as unknown as Record<string, unknown>);
  }

  // ── Actions ──

  async function addProduct(product: Omit<XingjingProduct, 'id' | 'createdAt'>) {
    const newProduct: XingjingProduct = {
      ...product,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...products(), newProduct];
    setProducts(updated);
    await saveProducts(updated);

    // Set as active if it's the first product
    if (updated.length === 1) {
      await switchProduct(newProduct.id);
    }

    return newProduct;
  }

  async function removeProduct(productId: string) {
    const updated = products().filter((p) => p.id !== productId);
    setProducts(updated);
    await saveProducts(updated);

    // If removed product was active, switch to first available
    if (preferences().activeProductId === productId) {
      const next = updated[0];
      if (next) {
        await switchProduct(next.id);
      } else {
        const updatedPrefs = { ...preferences(), activeProductId: null };
        setPreferences(updatedPrefs);
        await savePreferences(updatedPrefs);
      }
    }
  }

  async function switchProduct(productId: string) {
    const product = products().find((p) => p.id === productId);
    if (!product) return;

    const updatedPrefs = { ...preferences(), activeProductId: productId };
    setPreferences(updatedPrefs);
    await savePreferences(updatedPrefs);

    // Re-initialize OpenCode client with the new product's workDir
    initXingjingClient('http://127.0.0.1:4096', product.workDir);
  }

  async function setViewMode(mode: 'team' | 'solo') {
    const updatedPrefs = { ...preferences(), viewMode: mode };
    setPreferences(updatedPrefs);
    await savePreferences(updatedPrefs);
  }

  // ── Product initialization ──

  /**
   * 在指定 workDir 下创建 .xingjing/ 骨架目录结构
   */
  async function initializeProductDir(workDir: string, productName: string) {
    const config = {
      name: productName,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    };
    await writeYaml(`${workDir}/.xingjing/config.yaml`, config as unknown as Record<string, unknown>);
    // Other directories are created implicitly when files are written
    console.info(`[xingjing] Initialized .xingjing/ in ${workDir}`);
  }

  // ── Side effects ──
  // When active product changes, update the OpenCode client
  createEffect(() => {
    const product = activeProduct();
    if (product) {
      initXingjingClient('http://127.0.0.1:4096', product.workDir);
    }
  });

  return {
    // State
    products,
    preferences,
    loading,
    error,
    activeProduct,
    viewMode,
    XINGJING_DIR_STRUCTURE,
    // Actions
    loadFromFile,
    addProduct,
    removeProduct,
    switchProduct,
    setViewMode,
    initializeProductDir,
  };
}

export type ProductStore = ReturnType<typeof createProductStore>;
