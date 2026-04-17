/**
 * Skill 管理服务
 *
 * 整合 OpenWork Skill API，提供：
 * - 全面发现：workspace Skills + Hub Skills 统一列表
 * - 动态注入：根据 Agent.skills 自动获取并注入 Skill 上下文
 * - Hub 安装：从 Hub 安装社区 Skill 到 workspace
 *
 * 通过 XingjingOpenworkContext 注入的 API 操作，不直接依赖 OpenWork Server。
 */

import type { SkillApiAdapter } from './knowledge-behavior';

// ─── 类型定义 ─────────────────────────────────────────────────

export interface DiscoveredSkill {
  name: string;
  description: string;
  source: 'workspace' | 'hub';
}

export interface HubSkillApi {
  listHubSkills: () => Promise<Array<{ name: string; description: string }>>;
  installHubSkill: (workspaceId: string, name: string) => Promise<boolean>;
}

// ─── Skill 全面发现 ───────────────────────────────────────────

/**
 * 发现所有可用 Skill：workspace 本地 + Hub 社区。
 * 结果合并去重（以 name 为 key，workspace 优先）。
 */
export async function discoverAllSkills(
  skillApi: SkillApiAdapter | null,
  hubApi: HubSkillApi | null,
): Promise<DiscoveredSkill[]> {
  const skillMap = new Map<string, DiscoveredSkill>();

  // 1. Workspace Skills（优先级高）
  if (skillApi) {
    try {
      const wsSkills = await skillApi.listSkills();
      for (const s of wsSkills) {
        skillMap.set(s.name, {
          name: s.name,
          description: s.description ?? '',
          source: 'workspace',
        });
      }
    } catch { /* 静默降级 */ }
  }

  // 2. Hub Skills（补充）
  if (hubApi) {
    try {
      const hubSkills = await hubApi.listHubSkills();
      for (const s of hubSkills) {
        if (!skillMap.has(s.name)) {
          skillMap.set(s.name, {
            name: s.name,
            description: s.description,
            source: 'hub',
          });
        }
      }
    } catch { /* 静默降级 */ }
  }

  return Array.from(skillMap.values());
}

// ─── Skill 动态注入 ───────────────────────────────────────────

/**
 * 根据 Agent 的 skills 列表，从 OpenWork 获取 Skill 完整内容并拼装为上下文。
 * 返回 Markdown 格式的 Skill 上下文（可直接拼接到 systemPrompt 或 knowledgeContext）。
 *
 * 注意：Agent.skills 中既可能是 Skill ID（如 knowledge-conventions），
 * 也可能是描述性文本（如 '需求分析'）。描述性文本不会匹配到实际 Skill，
 * 会被静默跳过。
 */
export async function injectSkillContext(
  agentSkills: string[],
  skillApi: SkillApiAdapter | null,
): Promise<string> {
  if (!skillApi || agentSkills.length === 0) return '';

  const skillContexts: string[] = [];

  for (const skillName of agentSkills) {
    try {
      const skill = await skillApi.getSkill(skillName);
      if (skill) {
        skillContexts.push(
          `## Skill: ${skill.item.name}\n\n${skill.content}`,
        );
      }
    } catch { /* 单个 Skill 获取失败不影响其他 */ }
  }

  if (skillContexts.length === 0) return '';
  return `\n\n---\n\n# 注入 Skills\n\n${skillContexts.join('\n\n---\n\n')}`;
}

// ─── Hub Skill 安装 ───────────────────────────────────────────

/**
 * 从 Hub 安装 Skill 到指定 workspace。
 */
export async function installSkillFromHub(
  hubApi: HubSkillApi,
  workspaceId: string,
  skillName: string,
): Promise<boolean> {
  try {
    return await hubApi.installHubSkill(workspaceId, skillName);
  } catch {
    console.warn(`[skill-manager] installSkillFromHub failed: ${skillName}`);
    return false;
  }
}
