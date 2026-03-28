import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ListTodo, Bell, Send, LogOut, MessageSquare,
  Menu, BarChart2, Users, Zap, Database, MessageCircle, Mail,
  Settings, Globe, X
} from 'lucide-react'
import { useState } from 'react'
import useAuthStore from '../../store/authStore'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { section: 'OVERVIEW' },
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics',     icon: BarChart2,        label: 'Analytics' },
  { section: 'MESSAGING' },
  { to: '/tasks',         icon: ListTodo,         label: 'Tasks' },
  { to: '/send-sms',      icon: Send,             label: 'Send SMS' },
  { to: '/whatsapp',      icon: MessageCircle,    label: 'WhatsApp' },
  { to: '/telegram',      icon: Send,             label: 'Telegram' },
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
  const user   = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b"
           style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: 'var(--primary)' }}>
          <MessageSquare size={15} className="text-white" />
        </div>
        <span className="font-semibold text-white text-[15px] tracking-tight">Task2SMS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin space-y-px">
        {NAV.map((item, i) => {
          if (item.section) return <p key={i} className="section-label">{item.section}</p>
          const { to, icon: Icon, label } = item
          return (
            <NavLink key={to} to={to} onClick={onNavClick}
              className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}>
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                          text-white shrink-0" style={{ background: 'var(--primary)' }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate leading-tight">{user?.username}</p>
            <p className="text-xs truncate leading-tight" style={{ color: 'var(--sidebar-muted)' }}>{user?.email}</p>
          </div>
          <ThemeToggle />
        </div>
        <button onClick={() => { logout(); navigate('/login') }}
          className="sidebar-nav-item w-full">
          <LogOut size={14} /><span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[216px] shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setOpen(false)} />
          <aside className="relative z-50 flex flex-col w-[216px] h-full shadow-xl">
            <button onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center
                         justify-center text-white hover:bg-white/10 transition-colors">
              <X size={14} />
            </button>
            <SidebarContent onNavClick={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <button onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--muted-foreground)' }}>
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
                 style={{ background: 'var(--primary)' }}>
              <MessageSquare size={12} className="text-white" />
            </div>
            <span className="font-semibold text-[14px]" style={{ color: 'var(--foreground)' }}>Task2SMS</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-7 animate-fade-in"
              style={{ background: 'var(--background)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
