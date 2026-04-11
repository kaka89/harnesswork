import React, { useState, useEffect } from 'react';
import { Layout, Menu, Select, Avatar, Dropdown, Segmented, Button, Divider } from 'antd';
import {
  FileTextOutlined,
  DeploymentUnitOutlined,
  CodeOutlined,
  FieldTimeOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
  BookOutlined,
  UserOutlined,
  RobotOutlined,
  FundProjectionScreenOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  SettingOutlined,
  PlusOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore, Role } from '../../store';
import CreateProductModal from '../common/CreateProductModal';

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: '/autopilot-group',
    icon: <ThunderboltOutlined />,
    label: '自动驾驶',
    children: [
      { key: '/autopilot',     icon: <ThunderboltOutlined />,         label: '驾驶舱' },
      { key: '/planning',      icon: <FundProjectionScreenOutlined />, label: '产品规划工坊' },
      { key: '/requirements',  icon: <FileTextOutlined />,            label: '需求工坊' },
      { key: '/design',        icon: <DeploymentUnitOutlined />,      label: '设计工坊' },
      { key: '/dev',           icon: <CodeOutlined />,                label: '开发工坊' },
      { key: '/sprint',        icon: <FieldTimeOutlined />,           label: '迭代中心' },
      { key: '/quality',       icon: <SafetyCertificateOutlined />,   label: '质量中心' },
      { key: '/release-ops',   icon: <CloudServerOutlined />,         label: '发布与运维' },
      { key: '/dashboard',     icon: <DashboardOutlined />,           label: '效能驾驶舱' },
      { key: '/knowledge',     icon: <BookOutlined />,                label: '知识中心' },
    ],
  },
  { key: '/agent-workshop', icon: <TeamOutlined />, label: 'AI搭档' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

const findMenu = (items: any[], path: string): any => {
  for (const item of items) {
    if (item.key !== '/autopilot-group' && path.startsWith(item.key)) return item;
    if (item.children) {
      const found = findMenu(item.children, path);
      if (found) return found;
    }
  }
  return null;
};

const slogans = [
  '复命曰常，知常曰明',
  '道可道，非常道',
  '为学日益，为道日损',
  '归根曰静，是谓复命',
  '夫物芸芸，各复归其根',
  '万物并作，吾以观其复',
];

const roleOptions: { value: Role; label: string }[] = [
  { value: 'pm', label: '产品经理' },
  { value: 'architect', label: '架构师' },
  { value: 'developer', label: '开发人员' },
  { value: 'qa', label: 'QA' },
  { value: 'sre', label: 'SRE' },
  { value: 'manager', label: '管理层' },
];

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentRole, currentProject, currentUser, appMode, products, setRole, setProject, setAiPanelOpen, setAppMode } = useAppStore();
  const [openKeys, setOpenKeys] = useState<string[]>(['/autopilot-group']);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [currentSlogan, setCurrentSlogan] = useState(
    () => slogans[Math.floor(Math.random() * slogans.length)]
  );

  // 每 10 秒随机切换一条名言
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlogan((prev) => {
        const rest = slogans.filter((s) => s !== prev);
        return rest[Math.floor(Math.random() * rest.length)];
      });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // 确保在团队版 Layout 时 appMode 正确
  useEffect(() => {
    if (appMode !== 'team') {
      setAppMode('team');
    }
  }, []);

  const teamProducts = products.filter((p) => p.mode === 'team');
  const projectOptions = teamProducts.map((p) => ({ value: p.name, label: p.name }));

  const currentMenu = findMenu(menuItems, location.pathname);

  // 与独立版保持一致：onTitleClick 导航，expandIcon 控制展开收起
  const menuItemsWithClick = [
    {
      ...menuItems[0],
      onTitleClick: () => { navigate('/autopilot'); },
    },
    ...menuItems.slice(1),
  ];

  const handleModeSwitch = (v: string | number) => {
    if (v === 'solo') {
      setAppMode('solo');
      navigate('/solo/autopilot');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        width={200}
        style={{
          borderRight: '1px solid var(--dls-border)',
          background: 'var(--dls-surface)',
        }}
      >
        {/* Logo & Branding */}
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
            background: 'var(--dls-surface)',
          }}
          onClick={() => navigate('/')}
        >
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--purple-9)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RobotOutlined />
            星静
          </div>
          <div style={{ fontSize: 10, color: 'var(--dls-text-muted)', lineHeight: 1 }}>复命曰常，知常曰明</div>
        </div>

        {/* Mode Switcher - DLS Ch.09 Track pattern */}
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
                onClick={() => {
                  if (option.value === 'solo') {
                    setAppMode('solo');
                    navigate('/solo/autopilot');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: appMode === option.value ? 'white' : 'transparent',
                  color: appMode === option.value ? 'var(--dls-text-primary)' : 'var(--dls-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: appMode === option.value ? 600 : 500,
                  fontSize: 12,
                  transition: 'all 0.2s',
                  boxShadow: appMode === option.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation Menu - 与独立版保持一致，使用 Ant Design Menu */}
        <Menu
          mode="inline"
          selectedKeys={[currentMenu?.key || '/autopilot']}
          openKeys={openKeys}
          items={menuItemsWithClick}
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
                      ? prev.filter((k: string) => k !== props.eventKey)
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
          style={{ borderRight: 'none', marginTop: 4 }}
        />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Select
              value={currentProject || undefined}
              onChange={setProject}
              options={projectOptions}
              style={{ width: 140 }}
              size="small"
              placeholder="选择或新建产品"
              dropdownRender={(menu) => (
                <>
                  {menu}
                  {projectOptions.length > 0 && <Divider style={{ margin: '4px 0' }} />}
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    style={{ width: '100%', textAlign: 'left', color: 'var(--purple-9)' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCreateModalOpen(true)}
                  >
                    新建产品
                  </Button>
                </>
              )}
            />
            <Select
              value={currentRole}
              onChange={setRole}
              options={roleOptions}
              style={{ width: 120 }}
              size="small"
            />
            <Dropdown
              menu={{
                items: [{ key: 'profile', label: currentUser }],
              }}
            >
              <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer', background: 'var(--purple-9)' }} />
            </Dropdown>
          </div>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto', background: 'var(--dls-app-bg)' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* AI floating button - DLS inspired */}
      <div
        onClick={() => setAiPanelOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--purple-9)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <RobotOutlined />
      </div>

      <CreateProductModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        mode="team"
      />
    </Layout>
  );
};

export default MainLayout;
