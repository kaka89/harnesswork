import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { soloAgents, AgentDef } from '../../../mock/autopilot';
import {
  soloSkillPool, SkillDef, initialSoloAssignments, AgentAssignment,
  agentColorPresets, emojiPresets, ColorPreset, soloOrchestrations,
} from '../../../mock/agentWorkshop';
import { soloTasks as mockSoloTasks, SoloTask } from '../../../mock/solo';
import { readYamlDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { Plus, Trash2, Edit2, Clock, CheckCircle, Zap } from 'lucide-solid';

const categoryColor: Record<string, string> = {
  '产品': 'chartColors.primary', '工程': 'chartColors.success', '增长': 'themeColors.warning', '运营': 'themeColors.success',
};

const soloCategoryOptions = ['产品', '工程', '增长', '运营'];

const assignStatusClass: Record<string, string> = {
  assigned: 'bg-yellow-100 text-yellow-700',
  working:  'bg-blue-100 text-blue-700',
  done:     'bg-green-100 text-green-700',
};

let agentIdCounter = 200;

// ─── Agent Card ─────────────────────────────────────────────────────────
const AgentCard: Component<{
  agent: AgentDef;
  skills: string[];
  assignedCount: number;
  skillPool: SkillDef[];
  onClick: () => void;
}> = (props) => {
  return (
    <div
      class="relative rounded-xl border cursor-pointer hover:shadow-md transition-all p-4"
      style={{
        'border-color': props.agent.borderColor,
        background: `linear-gradient(135deg, ${props.agent.bgColor} 0%, themeColors.surface 100%)`,
      }}
      onClick={props.onClick}
    >
      {/* Assignment badge */}
      <Show when={props.assignedCount > 0}>
        <div
          class="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: props.agent.color }}
        >
          {props.assignedCount}
        </div>
      </Show>

      <div class="flex items-center gap-2.5 mb-2">
        <span class="text-3xl">{props.agent.emoji}</span>
        <div>
          <div class="font-semibold text-sm text-gray-900">{props.agent.name}</div>
          <div class="text-xs text-gray-500">{props.agent.role}</div>
        </div>
      </div>
      <p class="text-xs text-gray-500 mb-3 leading-relaxed">{props.agent.description}</p>

      {/* Skills */}
      <div class="flex flex-wrap gap-1.5">
        <For each={props.skills.slice(0, 3)}>
          {(s) => {
            const def = props.skillPool.find(d => d.name === s);
            return (
              <div
                class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border text-xs"
                style={{ 'border-color': props.agent.borderColor }}
              >
                <span>{s}</span>
                <Show when={def?.category}>
                  <span
                    class="text-xs px-1 rounded text-white"
                    style={{ background: categoryColor[def!.category] || 'themeColors.textMuted', 'font-size': '10px' }}
                  >
                    {def!.category}
                  </span>
                </Show>
              </div>
            );
          }}
        </For>
        <Show when={props.skills.length > 3}>
          <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">
            +{props.skills.length - 3}
          </span>
        </Show>
      </div>

      <Show when={props.assignedCount > 0}>
        <div class="mt-2 text-xs font-medium" style={{ color: props.agent.color }}>
          ⚡ 已绑定 {props.assignedCount} 个任务
        </div>
      </Show>
    </div>
  );
};

// ─── Skill Pool Item (draggable) ─────────────────────────────────────────
const SkillPoolItem: Component<{
  skill: SkillDef;
  onEdit: () => void;
  onDragStart: (skillName: string) => void;
}> = (props) => {
  return (
    <div
      class="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-100 bg-white hover:border-blue-200 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('skill', props.skill.name);
        props.onDragStart(props.skill.name);
      }}
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="font-semibold text-xs text-gray-800 truncate">{props.skill.name}</span>
          <Show when={props.skill.category}>
            <span
              class="text-xs px-1 py-0.5 rounded text-white flex-shrink-0"
              style={{ background: categoryColor[props.skill.category] || 'themeColors.textMuted', 'font-size': '10px' }}
            >
              {props.skill.category}
            </span>
          </Show>
        </div>
        <p class="text-xs text-gray-400 m-0 line-clamp-1">{props.skill.description}</p>
      </div>
      <button
        class="text-gray-300 hover:text-blue-500 flex-shrink-0 text-xs"
        onClick={(e) => { e.stopPropagation(); props.onEdit(); }}
      >
        ✎
      </button>
    </div>
  );
};

