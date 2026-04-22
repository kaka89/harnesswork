import { Component, createSignal, For, Show, onMount } from 'solid-js';
import { soloAgents, AgentDef } from '../../../mock/autopilot';
import {
  SkillDef, initialSoloAssignments, AgentAssignment,
  agentColorPresets, emojiPresets, ColorPreset, soloOrchestrations,
} from '../../../mock/agentWorkshop';
import { soloTasks as mockSoloTasks, SoloTask } from '../../../mock/solo';
import {
  loadSoloTasks,
  loadAgentAssignments, saveAgentAssignments,
} from '../../../services/file-store';
import { listAllAgents, saveAgentToFile, deleteAgentFile } from '../../../services/agent-registry';
import { buildSkillMarkdown, saveSkillToGlobal, deleteSkillFromGlobal, ensureSkillsRegistered } from '../../../services/skill-registry';
import { SOLO_SKILL_DEFS } from '../../../skills/solo-skill-defs';
import type { AutopilotAgent } from '../../../services/autopilot-executor';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { Plus, Trash2, Edit2, Clock, CheckCircle, Zap, Loader2 } from 'lucide-solid';


const categoryColor: Record<string, string> = {
  '产品': chartColors.primary, '工程': chartColors.success, '增长': themeColors.warning, '运营': themeColors.success,
};

const soloCategoryOptions = ['产品', '工程', '增长', '运营'];

