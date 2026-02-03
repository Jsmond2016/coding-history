import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChartOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { LayoutProvider } from '../../biz/contexts/LayoutContext';

const { Sider, Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname.startsWith('/logs')) {
      return 'logs';
    }
    if (location.pathname.startsWith('/tasks')) {
      return 'tasks';
    }
    if (location.pathname.startsWith('/config')) {
      return 'config';
    }
    return 'git-statistics';
  };

  const menuItems = [
    {
      key: 'git-statistics',
      icon: <BarChartOutlined />,
      label: 'Git数据看板',
      onClick: () => navigate('/git-statistics')
    },
    {
      key: 'config',
      icon: <SettingOutlined />,
      label: '配置管理',
      onClick: () => navigate('/config')
    },
    {
      key: 'tasks',
      icon: <ScheduleOutlined />,
      label: '任务管理',
      onClick: () => navigate('/tasks')
    },
    {
      key: 'logs',
      icon: <FileTextOutlined />,
      label: '日志管理',
      onClick: () => navigate('/logs')
    }
  ];

  return (
    <LayoutProvider collapsed={collapsed} setCollapsed={setCollapsed}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0
          }}
        >
          <div style={{ 
            height: 32, 
            margin: 16, 
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold'
          }}>
            {collapsed ? 'GH' : 'Git History'}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ marginLeft: collapsed ? 80 : 200 }}>
          <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </LayoutProvider>
  );
};

export default AppLayout;

