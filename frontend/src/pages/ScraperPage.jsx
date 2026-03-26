import { useState, useEffect } from 'react'
import { monitorsApi } from '../services/api'
import {
  Plus, Trash2, Play, Globe, RefreshCw, X,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock
} from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const SELECTOR_TYPES = [
  { value: 'css',   label: 'CSS Selector',    placeholder: 'div.price, span#stock, .product-title' },
  { value: 'xpath', label: 'XPath',            placeholder: '//span[@class="price"]/text()' },
  { value: 'text',  label: 'Text Contains',    placeholder: 'out of stock' },
  { value: 'regex', label: 'Regex',            placeholder: '\\$([\\d,.]+)' },
]

const OPERATORS = [
  { value: 'changed',     label: 'Changed (any change)' },
  { value: 'contains',    label: 'Contains text' },
  { value: 'not_contains',label: 'Does not contain' },
  { value: 'eq',          label: '= equals' },
  { value: 'neq',         label: '≠ not equals' },
  { value: 'gt',          label: '> greater than' },
  { value: 'gte',         label: '≥ greater or equal' },
  { value: 'lt',          label: '< less than' },
  { value: 'lte',         label: '≤ less or equal' },
]

const CHANNELS = ['sms', 'email', 'whatsapp', 'telegram']

const STATUS_STYLES = {
  active: 'badge-green',
  paused: 'badge-yellow',
  error:  'badge-red',
}

function MonitorModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || {
    name: '', url: '', selector_type: 'css', selector: '',
    attribute: '', condition_operator: 'changed', condition_value: '',
    notify_channels: [], notify_recipients: [],
    message_template: 'Monitor alert: {name} — value is now {value}',
    check_interval_minutes: 60,
  })
  const [loading, setLoading] = useState(false)
  const [recipientInput, setRecipientInput] = useState(
    (initial?.notify_recipients || []).join(', ')
  )
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const selType = SELECTOR_TYPES.find(s => s.value === form.selector_type)

  const toggleChannel = (ch) => setForm(f => ({
    ...f,
    notify_channels: f.notify_channels.includes(ch)
      ? f.notify_channels.filter(c => c !== ch)
      : [...f.notify_channels, ch]
  }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const recipients = recipientInput.split(',').map(s => s.trim()).filter(Boolean)
      await onSave({ ...form, notify_recipients: recipients,
                     attribute: form.attribute || null,
                     condition_value: form.condition_value || null })
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{initial ? 'Edit Monitor' : 'New Web Monitor'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="label">Monitor Name</label>
              <input className="input" required value={form.name} onChange={set('name')}
                placeholder="Amazon price tracker" />
            </div>
            <div>
              <label className="label">URL to Monitor</label>
              <input className="input font-mono text-sm" required type="url" value={form.url}
                onChange={set('url')} placeholder="https://example.com/product" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What to Extract</p>
            <div>
              <label className="label">Selector Type</label>
              <select className="input" value={form.selector_type} onChange={set('selector_type')}>
                {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Selector</label>
              <input className="input font-mono text-sm" required value={form.selector}
                onChange={set('selector')} placeholder={selType?.placeholder} />
            </div>
            {form.selector_type === 'css' && (
              <div>
                <label className="label">Attribute (optional — leave blank for text)</label>
                <input className="input font-mono text-sm" value={form.attribute}
                  onChange={set('attribute')} placeholder="href, src, data-price …" />
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alert Condition</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Condition</label>
                <select className="input" value={form.condition_operator} onChange={set('condition_operator')}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {form.condition_operator !== 'changed' && (
                <div className="flex-1">
                  <label className="label">Value</label>
                  <input className="input" value={form.condition_value} onChange={set('condition_value')}
                    placeholder="100.00" />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notifications</p>
            <div>
              <label className="label">Channels</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {CHANNELS.map(ch => (
                  <button type="button" key={ch} onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors capitalize ${
                      form.notify_channels.includes(ch)
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>{ch}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Recipients (comma-separated phones/emails/chat IDs)</label>
              <input className="input text-sm" value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                placeholder="+254712345678, user@email.com, 123456789" />
            </div>
            <div>
              <label className="label">Message Template</label>
              <textarea className="input resize-none text-sm" rows={2}
                value={form.message_template} onChange={set('message_template')} />
              <p className="text-xs text-slate-400 mt-1">
                Variables: <code className="font-mono">{'{name}'}</code> <code className="font-mono">{'{value}'}</code> <code className="font-mono">{'{url}'}</code>
              </p>
            </div>
            <div>
              <label className="label">Check Interval (minutes)</label>
              <input className="input" type="number" min="1" max="10080"
                value={form.check_interval_minutes}
                onChange={e => setForm(f => ({ ...f, check_interval_minutes: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving…' : initial ? 'Update Monitor' : 'Create Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LogDrawer({ monitorId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    monitorsApi.logs(monitorId)
      .then(({ data }) => setLogs(data))
      .finally(() => setLoading(false))
  }, [monitorId])

  return (
    <div className="border-t border-slate-100">
      <div className="px-5 py-2.5 bg-slate-50">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Check Log</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 spinner" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No checks run yet</p>
      ) : (
        <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto scrollbar-thin">
          {logs.map(l => (
            <div key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              {l.error
                ? <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                : l.condition_met
                  ? <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                  : <Clock size={14} className="text-slate-300 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                {l.value_found !== null && (
                  <p className="font-mono text-xs text-slate-700 truncate">
                    value: <span className="font-semibold">{l.value_found}</span>
                  </p>
                )}
                {l.error && <p className="text-xs text-red-500">{l.error}</p>}
                {l.alerted && <span className="badge-blue text-xs">alerted</span>}
              </div>
              <p className="text-xs text-slate-300 shrink-0">
                {formatDistanceToNow(new Date(l.checked_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ScraperPage() {
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [checking, setChecking] = useState(null)

  const load = async () => {
    try {
      const { data } = await monitorsApi.list()
      setMonitors(data)
    } catch { toast.error('Failed to load monitors') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    if (editing) {
      const { data } = await monitorsApi.update(editing.id, form)
      setMonitors(ms => ms.map(m => m.id === editing.id ? data : m))
      toast.success('Monitor updated')
    } else {
      const { data } = await monitorsApi.create(form)
      setMonitors(ms => [data, ...ms])
      toast.success('Monitor created')
    }
    setEditing(null)
  }

  const handleCheckNow = async (m) => {
    setChecking(m.id)
    try {
      const { data } = await monitorsApi.checkNow(m.id)
      const status = data.error
        ? `Error: ${data.error}`
        : `Value: "${data.value_found}" — condition ${data.condition_met ? 'MET ✓' : 'not met'}`
      toast(status, { icon: data.condition_met ? '🔔' : '🔍', duration: 5000 })
      load()
      if (expanded === m.id) setExpanded(null)
      setTimeout(() => setExpanded(m.id), 100)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Check failed')
    } finally { setChecking(null) }
  }

  const handleDelete = async () => {
    await monitorsApi.delete(confirmDelete.id)
    setMonitors(ms => ms.filter(m => m.id !== confirmDelete.id))
    toast.success('Monitor deleted')
    setConfirmDelete(null)
  }

  const handleToggle = async (m) => {
    const newStatus = m.status === 'active' ? 'paused' : 'active'
    const { data } = await monitorsApi.update(m.id, { status: newStatus })
    setMonitors(ms => ms.map(x => x.id === m.id ? data : x))
    toast.success(`Monitor ${data.status}`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Web Monitor</h1>
          <p className="page-subtitle">Watch elements on any website and trigger alerts when they change</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={16} /> New Monitor
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>
      ) : monitors.length === 0 ? (
        <div className="card">
          <EmptyState icon={Globe} title="No monitors yet"
            description="Track prices, stock levels, news headlines, or any element on any website"
            action={
              <button onClick={() => setShowModal(true)} className="btn-primary inline-flex">
                <Plus size={15} /> Create monitor
              </button>
            } />
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {monitors.map(m => (
            <div key={m.id}>
              <div className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                  m.status === 'active' ? 'bg-emerald-500' :
                  m.status === 'error'  ? 'bg-red-500' : 'bg-slate-300'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{m.name}</p>
                    <span className={STATUS_STYLES[m.status] || 'badge-gray'}>{m.status}</span>
                    {m.notify_channels?.map(ch => (
                      <span key={ch} className="badge-gray capitalize text-xs">{ch}</span>
                    ))}
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{m.url}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-mono bg-slate-100 rounded px-1">{m.selector_type}</span>
                    {' '}<span className="font-mono text-slate-500">{m.selector}</span>
                    {m.condition_operator && (
                      <> · {OPERATORS.find(o => o.value === m.condition_operator)?.label}
                        {m.condition_value && ` "${m.condition_value}"`}</>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    <span>every {m.check_interval_minutes}m</span>
                    {m.last_checked_at && (
                      <span>checked {formatDistanceToNow(new Date(m.last_checked_at), { addSuffix: true })}</span>
                    )}
                    {m.last_value && (
                      <span>last: <span className="font-mono font-medium text-slate-600">"{m.last_value}"</span></span>
                    )}
                    {m.alert_count > 0 && (
                      <span className="text-amber-600 font-medium">{m.alert_count} alert{m.alert_count !== 1 ? 's' : ''}</span>
                    )}
                    {m.error_message && (
                      <span className="text-red-500 truncate max-w-48">{m.error_message}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleCheckNow(m)} disabled={checking === m.id}
                    className="btn-ghost p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50" title="Check now">
                    {checking === m.id
                      ? <div className="w-4 h-4 spinner" />
                      : <Play size={14} />}
                  </button>
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="btn-ghost p-2 text-slate-400" title="View logs">
                    {expanded === m.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => handleToggle(m)} className="btn-ghost p-2 text-slate-400"
                    title={m.status === 'active' ? 'Pause' : 'Activate'}>
                    <span className="text-xs font-medium">
                      {m.status === 'active' ? 'Pause' : 'Resume'}
                    </span>
                  </button>
                  <button onClick={() => { setEditing(m); setShowModal(true) }}
                    className="btn-ghost p-2 text-slate-400 hover:text-sky-600">
                    <span className="text-xs">Edit</span>
                  </button>
                  <button onClick={() => setConfirmDelete(m)}
                    className="btn-ghost p-2 text-slate-300 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expanded === m.id && <LogDrawer monitorId={m.id} />}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <MonitorModal
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      <ConfirmModal open={!!confirmDelete} title="Delete monitor?"
        message={`"${confirmDelete?.name}" and all its check logs will be permanently deleted.`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
