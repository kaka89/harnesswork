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
import { setWorkingDirectory } from './opencode-client';
import { isTauriRuntime } from '../../utils';
import type { XingjingOpenworkContext } from '../stores/app-store';

// 动态获取 OpenCode 真实 baseUrl：Tauri 运行时从 engine_info 读取，浏览器内降级到默认端口
async function resolveOpenCodeInfo(): Promise<{ baseUrl: string; username: string; password: string }> {
  if (isTauriRuntime()) {
    try {
      const info = await engineInfo();
      if (info.running && info.baseUrl) {
        return {
          baseUrl: info.baseUrl.replace(/\/$/, ''),
          username: info.opencodeUsername?.trim() ?? '',
          password: info.opencodePassword?.trim() ?? '',
        };
      }
    } catch {
      // Tauri invoke 失败，降级
    }
  }
  return { baseUrl: 'http://127.0.0.1:4096', username: '', password: '' };
}

// 兼容旧用法
async function resolveOpenCodeBaseUrl(): Promise<string> {
  return (await resolveOpenCodeInfo()).baseUrl;
}

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 团队版产品中的独立 Domain 仓库描述 */
export interface TeamDomain {
  id: string;
  name: string;
  /** 用户输入的英文编码，用作目录名 */
  code?: string;
  slug: string;
  dir: string;        // 绝对路径 {workDir}/{slug}
  gitUrl?: string;
}

/** 团队版产品中的独立 App 仓库描述 */
export interface TeamApp {
  id: string;
  name: string;
  /** 用户输入的英文编码，用作目录名 */
  code?: string;
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
  /** 用户输入的英文编码，用作产品线目录名前缀（{code}-pl）*/
  code?: string;
  workDir: string;
  gitUrl?: string;
  /** 独立版：默认 Git 分支（默认 main）*/
  defaultBranch?: string;
  createdAt: string;
  /** 最后更新时间：切换产品、修改内容均会更新 */
  updatedAt?: string;
  description?: string;
  /** 产品类型：team = 多仓库模式，solo = Monorepo 模式（默认，向后兼容）*/
  productType?: 'team' | 'solo';
  /** 仅 team 类型产品有此字段 */
  teamStructure?: TeamStructure;
  /** OpenWork workspace ID（运行时填充，不持久化）*/
  _workspaceId?: string;
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

