import { Component, createSignal, For, Show, createMemo, onMount } from 'solid-js';
import {
  Users, Plus, Trash2, CheckCircle, Clock, PlayCircle, Bot, Pencil,
  AlertCircle, Loader2, Code, Webhook, LayoutGrid, Zap
} from 'lucide-solid';
import { teamAgents, type AgentDef } from '../../mock/autopilot';
import {
  teamSkillPool, type SkillDef, agentColorPresets, emojiPresets,
  initialEnterpriseAssignments, teamOrchestrations
} from '../../mock/agentWorkshop';
import { taskList } from '../../mock/tasks';
import { themeColors, chartColors } from '../../utils/colors';
import { callAgent, discoverAllSkills, type XingjingSkillItem, type XingjingAgentItem, type SkillPlatform } from '../../services/opencode-client';
import { useAppStore } from '../../stores/app-store';
import { loadAgentWorkshopData, saveAgentWorkshopData } from '../../services/file-store';

// 平台徽章配色
const PLATFORM_COLORS: Record<SkillPlatform, string> = {
  openwork: '#7c3aed',
  opencode: '#2563eb',
  agents: '#16a34a',
  claude: '#ea580c',
  kiro: '#6b7280',
};

const PLATFORM_LABELS: Record<SkillPlatform, string> = {
  openwork: 'OpenWork',
  opencode: 'OpenCode',
  agents: 'Agents',
  claude: 'Claude',
  kiro: 'Kiro',
};

// 平台徽章组件
const PlatformBadge: Component<{ platform: SkillPlatform }> = (props) => (
  <span
    class="text-xs px-1.5 py-0.5 rounded text-white font-mono"
    style={{ background: PLATFORM_COLORS[props.platform] }}
  >
    {PLATFORM_LABELS[props.platform]}
  </span>
);

// 合并去重：openwork 优先
function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// ─── Types ──────────────────────────────────────────────────────────

interface AgentAssignment {
  agentId: string;
  taskId: string;
  status: 'assigned' | 'working' | 'done';
}

interface TaskOrchestration {
  agentId: string;
  taskId: string;
  taskTitle?: string;
  status?: 'pending' | 'running' | 'done';
  steps: Array<{
    skillName: string;
    status: 'pending' | 'running' | 'done';
    output?: string;
  }>;
}

// ─── Constants ───────────────────────────────────────────────────────

const categoryColor: Record<string, string> = {
  '产品': themeColors.primary,
  '架构': themeColors.purple,
  '开发': themeColors.cyan,
  '质量': themeColors.warning,
  '运维': themeColors.success,
  '管理': themeColors.error,
};

const taskStatusTag: Record<string, { label: string; color: string }> = {
  'todo': { label: '待办', color: themeColors.border },
  'in-dev': { label: '开发中', color: themeColors.warning },
  'in-review': { label: '评审中', color: themeColors.error },
  'done': { label: '已完成', color: themeColors.success },
};

const skillStatusConfig: Record<string, { color: string; text: string }> = {
  done: { color: themeColors.success, text: '已完成' },
  running: { color: themeColors.primary, text: '执行中' },
  pending: { color: themeColors.border, text: '待执行' },
};

// ─── Agent Card Component ───────────────────────────────────────────

const AgentCard: Component<{
  agent: AgentDef;
  skills: string[];
  assignedCount: number;
  onOpen: (agent: AgentDef) => void;
}> = (props) => {
  return (
    <div
      class="rounded-lg border-2 p-4 hover:shadow-md transition-shadow cursor-pointer relative"
      style={{ 'border-color': props.agent.borderColor, background: themeColors.surface }}
      onClick={() => props.onOpen(props.agent)}
    >
      {props.assignedCount > 0 && (
        <div
          class="absolute top-0 right-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center -translate-y-1/2 translate-x-1/2 shadow-md"
          style={{ background: props.agent.color }}
        >
          {props.assignedCount}
        </div>
      )}

      <div class="flex items-start gap-3 mb-3">
        <div
          class="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0"
          style={{ background: props.agent.color }}
        >
          {props.agent.emoji}
        </div>
        <div class="flex-1">
          <div class="font-semibold text-base mb-1" style={{ color: themeColors.text }}>{props.agent.name}</div>
          <div class="text-xs" style={{ color: themeColors.textMuted }}>{props.agent.role}</div>
        </div>
      </div>

      <div class="text-xs mb-2" style={{ color: themeColors.textMuted }}>{props.agent.description}</div>

      <div class="pt-2" style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
        <div class="text-xs mb-2" style={{ color: themeColors.textMuted }}>已配置技能 ({props.skills.length})</div>
        <div class="flex flex-wrap gap-1">
          <For each={props.skills.slice(0, 3)}>
            {(skill) => {
              const skillDef = teamSkillPool.find((s) => s.name === skill);
              const cat = skillDef?.category || '';
              return (
                <span
                  class="text-xs px-2 py-0.5 rounded text-white"
                  style={{ background: categoryColor[cat] || themeColors.border }}
                >
                  {skill}
                </span>
              );
            }}
          </For>
          {props.skills.length > 3 && (
            <span class="text-xs px-2 py-0.5 rounded" style={{ color: themeColors.textMuted, background: themeColors.hover }}>
              +{props.skills.length - 3}
            </span>
          )}
        </div>
      </div>

      {props.assignedCount > 0 && (
        <div class="mt-2 text-xs" style={{ color: props.agent.color }}>
          <Zap class="w-3 h-3 inline mr-1" />
          已绑定 {props.assignedCount} 个任务
        </div>
      )}
    </div>
  );
};

// ─── Skill Card Component ────────────────────────────────────────────

