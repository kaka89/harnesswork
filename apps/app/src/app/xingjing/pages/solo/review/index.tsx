import { Component, onMount, createSignal, For } from 'solid-js';
import ECharts from '../../../components/common/echarts';
import {
  businessMetrics as mockBusinessMetrics,
  metricsHistory as mockMetricsHistory,
  featureUsage as mockFeatureUsage,
  userFeedbacks as mockUserFeedbacks,
  BusinessMetric,
  MetricHistory,
  FeatureUsage,
  UserFeedback,
} from '../../../mock/solo';
import { loadSoloMetrics, loadUserFeedbacks } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { LineChart, ArrowUp, TrendingUp } from 'lucide-solid';

const sentimentIcon: Record<string, string> = {
  positive: '😊',
  negative: '😞',
  neutral:  '😐',
};

const sentimentStyle: Record<string, { bg: string; border: string }> = {
  positive: { bg: themeColors.successBg, border: themeColors.successBorder },
  negative: { bg: themeColors.errorBg, border: themeColors.errorBorder },
  neutral:  { bg: themeColors.bgSubtle, border: themeColors.border },
};

const channelStyle: Record<string, { bg: string; color: string }> = {
  Email: { bg: themeColors.hover, color: themeColors.textSecondary },
  'Product Hunt': { bg: themeColors.warningBg, color: themeColors.warningDark },
  Twitter: { bg: themeColors.primaryBg, color: chartColors.primary },
  'In-app': { bg: themeColors.purpleBg, color: themeColors.purple },
};

