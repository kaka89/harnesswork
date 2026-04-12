import { Component, createSignal, For, Show, createMemo } from 'solid-js';
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
  steps: Array<{
    skillName: string;
    status: 'pending' | 'running' | 'done';
    output?: string;
  }>;
}

// ─── Constants ───────────────────────────────────────────────────────

const categoryColor: Record<string, string> = {
  '产品': 'themeColors.primary',
  '架构': 'themeColors.purple',
  '开发': 'themeColors.cyan',
  '质量': 'themeColors.warning',
  '运维': 'themeColors.success',
  '管理': 'themeColors.error',
};

const taskStatusTag: Record<string, { label: string; color: string }> = {
  'todo': { label: '待办', color: 'themeColors.border' },
  'in-dev': { label: '开发中', color: 'themeColors.warning' },
  'in-review': { label: '评审中', color: 'themeColors.error' },
  'done': { label: '已完成', color: 'themeColors.success' },
};

const skillStatusConfig: Record<string, { color: string; text: string }> = {
  done: { color: 'themeColors.success', text: '已完成' },
  running: { color: 'themeColors.primary', text: '执行中' },
  pending: { color: 'themeColors.border', text: '待执行' },
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
      class="bg-white rounded-lg border-2 p-4 hover:shadow-md transition-shadow cursor-pointer relative"
      style={{ 'border-color': props.agent.borderColor }}
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
          <div class="font-semibold text-base text-gray-12 mb-1">{props.agent.name}</div>
          <div class="text-xs text-gray-10">{props.agent.role}</div>
        </div>
      </div>

      <div class="text-xs text-gray-9 mb-2">{props.agent.description}</div>

      <div class="border-t border-gray-200 pt-2">
        <div class="text-xs text-gray-10 mb-2">已配置技能 ({props.skills.length})</div>
        <div class="flex flex-wrap gap-1">
          <For each={props.skills.slice(0, 3)}>
            {(skill) => {
              const skillDef = teamSkillPool.find((s) => s.name === skill);
              const cat = skillDef?.category || '';
              return (
                <span
                  class="text-xs px-2 py-0.5 rounded text-white"
                  style={{ background: categoryColor[cat] || 'themeColors.border' }}
                >
                  {skill}
                </span>
              );
            }}
          </For>
          {props.skills.length > 3 && (
            <span class="text-xs px-2 py-0.5 rounded text-gray-600 bg-gray-100">
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
    <div class="bg-white rounded-lg border border-gray-300 p-3 hover:border-blue-400 transition-colors">
      <div class="flex items-start gap-2 mb-2">
        <div
          class="w-1 h-4 rounded flex-shrink-0"
          style={{ background: categoryColor[props.skill.category] || 'themeColors.border' }}
        />
        <div class="flex-1">
          <div class="font-semibold text-sm text-gray-12">{props.skill.name}</div>
          <span
            class="text-xs px-1.5 py-0.5 rounded text-white inline-block mt-1"
            style={{ background: categoryColor[props.skill.category] || 'themeColors.border' }}
          >
            {props.skill.category}
          </span>
        </div>
      </div>

      <div class="text-xs text-gray-10 mb-2">{props.skill.description}</div>

      <Show when={props.skill.trigger}>
        <div class="text-xs text-gray-9 mb-1">
          <span class="font-medium">触发：</span>
          {props.skill.trigger}
        </div>
      </Show>

      <button
        class="text-xs text-blue-600 hover:text-blue-700 mb-2"
        onClick={() => setExpanded(!expanded())}
      >
        {expanded() ? '收起详情 ▲' : '展开详情 ▼'}
      </button>

      <Show when={expanded()}>
        <div class="mt-2 pt-2 border-t border-gray-200 space-y-2">
          <Show when={props.skill.systemPrompt}>
            <div>
              <div class="text-xs font-medium text-gray-11 mb-1">System Prompt:</div>
              <div class="text-xs text-gray-9 bg-gray-50 p-2 rounded whitespace-pre-wrap">
                {props.skill.systemPrompt}
              </div>
            </div>
          </Show>

          <Show when={props.skill.inputParams && props.skill.inputParams.length > 0}>
            <div>
              <div class="text-xs font-medium text-gray-11 mb-1">输入参数:</div>
              <div class="space-y-1">
                <For each={props.skill.inputParams}>
                  {(param) => (
                    <div class="text-xs text-gray-9">
                      • {param.name} ({param.type}){param.required && ' *'}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={props.skill.outputType}>
            <div class="text-xs text-gray-9">
              <span class="font-medium">输出类型：</span>
              {props.skill.outputType}
            </div>
          </Show>
        </div>
      </Show>

      <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
        <button
          class="text-xs px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded flex items-center gap-1"
          onClick={() => props.onEdit(props.skill)}
        >
          <Pencil size={12} />
          编辑
        </button>
        <button
          class="text-xs px-2 py-1 bg-green-50 text-green-600 hover:bg-green-100 rounded flex items-center gap-1"
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
  const [agents, setAgents] = createSignal<AgentDef[]>([...teamAgents]);
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

  const saveAgent = () => {
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
        ...editing,
        name,
        role,
        description: desc,
        emoji: selectedEmoji(),
        color: selectedColor().color,
        bgColor: selectedColor().bgColor,
        borderColor: selectedColor().borderColor,
      };
      setAgents((prev) => prev.map((a) => (a.id === editing.id ? updated : a)));
      if (selectedAgent()?.id === editing.id) setSelectedAgent(updated);
      alert(`AI搭档 "${name}" 已更新`);
    } else {
      const newId = `custom-agent-${Date.now()}`;
      const newAgent: AgentDef = {
        id: newId,
        name,
        role,
        description: desc,
        emoji: selectedEmoji(),
        color: selectedColor().color,
        bgColor: selectedColor().bgColor,
        borderColor: selectedColor().borderColor,
        skills: [],
      };
      setAgents((prev) => [...prev, newAgent]);
      setAgentSkills((prev) => ({ ...prev, [newId]: [] }));
      alert(`AI搭档 "${name}" 已创建`);
    }
    setAgentModalOpen(false);
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
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Bot class="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
        <div>
          <div class="font-semibold text-blue-900 mb-1">AI 搭档工坊</div>
          <div class="text-sm text-blue-800">
            可视化管理 Agent 与 Skill，支持拖拽编排、自定义 System Prompt、任务指派与执行追踪
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold flex items-center gap-2">
            <Users class="w-5 h-5" />
            <span>Agent 团队 ({agents().length})</span>
          </h2>
          <button
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
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
            class="bg-white rounded-lg border-2 border-dashed border-gray-300 p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center min-h-[200px]"
            onClick={openCreateAgentModal}
          >
            <Plus class="w-8 h-8 text-gray-400 mb-2" />
            <div class="text-sm text-gray-600">创建新 AI搭档</div>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-base font-semibold mb-4">统计信息</h3>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-3xl font-bold text-blue-600">{agents().length}</div>
            <div class="text-xs text-gray-10 mt-1">Agent 总数</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-purple-600">{teamSkillPool.length}</div>
            <div class="text-xs text-gray-10 mt-1">Skill 总数</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-green-600">
              {agents().reduce((sum, a) => sum + (agentSkills()[a.id] || []).length, 0)}
            </div>
            <div class="text-xs text-gray-10 mt-1">已配置技能</div>
          </div>
        </div>
      </div>

      {/* Agent Detail Drawer */}
      <Show when={drawerOpen() && selectedAgent()}>
        <div class="fixed inset-0 z-50 flex justify-end bg-black/20">
          <div class="w-full max-w-2xl bg-white shadow-xl flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded flex items-center justify-center text-white text-lg"
                  style={{ background: selectedAgent()!.color }}
                >
                  {selectedAgent()!.emoji}
                </div>
                <div>
                  <div class="font-semibold text-base">{selectedAgent()!.name}</div>
                  <div class="text-xs text-gray-10">{selectedAgent()!.role}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded flex items-center gap-1"
                  onClick={() => openEditAgentModal(selectedAgent()!)}
                >
                  <Pencil size={14} />
                  编辑
                </button>
                <button
                  class="px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded flex items-center gap-1"
                  onClick={() => deleteAgent(selectedAgent()!)}
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <button
                  class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                  onClick={() => setDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div class="flex-1 overflow-y-auto p-6">
              <div class="text-sm text-gray-9 mb-6">{selectedAgent()!.description}</div>

              {/* Tabs */}
              <div class="flex gap-4 mb-6 border-b border-gray-200">
                <button
                  class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab() === 'skills'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('skills')}
                >
                  <LayoutGrid class="w-4 h-4 inline mr-2" />
                  Skill 管理
                </button>
                <button
                  class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab() === 'orchestration'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
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
                        class="px-3 py-1 text-xs bg-blue-100 text-blue-600 hover:bg-blue-200 rounded flex items-center gap-1"
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
                        <div class="text-center py-6 text-gray-10 text-sm">
                          从下方 Skill 池拖入，或点击 + 添加
                        </div>
                      }
                    >
                      <div class="space-y-2 border border-blue-200 rounded-lg p-3 bg-blue-50">
                        <For each={agentSkills()[selectedAgent()!.id] || []}>
                          {(skillName, index) => {
                            const skillDef = teamSkillPool.find((s) => s.name === skillName);
                            const status = getSkillStatus(selectedAgent()!.id, skillName);
                            const cat = skillDef?.category || '';
                            return (
                              <div class="flex items-center gap-2 p-2 bg-white rounded border border-gray-200 text-sm">
                                <div class="flex-1 min-w-0">
                                  <div class="flex items-center gap-2 mb-1">
                                    <div
                                      class="w-1 h-4 rounded flex-shrink-0"
                                      style={{ background: categoryColor[cat] || 'themeColors.border' }}
                                    />
                                    <span class="font-medium">{skillName}</span>
                                    <Show when={status}>
                                      <span
                                        class="text-xs px-1.5 py-0.5 rounded"
                                        style={{
                                          background:
                                            status === 'running'
                                              ? 'themeColors.primaryBg'
                                              : status === 'done'
                                              ? 'themeColors.successBg'
                                              : 'themeColors.backgroundSecondary',
                                          color: skillStatusConfig[status!]?.color,
                                        }}
                                      >
                                        {skillStatusConfig[status!]?.text}
                                      </span>
                                    </Show>
                                  </div>
                                  <Show when={skillDef?.description}>
                                    <div class="text-xs text-gray-9">{skillDef?.description}</div>
                                  </Show>
                                </div>

                                <div class="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    class="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
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
                                      class="px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded"
                                      onClick={() =>
                                        moveSkillUp(selectedAgent()!.id, index())
                                      }
                                    >
                                      ▲
                                    </button>
                                  </Show>
                                  <Show when={index() < (agentSkills()[selectedAgent()!.id] || []).length - 1}>
                                    <button
                                      class="px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded"
                                      onClick={() =>
                                        moveSkillDown(selectedAgent()!.id, index())
                                      }
                                    >
                                      ▼
                                    </button>
                                  </Show>
                                  <button
                                    class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
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
                    <div class="text-sm font-medium mb-3 py-2 border-t border-gray-200 text-gray-10">
                      Skill 池（拖入上方或点击 + 添加）
                    </div>

                    <Show
                      when={getAvailableSkills(selectedAgent()!.id).length > 0}
                      fallback={<div class="text-center text-sm text-gray-10 py-4">所有 Skill 已添加</div>}
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
                </div>
              </Show>

              {/* Orchestration Tab */}
              <Show when={activeTab() === 'orchestration'}>
                <div class="space-y-4">
                  <div>
                    <div class="text-sm font-medium mb-3">指派任务</div>
                    <div class="border border-gray-200 rounded-lg p-3 max-h-56 overflow-y-auto space-y-2 bg-gray-50">
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
                                  : 'hover:bg-white'
                              }`}
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
                                        ? 'themeColors.error'
                                        : task.priority === 'P1'
                                        ? 'themeColors.warning'
                                        : 'themeColors.border',
                                  }}
                                >
                                  {task.priority}
                                </span>
                                <span class="text-sm text-gray-12 flex-1 truncate">
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
                                <span class="text-xs text-gray-10 flex-shrink-0">已占用</span>
                              )}
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <button
                    class="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-2"
                    onClick={confirmAssignment}
                  >
                    <CheckCircle size={16} />
                    确认指派（{pendingTasks().length} 个任务）
                  </button>

                  <div class="border-t border-gray-200 pt-4">
                    <div class="text-sm font-medium mb-3 flex items-center gap-2">
                      <Zap size={14} />
                      执行编排
                    </div>

                    <Show
                      when={
                        assignments().filter((a) => a.agentId === selectedAgent()!.id)
                          .length > 0
                      }
                      fallback={<div class="text-center text-sm text-gray-10 py-4">暂无指派任务</div>}
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
                              <div class="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                  class="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left flex items-center gap-2 transition-colors"
                                  onClick={() => setExpanded(!expanded())}
                                >
                                  <div
                                    class="text-sm"
                                    style={{
                                      color:
                                        assignment.status === 'done'
                                          ? 'themeColors.success'
                                          : assignment.status === 'working'
                                          ? 'themeColors.primary'
                                          : 'themeColors.warning',
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
                                  <span class="text-sm font-medium text-gray-12 flex-1 truncate">
                                    {task?.title || assignment.taskId}
                                  </span>
                                  <Show when={task}>
                                    <span
                                      class="text-xs px-1.5 py-0.5 rounded text-white"
                                      style={{
                                        background:
                                          task!.priority === 'P0' ? 'themeColors.error' : 'themeColors.warning',
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
                                  <span class="text-gray-10">
                                    {expanded() ? '▼' : '▶'}
                                  </span>
                                </button>

                                <Show when={expanded()}>
                                  <div class="px-3 py-3 border-t border-gray-200 bg-white">
                                    <Show
                                      when={orch}
                                      fallback={
                                        <div class="text-center text-xs text-gray-10 py-3 flex items-center justify-center gap-1">
                                          <Clock size={14} />
                                          等待 AI搭档调度...
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
                                                    <div class="text-xs text-gray-9">
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
          <div class="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 class="text-lg font-semibold mb-4">
              {editingAgent() ? `编辑 AI搭档：${editingAgent()!.name}` : '创建新 AI搭档'}
            </h2>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-12 mb-2">
                  AI搭档名称
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="如：Security Agent"
                  value={modalName()}
                  onInput={(e) => setModalName(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-12 mb-2">
                  角色定位
                </label>
                <input
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="如：安全工程师"
                  value={modalRole()}
                  onInput={(e) => setModalRole(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-12 mb-2">
                  职责描述
                </label>
                <textarea
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  rows={2}
                  placeholder="一句话描述该 Agent 的核心职责"
                  value={modalDescription()}
                  onInput={(e) => setModalDescription(e.target.value)}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-12 mb-2">
                  Emoji 标识
                </label>
                <div class="flex flex-wrap gap-2">
                  <For each={emojiPresets}>
                    {(e) => (
                      <button
                        class="w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-colors border-2"
                        style={{
                          'border-color':
                            selectedEmoji() === e ? 'themeColors.primary' : 'themeColors.backgroundSecondary',
                          background:
                            selectedEmoji() === e ? 'themeColors.primaryBg' : 'themeColors.backgroundSecondary',
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
                <label class="block text-sm font-medium text-gray-12 mb-2">
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
                <label class="block text-sm font-medium text-gray-12 mb-2">
                  预览
                </label>
                <div
                  class="border-2 rounded-lg p-4 flex items-center gap-3"
                  style={{
                    'border-color': selectedColor().borderColor,
                    background: `linear-gradient(135deg, ${selectedColor().bgColor} 0%, themeColors.surface 100%)`,
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
                    <div class="text-xs text-gray-10">
                      {modalRole() || '角色定位'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-2 mt-6">
              <button
                class="flex-1 px-4 py-2 text-sm bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200"
                onClick={() => setAgentModalOpen(false)}
              >
                取消
              </button>
              <button
                class="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
