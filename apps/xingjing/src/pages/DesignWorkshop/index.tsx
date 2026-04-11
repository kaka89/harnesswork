import React, { useState } from 'react';
import { Card, Row, Col, Tag, Typography, Space, Button, Descriptions, Table, message, Input } from 'antd';
import { RobotOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import { sddList } from '../../mock/sdd';
import { contractList } from '../../mock/contracts';
import { prdList } from '../../mock/prd';

const { Text, Title } = Typography;

const statusMap = {
  pending: { label: '待设计', color: 'default', icon: <ClockCircleOutlined /> },
  'in-progress': { label: '进行中', color: 'processing', icon: <SyncOutlined spin /> },
  approved: { label: '已批准', color: 'success', icon: <CheckCircleOutlined /> },
};

const DesignWorkshop: React.FC = () => {
  const [selectedSdd, setSelectedSdd] = useState(sddList[0]);
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);

  const pendingPrds = prdList.filter((p) => p.status === 'approved' && !sddList.find((s) => s.prdId === p.id));

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    const q = agentInput;
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '我是 architect-agent，可以帮你生成 SDD、优化架构图、检查设计一致性。请告诉我需要什么帮助？';
      if (q.includes('生成') || q.includes('SDD')) {
        reply = '好的，我将基于 PRD-005 的需求描述生成 SDD 初稿。预计包含：\n· 系统架构设计\n· 核心接口定义\n· 数据模型设计\n· 非功能需求方案\n\n生成中...（模拟）约10分钟完成。';
      } else if (q.includes('架构') || q.includes('优化')) {
        reply = '当前 SDD-001 架构评估：\n· 整体设计合理，批量导入采用异步模式\n· 建议考虑添加限流机制\n· Excel 解析建议使用流式读取，避免大文件OOM';
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  const contractColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '版本', dataIndex: 'version', key: 'version' },
    { title: '生产者', dataIndex: 'producer', key: 'producer' },
    {
      title: '消费者', dataIndex: 'consumers', key: 'consumers',
      render: (consumers: string[]) => consumers.map((c) => <Tag key={c}>{c}</Tag>),
    },
    {
      title: 'Pact 状态', dataIndex: 'pactStatus', key: 'pactStatus',
      render: (status: string) => (
        <Tag color={status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'warning'}>
          {status === 'passed' ? '通过' : status === 'failed' ? '失败' : '待验证'}
        </Tag>
      ),
    },
    { title: '接口数', dataIndex: 'interfaceCount', key: 'interfaceCount' },
    { title: '行为规格', dataIndex: 'behaviorCount', key: 'behaviorCount' },
    { title: '最后验证', dataIndex: 'lastVerified', key: 'lastVerified' },
  ];

  return (
    <div>
      <Title level={4}>设计工坊</Title>

      {/* Pending PRDs */}
      {pendingPrds.length > 0 && (
        <Card title="待处理（PRD 已批准，待设计）" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            {pendingPrds.map((prd) => (
              <Col span={8} key={prd.id}>
                <Card size="small" className="hover-card">
                  <Text strong>{prd.id}: {prd.title}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>批准时间：最近</Text>
                  </div>
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" size="small" icon={<RobotOutlined />}>
                      生成 SDD 初稿
                    </Button>
                    <Button size="small">手动创建</Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* SDD List */}
      <Row gutter={16}>
        <Col span={6}>
          <Card title="SDD 列表" size="small">
            {sddList.map((sdd) => (
              <div
                key={sdd.id}
                onClick={() => setSelectedSdd(sdd)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 4,
                  cursor: 'pointer',
                  background: selectedSdd.id === sdd.id ? '#e6f7ff' : 'transparent',
                  borderLeft: selectedSdd.id === sdd.id ? '3px solid #1264e5' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 13 }}>{sdd.id}</Text>
                  <Tag color={statusMap[sdd.status].color} style={{ marginRight: 0 }}>
                    {statusMap[sdd.status].label}
                  </Tag>
                </div>
                <Text style={{ fontSize: 12 }}>{sdd.title}</Text>
              </div>
            ))}
          </Card>
        </Col>

        <Col span={18}>
          {/* SDD Detail */}
          <Card
            title={`${selectedSdd.id}: ${selectedSdd.title}`}
            extra={<Tag color={statusMap[selectedSdd.status].color}>{statusMap[selectedSdd.status].label}</Tag>}
          >
            <Row gutter={16}>
              <Col span={14}>
                <Card size="small" title="架构图">
                  <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
                    {selectedSdd.architecture}
                  </pre>
                </Card>
              </Col>
              <Col span={10}>
                <Card size="small" title="关键指标">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="关联 PRD">{selectedSdd.prdId}</Descriptions.Item>
                    <Descriptions.Item label="关联 CONTRACT">
                      {selectedSdd.contractIds.length > 0 ? selectedSdd.contractIds.join(', ') : '无'}
                    </Descriptions.Item>
                    <Descriptions.Item label="关联 TASK">
                      {selectedSdd.taskCount}个（{selectedSdd.taskDone}/{selectedSdd.taskCount}完成）
                    </Descriptions.Item>
                    <Descriptions.Item label="最后更新">{selectedSdd.lastUpdate}</Descriptions.Item>
                    <Descriptions.Item label="与代码一致性">
                      {selectedSdd.codeSync ? (
                        <Tag color="success">已同步</Tag>
                      ) : (
                        <Tag color="warning">未同步</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="复杂度">{selectedSdd.complexity}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </Card>

          {/* CONTRACT management */}
          <Card title="CONTRACT 管理" style={{ marginTop: 16 }}>
            <Table
              dataSource={contractList.filter((c) => selectedSdd.contractIds.includes(c.id))}
              columns={contractColumns}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无关联 CONTRACT' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Agent panel */}
      <Card style={{ marginTop: 16 }} className="agent-panel">
        <div className="agent-panel-title">
          <RobotOutlined /> architect-agent
        </div>
        {agentMessages.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: 8, padding: '6px 10px', background: msg.role === 'user' ? '#e6f7ff' : '#fff', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            <Text strong style={{ fontSize: 12 }}>{msg.role === 'user' ? '你' : 'architect-agent'}：</Text><br />
            {msg.content}
          </div>
        ))}
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" onClick={() => { setAgentInput('生成 SDD'); handleAgentSend(); }}>生成 SDD</Button>
          <Button size="small" onClick={() => { setAgentInput('优化架构图'); handleAgentSend(); }}>优化架构图</Button>
          <Button size="small">检查设计一致性</Button>
        </Space>
        <Input.Search
          placeholder="问 AI..."
          value={agentInput}
          onChange={(e) => setAgentInput(e.target.value)}
          onSearch={handleAgentSend}
          onPressEnter={handleAgentSend}
          enterButton={<SendOutlined />}
        />
      </Card>
    </div>
  );
};

export default DesignWorkshop;
