import { Component, createSignal, For, Show } from 'solid-js';
import { Bot, Code, CheckCircle, AlertCircle, Network } from 'lucide-solid';
import { sddList, SDD } from '../../../mock/sdd';
import { contractList } from '../../../mock/contracts';
import { prdList } from '../../../mock/prd';
import { useAppStore } from '../../../stores/app-store';
import { themeColors } from '../../../utils/colors';

const statusMap: Record<SDD['status'], { label: string; color: string; bg: string }> = {
  pending:       { label: '待设计',  color: themeColors.textSecondary, bg: themeColors.hover },
  'in-progress': { label: '进行中',  color: themeColors.primary, bg: themeColors.primaryBg },
  approved:      { label: '已批准',  color: themeColors.success, bg: themeColors.successBg },
};

const DesignWorkshop: Component = () => {
  const { actions } = useAppStore();
  const [selectedSdd, setSelectedSdd] = createSignal<SDD>(sddList[0]);
  const [agentInput, setAgentInput] = createSignal('');
  const [agentMessages, setAgentMessages] = createSignal<{ role: string; content: string }[]>([]);
  const [agentThinking, setAgentThinking] = createSignal(false);
  const [generatingSddFor, setGeneratingSddFor] = createSignal<string | null>(null);

  const pendingPrds = prdList.filter((p) => p.status === 'approved' && !sddList.find((s) => s.prdId === p.id));

  const handleAgentSend = (overrideInput?: string) => {
    const q = overrideInput ?? agentInput().trim();
    if (!q || agentThinking()) return;
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    if (!overrideInput) setAgentInput('');
    setAgentThinking(true);
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const sdd = selectedSdd();
    actions.callAgent({
      systemPrompt: `你是一个架构师助手（architect-agent），专注于系统设计和技术架构。
你有以下能力：
- 根据 PRD 生成 SDD（系统设计文档）初稿
- 优化架构图和系统设计
- 检查设计一致性和契约合规性
- 提供架构评审意见

当前选中的 SDD：${sdd.id} - ${sdd.title}（状态：${sdd.status}）
关联契约数：${sdd.contractIds.length}
代码同步状态：${sdd.codeSync ? '已同步' : '未同步'}

请用中文回复，技术描述要清晰专业。`,
      userPrompt: q,
      title: `architect-agent-${Date.now()}`,
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

  const handleGenerateSdd = (prdId: string, prdTitle: string) => {
    if (generatingSddFor()) return;
    setGeneratingSddFor(prdId);
    const prompt = `请基于以下 PRD 生成 SDD（系统设计文档）初稿：
PRD ID：${prdId}
PRD 标题：${prdTitle}

请包含：
1. 系统架构设计（组件图/序列图用 ASCII 表示）
2. 核心接口定义（REST API 格式）
3. 数据模型设计（主要实体和关系）
4. 非功能需求方案（性能、安全、可用性）
5. 技术风险和缓解措施`;

    handleAgentSend(prompt);
    setGeneratingSddFor(null);
  };

  const selectedContracts = () => contractList.filter((c) => selectedSdd().contractIds.includes(c.id));

  return (
    <div>
      <h2 style={{ 'font-size': '20px', 'font-weight': 600, 'margin-bottom': '16px', 'margin-top': '0' }}>设计工坊</h2>

      {/* Pending PRDs */}
      <Show when={pendingPrds.length > 0}>
        <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '16px', background: themeColors.surface, 'margin-bottom': '16px' }}>
          <div style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.textSecondary, 'margin-bottom': '12px' }}>待处理（PRD 已批准，待设计）</div>
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '12px' }}>
            <For each={pendingPrds}>
              {(prd) => (
                <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '12px' }}>
                  <div style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>{prd.id}: {prd.title}</div>
                  <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '4px' }}>批准时间：最近</div>
                  <div style={{ display: 'flex', gap: '8px', 'margin-top': '8px' }}>
                    <button
                      style={{ padding: '5px 12px', background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '12px', cursor: generatingSddFor() === prd.id ? 'not-allowed' : 'pointer', display: 'inline-flex', 'align-items': 'center', gap: '4px', opacity: generatingSddFor() === prd.id ? '0.6' : '1' }}
                      onClick={() => handleGenerateSdd(prd.id, prd.title)}
                      disabled={!!generatingSddFor()}
                    >
                      <Bot size={14} /> {generatingSddFor() === prd.id ? '生成中...' : '生成 SDD 初稿'}
                    </button>
                    <button
                      style={{ padding: '5px 12px', background: 'white', color: themeColors.textSecondary, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', 'font-size': '12px', cursor: 'pointer' }}
                      onClick={() => {
                        setAgentMessages((prev) => [...prev, { role: 'user', content: `手动为 ${prd.id}: ${prd.title} 创建 SDD 框架` }]);
                        setAgentMessages((prev) => [...prev, { role: 'assistant', content: `✓ 已创建 SDD 框架：\n\n📄 SDD-NEW: ${prd.title}\n\n请在下方 architect-agent 面板中补充架构设计细节。` }]);
                      }}
                    >
                      手动创建
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* SDD List + Detail */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Left: SDD list */}
        <div style={{ width: '208px', 'flex-shrink': 0 }}>
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', padding: '12px', background: themeColors.surface }}>
            <div style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '8px' }}>SDD 列表</div>
            <For each={sddList}>
              {(sdd) => (
                <div
                  style={{
                    padding: '8px 12px',
                    'border-radius': '6px',
                    'margin-bottom': '4px',
                    cursor: 'pointer',
                    background: selectedSdd().id === sdd.id ? themeColors.primaryBg : 'transparent',
                    'border-left': `3px solid ${selectedSdd().id === sdd.id ? themeColors.primary : 'transparent'}`,
                  }}
                  onClick={() => setSelectedSdd(sdd)}
                >
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                    <span style={{ 'font-weight': 600, 'font-size': '12px', color: themeColors.text }}>{sdd.id}</span>
                    <span
                      style={{ 'font-size': '11px', padding: '2px 8px', 'border-radius': '4px', color: statusMap[sdd.status].color, background: statusMap[sdd.status].bg }}
                    >
                      {statusMap[sdd.status].label}
                    </span>
                  </div>
                  <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-top': '4px' }}>{sdd.title}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Right: SDD detail */}
        <div style={{ flex: 1, 'min-width': 0 }}>
          {/* SDD detail card */}
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', 'margin-bottom': '16px', background: themeColors.surface }}>
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.border}` }}>
              <span style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>{selectedSdd().id}: {selectedSdd().title}</span>
              <span
                style={{ 'font-size': '11px', padding: '2px 8px', 'border-radius': '4px', color: statusMap[selectedSdd().status].color, background: statusMap[selectedSdd().status].bg }}
              >
                {statusMap[selectedSdd().status].label}
              </span>
            </div>
            <div style={{ padding: '16px', display: 'grid', 'grid-template-columns': '7fr 5fr', gap: '16px' }}>
              {/* Architecture */}
              <div>
                <div style={{ 'font-weight': 600, 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
                  <Code size={14} /> 架构图
                </div>
                <pre style={{ background: themeColors.hover, padding: '12px', 'border-radius': '6px', 'font-size': '12px', overflow: 'auto', margin: 0, 'font-family': 'monospace' }}>
                  {selectedSdd().architecture}
                </pre>
              </div>
              {/* Key metrics */}
              <div>
                <div style={{ 'font-weight': 600, 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '8px' }}>关键指标</div>
                <div style={{ 'font-size': '12px', 'line-height': '1.8' }}>
                  <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>关联 PRD</span>
                    <span style={{ color: themeColors.text }}>{selectedSdd().prdId}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>关联 CONTRACT</span>
                    <span style={{ color: themeColors.text }}>{selectedSdd().contractIds.length > 0 ? selectedSdd().contractIds.join(', ') : '无'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>关联 TASK</span>
                    <span style={{ color: themeColors.text }}>{selectedSdd().taskCount}个（{selectedSdd().taskDone}/{selectedSdd().taskCount}完成）</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>最后更新</span>
                    <span style={{ color: themeColors.text }}>{selectedSdd().lastUpdate}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '4px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>代码一致</span>
                    <span
                      style={{
                        'font-size': '11px',
                        padding: '2px 8px',
                        'border-radius': '4px',
                        color: selectedSdd().codeSync ? themeColors.success : themeColors.warning,
                        background: selectedSdd().codeSync ? themeColors.successBg : themeColors.warningBg,
                      }}
                    >
                      {selectedSdd().codeSync ? '已同步' : '未同步'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: themeColors.textMuted, 'min-width': '80px' }}>复杂度</span>
                    <span style={{ color: themeColors.text }}>{selectedSdd().complexity}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CONTRACT management */}
          <div style={{ border: `1px solid ${themeColors.border}`, 'border-radius': '8px', background: themeColors.surface }}>
            <div style={{ padding: '12px 16px', 'border-bottom': `1px solid ${themeColors.border}`, 'font-weight': 600, 'font-size': '13px', color: themeColors.textSecondary, display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <Network size={14} /> CONTRACT 管理
            </div>
            <div style={{ padding: '16px' }}>
              <Show when={selectedContracts().length === 0}>
                <div style={{ 'text-align': 'center', color: themeColors.border, 'font-size': '13px', padding: '24px 0' }}>暂无关联 CONTRACT</div>
              </Show>
              <Show when={selectedContracts().length > 0}>
                <table style={{ width: '100%', 'font-size': '12px', 'border-collapse': 'collapse' }}>
                  <thead>
                    <tr style={{ 'border-bottom': `1px solid ${themeColors.border}` }}>
                      <For each={['ID', '版本', '生产者', '消费者', 'Pact 状态', '接口数', '行为规格', '最后验证']}>
                        {(h) => <th style={{ 'text-align': 'left', padding: '8px 12px', color: themeColors.textMuted, 'font-weight': 500 }}>{h}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={selectedContracts()}>
                      {(contract) => (
                        <tr style={{ 'border-bottom': `1px solid ${themeColors.hover}` }}>
                          <td style={{ padding: '8px 12px', 'font-weight': 500, color: themeColors.text }}>{contract.id}</td>
                          <td style={{ padding: '8px 12px', color: themeColors.textMuted }}>{contract.version}</td>
                          <td style={{ padding: '8px 12px', color: themeColors.textMuted }}>{contract.producer}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}>
                              <For each={contract.consumers}>
                                {(c) => <span style={{ 'font-size': '11px', padding: '2px 8px', background: themeColors.primaryBg, color: themeColors.primary, 'border-radius': '4px' }}>{c}</span>}
                              </For>
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span
                              style={{
                                'font-size': '11px',
                                padding: '2px 8px',
                                'border-radius': '4px',
                                color: contract.pactStatus === 'passed' ? themeColors.success : contract.pactStatus === 'failed' ? themeColors.error : themeColors.warning,
                                background: contract.pactStatus === 'passed' ? themeColors.successBg : contract.pactStatus === 'failed' ? themeColors.errorBg : themeColors.warningBg,
                              }}
                            >
                              {contract.pactStatus === 'passed' ? '通过' : contract.pactStatus === 'failed' ? '失败' : '待验证'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: themeColors.textMuted }}>{contract.interfaceCount}</td>
                          <td style={{ padding: '8px 12px', color: themeColors.textMuted }}>{contract.behaviorCount}</td>
                          <td style={{ padding: '8px 12px', color: themeColors.textMuted }}>{contract.lastVerified}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Agent panel */}
      <div style={{ 'margin-top': '16px', border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '8px', background: 'linear-gradient(135deg, #f0f5ff 0%, #e8f4f8 100%)', padding: '16px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'font-weight': 600, 'font-size': '13px', color: themeColors.primary, 'margin-bottom': '8px' }}>
          <Bot size={14} /> architect-agent
        </div>
        <For each={agentMessages()}>
          {(msg) => (
            <div
              style={{ 'margin-bottom': '8px', padding: '6px 10px', background: msg.role === 'user' ? themeColors.primaryBg : themeColors.surface, 'border-radius': '6px', 'font-size': '13px', 'white-space': 'pre-wrap' }}
            >
              <span style={{ 'font-weight': 600, 'font-size': '12px' }}>{msg.role === 'user' ? '你' : 'architect-agent'}：</span><br />
              {msg.content}
            </div>
          )}
        </For>
        <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
          <For each={['生成 SDD', '优化架构图', '检查设计一致性']}>
            {(q) => (
              <button
                style={{ 'font-size': '12px', padding: '5px 12px', border: `1px solid ${themeColors.primaryBorder}`, color: themeColors.primary, 'border-radius': '6px', background: 'transparent', cursor: 'pointer' }}
                onClick={() => handleAgentSend(q)}
              >
                {q}
              </button>
            )}
          </For>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={agentInput()}
            onInput={(e) => setAgentInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAgentSend(); }}
            placeholder="问 AI..."
            style={{ flex: 1, padding: '6px 10px', border: `1px solid ${themeColors.primaryBorder}`, 'border-radius': '6px', 'font-size': '12px', outline: 'none', background: themeColors.surface }}
          />
          <button
            onClick={() => handleAgentSend()}
            disabled={agentThinking()}
            style={{ padding: '6px 12px', background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', 'font-size': '12px', cursor: agentThinking() ? 'not-allowed' : 'pointer', opacity: agentThinking() ? '0.6' : '1' }}
          >
            {agentThinking() ? '思考中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesignWorkshop;
