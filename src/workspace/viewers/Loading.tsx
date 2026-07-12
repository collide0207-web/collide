/** Shared loading / error placeholders for the viewers (and Suspense fallback). */

export function ViewerLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="doc-state" role="status">
      <span className="doc-spinner" aria-hidden />
      <p className="doc-state__detail">{label}</p>
    </div>
  )
}

export function ViewerError({ message }: { message: string }) {
  return (
    <div className="doc-state doc-state--error" role="alert">
      <span className="doc-state__icon">⚠️</span>
      <p className="doc-state__title">Couldn’t load this document</p>
      <p className="doc-state__detail">{message}</p>
    </div>
  )
}
