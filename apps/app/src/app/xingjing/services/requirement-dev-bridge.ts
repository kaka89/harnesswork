/**
 * 需求→研发桥接服务
 *
 * 职责：
 * 1. 将 SoloRequirementOutput 状态推进到 'in-dev'
 * 2. 创建对应的 SoloTaskRecord(s)
 * 3. 维护双向引用（需求 ↔ 任务）
 * 4. 自动继承 Feature 关联
 */

import {
  type SoloRequirementOutput,
  type SoloTaskRecord,
  type SoloTaskType,
  saveRequirementOutput,
  saveSoloTask,
} from './file-store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskDraft {
  title: string;
  type: SoloTaskType;
  est: string;
  dod: string[];
}

export interface PushToDevOptions {
  workDir: string;
  requirement: SoloRequirementOutput;
  tasks: TaskDraft[];
  sprintId?: string;
  onProgress?: (msg: string) => void;
}

export interface CallAgentOptions {
  callAgent: (input: string, onStream?: (text: string) => void) => Promise<string>;
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * 将需求推送到研发侧
 * - 更新需求 status 为 'in-dev'
 * - 创建 SoloTaskRecord(s) 并继承 linkedFeatureId
 * - 更新需求的 linkedTaskIds
 */
export async function pushRequirementToDev(opts: PushToDevOptions): Promise<{
  taskIds: string[];
  success: boolean;
}> {
  const { workDir, requirement, tasks, sprintId, onProgress } = opts;
  const taskIds: string[] = [];

  onProgress?.('正在创建任务...');

  for (const draft of tasks) {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const taskRecord: SoloTaskRecord = {
      id: taskId,
      title: draft.title,
      type: draft.type,
      status: 'todo',
      est: draft.est,
      dod: draft.dod,
      createdAt: new Date().toISOString(),
      feature: requirement.linkedFeatureId,
      requirementId: requirement.id,
      linkedReqTitle: requirement.title,
      sprintId,
    };

    const saved = await saveSoloTask(workDir, taskRecord);
    if (saved) {
      taskIds.push(taskId);
      onProgress?.(`已创建任务: ${draft.title}`);
    }
  }

  // 更新需求状态和关联
  onProgress?.('正在更新需求状态...');
  requirement.status = 'in-dev';
  requirement.linkedTaskIds = [...(requirement.linkedTaskIds ?? []), ...taskIds];
  requirement.updatedAt = new Date().toISOString();
  if (sprintId) requirement.sprintId = sprintId;
  await saveRequirementOutput(workDir, requirement);

  onProgress?.('推送完成！');
  return { taskIds, success: true };
}

// ─── AI Task Decomposition ──────────────────────────────────────────────────

const DECOMPOSE_PROMPT = `你是一个研发任务拆解专家。请将以下产品需求拆解为具体的开发任务。

需求标题: {title}
需求内容:
{content}

请输出格式如下：
\`\`\`tasks
[
  {
    "title": "任务标题（动宾结构，如：实现用户登录 API）",
    "type": "dev",
    "est": "1天",
    "dod": [
      "单元测试覆盖率 ≥ 80%",
      "API 文档已更新",
      "Code Review 通过"
    ]
  }
]
\`\`\`
每个任务应独立可测试，DoD 条件应可量化。`;

/**
 * 使用 dev-agent 自动拆解需求为任务列表（草稿）
 */
export async function decomposeRequirementWithAgent(
  requirement: SoloRequirementOutput,
  callAgentFn: CallAgentOptions['callAgent'],
  onStream?: (text: string) => void,
): Promise<TaskDraft[]> {
  const prompt = DECOMPOSE_PROMPT
    .replace('{title}', requirement.title)
    .replace('{content}', requirement.content);

  const result = await callAgentFn(prompt, onStream);
  return parseTasksFromAgentOutput(result);
}

/**
 * 解析 Agent 输出中的任务列表 JSON
 * Agent 约定输出格式：
 * ```tasks
 * [ { "title": "...", "type": "dev", ... } ]
 * ```
 */
export function parseTasksFromAgentOutput(text: string): TaskDraft[] {
  // 尝试匹配 ```tasks ... ``` 块
  const tasksBlockMatch = text.match(/```tasks\s*\n([\s\S]*?)```/);
  if (tasksBlockMatch) {
    try {
      return JSON.parse(tasksBlockMatch[1]) as TaskDraft[];
    } catch {
      // fallback
    }
  }

  // 尝试匹配 ```json ... ``` 块
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]) as TaskDraft[];
    } catch {
      // fallback
    }
  }

  // 尝试直接解析整段 JSON 数组
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as TaskDraft[];
    } catch {
      // fallback
    }
  }

  return [];
}
