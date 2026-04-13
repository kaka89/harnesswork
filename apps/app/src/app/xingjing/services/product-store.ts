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
import { buildProductFileList, buildTeamProductLineFiles, buildTeamDomainFiles, buildTeamAppFiles, buildTeamRootConfig } from './product-dir-structure';
import { initProductDir, runGitInit, engineInfo } from '../../lib/tauri';
import { initXingjingClient } from './opencode-client';
import { isTauriRuntime } from '../../utils';

// 动态获取 OpenCode 真实 baseUrl：Tauri 运行时从 engine_info 读取，浏览器内降级到默认端口
async function resolveOpenCodeBaseUrl(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      const info = await engineInfo();
      if (info.running && info.baseUrl) {
        return info.baseUrl.replace(/\/$/, '');
      }
    } catch {
      // Tauri invoke 失败，降级
    }
  }
  return 'http://127.0.0.1:4096';
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 团队版产品中的独立 Domain 仓库描述 */
export interface TeamDomain {
  id: string;
  name: string;
  slug: string;
  dir: string;        // 绝对路径 {workDir}/{slug}
  gitUrl?: string;
}

/** 团队版产品中的独立 App 仓库描述 */
export interface TeamApp {
  id: string;
  name: string;
  slug: string;
  dir: string;        // 绝对路径 {workDir}/apps/{slug}
  gitUrl?: string;
}

/** 团队版产品的多仓库结构描述 */
export interface TeamStructure {
  plSlug: string;
  plDir: string;      // 绝对路径 {workDir}/{plSlug}
  plGitUrl?: string;
  domains: TeamDomain[];
  apps: TeamApp[];
}

