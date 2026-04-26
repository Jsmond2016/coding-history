import React from "react"
import { Layout, Menu } from "antd"
import { useNavigate, useLocation } from "react-router-dom"
import {
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  SettingOutlined,
} from "@ant-design/icons"
import { LayoutProvider } from "../../biz/contexts/LayoutContext"

const { Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

const menuRouteKeys = [
  { key: "data-overview", path: "/data-overview" },
  { key: "git-statistics", path: "/git-statistics" },
  { key: "config", path: "/config" },
  { key: "tasks", path: "/tasks" },
  { key: "logs", path: "/logs" },
] as const

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = React.useState(false)

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    return (
      menuRouteKeys.find((item) => location.pathname.startsWith(item.path))
        ?.key ?? "data-overview"
    )
  }

  const menuItems = [
    {
      key: "data-overview",
      icon: <DashboardOutlined />,
      label: "数据总览",
      onClick: () => navigate("/data-overview"),
    },
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
      <Layout className="h-screen min-h-0 overflow-hidden" style={{ minHeight: '100vh', maxHeight: '100%' }}>
        {/*
          不要用 position:fixed 的 Sider 再叠一层 marginLeft：
          antd 的 Sider 在横向 Layout 里仍会参与 flex 占位，会与 margin 叠加成「侧栏 + 大缝」。
          常规 flex 分栏即可：左侧固定宽度，右侧 flex-1 铺满剩余区域。
        */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          collapsedWidth={80}
          theme="dark"
          className="h-screen overflow-auto"
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
        <Layout className="min-h-0 min-w-0 flex-1 overflow-hidden" style={{ minHeight: 0, flex: 1 }}>
          <Content className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-auto bg-white" style={{ height: '100%', minHeight: 0, flex: 1 }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </LayoutProvider>
  )
}

export default AppLayout
