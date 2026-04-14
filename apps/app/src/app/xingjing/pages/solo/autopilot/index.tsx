import { createSignal, Show, For, onCleanup, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { FileText, PlayCircle, CheckCircle, Clock, Zap, Loader2, Settings, Maximize2 } from 'lucide-solid';
import CreateProductModal from '../../../components/product/new-product-modal';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { soloWorkflowSteps, soloSampleGoals } from '../../../mock/autopilot';
import { modelOptions } from '../../../mock/settings';
import { loadProjectSettings } from '../../../services/file-store';
import {
  SOLO_AGENTS,
  runOrchestratedAutopilot,
  runDirectAgent,
  parseMention,
  type AutopilotAgent,
  type DispatchItem,
  type AgentExecutionStatus,
} from '../../../services/autopilot-executor';
import MentionInput from '../../../components/autopilot/mention-input';
import ArtifactWorkspace, { type ArtifactItem } from '../../../components/autopilot/artifact-workspace';
import ExpandableOverlay from '../../../components/autopilot/expandable-overlay';

interface AgentStatus {
  [key: string]: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
}

interface AgentTasks {
  [key: string]: string;
}

interface AgentDone {
  [key: string]: number;
}

const statusBadge: Record<string, { status: string; text: string }> = {
  idle:     { status: 'default',    text: '待命' },
  thinking: { status: 'processing', text: '思考中' },
  working:  { status: 'processing', text: '执行中' },
  done:     { status: 'success',    text: '完成' },
  waiting:  { status: 'warning',    text: '等待中' },
};

const agentNameToId: Record<string, string> = {
  'AI产品搭档': 'product-brain',
  'AI工程搭档': 'eng-brain',
  'AI增长搭档': 'growth-brain',
  'AI运营搭档': 'ops-brain',
};

const SoloBrainCard = (props: {
  agent: AutopilotAgent;
  status: 'idle' | 'thinking' | 'working' | 'done' | 'waiting';
  currentTask?: string;
  doneToday: number;
}) => {
  const badge = statusBadge[props.status];
  const isActive = props.status === 'thinking' || props.status === 'working';
  const isDone = props.status === 'done';

  return (
    <div
      style={{
        'border-radius': '8px',
        padding: '10px 12px',
        border: `1px solid ${isActive ? props.agent.borderColor : isDone ? themeColors.successBorder : themeColors.border}`,
        background: isActive ? props.agent.bgColor : isDone ? themeColors.successBg : themeColors.hover,
        transition: 'all 0.4s ease',
        'box-shadow': isActive ? `0 0 12px ${props.agent.borderColor}88` : 'none',
        'text-align': 'center',
      }}
    >
      <div style={{
        'font-size': '22px',
        'margin-bottom': '4px',
        filter: props.status === 'idle' ? 'grayscale(100%) opacity(0.4)' : 'none',
        transition: 'filter 0.3s',
      }}>
        {props.agent.emoji}
      </div>

      <div style={{ margin: '0 0 2px', 'font-size': '13px', 'font-weight': '600', color: isActive ? props.agent.color : undefined }}>
        {props.agent.name}
      </div>
      <div style={{ 'margin-bottom': '4px', 'font-size': '11px' }}>
        {badge.text}
      </div>

      <div style={{ 'min-height': '22px', 'font-size': '11px' }}>
        <Show when={props.currentTask && isActive}>
          <div style={{ color: props.agent.color }}>
            {props.currentTask}
          </div>
        </Show>
        <Show when={isDone}>
          <div style={{ color: chartColors.success }}>
            已完成
          </div>
        </Show>
        {/* 描述始终展示，在非 active/done 状态时显示 */}
        <Show when={!isActive && !isDone}>
          <div style={{ color: themeColors.textMuted }}>
            {props.agent.description}
          </div>
        </Show>
      </div>

      <Show when={props.doneToday > 0}>
        <div style={{ 'margin-top': '4px' }}>
          <div style={{
            display: 'inline-flex',
            'align-items': 'center',
            padding: '2px 8px',
            'border-radius': '4px',
            'font-size': '11px',
            border: `1px solid ${themeColors.border}`,
            background: props.agent.color + '20',
            color: props.agent.color,
          }}>
            今日已完成 {props.doneToday}
          </div>
        </div>
      </Show>

      <div style={{ 'margin-top': '4px', display: 'flex', 'flex-wrap': 'wrap', gap: '3px', 'justify-content': 'center' }}>
        <For each={props.agent.skills.slice(0, 2)}>
          {(skill) => (
            <div style={{
              display: 'inline-flex',
              'align-items': 'center',
              padding: '2px 8px',
              'border-radius': '4px',
              'font-size': '10px',
              border: `1px solid ${themeColors.border}`,
              margin: '0',
            }}>
              {skill}
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

type RunState = 'idle' | 'running' | 'done';

const SoloAutopilot = () => {
  const { state, productStore, actions } = useAppStore();
  const navigate = useNavigate();
  const soloProducts = () => state.products.filter((p: { mode: string }) => p.mode === 'solo');

  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  const [runState, setRunState] = createSignal<RunState>('idle');
  const [agentStatuses, setAgentStatuses] = createSignal<AgentStatus>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle']))
  );
  const [agentTasks, setAgentTasks] = createSignal<AgentTasks>({});
  const [agentDone, setAgentDone] = createSignal<AgentDone>(
    Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 0]))
  );
  const [visibleSteps, setVisibleSteps] = createSignal<typeof soloWorkflowSteps>([]);
  const [artifacts, setArtifacts] = createSignal<typeof soloWorkflowSteps>([]);
  const [progress, setProgress] = createSignal(0);
  const [orchestratorText, setOrchestratorText] = createSignal('');
  const [dispatchPlan, setDispatchPlan] = createSignal<DispatchItem[]>([]);
  const [agentStreamTexts, setAgentStreamTexts] = createSignal<Record<string, string>>({});
  const [agentExecStatuses, setAgentExecStatuses] = createSignal<Record<string, AgentExecutionStatus>>({});
  const [agentError, setAgentError] = createSignal<string | null>(null);
  const [artifactsData, setArtifactsData] = createSignal<ArtifactItem[]>([]);
  const [showExpandOverlay, setShowExpandOverlay] = createSignal(false);

  // ─── 模型选择器状态 ───────────────────────────────────────────────────────────
  // per-provider 已配置的 API Keys（从 settings.yaml 读取）
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({});
  // 当前会话选用的模型 ID（默认取 state.llmConfig.modelID）
  const [sessionModelId, setSessionModelId] = createSignal<string>(
    state.llmConfig.modelID ?? 'deepseek-chat'
  );

  // 已填写 API Key 的模型列表（排除 custom）
  const configuredModels = () =>
    modelOptions.filter(
      (opt) =>
        opt.providerID !== 'custom' &&
        (providerKeys()[opt.providerID]?.trim().length ?? 0) > 0,
    );

  // 反查当前会话选用模型的完整配置，传给 callAgent
  const getSessionModel = () => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return undefined;
    if (!providerKeys()[opt.providerID]) return undefined;
    return { providerID: opt.providerID, modelID: opt.modelID };
  };

  // onMount：加载持久化的 providerKeys，合并 store 内存最新值
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        const keys: Record<string, string> = { ...(settings.llmProviderKeys ?? {}) };
        const cur = state.llmConfig;
        if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;
        setProviderKeys(keys);
        // 若当前 sessionModelId 不在已配置列表，切换到第一个已配置模型
        const configured = modelOptions.filter(
          (opt) => opt.providerID !== 'custom' && (keys[opt.providerID]?.trim().length ?? 0) > 0,
        );
        if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) {
          setSessionModelId(configured[0].modelID);
        }
      } catch { /* 静默降级 */ }
    }
  });

  let timelineRef: HTMLDivElement | undefined;
  const timersRef: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timersRef.forEach(clearTimeout);
    timersRef.length = 0;
  };

  const reset = () => {
    clearTimers();
    setRunState('idle');
    setAgentStatuses(Object.fromEntries(SOLO_AGENTS.map((a) => [a.id, 'idle' as const])));
    setAgentTasks({});
    setVisibleSteps([]);
    setArtifacts([]);
    setArtifactsData([]);
    setProgress(0);
    setOrchestratorText('');
    setDispatchPlan([]);
    setAgentStreamTexts({});
    setAgentExecStatuses({});
  };

  // ─── 解析流式文本为 Timeline 步骤 ───
  const updateFromStream = (text: string) => {
    const parts = text.split(/^## /m);
    const steps: typeof soloWorkflowSteps = [];
    const seenAgents: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const nlIdx = part.indexOf('\n');
      const header = (nlIdx >= 0 ? part.slice(0, nlIdx) : part).trim();
      const body = nlIdx >= 0 ? part.slice(nlIdx + 1).trim() : '';

      let agentId = '';
      for (const [name, id] of Object.entries(agentNameToId)) {
        if (header.includes(name)) { agentId = id; break; }
      }
      if (!agentId) continue;
      if (!seenAgents.includes(agentId)) seenAgents.push(agentId);

      const agent = SOLO_AGENTS.find(a => a.id === agentId);
      const lines = body.split('\n').filter(l => l.trim());
      const action = (lines[0] || '执行中...').replace(/^[-\d.*]+\s*/, '').slice(0, 80);
      const outputLines = lines.slice(1);

      const artIdx = outputLines.findIndex(l => /^###\s/.test(l) || l.includes('产出物'));
      let artifact: { title: string; content: string } | undefined;
      let output: string;

      if (artIdx >= 0) {
        output = outputLines.slice(0, artIdx).map(l => l.trim()).join('\n') || action;
        const artTitle = outputLines[artIdx].replace(/^###\s*/, '').trim() || `${agent?.name || ''}产出`;
        const artContent = outputLines.slice(artIdx + 1).join('\n').trim();
        if (artContent) artifact = { title: artTitle, content: artContent.slice(0, 500) };
      } else {
        output = outputLines.slice(0, 3).join('\n') || '执行中...';
      }

      steps.push({
        id: `real-${i}`, agentId, agentName: agent?.name || header,
        action, output, durationMs: 0, artifact,
      });
    }

    if (steps.length > 0) {
      setVisibleSteps(steps);
      const artSteps = steps.filter(s => s.artifact);
      setArtifacts(artSteps);
      // 同步构造 ArtifactItem 列表
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setArtifactsData(artSteps.map(s => {
        const ag = SOLO_AGENTS.find(a => a.id === s.agentId);
        return {
          id: `artifact-${s.agentId}-stream`,
          agentId: s.agentId,
          agentName: ag?.name ?? s.agentName,
          agentEmoji: ag?.emoji ?? '',
          title: s.artifact!.title,
          content: s.artifact!.content,
          createdAt: timeStr,
        };
      }));
      const statuses: Record<string, string> = {};
      const tasks: Record<string, string> = {};
      SOLO_AGENTS.forEach(a => { statuses[a.id] = 'thinking'; tasks[a.id] = ''; });
      seenAgents.forEach((id, i) => {
        if (i < seenAgents.length - 1) {
          statuses[id] = 'done'; tasks[id] = '';
        } else {
          statuses[id] = 'working';
          const lastStep = steps.filter(s => s.agentId === id).pop();
          tasks[id] = lastStep?.action || '执行中...';
        }
      });
      setAgentStatuses(statuses as AgentStatus);
      setAgentTasks(tasks);
      setProgress(Math.round((seenAgents.length / SOLO_AGENTS.length) * 80));
    } else if (text.trim()) {
      setAgentStatuses(prev => ({ ...prev, 'product-brain': 'working' }));
      setAgentTasks(prev => ({ ...prev, 'product-brain': '分析目标中...' }));
      setProgress(5);
    }
  };

  // ─── handleStart: 两阶段 Orchestrator 调度 ───
  const handleStart = async () => {
    if (!goal().trim()) return;
    reset();
    setAgentError(null);
    setRunState('running');

    const workDir = productStore.activeProduct()?.workDir;
    const model = getSessionModel();  // 使用会话内用户选择的模型
    const { targetAgent, cleanText } = parseMention(goal(), SOLO_AGENTS);

    if (targetAgent) {
      // @mention 直接调用模式
      setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'thinking' }));
      await runDirectAgent(targetAgent, cleanText, {
        workDir,
        model,
        callAgentFn: (callOpts) => actions.callAgent(callOpts),
        onStatus: (status) => {
          const legacyMap: Record<AgentExecutionStatus, 'idle' | 'thinking' | 'working' | 'done' | 'waiting'> = {
            idle: 'idle', pending: 'waiting', thinking: 'thinking',
            working: 'working', done: 'done', error: 'done',
          };
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: legacyMap[status] }));
        },
        onStream: (text) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: text }));
          setProgress(50);
        },
        onDone: (fullText) => {
          setAgentStreamTexts((prev) => ({ ...prev, [targetAgent.id]: fullText }));
          setAgentDone((prev) => ({ ...prev, [targetAgent.id]: (prev[targetAgent.id] || 0) + 1 }));
          setProgress(100);
          setRunState('done');
        },
        onError: (err) => {
          console.warn('[solo-autopilot] @mention direct agent failed:', err);
          setAgentStatuses((prev) => ({ ...prev, [targetAgent.id]: 'idle' }));
          setAgentError(`调用 ${targetAgent.name} 失败：${err}`);
          setRunState('idle');
        },
      });
      return;
    }

    // Orchestrated 两阶段模式
    await runOrchestratedAutopilot(cleanText, {
      availableAgents: SOLO_AGENTS,
      workDir,
      model,
      callAgentFn: (callOpts) => actions.callAgent(callOpts),
      onOrchestrating: (text) => {
        setOrchestratorText(text);
        setProgress(10);
      },
      onOrchestratorDone: (plan) => {
        setDispatchPlan(plan);
        const statuses: Record<string, AgentExecutionStatus> = {};
        plan.forEach(({ agentId }) => { statuses[agentId] = 'pending'; });
        setAgentExecStatuses(statuses);
        setProgress(20);
      },
      onAgentStatus: (agentId, status) => {
        setAgentExecStatuses((prev) => ({ ...prev, [agentId]: status }));
        const legacyMap: Record<AgentExecutionStatus, 'idle' | 'thinking' | 'working' | 'done' | 'waiting'> = {
          idle: 'idle', pending: 'waiting', thinking: 'thinking',
          working: 'working', done: 'done', error: 'done',
        };
        setAgentStatuses((prev) => ({ ...prev, [agentId]: legacyMap[status] }));
        if (status === 'done') {
          setAgentDone((prev) => ({ ...prev, [agentId]: (prev[agentId] || 0) + 1 }));
        }
      },
      onAgentStream: (agentId, text) => {
        setAgentStreamTexts((prev) => ({ ...prev, [agentId]: text }));
        const doneCount = Object.values(agentExecStatuses()).filter(
          (s) => s === 'done',
        ).length;
        setProgress(
          20 + Math.round((doneCount / Math.max(dispatchPlan().length, 1)) * 70),
        );
      },
      onDone: (results) => {
        // 将 Agent 结果解析为 visibleSteps 供现有 UI 展示
        const steps: typeof soloWorkflowSteps = [];
        const newArtifactsData: ArtifactItem[] = [];
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        Object.entries(results).forEach(([agentId, text]) => {
          const agent = SOLO_AGENTS.find((a) => a.id === agentId);
          const actionMatch = text.match(/##\s+执行动作\s*\n([^\n]+)/);
          const artMatch = text.match(/###\s+产出物[：:]\s*(.+)\n([\s\S]+)/);
          if (agent) {
            steps.push({
              id: `real-${agentId}`,
              agentId,
              agentName: agent.name,
              action: actionMatch?.[1]?.trim() ?? '执行完成',
              output: text.slice(0, 200),
              durationMs: 0,
              artifact: artMatch
                ? { title: artMatch[1].trim(), content: artMatch[2].trim().slice(0, 500) }
                : undefined,
            });
            if (artMatch) {
              newArtifactsData.push({
                id: `artifact-${agentId}-${Date.now()}`,
                agentId,
                agentName: agent.name,
                agentEmoji: agent.emoji,
                title: artMatch[1].trim(),
                content: artMatch[2].trim(),
                createdAt: timeStr,
              });
            }
          }
        });
        setVisibleSteps(steps);
        setArtifacts(steps.filter((s) => s.artifact));
        setArtifactsData(newArtifactsData);
        setProgress(100);
        setRunState('done');
      },
      onError: (err) => {
        setAgentError(`编排执行失败：${err}`);
        setRunState('idle');
      },
    });
  };

  onCleanup(() => clearTimers());

  const doneAgents = () => Object.values(agentStatuses()).filter((s) => s === 'done').length;

  return (
    <div style={{ display: 'grid', 'grid-template-columns': '1fr 420px', gap: '16px', 'align-items': 'start', 'max-width': '1400px', margin: '0 auto' }}>
      {/* 左列：信息横幅 + 目标输入 + Agent卡片 + 执行流 */}
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>

        {/* 空状态横幅 */}
        <Show when={soloProducts().length === 0}>
          <div style={{
            background: `linear-gradient(135deg, ${themeColors.successBg} 0%, ${themeColors.successBg} 100%)`,
            border: `1px dashed ${themeColors.successBorder}`,
            'text-align': 'center',
            'border-radius': '8px',
            padding: '16px',
          }}>
            <div style={{ 'font-size': '48px', color: chartColors.success, 'margin-bottom': '12px', display: 'block' }}>
              🤖
            </div>
            <div style={{ margin: '0 0 8px', color: themeColors.success, 'font-weight': '600', 'font-size': '16px' }}>开始你的独立产品之旅</div>
            <div style={{ 'font-size': '14px', color: themeColors.textSecondary, 'margin-bottom': '16px' }}>
              还没有创建项目？先建一个，让 AI 虚拟团队为你服务
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              style={{
                background: chartColors.success,
                color: 'white',
                border: 'none',
                'border-radius': '6px',
                padding: '8px 24px',
                'font-size': '14px',
                cursor: 'pointer',
              }}
            >
              创建我的第一个产品
            </button>
          </div>
        </Show>

      <div style={{
        'margin-bottom': '20px',
        'border-radius': '8px',
        padding: '8px 14px',
        background: themeColors.primaryBg,
        border: `1px solid ${themeColors.primaryBorder}`,
        'font-size': '12px',
      }}>
        <strong style={{ color: chartColors.primary }}>独立版 · 自动驾驶</strong>
        <span style={{ color: themeColors.textSecondary, 'margin-left': '8px' }}>
          你就是所有角色，AI 直接替你执行，4 个虚拟角色脑并行调度，无审批流程，适合快速验证和迭代
        </span>
      </div>

      <div style={{
        border: `1px solid ${themeColors.border}`,
        'border-radius': '8px',
        padding: '16px',
        background: themeColors.surface,
        'margin-bottom': '20px',
        'border-color': runState() !== 'idle' ? themeColors.successBorder : undefined,
      }}>
        <div style={{
          'font-weight': '600',
          'margin-bottom': '12px',
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
        }}>
          <Zap size={16} style={{ color: chartColors.success }} />
          告诉 AI 你想做什么
        </div>
        <div style={{ 'margin-bottom': '12px' }}>
          <MentionInput
            value={goal()}
            onChange={setGoal}
            disabled={runState() === 'running'}
            placeholder="描述你的目标，或输入 @ 直接调用某个 Agent，例如：实现「段落一键重写」功能..."
            agents={SOLO_AGENTS}
          />
        </div>
        <div style={{ 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'flex-wrap': 'wrap' }}>
          {/* 左：模型选择器 */}
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
            <Show
              when={configuredModels().length > 0}
              fallback={
                <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>暂无已配置模型</span>
              }
            >
              <select
                value={sessionModelId()}
                onChange={(e) => setSessionModelId(e.currentTarget.value)}
                disabled={runState() === 'running'}
                style={{
                  'font-size': '12px',
                  padding: '4px 8px',
                  'border-radius': '6px',
                  border: `1px solid ${themeColors.border}`,
                  background: themeColors.surface,
                  color: themeColors.text,
                  cursor: runState() === 'running' ? 'not-allowed' : 'pointer',
                  outline: 'none',
                }}
              >
                <For each={configuredModels()}>
                  {(opt) => <option value={opt.modelID}>{opt.label}</option>}
                </For>
              </select>
            </Show>
            <button
              onClick={() => navigate('/solo/settings?tab=llm')}
              style={{
                'font-size': '12px',
                color: chartColors.success,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                display: 'flex',
                'align-items': 'center',
                gap: '3px',
                'text-decoration': 'underline',
              }}
            >
              <Settings size={12} />去配置更多模型
            </button>
          </div>

          {/* 右：启动按鈕 */}
          <button
            onClick={handleStart}
            disabled={runState() === 'running' || !goal().trim()}
            style={{
              background: chartColors.success,
              color: 'white',
              border: 'none',
              'border-radius': '6px',
              padding: '8px 16px',
              cursor: runState() === 'running' || !goal().trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              opacity: runState() === 'running' || !goal().trim() ? 0.6 : 1,
            }}
          >
            {runState() === 'running' ? '执行中…' : '启动'}
          </button>
        </div>

        {/* Agent 调用错误提示 */}
        <Show when={agentError() !== null}>
          <div style={{
            'margin-top': '10px',
            padding: '10px 14px',
            'border-radius': '6px',
            'font-size': '13px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            color: '#cf1322',
            display: 'flex',
            'align-items': 'flex-start',
            gap: '8px',
          }}>
            <span style={{ 'flex-shrink': '0', 'margin-top': '1px' }}>⚠️</span>
            <div style={{ flex: '1' }}>
              <div style={{ 'font-weight': '600', 'margin-bottom': '4px' }}>AI 调用失败</div>
              <div>{agentError()}</div>
              <div style={{ 'margin-top': '6px', 'font-size': '12px', color: '#8c1a11' }}>
                请前往「设置 → 大模型配置」检查 API Key 是否已保存，或尝试「会话测试」按钮验证连通性。
              </div>
            </div>
            <button
              onClick={() => setAgentError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', padding: '0', 'flex-shrink': '0' }}
            >✕</button>
          </div>
        </Show>

        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'flex-wrap': 'wrap' }}>
          <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>快速示例：</span>
          <For each={soloSampleGoals}>
            {(g) => (
              <div
                onClick={() => {
                  if (runState() !== 'running') setGoal(g);
                }}
                style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  padding: '2px 12px',
                  'border-radius': '12px',
                  'font-size': '12px',
                  border: `1px solid ${chartColors.success}`,
                  background: chartColors.success,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {g.slice(0, 24)}…
              </div>
            )}
          </For>
          <Show when={runState() !== 'idle'}>
            <button
              onClick={reset}
              disabled={runState() === 'running'}
              style={{
                'margin-left': 'auto',
                background: themeColors.surface,
                border: `1px solid ${themeColors.border}`,
                'border-radius': '6px',
                padding: '4px 12px',
                'font-size': '12px',
                cursor: runState() === 'running' ? 'not-allowed' : 'pointer',
                opacity: runState() === 'running' ? 0.6 : 1,
              }}
            >
              重置
            </button>
          </Show>
        </div>

        <Show when={runState() !== 'idle'}>
          <div style={{ 'margin-top': '12px' }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                {runState() === 'done'
                  ? `全部完成 · 4 个角色脑并行调度`
                  : `并行调度中... ${doneAgents()}/4 个脑已完成`}
              </span>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{progress()}%</span>
            </div>
            <div style={{
              background: themeColors.border,
              'border-radius': '4px',
              height: '6px',
            }}>
              <div style={{
                background: runState() === 'done' ? chartColors.success : chartColors.primary,
                height: '100%',
                'border-radius': '4px',
                width: `${progress()}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </Show>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px', 'margin-bottom': '20px' }}>
        <For each={SOLO_AGENTS}>
          {(agent) => (
            <SoloBrainCard
              agent={agent}
              status={agentStatuses()[agent.id] as any}
              currentTask={agentTasks()[agent.id]}
              doneToday={agentDone()[agent.id]}
            />
          )}
        </For>
      </div>

        {/* 执行流（含展开按钮） */}
        <div style={{
          border: `1px solid ${themeColors.border}`,
          'border-radius': '8px',
          padding: '16px',
          background: themeColors.surface,
        }}>
          <div style={{
            'font-weight': '600',
            'margin-bottom': '12px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
          }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <Clock size={16} />
              执行流（并行 · 无审批）
            </div>
            <Show when={dispatchPlan().length > 0 || visibleSteps().length > 0}>
              <button
                onClick={() => setShowExpandOverlay(true)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '4px',
                  background: 'none',
                  border: `1px solid ${themeColors.border}`,
                  'border-radius': '4px',
                  padding: '3px 8px',
                  'font-size': '11px',
                  cursor: 'pointer',
                  color: themeColors.textSecondary,
                }}
              >
                <Maximize2 size={12} />
                展开
              </button>
            </Show>
          </div>
          <Show
            when={visibleSteps().length === 0 && dispatchPlan().length === 0}
            fallback={
              <div ref={timelineRef} style={{
                'max-height': '380px',
                'overflow-y': 'auto',
                'padding-right': '4px',
              }}>
                {/* Phase 1: Orchestrator */}
                <Show when={orchestratorText() && dispatchPlan().length === 0}>
                  <div style={{
                    padding: '10px 12px',
                    background: themeColors.primaryBg,
                    border: `1px solid ${themeColors.primaryBorder}`,
                    'border-radius': '6px',
                    'margin-bottom': '8px',
                  }}>
                    <div style={{ 'font-size': '12px', 'font-weight': 600, color: chartColors.primary, 'margin-bottom': '4px' }}>
                      Orchestrator 规划中...
                    </div>
                    <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'white-space': 'pre-wrap', 'max-height': '100px', 'overflow-y': 'auto' }}>
                      {orchestratorText()}
                    </div>
                  </div>
                </Show>

                {/* Phase 2: Agent 流式输出 */}
                <For each={dispatchPlan()}>
                  {(item) => {
                    const agent = SOLO_AGENTS.find((a) => a.id === item.agentId);
                    const text = () => agentStreamTexts()[item.agentId] ?? '';
                    const execStatus = () => agentExecStatuses()[item.agentId] ?? 'pending';
                    const isStreaming = () => execStatus() === 'thinking' || execStatus() === 'working';
                    if (!agent) return null;
                    return (
                      <div style={{ 'padding-bottom': '10px', display: 'flex', gap: '10px' }}>
                        <div style={{
                          width: '24px', height: '24px', 'border-radius': '50%', 'flex-shrink': '0',
                          background: execStatus() === 'done' ? agent.color : 'transparent',
                          border: isStreaming() ? `2px solid ${agent.color}` : `2px solid ${themeColors.border}`,
                          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                          color: themeColors.surface, 'font-size': '14px',
                        }}>
                          <Show when={isStreaming()}>
                            <Loader2 size={12} style={{ color: agent.color, animation: 'spin 1s linear infinite' }} />
                          </Show>
                          <Show when={!isStreaming() && execStatus() === 'done'}>
                            {agent.emoji}
                          </Show>
                        </div>
                        <div style={{ flex: '1' }}>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
                            <div style={{
                              display: 'inline-flex', 'align-items': 'center',
                              padding: '2px 8px', 'border-radius': '4px', 'font-size': '11px',
                              border: `1px solid ${themeColors.border}`,
                              background: agent.color + '20', color: agent.color, margin: '0',
                            }}>
                              {agent.name}
                            </div>
                            <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>
                              {item.task.slice(0, 40)}...
                            </span>
                          </div>
                          <Show when={text()}>
                            <div style={{
                              'font-size': '11px', color: themeColors.textMuted,
                              'white-space': 'pre-wrap', 'line-height': '1.6',
                              'max-height': '180px', 'overflow-y': 'auto',
                              background: themeColors.successBg, padding: '4px 8px', 'border-radius': '4px',
                            }}>
                              {text()}
                            </div>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>

                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                  <For each={visibleSteps()}>
                    {(step, idx) => {
                      const agent = SOLO_AGENTS.find((a) => a.id === step.agentId)!;
                      const isLast = idx() === visibleSteps().length - 1 && runState() === 'running';
                      return (
                        <div style={{
                          display: 'flex',
                          gap: '12px',
                          'padding-bottom': '4px',
                        }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            'border-radius': '50%',
                            background: agent.color,
                            display: 'flex',
                            'align-items': 'center',
                            'justify-content': 'center',
                            color: themeColors.surface,
                            'flex-shrink': '0',
                            'font-size': '14px',
                          }}>
                            {isLast ? '⟳' : agent.emoji}
                          </div>
                          <div style={{ flex: '1' }}>
                            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '2px' }}>
                              <div style={{
                                display: 'inline-flex',
                                'align-items': 'center',
                                padding: '2px 8px',
                                'border-radius': '4px',
                                'font-size': '11px',
                                border: `1px solid ${themeColors.border}`,
                                background: agent.color + '20',
                                color: agent.color,
                                margin: '0',
                              }}>
                                {agent.name}
                              </div>
                              <span style={{ 'font-size': '12px', 'font-weight': '600' }}>{step.action}</span>
                            </div>
                            <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>{step.output}</div>
                            <Show when={step.artifact}>
                              <div style={{
                                'margin-top': '4px',
                                'font-size': '11px',
                                padding: '4px 8px',
                                background: themeColors.successBg,
                                'border-radius': '4px',
                                color: chartColors.success,
                              }}>
                                ✓ {step.artifact?.title}
                              </div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            }
          >
            <div style={{
              'text-align': 'center',
              padding: '40px 0',
              color: themeColors.textMuted,
            }}>
              <PlayCircle size={36} style={{ 'margin-bottom': '10px', display: 'block' }} />
              <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>输入目标并启动，执行过程将在此实时显示</div>
            </div>
          </Show>

          <Show when={runState() === 'done'}>
            <div style={{
              'margin-top': '12px',
              padding: '10px 14px',
              background: themeColors.successBg,
              border: `1px solid ${themeColors.successBorder}`,
              'border-radius': '8px',
            }}>
              <CheckCircle size={16} style={{ color: chartColors.success, 'margin-right': '8px' }} />
              <strong style={{ color: chartColors.success, 'font-size': '13px' }}>全自动完成</strong>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': '8px' }}>
                4 个虚拟角色并行执行，{soloWorkflowSteps.length} 步完成，节省约 6 小时
              </span>
            </div>
          </Show>
        </div>

      </div>

      {/* 右列：产出物工作区 */}
      <div style={{ position: 'sticky', top: '0' }}>
        <ArtifactWorkspace artifacts={artifactsData()} />
      </div>

      {/* 展开浮层 */}
      <Show when={showExpandOverlay()}>
        <ExpandableOverlay
          show={showExpandOverlay()}
          onClose={() => setShowExpandOverlay(false)}
          title="执行流详情"
          dispatchPlan={dispatchPlan()}
          agentStreamTexts={agentStreamTexts()}
          agentExecStatuses={agentExecStatuses()}
          agents={SOLO_AGENTS}
        />
      </Show>

      <CreateProductModal
        open={createModalOpen()}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  );
};

export default SoloAutopilot;
