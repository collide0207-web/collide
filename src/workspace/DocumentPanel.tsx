import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toolbar } from './Toolbar'
import { Dropzone, type AcceptedFile } from './upload/Dropzone'
import { ViewerErrorBoundary } from './core/ErrorBoundary'
import { ViewerError, ViewerLoading } from './viewers/Loading'
import { useViewerControls } from './core/useViewerControls'
import { getPptxStrategy } from './core/pptxStrategy'
import type { DocumentKind, DocumentSource, ViewerCapabilities, ViewerProps } from './core/types'

// Lazy-loaded so each viewer (and its heavy deps: PDF.js, pptx-preview) is only
// fetched when a document of that type is actually opened.
const PdfViewer = lazy(() => import('./viewers/PdfViewer'))
const ImageViewer = lazy(() => import('./viewers/ImageViewer'))
const PptxViewer = lazy(() => import('./viewers/PptxViewer'))

const CAPABILITIES: Record<DocumentKind, ViewerCapabilities> = {
  pdf: { paging: true, zoom: true, rotate: true, fitWidth: true, fitPage: true },
  image: { paging: false, zoom: true, rotate: true, fitWidth: false, fitPage: true },
  pptx: { paging: true, zoom: true, rotate: false, fitWidth: false, fitPage: true },
}

// Sensible starting fit per type: PDFs read best fit-to-width, images and
// slides fit-to-screen.
const INITIAL_FIT: Record<DocumentKind, 'width' | 'page'> = {
  pdf: 'width',
  image: 'page',
  pptx: 'page',
}

function renderViewer(kind: DocumentKind, props: ViewerProps) {
  switch (kind) {
    case 'pdf':
      return <PdfViewer {...props} />
    case 'image':
      return <ImageViewer {...props} />
    case 'pptx':
      return <PptxViewer {...props} />
  }
}

/**
 * The left panel: upload + document viewer. Fully self-contained — all view
 * state (page/zoom/rotation/file) lives here, so nothing it does can re-render
 * or otherwise affect the drawing canvas in the sibling pane.
 */
export function DocumentPanel() {
  const [source, setSource] = useState<DocumentSource | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const { controls, patch, reset, actions } = useViewerControls()
  const rootRef = useRef<HTMLDivElement>(null)
  const hovered = useRef(false)

  // Install a resolved source: revoke the previous object URL and reset the view
  // to that document type's sensible defaults. `viewerKind` may differ from the
  // uploaded kind — a PPTX converted to PDF renders through the PDF viewer.
  const applySource = useCallback(
    (file: File, viewerKind: DocumentKind, url: string) => {
      setSource((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { file, kind: viewerKind, url, name: file.name, size: file.size }
      })
      reset()
      patch({ fit: INITIAL_FIT[viewerKind] })
    },
    [reset, patch],
  )

  const loadFile = useCallback(
    async ({ file, kind }: AcceptedFile) => {
      setPrepareError(null)

      // PPTX goes through the active strategy: converted to PDF server-side (then
      // rendered by the PDF viewer) or rendered in-browser as a fallback.
      if (kind === 'pptx') {
        setPreparing(true)
        try {
          const prepared = await getPptxStrategy().prepare(file)
          if (prepared.mode === 'pdf' && prepared.url) {
            applySource(file, 'pdf', prepared.url)
          } else {
            applySource(file, 'pptx', URL.createObjectURL(file))
          }
        } catch (e) {
          setPrepareError(e instanceof Error ? e.message : 'This presentation could not be converted.')
        } finally {
          setPreparing(false)
        }
        return
      }

      applySource(file, kind, URL.createObjectURL(file))
    },
    [applySource],
  )

  // Revoke the last object URL on unmount.
  useEffect(
    () => () => {
      setSource((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return prev
      })
    },
    [],
  )

  // Keyboard shortcuts, scoped to when the pointer is over this panel so they
  // never interfere with the drawing canvas.
  useEffect(() => {
    if (!source) return
    const caps = CAPABILITIES[source.kind]
    const onKey = (e: KeyboardEvent) => {
      if (!hovered.current) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        actions.zoomIn()
      } else if (mod && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        actions.zoomOut()
      } else if (!mod && caps.paging && e.key === 'ArrowUp') {
        e.preventDefault()
        actions.prev()
      } else if (!mod && caps.paging && e.key === 'ArrowDown') {
        e.preventDefault()
        actions.next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [source, actions])

  const viewerProps: ViewerProps | null = useMemo(
    () =>
      source
        ? { source, controls, onControlsChange: patch, onPageCount: actions.setPageCount }
        : null,
    [source, controls, patch, actions],
  )

  return (
    <div
      className="doc-panel"
      ref={rootRef}
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
    >
      {preparing ? (
        <div className="doc-stage">
          <ViewerLoading label="Converting presentation…" />
        </div>
      ) : prepareError ? (
        <div className="doc-stage">
          <ViewerError message={prepareError} />
          <div className="doc-retry">
            <Dropzone compact onAccept={loadFile} />
          </div>
        </div>
      ) : source && viewerProps ? (
        <>
          <Toolbar
            controls={controls}
            actions={actions}
            capabilities={CAPABILITIES[source.kind]}
            fileName={source.name}
            onUpload={loadFile}
          />
          <div className="doc-stage">
            <ViewerErrorBoundary resetKey={source.url}>
              <Suspense fallback={<ViewerLoading label="Preparing viewer…" />}>
                {renderViewer(source.kind, viewerProps)}
              </Suspense>
            </ViewerErrorBoundary>
          </div>
        </>
      ) : (
        <div className="doc-empty">
          <Dropzone onAccept={loadFile} />
        </div>
      )}
    </div>
  )
}
