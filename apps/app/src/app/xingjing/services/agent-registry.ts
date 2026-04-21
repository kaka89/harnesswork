/**
 * Agent 注册表 — 统一 Agent 发现与注册
 *
 * 设计原则：
 * - 双源合并：自定义 Agent 从全局目录 ~/.xingjing/agents/ 读取，内置 Agent 从代码常量加载
 * - 全局可见：自定义 Agent 跨产品/workspace 可见
 * - 内置 Agent 文件写入 per-workspace .opencode/agents/ 供 OpenCode session.create 使用
 * - 统一读取 API：listAllAgents() 获取完整 Agent 列表
 */

import { type AutopilotAgent, SOLO_AGENTS, TEAM_AGENTS, buildOrchestratorSystemPrompt } from './autopilot-executor';
import { fileRead, fileWrite, fileList, fileDelete } from './opencode-client';
import { parseFrontmatter, extractBody } from '../utils/frontmatter';

// ─── 类型定义 ─────────────────────────────────────────────────

export interface RegisteredAgent extends AutopilotAgent {
  /** Agent 来源：builtin = 内置种子, custom = 用户自定义 */
  source: 'builtin' | 'custom';
  /** 文件来源时的文件路径 */
  filePath?: string;
  /** OpenCode Agent ID（用于 session.create 时指定 agent），对应文件名不含 .md */
  opencodeAgentId?: string;
}

// ─── 全局存储路径 ─────────────────────────────────────────────
const GLOBAL_AGENTS_DIR = '~/.xingjing/agents';

// ─── 默认 UI 属性（用户自定义 Agent 缺省样式）────────────────────────────────

const DEFAULT_CUSTOM_AGENT_STYLE = {
  color: '#531dab',
  bgColor: '#f9f0ff',
  borderColor: '#d3adf7',
  emoji: '🤖',
};

// ─── 内置 Agent 转换 ──────────────────────────────────────────

function toRegisteredAgent(agent: AutopilotAgent): RegisteredAgent {
  return {
    ...agent,
    source: 'builtin',
    editable: false,
    // 内置 Agent 也设置 opencodeAgentId，便于后续 session.create 使用
    opencodeAgentId: agent.id,
  };
}

// ─── 从 Agent Markdown 文件解析为 RegisteredAgent ────────────────

/** 内置 Agent ID 查表（用于快速判断是否为内置 Agent）*/
const BUILTIN_AGENT_IDS = new Set<string>();
function ensureBuiltinIds() {
  if (BUILTIN_AGENT_IDS.size > 0) return;
  for (const a of [...SOLO_AGENTS, ...TEAM_AGENTS]) {
    BUILTIN_AGENT_IDS.add(a.id);
  }
}

