import React, { useState } from 'react';
import { Card, Row, Col, Tag, Button, Modal, Input, message, Badge, Space, Typography, Rate, Tooltip } from 'antd';
import { PlusOutlined, ThunderboltOutlined, RobotOutlined, EditOutlined, SendOutlined, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { PRD } from '../../mock/prd';

const { Text, Title } = Typography;
const { TextArea } = Input;

const statusConfig = {
  draft: { label: '草稿', color: 'default' },
  reviewing: { label: '评审中', color: 'processing' },
  approved: { label: '已批准', color: 'success' },
};

const RequirementWorkshop: React.FC = () => {
  const navigate = useNavigate();
  const { prds, updatePrdStatus, addPrd } = useAppStore();
  const [newPrdModal, setNewPrdModal] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [newPrdTitle, setNewPrdTitle] = useState('');
  const [newPrdDesc, setNewPrdDesc] = useState('');
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);

  const columns: { status: PRD['status']; title: string }[] = [
    { status: 'draft', title: '草稿' },
    { status: 'reviewing', title: '评审中' },
    { status: 'approved', title: '已批准' },
  ];

  const handleAiGenerate = () => {
    if (!newPrdDesc.trim()) {
      message.warning('请先输入需求描述');
      return;
    }
    setAiGenerating(true);
    setTimeout(() => {
      setNewPrdTitle(newPrdDesc.slice(0, 10) + '...');
      message.success('AI 已生成 PRD 初稿');
      setAiGenerating(false);
    }, 1500);
  };

  const handleCreatePrd = () => {
    const id = `PRD-${String(prds.length + 1).padStart(3, '0')}`;
    addPrd({
      id,
      title: newPrdTitle || '新需求',
      owner: '张PM',
      status: 'draft',
      aiScore: 0,
      reviewComments: 0,
      createdAt: new Date().toISOString().split('T')[0],
      description: newPrdDesc,
      userStories: [],
    });
    setNewPrdModal(false);
    setNewPrdTitle('');
    setNewPrdDesc('');
    message.success(`${id} 创建成功`);
  };

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    const userMsg = agentInput;
    setAgentMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (userMsg.includes('PRD') || userMsg.includes('需求')) {
        reply = '我可以帮你生成标准 PRD。请点击"+ 新建需求"按钮，输入需求描述后点击"AI 生成初稿"。\n\n我会自动生成包含背景目标、用户画像、用户故事和 NFR 的完整 PRD 文档。';
      } else if (userMsg.includes('影响') || userMsg.includes('分析')) {
        reply = '根据当前需求分析：\n- PRD-005（凭证模板管理）主要影响 cosmic-gl 应用\n- 建议补充影响分析章节，当前评分 7.2，目标 ≥ 8.0';
      } else {
        reply = `我是 product-agent，可以帮你：\n· 根据描述生成标准 PRD\n· 分析 PRD 的影响范围\n· 拆解战略 PRD 到各领域\n\n请告诉我你需要什么帮助？`;
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  const handleDragStart = (e: React.DragEvent, prdId: string) => {
    e.dataTransfer.setData('prdId', prdId);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: PRD['status']) => {
    e.preventDefault();
    const prdId = e.dataTransfer.getData('prdId');
    if (prdId) {
      updatePrdStatus(prdId, targetStatus);
      message.success(`${prdId} 状态已更新为 ${statusConfig[targetStatus].label}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>需求看板</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewPrdModal(true)}>
          新建需求
        </Button>
      </div>

      <Row gutter={16}>
        {columns.map((col) => {
          const items = prds.filter((p) => p.status === col.status);
          return (
            <Col span={8} key={col.status}>
              <div
                className="kanban-column"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, col.status)}
              >
                <div className="kanban-column-title">
                  {col.title} ({items.length})
                </div>
                {items.map((prd) => (
                  <Card
                    key={prd.id}
                    size="small"
                    className="hover-card"
                    style={{ marginBottom: 8, cursor: 'grab' }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, prd.id)}
                    onClick={() => navigate(`/requirements/edit/${prd.id}`)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{prd.id}</Text>
                      <Tag color={statusConfig[prd.status].color} style={{ marginRight: 0 }}>
                        {statusConfig[prd.status].label}
                      </Tag>
                    </div>
                    <Text style={{ fontSize: 14, fontWeight: 500 }}>{prd.title}</Text>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{prd.owner}</Text>
                      {prd.aiScore > 0 && (
                        <Tooltip title={`AI 评分: ${prd.aiScore}`}>
                          <Space size={2}>
                            <StarOutlined style={{ color: '#faad14', fontSize: 12 }} />
                            <Text style={{ fontSize: 12, color: '#faad14' }}>{prd.aiScore}</Text>
                          </Space>
                        </Tooltip>
                      )}
                    </div>
                    {prd.status === 'draft' && (
                      <Button
                        type="link"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        style={{ padding: 0, marginTop: 4 }}
                      >
                        AI 生成初稿
                      </Button>
                    )}
                    {prd.status === 'reviewing' && prd.reviewComments > 0 && (
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        评审意见 {prd.reviewComments} 条
                      </Text>
                    )}
                    {prd.status === 'approved' && prd.sddStatus && (
                      <div style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 12 }}>SDD {prd.sddStatus}</Text>
                        {prd.devProgress && (
                          <Text style={{ fontSize: 12, marginLeft: 8 }}>开发 {prd.devProgress}</Text>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Col>
          );
        })}
      </Row>

      {/* Agent panel */}
      <Card style={{ marginTop: 20 }} className="agent-panel">
        <div className="agent-panel-title">
          <RobotOutlined /> product-agent
        </div>
        <Text style={{ fontSize: 13 }}>我可以帮你：</Text>
        <ul style={{ fontSize: 13, margin: '4px 0 12px', paddingLeft: 20 }}>
          <li>根据你的描述生成标准 PRD</li>
          <li>分析 PRD 的影响范围</li>
          <li>拆解战略 PRD 到各领域</li>
        </ul>
        {agentMessages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: 8,
              padding: '6px 10px',
              background: msg.role === 'user' ? 'var(--dls-info-bg)' : 'var(--dls-surface)',
              borderRadius: 6,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            <Text strong style={{ fontSize: 12 }}>{msg.role === 'user' ? '你' : 'product-agent'}：</Text>
            <br />
            {msg.content}
          </div>
        ))}
        <Input.Search
          placeholder="输入需求描述..."
          value={agentInput}
          onChange={(e) => setAgentInput(e.target.value)}
          onSearch={handleAgentSend}
          onPressEnter={handleAgentSend}
          enterButton={<SendOutlined />}
        />
      </Card>

      {/* New PRD Modal */}
      <Modal
        title="新建需求"
        open={newPrdModal}
        onOk={handleCreatePrd}
        onCancel={() => setNewPrdModal(false)}
        okText="创建"
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>需求标题</Text>
          <Input
            value={newPrdTitle}
            onChange={(e) => setNewPrdTitle(e.target.value)}
            placeholder="输入需求标题"
            style={{ marginTop: 4 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Text>需求描述</Text>
          <TextArea
            rows={4}
            value={newPrdDesc}
            onChange={(e) => setNewPrdDesc(e.target.value)}
            placeholder="描述你的需求，AI 会帮你生成完整的 PRD..."
            style={{ marginTop: 4 }}
          />
        </div>
        <Button
          icon={<ThunderboltOutlined />}
          loading={aiGenerating}
          onClick={handleAiGenerate}
          type="dashed"
        >
          AI 生成初稿
        </Button>
      </Modal>
    </div>
  );
};

export default RequirementWorkshop;
