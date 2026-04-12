/**
 * 星静前端文件服务层
 *
 * 封装 OpenCode file API，提供通用的文件 CRUD 能力。
 * 支持 YAML 和 Markdown+frontmatter 格式，降级到 mock 数据。
 *
 * 文件格式约定：
 * - 文档类（PRD/SDD/Knowledge）→ Markdown（frontmatter 含结构化元数据）
 * - 结构化数据（Task/Sprint/Config）→ YAML
 * - 不依赖外部解析库，使用内置轻量 YAML/frontmatter 解析
 */

import { fileList, fileRead, fileWrite, fileDelete, FileNode } from './opencode-client';

export type { FileNode };

// ─── 简单 YAML 序列化/反序列化（无外部依赖）────────────────────────────────

/**
 * 极简 YAML 解析（仅支持平铺 key: value，嵌套对象，数组）
 * 对于生产环境，建议引入 js-yaml 或 yaml 库
 */
export function parseYamlSimple(content: string): Record<string, unknown> {
  try {
    // 使用 JSON 兼容模式（对于标准 YAML 子集）
    // 尝试将 YAML 转为 JSON 可解析格式
    const lines = content.split('\n');
    const result: Record<string, unknown> = {};
    const indentStack: Array<{ obj: Record<string, unknown>; indent: number }> = [
      { obj: result, indent: -1 },
    ];
    let currentList: unknown[] | null = null;
    let currentListKey = '';

    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Array item
      if (trimmed.startsWith('- ')) {
        const value = trimmed.slice(2).trim();
        if (currentList) {
          currentList.push(parseYamlValue(value));
        }
        continue;
      }

      // Key-value
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1).trim();

      // Pop stack to find parent
      while (
        indentStack.length > 1 &&
        indentStack[indentStack.length - 1].indent >= indent
      ) {
        indentStack.pop();
      }
      const parent = indentStack[indentStack.length - 1].obj;

      if (rest === '') {
        // Nested object or array to follow
        const nextObj: Record<string, unknown> = {};
        parent[key] = nextObj;
        currentList = null;
        indentStack.push({ obj: nextObj, indent });
        // Check if next line is array
        currentListKey = key;
        const arr: unknown[] = [];
        // Will be replaced if next lines are "- "
        // Preemptively set as array; will be updated
        void currentListKey;
        void arr;
      } else {
        // Array value: key: [...]
        if (rest.startsWith('[') && rest.endsWith(']')) {
          const items = rest
            .slice(1, -1)
            .split(',')
            .map((s) => parseYamlValue(s.trim()));
          parent[key] = items;
          currentList = null;
        } else {
          parent[key] = parseYamlValue(rest);
          currentList = null;
        }
      }

      // Set up list tracking for array items
      if (rest === '') {
        const arr: unknown[] = [];
        parent[key] = arr;
        currentList = arr;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function parseYamlValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  // Quoted string
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * 简单 YAML 序列化（将对象转为 YAML 字符串）
 */
export function stringifyYamlSimple(
  obj: Record<string, unknown>,
  indent = 0,
): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}: ~`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(
        stringifyYamlSimple(value as Record<string, unknown>, indent + 1),
      );
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${prefix}  -`);
          lines.push(
            stringifyYamlSimple(item as Record<string, unknown>, indent + 2),
          );
        } else {
          lines.push(`${prefix}  - ${item}`);
        }
      }
    } else if (typeof value === 'string' && (value.includes('\n') || value.includes(':'))) {
      lines.push(`${prefix}${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

// ─── Markdown Frontmatter ─────────────────────────────────────────────────────

export interface FrontmatterDoc<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

/**
 * 解析 Markdown frontmatter（--- YAML --- 格式）
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
): FrontmatterDoc<T> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as T, body: content };
  }
  const frontmatter = parseYamlSimple(match[1]) as T;
  const body = match[2] ?? '';
  return { frontmatter, body };
}

/**
 * 序列化带 frontmatter 的 Markdown
 */
export function stringifyFrontmatter<T extends Record<string, unknown>>(
  doc: FrontmatterDoc<T>,
): string {
  const yamlStr = stringifyYamlSimple(doc.frontmatter as Record<string, unknown>);
  return `---\n${yamlStr}\n---\n${doc.body}`;
}

// ─── 文件服务层（高级 API）────────────────────────────────────────────────────

/**
 * 扫描目录，返回文件列表
 */
export async function readDir(
  dir: string,
  directory?: string,
): Promise<FileNode[]> {
  return fileList(dir, directory);
}

/**
 * 读取文件原始内容
 */
export async function readFile(
  path: string,
  directory?: string,
): Promise<string | null> {
  return fileRead(path, directory);
}

/**
 * 写入文件原始内容
 */
export async function writeFile(
  path: string,
  content: string,
  directory?: string,
): Promise<boolean> {
  return fileWrite(path, content, directory);
}

/**
 * 删除文件
 */
export async function deleteFile(
  path: string,
  directory?: string,
): Promise<boolean> {
  return fileDelete(path, directory);
}

/**
 * 读取 YAML 文件，返回解析后的对象
 * @param path 文件路径（相对于工作目录的 .xingjing/ 下）
 * @param fallback 文件不存在或解析失败时的默认值
 */
export async function readYaml<T = Record<string, unknown>>(
  path: string,
  fallback: T,
  directory?: string,
): Promise<T> {
  const content = await fileRead(path, directory);
  if (!content) return fallback;
  try {
    return parseYamlSimple(content) as T;
  } catch {
    return fallback;
  }
}

/**
 * 写入 YAML 文件
 */
export async function writeYaml(
  path: string,
  data: Record<string, unknown>,
  directory?: string,
): Promise<boolean> {
  const content = stringifyYamlSimple(data);
  return fileWrite(path, content, directory);
}

/**
 * 读取带 frontmatter 的 Markdown 文件
 * @param path 文件路径
 * @param fallback 文件不存在时的默认值
 */
export async function readMarkdownWithFrontmatter<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  path: string,
  fallback: FrontmatterDoc<T>,
  directory?: string,
): Promise<FrontmatterDoc<T>> {
  const content = await fileRead(path, directory);
  if (!content) return fallback;
  return parseFrontmatter<T>(content);
}

/**
 * 写入带 frontmatter 的 Markdown 文件
 */
export async function writeMarkdownWithFrontmatter<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  path: string,
  doc: FrontmatterDoc<T>,
  directory?: string,
): Promise<boolean> {
  const content = stringifyFrontmatter(doc);
  return fileWrite(path, content, directory);
}

// ─── 目录辅助 ───────────────────────────────────────────────────────────────

/**
 * 读取目录下所有 YAML 文件，返回解析后的对象数组
 */
export async function readYamlDir<T = Record<string, unknown>>(
  dir: string,
  directory?: string,
): Promise<Array<T & { _path: string }>> {
  const nodes = await fileList(dir, directory);
  const yamlFiles = nodes.filter(
    (n) => n.type === 'file' && (n.name.endsWith('.yaml') || n.name.endsWith('.yml')),
  );
  const results = await Promise.all(
    yamlFiles.map(async (n) => {
      const obj = await readYaml<T>(n.path, {} as T, directory);
      return { ...obj, _path: n.path };
    }),
  );
  return results;
}

/**
 * 读取目录下所有 Markdown 文件（带 frontmatter）
 */
export async function readMarkdownDir<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  dir: string,
  directory?: string,
): Promise<Array<FrontmatterDoc<T> & { _path: string }>> {
  const nodes = await fileList(dir, directory);
  const mdFiles = nodes.filter(
    (n) => n.type === 'file' && n.name.endsWith('.md'),
  );
  const results = await Promise.all(
    mdFiles.map(async (n) => {
      const doc = await readMarkdownWithFrontmatter<T>(
        n.path,
        { frontmatter: {} as T, body: '' },
        directory,
      );
      return { ...doc, _path: n.path };
    }),
  );
  return results;
}

// ─── Team 模式实体 CRUD ──────────────────────────────────────────────────────
// 所有数据存储在项目 workDir 的 .xingjing/ 子目录中
// PRD: .xingjing/prds/{id}.md (frontmatter + body)
// Task: .xingjing/tasks/{id}.yaml
// Backlog: .xingjing/backlog/items.yaml
// Sprint: .xingjing/sprints/current.yaml

// ─── PRD ─────────────────────────────────────────────────────────────────────

export interface PrdFrontmatter {
  id: string;
  title: string;
  owner: string;
  status: 'draft' | 'reviewing' | 'approved';
  aiScore: number;
  reviewComments: number;
  createdAt: string;
  sddStatus?: string;
  devProgress?: string;
  impactApps?: string[];
  nfr?: string;
}

/**
 * 从项目目录加载所有 PRD
 */
export async function loadPrds(workDir: string): Promise<PrdFrontmatter[]> {
  const dir = `${workDir}/.xingjing/prds`;
  try {
    const docs = await readMarkdownDir<PrdFrontmatter>(dir);
    return docs
      .map((d) => ({ ...d.frontmatter, _body: d.body }))
      .filter((d) => !!d.id);
  } catch {
    return [];
  }
}

/**
 * 保存单个 PRD（创建或更新）
 */
export async function savePrd(
  workDir: string,
  prd: PrdFrontmatter & { description?: string; userStories?: unknown[] },
): Promise<boolean> {
  const { description, userStories, ...frontmatter } = prd as PrdFrontmatter & { description?: string; userStories?: unknown[] };
  const body = description ? `## 需求描述\n\n${description}\n` : '';
  return writeMarkdownWithFrontmatter(
    `${workDir}/.xingjing/prds/${prd.id}.md`,
    {
      frontmatter: frontmatter as unknown as Record<string, unknown>,
      body,
    },
  );
}

/**
 * 删除单个 PRD
 */
export async function deletePrd(workDir: string, id: string): Promise<boolean> {
  return deleteFile(`${workDir}/.xingjing/prds/${id}.md`);
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  title: string;
  sddId?: string;
  assignee?: string;
  status: 'todo' | 'in-dev' | 'in-review' | 'done';
  estimate?: number;
  actual?: number;
  branch?: string;
  ciStatus?: string;
  coverage?: number;
  priority?: string;
  dependencies?: string[];
  dod?: Array<{ label: string; done: boolean }>;
}

/**
 * 从项目目录加载所有 Task（YAML 目录）
 */
export async function loadTasks(workDir: string): Promise<TaskRecord[]> {
  const dir = `${workDir}/.xingjing/tasks`;
  try {
    const items = await readYamlDir<TaskRecord>(dir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

/**
 * 保存单个 Task（YAML 文件）
 */
export async function saveTask(workDir: string, task: TaskRecord): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/tasks/${task.id}.yaml`,
    task as unknown as Record<string, unknown>,
  );
}

/**
 * 批量保存所有 Task（覆写目录）
 */
export async function saveTasks(workDir: string, tasks: TaskRecord[]): Promise<boolean> {
  const results = await Promise.all(tasks.map((t) => saveTask(workDir, t)));
  return results.every(Boolean);
}

// ─── Backlog ──────────────────────────────────────────────────────────────────

export interface BacklogRecord {
  id: string;
  title: string;
  type?: string;
  points?: number;
  inSprint?: boolean;
  priority?: string;
}

/**
 * 从项目目录加载 Backlog 列表
 */
export async function loadBacklog(workDir: string): Promise<BacklogRecord[]> {
  const path = `${workDir}/.xingjing/backlog/items.yaml`;
  try {
    const data = await readYaml<{ items: BacklogRecord[] }>(path, { items: [] });
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * 保存 Backlog 列表
 */
export async function saveBacklog(workDir: string, items: BacklogRecord[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/backlog/items.yaml`,
    { items } as unknown as Record<string, unknown>,
  );
}

// ─── 项目级设置（LLM / Git / Gate 等）────────────────────────────────────────

export interface ProjectSettings {
  llm?: {
    modelName: string;
    apiUrl: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
  };
  git?: {
    repoUrl: string;
    defaultBranch: string;
    accessToken?: string;
  };
  gates?: Array<{ id: string; name: string; requireHuman: boolean }>;
}

/**
 * 加载项目级配置
 */
export async function loadProjectSettings(workDir: string): Promise<ProjectSettings> {
  const path = `${workDir}/.xingjing/settings.yaml`;
  return readYaml<ProjectSettings>(path, {});
}

/**
 * 保存项目级配置
 */
export async function saveProjectSettings(
  workDir: string,
  settings: ProjectSettings,
): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/settings.yaml`,
    settings as unknown as Record<string, unknown>,
  );
}

// ─── Planning 规划条目 ─────────────────────────────────────────────────────────

export interface PlanningRecord {
  id: string;
  title: string;
  type: string;
  status: 'researching' | 'analyzing' | 'proposed' | 'approved';
  owner?: string;
  priority?: string;
  upvotes?: number;
  tags?: string[];
  summary?: string;
  createdAt?: string;
}

export async function loadPlanning(workDir: string): Promise<PlanningRecord[]> {
  const path = `${workDir}/.xingjing/planning/items.yaml`;
  try {
    const data = await readYaml<{ items: PlanningRecord[] }>(path, { items: [] });
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function savePlanning(workDir: string, items: PlanningRecord[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/planning/items.yaml`,
    { items } as unknown as Record<string, unknown>,
  );
}

