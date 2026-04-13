import { Component, createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { Palette, Bot, Github, Clock, ShieldCheck, Sun, Moon, Save, FlaskConical, Zap, CheckCircle, AlertCircle, MessageSquare, X, Send, Loader, Package, Trash2, ChevronDown, ChevronUp, FolderOpen } from 'lucide-solid';
import { useAppStore } from '../../stores/app-store';
import { themeColors, chartColors } from '../../utils/colors';
import { callAgent, setProviderAuth, gitSync } from '../../services/opencode-client';
import { saveProjectSettings, loadProjectSettings } from '../../services/file-store';
import {
  defaultLLMConfig, modelOptions, LLMConfig, ModelOption,
  defaultGitRepos, GitRepoConfig,
  defaultScheduledTasks, ScheduledTask,
  defaultGateNodes, GateNode,
} from '../../mock/settings';
import { getAllGitTokens, setGitToken, clearGitToken, type XingjingProduct } from '../../services/product-store';
import { deleteProductDir } from '../../../lib/tauri';
import { isTauriRuntime } from '../../../utils';
import AddDomainAppModal from '../../components/product/add-domain-app-modal';

const inputStyle = () => ({
  border: `1px solid ${themeColors.border}`,
  background: themeColors.surface,
  color: themeColors.text,
});

// ===================== Tab1: Theme =====================
const ThemeTab: Component = () => {
  const { state, actions } = useAppStore();

  const previewColors = () => state.themeMode === 'light'
    ? { bg: '#ffffff', text: '#000000', card: '#fafafa', border: '#d9d9d9' }
    : { bg: '#141414', text: '#ffffffd9', card: '#1f1f1f', border: '#434343' };

  const colorSwatches = () => [
    { label: '主色', color: '#1264e5' },
    { label: '背景色', color: previewColors().bg },
    { label: '卡片色', color: previewColors().card },
    { label: '文字色', color: previewColors().text },
    { label: '边框色', color: previewColors().border },
  ];

  return (
    <div class="space-y-4">
      <div class="rounded-xl p-4" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <div class="font-semibold text-sm mb-3" style={{ color: themeColors.text }}>界面主题</div>
        <div class="flex gap-2">
          <For each={(['light', 'dark'] as const)}>
            {(mode) => (
              <button
                class="px-6 py-2 text-sm rounded-lg transition-colors"
                style={{
                  background: state.themeMode === mode ? chartColors.primary : themeColors.surface,
                  color: state.themeMode === mode ? 'white' : themeColors.textSecondary,
                  border: `1px solid ${state.themeMode === mode ? chartColors.primary : themeColors.border}`,
                }}
                onClick={() => actions.setThemeMode(mode)}
              >
                {mode === 'light' ? <><Sun size={14} class="inline mr-1" />明亮模式</> : <><Moon size={14} class="inline mr-1" />暗黑模式</>}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="rounded-xl p-4" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <div class="font-semibold text-sm mb-3" style={{ color: themeColors.text }}>当前主题预览</div>
        <div class="flex gap-4">
          <For each={colorSwatches()}>
            {(item) => (
              <div class="text-center">
                <div
                  class="w-14 h-14 rounded-lg mx-auto mb-2"
                  style={{ background: item.color, border: `1px solid ${themeColors.border}` }}
                />
                <div class="text-xs" style={{ color: themeColors.textMuted }}>{item.label}</div>
                <div class="text-xs font-mono" style={{ color: themeColors.textMuted }}>{item.color}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

// ===================== Tab2: LLM Config =====================
const LLMTab: Component = () => {
  const { state, actions, productStore } = useAppStore();
  const [config, setConfig] = createSignal<LLMConfig>({ ...state.llmConfig });
  const [testing, setTesting] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [testResult, setTestResult] = createSignal('');
  // OpenWork 同步状态：null=未检查, true=已同步, false=本地保存
  const [owSyncStatus, setOwSyncStatus] = createSignal<null | boolean>(null);

  // onMount：优先从 OpenWork 读取当前模型配置
  onMount(async () => {
    try {
      const owConfig = await actions.readOpencodeConfig();
      if (owConfig && typeof owConfig === 'object') {
        const c = owConfig as Record<string, unknown>;
        const model = c['model'] as Record<string, string> | undefined;
        if (model?.provider || model?.id) {
          // 找到匹配的 modelOptions
          const matched = modelOptions.find(
            o => o.providerID === model?.provider && (o.modelID === model?.id || !model?.id)
          );
          if (matched) {
            setConfig(prev => ({
              ...prev,
              providerID: matched.providerID,
              modelID: matched.modelID,
              modelName: matched.label,
              apiUrl: matched.defaultApiUrl || prev.apiUrl,
            }));
          }
        }
      }
    } catch {
      // 降级：保持本地 settings.yaml 的配置（已在 state.llmConfig）
    }
  });

  // 当前选中模型的完整配置项
  const currentModelOpt = (): ModelOption | undefined =>
    modelOptions.find(o => o.modelID === config().modelID || o.value === config().modelName);

  // 选择模型时自动带出 API 地址、providerID、modelID
  const handleModelChange = (value: string) => {
    const opt = modelOptions.find(o => o.value === value);
    if (!opt) return;
    setConfig(prev => ({
      ...prev,
      modelName: opt.label,
      modelID: opt.modelID,
      providerID: opt.providerID,
      apiUrl: opt.defaultApiUrl || prev.apiUrl,
    }));
  };

  // ===== 会话测试弹窗状态 =====
  interface ChatMsg { role: 'user' | 'ai'; text: string; streaming?: boolean; }
  const [chatOpen, setChatOpen] = createSignal(false);
  const [chatMessages, setChatMessages] = createSignal<ChatMsg[]>([]);
  const [chatInput, setChatInput] = createSignal('');
  const [chatLoading, setChatLoading] = createSignal(false);

  const openChatModal = () => {
    setChatMessages([{ role: 'ai', text: `你好！我是 ${config().modelName}，配置已加载。请随意发送消息来测试对话效果。` }]);
    setChatOpen(true);
  };

  const handleChatSend = async () => {
    const text = chatInput().trim();
    if (!text || chatLoading()) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'ai', text: '', streaming: true }]);
    setChatLoading(true);
    const cfg = config();

    // 建立历史消息上下文（排除最后空的流式占位消息）
    const historyMsgs = chatMessages()
      .slice(0, -1) // 去掉刚添加的空 AI 占位
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      .filter(m => m.content); // 过滤掉欢迎语等系统消息或空内容
    historyMsgs.push({ role: 'user', content: text });

    // 层 1: 尝试 OpenCode callAgent
    let openCodeUnavailable = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 60000);
        callAgent({
          userPrompt: text,
          title: `xingjing-chat-test-${Date.now()}`,
          model: cfg.providerID && cfg.modelID && cfg.providerID !== 'custom'
            ? { providerID: cfg.providerID, modelID: cfg.modelID }
            : undefined,
          onText: (accumulated: string) => {
            setChatMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, text: accumulated, streaming: true };
              return msgs;
            });
          },
          onDone: (full: string) => {
            clearTimeout(timeout);
            setChatMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, text: full || last.text, streaming: false };
              return msgs;
            });
            resolve();
          },
          onError: (err: string) => {
            clearTimeout(timeout);
            // 判断是否为 OpenCode 不可用类错误，若是则走降级直连分支
            if (err.includes('无法创建 AI 会话') || err.includes('SSE 连接中断') || err.includes('无法连接 SSE')) {
              openCodeUnavailable = true;
            }
            reject(new Error(err));
          },
        });
      });
      // OpenCode 成功，直接返回
      setChatLoading(false);
      return;
    } catch (e: unknown) {
      if (!openCodeUnavailable) {
        // 非 OpenCode 连通性错误（如模型返回错误等），直接展示
        const errMsg = e instanceof Error ? e.message : String(e);
        setChatMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, text: `❌ ${errMsg}`, streaming: false };
          return msgs;
        });
        setChatLoading(false);
        return;
      }
    }

    // 层 2: OpenCode 不可用，降级为直连 API（兑容 OpenAI / DeepSeek / Qwen 等标准接口）
    try {
      if (!cfg.apiKey) throw new Error('请先配置 API Key 并保存');
      const apiUrl = cfg.apiUrl.replace(/\/$/, '');
      const modelId = cfg.modelID || 'deepseek-chat';

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: historyMsgs,
          stream: true,
          max_tokens: cfg.maxTokens,
          temperature: cfg.temperature,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 错误 ${response.status}: ${errText.slice(0, 120)}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) { streamDone = true; break; }
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setChatMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, text: accumulated, streaming: true };
                return msgs;
              });
            }
          } catch { /* 忽略解析错误 */ }
        }
      }

      // 标记流式结束
      setChatMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, streaming: false };
        return msgs;
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setChatMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'ai') msgs[msgs.length - 1] = { ...last, text: `❌ 请求失败: ${errMsg}`, streaming: false };
        return msgs;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  // 消息更新时自动滚动到底部
  createEffect(() => {
    const msgs = chatMessages();
    if (msgs.length > 0) {
      const el = document.getElementById('xingjing-chat-scroll');
      if (el) el.scrollTop = el.scrollHeight;
    }
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      // 优先尝试通过 OpenCode callAgent 真实测试
      let resolved = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('timeout'));
          }
        }, 15000);

        const cfg = config();
        callAgent({
          userPrompt: '请回夏“OK”以确认连接正常。',
          title: 'xingjing-llm-test',
          model: cfg.providerID && cfg.modelID && cfg.providerID !== 'custom'
            ? { providerID: cfg.providerID, modelID: cfg.modelID }
            : undefined,
          onText: () => {},
          onDone: (text) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              setTestResult(`✅ 连接成功! ${cfg.modelName} 响应正常（${text.slice(0, 40)}${text.length > 40 ? '...' : ''}）`);
              resolve();
            }
          },
          onError: (err) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error(err));
            }
          },
        });
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'timeout') {
        setTestResult('⚠️ 连接超时15s，请检查 OpenCode 服务是否启动（端口4096）');
      } else {
        // 降级：用最小化请求直接探测 /chat/completions 接口
        const cfg = config();
        if (!cfg.apiKey) {
          setTestResult('⚠️ 请先填写 API Key');
        } else {
          try {
            const apiUrl = cfg.apiUrl.replace(/\/$/, '');
            const modelId = cfg.modelID || 'deepseek-chat';
            // Anthropic 使用不同的请求头和接口
            const isAnthropic = cfg.providerID === 'anthropic';
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isAnthropic) {
              headers['x-api-key'] = cfg.apiKey;
              headers['anthropic-version'] = '2023-06-01';
            } else {
              headers['Authorization'] = `Bearer ${cfg.apiKey}`;
            }
            const endpoint = isAnthropic ? `${apiUrl}/messages` : `${apiUrl}/chat/completions`;
            const body = isAnthropic
              ? { model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }
              : { model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false };

            const resp = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            });
            if (resp.ok) {
              setTestResult(`✅ API 连接成功！${cfg.modelName} 直连模式正常`);
            } else {
              let detail = '';
              try {
                const errJson = await resp.json() as { error?: { message?: string }; message?: string };
                detail = errJson.error?.message ?? errJson.message ?? '';
              } catch {
                detail = (await resp.text()).slice(0, 100);
              }
              setTestResult(`❌ API 返回错误 ${resp.status}: ${detail}`);
            }
          } catch (fetchErr: unknown) {
            const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            setTestResult(`❌ 网络请求失败: ${errMsg.slice(0, 120)}`);
          }
        }
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult('');
    setOwSyncStatus(null);
    try {
      const cfg = config();

      // 1. 更新内存 store
      actions.setLlmConfig(cfg);

      // 2. 同步 API Key 到 OpenCode（让 callAgent 能直接使用该 provider）
      let openCodeSynced = false;
      if (cfg.providerID && cfg.providerID !== 'custom' && cfg.apiKey && cfg.apiKey.length > 4) {
        openCodeSynced = await setProviderAuth(cfg.providerID, cfg.apiKey);
      }

      // 3. 写入 OpenWork 工作区配置文件（.qoder/opencode.json 等）
      const owConfigContent = JSON.stringify({
        model: {
          provider: cfg.providerID,
          id: cfg.modelID,
        },
        ...(cfg.apiKey && cfg.providerID ? { providers: { [cfg.providerID as string]: { apiKey: cfg.apiKey } } } : {}),
      }, null, 2);
      const owWritten = await actions.writeOpencodeConfig(owConfigContent);
      setOwSyncStatus(owWritten);

      // 4. 持久化到 .xingjing/settings.yaml（兜底）
      const workDir = productStore.activeProduct()?.workDir;
      let persisted = false;
      if (workDir) {
        persisted = await saveProjectSettings(workDir, { llm: cfg });
      }

      if (owWritten) {
        setTestResult(`✅ 配置已同步至 OpenWork 工作区${openCodeSynced ? '，API Key 已注入 OpenCode' : ''}${persisted ? '，并本地持久化' : ''}`);
      } else if (openCodeSynced) {
        setTestResult(`✓ 配置已保存，${cfg.modelName} API Key 已同步到 OpenCode${persisted ? ' 并持久化' : ''}（OpenWork 未连接）`);
      } else if (cfg.providerID !== 'custom') {
        setTestResult(`✓ 配置已保存${persisted ? '并持久化' : ''}（OpenCode / OpenWork 均未连接，使用直连模式）`);
      } else {
        setTestResult(`✓ 自定义配置已保存${persisted ? '并持久化' : ''}`);
      }
    } catch (e) {
      console.error('[handleSave] error:', e);
      setTestResult('❌ 保存时发生错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="rounded-xl p-4 max-w-lg" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
      {/* OpenCode 结合说明 */}
      <div class="mb-4 p-3 rounded-lg text-xs" style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, color: chartColors.primary }}>
        选择模型后，API 地址会自动带出。保存配置时，API Key 会同步到 OpenCode，后续所有 AI 对话将直接通过 OpenCode 调用此模型。
      </div>

      <div class="space-y-4">
        {/* 模型选择 */}
        <div>
          <label class="text-xs block mb-1 font-medium" style={{ color: themeColors.textSecondary }}>模型</label>
          <select
            class="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle()}
            value={config().modelID || config().modelName}
            onChange={(e) => handleModelChange(e.currentTarget.value)}
          >
            <For each={modelOptions}>
              {(opt) => <option value={opt.value}>{opt.label}</option>}
            </For>
          </select>
          <Show when={currentModelOpt()}>
            <div class="mt-1 text-xs" style={{ color: themeColors.textMuted }}>
              Provider: <code style={{ color: chartColors.primary }}>{currentModelOpt()!.providerID}</code>
              {' · '}
              Model ID: <code style={{ color: chartColors.primary }}>{currentModelOpt()!.modelID || config().modelID || '—'}</code>
            </div>
          </Show>
        </div>

        {/* API 地址 - 根据模型自动带出 */}
        <div>
          <label class="text-xs block mb-1 font-medium" style={{ color: themeColors.textSecondary }}>
            API 地址
            <Show when={currentModelOpt() && !currentModelOpt()!.apiUrlEditable}>
              <span class="ml-1 px-1 rounded text-xs" style={{ background: themeColors.bgSubtle, color: themeColors.textMuted }}>自动带出</span>
            </Show>
          </label>
          <input
            class="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              ...inputStyle(),
              background: (currentModelOpt() && !currentModelOpt()!.apiUrlEditable)
                ? themeColors.bgSubtle
                : themeColors.surface,
              cursor: (currentModelOpt() && !currentModelOpt()!.apiUrlEditable) ? 'default' : 'text',
            }}
            value={config().apiUrl}
            readonly={!!(currentModelOpt() && !currentModelOpt()!.apiUrlEditable)}
            onInput={(e) => setConfig({ ...config(), apiUrl: e.currentTarget.value })}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        {/* API Key */}
        <div>
          <label class="text-xs block mb-1 font-medium" style={{ color: themeColors.textSecondary }}>API Key</label>
          <input
            type="password"
            class="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle()}
            value={config().apiKey}
            onInput={(e) => setConfig({ ...config(), apiKey: e.currentTarget.value })}
            placeholder={`输入 ${currentModelOpt()?.providerID ?? 'provider'} API Key`}
          />
        </div>

        {/* OpenRouter 要输入具体模型 */}
        <Show when={config().providerID === 'openrouter' || config().providerID === 'custom'}>
          <div>
            <label class="text-xs block mb-1 font-medium" style={{ color: themeColors.textSecondary }}>
              Model ID <span class="text-xs" style={{ color: themeColors.textMuted }}>（OpenCode 调用时使用）</span>
            </label>
            <input
              class="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
              style={inputStyle()}
              value={config().modelID || ''}
              onInput={(e) => setConfig({ ...config(), modelID: e.currentTarget.value })}
              placeholder={config().providerID === 'openrouter' ? 'openai/gpt-4o' : 'provider/model-id'}
            />
          </div>
        </Show>

        {/* Temperature & Max Tokens */}
        <div>
          <label class="text-xs block mb-1" style={{ color: themeColors.textSecondary }}>Temperature: {config().temperature}</label>
          <input
            type="range"
            min="0" max="2" step="0.1"
            class="w-full"
            value={config().temperature}
            onInput={(e) => setConfig({ ...config(), temperature: parseFloat(e.currentTarget.value) })}
          />
        </div>
        <div>
          <label class="text-xs block mb-1" style={{ color: themeColors.textSecondary }}>Max Tokens</label>
          <input
            type="number"
            class="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle()}
            value={config().maxTokens}
            onInput={(e) => setConfig({ ...config(), maxTokens: parseInt(e.currentTarget.value) })}
            min={256} max={128000} step={256}
          />
        </div>

        {/* 操作按钮 */}
        <div class="flex gap-2 items-center flex-wrap">
          <button
            class="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-60"
            style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
            onClick={handleTest}
            disabled={testing()}
          >
            {testing() ? '测试中...' : <><FlaskConical size={13} class="inline mr-1" />测试连接</>}
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ border: `1px solid ${themeColors.primaryBorder}`, color: chartColors.primary, background: themeColors.primaryBg }}
            onClick={openChatModal}
          >
            <MessageSquare size={13} class="inline mr-1" />会话测试
          </button>
          <button
            class="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-60"
            style={{ background: chartColors.primary, color: 'white' }}
            onClick={handleSave}
            disabled={saving()}
          >
            {saving() ? '保存中...' : <><Save size={13} class="inline mr-1" />保存配置</>}
          </button>
          {/* OpenWork 同步状态徽章 */}
          <Show when={owSyncStatus() !== null}>
            <span
              class="text-xs px-2 py-1 rounded-full"
              style={{
                background: owSyncStatus() ? themeColors.successBg : themeColors.bgSubtle,
                color: owSyncStatus() ? chartColors.success : themeColors.textMuted,
                border: `1px solid ${owSyncStatus() ? themeColors.successBorder ?? themeColors.border : themeColors.border}`,
              }}
            >
              {owSyncStatus() ? '✓ 已同步至 OpenWork 工作区' : '⚠ OpenWork 未连接，仅本地保存'}
            </span>
          </Show>
        </div>
        <Show when={testResult()}>
          <div
            class="text-xs p-2 rounded-lg"
            style={{
              background: testResult().startsWith('✅') ? themeColors.successBg
                : testResult().startsWith('❌') ? themeColors.errorBg
                : themeColors.bgSubtle,
              color: testResult().startsWith('✅') ? chartColors.success
                : testResult().startsWith('❌') ? chartColors.error
                : themeColors.textSecondary,
            }}
          >
            {testResult()}
          </div>
        </Show>
      </div>

      {/* ===== 会话测试弹窗 ===== */}
      <Show when={chatOpen()}>
        <div
          style={{
            position: 'fixed', inset: 0, 'z-index': 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}
        >
          <div
            style={{
              background: themeColors.appBg,
              border: `1px solid ${themeColors.border}`,
              'border-radius': '12px',
              width: '480px',
              'max-width': '95vw',
              height: '560px',
              'max-height': '90vh',
              display: 'flex',
              'flex-direction': 'column',
              overflow: 'hidden',
              'box-shadow': '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            {/* 弹窗头部 */}
            <div
              style={{
                padding: '14px 16px',
                'border-bottom': `1px solid ${themeColors.border}`,
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'flex-shrink': 0,
              }}
            >
              <MessageSquare size={15} style={{ color: chartColors.primary }} />
              <span style={{ 'font-weight': '600', 'font-size': '14px', color: themeColors.text }}>会话测试</span>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-left': '4px' }}>— {config().modelName}</span>
              <button
                style={{
                  'margin-left': 'auto', background: 'none', border: 'none',
                  cursor: 'pointer', color: themeColors.textMuted, padding: '2px',
                  display: 'flex', 'align-items': 'center',
                }}
                onClick={() => setChatOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* 消息列表 */}
            <div
              id="xingjing-chat-scroll"
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '12px 14px',
                display: 'flex',
                'flex-direction': 'column',
                gap: '10px',
              }}
            >
              <For each={chatMessages()}>
                {(msg) => (
                  <div
                    style={{
                      display: 'flex',
                      'flex-direction': msg.role === 'user' ? 'row-reverse' : 'row',
                      'align-items': 'flex-start',
                      gap: '8px',
                    }}
                  >
                    {/* 头像 */}
                    <div
                      style={{
                        width: '28px', height: '28px', 'border-radius': '50%', 'flex-shrink': 0,
                        background: msg.role === 'user' ? chartColors.primary : themeColors.surface,
                        border: `1px solid ${themeColors.border}`,
                        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                        'font-size': '12px',
                      }}
                    >
                      {msg.role === 'user' ? '我' : <Bot size={14} style={{ color: chartColors.primary }} />}
                    </div>
                    {/* 气泡 */}
                    <div
                      style={{
                        'max-width': '78%',
                        padding: '8px 12px',
                        'border-radius': msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                        background: msg.role === 'user' ? chartColors.primary : themeColors.surface,
                        color: msg.role === 'user' ? 'white' : themeColors.text,
                        'font-size': '13px',
                        'line-height': '1.6',
                        'white-space': 'pre-wrap',
                        'word-break': 'break-word',
                        border: msg.role === 'user' ? 'none' : `1px solid ${themeColors.border}`,
                      }}
                    >
                      {msg.text || (msg.streaming ? '' : '…')}
                      <Show when={msg.streaming}>
                        <span
                          style={{
                            display: 'inline-block', width: '6px', height: '14px',
                            background: themeColors.textMuted, 'margin-left': '2px',
                            'border-radius': '1px', 'vertical-align': 'text-bottom',
                            animation: 'xj-blink 0.8s step-end infinite',
                          }}
                        />
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* 输入区域 */}
            <div
              style={{
                padding: '10px 14px',
                'border-top': `1px solid ${themeColors.border}`,
                display: 'flex',
                gap: '8px',
                'align-items': 'flex-end',
                'flex-shrink': 0,
                background: themeColors.appBg,
              }}
            >
              <textarea
                rows={1}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行…"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  'border-radius': '8px',
                  border: `1px solid ${themeColors.border}`,
                  background: themeColors.surface,
                  color: themeColors.text,
                  'font-size': '13px',
                  resize: 'none',
                  outline: 'none',
                  'line-height': '1.5',
                  'max-height': '80px',
                  overflow: 'auto',
                  'font-family': 'inherit',
                }}
                value={chatInput()}
                onInput={(e) => setChatInput(e.currentTarget.value)}
                onKeyDown={handleChatKeyDown}
                disabled={chatLoading()}
              />
              <button
                style={{
                  padding: '8px 12px',
                  'border-radius': '8px',
                  background: chatLoading() ? themeColors.bgSubtle : chartColors.primary,
                  color: chatLoading() ? themeColors.textMuted : 'white',
                  border: 'none',
                  cursor: chatLoading() ? 'not-allowed' : 'pointer',
                  display: 'flex', 'align-items': 'center', gap: '4px',
                  'font-size': '13px', 'flex-shrink': 0,
                  transition: 'background 0.2s',
                }}
                onClick={handleChatSend}
                disabled={chatLoading()}
              >
                <Show when={chatLoading()} fallback={<><Send size={14} />发送</>}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />生成中
                </Show>
              </button>
            </div>
          </div>
        </div>

        {/* 光标闪烁 & 旋转动画 */}
        <style>{`
          @keyframes xj-blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `}</style>
      </Show>
    </div>
  );
};

