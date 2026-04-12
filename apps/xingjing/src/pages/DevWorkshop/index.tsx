import React, { useState } from 'react';
import { Card, Row, Col, Tag, Typography, Space, Button, Progress, Badge, Input, message, Tooltip } from 'antd';
import {
  FireOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
  BranchesOutlined, RobotOutlined, SendOutlined, UserOutlined,
  ClockCircleOutlined, PullRequestOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';

const { Text, Title } = Typography;

const ciStatusMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  running: { color: '#1890ff', icon: <SyncOutlined spin />, label: '运行中' },
  passed: { color: '#52c41a', icon: <CheckCircleOutlined />, label: '通过' },
  failed: { color: '#ff4d4f', icon: <CloseCircleOutlined />, label: '失败' },
  pending: { color: '#faad14', icon: <ClockCircleOutlined />, label: '等待' },
};

const DevWorkshop: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, updateTaskStatus, claimTask, currentUser } = useAppStore();
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);

  const myTasks = tasks.filter((t) => t.assignee === '张开发');
  const inProgressTasks = myTasks.filter((t) => t.status === 'in-dev');
  const doneTasks = myTasks.filter((t) => t.status === 'done');
  const unclaimedTasks = tasks.filter((t) => !t.assignee && t.status === 'todo');

  const teamMembers = [
    { name: '张开发', taskId: 'TASK-001-02', status: 'in-dev' },
    { name: '李前端', taskId: 'TASK-001-05', status: 'in-dev' },
    { name: '王测试', taskId: 'TASK-001-07', status: 'todo' },
  ];

  const handleClaim = (taskId: string) => {
    claimTask(taskId, currentUser);
    message.success(`已认领 ${taskId}`);
  };

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    const q = agentInput;
    setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '我是 dev-agent，已加载 TASK-001-02 + CONTRACT-001 + SDD-001 的上下文。请问需要什么帮助？';
      if (q.includes('测试') || q.includes('单元')) {
        reply = '已为 VoucherBatchService 生成单元测试骨架：\n\n```java\n@Test\nvoid shouldRejectUnbalancedVoucher() {\n  // Given: 借方金额 1000，贷方金额 500\n  // When: 调用 importBatch\n  // Then: 应抛出 UnbalancedVoucherException\n}\n```\n\n共生成 8 个测试用例，覆盖 CONTRACT-001 所有行为规格。';
      } else if (q.includes('DoD') || q.includes('检查')) {
        reply = 'TASK-001-02 DoD 检查结果：\n\n已完成 6/8:\n  ✅ 功能实现\n  ✅ 单测覆盖≥90%\n  ✅ 无Critical\n  ✅ 借贷平衡\n  ✅ 账期校验\n  ✅ 错误收集\n  ⬜ SDD 同步更新（实现与设计有细微差异）\n  ⬜ PR Checklist 自查\n\n建议先更新 SDD，再提交 PR。';
      } else if (q.includes('BH') || q.includes('规格')) {
        reply = 'CONTRACT-001 行为规格说明：\n\nBH-003: 已结账账期拒绝\n- 规格：当凭证日期所在账期已结账时，API层应拒绝请求\n- 当前代码：PeriodService 调用在 Service 层\n- CONTRACT 要求：在 API 层验证\n\n建议将校验逻辑移到 Controller 层。';
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  return (
    <div>
      <Title level={4}>开发工坊 <Text type="secondary" style={{ fontSize: 14 }}>@{currentUser}</Text></Title>

      {/* In-progress tasks */}
      <Card
        title={<><FireOutlined style={{ color: '#ff4d4f' }} /> 进行中</>}
        style={{ marginBottom: 16 }}
      >
        {inProgressTasks.map((task) => {
          const dodDone = task.dod.filter((d) => d.done).length;
          const dodTotal = task.dod.length;
          const ci = task.ciStatus ? ciStatusMap[task.ciStatus] : null;
          const overtime = task.actual && task.estimate ? ((task.actual - task.estimate) / task.estimate * 100).toFixed(0) : null;

          return (
            <Card key={task.id} size="small" style={{ marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={16}>
                  <Space>
                    <Text strong>{task.id}:</Text>
                    <Text>{task.title}</Text>
                    {overtime && Number(overtime) > 0 && (
                      <Tag color="error">超时 {overtime}%</Tag>
                    )}
                  </Space>
                  <div style={{ marginTop: 8 }}>
                    <Space size={16}>
                      <Tooltip title="分支">
                        <Text style={{ fontSize: 12 }}><BranchesOutlined /> {task.branch}</Text>
                      </Tooltip>
                      {ci && (
                        <Tooltip title={`CI: ${ci.label}`}>
                          <Text style={{ fontSize: 12, color: ci.color }}>{ci.icon} CI {ci.label}</Text>
                        </Tooltip>
                      )}
                      {task.coverage !== undefined && (
                        <Text style={{ fontSize: 12 }}>覆盖率: {task.coverage}%</Text>
                      )}
                    </Space>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 12 }}>DoD 进度: {dodDone}/{dodTotal}</Text>
                    <Progress percent={Math.round((dodDone / dodTotal) * 100)} size="small" style={{ marginBottom: 4 }} />
                    <div>
                      {task.dod.map((d, idx) => (
                        <div key={idx} className={`dod-item ${d.done ? 'dod-item-done' : 'dod-item-pending'}`}>
                          {d.done ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {d.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </Col>
                <Col span={8} style={{ textAlign: 'right' }}>
                  <Space direction="vertical">
                    <Button size="small">查看 TASK</Button>
                    <Button size="small">关联 CONTRACT</Button>
                    <Button size="small" icon={<RobotOutlined />}>问 dev-agent</Button>
                    <Button size="small" icon={<PullRequestOutlined />} type="primary"
                      onClick={() => navigate(`/dev/pr/${task.id}`)}>
                      提交 PR
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          );
        })}
      </Card>

      <Row gutter={16}>
        {/* Unclaimed tasks */}
        <Col span={8}>
          <Card title="待认领" size="small">
            {unclaimedTasks.map((task) => (
              <Card key={task.id} size="small" style={{ marginBottom: 8 }} className="hover-card">
                <Text strong>{task.id}</Text>
                <div><Text style={{ fontSize: 13 }}>{task.title}</Text></div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>估时: {task.estimate}天</Text>
                  {task.dependencies?.length && (
                    <Tag color="warning" style={{ marginLeft: 8 }}>等待依赖</Tag>
                  )}
                </div>
                <Button size="small" type="primary" style={{ marginTop: 4 }} onClick={() => handleClaim(task.id)}>
                  认领
                </Button>
              </Card>
            ))}
          </Card>
        </Col>

        {/* Done tasks */}
        <Col span={8}>
          <Card title="已完成（本Sprint）" size="small">
            {doneTasks.map((task) => (
              <div key={task.id} style={{ padding: '4px 0' }}>
                <CheckCircleOutlined style={{ color: '#52c41a' }} /> {task.id} {task.title}
              </div>
            ))}
          </Card>
        </Col>

        {/* Team board */}
        <Col span={8}>
          <Card title="团队看板" size="small">
            {teamMembers.map((m) => (
              <div key={m.name} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                <Space>
                  <UserOutlined />
                  <Text>{m.name}</Text>
                </Space>
                <Space>
                  <Text style={{ fontSize: 12 }}>{m.taskId}</Text>
                  <Badge status={m.status === 'in-dev' ? 'processing' : 'default'} />
                </Space>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      {/* Agent panel */}
      <Card style={{ marginTop: 16 }} className="agent-panel">
        <div className="agent-panel-title">
          <RobotOutlined /> dev-agent（已加载 TASK-001-02 上下文）
        </div>
        <Text style={{ fontSize: 13 }}>已读取：TASK-001-02 + CONTRACT-001 + SDD-001 §3</Text>
        {agentMessages.map((msg, idx) => (
          <div key={idx} style={{ marginTop: 8, padding: '6px 10px', background: msg.role === 'user' ? 'var(--dls-info-bg)' : 'var(--dls-surface)', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            <Text strong style={{ fontSize: 12 }}>{msg.role === 'user' ? '你' : 'dev-agent'}：</Text><br />
            {msg.content}
          </div>
        ))}
        <Space style={{ margin: '8px 0' }}>
          <Button size="small" onClick={() => { setAgentInput('生成单元测试骨架'); }}>生成单元测试骨架</Button>
          <Button size="small" onClick={() => { setAgentInput('解释 BH 规格'); }}>解释 BH 规格</Button>
          <Button size="small" onClick={() => { setAgentInput('检查 DoD'); }}>检查 DoD</Button>
        </Space>
        <Input.Search
          placeholder="问我..."
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

export default DevWorkshop;
