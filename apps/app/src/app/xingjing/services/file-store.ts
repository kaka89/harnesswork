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

import yaml from 'js-yaml';
import { fileList, fileRead, fileWrite, fileDelete, FileNode } from './opencode-client';

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
    const docs = await readMarkdownDir<Record<string, unknown>>(dir);
    return docs
      .map((d) => ({ ...(d.frontmatter as unknown as PrdFrontmatter), _body: d.body }))
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
    const docs = await readMarkdownDir<Record<string, unknown>>(dir);
    return docs
      .map((d) => ({
        ...(d.frontmatter as unknown as KnowledgeRecord),
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
  const path = `${workDir}/metrics.yml`;
  const fallback: SoloMetricsData = { businessMetrics: [], metricsHistory: [], featureUsage: [] };
  try {
    return await readYaml<SoloMetricsData>(path, fallback);
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
  createdAt: string;
  validatedAt?: string;
  markdownDetail?: string;
}

export async function loadHypotheses(workDir: string): Promise<SoloHypothesis[]> {
  const dir = `${workDir}/iterations/hypotheses`;
  try {
    const docs = await readMarkdownDir<Record<string, unknown>>(dir);
    return docs
      .map((d) => ({
        ...(d.frontmatter as unknown as SoloHypothesis),
        ...(d.body.trim() ? { result: (d.frontmatter as Record<string, unknown>).result as string ?? d.body.trim() } : {}),
      }))
      .filter((d) => !!d.id);
  } catch {
    return [];
  }
}

export async function saveHypothesis(workDir: string, item: SoloHypothesis): Promise<boolean> {
  const { result, markdownDetail, ...rest } = item;
  return writeMarkdownWithFrontmatter(
    `${workDir}/iterations/hypotheses/${item.id}.md`,
    {
      frontmatter: { ...rest, ...(markdownDetail !== undefined ? { markdownDetail } : {}) } as unknown as Record<string, unknown>,
      body: result ?? '',
    },
  );
}

// ─── Solo: Feature Ideas ────────────────────────────────────────────────────

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

export type SoloRequirementType = 'user-story' | 'acceptance' | 'nfr';

export interface SoloRequirementOutput {
  id: string;
  title: string;
  type: SoloRequirementType;
  content: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  linkedHypothesis?: string;
  createdAt: string;
}

export async function loadRequirementOutputs(workDir: string): Promise<SoloRequirementOutput[]> {
  const dir = `${workDir}/iterations/requirements`;
  try {
    const items = await readYamlDir<SoloRequirementOutput>(dir);
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

// ─── Solo: User Feedbacks ───────────────────────────────────────────────────

export interface SoloUserFeedback {
  id: string;
  user: string;
  channel: 'Email' | 'Product Hunt' | 'Twitter' | 'In-app';
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  date: string;
}

export async function loadUserFeedbacks(workDir: string): Promise<SoloUserFeedback[]> {
  const dir = `${workDir}/iterations/feedbacks`;
  try {
    const items = await readYamlDir<SoloUserFeedback>(dir);
    return items.filter((t) => !!t.id);
  } catch {
    return [];
  }
}

export async function saveUserFeedback(workDir: string, feedback: SoloUserFeedback): Promise<boolean> {
  return writeYaml(
    `${workDir}/iterations/feedbacks/${feedback.id}.yaml`,
    feedback as unknown as Record<string, unknown>,
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
