import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { api, setSessionToken } from '../services/api'

interface Permissions {
  isLocal: boolean
  restrictedModules: string[]
  passwordRequired: boolean
}

/** loading: 首次拉取中；error: 后端未就绪/请求失败（非「已启用密码」）；ready: 后端已返回真实权限 */
type PermissionsStatus = 'loading' | 'error' | 'ready'

interface AppState {
  currentProduct: string
  currentProductCode: string
  collectionFrequency: string
  permissions: Permissions
  permissionsStatus: PermissionsStatus
  /** 连续拉取失败次数（ready 后保持 0） */
  permissionsFailures: number
  isAuthenticated: boolean
  canAccess: (moduleKey: string) => boolean
  verifyPassword: (password: string) => Promise<boolean>
  refreshPermissions: () => Promise<void>
  setCurrentProduct: (name: string, code: string) => void
  setCollectionFrequency: (freq: string) => void
}

const AppContext = createContext<AppState | null>(null)

function isTauriEnv(): boolean {
  return '__TAURI__' in window
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentProduct, setCurrentProductState] = useState(() => {
    try { return localStorage.getItem('app_current_product') || '自动轮换' } catch { return '自动轮换' }
  })
  const [currentProductCode, setCurrentProductCode] = useState(() => {
    try { return localStorage.getItem('app_current_product_code') || '' } catch { return '' }
  })
  const [collectionFrequency, setCollectionFrequencyState] = useState(() => {
    try { return localStorage.getItem('app_collection_frequency') || 'L0 · 5min' } catch { return 'L0 · 5min' }
  })
  // 乐观本地态：桌面首启时权限尚未返回，先不锁 UI；成功拉取后以服务端为准
  const [permissions, setPermissions] = useState<Permissions>({ isLocal: true, restrictedModules: [], passwordRequired: false })
  const [permissionsStatus, setPermissionsStatus] = useState<PermissionsStatus>('loading')
  const [permissionsFailures, setPermissionsFailures] = useState(0)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try { return sessionStorage.getItem('ft1_authenticated') === 'true' } catch { return false }
  })
  const fetchingRef = useRef(false)
  const pendingRetryRef = useRef(false)

  const applyPermissions = useCallback((data: {
    isLocal: boolean
    restrictedModules?: string[]
    passwordRequired: boolean
  }) => {
    setPermissions({
      isLocal: data.isLocal,
      restrictedModules: data.restrictedModules ?? [],
      passwordRequired: data.passwordRequired,
    })
    setPermissionsStatus('ready')
    setPermissionsFailures(0)
    // 本地或未设密码：自动通过验证
    if (data.isLocal || !data.passwordRequired) {
      setIsAuthenticated(true)
      try { sessionStorage.setItem('ft1_authenticated', 'true') } catch { /* ignore */ }
    }
  }, [])

  const fetchPermissions = useCallback(async () => {
    if (fetchingRef.current) {
      // 请求进行中收到就绪信号：结束后补拉一次，避免信号丢失
      pendingRetryRef.current = true
      return
    }
    fetchingRef.current = true
    try {
      const data = await api.getPermissions()
      applyPermissions(data)
      const urlParams = new URLSearchParams(window.location.search)
      const authFromUrl = urlParams.get('auth')
      if (authFromUrl && data.passwordRequired && !data.isLocal) {
        const result = await api.verifyPassword(authFromUrl)
        if (result.success) {
          if (result.token) setSessionToken(result.token)
          setIsAuthenticated(true)
          try { sessionStorage.setItem('ft1_authenticated', 'true') } catch { /* ignore */ }
        }
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('auth')
        window.history.replaceState({}, '', newUrl.toString())
      }
    } catch {
      // 后端未就绪 ≠ 已启用共享密码。保持 loading/error，由轮询/backend-ready 纠正
      setPermissionsStatus(prev => (prev === 'ready' ? 'ready' : 'error'))
      setPermissionsFailures(c => (c >= 1000 ? c : c + 1))
    } finally {
      fetchingRef.current = false
      if (pendingRetryRef.current) {
        pendingRetryRef.current = false
        window.setTimeout(() => { void fetchPermissions() }, 50)
      }
    }
  }, [applyPermissions])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // 后端就绪信号：Tauri backend-ready 或 splash 自定义事件 → 立即重拉权限
  useEffect(() => {
    const onReady = () => { void fetchPermissions() }
    window.addEventListener('ft1-backend-ready', onReady)

    const unlistenPromise = isTauriEnv()
      ? window.__TAURI__.event.listen('backend-ready', onReady).catch(() => null)
      : Promise.resolve(null)

    return () => {
      window.removeEventListener('ft1-backend-ready', onReady)
      unlistenPromise.then((fn) => { fn?.() }).catch(() => { /* ignore */ })
    }
  }, [fetchPermissions])

  // 未就绪时持续轮询，避免首启竞态把用户锁在密码框
  useEffect(() => {
    if (permissionsStatus === 'ready') return
    const id = window.setInterval(() => { void fetchPermissions() }, 3000)
    return () => window.clearInterval(id)
  }, [permissionsStatus, fetchPermissions])

  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      const result = await api.verifyPassword(password)
      if (result.success) {
        if (result.token) setSessionToken(result.token)
        setIsAuthenticated(true)
        try { sessionStorage.setItem('ft1_authenticated', 'true') } catch { /* ignore */ }
        await fetchPermissions()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [fetchPermissions])

  const canAccess = useCallback((moduleKey: string) => {
    if (permissions.isLocal) return true
    return !permissions.restrictedModules.includes(moduleKey)
  }, [permissions])

  const setCurrentProduct = useCallback((name: string, code: string) => {
    setCurrentProductState(name)
    setCurrentProductCode(code)
    localStorage.setItem('app_current_product', name)
    localStorage.setItem('app_current_product_code', code)
  }, [])

  const setCollectionFrequency = useCallback((freq: string) => {
    setCollectionFrequencyState(freq)
    localStorage.setItem('app_collection_frequency', freq)
  }, [])

  const value = useMemo(() => ({
    currentProduct,
    currentProductCode,
    collectionFrequency,
    permissions,
    permissionsStatus,
    permissionsFailures,
    isAuthenticated,
    canAccess,
    verifyPassword,
    refreshPermissions: fetchPermissions,
    setCurrentProduct,
    setCollectionFrequency,
  }), [currentProduct, currentProductCode, collectionFrequency, permissions, permissionsStatus, permissionsFailures, isAuthenticated, canAccess, verifyPassword, fetchPermissions, setCurrentProduct, setCollectionFrequency])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}
