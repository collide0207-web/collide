import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewerProps } from '../core/types'
import { getPptxAdapter, type PptxHandle } from '../core/pptxAdapter'
import { ViewerError, ViewerLoading } from './Loading'

// Base slide canvas; the wrapper is scaled from this for fit / zoom so the
// adapter only ever renders at one resolution.
const SLIDE_W = 960
const SLIDE_H = 540
const GUTTER = 32

/**
 * PowerPoint viewer. Rendering is delegated to the active {@link PptxAdapter}
 * (client-side today, backend-swappable later) — this component only owns slide
 * navigation, zoom and fit, driven by the shared control state. Swapping the
 * adapter requires no changes here.
 */
function PptxViewerImpl({ source, controls, onControlsChange, onPageCount }: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<PptxHandle | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = mountRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Mount the presentation via the adapter; re-run when the file changes.
  useEffect(() => {
    let cancelled = false
    const container = mountRef.current
    if (!container) return
    setStatus('loading')

    getPptxAdapter()
      .mount(container, source.file, { width: SLIDE_W, height: SLIDE_H, initialSlide: 0 })
      .then((handle) => {
        if (cancelled) {
          handle.destroy()
          return
        }
        handleRef.current = handle
        onPageCount(handle.slideCount)
        onControlsChange({ page: 1 })
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'This presentation could not be rendered in the browser.')
        setStatus('error')
      })

    return () => {
      cancelled = true
      handleRef.current?.destroy()
      handleRef.current = null
    }
  }, [source.file, onPageCount, onControlsChange])

  // Drive slide navigation from the shared page control.
  useEffect(() => {
    if (status === 'ready') handleRef.current?.goToSlide(controls.page - 1)
  }, [controls.page, status])

  const availW = Math.max(1, size.width - GUTTER)
  const availH = Math.max(1, size.height - GUTTER)
  const fitScale = Math.min(availW / SLIDE_W, availH / SLIDE_H)
  const scale = controls.fit ? fitScale : fitScale * controls.zoom

  return (
    <div className="pptx-viewer">
      {status === 'loading' && <ViewerLoading label="Rendering presentation…" />}
      {status === 'error' && <ViewerError message={error} />}
      <div
        className="pptx-stage"
        style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, visibility: status === 'ready' ? 'visible' : 'hidden' }}
      >
        <div
          className="pptx-slide"
          ref={mountRef}
          style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}

export default memo(PptxViewerImpl)
