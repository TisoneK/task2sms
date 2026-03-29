import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Base modal wrapper — renders into #modal-root portal,
 * so it's never clipped by parent overflow:hidden or transforms.
 */
export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }) {
  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!open) return null

  const modalRoot = document.getElementById('modal-root') || document.body

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto scrollbar-thin
                    rounded-2xl animate-fade-in`}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
               style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-[15px]" style={{ color: 'var(--foreground)' }}>{title}</h3>
            <button onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted-foreground)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>,
    modalRoot
  )
}