// ===================== Tab3: Git repos =====================
const GitTab: Component = () => {
  const { productStore } = useAppStore();
  const [repos, setRepos] = createSignal<GitRepoConfig[]>([...defaultGitRepos]);
  const [editRepo, setEditRepo] = createSignal<GitRepoConfig | null>(null);
  const [editForm, setEditForm] = createSignal<Partial<GitRepoConfig>>({});
  const [syncing, setSyncing] = createSignal(false);
  const [syncResult, setSyncResult] = createSignal('');

  // 从文件加载 Git 仓库配置
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      if (settings.gitRepos && settings.gitRepos.length > 0) {
        setRepos(settings.gitRepos as GitRepoConfig[]);
      }
    } catch { /* keep defaults */ }
  });

  // 持久化 Git 配置
  const persistGitRepos = async (updated: GitRepoConfig[]) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      await saveProjectSettings(workDir, { ...settings, gitRepos: updated as unknown as typeof settings.gitRepos });
    } catch { /* ignore */ }
  };

  // Git 同步
  const handleGitSync = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) { setSyncResult('⚠️ 请先选择一个产品项目'); return; }
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await gitSync(workDir);
      setSyncResult(result.ok ? `✅ Git 同步成功` : `❌ 同步失败: ${result.output.slice(0, 100)}`);
    } catch (e: unknown) {
      setSyncResult(`❌ ${e instanceof Error ? e.message : '同步失败'}`);
    } finally {
      setSyncing(false);
    }
  };

  // ── 平台 Token 管理 ──────────────────────────────────────────────────────────
  const [platformTokens, setPlatformTokens] = createSignal<Record<string, string>>(getAllGitTokens());
  const [newTokenHost, setNewTokenHost] = createSignal('');
  const [newTokenValue, setNewTokenValue] = createSignal('');
  const [editingHost, setEditingHost] = createSignal<string | null>(null);
  const [editingValue, setEditingValue] = createSignal('');

  const handleDeleteToken = (host: string) => {
    clearGitToken(host);
    setPlatformTokens(getAllGitTokens());
  };

  const handleAddToken = () => {
    const host = newTokenHost().trim().toLowerCase();
    const token = newTokenValue().trim();
    if (!host || !token) return;
    setGitToken(host, token);
    setPlatformTokens(getAllGitTokens());
    setNewTokenHost('');
    setNewTokenValue('');
  };

  const handleUpdateToken = (host: string) => {
    const token = editingValue().trim();
    if (!token) return;
    setGitToken(host, token);
    setPlatformTokens(getAllGitTokens());
    setEditingHost(null);
    setEditingValue('');
  };

  const openEdit = (repo: GitRepoConfig) => {
    setEditRepo(repo);
    setEditForm({ ...repo });
  };

  const handleSave = () => {
    const repo = editRepo();
    if (!repo) return;
    const form = editForm();
    const updated = repos().map((r) =>
      r.id === repo.id
        ? { ...r, ...form, tokenConfigured: !!(form.accessToken && form.accessToken !== '') }
        : r
    );
    setRepos(updated);
    persistGitRepos(updated);
    setEditRepo(null);
  };

  return (
    <div class="space-y-4">
      <div class="p-3 rounded-lg text-xs" style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, color: chartColors.primary }}>
        每个产品项目对应一个 Git 仓库配置，用于 Agent 自动提交代码和创建 PR。
      </div>

      {/* Git 同步按钮 */}
      <div class="rounded-xl p-4 flex items-center gap-3" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <button
          class="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-60"
          style={{ background: chartColors.success, color: 'white' }}
          onClick={handleGitSync}
          disabled={syncing()}
        >
          {syncing() ? '同步中...' : '🔄 Git 同步（add + commit + push）'}
        </button>
        <span class="text-xs" style={{ color: themeColors.textMuted }}>将当前项目文件提交并推送到远程仓库</span>
        <Show when={syncResult()}>
          <span class="text-xs" style={{
            color: syncResult().startsWith('✅') ? chartColors.success : chartColors.error,
          }}>{syncResult()}</span>
        </Show>
      </div>

      {/* ── 平台 Token 管理卡片 ── */}
      <div class="rounded-xl overflow-hidden" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <div class="px-4 py-3 flex items-center justify-between" style={{ background: themeColors.bgSubtle, 'border-bottom': `1px solid ${themeColors.border}` }}>
          <span class="text-sm font-medium" style={{ color: themeColors.text }}>Git 平台 Token</span>
          <span class="text-xs" style={{ color: themeColors.textMuted }}>用于访问私有仓库（按域名保存）</span>
        </div>
        <div class="p-4 space-y-3">
          {/* 已保存 Token 列表 */}
          <Show when={Object.keys(platformTokens()).length > 0} fallback={
            <p class="text-xs text-center py-2" style={{ color: themeColors.textMuted }}>暂无已保存的 Token</p>
          }>
            <table class="w-full text-xs">
              <thead>
                <tr style={{ background: themeColors.bgSubtle }}>
                  <For each={['平台域名', 'Token', '操作']}>
                    {(h) => <th class="text-left py-2 px-3 font-medium" style={{ color: themeColors.textMuted }}>{h}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={Object.entries(platformTokens())}>
                  {([host, token]) => (
                    <tr style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
                      <td class="py-2 px-3 font-mono" style={{ color: themeColors.text }}>{host}</td>
                      <td class="py-2 px-3">
                        <Show
                          when={editingHost() === host}
                          fallback={
                            <span class="font-mono tracking-widest" style={{ color: themeColors.textSecondary }}>
                              {'•'.repeat(Math.min(token.length, 20))}
                            </span>
                          }
                        >
                          <input
                            type="password"
                            class="px-2 py-1 rounded text-xs outline-none w-full"
                            style={inputStyle()}
                            value={editingValue()}
                            onInput={(e) => setEditingValue(e.currentTarget.value)}
                            placeholder="新 Token"
                          />
                        </Show>
                      </td>
                      <td class="py-2 px-3">
                        <div class="flex gap-2">
                          <Show
                            when={editingHost() === host}
                            fallback={
                              <button
                                class="text-xs"
                                style={{ color: chartColors.primary }}
                                onClick={() => { setEditingHost(host); setEditingValue(token); }}
                              >更新</button>
                            }
                          >
                            <button
                              class="text-xs"
                              style={{ color: chartColors.success }}
                              onClick={() => handleUpdateToken(host)}
                            >保存</button>
                            <button
                              class="text-xs"
                              style={{ color: themeColors.textMuted }}
                              onClick={() => { setEditingHost(null); setEditingValue(''); }}
                            >取消</button>
                          </Show>
                          <button
                            class="text-xs"
                            style={{ color: chartColors.error }}
                            onClick={() => handleDeleteToken(host)}
                          >删除</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>

          {/* 新增 Token 行 */}
          <div class="flex gap-2 pt-1">
            <input
              class="rounded-lg px-3 py-2 text-xs outline-none"
              style={{ ...inputStyle(), width: '160px' }}
              placeholder="平台域名，如 github.com"
              value={newTokenHost()}
              onInput={(e) => setNewTokenHost(e.currentTarget.value)}
            />
            <input
              type="password"
              class="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
              style={inputStyle()}
              placeholder="Personal Access Token"
              value={newTokenValue()}
              onInput={(e) => setNewTokenValue(e.currentTarget.value)}
            />
            <button
              class="px-3 py-2 text-xs rounded-lg transition-colors"
              style={{ background: chartColors.primary, color: 'white' }}
              onClick={handleAddToken}
            >添加</button>
          </div>
        </div>
      </div>
      <div class="rounded-xl overflow-hidden" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <table class="w-full text-xs">
          <thead>
            <tr style={{ background: themeColors.bgSubtle }}>
              <For each={['产品名称', '仓库 URL', '默认分支', 'Token 状态', '操作']}>
                {(h) => <th class="text-left py-3 px-4 font-medium" style={{ color: themeColors.textMuted }}>{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={repos()}>
              {(repo) => (
                <tr style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
                  <td class="py-3 px-4 font-medium" style={{ color: themeColors.text }}>{repo.productName}</td>
                  <td class="py-3 px-4 font-mono text-xs truncate max-w-xs" style={{ color: themeColors.textSecondary }}>{repo.repoUrl}</td>
                  <td class="py-3 px-4">
                    <span class="px-1.5 py-0.5 rounded" style={{ background: themeColors.primaryBg, color: chartColors.primary }}>{repo.defaultBranch}</span>
                  </td>
                  <td class="py-3 px-4">
                    <span class="px-1.5 py-0.5 rounded" style={{
                      background: repo.tokenConfigured ? themeColors.successBg : themeColors.errorBg,
                      color: repo.tokenConfigured ? chartColors.success : chartColors.error,
                    }}>
                      {repo.tokenConfigured ? '● 已配置' : '● 未配置'}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <button
                      class="text-xs"
                      style={{ color: chartColors.primary }}
                      onClick={() => openEdit(repo)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      <Show when={editRepo()}>
        <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div class="rounded-xl shadow-xl w-full max-w-md p-6" style={{ background: themeColors.surface }}>
            <h3 class="font-semibold text-base mb-4" style={{ color: themeColors.text }}>编辑仓库配置</h3>
            <div class="space-y-3">
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>产品名称</label>
                <input
                  class="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ ...inputStyle(), background: themeColors.bgSubtle }}
                  value={editForm().productName ?? ''}
                  disabled
                />
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>仓库 URL *</label>
                <input
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={editForm().repoUrl ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), repoUrl: e.currentTarget.value })}
                  placeholder="https://github.com/org/repo.git"
                />
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>默认分支 *</label>
                <input
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={editForm().defaultBranch ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), defaultBranch: e.currentTarget.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>Access Token</label>
                <input
                  type="password"
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={editForm().accessToken ?? ''}
                  onInput={(e) => setEditForm({ ...editForm(), accessToken: e.currentTarget.value })}
                  placeholder="GitHub Personal Access Token"
                />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
                onClick={() => setEditRepo(null)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: chartColors.primary, color: 'white' }}
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ===================== Tab4: Cron tasks =====================
const CronTab: Component = () => {
  const { productStore } = useAppStore();
  const [tasks, setTasks] = createSignal<ScheduledTask[]>([...defaultScheduledTasks]);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [form, setForm] = createSignal({ name: '', cron: '', agentName: '', description: '' });

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      if (settings.scheduledTasks && settings.scheduledTasks.length > 0) {
        setTasks(settings.scheduledTasks as ScheduledTask[]);
      }
    } catch { /* keep defaults */ }
  });

  const persistTasks = async (updated: ScheduledTask[]) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      await saveProjectSettings(workDir, { ...settings, scheduledTasks: updated as unknown as typeof settings.scheduledTasks });
    } catch { /* ignore */ }
  };

  const toggleTask = (id: string, val: boolean) => {
    const updated = tasks().map((t) => t.id === id ? { ...t, enabled: val } : t);
    setTasks(updated);
    persistTasks(updated);
  };

  const handleAdd = () => {
    const f = form();
    if (!f.name || !f.cron || !f.agentName) return;
    const updated = [...tasks(), {
      id: `cron-${Date.now()}`,
      ...f,
      enabled: true,
      lastRun: '-',
    }];
    setTasks(updated);
    persistTasks(updated);
    setModalOpen(false);
    setForm({ name: '', cron: '', agentName: '', description: '' });
  };

  return (
    <div class="space-y-4">
      <div class="rounded-xl overflow-hidden" style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}>
        <table class="w-full text-xs">
          <thead>
            <tr style={{ background: themeColors.bgSubtle }}>
              <For each={['任务名称', 'Cron 表达式', '关联 Agent', '描述', '状态', '上次执行']}>
                {(h) => <th class="text-left py-3 px-3 font-medium" style={{ color: themeColors.textMuted }}>{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={tasks()}>
              {(task) => (
                <tr style={{ 'border-top': `1px solid ${themeColors.borderLight}` }}>
                  <td class="py-3 px-3 font-medium" style={{ color: themeColors.text }}>{task.name}</td>
                  <td class="py-3 px-3">
                    <code class="px-1.5 py-0.5 rounded text-xs" style={{ background: themeColors.hover, color: themeColors.text }}>{task.cron}</code>
                  </td>
                  <td class="py-3 px-3">
                    <span class="px-2 py-0.5 rounded flex items-center gap-1 w-fit" style={{ background: themeColors.primaryBg, color: chartColors.primary }}><Zap size={11} />{task.agentName}</span>
                  </td>
                  <td class="py-3 px-3 max-w-xs" style={{ color: themeColors.textSecondary }}>{task.description}</td>
                  <td class="py-3 px-3">
                    <button
                      class="w-8 h-4 rounded-full transition-colors relative"
                      style={{ background: task.enabled ? chartColors.primary : themeColors.border }}
                      onClick={() => toggleTask(task.id, !task.enabled)}
                    >
                      <div
                        class="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
                        style={{
                          background: themeColors.surface,
                          left: task.enabled ? '17px' : '1px',
                        }}
                      />
                    </button>
                  </td>
                  <td class="py-3 px-3" style={{ color: themeColors.textMuted }}>{task.lastRun}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <button
        class="w-full py-2 rounded-lg text-sm transition-colors"
        style={{ border: `2px dashed ${themeColors.border}`, color: themeColors.textMuted, background: 'transparent' }}
        onClick={() => setModalOpen(true)}
      >
        + 新建定时任务
      </button>

      {/* Add modal */}
      <Show when={modalOpen()}>
        <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div class="rounded-xl shadow-xl w-full max-w-sm p-6" style={{ background: themeColors.surface }}>
            <h3 class="font-semibold text-base mb-4" style={{ color: themeColors.text }}>新建定时任务</h3>
            <div class="space-y-3">
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>任务名称 *</label>
                <input
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={form().name}
                  onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
                  placeholder="如：每日编码任务执行"
                />
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>Cron 表达式 *</label>
                <input
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={form().cron}
                  onInput={(e) => setForm({ ...form(), cron: e.currentTarget.value })}
                  placeholder="0 2 * * *"
                />
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>关联 Agent *</label>
                <select
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle()}
                  value={form().agentName}
                  onChange={(e) => setForm({ ...form(), agentName: e.currentTarget.value })}
                >
                  <option value="">选择执行 Agent</option>
                  <For each={['编码 Agent', '效能分析 Agent', '质量守护 Agent', '需求分析 Agent', '架构设计 Agent']}>
                    {(opt) => <option value={opt}>{opt}</option>}
                  </For>
                </select>
              </div>
              <div>
                <label class="text-xs block mb-1" style={{ color: themeColors.textMuted }}>描述</label>
                <textarea
                  class="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={inputStyle()}
                  rows={2}
                  value={form().description}
                  onInput={(e) => setForm({ ...form(), description: e.currentTarget.value })}
                  placeholder="任务描述..."
                />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button
                class="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button
                class="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: chartColors.primary, color: 'white' }}
                onClick={handleAdd}
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

// ===================== Tab5: Gate nodes =====================
const GateTab: Component = () => {
  const { productStore } = useAppStore();
  const [nodes, setNodes] = createSignal<GateNode[]>([...defaultGateNodes]);

  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      if (settings.gates && settings.gates.length > 0) {
        setNodes(settings.gates as GateNode[]);
      }
    } catch { /* keep defaults */ }
  });

  const persistGates = async (updated: GateNode[]) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      const settings = await loadProjectSettings(workDir);
      await saveProjectSettings(workDir, { ...settings, gates: updated as unknown as typeof settings.gates });
    } catch { /* ignore */ }
  };

  const toggleNode = (id: string) => {
    const updated = nodes().map((n) => n.id === id ? { ...n, requireHuman: !n.requireHuman } : n);
    setNodes(updated);
    persistGates(updated);
  };

  const setAll = (requireHuman: boolean) => {
    const updated = nodes().map((n) => ({ ...n, requireHuman }));
    setNodes(updated);
    persistGates(updated);
  };

  return (
    <div class="space-y-4">
      <div class="p-3 rounded-lg text-xs" style={{ background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`, color: chartColors.primary }}>
        <strong>节点门控配置：</strong>配置 Agent 自动驾驶流程中哪些节点需要人工介入审批，哪些可以自动通过。开启表示需要人工确认，关闭表示 Agent 可自行完成。
      </div>
      <div class="flex items-center gap-2">
        <button
          class="text-xs px-3 py-1.5 rounded transition-colors"
          style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
          onClick={() => setAll(false)}
        >
          全部自动
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded transition-colors"
          style={{ border: `1px solid ${themeColors.border}`, color: themeColors.textSecondary, background: themeColors.surface }}
          onClick={() => setAll(true)}
        >
          全部人工
        </button>
        <span class="text-xs ml-2" style={{ color: themeColors.textMuted }}>
          当前 {nodes().filter((n) => n.requireHuman).length} 个节点需人工介入，{nodes().filter((n) => !n.requireHuman).length} 个自动通过
        </span>
      </div>
      <div class="space-y-2">
        <For each={nodes()}>
          {(node, idx) => (
            <div
              class="rounded-xl p-4 flex items-center justify-between"
              style={{
                background: themeColors.surface,
                border: `1px solid ${themeColors.border}`,
                'border-left': `3px solid ${node.requireHuman ? themeColors.warning : chartColors.success}`,
              }}
            >
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="font-semibold text-sm" style={{ color: themeColors.text }}>{idx() + 1}. {node.name}</span>
                  <span
                    class="px-1.5 py-0.5 rounded text-xs"
                    style={{
                      color: node.requireHuman ? themeColors.warning : chartColors.success,
                      background: node.requireHuman ? themeColors.warningBg : themeColors.successBg,
                    }}
                  >
                    {node.requireHuman ? '人工介入' : '自动通过'}
                  </span>
                </div>
                <div class="text-xs" style={{ color: themeColors.textMuted }}>{node.description}</div>
              </div>
              <button
                class="w-10 h-5 rounded-full transition-colors relative ml-4"
                style={{ background: node.requireHuman ? themeColors.warning : themeColors.border }}
                onClick={() => toggleNode(node.id)}
              >
                <div
                  class="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                  style={{
                    background: themeColors.surface,
                    left: node.requireHuman ? '21px' : '2px',
                  }}
                />
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

// ===================== Tab6: Product List =====================
const ProductListTab: Component = () => {
  const { productStore } = useAppStore();

  // 当前展开详情的产品 id
  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  // 待删除目标
  const [deletingTarget, setDeletingTarget] = createSignal<XingjingProduct | null>(null);
  // 删除中状态
  const [deleteLoading, setDeleteLoading] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal('');
  // 新增 Domain/App 弹窗
  const [addModalOpen, setAddModalOpen] = createSignal(false);
  const [addModalTarget, setAddModalTarget] = createSignal<XingjingProduct | null>(null);
  const [addModalMode, setAddModalMode] = createSignal<'domain' | 'app'>('domain');

  const openAddModal = (product: XingjingProduct, mode: 'domain' | 'app') => {
    setAddModalTarget(product);
    setAddModalMode(mode);
    setAddModalOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const openDeleteDialog = (product: XingjingProduct) => {
    setDeletingTarget(product);
    setDeleteError('');
    setDeleteLoading(false);
  };

  const closeDeleteDialog = () => {
    if (deleteLoading()) return;
    setDeletingTarget(null);
    setDeleteError('');
  };

  const handleDelete = async (withDir: boolean) => {
    const target = deletingTarget();
    if (!target) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      if (withDir) {
        if (!isTauriRuntime()) {
          setDeleteError('仅桓面端支持删除本地目录，当前环境仅删除注册库记录');
          // 继续删除注册库记录
          await productStore.removeProduct(target.id);
          setDeletingTarget(null);
          setDeleteLoading(false);
          return;
        }
        const result = await deleteProductDir(target.workDir);
        if (!result.ok) {
          setDeleteError(result.error ?? '删除目录失败');
          setDeleteLoading(false);
          return;
        }
      }
      await productStore.removeProduct(target.id);
      setDeletingTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? String(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div>
      {/* 头部 */}
      <div class="flex items-center justify-between mb-4">
        <div class="text-sm" style={{ color: themeColors.textMuted }}>
          本地共创建 <span class="font-bold" style={{ color: themeColors.text }}>{productStore.products().length}</span> 个产品
        </div>
      </div>

      {/* 空列表提示 */}
      <Show when={productStore.products().length === 0}>
        <div
          class="rounded-xl p-8 text-center"
          style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}
        >
          <Package size={32} class="mx-auto mb-3" style={{ color: themeColors.textMuted }} />
          <div class="text-sm" style={{ color: themeColors.textMuted }}>还没有创建任何产品</div>
          <div class="text-xs mt-1" style={{ color: themeColors.textMuted }}>前往驾驶舱页面创建第一个产品</div>
        </div>
      </Show>

      {/* 产品列表 */}
      <div class="space-y-3">
        <For each={productStore.products()}>
          {(product) => (
            <div
              class="rounded-xl overflow-hidden"
              style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}
            >
              {/* 产品行 */}
              <div class="flex items-center gap-3 p-4">
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: chartColors.primary + '22' }}
                >
                  <Package size={14} style={{ color: chartColors.primary }} />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <div class="font-semibold text-sm truncate" style={{ color: themeColors.text }}>{product.name}</div>
                    <span
                      class="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{
                        background: product.productType === 'team' ? '#7c3aed22' : '#0284c722',
                        color: product.productType === 'team' ? '#7c3aed' : '#0284c7',
                      }}
                    >
                      {product.productType === 'team' ? '团队版' : '独立版'}
                    </span>
                  </div>
                  <div class="text-xs truncate mt-0.5" style={{ color: themeColors.textMuted }}>
                    <FolderOpen size={10} class="inline mr-1" />{product.workDir}
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button
                    class="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 transition-colors"
                    style={{
                      background: themeColors.bgSubtle,
                      color: themeColors.textMuted,
                      border: `1px solid ${themeColors.border}`,
                    }}
                    onClick={() => toggleExpand(product.id)}
                  >
                    <Show when={expandedId() === product.id} fallback={<><ChevronDown size={12} />详情</>}>
                      <ChevronUp size={12} />收起
                    </Show>
                  </button>
                  <button
                    class="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#ff4d4f', background: 'transparent', border: `1px solid transparent` }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#ff4d4f22'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff4d4f44'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
                    onClick={() => openDeleteDialog(product)}
                    title="删除产品"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* 展开详情 */}
              <Show when={expandedId() === product.id}>
                <div
                  class="px-4 pb-4"
                  style={{ 'border-top': `1px solid ${themeColors.border}` }}
                >
                  <div class="pt-3 space-y-2">
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>产品名称</div>
                        <div class="text-sm" style={{ color: themeColors.text }}>{product.name}</div>
                      </div>
                      <div>
                        <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>创建时间</div>
                        <div class="text-sm" style={{ color: themeColors.text }}>{formatDate(product.createdAt)}</div>
                      </div>
                    </div>
                    <div>
                      <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>
                        {product.productType === 'team' ? '父工作目录' : '工作目录'}
                      </div>
                      <div
                        class="text-xs font-mono px-2 py-1.5 rounded"
                        style={{ background: themeColors.bgSubtle, color: themeColors.text, 'word-break': 'break-all' }}
                      >{product.workDir}</div>
                    </div>

                    {/* 独立版：展示 Git 地址 */}
                    <Show when={product.productType !== 'team' && product.gitUrl}>
                      <div>
                        <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>Git 仓库</div>
                        <div
                          class="text-xs font-mono px-2 py-1.5 rounded"
                          style={{ background: themeColors.bgSubtle, color: themeColors.text, 'word-break': 'break-all' }}
                        >{product.gitUrl}</div>
                      </div>
                    </Show>

                    {/* 团队版：展示多仓库结构 */}
                    <Show when={product.productType === 'team' && product.teamStructure}>
                      {/* 产品线 */}
                      <div>
                        <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>产品线仓库</div>
                        <div
                          class="text-xs font-mono px-2 py-1.5 rounded"
                          style={{ background: themeColors.bgSubtle, color: themeColors.text, 'word-break': 'break-all' }}
                        >{product.teamStructure!.plDir}</div>
                        <Show when={product.teamStructure!.plGitUrl}>
                          <div class="text-xs font-mono mt-1 px-2 py-1 rounded" style={{ background: themeColors.bgSubtle, color: themeColors.textMuted }}>
                            → {product.teamStructure!.plGitUrl}
                          </div>
                        </Show>
                      </div>

                      {/* Domain 列表 */}
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <div class="text-xs font-medium" style={{ color: themeColors.textMuted }}>
                            Domains（{product.teamStructure!.domains.length}）
                          </div>
                          <button
                            type="button"
                            class="text-xs px-2 py-0.5 rounded transition-colors"
                            style={{
                              background: '#7c3aed22', color: '#7c3aed',
                              border: '1px solid #7c3aed44',
                            }}
                            onClick={() => openAddModal(product, 'domain')}
                          >
                            + 新增 Domain
                          </button>
                        </div>
                        <div class="space-y-1">
                          <For each={product.teamStructure!.domains}>
                            {(d) => (
                              <div
                                class="text-xs rounded px-2 py-1.5"
                                style={{ background: themeColors.bgSubtle, border: `1px solid ${themeColors.border}` }}
                              >
                                <div class="font-medium" style={{ color: themeColors.text }}>{d.name}</div>
                                <div class="font-mono mt-0.5" style={{ color: themeColors.textMuted }}>{d.dir}</div>
                                <Show when={d.gitUrl}>
                                  <div class="mt-0.5" style={{ color: themeColors.textMuted }}>→ {d.gitUrl}</div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>

                      {/* App 列表 */}
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <div class="text-xs font-medium" style={{ color: themeColors.textMuted }}>
                            Apps（{product.teamStructure!.apps.length}）
                          </div>
                          <button
                            type="button"
                            class="text-xs px-2 py-0.5 rounded transition-colors"
                            style={{
                              background: '#0284c722', color: '#0284c7',
                              border: '1px solid #0284c744',
                            }}
                            onClick={() => openAddModal(product, 'app')}
                          >
                            + 新增 App
                          </button>
                        </div>
                        <div class="space-y-1">
                          <For each={product.teamStructure!.apps}>
                            {(a) => (
                              <div
                                class="text-xs rounded px-2 py-1.5"
                                style={{ background: themeColors.bgSubtle, border: `1px solid ${themeColors.border}` }}
                              >
                                <div class="font-medium" style={{ color: themeColors.text }}>{a.name}</div>
                                <div class="font-mono mt-0.5" style={{ color: themeColors.textMuted }}>{a.dir}</div>
                                <Show when={a.gitUrl}>
                                  <div class="mt-0.5" style={{ color: themeColors.textMuted }}>→ {a.gitUrl}</div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={product.description}>
                      <div>
                        <div class="text-xs font-medium mb-1" style={{ color: themeColors.textMuted }}>描述</div>
                        <div class="text-sm" style={{ color: themeColors.text }}>{product.description}</div>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* 删除确认弹窗 */}
      <Show when={deletingTarget() !== null}>
        <div
          class="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteDialog(); }}
        >
          <div
            class="rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
            style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}` }}
          >
            <div class="flex items-center gap-2 mb-4">
              <Trash2 size={18} style={{ color: '#ff4d4f' }} />
              <h3 class="text-base font-semibold m-0" style={{ color: themeColors.text }}>
                删除产品「{deletingTarget()?.name}」
              </h3>
            </div>

            <div class="mb-4">
              <div class="text-sm mb-2" style={{ color: themeColors.textSecondary }}>
                确定要删除该产品吗？
              </div>
              <div
                class="text-xs px-3 py-2 rounded-lg mb-3"
                style={{ background: themeColors.bgSubtle, color: themeColors.textMuted, 'word-break': 'break-all' }}
              >
                <FolderOpen size={10} class="inline mr-1" />{deletingTarget()?.workDir}
              </div>
              <div class="text-sm" style={{ color: themeColors.textSecondary }}>
                是否同时删除本地目录及其所有内容？
              </div>
              <div class="text-xs mt-1" style={{ color: '#ff7875' }}>
                ⚠️ 删除目录后无法恢复，请确认已备份重要文件
              </div>
            </div>

            {/* 错误提示 */}
            <Show when={deleteError()}>
              <div
                class="text-xs px-3 py-2 rounded-lg mb-4"
                style={{ background: '#ff4d4f22', color: '#ff7875', border: '1px solid #ff4d4f44' }}
              >
                {deleteError()}
              </div>
            </Show>

            {/* 操作按钞 */}
            <div class="flex gap-2 justify-end">
              <button
                class="px-4 py-2 text-sm rounded-lg"
                style={{
                  background: themeColors.bgSubtle,
                  color: themeColors.textMuted,
                  border: `1px solid ${themeColors.border}`,
                  cursor: deleteLoading() ? 'not-allowed' : 'pointer',
                  opacity: deleteLoading() ? '0.5' : '1',
                }}
                onClick={closeDeleteDialog}
                disabled={deleteLoading()}
              >
                取消
              </button>
              <button
                class="px-4 py-2 text-sm rounded-lg"
                style={{
                  background: themeColors.bgSubtle,
                  color: themeColors.text,
                  border: `1px solid ${themeColors.border}`,
                  cursor: deleteLoading() ? 'not-allowed' : 'pointer',
                  opacity: deleteLoading() ? '0.5' : '1',
                }}
                onClick={() => handleDelete(false)}
                disabled={deleteLoading()}
              >
                <Show when={deleteLoading()} fallback="仅删除记录">
                  <Loader size={12} class="inline mr-1 animate-spin" />删除中…
                </Show>
              </button>
              <button
                class="px-4 py-2 text-sm rounded-lg font-medium"
                style={{
                  background: deleteLoading() ? '#ff4d4f88' : '#ff4d4f',
                  color: 'white',
                  border: 'none',
                  cursor: deleteLoading() ? 'not-allowed' : 'pointer',
                }}
                onClick={() => handleDelete(true)}
                disabled={deleteLoading()}
              >
                <Show when={deleteLoading()} fallback="删除记录和目录">
                  <Loader size={12} class="inline mr-1 animate-spin" />删除中…
                </Show>
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 新增 Domain/App 弹窗 */}
      <Show when={addModalOpen() && addModalTarget() !== null}>
        <AddDomainAppModal
          open={addModalOpen()}
          onClose={() => { setAddModalOpen(false); setAddModalTarget(null); }}
          product={addModalTarget()!}
          mode={addModalMode()}
        />
      </Show>
    </div>
  );
};

