import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { webhooksApi } from '../services/api'
import { Plus, Trash2, ToggleRight, ToggleLeft, ChevronDown, ChevronUp, X, Zap } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { EmptyState } from '../components/ui/Feedback'
import toast from 'react-hot-toast'

const EVENT_LABELS = {
  'sms.sent':'SMS Sent','sms.failed':'SMS Failed','task.run':'Task Run',
  'task.failed':'Task Failed','email.sent':'Email Sent','whatsapp.sent':'WhatsApp Sent',
}
const PORTAL = () => document.getElementById('modal-root') || document.body

function WebhookModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || { name:'', url:'', secret:'', events:[], is_active:true })
  const [allEvents, setAllEvents] = useState(Object.keys(EVENT_LABELS))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    webhooksApi.eventTypes().then(({ data }) => setAllEvents(data.events)).catch(() => {})
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const toggleEvent = e => setForm(f => ({
    ...f, events: f.events.includes(e) ? f.events.filter(x => x !== e) : [...f.events, e]
  }))

  const submit = async ev => {
    ev.preventDefault()
    if (!form.events.length) { toast.error('Select at least one event'); return }
    setLoading(true)
    try { await onSave(form); onClose() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to save') }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative rounded-2xl w-full max-w-md animate-fade-in"
           style={{ background:'var(--card)', border:'1px solid var(--border)', boxShadow:'var(--shadow-modal)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom:'1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color:'var(--foreground)' }}>
            {initial ? 'Edit Webhook' : 'New Webhook'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div><label className="label">Name</label>
            <input className="input" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Webhook" /></div>
          <div><label className="label">Endpoint URL</label>
            <input className="input font-mono text-sm" required type="url" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com/webhook" /></div>
          <div><label className="label">Secret (HMAC — optional)</label>
            <input className="input font-mono text-sm" value={form.secret}
              onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="your-secret" /></div>
          <div>
            <label className="label">Events *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {allEvents.map(e => (
                <button type="button" key={e} onClick={() => toggleEvent(e)}
                  className="flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors"
                  style={{
                    borderColor: form.events.includes(e) ? 'var(--primary)' : 'var(--border)',
                    background: form.events.includes(e) ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                    color: form.events.includes(e) ? 'var(--primary)' : 'var(--foreground)',
                  }}>
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                       style={{
                         background: form.events.includes(e) ? 'var(--primary)' : 'transparent',
                         border: form.events.includes(e) ? 'none' : '1px solid var(--border)',
                       }}>
                    {form.events.includes(e) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                  </div>
                  {EVENT_LABELS[e] || e}
                </button>
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
    </div>,
    PORTAL()
  )
}

function DeliveriesDrawer({ webhookId }) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    webhooksApi.deliveries(webhookId).then(({ data }) => setDeliveries(data)).finally(() => setLoading(false))
  }, [webhookId])
  return (
    <div style={{ borderTop:'1px solid var(--border)' }}>
      <div className="px-5 py-2.5" style={{ background:'var(--muted)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted-foreground)' }}>
          Recent Deliveries
        </p>
      </div>
      {loading ? <div className="flex justify-center py-6"><div className="spinner-sm" /></div>
       : deliveries.length === 0
       ? <p className="text-sm text-center py-6" style={{ color:'var(--muted-foreground)' }}>No deliveries yet</p>
       : deliveries.slice(0, 10).map(d => (
         <div key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"
              style={{ borderTop:'1px solid var(--border)' }}>
           <span className={d.status === 'delivered' ? 'badge-green' : 'badge-red'}>{d.status}</span>
           <span style={{ color:'var(--muted-foreground)' }}>{EVENT_LABELS[d.event] || d.event}</span>
           {d.response_status && <span className="font-mono text-xs" style={{ color:'var(--muted-foreground)' }}>{d.response_status}</span>}
           {d.error && <span className="text-xs truncate flex-1" style={{ color:'var(--destructive)' }}>{d.error}</span>}
           <span className="text-xs ml-auto shrink-0" style={{ color:'var(--muted-foreground)' }}>
             {d.created_at ? new Date(d.created_at).toLocaleTimeString() : ''}
           </span>
         </div>
       ))}
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
    try { const { data } = await webhooksApi.list(); setWebhooks(data) }
    catch { toast.error('Failed to load webhooks') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleSave = async form => {
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

  const handleToggle = async wh => {
    const { data } = await webhooksApi.update(wh.id, { is_active: !wh.is_active })
    setWebhooks(ws => ws.map(w => w.id === wh.id ? data : w))
    toast.success(data.is_active ? 'Enabled' : 'Disabled')
  }

  const handleDelete = async () => {
    await webhooksApi.delete(confirmDelete.id)
    setWebhooks(ws => ws.filter(w => w.id !== confirmDelete.id))
    toast.success('Webhook deleted'); setConfirmDelete(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-subtitle">HTTP callbacks fired on every event</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={15} /> New Webhook
        </button>
      </div>

      {loading ? <div className="flex justify-center py-20"><div className="spinner-lg" /></div>
       : webhooks.length === 0 ? (
        <div className="card">
          <EmptyState icon={Zap} title="No webhooks yet"
            description="Get HTTP callbacks on every SMS, task, and email event"
            action={<button onClick={() => setShowModal(true)} className="btn-primary inline-flex"><Plus size={14} /> Create webhook</button>} />
        </div>
       ) : (
        <div className="card divide-y" style={{ borderColor:'var(--border)' }}>
          {webhooks.map(wh => (
            <div key={wh.id}>
              <div className="flex items-start gap-4 px-5 py-4 transition-colors"
                   style={{ cursor:'default' }}
                   onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
                   onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color:'var(--foreground)' }}>{wh.name}</p>
                    <span className={wh.is_active ? 'badge-green' : 'badge-gray'}>
                      {wh.is_active ? 'active' : 'disabled'}
                    </span>
                  </div>
                  <p className="text-xs font-mono mt-0.5 truncate" style={{ color:'var(--muted-foreground)' }}>{wh.url}</p>
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {(wh.events || []).map(e => (
                      <span key={e} className="badge-gray text-xs">{EVENT_LABELS[e] || e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setExpanded(expanded === wh.id ? null : wh.id)}
                    className="btn-ghost p-2" title="View deliveries">
                    {expanded === wh.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => handleToggle(wh)} className="btn-ghost p-2">
                    {wh.is_active
                      ? <ToggleRight size={17} style={{ color:'#16a34a' }} />
                      : <ToggleLeft size={17} style={{ color:'var(--muted-foreground)' }} />}
                  </button>
                  <button onClick={() => { setEditing(wh); setShowModal(true) }}
                    className="btn-ghost px-2.5 py-1.5 text-xs" style={{ color:'var(--muted-foreground)' }}>
                    Edit
                  </button>
                  <button onClick={() => setConfirmDelete(wh)}
                    className="btn-ghost p-2" style={{ color:'var(--destructive)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expanded === wh.id && <DeliveriesDrawer webhookId={wh.id} />}
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
