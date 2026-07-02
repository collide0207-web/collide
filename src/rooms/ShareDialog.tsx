import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Member, Role } from '../api/types'

interface Props {
  roomId: string
  onClose: () => void
}

const ROLES: Role[] = ['owner', 'editor', 'viewer']

export function ShareDialog({ roomId, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [linkRole, setLinkRole] = useState<Role>('editor')
  const [link, setLink] = useState('')

  async function refresh() {
    setMembers(await api.listMembers(roomId))
  }
  useEffect(() => {
    refresh()
  }, [roomId])

  async function onChangeRole(userId: string, role: Role) {
    await api.changeRole(roomId, userId, role)
    refresh()
  }
  async function onRevoke(userId: string) {
    await api.revokeMember(roomId, userId)
    refresh()
  }
  async function genLink() {
    const l = await api.createShareLink(roomId, linkRole)
    setLink(l.url)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Share & access</h3>

        <div className="field">
          <label>Create a share link with role</label>
          <div className="link-box">
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button onClick={genLink}>Generate link</button>
          </div>
          {link && (
            <div className="link-box">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </div>
          )}
        </div>

        <div className="field">
          <label>Members (owner can change roles)</label>
          {members.map((m) => (
            <div className="member-row" key={m.user.id}>
              <span className="name">{m.user.name}</span>
              <select
                value={m.role}
                onChange={(e) => onChangeRole(m.user.id, e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button className="secondary" onClick={() => onRevoke(m.user.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>

        <p className="note">
          Role changes here are UI-only in this scaffold. The real product enforces
          them on the sync server and propagates live via Redis pub/sub.
        </p>

        <div className="row-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