const assignStatusStyle: Record<string, { bg: string; color: string }> = {
  assigned: { bg: themeColors.warningBg, color: themeColors.warning },
  working:  { bg: themeColors.primaryBg, color: chartColors.primary },
  done:     { bg: themeColors.successBg, color: chartColors.success },
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
      class="relative rounded-xl cursor-pointer hover:shadow-md transition-all p-4"
      style={{
        border: `1px solid ${props.agent.borderColor}`,
        background: `linear-gradient(135deg, ${props.agent.bgColor} 0%, ${themeColors.surface} 100%)`,
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
          <div class="font-semibold text-sm" style={{ color: themeColors.text }}>{props.agent.name}</div>
          <div class="text-xs" style={{ color: themeColors.textMuted }}>{props.agent.role}</div>
        </div>
      </div>
      <p class="text-xs mb-3 leading-relaxed" style={{ color: themeColors.textMuted }}>{props.agent.description}</p>

      {/* Skills */}
      <div class="flex flex-wrap gap-1.5">
        <For each={props.skills.slice(0, 3)}>
          {(s) => {
            const def = props.skillPool.find(d => d.name === s);
            return (
              <div
                class="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                style={{ background: themeColors.surface, border: `1px solid ${props.agent.borderColor}` }}
              >
                <span>{s}</span>
                <Show when={def?.category}>
                  <span
                    class="text-xs px-1 rounded text-white"
                    style={{ background: categoryColor[def!.category] || themeColors.textMuted, 'font-size': '10px' }}
                  >
                    {def!.category}
                  </span>
                </Show>
              </div>
            );
          }}
        </For>
        <Show when={props.skills.length > 3}>
          <span class="text-xs px-2 py-0.5 rounded-md" style={{ background: themeColors.hover, color: themeColors.textMuted }}>
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
  onDelete: () => void;
  onDragStart: (skillName: string) => void;
}> = (props) => {
  return (
    <div
      class="flex items-start gap-2.5 p-2.5 rounded-lg transition-all cursor-grab active:cursor-grabbing"
      style={{ border: `1px solid ${themeColors.borderLight}`, background: themeColors.surface }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('skill', props.skill.name);
        props.onDragStart(props.skill.name);
      }}
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="font-semibold text-xs truncate" style={{ color: themeColors.text }}>{props.skill.name}</span>
          <Show when={props.skill.category}>
            <span
              class="text-xs px-1 py-0.5 rounded text-white flex-shrink-0"
              style={{ background: categoryColor[props.skill.category] || themeColors.textMuted, 'font-size': '10px' }}
            >
              {props.skill.category}
            </span>
          </Show>
        </div>
        <p class="text-xs m-0 line-clamp-1" style={{ color: themeColors.textMuted }}>{props.skill.description}</p>
      </div>
      <button
        class="flex-shrink-0 text-xs"
        style={{ color: themeColors.textMuted }}
        onClick={(e) => { e.stopPropagation(); props.onEdit(); }}
        title="编辑"
      >
        ✎
      </button>
      <button
        class="flex-shrink-0 text-xs"
        style={{ color: '#ef4444' }}
        onClick={(e) => { e.stopPropagation(); props.onDelete(); }}
        title="删除"
      >
        ✕
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
  const [skillPool, setSkillPool] = createSignal<SkillDef[]>([]);
  const [skillPoolLoading, setSkillPoolLoading] = createSignal(false);
  let skillsRegistered = false;
  // 用内置池预填充 category，补全 OpenWork 列表中缺失的字段
  // 从 SKILL.md frontmatter 解析 category，作为 categoryCache 的初始值
  const categoryCache = new Map<string, string>();
  for (const [name, content] of Object.entries(SOLO_SKILL_DEFS)) {
    const m = content.match(/^category:\s*(.+)$/m);
    if (m) categoryCache.set(name, m[1].trim());
  }

  const { actions } = useAppStore();

  // Panel state
  const [selectedAgent, setSelectedAgent] = createSignal<AgentDef | null>(null);
  const [panelTab, setPanelTab] = createSignal<'skills' | 'tasks' | 'orchestrations'>('skills');
  const [pendingTaskIds, setPendingTaskIds] = createSignal<string[]>([]);
  const [execErrors, setExecErrors] = createSignal<Record<string, string>>({});

  // Drag state
  const [, setDraggingSkill] = createSignal<string | null>(null);
  const [dropOver, setDropOver] = createSignal(false);

  const refreshSkillPool = async () => {
    setSkillPoolLoading(true);
    try {
      // 1. 首次加载时确保内置 Skill 已写入 .opencode/skills/
      if (!skillsRegistered) {
        await ensureSkillsRegistered(
          'solo',
          (n, c, d) => actions.upsertOpenworkSkill(n, c, d),
          () => actions.listOpenworkSkills(),
        );
        skillsRegistered = true;
      }
      // 2. 从 OpenWork 拉取所有 Skill 作为权威列表
      const owSkills = await actions.listOpenworkSkills();
      const defs: SkillDef[] = owSkills.map(s => ({
        id: `ow-${s.name}`,
        name: s.name,
        description: s.description || '',
        category: categoryCache.get(s.name) || '',
        trigger: s.trigger,
      }));
      setSkillPool(defs);
    } catch {
      // 降级：保留当前 pool（首次加载失败时为空，后续失败保留上次状态）
    } finally {
      setSkillPoolLoading(false);
    }
  };

  onMount(async () => {
    // 1. 从 ~/.xingjing/agents/ + 内置常量 统一加载 Agent 列表（全局自定义 + 内置）
    try {
      const allAgentsList = await listAllAgents('solo');
      if (allAgentsList.length > 0) {
        setAgents(allAgentsList.map(a => ({
          id: a.id, name: a.name, role: a.role,
          color: a.color, bgColor: a.bgColor, borderColor: a.borderColor,
          emoji: a.emoji, skills: a.skills, description: a.description,
        })) as AgentDef[]);
        // 构建 agentSkills 映射
        const skillsMap: Record<string, string[]> = {};
        allAgentsList.forEach(a => { skillsMap[a.id] = [...a.skills]; });
        setAgentSkills(skillsMap);
      }
    } catch { /* 保留 mock 数据 */ }

    // 2. 加载产品级数据（任务 + 指派）
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      try {
        const taskFiles = await loadSoloTasks(workDir);
        if (taskFiles.length > 0) setSoloTasks(taskFiles as unknown as SoloTask[]);
      } catch { /* keep mock tasks */ }
      const assignData = await loadAgentAssignments(workDir, 'solo');
      if (assignData.length > 0) setAssignments(assignData as unknown as AgentAssignment[]);
    }

    // 3. 从 OpenWork 加载 Skill 池（权威数据源）
    await refreshSkillPool();

    // 4. 恢复 agentIdCounter — 避免重载后 ID 碰撞
    const maxExistingId = agents()
      .map(a => a.id)
      .filter(id => id.startsWith('custom-solo-'))
      .map(id => parseInt(id.replace('custom-solo-', ''), 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), agentIdCounter);
    agentIdCounter = maxExistingId;
  });

  // ─── 持久化助手 ───

  /** Agent 持久化：写入 ~/.xingjing/agents/{agentId}.md */
  const persistAgent = (agentDef: AgentDef) => {
    const autopilotAgent: AutopilotAgent = {
      ...agentDef,
      systemPrompt: '',  // Workshop 创建的 Agent 默认空 systemPrompt
    };
    saveAgentToFile(autopilotAgent).catch((e) => {
      console.warn('[xingjing] persistAgent 失败:', (e as Error)?.message ?? e);
    });
  };

  /** 产品级持久化：assignments → ${workDir}/.xingjing/agent-assignments-solo.yaml */
  const persistAssignments = () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    saveAgentAssignments(
      workDir,
      assignments() as unknown as Array<Record<string, unknown>>,
      'solo',
    ).catch(() => {});
  };

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
    systemPrompt: '',
    trigger: '',   // 自动触发条件
    glob: '',      // 文件匹配模式
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
    const updated = [...(agentSkills()[agentId] || []), skillName];
    setAgentSkills(prev => ({ ...prev, [agentId]: updated }));
    // 同步持久化：更新 Agent 文件中的 skills 字段
    const ag = agents().find(a => a.id === agentId);
    if (ag) persistAgent({ ...ag, skills: updated });
  };

  const removeSkillFromAgent = (agentId: string, skillName: string) => {
    const updated = (agentSkills()[agentId] || []).filter(s => s !== skillName);
    setAgentSkills(prev => ({ ...prev, [agentId]: updated }));
    // 同步持久化：更新 Agent 文件中的 skills 字段
    const ag = agents().find(a => a.id === agentId);
    if (ag) persistAgent({ ...ag, skills: updated });
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
    persistAssignments();
  };

  // ─── 技能真实执行 ───
  const [orchestrations, setOrchestrations] = createSignal([...soloOrchestrations]);
  const [executingTaskId, setExecutingTaskId] = createSignal<string | null>(null);

  const agentOrchestrations = () => {
    const ag = selectedAgent();
    if (!ag) return [];
    return orchestrations().filter(o => o.agentId === ag.id);
  };

  const executeSkills = async (agentId: string, taskId: string) => {
    const skills = agentSkills()[agentId] || [];
    if (skills.length === 0) {
      alert('该 AI搭档尚未配置技能，请先添加技能');
      return;
    }
    const agent = agents().find(a => a.id === agentId);
    const task = soloTasks().find(t => t.id === taskId);
    const taskTitle = task?.title || taskId;
    const workDir = productStore.activeProduct()?.workDir;

    // 自动切换到「编排」Tab 以展示执行流
    setPanelTab('orchestrations');
    setExecutingTaskId(taskId);
    setExecErrors(prev => { const n = { ...prev }; delete n[`${agentId}-${taskId}`]; return n; });

    // Agent 角色人设 —— 注入到每个 Skill 调用的 systemPrompt 前缀
    const agentPersona = agent
      ? `你是「${agent.name}」，职责是${agent.role}。${agent.description ? '\n' + agent.description : ''}`
      : '';

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

    for (let i = 0; i < skills.length; i++) {
      const skillName = skills[i];
      setOrchestrations(prev => prev.map(o =>
        o.agentId === agentId && o.taskId === taskId
          ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, status: 'running' as const } : s) }
          : o
      ));

      // 合并 Agent 人设 + Skill 系统提示
      let skillBasePrompt = `你是一个专业的${skillName}执行助手。`;
      try {
        const detail = await actions.getOpenworkSkill(skillName);
        if (detail) {
          const bodyMatch = detail.content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
          skillBasePrompt = bodyMatch?.[1]?.trim() || detail.content;
        }
      } catch { /* 降级使用默认提示 */ }
      const systemPrompt = agentPersona ? `${agentPersona}\n\n${skillBasePrompt}` : skillBasePrompt;
      const prevOutput = i > 0 ? initialSteps[i - 1].output : '';
      const userPrompt = `请以「${agent?.name ?? 'AI搭档'}」的身份执行「${skillName}」技能。\n当前任务：${taskTitle}${prevOutput ? `\n上一步输出：\n${prevOutput}` : ''}\n\n请输出执行结果，包含：\n1. 执行摘要（2~3句）\n2. 产出物（如有，用 ### 产出物：标题\n内容 格式输出）`;

      try {
        const output: string = await new Promise((resolve, reject) => {
          actions.callAgent({
            systemPrompt,
            userPrompt,
            title: `[${agent?.name ?? agentId}] ${skillName} — ${taskTitle}`,
            directory: workDir,
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
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // 记录错误状态，不再静默 Mock
        setOrchestrations(prev => prev.map(o =>
          o.agentId === agentId && o.taskId === taskId
            ? { ...o, steps: o.steps.map((s, idx) => idx === i ? { ...s, status: 'error' as const, output: `❌ ${errMsg}` } : s) }
            : o
        ));
        setExecErrors(prev => ({ ...prev, [`${agentId}-${taskId}`]: `${skillName} 执行失败：${errMsg}` }));
        // 中止当前任务的后续步骤
        setOrchestrations(prev => prev.map(o =>
          o.agentId === agentId && o.taskId === taskId ? { ...o, status: 'error' as const } : o
        ));
        setAssignments(prev => prev.map(a =>
          a.agentId === agentId && a.taskId === taskId ? { ...a, status: 'assigned' as const } : a
        ));
        setExecutingTaskId(null);
        return;
      }
    }

    setOrchestrations(prev => prev.map(o =>
      o.agentId === agentId && o.taskId === taskId ? { ...o, status: 'done' } : o
    ));
    setAssignments(prev => prev.map(a =>
      a.agentId === agentId && a.taskId === taskId ? { ...a, status: 'done' as const } : a
    ));
    setExecutingTaskId(null);
  };
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
      persistAgent(updated);
    } else {
      const id = `custom-solo-${++agentIdCounter}`;
      const newAgent: AgentDef = {
        id, ...f, emoji: selectedEmoji(), ...selectedColor(), skills: [],
      };
      setAgents(prev => [...prev, newAgent]);
      setAgentSkills(prev => ({ ...prev, [id]: [] }));
      persistAgent(newAgent);
    }
    setAgentModalOpen(false);
  };

  const deleteAgent = (agentId: string) => {
    setAgents(prev => prev.filter(a => a.id !== agentId));
    setAssignments(prev => prev.filter(a => a.agentId !== agentId));
    setAgentSkills(prev => { const n = { ...prev }; delete n[agentId]; return n; });
    if (selectedAgent()?.id === agentId) setSelectedAgent(null);
    setConfirmDeleteAgentId(null);
    // 删除 .opencode/agents/{agentId}.md 文件
    deleteAgentFile(agentId).catch(() => {});
    persistAssignments();  // 删除搭档也清理了其 assignments
  };

  // Skill Modal
  const openCreateSkillModal = () => {
    setEditingSkill(null);
    setSkillForm({ name: '', description: '', category: soloCategoryOptions[0], outputType: '', inputParams: [], systemPrompt: '', trigger: '', glob: '' });
    setSkillModalOpen(true);
  };

  const openEditSkillModal = async (skill: SkillDef) => {
    setEditingSkill(skill);
    // 从 OpenWork 获取完整 SKILL.md 内容以还原编辑字段
    try {
      const detail = await actions.getOpenworkSkill(skill.name);
      if (detail) {
        const content = detail.content;
        const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
        const body = bodyMatch ? bodyMatch[1].trim() : content;
        const catMatch = content.match(/^category:\s*(.+)$/m);
        const cat = catMatch?.[1]?.trim() || skill.category || soloCategoryOptions[0];
        const triggerMatch = content.match(/^trigger:\s*(.+)$/m);
        const triggerVal = triggerMatch?.[1]?.trim() || skill.trigger || '';
        const globMatch = content.match(/^glob:\s*(.+)$/m);
        const globVal = globMatch?.[1]?.trim() || skill.glob || '';
        setSkillForm({
          name: skill.name,
          description: skill.description,
          category: cat,
          outputType: skill.outputType || '',
          inputParams: [...(skill.inputParams || [])],
          systemPrompt: body,
          trigger: triggerVal,
          glob: globVal,
        });
      } else {
        setSkillForm({
          name: skill.name, description: skill.description,
          category: skill.category || soloCategoryOptions[0],
          outputType: '', inputParams: [], systemPrompt: '',
          trigger: skill.trigger || '', glob: skill.glob || '',
        });
      }
    } catch {
      setSkillForm({
        name: skill.name, description: skill.description,
        category: skill.category || soloCategoryOptions[0],
        outputType: '', inputParams: [], systemPrompt: '',
        trigger: '', glob: '',
      });
    }
    setSkillModalOpen(true);
  };

  const saveSkill = async () => {
    const f = skillForm();
    if (!f.name.trim()) return;
    const es = editingSkill();
    const newSkill: SkillDef = {
      id: es ? es.id : `solo-skill-${Date.now()}`,
      name: f.name, description: f.description, category: f.category,
      outputType: f.outputType, inputParams: f.inputParams,
      trigger: f.trigger || undefined, glob: f.glob || undefined,
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
    // 持久化 Skill
    try {
      const content = buildSkillMarkdown({ ...newSkill, systemPrompt: f.systemPrompt });
      // ① 写入当前 workspace（所有 Skill 都写）
      await actions.upsertOpenworkSkill(newSkill.name, content, newSkill.description);
      // ② 仅用户自建 Skill 双写全局目录（内置 Skill 不写入全局，避免污染）
      const isBuiltin = es
        ? Object.keys(SOLO_SKILL_DEFS).includes(es.name)
        : Object.keys(SOLO_SKILL_DEFS).includes(newSkill.name);
      if (!isBuiltin) {
        await saveSkillToGlobal(newSkill.name, content);
      }
      // 更新 category 缓存
      if (newSkill.category) categoryCache.set(newSkill.name, newSkill.category);
      await refreshSkillPool();
    } catch { /* Skill 持久化失败不阻塞 UI */ }
    // Skill 变更后重新持久化关联的 Agent
    const ag = selectedAgent();
    if (ag) persistAgent(ag);
  };

  const handleDeleteSkill = async (skill: SkillDef) => {
    if (!confirm(`确认删除 Skill「${skill.name}」？此操作不可撤销。`)) return;

    // 从所有 Agent 的 skills 中移除引用
    setAgentSkills(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(agentId => {
        updated[agentId] = updated[agentId].filter(n => n !== skill.name);
      });
      return updated;
    });
    // 持久化 Agent 文件变更
    agents().forEach(a => {
      persistAgent({ ...a, skills: (agentSkills()[a.id] || []).filter(n => n !== skill.name) });
    });

    // ① 删除当前 workspace 中的 Skill
    try {
      await actions.deleteOpenworkSkill(skill.name);
    } catch { /* 删除失败不阻塞 UI */ }

    // ② 同步删除全局目录（仅用户自建 Skill 需要）
    const isBuiltin = Object.keys(SOLO_SKILL_DEFS).includes(skill.name);
    if (!isBuiltin) {
      try {
        await deleteSkillFromGlobal(skill.name);
      } catch { /* 全局目录删除失败不阻塞 */ }
    }

    await refreshSkillPool();
  };

  const orchStatusStyle = (status: string) => {
    if (status === 'done') return { bg: themeColors.successBg, color: chartColors.success };
    if (status === 'running') return { bg: themeColors.primaryBg, color: chartColors.primary };
    if (status === 'error') return { bg: 'rgba(239,68,68,0.08)', color: '#ef4444' };
    return { bg: themeColors.bgSubtle, color: themeColors.textMuted };
  };

  const taskStatusStyle = (status: string) => {
    if (status === 'doing') return { bg: themeColors.primaryBg, color: chartColors.primary };
    if (status === 'done') return { bg: themeColors.successBg, color: chartColors.success };
    return { bg: themeColors.hover, color: themeColors.textMuted };
  };

  return (
    <div>
      {/* Banner */}
      <div class="rounded-xl p-4 mb-5 flex items-start gap-3" style={{ background: themeColors.successBg, border: `1px solid ${themeColors.successBorder}` }}>
        <span class="text-xl">🤖</span>
        <div>
          <span class="font-semibold" style={{ color: chartColors.success }}>独立版 AI搭档</span>
          <span class="text-sm ml-2" style={{ color: themeColors.textSecondary }}>
            你的虚拟 AI 搭档团队。可拖拽 Skill 进入搭档、新建和编辑 Skill 规格、指派任务。每个 AI搭档通过调度 Skill 完成指派的任务。
          </span>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-4">
        {/* Left: Agent Cards */}
        <div class={selectedAgent() ? 'col-span-5' : 'col-span-9'}>
          <div class="flex justify-between items-center mb-3">
            <span class="font-semibold text-sm" style={{ color: themeColors.text }}>
              AI 搭档团队 ({agents().length})
            </span>
            <button
              class="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: chartColors.success, color: 'white' }}
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
          <div class="rounded-xl h-full" style={{ background: themeColors.surface, border: `1px solid ${themeColors.borderLight}` }}>
            <div class="flex items-center justify-between px-3 py-2.5" style={{ 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
              <span class="font-semibold text-xs" style={{ color: themeColors.textSecondary }}>Skill 池 ({skillPool().length})</span>
              <button
                class="text-xs px-2 py-1 rounded transition-colors"
                style={{ background: chartColors.primary, color: 'white' }}
                onClick={openCreateSkillModal}
              >
                + 新建
              </button>
            </div>

            <div class="p-2 text-xs mx-2 mt-2 rounded-lg mb-2" style={{ color: chartColors.primary, background: themeColors.primaryBg }}>
              {selectedAgent() ? '拖拽 Skill 到右侧搭档的技能列表' : '点击搭档后可拖拽分配 Skill'}
            </div>

            <div class="p-2 flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
              <Show when={skillPoolLoading()}>
                <div class="p-4 text-xs text-center" style={{ color: themeColors.textMuted }}>
                  <Loader2 size={14} class="animate-spin inline mr-1" />加载中...
                </div>
              </Show>
              <Show when={!skillPoolLoading()}>
                <For each={skillPool()}>
                  {(skill) => (
                    <SkillPoolItem
                      skill={skill}
                      onEdit={() => openEditSkillModal(skill)}
                      onDelete={() => handleDeleteSkill(skill)}
                      onDragStart={(name) => setDraggingSkill(name)}
                    />
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>

        {/* Right: Agent Detail Panel */}
        <Show when={selectedAgent()}>
          <div class="col-span-4">
            <div class="rounded-xl" style={{ background: themeColors.surface, border: `1px solid ${themeColors.borderLight}` }}>
              {/* Panel Header */}
              <div
                class="px-4 py-3 flex items-center gap-2"
                style={{ background: selectedAgent()!.bgColor, 'border-bottom': `1px solid ${themeColors.borderLight}` }}
              >
                <span class="text-xl">{selectedAgent()!.emoji}</span>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm" style={{ color: themeColors.text }}>{selectedAgent()!.name}</div>
                  <div class="text-xs" style={{ color: themeColors.textMuted }}>{selectedAgent()!.role}</div>
                </div>
                <div class="flex gap-1">
                  <button
                    class="text-xs px-2 py-1 rounded transition-colors"
                    style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.textSecondary }}
                    onClick={() => openEditAgentModal(selectedAgent()!)}
                  >
                    编辑
                  </button>
                  <button
                    class="text-xs px-2 py-1 rounded transition-colors"
                    style={{ border: `1px solid ${themeColors.errorBorder}`, color: chartColors.error, background: 'transparent' }}
                    onClick={() => setConfirmDeleteAgentId(selectedAgent()!.id)}
                  >
                    删除
                  </button>
                  <button style={{ color: themeColors.textMuted }} class="ml-1" onClick={closePanel}>✕</button>
                </div>
              </div>

              {/* Sub Tabs */}
              <div class="flex text-xs" style={{ 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
                <For each={[
                  { key: 'skills', label: 'Skill 配置' },
                  { key: 'tasks', label: '任务指派' },
                  { key: 'orchestrations', label: '编排记录' },
                ] as const}>
                  {(tab) => (
                    <button
                      class="flex-1 py-2 font-medium transition-colors"
                      style={{
                        'border-bottom': panelTab() === tab.key ? `2px solid ${chartColors.success}` : '2px solid transparent',
                        color: panelTab() === tab.key ? chartColors.success : themeColors.textMuted,
                        background: 'none',
                      }}
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
                    class="rounded-xl p-2 mb-3 min-h-[120px] transition-colors"
                    style={{
                      border: `2px dashed ${dropOver() ? chartColors.success : themeColors.border}`,
                      background: dropOver() ? themeColors.successBg : 'transparent',
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDropOver(true); }}
                    onDragLeave={() => setDropOver(false)}
                    onDrop={handleDropOnAgent}
                  >
                    <div class="text-xs text-center mb-2" style={{ color: themeColors.textMuted }}>
                      {dropOver() ? '松开以添加 Skill' : '从左侧拖拽 Skill 至此'}
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <For each={getAgentSkills(selectedAgent()!.id)}>
                        {(skillName, idx) => {
                          const def = skillPool().find(s => s.name === skillName);
                          return (
                            <div
                              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-grab hover:shadow-sm transition-all group"
                              style={{ background: themeColors.surface, border: `1px solid ${themeColors.borderLight}` }}
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
                              <span style={{ color: themeColors.textMuted }} class="cursor-grab">⠿</span>
                              <span class="text-xs font-medium flex-1" style={{ color: themeColors.text }}>{skillName}</span>
                              <Show when={def?.category}>
                                <span
                                  class="text-xs px-1 py-0.5 rounded text-white"
                                  style={{ background: categoryColor[def!.category] || themeColors.textMuted, 'font-size': '9px' }}
                                >
                                  {def!.category}
                                </span>
                              </Show>
                              <button
                                class="opacity-0 group-hover:opacity-100 transition-all"
                                style={{ color: themeColors.textMuted }}
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
                      <div class="text-center py-4 text-xs" style={{ color: themeColors.textMuted }}>
                        暂无 Skill，从左侧拖拽添加
                      </div>
                    </Show>
                  </div>

                  <button
                    class="w-full py-2 rounded-lg text-xs transition-colors"
                    style={{ border: `2px dashed ${themeColors.border}`, color: themeColors.textMuted, background: 'transparent' }}
                    onClick={openCreateSkillModal}
                  >
                    + 新建并添加 Skill
                  </button>
                </div>
              </Show>

              {/* Tasks Tab */}
              <Show when={panelTab() === 'tasks'}>
                <div class="p-3">
                  <div class="text-xs mb-3" style={{ color: themeColors.textMuted }}>勾选需要指派给该搭档的任务</div>
                  <div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto mb-3">
                    <For each={soloTasks()}>
                      {(task) => (
                        <label class="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors" style={{ border: `1px solid ${themeColors.borderLight}` }}>
                          <div
                            class="w-4 h-4 rounded flex items-center justify-center text-white text-xs flex-shrink-0"
                            style={{
                              background: pendingTaskIds().includes(task.id) ? chartColors.success : 'transparent',
                              border: `1px solid ${pendingTaskIds().includes(task.id) ? chartColors.success : themeColors.border}`,
                            }}
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
                            <div class="text-xs font-medium truncate" style={{ color: themeColors.text }}>{task.title}</div>
                            <div class="flex items-center gap-1 mt-0.5">
                              <span class="text-xs px-1 py-0.5 rounded" style={{ background: taskStatusStyle(task.status).bg, color: taskStatusStyle(task.status).color }}>
                                {task.status === 'doing' ? '进行中' : task.status === 'done' ? '完成' : '待办'}
                              </span>
                            </div>
                          </div>
                          {/* Assignment status */}
                          <Show when={assignments().find(a => a.agentId === selectedAgent()!.id && a.taskId === task.id)}>
                            {(() => {
                              const s = assignments().find(a => a.agentId === selectedAgent()!.id && a.taskId === task.id)?.status || 'assigned';
                              return (
                                <span class="text-xs px-1.5 py-0.5 rounded" style={{ background: assignStatusStyle[s]?.bg, color: assignStatusStyle[s]?.color }}>
                                  {s === 'done' ? '完成' : '已指派'}
                                </span>
                              );
                            })()}
                          </Show>
                        </label>
                      )}
                    </For>
                  </div>
                  <button
                    class="w-full py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: chartColors.success, color: 'white' }}
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
                    fallback={
                      <div class="text-center py-10 flex flex-col items-center gap-3">
                        <div class="text-sm" style={{ color: themeColors.textMuted }}>暂无编排记录</div>
                        <Show when={assignments().some(a => a.agentId === selectedAgent()?.id)}>
                          <button
                            class="text-xs px-4 py-1.5 rounded-lg text-white transition-colors"
                            style={{ background: chartColors.success }}
                            disabled={executingTaskId() !== null}
                            onClick={() => {
                              const ag = selectedAgent();
                              const firstTask = assignments().find(a => a.agentId === ag?.id);
                              if (ag && firstTask) executeSkills(ag.id, firstTask.taskId);
                            }}
                          >
                            {executingTaskId() ? '⟳ 执行中...' : '▶ 开始执行'}
                          </button>
                        </Show>
                      </div>
                    }
                  >
                    <div class="flex flex-col gap-3">
                      <For each={agentOrchestrations()}>
                        {(orch) => (
                          <div class="rounded-xl p-3" style={{ border: `1px solid ${themeColors.borderLight}` }}>
                            <div class="flex items-center justify-between mb-2">
                              <span class="font-semibold text-xs" style={{ color: themeColors.text }}>{orch.taskTitle}</span>
                              <span class="text-xs px-1.5 py-0.5 rounded" style={{ background: orchStatusStyle(orch.status ?? '').bg, color: orchStatusStyle(orch.status ?? '').color }}>
                                {orch.status === 'done' ? '完成' : orch.status === 'running' ? '执行中' : orch.status === 'error' ? '失败' : '待执行'}
                              </span>
                            </div>
                            <div class="flex flex-col gap-1">
                              <For each={orch.steps}>
                                {(step) => (
                                  <div class="flex items-start gap-2 text-xs py-0.5">
                                    <span class="flex-shrink-0 mt-0.5" style={{
                                      color: step.status === 'done' ? chartColors.success : step.status === 'error' ? '#ef4444' : step.status === 'running' ? chartColors.primary : themeColors.textMuted,
                                    }}>
                                      {step.status === 'done' ? '✓' : step.status === 'error' ? '✗' : step.status === 'running' ? '⟳' : '○'}
                                    </span>
                                    <div class="flex-1 min-w-0">
                                      <span style={{ color: themeColors.textSecondary }}>{step.skillName}</span>
                                      <Show when={step.output}>
                                        <div class="mt-0.5 text-xs whitespace-pre-wrap break-words" style={{ color: step.status === 'error' ? '#ef4444' : themeColors.textMuted }}>{step.output}</div>
                                      </Show>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                            {/* 执行按钮 + 错误提示 */}
                            <Show when={execErrors()[`${orch.agentId}-${orch.taskId}`]}>
                              <div class="mt-2 px-2 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                                ⚠️ {execErrors()[`${orch.agentId}-${orch.taskId}`]}
                              </div>
                            </Show>
                            <div class="mt-2 flex justify-end">
                              <button
                                class="text-xs px-3 py-1 rounded-lg text-white transition-colors"
                                style={{ background: orch.status === 'done' ? chartColors.success : orch.status === 'error' ? '#ef4444' : chartColors.primary }}
                                disabled={executingTaskId() !== null}
                                onClick={() => executeSkills(selectedAgent()!.id, orch.taskId)}
                              >
                                {executingTaskId() === orch.taskId ? '⟳ 执行中...' : orch.status === 'done' ? '↻ 重新执行' : orch.status === 'error' ? '↻ 重试' : '▶ 执行'}
                              </button>
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
          <div class="relative rounded-2xl shadow-xl p-6 w-[440px]" style={{ background: themeColors.surface }}>
            <div class="flex items-center justify-between mb-4">
              <span class="font-semibold text-base" style={{ color: themeColors.text }}>
                {editingAgent() ? '编辑搭档' : '新建搭档'}
              </span>
              <button style={{ color: themeColors.textMuted }} onClick={() => setAgentModalOpen(false)}>✕</button>
            </div>

            <div class="flex flex-col gap-3">
              {/* Emoji Picker */}
              <div>
                <div class="text-xs mb-1.5" style={{ color: themeColors.textMuted }}>选择头像</div>
                <div class="flex flex-wrap gap-1.5">
                  <For each={emojiPresets.slice(0, 12)}>
                    {(emoji) => (
                      <button
                        class="w-8 h-8 text-xl rounded-lg transition-all"
                        style={{
                          border: `2px solid ${selectedEmoji() === emoji ? chartColors.success : 'transparent'}`,
                          background: selectedEmoji() === emoji ? themeColors.successBg : 'transparent',
                        }}
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
                <div class="text-xs mb-1.5" style={{ color: themeColors.textMuted }}>选择颜色</div>
                <div class="flex gap-1.5 flex-wrap">
                  <For each={agentColorPresets}>
                    {(preset) => (
                      <button
                        class={`w-6 h-6 rounded-full transition-all ${
                          selectedColor().color === preset.color ? 'scale-110' : ''
                        }`}
                        style={{
                          background: preset.color,
                          border: `2px solid ${selectedColor().color === preset.color ? themeColors.text : 'transparent'}`,
                        }}
                        onClick={() => setSelectedColor(preset)}
                      />
                    )}
                  </For>
                </div>
              </div>

              {/* Name */}
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>名称 *</div>
                <input
                  value={agentForm().name}
                  onInput={e => setAgentForm(prev => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="如：产品思考者"
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                />
              </div>

              {/* Role */}
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>角色 *</div>
                <input
                  value={agentForm().role}
                  onInput={e => setAgentForm(prev => ({ ...prev, role: e.currentTarget.value }))}
                  placeholder="如：产品 + 用户研究"
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                />
              </div>

              {/* Description */}
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>描述</div>
                <textarea
                  value={agentForm().description}
                  onInput={e => setAgentForm(prev => ({ ...prev, description: e.currentTarget.value }))}
                  placeholder="该搭档的职责描述..."
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  rows={2}
                />
              </div>
            </div>

            {/* Preview */}
            <div
              class="mt-3 p-3 rounded-xl flex items-center gap-3"
              style={{ border: `1px solid ${selectedColor().borderColor}`, background: selectedColor().bgColor }}
            >
              <span class="text-2xl">{selectedEmoji()}</span>
              <div>
                <div class="font-semibold text-sm" style={{ color: selectedColor().color }}>
                  {agentForm().name || '搭档名称'}
                </div>
                <div class="text-xs" style={{ color: themeColors.textMuted }}>{agentForm().role || '角色定义'}</div>
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 rounded-lg text-sm"
                style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.textSecondary }}
                onClick={() => setAgentModalOpen(false)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 rounded-lg text-sm"
                style={{ background: chartColors.success, color: 'white' }}
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
          <div class="relative rounded-2xl shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto" style={{ background: themeColors.surface }}>
            <div class="flex items-center justify-between mb-4">
              <span class="font-semibold text-base" style={{ color: themeColors.text }}>
                {editingSkill() ? '编辑 Skill' : '新建 Skill'}
              </span>
              <button style={{ color: themeColors.textMuted }} onClick={() => setSkillModalOpen(false)}>✕</button>
            </div>

            <div class="flex flex-col gap-3">
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>Skill 名称 *</div>
                <input
                  value={skillForm().name}
                  onInput={e => setSkillForm(prev => ({ ...prev, name: e.currentTarget.value }))}
                  placeholder="如：prd-writer"
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                />
              </div>
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>描述</div>
                <input
                  value={skillForm().description}
                  onInput={e => setSkillForm(prev => ({ ...prev, description: e.currentTarget.value }))}
                  placeholder="该 Skill 的功能说明..."
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>分类</div>
                  <select
                    value={skillForm().category}
                    onChange={e => setSkillForm(prev => ({ ...prev, category: e.currentTarget.value }))}
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  >
                    <For each={soloCategoryOptions}>
                      {(cat) => <option value={cat}>{cat}</option>}
                    </For>
                  </select>
                </div>
                <div>
                  <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>输出类型</div>
                  <input
                    value={skillForm().outputType}
                    onInput={e => setSkillForm(prev => ({ ...prev, outputType: e.currentTarget.value }))}
                    placeholder="如：string / file"
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  />
                </div>
              </div>

              {/* Trigger & Glob */}
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>触发条件</div>
                  <input
                    value={skillForm().trigger}
                    onInput={e => setSkillForm(prev => ({ ...prev, trigger: e.currentTarget.value }))}
                    placeholder="如：用户讨论产品需求时"
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  />
                </div>
                <div>
                  <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>文件匹配</div>
                  <input
                    value={skillForm().glob}
                    onInput={e => setSkillForm(prev => ({ ...prev, glob: e.currentTarget.value }))}
                    placeholder="如：*.tsx, *.css"
                    class="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                    style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  />
                </div>
              </div>

              {/* Input Params */}
              <div>
                <div class="text-xs mb-2" style={{ color: themeColors.textMuted }}>输入参数</div>
                <div class="rounded-xl p-3" style={{ border: `1px solid ${themeColors.successBorder}`, background: themeColors.successBg }}>
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
                          class="rounded-lg px-2 py-1 text-xs w-24 outline-none"
                          style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                        />
                        <input
                          value={param.type}
                          onInput={e => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, type: e.currentTarget.value } : p)
                          }))}
                          placeholder="类型"
                          class="rounded-lg px-2 py-1 text-xs w-24 outline-none"
                          style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                        />
                        <label class="flex items-center gap-1 cursor-pointer">
                          <div
                            class="w-8 h-4 rounded-full transition-colors"
                            style={{ background: param.required ? chartColors.success : themeColors.border }}
                            onClick={() => setSkillForm(prev => ({
                              ...prev,
                              inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, required: !p.required } : p)
                            }))}
                          >
                            <div class={`w-3 h-3 rounded-full mt-0.5 transition-transform ${param.required ? 'translate-x-4' : 'translate-x-0.5'}`} style={{ background: themeColors.surface }} />
                          </div>
                          <span class="text-xs" style={{ color: themeColors.textMuted }}>必填</span>
                        </label>
                        <input
                          value={param.description}
                          onInput={e => setSkillForm(prev => ({
                            ...prev,
                            inputParams: prev.inputParams.map((p, i) => i === idx() ? { ...p, description: e.currentTarget.value } : p)
                          }))}
                          placeholder="描述"
                          class="flex-1 rounded-lg px-2 py-1 text-xs min-w-[80px] outline-none"
                          style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                        />
                        <button
                          style={{ color: chartColors.error }}
                          class="mt-1"
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
                    class="w-full py-1.5 rounded-lg text-xs transition-colors"
                    style={{ border: `1px dashed ${themeColors.successBorder}`, color: chartColors.success, background: 'transparent' }}
                    onClick={() => setSkillForm(prev => ({
                      ...prev,
                      inputParams: [...prev.inputParams, { name: '', type: 'string', required: false, description: '' }]
                    }))}
                  >
                    + 添加参数
                  </button>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <div class="text-xs mb-1" style={{ color: themeColors.textMuted }}>System Prompt（Skill 主提示词）</div>
                <textarea
                  value={skillForm().systemPrompt}
                  onInput={e => setSkillForm(prev => ({ ...prev, systemPrompt: e.currentTarget.value }))}
                  placeholder="该 Skill 的完整执行指令..."
                  class="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none font-mono"
                  style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
                  rows={6}
                />
              </div>
            </div>

            <div class="flex justify-end gap-2 mt-4">
              <button class="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.textSecondary }} onClick={() => setSkillModalOpen(false)}>
                取消
              </button>
              <button class="px-4 py-2 rounded-lg text-sm" style={{ background: chartColors.primary, color: 'white' }} onClick={saveSkill}>
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
          <div class="relative rounded-2xl shadow-xl p-6 w-80" style={{ background: themeColors.surface }}>
            <div class="font-semibold text-base mb-2" style={{ color: themeColors.text }}>
              确认删除 {agents().find(a => a.id === confirmDeleteAgentId())?.name}？
            </div>
            <p class="text-sm mb-4" style={{ color: themeColors.textMuted }}>删除后该搭档的所有配置和任务指派将被清除。</p>
            <div class="flex justify-end gap-2">
              <button class="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.textSecondary }} onClick={() => setConfirmDeleteAgentId(null)}>取消</button>
              <button class="px-4 py-2 rounded-lg text-sm" style={{ background: chartColors.error, color: 'white' }} onClick={() => deleteAgent(confirmDeleteAgentId()!)}>删除</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default SoloAgentWorkshop;
