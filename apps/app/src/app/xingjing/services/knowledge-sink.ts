/**
 * Agent 产出分流沉淀服务
 *
 * 在 Agent 完成后异步触发，分析产出内容并按类型沉淀到对应知识库：
 * - 行为知识（可复用的最佳实践、架构模式等）→ 通过 Skill API 写入
 * - 私有知识（一次性备忘、个人笔记）→ 写入本地 .xingjing/knowledge/
 *
 * 设计原则：
 * 1. 仅输出长度 > 200 字时触发（避免对短回复过度处理）
 * 2. 异步执行，不阻塞 Agent 流程
 * 3. 行为知识写入失败时降级为私有知识
 * 4. 去重：同一 Agent + 同一会话仅沉淀一次
 */

import {
  saveBehaviorKnowledge,
  type SkillApiAdapter,
  type BehaviorKnowledge,
  type BehaviorKnowledgeCategory,
  type ApplicableScene,
} from './knowledge-behavior';
import { saveSoloKnowledge, type SoloKnowledgeItem } from './file-store';
import { invalidateKnowledgeCache } from './knowledge-retrieval';
import { extractArtifactBlock } from '../utils/skill-artifact';

// ─── 配置 ─────────────────────────────────────────────────────────────────────

/** 最小输出长度（字符数），低于此阈值不触发沉淀 */
const MIN_OUTPUT_LENGTH = 200;

/** 知识提取的最大片段长度 */
const MAX_EXTRACT_LENGTH = 1000;

/** 防止同一会话多次沉淀的去重窗口 */
const _recentSinks = new Set<string>();
const DEDUP_WINDOW_MS = 60 * 1000; // 1 分钟去重窗口

// ─── 主接口 ─────────────────────────────────────────────────────────────────

export interface SinkAgentOutputOpts {
  /** Agent 完整输出文本 */
  output: string;
  /** Agent ID */
  agentId: string;
  /** 当前会话/任务 ID（用于去重） */
  sessionId?: string;
  /** 工作目录 */
  workDir: string;
  /** OpenWork Skill API 适配器（null 则仅写入私有知识） */
  skillApi: SkillApiAdapter | null;
  /** 用户的原始目标/prompt（帮助分类） */
  goal?: string;
}

