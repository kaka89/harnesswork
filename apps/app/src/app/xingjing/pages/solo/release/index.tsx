import { Component, createSignal, For, Show, onMount } from 'solid-js';
import ECharts from '../../../components/common/echarts';
import { featureFlags as mockFeatureFlags, releases as mockReleases, FeatureFlag, Release } from '../../../mock/solo';
import { readYamlDir } from '../../../services/file-store';
import { useAppStore } from '../../../stores/app-store';
import { Rocket, Zap, Cloud, RefreshCw, CheckCircle, AlertCircle } from 'lucide-solid';

type Env = 'staging' | 'prod';

const statusClass: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  rolledback: 'bg-yellow-100 text-yellow-700',
};

const statusDotColor: Record<string, string> = {
  success: 'chartColors.success',
  failed: 'chartColors.error',
  rolledback: 'chartColors.warning',
};

const SoloRelease: Component = () => {
  const { productStore } = useAppStore();
  const [deployEnv, setDeployEnv] = createSignal<Env>('staging');
  const [deploying, setDeploying] = createSignal(false);
  const [ciProgress, setCiProgress] = createSignal(0);
  const [ciDone, setCiDone] = createSignal(false);
  const [releases, setReleases] = createSignal<Release[]>(mockReleases);
  const [flags, setFlags] = createSignal<FeatureFlag[]>([...mockFeatureFlags]);
  const [rollouts, setRollouts] = createSignal<Record<string, number>>(
    Object.fromEntries(mockFeatureFlags.map((f) => [f.id, f.rollout]))
  );

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    const [releaseFiles, flagFiles] = await Promise.all([
      readYamlDir<Release>('.xingjing/solo/releases', workDir),
      readYamlDir<FeatureFlag>('.xingjing/solo/feature-flags', workDir),
    ]);

    if (releaseFiles.length > 0) setReleases(releaseFiles);
    if (flagFiles.length > 0) {
      setFlags(flagFiles);
      setRollouts(Object.fromEntries(flagFiles.map((f) => [f.id, f.rollout])));
    }
  });

  const handleDeploy = () => {
    setDeploying(true);
    setCiProgress(0);
    setCiDone(false);
    let p = 0;
    const timer = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        setTimeout(() => {
          setDeploying(false);
          setCiDone(true);
        }, 400);
      }
      setCiProgress(Math.min(Math.round(p), 100));
    }, 280);
  };

  const toggleFlag = (id: string, enabled: boolean) => {
    setFlags(prev => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
  };

  const ciSteps = () => [
    { label: '代码检查 (lint + typecheck)', done: !deploying() || ciProgress() > 20, active: deploying() && ciProgress() <= 20 },
    { label: '单元测试', done: !deploying() || ciProgress() > 45, active: deploying() && ciProgress() > 20 && ciProgress() <= 45 },
    { label: '构建 (Next.js build)', done: !deploying() || ciProgress() > 70, active: deploying() && ciProgress() > 45 && ciProgress() <= 70 },
    { label: '部署到 Vercel', done: !deploying() || ciProgress() > 90, active: deploying() && ciProgress() > 70 && ciProgress() <= 90 },
    { label: '健康检查', done: ciDone(), active: deploying() && ciProgress() > 90 },
  ];

  const errorRateOption = () => ({
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['错误率 (%)'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 36 },
    xAxis: {
      type: 'category' as const,
      data: ['4/5', '4/6', '4/7', '4/8', '4/9', '4/10', '4/11'],
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 11, formatter: '{value}%' }, max: 3 },
    series: [{
      name: '错误率 (%)',
      type: 'line',
      smooth: true,
      data: [0.8, 0.5, 0.6, 1.2, 0.4, 0.3, 0.5],
      itemStyle: { color: 'chartColors.error' },
      areaStyle: { opacity: 0.1 },
    }],
  });

  const opsIntegrations = [
    { icon: '▲', name: 'Vercel Analytics', desc: '流量来源、页面访问热力', connected: true, sync: '2026-04-11 14:00' },
    { icon: '🐛', name: 'Sentry', desc: '错误追踪与 Issue 管理', connected: true, sync: '2026-04-11 14:35' },
    { icon: '🟢', name: 'UptimeRobot', desc: '可用性监控与宕机告警', connected: true, sync: '2026-04-11 14:00' },
    { icon: '🔶', name: 'Cloudflare', desc: 'CDN 流量与 Web 安全防护', connected: false },
  ];

  return (
    <div>
      {/* Header */}
      <div class="flex justify-between items-center mb-5">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2 m-0">
          <span class="text-green-600">🚀</span>
          发布管理
        </h2>
        <div class="flex gap-2">
          <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">🛡️ v1.2.3 生产运行中</span>
          <span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">上线 3 天</span>
        </div>
      </div>

      {/* Contrast note */}
      <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4 text-xs text-yellow-800">
        <strong>💡 对比团队版：</strong> 团队版需要 Tech Lead + SRE 双人审批才能发布生产。独立版只有你一个人，所有权限都在你手里，一键发布，秒级决策。
      </div>

      <div class="grid grid-cols-12 gap-4 mb-4">
        {/* Deploy Panel */}
        <div class="col-span-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="font-semibold text-sm text-gray-800 mb-4 flex items-center gap-2">
            ☁️ 一键部署
          </div>

          <div class="flex gap-6 mb-4">
            <div>
              <div class="text-xs text-gray-400 mb-1.5">目标环境</div>
              <select
                class="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                value={deployEnv()}
                onChange={(e) => setDeployEnv(e.currentTarget.value as Env)}
              >
                <option value="staging">🧪 Staging (测试)</option>
                <option value="prod">🚀 Production (生产)</option>
              </select>
            </div>
            <div>
              <div class="text-xs text-gray-400 mb-1.5">分支</div>
              <div class="flex items-center gap-2">
                <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-mono">main</span>
                <span class="text-xs text-gray-400">最新 commit: 3f8a2c1</span>
              </div>
            </div>
          </div>

          {/* CI Progress */}
          <Show when={deploying() || ciDone()}>
            <div class="mb-4">
              <div class="flex justify-between items-center mb-1.5">
                <span class="text-sm text-gray-700">
                  {deploying() ? '⟳ 正在部署...' : '✅ 部署完成'}
                </span>
                <span class="text-sm text-gray-600">{ciProgress()}%</span>
              </div>
              <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  class={`h-full rounded-full transition-all ${deploying() ? 'bg-blue-500' : 'bg-green-500'}`}
                  style={{ width: `${ciProgress()}%` }}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <For each={ciSteps()}>
                  {(step) => (
                    <div class="flex items-center gap-2 text-xs">
                      <Show when={step.active}>
                        <span class="text-blue-500 animate-spin inline-block">⟳</span>
                      </Show>
                      <Show when={!step.active && step.done}>
                        <span class="text-green-500">✓</span>
                      </Show>
                      <Show when={!step.active && !step.done}>
                        <span class="w-3 h-3 rounded-full bg-gray-200 border border-gray-300 inline-block" />
                      </Show>
                      <span class={step.active ? 'text-blue-600' : step.done ? 'text-gray-800' : 'text-gray-300'}>
                        {step.label}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <button
            class={`w-full py-3 rounded-xl text-white font-semibold text-base transition-colors ${
              deploying()
                ? 'bg-gray-400 cursor-not-allowed'
                : deployEnv() === 'prod'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={handleDeploy}
            disabled={deploying()}
          >
            {deploying()
              ? '⟳ 部署中...'
              : `一键部署到 ${deployEnv() === 'prod' ? '🚀 生产' : '🧪 Staging'}`}
          </button>

          <Show when={deployEnv() === 'prod'}>
            <div class="text-center mt-2 text-xs text-gray-400">
              ⚡ 无需审批 · 你是唯一的所有者
            </div>
          </Show>
        </div>

        {/* Feature Flags */}
        <div class="col-span-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-2">
            ⚡ 功能开关 (Feature Flags)
          </div>
          <div class="text-xs text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg mb-3">
            无需重新部署即可控制功能上线范围，快速验证假设
          </div>
          <div class="flex flex-col gap-3">
            <For each={flags()}>
              {(flag) => (
                <div
                  class="p-3 rounded-xl border transition-all"
                  style={{
                    background: flag.enabled ? 'themeColors.primaryBg' : 'themeColors.hover',
                    'border-color': flag.enabled ? 'themeColors.primaryBorder' : 'themeColors.border',
                  }}
                >
                  <div class="flex justify-between items-start mb-1">
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold text-gray-800 truncate">{flag.description}</div>
                      <code class="text-xs text-gray-400">{flag.name}</code>
                    </div>
                    {/* Toggle */}
                    <button
                      class={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-2 relative ${flag.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                      onClick={() => toggleFlag(flag.id, !flag.enabled)}
                    >
                      <span
                        class={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${flag.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </div>
                  <Show when={flag.enabled}>
                    <div class="mt-2">
                      <div class="flex justify-between text-xs text-gray-400 mb-1">
                        <span>用户覆盖比例</span>
                        <span class="font-semibold text-gray-700">{rollouts()[flag.id]}%</span>
                      </div>
                      <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                        <div class="h-full bg-blue-500 rounded-full" style={{ width: `${rollouts()[flag.id]}%` }} />
                      </div>
                      <div class="flex gap-1">
                        <For each={[10, 25, 50, 100]}>
                          {(v) => (
                            <button
                              class={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                rollouts()[flag.id] === v
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => setRollouts(prev => ({ ...prev, [flag.id]: v }))}
                            >
                              {v}%
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Release History */}
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div class="font-semibold text-sm text-gray-800 mb-4">发布记录</div>
        <div class="relative pl-6">
          <div class="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div class="flex flex-col gap-4">
            <For each={releases()}>
              {(r) => (
                <div class="relative">
                  <div
                    class="absolute -left-6 w-3 h-3 rounded-full border-2 border-white mt-0.5"
                    style={{ background: statusDotColor[r.status] }}
                  />
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="font-semibold text-sm text-gray-900">{r.version}</span>
                        <span class={`text-xs px-1.5 py-0.5 rounded ${statusClass[r.status]}`}>
                          {r.status === 'success' ? '成功' : r.status === 'failed' ? '失败' : '已回滚'}
                        </span>
                        <span class={`text-xs px-1.5 py-0.5 rounded ${r.env === 'prod' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {r.env === 'prod' ? '生产' : 'Staging'}
                        </span>
                        <span class="text-xs text-gray-400">⏱ {r.deployTime}</span>
                      </div>
                      <div class="text-sm text-gray-500">{r.summary}</div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="text-xs text-gray-400">{r.date}</span>
                      <Show when={r.status === 'success'}>
                        <button class="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 transition-colors">
                          ↩ 回滚
                        </button>
                      </Show>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Runtime Monitoring */}
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div class="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-2">
          📊 运行监控
        </div>
        <div class="grid grid-cols-4 gap-3 mb-4">
          <For each={[
            { title: '可用性', value: '99.8%', color: 'chartColors.success' },
            { title: '平均响应', value: '148ms', color: 'chartColors.primary' },
            { title: '今日错误', value: '7次', color: 'chartColors.warning' },
            { title: '活跃用户', value: '142 DAU', color: 'chartColors.purple' },
          ]}>
            {(m) => (
              <div class="p-3 rounded-xl border border-gray-100 text-center">
                <div class="text-xs text-gray-400 mb-1">{m.title}</div>
                <div class="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
              </div>
            )}
          </For>
        </div>
        <ECharts option={errorRateOption()} style={{ height: '160px' }} />
        <div class="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
          AI 已分析近 7 天数据：4/8 错误率峰值由「账期计算」API 触发，建议在「构建中」模块添加边界值测试用例。
        </div>
      </div>

      {/* Ops Integrations */}
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div class="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-2">
          🔗 运维对接
        </div>
        <div class="text-xs text-green-600 bg-green-50 px-2.5 py-1.5 rounded-lg mb-3">
          AI 已接入以下系统，可在「数据复盘」模块自动生成运营分析报告
        </div>
        <div class="flex flex-col gap-2.5">
          <For each={opsIntegrations}>
            {(item) => (
              <div
                class="flex items-center justify-between p-3 rounded-xl border transition-colors"
                style={{
                  background: item.connected ? 'themeColors.successBg' : 'themeColors.hover',
                  'border-color': item.connected ? 'themeColors.successBorder' : 'themeColors.border',
                }}
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl">{item.icon}</span>
                  <div>
                    <div class="font-semibold text-sm text-gray-800">{item.name}</div>
                    <div class="text-xs text-gray-400">{item.desc}</div>
                    <Show when={item.sync}>
                      <div class="text-xs text-gray-300">上次同步：{item.sync}</div>
                    </Show>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class={`text-xs px-2 py-0.5 rounded-full ${item.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.connected ? '已连接' : '未连接'}
                  </span>
                  <button class="text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    配置
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default SoloRelease;
