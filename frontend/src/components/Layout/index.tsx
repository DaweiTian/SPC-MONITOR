import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import styles from './Layout.module.css'

interface NavItem {
  key: string
  path: string
  label: string
  icon: string
  badge?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: '监控中心',
    items: [
      { key: 'dashboard', path: '/dashboard', label: '实时看板', icon: '📊' },
      { key: 'spc', path: '/spc', label: 'SPC控制图', icon: '📈' },
      { key: 'capability', path: '/capability', label: '过程能力', icon: '🎯' },
      { key: 'prediction', path: '/prediction', label: '指标预测', icon: '🔮' },
      { key: 'alerts', path: '/alerts', label: '预警中心', icon: '🚨', badge: 3 },
    ],
  },
  {
    title: '数据管理',
    items: [
      { key: 'data', path: '/data', label: '数据管理', icon: '💾' },
      { key: 'config', path: '/config', label: '配置管理', icon: '⚙️' },
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'help', path: '/help', label: '帮助说明', icon: '❓' },
    ],
  },
]

const pageTitleMap: Record<string, { cn: string; en: string }> = {
  '/dashboard': { cn: '实时看板', en: 'Dashboard' },
  '/spc': { cn: 'SPC控制图', en: 'SPC Control Chart' },
  '/capability': { cn: '过程能力', en: 'Process Capability' },
  '/prediction': { cn: '指标预测', en: 'Prediction' },
  '/alerts': { cn: '预警中心', en: 'Alert Center' },
  '/data': { cn: '数据管理', en: 'Data Management' },
  '/config': { cn: '配置管理', en: 'Configuration' },
  '/help': { cn: '帮助说明', en: 'Help' },
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [clock, setClock] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatTime(new Date()))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const currentPage = pageTitleMap[location.pathname] || { cn: '页面', en: 'Page' }

  return (
    <div className={styles.app}>
      {/* ===== 侧边栏 ===== */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>S</div>
          <div className={styles.logoText}>
            液奶过程监控
            <span className={styles.logoSubTitle}>SPC实时分析平台</span>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navGroups.map((group) => (
            <React.Fragment key={group.title}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <button
                    key={item.key}
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {item.label}
                    {item.badge ? (
                      <span className={styles.navBadge}>{item.badge}</span>
                    ) : null}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div>
            <span className={styles.statusDot} />
            采集服务运行中
          </div>
          <div className={styles.footerSub}>FT1 连接正常 · v1.0.0</div>
        </div>
      </aside>

      {/* ===== 主区域 ===== */}
      <div className={styles.main}>
        {/* 顶部栏 */}
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            {currentPage.cn}{' '}
            <span className={styles.topbarTitleSub}>{currentPage.en}</span>
          </div>
          <div className={styles.topbarSpacer} />
          <div className={styles.topbarInfo}>
            <div className={styles.topbarInfoItem}>
              <span className={styles.topbarInfoLabel}>采集频率:</span>
              <span className={styles.topbarInfoValue}>L0 · 5min</span>
            </div>
            <div className={styles.topbarInfoItem}>
              <span className={styles.topbarInfoLabel}>监测品项:</span>
              <span className={styles.topbarInfoValue}>砖纯牛奶</span>
            </div>
            <div className={styles.topbarStatus}>
              <span className={styles.topbarDot} /> 系统正常
            </div>
            <div className={styles.topbarClock}>{clock}</div>
          </div>
        </header>

        {/* 内容区 */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
