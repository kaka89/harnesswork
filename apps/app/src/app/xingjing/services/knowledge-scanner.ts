/**
 * dir-graph 驱动的文档知识扫描器
 *
 * 核心设计：不硬编码扫描路径，解析 .xingjing/dir-graph.yaml 作为权威文档地图，
 * 根据其中的 doc-types、layers、path-vars、doc-chain 结构化地扫描整个 workspace。
 *
 * 扫描流程（三步）：
 * 1. 解析 dir-graph.yaml
 * 2. 台账优先扫描（_index.yaml 存在时直接解析，否则文件系统扫描）
 * 3. 差异化提取（按文档类型差异化解析内容）
 */

import { fileRead, fileList } from './opencode-client';
import type { FileNode } from './opencode-client';
import { parseYamlSimple, parseFrontmatter } from './file-store';
import type { WorkspaceDocKnowledge, DirGraphConfig } from './knowledge-index';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DIR_GRAPH_PATH = '.xingjing/dir-graph.yaml';
const DOC_INDEX_OUTPUT = '.xingjing/solo/knowledge/_doc-index.json';

// ─── 主入口 ─────────────────────────────────────────────────────────────────

/**
 * 执行完整文档扫描，产出 WorkspaceDocKnowledge[]
 *
 * @param workDir 产品工作目录
 * @returns 扫描到的文档知识列表
 */
export async function scanWorkspaceDocs(
  workDir: string,
): Promise<WorkspaceDocKnowledge[]> {
  // Step 1: 解析 dir-graph.yaml
  const dirGraph = await loadDirGraph(workDir);
  if (!dirGraph) {
    console.warn('[knowledge-scanner] dir-graph.yaml not found, using fallback scan');
    return fallbackScan(workDir);
  }

  const results: WorkspaceDocKnowledge[] = [];

  // Step 2: 遍历 doc-types，台账优先扫描
  for (const [docTypeKey, docTypeDef] of Object.entries(dirGraph.docTypes)) {
    try {
      const docs = await scanDocType(workDir, dirGraph, docTypeKey, docTypeDef);
      results.push(...docs);
    } catch (e) {
      console.warn(`[knowledge-scanner] Failed to scan docType ${docTypeKey}:`, e);
    }
  }

  // Step 3: 若 dir-graph 扫描结果为空（路径配置与实际目录不符），
  // 自动触发通用降级扫描补充，确保用户文档不会因配置偏差而消失
  if (results.length === 0) {
    console.warn('[knowledge-scanner] dir-graph scan returned 0 docs, falling back to generic scan');
    const fallback = await fallbackScan(workDir);
    return fallback; // fallbackScan 已调用 saveScanResult，直接返回
  }

  // 去重（同一 filePath 只保留第一条）
  const deduped = results.filter((r, i, arr) => arr.findIndex(x => x.filePath === r.filePath) === i);

  // 保存扫描结果
  await saveScanResult(workDir, deduped);

  return deduped;
}

/**
 * 增量扫描：仅扫描指定路径的文档
 */
export async function scanSingleDoc(
  workDir: string,
  filePath: string,
): Promise<WorkspaceDocKnowledge | null> {
  const dirGraph = await loadDirGraph(workDir);
  if (!dirGraph) return null;

  // 从路径推断文档类型
  for (const [docTypeKey, docTypeDef] of Object.entries(dirGraph.docTypes)) {
    for (const location of docTypeDef.locations) {
      const resolvedLocation = resolvePathVars(location, dirGraph.pathVars);
      if (filePath.startsWith(resolvedLocation)) {
        return extractDocKnowledge(workDir, filePath, docTypeKey, docTypeDef, dirGraph);
      }
    }
  }

  return null;
}

// ─── Step 1: 解析 dir-graph.yaml ─────────────────────────────────────────────

async function loadDirGraph(workDir: string): Promise<DirGraphConfig | null> {
  try {
    const content = await fileRead(DIR_GRAPH_PATH, workDir);
    if (!content) return null;
    const raw = parseYamlSimple(content) as Record<string, unknown>;
    return normalizeDirGraph(raw);
  } catch {
    return null;
  }
}

