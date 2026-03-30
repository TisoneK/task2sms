import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { monitorsApi } from '../services/api'
import { Plus, Trash2, Play, Globe, X, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const SELECTOR_TYPES = [
  { value:'css',   label:'CSS Selector',  placeholder:'div.price, span#stock' },
  { value:'xpath', label:'XPath',          placeholder:'//span[@class="price"]' },
  { value:'text',  label:'Text Contains',  placeholder:'out of stock' },
  { value:'regex', label:'Regex',          placeholder:'\\$([\\d,.]+)' },
]
const OPERATORS = [
  { value:'changed',     label:'Changed (any change)' },
  { value:'contains',    label:'Contains text' },
  { value:'not_contains',label:'Does not contain' },
  { value:'eq',   label:'= equals' },    { value:'neq', label:'≠ not equals' },
  { value:'gt',   label:'> greater' },   { value:'gte', label:'≥ greater or equal' },
  { value:'lt',   label:'< less' },      { value:'lte', label:'≤ less or equal' },
]
const CHANNELS = ['sms','email','whatsapp','telegram']
const STATUS_STYLE = { active:'badge-green', paused:'badge-yellow', error:'badge-red' }
const PORTAL = () => document.getElementById('modal-root') || document.body

function MonitorModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || {
    name:'', url:'', selector_type:'css', selector:'', attribute:'',
    use_playwright: false, wait_selector:'', wait_ms: 2000,
    condition_operator:'changed', condition_value:'',
    notify_channels:[], notify_recipients:[],
    message_template:'Monitor alert: {name} — value is now {value}',
    check_interval_minutes: 60,
  })
  const [recipientInput, setRecipientInput] = useState((initial?.notify_recipients||[]).join(', '))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggleChannel = ch => setForm(f => ({
    ...f, notify_channels: f.notify_channels.includes(ch)
      ? f.notify_channels.filter(c => c !== ch)
      : [...f.notify_channels, ch]
  }))

  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try {
      const recipients = recipientInput.split(',').map(s => s.trim()).filter(Boolean)
      await onSave({
        ...form,
        notify_recipients: recipients,
        attribute: form.attribute || null,
        wait_selector: form.wait_selector || null,
        condition_value: form.condition_value || null,
      })
      onClose()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save') }
    finally { setLoading(false) }
  }

  const selType = SELECTOR_TYPES.find(s => s.value === form.selector_type)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background:'rgba(0,0,0,0.55)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin animate-fade-in"
           style={{ background:'var(--card)', border:'1px solid var(--border)', boxShadow:'var(--shadow-modal)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
             style={{ background:'var(--card)', borderBottom:'1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color:'var(--foreground)' }}>
            {initial ? 'Edit Monitor' : 'New Web Monitor'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">

          {/* Target */}
          <div className="space-y-3">
            <div><label className="label">Monitor Name</label>
              <input className="input" required value={form.name} onChange={set('name')} placeholder="Amazon price tracker" /></div>
            <div><label className="label">URL to Monitor</label>
              <input className="input font-mono text-sm" required type="url" value={form.url} onChange={set('url')}
                placeholder="https://example.com/product" /></div>
          </div>

          {/* Dynamic page */}
          <div className="rounded-xl p-4 space-y-3" style={{ background:'var(--muted)', border:'1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color:'var(--foreground)' }}>Dynamic Page (JavaScript)</p>
                <p className="text-xs mt-0.5" style={{ color:'var(--muted-foreground)' }}>
                  Enable for React/Vue/Angular apps, lazy-loaded content
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                  checked={form.use_playwright}
                  onChange={e => setForm(f => ({ ...f, use_playwright: e.target.checked }))} />
                <span className="text-sm font-medium" style={{ color:'var(--foreground)' }}>Playwright</span>
              </label>
            </div>
            {form.use_playwright && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Wait for selector <span style={{ color:'var(--muted-foreground)', fontWeight:400 }}>(optional)</span></label>
                  <input className="input font-mono text-sm" value={form.wait_selector} onChange={set('wait_selector')}
                    placeholder=".product-price" /></div>
                <div><label className="label">Wait time (ms)</label>
                  <input className="input" type="number" min={500} max={15000} value={form.wait_ms}
                    onChange={e => setForm(f => ({ ...f, wait_ms: Number(e.target.value) }))} /></div>
              </div>
            )}
          </div>

          {/* Extraction */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted-foreground)' }}>What to Extract</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Selector Type</label>
                <select className="input" value={form.selector_type} onChange={set('selector_type')}>
                  {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select></div>
              {form.selector_type === 'css' && (
                <div><label className="label">Attribute <span style={{ color:'var(--muted-foreground)', fontWeight:400 }}>(blank = text)</span></label>
                  <input className="input font-mono text-sm" value={form.attribute} onChange={set('attribute')}
                    placeholder="href, src, data-price" /></div>
              )}
            </div>
            <div><label className="label">Selector / Pattern</label>
              <input className="input font-mono text-sm" required value={form.selector} onChange={set('selector')}
                placeholder={selType?.placeholder} /></div>
          </div>

          {/* Condition */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted-foreground)' }}>Alert Condition</p>
            <div className="flex gap-3">
              <div className="flex-1"><label className="label">Condition</label>
                <select className="input" value={form.condition_operator} onChange={set('condition_operator')}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></div>
              {form.condition_operator !== 'changed' && (
                <div className="flex-1"><label className="label">Value</label>
                  <input className="input" value={form.condition_value} onChange={set('condition_value')} placeholder="100" /></div>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted-foreground)' }}>Notifications</p>
            <div><label className="label">Channels</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {CHANNELS.map(ch => (
                  <button type="button" key={ch} onClick={() => toggleChannel(ch)}
                    className="px-3 py-1.5 rounded-lg border text-sm font-medium capitalize transition-colors"
                    style={{
                      borderColor: form.notify_channels.includes(ch) ? 'var(--primary)' : 'var(--border)',
                      background: form.notify_channels.includes(ch) ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                      color: form.notify_channels.includes(ch) ? 'var(--primary)' : 'var(--foreground)',
                    }}>{ch}</button>
                ))}
              </div>
            </div>
            <div><label className="label">Recipients <span style={{ color:'var(--muted-foreground)', fontWeight:400 }}>(comma-separated phones/emails/chat IDs)</span></label>
              <input className="input text-sm" value={recipientInput} onChange={e => setRecipientInput(e.target.value)}
                placeholder="+254712345678, user@email.com, 123456789" /></div>
            <div><label className="label">Message Template</label>
              <textarea className="input resize-none text-sm font-mono" rows={2} value={form.message_template} onChange={set('message_template')} />
              <p className="text-xs mt-1" style={{ color:'var(--muted-foreground)' }}>
                Variables: <code className="font-mono">{'{name}'}</code> <code className="font-mono">{'{value}'}</code> <code className="font-mono">{'{prev_value}'}</code> <code className="font-mono">{'{url}'}</code>
              </p>
              {form.message_template && (
                <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background:'var(--muted)', border:'1px solid var(--border)', color:'var(--foreground)' }}>
                  <span className="font-semibold uppercase tracking-wide text-[10px]" style={{ color:'var(--muted-foreground)' }}>Preview: </span>
                  {form.message_template
                    .replace(/\{name\}/g, form.name || 'My Monitor')
                    .replace(/\{value\}/g, '129.67')
                    .replace(/\{prev_value\}/g, '130.12')
                    .replace(/\{url\}/g, form.url || 'https://example.com')
                    .replace(/\{selector\}/g, form.selector || 'input')}
                </div>
              )}
            </div>
            <div><label className="label">Check Interval (minutes)</label>
              <input className="input" type="number" min={1} max={10080} value={form.check_interval_minutes}
                onChange={e => setForm(f => ({ ...f, check_interval_minutes: Number(e.target.value) }))} /></div>
          </div>

          <div className="flex gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center mt-2">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center mt-2">
              {loading ? 'Saving…' : initial ? 'Update Monitor' : 'Create Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    PORTAL()
  )
}

function LogDrawer({ monitorId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    monitorsApi.logs(monitorId).then(({ data }) => setLogs(data)).finally(() => setLoading(false))
  }, [monitorId])
  return (
    <div style={{ borderTop:'1px solid var(--border)' }}>
      <div className="px-5 py-2.5" style={{ background:'var(--muted)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted-foreground)' }}>Check Log</p>
      </div>
      {loading ? <div className="flex justify-center py-5"><div className="spinner-sm" /></div>
       : logs.length === 0
       ? <p className="text-sm text-center py-5" style={{ color:'var(--muted-foreground)' }}>No checks yet</p>
       : (
        <div className="divide-y max-h-56 overflow-y-auto scrollbar-thin" style={{ borderColor:'var(--border)' }}>
          {logs.map(l => (
            <div key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              {l.error
                ? <AlertCircle size={13} style={{ color:'var(--destructive)', marginTop:2 }} className="shrink-0" />
                : l.condition_met
                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                  : <Clock size={13} className="shrink-0 mt-0.5" style={{ color:'var(--muted-foreground)' }} />}
              <div className="flex-1 min-w-0">
                {l.value_found !== null && l.value_found !== undefined ? (
                  <p className="font-mono text-xs truncate" style={{ color:'var(--foreground)' }}>
                    value: <span className="font-semibold">{l.value_found === '' ? <span style={{ color:'var(--muted-foreground)', fontStyle:'italic' }}>empty</span> : l.value_found}</span>
                    {l.prev_value !== null && l.prev_value !== undefined && l.prev_value !== l.value_found && (
                      <span style={{ color:'var(--muted-foreground)' }}> (was: {l.prev_value})</span>
                    )}
                  </p>
                ) : (
                  <p className="font-mono text-xs" style={{ color:'var(--muted-foreground)', fontStyle:'italic' }}>no value extracted</p>
                )}
                {l.error && <p className="text-xs" style={{ color:'var(--destructive)' }}>{l.error}</p>}
                {l.alerted && <span className="badge-blue text-xs ml-1">alerted</span>}
              </div>
              <p className="text-xs shrink-0" style={{ color:'var(--muted-foreground)' }}>
                {formatDistanceToNow(new Date(l.checked_at.endsWith('Z') ? l.checked_at : l.checked_at + 'Z'), { addSuffix:true })}
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
    try { const { data } = await monitorsApi.list(); setMonitors(data) }
    catch { toast.error('Failed to load monitors') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleSave = async form => {
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

  const handleCheck = async m => {
    setChecking(m.id)
    try {
      const { data } = await monitorsApi.checkNow(m.id)
      const msg = data.error
        ? `Error: ${data.error}`
        : `Value: "${data.value_found}" — ${data.condition_met ? 'condition MET ✓' : 'condition not met'}`
      toast(msg, { icon: data.condition_met ? '🔔' : '🔍', duration: 5000 })
      load()
      setExpanded(null)
      setTimeout(() => setExpanded(m.id), 50)
    } catch (err) { toast.error(err.response?.data?.detail || 'Check failed') }
    finally { setChecking(null) }
  }

  const handleToggle = async m => {
    const { data } = await monitorsApi.update(m.id, { status: m.status === 'active' ? 'paused' : 'active' })
    setMonitors(ms => ms.map(x => x.id === m.id ? data : x))
    toast.success(`Monitor ${data.status}`)
  }

  const handleDelete = async () => {
    await monitorsApi.delete(confirmDelete.id)
    setMonitors(ms => ms.filter(m => m.id !== confirmDelete.id))
    toast.success('Monitor deleted'); setConfirmDelete(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Web Monitor</h1>
          <p className="page-subtitle">Watch any element on any site — static or JavaScript-rendered</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={15} /> New Monitor
        </button>
      </div>

      {loading ? <div className="flex justify-center py-20"><div className="spinner-lg" /></div>
       : monitors.length === 0 ? (
        <div className="card">
          <EmptyState icon={Globe} title="No monitors yet"
            description="Track prices, stock levels, headlines — on any website including SPAs"
            action={<button onClick={() => setShowModal(true)} className="btn-primary inline-flex"><Plus size={14} /> Create monitor</button>} />
        </div>
       ) : (
        <div className="card divide-y" style={{ borderColor:'var(--border)' }}>
          {monitors.map(m => (
            <div key={m.id}>
              <div className="flex items-start gap-3 px-5 py-4 transition-colors"
                   onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
                   onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div className="w-2 h-2 rounded-full mt-2 shrink-0"
                     style={{ background: m.status==='active' ? '#16a34a' : m.status==='error' ? 'var(--destructive)' : 'var(--muted-foreground)' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color:'var(--foreground)' }}>{m.name}</p>
                    <span className={STATUS_STYLE[m.status] || 'badge-gray'}>{m.status}</span>
                    {m.use_playwright && <span className="badge-purple">playwright</span>}
                    {(m.notify_channels||[]).map(ch => (
                      <span key={ch} className="badge-gray capitalize text-xs">{ch}</span>
                    ))}
                  </div>
                  <p className="text-xs font-mono mt-0.5 truncate" style={{ color:'var(--muted-foreground)' }}>{m.url}</p>
                  <p className="text-xs mt-0.5" style={{ color:'var(--muted-foreground)' }}>
                    <span className="font-mono rounded px-1 mr-1" style={{ background:'var(--muted)' }}>{m.selector_type}</span>
                    <span className="font-mono" style={{ color:'var(--foreground)', opacity:0.7 }}>
                      {m.selector.length > 50 ? m.selector.slice(0,50) + '…' : m.selector}
                    </span>
                    {m.condition_operator && (
                      <> · {OPERATORS.find(o=>o.value===m.condition_operator)?.label}
                        {m.condition_value && ` "${m.condition_value}"`}</>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color:'var(--muted-foreground)' }}>
                    <span>every {m.check_interval_minutes}m</span>
                    {m.last_checked_at && (
                      <span>checked {formatDistanceToNow(new Date(m.last_checked_at.endsWith('Z') ? m.last_checked_at : m.last_checked_at + 'Z'), { addSuffix:true })}</span>
                    )}
                    {m.last_value !== null && m.last_value !== undefined && (
                      <span>last: <span className="font-mono font-medium" style={{ color: m.last_value === '' ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
                        {m.last_value === '' ? <em>empty</em> : `"${m.last_value}"`}
                      </span></span>
                    )}
                    {m.alert_count > 0 && (
                      <span style={{ color:'#d97706', fontWeight:600 }}>
                        {m.alert_count} alert{m.alert_count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {m.error_message && (
                      <span className="truncate max-w-48" style={{ color:'var(--destructive)' }}>{m.error_message}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleCheck(m)} disabled={checking === m.id}
                    className="btn-ghost p-2" title="Check now">
                    {checking === m.id ? <div className="spinner-sm" /> : <Play size={14} />}
                  </button>
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="btn-ghost p-2">
                    {expanded === m.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => handleToggle(m)}
                    className="btn-ghost px-2.5 py-1.5 text-xs" style={{ color:'var(--muted-foreground)' }}>
                    {m.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => { setEditing(m); setShowModal(true) }}
                    className="btn-ghost px-2.5 py-1.5 text-xs" style={{ color:'var(--muted-foreground)' }}>
                    Edit
                  </button>
                  <button onClick={() => setConfirmDelete(m)}
                    className="btn-ghost p-2" style={{ color:'var(--destructive)' }}>
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
        message={`"${confirmDelete?.name}" and all check logs will be permanently deleted.`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
