import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CodeEditor } from '../editor/CodeEditor'
import { Whiteboard } from '../board/Whiteboard'
import { ShareDialog } from './ShareDialog'
import { BottomPanel } from '../run/BottomPanel'
import { VideoPanel } from '../video/VideoPanel'
import { runCode, type RunResult } from '../run/runner'
import { getRoomDoc, setPresence } from '../collab/yjs'
import { useSession } from '../store/session'
import type { Role } from '../api/types'

const COLORS = ['#0a84ff', '#ff375f', '#30d158', '#ffd60a', '#bf5af2']

export function RoomPage() {
  const { roomId = 'demo' } = useParams()
  const user = useSession((s) => s.user)
  const role = useSession((s) => s.simulatedRole)
  const setRole = useSession((s) => s.setSimulatedRole)

  const [shareOpen, setShareOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  // Role hint from a share link (?role=viewer) for quick testing.
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('role') as Role | null
    if (p === 'editor' || p === 'viewer' || p === 'owner') setRole(p)
  }, [setRole])

  useEffect(() => {
    const name = user?.name || 'Guest'
    const color = COLORS[Math.abs(hash(name)) % COLORS.length]
    setPresence(roomId, { name, color })
  }, [roomId, user])

  const canEdit = role === 'owner' || role === 'editor'

  async function onRun() {
    if (!canEdit) return
    setRunning(true)
    const source = getRoomDoc(roomId).doc.getText('monaco').toString()
    const res = await runCode(source)
    setResult(res)
    setRunning(false)
  }

  return (
    <div className="room">
      <div className="topbar">
        <span className="title">Collide</span>
        <span className={`badge ${role}`}>{role}</span>
        <span className="spacer" />

        <button onClick={onRun} disabled={!canEdit || running}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <button className="secondary" onClick={() => setVideoOpen((v) => !v)}>
          {videoOpen ? 'Hide call' : 'Call'}
        </button>

        <label style={{ fontSize: 12, color: '#666' }}>simulate role:</label>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="owner">owner</option>
          <option value="editor">editor</option>
          <option value="viewer">viewer</option>
        </select>

        {role === 'owner' && <button onClick={() => setShareOpen(true)}>Share</button>}
      </div>

      <div className="workspace">
        <div className="editor-col">
          <div className="pane">
            <CodeEditor roomId={roomId} readOnly={!canEdit} />
            {!canEdit && <div className="readonly-banner">Read-only (viewer)</div>}
          </div>
          <BottomPanel result={result} running={running} />
        </div>

        <div className="pane">
          <span className="pane-label">BOARD</span>
          <Whiteboard roomId={roomId} readOnly={!canEdit} />
        </div>

        {videoOpen && <VideoPanel onClose={() => setVideoOpen(false)} />}
      </div>

      {shareOpen && <ShareDialog roomId={roomId} onClose={() => setShareOpen(false)} />}
    </div>
  )
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}
