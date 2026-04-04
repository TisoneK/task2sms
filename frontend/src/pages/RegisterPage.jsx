import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppIcon from '../components/ui/AppIcon'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', username: '', password: '', full_name: '' })
  const { register, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const res = await register(form)
    if (res.success) { toast.success('Account created!'); navigate('/dashboard') }
    else toast.error(res.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AppIcon size="lg" className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Create Account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Start automating messages today</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" type="text" value={form.full_name} onChange={set('full_name')}
                placeholder="Optional" />
            </div>
            <div>
              <label className="label">Username *</label>
              <input className="input" type="text" required value={form.username} onChange={set('username')} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" required value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="label">Password *</label>
              <input className="input" type="password" required minLength={8}
                value={form.password} onChange={set('password')}
                placeholder="Minimum 8 characters" />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center mt-2">
              {isLoading
                ? <><span className="spinner-sm" /> Creating…</>
                : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--muted-foreground)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
