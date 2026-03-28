import { useState } from 'react'
import { Plus, X, MessageCircle } from 'lucide-react'
import { whatsappApi } from '../services/api'
import { useNotifications } from '../hooks/useData'
import Pagination from '../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = { sent: 'badge-green', delivered: 'badge-green', read: 'badge-blue', failed: 'badge-red', pending: 'badge-yellow' }

export default function WhatsAppPage() {
  const [recipients, setRecipients] = useState([''])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [tab, setTab] = useState('send')

  const setRecipient = (i, v) => { const r = [...recipients]; r[i] = v; setRecipients(r) }
  const addRecipient = () => setRecipients(r => [...r, ''])
  const removeRecipient = (i) => setRecipients(r => r.filter((_, idx) => idx !== i))

  const loadHistory = async (p = 1) => {
    setHistoryLoading(true)
    try {
      const { data } = await whatsappApi.history(p, 30)
      setHistory(data.items)
      setHistoryTotal(data.total)
      setHistoryPage(p)
    } catch { toast.error('Failed to load history') }
    finally { setHistoryLoading(false) }
  }

  const handleTabChange = (t) => { setTab(t); if (t === 'history') loadHistory() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = recipients.filter(Boolean)
    if (!clean.length) { toast.error('Add at least one recipient'); return }
    setLoading(true); setResults(null)
    try {
      const { data } = await whatsappApi.send({ recipients: clean, message })
      setResults(data)
      if (data.failed === 0) toast.success(`${data.sent} WhatsApp message${data.sent > 1 ? 's' : ''} sent!`)
      else toast(`${data.sent} sent, ${data.failed} failed`, { icon: '⚠️' })
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
          <MessageCircle size={20} className="text-white" />
        </div>
        <div>
          <h1 className="page-title">WhatsApp</h1>
          <p className="page-subtitle">Send messages via WhatsApp</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: 'var(--muted)' }}>
        {['send', 'history'].map(t => (
          <button key={t} onClick={() => handleTabChange(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted hover:text-foreground'
            }`}>{t}</button>
        ))}
      </div>

      {tab === 'send' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recipients</h2>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1" value={r} onChange={e => setRecipient(i, e.target.value)}
                  placeholder="+254712345678" type="tel" />
                {recipients.length > 1 && (
                  <button type="button" onClick={() => removeRecipient(i)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--muted-foreground)' }} onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--muted)'} onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addRecipient} className="btn-secondary text-sm">
              <Plus size={15} /> Add recipient
            </button>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Message</h2>
            <textarea className="input resize-none" rows={5} required maxLength={4096}
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Type your WhatsApp message…" 
              style={{ backgroundColor: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' }} />
            <p className="text-xs text-right" style={{ color: 'var(--muted-foreground)' }}>{message.length}/4096</p>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center"
            style={{ background: '#25D366', borderColor: '#25D366' }}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              : <><MessageCircle size={16} /> Send WhatsApp</>}
          </button>

          {results && (
            <div className="card p-5 space-y-3">
              <div className="flex gap-6">
                <div className="text-center"><p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>{results.sent}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sent</p></div>
                <div className="text-center"><p className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>{results.failed}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Failed</p></div>
              </div>
              {results.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono" style={{ color: 'var(--foreground)' }}>{r.recipient}</span>
                  <span className={STATUS_COLORS[r.status] || 'badge-gray'}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {historyLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : history.length === 0 ? (
            <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No messages sent yet.</div>
          ) : (
            <>
              <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
                {history.map(m => (
                  <div key={m.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{m.recipient}</p>
                      <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--muted-foreground)' }}>{m.message}</p>
                      {m.error_message && <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>{m.error_message}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={STATUS_COLORS[m.status] || 'badge-gray'}>{m.status}</span>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDistanceToNow(new Date(m.sent_at || m.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={historyPage} total={historyTotal} perPage={30} onChange={loadHistory} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
