/**
 * 快速 AI 任务对话框
 * 从知识文档发起 Autopilot 任务
 */
import { Component, createSignal, Show } from 'solid-js';
import type { KnowledgeEntry } from '../../services/knowledge-index';
import { themeColors, chartColors } from '../../utils/colors';

interface QuickAITaskDialogProps {
  entry: KnowledgeEntry;
  onConfirm: (prompt: string, entry: KnowledgeEntry) => void;
  onClose: () => void;
}

const PRESET_TASKS: Array<{ label: string; template: (title: string, type: string) => string }> = [
  { label: '生成下游文档', template: (t, type) => `基于 ${type}《${t}》，生成对应的下游文档` },
  { label: '审查文档质量', template: (t, type) => `审查 ${type}《${t}》的质量，找出不完整或模糊的地方` },
  { label: '提取关键假设', template: (t, type) => `从 ${type}《${t}》中提取核心假设和风险` },
  { label: '生成测试用例', template: (t, type) => `基于 ${type}《${t}》生成测试用例` },
];

export const QuickAITaskDialog: Component<QuickAITaskDialogProps> = (props) => {
  const [customPrompt, setCustomPrompt] = createSignal('');
  const docType = () => props.entry.docType ?? props.entry.category ?? '文档';

  const handlePreset = (template: (t: string, type: string) => string) => {
    props.onConfirm(template(props.entry.title, docType()), props.entry);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000,
    }} onClick={props.onClose}>
      <div
        style={{
          background: 'white', 'border-radius': '12px', padding: '20px', width: '400px',
          'box-shadow': '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ 'font-weight': 600, 'font-size': '15px', 'margin-bottom': '4px' }}>启动 Autopilot 任务</div>
        <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '16px' }}>
          基于《{props.entry.title}》
        </div>

        <div style={{ 'margin-bottom': '12px' }}>
          {PRESET_TASKS.map((t) => (
            <button
              style={{
                display: 'block', width: '100%', 'text-align': 'left', padding: '10px 12px',
                'margin-bottom': '6px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`,
                background: 'white', cursor: 'pointer', 'font-size': '13px', color: themeColors.text,
              }}
              onClick={() => handlePreset(t.template)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ 'border-top': `1px solid ${themeColors.border}`, 'padding-top': '12px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '6px' }}>自定义任务</div>
          <textarea
            value={customPrompt()}
            onInput={(e) => setCustomPrompt(e.currentTarget.value)}
            placeholder="描述你想让 AI 做什么..."
            style={{
              width: '100%', padding: '8px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`,
              'font-size': '13px', resize: 'vertical', 'min-height': '60px', 'box-sizing': 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', 'margin-top': '8px', 'justify-content': 'flex-end' }}>
            <button
              style={{ padding: '7px 14px', 'border-radius': '6px', border: `1px solid ${themeColors.border}`, background: 'white', cursor: 'pointer', 'font-size': '13px' }}
              onClick={props.onClose}
            >取消</button>
            <button
              style={{ padding: '7px 14px', 'border-radius': '6px', border: 'none', background: chartColors.primary, color: 'white', cursor: 'pointer', 'font-size': '13px' }}
              onClick={() => { if (customPrompt().trim()) props.onConfirm(customPrompt().trim(), props.entry); }}
              disabled={!customPrompt().trim()}
            >
              启动 ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickAITaskDialog;
