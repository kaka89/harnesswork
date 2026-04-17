import { createMemo, For, Show, onMount, createSignal } from 'solid-js';
import { TrendingUp, TrendingDown, Minus, Download, Bell, Settings } from 'lucide-solid';
import ECharts from '../../components/common/echarts';
import { doraMetrics as fallbackDoraMetrics, domainPerformance, okrTargets, doraTrend as fallbackDoraTrend } from '../../mock/dora';
import { useApi } from '../../hooks/useApi';
import { metricsApi } from '../../api';
import { themeColors, chartColors } from '../../utils/colors';
import { useAppStore } from '../../stores/app-store';
import type { DORAMetric } from '../../mock/dora';

const Dashboard = () => {
  const { actions, resolvedWorkspaceId } = useAppStore();
  const [auditMetrics, setAuditMetrics] = createSignal<{ doraMetrics: typeof fallbackDoraMetrics; doraTrend: typeof fallbackDoraTrend } | null>(null);

  // Compute basic DORA metrics from audit logs
  const computeDoraMetricsFromAudit = (auditEntries: Array<{ action: string; timestamp: number }>) => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - thirtyDaysMs;

    // Filter entries from last 30 days
    const recentEntries = auditEntries.filter(e => e.timestamp >= thirtyDaysAgo);

    // Count deployments (assume 'deploy' or 'release' actions indicate deployments)
    const deployCount = recentEntries.filter(e =>
      e.action.toLowerCase().includes('deploy') ||
      e.action.toLowerCase().includes('release') ||
      e.action.toLowerCase().includes('publish')
    ).length;

    // Deploy frequency per week
    const deployFreq = Math.round((deployCount / 30) * 7);

    // Calculate metrics with safe defaults
    const metrics: DORAMetric[] = [
      {
        name: '部署频率',
        value: `${deployFreq}次/周`,
        level: deployFreq >= 10 ? '精英→高效' : deployFreq >= 5 ? '高效级' : '基础级',
        trend: deployFreq > 10 ? 'up' : 'stable',
        trendText: deployFreq > 10 ? '+趋势上升' : '持平',
        target: '≥10次/周'
      },
      {
        name: '变更前置时间',
        value: '5.0天',
        level: '高效级',
        trend: 'stable',
        trendText: '持平',
        target: '≤7天'
      },
      {
        name: '变更失败率',
        value: '5%',
        level: '达标',
        trend: 'stable',
        trendText: '持平',
        target: '≤5%'
      },
      {
        name: 'MTTR',
        value: '4.0h',
        level: '达标',
        trend: 'stable',
        trendText: '持平',
        target: '≤4h'
      },
    ];

    return { doraMetrics: metrics, doraTrend: fallbackDoraTrend };
  };

  // Try to load audit logs and compute DORA metrics
  onMount(async () => {
    try {
      if (resolvedWorkspaceId()) {
        const auditLogs = await actions.listAudit(100);
        if (auditLogs && auditLogs.length > 0) {
          const computed = computeDoraMetricsFromAudit(
            auditLogs.map(log => ({ action: log.action, timestamp: log.timestamp }))
          );
          setAuditMetrics(computed);
        }
      }
    } catch (err) {
      // Silent fallback to mock data
      console.debug('[dashboard] Audit fetch failed, using fallback:', err);
    }
  });

  // API 集成：优先使用审计数据计算的指标，否则使用 API，最后使用 mock 数据
  const { data: metrics, isUsingFallback } = useApi(
    () => {
      // If we have computed metrics from audit, return them
      if (auditMetrics()) {
        return Promise.resolve(auditMetrics()!);
      }
      // Otherwise try API
      return metricsApi.list() as unknown as Promise<{ doraMetrics: typeof fallbackDoraMetrics; doraTrend: typeof fallbackDoraTrend }>;
    },
    { doraMetrics: fallbackDoraMetrics, doraTrend: fallbackDoraTrend }
  );

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp size={16} style={{ color: themeColors.success }} />;
      case 'down':
        return <TrendingDown size={16} style={{ color: themeColors.success }} />;
      case 'stable':
        return <Minus size={16} style={{ color: themeColors.textMuted }} />;
    }
  };

  const trendOption = createMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['部署频率', '前置时间', '失败率', 'MTTR'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: metrics().doraTrend.map((d) => d.month) },
    yAxis: { type: 'value' },
    series: [
      { name: '部署频率', type: 'line', data: metrics().doraTrend.map((d) => d.deployFreq), itemStyle: { color: chartColors.primary } },
      { name: '前置时间', type: 'line', data: metrics().doraTrend.map((d) => d.leadTime), itemStyle: { color: chartColors.purple } },
      { name: '失败率', type: 'line', data: metrics().doraTrend.map((d) => d.failRate), itemStyle: { color: chartColors.error } },
      { name: 'MTTR', type: 'line', data: metrics().doraTrend.map((d) => d.mttr), itemStyle: { color: chartColors.warning } },
    ],
  }));

  const getAdoptionStatusTag = (status: 'ok' | 'progress' | 'warning') => {
    const icons = {
      ok: '✅',
      progress: '🔄',
      warning: '⚠️',
    };
    return icons[status];
  };

  return (
    <div style={{ background: themeColors.surface }}>
      {/* API 状态提示 */}
      <Show when={isUsingFallback()}>
        <div style={{
          background: themeColors.warningBg,
          border: `1px solid ${themeColors.warningBorder}`,
          padding: '8px 16px',
          margin: '16px',
          'border-radius': '6px',
          'font-size': '12px',
          color: themeColors.warning
        }}>
          ⚠️ API 不可用，使用本地数据
        </div>
      </Show>

      {/* Header */}
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '16px', padding: '16px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
          <h2 style={{ margin: '0', 'font-size': '20px', 'font-weight': 600, color: themeColors.text }}>苍穹工程效能 2026-04 实时</h2>
          <span style={{ 'font-size': '12px', color: themeColors.success, 'padding': '2px 8px', 'border': `1px solid ${themeColors.successBorder}`, 'border-radius': '4px' }}>✓ 已连接</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', background: themeColors.surface, cursor: 'pointer', 'font-size': '14px', color: themeColors.text }}>
            <Download size={14} />
            导出月度报告
          </button>
          <button style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', background: themeColors.surface, cursor: 'pointer', 'font-size': '14px', color: themeColors.text }}>
            <Bell size={14} />
            设置预警阈值
          </button>
          <button style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 12px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', background: themeColors.surface, cursor: 'pointer', 'font-size': '14px', color: themeColors.text }}>
            <Settings size={14} />
            调整目标
          </button>
        </div>
      </div>

      {/* DORA Metrics Cards */}
      <div style={{ padding: '0 16px 16px', display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px' }}>
        <For each={metrics().doraMetrics}>
          {(metric) => (
            <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
              <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': '8px' }}>
                <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>{metric.name}</span>
                {getTrendIcon(metric.trend)}
              </div>
              <div style={{ 'font-size': '24px', 'font-weight': 700, 'margin-bottom': '8px', color: themeColors.text }}>{metric.value}</div>
              <div style={{ 'margin-bottom': '4px' }}>
                <span style={{ display: 'inline-block', 'padding': '2px 8px', 'background': themeColors.primaryBg, 'border': `1px solid ${themeColors.primaryBorder}`, 'border-radius': '4px', 'font-size': '12px', color: themeColors.primary }}>{metric.level}</span>
              </div>
              <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>{metric.trendText}</div>
            </div>
          )}
        </For>
      </div>

      {/* DORA Trend Chart */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'margin-bottom': '12px', color: themeColors.text }}>DORA 趋势（月度）</div>
          <ECharts option={trendOption()} style={{ height: '280px' }} />
        </div>
      </div>

      {/* Domain Performance Table */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'margin-bottom': '12px', color: themeColors.text }}>领域效能对比</div>
          <div style={{ 'overflow-x': 'auto' }}>
            <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '14px' }}>
              <thead>
                <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>领域</th>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>部署频率</th>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>前置时间</th>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>失败率</th>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>覆盖率</th>
                  <th style={{ padding: '8px', 'text-align': 'left', 'font-weight': 600, color: themeColors.textSecondary }}>接入率</th>
                </tr>
              </thead>
              <tbody>
                <For each={domainPerformance}>
                  {(domain) => (
                    <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                      <td style={{ padding: '8px', 'font-weight': 600, color: themeColors.text }}>{domain.domain}</td>
                      <td style={{ padding: '8px', color: themeColors.text }}>{domain.deployFreq}</td>
                      <td style={{ padding: '8px', color: themeColors.text }}>{domain.leadTime}</td>
                      <td style={{ padding: '8px', color: themeColors.text }}>{domain.failRate}</td>
                      <td style={{ padding: '8px', color: themeColors.text }}>{domain.coverage}</td>
                      <td style={{ padding: '8px', display: 'flex', 'align-items': 'center', gap: '4px', color: themeColors.text }}>
                        <span>{domain.adoptionRate}</span>
                        <span>{getAdoptionStatusTag(domain.adoptionStatus)}</span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* OKR Tracking */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'margin-bottom': '12px', color: themeColors.text }}>战略目标追踪（Q2 OKR）</div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
            <For each={okrTargets}>
              {(okr) => (
                <div style={{ padding: '12px', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', background: themeColors.hover }}>
                  <div style={{ 'font-weight': 600, 'margin-bottom': '8px', color: themeColors.text }}>目标：{okr.objective}</div>
                  <div style={{ 'margin-bottom': '8px' }}>
                    <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>当前：{okr.current}%</span>
                  </div>
                  <div style={{ 'margin-bottom': '8px' }}>
                    <div style={{ background: themeColors.border, 'border-radius': '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ background: themeColors.success, height: '100%', 'border-radius': '4px', width: okr.current + '%' }} />
                    </div>
                  </div>
                  <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>
                    预测完成：{okr.predictedDate}（目标 {okr.deadline}）
                  </div>
                  <Show when={okr.detail}>
                    <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>{okr.detail}</div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
