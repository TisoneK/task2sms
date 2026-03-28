import { useState, useEffect } from 'react'
import { User, Lock, CheckCircle2, Sun, Moon } from 'lucide-react'
import api from '../services/api'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const [profile, setProfile] = useState({ full_name: user?.full_name || '', email: user?.email || '' })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const handleProfile = async (e) => {
    e.preventDefault()
    setProfileLoading(true)
    try {
      await api.patch('/settings/profile', {
        full_name: profile.full_name || null,
        email: profile.email,
      })
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally { setProfileLoading(false) }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) {
      toast.error('Passwords do not match'); return
    }
    if (passwords.new_password.length < 8) {
      toast.error('Password must be at least 8 characters'); return
    }
    setPwLoading(true)
    try {
      await api.post('/settings/change-password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      })
      toast.success('Password changed')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally { setPwLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account</p>
      </div>

      {/* Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
            <User size={18} className="text-brand-600" />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Profile</h2>
        </div>
        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input bg-muted cursor-not-allowed" value={user?.username || ''} disabled />
            <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Username cannot be changed</p>
          </div>
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={profile.full_name}
              onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
              placeholder="Your name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={profile.email}
              onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
          </div>
          <button type="submit" disabled={profileLoading} className="btn-primary">
            {profileLoading ? 'Saving…' : <><CheckCircle2 size={15} /> Save Profile</>}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center">
            <Lock size={18} className="text-yellow-600" />
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Change Password</h2>
        </div>
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input className="input" type="password" required
              value={passwords.current_password}
              onChange={e => setPasswords(p => ({ ...p, current_password: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input className="input" type="password" required minLength={8}
              value={passwords.new_password}
              onChange={e => setPasswords(p => ({ ...p, new_password: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" required
              value={passwords.confirm}
              onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button type="submit" disabled={pwLoading} className="btn-primary">
            {pwLoading ? 'Updating…' : <><Lock size={15} /> Change Password</>}
          </button>
        </form>
      </div>

      {/* Theme */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
            {theme === 'light' ? <Sun size={18} className="text-purple-600" /> : <Moon size={18} className="text-purple-600" />}
          </div>
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Appearance</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Theme</label>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => toggleTheme()}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all"
                style={{
                  borderColor: theme === 'light' ? 'var(--primary)' : 'var(--border)',
                  backgroundColor: theme === 'light' ? 'var(--accent)' : 'var(--card)'
                }}
              >
                <Sun size={18} style={{ color: theme === 'light' ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                <div className="text-left">
                  <div className="font-medium" style={{ color: theme === 'light' ? 'var(--primary)' : 'var(--foreground)' }}>Light</div>
                  <div className="text-xs" style={{ color: theme === 'light' ? 'var(--primary)' : 'var(--muted-foreground)' }}>Clean and bright interface</div>
                </div>
              </button>
              <button
                onClick={() => toggleTheme()}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all"
                style={{
                  borderColor: theme === 'dark' ? 'var(--primary)' : 'var(--border)',
                  backgroundColor: theme === 'dark' ? 'var(--accent)' : 'var(--card)'
                }}
              >
                <Moon size={18} style={{ color: theme === 'dark' ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                <div className="text-left">
                  <div className="font-medium" style={{ color: theme === 'dark' ? 'var(--primary)' : 'var(--foreground)' }}>Dark</div>
                  <div className="text-xs" style={{ color: theme === 'dark' ? 'var(--primary)' : 'var(--muted-foreground)' }}>Easy on the eyes</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Account Info</h2>
        <dl className="space-y-2 text-sm">
          {[
            ['User ID', `#${user?.id}`],
            ['Member since', user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
            ['Status', user?.is_active ? 'Active' : 'Inactive'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <dt style={{ color: 'var(--muted-foreground)' }}>{k}</dt>
              <dd className="font-medium" style={{ color: 'var(--foreground)' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
