/**
 * 统一的 Markdown frontmatter 解析/序列化工具
 *
 * 提供通用的 frontmatter 解析和序列化能力，供 file-store、agent-registry 等模块复用。
 * 基于 js-yaml 标准库，替代此前分散在各模块中的重复实现。
 */

import yaml from 'js-yaml';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface FrontmatterDoc<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

// ─── 完整 Frontmatter 解析（frontmatter + body） ─────────────────────────────

/**
 * 解析 Markdown frontmatter（--- YAML --- 格式）
 *
 * @returns FrontmatterDoc，frontmatter 解析失败时返回空对象 + 原始内容作为 body
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
): FrontmatterDoc<T> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as T, body: content };
  }
  const frontmatter = (yaml.load(match[1]) as T) ?? ({} as T);
  const body = match[2] ?? '';
  return { frontmatter, body };
}

/**
 * 序列化带 frontmatter 的 Markdown
 */
export function stringifyFrontmatter<T extends Record<string, unknown>>(
  doc: FrontmatterDoc<T>,
): string {
  const yamlStr = yaml.dump(doc.frontmatter, { indent: 2 }).trimEnd();
  return `---\n${yamlStr}\n---\n${doc.body}`;
}

// ─── 仅提取 Frontmatter 元数据（不含 body） ─────────────────────────────────

/**
 * 解析 Markdown 文件的 YAML frontmatter 块，仅返回元数据。
 * 解析失败时返回空对象（不抛出异常）。
 */
export function parseFrontmatterMeta(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

// ─── Body 提取 ──────────────────────────────────────────────────────────────

/**
 * 从 frontmatter 提取 body（--- 之后的内容）
 */
export function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}
