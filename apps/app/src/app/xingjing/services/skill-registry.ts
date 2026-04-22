/**
 * Skill 注册表 — 对齐 OpenWork 原生 Skill 系统
 *
 * 设计原则：
 * - ~/.xingjing/skills/ 为星静自定义 Skill 的全局存储/管理目录（跨 workspace 权威源）
 * - .opencode/skills/ 为 OpenWork 原生加载目录（运行时由 injectSkillContext -> getSkill 使用）
 * - 创建/修改时双写：全局 + per-workspace
 * - workspace 启动时自动同步：全局自定义 Skill 注册到 .opencode/skills/
 * - 运行时加载走 OpenWork 原生路径（getSkill API）
 */

import { SOLO_SKILL_DEFS } from '../skills/solo-skill-defs';
import { teamSkillPool, type SkillDef } from '../mock/agentWorkshop';
import { fileRead, fileWrite, fileList, fileDelete } from './opencode-client';

// ─── 全局存储路径 ─────────────────────────────────────

const GLOBAL_SKILLS_DIR = '~/.xingjing/skills';

/**
 * 确保内置 Skill + 全局自定义 Skill 已注册到 OpenWork workspace。
 * 通过 upsertSkill API 写入 .opencode/skills/{name}/SKILL.md。
 * 已存在的 Skill 不会被覆盖（保留用户自定义修改）。
 *
 * @param mode  'solo' | 'team' — 决定使用哪组内置 Skill 池
 * @param upsertSkill  OpenWork upsertSkill API
 * @param listSkills   OpenWork listSkills API（用于避免重复写入）
 */
export async function ensureSkillsRegistered(
  mode: 'solo' | 'team',
  upsertSkill: (name: string, content: string, description?: string) => Promise<boolean>,
  listSkills: () => Promise<Array<{ name: string }>>,
): Promise<void> {
  // 发现已存在的 Skill，避免重复写入
  let existing: Set<string>;
  try {
    const skills = await listSkills();
    existing = new Set(skills.map(s => s.name));
  } catch {
    existing = new Set();
  }

  // 仅写入尚不存在的内置 Skill
  if (mode === 'solo') {
    // solo 模式：直接使用 SKILL.md 格式定义（无需 buildSkillMarkdown 转换）
    for (const [name, content] of Object.entries(SOLO_SKILL_DEFS)) {
      if (existing.has(name)) continue;
      try {
        await upsertSkill(name, content);
      } catch {
        // 单个 Skill 写入失败不影响其他
      }
    }
  } else {
    // team 模式：保持原有 buildSkillMarkdown 路径
    const pool = teamSkillPool;
    for (const skill of pool) {
      if (existing.has(skill.name)) continue;
      try {
        const content = buildSkillMarkdown(skill);
        await upsertSkill(skill.name, content, skill.description);
      } catch {
        // 单个 Skill 写入失败不影响其他
      }
    }
  }

  // 将全局自定义 Skill 同步到当前 workspace（确保跨 workspace 可用）
  try {
    const globalSkills = await listGlobalCustomSkills();
    for (const gs of globalSkills) {
      if (existing.has(gs.name)) continue;
      try {
        await upsertSkill(gs.name, gs.content);
      } catch { /* 单个失败不阻塞 */ }
    }
  } catch { /* 全局目录不可读，跳过 */ }
}

/**
 * 将 SkillDef 序列化为 OpenWork SKILL.md 格式（YAML frontmatter + body）
 */
export function buildSkillMarkdown(skill: SkillDef): string {
  const frontmatterLines = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
  ];
  if (skill.category) frontmatterLines.push(`category: ${skill.category}`);
  if (skill.trigger) frontmatterLines.push(`trigger: ${skill.trigger}`);
  if (skill.glob) frontmatterLines.push(`glob: ${skill.glob}`);
  frontmatterLines.push('---');

  const body = skill.systemPrompt || `你是一个专业的${skill.name}执行助手。`;
  return `${frontmatterLines.join('\n')}\n\n${body}`;
}

// ─── 全局自定义 Skill 存储 ───────────────────────────────

/**
 * 将自定义 Skill 写入全局目录 ~/.xingjing/skills/{name}/SKILL.md
 * 作为跨 workspace 的权威数据源。
 */
export async function saveSkillToGlobal(name: string, content: string): Promise<boolean> {
  try {
    return await fileWrite(`${GLOBAL_SKILLS_DIR}/${name}/SKILL.md`, content);
  } catch {
    return false;
  }
}

/**
 * 从全局目录读取所有自定义 Skill（用于同步到 per-workspace）
 */
export async function listGlobalCustomSkills(): Promise<Array<{ name: string; content: string }>> {
  try {
    const entries = await fileList(GLOBAL_SKILLS_DIR);
    const dirs = entries.filter(e => e.type === 'directory');
    const results: Array<{ name: string; content: string }> = [];
    for (const dir of dirs) {
      try {
        const content = await fileRead(`${GLOBAL_SKILLS_DIR}/${dir.name}/SKILL.md`);
        if (content) results.push({ name: dir.name, content });
      } catch { /* skip */ }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 从全局目录删除自定义 Skill（~/.xingjing/skills/{name}/SKILL.md）
 * 与 deleteOpenworkSkill 配合使用，实现双向删除。
 * 仅用于用户自建 Skill，内置 Skill 不调用。
 */
export async function deleteSkillFromGlobal(name: string): Promise<boolean> {
  try {
    return await fileDelete(`${GLOBAL_SKILLS_DIR}/${name}/SKILL.md`);
  } catch {
    return false;
  }
}
