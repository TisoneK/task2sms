/**
 * ElementPicker — visual DOM element picker backed by a Playwright WebSocket session.
 *
 * Fixes:
 * - Connection timeout increased, proper error states
 * - Phase tracking uses ref not stale closure
 * - Loading state doesn't get stuck on WS errors
 * - Error shown clearly with retry button
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, CheckCircle2, AlertCircle, Loader, MousePointer } from 'lucide-react'

const WS_BASE = (window.location.protocol === 'https:' ? 'wss' : 'ws')
  + '://' + window.location.host + '/api/ws/picker'

const PORTAL = () => document.getElementById('modal-root') || document.body

export default function ElementPicker({ url, onSelect, onClose }) {
  const [status, setStatus]         = useState('Starting browser session...')
  const [phase, setPhase]           = useState('loading')
  const [screenshot, setScreenshot] = useState(null)
  const [vpSize, setVpSize]         = useState({ width: 1280, height: 900 })
  const [selection, setSelection]   = useState(null)
  const [highlight, setHighlight]   = useState(null)
  const [validating, setValidating] = useState(false)
  const [stable, setStable]         = useState(null)

  const wsRef      = useRef(null)
  const imgRef     = useRef(null)
  const hoverTimer = useRef(null)
  const phaseRef   = useRef('loading')  // avoids stale closure in ws.onmessage

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p) }

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
    }

    const token = localStorage.getItem('token')
    if (!token) {
      setPhaseSync('error')
      setStatus('Not authenticated — please log in again.')
      return () => {}
    }

    setPhaseSync('loading')
    setStatus('Starting browser session...')
    setScreenshot(null)
    setSelection(null)
    setHighlight(null)
    setStable(null)

    let ws
    try {
      ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
    } catch (e) {
      setPhaseSync('error')
      setStatus('Failed to open WebSocket connection.')
      return () => {}
    }
    wsRef.current = ws

    // Connection timeout — if no screenshot within 45s, show error
    const connectTimeout = setTimeout(() => {
      if (phaseRef.current === 'loading') {
        setPhaseSync('error')
        setStatus('Browser session timed out. The server may be busy — try again.')
        ws.close()
      }
    }, 45000)

    ws.onopen = () => {
      // Don't navigate yet — wait for the backend to signal it's ready
      // (the backend sends a status "Ready. Send a navigate message." once the browser is up)
    }

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === 'status') {
        setStatus(msg.message)
        // Once the backend browser is ready, trigger navigation
        if (msg.message.toLowerCase().startsWith('ready') && phaseRef.current === 'loading') {
          ws.send(JSON.stringify({ type: 'navigate', url }))
        }
      }
      else if (msg.type === 'screenshot') {
        clearTimeout(connectTimeout)
        setScreenshot(msg.data)
        setVpSize({ width: msg.width || 1280, height: msg.height || 900 })
        setPhaseSync('ready')
        setStatus('Click any element to select it')
        setHighlight(null)
      }
      else if (msg.type === 'hover_ack') {
        setHighlight(msg.rect)
        if (msg.data) setScreenshot(msg.data)
      }
      else if (msg.type === 'selected') {
        if (msg.data) setScreenshot(msg.data)
        setHighlight(msg.rect)
        setSelection(msg)
        setPhaseSync('selected')
        setStatus('Element selected — confirm or click another element')
        setStable(null)
      }
      else if (msg.type === 'validated') {
        setValidating(false)
        setStable(msg.stable)
        setStatus(msg.stable
          ? `Selector is stable — extracted: "${msg.value}"`
          : (msg.message || 'Selector may be unstable after page reload.'))
      }
      else if (msg.type === 'error') {
        setStatus(msg.message)
        if (phaseRef.current === 'loading') {
          clearTimeout(connectTimeout)
          setPhaseSync('error')
        }
      }
    }

    ws.onerror = () => {
      clearTimeout(connectTimeout)
      setPhaseSync('error')
      setStatus('WebSocket connection error. Check that the server is running.')
    }

    ws.onclose = (e) => {
      clearTimeout(connectTimeout)
      if (e.code === 4001) {
        setPhaseSync('error')
        setStatus('Authentication failed — token may be expired.')
      } else if (phaseRef.current === 'loading') {
        setPhaseSync('error')
        setStatus('Connection closed before page loaded. Retry or check server logs.')
      }
    }

    return () => clearTimeout(connectTimeout)
  }, [url])

  useEffect(() => {
    const cleanup = connect()
    return () => {
      cleanup?.()
      clearTimeout(hoverTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])

  // Map click/hover on <img> to page coordinates
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
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'selected') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const { x, y } = toPageCoords(e)
      wsRef.current?.send(JSON.stringify({ type: 'hover', x, y }))
    }, 40)
  }

  const handleClick = (e) => {
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'selected') return
    e.preventDefault()
    const { x, y } = toPageCoords(e)
    wsRef.current?.send(JSON.stringify({ type: 'click', x, y }))
  }

  const handleValidate = () => {
    if (!selection?.selector) return
    setValidating(true)
    setStable(null)
    setStatus('Reloading page to verify selector stability...')
    wsRef.current?.send(JSON.stringify({ type: 'validate', selector: selection.selector, url }))
  }

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

  const overlayStyle = () => {
    if (!highlight || !imgRef.current) return { display: 'none' }
    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = rect.width  / vpSize.width
    const scaleY = rect.height / vpSize.height
    const isSelected = phaseRef.current === 'selected'
    return {
      position: 'absolute',
      top:    highlight.top    * scaleY,
      left:   highlight.left   * scaleX,
      width:  Math.max(highlight.width  * scaleX, 1),
      height: Math.max(highlight.height * scaleY, 1),
      outline: isSelected ? '2px solid #22c55e' : '2px solid #06b6d4',
      background: isSelected ? 'rgba(34,197,94,0.12)' : 'rgba(6,182,212,0.08)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      borderRadius: 2,
      transition: 'all 0.06s ease',
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.88)' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
        <MousePointer size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Element Picker
          </p>
          <p className="text-xs flex items-center gap-1.5 mt-0.5 truncate"
            style={{ color: phase === 'error' ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
            {phase === 'loading' && <Loader size={10} className="animate-spin shrink-0" />}
            {phase === 'error'   && <AlertCircle size={10} className="shrink-0" />}
            {phase === 'selected' && <CheckCircle2 size={10} className="shrink-0 text-emerald-500" />}
            {status}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={connect} disabled={phase === 'loading'}
            className="btn-ghost p-1.5" title="Reload / reconnect">
            <RefreshCw size={14} className={phase === 'loading' ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { wsRef.current?.close(); onClose() }} className="btn-ghost p-1.5">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Selection confirm bar ── */}
      {selection && (
        <div className="px-4 py-2.5 shrink-0 flex items-center gap-3 flex-wrap"
          style={{ background: 'color-mix(in srgb, #22c55e 8%, var(--card))',
                   borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs truncate font-semibold" style={{ color: 'var(--foreground)' }}>
              {selection.selector}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Value: {selection.value
                ? <strong style={{ color: 'var(--foreground)' }}>"{selection.value}"</strong>
                : <em>empty — try clicking a parent element</em>}
              {selection.value_type === 'number' && (
                <span className="ml-2 px-1 rounded text-[10px]"
                  style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>numeric</span>
              )}
            </p>
          </div>
          {stable === true  && <span className="text-xs text-emerald-500 font-semibold shrink-0">✓ Stable</span>}
          {stable === false && <span className="text-xs font-semibold shrink-0" style={{ color: '#f59e0b' }}>⚠ Unstable</span>}
          <div className="flex gap-2 shrink-0">
            <button onClick={handleValidate} disabled={validating}
              className="btn-secondary text-xs px-3 py-1.5">
              {validating ? 'Checking…' : 'Verify'}
            </button>
            <button onClick={handleConfirm} className="btn-primary text-xs px-4 py-1.5">
              Use this selector
            </button>
          </div>
        </div>
      )}

      {/* ── Canvas ── */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 min-h-0">
        {phase === 'loading' && !screenshot && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <Loader size={36} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Loading page in browser...
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                This may take 10–30 seconds for dynamic pages
              </p>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <AlertCircle size={36} style={{ color: 'var(--destructive)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Failed to load element picker
              </p>
              <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--muted-foreground)' }}>
                {status}
              </p>
            </div>
            <button onClick={connect} className="btn-secondary text-sm">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {screenshot && (
          <div className="relative inline-block"
            style={{
              cursor: (phase === 'ready' || phase === 'selected') ? 'crosshair' : 'default',
              maxWidth: '100%',
            }}>
            <img
              ref={imgRef}
              src={`data:image/png;base64,${screenshot}`}
              alt="page preview"
              style={{
                display: 'block',
                maxWidth: '100%',
                userSelect: 'none',
                borderRadius: 8,
                boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
              }}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              draggable={false}
            />
            <div style={overlayStyle()} />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 shrink-0 text-center"
        style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {phase === 'ready'    && 'Hover to highlight · Click to select an element'}
          {phase === 'selected' && 'Confirm to use this selector, or click a different element'}
          {phase === 'loading'  && 'Starting Playwright browser session on the server...'}
          {phase === 'error'    && 'Connection failed — make sure the backend server is running'}
        </p>
      </div>
    </div>,
    PORTAL()
  )
}
