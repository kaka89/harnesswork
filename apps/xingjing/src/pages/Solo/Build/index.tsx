import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Tabs, Typography, Button, Checkbox, Badge,
  Progress, Space, Tooltip, Empty,
} from 'antd';
import {
  CodeOutlined, RobotOutlined, SendOutlined, CheckCircleOutlined,
  ClockCircleOutlined, PlayCircleOutlined, PlusOutlined, BranchesOutlined,
} from '@ant-design/icons';
import { soloTasks, adrs, SoloTask, ADR } from '../../../mock/solo';

const { Text, Title } = Typography;

const typeConfig: Record<string, { label: string; color: string }> = {
  dev:     { label: '开发', color: 'blue' },
  product: { label: '产品', color: 'purple' },
  ops:     { label: '运营', color: 'orange' },
  growth:  { label: '增长', color: 'green' },
};

const statusConfig = {
  todo:  { label: '待办', color: 'default', icon: <ClockCircleOutlined /> },
  doing: { label: '进行中', color: 'processing', icon: <PlayCircleOutlined style={{ color: '#1264e5' }} /> },
  done:  { label: '完成', color: 'success', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
};

const TaskCard: React.FC<{ task: SoloTask; active?: boolean }> = ({ task, active }) => {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const doneCount = task.dod.filter((_, i) => checked[i]).length;

  return (
    <Card
      size="small"
      style={{
        borderRadius: 10,
        border: active ? '2px solid #1264e5' : '1px solid #f0f0f0',
        background: active ? '#f0f9ff' : '#fff',
      }}
      bodyStyle={{ padding: '12px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {active && <Badge status="processing" />}
            <Text strong style={{ fontSize: 13 }}>{task.title}</Text>
          </div>
          <Space size={4} wrap>
            <Tag color={typeConfig[task.type].color} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
              {typeConfig[task.type].label}
            </Tag>
            <Tag icon={statusConfig[task.status].icon} color={statusConfig[task.status].color} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
              {statusConfig[task.status].label}
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>预估 {task.est}</Text>
          </Space>
          {task.note && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: '#fffbe6',
                borderRadius: 6,
                fontSize: 12,
                color: '#7c5b00',
              }}
            >
              📝 {task.note}
            </div>
          )}
          {/* DoD */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>DoD（完成标准）</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{doneCount}/{task.dod.length}</Text>
            </div>
            <Progress
              percent={Math.round((doneCount / task.dod.length) * 100)}
              showInfo={false}
              size="small"
              style={{ marginBottom: 6 }}
            />
            {task.dod.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <Checkbox
                  checked={!!checked[i]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                  style={{ fontSize: 12 }}
                >
                  <Text style={{ fontSize: 12, textDecoration: checked[i] ? 'line-through' : 'none', color: checked[i] ? '#bfbfbf' : '#1f1f1f' }}>
                    {item}
                  </Text>
                </Checkbox>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

const SoloBuild: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState([
    {
      role: 'assistant',
      content: '我已加载当前任务上下文：修复 Editor 光标丢失 bug（st1）。\n\n相关知识库：「ProseMirror IME 输入光标丢失」笔记已检测到，这与你的坑记录高度匹配！\n\n需要我帮你分析解决方案吗？',
    },
  ]);

  const doingTasks = soloTasks.filter((t) => t.status === 'doing');
  const todoTasks = soloTasks.filter((t) => t.status === 'todo');
  const doneTasks = soloTasks.filter((t) => t.status === 'done');

  const handleSend = () => {
    if (!agentInput.trim()) return;
    const q = agentInput.trim();
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (q.includes('光标') || q.includes('IME') || q.includes('bug')) {
        reply = '根据你知识库中的笔记（k1），这个 bug 的解法是：\n\n```js\nlet composing = false;\neditor.on("compositionstart", () => { composing = true; });\neditor.on("compositionend", () => {\n  composing = false;\n  // restore saved selection\n});\n```\n\n核心：在 compositionstart 时缓存 selection，compositionend 时恢复。不要在 composing 过程中触发 handleKeyDown 的 selection 更新。';
      } else if (q.includes('测试') || q.includes('DoD')) {
        reply = '当前任务的 DoD 共 3 项，独立版 DoD 刻意精简（企业版是 8 项！）：\n\n✅ 复现稳定\n⬜ 修复并通过本地测试\n⬜ 部署到生产\n\n你还差 2 项。建议先写一个最小复现用例，验证 fix 是否正确，再部署。';
      } else {
        reply = '我已读取你的 ADR 和当前代码架构。你用的是 TipTap + Supabase，部署在 Vercel。有什么具体问题需要我帮你分析？';
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 700);
  };

  const taskTabs = [
    {
      key: 'tasks',
      label: (
        <span>
          <CodeOutlined /> 全部任务
          <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>{doingTasks.length} 进行中</Tag>
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
            <Text strong>💡 对比团队版：</Text> 无角色区分（PM/Dev/QA 分开看），无 Sprint 容量计算，无跨团队依赖管理。你就是全部角色，任务统一管理。
          </div>

          {doingTasks.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>🔥 当前进行中</Text>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {doingTasks.map((t) => <TaskCard key={t.id} task={t} active />)}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>⬜ 待办</Text>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todoTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
            <Button type="dashed" icon={<PlusOutlined />} block style={{ marginTop: 10, borderRadius: 8 }}>
              添加任务
            </Button>
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: '#8c8c8c' }}>✅ 最近完成</Text>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.7 }}>
              {doneTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'adr',
      label: (
        <span>
          <BranchesOutlined /> 架构决策 (ADR)
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
            <Text strong>💡 对比团队版：</Text> 团队版有完整 SDD（含 Mermaid 架构图、CONTRACT、PLAN 分层）。独立版 ADR 极简：一个问题 + 一个决策 + 一个原因，写完就走。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {adrs.map((adr: ADR) => (
              <Card key={adr.id} style={{ borderRadius: 10 }} bodyStyle={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text strong style={{ fontSize: 14 }}>{adr.title}</Text>
                  <Space>
                    <Tag color={adr.status === 'active' ? 'success' : 'default'}>{adr.status === 'active' ? '有效' : '已废弃'}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{adr.date}</Text>
                  </Space>
                </div>
                <Row gutter={12}>
                  <Col span={8}>
                    <div style={{ background: '#fff9e6', borderRadius: 6, padding: '8px 10px' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>❓ 问题</Text>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{adr.question}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#f0f9ff', borderRadius: 6, padding: '8px 10px' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>✅ 决策</Text>
                      <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{adr.decision}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ background: '#f6ffed', borderRadius: 6, padding: '8px 10px' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>💡 原因</Text>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{adr.reason}</div>
                    </div>
                  </Col>
                </Row>
              </Card>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
              记录架构决策
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CodeOutlined style={{ color: '#1264e5', marginRight: 8 }} />
          构建中
        </Title>
        <Space>
          <Tag color="processing">{doingTasks.length} 进行中</Tag>
          <Tag color="default">{todoTasks.length} 待办</Tag>
          <Tag color="success">{doneTasks.length} 已完成</Tag>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={taskTabs}
              style={{ padding: '0 16px' }}
            />
          </Card>
        </Col>

        {/* Dev Agent */}
        <Col span={8}>
          <Card
            title={
              <span>
                <RobotOutlined style={{ color: '#1264e5', marginRight: 6 }} />
                dev-agent
                <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>已加载当前任务上下文</Tag>
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
                      maxWidth: '90%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: msg.role === 'user' ? '#1264e5' : '#f5f5f5',
                      color: msg.role === 'user' ? '#fff' : '#1f1f1f',
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      fontFamily: msg.content.includes('```') ? 'monospace' : 'inherit',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['光标 bug 怎么修？', '当前 DoD 进度', '相关知识库记录'].map((q) => (
                <Tag key={q} style={{ cursor: 'pointer', borderRadius: 10, fontSize: 11 }} onClick={() => setAgentInput(q)}>
                  {q}
                </Tag>
              ))}
            </div>
            <div style={{ padding: '8px 12px 12px', display: 'flex', gap: 8 }}>
              <input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                placeholder="问 dev-agent..."
                style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }}
              />
              <button
                onClick={handleSend}
                style={{ background: '#1264e5', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 10px', cursor: 'pointer' }}
              >
                <SendOutlined />
              </button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SoloBuild;
