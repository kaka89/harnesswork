/**
 * 定时任务客户端 — 桥接星静 ScheduledTask 与 OpenWork Scheduler
 *
 * 数据来源优先级：
 * 1. Tauri 运行时 → 调用 schedulerListJobs / schedulerDeleteJob
 * 2. OpenCode session prompt → 通过对话创建定时任务（opencode-scheduler 插件）
 * 3. 文件存储兜底 → .xingjing/settings.yaml 中的 scheduledTasks
 *
 * 新建任务通过 OpenCode session prompt 发送给 opencode-scheduler 插件，
 * 格式遵循 automations.ts 的 buildCreateAutomationPrompt 约定。
 */

import { isTauriRuntime } from '../../utils';
import {
  loadProjectSettings,
  saveProjectSettings,
} from './file-store';
import { discoverAgents } from './agent-registry';

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

// ─── OpenWork Scheduler 类型（从 tauri.ts 对齐）────────────────

interface SchedulerJob {
  slug: string;
  name: string;
  schedule: string;
  prompt?: string;
  run?: {
    prompt?: string;
    agent?: string;
    model?: string;
    title?: string;
  };
  workdir?: string;
  createdAt: string;
  updatedAt?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
}

// ─── Tauri API 动态导入（避免非 Tauri 环境报错）───────────────

async function getTauriScheduler(): Promise<{
  list: (scopeRoot?: string) => Promise<SchedulerJob[]>;
  del: (name: string, scopeRoot?: string) => Promise<SchedulerJob>;
} | null> {
  if (!isTauriRuntime()) return null;
  try {
    const tauri = await import('../../lib/tauri');
    return {
      list: tauri.schedulerListJobs as unknown as (scopeRoot?: string) => Promise<SchedulerJob[]>,
      del: tauri.schedulerDeleteJob as unknown as (name: string, scopeRoot?: string) => Promise<SchedulerJob>,
    };
  } catch {
    return null;
  }
}

// ─── 转换函数 ─────────────────────────────────────────────────

function jobToTask(job: SchedulerJob): XingjingScheduledTask {
  return {
    id: job.slug,
    name: job.name,
    cron: job.schedule,
    agentId: job.run?.agent ?? '',
    agentName: job.run?.agent ?? job.name,
    prompt: job.run?.prompt ?? job.prompt ?? '',
    description: job.run?.title ?? '',
    enabled: true, // OpenWork scheduler 没有 enabled 概念，已安装即启用
    lastRunAt: job.lastRunAt ?? undefined,
    source: 'scheduler',
  };
}

function fileTaskToXingjingTask(task: {
  id: string;
  name: string;
  cron: string;
  agentName: string;
  description: string;
  enabled: boolean;
  lastRun: string;
}): XingjingScheduledTask {
  return {
    id: task.id,
    name: task.name,
    cron: task.cron,
    agentId: '',
    agentName: task.agentName,
    prompt: task.description,
    description: task.description,
    enabled: task.enabled,
    lastRunAt: task.lastRun !== '-' ? task.lastRun : undefined,
    source: 'file',
  };
}

// ─── 公开 API ─────────────────────────────────────────────────

/**
 * 列出所有定时任务。
 * 优先从 Tauri scheduler 获取，降级到文件存储。
 */
export async function listScheduledTasks(workDir: string): Promise<XingjingScheduledTask[]> {
  // 1. 尝试 Tauri scheduler
  const tauriApi = await getTauriScheduler();
  if (tauriApi) {
    try {
      const jobs = await tauriApi.list(workDir || undefined);
      if (jobs.length > 0) {
        return jobs.map(jobToTask);
      }
    } catch {
      // 降级到文件存储
    }
  }

  // 2. 降级到文件存储
  try {
    const settings = await loadProjectSettings(workDir);
    if (settings.scheduledTasks && settings.scheduledTasks.length > 0) {
      return settings.scheduledTasks.map(fileTaskToXingjingTask);
    }
  } catch {
    // silent
  }

  return [];
}

/**
 * 创建定时任务。
 *
 * 策略：
 * - 始终保存到文件存储（确保 xingjing UI 可见）
 * - 若 Tauri 可用，同时构建 opencode-scheduler prompt（通过返回的 prompt 让调用方发送）
 */
export async function createScheduledTask(
  workDir: string,
  input: CreateTaskInput,
): Promise<{ task: XingjingScheduledTask; schedulerPrompt?: string }> {
  const task: XingjingScheduledTask = {
    id: `cron-${Date.now()}`,
    name: input.name,
    cron: input.cron,
    agentId: input.agentId,
    agentName: input.agentName,
    prompt: input.prompt,
    description: input.description,
    enabled: true,
    source: 'file',
  };

  // 持久化到文件
  try {
    const settings = await loadProjectSettings(workDir);
    const tasks = settings.scheduledTasks ?? [];
    tasks.push({
      id: task.id,
      name: task.name,
      cron: task.cron,
      agentName: task.agentName,
      description: task.description,
      enabled: true,
      lastRun: '-',
    });
    await saveProjectSettings(workDir, { ...settings, scheduledTasks: tasks });
  } catch {
    console.warn('[scheduler-client] 保存到文件存储失败');
  }

  // 构建 opencode-scheduler prompt（让调用方通过 session 发送）
  const promptParts = [`Schedule a job named "${input.name}" with cron "${input.cron}"`];
  if (input.prompt) promptParts.push(`to ${input.prompt}`);
  if (input.agentId) promptParts.push(`Run with agent ${input.agentId}.`);
  if (workDir) promptParts.push(`Run from ${workDir}.`);
  const schedulerPrompt = isTauriRuntime() ? promptParts.join(' ') : undefined;

  return { task, schedulerPrompt };
}

/**
 * 切换任务启停（仅文件存储模式支持）
 */
export async function toggleScheduledTask(
  workDir: string,
  taskId: string,
  enabled: boolean,
): Promise<void> {
  try {
    const settings = await loadProjectSettings(workDir);
    if (settings.scheduledTasks) {
      const updated = settings.scheduledTasks.map((t) =>
        t.id === taskId ? { ...t, enabled } : t,
      );
      await saveProjectSettings(workDir, { ...settings, scheduledTasks: updated });
    }
  } catch {
    console.warn('[scheduler-client] 切换任务状态失败');
  }
}

/**
 * 删除定时任务。
 * 优先通过 Tauri scheduler 删除（同时清理系统级调度），再从文件存储移除。
 */
export async function deleteScheduledTask(
  workDir: string,
  taskId: string,
  taskName?: string,
): Promise<void> {
  // 1. 尝试 Tauri scheduler 删除
  if (taskName) {
    const tauriApi = await getTauriScheduler();
    if (tauriApi) {
      try {
        await tauriApi.del(taskName, workDir || undefined);
      } catch {
        // scheduler 中可能不存在，继续清理文件
      }
    }
  }

  // 2. 从文件存储移除
  try {
    const settings = await loadProjectSettings(workDir);
    if (settings.scheduledTasks) {
      const filtered = settings.scheduledTasks.filter((t) => t.id !== taskId);
      await saveProjectSettings(workDir, { ...settings, scheduledTasks: filtered });
    }
  } catch {
    console.warn('[scheduler-client] 从文件存储删除失败');
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
