import { useEffect, useRef } from 'react'
import { CamIcon, MicIcon } from './icons'
import type { RemoteParticipant } from './useCall'

interface Props {
  p: RemoteParticipant
  onMaximize?: () => void
}

/**
 * A remote participant's tile. Renders their live WebRTC stream (camera or, while
 * they share, their screen) and reflects mic/camera state broadcast over signaling.
 * Role management lives in the Share/members dialog, not on the call tile.
 *
 * While they're sharing their screen the tile becomes clickable — clicking it asks
 * the strip to maximize their screen into a full-room overlay.
 */
export function ParticipantTile({ p, onMaximize }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = p.stream
  }, [p.stream])

  // Show video when they have the camera on or are sharing their screen.
  const showVideo = (p.camOn || p.sharing) && !!p.stream
  const canMaximize = p.sharing && !!p.stream

  return (
    <div
      className={`vtile remote${canMaximize ? ' clickable' : ''}`}
      onClick={canMaximize ? onMaximize : undefined}
      title={canMaximize ? `Click to maximize ${p.name}'s screen` : undefined}
    >
      <video ref={videoRef} autoPlay playsInline className={showVideo ? 'live' : 'off'} />
      {canMaximize && <span className="vtile-expand" aria-hidden>⛶</span>}
      {!showVideo && <div className="vtile-avatar">{initials(p.name)}</div>}

      <div className="vtile-bar">
        <span className="vtile-name">
          {p.name}
          {p.role === 'owner' && <span className="host-tag">HOST</span>}
        </span>
        <div className="vtile-controls">
          <span className={`state-dot ${p.micOn ? 'on' : 'off'}`}><MicIcon off={!p.micOn} /></span>
          <span className={`state-dot ${p.camOn ? 'on' : 'off'}`}><CamIcon off={!p.camOn} /></span>
        </div>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}