function normalizeDirGraph(raw: Record<string, unknown>): DirGraphConfig {
  const pathVars = (raw['path-vars'] ?? raw['pathVars'] ?? {}) as Record<string, string | string[]>;

  // v2 格式用 areas:，v1 格式用 layers:，兼容两者
  const rawLayers = raw['layers'] ?? raw['areas'];
  const layers = Array.isArray(rawLayers)
    ? (rawLayers as Array<Record<string, unknown>>).map(l => ({
        id: String(l['id'] ?? ''),
        // v2 用 path:，v1 也用 path:，统一处理
        path: String(l['path'] ?? ''),
        contains: Array.isArray(l['contains']) ? l['contains'].map(String) : [],
      }))
    : [];

  // 将 v2 category 值（living/incremental/...）映射到 v1 规范值
  const normalizeCategory = (
    cat: unknown,
  ): 'baseline' | 'process-delivery' | 'process-research' => {
    const s = String(cat ?? '').toLowerCase();
    if (s === 'baseline' || s === 'living') return 'baseline';
    if (s === 'incremental' || s === 'process-delivery') return 'process-delivery';
    if (s === 'process-research') return 'process-research';
    return 'baseline';
  };

  const rawDocTypes = (raw['doc-types'] ?? raw['docTypes'] ?? {}) as Record<string, Record<string, unknown>>;
  const docTypes: DirGraphConfig['docTypes'] = {};
  for (const [key, def] of Object.entries(rawDocTypes)) {
    // 兼容 location（单数字符串）和 locations（复数数组）两种写法
    let locations: string[];
    if (Array.isArray(def['locations'])) {
      locations = def['locations'].map(String);
    } else if (typeof def['location'] === 'string') {
      locations = [def['location']];
    } else if (typeof def['locations'] === 'string') {
      locations = [def['locations']];
    } else {
      locations = [];
    }
    docTypes[key] = {
      category: normalizeCategory(def['category']),
      naming: String(def['naming'] ?? ''),
      locations,
      owner: String(def['owner'] ?? ''),
      upstream: Array.isArray(def['upstream']) ? def['upstream'].map(String) : undefined,
      downstream: Array.isArray(def['downstream']) ? def['downstream'].map(String) : undefined,
      index: def['index'] ? String(def['index']) : undefined,
    };
  }

  const rawDocChain = Array.isArray(raw['doc-chain'] ?? raw['docChain'])
    ? (raw['doc-chain'] ?? raw['docChain']) as Array<Record<string, string>>
    : [];
  const docChain = rawDocChain.map(c => ({
    from: String(c['from'] ?? ''),
    to: String(c['to'] ?? ''),
    gate: String(c['gate'] ?? ''),
  }));

  const rawAgents = (raw['agents'] ?? {}) as Record<string, Record<string, unknown>>;
  const agents: DirGraphConfig['agents'] = {};
  for (const [key, def] of Object.entries(rawAgents)) {
    agents[key] = {
      outputs: Array.isArray(def['outputs'])
        ? (def['outputs'] as Array<Record<string, string>>).map(o => ({
            type: String(o['type'] ?? ''),
            path: String(o['path'] ?? ''),
          }))
        : [],
    };
  }

  return {
    version: String(raw['version'] ?? '1'),
    mode: (raw['mode'] ?? 'solo') as 'solo' | 'team',
    pathVars,
    layers,
    docTypes,
    docChain,
    agents,
  };
}

// ─── Step 2: 台账优先扫描 ───────────────────────────────────────────────────

