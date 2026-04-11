import React, { useState } from 'react';
import { Card, Row, Col, Typography, Tree, Button, Tag, Progress, Input, Space, Alert, message } from 'antd';
import { CheckCircleOutlined, WarningOutlined, RobotOutlined, SaveOutlined, EyeOutlined, SendOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const PRDEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { prds, updatePrdStatus } = useAppStore();
  const prd = prds.find((p) => p.id === id);
  const [score, setScore] = useState(prd?.aiScore || 0);
  const [editing, setEditing] = useState(true);

  if (!prd) {
    return <div>PRD 未找到</div>;
  }

  const treeData = [
    { title: '背景与目标', key: 'bg', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
    { title: '用户画像', key: 'persona', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
    { title: '用户故事 + 验收标准', key: 'stories', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
    { title: 'NFR', key: 'nfr', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
    {
      title: '影响分析',
      key: 'impact',
      icon: prd.impactApps?.length ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <WarningOutlined style={{ color: '#faad14' }} />,
    },
  ];

  const handleSubmitReview = () => {
    updatePrdStatus(prd.id, 'reviewing');
    message.success('已提交评审');
    navigate('/requirements');
  };

  const handleAiReview = () => {
    setScore(Math.min(10, score + 0.5));
    message.info('AI 已完成审阅，评分已更新');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          编辑 {prd.id}: {prd.title}
        </Title>
        <Space>
          <Button icon={<SaveOutlined />}>保存</Button>
          <Button icon={<EyeOutlined />}>预览</Button>
          <Button onClick={handleAiReview}>AI 审阅</Button>
          {prd.status === 'draft' && (
            <Button type="primary" onClick={handleSubmitReview}>提交评审</Button>
          )}
        </Space>
      </div>

      <Row gutter={16}>
        {/* Left sidebar */}
        <Col span={5}>
          <Card size="small" title="文档结构">
            <Tree treeData={treeData} defaultExpandAll showIcon />
          </Card>

          <Card size="small" title="AI 建议" style={{ marginTop: 12 }}>
            {(!prd.impactApps || prd.impactApps.length === 0) && (
              <Alert
                message="影响分析未完善"
                description="建议填写关联应用"
                type="warning"
                showIcon
                style={{ marginBottom: 8 }}
              />
            )}
          </Card>

          <Card size="small" title="文档评分" style={{ marginTop: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="circle"
                percent={score * 10}
                format={() => score.toFixed(1)}
                size={80}
                strokeColor={score >= 8 ? '#52c41a' : '#faad14'}
              />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">目标: ≥ 8.0</Text>
              </div>
            </div>
          </Card>
        </Col>

        {/* Main editor */}
        <Col span={19}>
          <Card>
            <Title level={5}>一、背景与目标</Title>
            <TextArea
              rows={3}
              defaultValue={prd.description}
              style={{ marginBottom: 16 }}
            />

            <Title level={5}>二、用户故事 + 验收标准</Title>
            {prd.userStories.map((us) => (
              <Card key={us.id} size="small" style={{ marginBottom: 8 }}>
                <Text strong>{us.id}: </Text>
                <Text>{us.content}</Text>
                <div style={{ marginTop: 4 }}>
                  {us.acceptanceCriteria.map((ac, idx) => (
                    <Tag key={idx} style={{ marginBottom: 4 }}>AC-{String(idx + 1).padStart(3, '0')}: {ac}</Tag>
                  ))}
                </div>
              </Card>
            ))}

            <Title level={5} style={{ marginTop: 16 }}>三、NFR（非功能需求）</Title>
            <TextArea rows={2} defaultValue={prd.nfr || ''} />

            <Title level={5} style={{ marginTop: 16 }}>四、影响分析</Title>
            {prd.impactApps && prd.impactApps.length > 0 ? (
              <div>
                <Alert
                  message="AI 已识别：此需求可能影响以下应用"
                  type="info"
                  showIcon
                  style={{ marginBottom: 8 }}
                />
                {prd.impactApps.map((app) => (
                  <Tag key={app} color="blue" style={{ marginBottom: 4 }}>{app}</Tag>
                ))}
              </div>
            ) : (
              <Alert message="影响分析缺失" description="建议添加关联应用分析" type="warning" showIcon />
            )}
          </Card>

          {/* Agent suggestion */}
          <Card style={{ marginTop: 12 }} className="agent-panel">
            <div className="agent-panel-title">
              <RobotOutlined /> product-agent 建议
            </div>
            <Paragraph style={{ fontSize: 13, margin: 0 }}>
              {score < 8
                ? `当前评分 ${score.toFixed(1)}，建议补充以下内容以提升评分：\n· 完善影响分析章节\n· 增加边界条件的验收标准\n· 补充性能基准测试方案`
                : '文档质量良好，可以提交评审。'}
            </Paragraph>
            <Space style={{ marginTop: 8 }}>
              <Button size="small" type="primary">立即完善</Button>
              <Button size="small">忽略</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default PRDEditor;
