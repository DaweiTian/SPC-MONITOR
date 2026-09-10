import React, { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useAppContext } from './contexts/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { PasswordDialog } from './components/PasswordDialog'
import { UpdateDialog } from './components/UpdateDialog'
import { initApiKey } from './services/api'

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const SPCPage = React.lazy(() => import('./pages/SPC'))
const CapabilityPage = React.lazy(() => import('./pages/Capability'))
const AlertsPage = React.lazy(() => import('./pages/Alerts'))
const ConfigPage = React.lazy(() => import('./pages/Config'))
const CorrectionPage = React.lazy(() => import('./pages/Correction'))
const DataPage = React.lazy(() => import('./pages/Data'))
const HelpPage = React.lazy(() => import('./pages/Help'))
const PredictionPage = React.lazy(() => import('./pages/Prediction'))
const NetworkSettingsPage = React.lazy(() => import('./pages/Settings'))
const DevicesPage = React.lazy(() => import('./pages/Devices'))

function ProtectedRoute({ children, moduleKey }: { children: React.ReactNode; moduleKey: string }) {
  const { permissions } = useAppContext()

  if (!permissions.isLocal && permissions.restrictedModules.includes(moduleKey)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function BackendWaiting({ failures, onRetry }: { failures: number; onRetry: () => void }) {
  // 连续失败约 15s（5 次 × 3s）后给出说明与手动重试，避免永远转圈无反馈
  const showHelp = failures >= 5
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: '#060a14', color: '#8b95a7',
      fontFamily: "'SF Mono', 'Cascadia Code', Consolas, monospace",
      padding: 24,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '2px solid rgba(0,212,255,0.2)', borderTopColor: showHelp ? '#ef5350' : '#00d4ff',
        animation: 'ft1-spin 1s linear infinite',
      }} />
      <style>{'@keyframes ft1-spin { to { transform: rotate(360deg); } }'}</style>
      <div style={{ fontSize: 13, letterSpacing: 2 }}>
        {showHelp ? '后端服务尚未就绪' : '正在等待后端服务就绪…'}
      </div>
      <div style={{ fontSize: 11, opacity: 0.75, maxWidth: 420, textAlign: 'center', lineHeight: 1.7 }}>
        {showHelp
          ? '仍在自动重试。若持续失败，请检查 ft1-backend 是否在运行、端口 18080 是否被占用，或查看 logs/backend-stderr.log。'
          : '首次启动时后端解压与初始化可能需要数十秒，就绪后将自动进入系统'}
      </div>
      {showHelp && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8, padding: '10px 28px', borderRadius: 8, border: '1px solid rgba(0,212,255,0.35)',
            background: 'rgba(0,212,255,0.12)', color: '#00d4ff', fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: 1,
          }}
        >
          立即重试
        </button>
      )}
    </div>
  )
}

function AppContent() {
  const { permissions, permissionsStatus, permissionsFailures, isAuthenticated, verifyPassword, refreshPermissions } = useAppContext()

  // 权限就绪后隐藏 splash（防止 splash 超时后仍盖住可用界面）
  useEffect(() => {
    if (permissionsStatus !== 'ready') return
    const overlay = document.getElementById('splash-overlay')
    if (!overlay) return
    overlay.style.transition = 'opacity 0.4s ease'
    overlay.style.opacity = '0'
    const t = window.setTimeout(() => overlay.remove(), 450)
    return () => window.clearTimeout(t)
  }, [permissionsStatus])

  // 后端未就绪时等待，不要误判为「已启用共享密码」
  if (permissionsStatus !== 'ready') {
    return <BackendWaiting failures={permissionsFailures} onRetry={() => { void refreshPermissions() }} />
  }

  // 仅在服务端明确要求密码且尚未认证时显示密码对话框
  if (permissions.passwordRequired && !isAuthenticated) {
    return <PasswordDialog onVerify={verifyPassword} />
  }

  return (
    <BrowserRouter
      basename={basename}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppLayout>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/spc" element={<ErrorBoundary><SPCPage /></ErrorBoundary>} />
            <Route path="/capability" element={<ErrorBoundary><CapabilityPage /></ErrorBoundary>} />
            <Route path="/prediction" element={<ErrorBoundary><PredictionPage /></ErrorBoundary>} />
            <Route path="/devices" element={<ProtectedRoute moduleKey="devices"><ErrorBoundary><DevicesPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/alerts" element={<ErrorBoundary><AlertsPage /></ErrorBoundary>} />
            <Route path="/config" element={<ProtectedRoute moduleKey="config"><ErrorBoundary><ConfigPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute moduleKey="network"><ErrorBoundary><NetworkSettingsPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/correction" element={<ProtectedRoute moduleKey="correction"><ErrorBoundary><CorrectionPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/data" element={<ProtectedRoute moduleKey="data"><ErrorBoundary><DataPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/help" element={<ErrorBoundary><HelpPage /></ErrorBoundary>} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  )
}

const isTauri = '__TAURI__' in window
// Vite dev: no basename (routes at /dashboard)
// Tauri production: no basename (routes at /dashboard, served from tauri://localhost)
// Browser production: basename='/app' (routes at /app/dashboard, served from /app/)
const basename = import.meta.env.DEV ? undefined : (isTauri ? undefined : '/app')

const App: React.FC = () => {
  useEffect(() => { initApiKey() }, [])
  return (
    <ErrorBoundary>
      <ToastProvider>
      <AppProvider>
        <AppContent />
        <UpdateDialog />
      </AppProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
