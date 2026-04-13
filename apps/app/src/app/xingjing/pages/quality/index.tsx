import { Component, For } from 'solid-js';
import { BarChart3, AlertTriangle, Shield, CheckCircle, Bug, Lock } from 'lucide-solid';
import { qualityGates, coverageTrend, aiReviewStats } from '../../mock/quality';
import { pactNetwork } from '../../mock/contracts';
import ECharts from '../../components/common/echarts';
import { themeColors } from '../../utils/colors';

const gateIcons: Record<string, any> = {
  '测试覆盖率': Bug,
  'SonarQube':  Shield,
  'Pact 契约':  CheckCircle,
  '安全扫描':   Lock,
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
        itemStyle: { color: '#1264e5' },
        areaStyle: { color: 'rgba(18,100,229,0.1)' },
        markLine: {
          data: [{ yAxis: 80, name: '目标线' }],
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
          label: { formatter: '目标 80%' },
        },
      },
    ],
  };

  return (
    <div>
      <h2 style={{ 'font-size': '20px', 'font-weight': 600, color: themeColors.textPrimary, 'margin-bottom': '16px', 'margin-top': '0' }}>质量中心</h2>

      {/* Quality gates */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px', 'margin-bottom': '16px' }}>
        <For each={qualityGates}>
          {(gate) => {
            const IconComp = gateIcons[gate.name] || CheckCircle;
            return (
              <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface, transition: 'box-shadow 0.2s, transform 0.2s', cursor: 'default' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px' }}>{gate.name}</div>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                  <IconComp size={16} style={{ color: gate.status === 'passed' ? themeColors.success : themeColors.error }} />
                  <span style={{ 'font-size': '20px', 'font-weight': 'bold', color: gate.status === 'passed' ? themeColors.success : themeColors.error }}>
                    {gate.value}
                  </span>
                  <span style={{ 'font-size': '14px' }}>{gate.status === 'passed' ? '✅' : '❌'}</span>
                </div>
                <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-top': '4px' }}>目标: {gate.target}</div>
              </div>
            );
          }}
        </For>
      </div>

      {/* Pact network */}
      <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', 'margin-bottom': '16px', background: themeColors.surface }}>
        <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.borderLight}`, 'font-weight': 600, 'font-size': '14px', color: themeColors.textPrimary }}>Pact 契约网络</div>
        <div style={{ padding: '30px 0', display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '40px', 'flex-wrap': 'wrap' }}>
          {/* Consumer nodes */}
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '20px' }}>
            <For each={pactNetwork.nodes.filter((n) => n.type === 'consumer')}>
              {(node) => {
                const edge = pactNetwork.edges.find((e) => e.from === node.id);
                return (
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                    <div style={{ padding: '12px 20px', border: `2px solid ${themeColors.success}`, 'border-radius': '8px', 'text-align': 'center', background: themeColors.successBg, 'min-width': '100px' }}>
                      <div style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.success }}>{node.label}</div>
                      <div style={{ 'font-size': '11px', color: '#8c8c8c' }}>(消费方)</div>
                    </div>
                    <div style={{ 'text-align': 'center' }}>
                      <div style={{ 'border-top': `2px solid ${themeColors.success}`, width: '80px' }} />
                      <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '4px' }}>{edge?.label}</div>
                      <span style={{ 'font-size': '11px', padding: '2px 8px', background: themeColors.successBg, color: themeColors.success, 'border-radius': '4px', display: 'inline-block', 'margin-top': '2px' }}>{edge?.contracts}条契约 ✅</span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Producer node */}
          <div style={{ padding: '20px 30px', border: '2px solid #1890ff', 'border-radius': '8px', background: themeColors.primaryBg, 'text-align': 'center' }}>
            <div style={{ 'font-weight': 600, 'font-size': '13px', color: '#1890ff' }}>cosmic-gl</div>
            <div style={{ 'font-size': '11px', color: '#096dd9' }}>(生产方)</div>
          </div>
        </div>
        <div style={{ 'text-align': 'center', 'font-size': '12px', color: themeColors.textSecondary, 'padding-bottom': '12px' }}>最后验证：30分钟前 ✅</div>
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': '7fr 5fr', gap: '16px' }}>
        {/* Coverage trend */}
        <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', padding: '12px 16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.textPrimary, 'margin-bottom': '8px' }}>
            覆盖率趋势（30天）
          </div>
          <ECharts option={coverageOption} style={{ height: '250px' }} />
        </div>

        {/* AI Review stats */}
        <div style={{ border: `1px solid ${themeColors.borderLight}`, 'border-radius': '8px', padding: '12px 16px', background: themeColors.surface }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.textPrimary, 'margin-bottom': '12px' }}>
            AI Review 分析（本Sprint）
          </div>
          <div style={{ 'font-size': '14px', color: themeColors.textPrimary, 'margin-bottom': '16px' }}>
            <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '4px' }}>Review 的 PR 数</div>
            <span style={{ 'font-size': '20px', 'font-weight': 'bold' }}>{aiReviewStats.totalPRs}</span>
            <span style={{ 'font-size': '14px', color: themeColors.textSecondary }}> 个，平均评分 {aiReviewStats.avgScore}/10</span>
          </div>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.textPrimary, 'margin-bottom': '8px' }}>最常见问题：</div>
          <table style={{ width: '100%', 'font-size': '13px', 'border-collapse': 'collapse' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.borderLight}`, background: '#fafafa' }}>
                <th style={{ 'text-align': 'left', padding: '8px 0', color: themeColors.textMuted, 'font-size': '12px', 'font-weight': 600 }}>问题</th>
                <th style={{ 'text-align': 'left', padding: '8px 0', color: themeColors.textMuted, 'font-size': '12px', 'font-weight': 600 }}>次数</th>
                <th style={{ 'text-align': 'left', padding: '8px 0', color: themeColors.textMuted, 'font-size': '12px', 'font-weight': 600 }}>建议</th>
              </tr>
            </thead>
            <tbody>
              <For each={aiReviewStats.commonIssues}>
                {(row) => (
                  <tr style={{ 'border-bottom': `1px solid ${themeColors.borderLight}` }}>
                    <td style={{ padding: '8px 0', color: themeColors.textPrimary }}>{row.issue}</td>
                    <td style={{ padding: '8px 0' }}>
                      <span style={{ padding: '0 7px', background: '#fff7e6', color: '#d46b08', 'border-radius': '4px', border: '1px solid #ffd591', 'font-size': '12px' }}>{row.count} 次</span>
                    </td>
                    <td style={{ padding: '8px 0', color: themeColors.textSecondary, 'font-size': '12px' }}>{(row as any).suggestion || '-'}</td>
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
