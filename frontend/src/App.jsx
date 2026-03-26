import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import Layout from './components/ui/Layout'
import ErrorBoundary from './components/ui/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import TasksPage from './pages/TasksPage'
import TaskFormPage from './pages/TaskFormPage'
import NotificationsPage from './pages/NotificationsPage'
import SendSMSPage from './pages/SendSMSPage'
import AnalyticsPage from './pages/AnalyticsPage'
import OrganizationsPage from './pages/OrganizationsPage'
import WebhooksPage from './pages/WebhooksPage'
import DataSourcesPage from './pages/DataSourcesPage'
import WhatsAppPage from './pages/WhatsAppPage'
import EmailPage from './pages/EmailPage'
import SettingsPage from './pages/SettingsPage'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={<PrivateRoute><Layout /></PrivateRoute>}
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
        <Route path="tasks" element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
        <Route path="tasks/new" element={<ErrorBoundary><TaskFormPage /></ErrorBoundary>} />
        <Route path="tasks/:id/edit" element={<ErrorBoundary><TaskFormPage /></ErrorBoundary>} />
        <Route path="notifications" element={<ErrorBoundary><NotificationsPage /></ErrorBoundary>} />
        <Route path="send-sms" element={<ErrorBoundary><SendSMSPage /></ErrorBoundary>} />
        <Route path="whatsapp" element={<ErrorBoundary><WhatsAppPage /></ErrorBoundary>} />
        <Route path="email" element={<ErrorBoundary><EmailPage /></ErrorBoundary>} />
        <Route path="analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
        <Route path="organizations" element={<ErrorBoundary><OrganizationsPage /></ErrorBoundary>} />
        <Route path="webhooks" element={<ErrorBoundary><WebhooksPage /></ErrorBoundary>} />
        <Route path="datasources" element={<ErrorBoundary><DataSourcesPage /></ErrorBoundary>} />
        <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
      </Route>
    </Routes>
  )
}