async function scanDocType(
  workDir: string,
  dirGraph: DirGraphConfig,
  docTypeKey: string,
  docTypeDef: DirGraphConfig['docTypes'][string],
): Promise<WorkspaceDocKnowledge[]> {
  const results: WorkspaceDocKnowledge[] = [];

  for (const location of docTypeDef.locations) {
    const resolvedPath = resolvePathVars(location, dirGraph.pathVars);

    // 占位符通配扫描：路径中仍有未解析的 {xxx} 时，遍历父目录展开
    const expandedPaths = resolvedPath.includes('{')
      ? await expandWildcardPaths(workDir, resolvedPath)
      : [resolvedPath];

    for (const expanded of expandedPaths) {
      // 如果展开后是具体文件路径（如 product/features/phone-login/PRD.md）
      if (/\.(md|yml|yaml)$/.test(expanded)) {
        const doc = await extractDocKnowledge(workDir, expanded, docTypeKey, docTypeDef, dirGraph);
        if (doc) results.push(doc);
        continue;
      }

      // 目录路径：台账优先，台账无结果则降级文件系统扫描
      let scannedFromIndex = false;
      if (docTypeDef.index) {
        const relativeIndexPath = expanded.endsWith('/') ? `${expanded}${docTypeDef.index}` : `${expanded}/${docTypeDef.index}`;
        const indexContent = await fileRead(relativeIndexPath, workDir);
        if (indexContent) {
          const docs = await scanFromIndex(workDir, indexContent, docTypeKey, docTypeDef, dirGraph, expanded);
          if (docs.length > 0) {
            results.push(...docs);
            scannedFromIndex = true;
          }
        }
      }

      // 降级：台账不存在或台账无有效条目时，文件系统扫描
      if (!scannedFromIndex) {
        const docs = await scanFromFileSystem(workDir, expanded, docTypeKey, docTypeDef, dirGraph);
        results.push(...docs);
      }
    }
  }

  return results;
}

/**
 * 展开路径中未解析的 {placeholder} 占位符
 *
 * 策略：找到第一个含 {xxx} 的路径段，列出其父目录下所有子目录，
 * 用子目录名替换占位符，递归展开剩余占位符。
 *
 * 示例：
 *   "product/features/{feature}/PRD.md"
 *   → ["product/features/phone-login/PRD.md"]
 *
 *   "knowledge/{category}/"
 *   → ["knowledge/insights/", "knowledge/pitfalls/", "knowledge/tech-notes/"]
 */
