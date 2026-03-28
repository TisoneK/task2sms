import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ListTodo, Bell, Send, LogOut, MessageSquare,
  Menu, BarChart2, Users, Zap, Database, MessageCircle, Mail,
  Settings, Send as TelegramIcon, Globe, X
} from 'lucide-react'
import { useState } from 'react'
import useAuthStore from '../../store/authStore'

const NAV = [
  { section: 'OVERVIEW' },
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics',     icon: BarChart2,        label: 'Analytics' },
  { section: 'MESSAGING' },
  { to: '/tasks',         icon: ListTodo,         label: 'Tasks' },
  { to: '/send-sms',      icon: Send,             label: 'Send SMS' },
  { to: '/whatsapp',      icon: MessageCircle,    label: 'WhatsApp' },
  { to: '/telegram',      icon: TelegramIcon,     label: 'Telegram' },
  { to: '/email',         icon: Mail,             label: 'Email' },
  { to: '/notifications', icon: Bell,             label: 'History' },
  { section: 'INTEGRATIONS' },
  { to: '/datasources',   icon: Database,         label: 'Data Sources' },
  { to: '/scraper',       icon: Globe,            label: 'Web Monitor' },
  { to: '/webhooks',      icon: Zap,              label: 'Webhooks' },
  { section: 'TEAM' },
  { to: '/organizations', icon: Users,            label: 'Organizations' },
  { to: '/settings',      icon: Settings,         label: 'Settings' },
]

function SidebarContent({ onNavClick }) {
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary)' }}>
          <MessageSquare size={15} className="text-white" />
        </div>
        <span className="font-semibold text-white text-base tracking-tight">Task2SMS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin space-y-0.5">
        {NAV.map((item, i) => {
          if (item.section) return (
            <p key={i} className="section-label">{item.section}</p>
          )
          const { to, icon: Icon, label } = item
          return (
            <NavLink key={to} to={to} onClick={onNavClick}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' active' : ''}`
              }>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-2 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: 'var(--primary)' }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{user?.username}</p>
            <p className="text-xs truncate leading-tight" style={{ color: 'var(--sidebar-muted)' }}>{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="sidebar-nav-item w-full text-left">
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 flex flex-col w-[220px] h-full shadow-xl">
            <div className="absolute top-3 right-3 z-10">
              <button onClick={() => setMobileOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                <X size={14} />
              </button>
            </div>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <button onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            style={{ color: 'var(--muted-foreground)' }}>
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--primary)' }}>
              <MessageSquare size={13} className="text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Task2SMS</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-7 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
