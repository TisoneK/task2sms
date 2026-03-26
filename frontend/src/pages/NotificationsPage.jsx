import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, RefreshCw, Bell } from 'lucide-react'
import { useNotifications } from '../hooks/useData'
import Pagination from '../components/ui/Pagination'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'

const STATUS_ICON = {
  sent:     <CheckCircle2 size={15} className="text-green-500 shrink-0" />,
  failed:   <XCircle size={15} className="text-red-500 shrink-0" />,
  pending:  <Clock size={15} className="text-yellow-500 shrink-0" />,
  retrying: <RefreshCw size={15} className="text-blue-500 shrink-0" />,
}

const PER_PAGE = 50

export default function NotificationsPage() {
  const { notifications, total, page, loading, reload } = useNotifications(1, PER_PAGE)
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter(n => n.status === filter)

  const counts = {
    all: notifications.length,
    sent: notifications.filter(n => n.status === 'sent').length,
    failed: notifications.filter(n => n.status === 'failed').length,
    pending: notifications.filter(n => n.status === 'pending').length,
    retrying: notifications.filter(n => n.status === 'retrying').length,
  }

  if (loading && notifications.length === 0) return <SpinnerPage />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification History</h1>
          <p className="text-gray-500 text-sm">{total} total messages</p>
        </div>
        <button onClick={() => reload(page)} className="btn-secondary">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {['all', 'sent', 'failed', 'pending', 'retrying'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {s}
            {counts[s] > 0 && (
              <span className={`ml-1.5 text-xs ${filter === s ? 'text-gray-500' : 'text-gray-400'}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bell}
            title="No notifications"
            description={filter !== 'all' ? `No ${filter} messages found` : 'SMS will appear here once sent'}
          />
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {filtered.map(n => (
            <div key={n.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="mt-0.5">{STATUS_ICON[n.status] || STATUS_ICON.pending}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{n.recipient}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{n.provider}</span>
                  {n.task_id && (
                    <span className="text-xs text-gray-300">task #{n.task_id}</span>
                  )}
                  {n.provider_message_id && (
                    <span className="text-xs font-mono text-gray-300 hidden sm:inline truncate max-w-32">
                      {n.provider_message_id}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 break-words">{n.message}</p>
                {n.error_message && (
                  <p className="text-xs text-red-500 mt-1 bg-red-50 rounded px-2 py-1">
                    ⚠ {n.error_message}
                  </p>
                )}
                {n.retry_count > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Retried {n.retry_count}× (max {n.max_retries})
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className={
                  n.status === 'sent' ? 'badge-green' :
                  n.status === 'failed' ? 'badge-red' :
                  n.status === 'retrying' ? 'badge-blue' : 'badge-yellow'
                }>{n.status}</span>
                <p className="text-xs text-gray-400 mt-1">
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
