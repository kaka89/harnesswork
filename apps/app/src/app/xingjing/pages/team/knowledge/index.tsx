import { Component, createSignal, For, Show, createMemo } from 'solid-js';
import {
  knowledgeTree, knowledgeItems, findNodeByKey, getNodeKeys,
  categoryLabelMap, categoryColorMap, sceneLabelMap, levelLabelMap, levelColorMap,
  KnowledgeCategory, KnowledgeLevel, ApplicableScene,
} from '../../../mock/knowledge';
import { Bot, Search, ChevronRight, ChevronDown, BookOpen, MessageCircle, Zap, Link } from 'lucide-solid';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';

// ===== 知识问答预设数据 =====
interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  relatedItems?: string[];
}

const presetQuestions = [
  {
    label: '凭证批量导入有什么限制？',
    answer: `根据 **KW-AP-001 PRD-001 凭证批量导入功能说明**，凭证批量导入的主要约束如下：\n\n• **单次最大导入量**：1000 条凭证\n• **响应时间要求**：< 30s 完成处理\n• **文件格式**：仅支持标准 Excel 格式（.xlsx）\n• **校验规则**：必须通过借贷平衡校验，否则整批失败\n• **错误处理**：提供行级错误提示，支持修正后重新导入\n\n架构上（参考 **KW-AP-002 SDD-001**），采用异步处理模式，避免 HTTP 超时，通过进度追踪接口获取实时状态。`,
    relatedItems: ['KW-AP-001', 'KW-AP-002', 'KW-AP-003'],
  },
  {
    label: '质量门禁标准要求是什么？',
    answer: `根据 **KW-PL-004 质量门禁标准**，苍穹平台的质量门禁包含四大硬指标：\n\n| 指标 | 要求 |\n|------|------|\n| 单元测试覆盖率 | ≥ 80% |\n| SonarQube | 0 Critical / 0 Blocker |\n| 安全扫描 | 0 CVE（高危及以上）|\n| Pact 契约测试 | 100% 通过 |\n\n**执行机制**：所有指标在 CI/CD 流水线中自动检查，未通过则阻断合并（参考 **KW-PL-003**）。\n\n**工具链**：SonarQube + JaCoCo + Trivy + Pact Broker。`,
    relatedItems: ['KW-PL-004', 'KW-PL-003'],
  },
  {
    label: '期末结转流程是怎样的？',
    answer: `根据 **KW-DM-003 期末结转流程规范**，期末结转标准流程分 5 个阶段：\n\n1. **损益科目归集** — 将所有损益类科目余额归集到本年利润\n2. **结转凭证生成** — 系统自动生成结转凭证（可预览）\n3. **预览确认** — 财务主管确认凭证，可修改摘要\n4. **执行结转** — 确认后系统执行批量记账\n5. **账期关闭** — 关闭当前账期，防止继续录入\n\n**注意**：结转前需确保所有在途凭证已审核完毕（参考 **KW-DM-001 总账词汇表** 中「账期」定义）。`,
    relatedItems: ['KW-DM-003', 'KW-DM-001', 'KW-DM-002'],
  },
  {
    label: '苍穹平台架构是怎样的？',
    answer: `根据 **KW-PL-001 苍穹平台架构总览**，苍穹平台采用现代云原生微服务架构：\n\n**技术层次**：\n• **前端层**：Vue3 + TypeScript，微前端架构（qiankun）\n• **网关层**：API Gateway（限流/鉴权/路由）\n• **应用层**：领域微服务（财务/供应链/人力/制造）\n• **平台层**：苍穹平台基础服务（扩展点、插件、主数据）\n• **数据层**：MySQL + Redis + Kafka + Elasticsearch\n\n**扩展机制**（参考 **KW-PL-005**）：苍穹提供扩展点（Extension Point）机制，业务方可在不修改平台代码的情况下扩展功能，支持插件热部署。\n\n**服务治理**（参考 **KW-PL-002**）：注册 Nacos、熔断 Sentinel、分布式事务 Seata。`,
    relatedItems: ['KW-PL-001', 'KW-PL-002', 'KW-PL-005'],
  },
  {
    label: 'API 设计规范有哪些要求？',
    answer: `根据 **KW-CO-006 API 设计规范（RESTful + gRPC）**，金蝶统一 API 设计要求如下：\n\n**RESTful 规范**：\n• URL 使用名词复数，例如 \`/api/v1/vouchers\`\n• HTTP 方法语义化：GET 查询、POST 创建、PUT 全量更新、PATCH 局部更新\n• 错误码统一格式：\`{ code, message, traceId }\`\n• 版本策略：URL 路径版本（/v1/），向后兼容保留 2 个大版本\n\n**gRPC 规范**：\n• .proto 文件放置于 \`api/\` 目录，随代码版本管理\n• 废弃字段标记 \`reserved\`，不可复用字段编号`,
    relatedItems: ['KW-CO-006', 'KW-AP-003', 'KW-PL-002'],
  },
  {
    label: '总账应用核心知识有哪些？',
    answer: `**cosmic-gl（总账应用）** 知识体系按层次整理如下：\n\n**需求层**：\n• **KW-AP-001** — PRD-001 凭证批量导入功能说明\n• **KW-AP-007** — PRD-002 账期汇总报表功能说明\n\n**架构层**：\n• **KW-AP-002** — SDD-001 凭证批量导入架构设计（异步模式）\n• **KW-DM-004** — 总账领域服务架构（VoucherService/PeriodService/ReportService）\n• **KW-AP-006** — ADR-004 为何采用异步模式（架构决策记录）\n\n**契约层**：\n• **KW-AP-003** — CONTRACT-001 BatchImportAPI 接口契约\n• **KW-DM-005** — 总账与应付/应收集成规范\n\n**运维层**：\n• **KW-AP-008** — cosmic-gl Runbook（运维手册）\n\n建议新成员从 **KW-DM-001 总账词汇表** 开始阅读。`,
    relatedItems: ['KW-AP-001', 'KW-AP-002', 'KW-DM-004', 'KW-AP-006'],
  },
];

