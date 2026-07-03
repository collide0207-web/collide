import { useEffect, useRef, useState } from 'react'
import { SelfVideoTile } from './SelfVideoTile'
import { Participant, ParticipantTile } from './ParticipantTile'
import type { Role } from '../api/types'

interface Props {
  selfName: string
  isHost: boolean
  screenStream: MediaStream | null
}

// Mock remote participants (frontend-only). Real peers arrive with the backend.
const INITIAL: Participant[] = [
  { id: 'p2', name: 'Aarav Sharma', role: 'editor', micOn: true, camOn: false },
  { id: 'p3', name: 'Meera Rao', role: 'viewer', micOn: false, camOn: false },
  { id: 'p4', name: 'John Doe', role: 'editor', micOn: true, camOn: true },
]

/**
 * Vertical, scrollable strip of everyone in the call — shown to the right of the
 * notes in group mode. Host can change a participant's role live.
 */
export function ParticipantsStrip({ selfName, isHost, screenStream }: Props) {
  const [participants, setParticipants] = useState<Participant[]>(INITIAL)
  const screenRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (screenRef.current) screenRef.current.srcObject = screenStream
  }, [screenStream])

  function changeRole(id: string, role: Role) {
    setParticipants((ps) => ps.map((p) => (p.id === id ? { ...p, role } : p)))
  }
  function remove(id: string) {
    setParticipants((ps) => ps.filter((p) => p.id !== id))
  }

  return (
    <aside className="participants">
      <div className="participants-head">
        <span>In call</span>
        <span className="count">{participants.length + 1}</span>
      </div>

      <div className="participants-scroll">
        {screenStream && (
          <div className="vtile screen">
            <video ref={screenRef} autoPlay muted playsInline className="live" />
            <div className="vtile-bar"><span className="vtile-name">Your screen</span></div>
          </div>
        )}

        <SelfVideoTile name={selfName} />

        {participants.map((p) => (
          <ParticipantTile key={p.id} p={p} canManage={isHost} onChangeRole={changeRole} onRemove={remove} />
        ))}
      </div>
    </aside>
  )
}
