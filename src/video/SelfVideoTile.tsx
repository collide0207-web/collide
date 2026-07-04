import { useEffect, useRef } from 'react'
import { CamIcon, MicIcon } from './icons'

/**
 * The local participant's tile. It renders the shared local stream owned by the
 * `useCall` hook (so the same tracks are published to peers) and toggles mic/camera
 * through the hook. Mic/camera are toggled with the icon buttons on the tile.
 */
interface Props {
  name: string
  stream: MediaStream | null
  camOn: boolean
  micOn: boolean
  onToggleCam: () => void
  onToggleMic: () => void
  error: string | null
}

export function SelfVideoTile({ name, stream, camOn, micOn, onToggleCam, onToggleMic, error }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="vtile">
      <video ref={videoRef} autoPlay muted playsInline className={camOn ? 'live' : 'off'} />
      {!camOn && <div className="vtile-avatar">{initials(name)}</div>}

      <div className="vtile-bar">
        <span className="vtile-name">{name} (You)</span>
        <div className="vtile-controls">
          <button
            className={`icon-btn ${micOn ? '' : 'muted'}`}
            onClick={onToggleMic}
            title={micOn ? 'Mute' : 'Unmute'}
          >
            <MicIcon off={!micOn} />
          </button>
          <button
            className={`icon-btn ${camOn ? '' : 'muted'}`}
            onClick={onToggleCam}
            title={camOn ? 'Stop video' : 'Start video'}
          >
            <CamIcon off={!camOn} />
          </button>
        </div>
      </div>
      {error && <div className="vtile-err">{error}</div>}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