function generateAnswer(question: string): { answer: string; relatedItems: string[] } {
  const q = question.toLowerCase();
  if (q.includes('sdd') || q.includes('设计文档') || q.includes('架构设计')) {
    return {
      answer: `**SDD（服务设计文档）** 是金蝶研发流程的核心产物，位于 PRD 之后、CONTRACT 之前。\n\n根据 **KW-CO-005 研发流程规范**，SDD 的核心内容包括：\n\n• **架构设计**：系统分层、服务边界、数据流转\n• **接口定义**：服务契约（行为规格 + 数据格式）\n• **非功能需求**：性能目标、可用性、容量规划\n• **架构决策（ADR）**：记录重要设计决策及理由\n\nSDD 完成后自动生成 CONTRACT 骨架，开发人员基于 CONTRACT 编写实现代码。参考 **KW-AP-002 SDD-001** 可看到具体的 SDD 产物示例。`,
      relatedItems: ['KW-CO-005', 'KW-AP-002', 'KW-AP-006'],
    };
  }
  if (q.includes('ddd') || q.includes('领域') || q.includes('微服务拆分')) {
    return {
      answer: `根据 **KW-CO-004 企业架构原则（12 Factor + DDD）**，金蝶微服务拆分遵循领域驱动设计原则：\n\n**核心概念**：\n• **限界上下文（Bounded Context）**：每个微服务对应一个限界上下文\n• **聚合根（Aggregate Root）**：如凭证（Voucher）是总账聚合根\n• **领域事件（Domain Event）**：如 VoucherPosted、PeriodClosed\n\n**实践规则**：\n• 服务间通过事件异步通信（参考 **KW-PD-003 跨域事件契约**）\n• 禁止跨领域直接调用数据库，必须走 API\n• 每个领域维护自己的数据模型（参考 **KW-PD-004 财务核心实体数据模型**）`,
      relatedItems: ['KW-CO-004', 'KW-PD-003', 'KW-PD-004'],
    };
  }
  if (q.includes('ci') || q.includes('cd') || q.includes('流水线') || q.includes('部署')) {
    return {
      answer: `根据 **KW-PL-003 CI/CD 流水线标准配置**，苍穹平台的标准流水线包含：\n\n**流水线阶段**：\n1. **代码扫描** — SonarQube 静态分析（< 5min）\n2. **单元测试** — JUnit + JaCoCo 覆盖率检查（≥ 80%）\n3. **安全扫描** — Trivy CVE 扫描\n4. **契约测试** — Pact 消费者/提供者验证\n5. **构建打包** — Docker 镜像构建\n6. **部署 staging** — 自动部署到预发环境\n7. **部署 prod** — 需要 Tech Lead 审批\n\n**环境规范**：dev → staging → prod，每个环境配置独立，不可手动修改（参考 **KW-PL-006 监控告警配置规范**）。`,
      relatedItems: ['KW-PL-003', 'KW-PL-004', 'KW-PL-006'],
    };
  }
  return {
    answer: `我在知识库中检索到与「${question}」相关的内容。\n\n**相关知识建议**：\n• **规范层**：请参考 KW-CO 系列（公司级规范）\n• **架构层**：请参考 KW-PL 系列（产品线架构）\n• **领域层**：请参考 KW-DM 系列（领域知识）\n• **应用层**：请参考 KW-AP 系列（应用级规格）\n\n您可以在左侧知识树中选择对应层级，或使用搜索框快速定位。`,
    relatedItems: ['KW-CO-005', 'KW-CO-004', 'KW-CO-006'],
  };
}

