import { useEffect, useRef, useState } from 'react'
import { Tldraw, TLComponents, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { focusBoard, registerBoard } from './boardFocus'
import { bindTldrawToYjs } from './tldrawYjs'
import { getRoomDoc } from '../collab/yjs'

// Hide the multi-page UI — notes are a single infinite, pannable canvas.
const components: TLComponents = { PageMenu: null }

type NoteTheme = 'light' | 'dark'
const THEME_KEY = 'collide-notes-theme'

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
 * - Light/Dark theme toggle (top-right) drives tldraw's colorScheme.
 */
export function Whiteboard({ roomId, readOnly }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [theme, setTheme] = useState<NoteTheme>(
    () => (localStorage.getItem(THEME_KEY) as NoteTheme) || 'light',
  )
  const unbindRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      unbindRef.current?.()
      registerBoard(null)
    },
    [],
  )

  // Apply the color scheme whenever it changes or the editor mounts.
  useEffect(() => {
    if (editor) editor.user.updateUserPreferences({ colorScheme: theme })
  }, [editor, theme])

  function toggleTheme() {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }} onPointerDown={() => focusBoard()}>
      <button
        className="notes-theme-btn"
        onClick={toggleTheme}
        title={theme === 'light' ? 'Switch notes to dark' : 'Switch notes to light'}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <Tldraw
        autoFocus={false}
        components={components}
        // Disable tldraw's number-key → toolbar-tool shortcuts. They're bound on a
        // global keydown listener that ignores the focus flag, so digits typed in the
        // code editor were leaking to the board. We don't need them.
        options={{ enableToolbarKeyboardShortcuts: false }}
        onMount={(ed) => {
          ed.updateInstanceState({ isReadonly: readOnly, isFocused: false })
          ed.user.updateUserPreferences({ colorScheme: theme })
          registerBoard(ed)
          setEditor(ed)
          // Bind the board to the room's shared Yjs doc → live collaboration.
          unbindRef.current = bindTldrawToYjs(ed, getRoomDoc(roomId).doc)
        }}
      />
    </div>
  )
}
