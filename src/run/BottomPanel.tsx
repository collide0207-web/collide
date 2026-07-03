import type { RunResult } from './runner'

interface Props {
  result: RunResult | null
  running: boolean
}

export function BottomPanel({ result, running }: Props) {
  return (
    <div className="bottom-panel">
      <div className="panel-tabs">
        <button className="tab active">Output</button>
      </div>

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
    </div>
  )
}
