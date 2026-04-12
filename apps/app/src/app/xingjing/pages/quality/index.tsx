import { Component, For } from 'solid-js';
import { BarChart3, AlertTriangle, Shield, CheckCircle } from 'lucide-solid';
import { qualityGates, coverageTrend, aiReviewStats } from '../../mock/quality';
import { pactNetwork } from '../../mock/contracts';
import ECharts from '../../components/common/echarts';

const gateIcons: Record<string, string> = {
  '测试覆盖率': 'icon-bug',
  'SonarQube':  'icon-shield',
  'Pact 契约':  'icon-check',
  '安全扫描':   'icon-lock',
};

const QualityCenter: Component = () => {
  const coverageOption: Record<string, unknown> = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: coverageTrend.map((d) => d.date) },
    yAxis: { type: 'value', min: 60, max: 100 },
    series: [
      {
        type: 'line',
        data: coverageTrend.map((d) => d.value),
        itemStyle: { color: 'themeColors.primary' },
        areaStyle: { color: 'rgba(18,100,229,0.1)' },
        markLine: {
          data: [{ yAxis: 80, name: '目标线' }],
          lineStyle: { color: 'themeColors.error', type: 'dashed' },
          label: { formatter: '目标 80%' },
        },
      },
    ],
  };

  return (
    <div>
      <h2 style={{ 'font-size': '16px', 'font-weight': 600, color: 'themeColors.text', 'margin-bottom': '16px', 'margin-top': '0' }}>质量中心</h2>

      {/* Quality gates */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px', 'margin-bottom': '16px' }}>
        <For each={qualityGates}>
          {(gate) => (
            <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
              <div style={{ display: 'flex', 'align-items': 'flex-start', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
                <span style={{ 'font-size': '20px' }}>{gate.name.includes('覆盖') ? '🐛' : gate.name.includes('Sonar') ? '🛡️' : gate.name.includes('Pact') ? '✅' : '🔒'}</span>
                <span style={{ 'font-size': '16px' }}>{gate.status === 'passed' ? '✅' : '❌'}</span>
              </div>
              <div style={{ 'font-size': '12px', color: 'themeColors.textMuted', 'margin-bottom': '4px' }}>{gate.name}</div>
              <div
                style={{ 'font-size': '16px', 'font-weight': 'bold', color: gate.status === 'passed' ? 'themeColors.success' : 'themeColors.error' }}
              >
                {gate.value}
              </div>
              <div style={{ 'font-size': '11px', color: 'themeColors.border', 'margin-top': '4px' }}>目标: {gate.target}</div>
            </div>
          )}
        </For>
      </div>

      {/* Pact network */}
      <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', 'margin-bottom': '16px', background: 'themeColors.surface' }}>
        <div style={{ padding: '12px 16px', 'border-bottom': '1px solid themeColors.backgroundSecondary', 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary' }}>Pact 契约网络</div>
        <div style={{ padding: '24px', display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '40px', 'flex-wrap': 'wrap' }}>
          {/* Consumer nodes */}
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px' }}>
            <For each={pactNetwork.nodes.filter((n) => n.type === 'consumer')}>
              {(node) => {
                const edge = pactNetwork.edges.find((e) => e.from === node.id);
                return (
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                    <div style={{ padding: '12px 16px', border: '2px solid themeColors.primaryLight', 'border-radius': '6px', 'text-align': 'center', background: 'themeColors.primaryBg', 'min-width': '96px' }}>
                      <div style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.primary' }}>{node.label}</div>
                      <div style={{ 'font-size': '11px', color: 'themeColors.textMuted' }}>(消费方)</div>
                    </div>
                    <div style={{ 'text-align': 'center' }}>
                      <div style={{ 'border-top': '2px solid themeColors.success', width: '80px' }} />
                      <div style={{ 'font-size': '11px', color: 'themeColors.textMuted', 'margin-top': '4px' }}>{edge?.label}</div>
                      <span style={{ 'font-size': '11px', padding: '2px 8px', background: 'themeColors.successBg', color: 'themeColors.success', 'border-radius': '4px', 'display': 'inline-block', 'margin-top': '2px' }}>{edge?.contracts}条契约 ✅</span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Producer node */}
          <div style={{ padding: '20px 32px', border: '2px solid themeColors.primary', 'border-radius': '8px', background: 'themeColors.primaryBg', 'text-align': 'center' }}>
            <div style={{ 'font-weight': 'bold', 'font-size': '14px', color: 'themeColors.primary' }}>cosmic-gl</div>
            <div style={{ 'font-size': '11px', color: 'themeColors.primary' }}>(生产方)</div>
          </div>
        </div>
        <div style={{ 'text-align': 'center', 'font-size': '11px', color: 'themeColors.border', 'padding-bottom': '12px' }}>最后验证：30分钟前 ✅</div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '2fr 1fr', gap: '16px' }}>
        {/* Coverage trend */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
          <div style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary', 'margin-bottom': '8px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <BarChart3 size={14} /> 覆盖率趋势（30天）
          </div>
          <ECharts option={coverageOption} style={{ height: '250px' }} />
        </div>

        {/* AI Review stats */}
        <div style={{ border: '1px solid themeColors.backgroundSecondary', 'border-radius': '8px', padding: '16px', background: 'themeColors.surface' }}>
          <div style={{ 'font-weight': 600, 'font-size': '13px', color: 'themeColors.textSecondary', 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <CheckCircle size={14} /> AI Review 分析（本Sprint）
          </div>
          <div style={{ 'font-size': '12px', color: 'themeColors.text', 'margin-bottom': '12px' }}>
            Review 了 <span style={{ 'font-weight': 600 }}>{aiReviewStats.totalPRs}</span> 个 PR，
            平均评分 <span style={{ 'font-weight': 600 }}>{aiReviewStats.avgScore}/10</span>
          </div>
          <div style={{ 'font-weight': 600, 'font-size': '12px', color: 'themeColors.textMuted', 'margin-bottom': '8px' }}>最常见问题：</div>
          <table style={{ width: '100%', 'font-size': '11px', 'border-collapse': 'collapse' }}>
            <thead>
              <tr style={{ 'border-bottom': '1px solid themeColors.backgroundSecondary' }}>
                <th style={{ 'text-align': 'left', padding: '6px 0', color: 'themeColors.textMuted' }}>问题</th>
                <th style={{ 'text-align': 'left', padding: '6px 0', color: 'themeColors.textMuted' }}>次数</th>
              </tr>
            </thead>
            <tbody>
              <For each={aiReviewStats.commonIssues}>
                {(row) => (
                  <tr style={{ 'border-bottom': '1px solid themeColors.backgroundSecondary' }}>
                    <td style={{ padding: '6px 0', color: 'themeColors.text' }}>{row.issue}</td>
                    <td style={{ padding: '6px 0' }}>
                      <span style={{ padding: '2px 8px', background: 'themeColors.surface7e6', color: 'themeColors.warning', 'border-radius': '4px' }}>{row.count} 次</span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QualityCenter;