const SkillCard: Component<{
  skill: SkillDef;
  onEdit: (skill: SkillDef) => void;
  onAdd: (skillName: string) => void;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="rounded-lg p-3 transition-colors" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
      <div class="flex items-start gap-2 mb-2">
        <div
          class="w-1 h-4 rounded flex-shrink-0"
          style={{ background: categoryColor[props.skill.category] || themeColors.border }}
        />
        <div class="flex-1">
          <div class="font-semibold text-sm" style={{ color: themeColors.text }}>{props.skill.name}</div>
          <span
            class="text-xs px-1.5 py-0.5 rounded text-white inline-block mt-1"
            style={{ background: categoryColor[props.skill.category] || themeColors.border }}
          >
            {props.skill.category}
          </span>
        </div>
      </div>

      <div class="text-xs mb-2" style={{ color: themeColors.textMuted }}>{props.skill.description}</div>

      <Show when={props.skill.trigger}>
        <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>
          <span class="font-medium">触发：</span>
          {props.skill.trigger}
        </div>
      </Show>

      <button
        class="text-xs mb-2"
        style={{ color: chartColors.primary }}
        onClick={() => setExpanded(!expanded())}
      >
        {expanded() ? '收起详情 ▲' : '展开详情 ▼'}
      </button>

      <Show when={expanded()}>
        <div class="mt-2 pt-2 space-y-2" style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
          <Show when={props.skill.systemPrompt}>
            <div>
              <div class="text-xs font-medium mb-1" style={{ color: themeColors.textSecondary }}>System Prompt:</div>
              <div class="text-xs p-2 rounded whitespace-pre-wrap" style={{ color: themeColors.textMuted, background: themeColors.bgSubtle }}>
                {props.skill.systemPrompt}
              </div>
            </div>
          </Show>

          <Show when={props.skill.inputParams && props.skill.inputParams.length > 0}>
            <div>
              <div class="text-xs font-medium mb-1" style={{ color: themeColors.textSecondary }}>输入参数:</div>
              <div class="space-y-1">
                <For each={props.skill.inputParams}>
                  {(param) => (
                    <div class="text-xs" style={{ color: themeColors.textMuted }}>
                      • {param.name} ({param.type}){param.required && ' *'}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={props.skill.outputType}>
            <div class="text-xs" style={{ color: themeColors.textMuted }}>
              <span class="font-medium">输出类型：</span>
              {props.skill.outputType}
            </div>
          </Show>
        </div>
      </Show>

      <div class="flex gap-2 mt-2 pt-2" style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
        <button
          class="text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors"
          style={{ background: themeColors.primaryBg, color: chartColors.primary }}
          onClick={() => props.onEdit(props.skill)}
        >
          <Pencil size={12} />
          编辑
        </button>
        <button
          class="text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors"
          style={{ background: themeColors.successBg, color: chartColors.success }}
          onClick={() => props.onAdd(props.skill.name)}
        >
          <Plus size={12} />
          添加
        </button>
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────

const AgentWorkshop: Component = () => {
  const { productStore, actions } = useAppStore();
  const [agents, setAgents] = createSignal<AgentDef[]>([...teamAgents]);
  const [allDiscoveredSkills, setAllDiscoveredSkills] = createSignal<XingjingSkillItem[]>([]);
  const [allDiscoveredAgents, setAllDiscoveredAgents] = createSignal<XingjingAgentItem[]>([]);
  const initAgentSkills = (): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    teamAgents.forEach((a) => { map[a.id] = [...a.skills]; });
    return map;
  };
  const [agentSkills, setAgentSkills] = createSignal<Record<string, string[]>>(initAgentSkills());
  const [assignments, setAssignments] = createSignal<AgentAssignment[]>([
    ...initialEnterpriseAssignments,
  ]);
  const [orchestrations, setOrchestrations] = createSignal<TaskOrchestration[]>([
    ...teamOrchestrations,
  ]);

  // ─── 持久化助手 ───
  const getWorkDir = () => productStore.activeProduct()?.workDir ?? '';

  // 解析简单 frontmatter
  const parseOwFrontmatter = (content: string): Record<string, unknown> => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const result: Record<string, unknown> = {};
    if (!match) return result;
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      if (raw) result[key] = raw.replace(/^["']|["']$/g, '');
    }
    const skillsMatch = content.match(/^skills:\s*\n((?:\s*-\s*.+\n?)*)/m);
    if (skillsMatch) {
      result['skills'] = skillsMatch[1].split('\n')
        .map((l: string) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    }
    return result;
  };

  // 生成 Agent Markdown
  const buildAgentMarkdown = (agent: AgentDef, skills: string[]): string => {
    const skillLines = skills.map(s => `  - ${s}`).join('\n');
    return [
      '---',
      `xingjing-type: agent`,
      `id: ${agent.id}`,
      `name: ${agent.name}`,
      `role: ${agent.role}`,
      ...(skills.length > 0 ? ['skills:', ...skills.map(s => `  - ${s}`)] : []),
      '---',
      '',
      `# ${agent.name}`,
      '',
      agent.description,
    ].join('\n');
  };

  const persistData = () => {
    const workDir = getWorkDir();
    if (!workDir) return;
    saveAgentWorkshopData(workDir, {
      agents: agents() as unknown as Array<Record<string, unknown>>,
      agentSkills: agentSkills(),
      assignments: assignments() as unknown as Array<Record<string, unknown>>,
    }, 'team').catch(() => {});
  };

  onMount(async () => {
    const workDir = getWorkDir();

    // 路径1: 从文件系统加载本地持久化数据
    if (workDir) {
      const data = await loadAgentWorkshopData(workDir, 'team');
      if (data.agents && data.agents.length > 0) setAgents(data.agents as unknown as AgentDef[]);
      if (data.agentSkills && Object.keys(data.agentSkills).length > 0) setAgentSkills(data.agentSkills);
      if (data.assignments && data.assignments.length > 0) setAssignments(data.assignments as unknown as AgentAssignment[]);
    }

    // 路径2: 从 OpenWork 加载星静自建的 agent/skill（.qoder/skills/）
    const owItems = await actions.listOpenworkSkills();
    if (owItems.length > 0) {
      const owSkillItems: XingjingSkillItem[] = owItems
        .filter(s => s.name.startsWith('skill-'))
        .map(s => ({
          id: `openwork:${s.name}`,
          name: s.name.replace('skill-', ''),
          description: s.description,
          platform: 'openwork' as SkillPlatform,
          path: s.path ?? '',
          editable: true,
        }));

      const owAgentItems: XingjingAgentItem[] = await Promise.all(
        owItems.filter(s => s.name.startsWith('agent-')).map(async (item) => {
          const detail = await actions.getOpenworkSkill(item.name);
          const meta = parseOwFrontmatter(detail?.content ?? '');
          return {
            id: `openwork:${item.name}`,
            name: (meta['name'] as string) ?? item.name,
            description: item.description,
            skills: (meta['skills'] as string[]) ?? [],
            platform: 'openwork' as SkillPlatform,
            editable: true,
          };
        })
      );

      setAllDiscoveredSkills(prev => deduplicateById([...owSkillItems, ...prev]));
      setAllDiscoveredAgents(prev => deduplicateById([...owAgentItems, ...prev]));
    }

    // 路径3: 多平台目录扫描（.opencode/、.agents/、.claude/、.kiro/）
    if (workDir) {
      const { skills: fsSkills, agents: fsAgents } = await discoverAllSkills(workDir);
      setAllDiscoveredSkills(prev => deduplicateById([...prev, ...fsSkills]));
      setAllDiscoveredAgents(prev => deduplicateById([...prev, ...fsAgents]));
    }
  });

  // Drawer & Modal State
  const [selectedAgent, setSelectedAgent] = createSignal<AgentDef | null>(null);
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<'skills' | 'orchestration'>('skills');
  const [pendingTasks, setPendingTasks] = createSignal<string[]>([]);

  // Agent Create/Edit Modal
  const [agentModalOpen, setAgentModalOpen] = createSignal(false);
  const [editingAgent, setEditingAgent] = createSignal<AgentDef | null>(null);
  const [modalName, setModalName] = createSignal('');
  const [modalRole, setModalRole] = createSignal('');
  const [modalDescription, setModalDescription] = createSignal('');
  const [selectedEmoji, setSelectedEmoji] = createSignal('🤖');
  const [selectedColor, setSelectedColor] = createSignal(agentColorPresets[0]);

  // Skill Edit Modal
  const [skillModalOpen, setSkillModalOpen] = createSignal(false);
  const [editingSkill, setEditingSkill] = createSignal<SkillDef | null>(null);

  // ─── Computed ───

  const getAssignedCount = (agentId: string) =>
    assignments().filter((a) => a.agentId === agentId).length;

  const getAvailableSkills = (agentId: string) => {
    const current = agentSkills()[agentId] || [];
    return teamSkillPool.filter((s) => !current.includes(s.name));
  };

  // 全部可用的外部 Skill（多平台发现的）
  const getExternalSkills = (agentId: string) => {
    const current = agentSkills()[agentId] || [];
    return allDiscoveredSkills().filter(s => !current.includes(s.id));
  };

  const getSkillStatus = (agentId: string, skillName: string): 'done' | 'running' | 'pending' | null => {
    const agentOrchs = orchestrations().filter((o) => o.agentId === agentId);
    let latestStatus: 'done' | 'running' | 'pending' | null = null;
    for (const orch of agentOrchs) {
      for (const step of orch.steps) {
        if (step.skillName === skillName) {
          if (step.status === 'running') return 'running';
          if (step.status === 'done') latestStatus = 'done';
          else if (!latestStatus) latestStatus = step.status;
        }
      }
    }
    return latestStatus;
  };

  // ─── Actions ────

  const addSkill = (agentId: string, skillName: string) => {
    const current = agentSkills()[agentId] || [];
    if (current.includes(skillName)) {
      alert(`${skillName} 已在该 AI搭档中`);
      return;
    }
    setAgentSkills((prev) => ({
      ...prev,
      [agentId]: [...current, skillName],
    }));
  };

  const removeSkill = (agentId: string, skillName: string) => {
    setAgentSkills((prev) => ({
      ...prev,
      [agentId]: (prev[agentId] || []).filter((s) => s !== skillName),
    }));
  };

  const openDrawer = (agent: AgentDef) => {
    setSelectedAgent(agent);
    const assigned = assignments()
      .filter((a) => a.agentId === agent.id)
      .map((a) => a.taskId);
    setPendingTasks(assigned);
    setActiveTab('skills');
    setDrawerOpen(true);
  };

  const confirmAssignment = () => {
    const agent = selectedAgent();
    if (!agent) return;
    const agentId = agent.id;
    const existing = assignments().filter((a) => a.agentId !== agentId);
    const newAssignments = pendingTasks().map((taskId) => {
      const prev = assignments().find((a) => a.agentId === agentId && a.taskId === taskId);
      return {
        agentId,
        taskId,
        status: (prev?.status || 'assigned') as 'assigned' | 'working' | 'done',
      };
    });
    setAssignments([...existing, ...newAssignments]);
    alert(`已为 ${agent.name} 指派 ${pendingTasks().length} 个任务`);
    persistData();
  };

  // ─── 技能真实执行 ───
  const [executingTaskId, setExecutingTaskId] = createSignal<string | null>(null);

  const executeSkills = async (agentId: string, taskId: string) => {
    const skills = agentSkills()[agentId] || [];
    if (skills.length === 0) {
      alert('该 AI搭档尚未配置技能，请先添加技能');
      return;
    }
    const task = taskList.find(t => t.id === taskId);
    const taskTitle = task?.title || taskId;
    setExecutingTaskId(taskId);

    // 创建所有步骤为 pending 的编排
    const initialSteps = skills.map(skillName => ({
      skillName, status: 'pending' as const, output: undefined as string | undefined,
    }));
    setOrchestrations(prev => {
      const filtered = prev.filter(o => !(o.agentId === agentId && o.taskId === taskId));
      return [...filtered, { agentId, taskId, taskTitle, status: 'running' as const, steps: initialSteps }];
    });
    setAssignments(prev => prev.map(a =>
      a.agentId === agentId && a.taskId === taskId ? { ...a, status: 'working' as const } : a
    ));

    // 逐个执行技能
    for (let i = 0; i < skills.length; i++) {
      const skillName = skills[i];
      const skillDef = teamSkillPool.find(s => s.name === skillName);

      // 标记当前步骤为 running
      setOrchestrations(prev => prev.map(o =>
        o.agentId === agentId && o.taskId === taskId
          ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, status: 'running' as const } : s) }
          : o
      ));

      const systemPrompt = skillDef?.systemPrompt || `你是一个专业的${skillName}执行助手。`;
      const prevOutput = i > 0 ? initialSteps[i - 1].output : '';
      const userPrompt = `请执行「${skillName}」技能。\n任务：${taskTitle}${prevOutput ? `\n上一步输出：${prevOutput}` : ''}\n请简洁地输出执行结果（100字以内）。`;

      try {
        const output: string = await new Promise((resolve, reject) => {
          callAgent({
            systemPrompt, userPrompt,
            onText: (text) => {
              setOrchestrations(prev => prev.map(o =>
                o.agentId === agentId && o.taskId === taskId
                  ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, output: text } : s) }
                  : o
              ));
            },
            onDone: (fullText) => resolve(fullText),
            onError: (err) => reject(new Error(err)),
          });
        });
        initialSteps[i].output = output;
        setOrchestrations(prev => prev.map(o =>
          o.agentId === agentId && o.taskId === taskId
            ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, status: 'done' as const, output } : s) }
            : o
        ));
      } catch {
        // 降级：生成模拟输出
        const mockOutput = `⚠️ [模拟] ${skillName} 已完成：已分析"${taskTitle}"并生成结果`;
        initialSteps[i].output = mockOutput;
        setOrchestrations(prev => prev.map(o =>
          o.agentId === agentId && o.taskId === taskId
            ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, status: 'done' as const, output: mockOutput } : s) }
            : o
        ));
      }
    }

    // 标记编排整体完成
    setOrchestrations(prev => prev.map(o =>
      o.agentId === agentId && o.taskId === taskId ? { ...o, status: 'done' } : o
    ));
    setAssignments(prev => prev.map(a =>
      a.agentId === agentId && a.taskId === taskId ? { ...a, status: 'done' as const } : a
    ));
    setExecutingTaskId(null);
  };

  const openCreateAgentModal = () => {
    setEditingAgent(null);
    setModalName('');
    setModalRole('');
    setModalDescription('');
    setSelectedEmoji('🤖');
    setSelectedColor(agentColorPresets[0]);
    setAgentModalOpen(true);
  };

  const openEditAgentModal = (agent: AgentDef) => {
    setEditingAgent(agent);
    setModalName(agent.name);
    setModalRole(agent.role);
    setModalDescription(agent.description);
    setSelectedEmoji(agent.emoji);
    const matchColor =
      agentColorPresets.find((c) => c.color === agent.color) || agentColorPresets[0];
    setSelectedColor(matchColor);
    setDrawerOpen(false);
    setAgentModalOpen(true);
  };

  const saveAgent = async () => {
    const name = modalName().trim();
    const role = modalRole().trim();
    const desc = modalDescription().trim();

    if (!name || !role || !desc) {
      alert('请填写所有必填字段');
      return;
    }

    const editing = editingAgent();
    if (editing) {
      const updated: AgentDef = {
        ...editing, name, role, description: desc,
        emoji: selectedEmoji(), color: selectedColor().color,
        bgColor: selectedColor().bgColor, borderColor: selectedColor().borderColor,
      };
      setAgents((prev) => prev.map((a) => (a.id === editing.id ? updated : a)));
      if (selectedAgent()?.id === editing.id) setSelectedAgent(updated);
      // 尝试同步到 OpenWork
      const content = buildAgentMarkdown(updated, agentSkills()[editing.id] ?? []);
      const ok = await actions.upsertOpenworkSkill(`agent-${editing.id}`, content, desc);
      if (!ok) alert(`AI搭档 "${name}" 已更新（本地）`);
      else alert(`AI搭档 "${name}" 已同步到 OpenWork`);
    } else {
      const newId = `custom-agent-${Date.now()}`;
      const newAgent: AgentDef = {
        id: newId, name, role, description: desc,
        emoji: selectedEmoji(), color: selectedColor().color,
        bgColor: selectedColor().bgColor, borderColor: selectedColor().borderColor,
        skills: [],
      };
      setAgents((prev) => [...prev, newAgent]);
      setAgentSkills((prev) => ({ ...prev, [newId]: [] }));
      // 尝试同步到 OpenWork
      const content = buildAgentMarkdown(newAgent, []);
      const ok = await actions.upsertOpenworkSkill(`agent-${newId}`, content, desc);
      if (!ok) alert(`AI搭档 "${name}" 已创建（本地）`);
      else alert(`AI搭档 "${name}" 已同步到 OpenWork`);
    }
    setAgentModalOpen(false);
    persistData();
  };

  const deleteAgent = (agent: AgentDef) => {
    if (!confirm(`确认删除 ${agent.name}？\n\n删除后该 AI搭档的所有 Skill 配置和任务指派将被清除，此操作不可撤销。`)) {
      return;
    }
    setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    setAssignments((prev) => prev.filter((a) => a.agentId !== agent.id));
    setOrchestrations((prev) => prev.filter((o) => o.agentId !== agent.id));
    setAgentSkills((prev) => {
      const n = { ...prev };
      delete n[agent.id];
      return n;
    });
    setDrawerOpen(false);
    setSelectedAgent(null);
    alert(`AI搭档 "${agent.name}" 已删除`);
    persistData();
  };

  const moveSkillUp = (agentId: string, index: number) => {
    if (index <= 0) return;
    const skills = agentSkills()[agentId] || [];
    const newSkills = [...skills];
    [newSkills[index - 1], newSkills[index]] = [newSkills[index], newSkills[index - 1]];
    setAgentSkills((prev) => ({ ...prev, [agentId]: newSkills }));
  };

  const moveSkillDown = (agentId: string, index: number) => {
    const skills = agentSkills()[agentId] || [];
    if (index >= skills.length - 1) return;
    const newSkills = [...skills];
    [newSkills[index], newSkills[index + 1]] = [newSkills[index + 1], newSkills[index]];
    setAgentSkills((prev) => ({ ...prev, [agentId]: newSkills }));
  };

  return (
    <div class="max-w-7xl mx-auto space-y-6">
      {/* Info Banner */}
      <div class="rounded-lg p-4 flex items-start gap-3" style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}` }}>
        <Bot class="w-6 h-6 flex-shrink-0 mt-1" style={{ color: chartColors.primary }} />
        <div>
          <div class="font-semibold mb-1" style={{ color: chartColors.primary }}>AI 搭档工坊</div>
          <div class="text-sm" style={{ color: themeColors.textSecondary }}>
            可视化管理 Agent 与 Skill，支持拖拽编排、自定义 System Prompt、任务指派与执行追踪
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div class="rounded-lg p-6" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold flex items-center gap-2" style={{ color: themeColors.text }}>
            <Users class="w-5 h-5" />
            <span>Agent 团队 ({agents().length})</span>
          </h2>
          <button
            class="px-4 py-2 text-sm rounded hover:opacity-90 flex items-center gap-2 transition-colors"
            style={{ background: chartColors.primary, color: 'white' }}
            onClick={openCreateAgentModal}
          >
            <Plus size={16} />
            新建 Agent
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={agents()}>
            {(agent) => (
              <AgentCard
                agent={agent}
                skills={agentSkills()[agent.id] || []}
                assignedCount={getAssignedCount(agent.id)}
                onOpen={openDrawer}
              />
            )}
          </For>

          {/* Create New Agent Card */}
          <button
            class="rounded-lg border-2 border-dashed p-4 transition-colors flex flex-col items-center justify-center min-h-[200px]"
            style={{ 'border-color': themeColors.border, background: themeColors.surface }}
            onClick={openCreateAgentModal}
          >
            <Plus class="w-8 h-8 mb-2" style={{ color: themeColors.textMuted }} />
            <div class="text-sm" style={{ color: themeColors.textMuted }}>创建新 AI搭档</div>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div class="rounded-lg p-6" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <h3 class="text-base font-semibold mb-4" style={{ color: themeColors.text }}>统计信息</h3>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-3xl font-bold" style={{ color: chartColors.primary }}>{agents().length}</div>
            <div class="text-xs mt-1" style={{ color: themeColors.textMuted }}>Agent 总数</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold" style={{ color: themeColors.purple }}>{teamSkillPool.length}</div>
            <div class="text-xs mt-1" style={{ color: themeColors.textMuted }}>Skill 总数</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold" style={{ color: chartColors.success }}>
              {agents().reduce((sum, a) => sum + (agentSkills()[a.id] || []).length, 0)}
            </div>
            <div class="text-xs mt-1" style={{ color: themeColors.textMuted }}>已配置技能</div>
          </div>
        </div>
      </div>

      {/* Agent Detail Drawer */}
      <Show when={drawerOpen() && selectedAgent()}>
        <div class="fixed inset-0 z-50 flex justify-end bg-black/20">
          <div class="w-full max-w-2xl shadow-xl flex flex-col h-full overflow-hidden" style={{ background: themeColors.surface }}>
            {/* Header */}
            <div class="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded flex items-center justify-center text-white text-lg"
                  style={{ background: selectedAgent()!.color }}
                >
                  {selectedAgent()!.emoji}
                </div>
                <div>
                  <div class="font-semibold text-base" style={{ color: themeColors.text }}>{selectedAgent()!.name}</div>
                  <div class="text-xs" style={{ color: themeColors.textMuted }}>{selectedAgent()!.role}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="px-3 py-1.5 text-sm rounded flex items-center gap-1 transition-colors"
                  style={{ background: themeColors.primaryBg, color: chartColors.primary }}
                  onClick={() => openEditAgentModal(selectedAgent()!)}
                >
                  <Pencil size={14} />
                  编辑
                </button>
                <button
                  class="px-3 py-1.5 text-sm rounded flex items-center gap-1 transition-colors"
                  style={{ background: themeColors.errorBg, color: chartColors.error }}
                  onClick={() => deleteAgent(selectedAgent()!)}
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <button
                  class="px-3 py-1.5 text-sm"
                  style={{ color: themeColors.textMuted }}
                  onClick={() => setDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div class="flex-1 overflow-y-auto p-6">
              <div class="text-sm mb-6" style={{ color: themeColors.textMuted }}>{selectedAgent()!.description}</div>

              {/* Tabs */}
              <div class="flex gap-4 mb-6" style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                <button
                  class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                  style={{
                    'border-color': activeTab() === 'skills' ? chartColors.primary : 'transparent',
                    color: activeTab() === 'skills' ? chartColors.primary : themeColors.textMuted,
                  }}
                  onClick={() => setActiveTab('skills')}
                >
                  <LayoutGrid class="w-4 h-4 inline mr-2" />
                  Skill 管理
                </button>
                <button
                  class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                  style={{
                    'border-color': activeTab() === 'orchestration' ? chartColors.primary : 'transparent',
                    color: activeTab() === 'orchestration' ? chartColors.primary : themeColors.textMuted,
                  }}
                  onClick={() => setActiveTab('orchestration')}
                >
                  <Zap class="w-4 h-4 inline mr-2" />
                  任务编排
                </button>
              </div>

              {/* Skill Tab */}
              <Show when={activeTab() === 'skills'}>
                <div class="space-y-4">
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <div class="text-sm font-medium flex items-center gap-2">
                        <LayoutGrid size={14} />
                        AI搭档的 Skill ({(agentSkills()[selectedAgent()!.id] || []).length})
                      </div>
                      <button
                        class="px-3 py-1 text-xs rounded flex items-center gap-1 transition-colors"
                        style={{ background: themeColors.primaryBg, color: chartColors.primary }}
                        onClick={() => {
                          setEditingSkill(null);
                          setSkillModalOpen(true);
                        }}
                      >
                        <Plus size={12} />
                        新建 Skill
                      </button>
                    </div>

                    <Show
                      when={(agentSkills()[selectedAgent()!.id] || []).length > 0}
                      fallback={
                      <div class="text-center py-6 text-sm" style={{ color: themeColors.textMuted }}>
                          从下方 Skill 池拖入，或点击 + 添加
                        </div>
                      }
                    >
                      <div class="space-y-2 rounded-lg p-3" style={{ border: `1px solid ${themeColors.primaryBorder}`, background: themeColors.primaryBg }}>
                        <For each={agentSkills()[selectedAgent()!.id] || []}>
                          {(skillName, index) => {
                            const skillDef = teamSkillPool.find((s) => s.name === skillName);
                            const status = getSkillStatus(selectedAgent()!.id, skillName);
                            const cat = skillDef?.category || '';
                            return (
                              <div class="flex items-center gap-2 p-2 rounded text-sm" style={{ background: themeColors.surface, border: `1px solid ${themeColors.borderLight}` }}>
                                <div class="flex-1 min-w-0">
                                  <div class="flex items-center gap-2 mb-1">
                                    <div
                                      class="w-1 h-4 rounded flex-shrink-0"
                                      style={{ background: categoryColor[cat] || themeColors.border }}
                                    />
                                    <span class="font-medium">{skillName}</span>
                                    <Show when={status}>
                                      <span
                                        class="text-xs px-1.5 py-0.5 rounded"
                                        style={{
                                          background:
                                            status === 'running'
                                              ? themeColors.primaryBg
                                              : status === 'done'
                                              ? themeColors.successBg
                                              : themeColors.backgroundSecondary,
                                          color: skillStatusConfig[status!]?.color,
                                        }}
                                      >
                                        {skillStatusConfig[status!]?.text}
                                      </span>
                                    </Show>
                                  </div>
                                  <Show when={skillDef?.description}>
                                    <div class="text-xs" style={{ color: themeColors.textMuted }}>{skillDef?.description}</div>
                                  </Show>
                                </div>

                                <div class="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    class="px-2 py-1 text-xs rounded transition-colors"
                                    style={{ color: chartColors.primary }}
                                    onClick={() => {
                                      if (skillDef) {
                                        setEditingSkill(skillDef);
                                        setSkillModalOpen(true);
                                      }
                                    }}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <Show when={index() > 0}>
                                    <button
                                      class="px-2 py-1 text-xs rounded transition-colors"
                                      style={{ color: themeColors.textSecondary }}
                                      onClick={() =>
                                        moveSkillUp(selectedAgent()!.id, index())
                                      }
                                    >
                                      ▲
                                    </button>
                                  </Show>
                                  <Show when={index() < (agentSkills()[selectedAgent()!.id] || []).length - 1}>
                                    <button
                                      class="px-2 py-1 text-xs rounded transition-colors"
                                      style={{ color: themeColors.textSecondary }}
                                      onClick={() =>
                                        moveSkillDown(selectedAgent()!.id, index())
                                      }
                                    >
                                      ▼
                                    </button>
                                  </Show>
                                  <button
                                    class="px-2 py-1 text-xs rounded transition-colors"
                                    style={{ color: chartColors.error }}
                                    onClick={() =>
                                      removeSkill(selectedAgent()!.id, skillName)
                                    }
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>

                  {/* Skill Pool */}
                  <div>
                    <div class="text-sm font-medium mb-3 py-2 text-gray-10" style={{ 'border-top': `1px solid ${themeColors.borderLight}`, color: themeColors.textMuted }}>
                      Skill 池（拖入上方或点击 + 添加）
                    </div>

                    <Show
                      when={getAvailableSkills(selectedAgent()!.id).length > 0}
                      fallback={<div class="text-center text-sm py-4" style={{ color: themeColors.textMuted }}>所有 Skill 已添加</div>}
                    >
                      <div class="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto pr-2">
                        <For each={getAvailableSkills(selectedAgent()!.id)}>
                          {(skill) => (
                            <SkillCard
                              skill={skill}
                              onEdit={(s) => {
                                setEditingSkill(s);
                                setSkillModalOpen(true);
                              }}
                              onAdd={(name) => addSkill(selectedAgent()!.id, name)}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>

                  {/* 多平台发现的 Skill */}
                  <Show when={getExternalSkills(selectedAgent()!.id).length > 0}>
                    <div>
                      <div class="text-sm font-medium mb-2 py-2" style={{ 'border-top': `1px solid ${themeColors.borderLight}`, color: themeColors.textMuted }}>
                        多平台 Skill（只读）
                      </div>
                      <div class="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2">
                        <For each={getExternalSkills(selectedAgent()!.id)}>
                          {(skill) => (
                            <div class="rounded-lg p-3" style={{ background: themeColors.bgSubtle, border: `1px solid ${themeColors.borderLight}` }}>
                              <div class="flex items-center gap-2 mb-1">
                                <PlatformBadge platform={skill.platform} />
                                <span class="text-sm font-medium" style={{ color: themeColors.text }}>{skill.name}</span>
                              </div>
                              <Show when={skill.description}>
                                <div class="text-xs mb-2" style={{ color: themeColors.textMuted }}>{skill.description}</div>
                              </Show>
                              <div class="text-xs" style={{ color: themeColors.textMuted }}>只读 · {skill.path}</div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={activeTab() === 'orchestration'}>
                <div class="space-y-4">
                  <div>
                    <div class="text-sm font-medium mb-3" style={{ color: themeColors.text }}>指派任务</div>
                    <div class="rounded-lg p-3 max-h-56 overflow-y-auto space-y-2" style={{ border: `1px solid ${themeColors.border}`, background: themeColors.bgSubtle }}>
                      <For each={taskList}>
                        {(task) => {
                          const otherAgent = assignments().find(
                            (a) => a.taskId === task.id && a.agentId !== selectedAgent()!.id
                          );
                          const isChecked = pendingTasks().includes(task.id);

                          return (
                            <label
                              class={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                otherAgent
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                              style={{ background: 'transparent' }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!!otherAgent}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPendingTasks([...pendingTasks(), task.id]);
                                  } else {
                                    setPendingTasks(
                                      pendingTasks().filter((id) => id !== task.id)
                                    );
                                  }
                                }}
                                class="w-4 h-4"
                              />
                              <div class="flex-1 min-w-0 flex items-center gap-2">
                                <span
                                  class="text-xs px-1.5 py-0.5 rounded text-white flex-shrink-0"
                                  style={{
                                    background:
                                      task.priority === 'P0'
                                        ? themeColors.error
                                        : task.priority === 'P1'
                                        ? themeColors.warning
                                        : themeColors.border,
                                  }}
                                >
                                  {task.priority}
                                </span>
                                <span class="text-sm flex-1 truncate" style={{ color: themeColors.text }}>
                                  {task.title}
                                </span>
                                <span
                                  class="text-xs px-1.5 py-0.5 rounded text-white flex-shrink-0"
                                  style={{ background: taskStatusTag[task.status]?.color }}
                                >
                                  {taskStatusTag[task.status]?.label}
                                </span>
                              </div>
                              {otherAgent && (
                                <span class="text-xs flex-shrink-0" style={{ color: themeColors.textMuted }}>已占用</span>
                              )}
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <button
                    class="w-full px-4 py-2 text-sm rounded flex items-center justify-center gap-2 transition-colors"
                    style={{ background: chartColors.primary, color: 'white' }}
                    onClick={confirmAssignment}
                  >
                    <CheckCircle size={16} />
                    确认指派（{pendingTasks().length} 个任务）
                  </button>

                  <div class="pt-4" style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
                    <div class="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: themeColors.text }}>
                      <Zap size={14} />
                      执行编排
                    </div>

                    <Show
                      when={
                        assignments().filter((a) => a.agentId === selectedAgent()!.id)
                          .length > 0
                      }
                      fallback={<div class="text-center text-sm py-4" style={{ color: themeColors.textMuted }}>暂无指派任务</div>}
                    >
                      <div class="space-y-2">
                        <For
                          each={assignments().filter(
                            (a) => a.agentId === selectedAgent()!.id
                          )}
                        >
                          {(assignment) => {
                            const [expanded, setExpanded] = createSignal(false);
                            const task = taskList.find((t) => t.id === assignment.taskId);
                            const orch = orchestrations().find(
                              (o) =>
                                o.agentId === selectedAgent()!.id &&
                                o.taskId === assignment.taskId
                            );

                            return (
                              <div class="rounded-lg overflow-hidden" style={{ border: `1px solid ${themeColors.borderLight}` }}>
                                <button
                                  class="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors"
                                  style={{ background: themeColors.bgSubtle }}
                                  onClick={() => setExpanded(!expanded())}
                                >
                                  <div
                                    class="text-sm"
                                    style={{
                                      color:
                                        assignment.status === 'done'
                                          ? themeColors.success
                                          : assignment.status === 'working'
                                          ? themeColors.primary
                                          : themeColors.warning,
                                    }}
                                  >
                                    {assignment.status === 'done' ? (
                                      <CheckCircle size={16} />
                                    ) : assignment.status === 'working' ? (
                                      <PlayCircle size={16} />
                                    ) : (
                                      <Clock size={16} />
                                    )}
                                  </div>
                                  <span class="text-sm font-medium flex-1 truncate" style={{ color: themeColors.text }}>
                                    {task?.title || assignment.taskId}
                                  </span>
                                  <Show when={task}>
                                    <span
                                      class="text-xs px-1.5 py-0.5 rounded text-white"
                                      style={{
                                        background:
                                          task!.priority === 'P0' ? themeColors.error : themeColors.warning,
                                      }}
                                    >
                                      {task!.priority}
                                    </span>
                                    <span
                                      class="text-xs px-1.5 py-0.5 rounded text-white"
                                      style={{
                                        background: taskStatusTag[task!.status]?.color,
                                      }}
                                    >
                                      {taskStatusTag[task!.status]?.label}
                                    </span>
                                  </Show>
                                  <span style={{ color: themeColors.textMuted }}>
                                    {expanded() ? '▼' : '▶'}
                                  </span>
                                </button>

                                <Show when={expanded()}>
                                  <div class="px-3 py-3" style={{ 'border-top': `1px solid ${themeColors.borderLight}`, background: themeColors.surface }}>
                                    <Show
                                      when={orch}
                                      fallback={
                                        <div class="text-center py-3 flex flex-col items-center gap-2">
                                          <div class="text-xs flex items-center gap-1" style={{ color: themeColors.textMuted }}>
                                            <Clock size={14} />
                                            等待 AI搭档调度
                                          </div>
                                          <button
                                            class="text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
                                            style={{ background: chartColors.primary }}
                                            disabled={executingTaskId() !== null}
                                            onClick={() => executeSkills(selectedAgent()!.id, assignment.taskId)}
                                          >
                                            {executingTaskId() === assignment.taskId ? '⟳ 执行中...' : '▶ 开始执行'}
                                          </button>
                                        </div>
                                      }
                                    >
                                      <div class="space-y-3">
                                        <For each={orch!.steps}>
                                          {(step) => {
                                            const cfg = skillStatusConfig[step.status];
                                            return (
                                              <div class="flex gap-3">
                                                <div class="flex-shrink-0 flex flex-col items-center gap-1">
                                                  <div
                                                    class="text-sm"
                                                    style={{ color: cfg.color }}
                                                  >
                                                    {step.status === 'running' ? (
                                                      <Loader2 class="w-4 h-4 animate-spin" />
                                                    ) : step.status === 'done' ? (
                                                      <CheckCircle size={16} />
                                                    ) : (
                                                      <Clock size={16} />
                                                    )}
                                                  </div>
                                                  <Show
                                                    when={
                                                      orch!.steps.indexOf(step) <
                                                      orch!.steps.length - 1
                                                    }
                                                  >
                                                    <div
                                                      class="w-0.5 h-6"
                                                      style={{ background: cfg.color }}
                                                    />
                                                  </Show>
                                                </div>
                                                <div class="flex-1">
                                                  <div class="flex items-center gap-2 mb-1">
                                                    <span class="text-sm font-medium">
                                                      {step.skillName}
                                                    </span>
                                                    <span
                                                      class="text-xs px-1.5 py-0.5 rounded text-white"
                                                      style={{ background: cfg.color }}
                                                    >
                                                      {cfg.text}
                                                    </span>
                                                  </div>
                                                  <Show when={step.output}>
                                                    <div class="text-xs" style={{ color: themeColors.textMuted }}>
                                                      {step.output}
                                                    </div>
                                                  </Show>
                                                </div>
                                              </div>
                                            );
                                          }}
                                        </For>
                                      </div>
                                    </Show>
                                    {/* 执行/重新执行按钮 */}
                                    <div class="mt-3 flex justify-end">
                                      <button
                                        class="text-xs px-3 py-1.5 rounded-lg text-white transition-colors"
                                        style={{ background: orch!.status === 'done' ? chartColors.success : chartColors.primary }}
                                        disabled={executingTaskId() !== null}
                                        onClick={() => executeSkills(selectedAgent()!.id, assignment.taskId)}
                                      >
                                        {executingTaskId() === assignment.taskId ? '⟳ 执行中...' : orch!.status === 'done' ? '↻ 重新执行' : '▶ 继续执行'}
                                      </button>
                                    </div>
                                  </div>
                                </Show>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Agent Create/Edit Modal */}
      <Show when={agentModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div class="rounded-lg shadow-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" style={{ background: themeColors.surface }}>
            <h2 class="text-lg font-semibold mb-4" style={{ color: themeColors.text }}>
              {editingAgent() ? `编辑 AI搭档：${editingAgent()!.name}` : '创建新 AI搭档'}
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  AI搭档名称
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  placeholder="如：Security Agent"
                  value={modalName()}
                  onInput={(e) => setModalName(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  角色定位
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  placeholder="如：安全工程师"
                  value={modalRole()}
                  onInput={(e) => setModalRole(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  职责描述
                </label>
                <textarea
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  rows={2}
                  placeholder="一句话描述该 Agent 的核心职责"
                  value={modalDescription()}
                  onInput={(e) => setModalDescription(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  Emoji 标识
                </label>
                <div class="flex flex-wrap gap-2">
                  <For each={emojiPresets}>
                    {(e) => (
                      <button
                        class="w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-colors border-2"
                        style={{
                          'border-color':
                            selectedEmoji() === e ? themeColors.primary : themeColors.backgroundSecondary,
                          background:
                            selectedEmoji() === e ? themeColors.primaryBg : themeColors.backgroundSecondary,
                        }}
                        onClick={() => setSelectedEmoji(e)}
                      >
                        {e}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  配色方案
                </label>
                <div class="flex flex-wrap gap-3">
                  <For each={agentColorPresets}>
                    {(c) => (
                      <button
                        class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border-2"
                        title={c.label}
                        style={{
                          background: c.bgColor,
                          'border-color':
                            selectedColor().color === c.color
                              ? c.color
                              : c.borderColor,
                          'border-width':
                            selectedColor().color === c.color ? '3px' : '1px',
                        }}
                        onClick={() => setSelectedColor(c)}
                      >
                        <div
                          class="w-3 h-3 rounded-full"
                          style={{ background: c.color }}
                        />
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2" style={{ color: themeColors.text }}>
                  预览
                </label>
                <div
                  class="border-2 rounded-lg p-4 flex items-center gap-3"
                  style={{
                    'border-color': selectedColor().borderColor,
                    background: `linear-gradient(135deg, ${selectedColor().bgColor} 0%, ${themeColors.surface} 100%)`,
                  }}
                >
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0"
                    style={{ background: selectedColor().color }}
                  >
                    {selectedEmoji()}
                  </div>
                  <div>
                    <div class="font-semibold text-sm">
                      {modalName() || 'Agent 名称'}
                    </div>
                    <div class="text-xs" style={{ color: themeColors.textMuted }}>
                      {modalRole() || '角色定位'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-2 mt-6">
              <button
                class="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: themeColors.hover, color: themeColors.text }}
                onClick={() => setAgentModalOpen(false)}
              >
                取消
              </button>
              <button
                class="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: chartColors.primary, color: 'white' }}
                onClick={saveAgent}
              >
                {editingAgent() ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default AgentWorkshop;
