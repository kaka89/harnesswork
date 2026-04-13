import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Button, Tabs, Table, Statistic, Space, Typography, Progress,
  Badge, Tooltip, Modal, Input, message, Rate, Segmented, Descriptions, List, Avatar,
} from 'antd';
import {
  RobotOutlined, SendOutlined, PlusOutlined, RiseOutlined, FallOutlined,
  MinusOutlined, TrophyOutlined, FundProjectionScreenOutlined, TeamOutlined,
  BulbOutlined, CheckCircleOutlined, CloseCircleOutlined, ExperimentOutlined,
  AimOutlined, ThunderboltOutlined, EyeOutlined, LikeOutlined, DislikeOutlined,
} from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react';
import { useNavigate } from 'react-router-dom';
import {
  productPlans, competitorList, marketInsights, customerVoices,
  marketShareTrend, ProductPlan, PlanningStatus, PlanningType,
} from '../../mock/planning';

const { Text, Title, Paragraph } = Typography;

const statusConfig: Record<PlanningStatus, { label: string; color: string }> = {
  research: { label: '调研中', color: 'default' },
  analyzing: { label: '分析中', color: 'processing' },
  proposed: { label: '已提案', color: 'warning' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已否决', color: 'error' },
};

const typeConfig: Record<PlanningType, { label: string; color: string }> = {
  'new-module': { label: '新模块', color: '#1264e5' },
  'feature-optimize': { label: '功能优化', color: '#52c41a' },
  'new-product-line': { label: '新产品线', color: '#722ed1' },
  'tech-upgrade': { label: '技术升级', color: '#fa8c16' },
};

const trendIcon: Record<string, React.ReactNode> = {
  up: <RiseOutlined style={{ color: '#52c41a' }} />,
  down: <FallOutlined style={{ color: '#ff4d4f' }} />,
  stable: <MinusOutlined style={{ color: '#999' }} />,
};

const impactColor: Record<string, string> = {
  high: 'red', medium: 'orange', low: 'blue',
};

const categoryLabel: Record<string, string> = {
  trend: '行业趋势', regulation: '政策法规', technology: '技术方向', 'customer-demand': '客户需求',
};

const ProductPlanning: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(productPlans);
  const [activeTab, setActiveTab] = useState('overview');
  const [detailPlan, setDetailPlan] = useState<ProductPlan | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);

  const handleVote = (planId: string, type: 'approve' | 'reject') => {
    setPlans((prev) =>
      prev.map((p) =>
        p.id === planId
          ? { ...p, votes: { ...p.votes, [type]: p.votes[type] + 1 } }
          : p
      )
    );
    message.success(`已${type === 'approve' ? '赞成' : '反对'} ${planId}`);
  };

  const handleStatusChange = (planId: string, status: PlanningStatus) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, status } : p)));
    message.success(`${planId} 状态已更新为「${statusConfig[status].label}」`);
  };

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    const userMsg = agentInput;
    setAgentMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAgentInput('');
    setTimeout(() => {
      let reply = '';
      if (userMsg.includes('竞品') || userMsg.includes('竞争')) {
        reply = '根据最新竞品分析：\n\n• **用友 YonSuite**：市场份额28%，保持稳定，但云原生转型慢\n• **SAP S/4HANA**：份额22%且下降中，价格劣势明显\n• **浪潮 GS Cloud**：份额12%，增长快，政企市场强\n\n建议重点关注浪潮在制造业的追赶势头，加速供应链韧性升级。';
      } else if (userMsg.includes('市场') || userMsg.includes('趋势')) {
        reply = '当前三大核心趋势：\n\n1. **AI+财务**（高优先级）- 60%大型企业将在2027年采用\n2. **IFRS 18新准则**（紧急）- 2027年1月生效，需提前适配\n3. **供应链韧性**（高优先级）- 72%制造业企业首要IT投资\n\n建议 PLAN-001（AI智能财务）和 PLAN-003（IFRS 18）作为v8.0必做项。';
      } else if (userMsg.includes('客户') || userMsg.includes('VOC')) {
        reply = '客户声音 TOP 痛点：\n\n🏭 **制造业**：供应链协同实时性差、成本核算周期长\n💰 **金融/ICT**：多币种效率低、集团合并复杂\n🚚 **物流**：费用分摊复杂、多维利润分析缺失\n🏪 **零售**：门店扩张期核算量激增、对账耗时\n\n综合来看，AI+自动化是共性诉求，建议 PLAN-001 优先级最高。';
      } else if (userMsg.includes('建议') || userMsg.includes('优先') || userMsg.includes('规划')) {
        reply = '基于竞品、市场、客户三维分析，我的规划建议：\n\n🔴 **v8.0 必做**：\n  ① PLAN-001 AI智能财务（AI评分9.2）\n  ② PLAN-002 供应链韧性升级（AI评分8.8）\n  ③ PLAN-003 IFRS 18适配（合规必备）\n\n🟡 **v8.0 可选**：\n  ④ PLAN-004 小微企业版（需先MVP验证）\n\n🟢 **v8.1 规划**：\n  ⑤ PLAN-005 低代码引擎升级（长期价值）';
      } else {
        reply = '我是 planning-agent，可以帮你：\n\n• 📊 分析竞品动态和市场趋势\n• 🎯 整合客户声音(VOC)提炼痛点\n• 💡 基于数据给出产品规划建议\n• 📋 评估规划提案的可行性和ROI\n\n你可以问我：「竞品最新动态是什么？」「市场趋势分析」「客户痛点总结」「给出规划优先级建议」';
      }
      setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  // 市场份额趋势图
  const marketShareChartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['金蝶', '用友', 'SAP', '浪潮'], bottom: 0 },
    grid: { top: 20, right: 20, bottom: 40, left: 40 },
    xAxis: { type: 'category' as const, data: marketShareTrend.map((d) => d.quarter) },
    yAxis: { type: 'value' as const, name: '%', max: 40 },
    series: [
      { name: '金蝶', type: 'line', data: marketShareTrend.map((d) => d.kingdee), itemStyle: { color: '#1264e5' }, lineStyle: { width: 3 } },
      { name: '用友', type: 'line', data: marketShareTrend.map((d) => d.yonyou), itemStyle: { color: '#ff4d4f' } },
      { name: 'SAP', type: 'line', data: marketShareTrend.map((d) => d.sap), itemStyle: { color: '#52c41a' } },
      { name: '浪潮', type: 'line', data: marketShareTrend.map((d) => d.inspur), itemStyle: { color: '#fa8c16' } },
    ],
  };

  // 规划状态分布饼图
  const statusPieOption = {
    tooltip: { trigger: 'item' as const },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      data: [
        { value: plans.filter((p) => p.status === 'research').length, name: '调研中', itemStyle: { color: '#d9d9d9' } },
        { value: plans.filter((p) => p.status === 'analyzing').length, name: '分析中', itemStyle: { color: '#1890ff' } },
        { value: plans.filter((p) => p.status === 'proposed').length, name: '已提案', itemStyle: { color: '#faad14' } },
        { value: plans.filter((p) => p.status === 'approved').length, name: '已批准', itemStyle: { color: '#52c41a' } },
      ].filter((d) => d.value > 0),
      label: { formatter: '{b}: {c}' },
    }],
  };

  // ==================== Overview Tab ====================
  const renderOverview = () => (
    <div>
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="规划总数" value={plans.length} prefix={<BulbOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="已批准" value={plans.filter((p) => p.status === 'approved').length} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="分析/提案中" value={plans.filter((p) => ['analyzing', 'proposed'].includes(p.status)).length} prefix={<ExperimentOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="平均 AI 评分" value={(plans.reduce((s, p) => s + p.aiScore, 0) / plans.length).toFixed(1)} prefix={<AimOutlined />} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={14}>
          <Card title="市场份额趋势" size="small">
            <ReactEChartsCore option={marketShareChartOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="规划状态分布" size="small">
            <ReactEChartsCore option={statusPieOption} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      {/* 规划看板 */}
      <Card title="产品规划看板" size="small" extra={<Button type="primary" icon={<PlusOutlined />} size="small">新建规划</Button>}>
        <Row gutter={12}>
          {(['research', 'analyzing', 'proposed', 'approved'] as PlanningStatus[]).map((status) => {
            const items = plans.filter((p) => p.status === status);
            return (
              <Col span={6} key={status}>
                <div className="kanban-column" style={{ minHeight: 300 }}>
                  <div className="kanban-column-title">
                    {statusConfig[status].label} ({items.length})
                  </div>
                  {items.map((plan) => (
                    <Card
                      key={plan.id}
                      size="small"
                      className="hover-card"
                      style={{ marginBottom: 8, cursor: 'pointer' }}
                      onClick={() => setDetailPlan(plan)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 12 }}>{plan.id}</Text>
                        <Tag color={typeConfig[plan.type].color} style={{ marginRight: 0, fontSize: 11 }}>
                          {typeConfig[plan.type].label}
                        </Tag>
                      </div>
                      <Text style={{ fontSize: 13, fontWeight: 500 }}>{plan.title}</Text>
                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>{plan.owner}</Text>
                        <Tag color={plan.priority === 'P0' ? 'red' : plan.priority === 'P1' ? 'orange' : 'blue'} style={{ marginRight: 0, fontSize: 11 }}>
                          {plan.priority}
                        </Tag>
                      </div>
                      {plan.aiScore > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ThunderboltOutlined style={{ color: '#fa8c16', fontSize: 11 }} />
                          <Text style={{ fontSize: 11, color: '#fa8c16' }}>AI评分 {plan.aiScore}</Text>
                        </div>
                      )}
                      {plan.status === 'proposed' && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                          <Button size="small" type="text" icon={<LikeOutlined />} onClick={(e) => { e.stopPropagation(); handleVote(plan.id, 'approve'); }}>
                            {plan.votes.approve}
                          </Button>
                          <Button size="small" type="text" danger icon={<DislikeOutlined />} onClick={(e) => { e.stopPropagation(); handleVote(plan.id, 'reject'); }}>
                            {plan.votes.reject}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>
    </div>
  );

  // ==================== Competitor Tab ====================
  const renderCompetitor = () => (
    <div>
      <Row gutter={16}>
        {competitorList.map((comp) => (
          <Col span={12} key={comp.id} style={{ marginBottom: 16 }}>
            <Card
              title={
                <Space>
                  <TrophyOutlined />
                  <span>{comp.competitor}</span>
                  <Tag>{comp.product}</Tag>
                  {trendIcon[comp.trend]}
                </Space>
              }
              size="small"
              extra={<Text type="secondary">份额 {comp.marketShare}%</Text>}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="success" strong style={{ fontSize: 12 }}>优势</Text>
                  <List
                    size="small"
                    dataSource={comp.strengths}
                    renderItem={(s) => <List.Item style={{ padding: '4px 0', fontSize: 13 }}>✅ {s}</List.Item>}
                  />
                </Col>
                <Col span={12}>
                  <Text type="danger" strong style={{ fontSize: 12 }}>劣势</Text>
                  <List
                    size="small"
                    dataSource={comp.weaknesses}
                    renderItem={(w) => <List.Item style={{ padding: '4px 0', fontSize: 13 }}>⚠️ {w}</List.Item>}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>更新于 {comp.lastUpdated}</Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );

  // ==================== Market Tab ====================
  const renderMarket = () => (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="市场份额趋势" size="small">
            <ReactEChartsCore option={marketShareChartOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="关键洞察" size="small" style={{ height: '100%' }}>
            {marketInsights.filter((m) => m.impact === 'high').map((m) => (
              <div key={m.id} style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7e6', borderRadius: 6, border: '1px solid #ffe58f' }}>
                <Text strong style={{ fontSize: 13 }}>🔥 {m.title}</Text>
                <br />
                <Text style={{ fontSize: 12 }}>{m.summary.slice(0, 60)}...</Text>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
      <Card title="全部市场洞察" size="small">
        <Table
          dataSource={marketInsights}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 80 },
            { title: '标题', dataIndex: 'title', width: 250 },
            { title: '类别', dataIndex: 'category', width: 100, render: (v: string) => <Tag>{categoryLabel[v]}</Tag> },
            { title: '影响', dataIndex: 'impact', width: 80, render: (v: string) => <Tag color={impactColor[v]}>{v === 'high' ? '高' : v === 'medium' ? '中' : '低'}</Tag> },
            { title: '来源', dataIndex: 'source', width: 160 },
            { title: '日期', dataIndex: 'date', width: 110 },
            { title: '摘要', dataIndex: 'summary', ellipsis: true },
          ]}
        />
      </Card>
    </div>
  );

  // ==================== Customer Tab ====================
  const renderCustomer = () => (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {customerVoices.slice(0, 4).map((cv) => (
          <Col span={6} key={cv.id}>
            <Card size="small">
              <Statistic title={cv.customer} value={cv.satisfaction} suffix="/ 10" valueStyle={{ fontSize: 20, color: cv.satisfaction >= 8 ? '#52c41a' : cv.satisfaction >= 7 ? '#fa8c16' : '#ff4d4f' }} />
              <div style={{ marginTop: 4 }}>
                <Tag>{cv.industry}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>访问 {cv.visits} 次</Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="客户声音详情" size="small">
        <Table
          dataSource={customerVoices}
          rowKey="id"
          size="small"
          pagination={false}
          expandable={{
            expandedRowRender: (record) => (
              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>痛点</Text>
                  <List size="small" dataSource={record.painPoints} renderItem={(p) => <List.Item style={{ padding: '2px 0', fontSize: 12 }}>🔴 {p}</List.Item>} />
                </Col>
                <Col span={12}>
                  <Text strong>诉求</Text>
                  <List size="small" dataSource={record.demands} renderItem={(d) => <List.Item style={{ padding: '2px 0', fontSize: 12 }}>💡 {d}</List.Item>} />
                </Col>
              </Row>
            ),
          }}
          columns={[
            { title: '客户', dataIndex: 'customer', width: 160 },
            { title: '行业', dataIndex: 'industry', width: 100, render: (v: string) => <Tag>{v}</Tag> },
            { title: '规模', dataIndex: 'size', width: 80, render: (v: string) => <Tag color={v === 'large' ? 'blue' : v === 'medium' ? 'green' : 'default'}>{v === 'large' ? '大型' : v === 'medium' ? '中型' : '小型'}</Tag> },
            { title: '满意度', dataIndex: 'satisfaction', width: 80, render: (v: number) => <Text style={{ color: v >= 8 ? '#52c41a' : '#fa8c16' }}>{v}</Text> },
            { title: '访问次数', dataIndex: 'visits', width: 80 },
            { title: '最近联系', dataIndex: 'lastContact', width: 110 },
            { title: '核心痛点', dataIndex: 'painPoints', render: (ps: string[]) => ps.slice(0, 2).map((p, i) => <Tag key={i} style={{ fontSize: 11, marginBottom: 2 }}>{p}</Tag>) },
          ]}
        />
      </Card>
    </div>
  );

  // ==================== Detail Modal ====================
  const renderDetailModal = () => {
    if (!detailPlan) return null;
    const totalVotes = detailPlan.votes.approve + detailPlan.votes.reject + detailPlan.votes.abstain;
    const approveRate = totalVotes > 0 ? Math.round((detailPlan.votes.approve / totalVotes) * 100) : 0;
    return (
      <Modal
        open={!!detailPlan}
        onCancel={() => setDetailPlan(null)}
        width={720}
        title={
          <Space>
            <Tag color={typeConfig[detailPlan.type].color}>{typeConfig[detailPlan.type].label}</Tag>
            {detailPlan.id} - {detailPlan.title}
          </Space>
        }
        footer={
          <Space>
            {detailPlan.status === 'proposed' && (
              <>
                <Button type="primary" onClick={() => { handleStatusChange(detailPlan.id, 'approved'); setDetailPlan(null); }}>批准</Button>
                <Button danger onClick={() => { handleStatusChange(detailPlan.id, 'rejected'); setDetailPlan(null); }}>否决</Button>
              </>
            )}
            {detailPlan.status === 'research' && (
              <Button type="primary" onClick={() => { handleStatusChange(detailPlan.id, 'analyzing'); setDetailPlan(null); }}>开始分析</Button>
            )}
            {detailPlan.status === 'analyzing' && (
              <Button type="primary" onClick={() => { handleStatusChange(detailPlan.id, 'proposed'); setDetailPlan(null); }}>提交提案</Button>
            )}
            <Button onClick={() => setDetailPlan(null)}>关闭</Button>
          </Space>
        }
      >
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="负责人">{detailPlan.owner}</Descriptions.Item>
          <Descriptions.Item label="优先级"><Tag color={detailPlan.priority === 'P0' ? 'red' : detailPlan.priority === 'P1' ? 'orange' : 'blue'}>{detailPlan.priority}</Tag></Descriptions.Item>
          <Descriptions.Item label="目标版本">{detailPlan.targetVersion}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={statusConfig[detailPlan.status].color}>{statusConfig[detailPlan.status].label}</Tag></Descriptions.Item>
          <Descriptions.Item label="创建时间">{detailPlan.createdAt}</Descriptions.Item>
          {detailPlan.decidedAt && <Descriptions.Item label="决策时间">{detailPlan.decidedAt}</Descriptions.Item>}
        </Descriptions>

        <Card size="small" style={{ marginBottom: 12 }}>
          <Text strong>规划描述</Text>
          <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>{detailPlan.description}</Paragraph>
        </Card>

        <Card size="small" style={{ marginBottom: 12 }}>
          <Text strong>决策背景</Text>
          <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>{detailPlan.background}</Paragraph>
        </Card>

        <Card size="small" style={{ marginBottom: 12 }}>
          <Text strong>预期 ROI</Text>
          <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>{detailPlan.expectedROI}</Paragraph>
        </Card>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={12}>
            <Card size="small" style={{ background: '#f0f5ff' }}>
              <Space>
                <ThunderboltOutlined style={{ color: '#fa8c16' }} />
                <Text strong>AI 评分：{detailPlan.aiScore}</Text>
              </Space>
              <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>{detailPlan.aiSuggestion}</Paragraph>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small">
              <Text strong>投票情况</Text>
              {totalVotes > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <Progress percent={approveRate} success={{ percent: approveRate }} size="small" />
                  <Space style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: '#52c41a' }}>赞成 {detailPlan.votes.approve}</Text>
                    <Text style={{ fontSize: 12, color: '#ff4d4f' }}>反对 {detailPlan.votes.reject}</Text>
                    <Text style={{ fontSize: 12, color: '#999' }}>弃权 {detailPlan.votes.abstain}</Text>
                  </Space>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>暂无投票</Text></div>
              )}
            </Card>
          </Col>
        </Row>

        {detailPlan.relatedPrds.length > 0 && (
          <Card size="small">
            <Text strong>关联需求</Text>
            <div style={{ marginTop: 4 }}>
              {detailPlan.relatedPrds.map((prd) => (
                <Tag key={prd} color="blue" style={{ cursor: 'pointer' }} onClick={() => { setDetailPlan(null); navigate(`/requirements/edit/${prd}`); }}>{prd}</Tag>
              ))}
            </div>
          </Card>
        )}
      </Modal>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>产品规划工坊</Title>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'overview', label: '📋 规划总览', children: renderOverview() },
          { key: 'competitor', label: '🏆 竞品分析', children: renderCompetitor() },
          { key: 'market', label: '📊 市场洞察', children: renderMarket() },
          { key: 'customer', label: '👥 客户声音', children: renderCustomer() },
        ]}
      />

      {/* Agent panel */}
      <Card style={{ marginTop: 20 }} className="agent-panel">
        <div className="agent-panel-title">
          <RobotOutlined /> planning-agent
        </div>
        <Text style={{ fontSize: 13 }}>我可以帮你：</Text>
        <ul style={{ fontSize: 13, margin: '4px 0 12px', paddingLeft: 20 }}>
          <li>分析竞品动态和市场趋势</li>
          <li>整合客户声音(VOC)提炼痛点</li>
          <li>基于数据给出产品规划建议</li>
          <li>评估规划提案的可行性和ROI</li>
        </ul>
        <Space wrap style={{ marginBottom: 12 }}>
          {['竞品最新动态是什么？', '市场趋势分析', '客户痛点总结', '给出规划优先级建议'].map((q) => (
            <Button key={q} size="small" type="dashed" onClick={() => {
              setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
              setTimeout(() => {
                let reply = '';
                if (q.includes('竞品')) reply = '根据最新竞品分析：\n\n• **用友 YonSuite**：市场份额28%，保持稳定，但云原生转型慢\n• **SAP S/4HANA**：份额22%且下降中，价格劣势明显\n• **浪潮 GS Cloud**：份额12%，增长快，政企市场强\n\n建议重点关注浪潮在制造业的追赶势头，加速供应链韧性升级。';
                else if (q.includes('市场')) reply = '当前三大核心趋势：\n\n1. **AI+财务**（高优先级）- 60%大型企业将在2027年采用\n2. **IFRS 18新准则**（紧急）- 2027年1月生效，需提前适配\n3. **供应链韧性**（高优先级）- 72%制造业企业首要IT投资\n\n建议 PLAN-001 和 PLAN-003 作为v8.0必做项。';
                else if (q.includes('客户')) reply = '客户声音 TOP 痛点：\n\n🏭 制造业：供应链协同实时性差、成本核算周期长\n💰 金融/ICT：多币种效率低、集团合并复杂\n🚚 物流：费用分摊复杂、多维利润分析缺失\n🏪 零售：门店扩张期核算量激增、对账耗时\n\n综合来看，AI+自动化是共性诉求。';
                else reply = '基于三维分析，规划建议：\n\n🔴 v8.0 必做：① PLAN-001 AI智能财务 ② PLAN-002 供应链韧性升级 ③ PLAN-003 IFRS 18适配\n🟡 v8.0 可选：④ PLAN-004 小微企业版(需MVP验证)\n🟢 v8.1 规划：⑤ PLAN-005 低代码引擎升级';
                setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
              }, 800);
            }}>
              {q}
            </Button>
          ))}
        </Space>
        {agentMessages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: 8,
              padding: '6px 10px',
              background: msg.role === 'user' ? '#e6f7ff' : '#fff',
              borderRadius: 6,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            <Text strong style={{ fontSize: 12 }}>{msg.role === 'user' ? '你' : 'planning-agent'}：</Text>
            <br />
            {msg.content}
          </div>
        ))}
        <Input.Search
          placeholder="输入你的问题... 如：竞品动态、市场趋势、客户痛点分析"
          value={agentInput}
          onChange={(e) => setAgentInput(e.target.value)}
          onSearch={handleAgentSend}
          onPressEnter={handleAgentSend}
          enterButton={<SendOutlined />}
        />
      </Card>

      {renderDetailModal()}
    </div>
  );
};

export default ProductPlanning;
