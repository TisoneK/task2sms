import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { Plus, X, Send } from 'lucide-react'
import { telegramApi } from '../services/api'
import Pagination from '../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  sent: 'badge-green', failed: 'badge-red', pending: 'badge-yellow',
}

const TELEGRAM_BLUE = '#229ED9'

function TelegramIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  )
}

export default function TelegramPage() {
  const [chatIds, setChatIds] = useState([''])
  const [message, setMessage] = useState('')
  const [parseMode, setParseMode] = useState('HTML')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [botInfo, setBotInfo] = useState(null)
  const [tab, setTab] = useState('send')

  useEffect(() => {
    telegramApi.botInfo()
      .then(({ data }) => setBotInfo(data))
      .catch(() => {})
  }, [])

  const setChatId = (i, v) => { const a = [...chatIds]; a[i] = v; setChatIds(a) }
  const addChatId = () => setChatIds(c => [...c, ''])
  const removeChatId = (i) => setChatIds(c => c.filter((_, idx) => idx !== i))

  const loadHistory = async (p = 1) => {
    setHistoryLoading(true)
    try {
      const { data } = await telegramApi.history(p, 30)
      setHistory(data.items); setHistoryTotal(data.total); setHistoryPage(p)
    } catch { toast.error('Failed to load history') }
    finally { setHistoryLoading(false) }
  }

  const handleTabChange = (t) => { setTab(t); if (t === 'history') loadHistory() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = chatIds.filter(Boolean)
    if (!clean.length) { toast.error('Add at least one chat ID'); return }
    setLoading(true); setResults(null)
    try {
      const { data } = await telegramApi.send({ chat_ids: clean, message, parse_mode: parseMode })
      setResults(data)
      if (data.failed === 0) toast.success(`${data.sent} Telegram message${data.sent > 1 ? 's' : ''} sent!`)
      else toast(`${data.sent} sent, ${data.failed} failed`, { icon: '⚠️' })
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: TELEGRAM_BLUE }}>
          <TelegramIcon size={22} />
        </div>
        <div>
          <h1 className="page-title">Telegram</h1>
          <p className="page-subtitle">Send messages via Telegram Bot API</p>
        </div>
      </div>

      {/* Bot status banner */}
      {botInfo && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm border ${
          botInfo.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${botInfo.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {botInfo.ok
            ? <>Bot connected: <strong className="font-semibold">@{botInfo.result?.username}</strong></>
            : <>Bot not configured — set <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">TELEGRAM_BOT_TOKEN</code> in your .env</>
          }
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {['send', 'history'].map(t => (
          <button key={t} onClick={() => handleTabChange(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-foreground shadow-sm' : ' hover:text-foreground'
            }`}>{t}</button>
        ))}
      </div>

      {tab === 'send' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recipients */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-foreground text-sm">Chat IDs / Usernames</h2>
            {chatIds.map((id, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" value={id}
                  onChange={e => setChatId(i, e.target.value)}
                  placeholder="123456789 or @channelname" />
                {chatIds.length > 1 && (
                  <button type="button" onClick={() => removeChatId(i)}
                    className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addChatId} className="btn-secondary text-sm">
              <Plus size={14} /> Add recipient
            </button>
            <p className="text-xs text-muted">
              Use numeric chat IDs for users/groups. Use @username for public channels.
              Have the user send /start to your bot first.
            </p>
          </div>

          {/* Message */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground text-sm">Message</h2>
              <select className="text-xs border border-card rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={parseMode} onChange={e => setParseMode(e.target.value)}>
                <option value="HTML">HTML</option>
                <option value="Markdown">Markdown</option>
                <option value="MarkdownV2">MarkdownV2</option>
              </select>
            </div>
            <textarea className="input resize-none font-mono text-sm" rows={6} required
              maxLength={4096} value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={parseMode === 'HTML'
                ? '<b>Bold</b>, <i>italic</i>, <code>code</code>'
                : '*Bold*, _italic_, `code`'}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                {parseMode === 'HTML' ? 'Tags: <b> <i> <code> <pre> <a href="…">' : 'Use *bold* _italic_ `code` [link](url)'}
              </p>
              <p className="text-xs text-muted">{message.length}/4096</p>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn w-full justify-center text-white font-semibold"
            style={{ background: loading ? '#93c5fd' : TELEGRAM_BLUE }}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              : <><TelegramIcon size={16} /> Send via Telegram</>}
          </button>

          {results && (
            <div className="card p-5 space-y-3 animate-fade-in">
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">{results.sent}</p>
                  <p className="text-xs text-muted">Sent</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                  <p className="text-xs text-muted">Failed</p>
                </div>
              </div>
              {results.results.map((r, i) => (
                <div key={i} style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-mono text-foreground">{r.chat_id}</span>
                  <div className="flex items-center gap-2">
                    {r.message_id && <span className="text-xs text-muted">#{r.message_id}</span>}
                    <span className={STATUS_COLORS[r.status?.value || r.status] || 'badge-gray'}>
                      {r.status?.value || r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 spinner" />
            </div>
          ) : history.length === 0 ? (
            <div className="card p-12 text-center text-muted text-sm">No messages sent yet.</div>
          ) : (
            <>
              <div className="card divide-y divide-slate-50">
                {history.map(m => (
                  <div key={m.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5"
                      style={{ background: TELEGRAM_BLUE }}>
                      <TelegramIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground font-mono">{m.chat_id}</p>
                      <p className="text-sm text-muted mt-0.5 break-words">{m.message}</p>
                      {m.error_message && (
                        <p className="text-xs text-red-500 mt-1 bg-red-50 rounded px-2 py-1">{m.error_message}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={STATUS_COLORS[m.status] || 'badge-gray'}>{m.status}</span>
                      <p className="text-xs text-muted mt-1">
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
