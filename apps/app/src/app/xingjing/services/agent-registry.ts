/**
 * Agent 注册表 — 统一 Agent 发现与注册
 *
 * Agent 发现已简化为内置常量模式：
 * - 文件扫描已移除，OpenCode 原生在 session.create({ agentID }) 时自动加载
 * - 前端仅通过内置 SOLO_AGENTS / TEAM_AGENTS 常量提供 UI 展示
 * - Agent 定义通过 ensureAgentsRegistered() 写入 .opencode/agents/ 目录
 */

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

// ─── Agent 发现已简化（文件扫描已移除） ────────────────────────────────────
//
// OpenCode 原生在 session.create({ agentID }) 时自动加载 .opencode/agents/{agentID}.md。
// 前端无需扫描文件或解析 Agent Markdown。

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
