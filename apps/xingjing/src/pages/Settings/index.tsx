import React, { useState } from 'react';
import {
  Tabs, Card, Segmented, Space, Typography, Form, Select, Input, Slider, InputNumber,
  Button, message, Table, Tag, Alert, Modal, Switch, Badge, Tooltip, Row, Col,
} from 'antd';
import {
  BgColorsOutlined, ApiOutlined, GithubOutlined, ClockCircleOutlined,
  NodeIndexOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SunOutlined, MoonOutlined, SaveOutlined, PlusOutlined,
  ExperimentOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';
import {
  defaultLLMConfig, modelOptions, LLMConfig,
  defaultGitRepos, GitRepoConfig,
  defaultScheduledTasks, ScheduledTask,
  defaultGateNodes, GateNode,
} from '../../mock/settings';

const { Title, Text, Paragraph } = Typography;

// ===================== Tab1: 主题外观 =====================

const ThemeTab: React.FC = () => {
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  const previewColors = themeMode === 'light'
    ? { bg: '#ffffff', text: '#000000', card: '#fafafa', border: '#d9d9d9' }
    : { bg: '#141414', text: '#ffffffd9', card: '#1f1f1f', border: '#434343' };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={5} style={{ margin: 0 }}>界面主题</Title>
          <Segmented
            size="large"
            value={themeMode}
            onChange={(val) => setThemeMode(val as 'light' | 'dark')}
            options={[
              { label: <span><SunOutlined style={{ marginRight: 6 }} />明亮模式</span>, value: 'light' },
              { label: <span><MoonOutlined style={{ marginRight: 6 }} />暗黑模式</span>, value: 'dark' },
            ]}
          />
        </Space>
      </Card>
      <Card title="当前主题预览">
        <Row gutter={16}>
          {([
            { label: '主色', color: '#1264e5' },
            { label: '背景色', color: previewColors.bg },
            { label: '卡片色', color: previewColors.card },
            { label: '文字色', color: previewColors.text },
            { label: '边框色', color: previewColors.border },
          ]).map((item) => (
            <Col key={item.label} span={4}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 8, margin: '0 auto 8px',
                  background: item.color, border: '1px solid #d9d9d9',
                }} />
                <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                <br />
                <Text code style={{ fontSize: 11 }}>{item.color}</Text>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
};

// ===================== Tab2: 大模型配置 =====================

const LLMTab: React.FC = () => {
  const [config, setConfig] = useState<LLMConfig>({ ...defaultLLMConfig });
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const handleTest = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      message.success('连接成功！模型响应正常');
    }, 1500);
  };

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        initialValues={config}
        onValuesChange={(_, all) => setConfig({ ...config, ...all })}
        style={{ maxWidth: 600 }}
      >
        <Form.Item label="模型名称" name="modelName">
          <Select options={modelOptions} />
        </Form.Item>
        <Form.Item label="API 地址" name="apiUrl">
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item label="API Key" name="apiKey">
          <Input.Password placeholder="输入 API Key" />
        </Form.Item>
        <Form.Item label={`Temperature: ${config.temperature}`} name="temperature">
          <Slider min={0} max={2} step={0.1} />
        </Form.Item>
        <Form.Item label="Max Tokens" name="maxTokens">
          <InputNumber min={256} max={128000} step={256} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button icon={<ExperimentOutlined />} loading={testing} onClick={handleTest}>
              测试连接
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('配置已保存')}>
              保存配置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

// ===================== Tab3: Git 仓库配置 =====================

