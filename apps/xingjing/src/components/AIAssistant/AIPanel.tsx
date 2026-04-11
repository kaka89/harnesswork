import React, { useState } from 'react';
import { Drawer, Input, Button, Tag, List, Space, Typography } from 'antd';
import { RobotOutlined, SendOutlined, ThunderboltOutlined, WarningOutlined, SmileOutlined } from '@ant-design/icons';
import { useAppStore } from '../../store';

const { Text, Title } = Typography;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const presetAnswers: Record<string, string> = {
  'DORA': '当前财务云 DORA 数据：\n- 部署频率：14次/周（精英→高效级）\n- 变更前置时间：3.2天（高效级）\n- 变更失败率：4.2%（达标）\n- MTTR：3.2h（达标）\n\n整体表现优秀，较上月有显著提升。',
  'PRD-001': 'PRD-001（凭证批量导入）当前状态：\n- SDD 已完成，开发进度 7/9\n- 关键风险：TASK-001-02 超时28%\n- 预计完成时间：2026-05-05（延期3天）\n\n建议关注 TASK-001-02 的进展，必要时调配资源。',
  'Sprint': '总账 Sprint W17 状态：\n- 进度：Day 5/10，完成率 44%\n- SPI：0.82（偏低）\n- 阻塞任务：1个\n- 风险：TASK-001-02 超时影响关键路径\n\n建议今日站会讨论范围调整。',
  '风险': '当前风险预警：\n\n1. [高] 人力云接入率仅 40%，Q2 目标达成风险\n2. [高] TASK-001-02 超时 28%，影响 W17 Sprint 关键路径\n3. [中] PRD-005（凭证模板管理）已 2 天待架构师处理\n4. [中] cosmic-ap 资源不足，需要领域 Lead 决策',
};

const quickQuestions = [
  { label: '显示今日 DORA 数据', key: 'DORA' },
  { label: '查找 PRD-001', key: 'PRD-001' },
  { label: '总账 Sprint 状态', key: 'Sprint' },
  { label: '所有风险预警', key: '风险' },
];

const AIPanel: React.FC = () => {
  const { aiPanelOpen, setAiPanelOpen, currentUser } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = (text?: string) => {
    const msg = text || inputValue;
    if (!msg.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    // Find matching answer
    setTimeout(() => {
      const matchKey = Object.keys(presetAnswers).find((k) =>
        msg.includes(k) || msg.toLowerCase().includes(k.toLowerCase())
      );
      const answer = matchKey
        ? presetAnswers[matchKey]
        : `我理解你的问题：“${msg}”\n\n这是一个很好的问题。作为星静 AI 助手，我可以帮你查询项目数据、分析风险、生成文档等。\n\n请尝试具体的问题，如“显示DORA数据”或“查找PRD-001”。`;
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    }, 800);
  };

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined style={{ color: '#1264e5' }} />
          <span>星静 AI 助手</span>
        </Space>
      }
      open={aiPanelOpen}
      onClose={() => setAiPanelOpen(false)}
      width={420}
      placement="right"
    >
      {/* Today's highlights */}
      {messages.length === 0 && (
        <div>
          <Text>你好，{currentUser}！今日需要关注：</Text>

          <div style={{ marginTop: 16 }}>
            <Text strong style={{ color: '#ff4d4f' }}>
              <WarningOutlined /> 高优先级
            </Text>
            <List
              size="small"
              dataSource={[
                '人力云接入率仅 40%，Q2 目标达成风险',
                'TASK-001-02 超时 28%，影响关键路径',
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '4px 0', borderBottom: 'none' }}>
                  <Text style={{ fontSize: 13 }}>· {item}</Text>
                </List.Item>
              )}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Text strong style={{ color: '#faad14' }}>
              <ThunderboltOutlined /> 需要决策
            </Text>
            <List
              size="small"
              dataSource={[
                'PRD-005（凭证模板管理）已 2 天待架构师处理',
                'cosmic-ap 资源不足，需决策是否调配',
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '4px 0', borderBottom: 'none' }}>
                  <Text style={{ fontSize: 13 }}>· {item}</Text>
                </List.Item>
              )}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Text strong style={{ color: '#52c41a' }}>
              <SmileOutlined /> 好消息
            </Text>
            <List
              size="small"
              dataSource={[
                '财务领域本月 0 次契约违规（连续30天！）',
                'MTTR 从上月 8h 降至 3.2h（已达标）',
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '4px 0', borderBottom: 'none' }}>
                  <Text style={{ fontSize: 13 }}>· {item}</Text>
                </List.Item>
              )}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <Text type="secondary">常用问题：</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {quickQuestions.map((q) => (
                <Tag
                  key={q.key}
                  color="blue"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSend(q.label)}
                >
                  {q.label}
                </Tag>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat messages */}
      {messages.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: msg.role === 'user' ? '#1264e5' : '#f5f5f5',
                  color: msg.role === 'user' ? '#fff' : '#333',
                  whiteSpace: 'pre-wrap',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
        <Input.Search
          placeholder="问我任何问题..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onSearch={() => handleSend()}
          onPressEnter={() => handleSend()}
          enterButton={<SendOutlined />}
          size="large"
        />
      </div>
    </Drawer>
  );
};

export default AIPanel;
