import { Component, createSignal, For, Show } from 'solid-js';
import type { SoloRequirementOutput, SoloProductFeature } from '../../services/file-store';
import type { TaskDraft } from '../../services/requirement-dev-bridge';
import { themeColors, chartColors } from '../../utils/colors';

export interface PushToDevModalProps {
  requirement: SoloRequirementOutput;
  features: SoloProductFeature[];
  onConfirm: (tasks: TaskDraft[], sprintId?: string) => void;
  onCancel: () => void;
  onDecompose?: (onStream: (text: string) => void) => Promise<TaskDraft[]>;
}

const PushToDevModal: Component<PushToDevModalProps> = (props) => {
  const [mode, setMode] = createSignal<'ai' | 'manual'>('ai');
  const [tasks, setTasks] = createSignal<TaskDraft[]>([]);
  const [decomposing, setDecomposing] = createSignal(false);
  const [decomposeOutput, setDecomposeOutput] = createSignal('');
  const [sprintChoice, setSprintChoice] = createSignal<'current' | 'next' | 'backlog'>('current');

  // Manual task add
  const [newTitle, setNewTitle] = createSignal('');
  const [newEst, setNewEst] = createSignal('1天');

  const featureName = () => {
    if (!props.requirement.linkedFeatureId) return null;
    const feat = props.features.find((f) => f.id === props.requirement.linkedFeatureId);
    return feat ? (feat.title ?? feat.name) : props.requirement.linkedFeatureId;
  };

  const handleDecompose = async () => {
    if (!props.onDecompose) return;
    setDecomposing(true);
    setDecomposeOutput('');
    try {
      const result = await props.onDecompose((text) => {
        setDecomposeOutput((prev) => prev + text);
      });
      setTasks(result);
    } catch {
      setDecomposeOutput('AI 拆解失败，请手动填写任务');
    } finally {
      setDecomposing(false);
    }
  };

  const handleAddManualTask = () => {
    if (!newTitle().trim()) return;
    setTasks((prev) => [...prev, {
      title: newTitle().trim(),
      type: 'dev' as const,
      est: newEst(),
      dod: ['Code Review 通过', '单元测试通过'],
    }]);
    setNewTitle('');
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const sprintId = sprintChoice() === 'backlog' ? undefined : sprintChoice();
    props.onConfirm(tasks(), sprintId);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, 'z-index': 1000,
      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
      background: 'rgba(0,0,0,0.4)',
    }} onClick={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <div style={{
        background: themeColors.surface, 'border-radius': '16px', padding: '24px',
        width: '560px', 'max-height': '80vh', overflow: 'auto',
        border: `1px solid ${themeColors.border}`,
        'box-shadow': '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{ 'font-size': '16px', 'font-weight': 600, color: themeColors.text, 'margin-bottom': '16px' }}>
          🚀 推送至研发
        </div>

        {/* Requirement info */}
        <div style={{ padding: '12px', background: themeColors.hover, 'border-radius': '8px', 'margin-bottom': '16px' }}>
          <div style={{ 'font-weight': 500, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>
            {props.requirement.title}
          </div>
          <div style={{ 'font-size': '12px', color: themeColors.textMuted, display: 'flex', gap: '12px' }}>
            <span>优先级: {props.requirement.priority}</span>
            <Show when={featureName()}>
              <span>功能: 📦 {featureName()}</span>
            </Show>
          </div>
        </div>

        {/* Mode selection */}
        <div style={{ 'margin-bottom': '16px' }}>
          <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>任务拆解方式：</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }}>
              <input type="radio" checked={mode() === 'ai'} onChange={() => setMode('ai')} />
              AI 自动拆解
            </label>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }}>
              <input type="radio" checked={mode() === 'manual'} onChange={() => setMode('manual')} />
              手动填写
            </label>
          </div>
        </div>

        {/* Sprint choice */}
        <div style={{ 'margin-bottom': '16px' }}>
          <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>加入 Sprint：</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }}>
              <input type="radio" checked={sprintChoice() === 'current'} onChange={() => setSprintChoice('current')} />
              当前 Sprint
            </label>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }}>
              <input type="radio" checked={sprintChoice() === 'next'} onChange={() => setSprintChoice('next')} />
              下个 Sprint
            </label>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer', 'font-size': '13px', color: themeColors.text }}>
              <input type="radio" checked={sprintChoice() === 'backlog'} onChange={() => setSprintChoice('backlog')} />
              仅 Backlog
            </label>
          </div>
        </div>

        {/* AI decompose */}
        <Show when={mode() === 'ai'}>
          <div style={{ 'margin-bottom': '12px' }}>
            <button
              style={{
                padding: '6px 16px', 'font-size': '13px', 'border-radius': '6px',
                border: `1px solid ${chartColors.primary}`, background: themeColors.primaryBg,
                color: chartColors.primary, cursor: decomposing() ? 'not-allowed' : 'pointer',
                opacity: decomposing() ? 0.6 : 1,
              }}
              onClick={handleDecompose}
              disabled={decomposing()}
            >
              {decomposing() ? '⟳ AI 拆解中...' : '🤖 开始 AI 拆解'}
            </button>
          </div>
          <Show when={decomposeOutput()}>
            <div style={{
              padding: '8px 12px', background: themeColors.hover, 'border-radius': '6px',
              'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '12px',
              'max-height': '100px', overflow: 'auto', 'white-space': 'pre-wrap',
            }}>
              {decomposeOutput()}
            </div>
          </Show>
        </Show>

        {/* Manual add */}
        <Show when={mode() === 'manual'}>
          <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '12px' }}>
            <input
              placeholder="任务标题"
              value={newTitle()}
              onInput={(e) => setNewTitle(e.currentTarget.value)}
              style={{ flex: 1, padding: '6px 10px', 'font-size': '13px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
            />
            <input
              value={newEst()}
              onInput={(e) => setNewEst(e.currentTarget.value)}
              style={{ width: '60px', padding: '6px 10px', 'font-size': '13px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: themeColors.surface, color: themeColors.text }}
            />
            <button
              onClick={handleAddManualTask}
              style={{ padding: '6px 12px', 'font-size': '13px', 'border-radius': '6px', border: `1px solid ${chartColors.primary}`, background: chartColors.primary, color: 'white', cursor: 'pointer' }}
            >
              + 添加
            </button>
          </div>
        </Show>

        {/* Task list */}
        <Show when={tasks().length > 0}>
          <div style={{ 'margin-bottom': '16px' }}>
            <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>
              任务列表 ({tasks().length} 个)：
            </div>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
              <For each={tasks()}>
                {(task, i) => (
                  <div style={{
                    display: 'flex', 'align-items': 'center', gap: '8px',
                    padding: '8px 12px', background: themeColors.hover, 'border-radius': '8px',
                  }}>
                    <span style={{ 'font-size': '13px', color: themeColors.text, flex: 1 }}>{task.title}</span>
                    <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>[{task.type}]</span>
                    <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>{task.est}</span>
                    <button
                      onClick={() => handleRemoveTask(i())}
                      style={{ background: 'none', border: 'none', color: themeColors.textMuted, cursor: 'pointer', 'font-size': '14px', padding: '2px' }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Footer */}
        <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '16px' }}>
          <button
            onClick={props.onCancel}
            style={{ padding: '8px 20px', 'font-size': '13px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, background: 'transparent', color: themeColors.textSecondary, cursor: 'pointer' }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={tasks().length === 0}
            style={{
              padding: '8px 20px', 'font-size': '13px', 'border-radius': '8px',
              border: 'none', background: tasks().length > 0 ? chartColors.primary : themeColors.hover,
              color: tasks().length > 0 ? 'white' : themeColors.textMuted,
              cursor: tasks().length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            🚀 确认推送
          </button>
        </div>
      </div>
    </div>
  );
};

export default PushToDevModal;
