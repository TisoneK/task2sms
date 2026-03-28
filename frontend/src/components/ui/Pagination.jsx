import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, total, perPage, onChange }) {
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) return null
  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, total)

  const visiblePages = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', pages]
    if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages]
    return [1, '…', page - 1, page, page + 1, '…', pages]
  }

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
        <span className="font-medium" style={{ color: 'var(--foreground)' }}>{start}–{end}</span>
        {' '}of{' '}
        <span className="font-medium" style={{ color: 'var(--foreground)' }}>{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="btn-ghost p-1.5" style={{ borderRadius: '0.375rem' }}>
          <ChevronLeft size={15} />
        </button>
        {visiblePages().map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="w-8 text-center text-sm"
                  style={{ color: 'var(--muted-foreground)' }}>…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)}
              className="w-8 h-8 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: p === page ? 'var(--primary)' : 'transparent',
                color: p === page ? 'var(--primary-foreground)' : 'var(--foreground)',
              }}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="btn-ghost p-1.5" style={{ borderRadius: '0.375rem' }}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