async function expandWildcardPaths(
  workDir: string,
  pathTemplate: string,
): Promise<string[]> {
  const match = pathTemplate.match(/\{([^}]+)\}/);
  if (!match) return [pathTemplate];

  const idx = match.index!;
  // 找到占位符所在段的父目录：截取到占位符前面最近的 /
  const beforePlaceholder = pathTemplate.slice(0, idx);
  const parentDir = beforePlaceholder.endsWith('/')
    ? beforePlaceholder
    : beforePlaceholder.slice(0, beforePlaceholder.lastIndexOf('/') + 1);
  // 占位符之后的路径（从占位符 } 后的 / 开始）
  const afterPlaceholder = pathTemplate.slice(idx + match[0].length);

  try {
    const items = await fileList(parentDir || '.', workDir);
    if (!items) return [];
    const dirs = items.filter(f => f.type === 'directory' && !f.name.startsWith('.'));
    const results: string[] = [];
    for (const dir of dirs) {
      const expandedPath = `${parentDir}${dir.name}${afterPlaceholder}`;
      // 递归展开剩余占位符
      const further = await expandWildcardPaths(workDir, expandedPath);
      results.push(...further);
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 从台账文件 _index.yaml 解析文档清单
 */
async function scanFromIndex(
  workDir: string,
  indexContent: string,
  docTypeKey: string,
  docTypeDef: DirGraphConfig['docTypes'][string],
  dirGraph: DirGraphConfig,
  basePath: string,
): Promise<WorkspaceDocKnowledge[]> {
  const results: WorkspaceDocKnowledge[] = [];
  try {
    const parsed = parseYamlSimple(indexContent);
    const items = Array.isArray(parsed['items']) ? parsed['items'] as Array<Record<string, unknown>> : [];

    for (const item of items) {
      // 兼容 path / id 两种定位方式：优先 path，其次从 id 推断文件名
      let filePath = item['path'] ? String(item['path']) : null;
      if (!filePath && item['id']) {
        filePath = `${String(item['id'])}.md`;
      }
      if (!filePath) continue;

      const fullFilePath = filePath.startsWith('/') ? filePath : `${basePath}/${filePath}`;
      const doc = await extractDocKnowledge(workDir, fullFilePath, docTypeKey, docTypeDef, dirGraph);
      if (doc) {
        // 从台账补充元数据
        if (item['status']) doc.frontmatter['status'] = item['status'];
        if (item['refs']) doc.frontmatter['refs'] = item['refs'];
        results.push(doc);
      }
    }
  } catch {
    // 台账解析失败，回退到文件系统扫描
  }
  return results;
}

/**
 * 文件系统扫描（降级路径）
 * 扫描目录下所有 .md 文件，并递归进入子目录（最多 2 层），
 * 确保 product/features/login/PRD.md 等嵌套文件被覆盖到。
 */
async function scanFromFileSystem(
  workDir: string,
  relativeDirPath: string,
  docTypeKey: string,
  docTypeDef: DirGraphConfig['docTypes'][string],
  dirGraph: DirGraphConfig,
  depth = 0,
): Promise<WorkspaceDocKnowledge[]> {
  if (depth > 2) return []; // 最多递归 2 层，防止无限深入
  const results: WorkspaceDocKnowledge[] = [];
  try {
    const files = await fileList(relativeDirPath, workDir);
    if (!files) return results;

    const basePath = relativeDirPath.endsWith('/') ? relativeDirPath : `${relativeDirPath}/`;

    for (const file of files) {
      if (file.type === 'file' && file.name.endsWith('.md') && matchesNaming(file.name, docTypeDef.naming)) {
        const relativePath = `${basePath}${file.name}`;
        const doc = await extractDocKnowledge(workDir, relativePath, docTypeKey, docTypeDef, dirGraph);
        if (doc) results.push(doc);
      } else if (file.type === 'directory' && !file.name.startsWith('.')) {
        // 递归扫描子目录
        const subDocs = await scanFromFileSystem(
          workDir,
          `${basePath}${file.name}`,
          docTypeKey,
          docTypeDef,
          dirGraph,
          depth + 1,
        );
        results.push(...subDocs);
      }
    }
  } catch {
    // 目录不存在或无权限
  }
  return results;
}

// ─── Step 3: 差异化提取 ──────────────────────────────────────────────────────

async function extractDocKnowledge(
  workDir: string,
  relativePath: string,
  docTypeKey: string,
  docTypeDef: DirGraphConfig['docTypes'][string],
  dirGraph: DirGraphConfig,
): Promise<WorkspaceDocKnowledge | null> {
  try {
    const content = await fileRead(relativePath, workDir);
    if (!content) return null;

    const { frontmatter: fm, body } = parseFrontmatter(content);
    const title = String(fm['title'] ?? fm['doc-type'] ?? extractTitleFromBody(body));
    const tags = extractTags(fm, body);
    const summary = extractSummary(docTypeKey, fm, body);
    const layer = inferLayer(relativePath, dirGraph);

    // 解析 doc-chain 上下游
    const upstream = dirGraph.docChain
      .filter(c => c.to === docTypeKey)
      .map(c => c.from);
    const downstream = dirGraph.docChain
      .filter(c => c.from === docTypeKey)
      .map(c => c.to);

    // 推断 owner（从 agents 映射）
    const owner = inferOwner(docTypeKey, dirGraph);

    const id = generateDocId(docTypeKey, relativePath);

    return {
      id,
      docType: docTypeKey,
      category: docTypeDef.category,
      layer,
      title,
      summary,
      tags,
      filePath: relativePath,
      owner,
      upstream,
      downstream,
      frontmatter: fm,
      lifecycle: (fm['lifecycle'] ?? 'living') as 'living' | 'stable',
      indexedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── 差异化摘要提取 ─────────────────────────────────────────────────────────

function extractSummary(
  docType: string,
  fm: Record<string, unknown>,
  body: string,
): string {
  const upper = docType.toUpperCase();

  // 优先使用 frontmatter.description
  if (fm['description']) return String(fm['description']).slice(0, 300);

  // 按文档类型差异化提取
  switch (upper) {
    case 'PRD':
      return extractSection(body, ['功能需求', '用户故事', '需求概述']) ?? body.slice(0, 500);
    case 'SDD':
      return extractSection(body, ['接口设计', '数据模型', '技术方案']) ?? body.slice(0, 500);
    case 'MODULE':
      return extractSection(body, ['行为规格', 'BH-']) ?? body.slice(0, 500);
    case 'GLOSSARY':
      return body.slice(0, 800); // 术语表需要更多内容
    case 'PLAN':
    case 'TASK':
      return extractSection(body, ['目标', '概述', '交付物']) ?? body.slice(0, 300);
    default:
      return body.slice(0, 500);
  }
}

function extractSection(body: string, sectionNames: string[]): string | null {
  for (const name of sectionNames) {
    const regex = new RegExp(`##\\s*.*${name}[\\s\\S]*?(?=\\n##\\s|$)`, 'i');
    const match = body.match(regex);
    if (match) return match[0].slice(0, 500);
  }
  return null;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function resolvePathVars(
  path: string,
  pathVars: Record<string, string | string[]>,
): string {
  let resolved = path;
  for (const [key, value] of Object.entries(pathVars)) {
    const placeholder = `{${key}}`;
    if (resolved.includes(placeholder)) {
      const replacement = Array.isArray(value) ? value[0] : value;
      resolved = resolved.replace(placeholder, replacement);
    }
  }
  return resolved;
}

function matchesNaming(fileName: string, naming: string): boolean {
  if (!naming) return true;
  // 简单匹配：naming 如 "PRD-{NNN}-{slug}.md"
  const prefix = naming.split('-')[0]?.split('{')[0];
  if (!prefix) return true;
  return fileName.toUpperCase().startsWith(prefix.toUpperCase());
}

function extractTitleFromBody(body: string): string {
  const firstLine = body.split('\n').find(l => l.startsWith('# '));
  return firstLine ? firstLine.replace(/^#\s*/, '').trim() : '未命名文档';
}

function extractTags(fm: Record<string, unknown>, body: string): string[] {
  if (Array.isArray(fm['tags'])) return fm['tags'].map(String);
  if (typeof fm['tags'] === 'string') return fm['tags'].split(',').map(s => s.trim());
  // 从 body 提取关键词作为 fallback
  const words = body.slice(0, 200).match(/[\u4e00-\u9fff]+/g) ?? [];
  return words.slice(0, 5);
}

function inferLayer(
  filePath: string,
  dirGraph: DirGraphConfig,
): string {
  // 从路径推断层级
  for (const layer of [...dirGraph.layers].reverse()) {
    const resolvedPath = resolvePathVars(layer.path, dirGraph.pathVars);
    if (filePath.startsWith(resolvedPath) || filePath.includes(`/${layer.id}/`)) {
      return layer.id;
    }
  }
  return 'application'; // 默认
}

function inferOwner(docType: string, dirGraph: DirGraphConfig): string {
  for (const [agentId, agentDef] of Object.entries(dirGraph.agents)) {
    for (const output of agentDef.outputs) {
      if (output.type === docType) return agentId;
    }
  }
  return '';
}

function generateDocId(docType: string, filePath: string): string {
  // 使用完整相对路径生成 ID，确保同名文件（如 phone-login/PRD.md 和 email-login/PRD.md）不会冲突
  const normalized = filePath.replace(/\.(md|yml|yaml)$/, '');
  return `${docType}-${normalized}`.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

// ─── 降级扫描 ────────────────────────────────────────────────────────────────

/**
 * 通用 .md 文件收集：扫描 dir 下所有 .md 文件（包含一层子目录），
 * 适用于 fallbackScan 及 dir-graph 未命中场景。
 */
async function collectMdFiles(
  workDir: string,
  dir: string,
  docType: string,
  results: WorkspaceDocKnowledge[],
  seen: Set<string>,
): Promise<void> {
  let files: FileNode[];
  try {
    files = await fileList(dir, workDir);
  } catch { return; }
  if (!files) return;

  for (const file of files) {
    if (file.type === 'file' && file.name.endsWith('.md')) {
      const filePath = `${dir}/${file.name}`;
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      try {
        const content = await fileRead(filePath, workDir);
        if (!content) continue;
        const { frontmatter: fm, body } = parseFrontmatter(content);
        // 从 frontmatter 或 body 推断文档类型
        const inferredDocType =
          String(fm['doc-type'] ?? fm['docType'] ?? fm['type'] ?? docType).toUpperCase();
        const title = String(fm['title'] ?? extractTitleFromBody(body) ?? file.name.replace('.md', ''));
        results.push({
          id: `scan-${inferredDocType}-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
          docType: inferredDocType,
          category: 'baseline',
          layer: inferLayerFromPath(filePath),
          title,
          summary: body.slice(0, 500),
          tags: extractTags(fm, body),
          filePath,
          owner: String(fm['owner'] ?? ''),
          upstream: [],
          downstream: [],
          frontmatter: fm,
          lifecycle: ((fm['lifecycle'] as string) === 'stable' ? 'stable' : 'living'),
          indexedAt: new Date().toISOString(),
        });
      } catch { /* silent */ }
    } else if (file.type === 'directory' && !file.name.startsWith('.')) {
      // 递归扫描一层子目录（避免过深，防止扫描 node_modules 等）
      await collectMdFiles(workDir, `${dir}/${file.name}`, docType, results, seen);
    }
  }
}

/** 从路径推断文档所属层级 */
function inferLayerFromPath(filePath: string): string {
  if (filePath.includes('/product/') || filePath.includes('/docs/product')) return 'product';
  if (filePath.includes('/features/') || filePath.includes('/feature/')) return 'feature';
  if (filePath.includes('/iterations/') || filePath.includes('/delivery/')) return 'iteration';
  if (filePath.includes('/knowledge/')) return 'knowledge';
  if (filePath.includes('/architecture/') || filePath.includes('/sdd/')) return 'architecture';
  return 'application';
}

/**
 * 降级扫描：dir-graph.yaml 不存在或解析失败时使用。
 * 扫描所有常见文档目录（含子目录），覆盖 Solo 和 Team 两种工作区结构。
 */
async function fallbackScan(workDir: string): Promise<WorkspaceDocKnowledge[]> {
  const results: WorkspaceDocKnowledge[] = [];
  const seen = new Set<string>();

  // 优先级排序的常见文档目录
  const scanDirs: Array<{ dir: string; docType: string }> = [
    // Solo 结构
    { dir: 'product',                 docType: 'PRODUCT' },
    { dir: 'product/features',        docType: 'PRD' },
    { dir: 'iterations',              docType: 'ITERATION' },
    { dir: 'knowledge',               docType: 'KNOWLEDGE' },
    // Team / 多层结构
    { dir: 'docs',                    docType: 'DOC' },
    { dir: 'docs/product',            docType: 'PRD' },
    { dir: 'docs/product/prd',        docType: 'PRD' },
    { dir: 'docs/product/architecture', docType: 'SDD' },
    { dir: 'docs/delivery',           docType: 'TASK' },
    // 私有知识库
    { dir: '.xingjing/solo/knowledge', docType: 'KNOWLEDGE' },
    // 根目录 .md 文件（README、OVERVIEW 等）
    { dir: '.',                        docType: 'DOC' },
  ];

  for (const { dir, docType } of scanDirs) {
    await collectMdFiles(workDir, dir, docType, results, seen);
  }

  // 去重（同一 filePath 只保留第一条）
  const deduped = results.filter((r, i, arr) => arr.findIndex(x => x.filePath === r.filePath) === i);

  await saveScanResult(workDir, deduped);
  return deduped;
}

// ─── 扫描结果持久化 ──────────────────────────────────────────────────────────

async function saveScanResult(
  workDir: string,
  results: WorkspaceDocKnowledge[],
): Promise<void> {
  try {
    const { fileWrite: fWrite } = await import('./opencode-client');
    // 确保父目录存在：先写入一个占位文件触发目录创建
    // OpenCode file.write 会自动创建中间目录
    await fWrite(DOC_INDEX_OUTPUT, JSON.stringify(results, null, 2), workDir);
  } catch (e) {
    console.warn('[knowledge-scanner] saveScanResult failed:', e);
  }
}
