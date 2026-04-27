/**
 * 设置默认值与常量
 *
 * 从 mock/settings.ts 提取的默认值，供 Solo/Settings 等模块使用。
 * Team 模式仍从 mock/settings.ts 导入（向后兼容）。
 */

import type { LLMConfig, ModelOption, GateNode, BuiltinToolDef } from '../types/settings';

// ── 大模型配置默认值 ──────────────────────────────────────────────

export const defaultLLMConfig: LLMConfig = {
  id: 'llm-1',
  modelName: 'DeepSeek-V3',
  modelID: 'deepseek-chat',
  providerID: 'deepseek',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-b31d2dbf7c3e4aa193e76ed9d60b217e',
};

export const modelOptions: ModelOption[] = [
  {
    label: 'GPT-4o',
    value: 'gpt-4o',
    providerID: 'openai',
    modelID: 'gpt-4o',
    defaultApiUrl: 'https://api.openai.com/v1',
    apiUrlEditable: false,
  },
  {
    label: 'GPT-4o mini',
    value: 'gpt-4o-mini',
    providerID: 'openai',
    modelID: 'gpt-4o-mini',
    defaultApiUrl: 'https://api.openai.com/v1',
    apiUrlEditable: false,
  },
  {
    label: 'Claude Sonnet 4.5',
    value: 'claude-sonnet-4-5',
    providerID: 'anthropic',
    modelID: 'claude-sonnet-4-5',
    defaultApiUrl: 'https://api.anthropic.com',
    apiUrlEditable: false,
  },
  {
    label: 'Claude Haiku 3.5',
    value: 'claude-haiku-3-5',
    providerID: 'anthropic',
    modelID: 'claude-haiku-3-5',
    defaultApiUrl: 'https://api.anthropic.com',
    apiUrlEditable: false,
  },
  {
    label: 'DeepSeek-V3',
    value: 'deepseek-chat',
    providerID: 'deepseek',
    modelID: 'deepseek-chat',
    defaultApiUrl: 'https://api.deepseek.com/v1',
    apiUrlEditable: false,
  },
  {
    label: 'Qwen-Max',
    value: 'qwen-max',
    providerID: 'qwen',
    modelID: 'qwen-max',
    defaultApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiUrlEditable: false,
  },
  {
    label: 'OpenRouter（自选）',
    value: 'openrouter',
    providerID: 'openrouter',
    modelID: 'openai/gpt-4o',
    defaultApiUrl: 'https://openrouter.ai/api/v1',
    apiUrlEditable: true,
  },
  {
    label: '自定义 (OpenAI 兼容)',
    value: 'custom',
    providerID: 'custom',
    modelID: '',
    defaultApiUrl: '',
    apiUrlEditable: true,
  },
];

// ── MCP 工具定义 ─────────────────────────────────────────────────

export const builtinTools: BuiltinToolDef[] = [
  { name: 'bash',  label: 'Shell 命令', description: '执行终端命令（如 git、npm、ls 等）', category: 'builtin' },
  { name: 'read',  label: '读取文件',   description: '读取项目中的文件内容',              category: 'builtin' },
  { name: 'write', label: '写入文件',   description: '创建或覆盖文件',                  category: 'builtin' },
  { name: 'edit',  label: '编辑文件',   description: '对已有文件进行局部修改',            category: 'builtin' },
];

/** 默认开启的工具和 MCP 服务器名称列表（首次启动时写入 allowedTools） */
export const DEFAULT_ALLOWED_TOOLS: string[] = [
  // 内置工具
  'bash', 'read', 'write', 'edit', 'webfetch',
  // 预配置 MCP 服务器
  'control-chrome',
  'github',
  'gitlab',
];

// ── 节点门控配置 ─────────────────────────────────────────────────

export const defaultGateNodes: GateNode[] = [
  {
    id: 'gate-1',
    name: '需求评审',
    description: 'PRD 文档完成后进入评审环节，确认需求合理性与完整性',
    requireHuman: true,
  },
  {
    id: 'gate-2',
    name: '架构设计',
    description: 'SDD 设计文档生成后，由架构师审核技术方案',
    requireHuman: true,
  },
  {
    id: 'gate-3',
    name: '代码生成',
    description: 'Agent 根据 SDD 自动生成代码，可选人工 Review',
    requireHuman: false,
  },
  {
    id: 'gate-4',
    name: 'Code Review',
    description: '代码提交后的同行评审，检查质量与规范',
    requireHuman: true,
  },
  {
    id: 'gate-5',
    name: '测试执行',
    description: '自动化测试运行与结果校验',
    requireHuman: false,
  },
  {
    id: 'gate-6',
    name: '部署审批',
    description: '部署到预发/生产环境前的审批确认',
    requireHuman: true,
  },
  {
    id: 'gate-7',
    name: '发布上线',
    description: '正式发布到生产环境的最终确认',
    requireHuman: true,
  },
  {
    id: 'gate-8',
    name: '效能报告',
    description: '迭代结束后自动生成效能度量报告',
    requireHuman: false,
  },
];
