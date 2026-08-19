import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { SPCPage } from './pages/SPC'
import { CapabilityPage } from './pages/Capability'
import { AlertsPage } from './pages/Alerts'
import { ConfigPage } from './pages/Config'
import { DataPage } from './pages/Data'
import { HelpPage } from './pages/Help'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/spc" element={<SPCPage />} />
          <Route path="/capability" element={<CapabilityPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}

export default App
