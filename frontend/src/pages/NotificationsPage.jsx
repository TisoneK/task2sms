import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, RefreshCw, Bell, Trash2, AlertTriangle } from 'lucide-react'
import { useNotifications } from '../hooks/useData'
import { notificationsApi } from '../services/api'
import Pagination from '../components/ui/Pagination'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_ICON = {
  sent:     <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />,
  failed:   <XCircle      size={14} className="text-red-500 shrink-0 mt-0.5" />,
  pending:  <Clock        size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  retrying: <RefreshCw   size={14} className="text-sky-500 shrink-0 mt-0.5" />,
}
const STATUS_BADGE = {
  sent:     'badge-green',
  failed:   'badge-red',
  pending:  'badge-yellow',
  retrying: 'badge-blue',
}

const PER_PAGE = 50
const FILTERS = ['all', 'sent', 'failed', 'pending']

export default function NotificationsPage() {
  const { notifications, total, page, loading, reload } = useNotifications(1, PER_PAGE)
  const [filter, setFilter]         = useState('all')
  const [deleting, setDeleting]     = useState(null)   // id being deleted, or 'all'
  const [confirmClear, setConfirmClear] = useState(null) // null | 'all' | status string

  // ── filtering ────────────────────────────────────────────────────────────
  const filtered = filter === 'all'
    ? notifications
    : filter === 'pending'
      ? notifications.filter(n => ['pending', 'retrying'].includes(n.status))
      : notifications.filter(n => n.status === filter)

  const counts = {
    all:     notifications.length,
    sent:    notifications.filter(n => n.status === 'sent').length,
    failed:  notifications.filter(n => n.status === 'failed').length,
    pending: notifications.filter(n => ['pending', 'retrying'].includes(n.status)).length,
  }

  // ── delete one ───────────────────────────────────────────────────────────
  const handleDeleteOne = async (id) => {
    setDeleting(id)
    try {
      await notificationsApi.deleteOne(id)
      toast.success('Message deleted')
      reload(page)
    } catch {
      toast.error('Failed to delete message')
    } finally {
      setDeleting(null)
    }
  }

  // ── clear all / by status ────────────────────────────────────────────────
  const handleClear = async (status) => {
    setConfirmClear(null)
    setDeleting('all')
    try {
      const { data } = await notificationsApi.clearAll(status === 'all' ? null : status)
      const label = status === 'all' ? 'All messages' : `${data.deleted} ${status} message${data.deleted !== 1 ? 's' : ''}`
      toast.success(`${label} cleared`)
      reload(1)
      setFilter('all')
    } catch {
      toast.error('Failed to clear messages')
    } finally {
      setDeleting(null)
    }
  }

  if (loading && notifications.length === 0) return <SpinnerPage />

  const clearLabel = filter === 'all' ? 'Clear all' : `Clear ${filter}`
  const clearStatus = filter === 'all' ? 'all' : filter

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">SMS History</h1>
          <p className="page-subtitle">{total} total messages</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload(page)} className="btn-secondary" disabled={!!deleting}>
            <RefreshCw size={14} /> Refresh
          </button>
          {notifications.length > 0 && (
            <button
              onClick={() => setConfirmClear(clearStatus)}
              disabled={!!deleting || filtered.length === 0}
              className="btn-ghost text-sm text-red-500 hover:text-red-600 hover:bg-red-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            >
              <Trash2 size={14} />
              {clearLabel}
            </button>
          )}
        </div>
      </div>

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
             style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {confirmClear === 'all'
                ? 'Delete all messages? This cannot be undone.'
                : `Delete all ${confirmClear} messages? This cannot be undone.`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setConfirmClear(null)}
              className="px-3 py-1 text-sm rounded-lg btn-secondary">Cancel</button>
            <button onClick={() => handleClear(confirmClear)}
              className="px-3 py-1 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--muted)' }}>
        {FILTERS.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
            style={{
              background:  filter === s ? 'var(--card)' : 'transparent',
              color:       filter === s ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow:   filter === s ? 'var(--shadow-card)' : 'none',
            }}>
            {s} {counts[s] > 0 && (
              <span className="ml-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                ({counts[s]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Bell} title="No messages"
            description={
              filter === 'pending' ? 'No pending or retrying messages' :
              filter !== 'all'     ? `No ${filter} messages` :
                                     'Sent messages will appear here'
            } />
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map(n => (
            <div key={n.id} className="flex items-start gap-3 px-5 py-4">
              {STATUS_ICON[n.status] || STATUS_ICON.pending}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {n.recipient}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {n.provider}
                  </span>
                  {n.task_id && (
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      task #{n.task_id}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5 break-words"
                   style={{ color: 'var(--foreground)', opacity: 0.85 }}>
                  {n.message}
                </p>
                {n.error_message && (
                  <p className="text-xs mt-1 px-2 py-1 rounded"
                     style={{ color: '#dc2626', background: '#fee2e2' }}>
                    {n.error_message}
                  </p>
                )}
                {n.retry_count > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    Retried {n.retry_count}× (max {n.max_retries})
                  </p>
                )}
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right">
                  <span className={STATUS_BADGE[n.status] || 'badge-gray'}>{n.status}</span>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {formatDistanceToNow(new Date(n.sent_at || n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteOne(n.id)}
                  disabled={deleting === n.id}
                  title="Delete"
                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                >
                  {deleting === n.id
                    ? <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin block" />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} perPage={PER_PAGE} onChange={reload} />
    </div>
  )
}
