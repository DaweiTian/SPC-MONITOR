import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, websocketService } from '../../services'
import { useAppContext } from '../../contexts/AppContext'
import { useToast } from '../Toast'
import { ChangelogDialog, getVersionHighlights } from '../ChangelogDialog'
import { AvailableUpdateDialog } from '../AvailableUpdateDialog'
import styles from './Layout.module.css'

interface UpdateInfo {
  version: string
  notes: string | null
  isIncremental?: boolean
  downloadSize?: number | null
}

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
      { key: 'devices', path: '/devices', label: '其他设备', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
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
      { key: 'network', path: '/settings', label: '网络设置', icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
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

const APP_VERSION = `v${__APP_VERSION__}`
// 从 CHANGELOG 当前版本自动截取，升版后无需再改硬编码文案
const VERSION_HIGHLIGHTS = getVersionHighlights(__APP_VERSION__)

const pageTitleMap: Record<string, { cn: string; en: string }> = {
  '/dashboard': { cn: '实时看板', en: 'Dashboard' },
  '/spc': { cn: 'SPC控制图', en: 'SPC Control Chart' },
  '/capability': { cn: '过程能力', en: 'Process Capability' },
  '/prediction': { cn: '指标预测', en: 'Prediction' },
  '/devices': { cn: '其他设备', en: 'Other Devices' },
  '/alerts': { cn: '预警中心', en: 'Alert Center' },
  '/correction': { cn: '修正值管理', en: 'Correction Values' },
  '/data': { cn: '数据管理', en: 'Data Management' },
  '/config': { cn: '配置管理', en: 'Configuration' },
  '/settings': { cn: '网络设置', en: 'Network Settings' },
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
  const { currentProduct, collectionFrequency, canAccess, refreshPermissions } = useAppContext()
  const { addToast } = useToast()
  const [clock, setClock] = useState(() => formatTime(new Date()))
  const [alertsCount, setAlertsCount] = useState(0)
  const [versionMenu, setVersionMenu] = useState<{ x: number; y: number } | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const checkingUpdateRef = useRef(false)
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const downloadingUpdateRef = useRef(false)
  const versionAreaRef = useRef<HTMLSpanElement>(null)
  const versionMenuRef = useRef<HTMLDivElement>(null)
  const openVersionMenuRef = useRef<(x: number, y: number) => void>(() => {})

  useEffect(() => {
    openVersionMenuRef.current = (clientX: number, clientY: number) => {
      // 先按估算值放置，渲染后 useLayoutEffect 按实测尺寸再夹紧
      const menuWidth = 180
      const menuHeight = 88
      const x = Math.min(Math.max(clientX, 8), window.innerWidth - menuWidth - 8)
      const y = Math.min(Math.max(clientY, 8), window.innerHeight - menuHeight - 8)
      setVersionMenu({ x, y })
    }
  }, [])

  useLayoutEffect(() => {
    const menu = versionMenuRef.current
    if (!versionMenu || !menu) return
    const rect = menu.getBoundingClientRect()
    let { x, y } = versionMenu
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    if (x !== versionMenu.x || y !== versionMenu.y) setVersionMenu({ x, y })
  }, [versionMenu])
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

  const openVersionMenu = (clientX: number, clientY: number) => {
    openVersionMenuRef.current(clientX, clientY)
  }

  useEffect(() => {
    const el = versionAreaRef.current
    if (!el) return
    // 原生监听 + capture，确保拦截浏览器右键菜单（React 合成事件在部分 WebView 下不可靠）
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      openVersionMenuRef.current(e.clientX, e.clientY)
    }
    el.addEventListener('contextmenu', onContextMenu, true)
    return () => el.removeEventListener('contextmenu', onContextMenu, true)
  }, [])

  useEffect(() => {
    if (!versionMenu) return
    const close = () => setVersionMenu(null)
    const onScroll = () => setVersionMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVersionMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [versionMenu])

  const handleVersionClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    openVersionMenu(rect.left + rect.width / 2 - 84, rect.top - 96)
  }

  const handleCheckUpdate = async () => {
    if (checkingUpdateRef.current) return
    if (!window.__TAURI__) {
      addToast({ title: '检查更新', message: '在线更新仅桌面客户端支持', severity: 'INFO' })
      return
    }
    checkingUpdateRef.current = true
    setCheckingUpdate(true)
    try {
      const info = (await window.__TAURI__.core.invoke('check_for_update')) as UpdateInfo | null
      if (!info) {
        addToast({
          title: '检查更新',
          message: `当前已是最新版本 ${APP_VERSION}`,
          severity: 'INFO',
        })
        return
      }
      // 弹窗确认是否下载，不直接开下
      setAvailableUpdate(info)
    } catch (e) {
      addToast({
        title: '检查更新失败',
        message: typeof e === 'string' ? e : '无法连接更新服务器，请检查网络',
        severity: 'WARNING',
      })
    } finally {
      checkingUpdateRef.current = false
      setCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    if (!window.__TAURI__ || !availableUpdate || downloadingUpdateRef.current) return
    downloadingUpdateRef.current = true
    setDownloadingUpdate(true)
    try {
      const downloaded = (await window.__TAURI__.core.invoke('download_update', {
        expectedVersion: availableUpdate.version,
      })) as UpdateInfo
      setAvailableUpdate(null)
      // 交给全局 UpdateDialog 提示安装
      await window.__TAURI__.event.emit('update-ready', downloaded)
    } catch (e) {
      addToast({
        title: '下载更新失败',
        message: typeof e === 'string' ? e : '下载中断，请稍后重试',
        severity: 'WARNING',
      })
    } finally {
      downloadingUpdateRef.current = false
      setDownloadingUpdate(false)
    }
  }

  // 后台静默下载完成时，关掉手动确认弹窗，避免与安装弹窗叠层
  useEffect(() => {
    if (!window.__TAURI__) return
    const unlisten = window.__TAURI__.event.listen('update-ready', () => {
      setAvailableUpdate(null)
    })
    return () => { unlisten.then(fn => fn()).catch(() => {}) }
  }, [])

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
        // 后端恢复时自动重连 WebSocket，并刷新权限（应对密码开关/本机判定变化）
        if (!prevReachable) {
          websocketService.reconnect()
          void refreshPermissions()
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

  // Update alerts badge dynamically & filter by permissions
  const navGroupsWithBadge = navGroups.map(group => ({
    ...group,
    items: group.items.map(item =>
      item.key === 'alerts' ? { ...item, badge: alertsCount > 0 ? alertsCount : undefined } : item
    )
  }))

  // 远程用户隐藏受限模块
  const filteredNavGroups = navGroupsWithBadge
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccess(item.key)),
    }))
    .filter(group => group.items.length > 0)

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
          {filteredNavGroups.map((group) => (
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
          <span
            ref={versionAreaRef}
            className={styles.footerVersionBadge}
            role="button"
            tabIndex={0}
            title="检查更新 / 更新日志"
            onClick={handleVersionClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                openVersionMenu(rect.left + rect.width / 2 - 84, rect.top - 96)
              }
            }}
          >
            {APP_VERSION}
            <div className={styles.versionTooltip}>
              <div className={styles.versionTooltipTitle}>
                <span className={styles.versionTooltipTitleDot} />
                {APP_VERSION}
              </div>
              <ul className={styles.versionTooltipList}>
                {(VERSION_HIGHLIGHTS.length > 0
                  ? VERSION_HIGHLIGHTS
                  : ['修复已知问题，提升稳定性']
                ).map((item) => (
                  <li key={item} className={styles.versionTooltipItem}>{item}</li>
                ))}
              </ul>
            </div>
          </span>
          <div className={styles.footerPoweredBy}>
            <img src="./icons/powered-by-yili2.svg" alt="Powered by YILI" className={styles.footerPoweredByImg} />
          </div>
        </div>
      </aside>

      {versionMenu && (
        <div
          ref={versionMenuRef}
          className={styles.versionContextMenu}
          style={{ left: versionMenu.x, top: versionMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.versionMenuItem}
            disabled={checkingUpdate}
            onClick={() => {
              setVersionMenu(null)
              void handleCheckUpdate()
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {checkingUpdate ? '正在检查…' : '检查更新'}
          </button>
          <button
            className={styles.versionMenuItem}
            onClick={() => {
              setVersionMenu(null)
              setChangelogOpen(true)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            更新日志
          </button>
        </div>
      )}

      <ChangelogDialog
        open={changelogOpen}
        currentVersion={APP_VERSION}
        onClose={() => setChangelogOpen(false)}
      />

      {availableUpdate && (
        <AvailableUpdateDialog
          info={availableUpdate}
          downloading={downloadingUpdate}
          onCancel={() => {
            if (downloadingUpdate) return
            setAvailableUpdate(null)
          }}
          onDownload={() => { void handleDownloadUpdate() }}
        />
      )}

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
