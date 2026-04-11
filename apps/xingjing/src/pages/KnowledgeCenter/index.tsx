import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Card, Row, Col, Typography, Tag, Input, Tree, Badge, Space, Empty, Statistic,
  Tabs, Button, Divider, Avatar, List, Spin,
} from 'antd';
import {
  BookOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  RetweetOutlined,
  UserOutlined,
  CodeOutlined,
  SearchOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  SendOutlined,
  MessageOutlined,
  ThunderboltOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import {
  knowledgeTree,
  knowledgeItems,
  findNodeByKey,
  getNodeKeys,
  categoryLabelMap,
  categoryColorMap,
  sceneLabelMap,
  levelLabelMap,
  levelColorMap,
  KnowledgeCategory,
  KnowledgeLevel,
  ApplicableScene,
  KnowledgeTreeNode,
} from '../../mock/knowledge';

const { Text, Title, Paragraph } = Typography;
const { Search } = Input;
const { TextArea } = Input;

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
    answer: `根据 **KW-CO-006 API 设计规范（RESTful + gRPC）**，金蝶统一 API 设计要求如下：\n\n**RESTful 规范**：\n• URL 使用名词复数，例如 \`/api/v1/vouchers\`\n• HTTP 方法语义化：GET 查询、POST 创建、PUT 全量更新、PATCH 局部更新\n• 错误码统一格式：\`{ code, message, traceId }\`\n• 版本策略：URL 路径版本（/v1/），向后兼容保留 2 个大版本\n\n**gRPC 规范**：\n• .proto 文件放置于 \`api/\` 目录，随代码版本管理\n• 废弃字段标记 \`reserved\`，不可复用字段编号\n\n所有接口需在 SDD CONTRACT 中定义行为规格，并通过 Pact 契约测试验证（参考 **KW-AP-003**）。`,
    relatedItems: ['KW-CO-006', 'KW-AP-003', 'KW-PL-002'],
  },
  {
    label: '总账应用有哪些核心知识？',
    answer: `**cosmic-gl（总账应用）** 知识体系按层次整理如下：\n\n**需求层**：\n• **KW-AP-001** — PRD-001 凭证批量导入功能说明\n• **KW-AP-007** — PRD-002 账期汇总报表功能说明\n\n**架构层**：\n• **KW-AP-002** — SDD-001 凭证批量导入架构设计（异步模式）\n• **KW-DM-004** — 总账领域服务架构（VoucherService/PeriodService/ReportService）\n• **KW-AP-006** — ADR-004 为何采用异步模式（架构决策记录）\n\n**契约层**：\n• **KW-AP-003** — CONTRACT-001 BatchImportAPI 接口契约\n• **KW-DM-005** — 总账与应付/应收集成规范\n\n**运维层**：\n• **KW-AP-008** — cosmic-gl Runbook（运维手册）\n\n建议新成员从 **KW-DM-001 总账词汇表** 开始阅读。`,
    relatedItems: ['KW-AP-001', 'KW-AP-002', 'KW-DM-004', 'KW-AP-006'],
  },
];

// 自定义问题的模拟回答逻辑
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
  // 默认回答
  return {
    answer: `我在知识库中检索到与「${question}」相关的内容。\n\n**相关知识建议**：\n• **规范层**：请参考 KW-CO 系列（公司级规范）\n• **架构层**：请参考 KW-PL 系列（产品线架构）\n• **领域层**：请参考 KW-DM 系列（领域知识）\n• **应用层**：请参考 KW-AP 系列（应用级规格）\n\n您可以在左侧知识树中选择对应层级，或使用顶部搜索框快速定位。如需了解特定模块（如凭证、期末结转、API设计等），可尝试更具体的提问。`,
    relatedItems: ['KW-CO-005', 'KW-CO-004', 'KW-CO-006'],
  };
}

// ===== 树形数据 & 辅助函数 =====
function toTreeData(nodes: KnowledgeTreeNode[]): any[] {
  return nodes.map((node) => {
    const allKeys = getNodeKeys(node);
    const count = knowledgeItems.filter((item) => allKeys.includes(item.nodeId)).length;
    return {
      key: node.key,
      title: (
        <span>
          {node.title}
          <Badge
            count={count}
            style={{ backgroundColor: levelColorMap[node.level], fontSize: 10, marginLeft: 6, boxShadow: 'none' }}
            size="small"
          />
        </span>
      ),
      children: node.children ? toTreeData(node.children) : undefined,
    };
  });
}

const categoryIcons: Record<KnowledgeCategory, React.ReactNode> = {
  specification: <FileTextOutlined />,
  architecture: <ApartmentOutlined />,
  process: <RetweetOutlined />,
  scenario: <UserOutlined />,
  'sdd-artifact': <CodeOutlined />,
  glossary: <BookOutlined />,
};

