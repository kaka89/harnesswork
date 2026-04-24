/**
 * 星静前端文件服务层
 *
 * 星静文件服务层 — 提供通用的文件 CRUD 能力。
 * 支持 YAML 和 Markdown+frontmatter 格式。
 *
 * 文件格式约定：
 * - 文档类（PRD/SDD/Knowledge）→ Markdown（frontmatter 含结构化元数据）
 * - 结构化数据（Task/Sprint/Config）→ YAML
 * - 不依赖外部解析库，使用内置轻量 YAML/frontmatter 解析
 */

import yaml from 'js-yaml';
import { fileList, fileRead, fileWrite, fileDelete, type FileNode } from './file-ops';

export type { FileNode };

// ─── YAML 工具（基于 js-yaml）────────────────────────────────────────────────

/**
 * YAML 解析（使用 js-yaml）
 */
export function parseYamlSimple(content: string): Record<string, unknown> {
  return (yaml.load(content) as Record<string, unknown>) ?? {};
}

/**
 * YAML 序列化（使用 js-yaml）
 */
export function stringifyYamlSimple(
  obj: Record<string, unknown>,
  indent = 0,
): string {
  return yaml.dump(obj, { indent: 2 });
}

// ─── Markdown Frontmatter（从 utils/frontmatter 统一导入）───────────────────────

import { parseFrontmatter, stringifyFrontmatter, type FrontmatterDoc } from '../utils/frontmatter';
export { parseFrontmatter, stringifyFrontmatter, type FrontmatterDoc };

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

// ─── Solo 模式实体 CRUD（对齐 ENGINEERING-STRUCTURE-SOLO.md）─────────────────
// PRD:     product/features/{feature-slug}/PRD.md (frontmatter + body)
// Task:    iterations/tasks/{id}.yaml
// Backlog: product/backlog.yaml
// Features Index: product/features/_index.yml

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

