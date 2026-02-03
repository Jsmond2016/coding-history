import React from "react"
import { Layout, Menu } from "antd"
import { useNavigate, useLocation } from "react-router-dom"
import {
  BarChartOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  SettingOutlined,
} from "@ant-design/icons"
import { LayoutProvider } from "../../biz/contexts/LayoutContext"

const { Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(false)

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname.startsWith("/logs")) {
      return "logs"
    }
    if (location.pathname.startsWith("/tasks")) {
      return "tasks"
    }
    if (location.pathname.startsWith("/config")) {
      return "config"
    }
    return "git-statistics"
  }

  const menuItems = [
    {
      key: "git-statistics",
      icon: <BarChartOutlined />,
      label: "Git数据看板",
      onClick: () => navigate("/git-statistics"),
    },
    {
      key: "config",
      icon: <SettingOutlined />,
      label: "配置管理",
      onClick: () => navigate("/config"),
    },
    {
      key: "tasks",
      icon: <ScheduleOutlined />,
      label: "任务管理",
      onClick: () => navigate("/tasks"),
    },
    {
      key: "logs",
      icon: <FileTextOutlined />,
      label: "日志管理",
      onClick: () => navigate("/logs"),
    },
  ]

  return (
    <LayoutProvider collapsed={collapsed} setCollapsed={setCollapsed}>
      <Layout className="h-screen overflow-hidden">
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          className="fixed left-0 top-0 h-screen overflow-auto z-[100]"
        >
          <div className="h-8 m-4 bg-white/20 rounded flex items-center justify-center text-white font-bold">
            {collapsed ? "GH" : "Git History"}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            items={menuItems}
          />
        </Sider>
        <Layout className={"h-screen overflow-hidden"}>
          <Content className="h-full overflow-auto px-3 bg-white">
            {children}
          </Content>
        </Layout>
      </Layout>
    </LayoutProvider>
  )
}

export default AppLayout
