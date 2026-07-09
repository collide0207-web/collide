/**
 * Thin client for the control plane's live execution-output socket
 * (`/ws/execution/{executionId}?token=<jwt>`). Unlike `video/signaling.ts`'s call socket,
 * this is a one-shot stream for exactly one execution — there's nothing to reconnect to
 * once it finishes or the connection drops, so `runner.ts` falls back to polling
 * (`onUnavailable`) instead.
 */
import type { ExecutionStatus } from '../api/types'

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

/** The subset of a completed execution's fields the server streams in a "result" frame. */
export interface StreamedResult {
  status: ExecutionStatus
  stdout: string | null
  stderr: string | null
  exitCode: number | null
  executionTimeMs: number
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

type ServerFrame =
  | { type: 'stdout'; chunk: string }
  | { type: 'stderr'; chunk: string }
  | { type: 'status'; status: ExecutionStatus }
  | {
      type: 'result'
      status: ExecutionStatus
      result: Omit<StreamedResult, 'status'>
    }

interface Handlers {
  onStdout: (chunk: string) => void
  onStderr: (chunk: string) => void
  onStatus: (status: ExecutionStatus) => void
  onResult: (result: StreamedResult) => void
  /** The socket never opened (no token, connect failure, or handshake rejected) — caller
   * should fall back to polling GET /status + /result instead. */
  onUnavailable: () => void
}

const CONNECT_TIMEOUT_MS = 3000

/** Returns a `close()` you should call once you're done watching (result received, or the
 * user navigates away/cancels). */
export function openExecutionSocket(executionId: string, token: string | null, handlers: Handlers): () => void {
  if (!token) {
    handlers.onUnavailable()
    return () => {}
  }

  let opened = false
  let settled = false
  const ws = new WebSocket(`${WS_BASE}/ws/execution/${encodeURIComponent(executionId)}?token=${encodeURIComponent(token)}`)

  const giveUp = () => {
    if (settled) return
    settled = true
    ws.close()
    handlers.onUnavailable()
  }
  const connectTimer = setTimeout(giveUp, CONNECT_TIMEOUT_MS)

  ws.onopen = () => {
    opened = true
    clearTimeout(connectTimer)
  }
  ws.onmessage = (ev) => {
    let frame: ServerFrame
    try {
      frame = JSON.parse(ev.data as string) as ServerFrame
    } catch {
      return // ignore malformed frame
    }
    switch (frame.type) {
      case 'stdout':
        handlers.onStdout(frame.chunk)
        break
      case 'stderr':
        handlers.onStderr(frame.chunk)
        break
      case 'status':
        handlers.onStatus(frame.status)
        break
      case 'result':
        settled = true
        handlers.onResult({ status: frame.status, ...frame.result })
        break
    }
  }
  ws.onclose = () => {
    clearTimeout(connectTimer)
    if (!opened) giveUp()
  }
  ws.onerror = () => ws.close()

  return () => {
    settled = true
    clearTimeout(connectTimer)
    ws.close()
  }
}
