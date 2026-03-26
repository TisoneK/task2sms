import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Play, Pencil, Trash2, ToggleLeft, ToggleRight,
  Search, Filter, RefreshCw
} from 'lucide-react'
import { tasksApi } from '../services/api'
import { useTasks } from '../hooks/useData'
import Pagination from '../components/ui/Pagination'
import ConfirmModal from '../components/ui/ConfirmModal'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = ['all', 'active', 'paused', 'failed', 'completed']

function scheduleLabel(t) {
  if (t.schedule_type === 'cron') return `Cron: ${t.cron_expression}`
  if (t.schedule_type === 'interval') return `Every ${t.interval_value} ${t.interval_unit}`
  if (t.schedule_type === 'one_time' && t.run_at)
    return `Once: ${new Date(t.run_at).toLocaleString()}`
  return '—'
}

export default function TasksPage() {
  const { tasks, allTasks, total, page, loading, search, setSearch,
    statusFilter, setStatusFilter, reload, setTasks } = useTasks()
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name }
  const PER_PAGE = 20

  const handleRun = async (id) => {
    try {
      const { data } = await tasksApi.run(id)
      toast.success(data.message)
      reload()
    } catch { toast.error('Failed to run task') }
  }

  const handleToggle = async (id) => {
    try {
      const { data } = await tasksApi.toggle(id)
      setTasks(ts => ts.map(t => t.id === id ? data : t))
      toast.success(`Task ${data.status}`)
    } catch { toast.error('Failed to toggle task') }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await tasksApi.delete(confirmDelete.id)
      setTasks(ts => ts.filter(t => t.id !== confirmDelete.id))
      toast.success('Task deleted')
    } catch { toast.error('Failed to delete task') }
    finally { setConfirmDelete(null) }
  }

  if (loading && allTasks.length === 0) return <SpinnerPage />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 text-sm">{total} task{total !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => reload(page)} className="btn-ghost p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <Link to="/tasks/new" className="btn-primary"><Plus size={16} /> New Task</Link>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg shrink-0">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Filter}
            title={search || statusFilter !== 'all' ? 'No matching tasks' : 'No tasks yet'}
            description={search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter'
              : 'Create your first automated SMS task'}
            action={!search && statusFilter === 'all'
              ? <Link to="/tasks/new" className="btn-primary inline-flex"><Plus size={16} /> Create task</Link>
              : undefined}
          />
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {tasks.map(task => (
            <div key={task.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{task.name}</p>
                  <span className={
                    task.status === 'active' ? 'badge-green' :
                    task.status === 'paused' ? 'badge-yellow' :
                    task.status === 'failed' ? 'badge-red' : 'badge-gray'
                  }>{task.status}</span>
                  {task.condition_enabled && <span className="badge-blue">conditional</span>}
                  {task.sms_provider && (
                    <span className="badge bg-gray-100 text-gray-600">{task.sms_provider}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{scheduleLabel(task)}</p>
                <p className="text-xs text-gray-400">
                  {task.recipients.length} recipient{task.recipients.length !== 1 ? 's' : ''}
                  {' · '}
                  {task.run_count} run{task.run_count !== 1 ? 's' : ''}
                  {task.fail_count > 0 && ` · ${task.fail_count} fail${task.fail_count !== 1 ? 's' : ''}`}
                  {task.last_run_at && ` · ${formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true })}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleRun(task.id)}
                  className="btn-ghost p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Run now">
                  <Play size={15} />
                </button>
                <button onClick={() => handleToggle(task.id)}
                  className="btn-ghost p-2" title={task.status === 'active' ? 'Pause' : 'Activate'}>
                  {task.status === 'active'
                    ? <ToggleRight size={15} className="text-green-500" />
                    : <ToggleLeft size={15} className="text-gray-400" />}
                </button>
                <Link to={`/tasks/${task.id}/edit`} className="btn-ghost p-2 text-gray-400 hover:text-brand-600" title="Edit">
                  <Pencil size={15} />
                </Link>
                <button onClick={() => setConfirmDelete({ id: task.id, name: task.name })}
                  className="btn-ghost p-2 text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} perPage={PER_PAGE} onChange={reload} />

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete task?"
        message={`"${confirmDelete?.name}" will be permanently deleted and unscheduled.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
