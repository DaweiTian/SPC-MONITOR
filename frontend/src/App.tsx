import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import { AppLayout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { SPCPage } from './pages/SPC'
import { CapabilityPage } from './pages/Capability'
import { AlertsPage } from './pages/Alerts'
import { ConfigPage } from './pages/Config'
import { DataPage } from './pages/Data'
import { HelpPage } from './pages/Help'
import { PredictionPage } from './pages/Prediction'

const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout>
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
        </AppLayout>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
