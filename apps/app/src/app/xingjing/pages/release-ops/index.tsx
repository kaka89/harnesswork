import { Component, createSignal, For, Show } from 'solid-js';
import {
  environments, pipelineRuns, systemMetrics, servicesHealth,
  alertEvents, errorTraces, opsIntegrations,
  Environment, PipelineRun, AlertEvent, ErrorTrace, OpsIntegration,
} from '../../mock/releaseOps';
import { Server, CheckCircle, AlertTriangle, Package, BarChart3, Link, Rocket, RefreshCw, Eye, RotateCcw, Shield, Settings } from 'lucide-solid';
import ECharts from '../../components/common/echarts';
import { themeColors, getStatusColor, chartColors } from '../../utils/colors';

const envStatusColor: Record<string, string> = { healthy: themeColors.success, degraded: themeColors.warning, down: themeColors.error };
const envStatusLabel: Record<string, string> = { healthy: '健康', degraded: '降级', down: '宕机' };

const pipelineStatusBg: Record<string, string> = {
  success: themeColors.success, failed: themeColors.error, running: themeColors.primary, pending: themeColors.textMuted,
};
const pipelineStatusLabel: Record<string, string> = {
  success: '成功', failed: '失败', running: '执行中', pending: '待执行',
};
const alertLevelColor: Record<string, string> = { P0: themeColors.error, P1: themeColors.warning, P2: themeColors.warning };
const alertStatusLabel: Record<string, string> = { firing: '告警中', acknowledged: '已确认', resolved: '已解决' };
const alertStatusBg: Record<string, string> = { firing: themeColors.error, acknowledged: themeColors.warning, resolved: themeColors.success };

