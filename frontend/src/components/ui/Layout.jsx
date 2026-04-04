import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ListTodo, Bell, Send, LogOut,
  Menu, BarChart2, Users, Zap, Database, MessageCircle, Mail,
  Settings, Globe, X
} from 'lucide-react'
import { useState } from 'react'
import useAuthStore from '../../store/authStore'
import AppIcon from './AppIcon'
import ThemeToggle from './ThemeToggle'

// Telegram paper-plane icon (matches official Telegram branding)
function TelegramIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  )
}

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
  { to: '/notifications', icon: Bell,             label: 'SMS History' },
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
  const user   = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar)' }}>
      {/* Logo — matches favicon exactly */}
      <div className="flex items-center gap-2.5 px-4 py-[14px] shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <AppIcon size="md" />
        <span className="font-semibold text-white text-[14px] tracking-tight">Task2SMS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin space-y-px">
        {NAV.map((item, i) => {
          if (item.section) return <p key={i} className="section-label">{item.section}</p>
          const { to, icon: Icon, label } = item
          return (
            <NavLink key={to} to={to} onClick={onNavClick}
              className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}>
              <Icon size={14} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-2 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                          text-white shrink-0" style={{ background: 'var(--primary)' }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate leading-tight">{user?.username}</p>
            <p className="text-[11px] truncate leading-tight" style={{ color: 'var(--sidebar-muted)' }}>
              {user?.email}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <button onClick={() => { logout(); navigate('/login') }} className="sidebar-nav-item w-full">
          <LogOut size={14} /><span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Portal root — modals render here, outside overflow constraints */}
      <div id="modal-root" />

      <div className="flex h-screen" style={{ background: 'var(--background)' }}>
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-[216px] shrink-0 overflow-hidden">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                 onClick={() => setMobileOpen(false)} />
            <aside className="relative z-50 flex flex-col w-[216px] h-full shadow-xl">
              <button onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center
                           justify-center text-white hover:bg-white/10 transition-colors">
                <X size={14} />
              </button>
              <SidebarContent onNavClick={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <header className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
                  style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg" style={{ color: 'var(--muted-foreground)' }}>
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <AppIcon size="sm" />
              <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Task2SMS</span>
            </div>
          </header>

          {/* Scrollable page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-7"
                style={{ background: 'var(--background)' }}>
            <div className="animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
