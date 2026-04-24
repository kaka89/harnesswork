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

import { fileRead, fileList } from './file-ops';
import type { FileNode } from './file-ops';

// ─── 会话级 fileList 缓存 ────────────────────────────────────────────────────
// 单次扫描过程中缓存 fileList 结果，避免对同一目录重复列举（并发展开时尤为明显）。
// Map key = "workDir::path"，value = 共享的 Promise，并发请求同一路径只发一次 IO。
let _scanFileListCache: Map<string, Promise<FileNode[]>> | null = null;

/** 带会话缓存的 fileList：同一次 scanWorkspaceDocs 中相同路径只列举一次 */
function cachedFileList(path: string, workDir?: string): Promise<FileNode[]> {
  if (!_scanFileListCache) return fileList(path, workDir);
  const key = `${workDir ?? ''}::${path}`;
  if (!_scanFileListCache.has(key)) {
    _scanFileListCache.set(key, fileList(path, workDir).catch(() => []));
  }
  return _scanFileListCache.get(key)!;
}
import { parseYamlSimple, parseFrontmatter } from './file-store';
import type { WorkspaceDocKnowledge, DirGraphConfig } from './knowledge-index';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DIR_GRAPH_PATH = '.xingjing/dir-graph.yaml';

// SDD-009: 知识扫描器支持的文档文件扩展名
const SCANNABLE_DOC_EXTENSIONS = ['.md', '.yml', '.yaml'];

