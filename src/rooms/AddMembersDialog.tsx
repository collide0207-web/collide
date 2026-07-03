import { useState } from 'react'
import { api } from '../api'
import type { Role } from '../api/types'

interface Props {
  roomId: string
  onClose: () => void
}

/**
 * Invite people two ways:
 *   1. By email — enter an address + role and "send" an invite (mocked for now).
 *   2. By link — generate a shareable link for a role and copy it.
 */
export function AddMembersDialog({ roomId, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [invited, setInvited] = useState<string[]>([])

  const [linkRole, setLinkRole] = useState<Role>('editor')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  async function sendInvite() {
    if (!validEmail) return
    // Mock: real backend would email an invite tied to the role.
    setInvited((list) => [...list, email])
    setEmail('')
  }

  async function genLink() {
    const l = await api.createShareLink(roomId, linkRole)
    setLink(l.url)
    setCopied(false)
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Add members</h3>
          <button className="icon-x" onClick={onClose}>✕</button>
        </div>

        {/* --- Method 1: email --- */}
        <div className="invite-block">
          <label className="block-label">Invite by email</label>
          <div className="invite-row">
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn-accent" disabled={!validEmail} onClick={sendInvite}>
              Invite
            </button>
          </div>
          {invited.length > 0 && (
            <div className="invited-list">
              {invited.map((e, i) => (
                <span className="invited-chip" key={i}>✓ {e}</span>
              ))}
            </div>
          )}
        </div>

        <div className="or-divider"><span>or</span></div>

        {/* --- Method 2: link --- */}
        <div className="invite-block">
          <label className="block-label">Share an invite link</label>
          <div className="invite-row">
            <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn-ghost" onClick={genLink}>Generate link</button>
          </div>
          {link && (
            <div className="invite-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="btn-accent" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
          )}
        </div>

        <p className="fineprint left">
          Invites and links are mocked in this build — real delivery and access control land with the backend.
        </p>
      </div>
    </div>
  )
}
