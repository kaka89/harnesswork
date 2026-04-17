/**
 * Agent 注册表 — 统一 Agent 发现与注册
 *
 * 支持双源发现机制：
 * 1. 文件驱动：从 .opencode/agents/*.md 读取 Agent 定义（优先）
 * 2. 内置兜底：使用 SOLO_AGENTS / TEAM_AGENTS 硬编码常量
 *
 * 文件 Agent 与内置 Agent 按 id 合并，文件优先覆盖。
 * 文件读取失败时静默回退到内置常量，保证零故障降级。
 */

import yaml from 'js-yaml';
import { type AutopilotAgent, SOLO_AGENTS, TEAM_AGENTS, buildOrchestratorSystemPrompt } from './autopilot-executor';
import { fileRead, fileWrite } from './opencode-client';

// ─── 类型定义 ─────────────────────────────────────────────────

export interface RegisteredAgent extends AutopilotAgent {
  /** Agent 来源：file = 从 .opencode/agents/ 加载，builtin = 内置常量 */
  source: 'file' | 'builtin';
  /** 文件来源时的文件路径 */
  filePath?: string;
  /** OpenCode Agent ID（用于 session.create 时指定 agent），对应文件名不含 .md */
  opencodeAgentId?: string;
}

// ─── Frontmatter 解析 ──────────────────────────────────────────

/**
 * 解析 Markdown 文件的 YAML frontmatter 块。
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/**
 * 从 frontmatter 提取 body（--- 之后的内容），作为 systemPrompt
 */
function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

// ─── Agent 定义文件加载（已移除） ──────────────────────────────────────────
//
// 注意：文件扫描逻辑已删除。OpenCode 原生在 session.create({ agentID }) 时
// 会自动加载 .opencode/agents/{agentID}.md。前端无需扫描文件。

/**
 * 解析单个 Agent markdown 文件为 RegisteredAgent
 *
 * 注意：此函数仅用于 UI 预览和文件手动导入。
 * 在 OpenCode 原生执行时，Agent 定义由 session.create({ agentID }) 加载。
 */
export function parseAgentMarkdown(content: string, filePath: string): RegisteredAgent | null {
  const meta = parseFrontmatter(content);
  const name = meta.name as string | undefined;
  if (!name) return null;

  const body = extractBody(content);
  if (!body) return null;

  // 从文件名推导 OpenCode Agent ID
  const fileName = filePath.split('/').pop()?.replace('.md', '') ?? name;

  return {
    id: name,
    name: (meta.description as string)?.split('—')[0]?.trim() ?? name,
    role: (meta.description as string)?.split('—')[1]?.trim() ?? name,
    color: (meta.color as string) ?? '#666666',
    bgColor: (meta.bgColor as string) ?? '#f5f5f5',
    borderColor: (meta.borderColor as string) ?? '#d9d9d9',
    emoji: (meta.emoji as string) ?? '🤖',
    skills: (meta.skills as string[]) ?? [],
    description: (meta.description as string) ?? '',
    systemPrompt: body,
    source: 'file',
    filePath,
    opencodeAgentId: fileName,
  };
}

// ─── 内置 Agent 转换 ──────────────────────────────────────────

function toRegisteredAgent(agent: AutopilotAgent): RegisteredAgent {
  return {
    ...agent,
    source: 'builtin',
    // 内置 Agent 也设置 opencodeAgentId，便于后续 session.create 使用
    opencodeAgentId: agent.id,
  };
}

// ─── 统一发现接口 ──────────────────────────────────────────────

/**
 * 获取 Agent 列表（UI 展示用）
 *
 * 注意：实际 Agent 执行时通过 session.create({ agentID }) 传入 ID 即可，
 * OpenCode 会自动从 .opencode/agents/{agentID}.md 加载，无需前端扫描。
 *
 * @param mode  'solo' | 'team' — 决定使用哪组内置 Agent
 * @param _workDir  保留参数签名兼容，但不再用于文件扫描
 */
export async function discoverAgents(
  mode: 'solo' | 'team',
  _workDir?: string,
): Promise<RegisteredAgent[]> {
  const builtinAgents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  return builtinAgents.map(toRegisteredAgent);
}

/**
 * 同步获取内置 Agent 列表（用于 UI 初始化，无需等待异步文件发现）
 */
export function getBuiltinAgents(mode: 'solo' | 'team'): RegisteredAgent[] {
  const agents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  return agents.map(toRegisteredAgent);
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
 * 将内置 Agent 定义写入 .opencode/agents/ 目录（通过 OpenWork API）。
 * 已存在的文件不会被覆盖（保留用户自定义）。
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
}

/**
 * 将 AutopilotAgent 序列化为 Markdown 格式（frontmatter + body）。
 * 生成的格式与 parseAgentMarkdown 兼容。
 */
function buildAgentMarkdownContent(agent: AutopilotAgent): string {
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
  lines.push('---', '', `# ${agent.name}`, '', agent.description, '', agent.systemPrompt);
  return lines.join('\n');
}
