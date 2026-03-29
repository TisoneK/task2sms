import { useState, useRef, useEffect } from 'react'
import { Plus, X, Send, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { notificationsApi } from '../services/api'
import toast from 'react-hot-toast'

const PROVIDERS = ['africastalking', 'twilio', 'gsm']

const AT_STATUS_MAP = {
  100: { label: 'Queued',                   success: true,  solution: null,
         note: 'Accepted and queued — will be delivered shortly.' },
  101: { label: 'Sent',                      success: true,  solution: null, note: null },
  102: { label: 'Invalid Phone Number',      success: false,
         solution: 'Use international format e.g. +254712345678.' },
  103: { label: 'Low Account Balance',       success: false,
         solution: "Top up your Africa's Talking account at account.africastalking.com." },
  104: { label: 'Unsupported Number Type',   success: false,
         solution: 'This number type cannot receive SMS via this route.' },
  105: { label: 'Invalid Sender ID',         success: false,
         solution: 'Your Sender ID may not be approved. Try sending without one.' },
  106: { label: 'Invalid Number',            success: false,
         solution: 'Check the phone number and try again.' },
  401: { label: 'Risk Hold',                 success: false,
         solution: "Account flagged for review. Contact Africa's Talking support." },
  402: { label: 'Invalid Sender ID',         success: false,
         solution: 'This Sender ID is not approved for your account.' },
  403: { label: 'Invalid Phone Number',      success: false,
         solution: 'The number could not be validated. Check the format.' },
  404: { label: 'Subscriber Absent',         success: false,
         solution: 'Phone may be off or out of coverage. Try again later.' },
  405: { label: 'Insufficient Balance',      success: false,
         solution: "Top up your Africa's Talking account at account.africastalking.com." },
  406: { label: 'Number Blacklisted / DND',  success: false,
         solution: 'Recipient opted out of SMS. To re-enable: Safaricom dial *456*9*5*1#, Airtel dial *321#, Telkom dial *456#.' },
  407: { label: 'Could Not Route',           success: false,
         solution: "Message could not be routed. Try again or contact Africa's Talking support." },
  409: { label: 'Do Not Disturb',            success: false,
         solution: 'Recipient is on the DND registry. Safaricom: *456*9*5*1#, Airtel: *321#.' },
  500: { label: 'Provider Internal Error',   success: false,
         solution: "Africa's Talking internal error. Try again in a few minutes." },
  501: { label: 'Rejected',                  success: false,
         solution: "Message rejected. Contact Africa's Talking support if this persists." },
}

function parseResult(r) {
  if (r.statusCode != null && AT_STATUS_MAP[r.statusCode]) {
    const info = AT_STATUS_MAP[r.statusCode]
    return { success: info.success, label: info.label, note: info.note || null, solution: info.solution || null }
  }
  if (!r.success && r.error) {
    const lower = r.error.toLowerCase()
    if (lower.includes('blacklist') || lower.includes('dnd') || lower === 'userinblacklist') {
      const info = AT_STATUS_MAP[406]
      return { success: false, label: info.label, note: null, solution: info.solution }
    }
    if (r.error.includes(':')) {
      const colonIdx = r.error.indexOf(':')
      return { success: false, label: r.error.slice(0, colonIdx).trim(), note: null,
               solution: r.error.slice(colonIdx + 1).trim() || null }
    }
    return { success: false, label: r.error, note: null, solution: null }
  }
  if (r.success) return { success: true, label: 'Sent', note: null, solution: null }
  return { success: false, label: 'Failed', note: null, solution: null }
}

const ResultRow = ({ r }) => {
  const { success, label, note, solution } = parseResult(r)
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm break-all" style={{ color: 'var(--foreground)' }}>
          {r.recipient}
        </span>
        {success
          ? <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 shrink-0">
              <CheckCircle size={12} /> {label}
            </span>
          : <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800 shrink-0">
              <AlertCircle size={12} /> Failed
            </span>
        }
      </div>
      {success && note && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <Clock size={12} className="shrink-0" />{note}
        </div>
      )}
      {!success && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 space-y-1">
          <p className="text-sm font-semibold text-red-800">{label}</p>
          {solution && (
            <p className="text-sm text-blue-700">
              <span className="font-medium">How to fix: </span>{solution}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SendSMSPage() {
  const [recipients, setRecipients] = useState([''])
  const [message, setMessage]       = useState('')
  const [provider, setProvider]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [results, setResults]       = useState(null)
  const resultsRef = useRef(null)

  // Auto-scroll to results panel whenever results arrive
  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [results])

  const setRecipient    = (i, v) => { const r = [...recipients]; r[i] = v; setRecipients(r) }
  const addRecipient    = ()     => setRecipients(r => [...r, ''])
  const removeRecipient = (i)   => setRecipients(r => r.filter((_, idx) => idx !== i))

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

      const { sent, failed } = data
      if (failed === 0) {
        toast.success(`${sent} message${sent !== 1 ? 's' : ''} sent successfully!`)
      } else if (sent === 0) {
        toast.error(`${failed} message${failed !== 1 ? 's' : ''} failed — details below`)
      } else {
        toast(`${sent} sent, ${failed} failed — details below`, { icon: '⚠️' })
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Request failed — check backend logs')
    } finally {
      setLoading(false)
    }
  }

  const allSent   = results && results.failed === 0
  const allFailed = results && results.sent   === 0
  const mixed     = results && results.sent > 0 && results.failed > 0

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

        <div className="card p-5 space-y-4">
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Message</h2>
          <div>
            <label className="label">Message *</label>
            <textarea className="input resize-none" rows={4} required maxLength={640}
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Type your message here..." />
            <p className="text-xs mt-1 text-right" style={{ color: 'var(--muted-foreground)' }}>
              {message.length}/640
            </p>
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
        <div ref={resultsRef} className="card p-5 space-y-4">
          {/* Summary banner */}
          <div className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium ${
            allSent   ? 'bg-green-50 border border-green-200 text-green-800' :
            allFailed ? 'bg-red-50 border border-red-200 text-red-800' :
                        'bg-amber-50 border border-amber-200 text-amber-800'
          }`}>
            {allSent   && <CheckCircle size={16} />}
            {(allFailed || mixed) && <AlertCircle size={16} />}
            <span>
              {allSent   && `All ${results.sent} message${results.sent !== 1 ? 's' : ''} sent successfully`}
              {allFailed && `All ${results.failed} message${results.failed !== 1 ? 's' : ''} failed`}
              {mixed     && `${results.sent} sent, ${results.failed} failed`}
            </span>
          </div>

          <div className="space-y-3">
            {results.results.map((r, i) => <ResultRow key={i} r={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}
