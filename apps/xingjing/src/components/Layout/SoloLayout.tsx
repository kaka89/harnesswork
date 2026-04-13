import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Badge, Tag, Tooltip, Drawer, Select, Button, Divider } from 'antd';
import {
  ThunderboltOutlined,
  BulbOutlined,
  CodeOutlined,
  RocketOutlined,
  LineChartOutlined,
  BookOutlined,
  UserOutlined,
  RobotOutlined,
  SendOutlined,
  PlayCircleOutlined,
  TeamOutlined,
  SettingOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import CreateProductModal from '../common/CreateProductModal';

const { Sider, Content, Header } = Layout;

const soloSlogans = [
  '复命曰常，知常曰明',
  '道可道，非常道',
  '为学日益，为道日损',
  '归根曰静，是谓复命',
  '夫物芸芸，各复归其根',
  '万物并作，吾以观其复',
];

const soloMenuItems = [
  {
    key: '/solo/autopilot-group',
    icon: <PlayCircleOutlined />,
    label: '自动驾驶',
    children: [
      { key: '/solo/autopilot', icon: <PlayCircleOutlined />,   label: '驾驶舱' },
      { key: '/solo/focus',     icon: <ThunderboltOutlined />,  label: '今日焦点' },
      { key: '/solo/product',   icon: <BulbOutlined />,         label: '产品洞察' },
      { key: '/solo/build',     icon: <CodeOutlined />,         label: '构建中' },
      { key: '/solo/release',   icon: <RocketOutlined />,       label: '发布管理' },
      { key: '/solo/review',    icon: <LineChartOutlined />,    label: '数据复盘' },
      { key: '/solo/knowledge', icon: <BookOutlined />,         label: '个人知识库' },
    ],
  },
  { key: '/solo/agent-workshop', icon: <TeamOutlined />,    label: 'AI搭档' },
  { key: '/solo/settings', icon: <SettingOutlined />,    label: '设置' },
];

const findSoloMenu = (items: any[], path: string): any => {
  for (const item of items) {
    if (item.key !== '/solo/autopilot-group' && path.startsWith(item.key)) return item;
    if (item.children) {
      const found = findSoloMenu(item.children, path);
      if (found) return found;
    }
  }
  return null;
};

type EnergyMode = 'deep' | 'light';

const SoloLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { appMode, products, currentProject, setProject, setAppMode, setAiPanelOpen } = useAppStore();
  const lastSoloProject = useAppStore((s) => s.lastSoloProject);
  const [openKeys, setOpenKeys] = useState<string[]>(['/solo/autopilot-group']);
  const [energyMode, setEnergyMode] = useState<EnergyMode>('deep');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [currentSlogan, setCurrentSlogan] = useState(
    () => soloSlogans[Math.floor(Math.random() * soloSlogans.length)]
  );

  // 每 10 秒随机切换一条名言
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlogan((prev) => {
        const rest = soloSlogans.filter((s) => s !== prev);
        return rest[Math.floor(Math.random() * rest.length)];
      });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // 确保在独立版 Layout 时 appMode 正确
  useEffect(() => {
    if (appMode !== 'solo') {
      setAppMode('solo');
    }
  }, []);
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([
    {
      role: 'assistant',
      content: '你好！我是你的 AI 虚拟团队。我了解你的产品所有决策、技术笔记和用户洞察。\n\n你可以问我：\n· 「当前最高优先级任务是什么？」\n· 「段落重写功能的用户假设验证结果如何？」\n· 「今天应该先做哪件事？」',
    },
  ]);

  const soloProducts = products.filter((p) => p.mode === 'solo');
  // 优先使用最后工作的产品，回退到 currentProject，再回退到第一个
  const resolvedSoloName = (lastSoloProject && soloProducts.find((p) => p.name === lastSoloProject))
    ? lastSoloProject
    : currentProject;
  const currentSoloProduct = soloProducts.find((p) => p.name === resolvedSoloName) || soloProducts[0];
  const soloProductOptions = soloProducts.map((p) => ({ value: p.name, label: p.name }));

  // 页面挂载时自动同步 currentProject 为最后工作的独立版产品
  useEffect(() => {
    if (soloProducts.length > 0 && currentSoloProduct) {
      setProject(currentSoloProduct.name);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayProductName = currentSoloProduct?.name || '星静';
  const displayTagline = currentSoloProduct?.tagline || '妄作，凶';

  const currentMenu = findSoloMenu(soloMenuItems, location.pathname);

  const handleModeSwitch = (v: string | number) => {
    if (v === 'team') {
      setAppMode('team');
      navigate('/autopilot');
    }
  };

  // 自动驾驶菜单配置：标题层点击→导航，展开图标层 stopPropagation 手动切换
  const soloMenuItemsWithClick = [
    {
      ...soloMenuItems[0],
      onTitleClick: () => { navigate('/solo/autopilot'); },
    },
    ...soloMenuItems.slice(1),
  ];

  const handleAiSend = () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiInput('');
    setTimeout(() => {
      let reply = '正在思考中...';
      if (userMsg.includes('优先') || userMsg.includes('今天')) {
        reply = '根据你的任务列表和商业指标，今天最优先的 3 件事是：\n\n1. 🔴 **修复 Editor 光标丢失 bug**（5 位用户反馈，已拖 2 天）\n2. 🟡 **回复 Product Hunt 8 条评论**（趁热度在，及时转化）\n3. 🟡 **开始邀请用户内测段落重写**（本周最高优先级假设验证）';
      } else if (userMsg.includes('重写') || userMsg.includes('假设')) {
        reply = '段落重写功能假设（h1）当前状态：**验证中**\n\n验证方式：邀请 5 位活跃用户内测 Beta，观察 3 天使用频率。\n\n相关任务：st2（实现 MVP）和 st3（邀请内测）均在待办状态，建议今天优先推进 st3（只需 1h）。';
      } else if (userMsg.includes('用户') || userMsg.includes('留存')) {
        reply = '根据知识库中的用户洞察：\n\n· 78% 的用户活跃时间在 20:00-23:00（推送策略可优化）\n· Onboarding 第 3 步骤流失率 42%（选项过多）\n· 最新反馈：4 条正面 / 1 条负面（延迟问题）\n\n当前 7 日留存 68%，相对稳定但有提升空间。';
      } else {
        reply = '我已加载你的产品知识库、任务列表和用户反馈。请告诉我你想了解哪方面，我来帮你分析。';
      }
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    }, 800);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        width={200}
        style={{
          borderRight: '1px solid var(--dls-border)',
          background: 'var(--dls-surface)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid var(--dls-border)',
            cursor: 'pointer',
            flexDirection: 'column',
            padding: '6px 0',
            gap: 2,
          }}
          onClick={() => navigate('/solo/focus')}
        >
          <div style={{ fontWeight: 700, fontSize: 16, color: '#52c41a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RobotOutlined />
            星静
          </div>
          <div style={{ fontSize: 10, color: 'var(--dls-text-muted)', lineHeight: 1 }}>复命曰常，知常曰明</div>
        </div>

        {/* Mode Switcher */}
        <div style={{ padding: '12px 12px', borderBottom: '1px solid var(--dls-border)' }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--dls-hover)',
              borderRadius: 12,
              padding: 4,
              border: '1px solid var(--dls-border)',
            }}
          >
            {[
              { label: '团队版', value: 'team' },
              { label: '独立版', value: 'solo' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleModeSwitch(option.value)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: appMode === option.value ? 'var(--dls-selected-bg)' : 'transparent',
                  color: appMode === option.value ? 'var(--dls-selected-text)' : 'var(--dls-unselected-text)',
                  cursor: 'pointer',
                  fontWeight: appMode === option.value ? 600 : 500,
                  fontSize: 12,
                  transition: 'all 0.2s',
                  boxShadow: appMode === option.value ? 'var(--dls-selected-shadow)' : 'none',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Menu */}
        <Menu
          mode="inline"
          selectedKeys={[currentMenu?.key || '/solo/autopilot']}
          openKeys={openKeys}
          items={soloMenuItemsWithClick}
          onClick={({ key }) => navigate(key)}
          onOpenChange={() => {}} // 由 expandIcon 接管展开收起
          expandIcon={(props: any) => {
            const isOpen = openKeys.includes(props.eventKey);
            return (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenKeys((prev) =>
                    prev.includes(props.eventKey)
                      ? prev.filter((k) => k !== props.eventKey)
                      : [...prev, props.eventKey]
                  );
                }}
                style={{
                  position: 'absolute', right: 16, top: '50%',
                  transform: `translateY(-50%) rotate(${isOpen ? 90 : 0}deg)`,
                  transition: 'transform 0.2s',
                  fontSize: 14, color: 'var(--dls-text-muted)',
                  lineHeight: 1, cursor: 'pointer', userSelect: 'none',
                }}
              >
                ›
              </span>
            );
          }}
          style={{ borderRight: 'none', marginTop: 4, flex: 1 }}
        />

        {/* Energy Mode */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid var(--dls-border)',
            position: 'absolute',
            bottom: 0,
            width: '100%',
            background: 'var(--dls-surface)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--dls-text-secondary)', marginBottom: 6 }}>今日工作模式</div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              background: 'var(--dls-hover)',
              borderRadius: 8,
            }}
          >
            <button
              onClick={() => setEnergyMode('deep')}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: 'none',
                background: energyMode === 'deep' ? 'var(--dls-selected-bg)' : 'transparent',
                color: energyMode === 'deep' ? 'var(--dls-selected-text)' : 'var(--dls-unselected-text)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: energyMode === 'deep' ? 'var(--dls-selected-shadow)' : 'none',
              }}
            >
              🔥 专注
            </button>
            <button
              onClick={() => setEnergyMode('light')}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: 'none',
                background: energyMode === 'light' ? 'var(--dls-selected-bg)' : 'transparent',
                color: energyMode === 'light' ? 'var(--dls-selected-text)' : 'var(--dls-unselected-text)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: energyMode === 'light' ? 'var(--dls-selected-shadow)' : 'none',
              }}
            >
              ☕ 碎片
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--dls-text-secondary)', marginTop: 4, textAlign: 'center' }}>
            {energyMode === 'deep' ? '深度工作时间 · 减少打扰' : '碎片时间 · 处理轻量任务'}
          </div>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: 'var(--dls-surface)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--dls-border)',
            height: 56,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: 'var(--dls-text-muted)',
              fontStyle: 'italic',
              letterSpacing: 2,
              userSelect: 'none',
            }}
          >
            {currentSlogan}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Select
              value={currentProject || undefined}
              onChange={setProject}
              options={soloProductOptions}
              style={{ width: 140 }}
              size="small"
              placeholder="选择或新建产品"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  {soloProductOptions.length > 0 && <Divider style={{ margin: '4px 0' }} />}
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    style={{ width: '100%', textAlign: 'left', color: '#52c41a' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCreateModalOpen(true)}
                  >
                    新建产品
                  </Button>
                </>
              )}
            />
            <Tooltip title="MRR $1,240 · DAU 142">
              <Tag color="green" style={{ cursor: 'default', fontSize: 12 }}>
                MRR $1,240
              </Tag>
            </Tooltip>
            <Tooltip title="当前最新版本：v1.2.3">
              <Tag color="blue" style={{ cursor: 'default', fontSize: 12 }}>
                v1.2.3 生产中
              </Tag>
            </Tooltip>
            <Badge dot>
              <Avatar
                icon={<UserOutlined />}
                style={{ cursor: 'pointer', background: '#52c41a' }}
                size={32}
              />
            </Badge>
          </div>
        </Header>

        <Content style={{ padding: 24, overflow: 'auto', paddingBottom: 80, background: 'var(--dls-app-bg)' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* AI Float Button */}
      <div
        onClick={() => setAiDrawerOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#52c41a',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(82, 196, 26, 0.4)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <RobotOutlined />
      </div>

      {/* AI Virtual Team Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#52c41a' }} />
            <span>AI 虚拟团队</span>
            <Tag color="green" style={{ marginLeft: 4, fontSize: 11 }}>已加载 {displayProductName} 知识库</Tag>
          </div>
        }
        placement="right"
        width={400}
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {aiMessages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#52c41a' : 'var(--dls-chat-assist-bg)',
                  color: msg.role === 'user' ? '#fff' : 'var(--dls-chat-assist-text)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Questions */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--dls-border-light)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['今天先做什么？', '假设验证进展', '用户留存分析'].map((q) => (
            <Tag
              key={q}
              style={{ cursor: 'pointer', borderRadius: 12 }}
              onClick={() => { setAiInput(q); }}
            >
              {q}
            </Tag>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8 }}>
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAiSend(); }}
            placeholder={`问我任何关于 ${displayProductName} 的问题...`}
            style={{
              flex: 1,
              border: '1px solid var(--dls-border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleAiSend}
            style={{
              background: '#52c41a',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <SendOutlined />
          </button>
        </div>
      </Drawer>

      <CreateProductModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        mode="solo"
      />
    </Layout>
  );
};

export default SoloLayout;
