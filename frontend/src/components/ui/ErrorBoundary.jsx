import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
               style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' }}>
            <AlertTriangle size={24} style={{ color: 'var(--destructive)' }} />
          </div>
          <h3 className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
            Something went wrong
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            {this.state.error?.message}
          </p>
          <button
            className="btn-secondary text-sm"
            onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