const GitTab: React.FC = () => {
  const [repos, setRepos] = useState<GitRepoConfig[]>([...defaultGitRepos]);
  const [editRepo, setEditRepo] = useState<GitRepoConfig | null>(null);
  const [form] = Form.useForm();

  const columns = [
    { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 140 },
    {
      title: '仓库 URL', dataIndex: 'repoUrl', key: 'repoUrl',
      render: (url: string) => <Text copyable style={{ fontSize: 13 }}>{url}</Text>,
    },
    {
      title: '默认分支', dataIndex: 'defaultBranch', key: 'defaultBranch', width: 120,
      render: (b: string) => <Tag color="blue">{b}</Tag>,
    },
    {
      title: 'Token 状态', dataIndex: 'tokenConfigured', key: 'tokenConfigured', width: 120,
      render: (ok: boolean) => ok
        ? <Badge status="success" text="已配置" />
        : <Badge status="error" text="未配置" />,
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: GitRepoConfig) => (
        <Button type="link" size="small" onClick={() => { setEditRepo(record); form.setFieldsValue(record); }}>
          编辑
        </Button>
      ),
    },
  ];

  const handleSave = () => {
    form.validateFields().then((vals) => {
      setRepos(repos.map((r) =>
        r.id === editRepo!.id
          ? { ...r, ...vals, tokenConfigured: !!vals.accessToken && vals.accessToken !== '' }
          : r
      ));
      setEditRepo(null);
      message.success('仓库配置已更新');
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert message="每个产品项目对应一个 Git 仓库配置，用于 Agent 自动提交代码和创建 PR。" type="info" showIcon />
      <Table columns={columns} dataSource={repos} rowKey="id" pagination={false} />
      <Modal
        title="编辑仓库配置" open={!!editRepo} onCancel={() => setEditRepo(null)}
        onOk={handleSave} okText="保存" width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="产品名称" name="productName">
            <Input disabled />
          </Form.Item>
          <Form.Item label="仓库 URL" name="repoUrl" rules={[{ required: true }]}>
            <Input placeholder="https://github.com/org/repo.git" />
          </Form.Item>
          <Form.Item label="默认分支" name="defaultBranch" rules={[{ required: true }]}>
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item label="Access Token" name="accessToken">
            <Input.Password placeholder="GitHub Personal Access Token" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

// ===================== Tab4: 定时任务 =====================

const CronTab: React.FC = () => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([...defaultScheduledTasks]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const columns = [
    { title: '任务名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: 'Cron 表达式', dataIndex: 'cron', key: 'cron', width: 130,
      render: (c: string) => <Text code>{c}</Text>,
    },
    {
      title: '关联 Agent', dataIndex: 'agentName', key: 'agentName', width: 140,
      render: (a: string) => <Tag icon={<ThunderboltOutlined />} color="processing">{a}</Tag>,
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (enabled: boolean, record: ScheduledTask) => (
        <Switch
          checked={enabled} size="small"
          onChange={(val) => setTasks(tasks.map((t) => t.id === record.id ? { ...t, enabled: val } : t))}
        />
      ),
    },
    {
      title: '上次执行', dataIndex: 'lastRun', key: 'lastRun', width: 170,
      render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{t}</Text>,
    },
  ];

  const handleAdd = () => {
    form.validateFields().then((vals) => {
      const newTask: ScheduledTask = {
        id: `cron-${Date.now()}`,
        ...vals,
        enabled: true,
        lastRun: '-',
      };
      setTasks([...tasks, newTask]);
      setModalOpen(false);
      form.resetFields();
      message.success('定时任务已创建');
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Table columns={columns} dataSource={tasks} rowKey="id" pagination={false} />
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} block>
        新建定时任务
      </Button>
      <Modal
        title="新建定时任务" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={handleAdd} okText="创建" width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="任务名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="如：每日编码任务执行" />
          </Form.Item>
          <Form.Item label="Cron 表达式" name="cron" rules={[{ required: true }]}>
            <Input placeholder="0 2 * * *" />
          </Form.Item>
          <Form.Item label="关联 Agent" name="agentName" rules={[{ required: true }]}>
            <Select placeholder="选择执行 Agent" options={[
              { label: '编码 Agent', value: '编码 Agent' },
              { label: '效能分析 Agent', value: '效能分析 Agent' },
              { label: '质量守护 Agent', value: '质量守护 Agent' },
              { label: '需求分析 Agent', value: '需求分析 Agent' },
              { label: '架构设计 Agent', value: '架构设计 Agent' },
            ]} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="任务描述..." />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

// ===================== Tab5: 节点门控 =====================

const GateTab: React.FC = () => {
  const [nodes, setNodes] = useState<GateNode[]>([...defaultGateNodes]);

  const toggleNode = (id: string) => {
    setNodes(nodes.map((n) => n.id === id ? { ...n, requireHuman: !n.requireHuman } : n));
  };

  const setAll = (requireHuman: boolean) => {
    setNodes(nodes.map((n) => ({ ...n, requireHuman })));
    message.success(requireHuman ? '已设置所有节点为人工介入' : '已设置所有节点为自动通过');
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        message="节点门控配置"
        description="配置 Agent 自动驾驶流程中哪些节点需要人工介入审批，哪些可以自动通过。开启表示需要人工确认，关闭表示 Agent 可自行完成。"
        type="info" showIcon
      />
      <Space>
        <Button size="small" onClick={() => setAll(false)}>全部自动</Button>
        <Button size="small" onClick={() => setAll(true)}>全部人工</Button>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          当前 {nodes.filter((n) => n.requireHuman).length} 个节点需人工介入，{nodes.filter((n) => !n.requireHuman).length} 个自动通过
        </Text>
      </Space>
      {nodes.map((node, idx) => (
        <Card key={node.id} size="small" style={{ borderLeft: `3px solid ${node.requireHuman ? '#faad14' : '#52c41a'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <Space>
                <Text strong>{`${idx + 1}. ${node.name}`}</Text>
                {node.requireHuman
                  ? <Tag color="warning" icon={<CloseCircleOutlined />}>人工介入</Tag>
                  : <Tag color="success" icon={<CheckCircleOutlined />}>自动通过</Tag>
                }
              </Space>
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>{node.description}</Text>
            </div>
            <Tooltip title={node.requireHuman ? '切换为自动通过' : '切换为人工介入'}>
              <Switch
                checked={node.requireHuman}
                checkedChildren="人工"
                unCheckedChildren="自动"
                onChange={() => toggleNode(node.id)}
              />
            </Tooltip>
          </div>
        </Card>
      ))}
    </Space>
  );
};

// ===================== 主页面 =====================

const Settings: React.FC = () => {
  const tabItems = [
    { key: 'theme', label: <span><BgColorsOutlined /> 主题外观</span>, children: <ThemeTab /> },
    { key: 'llm', label: <span><ApiOutlined /> 大模型配置</span>, children: <LLMTab /> },
    { key: 'git', label: <span><GithubOutlined /> Git 仓库</span>, children: <GitTab /> },
    { key: 'cron', label: <span><ClockCircleOutlined /> 定时任务</span>, children: <CronTab /> },
    { key: 'gate', label: <span><NodeIndexOutlined /> 节点门控</span>, children: <GateTab /> },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>系统设置</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          管理平台主题、大模型接入、代码仓库、定时任务与流程门控配置
        </Paragraph>
      </div>
      <Tabs items={tabItems} defaultActiveKey="theme" />
    </div>
  );
};

export default Settings;
