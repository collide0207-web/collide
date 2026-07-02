import { useState } from 'react'
import { TerminalTab } from './TerminalTab'
import type { RunResult } from './runner'

type Tab = 'output' | 'terminal'

interface Props {
  result: RunResult | null
  running: boolean
}

export function BottomPanel({ result, running }: Props) {
  const [tab, setTab] = useState<Tab>('output')

  return (
    <div className="bottom-panel">
      <div className="panel-tabs">
        <button
          className={tab === 'output' ? 'tab active' : 'tab'}
          onClick={() => setTab('output')}
        >
          Output
        </button>
        <button
          className={tab === 'terminal' ? 'tab active' : 'tab'}
          onClick={() => setTab('terminal')}
        >
          Terminal
        </button>
      </div>

      <div className="panel-body">
        <div style={{ display: tab === 'output' ? 'block' : 'none', height: '100%' }}>
          <pre className="output">
            {running && 'running…\n'}
            {result?.lines.join('\n')}
            {result?.error && <span className="err">{'\n' + result.error}</span>}
            {result && !running && result.lines.length === 0 && !result.error &&
              '(code ran — no console.log output. Add console.log(...) to see results.)'}
            {!running && !result && 'Press Run to execute. (client-side preview — backend later)'}
          </pre>
        </div>
        <div style={{ display: tab === 'terminal' ? 'block' : 'none', height: '100%' }}>
          <TerminalTab active={tab === 'terminal'} />
        </div>
      </div>
    </div>
  )
}
