import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Editor, { type OnMount } from '@monaco-editor/react'
import { api } from '../api'
import { SplitPane } from '../layout/SplitPane'
import { BottomPanel } from '../run/BottomPanel'
import { runCode, type RunHandle, type RunUpdate } from '../run/runner'
import type { ExecutionStatus, ProblemDetail, UserProgress } from '../api/types'

const LANG_LABEL: Record<string, string> = {
  javascript: 'JavaScript', python: 'Python', java: 'Java', cpp: 'C++',
}
const AUTOSAVE_MS = 1500
const TERMINAL: ExecutionStatus[] = ['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED']

/**
 * LeetCode-style problem workspace: statement on the left, Monaco editor + output
 * on the right. Code is kept per-language and auto-saved to the progress API; the
 * latest saved code is restored on load. Run uses the existing in-browser JS
 * preview (real multi-language execution arrives with the backend sandbox).
 */
export function ProblemDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()

  const [problem, setProblem] = useState<ProblemDetail | null>(null)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [language, setLanguage] = useState('javascript')
  // Per-language working copies (starter code, overlaid with any saved code).
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>({})
  const [theme, setTheme] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'vs' : 'vs-dark',
  )

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunUpdate | null>(null)
  const [outputCollapsed, setOutputCollapsed] = useState(false)

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const runHandleRef = useRef<RunHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const codeRef = useRef<Record<string, string>>({})
  const langRef = useRef(language)
  codeRef.current = codeByLang
  langRef.current = language

  // Load problem + progress; seed per-language code (saved code overrides starter).
  useEffect(() => {
    let live = true
    setNotFound(false)
    ;(async () => {
      try {
        const p = await api.getProblem(slug)
        if (!live) return
        setProblem(p)
        let prog: UserProgress | null = null
        try {
          prog = await api.getProblemProgress(p.id)
        } catch {
          /* progress is best-effort */
        }
        if (!live) return
        setProgress(prog)
        const merged: Record<string, string> = { ...p.starterCode, ...(prog?.code || {}) }
        setCodeByLang(merged)
        const lang = prog?.language && p.supportedLanguages.includes(prog.language)
          ? prog.language
          : p.supportedLanguages[0] || 'javascript'
        setLanguage(lang)
        api.updateProgress(p.id, { language: lang }).catch(() => {})
      } catch {
        if (live) setNotFound(true)
      }
    })()
    return () => { live = false }
  }, [slug])

  const save = useCallback((extra: { bumpRun?: boolean; completed?: boolean } = {}) => {
    if (!problem) return
    api.updateProgress(problem.id, {
      language: langRef.current,
      code: codeRef.current,
      ...extra,
    }).then(setProgress).catch(() => {})
  }, [problem])

  // Flush a pending save when leaving the page / hiding the tab.
  useEffect(() => {
    const flush = () => { if (saveTimer.current) save() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      if (saveTimer.current) { clearTimeout(saveTimer.current); save() }
      runHandleRef.current?.cancel()
    }
  }, [save])

  function onChange(value: string | undefined) {
    const next = { ...codeRef.current, [language]: value ?? '' }
    setCodeByLang(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveTimer.current = null; save() }, AUTOSAVE_MS)
  }

  function switchLanguage(lang: string) {
    if (lang === language) return
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setLanguage(lang)
    // Fall back to starter code the first time a language is opened.
    if (codeRef.current[lang] === undefined && problem) {
      setCodeByLang((c) => ({ ...c, [lang]: problem.starterCode[lang] ?? '' }))
    }
    langRef.current = lang
    save()
  }

  function onRun() {
    if (!problem || running) return
    setRunning(true)
    setResult(null)
    setOutputCollapsed(false)
    // Streams live output via the shared runner (backend execution engine, or the
    // mock's in-browser JS fallback). Works the same for every language.
    runHandleRef.current = runCode(language, codeByLang[language] ?? '', undefined, (update) => {
      setResult(update)
      if (TERMINAL.includes(update.status)) setRunning(false)
    })
    save({ bumpRun: true })
  }

  function onStop() {
    runHandleRef.current?.cancel()
    setRunning(false)
  }

  function resetCode() {
    if (!problem) return
    if (!confirm('Reset your code for this language to the starter template?')) return
    setCodeByLang((c) => ({ ...c, [language]: problem.starterCode[language] ?? '' }))
    save()
  }

  function formatCode() {
    editorRef.current?.getAction('editor.action.formatDocument')?.run()
  }

  function copyCode() {
    navigator.clipboard?.writeText(codeByLang[language] ?? '')
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => save())
  }

  if (notFound) {
    return (
      <div className="prob-page">
        <TopBar onBack={() => navigate('/problems')} />
        <div className="prob-missing">
          <h2>Problem not found</h2>
          <p>We couldn't find a problem with the slug "{slug}".</p>
          <button className="btn-ghost" onClick={() => navigate('/problems')}>← Back to problems</button>
        </div>
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="prob-page">
        <TopBar onBack={() => navigate('/problems')} />
        <div className="prob-loading">Loading…</div>
      </div>
    )
  }

  const statementPane = (
    <div className="prob-statement">
      <div className="prob-statement-head">
        <h1>{problem.title}</h1>
        <div className="prob-badges">
          <span className={`diff-badge ${problem.difficulty}`}>{problem.difficulty}</span>
          <span className="cat-badge">{problem.category}</span>
          {progress?.status === 'solved' && <span className="status-badge solved">✓ Solved</span>}
        </div>
        <div className="prob-tags">{problem.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      </div>

      {problem.description ? (
        <>
          <p className="prob-desc">{problem.description}</p>
          {problem.examples?.length ? (
            <div className="prob-examples">
              {problem.examples.map((ex, i) => (
                <div key={i} className="prob-example">
                  <span className="prob-example-label">Example {i + 1}</span>
                  <div className="prob-example-row"><span>Input</span><code>{ex.input}</code></div>
                  <div className="prob-example-row"><span>Output</span><code>{ex.output}</code></div>
                  {ex.explanation && <div className="prob-example-row"><span>Explanation</span><span>{ex.explanation}</span></div>}
                </div>
              ))}
            </div>
          ) : null}
          {problem.constraints && (
            <div className="prob-constraints"><h3>Constraints</h3><p>{problem.constraints}</p></div>
          )}
        </>
      ) : (
        <div className="prob-nostatement">
          <p>The full statement for this problem isn't hosted here yet.</p>
          {problem.sourceUrl && (
            <a className="btn-ghost" href={problem.sourceUrl} target="_blank" rel="noreferrer">Open original problem ↗</a>
          )}
        </div>
      )}
    </div>
  )

  const editorPane = (
    <div className="prob-editor-col">
      <div className="editor-toolbar">
        <select value={language} onChange={(e) => switchLanguage(e.target.value)} title="Language">
          {problem.supportedLanguages.map((l) => <option key={l} value={l}>{LANG_LABEL[l] ?? l}</option>)}
        </select>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} title="Editor theme">
          <option value="vs-dark">Dark</option>
          <option value="vs">Light</option>
          <option value="hc-black">High Contrast</option>
        </select>
        <button className="btn-ghost" onClick={resetCode} title="Reset to starter code">Reset</button>
        <button className="btn-ghost" onClick={formatCode} title="Format (Ctrl+Shift+F)">Format</button>
        <button className="btn-ghost" onClick={copyCode} title="Copy code">Copy</button>
        <span className="spacer" />
        <button className="btn-ghost" disabled title="Submit — coming with the execution engine">Submit</button>
        {running && <button className="btn-ghost" onClick={onStop} title="Stop">■ Stop</button>}
        <button className="run-btn" onClick={onRun} disabled={running} title="Run (Ctrl+Enter)">
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="prob-monaco">
        <Editor
          language={language}
          theme={theme}
          value={codeByLang[language] ?? ''}
          onChange={onChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </div>

      <BottomPanel
        result={result}
        running={running}
        collapsed={outputCollapsed}
        onToggle={() => setOutputCollapsed((v) => !v)}
      />
    </div>
  )

  return (
    <div className="prob-page">
      <TopBar onBack={() => navigate('/problems')} title={problem.title} />
      <div className="prob-workspace">
        <SplitPane storageKey="collide-prob-split" a={statementPane} b={editorPane} />
      </div>
    </div>
  )
}

function TopBar({ onBack, title }: { onBack: () => void; title?: string }) {
  return (
    <div className="topbar">
      <span className="title"><span className="brand-logo">◆</span> Collide</span>
      {title && <span className="mode-chip">Practice</span>}
      <span className="spacer" />
      <button className="btn-ghost" onClick={onBack}>← Problems</button>
    </div>
  )
}
