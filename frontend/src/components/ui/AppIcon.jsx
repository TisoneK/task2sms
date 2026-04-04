import { MessageSquare } from 'lucide-react'

const SIZES = {
  sm: { container: 'w-6 h-6 rounded-full', icon: 12 },
  md: { container: 'w-7 h-7 rounded-full', icon: 14 },
  lg: { container: 'w-12 h-12 rounded-full', icon: 22 }
}

export default function AppIcon({ size = 'md', className, ...props }) {
  const config = SIZES[size]
  
  return (
    <div 
      className={`flex items-center justify-center shrink-0 ${config.container} ${className || ''}`}
      style={{ background: 'var(--primary)' }}
      {...props}
    >
      <MessageSquare size={config.icon} className="text-white" />
    </div>
  )
}
