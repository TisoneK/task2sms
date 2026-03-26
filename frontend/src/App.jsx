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
import TelegramPage from './pages/TelegramPage'
import ScraperPage from './pages/ScraperPage'
import SettingsPage from './pages/SettingsPage'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function P({ component: Component }) {
  return <ErrorBoundary><Component /></ErrorBoundary>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"      element={<P component={DashboardPage} />} />
        <Route path="analytics"      element={<P component={AnalyticsPage} />} />
        <Route path="tasks"          element={<P component={TasksPage} />} />
        <Route path="tasks/new"      element={<P component={TaskFormPage} />} />
        <Route path="tasks/:id/edit" element={<P component={TaskFormPage} />} />
        <Route path="notifications"  element={<P component={NotificationsPage} />} />
        <Route path="send-sms"       element={<P component={SendSMSPage} />} />
        <Route path="whatsapp"       element={<P component={WhatsAppPage} />} />
        <Route path="telegram"       element={<P component={TelegramPage} />} />
        <Route path="email"          element={<P component={EmailPage} />} />
        <Route path="datasources"    element={<P component={DataSourcesPage} />} />
        <Route path="scraper"        element={<P component={ScraperPage} />} />
        <Route path="webhooks"       element={<P component={WebhooksPage} />} />
        <Route path="organizations"  element={<P component={OrganizationsPage} />} />
        <Route path="settings"       element={<P component={SettingsPage} />} />
      </Route>
    </Routes>
  )
}