// ===================== Main page =====================
const renderTabIcon = (key: string) => {
  const map: Record<string, any> = {
    theme: Palette, llm: Bot, git: Github, cron: Clock, gate: ShieldCheck, products: Package,
  };
  const I = map[key];
  return I ? <I size={14} class="inline mr-1" /> : null;
};
const TABS = [
  { key: 'theme', label: '主题外观' },
  { key: 'llm',   label: '大模型配置' },
  { key: 'git',   label: 'Git 仓库' },
  { key: 'cron',  label: '定时任务' },
  { key: 'gate',  label: '节点门控' },
  { key: 'products', label: '产品清单' },
];

const Settings: Component = () => {
  const [activeTab, setActiveTab] = createSignal('theme');

  return (
    <div>
      <div class="mb-4">
        <h2 class="text-lg font-semibold mt-0 mb-1" style={{ color: themeColors.text }}>系统设置</h2>
        <p class="text-xs m-0" style={{ color: themeColors.textMuted }}>管理平台主题、大模型接入、代码仓库、定时任务与流程门控配置</p>
      </div>

      {/* Tab bar */}
      <div class="flex gap-1 mb-4" style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
        <For each={TABS}>
          {(tab) => (
            <button
              class="px-4 py-2 text-sm font-medium transition-colors -mb-px"
              style={{
                color: activeTab() === tab.key ? chartColors.primary : themeColors.textMuted,
                'border-bottom': activeTab() === tab.key ? `2px solid ${chartColors.primary}` : '2px solid transparent',
                background: 'none',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {renderTabIcon(tab.key)}
              {tab.label}
            </button>
          )}
        </For>
      </div>

      {/* Tab content */}
      <Show when={activeTab() === 'theme'}><ThemeTab /></Show>
      <Show when={activeTab() === 'llm'}><LLMTab /></Show>
      <Show when={activeTab() === 'git'}><GitTab /></Show>
      <Show when={activeTab() === 'cron'}><CronTab /></Show>
      <Show when={activeTab() === 'gate'}><GateTab /></Show>
      <Show when={activeTab() === 'products'}><ProductListTab /></Show>
    </div>
  );
};

export default Settings;
