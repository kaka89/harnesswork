/**
 * Agent 注册表 — 统一 Agent 发现与注册
 *
 * 设计原则：
 * - 纯文件驱动：所有 Agent 定义均从 ~/.xingjing/agents/ 文件中读取
 * - 全局可见：Agent 跨产品/workspace 可见
 * - 种子 Agent 首次启动时写入全局目录，后续从文件读取
 * - 统一读取 API：listAllAgents() 获取完整 Agent 列表
 */

import { type AutopilotAgent, buildOrchestratorSystemPrompt } from './autopilot-executor';
import { getSeedAgentFiles, getSeedAgentIds } from './seed-agent-loader';
import { fileRead, fileWrite, fileList, fileDelete } from './file-ops';
import { parseFrontmatter, extractBody } from '../utils/frontmatter';

// ─── 类型定义 ─────────────────────────────────────────────────

export interface RegisteredAgent extends AutopilotAgent {
  /** Agent 来源：seed = 内置种子, custom = 用户自定义 */
  source: 'seed' | 'custom';
  /** 文件来源时的文件路径 */
  filePath?: string;
  /** OpenCode Agent ID（用于 session.create 时指定 agent），对应文件名不含 .md */
  opencodeAgentId?: string;
}

// ─── 全局存储路径 ─────────────────────────────────────────────
const GLOBAL_AGENTS_DIR = '~/.xingjing/agents';

/**
 * 已成功执行过完整注册流程的 mode 集合（进程级别）。
 * 防止 SolidJS effect 重跑、页面反复进出时重复触发数十次 fetch 扇出，
 * 是「Tauri IPC custom protocol failed」问题的防护套。
 */
const _registeredAgentModes = new Set<'solo' | 'team'>();

// ─── 默认 UI 属性（用户自定义 Agent 缺省样式）────────────────────────────────

const DEFAULT_CUSTOM_AGENT_STYLE = {
  color: '#531dab',
  bgColor: '#f9f0ff',
  borderColor: '#d3adf7',
  emoji: '🤖',
};

// ─── 从 Agent Markdown 文件解析为 RegisteredAgent ────────────────

