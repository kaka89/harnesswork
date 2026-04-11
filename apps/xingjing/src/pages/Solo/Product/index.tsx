import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Tabs, Typography, Button, Space, Progress,
  Empty, Modal, Input, message,
} from 'antd';
import {
  BulbOutlined, CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined,
  PlusOutlined, RobotOutlined, SendOutlined, ThunderboltOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { hypotheses, featureIdeas, competitors, Hypothesis, HypothesisStatus } from '../../../mock/solo';

const { Text, Title, Paragraph } = Typography;

const statusConfig: Record<HypothesisStatus, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  testing:     { label: '验证中', color: 'processing', icon: <ExperimentOutlined />, bg: '#e6f7ff' },
  validated:   { label: '已证实', color: 'success', icon: <CheckCircleOutlined />, bg: '#f6ffed' },
  invalidated: { label: '已推翻', color: 'error', icon: <CloseCircleOutlined />, bg: '#fff2f0' },
};

const impactConfig = { high: { label: '高影响', color: 'red' }, medium: { label: '中影响', color: 'orange' }, low: { label: '低影响', color: 'default' } };

const HypothesisColumn: React.FC<{
  title: string;
  status: HypothesisStatus;
  items: Hypothesis[];
  onDetail: (h: Hypothesis) => void;
}> = ({ title, status, items, onDetail }) => {
  const cfg = statusConfig[status];
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          padding: '8px 12px',
          background: cfg.bg,
          borderRadius: 8,
        }}
      >
        {cfg.icon}
        <Text strong>{title}</Text>
        <Tag style={{ marginLeft: 'auto', fontSize: 11 }}>{items.length}</Tag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" style={{ margin: '20px 0' }} />
        )}
        {items.map((h) => (
          <Card
            key={h.id}
            size="small"
            hoverable
            onClick={() => onDetail(h)}
            style={{ borderRadius: 10, cursor: 'pointer', border: `1px solid ${status === 'validated' ? '#b7eb8f' : status === 'invalidated' ? '#ffccc7' : '#d9d9d9'}` }}
            bodyStyle={{ padding: '12px 14px' }}
          >
            <div style={{ marginBottom: 6 }}>
              <Text strong style={{ fontSize: 13 }}>「{h.belief}」</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <QuestionCircleOutlined style={{ marginRight: 4 }} />
              {h.method}
            </Text>
            {h.result && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  background: status === 'validated' ? '#f6ffed' : '#fff2f0',
                  borderRadius: 6,
                  fontSize: 12,
                  color: status === 'validated' ? '#389e0d' : '#cf1322',
                }}
              >
                {h.result}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <Tag color={impactConfig[h.impact].color} style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px' }}>
                {impactConfig[h.impact].label}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>{h.createdAt}</Text>
            </div>
          </Card>
        ))}
        {status === 'testing' && (
          <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
            新增假设
          </Button>
        )}
      </div>
    </div>
  );
};

