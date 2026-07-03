import { ReactNode, useEffect, useRef, useState } from 'react'

/**
 * Horizontal resizable split with a draggable divider. Lets the user extend the
 * code editor or the notes as wide as they want. The chosen ratio is remembered
 * per storageKey.
 */
export function SplitPane({
  a,
  b,
  storageKey,
}: {
  a: ReactNode
  b: ReactNode
  storageKey?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(() => {
    const s = storageKey ? localStorage.getItem(storageKey) : null
    const n = s ? parseFloat(s) : NaN
    return Number.isFinite(n) ? n : 0.5
  })
  const ratioRef = useRef(ratio)
  ratioRef.current = ratio
  const dragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let r = (e.clientX - rect.left) / rect.width
      r = Math.min(0.85, Math.max(0.15, r))
      setRatio(r)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (storageKey) localStorage.setItem(storageKey, String(ratioRef.current))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [storageKey])

  const startDrag = () => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="split" ref={containerRef}>
      <div className="split-pane" style={{ flex: `0 0 ${ratio * 100}%` }}>
        {a}
      </div>
      <div className="split-divider" onMouseDown={startDrag} title="Drag to resize">
        <span className="grip" />
      </div>
      <div className="split-pane" style={{ flex: '1 1 0' }}>
        {b}
      </div>
    </div>
  )
}
