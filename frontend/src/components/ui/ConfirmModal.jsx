import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = true }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${danger ? 'bg-red-50' : 'bg-yellow-50'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-500' : 'text-yellow-500'} />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {message && <p className="text-sm text-gray-500 mt-1">{message}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={onConfirm} className={`flex-1 justify-center ${danger ? 'btn-danger' : 'btn-primary'}`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
