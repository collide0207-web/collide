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
import { api } from '../api'
import type { InterviewQuestion } from '../api/types'
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
  const role = search.get('role')
  const canEdit = role !== 'viewer'

  // The mesh video call — only active in live (group/interview) mode.
  const call = useCall(roomId, undefined, isLive, role ?? undefined)

  // Interview rooms show the question pane on the left by default, so they keep
  // their own saved layout preference instead of the shared one.
  const layoutKey = isInterview ? `${LAYOUT_KEY}-interview` : LAYOUT_KEY
  const [layout, setLayout] = useState<Layout>(
    () =>
      (localStorage.getItem(layoutKey) as Layout) ||
      (isInterview ? 'editor-right' : 'editor-left'),
  )
  const [callOpen, setCallOpen] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  // In the LeetCode-style interview layout the right pane toggles editor ↔ board.
  const [rightPane, setRightPane] = useState<'editor' | 'board'>('editor')
  const hasQuestions = questions.length > 0

  useEffect(() => {
    const name = user?.name || 'Guest'
    const color = COLORS[Math.abs(hash(name)) % COLORS.length]
    setPresence(roomId, { name, color })
  }, [roomId, user])

  useEffect(() => {
    if (!isInterview) return
    let live = true
    api.getInterview(roomId).then((qs) => { if (live) setQuestions(qs) }).catch(() => {})
    return () => { live = false }
  }, [roomId, isInterview])

  function toggleLayout() {
    setLayout((l) => {
      const next = l === 'editor-left' ? 'editor-right' : 'editor-left'
      localStorage.setItem(layoutKey, next)
      return next
    })
  }

  function doLogout() {
    logout()
    navigate('/login')
  }

  // Interviews focus on the seeded file — no file explorer (LeetCode-style).
  const editorEl = <EditorColumn roomId={roomId} canEdit={canEdit} showExplorer={!isInterview} />
  const boardEl = (
    <div className="board-pane">
      <span className="pane-label">NOTES</span>
      <Whiteboard roomId={roomId} readOnly={!canEdit} />
    </div>
  )

  // Interviews with questions use a LeetCode-style layout: question always on the
  // left, and the right side toggles between the code editor and the drawing board.
  const leetLayout = isInterview && hasQuestions
  const questionEl = (
    <div className="board-pane">
      <QuestionPanel questions={questions} />
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

        {leetLayout ? (
          <button
            className="btn-ghost"
            onClick={() => setRightPane((p) => (p === 'editor' ? 'board' : 'editor'))}
            title="Switch the right pane between the code editor and the drawing board"
          >
            {rightPane === 'editor' ? '✏️ Drawing board' : '💻 Code editor'}
          </button>
        ) : (
          <button className="btn-ghost" onClick={toggleLayout} title="Swap editor / notes sides">
            ⇄ {layout === 'editor-left' ? 'Editor left' : 'Editor right'}
          </button>
        )}

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
        {leetLayout ? (
          <SplitPane storageKey="collide-split-leet" a={questionEl} b={rightPane === 'editor' ? editorEl : boardEl} />
        ) : (
          <SplitPane
            storageKey="collide-split"
            a={layout === 'editor-left' ? editorEl : boardEl}
            b={layout === 'editor-left' ? boardEl : editorEl}
          />
        )}
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
