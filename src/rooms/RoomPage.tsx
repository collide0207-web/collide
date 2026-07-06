import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EditorColumn } from '../editor/EditorColumn'
import { Whiteboard } from '../board/Whiteboard'
import { QuestionPanel } from './QuestionPanel'
import { ParticipantsStrip } from '../video/ParticipantsStrip'
import { useCall } from '../video/useCall'
import { SplitPane } from '../layout/SplitPane'
import { ScreenIcon, AddPersonIcon } from '../video/icons'
import { AddMembersDialog } from './AddMembersDialog'
import { setPresence } from '../collab/yjs'
import { observeInterviewQuestions } from '../collab/interview'
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
  const isInterview = mode === 'interview'
  // Video/call features are shared by group and interview sessions.
  const isLive = mode === 'group' || isInterview

  // Access role comes from the invite link (?role=viewer|editor). Viewers get a
  // read-only editor + board; the host and editors can edit. No role param = host.
  // The role is also sent to the collab server, which enforces it (drops a viewer's
  // edits) — this UI gate is the matching client-side half + good UX.
  const role = search.get('role')
  const canEdit = role !== 'viewer'

  // The mesh video call — only active in live (group/interview) mode. Owns all local
  // media. Dev connects anonymously via DEV_ALLOW_ANON (like the Yjs provider): the
  // mock login token is not a real JWT, so sending it would be rejected. Pass the real
  // JWT here once the control plane issues them.
  const call = useCall(roomId, undefined, isLive, role ?? undefined)

  // Interview rooms show the question pane on the left by default, so they keep
  // their own saved layout preference instead of the shared one.
  const layoutKey = isInterview ? `${LAYOUT_KEY}-interview` : LAYOUT_KEY
  const [layout, setLayout] = useState<Layout>(
    () =>
      (localStorage.getItem(layoutKey) as Layout) ||
      (isInterview ? 'editor-right' : 'editor-left'),
  )
  // Live modes start with the call visible, but it's toggleable.
  const [callOpen, setCallOpen] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  // The editor reports its focused file so the question panel can run tests on it.
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  // Whether this interview has questions (drives the Question ↔ Drawing toggle).
  const [hasQuestions, setHasQuestions] = useState(false)
  // In interview mode, the side pane shows the question by default; toggle to draw.
  const [showBoard, setShowBoard] = useState(false)

  useEffect(() => {
    const name = user?.name || 'Guest'
    const color = COLORS[Math.abs(hash(name)) % COLORS.length]
    setPresence(roomId, { name, color })
  }, [roomId, user])

  useEffect(() => {
    if (!isInterview) return
    return observeInterviewQuestions(roomId, (qs) => setHasQuestions(qs.length > 0))
  }, [roomId, isInterview])

  function toggleLayout() {
    setLayout((l) => {
      const next = l === 'editor-left' ? 'editor-right' : 'editor-left'
      localStorage.setItem(layoutKey, next)
      return next
    })
  }

  function doLogout() {
    // useCall's cleanup stops all media + closes peers when RoomPage unmounts.
    logout()
    navigate('/login')
  }

  const editorEl = <EditorColumn roomId={roomId} canEdit={canEdit} onActiveFile={setActiveFileId} />

  // In an interview with questions, the side pane defaults to the question panel
  // and toggles to the whiteboard. Otherwise it's always the whiteboard.
  const showQuestion = isInterview && hasQuestions && !showBoard
  const boardEl = (
    <div className="board-pane">
      <span className="pane-label">{showQuestion ? 'QUESTION' : 'NOTES'}</span>
      {showQuestion ? (
        <QuestionPanel roomId={roomId} activeFileId={activeFileId} />
      ) : (
        <Whiteboard roomId={roomId} readOnly={!canEdit} />
      )}
    </div>
  )

  return (
    <div className="room">
      <div className="topbar">
        <span className="title"><span className="brand-logo">◆</span> Collide</span>
        <span className={`mode-chip ${mode}`}>
          {isInterview ? 'Interview' : mode === 'group' ? 'Group session' : 'Self study'}
        </span>
        {!canEdit && <span className="mode-chip viewer" title="You joined as a viewer">👁 Read-only</span>}
        <span className="spacer" />

        {isInterview && hasQuestions && (
          <button className="btn-ghost" onClick={() => setShowBoard((v) => !v)} title="Switch the side pane">
            {showBoard ? '📝 Show question' : '✏️ Show drawing'}
          </button>
        )}

        <button className="btn-ghost" onClick={toggleLayout} title="Swap editor / notes sides">
          ⇄ {layout === 'editor-left' ? 'Editor left' : 'Editor right'}
        </button>

        {isLive && (
          <button className={`btn-ghost ${call.sharing ? 'active' : ''}`} onClick={call.toggleScreenShare}>
            <ScreenIcon /> {call.sharing ? 'Stop share' : 'Share screen'}
          </button>
        )}

        {isLive && (
          <button className="btn-ghost icon-only" onClick={() => setAddOpen(true)} title="Add members">
            <AddPersonIcon />
          </button>
        )}

        {isLive && (
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
        {isLive && callOpen && (
          <ParticipantsStrip selfName={user?.name || 'You'} call={call} />
        )}
      </div>

      {addOpen && <AddMembersDialog roomId={roomId} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}
