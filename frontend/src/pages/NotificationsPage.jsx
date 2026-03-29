import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, RefreshCw, Bell } from 'lucide-react'
import { useNotifications } from '../hooks/useData'
import Pagination from '../components/ui/Pagination'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'

const STATUS_ICON = {
  sent:     <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />,
  failed:   <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />,
  pending:  <Clock size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  retrying: <RefreshCw size={14} className="text-sky-500 shrink-0 mt-0.5" />,
}
const STATUS_BADGE = { sent: 'badge-green', failed: 'badge-red', pending: 'badge-yellow', retrying: 'badge-blue' }
const PER_PAGE = 50

export default function NotificationsPage() {
  const { notifications, total, page, loading, reload } = useNotifications(1, PER_PAGE)
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? notifications : filter === 'pending' ? notifications.filter(n => ['pending','retrying'].includes(n.status)) : notifications.filter(n => n.status === filter)
  const counts = { all: notifications.length,
    sent: notifications.filter(n => n.status === 'sent').length,
    failed: notifications.filter(n => n.status === 'failed').length,
    pending: notifications.filter(n => ['pending','retrying'].includes(n.status)).length,
  }

  if (loading && notifications.length === 0) return <SpinnerPage />

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">SMS History</h1>
          <p className="page-subtitle">{total} total messages</p>
        </div>
        <button onClick={() => reload(page)} className="btn-secondary">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--muted)' }}>
        {['all', 'sent', 'failed', 'pending'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
            style={{
              background: filter === s ? 'var(--card)' : 'transparent',
              color: filter === s ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: filter === s ? 'var(--shadow-card)' : 'none',
            }}>
            {s} {counts[s] > 0 && (
              <span className="ml-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                ({counts[s]})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Bell} title="No messages"
            description={filter === 'pending' ? 'No pending or retrying messages' : filter !== 'all' ? `No ${filter} messages` : 'Sent messages will appear here'} />
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map(n => (
            <div key={n.id} className="flex items-start gap-3 px-5 py-4 transition-colors"
                 style={{ ':hover': { background: 'var(--muted)' } }}>
              {STATUS_ICON[n.status] || STATUS_ICON.pending}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{n.recipient}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {n.provider}
                  </span>
                  {n.task_id && <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>task #{n.task_id}</span>}
                </div>
                <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--foreground)', opacity: 0.85 }}>{n.message}</p>
                {n.error_message && (
                  <p className="text-xs mt-1 px-2 py-1 rounded" style={{ color: '#dc2626', background: '#fee2e2' }}>
                    {n.error_message}
                  </p>
                )}
                {n.retry_count > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    Retried {n.retry_count}× (max {n.max_retries})
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className={STATUS_BADGE[n.status] || 'badge-gray'}>{n.status}</span>
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {formatDistanceToNow(new Date(n.sent_at || n.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} perPage={PER_PAGE} onChange={reload} />
    </div>
  )
}
