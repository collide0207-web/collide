import type { RunResult } from './runner'

interface Props {
  result: RunResult | null
  running: boolean
  /** Minimized state is owned by the parent so it can relayout the editor instantly. */
  collapsed: boolean
  onToggle: () => void
}

export function BottomPanel({ result, running, collapsed, onToggle }: Props) {
  return (
    <div className={`bottom-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-tabs">
        {/* Clicking the tab while collapsed also restores the panel (intuitive). */}
        <button className="tab active" onClick={() => collapsed && onToggle()}>
          Output
        </button>
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
            {running && 'running…\n'}
            {result?.lines.join('\n')}
            {result?.error && <span className="err">{'\n' + result.error}</span>}
            {result && !running && result.lines.length === 0 && !result.error &&
              '(code ran — no console.log output. Add console.log(...) to see results.)'}
            {!running && !result && 'Press Run to execute. (client-side preview — backend later)'}
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
