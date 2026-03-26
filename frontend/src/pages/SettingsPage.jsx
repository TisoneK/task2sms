import { useState } from 'react'
import { User, Lock, CheckCircle2 } from 'lucide-react'
import api from '../services/api'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const [profile, setProfile] = useState({ full_name: user?.full_name || '', email: user?.email || '' })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your account</p>
      </div>

      {/* Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
            <User size={18} className="text-brand-600" />
          </div>
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input bg-gray-50 cursor-not-allowed" value={user?.username || ''} disabled />
            <p className="text-xs text-gray-400 mt-1">Username cannot be changed</p>
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
          <h2 className="font-semibold text-gray-900">Change Password</h2>
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

      {/* Account info */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Account Info</h2>
        <dl className="space-y-2 text-sm">
          {[
            ['User ID', `#${user?.id}`],
            ['Member since', user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
            ['Status', user?.is_active ? 'Active' : 'Inactive'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
