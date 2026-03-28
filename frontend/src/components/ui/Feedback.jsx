export function Spinner({ size = 'md' }) {
  const cls = { sm: 'spinner-sm', md: 'spinner', lg: 'spinner-lg' }[size] || 'spinner'
  return <div className={cls} />
}

export function SpinnerPage() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner-lg" />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
             style={{ background: 'var(--muted)' }}>
          <Icon size={24} style={{ color: 'var(--muted-foreground)' }} />
        </div>
      )}
      <h3 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>{title}</h3>
      {description && <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>{description}</p>}
      {action}
    </div>
  )
}
