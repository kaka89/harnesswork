/**
 * WorkflowEditor — 流程编排可视化编辑器
 *
 * 替换原有 GateTab，提供完整的流水线阶段配置能力：
 * - 全局配置（模式、重试次数）
 * - Stage 卡片列表（折叠/展开编辑）
 * - 每个 Stage 可配置 Agent、Skill、门控、依赖、输出物
 * - 导入/导出 YAML
 */

import { Component, createSignal, For, Show, onMount, createEffect } from 'solid-js';
import { ChevronDown, ChevronUp, Plus, Trash2, Download, Upload, GripVertical, Play, Pause } from 'lucide-solid';
import { useAppStore } from '../stores/app-store';
import { themeColors, chartColors } from '../utils/colors';
import type { WorkflowConfig, WorkflowStage } from '../types/settings';
import { defaultWorkflowConfig } from '../services/workflow-sync';
import { parsePipelineYaml, serializePipelineYaml } from '../services/pipeline-config';
import { pipelineToWorkflowConfig, workflowToPipelineConfig } from '../services/workflow-sync';
import { listAllAgents, type RegisteredAgent } from '../services/agent-registry';

// ─── 类型 ────────────────────────────────────────────────────

interface AgentOption {
  id: string;
  name: string;
  description: string;
}

interface SkillOption {
  name: string;
  description: string;
}

// ─── WorkflowEditor ─────────────────────────────────────────

