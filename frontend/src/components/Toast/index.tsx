import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import styles from './Toast.module.css'

export interface ToastItem {
  id: string
  title: string
  message: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  duration?: number
  onClick?: () => void
}

interface ToastContextType {
  addToast: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = React.createContext<ToastContextType>({ addToast: () => {} })

export const useToast = () => React.useContext(ToastContext)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)) }
  }, [])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { ...toast, id }])
    const duration = toast.duration ?? (toast.severity === 'CRITICAL' ? 8000 : 5000)
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
    timersRef.current.set(id, timer)
  }, [])

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({ addToast }), [addToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className={styles.container}>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const severityConfig = {
  CRITICAL: { color: '#dc2626', bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.4)', icon: '!!' },
  WARNING: { color: '#d97706', bg: 'rgba(217,119,6,0.15)', border: 'rgba(217,119,6,0.4)', icon: '!' },
  INFO: { color: '#0891b2', bg: 'rgba(8,145,178,0.15)', border: 'rgba(8,145,178,0.4)', icon: 'i' },
}

const ToastItem: React.FC<{ toast: ToastItem; onClose: () => void }> = ({ toast, onClose }) => {
  const [visible, setVisible] = useState(false)
  const config = severityConfig[toast.severity] || severityConfig.INFO

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClick = () => {
    toast.onClick?.()
    onClose()
  }

  // C1 fix: borderColor BEFORE borderLeftColor so shorthand doesn't override
  return (
    <div
      className={`${styles.toast} ${visible ? styles.toastVisible : ''}`}
      style={{ background: config.bg, borderColor: config.border, borderLeftColor: config.color }}
      onClick={handleClick}
    >
      <div className={styles.severityDot} style={{ background: config.color }}>
        <span className={styles.severityIcon}>{config.icon}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.title} style={{ color: config.color }}>{toast.title}</div>
        <div className={styles.message}>{toast.message}</div>
      </div>
      <button className={styles.closeBtn} onClick={(e) => { e.stopPropagation(); onClose() }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
    </div>
  )
}
