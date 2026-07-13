import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import useAuthStore from './store/authStore'
import Layout from './components/ui/Layout'
import ErrorBoundary from './components/ui/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Code-split every authenticated page so the initial bundle only contains
// the shell (Layout) + auth pages. Each page becomes its own chunk loaded
// on first navigation. ScraperPage alone is ~2.6k lines — without this,
// a user who only sends SMS still downloads the scraper bundle.
// Finding F-H2 from the 2026-07-13 review.
const DashboardPage     = lazy(() => import('./pages/DashboardPage'))
const AnalyticsPage     = lazy(() => import('./pages/AnalyticsPage'))
const TasksPage         = lazy(() => import('./pages/TasksPage'))
const TaskFormPage      = lazy(() => import('./pages/TaskFormPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const SendSMSPage       = lazy(() => import('./pages/SendSMSPage'))
const WhatsAppPage      = lazy(() => import('./pages/WhatsAppPage'))
const TelegramPage      = lazy(() => import('./pages/TelegramPage'))
const EmailPage         = lazy(() => import('./pages/EmailPage'))
const DataSourcesPage   = lazy(() => import('./pages/DataSourcesPage'))
const ScraperPage       = lazy(() => import('./pages/ScraperPage'))
const WebhooksPage      = lazy(() => import('./pages/WebhooksPage'))
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'))
const SettingsPage      = lazy(() => import('./pages/SettingsPage'))

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function P({ component: Component }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading…</div>}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  )
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
