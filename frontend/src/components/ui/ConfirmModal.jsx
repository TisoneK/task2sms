import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = true }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in"
           style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)',
                    border: '1px solid var(--border)' }}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto`}
             style={{ background: danger ? '#fee2e2' : '#fef9c3' }}>
          <AlertTriangle size={20} style={{ color: danger ? '#dc2626' : '#d97706' }} />
        </div>
        <div className="text-center">
          <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h3>
          {message && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{message}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={onConfirm} className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1 justify-center`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
