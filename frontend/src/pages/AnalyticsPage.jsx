import { useState, useEffect } from 'react'
import { analyticsApi } from '../services/api'
import { SpinnerPage } from '../components/ui/Feedback'
import { Download, TrendingUp, MessageSquare, Mail, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function MetricCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
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

function BarChart({ data, keyField, valueField, label }) {
  if (!data?.length) return <p className="text-sm text-gray-400 text-center py-8">No data</p>
  const max = Math.max(...data.map(d => d[valueField] || 0), 1)
  return (
    <div>
      <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">{label}</p>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="w-full bg-brand-500 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
              style={{ height: `${((d[valueField] || 0) / max) * 100}px`, minHeight: 2 }} />
            <span className="text-xs text-gray-400 truncate max-w-full">{String(d[keyField]).slice(-5)}</span>
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
              {d[keyField]}: {d[valueField]}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopTasksTable({ tasks }) {
  if (!tasks?.length) return <p className="text-sm text-gray-400 text-center py-4">No task runs yet</p>
  return (
    <div className="divide-y divide-gray-50">
      {tasks.map((t, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
            <p className="text-xs text-gray-400">{t.runs} runs · {t.fails} fails</p>
          </div>
          <div className="w-24 h-1.5 bg-gray-100 rounded-full">
            <div className="h-full bg-brand-500 rounded-full"
              style={{ width: `${Math.min(100, (t.runs / (tasks[0]?.runs || 1)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const PERIODS = [{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '90d', value: 90 }]

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [exporting, setExporting] = useState(false)

  const load = async (d = days) => {
    setLoading(true)
    try {
      const { data: res } = await analyticsApi.get(d)
      setData(res)
    } catch { toast.error('Failed to load analytics') }
    finally { setLoading(false) }
  }

  useEffect(() => { load(days) }, [days])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await analyticsApi.exportXlsx()
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = 'notifications.xlsx'; a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch { toast.error('Export failed') }
    finally { setExporting(false) }
  }

  if (loading && !data) return <SpinnerPage />

  const providerData = data?.providers
    ? Object.entries(data.providers).map(([k, v]) => ({ name: k, count: v }))
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm">Performance across all channels</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setDays(p.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  days === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{p.label}</button>
            ))}
          </div>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {/* Channel summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={MessageSquare} label="SMS Sent" color="bg-brand-600"
          value={data?.sms?.sent}
          sub={`${data?.sms?.delivery_rate ?? 0}% delivery rate`} />
        <MetricCard icon={Mail} label="Emails Sent" color="bg-purple-500"
          value={data?.email?.sent}
          sub={`of ${data?.email?.total ?? 0} total`} />
        <MetricCard icon={MessageCircle} label="WhatsApp Sent" color="bg-green-500"
          value={data?.whatsapp?.sent}
          sub={`of ${data?.whatsapp?.total ?? 0} total`} />
        <MetricCard icon={TrendingUp} label="Task Runs" color="bg-orange-500"
          value={data?.tasks?.total ? data.tasks.active : '—'}
          sub={`${data?.tasks?.total ?? 0} tasks total`} />
      </div>

      {/* SMS detailed stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4 flex flex-col gap-2">
          {[
            ['Total SMS', data?.sms?.total],
            ['Delivered', data?.sms?.sent],
            ['Failed', data?.sms?.failed],
            ['Delivery Rate', `${data?.sms?.delivery_rate ?? 0}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-gray-500">{k}</span>
              <span className="font-semibold text-gray-900">{v ?? '—'}</span>
            </div>
          ))}
        </div>

        <div className="card p-5 md:col-span-2">
          <BarChart data={data?.daily_sms} keyField="day" valueField="sent" label="Daily SMS Sent" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Provider breakdown */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Provider Breakdown</h2>
          {providerData.length > 0 ? (
            <div className="space-y-3">
              {providerData.map(({ name, count }) => {
                const total = providerData.reduce((a, b) => a + b.count, 0)
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize">{name}</span>
                      <span className="text-gray-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-6">No data</p>}
        </div>

        {/* Top tasks */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top Tasks by Runs</h2>
          <TopTasksTable tasks={data?.top_tasks} />
        </div>
      </div>

      {/* Task status breakdown */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Task Status Breakdown</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ['Active', data?.tasks?.active, 'text-green-600 bg-green-50'],
            ['Paused', data?.tasks?.paused, 'text-yellow-600 bg-yellow-50'],
            ['Failed', data?.tasks?.failed, 'text-red-600 bg-red-50'],
            ['Completed', data?.tasks?.completed, 'text-gray-600 bg-gray-50'],
          ].map(([label, count, cls]) => (
            <div key={label} className={`rounded-xl p-4 ${cls}`}>
              <p className="text-2xl font-bold">{count ?? 0}</p>
              <p className="text-sm font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
