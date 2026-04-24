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

/** 内置工具定义 */
export interface BuiltinToolDef {
  name: string;       // OpenCode 工具名称
  label: string;      // 展示名称
  description: string; // 功能描述
  category: 'builtin'; // 固定分类
}