const WorkflowEditor: Component = () => {
  const { actions, productStore } = useAppStore();

  // 状态
  const [config, setConfig] = createSignal<WorkflowConfig>({ ...defaultWorkflowConfig });
  const [expandedStageId, setExpandedStageId] = createSignal<string | null>(null);
  const [agents, setAgents] = createSignal<AgentOption[]>([]);
  const [skills, setSkills] = createSignal<SkillOption[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [saveMsg, setSaveMsg] = createSignal('');

  // 加载数据
  onMount(async () => {
    // 并行加载配置、Agent 列表、Skill 列表
    const [wfConfig, agentList, skillList] = await Promise.all([
      actions.loadWorkflowConfig(),
      listAllAgents('solo').catch(() => []),
      actions.listOpenworkSkills().catch(() => []),
    ]);
    setConfig(wfConfig);
    setAgents(agentList.map((a: RegisteredAgent) => ({
      id: a.opencodeAgentId || a.id,
      name: a.name || a.id,
      description: a.description || '',
    })));
    setSkills(skillList.map((s: { name: string; description?: string }) => ({
      name: s.name,
      description: s.description || '',
    })));
  });

  // 保存
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    const ok = await actions.saveWorkflowConfig(config());
    setSaving(false);
    setSaveMsg(ok ? '已保存' : '保存失败');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  // 全局配置修改
  const updateMode = (mode: 'supervised' | 'autonomous') => {
    setConfig((c) => ({ ...c, mode }));
  };
  const updateMaxRetries = (val: number) => {
    setConfig((c) => ({ ...c, maxRetries: Math.max(0, Math.min(10, val)) }));
  };

  // Stage 操作
  const updateStage = (id: string, partial: Partial<WorkflowStage>) => {
    setConfig((c) => ({
      ...c,
      stages: c.stages.map((s: WorkflowStage) => s.id === id ? { ...s, ...partial } : s),
    }));
  };

  const removeStage = (id: string) => {
    setConfig((c) => ({
      ...c,
      stages: c.stages.filter((s: WorkflowStage) => s.id !== id)
        // 清理被删除 stage 的依赖引用
        .map((s: WorkflowStage) => ({
          ...s,
          dependsOn: s.dependsOn.filter((d: string) => d !== id),
        })),
    }));
    if (expandedStageId() === id) setExpandedStageId(null);
  };

  const addStage = () => {
    const idx = config().stages.length + 1;
    const newStage: WorkflowStage = {
      id: `stage-${idx}`,
      name: `新阶段 ${idx}`,
      description: '',
      agent: '',
      skills: [],
      gate: 'auto',
      dependsOn: [],
      enabled: true,
    };
    setConfig((c) => ({ ...c, stages: [...c.stages, newStage] }));
    setExpandedStageId(newStage.id);
  };

  const moveStage = (id: string, direction: 'up' | 'down') => {
    setConfig((c) => {
      const stages = [...c.stages];
      const idx = stages.findIndex((s) => s.id === id);
      if (idx < 0) return c;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= stages.length) return c;
      [stages[idx], stages[target]] = [stages[target], stages[idx]];
      return { ...c, stages };
    });
  };

  // 导出 YAML
  const handleExport = () => {
    const pc = workflowToPipelineConfig(config());
    const yamlStr = serializePipelineYaml(pc);
    const blob = new Blob([yamlStr], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orchestrator.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导入 YAML
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const pc = parsePipelineYaml(text);
      if (pc) {
        setConfig(pipelineToWorkflowConfig(pc));
        setSaveMsg('已导入，请确认后保存');
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg('YAML 解析失败');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    };
    input.click();
  };

  return (
    <div class="space-y-4">
      {/* 顶部说明 */}
      <div
        class="p-3 rounded-lg text-xs"
        style={{
          background: themeColors.primaryBg,
          border: `1px solid ${themeColors.primaryBorder}`,
          color: chartColors.primary,
        }}
      >
        <strong>流程编排：</strong>配置研发交付流水线，每个阶段可指定执行的 Agent 和 Skill、门控策略及产出物。
        配置保存后对所有产品工作区生效。
      </div>

      {/* 全局配置栏 */}
      <div
        class="rounded-xl p-4 flex items-center gap-4 flex-wrap"
        style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium" style={{ color: themeColors.textSecondary }}>执行模式:</span>
          <select
            class="text-xs px-2 py-1 rounded"
            style={{ ...inputStyle(), 'min-width': '120px' }}
            value={config().mode}
            onChange={(e) => updateMode(e.currentTarget.value as 'supervised' | 'autonomous')}
          >
            <option value="supervised">supervised (人工审批)</option>
            <option value="autonomous">autonomous (全自动)</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium" style={{ color: themeColors.textSecondary }}>最大重试:</span>
          <input
            type="number"
            class="text-xs px-2 py-1 rounded w-16 text-center"
            style={inputStyle()}
            value={config().maxRetries}
            min={0}
            max={10}
            onInput={(e) => updateMaxRetries(parseInt(e.currentTarget.value) || 0)}
          />
        </div>
        <div class="flex-1" />
        <button
          class="text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
          onClick={handleImport}
        >
          <Upload size={12} /> 导入
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
          onClick={handleExport}
        >
          <Download size={12} /> 导出
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          style={{ background: chartColors.primary, color: '#fff', opacity: saving() ? 0.6 : 1 }}
          disabled={saving()}
          onClick={handleSave}
        >
          {saving() ? '保存中...' : '保存配置'}
        </button>
        <Show when={saveMsg()}>
          <span class="text-xs" style={{ color: saveMsg() === '已保存' ? chartColors.success : themeColors.warning }}>
            {saveMsg()}
          </span>
        </Show>
      </div>

      {/* Stage 列表 */}
      <div class="space-y-2">
        <For each={config().stages}>
          {(stage, idx) => (
            <StageCard
              stage={stage}
              index={idx()}
              totalCount={config().stages.length}
              isExpanded={expandedStageId() === stage.id}
              agents={agents()}
              skills={skills()}
              allStages={config().stages}
              onToggleExpand={() => setExpandedStageId(expandedStageId() === stage.id ? null : stage.id)}
              onUpdate={(partial) => updateStage(stage.id, partial)}
              onRemove={() => removeStage(stage.id)}
              onMoveUp={() => moveStage(stage.id, 'up')}
              onMoveDown={() => moveStage(stage.id, 'down')}
            />
          )}
        </For>
      </div>

      {/* 新增阶段按钮 */}
      <button
        class="w-full py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        style={{
          border: `2px dashed ${themeColors.border}`,
          color: themeColors.textMuted,
          background: 'transparent',
        }}
        onClick={addStage}
      >
        <Plus size={16} /> 新增阶段
      </button>
    </div>
  );
};