/** 从 ~/.xingjing/agents/{id}.md 文件内容解析为 RegisteredAgent（统一逻辑，无内置常量分支）*/
function parseAgentFile(agentId: string, content: string, isGlobal = false): RegisteredAgent | null {
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
  if (!frontmatter || Object.keys(frontmatter).length === 0) return null;

  const isSeed = getSeedAgentIds().has(agentId);
  const systemPrompt = extractBody(content);
  return {
    id: (frontmatter['id'] as string) || agentId,
    name: (frontmatter['name'] as string) || agentId,
    role: (frontmatter['role'] as string) || '',
    mode: (frontmatter['mode'] as 'solo' | 'team') || undefined,
    color: (frontmatter['color'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.color,
    bgColor: (frontmatter['bgColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.bgColor,
    borderColor: (frontmatter['borderColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.borderColor,
    emoji: (frontmatter['emoji'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.emoji,
    skills: (frontmatter['skills'] as string[]) || [],
    injectSkills: (frontmatter['injectSkills'] as string[]) || [],
    description: (frontmatter['description'] as string) || '',
    systemPrompt: systemPrompt || '',
    source: isSeed ? 'seed' : 'custom',
    editable: !isSeed,
    opencodeAgentId: agentId,
    filePath: isGlobal ? `${GLOBAL_AGENTS_DIR}/${agentId}.md` : `.opencode/agents/${agentId}.md`,
  };
}

// ─── 统一发现接口 ──────────────────────────────────────────────

/**
 * 统一 Agent 列表获取（纯文件驱动）
 *
 * 从全局目录 ~/.xingjing/agents/ 读取所有 Agent（种子 + 自定义），
 * 按 mode 字段过滤（mode 字段缺失的自定义 Agent 始终返回）。
 *
 * @param mode  'solo' | 'team' — 用于过滤 Agent 的模式
 */
export async function listAllAgents(
  mode: 'solo' | 'team',
): Promise<RegisteredAgent[]> {
  const results: RegisteredAgent[] = [];

  try {
    const entries = await fileList(GLOBAL_AGENTS_DIR);
    const agentFiles = entries.filter(
      e => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('.'),
    );
    await Promise.all(
      agentFiles.map(async (entry) => {
        try {
          const content = await fileRead(`${GLOBAL_AGENTS_DIR}/${entry.name}`);
          if (!content) return;
          const agentId = entry.name.replace('.md', '');
          const agent = parseAgentFile(agentId, content, true);
          if (agent) {
            results.push(agent);
            // 幂等同步当前 workspace 的 .opencode/agents/{id}.md，修复历史上写入的无合法 frontmatter 文件（fire-and-forget）
            void fileWrite(`.opencode/agents/${agentId}.md`, toOpencodeAgentMd(content)).catch(() => {});
          }
        } catch { /* skip unreadable files */ }
      }),
    );
  } catch { /* 全局目录不可用 */ }

  // 按 mode 过滤：mode 字段匹配或未设置 mode 的自定义 Agent 全部返回
  return results.filter(a => !a.mode || a.mode === mode);
}

/**
 * 获取 Agent 列表（旧接口，兼容）
 * @deprecated 使用 listAllAgents 替代
 */
export async function discoverAgents(
  mode: 'solo' | 'team',
  _workDir?: string,
): Promise<RegisteredAgent[]> {
  return listAllAgents(mode);
}

// ─── OpenCode 兼容转换 ──────────────────────────────────────────

/**
 * 将 xingjing Agent Markdown 翻译为 OpenCode 合法格式。
 *
 * OpenCode .opencode/agents/*.md 需要 description + mode 字段：
 *   ---
 *   description: xxx
 *   mode: primary | subagent | all
 *   ---
 *
 * xingjing 自身的 frontmatter 使用 mode=solo|team（产品模式），与 OpenCode
 * mode=primary|subagent|all（agent 执行模式）语义不同，不能直接透传。
 * 此函数：
 *   1. 从 xingjing frontmatter 提取 description
 *   2. 固定输出 mode: primary（用户通过 @ 调用的 agent 一律以主执行模式运行）
 *   3. 透传可选的 temperature / model（若存在）
 *   4. 剥离其余 xingjing 私有字段（id / name / role / emoji / color / bgColor / skills / injectSkills / xingjing 的 mode）
 *   5. 保留 body 作为 system prompt
 */
function toOpencodeAgentMd(xingjingMd: string): string {
  const fmMatch = xingjingMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    // 无 frontmatter：补一个最小合法头
    return `---\ndescription: Custom agent\nmode: primary\n---\n\n${xingjingMd.trimStart()}`;
  }
  const rawFm = fmMatch[1];
  const body = fmMatch[2].trimStart();

  // 轻量 YAML 解析：仅提取简单 key: value（够用，避免引入依赖）
  const fm: Record<string, string> = {};
  for (const line of rawFm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }

  const description = fm.description || fm.role || fm.name || 'Custom agent';
  const parts: string[] = [
    `description: ${JSON.stringify(description)}`,
    `mode: primary`,
  ];
  if (fm.temperature) parts.push(`temperature: ${fm.temperature}`);
  if (fm.model) parts.push(`model: ${fm.model}`);

  return `---\n${parts.join('\n')}\n---\n\n${body}`;
}

// ─── Agent CRUD（供 Agent Workshop 使用）──────────────────────────

/**
 * 保存 Agent 定义到全局目录 ~/.xingjing/agents/{agentId}.md
 * 同时同步到 .opencode/agents/（供 OpenCode session.create 使用）
 */
export async function saveAgentToFile(agent: AutopilotAgent): Promise<boolean> {
  try {
    const content = buildAgentMarkdownContent(agent);
    const ok = await fileWrite(`${GLOBAL_AGENTS_DIR}/${agent.id}.md`, content);
    // 同步到 .opencode/agents/（剥离 frontmatter，避免 OpenCode schema 校验失败）
    await fileWrite(`.opencode/agents/${agent.id}.md`, toOpencodeAgentMd(content)).catch(() => {});
    // Agent 列表变更，刷新 Orchestrator（确保可用 Agent 列表最新）
    await refreshOrchestratorAgent(agent.mode ?? 'solo');
    return ok;
  } catch {
    return false;
  }
}

/**
 * 删除 Agent 文件 ~/.xingjing/agents/{agentId}.md
 */
export async function deleteAgentFile(agentId: string): Promise<boolean> {
  try {
    const ok = await fileDelete(`${GLOBAL_AGENTS_DIR}/${agentId}.md`);
    // 同步删除 .opencode/agents/ 副本
    await fileDelete(`.opencode/agents/${agentId}.md`).catch(() => {});
    // Agent 列表变更，刷新两个模式的 Orchestrator（删除时无法确定 mode）
    await refreshOrchestratorAgent('solo');
    await refreshOrchestratorAgent('team');
    return ok;
  } catch {
    return false;
  }
}

// ─── Agent 注册持久化（写入 .opencode/agents/）────────────────────

/** 重新生成 Orchestrator Agent 并同步到 workspace（Agent 列表变更时调用）*/
async function refreshOrchestratorAgent(mode: 'solo' | 'team'): Promise<void> {
  try {
    const allAgents = await listAllAgents(mode);
    const orchestrator = buildOrchestratorAgent(allAgents, mode);
    const content = buildAgentMarkdownContent(orchestrator);
    await fileWrite(`${GLOBAL_AGENTS_DIR}/${orchestrator.id}.md`, content);
    await fileWrite(`.opencode/agents/${orchestrator.id}.md`, toOpencodeAgentMd(content)).catch(() => {});
  } catch { /* non-blocking */ }
}

/** 构建 Orchestrator Agent 定义，基于已加载的 Agent 列表动态生成 systemPrompt */
function buildOrchestratorAgent(agents: AutopilotAgent[], mode: 'solo' | 'team'): AutopilotAgent {
  return {
    id: 'orchestrator',
    name: 'Orchestrator',
    role: '任务调度',
    mode,
    color: '#531dab',
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
    emoji: '🎯',
    skills: ['任务解析', '多 Agent 调度', '意图识别'],
    description: '根据用户目标决定调用哪些 Agent 以及分配子任务',
    systemPrompt: buildOrchestratorSystemPrompt(agents),
  };
}

/**
 * 将 Agent 定义写入全局目录并同步到 workspace .opencode/agents/
 *
 * 流程：
 * 1. 将种子 .md 原始内容写入全局目录（仅不存在时写入，保留用户修改）
 * 2. 动态生成 Orchestrator（基于当前 Agent 列表）
 * 3. 全局目录 → workspace .opencode/agents/ 全量同步
 *
 * 在 workspace 解析完成后调用。
 */
export async function ensureAgentsRegistered(
  mode: 'solo' | 'team',
): Promise<void> {
  // 幂等守卫：同一 mode 只需执行一次完整注册流程。
  // 避免 xingjing 页面重复挂载 / SolidJS effect 重跑时反复触发 ~30 次
  // Tauri IPC fetch，导致 WKWebView 自定义 IPC 占满、access control checks 拦截。
  if (_registeredAgentModes.has(mode)) return;
  _registeredAgentModes.add(mode);

  // 1. 将种子 .md 文件原始内容写入全局目录（仅不存在时写入，保留用户修改）
  const seedFiles = getSeedAgentFiles();
  for (const [agentId, rawContent] of seedFiles) {
    try {
      const existing = await fileRead(`${GLOBAL_AGENTS_DIR}/${agentId}.md`);
      if (existing) continue;
      await fileWrite(`${GLOBAL_AGENTS_DIR}/${agentId}.md`, rawContent);
    } catch { /* 静默 */ }
  }

  // 2. 动态生成 Orchestrator（基于已加载的 Agent 列表）
  try {
    const allAgents = await listAllAgents(mode);
    const orchestrator = buildOrchestratorAgent(allAgents, mode);
    const orchestratorContent = buildAgentMarkdownContent(orchestrator);
    await fileWrite(`${GLOBAL_AGENTS_DIR}/${orchestrator.id}.md`, orchestratorContent);
  } catch { /* 静默 */ }

  // 3. 全局目录 → workspace .opencode/agents/ 同步（完整内容同步）
  await syncGlobalToWorkspace();

  // 一次性迁移：将 ~/.xingjing/agent-workshop-solo.yaml 中的自定义 Agent 写入全局目录
  await migrateWorkshopYamlToAgentFiles();
}

/**
 * 将全局 ~/.xingjing/agents/ 目录内容同步到 workspace .opencode/agents/
 * 写入时剥离 xingjing frontmatter，确保 OpenCode schema 校验通过
 */
async function syncGlobalToWorkspace(): Promise<void> {
  try {
    const entries = await fileList(GLOBAL_AGENTS_DIR);
    const agentFiles = entries.filter(
      e => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('.'),
    );
    for (const entry of agentFiles) {
      try {
        const content = await fileRead(`${GLOBAL_AGENTS_DIR}/${entry.name}`);
        if (!content) continue;
        await fileWrite(`.opencode/agents/${entry.name}`, toOpencodeAgentMd(content));
      } catch { /* skip individual file errors */ }
    }
  } catch { /* 全局目录不可读，跳过 */ }
}

/**
 * 将 AutopilotAgent 序列化为 Markdown 格式（frontmatter + body）。
 * 用于 Workshop 创建自定义 Agent 和动态生成 Orchestrator。
 * 种子 Agent 直接使用 .md 原始内容，不经过此函数。
 */
export function buildAgentMarkdownContent(agent: AutopilotAgent): string {
  const lines = [
    '---',
    `id: ${agent.id}`,
    `name: ${agent.name}`,
    ...(agent.mode ? [`mode: ${agent.mode}`] : []),
    `role: ${agent.role}`,
    `emoji: "${agent.emoji}"`,
    `color: "${agent.color}"`,
    `bgColor: "${agent.bgColor}"`,
    `borderColor: "${agent.borderColor}"`,
  ];
  if (agent.skills.length > 0) {
    lines.push('skills:');
    for (const s of agent.skills) lines.push(`  - ${s}`);
  }
  if (agent.injectSkills?.length) {
    lines.push('injectSkills:');
    for (const s of agent.injectSkills) lines.push(`  - ${s}`);
  }
  if (agent.description) {
    lines.push(`description: "${agent.description.replace(/"/g, '\\"')}"`);
  }
  lines.push('---', '', `# ${agent.name}`, '', agent.description, '', agent.systemPrompt);
  return lines.join('\n');
}

// ─── 迁移逻辑 ────────────────────────────────────────────────────

/** 迁移标记文件（全局目录下） */
const MIGRATION_MARKER = `${GLOBAL_AGENTS_DIR}/.workshop-migrated`;

/**
 * 一次性迁移：将 ~/.xingjing/agent-workshop-solo.yaml 中的自定义 Agent 写入 ~/.xingjing/agents/
 */
async function migrateWorkshopYamlToAgentFiles(): Promise<void> {
  try {
    // 检查是否已迁移
    const marker = await fileRead(MIGRATION_MARKER);
    if (marker) return;

    // 尝试读取旧 yaml 数据
    const { loadGlobalAgentWorkshop } = await import('./file-store');
    const globalData = await loadGlobalAgentWorkshop();

    if (globalData.agents && globalData.agents.length > 0) {
      const seedIds = getSeedAgentIds();
      for (const agentRaw of globalData.agents) {
        const agent = agentRaw as Record<string, unknown>;
        const id = agent['id'] as string;
        if (!id) continue;
        // 跳过种子 Agent ID
        if (seedIds.has(id)) continue;

        // 检查目标文件是否已存在
        const existing = await fileRead(`${GLOBAL_AGENTS_DIR}/${id}.md`);
        if (existing) continue;

        // 构建 AutopilotAgent 并写入全局目录
        const migrated: AutopilotAgent = {
          id,
          name: (agent['name'] as string) || id,
          role: (agent['role'] as string) || '',
          color: (agent['color'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.color,
          bgColor: (agent['bgColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.bgColor,
          borderColor: (agent['borderColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.borderColor,
          emoji: (agent['emoji'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.emoji,
          skills: (agent['skills'] as string[]) || [],
          description: (agent['description'] as string) || '',
          systemPrompt: (agent['systemPrompt'] as string) || '',
        };
        const content = buildAgentMarkdownContent(migrated);
        await fileWrite(`${GLOBAL_AGENTS_DIR}/${id}.md`, content);
      }
    }

    // 写入迁移标记
    await fileWrite(MIGRATION_MARKER, `migrated at ${new Date().toISOString()}`);
  } catch {
    // 迁移失败不阻塞正常启动
    console.warn('[agent-registry] workshop yaml migration failed (non-blocking)');
  }
}
