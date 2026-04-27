/**
 * Skill 产出物（Artifact）配置解析 & 输出标记块提取
 *
 * 职责：
 * 1. 从 SKILL.md frontmatter 解析 `artifact` 配置块
 * 2. 从 AI 输出中提取产出物标记块（支持两种格式）
 * 3. 按 Skill 名称查找并解析 artifact 配置
 *
 * 标记块格式：
 * - 格式 A（Markdown 标记，向后兼容）：### 产出物：标题\n内容...
 * - 格式 B（结构化标签）：<artifact title="标题" format="markdown">内容</artifact>
 */

import { parseFrontmatterMeta } from './frontmatter';
import type { SkillArtifactConfig } from '../types/agent-workshop';

// ─── 从 SKILL.md 解析 artifact 配置 ─────────────────────────────────────────

/**
 * 从 SKILL.md 完整内容中解析 artifact 配置
 *
 * @param skillContent SKILL.md 的原始文本（含 frontmatter）
 * @returns SkillArtifactConfig 或 null（未配置 / 未启用）
 */
export function parseSkillArtifactConfig(skillContent: string): SkillArtifactConfig | null {
  const meta = parseFrontmatterMeta(skillContent);
  const raw = meta.artifact;
  if (!raw || typeof raw !== 'object') return null;

  const cfg = raw as Record<string, unknown>;
  if (!cfg.enabled) return null;

  return {
    enabled: true,
    format: normalizeFormat(cfg.format),
    autoSave: cfg.autoSave !== false, // 默认 true
    savePath: typeof cfg.savePath === 'string' ? cfg.savePath : undefined,
  };
}

/** 标准化 format 值 */
function normalizeFormat(val: unknown): SkillArtifactConfig['format'] {
  if (val === 'markdown' || val === 'html' || val === 'auto') return val;
  return 'auto';
}

// ─── 从 AI 输出提取 artifact 标记块 ─────────────────────────────────────────

export interface ArtifactBlock {
  /** 产出物标题 */
  title: string;
  /** 产出物正文内容 */
  content: string;
  /** 声明的格式（仅格式 B 可指定，格式 A 为 undefined） */
  format?: 'markdown' | 'html';
}

/**
 * 从 AI 输出中提取产出物标记块
 *
 * 匹配优先级：
 * 1. 格式 B: <artifact title="标题" format="markdown">内容</artifact>
 * 2. 格式 A: ### 产出物：标题\n内容...（向后兼容）
 *
 * @returns ArtifactBlock 或 null（未包含标记块）
 */
export function extractArtifactBlock(output: string): ArtifactBlock | null {
  // 格式 B: 结构化标签
  const tagMatch = output.match(
    /<artifact\s+title="([^"]+)"(?:\s+format="(markdown|html)")?\s*>([\s\S]*?)<\/artifact>/,
  );
  if (tagMatch) {
    const content = tagMatch[3].trim();
    if (content.length < 20) return null;
    return {
      title: tagMatch[1].trim(),
      content,
      format: (tagMatch[2] as 'markdown' | 'html') || undefined,
    };
  }

  // 格式 A: Markdown 标记（### 产出物：标题）
  const mdMatch = output.match(new RegExp('###\\s*产出物[：:]\\s*(.+?)\\n([\\s\\S]*?)(?=\\n##(?!#)|\\n---|\\n###(?!\\s*产出物)|\\s*$)'));
  if (mdMatch) {
    const content = mdMatch[2].trim();
    if (content.length < 20) return null;
    return {
      title: mdMatch[1].trim(),
      content,
    };
  }

  return null;
}

// ─── 按 Skill 名称查找 artifact 配置 ─────────────────────────────────────────

/**
 * 用于调用 OpenWork Skill API 的适配器接口
 * （从 knowledge-behavior 的 SkillApiAdapter 中提取最小子集，避免循环依赖）
 */
export interface SkillContentResolver {
  getSkill: (name: string) => Promise<{ content: string } | null>;
}

/**
 * 根据 Skill 名称解析其 artifact 配置
 *
 * 流程：通过 Skill API 获取 SKILL.md 内容 → 解析 frontmatter → 返回 artifact 配置
 *
 * @param skillName Skill 名称
 * @param resolver Skill 内容获取器（通常是 actions.getOpenworkSkill）
 * @returns SkillArtifactConfig 或 null
 */
export async function resolveSkillArtifactConfig(
  skillName: string,
  resolver: SkillContentResolver | null,
): Promise<SkillArtifactConfig | null> {
  if (!resolver || !skillName) return null;

  try {
    const skill = await resolver.getSkill(skillName);
    if (!skill?.content) return null;
    return parseSkillArtifactConfig(skill.content);
  } catch {
    return null;
  }
}
