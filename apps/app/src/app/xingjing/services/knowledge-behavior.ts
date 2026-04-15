/**
 * 行为知识管理服务
 *
 * 通过 OpenWork Skill API 管理行为知识（存为 .opencode/skills/knowledge-{id}/SKILL.md）。
 * 行为知识可团队共享、可版本控制，是知识体系中的"公共层"。
 */

import type { OpenworkSkillItem, OpenworkSkillContent } from '../../lib/openwork-server';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const KNOWLEDGE_PREFIX = 'knowledge-';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type BehaviorKnowledgeCategory =
  | 'glossary'
  | 'best-practice'
  | 'architecture'
  | 'process'
  | 'scenario';

export type ApplicableScene =
  | 'product-planning'
  | 'requirement-design'
  | 'technical-design'
  | 'code-development';

export interface BehaviorKnowledge {
  id: string;
  title: string;
  category: BehaviorKnowledgeCategory;
  applicableScenes: ApplicableScene[];
  tags: string[];
  content: string;
  lifecycle: 'living' | 'stable';
  refs: string[];
}

// ─── Skill API 封装（通过 store.actions 注入） ─────────────────────────────────

export interface SkillApiAdapter {
  listSkills: () => Promise<OpenworkSkillItem[]>;
  getSkill: (name: string) => Promise<OpenworkSkillContent | null>;
  upsertSkill: (name: string, content: string, description?: string) => Promise<boolean>;
}

/**
 * 列出所有行为知识（过滤 knowledge-* 前缀的 Skill）
 */
export async function listBehaviorKnowledge(
  api: SkillApiAdapter,
): Promise<BehaviorKnowledge[]> {
  try {
    const skills = await api.listSkills();
    const knowledgeSkills = skills.filter(s => s.name.startsWith(KNOWLEDGE_PREFIX));

    const results: BehaviorKnowledge[] = [];
    for (const skill of knowledgeSkills) {
      const detail = await api.getSkill(skill.name);
      if (detail) {
        const parsed = parseSkillContent(skill.name, detail.content);
        if (parsed) results.push(parsed);
      }
    }
    return results;
  } catch (e) {
    console.warn('[knowledge-behavior] listBehaviorKnowledge failed:', e);
    return [];
  }
}

/**
 * 获取单个行为知识的完整内容
 */
export async function getBehaviorKnowledge(
  api: SkillApiAdapter,
  id: string,
): Promise<BehaviorKnowledge | null> {
  try {
    const name = `${KNOWLEDGE_PREFIX}${id}`;
    const detail = await api.getSkill(name);
    if (!detail) return null;
    return parseSkillContent(name, detail.content);
  } catch {
    return null;
  }
}

/**
 * 保存行为知识（通过 upsertSkill 写入）
 */
export async function saveBehaviorKnowledge(
  api: SkillApiAdapter,
  item: BehaviorKnowledge,
): Promise<boolean> {
  try {
    const name = `${KNOWLEDGE_PREFIX}${item.id}`;
    const content = serializeToSkillContent(item);
    const description = `[${item.category}] ${item.title}`;
    return await api.upsertSkill(name, content, description);
  } catch {
    return false;
  }
}

// ─── Skill 内容格式（Markdown + frontmatter）─────────────────────────────────

/**
 * 将 Skill content 文本解析为 BehaviorKnowledge
 *
 * 格式约定：
 * ---
 * id: xxx
 * title: xxx
 * category: glossary
 * applicableScenes: [product-planning, requirement-design]
 * tags: [tag1, tag2]
 * lifecycle: living
 * refs: [PRD-001]
 * ---
 * 正文内容
 */
function parseSkillContent(skillName: string, content: string): BehaviorKnowledge | null {
  try {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) {
      // 无 frontmatter，作为纯文本知识
      const id = skillName.replace(KNOWLEDGE_PREFIX, '');
      return {
        id,
        title: id,
        category: 'best-practice',
        applicableScenes: [],
        tags: [],
        content: content.trim(),
        lifecycle: 'living',
        refs: [],
      };
    }

    const fm = fmMatch[1];
    const body = fmMatch[2].trim();

    const getValue = (key: string): string => {
      const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const getArray = (key: string): string[] => {
      const raw = getValue(key);
      if (!raw) return [];
      // 支持 [a, b, c] 或 YAML 数组
      const cleaned = raw.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(s => s.trim()).filter(Boolean);
    };

    const id = getValue('id') || skillName.replace(KNOWLEDGE_PREFIX, '');

    return {
      id,
      title: getValue('title') || id,
      category: (getValue('category') || 'best-practice') as BehaviorKnowledgeCategory,
      applicableScenes: getArray('applicableScenes') as ApplicableScene[],
      tags: getArray('tags'),
      content: body,
      lifecycle: (getValue('lifecycle') || 'living') as 'living' | 'stable',
      refs: getArray('refs'),
    };
  } catch {
    return null;
  }
}

/**
 * 将 BehaviorKnowledge 序列化为 Skill content 格式
 */
function serializeToSkillContent(item: BehaviorKnowledge): string {
  const fm = [
    '---',
    `id: ${item.id}`,
    `title: ${item.title}`,
    `category: ${item.category}`,
    `applicableScenes: [${item.applicableScenes.join(', ')}]`,
    `tags: [${item.tags.join(', ')}]`,
    `lifecycle: ${item.lifecycle}`,
    `refs: [${item.refs.join(', ')}]`,
    '---',
  ].join('\n');

  return `${fm}\n\n${item.content}`;
}
