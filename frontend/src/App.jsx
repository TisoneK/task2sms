import { Routes, Route, Navigate, Link } from 'react-router-dom'
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

// Decode the JWT exp claim without a network call so PrivateRoute can
// pre-emptively redirect to /login when the token has expired, rather
// than letting every API call bounce with a 401 first. The JWT payload
// is base64url JSON; we don't verify the signature client-side (the
// backend does that on every request) — we only read exp to avoid
// UX churn. Finding F-H1 from the 2026-07-13 review.
function isTokenExpired(token) {
  if (!token || typeof token !== 'string') return true
  const parts = token.split('.')
  if (parts.length !== 3) return true
  try {
    // base64url → base64
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(payload))
    if (typeof decoded.exp !== 'number') return false  // no exp claim — trust backend
    // 5-second skew so we don't cut it razor-close to the wire
    return decoded.exp * 1000 <= Date.now() + 5000
  } catch {
    return true  // malformed token — treat as expired
  }
}

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  // Stale-token check: a token that's still in localStorage but past its
  // exp is treated as no token at all, so the user lands on /login
  // instead of seeing a flash of authenticated UI followed by 401s.
  if (!token || isTokenExpired(token)) {
    return <Navigate to="/login" replace />
  }
  return children
}

// Inverse guard for /login and /register — if the user is already authed,
// bounce them to /dashboard instead of showing the auth form.
function PublicOnlyRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  if (token && !isTokenExpired(token)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
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

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-5xl font-bold" style={{ color: 'var(--primary)' }}>404</div>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>Page not found</h1>
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to="/dashboard" className="btn-primary mt-2">Back to dashboard</Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
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
        <Route path="*"              element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
