/**
 * ElementPicker — visual DOM element picker backed by a Playwright WebSocket session.
 *
 * Props:
 *   url          string   — page URL to load
 *   onSelect     fn({selector, value, value_type, suggested_operator, suggested_strip}) — called on confirmed selection
 *   onClose      fn()
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, CheckCircle2, AlertCircle, Loader } from 'lucide-react'

const WS_BASE = (window.location.protocol === 'https:' ? 'wss' : 'ws')
  + '://' + window.location.host + '/api/ws/picker'

const PORTAL = () => document.getElementById('modal-root') || document.body

export default function ElementPicker({ url, onSelect, onClose }) {
  const [status, setStatus]         = useState('Connecting...')
  const [phase, setPhase]           = useState('loading')  // loading | ready | selected | validating | done | error
  const [screenshot, setScreenshot] = useState(null)       // base64 PNG
  const [vpSize, setVpSize]         = useState({ width: 1280, height: 900 })
  const [selection, setSelection]   = useState(null)       // { selector, value, value_type, ... }
  const [highlight, setHighlight]   = useState(null)       // { top, left, width, height } in page px
  const [validating, setValidating] = useState(false)
  const [stable, setStable]         = useState(null)       // true/false/null

  const wsRef       = useRef(null)
  const imgRef      = useRef(null)
  const hoverTimer  = useRef(null)

  // ── WebSocket lifecycle ──────────────────────────────────────────────────

  const connect = useCallback(() => {
    const token = localStorage.getItem('token')
    if (!token) { setPhase('error'); setStatus('Not authenticated.'); return }

    setPhase('loading'); setStatus('Starting browser...')
    setScreenshot(null); setSelection(null); setHighlight(null); setStable(null)

    const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'navigate', url }))
    }

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === 'status') {
        setStatus(msg.message)
      }
      else if (msg.type === 'screenshot') {
        setScreenshot(msg.data)
        setVpSize({ width: msg.width, height: msg.height })
        setPhase('ready')
        setStatus('Click any element on the page to select it')
        setHighlight(null)
      }
      else if (msg.type === 'hover_ack') {
        setHighlight(msg.rect)
        if (msg.data) setScreenshot(msg.data)
      }
      else if (msg.type === 'selected') {
        setScreenshot(msg.data)
        setHighlight(msg.rect)
        setSelection(msg)
        setPhase('selected')
        setStatus('Element selected. Confirm or click a different element.')
        setStable(null)
      }
      else if (msg.type === 'validated') {
        setValidating(false)
        setStable(msg.stable)
        if (msg.stable) {
          setStatus(`Confirmed stable — extracted: "${msg.value}"`)
        } else {
          setStatus(msg.message || 'Selector may be unstable after reload.')
        }
      }
      else if (msg.type === 'error') {
        setStatus(msg.message)
        if (phase === 'loading') setPhase('error')
      }
    }

    ws.onerror  = () => { setStatus('Connection error'); setPhase('error') }
    ws.onclose  = (e) => {
      if (e.code === 4001) { setStatus('Authentication failed'); setPhase('error') }
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      clearTimeout(hoverTimer.current)
    }
  }, [connect])

  // ── Coordinate mapping ───────────────────────────────────────────────────

  // Map click/hover on the displayed <img> to page coordinates
  const toPageCoords = (e) => {
    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = vpSize.width  / rect.width
    const scaleY = vpSize.height / rect.height
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top)  * scaleY),
    }
  }

  const handleMouseMove = (e) => {
    if (phase !== 'ready' && phase !== 'selected') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const { x, y } = toPageCoords(e)
      wsRef.current?.send(JSON.stringify({ type: 'hover', x, y }))
    }, 40)
  }

  const handleClick = (e) => {
    if (phase !== 'ready' && phase !== 'selected') return
    e.preventDefault()
    const { x, y } = toPageCoords(e)
    wsRef.current?.send(JSON.stringify({ type: 'click', x, y }))
  }

  // ── Validate (re-load + re-run selector) ─────────────────────────────────

  const handleValidate = () => {
    if (!selection?.selector) return
    setValidating(true)
    setStable(null)
    setStatus('Reloading page to confirm selector stability...')
    wsRef.current?.send(JSON.stringify({ type: 'validate', selector: selection.selector, url }))
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!selection) return
    onSelect({
      selector:           selection.selector,
      value:              selection.value,
      value_type:         selection.value_type,
      suggested_operator: selection.suggested_operator,
      suggested_strip:    selection.suggested_strip,
      numeric_value:      selection.numeric_value,
    })
    wsRef.current?.send(JSON.stringify({ type: 'close' }))
    wsRef.current?.close()
    onClose()
  }

  // ── Highlight overlay positioning ────────────────────────────────────────

  const overlayStyle = () => {
    if (!highlight || !imgRef.current) return { display: 'none' }
    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = rect.width  / vpSize.width
    const scaleY = rect.height / vpSize.height
    return {
      position: 'absolute',
      top:    highlight.top    * scaleY,
      left:   highlight.left   * scaleX,
      width:  highlight.width  * scaleX,
      height: highlight.height * scaleY,
      outline: phase === 'selected' ? '2px solid #22c55e' : '2px solid #06b6d4',
      background: phase === 'selected' ? 'rgba(34,197,94,0.1)' : 'rgba(6,182,212,0.08)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)' }}>

      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
            Element Picker
          </p>
          <p className="text-xs truncate mt-0.5 flex items-center gap-1.5"
            style={{ color: 'var(--muted-foreground)' }}>
            {phase === 'loading' && <Loader size={10} className="animate-spin shrink-0" />}
            {phase === 'error'   && <AlertCircle size={10} className="shrink-0" style={{ color: 'var(--destructive)' }} />}
            {phase === 'selected' && <CheckCircle2 size={10} className="shrink-0 text-emerald-500" />}
            {status}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Reload */}
          <button onClick={connect} disabled={phase === 'loading'}
            className="btn-ghost p-1.5" title="Reload page">
            <RefreshCw size={14} className={phase === 'loading' ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
      </div>

      {/* ── Selection info bar (shown after click) ── */}
      {selection && (
        <div className="px-4 py-2.5 shrink-0 flex items-center gap-3 flex-wrap"
          style={{ background: 'color-mix(in srgb, #22c55e 8%, var(--card))',
                   borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-mono text-xs truncate" style={{ color: 'var(--foreground)' }}>
              {selection.selector}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Extracted: {selection.value
                ? <strong style={{ color: 'var(--foreground)' }}>"{selection.value}"</strong>
                : <em>no value (try a parent element)</em>}
              {selection.value_type === 'number' && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'var(--muted)' }}>number</span>
              )}
            </p>
          </div>

          {/* Stability badge */}
          {stable === true  && <span className="text-xs text-emerald-500 font-semibold shrink-0">Stable</span>}
          {stable === false && <span className="text-xs shrink-0" style={{ color: 'var(--destructive)' }}>Unstable</span>}

          <div className="flex gap-2 shrink-0">
            <button onClick={handleValidate} disabled={validating}
              className="btn-secondary text-xs px-3 py-1.5">
              {validating ? 'Checking...' : 'Verify stability'}
            </button>
            <button onClick={handleConfirm}
              className="btn-primary text-xs px-4 py-1.5">
              Use this element
            </button>
          </div>
        </div>
      )}

      {/* ── Page preview canvas ── */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center h-full gap-3"
            style={{ color: 'var(--muted-foreground)' }}>
            <Loader size={32} className="animate-spin" />
            <p className="text-sm">{status}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8"
            style={{ color: 'var(--muted-foreground)' }}>
            <AlertCircle size={32} style={{ color: 'var(--destructive)' }} />
            <p className="text-sm">{status}</p>
            <button onClick={connect} className="btn-secondary text-sm">Retry</button>
          </div>
        )}

        {screenshot && (
          <div className="relative inline-block"
            style={{ cursor: (phase === 'ready' || phase === 'selected') ? 'crosshair' : 'default',
                     maxWidth: '100%' }}>
            <img
              ref={imgRef}
              src={`data:image/png;base64,${screenshot}`}
              alt="page preview"
              style={{ display: 'block', maxWidth: '100%', userSelect: 'none',
                       borderRadius: 8, boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              draggable={false}
            />
            {/* Highlight overlay */}
            <div style={overlayStyle()} />
          </div>
        )}
      </div>

      {/* ── Footer hint ── */}
      <div className="px-4 py-2 shrink-0 text-center"
        style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {phase === 'ready'    && 'Hover to highlight elements. Click to select.'}
          {phase === 'selected' && 'Confirm to use this selector, or click a different element.'}
          {phase === 'loading'  && 'Please wait...'}
        </p>
      </div>
    </div>,
    PORTAL()
  )
}
