import Editor, { OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { MonacoBinding } from 'y-monaco'
import { getRoomDoc } from '../collab/yjs'
import { blurBoard } from '../board/boardFocus'

interface Props {
  roomId: string
  /** UI-only read-only flag. Real enforcement happens server-side in a later phase. */
  readOnly: boolean
}

export function CodeEditor({ roomId, readOnly }: Props) {
  const bindingRef = useRef<MonacoBinding | null>(null)

  const handleMount: OnMount = (editor) => {
    const { doc, provider } = getRoomDoc(roomId)
    const yText = doc.getText('monaco')
    const model = editor.getModel()
    if (model) {
      bindingRef.current = new MonacoBinding(
        yText,
        model,
        new Set([editor]),
        provider.awareness,
      )
    }
    // When the code editor gains focus, make sure the whiteboard stops listening
    // for keyboard shortcuts — no key leaks between the two surfaces.
    editor.onDidFocusEditorText(() => blurBoard())
  }

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
    }
  }, [roomId])

  return (
    <Editor
      height="100%"
      defaultLanguage="javascript"
      defaultValue={'// Start typing — open this room in a second tab to see live sync.\n'}
      theme="vs-dark"
      options={{ readOnly, minimap: { enabled: false }, fontSize: 14 }}
      onMount={handleMount}
    />
  )
}
