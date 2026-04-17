/**
 * Question Dialog
 *
 * 处理 Agent 向用户提问的 UI（当前 xingjing 缺失此功能）
 */

import { createSignal, For, Show } from 'solid-js';
import { X } from 'lucide-solid';
import type { PendingQuestion } from '../../../types';
import { themeColors } from '../../utils/colors';

export interface QuestionDialogProps {
  question: PendingQuestion;
  onReply: (requestId: string, answers: string[][]) => void;
  onReject: (requestId: string) => void;
}

export default function QuestionDialog(props: QuestionDialogProps) {
  const [answers, setAnswers] = createSignal<Record<number, Set<number>>>({});

  const handleOptionToggle = (questionIdx: number, optionIdx: number, multiSelect: boolean) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (!next[questionIdx]) next[questionIdx] = new Set();

      if (multiSelect) {
        if (next[questionIdx].has(optionIdx)) {
          next[questionIdx].delete(optionIdx);
        } else {
          next[questionIdx].add(optionIdx);
        }
      } else {
        next[questionIdx] = new Set([optionIdx]);
      }

      return next;
    });
  };

  const handleSubmit = () => {
    const formattedAnswers: string[][] = [];
    props.question.questions?.forEach((q, qIdx) => {
      const selected = answers()[qIdx];
      if (selected && selected.size > 0) {
        const selectedLabels = Array.from(selected).map((optIdx) => q.options?.[optIdx]?.label ?? '');
        formattedAnswers.push(selectedLabels);
      } else {
        formattedAnswers.push([]);
      }
    });

    props.onReply(props.question.id, formattedAnswers);
  };

  const canSubmit = () => {
    return props.question.questions?.every((q, idx) => {
      const selected = answers()[idx];
      return selected && selected.size > 0;
    }) ?? false;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'z-index': 1000,
      }}
      onClick={() => props.onReject(props.question.id)}
    >
      <div
        style={{
          background: themeColors.surface,
          'border-radius': '8px',
          padding: '24px',
          'max-width': '600px',
          width: '90%',
          'max-height': '80vh',
          overflow: 'auto',
          'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px' }}>
          <h3 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.textPrimary }}>
            Agent 需要您的回答
          </h3>
          <button
            onClick={() => props.onReject(props.question.id)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              'align-items': 'center',
              color: themeColors.textMuted,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Questions */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px' }}>
          <For each={props.question.questions}>
            {(q, qIdx) => (
              <div>
                <div style={{ 'font-size': '14px', 'font-weight': 500, color: themeColors.textPrimary, 'margin-bottom': '8px' }}>
                  {q.question}
                  <Show when={q.multiple}>
                    <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': '8px' }}>
                      (可多选)
                    </span>
                  </Show>
                </div>

                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                  <For each={q.options}>
                    {(option, optIdx) => {
                      const isSelected = () => answers()[qIdx()]?.has(optIdx()) ?? false;

                      return (
                        <button
                          onClick={() => handleOptionToggle(qIdx(), optIdx(), q.multiple ?? false)}
                          style={{
                            display: 'flex',
                            'align-items': 'flex-start',
                            gap: '12px',
                            padding: '12px',
                            'border-radius': '6px',
                            border: `1px solid ${isSelected() ? themeColors.primary : themeColors.border}`,
                            background: isSelected() ? themeColors.primaryBg : 'transparent',
                            cursor: 'pointer',
                            'text-align': 'left',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              'border-radius': q.multiple ? '4px' : '50%',
                              border: `2px solid ${isSelected() ? themeColors.primary : themeColors.border}`,
                              background: isSelected() ? themeColors.primary : 'transparent',
                              'flex-shrink': 0,
                              display: 'flex',
                              'align-items': 'center',
                              'justify-content': 'center',
                              color: 'white',
                              'font-size': '12px',
                            }}
                          >
                            <Show when={isSelected()}>✓</Show>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ 'font-size': '14px', 'font-weight': 500, color: themeColors.textPrimary }}>
                              {option.label}
                            </div>
                            <Show when={option.description}>
                              <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '4px' }}>
                                {option.description}
                              </div>
                            </Show>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', 'margin-top': '24px', 'justify-content': 'flex-end' }}>
          <button
            onClick={() => props.onReject(props.question.id)}
            style={{
              padding: '8px 16px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent',
              color: themeColors.textPrimary,
              'font-size': '14px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit()}
            style={{
              padding: '8px 16px',
              'border-radius': '6px',
              border: 'none',
              background: canSubmit() ? themeColors.primary : themeColors.border,
              color: 'white',
              'font-size': '14px',
              cursor: canSubmit() ? 'pointer' : 'not-allowed',
              opacity: canSubmit() ? 1 : 0.5,
            }}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
