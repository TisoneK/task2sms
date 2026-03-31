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
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
          style={botInfo.ok
            ? { background: 'color-mix(in srgb, #10b981 14%, var(--card))', border: '1px solid #10b981', color: 'var(--foreground)' }
            : { background: 'color-mix(in srgb, #f59e0b 14%, var(--card))', border: '1px solid #d97706', color: 'var(--foreground)' }
          }>
          <div className="w-2 h-2 rounded-full shrink-0"
            style={{ background: botInfo.ok ? '#10b981' : '#f59e0b' }} />
          {botInfo.ok
            ? <>Bot connected: <strong className="font-semibold">@{botInfo.result?.username}</strong></>
            : <>Bot not configured — set <code className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--muted)' }}>TELEGRAM_BOT_TOKEN</code> in your .env</>
          }
        </div>
      )}

      {/* ── Tabs ── themed for dark mode ── */}
      <div className="flex gap-0" style={{ borderBottom: '2px solid var(--border)' }}>
        {['send', 'history'].map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className="px-5 py-2 text-sm font-semibold capitalize transition-colors relative"
            style={{
              color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
              background: 'transparent',
              borderBottom: tab === t ? `2px solid var(--primary)` : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >{t}</button>
        ))}
      </div>

      {tab === 'send' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recipients */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
              Chat IDs / Usernames
            </h2>
            {chatIds.map((id, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" value={id}
                  onChange={e => setChatId(i, e.target.value)}
                  placeholder="123456789 or @channelname" />
                {chatIds.length > 1 && (
                  <button type="button" onClick={() => removeChatId(i)}
                    className="btn-ghost p-2" style={{ color: 'var(--destructive)' }}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addChatId} className="btn-secondary text-sm">
              <Plus size={14} /> Add recipient
            </button>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Use numeric chat IDs for users/groups. Use @username for public channels.
              Have the user send /start to your bot first.
            </p>
          </div>

          {/* Message */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Message</h2>
              <select
                className="input text-xs py-1 px-2 w-auto"
                value={parseMode}
                onChange={e => setParseMode(e.target.value)}
              >
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
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {parseMode === 'HTML'
                  ? 'Tags: <b> <i> <code> <pre> <a href="…">'
                  : 'Use *bold* _italic_ `code` [link](url)'}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{message.length}/4096</p>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="btn w-full justify-center text-white font-semibold py-2.5 rounded-xl transition-opacity"
            style={{ background: loading ? 'color-mix(in srgb, #229ED9 60%, transparent)' : TELEGRAM_BLUE }}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
              : <><TelegramIcon size={16} /> Send via Telegram</>}
          </button>

          {results && (
            <div className="card p-5 space-y-3 animate-fade-in">
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{results.sent}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sent</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>{results.failed}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Failed</p>
                </div>
              </div>
              {results.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm" style={{ color: 'var(--foreground)' }}>{r.chat_id}</span>
                  <div className="flex items-center gap-2">
                    {r.message_id && <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>#{r.message_id}</span>}
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
            <div className="card p-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              No messages sent yet.
            </div>
          ) : (
            <>
              <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
                {history.map(m => (
                  <div key={m.id}
                    className="flex items-start gap-4 px-5 py-4 transition-colors"
                    style={{ background: 'var(--card)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5"
                      style={{ background: TELEGRAM_BLUE }}>
                      <TelegramIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono" style={{ color: 'var(--foreground)' }}>
                        {m.chat_id}
                      </p>
                      <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--muted-foreground)' }}>
                        {m.message}
                      </p>
                      {m.error_message && (
                        <p className="text-xs mt-1 px-2 py-1 rounded"
                          style={{ color: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}>
                          {m.error_message}
                        </p>
                      )}
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
