import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../../services'
import { useAppContext } from '../../contexts/AppContext'
import styles from './Layout.module.css'

interface NavItem {
  key: string
  path: string
  label: string
  icon: React.ReactNode
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
      { key: 'dashboard', path: '/dashboard', label: '实时看板', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )},
      { key: 'spc', path: '/spc', label: 'SPC控制图', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )},
      { key: 'capability', path: '/capability', label: '过程能力', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      )},
      { key: 'prediction', path: '/prediction', label: '指标预测', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      )},
      { key: 'alerts', path: '/alerts', label: '预警中心', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )},
    ],
  },
  {
    title: '数据管理',
    items: [
      { key: 'data', path: '/data', label: '数据管理', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      )},
      { key: 'config', path: '/config', label: '配置管理', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )},
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'help', path: '/help', label: '帮助说明', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )},
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
  const { currentProduct, collectionFrequency } = useAppContext()
  const [clock, setClock] = useState(() => formatTime(new Date()))
  const [alertsCount, setAlertsCount] = useState(0)
  const [sourceStatus, setSourceStatus] = useState<{
    source: string
    connected: boolean
    instrument_type: string
  }>({ source: 'mock', connected: false, instrument_type: 'mock' })

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatTime(new Date()))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchAlertsCount = async () => {
      try {
        const counts = await api.getAlertCount()
        setAlertsCount(counts.total || 0)
      } catch {
        setAlertsCount(0)
      }
    }
    fetchAlertsCount()
    const interval = setInterval(fetchAlertsCount, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await api.getStatus()
        setSourceStatus({
          source: status.source || 'mock',
          connected: status.connected ?? false,
          instrument_type: status.instrument_type || 'mock',
        })
      } catch {
        // keep default
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  const currentPage = pageTitleMap[location.pathname] || { cn: '页面', en: 'Page' }

  // Update alerts badge dynamically
  const navGroupsWithBadge = navGroups.map(group => ({
    ...group,
    items: group.items.map(item => 
      item.key === 'alerts' ? { ...item, badge: alertsCount > 0 ? alertsCount : undefined } : item
    )
  }))

  const getStatusDisplay = () => {
    if (sourceStatus.source === 'mock') {
      return { text: '模拟数据运行中', color: 'blue' as const }
    }
    if (sourceStatus.connected) {
      return { text: '采集服务运行中', color: 'green' as const }
    }
    return { text: '连接异常', color: 'red' as const }
  }
  const statusDisplay = getStatusDisplay()

  return (
    <div className={styles.app}>
      {/* ===== 侧边栏 ===== */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="/favicon.ico" alt="Logo" className={styles.logoIconImg} />
          <div className={styles.logoText}>
            液奶过程监控
            <span className={styles.logoSubTitle}>SPC实时分析平台</span>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navGroupsWithBadge.map((group) => (
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
          <div className={styles.footerStatus}>
            <span className={`${styles.footerDot} ${statusDisplay.color === 'green' ? styles.footerDotGreen : statusDisplay.color === 'blue' ? styles.footerDotBlue : styles.footerDotRed}`} />
            <span className={styles.footerStatusText}>{statusDisplay.text}</span>
          </div>
          <div className={styles.footerPoweredBy}>
            <img src="/icons/powered-by-yili2.svg" alt="Powered by YILI" className={styles.footerPoweredByImg} />
          </div>
          <div className={styles.footerVersion}>
            <span className={styles.footerVersionBadge}>v1.5.1</span>
          </div>
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
              <span className={styles.topbarInfoValue}>{collectionFrequency}</span>
            </div>
            <div className={styles.topbarInfoItem}>
              <span className={styles.topbarInfoLabel}>监测品项:</span>
              <span className={styles.topbarInfoValue}>{currentProduct}</span>
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
