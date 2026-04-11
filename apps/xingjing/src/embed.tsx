/**
 * 星静 React App 嵌入入口
 *
 * 与 main.tsx 的区别：
 * - 使用 MemoryRouter 替代 BrowserRouter，避免与外层 SolidJS 路由（HashRouter）产生冲突
 * - 不调用 ReactDOM.createRoot，而是导出组件，由外层 SolidJS 挂载
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { useAppStore } from './store';
import './styles/global.css';

const XingjingEmbedApp: React.FC = () => {
  const themeMode = useAppStore((s) => s.themeMode);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1264e5',
          borderRadius: 6,
        },
      }}
    >
      {/* initialEntries 设为 /autopilot，与 App.tsx 中默认重定向一致 */}
      <MemoryRouter initialEntries={['/autopilot']}>
        <App />
      </MemoryRouter>
    </ConfigProvider>
  );
};

export default XingjingEmbedApp;
