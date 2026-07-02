import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { blurBoard } from '../board/boardFocus'

/**
 * Terminal UI (xterm.js). PLACEHOLDER behavior: a local fake shell that echoes
 * input. There is NO real process behind it yet.
 *
 * LATER: connect to the backend over a WebSocket — pipe xterm input to the
 * sandbox PTY and write the PTY output back into term.write(). Swap the
 * onData handler below for socket.send(), and on socket messages call term.write().
 */
export function TerminalTab({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!hostRef.current || termRef.current) return
    const term = new Terminal({
      fontSize: 13,
      theme: { background: '#1e1e1e' },
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.writeln('Collide terminal (placeholder — no backend connected yet)')
    prompt(term)

    let line = ''
    term.onData((d) => {
      // minimal local echo / fake shell
      if (d === '\r') {
        term.write('\r\n')
        if (line.trim()) term.writeln(`sh: ${line.trim()}: backend not connected`)
        line = ''
        prompt(term)
      } else if (d === '') {
        if (line.length > 0) {
          line = line.slice(0, -1)
          term.write('\b \b')
        }
      } else {
        line += d
        term.write(d)
      }
    })

    return () => {
      term.dispose()
      termRef.current = null
    }
  }, [])

  // refit when the tab becomes visible or the window resizes
  useEffect(() => {
    if (active) setTimeout(() => fitRef.current?.fit(), 0)
  }, [active])
  useEffect(() => {
    const onResize = () => fitRef.current?.fit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Focusing the terminal also stops the board from listening for keys.
  return (
    <div
      ref={hostRef}
      onFocusCapture={() => blurBoard()}
      style={{ height: '100%', width: '100%' }}
    />
  )
}

function prompt(term: Terminal) {
  term.write('\x1b[32m$\x1b[0m ')
}
