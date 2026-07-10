import type { RunUpdate } from './runner'

interface Props {
  result: RunUpdate | null
  running: boolean
  /** Minimized state is owned by the parent so it can relayout the editor instantly. */
  collapsed: boolean
  onToggle: () => void
  /** Shown in the idle empty state (e.g. explaining a problem has no test harness yet). */
  hint?: string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'queued…',
  COMPILING: 'compiling…',
  RUNNING: 'running…',
  COMPLETED: 'finished',
  FAILED: 'failed',
  TIMEOUT: 'timed out',
  CANCELLED: 'cancelled',
}

export function BottomPanel({ result, running, collapsed, onToggle, hint }: Props) {
  return (
    <div className={`bottom-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-tabs">
        {/* Clicking the tab while collapsed also restores the panel (intuitive). */}
        <button className="tab active" onClick={() => collapsed && onToggle()}>
          Output
        </button>
        {result && <span className={`run-status run-status-${result.status.toLowerCase()}`}>{STATUS_LABEL[result.status] ?? result.status}</span>}
        <span className="panel-spacer" />
        <button
          className="panel-action"
          title={collapsed ? 'Restore Output panel' : 'Minimize Output panel'}
          aria-label={collapsed ? 'Restore Output panel' : 'Minimize Output panel'}
          onClick={onToggle}
        >
          {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
      </div>

      {!collapsed && (
        <div className="panel-body">
          <pre className="output">
            {!running && !result && (hint || 'Press Run to execute.')}
            {result?.stdout}
            {result?.stderr && <span className="err">{(result.stdout ? '\n' : '') + result.stderr}</span>}
            {result && !running && !result.stdout && !result.stderr &&
              '(program ran with no output)'}
            {result?.exitCode !== undefined && result.exitCode !== 0 && (
              <span className="err">{`\n(exit code ${result.exitCode})`}</span>
            )}
          </pre>
        </div>
      )}
    </div>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
