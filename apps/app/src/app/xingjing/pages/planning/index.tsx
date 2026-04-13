import { Component, createSignal, For, Show, createMemo } from 'solid-js';
import {
  productPlans, competitorList, marketInsights, customerVoices,
  marketShareTrend, ProductPlan, PlanningStatus, PlanningType,
} from '../../mock/planning';
import { Bot, TrendingUp, FileText, CheckCircle, AlertTriangle, Zap, Plus, Send } from 'lucide-solid';
import ECharts from '../../components/common/echarts';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { savePlanningItem, type PlanningRecord } from '../../services/file-store';

const statusConfig: Record<PlanningStatus, { label: string; color: string; bg: string }> = {
  research:  { label: '调研中', color: themeColors.textSecondary, bg: themeColors.hover },
  analyzing: { label: '分析中', color: chartColors.primary, bg: themeColors.primaryBg },
  proposed:  { label: '已提案', color: themeColors.warning, bg: themeColors.warningBg },
  approved:  { label: '已批准', color: themeColors.success, bg: themeColors.successBg },
  rejected:  { label: '已否决', color: themeColors.error, bg: themeColors.errorBg },
};

const typeConfig: Record<PlanningType, { label: string; color: string }> = {
  'new-module':       { label: '新模块',   color: chartColors.primary },
  'feature-optimize': { label: '功能优化', color: chartColors.success },
  'new-product-line': { label: '新产品线', color: chartColors.purple },
  'tech-upgrade':     { label: '技术升级', color: chartColors.warning },
};

const trendIcon: Record<string, string> = { up: '↑', down: '↓', stable: '→' };
const impactColor: Record<string, string> = { high: themeColors.error, medium: themeColors.warning, low: chartColors.primary };
const categoryLabel: Record<string, string> = {
  trend: '行业趋势', regulation: '政策法规', technology: '技术方向', 'customer-demand': '客户需求',
};

const TABS = [
  { key: 'overview', label: '规划总览' },
  { key: 'competitor', label: '竞品分析' },
  { key: 'market', label: '市场洞察' },
  { key: 'customer', label: '客户声音' },
];

