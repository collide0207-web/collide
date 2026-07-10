import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Editor, { type OnMount } from '@monaco-editor/react'
import { api } from '../api'
import { SplitPane } from '../layout/SplitPane'
import { BottomPanel } from '../run/BottomPanel'
import { TestCasePanel } from './TestCasePanel'
import { runCode, type RunHandle, type RunUpdate } from '../run/runner'
import { buildProgram, canonical, formatSignature, hasHarness, outputMatches, type CaseResult } from '../run/harness'
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
  const [copied, setCopied] = useState(false)

  // Harness (LeetCode-style) run state: one result per example case + a custom case.
  const [caseResults, setCaseResults] = useState<CaseResult[]>([])
  const [activeCase, setActiveCase] = useState(0)
  const [customArgs, setCustomArgs] = useState<string[]>([])

  const harness = problem && hasHarness(problem.harness) ? problem.harness : null

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const runHandleRef = useRef<RunHandle | null>(null)
  // Bumped to supersede/cancel an in-flight multi-case run.
  const runToken = useRef(0)
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
        // Prefill the Custom case with the first example's inputs (as JSON text).
        if (hasHarness(p.harness)) {
          setCustomArgs(p.harness.params.map((_, i) => canonical(p.harness!.tests[0]?.input[i] ?? null)))
          setActiveCase(0)
          setCaseResults([])
        }
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
    if (harness) { void runHarness(false); return }
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

  function onSubmit() {
    if (!problem || running || !harness) return
    void runHarness(true)
  }

  // Runs one composed program to completion, resolving with the terminal update.
  function runOnce(program: string): Promise<RunUpdate> {
    return new Promise((resolve) => {
      runHandleRef.current = runCode(langRef.current, program, undefined, (u) => {
        if (TERMINAL.includes(u.status)) resolve(u)
      })
    })
  }

  function parseCustom(): unknown[] | null {
    if (!harness) return null
    try {
      return harness.params.map((_, i) => JSON.parse(customArgs[i] ?? ''))
    } catch {
      return null
    }
  }

  // Run each example case (and, on Run, the custom case) through the generated driver,
  // filling caseResults as they finish. On Submit, mark solved if every example passes.
  async function runHarness(submit: boolean) {
    if (!problem || !harness) return
    const token = ++runToken.current
    setRunning(true)
    setOutputCollapsed(false)

    const cases: { args: unknown[]; expected: unknown; custom: boolean }[] =
      harness.tests.map((t) => ({ args: t.input, expected: t.expected, custom: false }))
    if (!submit) {
      const custom = parseCustom()
      if (custom) cases.push({ args: custom, expected: undefined, custom: true })
    }

    const results: CaseResult[] = cases.map(() => ({ status: 'PENDING', stdout: '', stderr: '', pass: null }))
    setCaseResults(results)
    setActiveCase(submit ? 0 : activeCase)

    for (let i = 0; i < cases.length; i++) {
      if (token !== runToken.current) return
      const program = buildProgram(langRef.current, codeRef.current[langRef.current] ?? '', harness, cases[i].args)
      if (!program) {
        results[i] = { status: 'FAILED', stdout: '', stderr: `Run isn't supported for ${langRef.current} yet.`, pass: false }
      } else {
        const u = await runOnce(program)
        if (token !== runToken.current) return
        results[i] = {
          status: u.status,
          stdout: u.stdout,
          stderr: u.stderr,
          pass: cases[i].custom ? null : (u.status === 'COMPLETED' && outputMatches(u.stdout, cases[i].expected)),
        }
      }
      setCaseResults([...results])
    }
    if (token !== runToken.current) return
    setRunning(false)

    const allPass = harness.tests.every((_, i) => results[i].pass === true)
    save({ bumpRun: true })
    if (submit && allPass) {
      api.updateProgress(problem.id, { status: 'solved', completed: true }).then(setProgress).catch(() => {})
    }
  }

  function onStop() {
    runToken.current++ // supersede any in-flight multi-case run
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
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
        {harness && (
          <div className="prob-signature" title="Implement this function — Run/Submit call it with the test inputs">
            <code>{formatSignature(harness)}</code>
          </div>
        )}
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
        <span className="spacer" />
        <button
          className="btn-ghost"
          onClick={onSubmit}
          disabled={running || !harness}
          title={harness ? 'Submit — run all example cases' : 'Submit — available once this problem has a test harness'}
        >
          Submit
        </button>
        {running && <button className="btn-ghost" onClick={onStop} title="Stop">■ Stop</button>}
        <button className="run-btn" onClick={onRun} disabled={running} title="Run (Ctrl+Enter)">
          {running ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="prob-monaco">
        <button
          className="editor-copy"
          onClick={copyCode}
          title={copied ? 'Copied!' : 'Copy code'}
          aria-label="Copy code"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
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

      {harness ? (
        <TestCasePanel
          harness={harness}
          results={caseResults}
          active={activeCase}
          onActive={setActiveCase}
          customArgs={customArgs}
          onCustomArg={(i, v) => setCustomArgs((a) => { const n = [...a]; n[i] = v; return n })}
          running={running}
          collapsed={outputCollapsed}
          onToggle={() => setOutputCollapsed((v) => !v)}
        />
      ) : (
        <BottomPanel
          result={result}
          running={running}
          collapsed={outputCollapsed}
          onToggle={() => setOutputCollapsed((v) => !v)}
          hint="No test cases yet for this problem. Run executes your code as a standalone program — you'll need your own main / entry point. Test harness coming soon."
        />
      )}
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

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 10.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
