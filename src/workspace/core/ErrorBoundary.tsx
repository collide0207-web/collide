import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Re-mounts the boundary (clears the error) whenever this key changes. */
  resetKey?: unknown
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Scoped error boundary for the document viewer only. A viewer crash (a corrupt
 * PDF, an unrenderable slide) is contained here and never propagates to the
 * drawing canvas in the other pane. Changing the uploaded file (`resetKey`)
 * clears a previous error automatically.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DocumentViewer] render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="doc-state doc-state--error" role="alert">
          <span className="doc-state__icon">⚠️</span>
          <p className="doc-state__title">This document couldn’t be displayed</p>
          <p className="doc-state__detail">{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
