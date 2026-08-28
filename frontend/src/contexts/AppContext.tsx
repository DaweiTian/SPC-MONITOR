import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { api } from '../services/api'

interface Permissions {
  isLocal: boolean
  restrictedModules: string[]
  passwordRequired: boolean
}

interface AppState {
  currentProduct: string
  currentProductCode: string
  collectionFrequency: string
  permissions: Permissions
  isAuthenticated: boolean
  canAccess: (moduleKey: string) => boolean
  verifyPassword: (password: string) => Promise<boolean>
  setCurrentProduct: (name: string, code: string) => void
  setCollectionFrequency: (freq: string) => void
}

const AppContext = createContext<AppState | null>(null)

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
  const [permissions, setPermissions] = useState<Permissions>({ isLocal: true, restrictedModules: [], passwordRequired: false })
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // 本地访问无需密码验证
    try { return sessionStorage.getItem('ft1_authenticated') === 'true' } catch { return false }
  })

  const fetchPermissions = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const authFromUrl = urlParams.get('auth')

    try {
      const data = await api.getPermissions()
      setPermissions({
        isLocal: data.isLocal,
        restrictedModules: data.restrictedModules ?? [],
        passwordRequired: data.passwordRequired,
      })
      // 本地访问自动通过验证
      if (data.isLocal || !data.passwordRequired) {
        setIsAuthenticated(true)
        sessionStorage.setItem('ft1_authenticated', 'true')
      } else if (authFromUrl) {
        // 如果 URL 中有密码，自动验证
        const result = await api.verifyPassword(authFromUrl)
        if (result.success) {
          setIsAuthenticated(true)
          sessionStorage.setItem('ft1_authenticated', 'true')
        }
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('auth')
        window.history.replaceState({}, '', newUrl.toString())
      }
    } catch {
      // 后端未就绪时重试（最多 3 次，间隔 2 秒）
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const data = await api.getPermissions()
          setPermissions({
            isLocal: data.isLocal,
            restrictedModules: data.restrictedModules ?? [],
            passwordRequired: data.passwordRequired,
          })
          if (data.isLocal || !data.passwordRequired) {
            setIsAuthenticated(true)
            sessionStorage.setItem('ft1_authenticated', 'true')
          }
          return
        } catch { /* 继续重试 */ }
      }
      // 全部重试失败：保持限制性状态，要求密码以确保安全
      setPermissions({ isLocal: false, restrictedModules: ['correction', 'data', 'config', 'network', 'devices'], passwordRequired: true })
    }
  }, [])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      const result = await api.verifyPassword(password)
      if (result.success) {
        setIsAuthenticated(true)
        sessionStorage.setItem('ft1_authenticated', 'true')
        // 重新获取权限（修正首次启动时的误判）
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
    isAuthenticated,
    canAccess,
    verifyPassword,
    setCurrentProduct,
    setCollectionFrequency,
  }), [currentProduct, currentProductCode, collectionFrequency, permissions, isAuthenticated, canAccess, verifyPassword, setCurrentProduct, setCollectionFrequency])

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
