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

function AppContent() {
  const { permissions, isAuthenticated, verifyPassword } = useAppContext()

  // 需要密码验证但未认证时显示密码对话框
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
