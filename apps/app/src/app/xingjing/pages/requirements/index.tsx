import { Component, createSignal, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAppStore } from '../../stores/app-store';
import { Plus, Star, Zap, MessageSquare } from 'lucide-solid';
import type { PRD } from '../../mock/prd';

const statusConfig = {
  draft: { label: '草稿', borderColor: 'themeColors.border', tagColor: 'themeColors.border' },
  reviewing: { label: '评审中', borderColor: 'themeColors.primaryBorder', tagColor: 'chartColors.primary' },
  approved: { label: '已批准', borderColor: 'themeColors.successBorder', tagColor: 'chartColors.success' },
};

const RequirementWorkshop: Component = () => {
  const navigate = useNavigate();
  const { state, actions } = useAppStore();
  const [newPrdModal, setNewPrdModal] = createSignal(false);
  const [aiGenerating, setAiGenerating] = createSignal(false);
  const [newPrdTitle, setNewPrdTitle] = createSignal('');
  const [newPrdDesc, setNewPrdDesc] = createSignal('');
  const [draggedPrdId, setDraggedPrdId] = createSignal<string | null>(null);

  const columns: { status: PRD['status']; title: string }[] = [
    { status: 'draft', title: '草稿' },
    { status: 'reviewing', title: '评审中' },
    { status: 'approved', title: '已批准' },
  ];

  const handleAiGenerate = () => {
    if (!newPrdDesc().trim()) {
      alert('请先输入需求描述');
      return;
    }
    setAiGenerating(true);
    actions.callAgent({
      systemPrompt: '你是一个产品经理助手，负责根据需求描述生成简洁的 PRD 标题（不超过30字）和结构化需求摘要。请直接输出标题，不要包含引号或其他前缀。',
      userPrompt: `请根据以下需求描述，生成一个简洁的 PRD 标题：\n\n${newPrdDesc()}`,
      title: 'prd-title-gen',
      onText: (text) => {
        // 取第一行作为标题
        const firstLine = text.split('\n')[0].trim().replace(/^#\s*/, '');
        if (firstLine) setNewPrdTitle(firstLine);
      },
      onDone: (fullText) => {
        const firstLine = fullText.split('\n')[0].trim().replace(/^#\s*/, '');
        setNewPrdTitle(firstLine || newPrdDesc().slice(0, 30) + '...');
        setAiGenerating(false);
      },
      onError: (_err) => {
        // 降级：截取描述前30字作为标题
        setNewPrdTitle(newPrdDesc().slice(0, 30) + '...');
        setAiGenerating(false);
      },
    }).catch(() => {
      setNewPrdTitle(newPrdDesc().slice(0, 30) + '...');
      setAiGenerating(false);
    });
  };

  const handleCreatePrd = () => {
    const id = `PRD-${String(state.prds.length + 1).padStart(3, '0')}`;
    actions.addPrd({
      id,
      title: newPrdTitle() || '新需求',
      owner: state.currentUser,
      status: 'draft',
      aiScore: 0,
      reviewComments: 0,
      createdAt: new Date().toISOString().split('T')[0],
      description: newPrdDesc(),
      userStories: [],
    });
    setNewPrdModal(false);
    setNewPrdTitle('');
    setNewPrdDesc('');
  };

  const handleDragStart = (prdId: string) => {
    setDraggedPrdId(prdId);
  };

  const handleDrop = (targetStatus: PRD['status']) => {
    const prdId = draggedPrdId();
    if (prdId) {
      actions.updatePrdStatus(prdId, targetStatus);
      setDraggedPrdId(null);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <h4 style={{ margin: '0', 'font-size': '16px', 'font-weight': 600 }}>需求看板</h4>
        <button
          style={{ background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', padding: '8px 16px', cursor: 'pointer', 'font-size': '14px', display: 'inline-flex', 'align-items': 'center', gap: '6px' }}
          onClick={() => setNewPrdModal(true)}
        >
          <Plus size={16} />
          新建需求
        </button>
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px' }}>
        <For each={columns}>
          {(col) => {
            const items = () => state.prds.filter((p) => p.status === col.status);
            return (
              <div
                style={{ 'background': 'themeColors.hover', 'border-radius': '8px', padding: '12px', 'min-height': '600px', border: '1px solid themeColors.border' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.status)}
              >
                <div style={{ 'font-weight': 600, 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'font-size': '14px' }}>
                  <span>{col.title}</span>
                  <span style={{ 'font-size': '12px', 'font-weight': 400, color: 'themeColors.textMuted' }}>({items().length})</span>
                </div>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                  <For each={items()}>
                    {(prd) => (
                      <div
                        style={{ background: 'themeColors.surface', 'border-radius': '6px', padding: '12px', 'box-shadow': '0 1px 2px rgba(0,0,0,0.05)', cursor: 'grab', border: `1px solid ${statusConfig[prd.status].borderColor}` }}
                        draggable
                        onDragStart={() => handleDragStart(prd.id)}
                        onClick={() => navigate(`/requirements/edit/${prd.id}`)}
                      >
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '8px' }}>
                          <span style={{ 'font-size': '12px', 'font-weight': 600, color: 'themeColors.textSecondary' }}>{prd.id}</span>
                          <span style={{ display: 'inline-flex', 'align-items': 'center', padding: '2px 8px', 'border-radius': '4px', 'font-size': '11px', border: `1px solid ${statusConfig[prd.status].tagColor}`, color: statusConfig[prd.status].tagColor }}>
                            {statusConfig[prd.status].label}
                          </span>
                        </div>
                        <div style={{ 'font-size': '13px', 'font-weight': 500, 'margin-bottom': '8px', color: 'themeColors.text' }}>{prd.title}</div>
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '8px' }}>
                          <span style={{ 'font-size': '12px', color: 'themeColors.textMuted' }}>{prd.owner}</span>
                          <Show when={prd.aiScore > 0}>
                            <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
                              <Star size={12} style={{ color: 'chartColors.warning', fill: 'chartColors.warning' }} />
                              <span style={{ 'font-size': '12px', color: 'chartColors.warning' }}>{prd.aiScore}</span>
                            </div>
                          </Show>
                        </div>
                        <Show when={prd.reviewComments > 0}>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', 'font-size': '12px', color: 'themeColors.textMuted', 'margin-bottom': '8px' }}>
                            <MessageSquare size={12} />
                            评审意见 {prd.reviewComments} 条
                          </div>
                        </Show>
                        <Show when={prd.status === 'draft'}>
                          <button
                            style={{ 'font-size': '12px', color: 'chartColors.primary', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'inline-flex', 'align-items': 'center', gap: '4px', 'margin-top': '4px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/requirements/edit/${prd.id}`);
                            }}
                          >
                            <Zap size={12} />
                            AI 生成初稿
                          </button>
                        </Show>
                        <Show when={prd.status === 'approved' && prd.sddStatus}>
                          <div style={{ 'font-size': '12px', color: 'themeColors.textMuted', 'margin-top': '4px' }}>
                            SDD {prd.sddStatus} {prd.devProgress && `开发 ${prd.devProgress}`}
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* New PRD Modal */}
      <Show when={newPrdModal()}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: 'themeColors.surface', 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '600px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600 }}>新建需求</h3>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '8px', color: 'themeColors.textSecondary' }}>需求标题</label>
              <input
                type="text"
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit' }}
                placeholder="输入需求标题"
                value={newPrdTitle()}
                onInput={(e) => setNewPrdTitle(e.target.value)}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '8px', color: 'themeColors.textSecondary' }}>需求描述</label>
              <textarea
                style={{ width: '100%', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'resize': 'vertical' }}
                rows={4}
                placeholder="描述需求的背景、目标和关键功能..."
                value={newPrdDesc()}
                onInput={(e) => setNewPrdDesc(e.target.value)}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <button
                style={{ background: 'chartColors.purple', color: 'white', border: 'none', 'border-radius': '6px', padding: '8px 16px', cursor: 'pointer', 'font-size': '14px', display: 'inline-flex', 'align-items': 'center', gap: '6px', opacity: aiGenerating() ? 0.6 : 1 }}
                onClick={handleAiGenerate}
                disabled={aiGenerating()}
              >
                <Zap size={14} />
                <span>{aiGenerating() ? 'AI 生成中...' : 'AI 生成初稿'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button
                style={{ background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => setNewPrdModal(false)}
              >
                取消
              </button>
              <button
                style={{ background: 'chartColors.primary', color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={handleCreatePrd}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default RequirementWorkshop;
