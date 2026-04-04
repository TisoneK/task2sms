import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { monitorsApi } from '../services/api'
import {
  Plus, Trash2, Play, Globe, X, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock, Pause, Copy, Tag,
  Download, RefreshCw, Settings2, Zap, Timer,
  MoreHorizontal, Code2, Info, BellRing
} from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import ElementPicker from '../components/ui/ElementPicker'
import { EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'

// ─── Constants ─────────────────────────────────────────────────────────────

const SELECTOR_TYPES = [
  { value: 'css',     label: 'CSS Selector',     placeholder: 'div.price, span#stock' },
  { value: 'xpath',   label: 'XPath',             placeholder: '//span[@class="price"]' },
  { value: 'text',    label: 'Text Contains',     placeholder: 'out of stock' },
  { value: 'regex',   label: 'Regex',             placeholder: '\\$([\\d,.]+)' },
  { value: 'js_expr', label: 'JS Expression',     placeholder: "css('.price') + css('.tax')" },
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
  { value: 'seconds', label: 'Seconds', min: 10,  max: 3600  },
  { value: 'minutes', label: 'Minutes', min: 1,   max: 10080 },
  { value: 'hours',   label: 'Hours',   min: 1,   max: 168   },
  { value: 'days',    label: 'Days',    min: 1,   max: 30    },
]

// Field name suggestions from backend
const FIELD_SUGGESTIONS = {
  sports: ['home_score', 'away_score', 'total_score', 'match_status', 'game_time', 'quarter', 'team_name', 'player_name'],
  finance: ['bid_price', 'ask_price', 'volume', 'market_cap', 'change_percent', 'opening_price', 'closing_price', 'spread'],
  ecommerce: ['price', 'stock_level', 'rating', 'reviews_count', 'availability', 'discount_price', 'brand', 'sku'],
  weather: ['temperature', 'humidity', 'pressure', 'wind_speed', 'visibility', 'uv_index', 'precipitation', 'feels_like'],
}

const PREFIX_SUGGESTIONS = {
  home: ['home_score', 'home_team', 'home_points'],
  away: ['away_score', 'away_team', 'away_points'],
  price: ['price', 'bid_price', 'ask_price', 'discount_price'],
  stock: ['stock_level', 'stock_status', 'stock_count'],
  score: ['score', 'total_score', 'home_score', 'away_score'],
  team: ['team_name', 'team_score', 'team_abbreviation'],
  bid: ['bid_price', 'bid_size'],
  ask: ['ask_price', 'ask_size'],
  temp: ['temperature', 'temp_high', 'temp_low'],
  wind: ['wind_speed', 'wind_direction'],
  change: ['change_percent', 'change_amount'],
  total: ['total_score', 'total_price', 'total_count'],
  open: ['opening_price', 'open_interest'],
  close: ['closing_price', 'close_time'],
  vol: ['volume', 'volatility'],
}

const STATUS_COLOR = {
  active: { dot: '#16a34a', badge: 'badge-green' },
  paused: { dot: '#d97706', badge: 'badge-yellow' },
  error:  { dot: '#dc2626', badge: 'badge-red' },
}

const PORTAL = () => document.getElementById('modal-root') || document.body

const EMPTY_FORM = {
  name: '', url: '', selector_type: 'css', selector: '', attribute: '',
  monitor_selector: '', monitor_selector_type: 'css',
  use_monitor_selector: false,
  use_playwright: false, wait_selector: '', wait_ms: 8000,
  condition_operator: 'changed', condition_value: '',
  // Monitor behavior after condition met
  stop_on_condition_met: true,  // Stop after first alert
  skip_initial_notification: true,  // Don't send alert on first run
  notify_channels: [], notify_recipients: [],
  message_template: 'Monitor alert: {name} — value is now {value}',
  webhook_url: '',
  check_interval_minutes: 60, check_interval_unit: 'minutes',
  schedule_type: 'interval', cron_expression: '',
  time_window_start: '', time_window_end: '', skip_weekends: false,
  retry_attempts: 3, timeout_seconds: 30, max_failures_before_pause: 10,
  tags: '',
  // Multi-element fields
  is_multi_field: false,
  multi_field_condition: '',
  fields: [{ name: '', selector: '', selector_type: 'css', attribute: '', normalization: '', position: 0, tested: false, testResult: null }],
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
  const cols = ['id', 'checked_at', 'value_found', 'prev_value', 'condition_met', 'alerted', 'error', 'duration_ms', 'fetch_method']
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

// ─── Wizard ────────────────────────────────────────────────────────────────

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
    try { new URL(form.url) } catch { return 'URL must be a valid web address' }
    if (form.is_multi_field) {
      const validFields = form.fields.filter(f => f.name.trim() || f.selector.trim())
      if (validFields.length === 0) return 'Add at least one field with a name and selector'
      for (const f of validFields) {
        if (!f.name.trim()) return 'Each field must have a name'
        if (!f.selector.trim()) return `Field "${f.name}" is missing a selector`
        if (!f.normalization) return `Field "${f.name}" requires normalization selection`
        if (!/^[a-z][a-z0-9_]{2,49}$/.test(f.name))
          return `Field name "${f.name}" must start with a lowercase letter and contain only lowercase letters, digits, and underscores (3–50 characters)`
      }
      const names = validFields.map(f => f.name)
      if (new Set(names).size !== names.length) return 'Field names must be unique'
    } else {
      if (!form.selector.trim()) return 'Selector is required'
    }
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

// Field name autocomplete input
function FieldNameInput({ value, onChange, existingNames = [] }) {
  const [suggestions, setSuggestions] = useState([])
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)

  const getAutocompleteSuggestions = (prefix) => {
    const results = []
    const firstWord = prefix.split('_')[0]
    
    if (firstWord in PREFIX_SUGGESTIONS) {
      results.push(...PREFIX_SUGGESTIONS[firstWord])
    }
    
    // Also check if any suggestion starts with full prefix
    for (const suggestions of Object.values(PREFIX_SUGGESTIONS)) {
      for (const s of suggestions) {
        if (s.startsWith(prefix) && !results.includes(s)) {
          results.push(s)
        }
      }
    }
    
    // Filter out already used names
    return results.filter(name => !existingNames.includes(name)).slice(0, 6)
  }

  const handleChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    onChange(val)
    
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (val.length >= 2) {
        setSuggestions(getAutocompleteSuggestions(val))
      } else {
        setSuggestions([])
      }
    }, 150)
  }

  const pickSuggestion = (name) => {
    onChange(name)
    setSuggestions([])
  }

  return (
    <div className="relative">
      <input
        className="input font-mono text-sm"
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="home_score, price, temperature…" 
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {suggestions.map(name => (
            <button key={name} type="button"
              onMouseDown={() => pickSuggestion(name)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left"
              style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ color: 'var(--foreground)' }}>{name}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--muted-foreground)' }}>
                Suggested
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
        Lowercase, underscores only — used in condition expression
      </p>
    </div>
  )
}