export interface XingjingProduct {
  id: string;
  name: string;
  workDir: string;
  gitUrl?: string;
  createdAt: string;
  description?: string;
  /** 产品类型：team = 多仓库模式，solo = Monorepo 模式（默认，向后兼容）*/
  productType?: 'team' | 'solo';
  /** 仅 team 类型产品有此字段 */
  teamStructure?: TeamStructure;
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
const XINGJING_DIR_STRUCTURE: string[] = []; // 动态生成，保留接口兼容

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
    if (!raw) return { activeProductId: null, viewMode: 'team' };
    return JSON.parse(raw) as XingjingPreferences;
  } catch {
    return { activeProductId: null, viewMode: 'team' };
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
        { activeProductId: null, viewMode: 'team' },
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
    const baseUrl = await resolveOpenCodeBaseUrl();
    initXingjingClient(baseUrl, product.workDir);
  }

  async function setViewMode(mode: 'team' | 'solo') {
    const updatedPrefs = { ...preferences(), viewMode: mode };
    setPreferences(updatedPrefs);
    await savePreferences(updatedPrefs);
  }

  // ── Product initialization ──

  /**
   * 在指定 workDir 下初始化完整的 Solo Monorepo 目录结构
   * 使用 Tauri 原生文件写入（不依赖 OpenCode），自动 mkdir -p 所有父目录
   * 严格对照 KNOWLEDGE-LIFECYCLE.md §7.1-7.4 + §8.3
   */
  async function initializeProductDir(workDir: string, productName: string, appName: string) {
    const fileList = buildProductFileList(productName, appName);
    const result = await initProductDir(workDir, fileList);
    if (!result.ok) {
      throw new Error(result.error ?? '目录初始化失败');
    }
    console.info(`[xingjing] Initialized Solo Monorepo in ${workDir} (${result.count} files)`);
  }

  /**
   * 初始化团队版产品：在 workDir 下创建产品线、Domain、App 三个独立子目录，
   * 各自 git init，可选绑定远端 Git 地址，并写入父目录 .xingjing/config.yaml
   * @returns 完整的 TeamStructure，供调用方存入产品记录
   */
  async function initializeTeamProduct(
    workDir: string,
    productName: string,
    domainName: string,
    appName: string,
    gitUrls?: {
      pl?: string;
      domain?: string;
      app?: string;
    },
  ): Promise<TeamStructure> {
    // --- 生成 slug ---
    const toKebab = (s: string) =>
      s.trim().replace(/[\s_]+/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-')
        .replace(/^-|-$/g, '').toLowerCase();

    const kebab = toKebab(productName);
    const plSlug = `${kebab}-pl`;
    const domainSlug = toKebab(domainName);
    const appSlug = toKebab(appName);

    const plDir = `${workDir}/${plSlug}`;
    const domainDir = `${workDir}/${domainSlug}`;
    const appDir = `${workDir}/apps/${appSlug}`;

    // --- 1. 写入父目录 .xingjing/config.yaml ---
    const rootFiles = buildTeamRootConfig(productName, plSlug, [domainSlug], [appSlug]);
    const rootResult = await initProductDir(workDir, rootFiles);
    if (!rootResult.ok) throw new Error(`父目录初始化失败: ${rootResult.error}`);

    // --- 2. 产品线仓库 ---
    const plFiles = buildTeamProductLineFiles(productName);
    const plResult = await initProductDir(plDir, plFiles);
    if (!plResult.ok) throw new Error(`产品线目录初始化失败: ${plResult.error}`);
    const plGitInit = await runGitInit(plDir);
    if (!plGitInit.ok) throw new Error(`产品线 git init 失败: ${plGitInit.error}`);

    // --- 3. Domain 仓库 ---
    const domainFiles = buildTeamDomainFiles(domainName, productName);
    const domainResult = await initProductDir(domainDir, domainFiles);
    if (!domainResult.ok) throw new Error(`Domain 目录初始化失败: ${domainResult.error}`);
    const domainGitInit = await runGitInit(domainDir);
    if (!domainGitInit.ok) throw new Error(`Domain git init 失败: ${domainGitInit.error}`);

    // --- 4. App 仓库 ---
    const appFiles = buildTeamAppFiles(appName, productName);
    const appResult = await initProductDir(appDir, appFiles);
    if (!appResult.ok) throw new Error(`App 目录初始化失败: ${appResult.error}`);
    const appGitInit = await runGitInit(appDir);
    if (!appGitInit.ok) throw new Error(`App git init 失败: ${appGitInit.error}`);

    console.info(`[xingjing] Initialized Team product in ${workDir}: pl=${plSlug}, domain=${domainSlug}, app=${appSlug}`);

    return {
      plSlug,
      plDir,
      plGitUrl: gitUrls?.pl || undefined,
      domains: [{
        id: `domain-${Date.now()}`,
        name: domainName,
        slug: domainSlug,
        dir: domainDir,
        gitUrl: gitUrls?.domain || undefined,
      }],
      apps: [{
        id: `app-${Date.now() + 1}`,
        name: appName,
        slug: appSlug,
        dir: appDir,
        gitUrl: gitUrls?.app || undefined,
      }],
    };
  }

  /** 向已有团队版产品新增 Domain（创建目录 + git init + 更新注册表） */
  async function addDomainToTeamProduct(
    productId: string,
    domainInfo: { name: string; gitUrl?: string },
  ) {
    const product = products().find(p => p.id === productId);
    if (!product || product.productType !== 'team' || !product.teamStructure) {
      throw new Error('目标产品不是团队版产品');
    }

    const toKebab = (s: string) =>
      s.trim().replace(/[\s_]+/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-')
        .replace(/^-|-$/g, '').toLowerCase();

    const domainSlug = toKebab(domainInfo.name);
    const domainDir = `${product.workDir}/${domainSlug}`;

    const domainFiles = buildTeamDomainFiles(domainInfo.name, product.name);
    const result = await initProductDir(domainDir, domainFiles);
    if (!result.ok) throw new Error(`Domain 目录初始化失败: ${result.error}`);
    const gitResult = await runGitInit(domainDir);
    if (!gitResult.ok) throw new Error(`Domain git init 失败: ${gitResult.error}`);

    const newDomain: TeamDomain = {
      id: `domain-${Date.now()}`,
      name: domainInfo.name,
      slug: domainSlug,
      dir: domainDir,
      gitUrl: domainInfo.gitUrl || undefined,
    };

    const updated = products().map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        teamStructure: {
          ...p.teamStructure!,
          domains: [...p.teamStructure!.domains, newDomain],
        },
      };
    });
    setProducts(updated);
    await saveProducts(updated);
    return newDomain;
  }

  /** 向已有团队版产品新增 App（创建目录 + git init + 更新注册表） */
  async function addAppToTeamProduct(
    productId: string,
    appInfo: { name: string; gitUrl?: string },
  ) {
    const product = products().find(p => p.id === productId);
    if (!product || product.productType !== 'team' || !product.teamStructure) {
      throw new Error('目标产品不是团队版产品');
    }

    const toKebab = (s: string) =>
      s.trim().replace(/[\s_]+/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-')
        .replace(/^-|-$/g, '').toLowerCase();

    const appSlug = toKebab(appInfo.name);
    const appDir = `${product.workDir}/apps/${appSlug}`;

    const appFiles = buildTeamAppFiles(appInfo.name, product.name);
    const result = await initProductDir(appDir, appFiles);
    if (!result.ok) throw new Error(`App 目录初始化失败: ${result.error}`);
    const gitResult = await runGitInit(appDir);
    if (!gitResult.ok) throw new Error(`App git init 失败: ${gitResult.error}`);

    const newApp: TeamApp = {
      id: `app-${Date.now()}`,
      name: appInfo.name,
      slug: appSlug,
      dir: appDir,
      gitUrl: appInfo.gitUrl || undefined,
    };

    const updated = products().map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        teamStructure: {
          ...p.teamStructure!,
          apps: [...p.teamStructure!.apps, newApp],
        },
      };
    });
    setProducts(updated);
    await saveProducts(updated);
    return newApp;
  }

  // ── Side effects ──
  // When active product changes, update the OpenCode client
  createEffect(() => {
    const product = activeProduct();
    if (product) {
      resolveOpenCodeBaseUrl().then(baseUrl => {
        initXingjingClient(baseUrl, product.workDir);
      });
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
    initializeTeamProduct,
    addDomainToTeamProduct,
    addAppToTeamProduct,
  };
}

export type ProductStore = ReturnType<typeof createProductStore>;

// ─── Git 平台 Token 存储 ───────────────────────────────────────────────────────────────────────────────
// 格式: { 'github.com': 'ghp_xxx', 'gitlab.com': 'glpat_xxx', ... }
const LS_GIT_TOKENS_KEY = 'xingjing:git-tokens';

export function getGitToken(host: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(LS_GIT_TOKENS_KEY) ?? '{}') as Record<string, string>;
    return map[host] ?? null;
  } catch { return null; }
}

export function setGitToken(host: string, token: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(LS_GIT_TOKENS_KEY) ?? '{}') as Record<string, string>;
    map[host] = token;
    localStorage.setItem(LS_GIT_TOKENS_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function clearGitToken(host: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(LS_GIT_TOKENS_KEY) ?? '{}') as Record<string, string>;
    delete map[host];
    localStorage.setItem(LS_GIT_TOKENS_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getAllGitTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_GIT_TOKENS_KEY) ?? '{}') as Record<string, string>;
  } catch { return {}; }
}
