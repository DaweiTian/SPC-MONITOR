import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, websocketService } from '../../services'
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
      { key: 'correction', path: '/correction', label: '修正值管理', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )},
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

const APP_VERSION = 'v1.6.1'

const pageTitleMap: Record<string, { cn: string; en: string }> = {
  '/dashboard': { cn: '实时看板', en: 'Dashboard' },
  '/spc': { cn: 'SPC控制图', en: 'SPC Control Chart' },
  '/capability': { cn: '过程能力', en: 'Process Capability' },
  '/prediction': { cn: '指标预测', en: 'Prediction' },
  '/alerts': { cn: '预警中心', en: 'Alert Center' },
  '/correction': { cn: '修正值管理', en: 'Correction Values' },
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('sidebar-collapsed', String(next))
      } catch { /* ignore */ }
      return next
    })
  }
  const isTauri = !!window.__TAURI__
  const [sourceStatus, setSourceStatus] = useState<{
    source: string
    connected: boolean
    instrument_type: string
    backendReachable: boolean
  }>({ source: 'mock', connected: false, instrument_type: 'mock', backendReachable: false })

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
    const interval = setInterval(fetchAlertsCount, 30000)
    // Listen for immediate updates from Alerts page
    const onAlertsUpdated = () => fetchAlertsCount()
    window.addEventListener('alerts-updated', onAlertsUpdated)
    return () => {
      clearInterval(interval)
      window.removeEventListener('alerts-updated', onAlertsUpdated)
    }
  }, [])

  useEffect(() => {
    let prevReachable = false
    const fetchStatus = async () => {
      try {
        // Check if backend is reachable (CSP allows http://127.0.0.1:18080)
        const isTauri = !!window.__TAURI__
        const healthUrl = isTauri ? 'http://127.0.0.1:18080/api/health' : '/api/health'
        const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
        if (!resp.ok) throw new Error('unhealthy')

        const status = await api.getStatus()
        setSourceStatus({
          source: status.source || 'mock',
          connected: status.connected ?? false,
          instrument_type: status.instrument_type || 'mock',
          backendReachable: true,
        })
        // 后端恢复时自动重连 WebSocket
        if (!prevReachable) {
          websocketService.reconnect()
        }
        prevReachable = true
      } catch {
        setSourceStatus(prev => ({ ...prev, backendReachable: false, connected: false }))
        prevReachable = false
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
    if (!sourceStatus.backendReachable) {
      return { text: '后端未连接', color: 'red' as const }
    }
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
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <button
          className={styles.sidebarToggleBtn}
          onClick={toggleCollapsed}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <polyline points="4 2 8 6 4 10" /> : <polyline points="8 2 4 6 8 10" />}
          </svg>
        </button>
        <div className={styles.sidebarLogo}>
          <img src="./favicon.ico" alt="Logo" className={styles.logoIconImg} />
          <div className={styles.logoText}>
            液奶过程监控
            <span className={styles.logoSubTitle}>SPC实时分析平台</span>
          </div>
        </div>
        <nav className={styles.sidebarNav} role="navigation" aria-label="主导航">
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
                    data-label={item.label}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navItemText}>{item.label}</span>
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
          <span className={styles.footerVersionBadge}>
            {APP_VERSION}
            <div className={styles.versionTooltip}>
              <div className={styles.versionTooltipTitle}>
                <span className={styles.versionTooltipTitleDot} />
                {APP_VERSION} 更新日志
              </div>
              <ul className={styles.versionTooltipList}>
                <li className={styles.versionTooltipItem}>EWMA控制图：指数加权移动平均，λ可调(0.05~0.5)，检测小偏移</li>
                <li className={styles.versionTooltipItem}>Mann-Kendall趋势检验：非参数检验+Sen斜率，集成自动选模型</li>
                <li className={styles.versionTooltipItem}>预测页面新增趋势分析KPI卡片（方向/p值/斜率）</li>
                <li className={styles.versionTooltipItem}>EWMA越界点表替换Nelson规则表，显示越界详情</li>
                <li className={styles.versionTooltipItem}>修复EWMA/I-MR切换崩溃、λ滑块刷屏、趋势数据空白等问题</li>
              </ul>
            </div>
          </span>
          <div className={styles.footerPoweredBy}>
            <img src="./icons/powered-by-yili2.svg" alt="Powered by YILI" className={styles.footerPoweredByImg} />
          </div>
        </div>
      </aside>

      {/* ===== 主区域 ===== */}
      <div className={styles.main} role="main">
        {/* 顶部栏 */}
        <header className={styles.topbar} data-tauri-drag-region>
          <div className={styles.topbarTitle} data-tauri-drag-region>
            {currentPage.cn}{' '}
            <span className={styles.topbarTitleSub} data-tauri-drag-region>{currentPage.en}</span>
          </div>
          <div className={styles.topbarSpacer} data-tauri-drag-region />
          <div className={styles.topbarInfo} data-tauri-drag-region>
            <div className={styles.topbarInfoItem} data-tauri-drag-region>
              <span className={styles.topbarInfoLabel} data-tauri-drag-region>采集频率:</span>
              <span className={styles.topbarInfoValue} data-tauri-drag-region>{sourceStatus.backendReachable ? (collectionFrequency || '获取中...') : '未连接'}</span>
            </div>
            <div className={styles.topbarInfoItem} data-tauri-drag-region>
              <span className={styles.topbarInfoLabel} data-tauri-drag-region>监测品项:</span>
              <span className={styles.topbarInfoValue} data-tauri-drag-region>{sourceStatus.backendReachable ? (currentProduct || '获取中...') : '未连接'}</span>
            </div>
            <div className={styles.topbarStatus} style={{ color: statusDisplay.color === 'green' ? '#10b981' : statusDisplay.color === 'blue' ? '#3b82f6' : '#ef4444' }} data-tauri-drag-region>
              <span className={styles.topbarDot} style={{ background: statusDisplay.color === 'green' ? '#10b981' : statusDisplay.color === 'blue' ? '#3b82f6' : '#ef4444' }} data-tauri-drag-region /> {statusDisplay.text}
            </div>
            <div className={styles.topbarClock} data-tauri-drag-region>{clock}</div>
          </div>
          {isTauri && (
          <div className={styles.topbarControls}>
            <button className={styles.topbarBtn} onClick={() => window.__TAURI__?.window?.Window?.getCurrent()?.minimize()} title="最小化">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect y="5" width="12" height="2" rx="1" fill="currentColor"/></svg>
            </button>
            <button className={styles.topbarBtn} onClick={() => window.__TAURI__?.window?.Window?.getCurrent()?.toggleMaximize()} title="最大化">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button className={`${styles.topbarBtn} ${styles.topbarBtnClose}`} onClick={() => window.__TAURI__?.window?.Window?.getCurrent()?.close()} title="关闭">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          )}
        </header>

        {/* 内容区 */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
