import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_CONTROLS, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type ViewerControls } from './types'

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
const normalizeRotation = (deg: number) => ((deg % 360) + 360) % 360

/**
 * Owns the shared toolbar state (page / zoom / rotation / fit) for whichever
 * viewer is active. Centralising this here means the toolbar and all viewers
 * share one implementation — no duplicated zoom/rotate math per document type.
 *
 * Resetting on a new document keeps viewers independent from one another and
 * from the drawing canvas: swapping files never leaks stale view state.
 */
export function useViewerControls() {
  const [controls, setControls] = useState<ViewerControls>(DEFAULT_CONTROLS)

  const patch = useCallback((p: Partial<ViewerControls>) => {
    setControls((c) => ({ ...c, ...p }))
  }, [])

  const reset = useCallback(() => setControls(DEFAULT_CONTROLS), [])

  const actions = useMemo(
    () => ({
      setPageCount: (pageCount: number) =>
        setControls((c) => ({ ...c, pageCount, page: Math.min(c.page, pageCount || 1) })),
      goTo: (page: number) =>
        setControls((c) => ({ ...c, page: Math.min(Math.max(1, page), c.pageCount || 1) })),
      prev: () => setControls((c) => ({ ...c, page: Math.max(1, c.page - 1) })),
      next: () => setControls((c) => ({ ...c, page: Math.min(c.pageCount || 1, c.page + 1) })),
      zoomIn: () => setControls((c) => ({ ...c, fit: null, zoom: clampZoom(c.zoom + ZOOM_STEP) })),
      zoomOut: () => setControls((c) => ({ ...c, fit: null, zoom: clampZoom(c.zoom - ZOOM_STEP) })),
      setZoom: (z: number) => setControls((c) => ({ ...c, fit: null, zoom: clampZoom(z) })),
      rotateLeft: () => setControls((c) => ({ ...c, rotation: normalizeRotation(c.rotation - 90) })),
      rotateRight: () => setControls((c) => ({ ...c, rotation: normalizeRotation(c.rotation + 90) })),
      fitWidth: () => setControls((c) => ({ ...c, fit: 'width', zoom: 1 })),
      fitPage: () => setControls((c) => ({ ...c, fit: 'page', zoom: 1 })),
      resetView: () => setControls((c) => ({ ...c, zoom: 1, rotation: 0, fit: null })),
    }),
    [],
  )

  return { controls, patch, reset, actions }
}

export type ViewerControlActions = ReturnType<typeof useViewerControls>['actions']