// Contact autocomplete input
function ContactInput({ recipientInput, setRecipientInput, contacts }) {
  const [suggestions, setSuggestions] = useState([])
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)

  const handleChange = (e) => {
    const val = e.target.value
    setRecipientInput(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const parts = val.split(',')
      const current = parts[parts.length - 1].trim()
      if (current.length < 1) { setSuggestions([]); return }
      const q = current.toLowerCase()
      setSuggestions(
        contacts.filter(c =>
          c.value.toLowerCase().includes(q) ||
          (c.label && c.label.toLowerCase().includes(q))
        ).slice(0, 6)
      )
    }, 150)
  }

  const pick = (contact) => {
    const parts = recipientInput.split(',').map(s => s.trim())
    parts[parts.length - 1] = contact.value
    setRecipientInput(parts.filter(Boolean).join(', ') + ', ')
    setSuggestions([])
  }

  const selected = recipientInput.split(',').map(s => s.trim()).filter(Boolean)

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
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left"
              style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ color: 'var(--foreground)' }}>{c.value}</span>
              <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                {c.label || c.type}{c.use_count > 0 ? ` · ${c.use_count}x` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
              {v}
              <button type="button" onClick={() => {
                const next = selected.filter(x => x !== v)
                setRecipientInput(next.join(', '))
              }} style={{ color: 'var(--muted-foreground)' }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MonitorModal ────────────────────────────────────────────────────────

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
      // Multi-field
      is_multi_field:         src.is_multi_field         || false,
      multi_field_condition:  src.multi_field_condition  || '',
      fields: Array.isArray(src.fields) && src.fields.length > 0
        ? src.fields.map(f => ({
            name: f.name || '', selector: f.selector || '',
            selector_type: f.selector_type || 'css', attribute: f.attribute || '',
            normalization: f.normalization || '', position: f.position || 0,
            tested: f.tested || false, testResult: f.testResult || null,
          }))
        : EMPTY_FORM.fields,
    }
  }

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
  const [step,           setStep]           = useState(0)
  const [maxStep,        setMaxStep]        = useState(initial ? 3 : 0)
  const [stepError,      setStepError]      = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [contacts,       setContacts]       = useState([])
  const [testResult,     setTestResult]     = useState(null)
  const [testing,        setTesting]        = useState(false)
  const [showPicker,     setShowPicker]     = useState(false)
  const [pickingFieldIdx, setPickingFieldIdx] = useState(null)  // Track which field is being picked
  const [multiTestResult, setMultiTestResult] = useState(null)
  const [multiTesting,    setMultiTesting]   = useState(false)
  const [fieldNameErrors, setFieldNameErrors] = useState({})  // index → error string

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    import('../services/api').then(({ contactsApi }) => {
      contactsApi.list().then(r => setContacts(r.data)).catch(() => {})
    })
  }, [])

  // Persist draft on change
  useEffect(() => {
    if (initial || showDraftPrompt) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, recipientInput, step })) } catch {}
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
        url: form.url,
        selector_type: form.selector_type,
        selector: form.selector,
        attribute: form.attribute || null,
        use_playwright: form.use_playwright,
        wait_ms: form.wait_ms || 3000,
      })
      setTestResult(data)
    } catch (err) {
      setTestResult({ error: err.response?.data?.detail || 'Test failed', diagnosis: 'Request error', value: null })
    } finally { setTesting(false) }
  }

  const handlePickerSelect = ({ selector, value, value_type, suggested_operator }) => {
    if (pickingFieldIdx !== null) {
      // Multi-field mode - update the specific field
      updateField(pickingFieldIdx, { selector, selector_type: 'css' })
    } else {
      // Single-field mode
      setForm(f => ({
        ...f,
        selector,
        selector_type: 'css',
        condition_operator: suggested_operator || f.condition_operator,
      }))
      setTestResult({
        value,
        diagnosis: value ? 'Extracted from picker' : 'Element found but no text value',
        used_playwright: true,
        duration_ms: null,
        error: null,
      })
    }
    setPickingFieldIdx(null)
    setShowPicker(false)
  }

  // ── Multi-field helpers ──────────────────────────────────────────────────
  const updateField = (idx, patch) => setForm(f => {
    const fields = f.fields.map((field, i) => i === idx ? { ...field, ...patch } : field)
    return { ...f, fields }
  })

  const addField = () => setForm(f => ({
    ...f,
    fields: [...f.fields, { name: '', selector: '', selector_type: 'css', attribute: '', normalization: '', position: f.fields.length, tested: false, testResult: null }]
  }))

  const removeField = (idx) => setForm(f => ({
    ...f,
    fields: f.fields.filter((_, i) => i !== idx)
  }))

  const startEditingField = (idx) => {
    updateField(idx, { tested: false, testResult: null })
  }

  const deleteField = (idx) => {
    removeField(idx)
  }

  const handleMultiTest = async () => {
    const validFields = form.fields.filter(f => f.name.trim() && f.selector.trim())
    if (!validFields.length || !form.url) return
    setMultiTesting(true); setMultiTestResult(null)
    try {
      const { monitorsApi } = await import('../services/api')
      const { data } = await monitorsApi.testMultiFields({
        url: form.url,
        use_playwright: form.use_playwright,
        wait_ms: form.wait_ms || 3000,
        fields: validFields.map(f => ({
          name: f.name, selector: f.selector,
          selector_type: f.selector_type, attribute: f.attribute || null,
          normalization: f.normalization || null, position: 0,
        })),
      })
      setMultiTestResult(data)
    } catch (err) {
      setMultiTestResult({ success: false, error: 'Test failed', fields: [] })
    } finally { setMultiTesting(false) }
  }

  const handleSingleFieldTest = async (fieldIdx) => {
    const field = form.fields[fieldIdx]
    if (!field.name.trim() || !field.selector.trim() || !form.url) return
    
    try {
      const { monitorsApi } = await import('../services/api')
      const { data } = await monitorsApi.testMultiFields({
        url: form.url,
        use_playwright: form.use_playwright,
        wait_ms: form.wait_ms || 3000,
        fields: [{
          name: field.name, selector: field.selector,
          selector_type: field.selector_type, attribute: field.attribute || null,
          normalization: field.normalization || null, position: 0,
        }],
      })
      
      // Update the field with test result and mark as tested
      updateField(fieldIdx, {
        tested: data.fields[0].success,
        testResult: data.fields[0]
      })
      
      // Update the overall multi-test result
      const updatedFields = (multiTestResult?.fields || []).filter(f => f.name !== field.name)
      updatedFields.push(data.fields[0])
      
      setMultiTestResult({
        success: data.success,
        error: data.error,
        fields: updatedFields
      })
    } catch (err) {
      // Update the field with error result
      updateField(fieldIdx, {
        tested: false,
        testResult: {
          name: field.name,
          success: false,
          error: 'Test failed',
          diagnosis: 'Request error',
          value: null
        }
      })
      
      // Update the overall multi-test result
      const updatedFields = (multiTestResult?.fields || []).filter(f => f.name !== field.name)
      updatedFields.push({
        name: field.name,
        success: false,
        error: 'Test failed',
        diagnosis: 'Request error',
        value: null
      })
      
      setMultiTestResult({
        success: false,
        error: 'Test failed',
        fields: updatedFields
      })
    }
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
    if (idx > maxStep) return
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
      const payload = {
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
        stop_on_condition_met:      form.stop_on_condition_met,
        skip_initial_notification:  form.skip_initial_notification,
        is_multi_field:             form.is_multi_field,
        multi_field_condition:      form.is_multi_field ? (form.multi_field_condition || null) : null,
        fields: form.is_multi_field
          ? form.fields
              .filter(f => f.name.trim() && f.selector.trim())
              .map((f, i) => ({ ...f, position: i, attribute: f.attribute || null, normalization: f.normalization || null }))
          : [],
      }
      // In single-field mode, selector is required; in multi-field mode, use a placeholder
      if (form.is_multi_field) {
        payload.selector = payload.selector || '__multi_field__'
      }
      await onSave(payload)
      clearDraft()
      onClose()
    } catch (err) {
      setStepError(err.response?.data?.detail || 'Failed to save')
    } finally { setLoading(false) }
  }

  const selType  = SELECTOR_TYPES.find(s => s.value === form.selector_type)
  const unitInfo = INTERVAL_UNITS.find(u => u.value === form.check_interval_unit) || INTERVAL_UNITS[1]
  const isEdit   = !!initial

  // Build dynamic preview using form.name and testResult value (not hardcoded)
  const previewValue = testResult?.value || form.last_value || 'Initializing...'
  const messagePreview = form.message_template
    ? form.message_template
        .replace(/\{name\}/g,      form.name || 'My Monitor')
        .replace(/\{value\}/g,     previewValue)
        .replace(/\{prev_value\}/g,'—')
        .replace(/\{url\}/g,       form.url || 'https://example.com')
    : ''

  // Draft prompt
  if (showDraftPrompt && pendingDraft) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div className="rounded-2xl p-6 w-full max-w-sm space-y-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color: 'var(--foreground)' }}>
            Resume previous draft?
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

        {/* Header */}
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

        {/* Step indicator */}
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
                    color: (completed || active) ? '#fff' : 'var(--muted-foreground)',
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

        {/* Error banner */}
        {stepError && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-sm shrink-0"
            style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                     color: 'var(--destructive)', border: '1px solid var(--destructive)' }}>
            {stepError}
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">

          {/* ── STEP 1: BASIC ── */}
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

              {/* ── Multi-Element Fields toggle ── */}
              <div className="rounded-xl p-4"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      Multi-Element Fields
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Extract multiple named values in a single page load and combine them in a condition
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                      checked={form.is_multi_field}
                      onChange={e => {
                        setForm(f => ({ ...f, is_multi_field: e.target.checked }))
                        setMultiTestResult(null)
                      }} />
                    <span className="text-sm" style={{ color: 'var(--foreground)' }}>Enable</span>
                  </label>
                </div>
              </div>

              {/* ── MULTI-FIELD UI ── */}
              {form.is_multi_field ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                      Fields ({form.fields.filter(f => f.name || f.selector).length} configured)
                    </p>
                    <button type="button" onClick={handleMultiTest}
                      disabled={multiTesting || !form.url || !form.fields.some(f => f.name && f.selector)}
                      className="btn-secondary text-xs px-3 py-1.5">
                      {multiTesting ? 'Testing…' : 'Test All Fields'}
                    </button>
                  </div>

                  {form.fields.map((field, idx) => {
                    // Show card if field has been successfully tested
                    if (field.tested && field.testResult?.success) {
                      return (
                        <div key={idx} className="rounded-xl p-4 space-y-3"
                          style={{ background: 'color-mix(in srgb, #16a34a 8%, var(--muted))', border: '1px solid #16a34a33' }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                                style={{ background: '#16a34a', color: '#fff' }}>Field {idx + 1}</span>
                              <span className="text-xs font-semibold text-emerald-600">✓ Tested</span>
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => startEditingField(idx)}
                                className="btn-secondary text-xs px-2 py-1">
                                Edit
                              </button>
                              {form.fields.length > 1 && (
                                <button type="button" onClick={() => deleteField(idx)}
                                  className="btn-ghost p-1" style={{ color: 'var(--destructive)' }}>
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p style={{ color: 'var(--muted-foreground)' }}>Field Name</p>
                              <p className="font-mono font-semibold" style={{ color: 'var(--foreground)' }}>{field.name}</p>
                            </div>
                            <div>
                              <p style={{ color: 'var(--muted-foreground)' }}>Type</p>
                              <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
                                {SELECTOR_TYPES.find(s => s.value === field.selector_type)?.label || field.selector_type}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p style={{ color: 'var(--muted-foreground)' }}>Selector</p>
                              <p className="font-mono text-xs break-all" style={{ color: 'var(--foreground)' }}>{field.selector}</p>
                            </div>
                            {field.attribute && (
                              <div>
                                <p style={{ color: 'var(--muted-foreground)' }}>Attribute</p>
                                <p className="font-mono" style={{ color: 'var(--foreground)' }}>{field.attribute}</p>
                              </div>
                            )}
                            {field.normalization && (
                              <div>
                                <p style={{ color: 'var(--muted-foreground)' }}>Normalization</p>
                                <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
                                  {field.normalization === 'none' ? 'None (raw text)' :
                                   field.normalization === 'extract_numbers' ? 'Extract numbers' :
                                   field.normalization === 'strip_whitespace' ? 'Strip whitespace' :
                                   field.normalization}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="rounded-lg px-3 py-2 text-xs"
                            style={{ background: 'color-mix(in srgb, #16a34a 10%, transparent)', border: '1px solid #16a34a' }}>
                            <span>
                              ✓ <strong className="font-mono">{field.testResult.value}</strong>
                              {field.testResult.normalized_value != null ? (
                                <span style={{ color: 'var(--muted-foreground)' }}> → {field.testResult.normalized_value}</span>
                              ) : (
                                <>
                                  <span className="text-xs font-bold" style={{ color: 'var(--destructive)' }}>—</span>
                                  <button
                                    onClick={() => toast(`Normalization Needed for "${field.name}"

The field contains numeric data but normalization is not configured. This can cause conditions to fail.

To fix: Set "Normalization" to "Extract numbers" in the field settings.`, {
                                      duration: 6000,
                                      icon: 'ℹ️'
                                    })}
                                    className="btn-primary text-xs px-1 py-0.5 ml-1"
                                    title="Fix normalization"
                                  >
                                    Fix
                                  </button>
                                </>
                              )}
                              <span style={{ color: 'var(--muted-foreground)' }}> · {field.testResult.extraction_time_ms}ms</span>
                            </span>
                          </div>
                        </div>
                      )
                    }

                    // Show form for untested fields
                    return (
                      <div key={idx} className="rounded-xl p-3 space-y-2"
                        style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--primary)', color: '#fff' }}>Field {idx + 1}</span>
                          {form.fields.length > 1 && (
                            <button type="button" onClick={() => deleteField(idx)}
                              className="btn-ghost p-1" style={{ color: 'var(--destructive)' }}>
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="label">Field name</label>
                          <FieldNameInput
                            value={field.name}
                            onChange={(name) => updateField(idx, { name })}
                            existingNames={form.fields.filter((f, i) => i !== idx && f.name).map(f => f.name)}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="label">Type</label>
                            <select className="input text-xs" value={field.selector_type}
                              onChange={e => updateField(idx, { selector_type: e.target.value })}>
                              {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="label">Selector</label>
                            <div className="flex gap-2">
                              <input className="input font-mono text-xs flex-1" value={field.selector}
                                onChange={e => updateField(idx, { selector: e.target.value })}
                                placeholder="div.score, //span[@class='val']…" />
                              <button type="button"
                                onClick={() => {
                                  if (!form.url) { setStepError('Enter a URL first'); return }
                                  try { new URL(form.url) } catch { setStepError('Enter a valid URL first'); return }
                                  setStepError(null); 
                                  setPickingFieldIdx(idx)
                                  setShowPicker(true)
                                }}
                                className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap">
                                Pick
                              </button>
                              <button type="button" onClick={() => handleSingleFieldTest(idx)}
                                disabled={!form.url || !field.selector}
                                className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                                Test
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label">Attribute <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(opt)</span></label>
                            <input className="input font-mono text-xs" value={field.attribute}
                              onChange={e => updateField(idx, { attribute: e.target.value })}
                              placeholder="href, value, data-price" />
                          </div>
                          <div>
                            <label className="label">Normalization *</label>
                            <select className="input text-xs" value={field.normalization}
                              onChange={e => updateField(idx, { normalization: e.target.value })}
                              required>
                              <option value="">Select normalization...</option>
                              <option value="none">None (raw text)</option>
                              <option value="extract_numbers">Extract numbers</option>
                              <option value="strip_whitespace">Strip whitespace</option>
                            </select>
                          </div>
                        </div>

                        {field.testResult && !field.testResult.success && (
                          <div className="rounded-lg px-2 py-1.5 text-xs"
                            style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', border: '1px solid var(--destructive)' }}>
                            <span style={{ color: 'var(--destructive)' }}>
                              ✗ {field.testResult.diagnosis || field.testResult.error || 'No value found'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button type="button" onClick={addField}
                    className="w-full btn-secondary text-xs py-2 flex items-center justify-center gap-1">
                    <Plus size={12} /> Add Field
                  </button>

                  {multiTestResult && (
                    <div className="rounded-lg px-3 py-2 text-xs"
                      style={{
                        background: multiTestResult.success ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                        border: `1px solid ${multiTestResult.success ? 'var(--primary)' : 'var(--destructive)'}`,
                      }}>
                      {multiTestResult.success
                        ? <span>✓ {multiTestResult.fields.filter(f => f.success).length}/{multiTestResult.fields.length} fields extracted
                            {' '}· {multiTestResult.duration_ms}ms{multiTestResult.used_playwright ? ' · Playwright' : ''}</span>
                        : <span style={{ color: 'var(--destructive)' }}>✗ {multiTestResult.error}</span>
                      }
                    </div>
                  )}

                  {/* Condition builder */}
                  <div className="space-y-1.5">
                    <label className="label">
                      Condition expression{' '}
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(optional — leave blank to always trigger)</span>
                    </label>
                    <input className="input font-mono text-sm"
                      value={form.multi_field_condition}
                      onChange={set('multi_field_condition')}
                      placeholder={
                        form.fields.filter(f => f.name).length >= 2
                          ? `${form.fields[0]?.name} + ${form.fields[1]?.name} > 150`
                          : 'home_score + away_score > 150'
                      } />
                    <div className="rounded-lg px-3 py-2 text-[11px] space-y-1"
                      style={{ background: 'color-mix(in srgb, #7c3aed 6%, transparent)', border: '1px solid #7c3aed33' }}>
                      <p className="font-semibold" style={{ color: '#7c3aed' }}>
                        Available fields: {form.fields.filter(f => f.name).map(f => f.name).join(', ') || '—'}
                      </p>
                      <ul className="font-mono space-y-0.5 text-[10px]" style={{ color: 'var(--foreground)' }}>
                        <li>home_score + away_score &gt; 150</li>
                        <li>Math.abs(bid_price - ask_price) &lt; 0.01</li>
                        <li>price &lt; 100 &amp;&amp; stock == 'In Stock'</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── SINGLE-FIELD MODE ── */
                <div className="space-y-4">
                  <div className="rounded-xl p-4 space-y-3"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--muted-foreground)' }}>Element / Expression</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          Click "Pick" to select visually, or type a selector manually
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button"
                          onClick={() => {
                            if (!form.url) { setStepError('Enter a URL first'); return }
                            try { new URL(form.url) } catch { setStepError('Enter a valid URL first'); return }
                            setStepError(null); 
                            setPickingFieldIdx(null)
                            setShowPicker(true)
                          }}
                          className="btn-primary text-xs px-3 py-1.5">Pick</button>
                        <button type="button" onClick={handleTest}
                          disabled={testing || !form.url || !form.selector}
                          className="btn-secondary text-xs px-3 py-1.5">
                          {testing ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="label">Selector type</label>
                      <select className="input" value={form.selector_type} onChange={set('selector_type')}>
                        {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>

                    {form.selector_type === 'js_expr' && (
                      <div className="rounded-lg px-3 py-2.5 text-xs space-y-1.5"
                        style={{ background: 'color-mix(in srgb, #7c3aed 8%, transparent)', border: '1px solid #7c3aed44' }}>
                        <p className="font-semibold" style={{ color: '#7c3aed' }}>
                          <Code2 size={10} className="inline mr-1" />JS Expression — multi-element math
                        </p>
                        <ul className="space-y-0.5 font-mono text-[10px]" style={{ color: 'var(--foreground)' }}>
                          <li><strong>css('.score-a') + css('.score-b')</strong></li>
                          <li><strong>css('.price') + css('.tax')</strong></li>
                          <li><strong>css('.items')[0] + css('.items')[1]</strong></li>
                        </ul>
                      </div>
                    )}

                    <div>
                      <label className="label">Selector</label>
                      <input className="input font-mono text-sm" value={form.selector} onChange={set('selector')}
                        placeholder={selType?.placeholder} />
                    </div>

                    {form.selector_type === 'css' && (
                      <div>
                        <label className="label">Attribute <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(blank = inner text)</span></label>
                        <input className="input font-mono text-sm" value={form.attribute} onChange={set('attribute')}
                          placeholder="value, href, data-price" />
                      </div>
                    )}

                    <p className="text-[11px] rounded-lg px-3 py-2"
                      style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', color: 'var(--muted-foreground)' }}>
                      {form.selector_type === 'css'     && 'DevTools → right-click element → Copy → Copy selector'}
                      {form.selector_type === 'xpath'   && 'DevTools → right-click element → Copy → Copy XPath'}
                      {form.selector_type === 'text'    && 'Paste the exact text you want to detect on the page'}
                      {form.selector_type === 'regex'   && 'Use a capture group e.g. (\\d+) to extract a number'}
                      {form.selector_type === 'js_expr' && "Use css('selector') + css('selector') to combine values"}
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
                            {testResult.error ? '⚠ Error' : testResult.value ? '✓ Value found' : '⚠ No value'}
                          </span>
                          <span style={{ color: 'var(--muted-foreground)' }}>
                            {testResult.duration_ms != null ? (
                              testResult.duration_ms < 1000 ? `${testResult.duration_ms}ms` : `${(testResult.duration_ms / 1000).toFixed(1)}s`
                            ) : ''}{testResult.used_playwright ? ' · Playwright' : ''}
                          </span>
                        </div>
                        {testResult.value && (
                          <p className="font-mono font-semibold" style={{ color: 'var(--foreground)' }}>"{testResult.value}"</p>
                        )}
                        <p style={{ color: 'var(--muted-foreground)' }}>{testResult.diagnosis}</p>
                      </div>
                    )}
                  </div>

                  {/* Separate monitor selector */}
                  <div className="rounded-xl p-4 space-y-3"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Separate monitor element</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          Use a different selector for the condition trigger
                        </p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                          checked={form.use_monitor_selector} onChange={setChk('use_monitor_selector')} />
                        <span className="text-sm" style={{ color: 'var(--foreground)' }}>Enable</span>
                      </label>
                    </div>
                    {form.use_monitor_selector && (
                      <div className="space-y-3">
                        <div>
                          <label className="label">Monitor selector type</label>
                          <select className="input" value={form.monitor_selector_type} onChange={set('monitor_selector_type')}>
                            {SELECTOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Monitor selector</label>
                          <input className="input font-mono text-sm" value={form.monitor_selector}
                            onChange={set('monitor_selector')} placeholder=".price-display" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alert condition */}
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
                    <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                      For numeric comparisons, currency symbols and commas are stripped automatically
                    </p>
                  </div>
                </div>
              )}

              {/* Playwright toggle (both modes) */}
              {form.is_multi_field && (
                <div className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Dynamic page (Playwright)</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        Enable for JS-rendered content (React, Vue, Angular, etc.)
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                        checked={form.use_playwright} onChange={setChk('use_playwright')} />
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>Enable</span>
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
              )}

              {/* Monitor Behavior (both modes) */}
              <div className="space-y-3">
                <label className="label">Monitor Behavior</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                      checked={form.stop_on_condition_met}
                      onChange={e => setForm(f => ({ ...f, stop_on_condition_met: e.target.checked }))} />
                    <span className="text-sm">Stop monitoring after condition is met (saves costs)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded accent-sky-600"
                      checked={form.skip_initial_notification}
                      onChange={e => setForm(f => ({ ...f, skip_initial_notification: e.target.checked }))} />
                    <span className="text-sm">Skip notification on first run (initial value check)</span>
                  </label>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                  By default, monitors stop after first alert to save costs.
                  Disable to continue monitoring after each alert.
                </p>
              </div>
            </div>
          )}

                    {/* ── STEP 2: SCHEDULE ── */}
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
                    Min: {unitInfo.min} {unitInfo.label.toLowerCase()}
                  </p>
                </div>
              )}

              {form.schedule_type === 'cron' && (
                <div>
                  <label className="label">Cron expression</label>
                  <input className="input font-mono" value={form.cron_expression}
                    onChange={set('cron_expression')} placeholder="*/15 * * * *" />
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    e.g. <code>*/15 * * * *</code> = every 15 min · <code>0 9 * * 1-5</code> = weekdays 9am UTC
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

          {/* ── STEP 3: NOTIFY ── */}
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

                {/* Live preview — uses actual form values, not hardcoded */}
                {form.message_template && (
                  <div className="mt-2 rounded-lg px-3 py-2 text-xs"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide mr-1"
                      style={{ color: 'var(--muted-foreground)' }}>Preview:</span>
                    {messagePreview}
                  </div>
                )}
              </div>

              <div>
                <label className="label">
                  Webhook URL{' '}
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input className="input font-mono text-sm" type="url" value={form.webhook_url}
                  onChange={set('webhook_url')} placeholder="https://hooks.yourapp.com/monitor" />
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  POST JSON payload sent whenever the condition is met
                </p>
              </div>

              <div>
                <label className="label">
                  Tags{' '}
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(comma-separated)</span>
                </label>
                <input className="input text-sm" value={form.tags} onChange={set('tags')}
                  placeholder="price, stock, kenya" />
              </div>
            </div>
          )}

          {/* ── STEP 4: ADVANCED ── */}
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

        {/* Element Picker overlay */}
        {showPicker && (
          <ElementPicker
            url={form.url}
            onSelect={handlePickerSelect}
            onClose={() => setShowPicker(false)}
          />
        )}

        {/* Footer navigation */}
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
              {loading ? 'Saving…' : isEdit ? 'Update Monitor' : 'Create Monitor'}
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
  const [filter, setFilter] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const [expandedFieldLog, setExpandedFieldLog] = useState(null)  // log id → field results
  const [fieldResultsCache, setFieldResultsCache] = useState({})  // log_id → [{field_name, ...}]

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
      setFieldResultsCache({})
      setExpandedFieldLog(null)
      setConfirmClear(false)
      toast.success('Logs cleared')
    } catch { toast.error('Failed to clear logs') }
  }

  const toggleFieldResults = async (logId) => {
    if (expandedFieldLog === logId) { setExpandedFieldLog(null); return }
    setExpandedFieldLog(logId)
    if (!fieldResultsCache[logId]) {
      try {
        const { data } = await monitorsApi.logFields(monitor.id, logId)
        setFieldResultsCache(c => ({ ...c, [logId]: data }))
      } catch { setFieldResultsCache(c => ({ ...c, [logId]: [] })) }
    }
  }

  const filtered = logs.filter(l => {
    if (filter === 'alert') return l.alerted
    if (filter === 'error') return !!l.error
    if (filter === 'ok')    return !l.error && !l.alerted
    return true
  })

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-wrap gap-2"
        style={{ background: 'var(--muted)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted-foreground)' }}>
          Check Log {logs.length > 0 && `(${logs.length})`}
        </p>
        <div className="flex items-center gap-2">
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
          <div className="flex gap-1">
            <button onClick={() => exportLogsJSON(logs, monitor.name)} type="button"
              title="Export JSON" className="btn-ghost p-1 text-xs">JSON</button>
            <button onClick={() => exportLogsCSV(logs, monitor.name)} type="button"
              title="Export CSV" className="btn-ghost p-1 text-xs">CSV</button>
          </div>
          {logs.length > 0 && (
            <button onClick={() => setConfirmClear(true)} type="button"
              className="btn-ghost p-1.5"
              style={{ color: 'var(--destructive)' }}>
              <Trash2 size={12} />
            </button>
          )}
          <button onClick={loadLogs} type="button" className="btn-ghost p-1.5" title="Refresh logs">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-5"><div className="spinner-sm" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-center py-5" style={{ color: 'var(--muted-foreground)' }}>
          {logs.length === 0 ? 'No checks yet — run a check manually or wait for the schedule' : 'No logs match filter'}
        </p>
      ) : (
        <div className="divide-y max-h-72 overflow-y-auto scrollbar-thin"
          style={{ borderColor: 'var(--border)' }}>
          {filtered.map(l => (
            <div key={l.id}
              className="flex items-start gap-3 px-4 py-2.5 text-sm group transition-colors"
              style={{ background: 'var(--card)', flexDirection: 'column' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}>

              {/* Main log row */}
              <div className="flex items-start gap-3 w-full">
                {/* Icon */}
                <div className="mt-0.5 shrink-0">
                  {l.error
                    ? <AlertCircle size={13} style={{ color: 'var(--destructive)' }} />
                    : l.alerted
                      ? <Zap size={13} className="text-amber-500" />
                      : l.condition_met
                        ? <CheckCircle2 size={13} className="text-emerald-500" />
                        : <Clock size={13} style={{ color: 'var(--muted-foreground)' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Value display */}
                  {l.value_found !== null && l.value_found !== undefined ? (
                    <p className="font-mono text-xs truncate" style={{ color: 'var(--foreground)' }}>
                      <span className="font-semibold">
                        {l.value_found === ''
                          ? <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>empty</span>
                          : l.value_found}
                      </span>
                      {l.prev_value !== null && l.prev_value !== undefined && l.prev_value !== l.value_found && (
                        <span style={{ color: 'var(--muted-foreground)' }}> ← {l.prev_value}</span>
                      )}
                    </p>
                  ) : (
                    <p className="font-mono text-xs" style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                      no value extracted
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {l.error && <p className="text-xs truncate max-w-xs" style={{ color: 'var(--destructive)' }}>{l.error}</p>}
                    {l.alerted && <span className="badge-blue text-[10px]">alerted</span>}
                    {l.duration_ms != null && (
                      <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        {l.duration_ms < 1000 ? `${l.duration_ms}ms` : `${(l.duration_ms / 1000).toFixed(1)}s`}
                      </span>
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
                    {/* Show field-expand button for multi-field monitors */}
                    {monitor.is_multi_field && !l.error && (
                      <button type="button"
                        onClick={() => toggleFieldResults(l.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                        style={{
                          background: expandedFieldLog === l.id ? 'color-mix(in srgb, #7c3aed 15%, transparent)' : 'var(--muted)',
                          color: expandedFieldLog === l.id ? '#7c3aed' : 'var(--muted-foreground)',
                          border: '1px solid var(--border)',
                        }}>
                        {expandedFieldLog === l.id ? '▲ fields' : '▼ fields'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Time + delete */}
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {formatDistanceToNow(
                      new Date(l.checked_at.endsWith('Z') ? l.checked_at : l.checked_at + 'Z'),
                      { addSuffix: true }
                    )}
                  </p>
                  <button onClick={() => handleDeleteLog(l.id)} type="button"
                    className="opacity-0 group-hover:opacity-100 btn-ghost p-1 transition-opacity"
                    style={{ color: 'var(--destructive)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Expandable field results for multi-field monitors */}
              {monitor.is_multi_field && expandedFieldLog === l.id && (
                <div className="w-full mt-2 ml-5 rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}>
                  {!fieldResultsCache[l.id] ? (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
                  ) : fieldResultsCache[l.id].length === 0 ? (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>No field results stored for this run</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Field</th>
                          <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Value</th>
                          <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Normalized</th>
                          <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldResultsCache[l.id].map((fr, i) => (
                          <tr key={i} style={{ borderBottom: i < fieldResultsCache[l.id].length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: 'var(--foreground)' }}>{fr.field_name}</td>
                            <td className="px-3 py-1.5 font-mono" style={{ color: fr.success ? 'var(--foreground)' : 'var(--destructive)' }}>
                              {fr.success ? (fr.raw_value || '—') : <span style={{ fontStyle: 'italic' }}>{fr.error_message || 'no value'}</span>}
                            </td>
                            <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--muted-foreground)' }}>
                              {fr.normalized_value != null ? (
                                fr.normalized_value
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold" style={{ color: 'var(--destructive)' }}>—</span>
                                  <button
                                    onClick={() => toast(`Normalization Needed for "${fr.field_name}"

The field contains numeric data (${fr.rawValue}) but normalization is not configured. This can cause conditions to fail.

To fix: Edit this monitor and set "Normalization" to "Extract numbers" for this field.`, {
                                      duration: 8000,
                                      icon: 'ℹ️'
                                    })}
                                    className="btn-primary text-xs px-2 py-1"
                                    title={`Learn how to fix normalization for ${fr.field_name}`}
                                  >
                                    Fix
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right" style={{ color: 'var(--muted-foreground)' }}>
                              {fr.extraction_time_ms != null ? `${fr.extraction_time_ms}ms` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
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
    <span className="inline-flex items-center gap-1">
      <Timer size={10} />
      {label === 'now' ? <span style={{ color: 'var(--primary)' }}>running soon</span> : label}
    </span>
  )
}

// ─── MonitorCard ────────────────────────────────────────────────────────────

function MonitorCard({ m, onEdit, onDelete, onToggle, onCheck, onClone, checking }) {
  const [expanded, setExpanded] = useState(false)
  const rate = successRate(m)
  const sc = STATUS_COLOR[m.status] || { dot: 'var(--muted-foreground)', badge: 'badge-gray' }

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>

      {/* Card header */}
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ background: sc.dot, boxShadow: m.status === 'active' ? `0 0 0 3px ${sc.dot}22` : 'none' }} />

          <div className="flex-1 min-w-0">
            {/* Name + badges row */}
            <div className="flex items-start gap-2 flex-wrap">
              <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--foreground)' }}>
                {m.name}
              </p>
              <span className={`${sc.badge} text-[10px] shrink-0`}>{m.status}</span>
              {m.is_multi_field && <span className="badge-purple text-[10px] shrink-0">multi-field</span>}
              {m.use_playwright && <span className="badge-purple text-[10px] shrink-0">playwright</span>}
              {(m.notify_channels || []).map(ch => (
                <span key={ch} className="badge-gray text-[10px] shrink-0">{ch}</span>
              ))}
            </div>

            {/* URL */}
            <p className="text-xs font-mono mt-1 truncate" style={{ color: 'var(--muted-foreground)', maxWidth: '100%' }}>
              {m.url}
            </p>

            {/* Selector + condition */}
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted-foreground)' }}>
              {m.is_multi_field ? (
                <>
                  <span className="font-mono px-1 rounded mr-1 text-[10px]"
                    style={{ background: 'color-mix(in srgb, #7c3aed 15%, transparent)', color: '#7c3aed' }}>
                    {(m.fields || []).length} fields
                  </span>
                  {(m.fields || []).map(f => f.name).join(', ')}
                  {m.multi_field_condition && (
                    <span className="ml-1 opacity-60 font-mono">· {m.multi_field_condition}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-mono px-1 rounded mr-1 text-[10px]"
                    style={{ background: 'var(--muted)' }}>{m.selector_type}</span>
                  <span className="font-mono" style={{ opacity: 0.75 }}>
                    {m.selector.length > 45 ? m.selector.slice(0, 45) + '…' : m.selector}
                  </span>
                  {m.condition_operator && (
                    <span className="ml-1 opacity-60">
                      · {OPERATORS.find(o => o.value === m.condition_operator)?.label}
                      {m.condition_value && ` "${m.condition_value}"`}
                    </span>
                  )}
                </>
              )}
            </p>

            {/* Metrics row — wraps on mobile */}
            <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[11px]"
              style={{ color: 'var(--muted-foreground)' }}>

              <span>
                every {m.check_interval_minutes} {m.check_interval_unit || 'min'}
              </span>

              {m.next_run_at && m.status === 'active' && (
                <Countdown targetDate={m.next_run_at} />
              )}

              {m.last_checked_at && (
                <span title={format(new Date(
                  m.last_checked_at.endsWith('Z') ? m.last_checked_at : m.last_checked_at + 'Z'
                ), 'PPp')}>
                  last: {formatDistanceToNow(
                    new Date(m.last_checked_at.endsWith('Z') ? m.last_checked_at : m.last_checked_at + 'Z'),
                    { addSuffix: true }
                  )}
                </span>
              )}

              {m.run_count > 0 && (
                <span>{m.run_count} run{m.run_count !== 1 ? 's' : ''}</span>
              )}

              {rate !== null && (
                <span style={{ color: rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : 'var(--destructive)', fontWeight: 600 }}>
                  {rate}% ok
                </span>
              )}

              {m.last_value !== null && m.last_value !== undefined && (
                <span>
                  val: <span className="font-mono font-medium" style={{ color: 'var(--foreground)' }}>
                    {m.last_value === '' ? <em>empty</em> : 
                     m.last_checked_at === null ? (
                       <span className="flex items-center gap-1">
                         <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin border-t-transparent"></div>
                         <em>Initializing...</em>
                       </span>
                     ) : 
                     `"${String(m.last_value).slice(0, 40)}"`}
                  </span>
                </span>
              )}

              {m.alert_count > 0 && (
                <span style={{ color: '#d97706', fontWeight: 600 }}>
                  🔔 {m.alert_count}
                </span>
              )}

              {m.error_message && (
                <span className="truncate max-w-[200px]" style={{ color: 'var(--destructive)' }}
                  title={m.error_message}>⚠ {m.error_message.slice(0, 55)}</span>
              )}

              {/* Show success message for auto-paused monitors */}
              {m.status === 'paused' && !m.error_message && m.alert_count > 0 && (
                <span className="truncate max-w-[200px]" style={{ color: '#16a34a' }}
                  title="Monitor automatically paused after condition was met - saving tokens">
                  ✓ Auto-paused after success
                </span>
              )}
            </div>

            {/* Tags */}
            {(m.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {(m.tags || []).map(t => (
                  <span key={t} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                    <Tag size={8} />{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons — stacked vertically on mobile, row on desktop */}
          <div className="flex flex-col sm:flex-row items-center gap-0.5 shrink-0 ml-1">
            <button onClick={() => onCheck(m)} disabled={checking}
              className="btn-ghost p-2" title="Check now">
              {checking ? <div className="spinner-sm" /> : <Play size={13} />}
            </button>
            <button onClick={() => setExpanded(v => !v)} className="btn-ghost p-2" title="View logs">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button onClick={() => onToggle(m)} className="btn-ghost p-2"
              title={m.status === 'active' ? 'Pause' : 'Resume'}>
              {m.status === 'active'
                ? <Pause size={13} />
                : <Play size={13} style={{ color: 'var(--primary)' }} />}
            </button>
            <button onClick={() => onClone(m)} className="btn-ghost p-2" title="Clone">
              <Copy size={13} />
            </button>
            <button onClick={() => onEdit(m)} className="btn-ghost p-2" title="Edit">
              <Settings2 size={13} />
            </button>
            <button onClick={() => onDelete(m)} className="btn-ghost p-2"
              style={{ color: 'var(--destructive)' }} title="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Log drawer */}
      {expanded && <LogDrawer monitor={m} />}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ScraperPage() {
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]    = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [checking, setChecking]  = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTag, setFilterTag] = useState('')
  const [search, setSearch]      = useState('')

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

  // Refresh countdown every 15s
  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const handleSave = async form => {
    try {
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
    } catch (err) {
      // Handle validation errors
      if (err.response?.data?.error === 'Selector validation failed') {
        toast.error(err.response.data.detail)
      } else {
        toast.error(err.response?.data?.detail || 'Failed to save monitor')
      }
    }
  }

  const handleCheck = async m => {
    setChecking(m.id)
    try {
      const { data } = await monitorsApi.checkNow(m.id)
      let msg
      if (data.error) {
        msg = `Error: ${data.error}`
      } else if (data.value_found === null || data.value_found === undefined) {
        msg = 'No value extracted — selector did not match. Check selector in the form.'
      } else if (data.value_found === '') {
        msg = 'Element found but value is empty — try a different attribute or increase wait time.'
      } else {
        msg = `Extracted: "${data.value_found}" — ${data.condition_met ? 'condition MET ✓' : 'condition not met'}`
      }
      toast(msg, { icon: data.condition_met ? '🔔' : data.value_found ? '🔍' : '⚠️', duration: 7000 })
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

  const activeCount = monitors.filter(m => m.status === 'active').length
  const errorCount  = monitors.filter(m => m.status === 'error').length

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

      {/* Summary badges */}
      {!loading && monitors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded-lg font-medium"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            {monitors.length} total
          </span>
          {activeCount > 0 && (
            <span className="px-2 py-1 rounded-lg font-medium"
              style={{ background: 'color-mix(in srgb, #16a34a 12%, transparent)', color: '#16a34a' }}>
              {activeCount} active
            </span>
          )}
          {errorCount > 0 && (
            <span className="px-2 py-1 rounded-lg font-medium"
              style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)' }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      {!loading && monitors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="input text-sm py-1.5 px-3 w-full sm:max-w-xs"
            placeholder="Search monitors…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {['all', 'active', 'paused', 'error'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors"
              style={{
                background: filterStatus === s ? 'var(--primary)' : 'var(--muted)',
                color: filterStatus === s ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              }}>{s}</button>
          ))}
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
          <button onClick={load} className="btn-ghost p-1.5 ml-auto" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {/* Monitor list */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner-lg" /></div>
      ) : monitors.length === 0 ? (
        <div className="card">
          <EmptyState icon={Globe} title="No monitors yet"
            description="Track prices, stock levels, headlines — on any website including SPAs. Supports multi-element expressions."
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
        <div className="space-y-3">
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
