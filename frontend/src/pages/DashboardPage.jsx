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
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  )
}

function MiniBarChart({ data }) {
  if (!data || data.length === 0)
    return <div className="flex items-center justify-center h-24 text-gray-300 text-sm">No data yet</div>
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="flex items-end gap-1 h-24 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full bg-brand-500 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
            style={{ height: `${(d.total / max) * 80}px`, minHeight: 2 }}
          />
          <span className="text-xs text-gray-300 truncate max-w-full">
            {d.day ? d.day.slice(5) : ''}
          </span>
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
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
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Welcome back, {user?.full_name || user?.username}</p>
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
          <h2 className="font-semibold text-gray-900 mb-4">SMS Activity (Last 7 Days)</h2>
          <MiniBarChart data={stats?.daily_sms} />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Providers</h2>
          {stats?.providers && Object.keys(stats.providers).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.providers).map(([provider, count]) => {
                const total = Object.values(stats.providers).reduce((a, b) => a + b, 0)
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={provider}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize text-gray-700">{provider}</span>
                      <span className="text-gray-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No SMS sent yet</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Tasks</h2>
            <Link to="/tasks" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tasksLoading
              ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
              : recentTasks.length === 0
              ? <div className="px-5 py-8 text-center text-gray-400 text-sm">No tasks. <Link to="/tasks/new" className="text-brand-600">Create one</Link></div>
              : recentTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                    <p className="text-xs text-gray-400">
                      {task.last_run_at ? `Last run ${formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true })}` : 'Never run'}
                    </p>
                  </div>
                  <span className={task.status === 'active' ? 'badge-green' : task.status === 'paused' ? 'badge-yellow' : task.status === 'failed' ? 'badge-red' : 'badge-gray'}>{task.status}</span>
                  <button onClick={() => runTask(task.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Run now"><Play size={14} /></button>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent SMS</h2>
            <Link to="/notifications" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentNotifs.length === 0
              ? <div className="px-5 py-8 text-center text-gray-400 text-sm">No SMS sent yet.</div>
              : recentNotifs.map(n => (
                <div key={n.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.recipient}</p>
                    <p className="text-xs text-gray-400 truncate">{n.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={n.status === 'sent' ? 'badge-green' : n.status === 'failed' ? 'badge-red' : 'badge-yellow'}>{n.status}</span>
                    <p className="text-xs text-gray-300 mt-0.5">{n.provider}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
