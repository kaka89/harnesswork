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

import { type AutopilotAgent, SOLO_AGENTS, TEAM_AGENTS } from './autopilot-executor';
import { fileList, fileRead } from './opencode-client';

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
 * 使用简单正则匹配 --- 分隔的头部，避免引入 js-yaml 依赖。
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  let currentKey = '';
  let currentList: string[] | null = null;

  for (const line of yaml.split('\n')) {
    // 列表项：  - value
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listMatch[1].trim());
      continue;
    }

    // 如果之前在收集列表，保存它
    if (currentList && currentKey) {
      result[currentKey] = currentList;
      currentList = null;
    }

    // 键值对：key: value
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === '' || rawValue === '|') {
        // 可能是列表或多行值的开始，等下一行判断
        continue;
      }

      // 去除引号
      const unquoted = rawValue.replace(/^["'](.*)["']$/, '$1');
      result[currentKey] = unquoted;
    }
  }

  // 收尾：如果最后一个 key 是列表
  if (currentList && currentKey) {
    result[currentKey] = currentList;
  }

  return result;
}

/**
 * 从 frontmatter 提取 body（--- 之后的内容），作为 systemPrompt
 */
function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

// ─── Agent 定义文件加载 ──────────────────────────────────────────

/**
 * 从 .opencode/agents/ 目录读取所有 Agent 定义文件
 * @param workDir 工作目录（传给 OpenCode file API）
 */
async function loadFileAgents(workDir?: string): Promise<RegisteredAgent[]> {
  const agents: RegisteredAgent[] = [];
  const agentDir = '.opencode/agents';

  try {
    const files = await fileList(agentDir, workDir);
    const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));

    for (const file of mdFiles) {
      try {
        const content = await fileRead(file.path, workDir);
        if (!content) continue;

        const agent = parseAgentMarkdown(content, file.path);
        if (agent) agents.push(agent);
      } catch {
        // 单个文件解析失败不影响其他文件
        console.warn(`[agent-registry] 解析 Agent 文件失败: ${file.path}`);
      }
    }
  } catch {
    // 目录不存在或无法访问，静默降级
    console.warn('[agent-registry] 无法读取 .opencode/agents/ 目录，将使用内置 Agent');
  }

  return agents;
}

/**
 * 解析单个 Agent markdown 文件为 RegisteredAgent
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
 * 统一 Agent 发现：从 .opencode/agents/ 文件 + 内置常量合并。
 * 文件 Agent 按 id 覆盖内置 Agent。
 *
 * @param mode  'solo' | 'team' — 决定使用哪组内置 Agent 作为兜底
 * @param workDir 工作目录（传给文件 API）
 */
export async function discoverAgents(
  mode: 'solo' | 'team',
  workDir?: string,
): Promise<RegisteredAgent[]> {
  const builtinAgents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  const builtinMap = new Map<string, RegisteredAgent>(
    builtinAgents.map((a) => [a.id, toRegisteredAgent(a)]),
  );

  // 尝试从文件加载
  const fileAgents = await loadFileAgents(workDir);

  // 文件 Agent 覆盖内置 Agent（按 id 合并）
  for (const fa of fileAgents) {
    builtinMap.set(fa.id, fa);
  }

  return Array.from(builtinMap.values());
}

/**
 * 同步获取内置 Agent 列表（用于 UI 初始化，无需等待异步文件发现）
 */
export function getBuiltinAgents(mode: 'solo' | 'team'): RegisteredAgent[] {
  const agents = mode === 'solo' ? SOLO_AGENTS : TEAM_AGENTS;
  return agents.map(toRegisteredAgent);
}
