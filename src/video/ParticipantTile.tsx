import type { Role } from '../api/types'
import { CamIcon, MicIcon } from './icons'

export interface Participant {
  id: string
  name: string
  role: Role
  micOn: boolean
  camOn: boolean
}

interface Props {
  p: Participant
  /** Whether the current user is the host and can change roles. */
  canManage: boolean
  onChangeRole: (id: string, role: Role) => void
  onRemove: (id: string) => void
}

const ASSIGNABLE: Role[] = ['editor', 'viewer']

/** A remote participant's tile (placeholder video). Host can change their role live. */
export function ParticipantTile({ p, canManage, onChangeRole, onRemove }: Props) {
  return (
    <div className="vtile remote">
      <div className="vtile-avatar">{initials(p.name)}</div>

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

      {canManage && p.role !== 'owner' && (
        <div className="vtile-manage">
          <select value={p.role} onChange={(e) => onChangeRole(p.id, e.target.value as Role)} title="Change role">
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button className="icon-btn danger" title="Remove" onClick={() => onRemove(p.id)}>✕</button>
        </div>
      )}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
}
