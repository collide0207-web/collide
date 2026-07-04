import { useEffect, useRef } from 'react'

interface Props {
  stream: MediaStream | null
  name: string
  muted?: boolean
  onClose: () => void
}

/**
 * Full-room overlay of a single screen-share stream. A MediaStream can drive
 * several <video> elements at once, so we just point a large element at the same
 * stream the tile uses. Closes on backdrop click or Escape.
 */
export function MaximizedScreen({ stream, name, muted, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="screen-max-backdrop" onClick={onClose}>
      <div className="screen-max" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} autoPlay playsInline muted={muted} className="live" />
        <div className="screen-max-bar">
          <span className="vtile-name">{name}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close maximized screen">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
