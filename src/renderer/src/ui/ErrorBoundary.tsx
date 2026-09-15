import { Component, type ReactNode } from 'react'

/** Keeps a crash inside one panel from blanking the whole app. */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel p-4">
        <div className="mb-2 font-semibold text-red-300">{this.props.name} hit a problem.</div>
        <div className="mb-3 font-mono text-[12px] text-zinc-400">{this.state.error.message}</div>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    )
  }
}
