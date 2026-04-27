/**
 * 设置相关类型定义
 *
 * 从 mock/settings.ts 提取的类型，供 Solo/Settings 等模块使用。
 * Team 模式仍从 mock/settings.ts 导入（向后兼容）。
 */

/** 大模型配置 */
export interface LLMConfig {
  id?: string;
  modelName: string;
  modelID?: string;    // OpenCode 使用的 model ID（如 gpt-4o）
  providerID?: string; // OpenCode 使用的 provider ID（如 openai）
  apiUrl: string;
  apiKey: string;
}

/** 模型选项（下拉列表） */
export interface ModelOption {
  label: string;
  value: string;        // 内部标识符 (等于 modelID)
  providerID: string;   // OpenCode provider ID
  modelID: string;      // OpenCode model ID
  defaultApiUrl: string;
  apiUrlEditable: boolean; // 是否允许用户修改 API 地址
}

/** 节点门控配置 */
export interface GateNode {
  id: string;
  name: string;
  description: string;
  requireHuman: boolean;
}

/** 流程编排 — 单阶段定义 */
export interface WorkflowStage {
  /** 阶段唯一标识 */
  id: string;
  /** 阶段显示名称 */
  name: string;
  /** 阶段描述 */
  description: string;
  /** 负责执行的 Agent ID（来自 .opencode/agents/） */
  agent: string;
  /** 阶段需要的 Skill 列表（来自 .opencode/skills/） */
  skills: string[];
  /** 门控策略：auto = 自动通过，await-approval = 等待人工审批 */
  gate: 'auto' | 'await-approval';
  /** 依赖的前置阶段 ID 列表 */
  dependsOn: string[];
  /** 是否可与同层其他阶段并行执行 */
  parallel?: boolean;
  /** 阶段产出记录（key → 路径模板） */
  output?: Record<string, string>;
  /** 是否启用（支持部分执行） */
  enabled: boolean;
}

/** 流程编排 — 完整配置 */
export interface WorkflowConfig {
  /** 应用名称 */
  app: string;
  /** 执行模式：supervised = 关键节点需人工审批，autonomous = 全自动 */
  mode: 'supervised' | 'autonomous';
  /** 单阶段最大重试次数 */
  maxRetries: number;
  /** 阶段列表 */
  stages: WorkflowStage[];
}

/** 内置工具定义 */
export interface BuiltinToolDef {
  name: string;       // OpenCode 工具名称
  label: string;      // 展示名称
  description: string; // 功能描述
  category: 'builtin'; // 固定分类
}
