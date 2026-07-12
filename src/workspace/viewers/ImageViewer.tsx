import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ViewerProps } from '../core/types'
import { ZOOM_MAX, ZOOM_MIN } from '../core/types'

/**
 * Image viewer with zoom, pan, rotate, reset and fit-to-screen.
 *
 * At zoom 1 the image is contained (fit-screen) via CSS; zooming scales it up
 * and enables click-drag panning. Ctrl/Cmd + wheel zooms toward the cursor
 * intent. Rotate and fit come from the shared control state so the toolbar
 * drives images exactly like the other viewers.
 */
function ImageViewerImpl({ source, controls, onControlsChange, onPageCount }: ViewerProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    onPageCount(1)
  }, [onPageCount])

  // Re-centre when the image is reset to fit / zoomed back to 1.
  useEffect(() => {
    if (controls.fit || controls.zoom === 1) setPan({ x: 0, y: 0 })
  }, [controls.fit, controls.zoom])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (controls.zoom <= 1) return
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    },
    [controls.zoom, pan],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStart.current
    if (!start) return
    setPan({ x: start.panX + (e.clientX - start.x), y: start.panY + (e.clientY - start.y) })
  }, [])

  const endDrag = useCallback(() => {
    dragStart.current = null
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, controls.zoom - e.deltaY * 0.002))
      onControlsChange({ zoom: Math.round(next * 100) / 100, fit: null })
    },
    [controls.zoom, onControlsChange],
  )

  const panning = controls.zoom > 1
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${controls.zoom}) rotate(${controls.rotation}deg)`

  return (
    <div className="image-viewer" onWheel={onWheel}>
      <img
        src={source.url}
        alt={source.name}
        className="image-viewer__img"
        draggable={false}
        style={{ transform, cursor: panning ? (dragStart.current ? 'grabbing' : 'grab') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}

export default memo(ImageViewerImpl)
