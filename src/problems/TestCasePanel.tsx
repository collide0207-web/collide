import type { ProblemHarness } from '../api/types'
import { canonical, type CaseResult } from '../run/harness'

interface Props {
  harness: ProblemHarness
  /** Per-case results, index-aligned with example tests then the custom case last. */
  results: CaseResult[]
  active: number
  onActive: (i: number) => void
  /** Raw JSON text the user typed for the custom case, one per param. */
  customArgs: string[]
  onCustomArg: (i: number, value: string) => void
  running: boolean
  collapsed: boolean
  onToggle: () => void
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'queued…', COMPILING: 'compiling…', RUNNING: 'running…',
  COMPLETED: 'finished', FAILED: 'failed', TIMEOUT: 'timed out', CANCELLED: 'cancelled',
}

/**
 * LeetCode-style test-case panel: one tab per example case plus a Custom tab. Each tab
 * shows the fed input, the expected value, and (after Run) the actual output with a
 * pass/fail verdict. The Custom tab lets the user type their own arguments.
 */
export function TestCasePanel({
  harness, results, active, onActive, customArgs, onCustomArg, running, collapsed, onToggle,
}: Props) {
  const exampleCount = harness.tests.length
  const customIndex = exampleCount
  const isCustom = active === customIndex

  const passed = results.filter((r) => r.pass === true).length
  const graded = results.filter((r) => r.pass !== null && r.status === 'COMPLETED').length
  const activeResult = results[active]

  const dot = (i: number) => {
    const r = results[i]
    if (!r || r.status === 'PENDING') return ''
    if (r.pass === true) return ' ✓'
    if (r.pass === false || r.status === 'FAILED' || r.status === 'TIMEOUT') return ' ✗'
    return ''
  }

  return (
    <div className={`bottom-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-tabs testcase-tabs">
        {harness.tests.map((_, i) => (
          <button
            key={i}
            className={`tab ${active === i ? 'active' : ''} ${results[i]?.pass === true ? 'pass' : results[i]?.pass === false ? 'fail' : ''}`}
            onClick={() => { if (collapsed) onToggle(); onActive(i) }}
          >
            Case {i + 1}{dot(i)}
          </button>
        ))}
        <button
          className={`tab ${isCustom ? 'active' : ''}`}
          onClick={() => { if (collapsed) onToggle(); onActive(customIndex) }}
        >
          Custom
        </button>
        {graded > 0 && !running && (
          <span className={`run-status ${passed === exampleCount ? 'run-status-completed' : 'run-status-failed'}`}>
            {passed}/{exampleCount} passed
          </span>
        )}
        {running && <span className="run-status run-status-running">running…</span>}
        <span className="panel-spacer" />
        <button
          className="panel-action"
          title={collapsed ? 'Restore panel' : 'Minimize panel'}
          aria-label={collapsed ? 'Restore panel' : 'Minimize panel'}
          onClick={onToggle}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div className="panel-body testcase-body">
          <div className="tc-io">
            {harness.params.map((p, i) => (
              <label key={p.name} className="tc-field">
                <span className="tc-arg-name">{p.name}<em> : {p.type}</em></span>
                {isCustom ? (
                  <input
                    className="tc-input"
                    value={customArgs[i] ?? ''}
                    spellCheck={false}
                    onChange={(e) => onCustomArg(i, e.target.value)}
                    placeholder={`e.g. ${canonical(harness.tests[0]?.input[i] ?? null)}`}
                  />
                ) : (
                  <code className="tc-value">{canonical(harness.tests[active]?.input[i])}</code>
                )}
              </label>
            ))}
          </div>

          <div className="tc-result">
            {!isCustom && (
              <div className="tc-row">
                <span className="tc-label">Expected</span>
                <code>{canonical(harness.tests[active]?.expected)}</code>
              </div>
            )}
            <div className="tc-row">
              <span className="tc-label">Output</span>
              {activeResult ? (
                <code className={activeResult.pass === false ? 'err' : ''}>
                  {activeResult.status === 'PENDING'
                    ? '…'
                    : (activeResult.stdout.trim() || (activeResult.stderr ? '' : '(no output)'))}
                </code>
              ) : (
                <code className="muted">Press Run to execute.</code>
              )}
            </div>
            {activeResult?.stderr && (
              <pre className="tc-stderr err">{activeResult.stderr}</pre>
            )}
            {activeResult && activeResult.status !== 'PENDING' && (() => {
              const errored = activeResult.status !== 'COMPLETED'
              const cls = errored || activeResult.pass === false ? 'fail' : activeResult.pass === true ? 'pass' : 'neutral'
              let text: string
              if (errored) text = `✗ ${STATUS_LABEL[activeResult.status] ?? activeResult.status}`
              else if (activeResult.pass === true) text = '✓ Correct'
              else if (activeResult.pass === false) text = '✗ Wrong answer'
              else text = 'finished'
              return <div className={`tc-verdict ${cls}`}>{text}</div>
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
