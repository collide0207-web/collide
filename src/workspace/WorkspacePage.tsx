import { useNavigate } from 'react-router-dom'
import { SplitPane } from '../layout/SplitPane'
import { Whiteboard } from '../board/Whiteboard'
import { DocumentPanel } from './DocumentPanel'

const SPLIT_KEY = 'collide-workspace-split'
const ROOM_ID = 'workspace'

// Seed the 40/60 default the first time the workspace is opened (SplitPane
// otherwise defaults to 50/50). Done once at module load so the first render
// already reflects the preferred ratio.
if (typeof localStorage !== 'undefined' && localStorage.getItem(SPLIT_KEY) == null) {
  localStorage.setItem(SPLIT_KEY, '0.4')
}

/**
 * Document Workspace: a document viewer (left) beside the existing drawing
 * canvas (right), in a resizable split. The two panes share no state — changing
 * pages, zoom or files on the left never touches the canvas on the right.
 *
 * The Whiteboard is rendered exactly as elsewhere in the app; its logic and
 * collaboration wiring are untouched.
 */
export function WorkspacePage() {
  const navigate = useNavigate()

  const documentEl = <DocumentPanel />
  const canvasEl = (
    <div className="board-pane">
      <span className="pane-label">DRAWING</span>
      <Whiteboard roomId={ROOM_ID} readOnly={false} />
    </div>
  )

  return (
    <div className="room doc-workspace">
      <div className="topbar">
        <span className="title">
          <span className="brand-logo">◆</span> Collide · Workspace
        </span>
        <span className="spacer" />
        <button className="btn-ghost" onClick={() => navigate('/home')} title="Back to home">
          ← Home
        </button>
      </div>

      <div className="workspace">
        <SplitPane storageKey={SPLIT_KEY} a={documentEl} b={canvasEl} />
      </div>
    </div>
  )
}
