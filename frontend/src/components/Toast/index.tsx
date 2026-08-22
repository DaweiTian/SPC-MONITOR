import React, { useState, useEffect, useCallback, useRef } from 'react'
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

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { ...toast, id }])
    // Auto-dismiss
    const duration = toast.duration ?? (toast.severity === 'CRITICAL' ? 8000 : 5000)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
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

  return (
    <div
      className={`${styles.toast} ${visible ? styles.toastVisible : ''}`}
      style={{ borderLeftColor: config.color, background: config.bg, borderColor: config.border }}
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
