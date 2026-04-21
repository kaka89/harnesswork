/**
 * 定时任务客户端 — 通过注入接口桥接 OpenWork Automations
 *
 * 数据通道：
 *   列表/删除 → 通过 setSchedulerApi() 注入的 OpenWork Scheduler API
 *   创建 → 构建 scheduler prompt，由调用方通过 session 发送
 *
 * 已移除的降级逻辑（ADR-001 R4）：
 *   - Tauri 运行时直接调用已删除，改为通过注入 API
 *   - 文件存储兆底已删除，OpenWork Scheduler 为唯一数据源
 */

import { discoverAgents } from './agent-registry';

// ─── Scheduler API 注入 ─────────────────────────────────────────────

let _listJobs: (() => Promise<any[]>) | null = null;
let _deleteJob: ((name: string) => Promise<void>) | null = null;

/**
 * 注入 OpenWork Scheduler API。
 * 由 app-store 在初始化时调用，传入 OpenWork 提供的 scheduler 接口。
 */
export function setSchedulerApi(api: {
  listJobs: () => Promise<any[]>;
  deleteJob: (name: string) => Promise<void>;
} | null): void {
  _listJobs = api?.listJobs ?? null;
  _deleteJob = api?.deleteJob ?? null;
}

const normalizeSentence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
};

// ─── 类型定义 ─────────────────────────────────────────────────

/**
 * 星静定时任务（前端视图模型）
 */
export interface XingjingScheduledTask {
  id: string;
  name: string;
  cron: string;
  /** Agent ID（对应 agent-registry 中的 id） */
  agentId: string;
  /** Agent 显示名称 */
  agentName: string;
  /** 执行时发送给 Agent 的 prompt */
  prompt: string;
  description: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  /** 数据来源 */
  source: 'scheduler' | 'file';
}

/**
 * 创建任务所需参数
 */
export interface CreateTaskInput {
  name: string;
  cron: string;
  agentId: string;
  agentName: string;
  prompt: string;
  description: string;
}

// ─── 公开 API ─────────────────────────────────────────────────

/**
 * 列出所有定时任务。
 * 通过注入的 OpenWork Scheduler API 获取。
 */
export async function listScheduledTasks(_workDir?: string): Promise<XingjingScheduledTask[]> {
  if (!_listJobs) return [];
  try {
    const jobs = await _listJobs();
    return jobs.map((job: any) => ({
      id: job.slug ?? job.name ?? '',
      name: job.name ?? '',
      cron: job.schedule ?? '',
      agentId: job.run?.agent ?? '',
      agentName: job.run?.agent ?? job.name ?? '',
      prompt: job.run?.prompt ?? job.prompt ?? '',
      description: job.run?.title ?? job.name ?? '',
      enabled: true,
      lastRunAt: job.lastRunAt,
      source: 'scheduler' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * 创建定时任务。
 * 构建 scheduler prompt，由调用方通过 session 发送给 opencode-scheduler 插件。
 */
export function createScheduledTask(
  workDir: string,
  input: CreateTaskInput,
): { task: XingjingScheduledTask; schedulerPrompt: string } {
  const task: XingjingScheduledTask = {
    id: `cron-${Date.now()}`,
    name: input.name,
    cron: input.cron,
    agentId: input.agentId,
    agentName: input.agentName,
    prompt: input.prompt,
    description: input.description,
    enabled: true,
    source: 'scheduler',
  };

  const name = input.name.trim();
  const cron = input.cron.trim();
  const prompt = normalizeSentence(input.prompt);
  const workdir = (workDir ?? '').trim();
  const nameSegment = name ? ` named "${name}"` : '';
  const workdirSegment = workdir ? ` Run from ${workdir}.` : '';
  const schedulerPrompt = `Schedule a job${nameSegment} with cron "${cron}" to ${prompt}${workdirSegment}`.trim();

  return { task, schedulerPrompt };
}

/**
 * 删除定时任务。
 * 通过注入的 OpenWork Scheduler API 删除。
 */
export async function deleteScheduledTask(
  _workDir: string,
  _taskId: string,
  taskName?: string,
): Promise<void> {
  if (!_deleteJob || !taskName) return;
  try {
    await _deleteJob(taskName);
  } catch {
    // silent
  }
}

/**
 * 获取可用 Agent 列表（用于任务创建时的 Agent 选择器）
 */
export async function getAvailableAgentsForScheduler(
  workDir?: string,
): Promise<Array<{ id: string; name: string; emoji: string }>> {
  try {
    const agents = await discoverAgents('solo', workDir);
    return agents.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji }));
  } catch {
    return [];
  }
}
