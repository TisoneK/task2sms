import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { monitorsApi } from '../services/api'
import {
  Plus, Trash2, Play, Globe, X, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock, Pause, Copy, Tag,
  Download, Filter, RefreshCw, Settings2, Zap, Timer,
  MoreHorizontal, CheckSquare, XSquare
} from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import ElementPicker from '../components/ui/ElementPicker'
import { EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'

// ─── Constants ─────────────────────────────────────────────────────────────

const SELECTOR_TYPES = [
  { value: 'css',   label: 'CSS Selector',  placeholder: 'div.price, span#stock' },
  { value: 'xpath', label: 'XPath',          placeholder: '//span[@class="price"]' },
  { value: 'text',  label: 'Text Contains',  placeholder: 'out of stock' },
  { value: 'regex', label: 'Regex',          placeholder: '\\$([\\d,.]+)' },
]
const OPERATORS = [
  { value: 'changed',      label: 'Changed (any change)' },
  { value: 'contains',     label: 'Contains text' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'eq',  label: '= equals' },   { value: 'neq', label: '≠ not equals' },
  { value: 'gt',  label: '> greater' },  { value: 'gte', label: '≥ greater or equal' },
  { value: 'lt',  label: '< less' },     { value: 'lte', label: '≤ less or equal' },
]
const CHANNELS = ['sms', 'email', 'whatsapp', 'telegram']
const INTERVAL_UNITS = [
  { value: 'seconds', label: 'Seconds', min: 1,   max: 3600  },
  { value: 'minutes', label: 'Minutes', min: 1,   max: 10080 },
  { value: 'hours',   label: 'Hours',   min: 1,   max: 168   },
  { value: 'days',    label: 'Days',    min: 1,   max: 30    },
]
const STATUS_STYLE = { active: 'badge-green', paused: 'badge-yellow', error: 'badge-red' }
const PORTAL = () => document.getElementById('modal-root') || document.body

const EMPTY_FORM = {
  name: '', url: '', selector_type: 'css', selector: '', attribute: '',
  monitor_selector: '', monitor_selector_type: 'css',
  use_monitor_selector: false,
  use_playwright: false, wait_selector: '', wait_ms: 2000,
  condition_operator: 'changed', condition_value: '',
  notify_channels: [], notify_recipients: [],
  message_template: 'Monitor alert: {name} — value is now {value}',
  webhook_url: '',
  check_interval_minutes: 60, check_interval_unit: 'minutes',
  schedule_type: 'interval', cron_expression: '',
  time_window_start: '', time_window_end: '', skip_weekends: false,
  retry_attempts: 3, timeout_seconds: 30, max_failures_before_pause: 10,
  tags: '',
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtCountdown(targetDate) {
  if (!targetDate) return null
  const ts = typeof targetDate === 'string' && !targetDate.endsWith('Z') ? targetDate + 'Z' : targetDate
  const diff = new Date(ts) - new Date()
  if (diff <= 0) return 'now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function successRate(m) {
  const total = (m.success_count || 0) + (m.fail_count || 0)
  if (!total) return null
  return Math.round(((m.success_count || 0) / total) * 100)
}

function exportLogsJSON(logs, monitorName) {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${monitorName.replace(/\s+/g, '_')}_logs.json`
  a.click()
  URL.revokeObjectURL(url)
}

function exportLogsCSV(logs, monitorName) {
  const cols = ['id', 'checked_at', 'value_found', 'prev_value', 'condition_met', 'alerted', 'error', 'duration_ms']
  const rows = [cols.join(',')]
  for (const l of logs) {
    rows.push(cols.map(c => {
      const v = l[c]
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }).join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${monitorName.replace(/\s+/g, '_')}_logs.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── MonitorModal (Wizard) ────────────────────────────────────────────────

const DRAFT_KEY = 'monitor_draft'

const STEPS = [
  { id: 'basic',    label: 'Basic',    desc: 'URL + selector' },
  { id: 'schedule', label: 'Schedule', desc: 'When to run'    },
  { id: 'notify',   label: 'Notify',   desc: 'Who to alert'   },
  { id: 'advanced', label: 'Advanced', desc: 'Error handling'  },
]

function validateStep(step, form, recipientInput) {
  if (step === 'basic') {
    if (!form.name.trim())     return 'Monitor name is required'
    if (!form.url.trim())      return 'URL is required'
    if (!form.selector.trim()) return 'Selector is required'
    try { new URL(form.url) } catch { return 'URL must be a valid web address' }
  }
  if (step === 'schedule') {
    if (form.schedule_type === 'interval' && !(form.check_interval_minutes >= 1))
      return 'Interval must be at least 1'
    if (form.schedule_type === 'cron' && !form.cron_expression.trim())
      return 'Cron expression is required'
  }
  if (step === 'notify') {
    const recipients = recipientInput.split(',').map(s => s.trim()).filter(Boolean)
    if (recipients.length === 0) return 'At least one recipient is required'
  }
  return null
}

function ContactInput({ recipientInput, setRecipientInput, contacts }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)

  // Debounced suggestion filter
  const handleChange = (e) => {
    const val = e.target.value
    setRecipientInput(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Find the segment being typed (last comma-separated chunk)
      const parts = val.split(',')
      const current = parts[parts.length - 1].trim()
      setQuery(current)
      if (current.length < 1) { setSuggestions([]); return }
      const q = current.toLowerCase()
      setSuggestions(
        contacts
          .filter(c =>
            c.value.toLowerCase().includes(q) ||
            (c.label && c.label.toLowerCase().includes(q))
          )
          .slice(0, 6)
      )
    }, 150)
  }

  const pick = (contact) => {
    const parts = recipientInput.split(',').map(s => s.trim())
    parts[parts.length - 1] = contact.value
    setRecipientInput(parts.filter(Boolean).join(', ') + ', ')
    setSuggestions([])
    setQuery('')
  }

  const alreadySelected = recipientInput.split(',').map(s => s.trim()).filter(Boolean)

  return (
    <div className="relative">
      <input
        className="input text-sm w-full"
        value={recipientInput}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="+254712345678, user@email.com, 123456789"
        autoComplete="off"
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {suggestions.map(c => (
            <button key={c.id} type="button"
              onMouseDown={() => pick(c)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ color: 'var(--foreground)' }}>{c.value}</span>
              <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                {c.label || c.type}{c.use_count > 0 ? ` · used ${c.use_count}x` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {alreadySelected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {alreadySelected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
              {v}
              <button type="button" onClick={() => {
                const next = alreadySelected.filter(x => x !== v)
                setRecipientInput(next.join(', '))
              }} style={{ color: 'var(--muted-foreground)', lineHeight: 1 }}>x</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function MonitorModal({ onClose, onSave, initial }) {
  const buildForm = (src) => {
    if (!src) return EMPTY_FORM
    return {
      ...EMPTY_FORM, ...src,
      check_interval_unit:    src.check_interval_unit    || 'minutes',
      schedule_type:          src.schedule_type          || 'interval',
      cron_expression:        src.cron_expression        || '',
      monitor_selector:       src.monitor_selector       || '',
      monitor_selector_type:  src.monitor_selector_type  || 'css',
      use_monitor_selector:   !!src.monitor_selector,
      webhook_url:            src.webhook_url            || '',
      tags:   Array.isArray(src.tags) ? src.tags.join(', ') : (src.tags || ''),
      time_window_start:      src.time_window_start      || '',
      time_window_end:        src.time_window_end        || '',
      skip_weekends:          src.skip_weekends          || false,
    }
  }

  // Draft recovery — only for new monitors
  const [showDraftPrompt, setShowDraftPrompt] = useState(false)
  const [pendingDraft, setPendingDraft]       = useState(null)

  const initForm = () => {
    if (initial) return buildForm(initial)
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        setPendingDraft(draft)
        setShowDraftPrompt(true)
      }
    } catch { localStorage.removeItem(DRAFT_KEY) }
    return EMPTY_FORM
  }

  const [form,           setForm]           = useState(initForm)
  const [recipientInput, setRecipientInput] = useState((initial?.notify_recipients || []).join(', '))
  const [step,           setStep]           = useState(0)         // 0-3
  const [maxStep,        setMaxStep]        = useState(initial ? 3 : 0)  // highest unlocked
  const [stepError,      setStepError]      = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [contacts,       setContacts]       = useState([])
  const [testResult,     setTestResult]     = useState(null)
  const [testing,        setTesting]        = useState(false)
  const [showPicker,     setShowPicker]     = useState(false)

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Load contacts for autocomplete
  useEffect(() => {
    import('../services/api').then(({ contactsApi }) => {
      contactsApi.list().then(r => setContacts(r.data)).catch(() => {})
    })
  }, [])

  // Persist draft to localStorage on every form change (new monitors only)
  useEffect(() => {
    if (initial || showDraftPrompt) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, recipientInput, step }))
    } catch {}
  }, [form, recipientInput, step, initial, showDraftPrompt])

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY)

  const set    = k => e => {
    if (['url', 'selector', 'selector_type', 'attribute'].includes(k)) setTestResult(null)
    setForm(f => ({ ...f, [k]: e.target.value }))
  }
  const setChk = k => e => setForm(f => ({ ...f, [k]: e.target.checked }))
  const setNum = k => e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))

  const toggleChannel = ch => setForm(f => ({
    ...f,
    notify_channels: f.notify_channels.includes(ch)
      ? f.notify_channels.filter(c => c !== ch)
      : [...f.notify_channels, ch],
  }))

  const handleTest = async () => {
    if (!form.url || !form.selector) return
    setTesting(true); setTestResult(null)
    try {
      const { monitorsApi } = await import('../services/api')
      const { data } = await monitorsApi.testSelector({
        url: form.url, selector_type: form.selector_type,
        selector: form.selector, attribute: form.attribute || null,
        use_playwright: form.use_playwright, wait_ms: form.wait_ms || 3000,
      })
      setTestResult(data)
    } catch (err) {
      setTestResult({ error: err.response?.data?.detail || 'Test failed', diagnosis: 'Request error', value: null })
    } finally { setTesting(false) }
  }

  const handlePickerSelect = ({ selector, value, value_type, suggested_operator, suggested_strip }) => {
    setForm(f => ({
      ...f,
      selector,
      selector_type: 'css',
      // If a numeric strip pattern was detected, pre-fill condition
      condition_operator: suggested_operator || f.condition_operator,
    }))
    setTestResult({
      value,
      diagnosis: value ? 'OK — extracted from picker' : 'Element found but no text value',
      used_playwright: true,
      duration_ms: null,
      error: null,
    })
    setShowPicker(false)
  }

  const goNext = () => {
    const err = validateStep(STEPS[step].id, form, recipientInput)
    if (err) { setStepError(err); return }
    setStepError(null)
    const next = step + 1
    setStep(next)
    setMaxStep(s => Math.max(s, next))
  }

  const goBack = () => { setStepError(null); setStep(s => s - 1) }

  const goTo = (idx) => {
    if (idx > maxStep) return   // locked
    setStepError(null)
    setStep(idx)
  }

  const submit = async () => {
    const err = validateStep(STEPS[step].id, form, recipientInput)
    if (err) { setStepError(err); return }
    setLoading(true)
    try {
      const recipients = recipientInput.split(',').map(s => s.trim()).filter(Boolean)
      const tags = form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : []
      await onSave({
        ...form,
        notify_recipients: recipients,
        attribute:              form.attribute              || null,
        wait_selector:          form.wait_selector          || null,
        condition_value:        form.condition_value        || null,
        monitor_selector:       form.use_monitor_selector && form.monitor_selector ? form.monitor_selector       : null,
        monitor_selector_type:  form.use_monitor_selector && form.monitor_selector ? form.monitor_selector_type  : null,
        webhook_url:            form.webhook_url            || null,
        cron_expression:        form.schedule_type === 'cron' ? form.cron_expression : null,
        time_window_start:      form.time_window_start      || null,
        time_window_end:        form.time_window_end        || null,
        tags,
      })
      clearDraft()
      onClose()
    } catch (err) {
      setStepError(err.response?.data?.detail || 'Failed to save')
    } finally { setLoading(false) }
  }

  const selType  = SELECTOR_TYPES.find(s => s.value === form.selector_type)
  const unitInfo = INTERVAL_UNITS.find(u => u.value === form.check_interval_unit) || INTERVAL_UNITS[1]
  const isEdit   = !!initial

  // ── Draft prompt overlay ──────────────────────────────────────────────────
  if (showDraftPrompt && pendingDraft) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div className="rounded-2xl p-6 w-full max-w-sm space-y-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color: 'var(--foreground)' }}>
            Resume previous setup?
          </h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            You have an unfinished monitor draft. Continue where you left off?
          </p>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => {
              clearDraft(); setShowDraftPrompt(false); setPendingDraft(null)
            }}>Start fresh</button>
            <button className="btn-primary flex-1" onClick={() => {
              setForm(pendingDraft.form)
              setRecipientInput(pendingDraft.recipientInput || '')
              setStep(pendingDraft.step || 0)
              setMaxStep(pendingDraft.step || 0)
              setShowDraftPrompt(false); setPendingDraft(null)
            }}>Resume</button>
          </div>
        </div>
      </div>,
      PORTAL()
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative rounded-2xl w-full max-w-lg max-h-[96vh] overflow-hidden flex flex-col"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="font-semibold text-[15px]" style={{ color: 'var(--foreground)' }}>
              {isEdit ? 'Edit Monitor' : 'New Monitor'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Step {step + 1} of {STEPS.length} — {STEPS[step].desc}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex shrink-0 px-5 py-3 gap-2"
          style={{ borderBottom: '1px solid var(--border)' }}>
          {STEPS.map((s, i) => {
            const unlocked  = i <= maxStep
            const active    = i === step
            const completed = i < step
            return (
              <button key={s.id} type="button"
                onClick={() => goTo(i)}
                disabled={!unlocked}
                className="flex-1 flex flex-col items-center gap-1 rounded-lg py-2 px-1 transition-colors"
                style={{
                  background: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                  opacity: unlocked ? 1 : 0.35,
                }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: completed ? '#16a34a' : active ? 'var(--primary)' : 'var(--muted)',
                    color:      (completed || active) ? '#fff' : 'var(--muted-foreground)',
                  }}>
                  {completed ? '✓' : i + 1}
                </div>
                <span className="text-[10px] font-semibold hidden sm:block"
                  style={{ color: active ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Step error banner ── */}
        {stepError && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-sm shrink-0"
            style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                     color: 'var(--destructive)', border: '1px solid var(--destructive)' }}>
            {stepError}
          </div>
        )}

        {/* ── Step content ── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">

          {/* STEP 1 — BASIC */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="label">Monitor Name</label>
                <input className="input" value={form.name} onChange={set('name')}
                  placeholder="Amazon price tracker" />
              </div>
              <div>
                <label className="label">URL to monitor</label>
                <input className="input font-mono text-sm" type="url"
                  value={form.url} onChange={set('url')}
                  placeholder="https://example.com/product" />
              </div>

              {/* Selector */}
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--muted-foreground)' }}>Element to extract</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Click an element visually, or type a CSS selector manually
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button"
                      onClick={() => {
                        if (!form.url) { setStepError('Enter a URL first'); return }
                        try { new URL(form.url) } catch { setStepError('Enter a valid URL first'); return }
                        setStepError(null); setShowPicker(true)
                      }}
                      className="btn-primary text-xs px-3 py-1.5">
                      Pick Element
                    </button>
                    <button type="button" onClick={handleTest}
                      disabled={testing || !form.url || !form.selector}
                      className="btn-secondary text-xs px-3 py-1.5">
                      {testing ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Type</label>
                    <select className="input" value={form.selector_type} onChange={set('selector_type')}>
                      {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  {form.selector_type === 'css' && (
                    <div>
                      <label className="label">Attribute <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(blank = text)</span></label>
                      <input className="input font-mono text-sm" value={form.attribute} onChange={set('attribute')}
                        placeholder="value, href, data-price" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Selector</label>
                  <input className="input font-mono text-sm" value={form.selector} onChange={set('selector')}
                    placeholder={selType?.placeholder} />
                </div>

                <p className="text-[11px] rounded-lg px-3 py-2"
                  style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', color: 'var(--muted-foreground)' }}>
                  {form.selector_type === 'css'   && 'DevTools → right-click element → Copy → Copy selector'}
                  {form.selector_type === 'xpath' && 'DevTools → right-click element → Copy → Copy XPath'}
                  {form.selector_type === 'text'  && 'Paste the exact text you want to detect on the page'}
                  {form.selector_type === 'regex' && 'Use a capture group e.g. (\\d+) to extract a number'}
                </p>

                {testResult && (
                  <div className="rounded-lg px-3 py-2.5 text-xs space-y-1"
                    style={{
                      background: testResult.error ? 'color-mix(in srgb, var(--destructive) 10%, transparent)'
                        : testResult.value ? 'color-mix(in srgb, #16a34a 10%, transparent)'
                        : 'color-mix(in srgb, #d97706 10%, transparent)',
                      border: `1px solid ${testResult.error ? 'var(--destructive)' : testResult.value ? '#16a34a' : '#d97706'}`,
                    }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {testResult.error ? 'Error' : testResult.value ? 'Value found' : 'No value extracted'}
                      </span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        {testResult.duration_ms}ms{testResult.used_playwright ? ' · Playwright' : ''}
                      </span>
                    </div>
                    {testResult.value && (
                      <p className="font-mono font-semibold" style={{ color: 'var(--foreground)' }}>
                        "{testResult.value}"
                      </p>
                    )}
                    <p style={{ color: 'var(--muted-foreground)' }}>{testResult.diagnosis}</p>
                  </div>
                )}
              </div>

              {/* Dynamic page */}
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Dynamic Page</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Enable for React, Vue, Angular or any lazy-loaded content
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                      checked={form.use_playwright} onChange={setChk('use_playwright')} />
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Playwright</span>
                  </label>
                </div>
                {form.use_playwright && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Wait for selector (optional)</label>
                      <input className="input font-mono text-sm" value={form.wait_selector}
                        onChange={set('wait_selector')} placeholder=".product-price" />
                    </div>
                    <div>
                      <label className="label">Wait time (ms)</label>
                      <input className="input" type="number" min={500} max={15000}
                        value={form.wait_ms} onChange={setNum('wait_ms')} />
                    </div>
                  </div>
                )}
              </div>

              {/* Condition */}
              <div className="space-y-2">
                <label className="label">Alert Condition</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <select className="input" value={form.condition_operator} onChange={set('condition_operator')}>
                      {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {form.condition_operator !== 'changed' && (
                    <div className="flex-1">
                      <input className="input" value={form.condition_value}
                        onChange={set('condition_value')} placeholder="100" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — SCHEDULE */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="label">Schedule type</label>
                <div className="flex gap-2 mt-1">
                  {['interval', 'cron'].map(t => (
                    <button type="button" key={t}
                      onClick={() => setForm(f => ({ ...f, schedule_type: t }))}
                      className="px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors"
                      style={{
                        borderColor: form.schedule_type === t ? 'var(--primary)' : 'var(--border)',
                        background:  form.schedule_type === t ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                        color:       form.schedule_type === t ? 'var(--primary)' : 'var(--foreground)',
                      }}>{t}</button>
                  ))}
                </div>
              </div>

              {form.schedule_type === 'interval' && (
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="label">Every</label>
                      <input className="input" type="number"
                        min={unitInfo.min} max={unitInfo.max}
                        value={form.check_interval_minutes}
                        onChange={setNum('check_interval_minutes')} />
                    </div>
                    <div className="flex-1">
                      <label className="label">Unit</label>
                      <select className="input" value={form.check_interval_unit}
                        onChange={set('check_interval_unit')}>
                        {INTERVAL_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Min {unitInfo.min}, max {unitInfo.max} {unitInfo.label.toLowerCase()}
                  </p>
                </div>
              )}

              {form.schedule_type === 'cron' && (
                <div>
                  <label className="label">Cron expression</label>
                  <input className="input font-mono" value={form.cron_expression}
                    onChange={set('cron_expression')} placeholder="*/15 * * * *" />
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    e.g. <code>*/15 * * * *</code> = every 15 min, <code>0 9 * * 1-5</code> = weekdays 9am
                  </p>
                </div>
              )}

              <div className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--muted-foreground)' }}>Time window (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start</label>
                    <input className="input" type="time" value={form.time_window_start}
                      onChange={set('time_window_start')} />
                  </div>
                  <div>
                    <label className="label">End</label>
                    <input className="input" type="time" value={form.time_window_end}
                      onChange={set('time_window_end')} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                    checked={form.skip_weekends} onChange={setChk('skip_weekends')} />
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>Skip weekends</span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3 — NOTIFY */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="label">Notification channels</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {CHANNELS.map(ch => (
                    <button type="button" key={ch} onClick={() => toggleChannel(ch)}
                      className="px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-colors"
                      style={{
                        borderColor: form.notify_channels.includes(ch) ? 'var(--primary)' : 'var(--border)',
                        background:  form.notify_channels.includes(ch) ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                        color:       form.notify_channels.includes(ch) ? 'var(--primary)' : 'var(--foreground)',
                      }}>{ch}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Recipients</label>
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  Phone numbers, emails, or Telegram chat IDs. Start typing to see saved contacts.
                </p>
                <ContactInput
                  recipientInput={recipientInput}
                  setRecipientInput={setRecipientInput}
                  contacts={contacts}
                />
              </div>

              <div>
                <label className="label">Message template</label>
                <textarea className="input resize-none text-sm font-mono" rows={2}
                  value={form.message_template} onChange={set('message_template')} />
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Variables: <code>{'{name}'}</code> <code>{'{value}'}</code> <code>{'{prev_value}'}</code> <code>{'{url}'}</code>
                </p>
                {form.message_template && (
                  <div className="mt-2 rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--muted-foreground)' }}>Preview: </span>
                    {form.message_template
                      .replace(/\{name\}/g,       form.name || 'My Monitor')
                      .replace(/\{value\}/g,       '129.67')
                      .replace(/\{prev_value\}/g,  '130.12')
                      .replace(/\{url\}/g,         form.url || 'https://example.com')}
                  </div>
                )}
              </div>

              <div>
                <label className="label">Webhook URL <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input font-mono text-sm" type="url" value={form.webhook_url}
                  onChange={set('webhook_url')} placeholder="https://hooks.yourapp.com/monitor" />
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Sends a POST JSON payload whenever the condition is met
                </p>
              </div>

              <div>
                <label className="label">Tags <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(comma-separated)</span></label>
                <input className="input text-sm" value={form.tags} onChange={set('tags')}
                  placeholder="price, stock, kenya" />
              </div>
            </div>
          )}

          {/* STEP 4 — ADVANCED */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Retries</label>
                  <input className="input" type="number" min={1} max={10}
                    value={form.retry_attempts} onChange={setNum('retry_attempts')} />
                </div>
                <div>
                  <label className="label">Timeout (s)</label>
                  <input className="input" type="number" min={5} max={120}
                    value={form.timeout_seconds} onChange={setNum('timeout_seconds')} />
                </div>
                <div>
                  <label className="label">Pause after</label>
                  <div className="flex items-center gap-1">
                    <input className="input" type="number" min={1} max={100}
                      value={form.max_failures_before_pause}
                      onChange={setNum('max_failures_before_pause')} />
                    <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>fails</span>
                  </div>
                </div>
              </div>
              <p className="text-xs rounded-lg px-3 py-2"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                Auto-pauses after <strong>{form.max_failures_before_pause}</strong> consecutive failures.
                Each check retries up to <strong>{form.retry_attempts}</strong> times with a{' '}
                <strong>{form.timeout_seconds}s</strong> timeout.
              </p>
            </div>
          )}
        </div>

        {/* ── Element Picker overlay ── */}
        {showPicker && (
          <ElementPicker
            url={form.url}
            onSelect={handlePickerSelect}
            onClose={() => setShowPicker(false)}
          />
        )}

        {/* ── Navigation footer ── */}
        <div className="flex gap-3 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}>
          {step === 0 ? (
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          ) : (
            <button type="button" onClick={goBack} className="btn-secondary flex-1">Back</button>
          )}

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="btn-primary flex-1">
              Next: {STEPS[step + 1].label}
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : isEdit ? 'Update Monitor' : 'Create Monitor'}
            </button>
          )}
        </div>
      </div>
    </div>,
    PORTAL()
  )
}


// ─── LogDrawer ─────────────────────────────────────────────────────────────

function LogDrawer({ monitor, onLogsChange }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')  // all | alert | error | ok
  const [confirmClear, setConfirmClear] = useState(false)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await monitorsApi.logs(monitor.id, 100)
      setLogs(data)
      onLogsChange?.(data.length)
    } finally {
      setLoading(false)
    }
  }, [monitor.id])

  useEffect(() => { loadLogs() }, [loadLogs])

  const handleDeleteLog = async (logId) => {
    try {
      await monitorsApi.deleteLog(monitor.id, logId)
      setLogs(prev => prev.filter(l => l.id !== logId))
    } catch { toast.error('Failed to delete log') }
  }

  const handleClearAll = async () => {
    try {
      await monitorsApi.clearLogs(monitor.id)
      setLogs([])
      setConfirmClear(false)
      toast.success('Logs cleared')
    } catch { toast.error('Failed to clear logs') }
  }

  const filtered = logs.filter(l => {
    if (filter === 'alert') return l.alerted
    if (filter === 'error') return !!l.error
    if (filter === 'ok') return !l.error && !l.alerted
    return true
  })

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Log toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 flex-wrap gap-2"
        style={{ background: 'var(--muted)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted-foreground)' }}>
          Check Log {logs.length > 0 && `(${logs.length})`}
        </p>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex gap-0.5">
            {[['all', 'All'], ['alert', '🔔'], ['error', '⚠️'], ['ok', '✓']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} type="button"
                className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
                style={{
                  background: filter === v ? 'var(--primary)' : 'transparent',
                  color: filter === v ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}>{l}</button>
            ))}
          </div>
          {/* Export */}
          <div className="flex gap-1">
            <button onClick={() => exportLogsJSON(logs, monitor.name)} type="button"
              title="Export JSON" className="btn-ghost p-1 text-xs">JSON</button>
            <button onClick={() => exportLogsCSV(logs, monitor.name)} type="button"
              title="Export CSV" className="btn-ghost p-1 text-xs">CSV</button>
          </div>
          {/* Clear all */}
          {logs.length > 0 && (
            <button onClick={() => setConfirmClear(true)} type="button"
              className="btn-ghost p-1.5" title="Clear all logs"
              style={{ color: 'var(--destructive)' }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-5"><div className="spinner-sm" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-5" style={{ color: 'var(--muted-foreground)' }}>
          {logs.length === 0 ? 'No checks yet' : 'No logs match filter'}
        </p>
      ) : (
        <div className="divide-y max-h-64 overflow-y-auto scrollbar-thin"
          style={{ borderColor: 'var(--border)' }}>
          {filtered.map(l => (
            <div key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-sm group"
              style={{ background: 'var(--card)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}>
              {l.error
                ? <AlertCircle size={13} style={{ color: 'var(--destructive)', marginTop: 2 }} className="shrink-0" />
                : l.alerted
                  ? <Zap size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  : l.condition_met
                    ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                    : <Clock size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }} />}

              <div className="flex-1 min-w-0">
                {l.value_found !== null && l.value_found !== undefined ? (
                  <p className="font-mono text-xs truncate" style={{ color: 'var(--foreground)' }}>
                    <span className="font-semibold">
                      {l.value_found === '' ? <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>empty</span> : l.value_found}
                    </span>
                    {l.prev_value !== null && l.prev_value !== undefined && l.prev_value !== l.value_found && (
                      <span style={{ color: 'var(--muted-foreground)' }}> ← {l.prev_value}</span>
                    )}
                  </p>
                ) : (
                  <p className="font-mono text-xs" style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                    no value — selector didn't match
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {l.error && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{l.error}</p>}
                  {l.alerted && <span className="badge-blue text-[10px]">alerted</span>}
                  {l.duration_ms != null && (
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{l.duration_ms}ms</span>
                  )}
                  {l.fetch_method && (
                    <span className="text-[10px] px-1 rounded" style={{
                      background: l.fetch_method === 'playwright' ? 'color-mix(in srgb, #7c3aed 15%, transparent)'
                        : l.fetch_method === 'static_fallback' ? 'color-mix(in srgb, #d97706 15%, transparent)'
                        : 'var(--muted)',
                      color: l.fetch_method === 'playwright' ? '#7c3aed'
                        : l.fetch_method === 'static_fallback' ? '#d97706'
                        : 'var(--muted-foreground)',
                    }}>{l.fetch_method}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {formatDistanceToNow(
                    new Date(l.checked_at.endsWith('Z') ? l.checked_at : l.checked_at + 'Z'),
                    { addSuffix: true }
                  )}
                </p>
                <button onClick={() => handleDeleteLog(l.id)} type="button"
                  className="opacity-0 group-hover:opacity-100 btn-ghost p-1 transition-opacity"
                  style={{ color: 'var(--destructive)' }} title="Delete log">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal open={confirmClear}
        title="Clear all logs?"
        message={`All ${logs.length} check logs for "${monitor.name}" will be permanently deleted.`}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)} />
    </div>
  )
}

// ─── Countdown Timer ───────────────────────────────────────────────────────

function Countdown({ targetDate }) {
  const [label, setLabel] = useState(() => fmtCountdown(targetDate))
  useEffect(() => {
    if (!targetDate) return
    const id = setInterval(() => setLabel(fmtCountdown(targetDate)), 1000)
    return () => clearInterval(id)
  }, [targetDate])
  if (!label) return null
  return (
    <span className="flex items-center gap-1">
      <Timer size={10} />
      {label}
    </span>
  )
}

// ─── MonitorCard ────────────────────────────────────────────────────────────

function MonitorCard({ m, onEdit, onDelete, onToggle, onCheck, onClone, checking }) {
  const [expanded, setExpanded] = useState(false)
  const rate = successRate(m)

  return (
    <div>
      <div className="flex items-start gap-3 px-5 py-4 transition-colors"
        onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}>

        {/* Status dot */}
        <div className="w-2 h-2 rounded-full mt-2 shrink-0"
          style={{
            background: m.status === 'active' ? '#16a34a'
              : m.status === 'error' ? 'var(--destructive)'
              : 'var(--muted-foreground)',
          }} />

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{m.name}</p>
            <span className={STATUS_STYLE[m.status] || 'badge-gray'}>{m.status}</span>
            {m.use_playwright && <span className="badge-purple">playwright</span>}
            {(m.notify_channels || []).map(ch => (
              <span key={ch} className="badge-gray capitalize text-xs">{ch}</span>
            ))}
            {(m.tags || []).map(t => (
              <span key={t} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                <Tag size={8} />{t}
              </span>
            ))}
          </div>

          {/* URL */}
          <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>{m.url}</p>

          {/* Selector info */}
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            <span className="font-mono rounded px-1 mr-1" style={{ background: 'var(--muted)' }}>{m.selector_type}</span>
            <span className="font-mono" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
              {m.selector.length > 50 ? m.selector.slice(0, 50) + '…' : m.selector}
            </span>
            {m.monitor_selector && (
              <span className="ml-1 opacity-60">→ watch: {m.monitor_selector.slice(0, 30)}</span>
            )}
            {m.condition_operator && (
              <> · {OPERATORS.find(o => o.value === m.condition_operator)?.label}
                {m.condition_value && ` "${m.condition_value}"`}</>
            )}
          </p>

          {/* Metrics row */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px]"
            style={{ color: 'var(--muted-foreground)' }}>

            {/* Interval */}
            <span title="Check interval">
              every {m.check_interval_minutes} {m.check_interval_unit || 'min'}
            </span>

            {/* Countdown */}
            {m.next_run_at && m.status === 'active' && (
              <Countdown targetDate={m.next_run_at} />
            )}

            {/* Last run */}
            {m.last_checked_at && (
              <span title={`Last run: ${format(new Date(m.last_checked_at.endsWith('Z') ? m.last_checked_at : m.last_checked_at + 'Z'), 'PPp')}`}>
                last: {formatDistanceToNow(
                  new Date(m.last_checked_at.endsWith('Z') ? m.last_checked_at : m.last_checked_at + 'Z'),
                  { addSuffix: true }
                )}
              </span>
            )}

            {/* Run count */}
            {m.run_count > 0 && (
              <span title="Total runs">
                {m.run_count} run{m.run_count !== 1 ? 's' : ''}
              </span>
            )}

            {/* Success rate */}
            {rate !== null && (
              <span title="Success rate (last runs)"
                style={{ color: rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : 'var(--destructive)' }}>
                {rate}% ok
              </span>
            )}

            {/* Last value */}
            {m.last_value !== null && m.last_value !== undefined && (
              <span title="Last extracted value">
                val: <span className="font-mono font-medium" style={{ color: 'var(--foreground)' }}>
                  {m.last_value === '' ? <em>empty</em> : `"${m.last_value.slice(0, 40)}"`}
                </span>
              </span>
            )}

            {/* Alert count */}
            {m.alert_count > 0 && (
              <span style={{ color: '#d97706', fontWeight: 600 }}>
                🔔 {m.alert_count}
              </span>
            )}

            {/* Error */}
            {m.error_message && (
              <span className="truncate max-w-48" style={{ color: 'var(--destructive)' }}
                title={m.error_message}>⚠ {m.error_message.slice(0, 60)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onCheck(m)} disabled={checking}
            className="btn-ghost p-2" title="Check now">
            {checking ? <div className="spinner-sm" /> : <Play size={14} />}
          </button>
          <button onClick={() => setExpanded(v => !v)} className="btn-ghost p-2" title="View logs">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={() => onToggle(m)} className="btn-ghost p-2"
            title={m.status === 'active' ? 'Pause' : 'Resume'}>
            {m.status === 'active' ? <Pause size={14} /> : <Play size={14} style={{ color: 'var(--primary)' }} />}
          </button>
          <button onClick={() => onClone(m)} className="btn-ghost p-2" title="Clone monitor">
            <Copy size={14} />
          </button>
          <button onClick={() => onEdit(m)} className="btn-ghost p-2" title="Edit">
            <Settings2 size={14} />
          </button>
          <button onClick={() => onDelete(m)} className="btn-ghost p-2"
            style={{ color: 'var(--destructive)' }} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <LogDrawer monitor={m} />
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [checking, setChecking] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTag, setFilterTag] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await monitorsApi.list()
      setMonitors(data)
    } catch {
      toast.error('Failed to load monitors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh next_run_at countdown every 30s
  useEffect(() => {
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

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
      let msg
      if (data.error) {
        msg = `Error: ${data.error}`
      } else if (data.value_found === null || data.value_found === undefined) {
        msg = 'No value extracted — selector did not match. Check the selector in the form.'
      } else if (data.value_found === '') {
        msg = 'Element found but value is empty — try a different attribute or increase wait time.'
      } else {
        msg = `Extracted: "${data.value_found}" — ${data.condition_met ? 'condition MET ✓' : 'condition not met'}`
      }
      toast(msg, { icon: data.condition_met ? '🔔' : data.value_found ? '🔍' : '⚠️', duration: 7000 })
      // Update the monitor with fresh data from server
      if (data.monitor) {
        setMonitors(ms => ms.map(m2 => m2.id === m.id ? data.monitor : m2))
      } else {
        load()
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Check failed')
    } finally {
      setChecking(null)
    }
  }

  const handleToggle = async m => {
    const { data } = await monitorsApi.update(m.id, { status: m.status === 'active' ? 'paused' : 'active' })
    setMonitors(ms => ms.map(x => x.id === m.id ? data : x))
    toast.success(`Monitor ${data.status}`)
  }

  const handleClone = async m => {
    try {
      const { data } = await monitorsApi.clone(m.id)
      setMonitors(ms => [data, ...ms])
      toast.success(`Cloned "${m.name}" — starts paused`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Clone failed')
    }
  }

  const handleDelete = async () => {
    await monitorsApi.delete(confirmDelete.id)
    setMonitors(ms => ms.filter(m => m.id !== confirmDelete.id))
    toast.success('Monitor deleted')
    setConfirmDelete(null)
  }

  // Collect all unique tags
  const allTags = [...new Set(monitors.flatMap(m => m.tags || []))]

  const filtered = monitors.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false
    if (filterTag && !(m.tags || []).includes(filterTag)) return false
    if (search) {
      const q = search.toLowerCase()
      return m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Web Monitor</h1>
          <p className="page-subtitle">Watch any element on any site — static or JS-rendered</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={15} /> New Monitor
        </button>
      </div>

      {!loading && monitors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <input
            className="input text-sm py-1.5 px-3 max-w-xs"
            placeholder="Search monitors…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {/* Status filter */}
          {['all', 'active', 'paused', 'error'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors"
              style={{
                background: filterStatus === s ? 'var(--primary)' : 'var(--muted)',
                color: filterStatus === s ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              }}>{s}</button>
          ))}
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1">
              <Tag size={12} style={{ color: 'var(--muted-foreground)' }} />
              {allTags.map(t => (
                <button key={t} onClick={() => setFilterTag(filterTag === t ? '' : t)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: filterTag === t ? 'var(--accent)' : 'var(--muted)',
                    color: filterTag === t ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                  }}>{t}</button>
              ))}
            </div>
          )}
          {/* Refresh */}
          <button onClick={load} className="btn-ghost p-1.5 ml-auto" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner-lg" /></div>
      ) : monitors.length === 0 ? (
        <div className="card">
          <EmptyState icon={Globe} title="No monitors yet"
            description="Track prices, stock levels, headlines — on any website including SPAs"
            action={
              <button onClick={() => setShowModal(true)} className="btn-primary inline-flex">
                <Plus size={14} /> Create monitor
              </button>
            } />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            No monitors match the current filter
          </p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map(m => (
            <MonitorCard
              key={m.id}
              m={m}
              onEdit={m => { setEditing(m); setShowModal(true) }}
              onDelete={setConfirmDelete}
              onToggle={handleToggle}
              onCheck={handleCheck}
              onClone={handleClone}
              checking={checking === m.id}
            />
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

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete monitor?"
        message={`"${confirmDelete?.name}" and all check logs will be permanently deleted.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
