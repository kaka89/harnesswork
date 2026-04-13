import React, { useState } from 'react';
import { Card, Typography, Checkbox, Button, Tag, Space, Alert, Input, message } from 'antd';
import { CheckCircleOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';

const { Text, Title, Paragraph } = Typography;

const PRSubmit: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tasks, updateTaskStatus } = useAppStore();
  const task = tasks.find((t) => t.id === taskId);

  const [checklist, setChecklist] = useState([
    { key: 'sdd', label: '代码逻辑符合 SDD 和 CONTRACT 规格', checked: true },
    { key: 'javadoc', label: '所有 public/protected 方法有 Javadoc', checked: true },
    { key: 'constant', label: '无 hardcoded 常量', checked: true },
    { key: 'log', label: '无敏感信息在日志中', checked: true },
    { key: 'exception', label: '异常处理完整', checked: false },
    { key: 'test', label: '单元测试通过: mvn test', checked: true },
    { key: 'coverage', label: `覆盖率: ${task?.coverage || 0}%（≥80%阈值）`, checked: (task?.coverage || 0) >= 80 },
  ]);

  if (!task) return <div>TASK 未找到</div>;

  const allChecked = checklist.every((c) => c.checked);
  const uncheckedCount = checklist.filter((c) => !c.checked).length;

  const handleToggle = (key: string) => {
    setChecklist((prev) =>
      prev.map((c) => (c.key === key ? { ...c, checked: !c.checked } : c))
    );
  };

  const handleSubmitPR = () => {
    updateTaskStatus(task.id, 'in-review');
    message.success('PR 已提交！');
    navigate('/dev');
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={4}>提交 Pull Request — {task.id}</Title>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">标题：</Text>
          <Input
            defaultValue={`feat(gl-batch): ${task.title} [${task.id}]`}
            style={{ marginTop: 4 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>（自动填充）</Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">关联：</Text>
          <Space style={{ marginLeft: 8 }}>
            <Tag color="blue">{task.id}</Tag>
            <Tag color="blue">CONTRACT-001</Tag>
            <Tag color="blue">SDD-001</Tag>
          </Space>
        </div>

        <Title level={5}>PR Checklist（自检）</Title>
        <div style={{ background: 'var(--dls-bg-subtle)', padding: 16, borderRadius: 8 }}>
          {checklist.map((item) => (
            <div key={item.key} style={{ padding: '6px 0' }}>
              <Checkbox
                checked={item.checked}
                onChange={() => handleToggle(item.key)}
              >
                <Text style={{ color: item.checked ? '#52c41a' : '#8c8c8c' }}>
                  {item.checked ? '✅' : '⬜'} {item.label}
                </Text>
                {item.key === 'exception' && !item.checked && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginLeft: 24 }}>
                    dev-agent 提示：checkVoucherBalance 方法缺少异常处理
                  </Text>
                )}
              </Checkbox>
            </div>
          ))}
        </div>

        {!allChecked && (
          <Alert
            message={`有 ${uncheckedCount} 项未完成，建议修复后再提交`}
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      <Card title="变更摘要（AI 自动生成）" style={{ marginBottom: 16 }}>
        <Paragraph style={{ fontSize: 13, margin: 0 }}>
          "实现 VoucherBatchService 的核心批量导入逻辑，包含：
          Excel 解析、逐行校验（借贷平衡/科目存在/账期）、
          批量入库（100条/批）、错误收集、VoucherPosted 事件发布"
        </Paragraph>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <ThunderboltOutlined style={{ color: '#52c41a' }} />
          <Text>CI 预检（本地）：已通过 pre-commit hooks</Text>
          <Tag color="success">通过</Tag>
        </Space>
      </Card>

      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button onClick={() => navigate('/dev')}>取消</Button>
          {allChecked ? (
            <Button type="primary" onClick={handleSubmitPR}>
              提交 PR
            </Button>
          ) : (
            <>
              <Button type="primary" danger onClick={handleSubmitPR}>
                强制提交（带说明）
              </Button>
              <Button onClick={() => message.info('请先完成所有检查项')}>
                先修复再提交
              </Button>
            </>
          )}
        </Space>
      </div>
    </div>
  );
};

export default PRSubmit;
