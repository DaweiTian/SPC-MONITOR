import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './components/Layout'

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const SPCPage = React.lazy(() => import('./pages/SPC'))
const CapabilityPage = React.lazy(() => import('./pages/Capability'))
const AlertsPage = React.lazy(() => import('./pages/Alerts'))
const ConfigPage = React.lazy(() => import('./pages/Config'))
const DataPage = React.lazy(() => import('./pages/Data'))
const HelpPage = React.lazy(() => import('./pages/Help'))
const PredictionPage = React.lazy(() => import('./pages/Prediction'))

const isTauri = '__TAURI__' in window

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter
          basename={isTauri ? undefined : '/app'}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppLayout>
            <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/spc" element={<SPCPage />} />
                <Route path="/capability" element={<CapabilityPage />} />
                <Route path="/prediction" element={<PredictionPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/config" element={<ConfigPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/help" element={<HelpPage />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