  // ── Load from OpenWork ──
  async function loadFromOpenWork(openworkCtx: XingjingOpenworkContext) {
    setLoading(true);
    try {
      // 从本地 localStorage 读取现有产品（包含 name、description 等元数据）
      const existingProducts = lsGetProducts();
      const synced: XingjingProduct[] = [];

      // 逐一验证每个已知产品是否在 OpenWork 中注册
      for (const p of existingProducts) {
        const wsId = await openworkCtx.resolveWorkspaceByDir(p.workDir);
        synced.push({ ...p, _workspaceId: wsId ?? undefined });
      }

      if (synced.length > 0) {
        setProducts(synced);
        lsSetProducts(synced);
      }
    } catch (e) {
      console.warn('[product-store] loadFromOpenWork failed, fallback to file', e);
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

  async function addProduct(product: Omit<XingjingProduct, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString();
    const newProduct: XingjingProduct = {
      ...product,
      id: `prod-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
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

  /**
   * 创建产品并同时在 OpenWork 中注册工作区。
   * 若 OpenWork 创建失败，仍然在本地创建产品（兜底）。
   */
  async function addProductWithOpenwork(
    product: Omit<XingjingProduct, 'id' | 'createdAt' | 'updatedAt' | '_workspaceId'>,
    openworkCtx: XingjingOpenworkContext,
  ) {
    const now = new Date().toISOString();
    const newProduct: XingjingProduct = {
      ...product,
      id: `prod-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };

    // 尝试在 OpenWork 中创建工作区
    try {
      const wsId = await openworkCtx.createWorkspaceByDir(product.workDir, product.name);
      if (wsId) {
        newProduct._workspaceId = wsId;

        // 在工作区创建后，安装一个名为 xingjing-context 的 Skill，记录产品上下文
        const skillContent = `# 星静产品上下文

## 产品信息
- 名称：${product.name}
- 编码：${product.code ?? 'N/A'}
- 工作目录：${product.workDir}
- 产品类型：${product.productType ?? 'solo'}
- 创建时间：${now}
${product.description ? `\n## 描述\n${product.description}` : ''}
`;
        try {
          await openworkCtx.upsertSkill(
            wsId,
            'xingjing-context',
            skillContent,
            `产品 ${product.name} 的星静上下文`
          );
          console.info(`[product-store] Created xingjing-context skill for workspace ${wsId}`);
        } catch (e) {
          console.warn(`[product-store] Failed to upsert xingjing-context skill:`, e);
        }
      }
    } catch (e) {
      console.warn('[product-store] Failed to create workspace in OpenWork, fallback to local only', e);
    }

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

    // 更新该产品的 updatedAt（切换也算使用）
    const updatedProducts = products().map(p =>
      p.id === productId
        ? { ...p, updatedAt: new Date().toISOString() }
        : p
    );
    setProducts(updatedProducts);
    await saveProducts(updatedProducts);

    // 更新偏好
    const updatedPrefs = { ...preferences(), activeProductId: productId };
    setPreferences(updatedPrefs);
    await savePreferences(updatedPrefs);

    // Re-initialize OpenCode client with the new product's workDir
    const { baseUrl, username, password } = await resolveOpenCodeInfo();
    setWorkingDirectory(product.workDir, baseUrl, { username, password });
  }

  async function setViewMode(mode: 'team' | 'solo') {
    const updatedPrefs = { ...preferences(), viewMode: mode };
    setPreferences(updatedPrefs);
    await savePreferences(updatedPrefs);

    // 自动选中该模式下最近更新的产品
    const modeProducts = products().filter(
      p => (p.productType ?? 'solo') === mode
    );
    if (modeProducts.length > 0) {
      const mostRecent = modeProducts.reduce((latest, p) => {
        const pTime = new Date(p.updatedAt ?? p.createdAt).getTime();
        const latestTime = new Date(latest.updatedAt ?? latest.createdAt).getTime();
        return pTime > latestTime ? p : latest;
      });
      await switchProduct(mostRecent.id);
    }
  }

  /** 通用产品更新函数，自动写入 updatedAt */
  async function updateProduct(
    productId: string,
    patch: Partial<Omit<XingjingProduct, 'id' | 'createdAt'>>,
  ) {
    const updated = products().map(p =>
      p.id === productId
        ? { ...p, ...patch, updatedAt: new Date().toISOString() }
        : p
    );
    setProducts(updated);
    await saveProducts(updated);
  }

  // ── Product initialization ──

  /**
   * 在指定 workDir 下初始化扁平化的 Solo 产品目录结构
   * 使用 Tauri 原生文件写入（不依赖 OpenCode），自动 mkdir -p 所有父目录
   * 匹配 ENGINEERING-STRUCTURE-SOLO.md 设计
   * @param productCode 产品英文编码
   */
  async function initializeProductDir(
    workDir: string,
    productName: string,
    productCode: string,
  ) {
    const fileList = buildProductFileList(productName, productCode);
    const result = await initProductDir(workDir, fileList);
    if (!result.ok) {
      throw new Error(result.error ?? '目录初始化失败');
    }
    console.info(`[xingjing] Initialized Solo product in ${workDir} (${result.count} files)`);
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
    /** 各层用户输入的英文编码，直接用作目录名 */
    codes: {
      productCode: string;
      domainCode: string;
      appCode: string;
    },
    gitUrls?: {
      pl?: string;
      domain?: string;
      app?: string;
    },
  ): Promise<TeamStructure> {
    // --- 使用用户输入的编码作为 slug ---
    const plSlug = `${codes.productCode}-pl`;
    const domainSlug = codes.domainCode;
    const appSlug = codes.appCode;

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
        code: codes.domainCode,
        slug: domainSlug,
        dir: domainDir,
        gitUrl: gitUrls?.domain || undefined,
      }],
      apps: [{
        id: `app-${Date.now() + 1}`,
        name: appName,
        code: codes.appCode,
        slug: appSlug,
        dir: appDir,
        gitUrl: gitUrls?.app || undefined,
      }],
    };
  }

  /** 向已有团队版产品新增 Domain（创建目录 + git init + 更新注册表） */
  async function addDomainToTeamProduct(
    productId: string,
    domainInfo: { name: string; code: string; gitUrl?: string },
  ) {
    const product = products().find(p => p.id === productId);
    if (!product || product.productType !== 'team' || !product.teamStructure) {
      throw new Error('目标产品不是团队版产品');
    }

    const domainSlug = domainInfo.code;
    const domainDir = `${product.workDir}/${domainSlug}`;

    const domainFiles = buildTeamDomainFiles(domainInfo.name, product.name);
    const result = await initProductDir(domainDir, domainFiles);
    if (!result.ok) throw new Error(`Domain 目录初始化失败: ${result.error}`);
    const gitResult = await runGitInit(domainDir);
    if (!gitResult.ok) throw new Error(`Domain git init 失败: ${gitResult.error}`);

    const newDomain: TeamDomain = {
      id: `domain-${Date.now()}`,
      name: domainInfo.name,
      code: domainInfo.code,
      slug: domainSlug,
      dir: domainDir,
      gitUrl: domainInfo.gitUrl || undefined,
    };

    const updated = products().map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        updatedAt: new Date().toISOString(),
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
    appInfo: { name: string; code: string; gitUrl?: string },
  ) {
    const product = products().find(p => p.id === productId);
    if (!product || product.productType !== 'team' || !product.teamStructure) {
      throw new Error('目标产品不是团队版产品');
    }

    const appSlug = appInfo.code;
    const appDir = `${product.workDir}/apps/${appSlug}`;

    const appFiles = buildTeamAppFiles(appInfo.name, product.name);
    const result = await initProductDir(appDir, appFiles);
    if (!result.ok) throw new Error(`App 目录初始化失败: ${result.error}`);
    const gitResult = await runGitInit(appDir);
    if (!gitResult.ok) throw new Error(`App git init 失败: ${gitResult.error}`);

    const newApp: TeamApp = {
      id: `app-${Date.now()}`,
      name: appInfo.name,
      code: appInfo.code,
      slug: appSlug,
      dir: appDir,
      gitUrl: appInfo.gitUrl || undefined,
    };

    const updated = products().map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        updatedAt: new Date().toISOString(),
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
      resolveOpenCodeInfo().then(({ baseUrl, username, password }) => {
        setWorkingDirectory(product.workDir, baseUrl, { username, password });
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
    loadFromOpenWork,
    addProduct,
    addProductWithOpenwork,
    removeProduct,
    switchProduct,
    setViewMode,
    updateProduct,
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
