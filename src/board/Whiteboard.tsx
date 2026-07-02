import { useEffect } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { focusBoard, registerBoard } from './boardFocus'

interface Props {
  roomId: string
  readOnly: boolean
}

/**
 * Whiteboard surface.
 *
 * autoFocus={false} stops tldraw from grabbing keyboard focus on mount. We only
 * focus it when the user actually points at the board, so shortcuts can't leak in
 * while someone is typing code. See boardFocus.ts.
 *
 * For now tldraw persists locally per room (persistenceKey). Real-time board collab
 * (binding tldraw's store to the shared Y.Doc) is the next step.
 */
export function Whiteboard({ roomId, readOnly }: Props) {
  useEffect(() => () => registerBoard(null), [])

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDown={() => focusBoard()}
    >
      <Tldraw
        autoFocus={false}
        // Disable tldraw's number-key → toolbar-tool shortcuts. Those are bound on a
        // global keydown listener that does NOT respect the isFocused flag, so digits
        // typed in the code editor were leaking to the board. We don't need them.
        options={{ enableToolbarKeyboardShortcuts: false }}
        persistenceKey={`collab-ide-board-${roomId}`}
        onMount={(editor) => {
          editor.updateInstanceState({ isReadonly: readOnly, isFocused: false })
          registerBoard(editor)
        }}
      />
    </div>
  )
}
