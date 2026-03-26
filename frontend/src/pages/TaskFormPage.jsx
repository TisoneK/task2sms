import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { tasksApi } from '../services/api'
import toast from 'react-hot-toast'

const PROVIDERS = ['africastalking', 'twilio', 'gsm']
const OPERATORS = [
  { value: 'gt', label: '>' }, { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' }, { value: 'lte', label: '<=' },
  { value: 'eq', label: '==' }, { value: 'neq', label: '!=' },
]

const DEFAULT_FORM = {
  name: '', description: '',
  schedule_type: 'interval',
  cron_expression: '', interval_value: 1, interval_unit: 'hours',
  run_at: '',
  condition_enabled: false,
  condition_field: '', condition_operator: 'gt', condition_value: '',
  recipients: [''],
  message_template: '',
  sms_provider: '',
}

export default function TaskFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return
    tasksApi.get(id)
      .then(({ data }) => {
        setForm({
          ...DEFAULT_FORM, ...data,
          cron_expression: data.cron_expression || '',
          run_at: data.run_at ? data.run_at.slice(0, 16) : '',
          sms_provider: data.sms_provider || '',
          recipients: data.recipients.length ? data.recipients : [''],
        })
      })
      .catch(() => { toast.error('Failed to load task'); navigate('/tasks') })
      .finally(() => setFetching(false))
  }, [id])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }))

  const setRecipient = (i, v) => setForm(f => {
    const r = [...f.recipients]; r[i] = v; return { ...f, recipients: r }
  })
  const addRecipient = () => setForm(f => ({ ...f, recipients: [...f.recipients, ''] }))
  const removeRecipient = (i) => setForm(f => ({
    ...f, recipients: f.recipients.filter((_, idx) => idx !== i)
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      interval_value: Number(form.interval_value),
      recipients: form.recipients.filter(Boolean),
      sms_provider: form.sms_provider || null,
      cron_expression: form.cron_expression || null,
      run_at: form.run_at ? new Date(form.run_at).toISOString() : null,
    }
    setLoading(true)
    try {
      if (isEdit) await tasksApi.update(id, payload)
      else await tasksApi.create(payload)
      toast.success(isEdit ? 'Task updated' : 'Task created')
      navigate('/tasks')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save task')
    } finally { setLoading(false) }
  }

  if (fetching) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/tasks')} className="btn-ghost p-2">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Task' : 'New Task'}</h1>
          <p className="text-sm text-gray-500">Configure automated SMS task</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Info</h2>
          <div>
            <label className="label">Task Name *</label>
            <input className="input" required value={form.name} onChange={set('name')} placeholder="e.g. Daily Attendance Alert" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={set('description')} placeholder="Optional description" />
          </div>
        </div>

        {/* Schedule */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Schedule</h2>
          <div>
            <label className="label">Schedule Type</label>
            <select className="input" value={form.schedule_type} onChange={set('schedule_type')}>
              <option value="interval">Interval (every X minutes/hours/days)</option>
              <option value="cron">Cron Expression</option>
              <option value="one_time">One-time</option>
            </select>
          </div>

          {form.schedule_type === 'interval' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Every</label>
                <input className="input" type="number" min={1} value={form.interval_value} onChange={set('interval_value')} />
              </div>
              <div className="flex-1">
                <label className="label">Unit</label>
                <select className="input" value={form.interval_unit} onChange={set('interval_unit')}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          )}

          {form.schedule_type === 'cron' && (
            <div>
              <label className="label">Cron Expression</label>
              <input className="input font-mono" value={form.cron_expression} onChange={set('cron_expression')}
                placeholder="0 9 * * 1-5  (weekdays at 9am)" />
              <p className="text-xs text-gray-400 mt-1">Format: minute hour day month weekday</p>
            </div>
          )}

          {form.schedule_type === 'one_time' && (
            <div>
              <label className="label">Run At</label>
              <input className="input" type="datetime-local" value={form.run_at} onChange={set('run_at')} />
            </div>
          )}
        </div>

        {/* Condition */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Conditional Send</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.condition_enabled} onChange={setCheck('condition_enabled')}
                className="w-4 h-4 accent-brand-600" />
              <span className="text-sm text-gray-600">Enable</span>
            </label>
          </div>
          {form.condition_enabled && (
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-28">
                <label className="label">Field</label>
                <input className="input" value={form.condition_field} onChange={set('condition_field')} placeholder="e.g. total" />
              </div>
              <div className="w-24">
                <label className="label">Operator</label>
                <select className="input" value={form.condition_operator} onChange={set('condition_operator')}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-28">
                <label className="label">Value</label>
                <input className="input" value={form.condition_value} onChange={set('condition_value')} placeholder="e.g. 140" />
              </div>
            </div>
          )}
          {form.condition_enabled && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-2">
              SMS will only send when the condition is met. Pass context values when running via API.
            </p>
          )}
        </div>

        {/* Recipients */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Recipients</h2>
          {form.recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1" value={r} onChange={e => setRecipient(i, e.target.value)}
                placeholder="+254712345678" type="tel" />
              {form.recipients.length > 1 && (
                <button type="button" onClick={() => removeRecipient(i)}
                  className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addRecipient} className="btn-secondary text-sm">
            <Plus size={15} /> Add recipient
          </button>
        </div>

        {/* Message */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Message</h2>
          <div>
            <label className="label">Message Template *</label>
            <textarea className="input resize-none font-mono text-sm" rows={4} required
              value={form.message_template} onChange={set('message_template')}
              placeholder="Hello {name}, your score is {total}." />
            <p className="text-xs text-gray-400 mt-1">
              Use {'{field}'} placeholders. They'll be replaced when context is provided.
            </p>
          </div>
          <div>
            <label className="label">SMS Provider (optional — overrides default)</label>
            <select className="input" value={form.sms_provider} onChange={set('sms_provider')}>
              <option value="">Use default</option>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => navigate('/tasks')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving…' : isEdit ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  )
}
