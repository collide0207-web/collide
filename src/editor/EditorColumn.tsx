import { useState } from 'react'
import { CodeEditor } from './CodeEditor'
import { FileTree } from './FileTree'
import { BottomPanel } from '../run/BottomPanel'
import { runCode, type RunResult } from '../run/runner'
import { getRoomDoc } from '../collab/yjs'
import { DEFAULT_FILE, languageForPath } from './files'

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
  const [activeFile, setActiveFile] = useState(DEFAULT_FILE)
  const [language, setLanguage] = useState(languageForPath(DEFAULT_FILE))
  const [theme, setTheme] = useState('collide-midnight')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  function selectFile(path: string) {
    setActiveFile(path)
    setLanguage(languageForPath(path))
  }

  async function onRun() {
    if (!canEdit) return
    setRunning(true)
    const source = getRoomDoc(roomId).doc.getText(`file:${activeFile}`).toString()
    setResult(await runCode(source))
    setRunning(false)
  }

  return (
    <div className="editor-col">
      <div className="editor-toolbar">
        <span className="file-crumb">{activeFile.split('/').pop()}</span>
        <span className="spacer" />
        <select value={language} onChange={(e) => setLanguage(e.target.value)} title="Language">
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} title="Editor theme">
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button className="run-btn" onClick={onRun} disabled={!canEdit || running}>
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="editor-main">
        <FileTree activePath={activeFile} onSelect={selectFile} />
        <div className="pane">
          <CodeEditor
            key={activeFile}
            roomId={roomId}
            filePath={activeFile}
            language={language}
            theme={theme}
            readOnly={!canEdit}
          />
        </div>
      </div>

      <BottomPanel result={result} running={running} />
    </div>
  )
}
