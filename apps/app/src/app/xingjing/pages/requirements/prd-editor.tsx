import { createSignal, createMemo, For, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { useAppStore } from '../../stores/app-store';
import { Save, Eye, Send, CheckCircle, AlertTriangle } from 'lucide-solid';

const PRDEditor = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, actions } = useAppStore();

  const prd = createMemo(() => state.prds.find((p) => p.id === params.id));
  const [score, setScore] = createSignal(prd()?.aiScore || 0);
  const [bgContent, setBgContent] = createSignal(prd()?.description || '');
  const [nfrContent, setNfrContent] = createSignal(prd()?.nfr || '');

  if (!prd()) {
    return <div style={{ padding: '16px', 'font-size': '14px' }}>PRD 未找到</div>;
  }

  const handleSubmitReview = () => {
    actions.updatePrdStatus(prd()!.id, 'reviewing');
    navigate('/requirements');
  };

  const handleAiReview = () => {
    setScore(Math.min(10, score() + 0.5));
  };

  const treeData = [
    { title: '背景与目标', key: 'bg', icon: <CheckCircle size={14} style={{ color: 'themeColors.success' }} /> },
    { title: '用户画像', key: 'persona', icon: <CheckCircle size={14} style={{ color: 'themeColors.success' }} /> },
    { title: '用户故事 + 验收标准', key: 'stories', icon: <CheckCircle size={14} style={{ color: 'themeColors.success' }} /> },
    { title: 'NFR', key: 'nfr', icon: <CheckCircle size={14} style={{ color: 'themeColors.success' }} /> },
    {
      title: '影响分析',
      key: 'impact',
      icon: (prd()?.impactApps?.length ?? 0) > 0 ? (
        <CheckCircle size={14} style={{ color: 'themeColors.success' }} />
      ) : (
        <AlertTriangle size={14} style={{ color: 'themeColors.warning' }} />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px' }}>
        <h4 style={{ margin: '0', 'font-size': '16px', 'font-weight': 600 }}>
          编辑 {prd()!.id}: {prd()!.title}
        </h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', cursor: 'pointer', 'font-size': '14px' }}>
            <Save size={14} />
            保存
          </button>
          <button style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', cursor: 'pointer', 'font-size': '14px' }}>
            <Eye size={14} />
            预览
          </button>
          <button
            onClick={handleAiReview}
            style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', cursor: 'pointer', 'font-size': '14px' }}
          >
            AI 审阅
          </button>
          <Show when={prd()!.status === 'draft'}>
            <button
              onClick={handleSubmitReview}
              style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', background: 'themeColors.primary', color: 'white', border: 'none', 'border-radius': '6px', cursor: 'pointer', 'font-size': '14px' }}
            >
              提交评审
            </button>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'grid', 'grid-template-columns': '20% 1fr', gap: '16px' }}>
        {/* Left Sidebar */}
        <div>
          {/* Document Structure */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '12px', background: 'themeColors.surface', 'margin-bottom': '12px' }}>
            <div style={{ 'font-weight': 600, 'margin-bottom': '12px', 'font-size': '14px' }}>文档结构</div>
            <div style={{ 'font-size': '13px' }}>
              <For each={treeData}>
                {(item) => (
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '8px', 'padding': '4px 0' }}>
                    <span>{item.icon}</span>
                    <span>{item.title}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* AI Suggestions */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '12px', background: 'themeColors.surface', 'margin-bottom': '12px' }}>
            <div style={{ 'font-weight': 600, 'margin-bottom': '12px', 'font-size': '14px' }}>AI 建议</div>
            <Show when={!prd()?.impactApps || prd()!.impactApps!.length === 0}>
              <div style={{ padding: '10px', background: 'themeColors.surfacebe6', border: '1px solid themeColors.warningBorder', 'border-radius': '4px', 'font-size': '12px', color: 'themeColors.warningDark' }}>
                <div style={{ 'font-weight': 600, 'margin-bottom': '4px' }}>影响分析未完善</div>
                <div>建议填写关联应用</div>
              </div>
            </Show>
          </div>

          {/* Document Score */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '12px', background: 'themeColors.surface' }}>
            <div style={{ 'font-weight': 600, 'margin-bottom': '12px', 'font-size': '14px' }}>文档评分</div>
            <div style={{ 'text-align': 'center' }}>
              <div style={{ width: '80px', height: '80px', margin: '0 auto 8px', 'border-radius': '50%', background: 'themeColors.backgroundSecondary', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '24px', 'font-weight': 700 }}>
                {(score() * 10).toFixed(1)}
              </div>
              <div style={{ 'font-size': '12px', color: 'themeColors.textMuted' }}>目标: ≥ 8.0</div>
            </div>
          </div>
        </div>

        {/* Main Editor */}
        <div>
          {/* Background & Goals */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface', 'margin-bottom': '16px' }}>
            <h5 style={{ margin: '0 0 12px', 'font-size': '14px', 'font-weight': 600 }}>一、背景与目标</h5>
            <textarea
              value={bgContent()}
              onInput={(e) => setBgContent(e.target.value)}
              style={{
                width: '100%',
                'min-height': '100px',
                'border': '1px solid themeColors.border',
                'border-radius': '6px',
                padding: '8px 12px',
                'font-size': '14px',
                'font-family': 'inherit',
                'resize': 'vertical',
              }}
            />
          </div>

          {/* User Stories */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface', 'margin-bottom': '16px' }}>
            <h5 style={{ margin: '0 0 12px', 'font-size': '14px', 'font-weight': 600 }}>二、用户故事 + 验收标准</h5>
            <Show when={prd()!.userStories.length > 0}>
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                <For each={prd()!.userStories}>
                  {(us) => (
                    <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '6px', padding: '12px', background: 'themeColors.backgroundSecondary' }}>
                      <div style={{ 'font-weight': 600, 'font-size': '13px', 'margin-bottom': '8px' }}>
                        {us.id}: {us.content}
                      </div>
                      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}>
                        <For each={us.acceptanceCriteria}>
                          {(ac, idx) => (
                            <span style={{ display: 'inline-block', padding: '2px 8px', 'background': 'themeColors.primaryBg', border: '1px solid themeColors.primaryLight', 'border-radius': '4px', 'font-size': '12px', color: 'themeColors.primary' }}>
                              AC-{String(idx() + 1).padStart(3, '0')}: {ac}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={prd()!.userStories.length === 0}>
              <div style={{ 'font-size': '12px', color: 'themeColors.textMuted', 'text-align': 'center', padding: '24px 0' }}>暂无用户故事</div>
            </Show>
          </div>

          {/* NFR */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface', 'margin-bottom': '16px' }}>
            <h5 style={{ margin: '0 0 12px', 'font-size': '14px', 'font-weight': 600 }}>三、NFR（非功能需求）</h5>
            <textarea
              value={nfrContent()}
              onInput={(e) => setNfrContent(e.target.value)}
              style={{
                width: '100%',
                'min-height': '80px',
                'border': '1px solid themeColors.border',
                'border-radius': '6px',
                padding: '8px 12px',
                'font-size': '14px',
                'font-family': 'inherit',
                'resize': 'vertical',
              }}
            />
          </div>

          {/* Impact Analysis */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface', 'margin-bottom': '16px' }}>
            <h5 style={{ margin: '0 0 12px', 'font-size': '14px', 'font-weight': 600 }}>四、影响分析</h5>
            <Show when={prd()?.impactApps && prd()!.impactApps!.length > 0}>
              <div>
                <div style={{ padding: '10px 12px', background: 'themeColors.primaryBg', border: '1px solid themeColors.primaryLight', 'border-radius': '4px', 'font-size': '12px', color: 'themeColors.primary', 'margin-bottom': '12px' }}>
                  AI 已识别：此需求可能影响以下应用
                </div>
                <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }}>
                  <For each={prd()!.impactApps || []}>
                    {(app) => (
                      <span style={{ display: 'inline-block', padding: '2px 8px', background: 'themeColors.primaryBg', border: '1px solid themeColors.primaryLight', 'border-radius': '4px', 'font-size': '12px', color: 'themeColors.primary' }}>
                        {app}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={!prd()?.impactApps || prd()!.impactApps!.length === 0}>
              <div style={{ padding: '10px 12px', background: 'themeColors.surfacebe6', border: '1px solid themeColors.warningBorder', 'border-radius': '4px', 'font-size': '12px' }}>
                <div style={{ 'font-weight': 600, color: 'themeColors.warningDark', 'margin-bottom': '4px' }}>影响分析缺失</div>
                <div style={{ color: 'themeColors.warningDark' }}>建议添加关联应用分析</div>
              </div>
            </Show>
          </div>

          {/* Agent Suggestion */}
          <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '12px', 'font-weight': 600, 'font-size': '14px' }}>
              product-agent 建议
            </div>
            <div style={{ 'font-size': '13px', 'line-height': '1.6', 'margin-bottom': '12px', 'white-space': 'pre-line' }}>
              {score() < 8
                ? `当前评分 ${score().toFixed(1)}，建议补充以下内容以提升评分：
· 完善影响分析章节
· 增加边界条件的验收标准
· 补充性能基准测试方案`
                : '文档质量良好，可以提交评审。'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ 'background': 'themeColors.primary', color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 12px', cursor: 'pointer', 'font-size': '12px' }}>
                立即完善
              </button>
              <button style={{ background: 'themeColors.surface', border: '1px solid themeColors.border', 'border-radius': '6px', padding: '6px 12px', cursor: 'pointer', 'font-size': '12px' }}>
                忽略
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRDEditor;
