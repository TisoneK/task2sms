import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = true }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!open) return null

  const root = document.getElementById('modal-root') || document.body

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         onClick={onCancel}>
      <div className="relative rounded-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in"
           onClick={e => e.stopPropagation()}
           style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)',
                    border: '1px solid var(--border)' }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto"
             style={{ background: danger ? '#fee2e2' : '#fef9c3' }}>
          <AlertTriangle size={20} style={{ color: danger ? '#dc2626' : '#d97706' }} />
        </div>
        <div className="text-center">
          <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h3>
          {message && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{message}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={onConfirm}
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1 justify-center`}>
            Confirm
          </button>
        </div>
      </div>
    </div>,
    root
  )
}
