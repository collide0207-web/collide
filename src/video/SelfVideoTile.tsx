import { useEffect, useRef, useState } from 'react'
import { CamIcon, MicIcon } from './icons'

/**
 * The local participant's tile. Uses the browser camera/mic (getUserMedia) so it's
 * real and testable with no backend. Mic/camera are toggled with the icon buttons
 * on the tile (no separate "Start camera" button).
 *
 * LATER: replace the local stream with a LiveKit local track; remote tiles become
 * real remote tracks.
 */
export function SelfVideoTile({ name }: { name: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function ensureStream() {
    if (streamRef.current) return streamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    streamRef.current = stream
    if (videoRef.current) videoRef.current.srcObject = stream
    // start muted/paused until the user toggles on
    stream.getVideoTracks().forEach((t) => (t.enabled = false))
    stream.getAudioTracks().forEach((t) => (t.enabled = false))
    return stream
  }

  async function toggleCam() {
    try {
      const s = await ensureStream()
      const next = !camOn
      s.getVideoTracks().forEach((t) => (t.enabled = next))
      setCamOn(next)
      setErr(null)
    } catch {
      setErr('Camera/mic blocked')
    }
  }

  async function toggleMic() {
    try {
      const s = await ensureStream()
      const next = !micOn
      s.getAudioTracks().forEach((t) => (t.enabled = next))
      setMicOn(next)
      setErr(null)
    } catch {
      setErr('Camera/mic blocked')
    }
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="vtile">
      <video ref={videoRef} autoPlay muted playsInline className={camOn ? 'live' : 'off'} />
      {!camOn && <div className="vtile-avatar">{initials(name)}</div>}

      <div className="vtile-bar">
        <span className="vtile-name">{name} (You)</span>
        <div className="vtile-controls">
          <button
            className={`icon-btn ${micOn ? '' : 'muted'}`}
            onClick={toggleMic}
            title={micOn ? 'Mute' : 'Unmute'}
          >
            <MicIcon off={!micOn} />
          </button>
          <button
            className={`icon-btn ${camOn ? '' : 'muted'}`}
            onClick={toggleCam}
            title={camOn ? 'Stop video' : 'Start video'}
          >
            <CamIcon off={!camOn} />
          </button>
        </div>
      </div>
      {err && <div className="vtile-err">{err}</div>}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