export async function savePlanningItem(workDir: string, item: PlanningRecord): Promise<boolean> {
  const existing = await loadPlanning(workDir);
  const idx = existing.findIndex((p) => p.id === item.id);
  const updated = idx >= 0
    ? existing.map((p) => p.id === item.id ? item : p)
    : [...existing, item];
  return savePlanning(workDir, updated);
}

// ─── Knowledge 知识条目 ────────────────────────────────────────────────────────

export interface KnowledgeRecord {
  id: string;
  title: string;
  category: string;
  level?: string;
  tags?: string[];
  summary?: string;
  content?: string;
  author?: string;
  updatedAt?: string;
}

export async function loadKnowledge(workDir: string): Promise<KnowledgeRecord[]> {
  const dir = `${workDir}/.xingjing/knowledge`;
  try {
    const docs = await readMarkdownDir<KnowledgeRecord>(dir);
    return docs
      .map((d) => ({
        ...d.frontmatter,
        content: d.body,
      }))
      .filter((d) => !!d.id);
  } catch {
    return [];
  }
}

export async function saveKnowledgeItem(workDir: string, item: KnowledgeRecord): Promise<boolean> {
  const { content, ...frontmatter } = item;
  return writeMarkdownWithFrontmatter(
    `${workDir}/.xingjing/knowledge/${item.id}.md`,
    {
      frontmatter: frontmatter as unknown as Record<string, unknown>,
      body: content ?? '',
    },
  );
}

