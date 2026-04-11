import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Input, Typography, Button, Empty, Space, Badge,
} from 'antd';
import {
  BookOutlined, WarningOutlined, UserOutlined, CodeOutlined,
  SearchOutlined, PlusOutlined, RobotOutlined, BulbOutlined,
} from '@ant-design/icons';
import { myKnowledge, KnowledgeItem, KnowledgeCategory } from '../../../mock/solo';

const { Text, Title, Paragraph } = Typography;

const categoryConfig: Record<KnowledgeCategory, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  tagColor: string;
}> = {
  pitfall:      { label: '踩过的坑', icon: <WarningOutlined />, color: '#cf1322', bg: '#fff2f0', border: '#ffccc7', tagColor: 'red' },
  'user-insight': { label: '用户洞察', icon: <UserOutlined />,    color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7', tagColor: 'purple' },
  'tech-note':  { label: '技术笔记', icon: <CodeOutlined />,     color: '#1264e5', bg: '#f0f9ff', border: '#91caff', tagColor: 'blue' },
};

const KnowledgeCard: React.FC<{ item: KnowledgeItem }> = ({ item }) => {
  const cfg = categoryConfig[item.category];
  return (
    <Card
      size="small"
      hoverable
      style={{
        borderRadius: 10,
        border: `1px solid ${item.aiAlert ? '#ffe58f' : cfg.border}`,
        background: item.aiAlert ? '#fffbe6' : '#fff',
        marginBottom: 12,
      }}
      bodyStyle={{ padding: '12px 14px' }}
    >
      {item.aiAlert && (
        <div
          style={{
            padding: '4px 10px',
            background: '#faad14',
            borderRadius: 6,
            fontSize: 11,
            color: '#fff',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RobotOutlined />
          {item.aiAlert}
        </div>
      )}
      <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
      <Paragraph
        style={{ fontSize: 12, color: '#444', marginTop: 6, marginBottom: 8 }}
        ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
      >
        {item.content}
      </Paragraph>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {item.tags.map((tag) => (
          <Tag key={tag} color={cfg.tagColor} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
            {tag}
          </Tag>
        ))}
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>{item.date}</Text>
      </div>
    </Card>
  );
};

const SoloKnowledge: React.FC = () => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | 'all'>('all');

  const filtered = myKnowledge.filter((item) => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory;
    const matchSearch = !search || item.title.includes(search) || item.content.includes(search) || item.tags.some((t) => t.includes(search));
    return matchCat && matchSearch;
  });

  const byCategory = (cat: KnowledgeCategory) => filtered.filter((i) => i.category === cat);

  const pitfalls = byCategory('pitfall');
  const insights = byCategory('user-insight');
  const notes = byCategory('tech-note');

  const alertItems = myKnowledge.filter((i) => i.aiAlert);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BookOutlined style={{ color: '#1264e5', marginRight: 8 }} />
          个人知识库
        </Title>
        <Space>
          <Tag>{myKnowledge.length} 条记录</Tag>
          <Button type="primary" icon={<PlusOutlined />} size="small">
            添加笔记
          </Button>
        </Space>
      </div>

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
        <Text strong>💡 对比团队版：</Text> 团队版是五层组织知识树（公司/平台/产品线/领域/应用），解决多人知识不一致问题。独立版是个人第二大脑，核心价值是：<Text strong>AI 能引用这些知识辅助决策，并在类似场景主动提醒你。</Text>
      </div>

      {/* AI Alert */}
      {alertItems.length > 0 && (
        <Card
          style={{
            marginBottom: 16,
            background: 'linear-gradient(135deg, #fffbe6 0%, #fff9e6 100%)',
            border: '1px solid #ffe58f',
          }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RobotOutlined style={{ color: '#faad14', fontSize: 20 }} />
            <div>
              <Text strong style={{ fontSize: 13 }}>AI 知识关联提醒</Text>
              {alertItems.map((item) => (
                <div key={item.id} style={{ fontSize: 13, color: '#7c5b00', marginTop: 4 }}>
                  · 检测到「{item.title}」与当前任务相关 — <Text style={{ color: '#faad14' }}>{item.aiAlert}</Text>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索知识库..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, borderRadius: 8 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            type={activeCategory === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setActiveCategory('all')}
            style={{ borderRadius: 6 }}
          >
            全部
          </Button>
          {(Object.keys(categoryConfig) as KnowledgeCategory[]).map((cat) => {
            const cfg = categoryConfig[cat];
            return (
              <Button
                key={cat}
                type={activeCategory === cat ? 'primary' : 'default'}
                size="small"
                icon={cfg.icon}
                onClick={() => setActiveCategory(cat)}
                style={{ borderRadius: 6 }}
              >
                {cfg.label}
              </Button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <Empty description="没有找到匹配的记录" />
      )}

      {filtered.length > 0 && (
        <Row gutter={16}>
          {(activeCategory === 'all' || activeCategory === 'pitfall') && pitfalls.length > 0 && (
            <Col span={8}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: categoryConfig.pitfall.bg,
                  border: `1px solid ${categoryConfig.pitfall.border}`,
                  borderRadius: 8,
                }}
              >
                <WarningOutlined style={{ color: categoryConfig.pitfall.color }} />
                <Text strong style={{ color: categoryConfig.pitfall.color }}>踩过的坑</Text>
                <Badge count={pitfalls.length} color="#cf1322" style={{ marginLeft: 'auto' }} />
              </div>
              {pitfalls.map((item) => <KnowledgeCard key={item.id} item={item} />)}
              <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
                记录新踩坑
              </Button>
            </Col>
          )}

          {(activeCategory === 'all' || activeCategory === 'user-insight') && insights.length > 0 && (
            <Col span={8}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: categoryConfig['user-insight'].bg,
                  border: `1px solid ${categoryConfig['user-insight'].border}`,
                  borderRadius: 8,
                }}
              >
                <UserOutlined style={{ color: categoryConfig['user-insight'].color }} />
                <Text strong style={{ color: categoryConfig['user-insight'].color }}>用户洞察</Text>
                <Badge count={insights.length} color="#722ed1" style={{ marginLeft: 'auto' }} />
              </div>
              {insights.map((item) => <KnowledgeCard key={item.id} item={item} />)}
              <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
                记录用户洞察
              </Button>
            </Col>
          )}

          {(activeCategory === 'all' || activeCategory === 'tech-note') && notes.length > 0 && (
            <Col span={8}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: categoryConfig['tech-note'].bg,
                  border: `1px solid ${categoryConfig['tech-note'].border}`,
                  borderRadius: 8,
                }}
              >
                <CodeOutlined style={{ color: categoryConfig['tech-note'].color }} />
                <Text strong style={{ color: categoryConfig['tech-note'].color }}>技术笔记</Text>
                <Badge count={notes.length} color="#1264e5" style={{ marginLeft: 'auto' }} />
              </div>
              {notes.map((item) => <KnowledgeCard key={item.id} item={item} />)}
              <Button type="dashed" icon={<PlusOutlined />} block style={{ borderRadius: 8 }}>
                记录技术笔记
              </Button>
            </Col>
          )}

          {/* When filter is active, show all matches in single column */}
          {activeCategory !== 'all' && (
            <Col span={24}>
              {filtered.filter((i) => i.category === activeCategory).length === 0 && (
                <Empty description={`暂无${categoryConfig[activeCategory as KnowledgeCategory]?.label}记录`} />
              )}
            </Col>
          )}
        </Row>
      )}

      {/* AI Usage Hint */}
      <Card
        style={{
          marginTop: 16,
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)',
          border: '1px solid #91caff',
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <BulbOutlined style={{ color: '#1264e5', fontSize: 18, marginTop: 2 }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>知识库如何帮助 AI 做得更好</Text>
            <Paragraph style={{ fontSize: 12, color: '#444', margin: '6px 0 0' }}>
              这里记录的每一条内容都会被 AI 虚拟团队引用。当你问 dev-agent「这个 bug 怎么修」时，它会先检索你的技术笔记；当你问用户代言人「该做哪个功能」时，它会先读取你的用户洞察。
              你积累的越多，AI 建议越准确。
            </Paragraph>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SoloKnowledge;
