/**
 * 个人笔记创建 Modal
 * 支持选择分类、输入标题/内容/标签，保存到本地知识库
 */
import { Component, createSignal, For, Show } from 'solid-js';
import type { SoloKnowledgeCategory, SoloKnowledgeItem } from '../../services/file-store';
import { themeColors, chartColors } from '../../utils/colors';

interface CreateNoteModalProps {
  initialCategory: SoloKnowledgeCategory;
  onSave: (item: SoloKnowledgeItem) => void;
  onClose: () => void;
}

const CATEGORIES: Array<{ id: SoloKnowledgeCategory; label: string; icon: string }> = [
  { id: 'pitfall', label: '踩坑记录', icon: '🕳' },
  { id: 'user-insight', label: '用户洞察', icon: '👁' },
  { id: 'tech-note', label: '技术笔记', icon: '💻' },
];

export const CreateNoteModal: Component<CreateNoteModalProps> = (props) => {
  const [category, setCategory] = createSignal<SoloKnowledgeCategory>(props.initialCategory);
  const [title, setTitle] = createSignal('');
  const [content, setContent] = createSignal('');
  const [tagsInput, setTagsInput] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const canSave = () => title().trim().length > 0 && content().trim().length > 0 && !saving();

  const handleSave = () => {
    if (!canSave()) return;
    setSaving(true);
    const id = `note-${Date.now().toString(36)}`;
    const tags = tagsInput().split(/[,，]/).map(t => t.trim()).filter(Boolean);
    props.onSave({
      id,
      category: category(),
      title: title().trim(),
      content: content().trim(),
      tags,
      date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000,
      }}
      onClick={props.onClose}
    >
      <div
        style={{
          background: 'white', 'border-radius': '12px', padding: '20px', width: '460px',
          'box-shadow': '0 20px 60px rgba(0,0,0,0.2)', 'max-height': '80vh', overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div style={{ 'font-weight': 600, 'font-size': '15px', 'margin-bottom': '16px' }}>新建个人笔记</div>

        {/* 分类选择 */}
        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '6px' }}>分类</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <For each={CATEGORIES}>
              {(cat) => (
                <button
                  onClick={() => setCategory(cat.id)}
                  style={{
                    padding: '6px 12px', 'border-radius': '8px', cursor: 'pointer',
                    'font-size': '12px', 'font-weight': category() === cat.id ? 600 : 400,
                    border: category() === cat.id ? `2px solid ${chartColors.primary}` : `1px solid ${themeColors.border}`,
                    background: category() === cat.id ? themeColors.primaryBg : 'white',
                    color: category() === cat.id ? chartColors.primary : themeColors.text,
                  }}
                >
                  {cat.icon} {cat.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* 标题输入 */}
        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '6px' }}>标题</div>
          <input
            type="text"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="输入笔记标题..."
            style={{
              width: '100%', padding: '8px 10px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`, 'font-size': '13px',
              outline: 'none', 'box-sizing': 'border-box',
            }}
          />
        </div>

        {/* 内容输入 */}
        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '6px' }}>内容（支持 Markdown）</div>
          <textarea
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
            placeholder="记录你的发现、洞察或技术笔记..."
            style={{
              width: '100%', padding: '8px 10px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`, 'font-size': '13px',
              resize: 'vertical', 'min-height': '120px', 'box-sizing': 'border-box',
              'line-height': '1.6',
            }}
          />
        </div>

        {/* 标签输入 */}
        <div style={{ 'margin-bottom': '16px' }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '6px' }}>标签（逗号分隔）</div>
          <input
            type="text"
            value={tagsInput()}
            onInput={(e) => setTagsInput(e.currentTarget.value)}
            placeholder="例：solidjs, 路由, 性能"
            style={{
              width: '100%', padding: '8px 10px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`, 'font-size': '13px',
              outline: 'none', 'box-sizing': 'border-box',
            }}
          />
        </div>

        {/* 按钮区 */}
        <div style={{ display: 'flex', gap: '8px', 'justify-content': 'flex-end' }}>
          <button
            style={{
              padding: '7px 14px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`, background: 'white',
              cursor: 'pointer', 'font-size': '13px', color: themeColors.text,
            }}
            onClick={props.onClose}
          >取消</button>
          <button
            style={{
              padding: '7px 14px', 'border-radius': '6px', border: 'none',
              background: canSave() ? chartColors.primary : '#d1d5db',
              color: 'white', cursor: canSave() ? 'pointer' : 'not-allowed',
              'font-size': '13px', 'font-weight': 500,
            }}
            onClick={handleSave}
            disabled={!canSave()}
          >
            {saving() ? '保存中...' : '保存笔记'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateNoteModal;
