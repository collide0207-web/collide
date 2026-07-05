import { useEffect, useRef } from 'react'
import { Tldraw, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { focusBoard, registerBoard } from './boardFocus'
import { bindTldrawToYjs } from './tldrawYjs'
import { getRoomDoc } from '../collab/yjs'
import { CollapsibleToolbar } from './CollapsibleToolbar'
import { CollapsibleStylePanel } from './CollapsibleStylePanel'
import { NotesThemeToggle, THEME_KEY } from './NotesThemeToggle'

// Hide the multi-page UI — notes are a single infinite, pannable canvas.
// - Toolbar is wrapped so the tool selection row can be minimized/maximized.
// - StylePanel is wrapped so the top-right color/size panel can be collapsed.
// - SharePanel slot hosts our light/dark toggle, so tldraw stacks it above the
//   style panel (no overlap) instead of us positioning it by hand.
// - QuickActions (undo/redo/delete/duplicate) + ActionsMenu (⋮) are removed to
//   declutter the narrow-pane toolbar; those stay reachable via keyboard + the
//   right-click context menu.
const components: TLComponents = {
  PageMenu: null,
  Toolbar: CollapsibleToolbar,
  StylePanel: CollapsibleStylePanel,
  SharePanel: NotesThemeToggle,
  QuickActions: null,
  ActionsMenu: null,
}

interface Props {
  roomId: string
  readOnly: boolean
}

/**
 * Whiteboard surface.
 *
 * - autoFocus={false} + focusBoard() on pointer down keeps keyboard shortcuts from
 *   leaking between the code editor and the board.
 * - Infinite canvas: pan with mouse wheel / trackpad, zoom with Ctrl/Cmd + wheel.
 * - Light/Dark theme is toggled from the top-right (NotesThemeToggle) and applied
 *   here on mount from the persisted preference.
 */
export function Whiteboard({ roomId, readOnly }: Props) {
  const unbindRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      unbindRef.current?.()
      registerBoard(null)
    },
    [],
  )

  return (
    <div style={{ position: 'absolute', inset: 0 }} onPointerDown={() => focusBoard()}>
      <Tldraw
        autoFocus={false}
        components={components}
        // Disable tldraw's number-key → toolbar-tool shortcuts. They're bound on a
        // global keydown listener that ignores the focus flag, so digits typed in the
        // code editor were leaking to the board. We don't need them.
        options={{ enableToolbarKeyboardShortcuts: false }}
        onMount={(ed) => {
          const initialTheme = (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
          ed.updateInstanceState({ isReadonly: readOnly, isFocused: false })
          ed.user.updateUserPreferences({ colorScheme: initialTheme })
          registerBoard(ed)
          // Bind the board to the room's shared Yjs doc → live collaboration.
          unbindRef.current = bindTldrawToYjs(ed, getRoomDoc(roomId).doc)
        }}
      />
    </div>
  )
}