export interface SinkResult {
  /** 是否成功沉淀 */
  sunk: boolean;
  /** 沉淀目标：behavior（Skill）/ private（本地文件）/ none（未触发） */
  target: 'behavior' | 'private' | 'none';
  /** 沉淀的知识 ID */
  knowledgeId?: string;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 分析 Agent 产出并按类型沉淀到对应知识库
 *
 * 调用时机：Agent onDone 回调后异步触发
 */
export async function sinkAgentOutput(opts: SinkAgentOutputOpts): Promise<SinkResult> {
  const { output, agentId, sessionId, workDir, skillApi, goal } = opts;
  const noResult: SinkResult = { sunk: false, target: 'none' };

  // 1. 前置检查
  if (!output || output.length < MIN_OUTPUT_LENGTH) return noResult;
  if (!workDir) return noResult;

  // 2. 去重检查
  const dedupKey = `${agentId}:${sessionId ?? 'default'}`;
  if (_recentSinks.has(dedupKey)) return noResult;
  _recentSinks.add(dedupKey);
  setTimeout(() => _recentSinks.delete(dedupKey), DEDUP_WINDOW_MS);

  try {
    // 3. 提取可沉淀的知识片段
    const extracted = extractKnowledgeFromOutput(output, agentId, goal);
    if (!extracted) return noResult;

    // 4. 分流沉淀
    if (extracted.type === 'behavior' && skillApi) {
      return await sinkAsBehaviorKnowledge(extracted, skillApi, workDir, agentId, sessionId);
    }

    // 行为知识写入失败或无 skillApi → 降级为私有知识
    return await sinkAsPrivateKnowledge(extracted, workDir, agentId, sessionId);
  } catch (e) {
    console.warn('[knowledge-sink] sinkAgentOutput failed:', e);
    return { sunk: false, target: 'none', error: String(e) };
  }
}

// ─── 知识提取 ─────────────────────────────────────────────────────────────────

interface ExtractedKnowledge {
  type: 'behavior' | 'private';
  title: string;
  content: string;
  tags: string[];
  category: BehaviorKnowledgeCategory;
  scene: ApplicableScene;
}

/**
 * 从 Agent 输出中提取可沉淀的知识
 *
 * 提取策略（复用 extractArtifactBlock 统一标记块检测）：
 * 1. 检测“产出物”标记块（格式 A: Markdown 标记 / 格式 B: 结构化标签）
 * 2. 检测结构化建议/决策/最佳实践（Markdown 标题 + 列表）
 * 3. 提取关键标签（从标题和内容中）
 */
function extractKnowledgeFromOutput(
  output: string,
  agentId: string,
  goal?: string,
): ExtractedKnowledge | null {
  // 优先提取「产出物」块（复用统一的 extractArtifactBlock，同时支持格式 A + B）
  const artifactBlock = extractArtifactBlock(output);

  if (artifactBlock) {
    const content = artifactBlock.content.slice(0, MAX_EXTRACT_LENGTH);
    if (content.length < 50) return null;

    const classification = classifyByAgent(agentId);
    const tags = extractTags(artifactBlock.title, content, goal);

    return {
      type: classification.type,
      title: artifactBlock.title,
      content,
      tags,
      category: classification.category,
      scene: classification.scene,
    };
  }

  // 次选：提取「执行结果」块
  const resultMatch = output.match(new RegExp('##\\s*执行结果\n([\\s\\S]*?)(?=\n##|\n---|\n###|$)'));
  if (resultMatch) {
    const content = resultMatch[1].trim().slice(0, MAX_EXTRACT_LENGTH);
    if (content.length < 100) return null;

    const classification = classifyByAgent(agentId);
    const title = extractTitle(output, goal) || `${agentId} 执行结果`;
    const tags = extractTags(title, content, goal);

    return {
      type: 'private', // 执行结果默认为私有知识
      title,
      content,
      tags,
      category: classification.category,
      scene: classification.scene,
    };
  }

  // 最后：如果输出足够长且包含结构化内容，提取关键段落
  if (output.length > 500 && output.includes('##')) {
    const sections = output.split(/\n##\s+/).filter(s => s.trim().length > 80);
    if (sections.length === 0) return null;

    const bestSection = sections.reduce((a, b) => a.length > b.length ? a : b);
    const titleLine = bestSection.split('\n')[0].trim();
    const content = bestSection.slice(titleLine.length).trim().slice(0, MAX_EXTRACT_LENGTH);

    if (content.length < 100) return null;

    const classification = classifyByAgent(agentId);
    const tags = extractTags(titleLine, content, goal);

    return {
      type: 'private',
      title: titleLine.slice(0, 60) || `${agentId} 知识摘要`,
      content,
      tags,
      category: classification.category,
      scene: classification.scene,
    };
  }

  return null;
}

// ─── 分类辅助 ─────────────────────────────────────────────────────────────────

interface AgentClassification {
  type: 'behavior' | 'private';
  category: BehaviorKnowledgeCategory;
  scene: ApplicableScene;
}

/**
 * 根据 Agent ID 推断知识分类
 */
function classifyByAgent(agentId: string): AgentClassification {
  const map: Record<string, AgentClassification> = {
    'pm-agent':      { type: 'behavior', category: 'process',       scene: 'product-planning' },
    'product-brain': { type: 'behavior', category: 'process',       scene: 'product-planning' },
    'arch-agent':    { type: 'behavior', category: 'architecture',  scene: 'technical-design' },
    'eng-brain':     { type: 'behavior', category: 'best-practice', scene: 'code-development' },
    'dev-agent':     { type: 'behavior', category: 'best-practice', scene: 'code-development' },
    'qa-agent':      { type: 'behavior', category: 'best-practice', scene: 'code-development' },
    'growth-brain':  { type: 'private',  category: 'scenario',      scene: 'product-planning' },
    'ops-brain':     { type: 'private',  category: 'process',       scene: 'code-development' },
    'sre-agent':     { type: 'private',  category: 'process',       scene: 'code-development' },
    'mgr-agent':     { type: 'private',  category: 'process',       scene: 'product-planning' },
  };

  return map[agentId] ?? { type: 'private', category: 'best-practice', scene: 'code-development' };
}

/**
 * 从内容中提取标签
 */
function extractTags(title: string, content: string, goal?: string): string[] {
  const tags = new Set<string>();
  const combined = `${title} ${goal ?? ''} ${content.slice(0, 200)}`.toLowerCase();

  // 预定义标签关键词映射
  const tagRules: Array<{ keywords: string[]; tag: string }> = [
    { keywords: ['架构', 'architecture', 'system design'], tag: '架构' },
    { keywords: ['api', '接口', 'endpoint'], tag: 'API' },
    { keywords: ['测试', 'test', 'qa'], tag: '测试' },
    { keywords: ['部署', 'deploy', 'ci/cd', 'pipeline'], tag: '部署' },
    { keywords: ['需求', 'prd', 'requirement'], tag: '需求' },
    { keywords: ['性能', 'performance', 'optimization'], tag: '性能' },
    { keywords: ['安全', 'security', 'auth'], tag: '安全' },
    { keywords: ['数据', 'database', 'data'], tag: '数据' },
    { keywords: ['ui', 'ux', '界面', '组件'], tag: 'UI/UX' },
    { keywords: ['监控', 'monitor', '告警', 'alert'], tag: '监控' },
  ];

  for (const rule of tagRules) {
    if (rule.keywords.some(kw => combined.includes(kw))) {
      tags.add(rule.tag);
    }
  }

  // 最多 5 个标签
  return Array.from(tags).slice(0, 5);
}

/**
 * 从输出中提取标题
 */
function extractTitle(output: string, goal?: string): string {
  // 尝试从「执行动作」段提取
  const actionMatch = output.match(/##\s*执行动作\n(.+)/);
  if (actionMatch) return actionMatch[1].trim().slice(0, 60);

  // 尝试从首个 Markdown 标题提取
  const headingMatch = output.match(/^#+\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 60);

  // 降级使用目标的前 60 字
  if (goal) return goal.slice(0, 60);

  return '';
}

// ─── 沉淀执行 ─────────────────────────────────────────────────────────────────

async function sinkAsBehaviorKnowledge(
  extracted: ExtractedKnowledge,
  skillApi: SkillApiAdapter,
  workDir: string,
  agentId?: string,
  sessionId?: string,
): Promise<SinkResult> {
  const id = `auto-${Date.now().toString(36)}`;

  const item: BehaviorKnowledge = {
    id,
    title: extracted.title,
    category: extracted.category,
    applicableScenes: [extracted.scene],
    tags: extracted.tags,
    content: extracted.content,
    lifecycle: 'living',
    refs: [],
  };

  try {
    await saveBehaviorKnowledge(skillApi, item);
    invalidateKnowledgeCache();
    return { sunk: true, target: 'behavior', knowledgeId: id };
  } catch (e) {
    console.warn('[knowledge-sink] behavior sink failed, falling back to private:', e);
    // 降级为私有知识
    return await sinkAsPrivateKnowledge(extracted, workDir, agentId, sessionId);
  }
}

async function sinkAsPrivateKnowledge(
  extracted: ExtractedKnowledge,
  workDir: string,
  agentId?: string,
  sessionId?: string,
): Promise<SinkResult> {
  const id = `note-${Date.now().toString(36)}`;

  const item: SoloKnowledgeItem = {
    id,
    category: 'tech-note',
    title: extracted.title,
    content: extracted.content,
    tags: extracted.tags,
    date: new Date().toISOString().split('T')[0],
    sourceAgentId: agentId,
    sourceSessionId: sessionId,
  };

  try {
    const ok = await saveSoloKnowledge(workDir, item);
    if (ok) {
      invalidateKnowledgeCache();
      return { sunk: true, target: 'private', knowledgeId: id };
    }
    return { sunk: false, target: 'none', error: 'saveSoloKnowledge returned false' };
  } catch (e) {
    return { sunk: false, target: 'none', error: String(e) };
  }
}
