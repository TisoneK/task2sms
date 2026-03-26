import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ListTodo, Bell, Send, LogOut, MessageSquare,
  Menu, BarChart2, Users, Zap, Database, MessageCircle, Mail, Settings
} from 'lucide-react'
import { useState } from 'react'
import useAuthStore from '../../store/authStore'
import clsx from 'clsx'

const NAV = [
  { section: 'Overview' },
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics',     icon: BarChart2,        label: 'Analytics' },
  { section: 'Messaging' },
  { to: '/tasks',         icon: ListTodo,         label: 'Tasks' },
  { to: '/send-sms',      icon: Send,             label: 'Send SMS' },
  { to: '/whatsapp',      icon: MessageCircle,    label: 'WhatsApp' },
  { to: '/email',         icon: Mail,             label: 'Email' },
  { to: '/notifications', icon: Bell,             label: 'History' },
  { section: 'Integrations' },
  { to: '/datasources',   icon: Database,         label: 'Data Sources' },
  { to: '/webhooks',      icon: Zap,              label: 'Webhooks' },
  { section: 'Team' },
  { to: '/organizations', icon: Users,            label: 'Organizations' },
  { to: '/settings',      icon: Settings,         label: 'Settings' },
]

export default function Layout() {
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
          <MessageSquare size={16} className="text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight">Task2SMS</span>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {NAV.map((item, i) => {
          if (item.section) return (
            <p key={i} className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 pt-4 pb-1.5 first:pt-1">
              {item.section}
            </p>
          )
          const { to, icon: Icon, label } = item
          return (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}>
              <Icon size={17} /> {label}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">{user?.username}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-gray-900 text-white shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative z-50 flex flex-col w-60 h-full bg-gray-900 text-white">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setOpen(true)} className="p-1 rounded text-gray-600">
            <Menu size={22} />
          </button>
          <span className="font-bold text-gray-900">Task2SMS</span>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