// ===== 知识问答 Tab =====
const KnowledgeQA: React.FC = () => {
  const [messages, setMessages] = useState<QAMessage[]>([
    {
      role: 'assistant',
      content: '您好！我是知识库 AI 助手，可以帮您快速检索和理解金蝶工程知识。您可以直接提问，或点击下方预设问题快速开始。',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (question?: string) => {
    const q = question ?? inputValue.trim();
    if (!q) return;
    setInputValue('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    setTimeout(() => {
      const { answer, relatedItems } = generateAnswer(q);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, relatedItems }]);
      setLoading(false);
    }, 900);
  };

  // 格式化 Markdown 内容（简单处理加粗和换行）
  const formatContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      // bold text **...**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} style={{ marginBottom: line === '' ? 6 : 2 }}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
        </div>
      );
    });
  };

  const relatedItemsForId = (ids: string[]) =>
    knowledgeItems.filter((item) => ids.includes(item.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: 500 }}>
      {/* 预设问题 */}
      <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          <ThunderboltOutlined style={{ marginRight: 4, color: '#faad14' }} />
          快速提问
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {presetQuestions.map((pq) => (
            <Button
              key={pq.label}
              size="small"
              type="dashed"
              onClick={() => handleSend(pq.label)}
              disabled={loading}
              style={{ fontSize: 12 }}
            >
              {pq.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* 对话区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            <Avatar
              size={32}
              style={{ flexShrink: 0, background: msg.role === 'assistant' ? '#1264e5' : '#52c41a' }}
              icon={msg.role === 'assistant' ? <RobotOutlined /> : <UserOutlined />}
            />
            <div style={{ maxWidth: '75%' }}>
              <Card
                size="small"
                style={{
                  background: msg.role === 'user' ? '#e6f4ff' : '#fafafa',
                  borderColor: msg.role === 'user' ? '#91caff' : '#f0f0f0',
                }}
                bodyStyle={{ padding: '8px 12px' }}
              >
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#333' }}>
                  {formatContent(msg.content)}
                </div>
              </Card>
              {/* 关联知识条目 */}
              {msg.relatedItems && msg.relatedItems.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <LinkOutlined style={{ marginRight: 4 }} />
                    关联知识：
                  </Text>
                  {relatedItemsForId(msg.relatedItems).map((item) => (
                    <Tag
                      key={item.id}
                      color={categoryColorMap[item.category]}
                      style={{ fontSize: 11, marginTop: 4, cursor: 'pointer' }}
                    >
                      {item.id} · {item.title}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar size={32} style={{ background: '#1264e5' }} icon={<RobotOutlined />} />
            <Card size="small" style={{ background: '#fafafa' }} bodyStyle={{ padding: '8px 12px' }}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>正在检索知识库...</Text>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="输入问题，例如：凭证批量导入的技术实现是什么？"
          autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ flex: 1, fontSize: 13 }}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleSend()}
          disabled={!inputValue.trim() || loading}
          style={{ height: 'auto', minHeight: 32 }}
        >
          发送
        </Button>
      </div>
    </div>
  );
};

// ===== 知识浏览 Tab =====
const KnowledgeBrowse: React.FC = () => {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>('kingdee');
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | null>(null);
  const [selectedScene, setSelectedScene] = useState<ApplicableScene | null>(null);
  const [searchText, setSearchText] = useState('');

  const selectedNode = useMemo(() => findNodeByKey(knowledgeTree, selectedNodeKey), [selectedNodeKey]);
  const currentNodeKeys = useMemo(() => {
    if (!selectedNode) return [];
    return getNodeKeys(selectedNode);
  }, [selectedNode]);

  const filteredItems = useMemo(() => {
    let items = knowledgeItems.filter((item) => currentNodeKeys.includes(item.nodeId));
    if (selectedCategory) items = items.filter((item) => item.category === selectedCategory);
    if (selectedScene) items = items.filter((item) => item.applicableScenes.includes(selectedScene));
    if (searchText.trim()) {
      const keyword = searchText.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.summary.toLowerCase().includes(keyword) ||
          item.tags.some((t) => t.toLowerCase().includes(keyword))
      );
    }
    return items;
  }, [currentNodeKeys, selectedCategory, selectedScene, searchText]);

  const treeData = useMemo(() => toTreeData(knowledgeTree), []);

  const allNodeItems = useMemo(
    () => knowledgeItems.filter((item) => currentNodeKeys.includes(item.nodeId)),
    [currentNodeKeys]
  );

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* 左侧：知识树 */}
      <div className="knowledge-tree-panel">
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
          <FolderOpenOutlined /> 知识层级导航
        </Text>
        <Tree
          treeData={treeData}
          defaultExpandAll
          selectedKeys={[selectedNodeKey]}
          onSelect={(keys) => {
            if (keys.length > 0) {
              setSelectedNodeKey(keys[0] as string);
              setSelectedCategory(null);
              setSelectedScene(null);
            }
          }}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* 右侧：知识内容 */}
      <div className="knowledge-content-panel">
        {selectedNode && (
          <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space size="middle">
                <Title level={5} style={{ margin: 0 }}>{selectedNode.title}</Title>
                <Tag style={{ background: levelColorMap[selectedNode.level], color: '#fff', border: 'none', fontWeight: 600 }}>
                  {levelLabelMap[selectedNode.level]}
                </Tag>
              </Space>
              <Space size="large">
                <Statistic title="知识条目" value={allNodeItems.length} valueStyle={{ fontSize: 20 }} />
                <Statistic
                  title="活跃知识"
                  value={allNodeItems.filter((i) => i.status === 'active').length}
                  valueStyle={{ fontSize: 20, color: '#52c41a' }}
                />
              </Space>
            </div>
          </Card>
        )}

        {/* 知识分类筛选 */}
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>知识类型：</Text>
          <Tag color={selectedCategory === null ? 'blue' : undefined} style={{ cursor: 'pointer' }} onClick={() => setSelectedCategory(null)}>
            全部
          </Tag>
          {(Object.keys(categoryLabelMap) as KnowledgeCategory[]).map((cat) => (
            <Tag
              key={cat}
              color={selectedCategory === cat ? categoryColorMap[cat] : undefined}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              {categoryLabelMap[cat]}
            </Tag>
          ))}
        </div>

        {/* 应用场景筛选 */}
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>适用场景：</Text>
          <Tag color={selectedScene === null ? 'blue' : undefined} style={{ cursor: 'pointer' }} onClick={() => setSelectedScene(null)}>
            全部
          </Tag>
          {(Object.keys(sceneLabelMap) as ApplicableScene[]).map((scene) => (
            <Tag
              key={scene}
              color={selectedScene === scene ? 'blue' : undefined}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedScene(selectedScene === scene ? null : scene)}
            >
              {sceneLabelMap[scene]}
            </Tag>
          ))}
        </div>

        {/* 知识卡片列表 */}
        {filteredItems.length === 0 ? (
          <Empty description="暂无匹配的知识条目" style={{ marginTop: 60 }} />
        ) : (
          <Row gutter={[12, 12]}>
            {filteredItems.map((item) => (
              <Col span={12} key={item.id}>
                <Card size="small" hoverable className="knowledge-card" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ color: categoryColorMap[item.category], fontSize: 14 }}>
                      {categoryIcons[item.category]}
                    </span>
                    <Tag color={categoryColorMap[item.category]} style={{ fontSize: 11, lineHeight: '18px' }}>
                      {categoryLabelMap[item.category]}
                    </Tag>
                    <Tag
                      style={{
                        background: levelColorMap[item.level],
                        color: '#fff',
                        border: 'none',
                        fontSize: 10,
                        lineHeight: '16px',
                        padding: '0 4px',
                      }}
                    >
                      {levelLabelMap[item.level]}
                    </Tag>
                  </div>
                  <Title level={5} style={{ margin: '0 0 4px 0', fontSize: 14 }}>{item.title}</Title>
                  <Paragraph
                    type="secondary"
                    style={{ fontSize: 12, margin: '0 0 8px 0', lineHeight: 1.6 }}
                    ellipsis={{ rows: 2 }}
                  >
                    {item.summary}
                  </Paragraph>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {item.applicableScenes.map((scene) => (
                      <Tag key={scene} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color="default">
                        {sceneLabelMap[scene]}
                      </Tag>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.owner} · {item.updatedAt}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.id}</Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
};

// ===== 主页面 =====
const KnowledgeCenter: React.FC = () => {
  const [searchText, setSearchText] = useState('');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>知识中心</Title>
        <Search
          placeholder="跨层级搜索知识..."
          allowClear
          prefix={<SearchOutlined />}
          style={{ width: 320 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <Tabs
        defaultActiveKey="browse"
        items={[
          {
            key: 'browse',
            label: (
              <span>
                <FolderOpenOutlined />
                知识浏览
              </span>
            ),
            children: <KnowledgeBrowse />,
          },
          {
            key: 'qa',
            label: (
              <span>
                <MessageOutlined />
                AI 知识问答
              </span>
            ),
            children: <KnowledgeQA />,
          },
        ]}
      />
    </div>
  );
};

export default KnowledgeCenter;
