import { useState } from 'react'
import { Plus, X, Mail } from 'lucide-react'
import { emailApi } from '../services/api'
import Pagination from '../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = { sent: 'badge-green', failed: 'badge-red', pending: 'badge-yellow' }

export default function EmailPage() {
  const [recipients, setRecipients] = useState([''])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
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
      const { data } = await emailApi.history(p, 30)
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
      const { data } = await emailApi.send({ recipients: clean, subject, body })
      setResults(data)
      if (data.failed === 0) toast.success(`${data.sent} email${data.sent > 1 ? 's' : ''} sent!`)
      else toast(`${data.sent} sent, ${data.failed} failed`, { icon: '⚠️' })
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
          <Mail size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email</h1>
          <p className="text-gray-500 text-sm">Send email notifications</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {['send', 'history'].map(t => (
          <button key={t} onClick={() => handleTabChange(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>{t}</button>
        ))}
      </div>

      {tab === 'send' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Recipients</h2>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1" type="email" value={r}
                  onChange={e => setRecipient(i, e.target.value)} placeholder="user@example.com" />
                {recipients.length > 1 && (
                  <button type="button" onClick={() => removeRecipient(i)} className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addRecipient} className="btn-secondary text-sm">
              <Plus size={15} /> Add recipient
            </button>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Message</h2>
            <div>
              <label className="label">Subject *</label>
              <input className="input" required value={subject}
                onChange={e => setSubject(e.target.value)} placeholder="Your subject line" />
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
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              : <><Mail size={16} /> Send Email</>}
          </button>

          {results && (
            <div className="card p-5 space-y-3">
              <div className="flex gap-6">
                <div className="text-center"><p className="text-2xl font-bold text-green-600">{results.sent}</p><p className="text-xs text-gray-500">Sent</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-red-500">{results.failed}</p><p className="text-xs text-gray-500">Failed</p></div>
              </div>
              {results.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-gray-700">{r.email}</span>
                  <span className={STATUS_COLORS[r.status?.value || r.status] || 'badge-gray'}>{r.status?.value || r.status}</span>
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
            <div className="card p-10 text-center text-gray-400 text-sm">No emails sent yet.</div>
          ) : (
            <>
              <div className="card divide-y divide-gray-100">
                {history.map(e => (
                  <div key={e.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{e.to_email}</p>
                      <p className="text-sm text-gray-500 truncate">{e.subject}</p>
                      {e.error_message && <p className="text-xs text-red-500 mt-1">{e.error_message}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={STATUS_COLORS[e.status] || 'badge-gray'}>{e.status}</span>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(e.sent_at || e.created_at), { addSuffix: true })}
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
