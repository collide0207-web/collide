import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CodeEditor } from './CodeEditor'
import { FileTree } from './FileTree'
import { FileIcon } from './fileIcons'
import { BottomPanel } from '../run/BottomPanel'
import { runCode, type RunResult } from '../run/runner'
import { languageForPath } from './files'
import { useFileSystem } from './fileSystem'

interface Props {
  roomId: string
  canEdit: boolean
}

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'shell', label: 'Shell' },
  { id: 'yaml', label: 'YAML' },
]

const THEMES = [
  { id: 'vs-dark', label: 'Dark' },
  { id: 'vs', label: 'Light' },
  { id: 'hc-black', label: 'High Contrast' },
  { id: 'collide-midnight', label: 'Midnight' },
  { id: 'collide-github', label: 'GitHub Light' },
]

export function EditorColumn({ roomId, canEdit }: Props) {
  const fs = useFileSystem(roomId)
  const { nodesById, ops } = fs

  // Open editor tabs (file ids) + the active one. Nothing is hardcoded — the tab
  // set grows as the user opens files from the (dynamic) explorer.
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [languageOverride, setLanguageOverride] = useState<string | null>(null)
  // Default the editor theme to match the OS light/dark preference so the code
  // canvas stays cohesive with the app shell (user can still override it).
  const [theme, setTheme] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'collide-github'
      : 'collide-midnight',
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [outputCollapsed, setOutputCollapsed] = useState(false)
  const [showTree, setShowTree] = useState(true)
  const autoFocusId = useRef<string | null>(null)
  const didInit = useRef(false)
  const editorRef = useRef<{ layout: () => void } | null>(null)

  // When the Output panel minimizes/restores, the editor's height changes. Force
  // Monaco to relayout SYNCHRONOUSLY (before paint) so the resize is instant with
  // no visible "settling" animation from automaticLayout catching up a frame later.
  useLayoutEffect(() => {
    editorRef.current?.layout()
  }, [outputCollapsed])

  const activeNode = activeId ? nodesById.get(activeId) : undefined
  const activePath = activeId ? ops.pathOf(activeId) : ''
  const language = languageOverride ?? (activePath ? languageForPath(activePath) : 'plaintext')

  // Open the first available file ONCE on initial load (nice default, still fully
  // data-driven — an empty room shows the empty state). After that we respect the
  // user closing tabs. If the active file disappears (deleted here or by a
  // collaborator), fall back to another open tab.
  useEffect(() => {
    if (activeId && !nodesById.has(activeId)) {
      setActiveId(openTabs.find((t) => t !== activeId && nodesById.has(t)) ?? null)
      return
    }
    if (!didInit.current && !activeId) {
      const firstFile = [...nodesById.values()].find((n) => n.type === 'file')
      if (firstFile) {
        didInit.current = true
        openFile(firstFile.id, false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesById, activeId])

  // Prune tabs whose files were deleted.
  useEffect(() => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => nodesById.has(t))
      return next.length === tabs.length ? tabs : next
    })
  }, [nodesById])

  const openFile = useCallback(
    (id: string, focus: boolean) => {
      const node = nodesById.get(id)
      if (!node || node.type !== 'file') return
      autoFocusId.current = focus ? id : null
      setLanguageOverride(null)
      setActiveId(id)
      setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]))
    },
    [nodesById],
  )

  const closeTab = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== id)
        if (activeId === id) {
          const idx = tabs.indexOf(id)
          const fallback = next[idx] ?? next[idx - 1] ?? next[next.length - 1] ?? null
          setActiveId(fallback)
        }
        return next
      })
    },
    [activeId],
  )

  const onDeleted = useCallback(
    (id: string) => {
      setOpenTabs((tabs) => tabs.filter((t) => t !== id))
      if (activeId === id) setActiveId(null)
    },
    [activeId],
  )

  async function onRun() {
    if (!canEdit || !activeId) return
    setRunning(true)
    setResult(await runCode(ops.readText(activeId)))
    setRunning(false)
  }

  const tabs = useMemo(
    () => openTabs.map((id) => ({ id, name: nodesById.get(id)?.name ?? '—' })).filter((t) => nodesById.has(t.id)),
    [openTabs, nodesById],
  )

  return (
    <div className="editor-col">
      <div className="editor-toolbar">
        <button
          className={`btn-ghost icon-only ${showTree ? 'active' : ''}`}
          onClick={() => setShowTree((v) => !v)}
          title={showTree ? 'Hide file explorer' : 'Show file explorer'}
        >
          🗂
        </button>
        <span className="file-crumb" title={activePath}>{activePath ? activePath.split('/').join('  ›  ') : 'No file open'}</span>
        <span className="spacer" />
        <select value={language} onChange={(e) => setLanguageOverride(e.target.value)} title="Language">
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} title="Editor theme">
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button className="run-btn" onClick={onRun} disabled={!canEdit || running || !activeId}>
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="editor-main">
        {showTree && (
          <FileTree roomId={roomId} fs={fs} activeId={activeId} onOpen={(id, focus) => openFile(id, !!focus)} onDeleted={onDeleted} />
        )}
        <div className="editor-stack">
          {tabs.length > 0 && (
            <div className="editor-tabs" role="tablist">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`editor-tab ${activeId === t.id ? 'active' : ''}`}
                  role="tab"
                  aria-selected={activeId === t.id}
                  onClick={() => openFile(t.id, false)}
                  title={ops.pathOf(t.id)}
                >
                  <span className="tab-ico"><FileIcon name={t.name} /></span>
                  <span className="tab-name">{t.name}</span>
                  <button className="tab-close" onClick={(e) => closeTab(t.id, e)} title="Close">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="pane">
            {activeId && activeNode ? (
              <CodeEditor
                key={activeId}
                roomId={roomId}
                fileId={activeId}
                language={language}
                theme={theme}
                readOnly={!canEdit}
                autoFocus={autoFocusId.current === activeId}
                onEditorMount={(ed) => (editorRef.current = ed)}
              />
            ) : (
              <div className="editor-empty">
                <p>No file open</p>
                <span>Select a file in the Explorer, or create one to start editing.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <BottomPanel
        result={result}
        running={running}
        collapsed={outputCollapsed}
        onToggle={() => setOutputCollapsed((v) => !v)}
      />
    </div>
  )
}
