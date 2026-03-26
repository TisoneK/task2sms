import { useState, useEffect } from 'react'
import { webhooksApi } from '../services/api'
import { Plus, Trash2, ToggleRight, ToggleLeft, ChevronDown, ChevronUp, X, Zap } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { EmptyState } from '../components/ui/Feedback'
import toast from 'react-hot-toast'

const EVENT_LABELS = {
  'sms.sent': 'SMS Sent', 'sms.failed': 'SMS Failed',
  'task.run': 'Task Run', 'task.failed': 'Task Failed',
  'email.sent': 'Email Sent', 'whatsapp.sent': 'WhatsApp Sent',
}

function WebhookModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || { name: '', url: '', secret: '', events: [], is_active: true })
  const [allEvents, setAllEvents] = useState(Object.keys(EVENT_LABELS))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    webhooksApi.eventTypes().then(({ data }) => setAllEvents(data.events)).catch(() => {})
  }, [])

  const toggleEvent = (e) => setForm(f => ({
    ...f, events: f.events.includes(e) ? f.events.filter(x => x !== e) : [...f.events, e]
  }))

  const submit = async (ev) => {
    ev.preventDefault()
    if (!form.events.length) { toast.error('Select at least one event'); return }
    setLoading(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{initial ? 'Edit Webhook' : 'New Webhook'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Webhook" />
          </div>
          <div>
            <label className="label">Endpoint URL</label>
            <input className="input font-mono text-sm" required type="url" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/webhook" />
          </div>
          <div>
            <label className="label">Secret (optional — for HMAC verification)</label>
            <input className="input font-mono text-sm" value={form.secret}
              onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="your-secret-key" />
          </div>
          <div>
            <label className="label">Events *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {allEvents.map(e => (
                <label key={e} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  form.events.includes(e) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="checkbox" className="hidden" checked={form.events.includes(e)}
                    onChange={() => toggleEvent(e)} />
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    form.events.includes(e) ? 'bg-brand-500 border-brand-500' : 'border-gray-300'
                  }`}>
                    {form.events.includes(e) && <span className="text-white text-xs">✓</span>}
                  </div>
                  {EVENT_LABELS[e] || e}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving…' : initial ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeliveriesDrawer({ webhookId, onClose }) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    webhooksApi.deliveries(webhookId)
      .then(({ data }) => setDeliveries(data))
      .finally(() => setLoading(false))
  }, [webhookId])

  return (
    <div className="mt-2 border-t border-gray-100">
      <div className="px-5 py-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Deliveries</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : deliveries.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No deliveries yet</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {deliveries.slice(0, 10).map(d => (
            <div key={d.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className={d.status === 'delivered' ? 'badge-green' : 'badge-red'}>{d.status}</span>
              <span className="text-gray-500">{EVENT_LABELS[d.event] || d.event}</span>
              {d.response_status && <span className="font-mono text-xs text-gray-400">{d.response_status}</span>}
              {d.error && <span className="text-red-400 text-xs truncate flex-1">{d.error}</span>}
              <span className="text-xs text-gray-300 ml-auto shrink-0">
                {d.created_at ? new Date(d.created_at).toLocaleTimeString() : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    try {
      const { data } = await webhooksApi.list()
      setWebhooks(data)
    } catch { toast.error('Failed to load webhooks') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    if (editing) {
      const { data } = await webhooksApi.update(editing.id, form)
      setWebhooks(ws => ws.map(w => w.id === editing.id ? data : w))
      toast.success('Webhook updated')
    } else {
      const { data } = await webhooksApi.create(form)
      setWebhooks(ws => [data, ...ws])
      toast.success('Webhook created')
    }
    setEditing(null)
  }

  const handleToggle = async (wh) => {
    const { data } = await webhooksApi.update(wh.id, { is_active: !wh.is_active })
    setWebhooks(ws => ws.map(w => w.id === wh.id ? data : w))
    toast.success(data.is_active ? 'Webhook enabled' : 'Webhook disabled')
  }

  const handleDelete = async () => {
    await webhooksApi.delete(confirmDelete.id)
    setWebhooks(ws => ws.filter(w => w.id !== confirmDelete.id))
    toast.success('Webhook deleted')
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-500 text-sm">HTTP callbacks for every event</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={16} /> New Webhook
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : webhooks.length === 0 ? (
        <div className="card">
          <EmptyState icon={Zap} title="No webhooks yet"
            description="Get notified via HTTP when SMS, tasks, or emails fire"
            action={<button onClick={() => setShowModal(true)} className="btn-primary inline-flex"><Plus size={15} /> Create webhook</button>} />
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {webhooks.map(wh => (
            <div key={wh.id}>
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{wh.name}</p>
                    <span className={wh.is_active ? 'badge-green' : 'badge-gray'}>
                      {wh.is_active ? 'active' : 'disabled'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{wh.url}</p>
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {(wh.events || []).map(e => (
                      <span key={e} className="badge bg-gray-100 text-gray-600 text-xs">{EVENT_LABELS[e] || e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setExpanded(expanded === wh.id ? null : wh.id)}
                    className="btn-ghost p-2 text-gray-400" title="View deliveries">
                    {expanded === wh.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button onClick={() => handleToggle(wh)} className="btn-ghost p-2">
                    {wh.is_active ? <ToggleRight size={15} className="text-green-500" /> : <ToggleLeft size={15} className="text-gray-400" />}
                  </button>
                  <button onClick={() => { setEditing(wh); setShowModal(true) }} className="btn-ghost p-2 text-gray-400 hover:text-brand-600">
                    <span className="text-xs">Edit</span>
                  </button>
                  <button onClick={() => setConfirmDelete(wh)} className="btn-ghost p-2 text-gray-300 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {expanded === wh.id && <DeliveriesDrawer webhookId={wh.id} onClose={() => setExpanded(null)} />}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <WebhookModal
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      <ConfirmModal open={!!confirmDelete} title="Delete webhook?"
        message={`"${confirmDelete?.name}" will be permanently deleted.`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