// 简单 Markdown 格式化：处理加粗和换行
const FormatContent = (props: { text: string }) => {
  const lines = () => props.text.split('\n');
  return (
    <div>
      <For each={lines()}>
        {(line) => {
          const parts = line.split(/\*\*(.*?)\*\*/g);
          return (
            <div style={{ 'margin-bottom': line === '' ? '6px' : '2px', 'line-height': '1.7' }}>
              <For each={parts}>
                {(part, idx) =>
                  idx() % 2 === 1
                    ? <strong>{part}</strong>
                    : <span>{part}</span>
                }
              </For>
            </div>
          );
        }}
      </For>
    </div>
  );
};

const KnowledgeCenter: Component = () => {
  const { actions } = useAppStore();
  const [agentThinking, setAgentThinking] = createSignal(false);

  const [activeTab, setActiveTab] = createSignal('browse');
  const [selectedNodeKey, setSelectedNodeKey] = createSignal<string>('kingdee');
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(new Set(['kingdee']));
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedCategory, setSelectedCategory] = createSignal<string>('');
  const [selectedScene, setSelectedScene] = createSignal<string>('');

  // Add Note Modal
  const [addNoteModal, setAddNoteModal] = createSignal<{ type: string; title: string } | null>(null);
  const [noteTitle, setNoteTitle] = createSignal('');
  const [noteContent, setNoteContent] = createSignal('');

  // QA state
  const [agentMessages, setAgentMessages] = createSignal<QAMessage[]>([
    {
      role: 'assistant',
      content: '您好！我是知识库 AI 助手，可以帮您快速检索和理解金蝶工程知识。您可以直接提问，或点击下方预设问题快速开始。',
    },
  ]);
  const [agentInput, setAgentInput] = createSignal('');

  const toggleNode = (key: string) => {
    const newExpanded = new Set(expandedNodes());
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedNodes(newExpanded);
  };

  const selectedNode = createMemo(() =>
    selectedNodeKey() ? findNodeByKey(knowledgeTree, selectedNodeKey()) : null
  );

  const currentNodeKeys = createMemo(() => {
    const node = selectedNode();
    if (!node) return knowledgeItems.map((i) => i.nodeId);
    return getNodeKeys(node);
  });

  const allNodeItems = createMemo(() =>
    knowledgeItems.filter((item) => currentNodeKeys().includes(item.nodeId))
  );

  const filteredItems = createMemo(() => {
    let items = allNodeItems();
    if (searchQuery()) {
      const kw = searchQuery().toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(kw) ||
          item.summary.toLowerCase().includes(kw) ||
          item.tags.some((t: string) => t.toLowerCase().includes(kw))
      );
    }
    if (selectedCategory()) {
      items = items.filter((item) => item.category === selectedCategory());
    }
    if (selectedScene()) {
      items = items.filter((item) => item.applicableScenes.includes(selectedScene() as any));
    }
    return items;
  });

  const relatedItemsForIds = (ids: string[]) =>
    knowledgeItems.filter((item) => ids.includes(item.id));

  const handleAgentSend = (question?: string) => {
    const q = question ?? agentInput().trim();
    if (!q || agentThinking()) return;
    setAgentInput('');
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAgentThinking(true);
    // 先插入空的 assistant 消息
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    actions.callAgent({
      systemPrompt: `你是一个知识库助手，负责回答关于软件研发、系统架构、业务流程的专业问题。
你的知识来源包括：公司编码规范、平台架构文档、产品线知识、领域词汇表和应用文档。

请基于已有的知识体系，给出准确、专业的回答。如果问题涉及具体代码或配置，请提供示例。
用中文回答，保持专业且易于理解。`,
      userPrompt: q,
      title: `knowledge-qa-${Date.now()}`,
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
          updated[updated.length - 1] = { role: 'assistant', content: fullText || '已完成检索。' };
          return updated;
        });
        setAgentThinking(false);
      },
      onError: (_err) => {
        setAgentMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '⚠️ AI 服务暂不可用，请检查 OpenCode 连接。' };
          return updated;
        });
        setAgentThinking(false);
      },
    }).catch(() => { setAgentThinking(false); });
  };

  const renderTreeNode = (node: any, level: number = 0) => {
    const isExpanded = () => expandedNodes().has(node.key);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = () => selectedNodeKey() === node.key;
    const itemCount = () => {
      const keys = getNodeKeys(node);
      return knowledgeItems.filter((item) => keys.includes(item.nodeId)).length;
    };

    return (
      <>
        <div
          style={{
            'padding-left': `${level * 14 + 8}px`,
            'padding-top': '5px',
            'padding-bottom': '5px',
            'padding-right': '8px',
            cursor: 'pointer',
            'border-radius': '4px',
            background: isSelected() ? 'var(--dls-hover, themeColors.primaryBg)' : 'transparent',
            display: 'flex',
            'align-items': 'center',
            gap: '4px',
          }}
          onClick={() => {
            setSelectedNodeKey(node.key);
            if (hasChildren) toggleNode(node.key);
          }}
        >
          <span style={{ width: '16px', display: 'flex', 'align-items': 'center', 'flex-shrink': '0' }}>
            {hasChildren && (
              <span
                style={{ cursor: 'pointer', color: themeColors.textSecondary }}
                onClick={(e) => { e.stopPropagation(); toggleNode(node.key); }}
              >
                {isExpanded() ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            )}
          </span>
          <span style={{
            'font-size': '13px',
            'font-weight': isSelected() ? '600' : 'normal',
            color: isSelected() ? 'var(--purple-11, chartColors.purple)' : 'inherit',
            flex: 1,
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
          }}>{node.title}</span>
          <Show when={itemCount() > 0}>
            <span style={{
              background: (levelColorMap as Record<string, string>)[node.level] || themeColors.border,
              color: themeColors.surface,
              'font-size': '10px',
              padding: '1px 5px',
              'border-radius': '8px',
              'flex-shrink': '0',
            }}>{itemCount()}</span>
          </Show>
        </div>
        <Show when={isExpanded() && hasChildren}>
          <For each={node.children}>
            {(child: any) => renderTreeNode(child, level + 1)}
          </For>
        </Show>
      </>
    );
  };

  const renderBrowse = () => (
    <div style={{ display: 'flex', gap: '16px' }}>
      {/* 左侧知识树 */}
      <div style={{ width: '220px', 'flex-shrink': '0', background: themeColors.surface, padding: '12px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'align-self': 'flex-start', position: 'sticky', top: 0 }}>
        <div style={{ 'font-weight': '600', 'margin-bottom': '10px', 'font-size': '13px', display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <BookOpen size={14} />知识层级导航
        </div>
        <For each={knowledgeTree}>
          {(node: any) => renderTreeNode(node, 0)}
        </For>
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, 'min-width': 0 }}>
        {/* 统计面板 */}
        <Show when={selectedNode()}>
          <div style={{ background: themeColors.surface, padding: '12px 16px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-bottom': '12px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
              <span style={{ 'font-size': '15px', 'font-weight': '700' }}>{(selectedNode() as any)?.title}</span>
              <span style={{
                background: (levelColorMap as Record<string, string>)[(selectedNode() as any)?.level] || themeColors.border,
                color: themeColors.surface, padding: '2px 8px', 'border-radius': '10px', 'font-size': '11px', 'font-weight': '600',
              }}>
                {(levelLabelMap as Record<string, string>)[(selectedNode() as any)?.level]}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ 'text-align': 'center' }}>
                <div style={{ 'font-size': '20px', 'font-weight': '700' }}>{allNodeItems().length}</div>
                <div style={{ 'font-size': '11px', color: themeColors.textSecondary }}>知识条目</div>
              </div>
              <div style={{ 'text-align': 'center' }}>
                <div style={{ 'font-size': '20px', 'font-weight': '700', color: chartColors.success }}>
                  {allNodeItems().filter((i) => i.status === 'active').length}
                </div>
                <div style={{ 'font-size': '11px', color: themeColors.textSecondary }}>活跃知识</div>
              </div>
            </div>
          </div>
        </Show>

        {/* 筛选条 */}
        <div style={{ background: themeColors.surface, padding: '10px 14px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-bottom': '12px' }}>
          {/* 搜索框 */}
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '10px' }}>
            <Search size={14} style={{ color: themeColors.textSecondary, 'flex-shrink': '0' }} />
            <input
              type="text"
              placeholder="跨层级搜索知识..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1, padding: '5px 8px', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', 'font-size': '13px', outline: 'none' }}
            />
          </div>
          {/* 知识类型 Tag 筛选 */}
          <div style={{ 'margin-bottom': '8px', display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textSecondary }}>知识类型：</span>
            <span
              style={{
                padding: '2px 10px', 'border-radius': '10px', 'font-size': '12px', cursor: 'pointer',
                background: selectedCategory() === '' ? chartColors.primary : themeColors.border,
                color: selectedCategory() === '' ? themeColors.surface : themeColors.textSecondary,
              }}
              onClick={() => setSelectedCategory('')}
            >全部</span>
            <For each={Object.keys(categoryLabelMap) as KnowledgeCategory[]}>
              {(cat) => (
                <span
                  style={{
                    padding: '2px 10px', 'border-radius': '10px', 'font-size': '12px', cursor: 'pointer',
                    background: selectedCategory() === cat ? (categoryColorMap[cat] || chartColors.primary) : themeColors.border,
                    color: selectedCategory() === cat ? themeColors.surface : themeColors.textSecondary,
                  }}
                  onClick={() => setSelectedCategory(selectedCategory() === cat ? '' : cat)}
                >
                  {categoryLabelMap[cat]}
                </span>
              )}
            </For>
          </div>
          {/* 适用场景 Tag 筛选 */}
          <div style={{ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '6px' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textSecondary }}>适用场景：</span>
            <span
              style={{
                padding: '2px 10px', 'border-radius': '10px', 'font-size': '12px', cursor: 'pointer',
                background: selectedScene() === '' ? chartColors.primary : themeColors.border,
                color: selectedScene() === '' ? themeColors.surface : themeColors.textSecondary,
              }}
              onClick={() => setSelectedScene('')}
            >全部</span>
            <For each={Object.keys(sceneLabelMap) as ApplicableScene[]}>
              {(scene) => (
                <span
                  style={{
                    padding: '2px 10px', 'border-radius': '10px', 'font-size': '12px', cursor: 'pointer',
                    background: selectedScene() === scene ? chartColors.primary : themeColors.border,
                    color: selectedScene() === scene ? themeColors.surface : themeColors.textSecondary,
                  }}
                  onClick={() => setSelectedScene(selectedScene() === scene ? '' : scene)}
                >
                  {sceneLabelMap[scene]}
                </span>
              )}
            </For>
          </div>
        </div>

        {/* 知识卡片网格 */}
        <Show
          when={filteredItems().length > 0}
          fallback={
            <div style={{ 'text-align': 'center', padding: '60px 0', color: themeColors.textSecondary }}>暂无匹配的知识条目</div>
          }
        >
          <div style={{ 'margin-bottom': '8px', 'font-size': '13px', color: themeColors.textSecondary }}>
            共 {filteredItems().length} 条知识条目
          </div>
          <div style={{ display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '12px' }}>
            <For each={filteredItems()}>
              {(item) => (
                <div style={{
                  background: themeColors.surface,
                  padding: '14px',
                  'border-radius': '8px',
                  border: `1px solid ${themeColors.border}`,
                  'border-left': `3px solid ${(levelColorMap as Record<string, string>)[item.level] || themeColors.border}`,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '6px' }}>
                    <span style={{
                      background: (categoryColorMap as Record<string, string>)[item.category] || themeColors.border,
                      color: themeColors.surface, padding: '1px 7px', 'border-radius': '8px', 'font-size': '11px',
                    }}>{categoryLabelMap[item.category]}</span>
                    <span style={{
                      background: (levelColorMap as Record<string, string>)[item.level] || themeColors.border,
                      color: themeColors.surface, padding: '1px 6px', 'border-radius': '8px', 'font-size': '10px',
                    }}>{levelLabelMap[item.level]}</span>
                  </div>
                  <div style={{ 'font-weight': '600', 'font-size': '13px', 'margin-bottom': '5px', 'line-height': '1.4' }}>{item.title}</div>
                  <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'line-height': '1.6', 'margin-bottom': '8px', display: '-webkit-box', '-webkit-line-clamp': '2', '-webkit-box-orient': 'vertical', overflow: 'hidden' }}>
                    {item.summary}
                  </div>
                  <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px', 'margin-bottom': '6px' }}>
                    <For each={item.applicableScenes}>
                      {(scene: string) => (
                        <span style={{ background: themeColors.primaryBg, color: chartColors.primary, padding: '1px 6px', 'border-radius': '8px', 'font-size': '10px' }}>
                          {(sceneLabelMap as Record<string, string>)[scene]}
                        </span>
                      )}
                    </For>
                  </div>
                  <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'font-size': '11px', color: themeColors.border }}>
                    <span>{item.owner} · {item.updatedAt}</span>
                    <span style={{ 'font-family': 'monospace' }}>{item.id}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* 添加笔记和记录踩坑按钮 */}
        <div style={{ display: 'flex', gap: '12px', 'margin-top': '16px' }}>
          <button
            style={{
              flex: 1,
              padding: '10px 14px',
              border: `1px dashed ${themeColors.border}`,
              'border-radius': '6px',
              background: 'transparent',
              color: themeColors.textSecondary,
              'font-size': '13px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setAddNoteModal({ type: 'note', title: '添加笔记' })}
          >
            + 添加笔记
          </button>
          <button
            style={{
              flex: 1,
              padding: '10px 14px',
              border: `1px dashed ${themeColors.border}`,
              'border-radius': '6px',
              background: 'transparent',
              color: themeColors.textSecondary,
              'font-size': '13px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setAddNoteModal({ type: 'pit', title: '记录踩坑' })}
          >
            + 记录踩坑
          </button>
        </div>
      </div>
    </div>
  );

  const renderQA = () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: 'calc(100vh - 220px)', 'min-height': '500px' }}>
      {/* 预设问题 */}
      <div style={{ background: themeColors.surface, padding: '12px', 'border-radius': '8px', border: `1px solid ${themeColors.border}`, 'margin-bottom': '12px', 'flex-shrink': '0' }}>
        <div style={{ 'font-size': '12px', color: themeColors.textSecondary, 'margin-bottom': '8px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
          <Zap size={12} style={{ color: chartColors.warning }} />快速提问
        </div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
          <For each={presetQuestions}>
            {(pq) => (
              <button
                style={{
                  background: 'transparent', border: `1px dashed ${themeColors.border}`, padding: '3px 10px',
                  'border-radius': '4px', cursor: 'pointer', 'font-size': '12px', color: themeColors.textSecondary,
                  opacity: agentThinking() ? '0.6' : '1',
                }}
                disabled={agentThinking()}
                onClick={() => handleAgentSend(pq.label)}
              >
                {pq.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* 对话区 */}
      <div style={{ flex: 1, 'overflow-y': 'auto', display: 'flex', 'flex-direction': 'column', gap: '14px', padding: '4px 2px' }}>
        <For each={agentMessages()}>
          {(msg) => (
            <div style={{ display: 'flex', gap: '10px', 'align-items': 'flex-start', 'flex-direction': msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: '32px', height: '32px', 'border-radius': '50%', 'flex-shrink': '0',
                background: msg.role === 'assistant' ? chartColors.primary : chartColors.success,
                display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: themeColors.surface,
              }}>
                {msg.role === 'assistant' ? <Bot size={16} /> : <span style={{ 'font-size': '13px', 'font-weight': '700' }}>我</span>}
              </div>
              <div style={{ 'max-width': '75%' }}>
                <div style={{
                  background: msg.role === 'user' ? themeColors.primaryBg : themeColors.hover,
                  border: `1px solid ${msg.role === 'user' ? themeColors.primaryBorder : themeColors.border}`,
                  padding: '9px 13px', 'border-radius': '8px', 'font-size': '13px', color: themeColors.text,
                }}>
                  <FormatContent text={msg.content} />
                </div>
                {/* 关联知识条目 */}
                <Show when={msg.relatedItems && msg.relatedItems.length > 0}>
                  <div style={{ 'margin-top': '6px', display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '4px' }}>
                    <span style={{ 'font-size': '11px', color: themeColors.textSecondary, display: 'flex', 'align-items': 'center', gap: '3px' }}>
                      <Link size={11} />关联知识：
                    </span>
                    <For each={relatedItemsForIds(msg.relatedItems || [])}>
                      {(item) => (
                        <span style={{
                          background: (categoryColorMap as Record<string, string>)[item.category] || themeColors.border,
                          color: themeColors.surface, padding: '1px 8px', 'border-radius': '8px', 'font-size': '11px',
                          cursor: 'pointer',
                        }}>
                          {item.id} · {item.title}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
        <Show when={agentThinking()}>
          <div style={{ display: 'flex', gap: '10px', 'align-items': 'center' }}>
            <div style={{ width: '32px', height: '32px', 'border-radius': '50%', background: chartColors.primary, display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: themeColors.surface }}>
              <Bot size={16} />
            </div>
            <div style={{ background: themeColors.hover, border: `1px solid ${themeColors.border}`, padding: '9px 13px', 'border-radius': '8px', 'font-size': '12px', color: themeColors.textSecondary }}>
              正在检索知识库...
            </div>
          </div>
        </Show>
      </div>

      {/* 输入区 */}
      <div style={{ 'border-top': `1px solid ${themeColors.border}`, 'padding-top': '10px', 'margin-top': '8px', display: 'flex', gap: '8px', 'flex-shrink': '0' }}>
        <input
          type="text"
          placeholder="输入问题，例如：凭证批量导入的技术实现是什么？"
          value={agentInput()}
          onInput={(e) => setAgentInput(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !agentThinking()) handleAgentSend(); }}
          disabled={agentThinking()}
          style={{ flex: 1, padding: '8px 12px', border: `1px solid ${themeColors.border}`, 'border-radius': '4px', 'font-size': '13px', outline: 'none' }}
        />
        <button
          style={{
            background: agentInput().trim() && !agentThinking() ? chartColors.primary : themeColors.border,
            color: agentInput().trim() && !agentThinking() ? themeColors.surface : themeColors.textSecondary,
            border: 'none', padding: '8px 16px', 'border-radius': '4px', cursor: agentInput().trim() && !agentThinking() ? 'pointer' : 'default', 'font-size': '13px',
            opacity: agentThinking() ? '0.6' : '1',
          }}
          disabled={!agentInput().trim() || agentThinking()}
          onClick={() => handleAgentSend()}
        >
          {agentThinking() ? '查询中...' : '发送'}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ 'margin-bottom': '16px', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}>
        <h2 style={{ margin: 0, 'font-size': '20px' }}>知识中心</h2>
      </div>

      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '16px', 'border-bottom': `1px solid ${themeColors.border}` }}>
        <button
          style={{
            background: activeTab() === 'browse' ? chartColors.primary : 'transparent',
            color: activeTab() === 'browse' ? themeColors.surface : themeColors.textSecondary,
            border: 'none', padding: '8px 16px', 'border-radius': '4px 4px 0 0',
            cursor: 'pointer', 'font-size': '14px', display: 'inline-flex', 'align-items': 'center', gap: '6px',
          }}
          onClick={() => setActiveTab('browse')}
        >
          <BookOpen size={14} />知识浏览
        </button>
        <button
          style={{
            background: activeTab() === 'qa' ? chartColors.primary : 'transparent',
            color: activeTab() === 'qa' ? themeColors.surface : themeColors.textSecondary,
            border: 'none', padding: '8px 16px', 'border-radius': '4px 4px 0 0',
            cursor: 'pointer', 'font-size': '14px', display: 'inline-flex', 'align-items': 'center', gap: '6px',
          }}
          onClick={() => setActiveTab('qa')}
        >
          <MessageCircle size={14} />AI 知识问答
        </button>
      </div>

      <Show when={activeTab() === 'browse'}>{renderBrowse()}</Show>
      <Show when={activeTab() === 'qa'}>{renderQA()}</Show>

      {/* 添加笔记/踩坑弹窗 */}
      <Show when={addNoteModal() !== null}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'z-index': 1000 }}>
          <div style={{ background: themeColors.surface, 'border-radius': '8px', padding: '24px', width: '100%', 'max-width': '480px', 'box-shadow': '0 4px 16px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px', 'font-size': '16px', 'font-weight': 600 }}>{addNoteModal()!.title}</h3>
            <div style={{ 'margin-bottom': '12px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>标题</label>
              <input
                type="text"
                placeholder="输入标题..."
                value={noteTitle()}
                onInput={(e) => setNoteTitle(e.currentTarget.value)}
                style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ 'margin-bottom': '16px' }}>
              <label style={{ display: 'block', 'font-size': '12px', 'font-weight': 500, 'margin-bottom': '6px', color: themeColors.textSecondary }}>内容</label>
              <textarea
                rows={5}
                placeholder="输入内容..."
                value={noteContent()}
                onInput={(e) => setNoteContent(e.currentTarget.value)}
                style={{ width: '100%', border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '8px 12px', 'font-size': '14px', 'font-family': 'inherit', resize: 'vertical', 'box-sizing': 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', 'justify-content': 'flex-end', gap: '8px' }}>
              <button
                style={{ background: themeColors.surface, border: `1px solid ${themeColors.border}`, 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => {
                  setAddNoteModal(null);
                  setNoteTitle('');
                  setNoteContent('');
                }}
              >取消</button>
              <button
                style={{ background: themeColors.primary, color: 'white', border: 'none', 'border-radius': '6px', padding: '6px 16px', cursor: 'pointer', 'font-size': '14px' }}
                onClick={() => {
                  setAddNoteModal(null);
                  setNoteTitle('');
                  setNoteContent('');
                }}
              >保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default KnowledgeCenter;
