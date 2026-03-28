import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListTodo, XCircle, Plus, Play, TrendingUp, Activity, RefreshCw } from 'lucide-react'
import { tasksApi, notificationsApi } from '../services/api'
import { useStats } from '../hooks/useData'
import { formatDistanceToNow } from 'date-fns'
import { SpinnerPage } from '../components/ui/Feedback'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value ?? '—'}</p>
          {sub && <p className="stat-sub">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} style={{ color: 'white' }} />
        </div>
      </div>
    </div>
  )
}

function MiniBarChart({ data }) {
  if (!data || data.length === 0)
    return <div className="flex items-center justify-center h-24 text-sm" style={{ color: 'var(--muted-foreground)' }}>No data yet</div>
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="flex items-end gap-1 h-24 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full bg-brand-500 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
            style={{ height: `${(d.total / max) * 80}px`, minHeight: 2 }}
          />
          <span className="text-xs truncate max-w-full" style={{ color: 'var(--muted-foreground)' }}>
            {d.day ? d.day.slice(5) : ''}
          </span>
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none"
               style={{ backgroundColor: 'var(--muted)', color: 'var(--card-foreground)' }}>
            {d.day}: {d.sent}/{d.total} sent
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { stats, loading, reload } = useStats()
  const [recentTasks, setRecentTasks] = useState([])
  const [recentNotifs, setRecentNotifs] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    Promise.all([tasksApi.list(1, 5), notificationsApi.list(1, 6)])
      .then(([t, n]) => { setRecentTasks(t.data.items); setRecentNotifs(n.data.items) })
      .catch(() => toast.error('Failed to load recent data'))
      .finally(() => setTasksLoading(false))
  }, [])

  const runTask = async (id) => {
    try {
      const { data } = await tasksApi.run(id)
      toast.success(data.message)
      reload()
    } catch { toast.error('Failed to run task') }
  }

  if (loading && !stats) return <SpinnerPage />

  const deliveryRate = stats?.notifications?.total > 0
    ? Math.round((stats.notifications.sent / stats.notifications.total) * 100)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name || user?.username}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="btn-ghost p-2" title="Refresh"><RefreshCw size={16} /></button>
          <Link to="/tasks/new" className="btn-primary"><Plus size={16} /> New Task</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ListTodo} label="Total Tasks" value={stats?.tasks?.total}
          sub={`${stats?.tasks?.active ?? 0} active`} color="bg-brand-600" />
        <StatCard icon={Activity} label="SMS Sent" value={stats?.notifications?.sent}
          sub="all time" color="bg-green-500" />
        <StatCard icon={XCircle} label="Failed" value={stats?.notifications?.failed}
          sub={stats?.notifications?.failed > 0 ? 'check retry queue' : 'all good'} color="bg-red-500" />
        <StatCard icon={TrendingUp} label="Delivery Rate"
          value={deliveryRate !== null ? `${deliveryRate}%` : '—'}
          sub="sent / total" color="bg-purple-500" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>SMS Activity (Last 7 Days)</h2>
          <MiniBarChart data={stats?.daily_sms} />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Providers</h2>
          {stats?.providers && Object.keys(stats.providers).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.providers).map(([provider, count]) => {
                const total = Object.values(stats.providers).reduce((a, b) => a + b, 0)
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={provider}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize" style={{ color: 'var(--foreground)' }}>{provider}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--muted)' }}>
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-center py-6" style={{ color: 'var(--muted-foreground)' }}>No SMS sent yet</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recent Tasks</h2>
            <Link to="/tasks" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>View all</Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {tasksLoading
              ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
              : recentTasks.length === 0
              ? <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No tasks. <Link to="/tasks/new" style={{ color: 'var(--primary)' }}>Create one</Link></div>
              : recentTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{task.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {task.last_run_at ? `Last run ${formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true })}` : 'Never run'}
                    </p>
                  </div>
                  <span className={task.status === 'active' ? 'badge-green' : task.status === 'paused' ? 'badge-yellow' : task.status === 'failed' ? 'badge-red' : 'badge-gray'}>{task.status}</span>
                  <button onClick={() => runTask(task.id)} className="p-1.5 rounded-lg hover:bg-muted dark:hover:bg-foreground transition-colors" style={{ color: 'var(--muted-foreground)' }} title="Run now"><Play size={14} /></button>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recent SMS</h2>
            <Link to="/notifications" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>View all</Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentNotifs.length === 0
              ? <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No SMS sent yet.</div>
              : recentNotifs.map(n => (
                <div key={n.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{n.recipient}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{n.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={n.status === 'sent' ? 'badge-green' : n.status === 'failed' ? 'badge-red' : 'badge-yellow'}>{n.status}</span>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{n.provider}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