// ─── StageCard 子组件 ────────────────────────────────────────

const StageCard: Component<{
  stage: WorkflowStage;
  index: number;
  totalCount: number;
  isExpanded: boolean;
  agents: AgentOption[];
  skills: SkillOption[];
  allStages: WorkflowStage[];
  onToggleExpand: () => void;
  onUpdate: (partial: Partial<WorkflowStage>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = (props) => {
  const gateLabel = () => props.stage.gate === 'await-approval' ? '人工审批' : '自动通过';
  const gateColor = () => props.stage.gate === 'await-approval' ? themeColors.warning : chartColors.success;

  // Skill 标签删除
  const removeSkill = (skillName: string) => {
    props.onUpdate({ skills: props.stage.skills.filter((s) => s !== skillName) });
  };
  const addSkill = (skillName: string) => {
    if (!props.stage.skills.includes(skillName)) {
      props.onUpdate({ skills: [...props.stage.skills, skillName] });
    }
  };

  // 依赖操作
  const removeDep = (depId: string) => {
    props.onUpdate({ dependsOn: props.stage.dependsOn.filter((d) => d !== depId) });
  };
  const addDep = (depId: string) => {
    if (!props.stage.dependsOn.includes(depId) && depId !== props.stage.id) {
      props.onUpdate({ dependsOn: [...props.stage.dependsOn, depId] });
    }
  };

  // 输出物操作
  const updateOutput = (key: string, value: string) => {
    props.onUpdate({ output: { ...(props.stage.output || {}), [key]: value } });
  };
  const removeOutput = (key: string) => {
    const o = { ...(props.stage.output || {}) };
    delete o[key];
    props.onUpdate({ output: o });
  };
  const [newOutputKey, setNewOutputKey] = createSignal('');

  return (
    <div
      class="rounded-xl overflow-hidden transition-all"
      style={{
        background: themeColors.surface,
        border: `1px solid ${themeColors.border}`,
        'border-left': `3px solid ${props.stage.enabled ? chartColors.primary : themeColors.border}`,
        opacity: props.stage.enabled ? 1 : 0.5,
      }}
    >
      {/* 折叠态头部 */}
      <div
        class="p-4 flex items-center gap-3 cursor-pointer"
        onClick={props.onToggleExpand}
      >
        {/* 排序按钮 */}
        <div class="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            class="text-xs p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            disabled={props.index === 0}
            onClick={props.onMoveUp}
            title="上移"
          >
            <ChevronUp size={12} />
          </button>
          <button
            class="text-xs p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            disabled={props.index === props.totalCount - 1}
            onClick={props.onMoveDown}
            title="下移"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-semibold text-sm" style={{ color: themeColors.text }}>
              {props.index + 1}. {props.stage.name}
            </span>
            <span
              class="px-1.5 py-0.5 rounded text-xs"
              style={{ color: gateColor(), background: props.stage.gate === 'await-approval' ? themeColors.warningBg : themeColors.successBg }}
            >
              {gateLabel()}
            </span>
            <Show when={props.stage.agent}>
              <span class="text-xs px-1.5 py-0.5 rounded" style={{ background: themeColors.primaryBg, color: chartColors.primary }}>
                {props.stage.agent}
              </span>
            </Show>
          </div>
          <div class="text-xs truncate" style={{ color: themeColors.textMuted }}>
            {props.stage.description || '未设置描述'}
            {props.stage.skills.length > 0 && ` · Skills: ${props.stage.skills.join(', ')}`}
          </div>
        </div>

        {/* 启用开关 */}
        <div onClick={(e) => e.stopPropagation()}>
          <button
            class="w-10 h-5 rounded-full transition-colors relative"
            style={{ background: props.stage.enabled ? chartColors.primary : themeColors.border }}
            onClick={() => props.onUpdate({ enabled: !props.stage.enabled })}
            title={props.stage.enabled ? '已启用' : '已禁用'}
          >
            <div
              class="w-4 h-4 rounded-full absolute top-0.5 transition-all"
              style={{
                background: themeColors.surface,
                left: props.stage.enabled ? '21px' : '2px',
              }}
            />
          </button>
        </div>

        {/* 展开图标 */}
        {props.isExpanded ? <ChevronUp size={16} style={{ color: themeColors.textMuted }} /> : <ChevronDown size={16} style={{ color: themeColors.textMuted }} />}
      </div>

      {/* 展开态编辑区 */}
      <Show when={props.isExpanded}>
        <div class="px-4 pb-4 space-y-4 border-t" style={{ 'border-color': themeColors.border }}>
          {/* 基本信息 */}
          <div class="grid grid-cols-2 gap-3 pt-3">
            <div>
              <label class="text-xs font-medium block mb-1" style={{ color: themeColors.textSecondary }}>阶段 ID</label>
              <input
                class="text-xs px-2 py-1.5 rounded w-full"
                style={inputStyle()}
                value={props.stage.id}
                onInput={(e) => props.onUpdate({ id: e.currentTarget.value })}
              />
            </div>
            <div>
              <label class="text-xs font-medium block mb-1" style={{ color: themeColors.textSecondary }}>阶段名称</label>
              <input
                class="text-xs px-2 py-1.5 rounded w-full"
                style={inputStyle()}
                value={props.stage.name}
                onInput={(e) => props.onUpdate({ name: e.currentTarget.value })}
              />
            </div>
          </div>
          <div>
            <label class="text-xs font-medium block mb-1" style={{ color: themeColors.textSecondary }}>描述</label>
            <input
              class="text-xs px-2 py-1.5 rounded w-full"
              style={inputStyle()}
              value={props.stage.description}
              onInput={(e) => props.onUpdate({ description: e.currentTarget.value })}
              placeholder="阶段功能描述..."
            />
          </div>

          {/* 执行配置 */}
          <div class="pt-2">
            <div class="text-xs font-semibold mb-2" style={{ color: themeColors.text }}>执行配置</div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium block mb-1" style={{ color: themeColors.textSecondary }}>Agent</label>
                <select
                  class="text-xs px-2 py-1.5 rounded w-full"
                  style={inputStyle()}
                  value={props.stage.agent}
                  onChange={(e) => props.onUpdate({ agent: e.currentTarget.value })}
                >
                  <option value="">（无）</option>
                  <For each={props.agents}>
                    {(a) => <option value={a.id}>{a.name} ({a.id})</option>}
                  </For>
                </select>
              </div>
              <div class="flex items-end gap-2">
                <label class="text-xs flex items-center gap-1 py-1.5" style={{ color: themeColors.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={props.stage.parallel || false}
                    onChange={(e) => props.onUpdate({ parallel: e.currentTarget.checked })}
                  />
                  可并行执行
                </label>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label class="text-xs font-medium block mb-1" style={{ color: themeColors.textSecondary }}>Skills</label>
            <div class="flex flex-wrap gap-1 mb-1">
              <For each={props.stage.skills}>
                {(sk) => (
                  <span
                    class="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: themeColors.primaryBg, color: chartColors.primary }}
                  >
                    {sk}
                    <button class="hover:opacity-70" onClick={() => removeSkill(sk)}>&times;</button>
                  </span>
                )}
              </For>
            </div>
            <select
              class="text-xs px-2 py-1 rounded"
              style={inputStyle()}
              onChange={(e) => { addSkill(e.currentTarget.value); e.currentTarget.value = ''; }}
            >
              <option value="">+ 添加 Skill</option>
              <For each={props.skills.filter((s) => !props.stage.skills.includes(s.name))}>
                {(s) => <option value={s.name}>{s.name}</option>}
              </For>
            </select>
          </div>

          {/* 门控策略 */}
          <div>
            <div class="text-xs font-semibold mb-2" style={{ color: themeColors.text }}>门控策略</div>
            <div class="flex gap-4">
              <label class="text-xs flex items-center gap-1" style={{ color: themeColors.textSecondary }}>
                <input
                  type="radio"
                  name={`gate-${props.stage.id}`}
                  checked={props.stage.gate === 'await-approval'}
                  onChange={() => props.onUpdate({ gate: 'await-approval' })}
                />
                人工审批
              </label>
              <label class="text-xs flex items-center gap-1" style={{ color: themeColors.textSecondary }}>
                <input
                  type="radio"
                  name={`gate-${props.stage.id}`}
                  checked={props.stage.gate === 'auto'}
                  onChange={() => props.onUpdate({ gate: 'auto' })}
                />
                自动通过
              </label>
            </div>
          </div>

          {/* 依赖关系 */}
          <div>
            <div class="text-xs font-semibold mb-2" style={{ color: themeColors.text }}>依赖关系</div>
            <div class="flex flex-wrap gap-1 mb-1">
              <For each={props.stage.dependsOn}>
                {(dep) => {
                  const depStage = props.allStages.find((s) => s.id === dep);
                  return (
                    <span
                      class="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: themeColors.primaryBg, color: chartColors.primary }}
                    >
                      {depStage ? `${depStage.name} (${dep})` : dep}
                      <button class="hover:opacity-70" onClick={() => removeDep(dep)}>&times;</button>
                    </span>
                  );
                }}
              </For>
              <Show when={props.stage.dependsOn.length === 0}>
                <span class="text-xs" style={{ color: themeColors.textMuted }}>无前置依赖</span>
              </Show>
            </div>
            <select
              class="text-xs px-2 py-1 rounded"
              style={inputStyle()}
              onChange={(e) => { addDep(e.currentTarget.value); e.currentTarget.value = ''; }}
            >
              <option value="">+ 添加依赖</option>
              <For each={props.allStages.filter((s) => s.id !== props.stage.id && !props.stage.dependsOn.includes(s.id))}>
                {(s) => <option value={s.id}>{s.name} ({s.id})</option>}
              </For>
            </select>
          </div>

          {/* 输出物定义 */}
          <div>
            <div class="text-xs font-semibold mb-2" style={{ color: themeColors.text }}>输出物定义</div>
            <div class="space-y-1">
              <For each={Object.entries(props.stage.output || {})}>
                {([key, val]) => (
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: themeColors.primaryBg, color: chartColors.primary, 'min-width': '60px' }}>
                      {key}
                    </span>
                    <input
                      class="text-xs px-2 py-1 rounded flex-1"
                      style={inputStyle()}
                      value={val}
                      onInput={(e) => updateOutput(key, e.currentTarget.value)}
                    />
                    <button
                      class="text-xs p-1 rounded hover:bg-red-50"
                      style={{ color: themeColors.textMuted }}
                      onClick={() => removeOutput(key)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </For>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <input
                class="text-xs px-2 py-1 rounded w-24"
                style={inputStyle()}
                placeholder="key"
                value={newOutputKey()}
                onInput={(e) => setNewOutputKey(e.currentTarget.value)}
              />
              <button
                class="text-xs px-2 py-1 rounded"
                style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
                disabled={!newOutputKey()}
                onClick={() => {
                  if (newOutputKey()) {
                    updateOutput(newOutputKey(), '');
                    setNewOutputKey('');
                  }
                }}
              >
                + 新增输出物
              </button>
            </div>
          </div>

          {/* 删除按钮 */}
          <div class="flex justify-end pt-2">
            <button
              class="text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1"
              style={{ border: `1px solid ${themeColors.border}`, color: '#ef4444' }}
              onClick={props.onRemove}
            >
              <Trash2 size={12} /> 删除此阶段
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ─── 工具函数 ────────────────────────────────────────────────

const inputStyle = () => ({
  border: `1px solid ${themeColors.border}`,
  background: themeColors.surface,
  color: themeColors.text,
});

export default WorkflowEditor;
