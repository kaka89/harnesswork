import { Component, createSignal, For, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { ArrowLeft, CheckCircle, AlertTriangle, Check, X, Zap } from 'lucide-solid';
import { useAppStore } from '../../stores/app-store';

const PRSubmit: Component = () => {
  const params = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { state, actions } = useAppStore();

  const task = () => state.tasks.find((t) => t.id === params.taskId);

  const [checklist, setChecklist] = createSignal([
    { key: 'sdd',       label: '代码逻辑符合 SDD 和 CONTRACT 规格', checked: true },
    { key: 'javadoc',   label: '所有 public/protected 方法有 Javadoc', checked: true },
    { key: 'constant',  label: '无 hardcoded 常量', checked: true },
    { key: 'log',       label: '无敏感信息在日志中', checked: true },
    { key: 'exception', label: '异常处理完整', checked: false },
    { key: 'test',      label: '单元测试通过: mvn test', checked: true },
    { key: 'coverage',  label: `覆盖率（≥80%阈值）`, checked: true },
  ]);

  const allChecked = () => checklist().every((c) => c.checked);
  const uncheckedCount = () => checklist().filter((c) => !c.checked).length;

  const handleToggle = (key: string) => {
    setChecklist((prev) => prev.map((c) => (c.key === key ? { ...c, checked: !c.checked } : c)));
  };

  const handleSubmitPR = () => {
    const t = task();
    if (!t) return;
    actions.updateTaskStatus(t.id, 'in-review');
    navigate('/dev');
  };

  return (
    <Show when={task()} fallback={<div style={{ 'text-align': 'center', padding: '32px', color: 'themeColors.border' }}>TASK 未找到</div>}>
      <div style={{ 'max-width': '800px', margin: '0 auto' }}>
        <h2 style={{ 'font-size': '16px', 'font-weight': 600, color: 'themeColors.text', 'margin-bottom': '16px', 'margin-top': '0', display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <button
            style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', 'align-items': 'center' }}
            onClick={() => navigate('/dev')}
          >
            <ArrowLeft size={16} style={{ color: 'themeColors.textSecondary' }} />
          </button>
          提交 Pull Request — {task()!.id}
        </h2>

        {/* PR title + associations */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
          <div style={{ 'margin-bottom': '12px' }}>
            <label style={{ 'font-size': '12px', color: 'themeColors.textMuted', display: 'block', 'margin-bottom': '4px' }}>标题：</label>
            <input
              style={{ width: '100%', padding: '8px 12px', border: '1px solid themeColors.border', 'border-radius': '6px', 'font-size': '13px', outline: 'none' }}
              value={`feat(gl-batch): ${task()!.title} [${task()!.id}]`}
            />
            <span style={{ 'font-size': '11px', color: 'themeColors.border', display: 'block', 'margin-top': '4px' }}>（自动填充）</span>
          </div>
          <div>
            <span style={{ 'font-size': '12px', color: 'themeColors.textMuted' }}>关联：</span>
            <For each={[task()!.id, 'CONTRACT-001', 'SDD-001']}>
              {(tag) => (
                <span style={{ display: 'inline-block', padding: '4px 10px', background: 'themeColors.primaryBg', color: 'themeColors.primary', 'border-radius': '4px', 'font-size': '12px', 'margin-left': '6px' }}>{tag}</span>
              )}
            </For>
          </div>
        </div>

        {/* PR Checklist */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
          <h3 style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.text', 'margin-bottom': '12px' }}>PR Checklist（自检）</h3>
          <div style={{ background: 'themeColors.backgroundSecondary', 'border-radius': '6px', padding: '16px' }}>
            <For each={checklist()}>
              {(item) => (
                <div style={{ 'margin-bottom': '8px' }}>
                  <label style={{ display: 'flex', 'align-items': 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(item.key)}
                      style={{ 'margin-top': '4px', cursor: 'pointer' }}
                    />
                    <span style={{ 'font-size': '13px', color: item.checked ? 'themeColors.success' : 'themeColors.textMuted' }}>
                      {item.checked ? '✅' : '⬜'} {item.label}
                    </span>
                  </label>
                  <Show when={item.key === 'exception' && !item.checked}>
                    <div style={{ 'font-size': '11px', color: 'themeColors.border', 'margin-left': '24px', 'margin-top': '4px' }}>
                      dev-agent 提示：checkVoucherBalance 方法缺少异常处理
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={!allChecked()}>
            <div style={{ 'margin-top': '12px', padding: '12px', background: 'themeColors.surfacebe6', border: '1px solid themeColors.warningBorder', 'border-radius': '6px', display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', color: 'themeColors.warning' }}>
              <AlertTriangle size={14} /> 有 {uncheckedCount()} 项未完成，建议修复后再提交
            </div>
          </Show>
        </div>

        {/* Change summary */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
          <h3 style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.text', 'margin-bottom': '8px' }}>变更摘要（AI 自动生成）</h3>
          <p style={{ 'font-size': '12px', color: 'themeColors.text', 'line-height': '1.6', margin: 0 }}>
            "实现 VoucherBatchService 的核心批量导入逻辑，包含：
            Excel 解析、逐行校验（借贷平衡/科目存在/账期）、
            批量入库（100条/批）、错误收集、VoucherPosted 事件发布"
          </p>
        </div>

        {/* CI pre-check */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <Zap size={16} style={{ color: 'themeColors.success' }} />
            <span style={{ 'font-size': '13px', color: 'themeColors.text' }}>CI 预检（本地）：已通过 pre-commit hooks</span>
            <span style={{ padding: '4px 10px', background: 'themeColors.successBg', color: 'themeColors.success', 'border-radius': '4px', 'font-size': '11px' }}>通过</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
          <button
            style={{ padding: '8px 16px', border: '1px solid themeColors.border', background: 'white', color: 'themeColors.textSecondary', 'border-radius': '6px', 'font-size': '13px', cursor: 'pointer' }}
            onClick={() => navigate('/dev')}
          >
            取消
          </button>
          <Show when={allChecked()}>
            <button
              style={{ padding: '8px 16px', background: 'themeColors.primary', color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '13px', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '6px' }}
              onClick={handleSubmitPR}
            >
              <Check size={14} /> 提交 PR
            </button>
          </Show>
          <Show when={!allChecked()}>
            <button
              style={{ padding: '8px 16px', background: 'themeColors.border', color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '13px', cursor: 'not-allowed' }}
            >
              先修复再提交
            </button>
            <button
              style={{ padding: '8px 16px', background: 'themeColors.error', color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '13px', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '6px' }}
              onClick={handleSubmitPR}
            >
              <AlertTriangle size={14} /> 强制提交
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default PRSubmit;