const ReleaseOps: Component = () => {
  const [activeTab, setActiveTab] = createSignal('pipeline');

  // Pipeline state
  const [targetEnv, setTargetEnv] = createSignal('staging');
  const [branch, setBranch] = createSignal('release/1.3.8');
  const [deploying, setDeploying] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [deployDone, setDeployDone] = createSignal(false);
  const [expandedRun, setExpandedRun] = createSignal<string | null>(null);

  // Issues state — mutable alert list
  const [alertList, setAlertList] = createSignal<AlertEvent[]>(alertEvents);
  const [integrationList, setIntegrationList] = createSignal<OpsIntegration[]>(opsIntegrations);

  const handleDeploy = () => {
    if (targetEnv() === 'prod') {
      alert('生产发布需 SRE + Tech Lead 双人审批，已向审批人发送钉钉通知');
      return;
    }
    setDeploying(true);
    setDeployDone(false);
    setProgress(0);
    let p = 0;
    const timer = setInterval(() => {
      p += Math.random() * 15 + 6;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        setTimeout(() => {
          setDeploying(false);
          setDeployDone(true);
          alert(`🚀 已成功部署到 ${targetEnv() === 'staging' ? 'Staging 环境' : '开发环境'}！`);
        }, 400);
      }
      setProgress(Math.min(Math.round(p), 100));
    }, 300);
  };

  const acknowledgeAlert = (id: string) => {
    setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, status: 'acknowledged' as const } : a));
  };
  const resolveAlert = (id: string) => {
    setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, status: 'resolved' as const } : a));
  };
  const toggleConnection = (id: string) => {
    setIntegrationList((prev) => prev.map((i) => i.id === id ? { ...i, connected: !i.connected } : i));
  };

  const firingCount = () => alertList().filter((a) => a.status === 'firing').length;
  const latest = systemMetrics[systemMetrics.length - 1];
  const avg = (key: keyof typeof latest) =>
    Math.round(systemMetrics.reduce((s, p) => s + (p[key] as number), 0) / systemMetrics.length);

  const systemMetricsChartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['响应时间 (ms)', '错误率 (%)'], bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
    xAxis: { type: 'category' as const, data: systemMetrics.map((m) => m.time), axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value' as const, name: 'ms', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 } },
      { type: 'value' as const, name: '%', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 }, max: 5 },
    ],
    series: [
      { name: '响应时间 (ms)', type: 'line', smooth: true, data: systemMetrics.map((m) => m.responseTime), itemStyle: { color: chartColors.primary }, areaStyle: { opacity: 0.08 } },
      { name: '错误率 (%)', type: 'line', smooth: true, yAxisIndex: 1, data: systemMetrics.map((m) => m.errorRate), itemStyle: { color: chartColors.error }, areaStyle: { opacity: 0.08 } },
    ],
  };

  const cpuMemChartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['CPU (%)', '内存 (%)'], bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 40 },
    xAxis: { type: 'category' as const, data: systemMetrics.map((m) => m.time), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value' as const, max: 100, axisLabel: { fontSize: 11, formatter: '{value}%' } },
    series: [
      { name: 'CPU (%)', type: 'line', smooth: true, data: systemMetrics.map((m) => m.cpu), itemStyle: { color: chartColors.purple }, areaStyle: { opacity: 0.08 } },
      { name: '内存 (%)', type: 'line', smooth: true, data: systemMetrics.map((m) => m.memory), itemStyle: { color: chartColors.warning }, areaStyle: { opacity: 0.08 } },
    ],
  };

  // ─── Tab: Pipeline ─────────────────────────────────────────────────────────

  const renderPipeline = () => (
    <div>
      {/* 环境卡片 */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px', 'margin-bottom': '16px' }}>
        <For each={environments}>
          {(env) => (
            <div style={{ background: env.status === 'degraded' ? themeColors.warningBg : themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'border-left': `3px solid ${env.color}` }}>
              <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start' }}>
                <div>
                  <div style={{ 'font-weight': 'bold', 'font-size': '14px' }}>{env.label}</div>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-top': '4px' }}>
                    <span style={{ background: envStatusColor[env.status], width: '8px', height: '8px', 'border-radius': '50%', display: 'inline-block' }} />
                    <span style={{ 'font-size': '12px' }}>{envStatusLabel[env.status]}</span>
                    <span style={{ background: env.color, color: themeColors.surface, padding: '1px 7px', 'border-radius': '3px', 'font-size': '11px' }}>{env.version}</span>
                  </div>
                  <div style={{ 'margin-top': '6px', 'font-size': '12px', color: themeColors.textMuted }}>
                    <div>健康服务 {env.healthyServices}/{env.services}</div>
                    <div>运行 {env.uptime}</div>
                  </div>
                </div>
                <div style={{ 'text-align': 'right', 'font-size': '11px', color: themeColors.textMuted }}>
                  <div>最后部署</div>
                  <div>{env.lastDeployedAt}</div>
                  <div>{env.lastDeployedBy}</div>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* 发起部署面板 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-bottom': '16px' }}>
        <div style={{ 'font-weight': '600', 'font-size': '14px', 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <Rocket size={14} />发起部署
        </div>
        {/* 生产环境提示 */}
        <Show when={targetEnv() === 'prod'}>
          <div style={{ background: themeColors.warningBg, border: `1px solid ${themeColors.warningBorder}`, padding: '8px 12px', 'border-radius': '6px', 'margin-bottom': '12px', 'font-size': '12px', color: themeColors.warning }}>
            ⚠️ 生产环境发布需要 SRE + Tech Lead 双人审批，审批通过后自动触发流水线。
          </div>
        </Show>
        <div style={{ display: 'flex', gap: '16px', 'align-items': 'flex-end', 'flex-wrap': 'wrap' }}>
          <div>
            <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '4px' }}>目标环境</div>
            <select
              value={targetEnv()}
              onChange={(e) => setTargetEnv(e.currentTarget.value)}
              style={{ padding: '7px 10px', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', 'font-size': '13px', width: '160px' }}
            >
              <option value="dev">🛠 开发环境</option>
              <option value="staging">🧪 Staging 环境</option>
              <option value="prod">🚀 生产环境（需审批）</option>
            </select>
          </div>
          <div>
            <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '4px' }}>分支</div>
            <select
              value={branch()}
              onChange={(e) => setBranch(e.currentTarget.value)}
              style={{ padding: '7px 10px', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', 'font-size': '13px', width: '200px' }}
            >
              <option value="release/1.3.8">release/1.3.8</option>
              <option value="main">main</option>
              <option value="feature/ai-search">feature/ai-search</option>
            </select>
          </div>
          <button
            style={{
              background: deploying() ? themeColors.border : targetEnv() === 'prod' ? themeColors.warning : themeColors.primary,
              color: themeColors.surface, border: 'none', padding: '8px 20px', 'border-radius': '4px',
              cursor: deploying() ? 'default' : 'pointer', 'font-size': '13px', 'font-weight': '600',
              display: 'flex', 'align-items': 'center', gap: '6px',
            }}
            disabled={deploying()}
            onClick={handleDeploy}
          >
            <Rocket size={13} />
            {deploying() ? '部署中...' : targetEnv() === 'prod' ? '发起审批' : '一键部署'}
          </button>
        </div>
        <Show when={deploying() || deployDone()}>
          <div style={{ 'margin-top': '14px' }}>
            <div style={{ background: themeColors.primaryBg, height: '8px', 'border-radius': '4px', overflow: 'hidden' }}>
              <div style={{
                background: deploying() ? themeColors.primary : themeColors.success,
                height: '100%', width: `${progress()}%`, transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ 'margin-top': '4px', 'font-size': '12px', color: themeColors.textSecondary }}>{progress()}%</div>
          </div>
        </Show>
      </div>

      {/* 流水线历史 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': '600', 'margin-bottom': '12px' }}>流水线执行记录</div>
        <div style={{ 'overflow-x': 'auto' }}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.border}`, color: themeColors.textSecondary }}>
                <th style={{ 'text-align': 'left', padding: '8px' }}>版本</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>分支</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>目标环境</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>触发人</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>触发时间</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>状态</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>耗时</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>阶段</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              <For each={pipelineRuns}>
                {(run) => (
                  <>
                    <tr style={{ 'border-bottom': `1px solid ${themeColors.border}`, cursor: 'pointer' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ 'font-weight': 'bold', 'font-size': '13px' }}>{run.version}</div>
                        <div style={{ 'font-size': '11px', color: themeColors.textSecondary }}>{run.branch}</div>
                      </td>
                      <td style={{ padding: '8px' }}>{run.branch}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          background: run.targetEnv === 'dev' ? themeColors.primaryBg : run.targetEnv === 'staging' ? themeColors.purpleBg : themeColors.successBg,
                          color: run.targetEnv === 'dev' ? themeColors.primary : run.targetEnv === 'staging' ? themeColors.purple : themeColors.success,
                          padding: '2px 7px', 'border-radius': '3px', 'font-size': '11px',
                        }}>
                          {run.targetEnv === 'dev' ? '开发' : run.targetEnv === 'staging' ? 'Staging' : '生产'}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>{run.triggeredBy}</td>
                      <td style={{ padding: '8px' }}>{run.triggeredAt}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: pipelineStatusBg[run.status], color: run.status === 'pending' ? themeColors.textSecondary : themeColors.surface, padding: '2px 7px', 'border-radius': '3px', 'font-size': '11px', 'font-weight': 'bold' }}>
                          {pipelineStatusLabel[run.status]}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>{run.duration}</td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <For each={run.stages}>
                            {(stage) => (
                              <span
                                title={`${stage.name} · ${stage.duration}`}
                                style={{
                                  width: '12px', height: '12px', 'border-radius': '50%', display: 'inline-block',
                                  background: stage.status === 'success' ? themeColors.success : stage.status === 'failed' ? themeColors.error : stage.status === 'running' ? themeColors.primary : themeColors.border,
                                }}
                              />
                            )}
                          </For>
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, padding: '2px 8px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px', display: 'flex', 'align-items': 'center', gap: '3px' }}
                            onClick={() => setExpandedRun(expandedRun() === run.id ? null : run.id)}
                          >
                            <Eye size={11} /> 日志
                          </button>
                          <Show when={run.status === 'success' && run.targetEnv === 'prod'}>
                            <button style={{ background: 'transparent', border: `1px solid ${themeColors.error}`, color: themeColors.error, padding: '2px 8px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px', display: 'flex', 'align-items': 'center', gap: '3px' }}>
                              <RotateCcw size={11} /> 回滚
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                    <Show when={expandedRun() === run.id}>
                      <tr>
                        <td colSpan={9} style={{ padding: '12px 16px', background: themeColors.hover, 'border-bottom': `1px solid ${themeColors.border}` }}>
                          <div style={{ 'font-weight': 'bold', 'margin-bottom': '8px', 'font-size': '12px' }}>提交：{run.commitMsg}</div>
                          <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }}>
                            <For each={run.stages}>
                              {(stage) => (
                                <div style={{ background: themeColors.surface, padding: '6px 12px', 'border-radius': '4px', 'border-left': `3px solid ${stage.status === 'success' ? themeColors.success : stage.status === 'failed' ? themeColors.error : stage.status === 'running' ? themeColors.primary : themeColors.border}` }}>
                                  <div style={{ 'font-size': '12px', 'font-weight': 'bold' }}>{stage.name}</div>
                                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary }}>{stage.duration}</div>
                                </div>
                              )}
                            </For>
                          </div>
                        </td>
                      </tr>
                    </Show>
                  </>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── Tab: Monitoring ────────────────────────────────────────────────────────

  const renderMonitoring = () => (
    <div>
      {/* 关键指标卡片 */}
      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '16px', 'margin-bottom': '16px' }}>
        {[
          { title: '系统可用性', value: '99.82%', color: themeColors.success },
          { title: '平均响应时间', value: `${avg('responseTime')}ms`, color: avg('responseTime') > 200 ? themeColors.warning : themeColors.primary },
          { title: '平均错误率', value: `${(systemMetrics.reduce((s, p) => s + p.errorRate, 0) / systemMetrics.length).toFixed(2)}%`, color: themeColors.warning },
          { title: '平均 CPU', value: `${avg('cpu')}%`, color: themeColors.purple },
        ].map((m) => (
          <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
            <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>{m.title}</div>
            <div style={{ 'font-size': '24px', 'font-weight': '700', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* 图表 */}
      <div style={{ display: 'grid', 'grid-template-columns': '7fr 5fr', gap: '16px', 'margin-bottom': '16px' }}>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': '600', 'margin-bottom': '12px' }}>近 24h 响应时间 & 错误率</div>
          <ECharts option={systemMetricsChartOption} style={{ height: '220px' }} />
        </div>
        <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
          <div style={{ 'font-weight': '600', 'margin-bottom': '12px' }}>近 24h CPU & 内存</div>
          <ECharts option={cpuMemChartOption} style={{ height: '220px' }} />
        </div>
      </div>

      {/* 服务健康 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': '600', 'margin-bottom': '12px' }}>服务健康状态</div>
        <div style={{ 'overflow-x': 'auto' }}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.border}`, color: themeColors.textSecondary }}>
                <th style={{ 'text-align': 'left', padding: '8px' }}>服务名称</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>类型</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>状态</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>响应时间</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>错误率</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>实例数</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>版本</th>
              </tr>
            </thead>
            <tbody>
              <For each={servicesHealth}>
                {(svc) => (
                  <tr style={{ 'border-bottom': `1px solid ${themeColors.border}`, background: svc.status === 'degraded' ? themeColors.warningBg : 'transparent' }}>
                    <td style={{ padding: '8px', 'font-weight': 'bold' }}>{svc.name}</td>
                    <td style={{ padding: '8px' }}><span style={{ background: themeColors.border, padding: '1px 6px', 'border-radius': '3px' }}>{svc.type}</span></td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ color: envStatusColor[svc.status], display: 'flex', 'align-items': 'center', gap: '4px' }}>
                        <span style={{ width: '7px', height: '7px', 'border-radius': '50%', background: envStatusColor[svc.status], display: 'inline-block' }} />
                        {envStatusLabel[svc.status]}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: svc.responseTime > 300 ? themeColors.error : svc.responseTime > 200 ? themeColors.warning : themeColors.success, 'font-weight': '600' }}>{svc.responseTime} ms</td>
                    <td style={{ padding: '8px', color: svc.errorRate > 1 ? themeColors.error : svc.errorRate > 0.5 ? themeColors.warning : themeColors.success }}>{svc.errorRate}%</td>
                    <td style={{ padding: '8px' }}>{svc.instances} 个</td>
                    <td style={{ padding: '8px' }}><span style={{ background: themeColors.primaryBg, color: themeColors.primary, padding: '1px 7px', 'border-radius': '3px' }}>{svc.version}</span></td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── Tab: Issues ────────────────────────────────────────────────────────────

  const renderIssues = () => (
    <div>
      <Show when={firingCount() > 0}>
        <div style={{ background: themeColors.errorBg, border: `1px solid ${themeColors.errorBorder}`, padding: '10px 14px', 'border-radius': '6px', 'margin-bottom': '16px', 'font-size': '13px', color: themeColors.error, display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <AlertTriangle size={14} />
          当前有 {firingCount()} 个告警正在触发，请及时处理
        </div>
      </Show>

      {/* 告警事件 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-bottom': '16px' }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '12px' }}>
          <div style={{ 'font-weight': '600', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <AlertTriangle size={14} style={{ color: themeColors.error }} />告警事件
          </div>
          <button style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, padding: '3px 10px', 'border-radius': '4px', cursor: 'pointer', 'font-size': '12px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
            <RefreshCw size={11} /> 刷新
          </button>
        </div>
        <For each={alertList()}>
          {(alert) => (
            <div style={{
              background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'margin-bottom': '8px',
              'border-left': `3px solid ${alertLevelColor[alert.level]}`,
            }}>
              <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ background: alertLevelColor[alert.level], color: themeColors.surface, padding: '1px 7px', 'border-radius': '3px', 'font-size': '11px', 'font-weight': '700' }}>{alert.level}</span>
                    <span style={{ 'font-weight': '600', 'font-size': '13px' }}>{alert.title}</span>
                  </div>
                  <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '4px' }}>{alert.description}</div>
                  <div style={{ 'font-size': '11px', color: themeColors.textSecondary }}>
                    <span style={{ background: themeColors.border, padding: '1px 6px', 'border-radius': '3px', 'margin-right': '8px' }}>{alert.source}</span>
                    {alert.firedAt}
                  </div>
                </div>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-shrink': '0', 'margin-left': '12px' }}>
                  <span style={{ background: alertStatusBg[alert.status], color: themeColors.surface, padding: '3px 9px', 'border-radius': '3px', 'font-size': '11px' }}>
                    {alertStatusLabel[alert.status]}
                  </span>
                  <Show when={alert.status === 'firing'}>
                    <button
                      style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, color: themeColors.primary, padding: '3px 9px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px' }}
                      onClick={() => acknowledgeAlert(alert.id)}
                    >确认</button>
                  </Show>
                  <Show when={alert.status !== 'resolved'}>
                    <button
                      style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, padding: '3px 9px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px' }}
                      onClick={() => resolveAlert(alert.id)}
                    >标记解决</button>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* 错误追踪 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': '600', 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          错误追踪 Top {errorTraces.length}
        </div>
        <div style={{ 'overflow-x': 'auto' }}>
          <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '12px' }}>
            <thead>
              <tr style={{ 'border-bottom': `1px solid ${themeColors.border}`, color: themeColors.textSecondary }}>
                <th style={{ 'text-align': 'left', padding: '8px' }}>错误类型</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>所属服务</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>次数</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>影响用户</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>首次 / 最近</th>
                <th style={{ 'text-align': 'left', padding: '8px' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              <For each={errorTraces}>
                {(err) => (
                  <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                    <td style={{ padding: '8px' }}>
                      <span style={{ background: themeColors.errorBg, color: themeColors.error, padding: '1px 7px', 'border-radius': '3px', 'font-size': '11px', 'font-weight': '600' }}>{err.type}</span>
                      <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'margin-top': '3px', 'word-break': 'break-all' }}>{err.message.substring(0, 60)}...</div>
                    </td>
                    <td style={{ padding: '8px' }}>{err.service}</td>
                    <td style={{ padding: '8px', 'font-weight': 'bold', color: err.count > 100 ? themeColors.error : themeColors.warning }}>{err.count}</td>
                    <td style={{ padding: '8px' }}>
                      {err.affectedUsers > 0
                        ? <span style={{ background: themeColors.errorBg, color: themeColors.error, padding: '1px 7px', 'border-radius': '3px', 'font-size': '11px' }}>{err.affectedUsers} 人</span>
                        : <span style={{ color: themeColors.textSecondary, 'font-size': '11px' }}>无</span>
                      }
                    </td>
                    <td style={{ padding: '8px', 'font-size': '11px', color: themeColors.textSecondary }}>{err.firstSeen} ~ {err.lastSeen}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        background: err.status === 'open' ? themeColors.errorBg : err.status === 'ignored' ? themeColors.hover : themeColors.successBg,
                        color: err.status === 'open' ? themeColors.error : err.status === 'ignored' ? themeColors.textSecondary : themeColors.success,
                        padding: '1px 7px', 'border-radius': '3px', 'font-size': '11px',
                      }}>
                        {err.status === 'open' ? '待处理' : err.status === 'ignored' ? '已忽略' : '已解决'}
                      </span>
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

  // ─── Tab: Integrations ──────────────────────────────────────────────────────

  const renderIntegrations = () => (
    <div>
      <div style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, padding: '10px 14px', 'border-radius': '6px', 'margin-bottom': '16px', 'font-size': '12px', color: themeColors.primary }}>
        📡 通过 Webhook 或 Open API 接入运维系统后，AI 可自动拉取指标、分析问题并生成运维报告。
      </div>

      <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px', 'margin-bottom': '20px' }}>
        <For each={integrationList()}>
          {(item) => (
            <div style={{
              background: themeColors.surface, padding: '16px', 'border-radius': '8px',
              border: `1px solid ${themeColors.border}`,
              'border-left': `3px solid ${item.connected ? themeColors.success : themeColors.border}`,
            }}>
              <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'flex-start', 'margin-bottom': '10px' }}>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
                  <span style={{ 'font-size': '24px' }}>{item.icon}</span>
                  <div>
                    <div style={{ 'font-weight': 'bold', 'font-size': '14px' }}>{item.name}</div>
                    <div style={{ display: 'flex', gap: '4px', 'margin-top': '3px' }}>
                      <span style={{ background: themeColors.border, color: themeColors.textSecondary, padding: '1px 6px', 'border-radius': '8px', 'font-size': '10px' }}>{item.category}</span>
                      <span style={{ background: item.connected ? themeColors.successBg : themeColors.hover, color: item.connected ? themeColors.success : themeColors.textSecondary, padding: '1px 6px', 'border-radius': '8px', 'font-size': '10px' }}>
                        {item.connected ? '已连接' : '未连接'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px', 'line-height': '1.5' }}>{item.description}</div>
              <Show when={item.connected && item.lastSyncAt}>
                <div style={{ 'font-size': '11px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>上次同步：{item.lastSyncAt}</div>
              </Show>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{ background: 'transparent', border: `1px solid ${themeColors.border}`, padding: '3px 10px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px', display: 'flex', 'align-items': 'center', gap: '3px' }}>
                  <Settings size={11} /> 配置
                </button>
                <Show when={item.connected && item.endpoint}>
                  <button style={{ background: 'transparent', border: `1px solid ${themeColors.primaryBorder}`, color: themeColors.primary, padding: '3px 10px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px', display: 'flex', 'align-items': 'center', gap: '3px' }}
                    onClick={() => window.open(item.endpoint, '_blank')}>
                    <Link size={11} /> 跳转
                  </button>
                </Show>
                <button
                  style={{
                    background: 'transparent',
                    border: `1px solid ${item.connected ? themeColors.error : themeColors.success}`,
                    color: item.connected ? themeColors.error : themeColors.success,
                    padding: '3px 10px', 'border-radius': '3px', cursor: 'pointer', 'font-size': '11px', 'margin-left': 'auto',
                  }}
                  onClick={() => toggleConnection(item.id)}
                >
                  {item.connected ? '断开' : '接入'}
                </button>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* AI 运维洞察能力 */}
      <div style={{ background: themeColors.surface, padding: '16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}` }}>
        <div style={{ 'font-weight': '600', 'font-size': '14px', 'margin-bottom': '14px' }}>AI 运维洞察能力</div>
        <div style={{ display: 'grid', 'grid-template-columns': 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { icon: '🤖', title: '自动根因分析', desc: 'AI 接入 Prometheus + SkyWalking 后，可自动关联指标和链路，定位告警根因' },
            { icon: '📋', title: '运维周报生成', desc: '每周自动生成服务可用性、错误趋势、性能变化报告，导出至知识中心' },
            { icon: '🔮', title: '容量预测', desc: '分析历史 CPU/内存趋势，预测下周资源需求，提前发出扩容建议' },
            { icon: '🚨', title: '智能告警降噪', desc: '自动合并相关告警、过滤已知误报、优先推送真实 P0/P1 事件' },
          ].map((f) => (
            <div style={{ padding: '12px', background: themeColors.primaryBg, 'border-radius': '8px' }}>
              <div style={{ 'font-size': '24px', 'margin-bottom': '6px' }}>{f.icon}</div>
              <div style={{ 'font-weight': '600', 'font-size': '13px', 'margin-bottom': '4px' }}>{f.title}</div>
              <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'line-height': '1.5' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Main ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ 'margin-bottom': '16px', display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
        <h2 style={{ margin: 0, 'font-size': '20px', display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <Server size={20} style={{ color: themeColors.primary }} />发布与运维中心
        </h2>
        <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
          <Show when={firingCount() > 0}>
            <span style={{ background: themeColors.errorBg, color: themeColors.error, border: `1px solid ${themeColors.errorBorder}`, padding: '3px 10px', 'border-radius': '4px', 'font-size': '12px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> {firingCount()} 个告警触发中
            </span>
          </Show>
          <span style={{ background: themeColors.successBg, color: themeColors.success, border: `1px solid ${themeColors.successBorder}`, padding: '3px 10px', 'border-radius': '4px', 'font-size': '12px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
            <Shield size={12} /> 生产 v1.3.7 运行中
          </span>
          <span style={{ background: themeColors.primaryBg, color: themeColors.primary, border: `1px solid ${themeColors.primaryBorder}`, padding: '3px 10px', 'border-radius': '4px', 'font-size': '12px' }}>
            上线 3 天 | 可用性 99.82%
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', 'margin-bottom': '16px', 'border-bottom': `1px solid ${themeColors.border}` }}>
        <For each={[
          { key: 'pipeline', label: '发布流水线', Icon: Package },
          { key: 'monitoring', label: '运行监控', Icon: BarChart3 },
          { key: 'issues', label: '问题分析', badge: firingCount() > 0 ? firingCount() : 0 },
          { key: 'integrations', label: '运维对接', Icon: Link },
        ]}>
          {(tab) => (
            <button
              style={{
                background: activeTab() === tab.key ? themeColors.primary : 'transparent',
                color: activeTab() === tab.key ? themeColors.surface : themeColors.textSecondary,
                border: 'none', padding: '8px 16px', 'border-radius': '4px 4px 0 0',
                cursor: 'pointer', 'font-size': '14px', display: 'inline-flex', 'align-items': 'center', gap: '6px',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <Show when={(tab as any).badge > 0}>
                <span style={{ background: themeColors.error, color: themeColors.surface, 'font-size': '10px', padding: '1px 5px', 'border-radius': '8px' }}>
                  {(tab as any).badge}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <Show when={activeTab() === 'pipeline'}>{renderPipeline()}</Show>
      <Show when={activeTab() === 'monitoring'}>{renderMonitoring()}</Show>
      <Show when={activeTab() === 'issues'}>{renderIssues()}</Show>
      <Show when={activeTab() === 'integrations'}>{renderIntegrations()}</Show>
    </div>
  );
};

export default ReleaseOps;
