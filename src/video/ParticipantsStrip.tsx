import { useEffect, useMemo, useRef, useState } from 'react'
import { SelfVideoTile } from './SelfVideoTile'
import { ParticipantTile } from './ParticipantTile'
import { MaximizedScreen } from './MaximizedScreen'
import type { UseCall } from './useCall'

interface Props {
  selfName: string
  call: UseCall
}

/**
 * Vertical, scrollable strip of everyone in the call — shown to the right of the
 * notes in group mode. Participants come live from the mesh call (`useCall`); the
 * headcount dedupes by userId so multi-tab shows one person.
 */
export function ParticipantsStrip({ selfName, call }: Props) {
  const { participants, localStream, screenStream, camOn, micOn, toggleCam, toggleMic, mediaError, status } = call
  const screenRef = useRef<HTMLVideoElement | null>(null)
  // Which screen is maximized: a remote participant's sessionId, or 'self'.
  const [maximized, setMaximized] = useState<string | null>(null)

  useEffect(() => {
    if (screenRef.current) screenRef.current.srcObject = screenStream
  }, [screenStream])

  const uniqueUsers = new Set(participants.map((p) => p.userId))
  const headcount = uniqueUsers.size + 1 // + self

  const maxParticipant = useMemo(
    () => participants.find((p) => p.sessionId === maximized) ?? null,
    [participants, maximized],
  )
  // Drop the overlay if the chosen sharer stopped sharing (or left the call).
  useEffect(() => {
    if (maximized === 'self' && !screenStream) setMaximized(null)
    if (maximized && maximized !== 'self' && (!maxParticipant || !maxParticipant.sharing)) setMaximized(null)
  }, [maximized, screenStream, maxParticipant])

  return (
    <aside className="participants">
      <div className="participants-head">
        <span>In call</span>
        <span className="count">{headcount}</span>
        {status !== 'connected' && <span className={`call-status ${status}`}>{status}</span>}
      </div>

      <div className="participants-scroll">
        {screenStream && (
          <div
            className="vtile screen clickable"
            onClick={() => setMaximized('self')}
            title="Click to maximize your screen"
          >
            <video ref={screenRef} autoPlay muted playsInline className="live" />
            <span className="vtile-expand" aria-hidden>⛶</span>
            <div className="vtile-bar"><span className="vtile-name">Your screen</span></div>
          </div>
        )}

        <SelfVideoTile
          name={selfName}
          stream={localStream}
          camOn={camOn}
          micOn={micOn}
          onToggleCam={toggleCam}
          onToggleMic={toggleMic}
          error={mediaError}
        />

        {participants.map((p) => (
          <ParticipantTile key={p.sessionId} p={p} onMaximize={() => setMaximized(p.sessionId)} />
        ))}
      </div>

      {maximized === 'self' && screenStream && (
        <MaximizedScreen stream={screenStream} name="Your screen" muted onClose={() => setMaximized(null)} />
      )}
      {maxParticipant && (
        <MaximizedScreen
          stream={maxParticipant.stream}
          name={`${maxParticipant.name}'s screen`}
          onClose={() => setMaximized(null)}
        />
      )}
    </aside>
  )
}
