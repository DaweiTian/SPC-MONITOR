import React from 'react'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  LineChartOutlined,
  AreaChartOutlined,
  AlertOutlined,
  SettingOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: '实时看板',
  },
  {
    key: '/spc',
    icon: <LineChartOutlined />,
    label: 'SPC 控制图',
  },
  {
    key: '/capability',
    icon: <AreaChartOutlined />,
    label: '过程能力',
  },
  {
    key: '/alerts',
    icon: <AlertOutlined />,
    label: '预警列表',
  },
  {
    key: '/data',
    icon: <DatabaseOutlined />,
    label: '数据管理',
  },
  {
    key: '/config',
    icon: <SettingOutlined />,
    label: '配置管理',
  },
  {
    key: '/help',
    icon: <QuestionCircleOutlined />,
    label: '帮助说明',
  },
]

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: 'linear-gradient(90deg, var(--primary-dark), var(--primary))',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
          液奶过程监控系统
        </div>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: 'var(--bg-card)' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: 'var(--bg-page)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