/** 从 Markdown body 中提取第一个 # 标题作为 title fallback */
function extractFirstHeading(body: string): string | undefined {
  if (!body) return undefined;
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

/**
 * 从 product/features/ 子目录加载所有 PRD
 * 遍历 product/features/ 下每个功能子目录，读取其中的 PRD.md
 */
export async function loadPrds(workDir: string): Promise<PrdFrontmatter[]> {
  const featuresDir = 'product/features';
  try {
    const nodes = await fileList(featuresDir, workDir);
    // 筛选子目录（功能目录）
    const featureDirs = nodes.filter((n) => n.type === 'directory');
    const results: PrdFrontmatter[] = [];
    await Promise.all(
      featureDirs.map(async (dir) => {
        const prdPath = `${featuresDir}/${dir.name}/PRD.md`;
        try {
          const doc = await readMarkdownWithFrontmatter<Record<string, unknown>>(
            prdPath,
            { frontmatter: {} as Record<string, unknown>, body: '' },
            workDir,
          );
          const fm = (doc.frontmatter ?? {}) as Record<string, unknown>;
          // id: 优先 id → feat → 目录名 fallback
          const id = (fm.id as string) || (fm.feat as string) || dir.name;
          // title: 优先 frontmatter title → body 首个 # 标题 → 目录名
          const title = (fm.title as string) || extractFirstHeading(doc.body) || dir.name;
          const prd = {
            ...(fm as unknown as PrdFrontmatter),
            id,
            title,
            _body: doc.body,
            _featureSlug: dir.name,
          };
          results.push(prd);
        } catch {
          // 该功能目录下没有 PRD.md，跳过
        }
      }),
    );
    return results;
  } catch {
    return [];
  }
}

// ─── SDD ─────────────────────────────────────────────────────────────────────

export interface SddFrontmatter {
  id: string;
  title: string;
  status?: 'draft' | 'reviewing' | 'approved';
  owner?: string;
  createdAt?: string;
  _body?: string;
  _featureSlug?: string;
}

/**
 * 从 product/features/ 子目录加载所有 SDD
 * 遍历 product/features/ 下每个功能子目录，读取其中的 SDD.md
 */
export async function loadSdds(workDir: string): Promise<SddFrontmatter[]> {
  const featuresDir = 'product/features';
  try {
    const nodes = await fileList(featuresDir, workDir);
    const featureDirs = nodes.filter((n) => n.type === 'directory');
    const results: SddFrontmatter[] = [];
    await Promise.all(
      featureDirs.map(async (dir) => {
        const sddPath = `${featuresDir}/${dir.name}/SDD.md`;
        try {
          const doc = await readMarkdownWithFrontmatter<Record<string, unknown>>(
            sddPath,
            { frontmatter: {} as Record<string, unknown>, body: '' },
            workDir,
          );
          const fm = (doc.frontmatter ?? {}) as Record<string, unknown>;
          // id: 优先 id → feat → 目录名 fallback
          const id = (fm.id as string) || (fm.feat as string) || dir.name;
          // title: 优先 frontmatter title → body 首个 # 标题 → 目录名
          const title = (fm.title as string) || extractFirstHeading(doc.body) || dir.name;
          const sdd = {
            ...(fm as unknown as SddFrontmatter),
            id,
            title,
            _body: doc.body,
            _featureSlug: dir.name,
          };
          results.push(sdd);
        } catch {
          // 该功能目录下没有 SDD.md，跳过
        }
      }),
    );
    return results;
  } catch {
    return [];
  }
}

/**
 * 保存单个 PRD（创建或更新）
 * 写入 product/features/{featureSlug}/PRD.md
 */
export async function savePrd(
  workDir: string,
  prd: PrdFrontmatter & { description?: string; userStories?: unknown[]; _featureSlug?: string },
): Promise<boolean> {
  const { description, userStories, _featureSlug, _body, ...frontmatter } = prd as PrdFrontmatter & { description?: string; userStories?: unknown[]; _featureSlug?: string; _body?: string };
  // 确定功能目录 slug：优先使用 _featureSlug，否则从 id 或 title 生成
  const slug = _featureSlug || toFeatureSlug(prd.id || prd.title);
  // 直接使用编辑后的 body 内容写入文件，与 saveSdd 行为保持一致
  const body = description ?? '';
  return writeMarkdownWithFrontmatter(
    `${workDir}/product/features/${slug}/PRD.md`,
    {
      frontmatter: frontmatter as unknown as Record<string, unknown>,
      body,
    },
  );
}

/**
 * 删除单个 PRD
 */
export async function deletePrd(workDir: string, id: string, featureSlug?: string): Promise<boolean> {
  const slug = featureSlug || toFeatureSlug(id);
  return deleteFile(`${workDir}/product/features/${slug}/PRD.md`);
}

/**
 * 保存单个 SDD（创建或更新）
 * 写入 product/features/{featureSlug}/SDD.md
 */
export async function saveSdd(
  workDir: string,
  sdd: SddFrontmatter & { _featureSlug?: string },
  body: string,
): Promise<boolean> {
  const { _featureSlug, _body, ...frontmatter } = sdd as SddFrontmatter & { _featureSlug?: string; _body?: string };
  const slug = _featureSlug || toFeatureSlug(sdd.id || sdd.title);
  return writeMarkdownWithFrontmatter(
    `${workDir}/product/features/${slug}/SDD.md`,
    { frontmatter: frontmatter as unknown as Record<string, unknown>, body },
  );
}

/** 将 ID 或 title 转为 kebab-case 功能目录名 */
function toFeatureSlug(str: string): string {
  return str
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
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
 * 从 iterations/tasks/ 目录加载所有 Task
 */
export async function loadTasks(workDir: string): Promise<TaskRecord[]> {
  const dir = `${workDir}/iterations/tasks`;
  try {
    const items = await readYamlDir<TaskRecord>(dir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

/**
 * 保存单个 Task 到 iterations/tasks/
 */
export async function saveTask(workDir: string, task: TaskRecord): Promise<boolean> {
  return writeYaml(
    `${workDir}/iterations/tasks/${task.id}.yaml`,
    task as unknown as Record<string, unknown>,
  );
}

/**
 * 批量保存所有 Task
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
 * 从 product/backlog.yaml 加载 Backlog 列表
 */
export async function loadBacklog(workDir: string): Promise<BacklogRecord[]> {
  const path = `${workDir}/product/backlog.yaml`;
  try {
    const data = await readYaml<{ items: BacklogRecord[] }>(path, { items: [] });
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * 保存 Backlog 列表到 product/backlog.yaml
 */
export async function saveBacklog(workDir: string, items: BacklogRecord[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/product/backlog.yaml`,
    { items } as unknown as Record<string, unknown>,
  );
}

// ─── 全局设置（LLM 配置，跨所有 workspace 共享）──────────────────────────────

const GLOBAL_SETTINGS_FILE = '~/.xingjing/global-settings.yaml';

/**
 * 全局大模型配置，存储在 ~/.xingjing/global-settings.yaml，
 * 不绑定任何具体产品/workspace，应用启动时自动加载。
 */
export interface GlobalSettings {
  llm?: {
    modelName: string;
    modelID?: string;       // OpenCode model ID
    providerID?: string;    // OpenCode provider ID
    apiUrl: string;
    apiKey: string;
  };
  llmProviderKeys?: Record<string, string>; // per-provider API Keys
  /** 允许 AI 自动调用的工具名称列表（不在列表中的工具将被拒绝） */
  allowedTools?: string[];
}

/**
 * 加载全局大模型配置（~/.xingjing/global-settings.yaml）
 */
export async function loadGlobalSettings(): Promise<GlobalSettings> {
  return readYaml<GlobalSettings>(GLOBAL_SETTINGS_FILE, {});
}

/**
 * 保存全局大模型配置（~/.xingjing/global-settings.yaml）
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<boolean> {
  return writeYaml(
    GLOBAL_SETTINGS_FILE,
    settings as unknown as Record<string, unknown>,
  );
}

// ─── 项目级设置（Git / Gate 等，不再包含 LLM）──────────────────────────────

export interface ProjectSettings {
  llm?: {
    modelName: string;
    modelID?: string;       // OpenCode model ID
    providerID?: string;    // OpenCode provider ID
    apiUrl: string;
    apiKey: string;
  };
  llmProviderKeys?: Record<string, string>; // per-provider API Keys
  git?: {
    repoUrl: string;
    defaultBranch: string;
    accessToken?: string;
  };
  gates?: Array<{ id: string; name: string; requireHuman: boolean; description?: string }>;
  gitRepos?: Array<{
    id: string;
    productName: string;
    repoUrl: string;
    defaultBranch: string;
    tokenConfigured: boolean;
  }>;
  scheduledTasks?: Array<{
    id: string;
    name: string;
    cron: string;
    agentName: string;
    description: string;
    enabled: boolean;
    lastRun: string;
  }>;
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

// ─── Agent Workshop 数据持久化 ──────────────────────────────────────────────

export interface AgentWorkshopData {
  agents?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  agentSkills?: Record<string, string[]>;
  assignments?: Array<Record<string, unknown>>;
  orchestrations?: Array<Record<string, unknown>>;
}

/**
 * 加载 Agent Workshop 数据
 */
export async function loadAgentWorkshopData(
  workDir: string,
  mode: 'team' | 'solo' = 'team',
): Promise<AgentWorkshopData> {
  const path = `${workDir}/.xingjing/agent-workshop-${mode}.yaml`;
  return readYaml<AgentWorkshopData>(path, {});
}

/**
 * 保存 Agent Workshop 数据
 */
export async function saveAgentWorkshopData(
  workDir: string,
  data: AgentWorkshopData,
  mode: 'team' | 'solo' = 'team',
): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/agent-workshop-${mode}.yaml`,
    data as unknown as Record<string, unknown>,
  );
}

// ── 用户级 Agent Workshop 数据（跨产品共享）──────────────────────────────────

const GLOBAL_AGENT_WORKSHOP_FILE = '~/.xingjing/agent-workshop-solo.yaml';

export interface GlobalAgentWorkshopData {
  agents?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  agentSkills?: Record<string, string[]>;
}

/**
 * 加载用户级 Agent Workshop 数据（~/.xingjing/agent-workshop-solo.yaml）
 * @deprecated Agent 存储已迁移到 .opencode/agents/。仅保留供迁移逻辑使用。
 */
export async function loadGlobalAgentWorkshop(): Promise<GlobalAgentWorkshopData> {
  return readYaml<GlobalAgentWorkshopData>(GLOBAL_AGENT_WORKSHOP_FILE, {});
}

/**
 * 保存用户级 Agent Workshop 数据（~/.xingjing/agent-workshop-solo.yaml）
 */
export async function saveGlobalAgentWorkshop(
  data: GlobalAgentWorkshopData,
): Promise<boolean> {
  return writeYaml(
    GLOBAL_AGENT_WORKSHOP_FILE,
    data as unknown as Record<string, unknown>,
  );
}

// ── 产品级 Agent 任务指派（仅当前产品）────────────────────────────────────────

/**
 * 加载产品级 Agent 任务指派
 */
export async function loadAgentAssignments(
  workDir: string,
  mode: 'team' | 'solo' = 'solo',
): Promise<Array<Record<string, unknown>>> {
  const path = `${workDir}/.xingjing/agent-assignments-${mode}.yaml`;
  const data = await readYaml<{ assignments: Array<Record<string, unknown>> }>(path, { assignments: [] });
  return data.assignments ?? [];
}

/**
 * 保存产品级 Agent 任务指派
 */
export async function saveAgentAssignments(
  workDir: string,
  assignments: Array<Record<string, unknown>>,
  mode: 'team' | 'solo' = 'solo',
): Promise<boolean> {
  return writeYaml(
    `${workDir}/.xingjing/agent-assignments-${mode}.yaml`,
    { assignments } as unknown as Record<string, unknown>,
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

// ─── Solo 模式实体 CRUD ─────────────────────────────────────────────────────
// Solo 数据直接存储在产品 workDir 根目录的扁平结构中（匹配 ENGINEERING-STRUCTURE-SOLO.md）
// Focus:         focus.yml（单文件）
// Metrics:       metrics.yml（单文件）
// Hypotheses:    iterations/hypotheses/{id}.md（frontmatter + body）
// Tasks:         iterations/tasks/{id}.yaml
// Releases:      iterations/releases/{version}.yaml
// ADRs:          adrs.yml（单文件）
// Feature Flags: feature-flags.yml（单文件）
// Knowledge:     knowledge/{category}/{id}.md（frontmatter + body）
// Feedbacks:     iterations/feedbacks/{id}.yaml
// Requirements:  iterations/requirements/{id}.yaml
// Feature Ideas: iterations/feature-ideas/{id}.yaml
// Competitors:   competitors.yml（单文件）

// ─── Solo: Today's Focus ────────────────────────────────────────────────────

export interface SoloFocusItem {
  id: string;
  priority: 'urgent' | 'important' | 'normal';
  category: 'product' | 'dev' | 'ops' | 'growth';
  title: string;
  reason: string;
  action: string;
  linkedRoute?: string;
  linkedTask?: string;
  linkedHypothesis?: string;
}

export async function loadTodayFocus(workDir: string): Promise<SoloFocusItem[]> {
  const path = `${workDir}/focus.yml`;
  try {
    const data = await readYaml<{ items: SoloFocusItem[] }>(path, { items: [] });
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function saveTodayFocus(workDir: string, items: SoloFocusItem[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/focus.yml`,
    { items } as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Business Metrics ─────────────────────────────────────────────────

export interface SoloBusinessMetric {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: string;
  color: string;
  good: boolean;
}

export interface SoloMetricHistory {
  week: string;
  dau: number;
  mrr: number;
  retention: number;
}

export interface SoloFeatureUsage {
  feature: string;
  usage: number;
  trend: 'up' | 'down' | 'stable';
}

export interface SoloMetricsData {
  businessMetrics: SoloBusinessMetric[];
  metricsHistory: SoloMetricHistory[];
  featureUsage: SoloFeatureUsage[];
}

export async function loadSoloMetrics(workDir: string): Promise<SoloMetricsData> {
  const fallback: SoloMetricsData = { businessMetrics: [], metricsHistory: [], featureUsage: [] };
  try {
    return await readYaml<SoloMetricsData>('metrics.yml', fallback, workDir);
  } catch {
    return fallback;
  }
}

export async function saveSoloMetrics(workDir: string, data: SoloMetricsData): Promise<boolean> {
  return writeYaml(
    `${workDir}/metrics.yml`,
    data as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Hypotheses ───────────────────────────────────────────────────────

export type SoloHypothesisStatus = 'testing' | 'validated' | 'invalidated';

export interface SoloHypothesis {
  id: string;
  status: SoloHypothesisStatus;
  belief: string;
  why: string;
  method: string;
  result?: string;
  impact: 'high' | 'medium' | 'low';
  feature?: string;
  createdAt: string;
  validatedAt?: string;
  markdownDetail?: string;
}

interface HypothesisIndexItem {
  id: string;
  title?: string;
  status?: SoloHypothesisStatus;
  feature?: string;
  impact?: 'high' | 'medium' | 'low';
  createdAt?: string;
  validatedAt?: string;
  archived?: boolean;
}

export async function loadHypotheses(workDir: string): Promise<SoloHypothesis[]> {
  const dir = 'iterations/hypotheses';
  try {
    // 1. Read _index.yml for metadata (feature, title, etc.)
    const indexData = await readYaml<{ items: HypothesisIndexItem[] }>(
      `${dir}/_index.yml`,
      { items: [] },
      workDir,
    );
    const indexMap = new Map<string, HypothesisIndexItem>();
    for (const item of indexData.items ?? []) {
      if (item.id) indexMap.set(item.id, item);
    }

    // 2. Read all .md files for frontmatter + body
    const docs = await readMarkdownDir<Record<string, unknown>>(dir, workDir);
    const mdMap = new Map<string, SoloHypothesis>();
    for (const d of docs) {
      const fm = d.frontmatter as unknown as SoloHypothesis;
      if (!fm.id) continue;
      const indexEntry = indexMap.get(fm.id);
      mdMap.set(fm.id, {
        ...fm,
        ...(indexEntry?.feature ? { feature: indexEntry.feature } : {}),
        ...(d.body.trim() ? { markdownDetail: d.body.trim() } : {}),
      });
    }

    // 3. Include index-only entries (no .md file yet)
    for (const [id, entry] of indexMap) {
      if (!mdMap.has(id)) {
        mdMap.set(id, {
          id: entry.id,
          status: entry.status ?? 'testing',
          belief: entry.title ?? '',
          why: '',
          method: '',
          impact: entry.impact ?? 'medium',
          feature: entry.feature,
          createdAt: entry.createdAt ?? new Date().toISOString().slice(0, 10),
          validatedAt: entry.validatedAt,
        });
      }
    }

    return Array.from(mdMap.values());
  } catch {
    return [];
  }
}

export async function saveHypothesis(workDir: string, item: SoloHypothesis): Promise<boolean> {
  const { result, markdownDetail, feature, ...rest } = item;
  // 1. Write .md file (feature is stored in _index.yml, not in frontmatter)
  const mdOk = await writeMarkdownWithFrontmatter(
    `${workDir}/iterations/hypotheses/${item.id}.md`,
    {
      frontmatter: {
        ...rest,
        ...(feature ? { feature } : {}),
      } as unknown as Record<string, unknown>,
      body: markdownDetail ?? result ?? '',
    },
  );

  // 2. Upsert _index.yml entry
  try {
    const indexPath = `${workDir}/iterations/hypotheses/_index.yml`;
    const indexData = await readYaml<{ items: HypothesisIndexItem[] }>(indexPath, { items: [] });
    const items = indexData.items ?? [];
    const entry: HypothesisIndexItem = {
      id: item.id,
      title: item.belief,
      status: item.status,
      impact: item.impact,
      createdAt: item.createdAt,
      ...(item.validatedAt ? { validatedAt: item.validatedAt } : {}),
      ...(feature ? { feature } : {}),
      archived: false,
    };
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = entry;
    else items.push(entry);
    await writeYaml(indexPath, { items } as unknown as Record<string, unknown>);
  } catch {
    // Index update is best-effort
  }

  return mdOk;
}

// ─── Solo: Hypothesis → PRD 回写 (SDD-014) ────────────────────────────────────

/**
 * 将假设验证结论追加到关联 Feature 的 PRD.md 末尾。
 * - 触发条件：hypothesis.status 为 'validated' 或 'invalidated'
 * - 前置条件：hypothesis.feature 字段非空
 * - 幂等：同一假设不会重复追加
 */
export async function appendHypothesisResultToPrd(
  workDir: string,
  hypothesis: SoloHypothesis,
): Promise<{ success: boolean; prdPath?: string; error?: string }> {
  if (!hypothesis.feature) return { success: false, error: 'no-feature-linked' };
  if (!['validated', 'invalidated'].includes(hypothesis.status)) {
    return { success: false, error: 'status-not-terminal' };
  }

  const prdPath = `${workDir}/product/features/${hypothesis.feature}/PRD.md`;
  const existing = (await readFile(prdPath)) ?? '';

  // 幂等：通过隐式标记检查是否已追加过该假设
  const marker = `hypothesis-${hypothesis.id}`;
  if (existing.includes(marker)) return { success: true, prdPath };

  const statusLabel = hypothesis.status === 'validated' ? '已证实' : '已推翻';
  const date = new Date().toISOString().slice(0, 10);
  const hasSection = existing.includes('## 假设验证记录');

  const entryBlock = `### [${date}] <!-- ${marker} --> ${statusLabel}\n\n- **假设**: ${hypothesis.belief}\n- **验证方式**: ${hypothesis.method}\n- **结论**: ${hypothesis.result || '（未填写验证结论）'}\n- **影响程度**: ${hypothesis.impact}`;

  const appendBlock = hasSection
    ? `\n\n${entryBlock}`
    : `\n\n---\n\n## 假设验证记录\n\n${entryBlock}`;

  const ok = await writeFile(prdPath, existing + appendBlock);
  return ok ? { success: true, prdPath } : { success: false, error: 'write-failed' };
}

/**
 * 将假设转化为产品需求草稿（纯函数，不写文件）。
 * impact → priority 映射：high→P0, medium→P1, low→P2
 */
export function convertHypothesisToRequirement(
  hypothesis: SoloHypothesis,
): SoloRequirementOutput {
  const priorityMap: Record<string, SoloRequirementOutput['priority']> = {
    high: 'P0', medium: 'P1', low: 'P2',
  };
  const content = `## 需求背景\n\n本需求来源于已验证的产品假设：\n\n- **假设**: ${hypothesis.belief}\n- **验证方式**: ${hypothesis.method}\n- **验证结论**: ${hypothesis.result || '（待补充）'}\n- **影响程度**: ${hypothesis.impact}\n\n## 用户故事\n\n**作为** 产品用户，\n**我希望** ${hypothesis.belief}，\n**以便** （待细化）。\n\n## 验收标准\n\n- [ ] （待补充具体验收条件）\n`;

  return {
    id: `req-hypo-${Date.now()}`,
    title: hypothesis.belief,
    type: 'user-story',
    content,
    priority: priorityMap[hypothesis.impact] ?? 'P1',
    linkedHypothesis: hypothesis.id,
    linkedFeatureId: hypothesis.feature,
    status: 'draft',
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

// ─── Solo: Feature Ideas (legacy) ───────────────────────────────────────────

export interface SoloFeatureIdea {
  id: string;
  title: string;
  description: string;
  source: string;
  aiPriority: string;
  aiReason: string;
  votes: number;
}

export async function loadFeatureIdeas(workDir: string): Promise<SoloFeatureIdea[]> {
  const dir = `${workDir}/iterations/feature-ideas`;
  try {
    const items = await readYamlDir<SoloFeatureIdea>(dir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

export async function saveFeatureIdea(workDir: string, item: SoloFeatureIdea): Promise<boolean> {
  return writeYaml(
    `${workDir}/iterations/feature-ideas/${item.id}.yaml`,
    item as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Product Features (real data) ─────────────────────────────────────

export type SoloFeatureStatus = 'planned' | 'beta' | 'ga';

export interface SoloProductFeature {
  id: string;
  name: string;
  title?: string;
  status: SoloFeatureStatus;
  hypothesis?: string;
  since?: string;
  created?: string;
  brief?: string;
  description?: string;
  path?: string;
}

export async function loadProductFeatures(workDir: string): Promise<SoloProductFeature[]> {
  try {
    const data = await readYaml<{ features: Array<Record<string, unknown>> }>(
      'product/features/_index.yml', { features: [] }, workDir,
    );
    return (data.features ?? []).map((f) => ({
      id: (f.id as string) ?? (f.name as string) ?? '',
      name: (f.name as string) ?? (f.title as string) ?? (f.id as string) ?? '',
      title: (f.title as string) ?? undefined,
      status: (f.status as SoloFeatureStatus) ?? 'planned',
      hypothesis: (f.hypothesis as string) ?? undefined,
      since: (f.since as string) ?? undefined,
      created: (f.created as string) ?? undefined,
      brief: (f.brief as string) ?? undefined,
      description: (f.description as string) ?? undefined,
      path: (f.path as string) ?? undefined,
    })).filter((f) => !!f.id || !!f.name);
  } catch {
    return [];
  }
}

// ─── Solo: Product Context (overview / roadmap) ─────────────────────────────

export async function loadProductOverview(workDir: string): Promise<string> {
  try {
    const content = await readFile('product/overview.md', workDir);
    return content ?? '';
  } catch {
    return '';
  }
}

export async function loadProductRoadmap(workDir: string): Promise<string> {
  try {
    const content = await readFile('product/roadmap.md', workDir);
    return content ?? '';
  } catch {
    return '';
  }
}

// ─── Solo: Competitors ──────────────────────────────────────────────────────

export interface SoloCompetitor {
  name: string;
  strength: string[];
  weakness: string[];
  pricing: string;
  differentiation: string;
}

export async function loadCompetitors(workDir: string): Promise<SoloCompetitor[]> {
  const path = `${workDir}/competitors.yml`;
  try {
    const data = await readYaml<{ items: SoloCompetitor[] }>(path, { items: [] });
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function saveCompetitors(workDir: string, items: SoloCompetitor[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/competitors.yml`,
    { items } as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Requirement Outputs ──────────────────────────────────────────────

export type SoloRequirementType = 'user-story' | 'feature' | 'bug-fix' | 'tech-debt' | 'acceptance' | 'nfr';

export type RequirementStatus = 'draft' | 'review' | 'accepted' | 'in-dev' | 'done' | 'rejected';

export interface SoloRequirementOutput {
  id: string;
  title: string;
  type: SoloRequirementType;
  content: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  linkedHypothesis?: string;
  createdAt: string;
  // ─── SDD-007 新增字段 ───
  linkedFeatureId?: string;     // 关联的功能模块 ID（product/features/ 下的目录名）
  status?: RequirementStatus;   // 需求生命周期状态
  linkedTaskIds?: string[];     // 拆解出的任务 ID 列表
  sourceInsightId?: string;     // 来源洞察记录 ID
  sprintId?: string;            // 所属 Sprint
  assignee?: string;            // 负责人
  updatedAt?: string;           // 最后更新时间
  acceptedAt?: string;          // 需求被接受时间
}

export async function loadRequirementOutputs(workDir: string): Promise<SoloRequirementOutput[]> {
  try {
    const items = await readYamlDir<SoloRequirementOutput>('iterations/requirements', workDir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

export async function saveRequirementOutput(workDir: string, item: SoloRequirementOutput): Promise<boolean> {
  return writeYaml(
    `${workDir}/iterations/requirements/${item.id}.yaml`,
    item as unknown as Record<string, unknown>,
  );
}

/** 便捷函数：更新需求状态 */
export async function updateRequirementStatus(
  workDir: string,
  id: string,
  status: RequirementStatus,
): Promise<boolean> {
  const items = await loadRequirementOutputs(workDir);
  const item = items.find((r) => r.id === id);
  if (!item) return false;
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === 'accepted') item.acceptedAt = new Date().toISOString();
  return saveRequirementOutput(workDir, item);
}

// ─── Solo: Tasks ────────────────────────────────────────────────────────────

export type SoloTaskType = 'dev' | 'product' | 'ops' | 'growth';
export type SoloTaskStatusType = 'todo' | 'doing' | 'done';

export interface SoloTaskRecord {
  id: string;
  title: string;
  type: SoloTaskType;
  status: SoloTaskStatusType;
  est: string;
  dod: string[];
  note?: string;
  createdAt: string;
  feature?: string;
  hypothesis?: string;
  completedAt?: string;
  archived?: boolean;
  // ─── SDD-007 新增字段 ───
  requirementId?: string;       // 来源需求 ID（向上溯源）
  sprintId?: string;            // 所属 Sprint
  linkedReqTitle?: string;      // 冗余存储来源需求标题
}

export async function loadSoloTasks(workDir: string): Promise<SoloTaskRecord[]> {
  const dir = `${workDir}/iterations/tasks`;
  try {
    const items = await readYamlDir<SoloTaskRecord>(dir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

export async function saveSoloTask(workDir: string, task: SoloTaskRecord): Promise<boolean> {
  return writeYaml(
    `${workDir}/iterations/tasks/${task.id}.yaml`,
    task as unknown as Record<string, unknown>,
  );
}

// ─── Solo: ADRs ─────────────────────────────────────────────────────────────

export interface SoloAdr {
  id: string;
  title: string;
  question: string;
  decision: string;
  reason: string;
  date: string;
  status: 'active' | 'deprecated';
}

export async function loadAdrs(workDir: string): Promise<SoloAdr[]> {
  const path = `${workDir}/adrs.yml`;
  try {
    const data = await readYaml<{ items: SoloAdr[] }>(path, { items: [] });
    return (data.items ?? []).filter((d) => !!d.id);
  } catch {
    return [];
  }
}

export async function saveAdr(workDir: string, item: SoloAdr): Promise<boolean> {
  const path = `${workDir}/adrs.yml`;
  const existing = await loadAdrs(workDir);
  const idx = existing.findIndex(a => a.id === item.id);
  if (idx >= 0) existing[idx] = item;
  else existing.push(item);
  return writeYaml(path, { items: existing } as unknown as Record<string, unknown>);
}

// ─── Solo: Feature Flags ────────────────────────────────────────────────────

export interface SoloFeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout: number;
  environment: 'prod' | 'staging' | 'dev';
}

export async function loadFeatureFlags(workDir: string): Promise<SoloFeatureFlag[]> {
  const path = `${workDir}/feature-flags.yml`;
  try {
    const data = await readYaml<{ flags: SoloFeatureFlag[] }>(path, { flags: [] });
    return data.flags ?? [];
  } catch {
    return [];
  }
}

export async function saveFeatureFlags(workDir: string, flags: SoloFeatureFlag[]): Promise<boolean> {
  return writeYaml(
    `${workDir}/feature-flags.yml`,
    { flags } as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Releases ─────────────────────────────────────────────────────────

export interface SoloRelease {
  version: string;
  date: string;
  env: 'prod' | 'staging';
  status: 'success' | 'failed' | 'rolledback';
  summary: string;
  deployTime: string;
}

export async function loadSoloReleases(workDir: string): Promise<SoloRelease[]> {
  const dir = `${workDir}/iterations/releases`;
  try {
    const items = await readYamlDir<SoloRelease>(dir);
    return items.filter((t) => !!t.version);
  } catch {
    return [];
  }
}

export async function saveSoloRelease(workDir: string, release: SoloRelease): Promise<boolean> {
  const filename = release.version.replace(/[^a-zA-Z0-9._-]/g, '_');
  return writeYaml(
    `${workDir}/iterations/releases/${filename}.yaml`,
    release as unknown as Record<string, unknown>,
  );
}

// ─── Solo: Knowledge ────────────────────────────────────────────────────────

export type SoloKnowledgeCategory = 'pitfall' | 'user-insight' | 'tech-note';

export interface SoloKnowledgeItem {
  id: string;
  category: SoloKnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  date: string;
  aiAlert?: string;
  sourceAgentId?: string;    // 生成此知识的 Agent ID（AI 沉淀时写入）
  sourceSessionId?: string;  // 原始会话 ID（AI 沉淀时写入）
}

export async function loadSoloKnowledge(workDir: string): Promise<SoloKnowledgeItem[]> {
  const subdirs = ['pitfalls', 'insights', 'tech-notes'];
  const all: SoloKnowledgeItem[] = [];
  for (const sub of subdirs) {
    try {
      const docs = await readMarkdownDir<Omit<SoloKnowledgeItem, 'content'>>(`knowledge/${sub}`, workDir);
      all.push(...docs
        .map((d) => ({
          ...d.frontmatter,
          content: d.body,
        }))
        .filter((d) => !!d.id) as SoloKnowledgeItem[]);
    } catch {
      // subdirectory may not exist yet
    }
  }
  return all;
}

const knowledgeCategoryDir: Record<SoloKnowledgeCategory, string> = {
  'pitfall': 'pitfalls',
  'user-insight': 'insights',
  'tech-note': 'tech-notes',
};

export async function saveSoloKnowledge(workDir: string, item: SoloKnowledgeItem): Promise<boolean> {
  const subdir = knowledgeCategoryDir[item.category] ?? 'pitfalls';
  const { content, ...frontmatter } = item;
  return writeMarkdownWithFrontmatter(
    `knowledge/${subdir}/${item.id}.md`,
    {
      frontmatter: frontmatter as unknown as Record<string, unknown>,
      body: content ?? '',
    },
    workDir,
  );
}

/**
 * 删除个人知识条目（按 filePath 直接删除文件）
 * filePath 形如 "knowledge/pitfalls/K-001-xxx.md"
 */
export async function deleteSoloKnowledgeByPath(
  workDir: string,
  filePath: string,
): Promise<boolean> {
  return deleteFile(`${workDir}/${filePath}`);
}

// ─── Solo: User Feedbacks ───────────────────────────────────────────────────

export interface SoloUserFeedback {
  id: string;
  user: string;
  channel: 'Email' | 'Product Hunt' | 'Twitter' | 'In-app';
  content?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string;
  archived?: boolean;
}

export async function loadUserFeedbacks(workDir: string): Promise<SoloUserFeedback[]> {
  try {
    const docs = await readMarkdownDir<Record<string, unknown>>('iterations/feedbacks', workDir);
    return docs
      .map((d) => {
        const fm = d.frontmatter as unknown as SoloUserFeedback;
        return {
          ...fm,
          content: d.body.trim() || fm.content || '',
        };
      })
      .filter((f) => !!f.id);
  } catch {
    return [];
  }
}

export async function saveUserFeedback(workDir: string, feedback: SoloUserFeedback): Promise<boolean> {
  const { content, ...rest } = feedback;
  return writeMarkdownWithFrontmatter(
    `${workDir}/iterations/feedbacks/${feedback.id}.md`,
    {
      frontmatter: rest as unknown as Record<string, unknown>,
      body: content ?? '',
    },
  );
}

// ─── Autopilot 会话历史持久化 ─────────────────────────────────────────────

export interface AutopilotChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  text: string;
  time: string;
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
}

export interface AutopilotSession {
  id: string;
  goal: string;
  startedAt: string;
  messages: AutopilotChatMessage[];
}

export interface AutopilotHistory {
  sessions: AutopilotSession[];
}

export async function loadAutopilotHistory(workDir: string): Promise<AutopilotHistory> {
  const path = `${workDir}/.xingjing/autopilot-history.json`;
  try {
    const content = await fileRead(path);
    if (!content) return { sessions: [] };
    return JSON.parse(content) as AutopilotHistory;
  } catch {
    return { sessions: [] };
  }
}

export async function saveAutopilotHistory(
  workDir: string,
  history: AutopilotHistory,
): Promise<boolean> {
  const trimmed = { sessions: history.sessions.slice(0, 20) };
  const content = JSON.stringify(trimmed, null, 2);
  return fileWrite(`${workDir}/.xingjing/autopilot-history.json`, content);
}

// ─── Agent 定义加载（.opencode/agents/*.md）──────────────────────────────

export interface AgentDefRecord {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  skills: string[];
  description: string;
}

/**
 * 从 .opencode/agents/*.md 加载 Agent 定义（frontmatter + body 描述）
 */
export async function loadAgentDefs(workDir: string): Promise<AgentDefRecord[]> {
  const dir = `${workDir}/.opencode/agents`;
  try {
    const docs = await readMarkdownDir<Record<string, unknown>>(dir);
    return docs
      .map((d) => {
        const fm = d.frontmatter as Record<string, unknown>;
        const skills = Array.isArray(fm.skills)
          ? (fm.skills as string[])
          : typeof fm.skills === 'string'
            ? (fm.skills as string).split(',').map(s => s.trim())
            : [];
        return {
          id: String(fm.id ?? ''),
          name: String(fm.name ?? ''),
          role: String(fm.role ?? fm.name ?? ''),
          emoji: String(fm.emoji ?? '🤖'),
          color: String(fm.color ?? '#666'),
          bgColor: String(fm.bgColor ?? '#f5f5f5'),
          borderColor: String(fm.borderColor ?? '#ddd'),
          skills,
          description: d.body.trim(),
        };
      })
      .filter((d) => !!d.id);
  } catch {
    return [];
  }
}

// ─── 产品目录自动初始化 ──────────────────────────────────────────────────────

/** 打开产品时需要确保存在的必要文件列表 */
const ESSENTIAL_PRODUCT_FILES: Array<{ path: string; defaultContent: string }> = [
  { path: 'product/overview.md', defaultContent: '---\ntitle: 产品概述\n---\n\n# 产品概述\n\n（请在此描述产品定位、核心价值）\n' },
  { path: 'product/roadmap.md', defaultContent: '---\ntitle: 产品路线图\n---\n\n# Roadmap\n\n（请在此规划版本迭代路线）\n' },
  { path: 'product/features/_index.yml', defaultContent: 'features: []\n' },
  { path: 'product/backlog.yaml', defaultContent: 'items: []\n' },
  { path: 'iterations/tasks/_index.yml', defaultContent: 'items: []\n' },
  { path: 'iterations/hypotheses/_index.yml', defaultContent: 'items: []\n' },
  { path: '.xingjing/config.yaml', defaultContent: 'mode: solo\n' },
];

/**
 * 检查并自动创建产品所需的必要文件。
 * 打开产品时调用：逐一检测文件是否存在，缺失则使用默认内容初始化。
 * @returns 创建的文件数量
 */
export async function ensureProductFiles(workDir: string): Promise<number> {
  let created = 0;
  for (const file of ESSENTIAL_PRODUCT_FILES) {
    try {
      const content = await fileRead(file.path, workDir);
      if (content === null || content === undefined) {
        // 文件不存在，创建它
        const ok = await fileWrite(file.path, file.defaultContent, workDir);
        if (ok) {
          created++;
          console.info(`[xingjing] 自动创建缺失文件: ${file.path}`);
        }
      }
    } catch {
      // 读取失败（文件不存在），尝试创建
      try {
        const ok = await fileWrite(file.path, file.defaultContent, workDir);
        if (ok) {
          created++;
          console.info(`[xingjing] 自动创建缺失文件: ${file.path}`);
        }
      } catch {
        // 写入也失败，静默跳过
      }
    }
  }
  if (created > 0) {
    console.info(`[xingjing] ensureProductFiles: 共创建 ${created} 个缺失文件`);
  }
  return created;
}