const SoloProduct: React.FC = () => {
  const [activeTab, setActiveTab] = useState('hypotheses');
  const [detailHypo, setDetailHypo] = useState<Hypothesis | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState([
    {
      role: 'assistant',
      content: '我是你的「用户代言人」。我会基于你录入的用户洞察，质疑你的产品决策。\n\n试试问我：「段落重写真的是用户最需要的功能吗？」',
    },
  ]);

  const testingItems = hypotheses.filter((h) => h.status === 'testing');
  const validatedItems = hypotheses.filter((h) => h.status === 'validated');
  const invalidatedItems = hypotheses.filter((h) => h.status === 'invalidated');

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    const q = agentInput.trim();
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (q.includes('重写') || q.includes('段落')) {
        reply = '作为用户代言人，我要质疑这个假设 🤔\n\n根据你的数据：\n· 大纲功能只有 12% 活跃使用率，最初用户调研有 70% 感兴趣\n· 这说明「用户说想要」≠「用户会真正使用」\n\n段落重写的验证方式（邀请 5 位用户内测）可能样本量不够，建议先上线一个更粗糙的 MVP，看真实使用频率，而不是只问用户「你喜欢吗」。';
      } else if (q.includes('团队') || q.includes('协作')) {
        reply = '这是个好问题！根据你的用户反馈，有用户 zhuming@corp.com 明确询问团队版，且愿意付费 5 人。\n\n但注意：企业版功能复杂度会让你的开发成本翻倍，而且你的 NPS 42 主要来自个人用户。\n\n建议：先用「共享链接」这个轻量功能代替团队版验证需求，不要贸然做完整团队版。';
      } else {
        reply = '作为你的用户代言人，我注意到：你的活跃用户 78% 在晚间使用，说明他们是「业余写作者」而非专业作家。这个画像会影响很多产品决策……你想深入讨论哪个功能？';
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 700);
  };

  const priorityColor = { P0: '#ff4d4f', P1: '#faad14', P2: '#1264e5', P3: '#8c8c8c' };

  const tabs = [
    {
      key: 'hypotheses',
      label: (
        <span>
          <ExperimentOutlined /> 假设看板
          <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>{testingItems.length} 验证中</Tag>
        </span>
      ),
      children: (
        <div>
          {/* Contrast note */}
          <div
            style={{
              padding: '8px 14px',
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 12,
              color: '#8c6914',
            }}
          >
            <Text strong>💡 对比团队版：</Text> 团队版需要完整 PRD → 评审 → 批准流程，独立版直接用假设驱动验证，快速决策。
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <HypothesisColumn title="验证中" status="testing" items={testingItems} onDetail={setDetailHypo} />
            <HypothesisColumn title="已证实" status="validated" items={validatedItems} onDetail={setDetailHypo} />
            <HypothesisColumn title="已推翻" status="invalidated" items={invalidatedItems} onDetail={setDetailHypo} />
          </div>
        </div>
      ),
    },
    {
      key: 'ideas',
      label: (
        <span>
          <BulbOutlined /> 功能想法
        </span>
      ),
      children: (
        <div>
          <div
            style={{
              padding: '8px 14px',
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 12,
              color: '#8c6914',
            }}
          >
            <Text strong>💡 对比团队版：</Text> 无需 PRD 模板、Schema 校验、AI评分。一个想法 = 一张卡片，AI 直接评估优先级。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {featureIdeas.map((idea) => (
              <Card key={idea.id} style={{ borderRadius: 10 }} bodyStyle={{ padding: '14px 16px' }}>
                <Row align="middle" gutter={16}>
                  <Col flex="auto">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <Tag
                        color={priorityColor[idea.aiPriority]}
                        style={{ fontWeight: 700, fontSize: 13, padding: '2px 10px' }}
                      >
                        {idea.aiPriority}
                      </Tag>
                      <Text strong style={{ fontSize: 14 }}>{idea.title}</Text>
                      <Tag color="default" style={{ fontSize: 11 }}>{idea.source}</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 13 }}>{idea.description}</Text>
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: '#f0f9ff',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#1264e5',
                      }}
                    >
                      <RobotOutlined style={{ marginRight: 4 }} />
                      {idea.aiReason}
                    </div>
                  </Col>
                  <Col>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>👍 {idea.votes}</div>
                      <Text type="secondary" style={{ fontSize: 11 }}>用户投票</Text>
                    </div>
                  </Col>
                </Row>
              </Card>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
              记录新想法
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'competitors',
      label: <span>竞品雷达</span>,
      children: (
        <Row gutter={16}>
          {competitors.map((c) => (
            <Col span={12} key={c.name}>
              <Card title={c.name} extra={<Tag color="orange">{c.pricing}</Tag>} style={{ borderRadius: 10 }}>
                <Row gutter={12}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>优势</Text>
                    {c.strength.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, padding: '2px 0', color: '#389e0d' }}>✅ {s}</div>
                    ))}
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>劣势</Text>
                    {c.weakness.map((w, i) => (
                      <div key={i} style={{ fontSize: 13, padding: '2px 0', color: '#cf1322' }}>⚠️ {w}</div>
                    ))}
                  </Col>
                </Row>
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 12px',
                    background: '#f6ffed',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#389e0d',
                  }}
                >
                  <Text strong>我们的差异化：</Text> {c.differentiation}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BulbOutlined style={{ color: '#722ed1', marginRight: 8 }} />
          产品洞察
        </Title>
        <Space>
          <Tag icon={<ExperimentOutlined />} color="purple">
            {testingItems.length} 个假设验证中
          </Tag>
          <Tag icon={<CheckCircleOutlined />} color="success">
            {validatedItems.length} 个已证实
          </Tag>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabs}
              style={{ padding: '0 16px' }}
            />
          </Card>
        </Col>

        {/* AI User Advocate */}
        <Col span={8}>
          <Card
            title={
              <span>
                <RobotOutlined style={{ color: '#722ed1', marginRight: 6 }} />
                用户代言人 Agent
              </span>
            }
            style={{ height: '100%' }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 58px)', padding: 0 }}
          >
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agentMessages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: msg.role === 'user' ? '#722ed1' : '#f9f0ff',
                      color: msg.role === 'user' ? '#fff' : '#1f1f1f',
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['段落重写真的需要吗？', '团队版应该做吗？', '用户最真实的痛点'].map((q) => (
                <Tag key={q} style={{ cursor: 'pointer', borderRadius: 10, fontSize: 11 }} onClick={() => setAgentInput(q)}>
                  {q}
                </Tag>
              ))}
            </div>
            <div style={{ padding: '8px 12px 12px', display: 'flex', gap: 8 }}>
              <Input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onPressEnter={handleAgentSend}
                placeholder="质疑我的产品决策..."
                size="small"
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleAgentSend} size="small" style={{ background: '#722ed1', borderColor: '#722ed1' }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detail Modal */}
      <Modal
        open={!!detailHypo}
        title={detailHypo ? `假设详情 · ${statusConfig[detailHypo.status].label}` : ''}
        onCancel={() => setDetailHypo(null)}
        footer={null}
        width={500}
      >
        {detailHypo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>我认为</Text>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>「{detailHypo.belief}」</div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>因为</Text>
              <div style={{ fontSize: 13, marginTop: 4 }}>{detailHypo.why}</div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>验证方式</Text>
              <div style={{ fontSize: 13, marginTop: 4 }}>{detailHypo.method}</div>
            </div>
            {detailHypo.result && (
              <div
                style={{
                  padding: '10px 14px',
                  background: detailHypo.status === 'validated' ? '#f6ffed' : '#fff2f0',
                  borderRadius: 8,
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>实际结果</Text>
                <div style={{ fontSize: 13, marginTop: 4 }}>{detailHypo.result}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Tag color={impactConfig[detailHypo.impact].color}>{impactConfig[detailHypo.impact].label}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>创建于 {detailHypo.createdAt}</Text>
              {detailHypo.validatedAt && (
                <Text type="secondary" style={{ fontSize: 12 }}>· 验证于 {detailHypo.validatedAt}</Text>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SoloProduct;