// ─── Sprint 元数据 ─────────────────────────────────────────────────────────────

export interface SprintRecord {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  currentDay?: number;
  totalPoints?: number;
  completedPoints?: number;
  spi?: number;
  risks?: Array<{ level: string; message: string }>;
  burndownIdeal?: number[];
  burndownActual?: number[];
  labels?: string[];
}

export async function loadCurrentSprint(workDir: string): Promise<SprintRecord | null> {
  const path = `${workDir}/.xingjing/sprints/current.yaml`;
  try {
    const data = await readYaml<SprintRecord>(path, {} as SprintRecord);
    return data.id ? data : null;
  } catch {
    return null;
  }
}

export async function saveCurrentSprint(workDir: string, sprint: SprintRecord): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/sprints/current.yaml`,
    sprint as unknown as Record<string, unknown>,
  );
}

// ─── Release 发布历史 ──────────────────────────────────────────────────────────

export interface ReleaseRecord {
  version: string;
  env: string;
  status: string;
  deployedAt?: string;
  deployTime?: number;
  commitHash?: string;
  notes?: string;
}

export async function loadReleases(workDir: string): Promise<ReleaseRecord[]> {
  const path = `${workDir}/.xingjing/releases/history.yaml`;
  try {
    const data = await readYaml<{ releases: ReleaseRecord[] }>(path, { releases: [] });
    return data.releases ?? [];
  } catch {
    return [];
  }
}

export async function saveRelease(workDir: string, release: ReleaseRecord): Promise<boolean> {
  const existing = await loadReleases(workDir);
  const updated = [release, ...existing.filter((r) => r.version !== release.version)];
  return writeYaml(
    `${workDir}/.xingjing/releases/history.yaml`,
    { releases: updated } as unknown as Record<string, unknown>,
  );
}
