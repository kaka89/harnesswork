// ==================== 大模型配置 ====================

export interface LLMConfig {
  id: string;
  modelName: string;
  apiUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export const defaultLLMConfig: LLMConfig = {
  id: 'llm-1',
  modelName: 'GPT-4o',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-****************************',
  temperature: 0.7,
  maxTokens: 4096,
};

export const modelOptions = [
  { label: 'GPT-4o', value: 'GPT-4o' },
  { label: 'Claude-4 Sonnet', value: 'Claude-4 Sonnet' },
  { label: 'DeepSeek-V3', value: 'DeepSeek-V3' },
  { label: 'Qwen-3', value: 'Qwen-3' },
  { label: '自定义', value: 'custom' },
];

// ==================== Git 仓库配置 ====================

export interface GitRepoConfig {
  id: string;
  productName: string;
  repoUrl: string;
  defaultBranch: string;
  accessToken: string;
  tokenConfigured: boolean;
}

export const defaultGitRepos: GitRepoConfig[] = [
  {
    id: 'git-1',
    productName: '苍穹财务',
    repoUrl: 'https://github.com/kingdee/cosmic-finance.git',
    defaultBranch: 'main',
    accessToken: 'ghp_****************************',
    tokenConfigured: true,
  },
  {
    id: 'git-2',
    productName: '苍穹供应链',
    repoUrl: 'https://github.com/kingdee/cosmic-scm.git',
    defaultBranch: 'main',
    accessToken: '',
    tokenConfigured: false,
  },
  {
    id: 'git-3',
    productName: '苍穹人力云',
    repoUrl: 'https://github.com/kingdee/cosmic-hr.git',
    defaultBranch: 'develop',
    accessToken: 'ghp_****************************',
    tokenConfigured: true,
  },
  {
    id: 'git-4',
    productName: '苍穹制造云',
    repoUrl: 'https://github.com/kingdee/cosmic-manufacturing.git',
    defaultBranch: 'main',
    accessToken: '',
    tokenConfigured: false,
  },
];

// ==================== 定时任务配置 ====================

export interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  agentName: string;
  description: string;
  enabled: boolean;
  lastRun: string;
}

export const defaultScheduledTasks: ScheduledTask[] = [
  {
    id: 'cron-1',
    name: '每日编码任务执行',
    cron: '0 2 * * *',
    agentName: '编码 Agent',
    description: '每日凌晨 2:00 运行编码 Agent，自动完成需求下发的开发任务',
    enabled: true,
    lastRun: '2026-04-10 02:00:15',
  },
  {
    id: 'cron-2',
    name: '每周迭代报告生成',
    cron: '0 9 * * 1',
    agentName: '效能分析 Agent',
    description: '每周一 9:00 自动生成迭代进度报告与效能分析',
    enabled: true,
    lastRun: '2026-04-07 09:00:08',
  },
  {
    id: 'cron-3',
    name: '每日质量扫描',
    cron: '0 18 * * *',
    agentName: '质量守护 Agent',
    description: '每天 18:00 运行质量扫描，检查代码规范、安全漏洞与测试覆盖率',
    enabled: false,
    lastRun: '2026-04-09 18:00:22',
  },
];

// ==================== 节点门控配置 ====================

export interface GateNode {
  id: string;
  name: string;
  description: string;
  requireHuman: boolean;
}

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
