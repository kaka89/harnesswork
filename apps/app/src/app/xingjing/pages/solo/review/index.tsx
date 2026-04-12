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
import { readYamlDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { LineChart, ArrowUp, TrendingUp } from 'lucide-solid';

const sentimentIcon: Record<string, string> = {
  positive: '😊',
  negative: '😞',
  neutral:  '😐',
};

const sentimentClass: Record<string, string> = {
  positive: 'bg-green-50 border-green-200',
  negative: 'bg-red-50 border-red-200',
  neutral:  'bg-gray-50 border-gray-200',
};

const channelClass: Record<string, string> = {
  Email: 'bg-gray-100 text-gray-600',
  'Product Hunt': 'bg-orange-100 text-orange-700',
  Twitter: 'bg-blue-100 text-blue-700',
  'In-app': 'bg-purple-100 text-purple-700',
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

    const [metricsFiles, historyFiles, featureFiles, feedbackFiles] = await Promise.all([
      readYamlDir<BusinessMetric>('.xingjing/solo/metrics', workDir),
      readYamlDir<MetricHistory>('.xingjing/solo/metrics-history', workDir),
      readYamlDir<FeatureUsage>('.xingjing/solo/feature-usage', workDir),
      readYamlDir<UserFeedback>('.xingjing/solo/feedbacks', workDir),
    ]);

    if (metricsFiles.length > 0) setMetrics(metricsFiles);
    if (historyFiles.length > 0) setHistory(historyFiles);
    if (featureFiles.length > 0) setFeatureUsage(featureFiles);
    if (feedbackFiles.length > 0) setFeedbacks(feedbackFiles);
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
        itemStyle: { color: 'chartColors.primary' },
        areaStyle: { color: 'rgba(18,100,229,0.08)' },
      },
      {
        name: 'MRR ($)',
        type: 'line',
        yAxisIndex: 1,
        data: history().map((d) => d.mrr),
        smooth: true,
        itemStyle: { color: 'chartColors.success' },
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
            color: f.trend === 'up' ? 'chartColors.success' : f.trend === 'down' ? 'chartColors.error' : 'chartColors.primary',
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
      icon: '📈', title: 'MRR 增长健康', bg: 'themeColors.successBg', border: 'themeColors.successBorder',
      content: '过去 6 周 MRR 从 $620 增长到 $1,240，翻了一倍。当前增速 ~$120/周，按此速度 3 个月内可达 $2,700+。',
    },
    {
      icon: '⚠️', title: '引用检查功能需重新评估', bg: 'themeColors.surfacebe6', border: 'themeColors.warningBorder',
      content: '功能使用率仅 12% 且呈下降趋势。建议考虑降低维护优先级，或将其合并为轻量插件。',
    },
    {
      icon: '🎯', title: '团队版信号明确', bg: 'themeColors.primaryBg', border: 'themeColors.primaryBorder',
      content: '收到询问团队版，建议先用「共享链接」快速验证，不要贸然开发完整版。',
    },
    {
      icon: '🌙', title: '优化推送时间', bg: 'themeColors.purpleBg', border: 'themeColors.purpleBorder',
      content: '78% 用户活跃在晚间 20:00-23:00。建议将每日写作提醒时间调整为 20:30，预计可提升点击率 15%+。',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
          <span class="text-green-600">📈</span>
          数据复盘
        </h2>
        <span class="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-full">过去 6 周</span>
      </div>

      {/* Contrast note */}
      <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
        <strong>💡 对比团队版：</strong> 团队版核心指标是 DORA（部署频率、前置时间、失败率、MTTR）——面向工程效能。独立版核心指标是商业指标（DAU/MRR/留存/NPS）——工程是手段，商业结果才是目标。
      </div>

      {/* Business Metrics Row */}
      <div class="grid grid-cols-4 gap-3 mb-4">
        <For each={metrics()}>
          {(m) => (
            <div
              class="p-4 rounded-xl border"
              style={{ 'border-color': m.color + '33', background: m.color + '08' }}
            >
              <div class="text-sm font-semibold text-gray-700 mb-1">{m.label}</div>
              <div class="text-2xl font-bold flex items-center gap-1" style={{ color: m.color }}>
                {m.trend === 'up' && <span class="text-base text-green-500">↑</span>}
                {m.value}
              </div>
              <div class="text-xs text-gray-400 mt-0.5">{m.trendValue}</div>
            </div>
          )}
        </For>
      </div>

      {/* Charts Row */}
      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="font-semibold text-sm text-gray-800 mb-3">DAU + MRR 趋势（6 周）</div>
          <ECharts option={trendOption()} style={{ height: '260px' }} />
        </div>
        <div class="col-span-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="font-semibold text-sm text-gray-800 mb-3">功能使用率（本周活跃用户）</div>
          <ECharts option={featureUsageOption()} style={{ height: '220px' }} />
          <div class="mt-2 flex gap-3 text-xs">
            <span class="text-green-600">▲ 上升</span>
            <span class="text-blue-600">— 稳定</span>
            <span class="text-red-500">▼ 下降</span>
          </div>
        </div>
      </div>

      {/* Feedback + AI Insights */}
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-8 bg-white rounded-xl shadow-sm border border-gray-100">
          <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <span class="font-semibold text-sm text-gray-800">用户反馈摘要</span>
            <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">😊 {positiveCount()} 正面</span>
            <span class="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">😞 {negativeCount()} 负面</span>
          </div>
          <div class="p-4 flex flex-col divide-y divide-gray-50">
            <For each={feedbacks()}>
              {(item) => (
                <div class="py-3 flex gap-3 items-start">
                  <div
                    class={`w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 border ${sentimentClass[item.sentiment]}`}
                  >
                    {sentimentIcon[item.sentiment]}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="text-sm font-medium text-gray-800">{item.user}</span>
                      <span class={`text-xs px-1.5 py-0.5 rounded ${channelClass[item.channel] || 'bg-gray-100 text-gray-600'}`}>
                        {item.channel}
                      </span>
                      <span class="text-xs text-gray-400">{item.date}</span>
                    </div>
                    <p class="text-sm text-gray-600 m-0">{item.content}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="col-span-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <span class="text-green-600">🤖</span>
            <span class="font-semibold text-sm text-gray-800">AI 洞察</span>
          </div>
          <div class="p-4 flex flex-col gap-3">
            <For each={aiInsights}>
              {(insight) => (
                <div
                  class="p-3 rounded-lg border"
                  style={{ background: insight.bg, 'border-color': insight.border }}
                >
                  <div class="font-semibold text-sm text-gray-800 mb-1">
                    {insight.icon} {insight.title}
                  </div>
                  <p class="text-xs text-gray-500 m-0 leading-relaxed">{insight.content}</p>
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