const SoloReview: Component = () => {
  const { productStore } = useAppStore();
  const [metrics, setMetrics] = createSignal<BusinessMetric[]>(mockBusinessMetrics);
  const [history, setHistory] = createSignal<MetricHistory[]>(mockMetricsHistory);
  const [featureUsage, setFeatureUsage] = createSignal<FeatureUsage[]>(mockFeatureUsage);
  const [feedbacks, setFeedbacks] = createSignal<UserFeedback[]>(mockUserFeedbacks);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    try {
      const [fileMetrics, fileFeedbacks] = await Promise.all([
        loadSoloMetrics(workDir),
        loadUserFeedbacks(workDir),
      ]);
      if (fileMetrics.businessMetrics.length > 0) setMetrics(fileMetrics.businessMetrics as unknown as BusinessMetric[]);
      if (fileMetrics.metricsHistory.length > 0) setHistory(fileMetrics.metricsHistory as unknown as MetricHistory[]);
      if (fileMetrics.featureUsage.length > 0) setFeatureUsage(fileMetrics.featureUsage as unknown as FeatureUsage[]);
      if (fileFeedbacks.length > 0) setFeedbacks(fileFeedbacks as unknown as UserFeedback[]);
    } catch {
      // Mock fallback — keep initial mock data
    }
  });

  const trendOption = () => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['DAU', 'MRR ($)'], bottom: 0 },
    grid: { left: 40, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: history().map((d) => d.week) },
    yAxis: [
      { type: 'value' as const, name: 'DAU', nameTextStyle: { fontSize: 11 } },
      { type: 'value' as const, name: 'MRR ($)', nameTextStyle: { fontSize: 11 } },
    ],
    series: [
      {
        name: 'DAU',
        type: 'line',
        data: history().map((d) => d.dau),
        smooth: true,
        itemStyle: { color: '#1264e5' },
        areaStyle: { color: 'rgba(18,100,229,0.08)' },
      },
      {
        name: 'MRR ($)',
        type: 'line',
        yAxisIndex: 1,
        data: history().map((d) => d.mrr),
        smooth: true,
        itemStyle: { color: '#52c41a' },
        areaStyle: { color: 'rgba(82,196,26,0.08)' },
      },
    ],
  });

  const featureUsageOption = () => ({
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 100, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' as const, max: 100 },
    yAxis: {
      type: 'category' as const,
      data: featureUsage().map((f) => f.feature).reverse(),
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: featureUsage().map((f) => ({
          value: f.usage,
          itemStyle: {
            color: f.trend === 'up' ? '#52c41a' : f.trend === 'down' ? '#ff4d4f' : '#1264e5',
          },
        })).reverse(),
        barMaxWidth: 24,
        label: { show: true, position: 'right' as const, formatter: '{c}%', fontSize: 11 },
      },
    ],
  });

  const positiveCount = () => feedbacks().filter((f) => f.sentiment === 'positive').length;
  const negativeCount = () => feedbacks().filter((f) => f.sentiment === 'negative').length;

  const aiInsights = [
    {
      icon: '📈', title: 'MRR 增长健康', bg: themeColors.successBg, border: themeColors.successBorder,
      content: '过去 6 周 MRR 从 $620 增长到 $1,240，翻了一倍。当前增速 ~$120/周，按此速度 3 个月内可达 $2,700+。',
    },
    {
      icon: '⚠️', title: '引用检查功能需重新评估', bg: themeColors.warningBg, border: themeColors.warningBorder,
      content: '功能使用率仅 12% 且呈下降趋势。建议考虑降低维护优先级，或将其合并为轻量插件。',
    },
    {
      icon: '🎯', title: '团队版信号明确', bg: themeColors.primaryBg, border: themeColors.primaryBorder,
      content: '收到询问团队版，建议先用「共享链接」快速验证，不要贸然开发完整版。',
    },
    {
      icon: '🌙', title: '优化推送时间', bg: themeColors.purpleBg, border: themeColors.purpleBorder,
      content: '78% 用户活跃在晚间 20:00-23:00。建议将每日写作提醒时间调整为 20:30，预计可提升点击率 15%+。',
    },
  ];

  return (
    <div style={{ background: themeColors.surface }}>
      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
        <h2 style={{ margin: 0, 'font-size': '18px', 'font-weight': 600, color: themeColors.text, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span style={{ color: chartColors.success }}>📈</span>
          数据复盘
        </h2>
        <span style={{ 'font-size': '12px', padding: '4px 12px', background: themeColors.primaryBg, color: chartColors.primary, 'border-radius': '9999px' }}>过去 6 周</span>
      </div>

      {/* Contrast note */}
      <div style={{ padding: '12px', background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, 'border-radius': '8px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.warning }}>
        <strong>💡 对比团队版：</strong> 团队版核心指标是 DORA（部署频率、前置时间、失败率、MTTR）——面向工程效能。独立版核心指标是商业指标（DAU/MRR/留存/NPS）——工程是手段，商业结果才是目标。
      </div>

      {/* Business Metrics Row */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px', 'margin-bottom': '16px' }}>
        <For each={metrics()}>
          {(m) => (
            <div style={{ padding: '16px', 'border-radius': '12px', border: `1px solid ${m.color}33`, background: `${m.color}08` }}>
              <div style={{ 'font-size': '14px', 'font-weight': 600, color: themeColors.textSecondary, 'margin-bottom': '4px' }}>{m.label}</div>
              <div style={{ 'font-size': '24px', 'font-weight': 700, display: 'flex', 'align-items': 'center', gap: '4px', color: m.color }}>
                {m.trend === 'up' && <span style={{ 'font-size': '16px', color: chartColors.success }}>↑</span>}
                {m.value}
              </div>
              <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '2px' }}>{m.trendValue}</div>
            </div>
          )}
        </For>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px', 'margin-bottom': '16px' }}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '12px' }}>DAU + MRR 趋势（6 周）</div>
          <ECharts option={trendOption()} style={{ height: '260px' }} />
        </div>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '12px' }}>功能使用率（本周活跃用户）</div>
          <ECharts option={featureUsageOption()} style={{ height: '220px' }} />
          <div style={{ 'margin-top': '8px', display: 'flex', gap: '12px', 'font-size': '12px' }}>
            <span style={{ color: chartColors.success }}>▲ 上升</span>
            <span style={{ color: chartColors.primary }}>— 稳定</span>
            <span style={{ color: chartColors.error }}>▼ 下降</span>
          </div>
        </div>
      </div>

      {/* Feedback + AI Insights */}
      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '12px', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>用户反馈摘要</span>
            <span style={{ 'font-size': '12px', padding: '1px 8px', background: themeColors.successBg, color: chartColors.success, 'border-radius': '9999px' }}>😊 {positiveCount()} 正面</span>
            <span style={{ 'font-size': '12px', padding: '1px 8px', background: themeColors.errorBg, color: chartColors.error, 'border-radius': '9999px' }}>😞 {negativeCount()} 负面</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', 'flex-direction': 'column' }}>
            <For each={feedbacks()}>
              {(item) => {
                const sStyle = sentimentStyle[item.sentiment] || sentimentStyle.neutral;
                const cStyle = channelStyle[item.channel] || { bg: themeColors.hover, color: themeColors.textSecondary };
                return (
                  <div style={{ padding: '12px 0', display: 'flex', gap: '12px', 'align-items': 'flex-start', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
                    <div style={{ width: '32px', height: '32px', 'border-radius': '50%', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '18px', 'flex-shrink': 0, border: `1px solid ${sStyle.border}`, background: sStyle.bg }}>
                      {sentimentIcon[item.sentiment]}
                    </div>
                    <div style={{ flex: 1, 'min-width': 0 }}>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '4px', 'flex-wrap': 'wrap' }}>
                        <span style={{ 'font-size': '14px', 'font-weight': 500, color: themeColors.text }}>{item.user}</span>
                        <span style={{ 'font-size': '12px', padding: '1px 6px', 'border-radius': '4px', background: cStyle.bg, color: cStyle.color }}>
                          {item.channel}
                        </span>
                        <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{item.date}</span>
                      </div>
                      <p style={{ 'font-size': '14px', color: themeColors.textSecondary, margin: 0 }}>{item.content}</p>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
            <span style={{ color: chartColors.success }}>🤖</span>
            <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text }}>AI 洞察</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
            <For each={aiInsights}>
              {(insight) => (
                <div style={{ padding: '12px', 'border-radius': '8px', border: `1px solid ${insight.border}`, background: insight.bg }}>
                  <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, 'margin-bottom': '4px' }}>
                    {insight.icon} {insight.title}
                  </div>
                  <p style={{ 'font-size': '12px', color: themeColors.textMuted, margin: 0, 'line-height': '1.6' }}>{insight.content}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoloReview;