/** 判断文件是否为可扫描的文档类型 */
function isScannableDoc(fileName: string): boolean {
  return SCANNABLE_DOC_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

/**
 * 判断文件是否为系统台账/元数据文件（不应被扫描为文档）。
 * 约定：以 _ 开头的文件（如 _index.yml、_plan.yaml）是台账文件，
 * 已通过 scanFromIndex 专门解析，不应在文件系统扫描中被重复当作普通文档。
 */
function isSystemIndexFile(fileName: string): boolean {
  return fileName.startsWith('_');
}

/** 判断文件路径是否为 YAML 格式 */
function isYamlFile(filePath: string): boolean {
  return filePath.endsWith('.yml') || filePath.endsWith('.yaml');
}

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
  // 初始化会话级 fileList 缓存（防止并发展开时重复列举同一目录）
  _scanFileListCache = new Map();

  try {
    // Step 1: 解析 dir-graph.yaml
    const dirGraph = await loadDirGraph(workDir);
    if (!dirGraph) {
      console.warn('[knowledge-scanner] dir-graph.yaml not found, using fallback scan');
      return fallbackScan(workDir);
    }

    // Step 2: 并发扫描所有 doc-types（T1.1：原串行 for...await → Promise.all）
    const allDocs = await Promise.all(
      Object.entries(dirGraph.docTypes).map(([docTypeKey, docTypeDef]) =>
        scanDocType(workDir, dirGraph, docTypeKey, docTypeDef).catch((e) => {
          console.warn(`[knowledge-scanner] Failed to scan docType ${docTypeKey}:`, e);
          return [] as WorkspaceDocKnowledge[];
        }),
      ),
    );
    const results = allDocs.flat();

    // Step 3: 若 dir-graph 扫描结果为空（路径配置与实际目录不符），
    // 自动触发通用降级扫描补充，确保用户文档不会因配置偏差而消失
    if (results.length === 0) {
      console.warn('[knowledge-scanner] dir-graph scan returned 0 docs, falling back to generic scan');
      return fallbackScan(workDir);
    }

    // 去重（同一 filePath 只保留第一条）
    return results.filter((r, i, arr) => arr.findIndex(x => x.filePath === r.filePath) === i);
  } finally {
    // 清理会话级缓存，避免跨次扫描残留
    _scanFileListCache = null;
  }
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
  // T1（locations 并发）：对每个 location 并发处理
  const locationResults = await Promise.all(
    docTypeDef.locations.map(async (location) => {
      const locationDocs: WorkspaceDocKnowledge[] = [];
      const resolvedPath = resolvePathVars(location, dirGraph.pathVars);

      // 占位符通配扫描：路径中仍有未解析的 {xxx} 时，遍历父目录展开
      const expandedPaths = resolvedPath.includes('{')
        ? await expandWildcardPaths(workDir, resolvedPath)
        : [resolvedPath];

      // T1（expandedPaths 并发）：并发处理所有展开路径
      await Promise.all(
        expandedPaths.map(async (expanded) => {
          // 如果展开后是具体文件路径（如 product/features/phone-login/PRD.md）
          if (/\.(md|yml|yaml)$/.test(expanded)) {
            const doc = await extractDocKnowledge(workDir, expanded, docTypeKey, docTypeDef, dirGraph);
            if (doc) locationDocs.push(doc);
            return;
          }

          // 目录路径：台账 + 文件系统并集扫描
          // 两路并发执行，台账结果优先（保留 status/refs 元数据），文件系统补充台账未覆盖的文件
          const [indexDocs, fsDocs] = await Promise.all([
            (async () => {
              if (!docTypeDef.index) return [] as WorkspaceDocKnowledge[];
              const relativeIndexPath = expanded.endsWith('/') ? `${expanded}${docTypeDef.index}` : `${expanded}/${docTypeDef.index}`;
              const indexContent = await fileRead(relativeIndexPath, workDir);
              if (!indexContent) return [] as WorkspaceDocKnowledge[];
              return scanFromIndex(workDir, indexContent, docTypeKey, docTypeDef, dirGraph, expanded).catch(() => [] as WorkspaceDocKnowledge[]);
            })(),
            scanFromFileSystem(workDir, expanded, docTypeKey, docTypeDef, dirGraph).catch(() => [] as WorkspaceDocKnowledge[]),
          ]);

          // 合并：台账结果优先，文件系统补充台账未覆盖的文件
          const indexPathSet = new Set(indexDocs.map(d => d.filePath));
          const supplementaryDocs = fsDocs.filter(d => !indexPathSet.has(d.filePath));
          locationDocs.push(...indexDocs, ...supplementaryDocs);
        }),
      );

      return locationDocs;
    }),
  );

  return locationResults.flat();
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
    const items = await cachedFileList(parentDir || '.', workDir);
    if (!items) return [];
    const dirs = items.filter(f => f.type === 'directory' && !f.name.startsWith('.'));
    // T1.5：并发递归展开所有子目录占位符
    const expanded = await Promise.all(
      dirs.map(dir => {
        const expandedPath = `${parentDir}${dir.name}${afterPlaceholder}`;
        return expandWildcardPaths(workDir, expandedPath).catch(() => [] as string[]);
      }),
    );
    return expanded.flat();
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
  try {
    const parsed = parseYamlSimple(indexContent);
    const items = Array.isArray(parsed['items']) ? parsed['items'] as Array<Record<string, unknown>> : [];

    // T1.4：并发读取台账中所有条目
    const fileEntries = items
      .map(item => {
        let filePath = item['path'] ? String(item['path']) : null;
        if (!filePath && item['id']) filePath = `${String(item['id'])}.md`;
        if (!filePath) return null;
        return { filePath, item };
      })
      .filter(Boolean) as Array<{ filePath: string; item: Record<string, unknown> }>;

    const docs = await Promise.all(
      fileEntries.map(async ({ filePath, item }) => {
        const fullFilePath = filePath.startsWith('/') ? filePath : `${basePath}/${filePath}`;
        const doc = await extractDocKnowledge(workDir, fullFilePath, docTypeKey, docTypeDef, dirGraph);
        if (doc) {
          if (item['status']) doc.frontmatter['status'] = item['status'];
          if (item['refs']) doc.frontmatter['refs'] = item['refs'];
        }
        return doc;
      }),
    );

    return docs.filter(Boolean) as WorkspaceDocKnowledge[];
  } catch {
    // 台账解析失败，回退到文件系统扫描
    return [];
  }
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
  try {
    // T5：使用会话级缓存避免重复列举同一目录
    const files = await cachedFileList(relativeDirPath, workDir);
    if (!files || files.length === 0) return [];

    const basePath = relativeDirPath.endsWith('/') ? relativeDirPath : `${relativeDirPath}/`;

    const filesToProcess = files.filter(
      f => f.type === 'file' && isScannableDoc(f.name) && !isSystemIndexFile(f.name) && matchesNaming(f.name, docTypeDef.naming),
    );
    const subdirs = files.filter(f => f.type === 'directory' && !f.name.startsWith('.'));

    // T1.2 + T1.3：文件提取与子目录递归全部并发执行
    const [fileDocs, subDirResults] = await Promise.all([
      Promise.all(
        filesToProcess.map(f =>
          extractDocKnowledge(workDir, `${basePath}${f.name}`, docTypeKey, docTypeDef, dirGraph).catch(() => null),
        ),
      ),
      Promise.all(
        subdirs.map(dir =>
          scanFromFileSystem(workDir, `${basePath}${dir.name}`, docTypeKey, docTypeDef, dirGraph, depth + 1).catch(() => []),
        ),
      ),
    ]);

    return [
      ...(fileDocs.filter(Boolean) as WorkspaceDocKnowledge[]),
      ...subDirResults.flat(),
    ];
  } catch {
    // 目录不存在或无权限
    return [];
  }
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

    // ── SDD-009: 格式感知解析（YAML vs Markdown）──
    let fm: Record<string, unknown>;
    let body: string;

    if (isYamlFile(relativePath)) {
      // YAML 文件：整体解析为结构化数据
      fm = parseYamlSimple(content);
      // 将字符串类型的字段拼接为伪 body，供摘要提取复用
      body = Object.entries(fm)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    } else {
      // Markdown 文件：标准 frontmatter 解析
      const parsed = parseFrontmatter(content);
      fm = parsed.frontmatter;
      body = parsed.body;
    }

    const title = String(fm['title'] ?? fm['name'] ?? fm['doc-type'] ?? extractTitleFromBody(body));
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
  // naming 含模板占位符（如 K-{NNN}-{name}.md）时仅作为生成提示，
  // 不作为扫描过滤条件——目录位置已由 dir-graph location 约束，
  // 过度过滤会导致用户手动创建的文档（如 note-xxx.md）被丢弃
  if (naming.includes('{')) return true;
  // 无占位符的纯固定前缀（如 "PRD.md"）才做精确匹配
  const prefix = naming.split('-')[0]?.split('.')[0];
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
 * SDD-009: 通用文档文件收集（支持 .md/.yml/.yaml）。
 * 扫描 dir 下所有可扫描文档（包含子目录递归），
 * 适用于 fallbackScan 及 dir-graph 未命中场景。
 */
async function collectDocFiles(
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
    // SDD-009: 扩展匹配 .yml/.yaml 文件
    if (file.type === 'file' && isScannableDoc(file.name) && !isSystemIndexFile(file.name)) {
      const filePath = `${dir}/${file.name}`;
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      try {
        const content = await fileRead(filePath, workDir);
        if (!content) continue;

        // SDD-009: 格式感知解析
        let fm: Record<string, unknown>;
        let body: string;
        if (isYamlFile(filePath)) {
          fm = parseYamlSimple(content);
          body = Object.entries(fm)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');
        } else {
          const parsed = parseFrontmatter(content);
          fm = parsed.frontmatter;
          body = parsed.body;
        }

        // 从 frontmatter 或 body 推断文档类型
        const inferredDocType =
          String(fm['doc-type'] ?? fm['docType'] ?? fm['type'] ?? docType).toUpperCase();
        const title = String(
          fm['title'] ?? fm['name'] ?? extractTitleFromBody(body) ?? file.name.replace(/\.(md|yml|yaml)$/, '')
        );
        results.push({
          id: `scan-${inferredDocType}-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
          docType: inferredDocType,
          category: 'baseline',
          layer: inferLayerFromPath(filePath),
          title,
          summary: body.slice(0, 500),
          tags: extractTags(fm, body),
          filePath,
          owner: String(fm['owner'] ?? fm['assignee'] ?? ''),
          upstream: [],
          downstream: [],
          frontmatter: fm,
          lifecycle: ((fm['lifecycle'] as string) === 'stable' ? 'stable' : 'living'),
          indexedAt: new Date().toISOString(),
        });
      } catch { /* silent */ }
    } else if (file.type === 'directory' && !file.name.startsWith('.')) {
      // 递归扫描子目录（避免过深，防止扫描 node_modules 等）
      await collectDocFiles(workDir, `${dir}/${file.name}`, docType, results, seen);
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
    // SDD-013: 迭代子目录细化扫描，确保无 dir-graph 时也能正确分类
    { dir: 'iterations/feedbacks',    docType: 'Feedback' },
    { dir: 'iterations/hypotheses',   docType: 'Hypothesis' },
    { dir: 'iterations/tasks',        docType: 'Task' },
    { dir: 'iterations/releases',     docType: 'Release' },
    { dir: 'iterations/archive',      docType: 'ARCHIVE' },
    { dir: 'knowledge',               docType: 'KNOWLEDGE' },
    // Team / 多层结构
    { dir: 'docs',                    docType: 'DOC' },
    { dir: 'docs/product',            docType: 'PRD' },
    { dir: 'docs/product/prd',        docType: 'PRD' },
    { dir: 'docs/product/architecture', docType: 'SDD' },
    { dir: 'docs/delivery',           docType: 'TASK' },
    // 根目录 .md 文件（README、OVERVIEW 等）
    { dir: '.',                        docType: 'DOC' },
  ];

  for (const { dir, docType } of scanDirs) {
    await collectDocFiles(workDir, dir, docType, results, seen);
  }

  // 去重（同一 filePath 只保留第一条）
  const deduped = results.filter((r, i, arr) => arr.findIndex(x => x.filePath === r.filePath) === i);

  return deduped;
}