const ProductPlanning: Component = () => {
  const { productStore } = useAppStore();
  const [plans, setPlans] = createSignal([...productPlans]);
  const [activeTab, setActiveTab] = createSignal('overview');
  const [detailPlan, setDetailPlan] = createSignal<ProductPlan | null>(null);
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal<{ role: string; content: string }[]>([]);
  const [agentThinking, setAgentThinking] = createSignal(false);

  const handleVote = (planId: string, type: 'approve' | 'reject') => {
    setPlans((prev) => {
      const updated = prev.map((p) =>
        p.id === planId ? { ...p, votes: { ...p.votes, [type]: p.votes[type] + 1 } } : p
      );
      const updatedPlan = updated.find((p) => p.id === planId);
      if (updatedPlan) {
        const workDir = productStore.activeProduct()?.workDir ?? '';
        if (workDir) {
          savePlanningItem(workDir, updatedPlan as PlanningRecord).catch(() => {});
        }
      }
      return updated;
    });
  };

  const handleStatusChange = (planId: string, status: PlanningStatus) => {
    setPlans((prev) => {
      const updated = prev.map((p) => (p.id === planId ? { ...p, status } : p));
      const updatedPlan = updated.find((p) => p.id === planId);
      if (updatedPlan) {
        const workDir = productStore.activeProduct()?.workDir ?? '';
        if (workDir) {
          savePlanningItem(workDir, updatedPlan as PlanningRecord).catch(() => {});
        }
      }
      return updated;
    });
  };

  const handleAgentSend = (overrideInput?: string) => {
    const q = overrideInput ?? agentInput().trim();
    if (!q || agentThinking()) return;
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    if (!overrideInput) setAgentInput('');
    setAgentThinking(true);
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const workDir = productStore.activeProduct()?.workDir ?? '';
    const contextSummary = `当前规划条目数：${plans().length}，活跃标签：${activeTab()}`;

    const { callAgent } = useAppStore().actions;
    callAgent({
      systemPrompt: `你是一个产品规划专家助手（planning-agent），专注于市场分析、竞品研究和产品战略。
你有以下能力：
- 分析竞品动态和市场趋势
- 评估产品规划优先级
- 生成产品路线图建议
- 整合客户声音和市场洞察

当前工作目录：${workDir}
上下文：${contextSummary}

请用中文回复，保持专业简洁，数据要有据可查。`,
      userPrompt: q,
      title: `planning-agent-${Date.now()}`,
      onText: (text) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text };
          return updated;
        });
      },
      onDone: (fullText) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullText || '分析完成。' };
          return updated;
        });
        setAgentThinking(false);
      },
      onError: (_err) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '⚠️ AI 服务暂不可用，请检查 OpenCode 连接或 LLM 配置。' };
          return updated;
        });
        setAgentThinking(false);
      },
    }).catch(() => { setAgentThinking(false); });
  };

  // 市场份额趋势图
  const marketShareChartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['金蝶', '用友', 'SAP', '浪潮'], bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 40 },
    xAxis: { type: 'category' as const, data: marketShareTrend.map((d) => d.quarter) },
    yAxis: { type: 'value' as const, name: '%', max: 40 },
    series: [
      { name: '金蝶', type: 'line', data: marketShareTrend.map((d) => d.kingdee), itemStyle: { color: '#1264e5' }, lineStyle: { width: 3 } },
      { name: '用友', type: 'line', data: marketShareTrend.map((d) => d.yonyou), itemStyle: { color: '#ff4d4f' } },
      { name: 'SAP', type: 'line', data: marketShareTrend.map((d) => d.sap), itemStyle: { color: '#52c41a' } },
      { name: '浪潮', type: 'line', data: marketShareTrend.map((d) => d.inspur), itemStyle: { color: '#faad14' } },
    ],
  };

  const statusPieOption = {
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      data: [
        { value: plans().filter((p) => p.status === 'research').length, name: '调研中', itemStyle: { color: '#d9d9d9' } },
        { value: plans().filter((p) => p.status === 'analyzing').length, name: '分析中', itemStyle: { color: '#1264e5' } },
        { value: plans().filter((p) => p.status === 'proposed').length, name: '已提案', itemStyle: { color: '#faad14' } },
        { value: plans().filter((p) => p.status === 'approved').length, name: '已批准', itemStyle: { color: '#52c41a' } },
      ].filter((d) => d.value > 0),
      label: { formatter: '{b}: {c}' },
    }],
  };

  const approvedCount = createMemo(() => plans().filter((p) => p.status === 'approved').length);
  const analyzingCount = createMemo(() => plans().filter((p) => ['analyzing', 'proposed'].includes(p.status)).length);
  const avgAiScore = createMemo(() => (plans().reduce((s, p) => s + p.aiScore, 0) / plans().length).toFixed(1));

  const renderOverview = () => (
    <div>
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px', 'margin-bottom': '20px' }}>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>规划总数</div>
          <div style={{ 'font-size': '24px', 'font-weight': 'bold' }}>{plans().length}</div>
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>已批准</div>
          <div style={{ 'font-size': '24px', 'font-weight': 'bold', color: chartColors.success }}>{approvedCount()}</div>
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>分析/提案中</div>
          <div style={{ 'font-size': '24px', 'font-weight': 'bold', color: chartColors.primary }}>{analyzingCount()}</div>
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>平均 AI 评分</div>
          <div style={{ 'font-size': '24px', 'font-weight': 'bold', color: chartColors.warning }}>{avgAiScore()}</div>
        </div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '7fr 5fr', gap: '16px', 'margin-bottom': '20px' }}>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>市场份额趋势</div>
          <ECharts option={marketShareChartOption} style={{ height: '260px' }} />
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>规划状态分布</div>
          <ECharts option={statusPieOption} style={{ height: '260px' }} />
        </div>
      </div>

      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '12px' }}>
          <div style={{ 'font-weight': 'bold' }}>产品规划看板</div>
          <button style={{ background: chartColors.primary, color: themeColors.surface, border: 'none', padding: '4px 12px', 'border-radius': '4px', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '4px', 'font-size': '12px' }}>
            <Plus size={14} /> 新建规划
          </button>
        </div>
        <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px' }}>
          <For each={['research', 'analyzing', 'proposed', 'approved'] as PlanningStatus[]}>
            {(status) => {
              const items = () => plans().filter((p) => p.status === status);
              return (
                <div style={{ 'min-height': '300px', 'border': `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '12px' }}>
                  <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px', padding: '8px', background: statusConfig[status].bg, color: statusConfig[status].color, 'border-radius': '4px' }}>
                    {statusConfig[status].label} ({items().length})
                  </div>
                  <For each={items()}>
                    {(plan) => (
                      <div
                        style={{ background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'margin-bottom': '8px', cursor: 'pointer', 'border': `1px solid ${themeColors.border}` }}
                        onClick={() => setDetailPlan(plan)}
                      >
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '4px' }}>
                          <div style={{ 'font-size': '12px', 'font-weight': 'bold' }}>{plan.id}</div>
                          <span style={{ background: typeConfig[plan.type].color, color: themeColors.surface, padding: '2px 6px', 'border-radius': '3px', 'font-size': '11px' }}>
                            {typeConfig[plan.type].label}
                          </span>
                        </div>
                        <div style={{ 'font-size': '13px', 'font-weight': '500', 'margin-bottom': '6px' }}>{plan.title}</div>
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'font-size': '11px', color: themeColors.textSecondary }}>
                          <span>{plan.owner}</span>
                          <span style={{ background: plan.priority === 'P0' ? chartColors.error : plan.priority === 'P1' ? chartColors.warning : chartColors.primary, color: themeColors.surface, padding: '2px 6px', 'border-radius': '3px' }}>
                            {plan.priority}
                          </span>
                        </div>
                        <Show when={plan.aiScore > 0}>
                          <div style={{ 'margin-top': '4px', display: 'flex', 'align-items': 'center', gap: '4px', 'font-size': '11px', color: chartColors.warning }}>
                            <Zap size={12} /> AI评分 {plan.aiScore}
                          </div>
                        </Show>
                        <Show when={plan.status === 'proposed'}>
                          <div style={{ 'margin-top': '6px', display: 'flex', gap: '8px' }}>
                            <button style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, padding: '2px 6px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px' }} onClick={(e) => { e.stopPropagation(); handleVote(plan.id, 'approve'); }}>
                              👍 {plan.votes.approve}
                            </button>
                            <button style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, padding: '2px 6px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px' }} onClick={(e) => { e.stopPropagation(); handleVote(plan.id, 'reject'); }}>
                              👎 {plan.votes.reject}
                            </button>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );

  const renderCompetitor = () => (
    <div style={{ display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '16px' }}>
      <For each={competitorList}>
        {(comp) => (
          <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
            <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '12px' }}>
              <div>
                <div style={{ 'font-weight': 'bold', 'font-size': '14px' }}>{comp.competitor}</div>
                <div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>{comp.product} {trendIcon[comp.trend]}</div>
              </div>
              <div style={{ 'font-size': '14px', color: themeColors.textSecondary }}>份额 {comp.marketShare}%</div>
            </div>
            <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ 'font-size': '12px', 'font-weight': 'bold', color: chartColors.success, 'margin-bottom': '6px' }}>优势</div>
                <For each={comp.strengths}>
                  {(s) => <div style={{ 'font-size': '12px', 'margin-bottom': '4px' }}>✅ {s}</div>}
                </For>
              </div>
              <div>
                <div style={{ 'font-size': '12px', 'font-weight': 'bold', color: chartColors.error, 'margin-bottom': '6px' }}>劣势</div>
                <For each={comp.weaknesses}>
                  {(w) => <div style={{ 'font-size': '12px', 'margin-bottom': '4px' }}>⚠️ {w}</div>}
                </For>
              </div>
            </div>
            <div style={{ 'margin-top': '8px', 'text-align': 'right', 'font-size': '11px', color: themeColors.textSecondary }}>
              更新于 {comp.lastUpdated}
            </div>
          </div>
        )}
      </For>
    </div>
  );

  const renderMarket = () => (
    <div>
      <div style={{ display: 'grid', 'grid-template-columns': '7fr 5fr', gap: '16px', 'margin-bottom': '16px' }}>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>市场份额趋势</div>
          <ECharts option={marketShareChartOption} style={{ height: '280px' }} />
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>关键洞察</div>
          <For each={marketInsights.filter((m) => m.impact === 'high')}>
            {(m) => (
              <div style={{ 'margin-bottom': '12px', padding: '8px', background: themeColors.warningBg, 'border-radius': '6px', border: `1px solid ${themeColors.warningBorder}` }}>
                <div style={{ 'font-weight': 'bold', 'font-size': '13px' }}>🔥 {m.title}</div>
                <div style={{ 'font-size': '12px', 'margin-top': '4px' }}>{m.summary.slice(0, 60)}...</div>
              </div>
            )}
          </For>
        </div>
      </div>
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>全部市场洞察</div>
        <div style={{ 'overflow-x': 'auto' }}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>ID</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>标题</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>类别</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>影响</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>来源</th>
              </tr>
            </thead>
            <tbody>
              <For each={marketInsights}>
                {(m) => (
                  <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                    <td style={{ padding: '8px' }}>{m.id}</td>
                    <td style={{ padding: '8px' }}>{m.title}</td>
                    <td style={{ padding: '8px' }}><span style={{ background: themeColors.border, padding: '2px 6px', 'border-radius': '3px' }}>{categoryLabel[m.category]}</span></td>
                    <td style={{ padding: '8px' }}><span style={{ background: impactColor[m.impact], color: themeColors.surface, padding: '2px 6px', 'border-radius': '3px' }}>{m.impact === 'high' ? '高' : m.impact === 'medium' ? '中' : '低'}</span></td>
                    <td style={{ padding: '8px' }}>{m.source}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCustomer = () => (
    <div>
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px', 'margin-bottom': '16px' }}>
        <For each={customerVoices.slice(0, 4)}>
          {(cv) => (
            <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
              <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '4px' }}>{cv.customer}</div>
              <div style={{ 'font-size': '20px', 'font-weight': 'bold', color: cv.satisfaction >= 8 ? chartColors.success : cv.satisfaction >= 7 ? chartColors.warning : chartColors.error }}>
                {cv.satisfaction}<span style={{ 'font-size': '12px' }}>/ 10</span>
              </div>
              <div style={{ 'margin-top': '8px', display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <span style={{ background: themeColors.border, padding: '2px 6px', 'border-radius': '3px', 'font-size': '11px' }}>{cv.industry}</span>
                <span style={{ 'font-size': '11px', color: themeColors.textSecondary }}>访问 {cv.visits} 次</span>
              </div>
            </div>
          )}
        </For>
      </div>
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': 'bold', 'margin-bottom': '12px' }}>客户声音详情</div>
        <div style={{ 'overflow-x': 'auto' }}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>客户</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>行业</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>规模</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>满意度</th>
                <th style={{ 'text-align': 'left', padding: '8px', 'font-weight': 'bold' }}>访问次数</th>
              </tr>
            </thead>
            <tbody>
              <For each={customerVoices}>
                {(cv) => (
                  <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                    <td style={{ padding: '8px' }}>{cv.customer}</td>
                    <td style={{ padding: '8px' }}><span style={{ background: themeColors.border, padding: '2px 6px', 'border-radius': '3px' }}>{cv.industry}</span></td>
                    <td style={{ padding: '8px' }}><span style={{ background: cv.size === 'large' ? themeColors.primaryBg : cv.size === 'medium' ? themeColors.successBg : themeColors.hover, padding: '2px 6px', 'border-radius': '3px' }}>{cv.size === 'large' ? '大型' : cv.size === 'medium' ? '中型' : '小型'}</span></td>
                    <td style={{ padding: '8px', color: cv.satisfaction >= 8 ? chartColors.success : chartColors.warning }}>{cv.satisfaction}</td>
                    <td style={{ padding: '8px' }}>{cv.visits}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDetailModal = () => {
    const plan = detailPlan();
    if (!plan) return null;
    const totalVotes = plan.votes.approve + plan.votes.reject + plan.votes.abstain;
    const approveRate = totalVotes > 0 ? Math.round((plan.votes.approve / totalVotes) * 100) : 0;

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
        <div style={{ background: themeColors.surface, 'border-radius': '8px', width: '720px', 'max-height': '90vh', overflow: 'auto' }}>
          <div style={{ padding: '16px', 'border-bottom': `1px solid ${themeColors.border}`, display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span style={{ background: typeConfig[plan.type].color, color: themeColors.surface, padding: '4px 8px', 'border-radius': '4px', 'font-size': '12px' }}>
                {typeConfig[plan.type].label}
              </span>
              <span style={{ 'font-weight': 'bold' }}>{plan.id} - {plan.title}</span>
            </div>
            <button style={{ background: 'transparent', border: 'none', 'font-size': '20px', cursor: 'pointer' }} onClick={() => setDetailPlan(null)}>×</button>
          </div>

          <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px', 'margin-bottom': '16px' }}>
              <div><div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>负责人</div><div style={{ 'font-weight': 'bold' }}>{plan.owner}</div></div>
              <div><div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>优先级</div><div style={{ background: plan.priority === 'P0' ? chartColors.error : plan.priority === 'P1' ? chartColors.warning : chartColors.primary, color: themeColors.surface, padding: '2px 6px', 'border-radius': '3px', 'font-size': '12px', 'display': 'inline-block' }}>{plan.priority}</div></div>
              <div><div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>目标版本</div><div style={{ 'font-weight': 'bold' }}>{plan.targetVersion}</div></div>
              <div><div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>状态</div><div style={{ background: statusConfig[plan.status].bg, color: statusConfig[plan.status].color, padding: '2px 6px', 'border-radius': '3px', 'font-size': '12px', 'display': 'inline-block', 'font-weight': 'bold' }}>{statusConfig[plan.status].label}</div></div>
            </div>

            <div style={{ background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'margin-bottom': '12px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '6px' }}>规划描述</div>
              <div style={{ 'font-size': '13px' }}>{plan.description}</div>
            </div>

            <div style={{ background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'margin-bottom': '12px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '6px' }}>决策背景</div>
              <div style={{ 'font-size': '13px' }}>{plan.background}</div>
            </div>

            <div style={{ background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'margin-bottom': '12px' }}>
              <div style={{ 'font-weight': 'bold', 'margin-bottom': '6px' }}>预期 ROI</div>
              <div style={{ 'font-size': '13px' }}>{plan.expectedROI}</div>
            </div>

            <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px', 'margin-bottom': '16px' }}>
              <div style={{ background: themeColors.primaryBg, padding: '12px', 'border-radius': '6px' }}>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '6px' }}>
                  <Zap size={16} style={{ color: chartColors.warning }} />
                  <span style={{ 'font-weight': 'bold' }}>AI 评分：{plan.aiScore}</span>
                </div>
                <div style={{ 'font-size': '12px' }}>{plan.aiSuggestion}</div>
              </div>
              <div style={{ background: themeColors.surface, padding: '12px', 'border-radius': '6px', border: `1px solid ${themeColors.border}` }}>
                <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px' }}>投票情况</div>
                <Show when={totalVotes > 0}>
                  <div>
                    <div style={{ background: themeColors.primaryBg, height: '20px', 'border-radius': '4px', overflow: 'hidden', 'margin-bottom': '8px' }}>
                      <div style={{ background: chartColors.success, height: '100%', width: `${approveRate}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', 'font-size': '12px' }}>
                      <span style={{ color: chartColors.success }}>赞成 {plan.votes.approve}</span>
                      <span style={{ color: chartColors.error }}>反对 {plan.votes.reject}</span>
                      <span style={{ color: themeColors.textSecondary }}>弃权 {plan.votes.abstain}</span>
                    </div>
                  </div>
                </Show>
                <Show when={totalVotes === 0}>
                  <div style={{ 'font-size': '12px', color: themeColors.textSecondary }}>暂无投票</div>
                </Show>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px', 'border-top': `1px solid ${themeColors.border}`, display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
            <Show when={plan.status === 'proposed'}>
              <button style={{ background: chartColors.primary, color: themeColors.surface, border: 'none', padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer' }} onClick={() => { handleStatusChange(plan.id, 'approved'); setDetailPlan(null); }}>批准</button>
              <button style={{ background: chartColors.error, color: themeColors.surface, border: 'none', padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer' }} onClick={() => { handleStatusChange(plan.id, 'rejected'); setDetailPlan(null); }}>否决</button>
            </Show>
            <Show when={plan.status === 'research'}>
              <button style={{ background: chartColors.primary, color: themeColors.surface, border: 'none', padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer' }} onClick={() => { handleStatusChange(plan.id, 'analyzing'); setDetailPlan(null); }}>开始分析</button>
            </Show>
            <Show when={plan.status === 'analyzing'}>
              <button style={{ background: chartColors.primary, color: themeColors.surface, border: 'none', padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer' }} onClick={() => { handleStatusChange(plan.id, 'proposed'); setDetailPlan(null); }}>提交提案</button>
            </Show>
            <button style={{ background: themeColors.border, border: 'none', padding: '6px 16px', 'border-radius': '4px', cursor: 'pointer' }} onClick={() => setDetailPlan(null)}>关闭</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px' }}>
        <h2 style={{ margin: 0, 'font-size': '20px' }}>产品规划工坊</h2>
      </div>

      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '16px', 'border-bottom': `1px solid ${themeColors.border}` }}>
        <For each={TABS}>
          {(tab) => (
            <button
              style={{
                background: activeTab() === tab.key ? chartColors.primary : 'transparent',
                color: activeTab() === tab.key ? themeColors.surface : themeColors.textSecondary,
                border: 'none',
                padding: '8px 16px',
                'border-radius': '4px 4px 0 0',
                cursor: 'pointer',
                'font-size': '14px',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={activeTab() === 'overview'}>{renderOverview()}</Show>
      <Show when={activeTab() === 'competitor'}>{renderCompetitor()}</Show>
      <Show when={activeTab() === 'market'}>{renderMarket()}</Show>
      <Show when={activeTab() === 'customer'}>{renderCustomer()}</Show>

      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-top': '20px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '12px' }}>
          <Bot size={16} /> <span style={{ 'font-weight': 'bold' }}>planning-agent</span>
        </div>
        <div style={{ 'font-size': '13px', 'margin-bottom': '8px' }}>我可以帮你：</div>
        <ul style={{ 'font-size': '13px', 'margin-bottom': '12px', 'padding-left': '20px' }}>
          <li>分析竞品动态和市场趋势</li>
          <li>整合客户声音(VOC)提炼痛点</li>
          <li>基于数据给出产品规划建议</li>
          <li>评估规划提案的可行性和ROI</li>
        </ul>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', 'margin-bottom': '12px' }}>
          <For each={['竞品最新动态是什么？', '市场趋势分析', '客户痛点总结', '给出规划优先级建议']}>
            {(q) => (
              <button
                style={{ background: themeColors.hover, border: `1px dashed ${themeColors.border}`, padding: '4px 12px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '12px' }}
                onClick={() => handleAgentSend(q)}
              >
                {q}
              </button>
            )}
          </For>
        </div>
        <For each={agentMessages()}>
          {(msg, idx) => (
            <div style={{ 'margin-bottom': '8px', padding: '6px 10px', background: msg.role === 'user' ? themeColors.primaryBg : themeColors.surface, 'border-radius': '6px', 'font-size': '13px', 'white-space': 'pre-wrap' }}>
              <span style={{ 'font-weight': 'bold', 'font-size': '12px' }}>{msg.role === 'user' ? '你' : 'planning-agent'}：</span>
              <div>{msg.content}</div>
            </div>
          )}
        </For>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="输入你的问题..."
            value={agentInput()}
            onInput={(e) => setAgentInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
            style={{ flex: 1, padding: '8px 12px', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', 'font-size': '12px' }}
          />
          <button
            disabled={agentThinking()}
            style={{ background: chartColors.primary, color: themeColors.surface, border: 'none', padding: '8px 12px', 'border-radius': '4px', cursor: agentThinking() ? 'not-allowed' : 'pointer', display: 'flex', 'align-items': 'center', gap: '4px', opacity: agentThinking() ? '0.6' : '1' }}
            onClick={handleAgentSend}
          >
            <Send size={14} /> {agentThinking() ? '思考中...' : '发送'}
          </button>
        </div>
      </div>

      {renderDetailModal()}
    </div>
  );
};

export default ProductPlanning;
