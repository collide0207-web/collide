import { useEffect, useRef, useState } from 'react'

/**
 * Video call panel. Frontend-only layout.
 *
 * "Start" uses the browser's getUserMedia to show YOUR OWN camera locally — so the
 * panel is real and testable without a backend. Remote participants are placeholder
 * tiles for now.
 *
 * LATER: replace the local-only media with a real provider (LiveKit recommended).
 * The backend mints a LiveKit token (signed with the API secret), the client joins
 * a room, and remote tiles become real <VideoTrack> elements. This panel's layout
 * stays the same.
 */
export function VideoPanel({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setOn(true)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not access camera/mic')
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setOn(false)
  }

  useEffect(() => () => stop(), [])

  return (
    <div className="video-panel">
      <div className="video-head">
        <span>Call</span>
        <button className="secondary" onClick={onClose}>×</button>
      </div>

      <div className="video-grid">
        <div className="tile">
          <video ref={videoRef} autoPlay muted playsInline className={on ? 'live' : 'off'} />
          <span className="tile-label">You{on ? '' : ' (camera off)'}</span>
        </div>
        <div className="tile placeholder">
          <span className="tile-label">Waiting for others…</span>
        </div>
      </div>

      {err && <p className="note err">{err}</p>}
      <p className="note">Local preview only — real multi-party calling lands with the backend (LiveKit token).</p>

      <div className="row-actions">
        {!on ? (
          <button onClick={start}>Start camera</button>
        ) : (
          <button className="secondary" onClick={stop}>Stop</button>
        )}
      </div>
    </div>
  )
}
