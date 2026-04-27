/**
 * Agent Workshop 类型定义 + UI 预设常量
 *
 * 从 mock/agentWorkshop.ts 迁入，重构 SkillDef 为分层架构：
 *   SkillFrontmatter（OpenWork 标准 + 星静扩展） → SkillDef（+ body + UI 元数据）
 *
 * 设计原则：
 * - SkillFrontmatter 仅包含会写入 SKILL.md frontmatter 的字段
 * - SkillDef extends SkillFrontmatter，追加 systemPrompt（body）和 UI-only 字段
 * - SkillArtifactConfig 作为星静扩展写入 frontmatter，OpenWork 忽略但不报错
 */

// ─── Artifact 配置（星静扩展，写入 frontmatter） ──────────────────────

export interface SkillArtifactConfig {
  /** 是否启用产出物能力 */
  enabled: boolean;
  /** 输出格式：auto 时根据内容自动检测 */
  format?: 'markdown' | 'html' | 'auto';
  /** 是否自动保存到磁盘（默认 true） */
  autoSave?: boolean;
  /** 自定义保存子路径（相对于产品目录） */
  savePath?: string;
}

// ─── OpenWork 标准 frontmatter 字段 + 星静扩展 ──────────────────────

export interface SkillFrontmatter {
  /** OpenWork 标准: 唯一标识符，与文件夹名一致 */
  name: string;
  /** OpenWork 标准: 功能描述 + 触发短语 */
  description: string;
  /** OpenWork 标准: 激活条件 */
  trigger?: string;
  /** OpenWork 标准: 文件匹配模式 */
  glob?: string;
  /** 星静扩展: 分类标签（OpenWork 忽略但不报错） */
  category?: string;
  /** 星静扩展: 可用模式（缺省则两种模式均可用） */
  mode?: 'solo' | 'team';
  /** 星静扩展: 产出物生成配置 */
  artifact?: SkillArtifactConfig;
}

// ─── 完整 Skill 定义（frontmatter + body + UI 元数据） ───────────────

export interface SkillDef extends SkillFrontmatter {
  /** Body: SKILL.md 的 Markdown 正文（系统提示词） */
  systemPrompt?: string;
  /** UI 元数据: 内部 ID（兼容旧数据，新代码默认用 name） */
  id: string;
  /** Override: 运行时 category 始终有值（空字符串代表未分类） */
  category: string;
  /** UI 元数据: Emoji 图标 */
  icon?: string;
  /** UI 元数据: 输入参数描述（不写入 frontmatter） */
  inputParams?: SkillInputParam[];
  /** UI 元数据: 输出类型描述（不写入 frontmatter） */
  outputType?: string;
}

// ─── 其他接口 ────────────────────────────────────────────────────────

export interface SkillInputParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ColorPreset {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface SkillExecution {
  skillName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  output?: string;
}

export interface TaskOrchestration {
  agentId: string;
  taskId: string;
  taskTitle?: string;
  status?: 'pending' | 'running' | 'done' | 'error';
  steps: SkillExecution[];
}

export interface AgentAssignment {
  agentId: string;
  taskId: string;
  status: 'assigned' | 'working' | 'done';
}

// ─── UI 预设常量（固定配置，非 mock） ────────────────────────────────

export const agentColorPresets: ColorPreset[] = [
  { label: '蓝', color: '#1264e5', bgColor: '#e6f0ff', borderColor: '#91c5ff' },
  { label: '紫', color: '#722ed1', bgColor: '#f9f0ff', borderColor: '#d3adf7' },
  { label: '青', color: '#08979c', bgColor: '#e6fffb', borderColor: '#87e8de' },
  { label: '橙', color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591' },
  { label: '绿', color: '#389e0d', bgColor: '#f6ffed', borderColor: '#b7eb8f' },
  { label: '红', color: '#cf1322', bgColor: '#fff2f0', borderColor: '#ffccc7' },
  { label: '金', color: '#d4b106', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  { label: '品红', color: '#c41d7f', bgColor: '#fff0f6', borderColor: '#ffadd2' },
  { label: '靛', color: '#1d39c4', bgColor: '#f0f5ff', borderColor: '#adc6ff' },
  { label: '火山', color: '#d4380d', bgColor: '#fff2e8', borderColor: '#ffbb96' },
];

export const emojiPresets: string[] = [
  '📋', '🏗️', '💻', '🧪', '🚀', '📊',
  '🧠', '⚙️', '📈', '🔧', '🎯', '🔍',
  '🛡️', '📦', '🤖', '💡',
];
