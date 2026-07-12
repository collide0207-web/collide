import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './pdfWorker' // side effect: configures the PDF.js worker
import { PDF_OPTIONS } from './pdfWorker'
import type { ViewerProps } from '../core/types'
import { ViewerError, ViewerLoading } from './Loading'

const GUTTER = 24
const DEFAULT_ASPECT = 1.294 // height / width for US Letter, used before a page reports its size
const OVERSCAN_PX = '150% 0px' // preload roughly 1.5 viewports above/below

/**
 * PDF viewer built on react-pdf (PDF.js).
 *
 * Large documents stay fast because only the pages near the viewport are
 * actually rendered — every other page is a correctly-sized placeholder tracked
 * by an IntersectionObserver. This keeps hundreds/thousands of pages scrollable
 * without mounting every canvas. Zoom, fit-width, fit-page and rotation all come
 * from the shared control state.
 */
function PdfViewerImpl({ source, controls, onControlsChange, onPageCount }: ViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef(new Map<number, HTMLDivElement>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const programmaticUntil = useRef(0)

  const [numPages, setNumPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [visible, setVisible] = useState<Set<number>>(() => new Set([1]))
  const [aspects, setAspects] = useState<Record<number, number>>({})
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Track the pane size so fit-width / fit-page can be computed from real px.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const firstAspect = aspects[1] ?? DEFAULT_ASPECT
  const baseWidth = Math.max(120, size.width - GUTTER)
  const renderWidth =
    controls.fit === 'width'
      ? baseWidth
      : controls.fit === 'page'
        ? Math.min(baseWidth, (size.height - GUTTER) / firstAspect)
        : baseWidth * controls.zoom

  // (Re)build the IntersectionObserver whenever the document changes.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !numPages) return

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev)
          for (const e of entries) {
            const page = Number((e.target as HTMLElement).dataset.page)
            if (e.isIntersecting) next.add(page)
            else next.delete(page)
          }
          return next
        })

        // Report the most-visible page as the current page (unless we just
        // scrolled programmatically from a prev/next click).
        if (Date.now() > programmaticUntil.current) {
          let best = 0
          let bestRatio = 0
          for (const e of entries) {
            if (e.intersectionRatio > bestRatio) {
              bestRatio = e.intersectionRatio
              best = Number((e.target as HTMLElement).dataset.page)
            }
          }
          if (best && best !== controls.page) onControlsChange({ page: best })
        }
      },
      { root, rootMargin: OVERSCAN_PX, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    observerRef.current = observer
    slotRefs.current.forEach((el) => observer.observe(el))
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
    // controls.page intentionally excluded: we read the latest via closure each
    // callback and don't want to rebuild the observer on every page change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, source.url])

  const registerSlot = useCallback((page: number, el: HTMLDivElement | null) => {
    const map = slotRefs.current
    const existing = map.get(page)
    if (existing && observerRef.current) observerRef.current.unobserve(existing)
    if (el) {
      map.set(page, el)
      observerRef.current?.observe(el)
    } else {
      map.delete(page)
    }
  }, [])

  // Scroll to the current page when it changes from outside (prev/next buttons,
  // keyboard) rather than from the user scrolling.
  useEffect(() => {
    const el = slotRefs.current.get(controls.page)
    if (!el || !scrollRef.current) return
    const rect = el.getBoundingClientRect()
    const rootRect = scrollRef.current.getBoundingClientRect()
    const fullyVisible = rect.top >= rootRect.top - 4 && rect.bottom <= rootRect.bottom + 4
    if (!fullyVisible) {
      programmaticUntil.current = Date.now() + 600
      el.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  }, [controls.page])

  const onLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setLoadError(null)
      setNumPages(n)
      onPageCount(n)
    },
    [onPageCount],
  )

  const recordAspect = useCallback((page: number, w: number, h: number) => {
    if (!w || !h) return
    setAspects((prev) => (prev[page] ? prev : { ...prev, [page]: h / w }))
  }, [])

  return (
    <div className="pdf-scroll" ref={scrollRef}>
      <Document
        file={source.url}
        options={PDF_OPTIONS}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(e) => setLoadError(e.message)}
        loading={<ViewerLoading label="Loading PDF…" />}
        error={<ViewerError message={loadError ?? 'The PDF could not be opened.'} />}
      >
        {Array.from({ length: numPages }, (_, i) => {
          const page = i + 1
          const aspect = aspects[page] ?? firstAspect
          const placeholderHeight = renderWidth * aspect
          const isVisible = visible.has(page)
          return (
            <div
              key={page}
              data-page={page}
              ref={(el) => registerSlot(page, el)}
              className="pdf-page-slot"
              style={{ minHeight: isVisible ? undefined : placeholderHeight, width: renderWidth }}
            >
              {isVisible ? (
                <Page
                  pageNumber={page}
                  width={renderWidth}
                  rotate={controls.rotation}
                  renderAnnotationLayer
                  renderTextLayer
                  loading={<div className="pdf-page-loading" style={{ height: placeholderHeight }} />}
                  onLoadSuccess={(p) => recordAspect(page, p.originalWidth, p.originalHeight)}
                />
              ) : (
                <div className="pdf-page-loading" style={{ height: placeholderHeight }} />
              )}
              <span className="pdf-page-num">{page}</span>
            </div>
          )
        })}
      </Document>
    </div>
  )
}

export default memo(PdfViewerImpl)
