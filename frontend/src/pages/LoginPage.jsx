import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppIcon from '../components/ui/AppIcon'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const res = await login(form.username, form.password)
    if (res.success) { toast.success('Welcome back!'); navigate('/dashboard') }
    else toast.error(res.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AppIcon size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Task2SMS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Sign in to your account</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username or Email</label>
              <input className="input" type="text" required autoComplete="username"
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required autoComplete="current-password"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center mt-2">
              {isLoading
                ? <><span className="spinner-sm" /> Signing in…</>
                : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--muted-foreground)' }}>
          No account?{' '}
          <Link to="/register" className="font-medium" style={{ color: 'var(--primary)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
