import { useState } from 'react'
import { Plus, X, Send } from 'lucide-react'
import { notificationsApi } from '../services/api'
import toast from 'react-hot-toast'

const PROVIDERS = ['africastalking', 'twilio', 'gsm']

const getErrorDetails = (errorString) => {
  if (!errorString) return []
  
  // Parse error string like "Blacklisted/DND: Number in DND registry - dial *456*9*5*1# to enable"
  const parts = errorString.split(':')
  if (parts.length < 2) return [{ message: errorString }]
  
  const errorType = parts[0].trim()
  const details = parts[1].trim()
  
  // Split details by dash for message and solution
  const detailParts = details.split('-')
  const message = detailParts[0]?.trim() || ''
  const solution = detailParts[1]?.trim() || ''
  
  return [
    {
      type: errorType,
      message: message,
      solution: solution
    }
  ]
}

export default function SendSMSPage() {
  const [recipients, setRecipients] = useState([''])
  const [message, setMessage] = useState('')
  const [provider, setProvider] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)

  const setRecipient = (i, v) => {
    const r = [...recipients]; r[i] = v; setRecipients(r)
  }
  const addRecipient = () => setRecipients(r => [...r, ''])
  const removeRecipient = (i) => setRecipients(r => r.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = recipients.filter(Boolean)
    if (!clean.length) { toast.error('Add at least one recipient'); return }
    setLoading(true)
    setResults(null)
    try {
      const { data } = await notificationsApi.sendSms({
        recipients: clean,
        message,
        provider: provider || null,
      })
      setResults(data)
      if (data.failed === 0) toast.success(`All ${data.sent} SMS sent!`)
      else toast(`${data.sent} sent, ${data.failed} failed`, { icon: '⚠️' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Send failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Send SMS</h1>
        <p className="page-subtitle">Send a one-off SMS immediately</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recipients</h2>
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input flex-1"
                value={r}
                onChange={e => setRecipient(i, e.target.value)}
                placeholder="+254712345678"
                type="tel"
              />
              {recipients.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRecipient(i)}
                  className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
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
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Message</h2>
          <div>
            <label className="label">Message *</label>
            <textarea
              className="input resize-none"
              rows={4}
              required
              maxLength={640}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message here..."
            />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--muted-foreground)' }}>{message.length}/640</p>
          </div>
          <div>
            <label className="label">Provider (optional)</label>
            <select className="input" value={provider} onChange={e => setProvider(e.target.value)}>
              <option value="">Use default</option>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
            : <><Send size={16} /> Send SMS</>
          }
        </button>
      </form>

      {results && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>{results.sent}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sent</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>{results.failed}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Failed</p>
            </div>
          </div>
          <div className="space-y-3">
            {results.results.map((r, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm" style={{ color: 'var(--foreground)' }}>{r.recipient}</span>
                  {r.success ? (
                    <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">Sent</span>
                  ) : (
                    <div className="text-right">
                      <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">Failed</span>
                    </div>
                  )}
                </div>
                
                {!r.success && r.error && (
                  <div className="bg-gray-50 rounded p-3 space-y-2">
                    {getErrorDetails(r.error).map((detail, idx) => (
                      <div key={idx} className="text-sm">
                        {detail.type && (
                          <div className="font-medium text-gray-900">{detail.type}</div>
                        )}
                        {detail.message && (
                          <div className="text-gray-700">{detail.message}</div>
                        )}
                        {detail.solution && (
                          <div className="text-blue-700 font-medium pt-1">{detail.solution}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
