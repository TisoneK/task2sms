import { useState } from 'react'
import { Plus, X, Mail } from 'lucide-react'
import { emailApi } from '../services/api'
import Pagination from '../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const SC = { sent: 'badge-green', failed: 'badge-red', pending: 'badge-yellow' }

export default function EmailPage() {
  const [recipients, setRecipients] = useState([''])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPage, setHistPage] = useState(1)
  const [histLoading, setHistLoading] = useState(false)
  const [tab, setTab] = useState('send')

  const setRecipient = (i, v) => { const r = [...recipients]; r[i] = v; setRecipients(r) }

  const loadHistory = async (p = 1) => {
    setHistLoading(true)
    try {
      const { data } = await emailApi.history(p, 30)
      setHistory(data.items); setHistTotal(data.total); setHistPage(p)
    } catch { toast.error('Failed to load history') }
    finally { setHistLoading(false) }
  }

  const handleTabChange = t => { setTab(t); if (t === 'history') loadHistory() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = recipients.filter(Boolean)
    if (!clean.length) { toast.error('Add at least one recipient'); return }
    setLoading(true); setResults(null)
    try {
      const { data } = await emailApi.send({ recipients: clean, subject, body })
      setResults(data)
      if (data.failed === 0) toast.success(`${data.sent} email${data.sent > 1 ? 's' : ''} sent!`)
      else toast(`${data.sent} sent, ${data.failed} failed`, { icon: '⚠️' })
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed') }
    finally { setLoading(false) }
  }

  const TabBar = () => (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--muted)' }}>
      {['send', 'history'].map(t => (
        <button key={t} onClick={() => handleTabChange(t)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
          style={{
            background: tab === t ? 'var(--card)' : 'transparent',
            color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
            boxShadow: tab === t ? 'var(--shadow-card)' : 'none',
          }}>{t}</button>
      ))}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
             style={{ background: '#7c3aed' }}>
          <Mail size={18} />
        </div>
        <div>
          <h1 className="page-title">Email</h1>
          <p className="page-subtitle">Send email notifications</p>
        </div>
      </div>

      <TabBar />

      {tab === 'send' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Recipients</h2>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1" type="email" value={r}
                  onChange={e => setRecipient(i, e.target.value)} placeholder="user@example.com" />
                {recipients.length > 1 && (
                  <button type="button" className="btn-ghost p-2"
                    style={{ color: 'var(--destructive)' }}
                    onClick={() => setRecipients(r => r.filter((_, j) => j !== i))}>
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary text-sm"
              onClick={() => setRecipients(r => [...r, ''])}>
              <Plus size={14} /> Add recipient
            </button>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Message</h2>
            <div>
              <label className="label">Subject *</label>
              <input className="input" required value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Your subject line" />
            </div>
            <div>
              <label className="label">Body *</label>
              <textarea className="input resize-none" rows={6} required
                value={body} onChange={e => setBody(e.target.value)}
                placeholder="Write your message here…" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading
              ? <><span className="spinner-sm" /> Sending…</>
              : <><Mail size={15} /> Send Email</>}
          </button>

          {results && (
            <div className="card p-5 space-y-3 animate-fade-in">
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{results.sent}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sent</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>{results.failed}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Failed</p>
                </div>
              </div>
              {results.results?.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0"
                     style={{ borderColor: 'var(--border)' }}>
                  <span className="font-mono" style={{ color: 'var(--foreground)' }}>{r.email}</span>
                  <span className={SC[r.status?.value || r.status] || 'badge-gray'}>
                    {r.status?.value || r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {histLoading ? (
            <div className="flex justify-center py-12"><div className="spinner-lg" /></div>
          ) : history.length === 0 ? (
            <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              No emails sent yet.
            </div>
          ) : (
            <>
              <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
                {history.map(e => (
                  <div key={e.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{e.to_email}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--muted-foreground)' }}>{e.subject}</p>
                      {e.error_message && (
                        <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>{e.error_message}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={SC[e.status] || 'badge-gray'}>{e.status}</span>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDistanceToNow(new Date(e.sent_at || e.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={histPage} total={histTotal} perPage={30} onChange={loadHistory} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