// ─── Main ────────────────────────────────────────────────────────────────
const SoloAgentWorkshop: Component = () => {
  const { productStore } = useAppStore();
  const [soloTasks, setSoloTasks] = createSignal<SoloTask[]>(mockSoloTasks);
  const [agents, setAgents] = createSignal<AgentDef[]>([...soloAgents]);
  const initialAgentSkills = (() => {
    const map: Record<string, string[]> = {};
    soloAgents.forEach((a) => { map[a.id] = [...a.skills]; });
    return map;
  })();
  const [agentSkills, setAgentSkills] = createSignal<Record<string, string[]>>(initialAgentSkills);
  const [assignments, setAssignments] = createSignal<AgentAssignment[]>([...initialSoloAssignments]);
  const [skillPool, setSkillPool] = createSignal<SkillDef[]>([...soloSkillPool]);

  // Panel state
  const [selectedAgent, setSelectedAgent] = createSignal<AgentDef | null>(null);
  const [panelTab, setPanelTab] = createSignal<'skills' | 'tasks' | 'orchestrations'>('skills');
  const [pendingTaskIds, setPendingTaskIds] = createSignal<string[]>([]);

  // Drag state
  const [, setDraggingSkill] = createSignal<string | null>(null);
  const [dropOver, setDropOver] = createSignal(false);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const taskFiles = await readYamlDir<SoloTask>('.xingjing/solo/tasks', workDir);
    if (taskFiles.length > 0) setSoloTasks(taskFiles);
  });

  // Modal state
  const [agentModalOpen, setAgentModalOpen] = createSignal(false);
  const [editingAgent, setEditingAgent] = createSignal<AgentDef | null>(null);
  const [agentForm, setAgentForm] = createSignal({ name: '', role: '', description: '' });
  const [selectedEmoji, setSelectedEmoji] = createSignal('🧠');
  const [selectedColor, setSelectedColor] = createSignal<ColorPreset>(agentColorPresets[4]);

  const [skillModalOpen, setSkillModalOpen] = createSignal(false);
  const [editingSkill, setEditingSkill] = createSignal<SkillDef | null>(null);
  const [skillForm, setSkillForm] = createSignal({
    name: '', description: '', category: soloCategoryOptions[0],
    outputType: '', inputParams: [] as Array<{ name: string; type: string; required: boolean; description: string }>,
  });

  const [confirmDeleteAgentId, setConfirmDeleteAgentId] = createSignal<string | null>(null);

  // Helpers
  const getAssignedCount = (agentId: string) =>
    assignments().filter((a) => a.agentId === agentId).length;

  const getAgentSkills = (agentId: string) => agentSkills()[agentId] || [];

  const openAgentPanel = (agent: AgentDef) => {
    setSelectedAgent(agent);
    const assigned = assignments().filter((a) => a.agentId === agent.id).map((a) => a.taskId);
    setPendingTaskIds(assigned);
    setPanelTab('skills');
  };

  const closePanel = () => setSelectedAgent(null);

  const addSkillToAgent = (agentId: string, skillName: string) => {
    if (getAgentSkills(agentId).includes(skillName)) return;
    setAgentSkills(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), skillName] }));
  };

  const removeSkillFromAgent = (agentId: string, skillName: string) => {
    setAgentSkills(prev => ({ ...prev, [agentId]: (prev[agentId] || []).filter(s => s !== skillName) }));
  };

  const moveSkill = (agentId: string, from: number, to: number) => {
    const arr = [...getAgentSkills(agentId)];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setAgentSkills(prev => ({ ...prev, [agentId]: arr }));
  };

  const confirmAssignment = () => {
    if (!selectedAgent()) return;
    const agentId = selectedAgent()!.id;
    const existing = assignments().filter(a => a.agentId !== agentId);
    const newAssign = pendingTaskIds().map(taskId => {
      const prev = assignments().find(a => a.agentId === agentId && a.taskId === taskId);
      return { agentId, taskId, status: prev?.status || ('assigned' as const) };
    });
    setAssignments([...existing, ...newAssign]);
  };

  // Drop handler for skill list area
  const handleDropOnAgent = (e: DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const skillName = e.dataTransfer?.getData('skill');
    const ag = selectedAgent();
    if (skillName && ag) addSkillToAgent(ag.id, skillName);
    setDraggingSkill(null);
  };

  // Agent Modal
  const openCreateAgentModal = () => {
    setEditingAgent(null);
    setAgentForm({ name: '', role: '', description: '' });
    setSelectedEmoji('🧠');
    setSelectedColor(agentColorPresets[4]);
    setAgentModalOpen(true);
  };

  const openEditAgentModal = (agent: AgentDef) => {
    setEditingAgent(agent);
    setAgentForm({ name: agent.name, role: agent.role, description: agent.description });
    setSelectedEmoji(agent.emoji);
    setSelectedColor(agentColorPresets.find(c => c.color === agent.color) || agentColorPresets[4]);
    setAgentModalOpen(true);
  };

  const saveAgent = () => {
    const f = agentForm();
    if (!f.name.trim() || !f.role.trim()) return;
    const ea = editingAgent();
    if (ea) {
      const updated: AgentDef = { ...ea, ...f, emoji: selectedEmoji(), ...selectedColor() };
      setAgents(prev => prev.map(a => a.id === ea.id ? updated : a));
      if (selectedAgent()?.id === ea.id) setSelectedAgent(updated);
    } else {
      const id = `custom-solo-${++agentIdCounter}`;
      const newAgent: AgentDef = {
        id, ...f, emoji: selectedEmoji(), ...selectedColor(), skills: [],
      };
      setAgents(prev => [...prev, newAgent]);
      setAgentSkills(prev => ({ ...prev, [id]: [] }));
    }
    setAgentModalOpen(false);
  };

  const deleteAgent = (agentId: string) => {
    setAgents(prev => prev.filter(a => a.id !== agentId));
    setAssignments(prev => prev.filter(a => a.agentId !== agentId));
    setAgentSkills(prev => { const n = { ...prev }; delete n[agentId]; return n; });
    if (selectedAgent()?.id === agentId) setSelectedAgent(null);
    setConfirmDeleteAgentId(null);
  };

  // Skill Modal
  const openCreateSkillModal = () => {
    setEditingSkill(null);
    setSkillForm({ name: '', description: '', category: soloCategoryOptions[0], outputType: '', inputParams: [] });
    setSkillModalOpen(true);
  };

  const openEditSkillModal = (skill: SkillDef) => {
    setEditingSkill(skill);
    setSkillForm({
      name: skill.name,
      description: skill.description,
      category: skill.category || soloCategoryOptions[0],
      outputType: skill.outputType || '',
      inputParams: [...(skill.inputParams || [])],
    });
    setSkillModalOpen(true);
  };

  const saveSkill = () => {
    const f = skillForm();
    if (!f.name.trim()) return;
    const es = editingSkill();
    const newSkill: SkillDef = {
      id: es ? es.id : `solo-skill-${Date.now()}`,
      name: f.name, description: f.description, category: f.category,
      outputType: f.outputType, inputParams: f.inputParams,
    };
    if (es) {
      setSkillPool(prev => prev.map(s => s.id === es.id ? newSkill : s));
      if (newSkill.name !== es.name) {
        setAgentSkills(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(agentId => {
            updated[agentId] = updated[agentId].map(n => n === es.name ? newSkill.name : n);
          });
          return updated;
        });
      }
    } else {
      setSkillPool(prev => [...prev, newSkill]);
      const ag = selectedAgent();
      if (ag) addSkillToAgent(ag.id, newSkill.name);
    }
    setSkillModalOpen(false);
  };

  const agentOrchestrations = () => {
    const ag = selectedAgent();
    if (!ag) return [];
    return soloOrchestrations.filter(o => o.agentId === ag.id);
  };

  return (
    <div>
      {/* Banner */}
      <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-start gap-3">
        <span class="text-xl">🤖</span>
        <div>
          <span class="font-semibold text-green-900">独立版 AI搭档</span>
          <span class="text-sm text-green-700 ml-2">
            你的虚拟 AI 搭档团队。可拖拽 Skill 进入搭档、新建和编辑 Skill 规格、指派任务。每个 AI搭档通过调度 Skill 完成指派的任务。
          </span>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-4">
        {/* Left: Agent Cards */}
        <div class={selectedAgent() ? 'col-span-5' : 'col-span-9'}>
          <div class="flex justify-between items-center mb-3">
            <span class="font-semibold text-sm text-gray-800">
              AI 搭档团队 ({agents().length})
            </span>
            <button
              class="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              onClick={openCreateAgentModal}
            >
              + 新建搭档
            </button>
          </div>

          <div class={`grid gap-3 ${selectedAgent() ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <For each={agents()}>
              {(agent) => (
                <AgentCard
                  agent={agent}
                  skills={getAgentSkills(agent.id)}
                  assignedCount={getAssignedCount(agent.id)}
                  skillPool={skillPool()}
                  onClick={() => openAgentPanel(agent)}
                />
              )}
            </For>
          </div>
        </div>

        {/* Middle: Skill Pool */}
        <div class={selectedAgent() ? 'col-span-3' : 'col-span-3'}>
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 h-full">
            <div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
              <span class="font-semibold text-xs text-gray-700">Skill 池 ({skillPool().length})</span>
              <button
                class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                onClick={openCreateSkillModal}
              >
                + 新建
              </button>
            </div>

            <div class="p-2 text-xs text-blue-600 bg-blue-50 mx-2 mt-2 rounded-lg mb-2">
              {selectedAgent() ? '拖拽 Skill 到右侧搭档的技能列表' : '点击搭档后可拖拽分配 Skill'}
            </div>

            <div class="p-2 flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
              <For each={skillPool()}>
                {(skill) => (
                  <SkillPoolItem
                    skill={skill}
                    onEdit={() => openEditSkillModal(skill)}
                    onDragStart={(name) => setDraggingSkill(name)}
                  />
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Right: Agent Detail Panel */}
        <Show when={selectedAgent()}>
          <div class="col-span-4">
            <div class="bg-white rounded-xl shadow-sm border border-gray-100">
              {/* Panel Header */}
              <div
                class="px-4 py-3 border-b border-gray-100 flex items-center gap-2"
                style={{ background: selectedAgent()!.bgColor }}
              >
                <span class="text-xl">{selectedAgent()!.emoji}</span>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm text-gray-900">{selectedAgent()!.name}</div>
                  <div class="text-xs text-gray-500">{selectedAgent()!.role}</div>
                </div>
                <div class="flex gap-1">
                  <button
                    class="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                    onClick={() => openEditAgentModal(selectedAgent()!)}
                  >
                    编辑
                  </button>
                  <button
                    class="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 transition-colors"
                    onClick={() => setConfirmDeleteAgentId(selectedAgent()!.id)}
                  >
                    删除
                  </button>
                  <button class="text-gray-400 hover:text-gray-600 ml-1" onClick={closePanel}>✕</button>
                </div>
              </div>

              {/* Sub Tabs */}
              <div class="flex border-b border-gray-100 text-xs">
                <For each={[
                  { key: 'skills', label: 'Skill 配置' },
                  { key: 'tasks', label: '任务指派' },
                  { key: 'orchestrations', label: '编排记录' },
                ] as const}>
                  {(tab) => (
                    <button
                      class={`flex-1 py-2 font-medium border-b-2 transition-colors ${
                        panelTab() === tab.key
                          ? 'border-green-500 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                      onClick={() => setPanelTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  )}
                </For>
              </div>

              {/* Skills Tab */}
              <Show when={panelTab() === 'skills'}>
                <div class="p-3">
                  {/* Drop zone */}
                  <div
                    class={`rounded-xl border-2 border-dashed p-2 mb-3 min-h-[120px] transition-colors ${
                      dropOver() ? 'border-green-400 bg-green-50' : 'border-gray-200'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDropOver(true); }}
                    onDragLeave={() => setDropOver(false)}
                    onDrop={handleDropOnAgent}
                  >
                    <div class="text-xs text-gray-400 text-center mb-2">
                      {dropOver() ? '松开以添加 Skill' : '从左侧拖拽 Skill 至此'}
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <For each={getAgentSkills(selectedAgent()!.id)}>
                        {(skillName, idx) => {
                          const def = skillPool().find(s => s.name === skillName);
                          return (
                            <div
                              class="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-gray-100 cursor-grab hover:shadow-sm transition-all group"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer?.setData('reorder', String(idx()));
                                e.dataTransfer?.setData('skill', skillName);
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const fromIdx = e.dataTransfer?.getData('reorder');
                                if (fromIdx !== undefined && fromIdx !== '') {
                                  moveSkill(selectedAgent()!.id, Number(fromIdx), idx());
                                }
                              }}
                            >
                              <span class="text-gray-300 cursor-grab">⠿</span>
                              <span class="text-xs font-medium text-gray-800 flex-1">{skillName}</span>
                              <Show when={def?.category}>
                                <span
                                  class="text-xs px-1 py-0.5 rounded text-white"
                                  style={{ background: categoryColor[def!.category] || 'themeColors.textMuted', 'font-size': '9px' }}
                                >
                                  {def!.category}
                                </span>
                              </Show>
                              <button
                                class="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => removeSkillFromAgent(selectedAgent()!.id, skillName)}
                              >
                                ×
                              </button>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                    <Show when={getAgentSkills(selectedAgent()!.id).length === 0}>
                      <div class="text-center py-4 text-gray-400 text-xs">
                        暂无 Skill，从左侧拖拽添加
                      </div>
                    </Show>
                  </div>

                  <button
                    class="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-green-300 hover:text-green-500 transition-colors"
                    onClick={openCreateSkillModal}
                  >
                    + 新建并添加 Skill
                  </button>
                </div>
              </Show>

              {/* Tasks Tab */}
              <Show when={panelTab() === 'tasks'}>
                <div class="p-3">
                  <div class="text-xs text-gray-400 mb-3">勾选需要指派给该搭档的任务</div>
                  <div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto mb-3">
                    <For each={soloTasks()}>
                      {(task) => (
                        <label class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
                          <div
                            class={`w-4 h-4 rounded border flex items-center justify-center text-white text-xs flex-shrink-0 ${
                              pendingTaskIds().includes(task.id) ? 'bg-green-500 border-green-500' : 'border-gray-300'
                            }`}
                            onClick={() => {
                              setPendingTaskIds(prev =>
                                prev.includes(task.id)
                                  ? prev.filter(id => id !== task.id)
                                  : [...prev, task.id]
                              );
                            }}
                          >
                            {pendingTaskIds().includes(task.id) && '✓'}
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-xs font-medium text-gray-800 truncate">{task.title}</div>
                            <div class="flex items-center gap-1 mt-0.5">
                              <span class={`text-xs px-1 py-0.5 rounded ${
                                task.status === 'doing' ? 'bg-blue-100 text-blue-600' :
                                task.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {task.status === 'doing' ? '进行中' : task.status === 'done' ? '完成' : '待办'}
                              </span>
                            </div>
                          </div>
                          {/* Assignment status */}
                          <Show when={assignments().find(a => a.agentId === selectedAgent()!.id && a.taskId === task.id)}>
                            <span class={`text-xs px-1.5 py-0.5 rounded ${assignStatusClass[assignments().find(a => a.agentId === selectedAgent()!.id && a.taskId === task.id)?.status || 'assigned']}`}>
                              {assignments().find(a => a.agentId === selectedAgent()!.id && a.taskId === task.id)?.status === 'done' ? '完成' : '已指派'}
                            </span>
                          </Show>
                        </label>
                      )}
                    </For>
                  </div>
                  <button
                    class="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    onClick={confirmAssignment}
                  >
                    确认指派 ({pendingTaskIds().length} 个任务)
                  </button>
                </div>
              </Show>

              {/* Orchestrations Tab */}
              <Show when={panelTab() === 'orchestrations'}>
                <div class="p-3">
                  <Show
                    when={agentOrchestrations().length > 0}
                    fallback={<div class="text-center py-10 text-gray-400 text-sm">暂无编排记录</div>}
                  >
                    <div class="flex flex-col gap-3">
                      <For each={agentOrchestrations()}>
                        {(orch) => (
                          <div class="rounded-xl border border-gray-100 p-3">
                            <div class="flex items-center justify-between mb-2">
                              <span class="font-semibold text-xs text-gray-800">{orch.taskTitle}</span>
                              <span class={`text-xs px-1.5 py-0.5 rounded ${
                                orch.status === 'done' ? 'bg-green-100 text-green-700' :
                                orch.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {orch.status === 'done' ? '完成' : orch.status === 'running' ? '执行中' : '待执行'}
                              </span>
                            </div>
                            <div class="flex flex-col gap-1">
                              <For each={orch.steps}>
                                {(step) => (
                                  <div class="flex items-center gap-2 text-xs py-0.5">
                                    <span class={
                                      step.status === 'done' ? 'text-green-500' :
                                      step.status === 'running' ? 'text-blue-500' : 'text-gray-300'
                                    }>
                                      {step.status === 'done' ? '✓' : step.status === 'running' ? '⟳' : '○'}
                                    </span>
                                    <span class="text-gray-700">{step.skillName}</span>
                                    <Show when={step.output}>
                                      <span class="text-gray-400 flex-1 truncate">→ {step.output}</span>
                                    </Show>
                                  </div>
                                )}
                              </For>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* Agent Modal */}
      <Show when={agentModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/30" onClick={() => setAgentModalOpen(false)} />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-[440px]">
            <div class="flex items-center justify-between mb-4">
              <span class="font-semibold text-base text-gray-900">
                {editingAgent() ? '编辑搭档' : '新建搭档'}
              </span>
              <button class="text-gray-400 hover:text-gray-600" onClick={() => setAgentModalOpen(false)}>✕</button>
            </div>

            <div class="flex flex-col gap-3">
              {/* Emoji Picker */}
              <div>
                <div class="text-xs text-gray-500 mb-1.5">选择头像</div>
                <div class="flex flex-wrap gap-1.5">
                  <For each={emojiPresets.slice(0, 12)}>
                    {(emoji) => (
                      <button
                        class={`w-8 h-8 text-xl rounded-lg border-2 transition-all ${
                          selectedEmoji() === emoji ? 'border-green-500 bg-green-50' : 'border-transparent hover:border-gray-200'
                        }`}
                        onClick={() => setSelectedEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <div class="text-xs text-gray-500 mb-1.5">选择颜色</div>
                <div class="flex gap-1.5 flex-wrap">
                  <For each={agentColorPresets}>
                    {(preset) => (
                      <button
                        class={`w-6 h-6 rounded-full border-2 transition-all ${
                          selectedColor().color === preset.color ? 'border-gray-800 scale-110' : 'border-transparent'
                        }`}
                        style={{ background: preset.color }}
                        onClick={() => setSelectedColor(preset)}
                      />
                    )}
                  </For>
                </div>
              </div>

              {/* Name */}
              <div>
                <div class="text-xs text-gray-500 mb-1">名称 *</div>
                <input
                  value={agentForm().name}
                  onInput={e => setAgentForm(prev => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="如：产品思考者"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400"
                />
              </div>

              {/* Role */}
              <div>
                <div class="text-xs text-gray-500 mb-1">角色 *</div>
                <input
                  value={agentForm().role}
                  onInput={e => setAgentForm(prev => ({ ...prev, role: e.currentTarget.value }))}
                  placeholder="如：产品 + 用户研究"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400"
                />
              </div>

              {/* Description */}
              <div>
                <div class="text-xs text-gray-500 mb-1">描述</div>
                <textarea
                  value={agentForm().description}
                  onInput={e => setAgentForm(prev => ({ ...prev, description: e.currentTarget.value }))}
                  placeholder="该搭档的职责描述..."
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 resize-none"
                  rows={2}
                />
              </div>
            </div>

            {/* Preview */}
            <div
              class="mt-3 p-3 rounded-xl border flex items-center gap-3"
              style={{ 'border-color': selectedColor().borderColor, background: selectedColor().bgColor }}
            >
              <span class="text-2xl">{selectedEmoji()}</span>
              <div>
                <div class="font-semibold text-sm" style={{ color: selectedColor().color }}>
                  {agentForm().name || '搭档名称'}
                </div>
                <div class="text-xs text-gray-500">{agentForm().role || '角色定义'}</div>
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                onClick={() => setAgentModalOpen(false)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                onClick={saveAgent}
              >
                {editingAgent() ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Skill Modal */}
      <Show when={skillModalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/30" onClick={() => setSkillModalOpen(false)} />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <span class="font-semibold text-base text-gray-900">
                {editingSkill() ? '编辑 Skill' : '新建 Skill'}
              </span>
              <button class="text-gray-400 hover:text-gray-600" onClick={() => setSkillModalOpen(false)}>✕</button>
            </div>

            <div class="flex flex-col gap-3">
              <div>
                <div class="text-xs text-gray-500 mb-1">Skill 名称 *</div>
                <input
                  value={skillForm().name}
                  onInput={e => setSkillForm(prev => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="如：prd-writer"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 font-mono"
                />
              </div>
              <div>
                <div class="text-xs text-gray-500 mb-1">描述</div>
                <input
                  value={skillForm().description}
                  onInput={e => setSkillForm(prev => ({ ...prev, description: e.currentTarget.value }))}
                  placeholder="该 Skill 的功能说明..."
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs text-gray-500 mb-1">分类</div>
                  <select
                    value={skillForm().category}
                    onChange={e => setSkillForm(prev => ({ ...prev, category: e.currentTarget.value }))}
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                  >
                    <For each={soloCategoryOptions}>
                      {(cat) => <option value={cat}>{cat}</option>}
                    </For>
                  </select>
                </div>
                <div>
                  <div class="text-xs text-gray-500 mb-1">输出类型</div>
                  <input
                    value={skillForm().outputType}
                    onInput={e => setSkillForm(prev => ({ ...prev, outputType: e.currentTarget.value }))}
                    placeholder="如：string / file"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 font-mono"
                  />
                </div>
              </div>

              {/* Input Params */}
              <div>
                <div class="text-xs text-gray-500 mb-2">输入参数</div>
                <div class="border border-green-100 rounded-xl p-3 bg-green-50">
                  <For each={skillForm().inputParams}>
                    {(param, idx) => (
                      <div class="flex gap-2 items-start mb-2 flex-wrap">
                        <input
                          value={param.name}
                          onInput={e => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, name: e.currentTarget.value } : p)
                          }))}
                          placeholder="参数名"
                          class="border border-gray-200 rounded-lg px-2 py-1 text-xs w-24 outline-none"
                        />
                        <input
                          value={param.type}
                          onInput={e => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, type: e.currentTarget.value } : p)
                          }))}
                          placeholder="类型"
                          class="border border-gray-200 rounded-lg px-2 py-1 text-xs w-24 outline-none"
                        />
                        <label class="flex items-center gap-1 cursor-pointer">
                          <div
                            class={`w-8 h-4 rounded-full transition-colors ${param.required ? 'bg-green-500' : 'bg-gray-200'}`}
                            onClick={() => setSkillForm(prev => ({
                              ...prev,
                              inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, required: !p.required } : p)
                            }))}
                          >
                            <div class={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${param.required ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                          <span class="text-xs text-gray-500">必填</span>
                        </label>
                        <input
                          value={param.description}
                          onInput={e => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, description: e.currentTarget.value } : p)
                          }))}
                          placeholder="描述"
                          class="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs min-w-[80px] outline-none"
                        />
                        <button
                          class="text-red-400 hover:text-red-600 mt-1"
                          onClick={() => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.filter((_, i) => i !== idx())
                          }))}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </For>
                  <button
                    class="w-full py-1.5 border border-dashed border-green-300 rounded-lg text-xs text-green-600 hover:bg-green-100 transition-colors"
                    onClick={() => setSkillForm(prev => ({
                      ...prev,
                      inputParams: [...prev.inputParams, { name: '', type: 'string', required: false, description: '' }]
                    }))}
                  >
                    + 添加参数
                  </button>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-4">
              <button class="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50" onClick={() => setSkillModalOpen(false)}>
                取消
              </button>
              <button class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700" onClick={saveSkill}>
                {editingSkill() ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Delete Confirm */}
      <Show when={confirmDeleteAgentId()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <div class="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteAgentId(null)} />
          <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
            <div class="font-semibold text-base text-gray-900 mb-2">
              确认删除 {agents().find(a => a.id === confirmDeleteAgentId())?.name}？
            </div>
            <p class="text-sm text-gray-500 mb-4">删除后该搭档的所有配置和任务指派将被清除。</p>
            <div class="flex justify-end gap-2">
              <button class="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50" onClick={() => setConfirmDeleteAgentId(null)}>取消</button>
              <button class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600" onClick={() => deleteAgent(confirmDeleteAgentId()!)}>删除</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloAgentWorkshop;
