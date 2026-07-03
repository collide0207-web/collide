import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EditorColumn } from '../editor/EditorColumn'
import { Whiteboard } from '../board/Whiteboard'
import { ParticipantsStrip } from '../video/ParticipantsStrip'
import { SplitPane } from '../layout/SplitPane'
import { ScreenIcon } from '../video/icons'
import { setPresence } from '../collab/yjs'
import { useSession, type StudyMode } from '../store/session'

const COLORS = ['#5b8cff', '#ff6b8b', '#3dd68c', '#ffcf5c', '#c084fc']
const LAYOUT_KEY = 'collide-layout'
type Layout = 'editor-left' | 'editor-right'

export function RoomPage() {
  const { roomId = 'demo' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()

  const user = useSession((s) => s.user)
  const sessionMode = useSession((s) => s.mode)
  const logout = useSession((s) => s.logout)

  const mode: StudyMode = (search.get('mode') as StudyMode) || sessionMode
  const isGroup = mode === 'group'

  const [layout, setLayout] = useState<Layout>(
    () => (localStorage.getItem(LAYOUT_KEY) as Layout) || 'editor-left',
  )
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  // Group mode starts with the call visible, but it's toggleable.
  const [callOpen, setCallOpen] = useState(true)

  useEffect(() => {
    const name = user?.name || 'Guest'
    const color = COLORS[Math.abs(hash(name)) % COLORS.length]
    setPresence(roomId, { name, color })
  }, [roomId, user])

  // In group mode the current user is the host and can always edit.
  const canEdit = true
  const isHost = isGroup

  function toggleLayout() {
    setLayout((l) => {
      const next = l === 'editor-left' ? 'editor-right' : 'editor-left'
      localStorage.setItem(LAYOUT_KEY, next)
      return next
    })
  }

  async function toggleScreenShare() {
    if (screenRef.current) {
      screenRef.current.getTracks().forEach((t) => t.stop())
      screenRef.current = null
      setScreenStream(null)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        screenRef.current = null
        setScreenStream(null)
      })
      screenRef.current = stream
      setScreenStream(stream)
    } catch {
      /* user cancelled the picker */
    }
  }

  function doLogout() {
    screenRef.current?.getTracks().forEach((t) => t.stop())
    logout()
    navigate('/login')
  }

  const editorEl = <EditorColumn roomId={roomId} canEdit={canEdit} />
  const boardEl = (
    <div className="board-pane">
      <span className="pane-label">NOTES</span>
      <Whiteboard roomId={roomId} readOnly={!canEdit} />
    </div>
  )

  return (
    <div className="room">
      <div className="topbar">
        <span className="title"><span className="brand-logo">◆</span> Collide</span>
        <span className={`mode-chip ${mode}`}>{isGroup ? 'Group session' : 'Self study'}</span>
        <span className="spacer" />

        <button className="btn-ghost" onClick={toggleLayout} title="Swap editor / notes sides">
          ⇄ {layout === 'editor-left' ? 'Editor left' : 'Editor right'}
        </button>

        {isGroup && (
          <button className={`btn-ghost ${screenStream ? 'active' : ''}`} onClick={toggleScreenShare}>
            <ScreenIcon /> {screenStream ? 'Stop share' : 'Share screen'}
          </button>
        )}

        {isGroup && (
          <button className={`btn-ghost ${callOpen ? 'active' : ''}`} onClick={() => setCallOpen((v) => !v)}>
            👥 {callOpen ? 'Hide call' : 'Show call'}
          </button>
        )}

        <button className="btn-danger" onClick={doLogout}>Log out</button>
      </div>

      <div className="workspace">
        <SplitPane
          storageKey="collide-split"
          a={layout === 'editor-left' ? editorEl : boardEl}
          b={layout === 'editor-left' ? boardEl : editorEl}
        />
        {isGroup && callOpen && (
          <ParticipantsStrip
            selfName={user?.name || 'You'}
            isHost={isHost}
            screenStream={screenStream}
          />
        )}
      </div>
    </div>
  )
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}