/** 从 .opencode/agents/{id}.md 或 ~/.xingjing/agents/{id}.md 文件内容解析为 RegisteredAgent */
function parseAgentFile(agentId: string, content: string, isGlobal = false): RegisteredAgent | null {
  const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
  if (!frontmatter || Object.keys(frontmatter).length === 0) return null;

  ensureBuiltinIds();
  const isBuiltin = BUILTIN_AGENT_IDS.has(agentId);

  // 内置 Agent：优先使用硬编码常量（保证运行时一致性），文件仅供 OpenCode 使用
  if (isBuiltin) {
    const builtinDef = [...SOLO_AGENTS, ...TEAM_AGENTS].find(a => a.id === agentId);
    if (builtinDef) {
      return {
        ...builtinDef,
        source: 'builtin',
        editable: false,
        opencodeAgentId: agentId,
        filePath: `.opencode/agents/${agentId}.md`,
      };
    }
  }

  // 自定义 Agent：从 frontmatter 解析完整属性
  const systemPrompt = extractBody(content);
  return {
    id: (frontmatter['id'] as string) || agentId,
    name: (frontmatter['name'] as string) || agentId,
    role: (frontmatter['role'] as string) || '',
    color: (frontmatter['color'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.color,
    bgColor: (frontmatter['bgColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.bgColor,
    borderColor: (frontmatter['borderColor'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.borderColor,
    emoji: (frontmatter['emoji'] as string) || DEFAULT_CUSTOM_AGENT_STYLE.emoji,
    skills: (frontmatter['skills'] as string[]) || [],
    description: (frontmatter['description'] as string) || '',
    systemPrompt: systemPrompt || '',
    source: 'custom',
    editable: true,
    // 自定义 Agent 赋予 agentId（ensureAgentsRegistered 确保 .opencode/agents/ 中有对应文件）
    opencodeAgentId: agentId,
    filePath: isGlobal ? `${GLOBAL_AGENTS_DIR}/${agentId}.md` : `.opencode/agents/${agentId}.md`,
  };
}

// ─── 统一发现接口 ──────────────────────────────────────────────

/**
 * 统一 Agent 列表获取（双源合并）
 *
 * 1. 从全局目录 ~/.xingjing/agents/ 读取自定义 Agent
 * 2. 合并内置 Agent 常量（始终可用）
 * 降级时返回内置常量。
 *
 * @param mode  'solo' | 'team' — 决定使用哪组内置 Agent
 */
export async function listAllAgents(
  mode: 'solo' | 'team',
): Promise<RegisteredAgent[]> {
  const results: RegisteredAgent[] = [];

  // 1. 从全局目录读取自定义 Agent（~/.xingjing/agents/）
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
          if (agent) results.push(agent);
        } catch { /* skip unreadable files */ }
      }),
    );
  } catch { /* 全局目录不可用，继续 */ }

  // 2. 合并内置 Agent（从常量，始终可用）
  const builtinAgents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  const existingIds = new Set(results.map(a => a.id));
  for (const builtin of builtinAgents) {
    if (!existingIds.has(builtin.id)) {
      results.push(toRegisteredAgent(builtin));
    }
  }

  return results;
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

/**
 * 同步获取内置 Agent 列表（用于 UI 初始化，无需等待异步文件发现）
 */
export function getBuiltinAgents(mode: 'solo' | 'team'): RegisteredAgent[] {
  const agents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  return agents.map(toRegisteredAgent);
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
    // 同步到 .opencode/agents/（供 OpenCode session.create 使用）
    await fileWrite(`.opencode/agents/${agent.id}.md`, content).catch(() => {});
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
    return await fileDelete(`${GLOBAL_AGENTS_DIR}/${agentId}.md`);
  } catch {
    return false;
  }
}

// ─── Agent 注册持久化（写入 .opencode/agents/）────────────────────

/** 构建 Orchestrator Agent 定义，根据当前模式动态生成 systemPrompt */
function buildOrchestratorAgent(mode: 'solo' | 'team'): AutopilotAgent {
  const agents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  return {
    id: 'orchestrator',
    name: 'Orchestrator',
    role: '任务调度',
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
 * 将内置 Agent 定义写入 .opencode/agents/ 目录（供 OpenCode session.create 使用）。
 * 已存在的文件不会被覆盖（保留用户自定义修改）。
 * 在 workspace 解析完成后调用。
 */
export async function ensureAgentsRegistered(
  mode: 'solo' | 'team',
): Promise<void> {
  const agents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  // 内置 Agent + Orchestrator 一并注册（Orchestrator 根据模式动态生成）
  const allAgents: AutopilotAgent[] = [...agents, buildOrchestratorAgent(mode)];
  for (const agent of allAgents) {
    try {
      const existing = await fileRead(`.opencode/agents/${agent.id}.md`);
      if (existing) continue;

      const content = buildAgentMarkdownContent(agent);
      await fileWrite(`.opencode/agents/${agent.id}.md`, content);
    } catch { /* 静默忽略，不影响正常使用 */ }
  }

  // 将全局自定义 Agent 同步到 .opencode/agents/（确保 OpenCode 原生可发现）
  try {
    const entries = await fileList(GLOBAL_AGENTS_DIR);
    const agentFiles = entries.filter(
      e => e.type === 'file' && e.name.endsWith('.md') && !e.name.startsWith('.'),
    );
    ensureBuiltinIds();
    for (const entry of agentFiles) {
      const agentId = entry.name.replace('.md', '');
      if (BUILTIN_AGENT_IDS.has(agentId)) continue; // 内置 Agent 已在上面写入
      try {
        const existing = await fileRead(`.opencode/agents/${agentId}.md`);
        if (existing) continue; // 已存在则跳过
        const content = await fileRead(`${GLOBAL_AGENTS_DIR}/${entry.name}`);
        if (content) await fileWrite(`.opencode/agents/${agentId}.md`, content);
      } catch { /* skip */ }
    }
  } catch { /* 全局目录不可读，跳过 */ }

  // 一次性迁移：将 ~/.xingjing/agent-workshop-solo.yaml 中的自定义 Agent 写入全局目录
  await migrateWorkshopYamlToAgentFiles();
}

/**
 * 将 AutopilotAgent 序列化为 Markdown 格式（frontmatter + body）。
 */
export function buildAgentMarkdownContent(agent: AutopilotAgent): string {
  const lines = [
    '---',
    `id: ${agent.id}`,
    `name: ${agent.name}`,
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
      for (const agentRaw of globalData.agents) {
        const agent = agentRaw as Record<string, unknown>;
        const id = agent['id'] as string;
        if (!id) continue;
        // 跳过内置 Agent ID
        ensureBuiltinIds();
        if (BUILTIN_AGENT_IDS.has(id)) continue;

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
