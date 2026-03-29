import { useState } from 'react'
import { User, Lock, CheckCircle2, Sun, Moon } from 'lucide-react'
import api from '../services/api'
import useAuthStore from '../store/authStore'
import useThemeStore from '../store/themeStore'
import toast from 'react-hot-toast'

function SectionCard({ icon: Icon, iconBg, iconColor, title, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: iconBg }}>
          <Icon size={17} style={{ color: iconColor }} />
        </div>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useThemeStore()

  const [profile, setProfile] = useState({ full_name: user?.full_name || '', email: user?.email || '' })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  const handleProfile = async (e) => {
    e.preventDefault()
    setProfileLoading(true)
    try {
      await api.patch('/settings/profile', { full_name: profile.full_name || null, email: profile.email })
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally { setProfileLoading(false) }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) { toast.error('Passwords do not match'); return }
    if (passwords.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return }
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

  const ThemeOption = ({ value, label, description, Icon }) => {
    const active = theme === value
    return (
      <button onClick={() => setTheme(value)}
        className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl border-2 transition-all text-left"
        style={{
          borderColor: active ? 'var(--primary)' : 'var(--border)',
          background: active ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'var(--card)',
        }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: active ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--muted)' }}>
          <Icon size={18} style={{ color: active ? 'var(--primary)' : 'var(--muted-foreground)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold"
             style={{ color: active ? 'var(--primary)' : 'var(--foreground)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{description}</p>
        </div>
        {active && (
          <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center"
               style={{ background: 'var(--primary)' }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="white">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <SectionCard icon={User} iconBg="color-mix(in srgb, var(--primary) 12%, transparent)"
                   iconColor="var(--primary)" title="Profile">
        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input" value={user?.username || ''} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed', background: 'var(--muted)' }} />
            <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Username cannot be changed</p>
          </div>
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={profile.full_name} placeholder="Your name"
              onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" required value={profile.email}
              onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
          </div>
          <button type="submit" disabled={profileLoading} className="btn-primary">
            {profileLoading ? 'Saving…' : <><CheckCircle2 size={14} /> Save Profile</>}
          </button>
        </form>
      </SectionCard>

      {/* Password */}
      <SectionCard icon={Lock} iconBg="color-mix(in srgb, #f59e0b 12%, transparent)"
                   iconColor="#f59e0b" title="Change Password">
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input className="input" type="password" required value={passwords.current_password}
              onChange={e => setPasswords(p => ({ ...p, current_password: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input className="input" type="password" required minLength={8} value={passwords.new_password}
              onChange={e => setPasswords(p => ({ ...p, new_password: e.target.value }))}
              placeholder="Minimum 8 characters" />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" required value={passwords.confirm}
              onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button type="submit" disabled={pwLoading} className="btn-primary">
            {pwLoading ? 'Updating…' : <><Lock size={14} /> Change Password</>}
          </button>
        </form>
      </SectionCard>

      {/* Appearance */}
      <SectionCard icon={theme === 'dark' ? Moon : Sun}
                   iconBg="color-mix(in srgb, #8b5cf6 12%, transparent)"
                   iconColor="#8b5cf6" title="Appearance">
        <div>
          <label className="label">Theme</label>
          <div className="flex gap-3 mt-2">
            <ThemeOption value="light" label="Light" description="Clean and bright" Icon={Sun} />
            <ThemeOption value="dark" label="Dark" description="Easy on the eyes" Icon={Moon} />
          </div>
        </div>
      </SectionCard>

      {/* Account info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Account Info</h2>
        <dl className="space-y-3">
          {[
            ['User ID', `#${user?.id}`],
            ['Member since', user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'],
            ['Account status', user?.is_active ? '✓ Active' : '✗ Inactive'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0"
                 style={{ borderColor: 'var(--border)' }}>
              <dt style={{ color: 'var(--muted-foreground)' }}>{k}</dt>
              <dd className="font-medium" style={{ color: 'var(--foreground)' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
