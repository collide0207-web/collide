import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { getRoomDoc } from '../collab/yjs'
import { blurBoard } from '../board/boardFocus'
import { SAMPLE_CONTENT } from './files'

interface Props {
  roomId: string
  filePath: string
  language: string
  theme: string
  readOnly: boolean
}

/** Define a couple of custom Monaco themes on top of the built-ins. */
const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('collide-midnight', {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6b7089', fontStyle: 'italic' }],
    colors: { 'editor.background': '#0b1021', 'editor.lineHighlightBackground': '#161d33' },
  })
  monaco.editor.defineTheme('collide-github', {
    base: 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6a737d', fontStyle: 'italic' }],
    colors: { 'editor.background': '#ffffff' },
  })
}

/**
 * One editor bound to the shared Yjs text for the given file. The parent remounts
 * this component (via key={filePath}) when the file changes, so each file gets a
 * fresh binding to its own Y.Text.
 */
export function CodeEditor({ roomId, filePath, language, theme, readOnly }: Props) {
  const bindingRef = useRef<MonacoBinding | null>(null)
  const undoRef = useRef<Y.UndoManager | null>(null)

  const handleMount: OnMount = (editor, monaco) => {
    const { doc, provider } = getRoomDoc(roomId)
    const yText = doc.getText(`file:${filePath}`)
    const model = editor.getModel()
    if (model) {
      const binding = new MonacoBinding(yText, model, new Set([editor]), provider.awareness)
      bindingRef.current = binding

      // Per-user undo/redo: the UndoManager tracks ONLY edits whose transaction
      // origin is this binding (i.e. this user's edits), so Ctrl/Cmd+Z never undoes
      // a collaborator's work. It operates on the CRDT, so it stays correct after
      // sync/reconnect.
      const undoManager = new Y.UndoManager(yText, { trackedOrigins: new Set([binding]) })
      undoRef.current = undoManager

      // Route the editor's undo/redo keys to the CRDT UndoManager instead of
      // Monaco's model-level undo (which would fight the shared document).
      const { CtrlCmd, Shift } = monaco.KeyMod
      const { KeyZ, KeyY } = monaco.KeyCode
      editor.addCommand(CtrlCmd | KeyZ, () => undoManager.undo())
      editor.addCommand(CtrlCmd | Shift | KeyZ, () => undoManager.redo())
      editor.addCommand(CtrlCmd | KeyY, () => undoManager.redo())
    }
    // Seed sample content once, only if the shared doc is still empty (give peers a
    // moment to sync first so we don't double-insert).
    const seed = SAMPLE_CONTENT[filePath]
    if (seed) {
      setTimeout(() => {
        if (yText.length === 0) yText.insert(0, seed)
      }, 400)
    }
    editor.onDidFocusEditorText(() => blurBoard())
  }

  useEffect(() => {
    return () => {
      undoRef.current?.destroy()
      undoRef.current = null
      bindingRef.current?.destroy()
      bindingRef.current = null
    }
  }, [])

  return (
    <Editor
      height="100%"
      language={language}
      theme={theme}
      beforeMount={defineThemes}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        automaticLayout: true,
        padding: { top: 10 },
      }}
      onMount={handleMount}
    />
  )
}
