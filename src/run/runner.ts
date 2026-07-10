/**
 * Orchestrates one Run click end to end: submit -> stream live output over WebSocket (or
 * fall back to polling if the socket can't connect) -> final result. Talks only to `api`
 * (see src/api/index.ts) and `openExecutionSocket`, so it works unchanged against the mock
 * backend (synchronous, JS-only) or the real Spring Boot control plane.
 */
import { api } from '../api'
import type { ExecutionStatus } from '../api/types'
import { useSession } from '../store/session'
import { openExecutionSocket } from './executionSocket'

export interface RunUpdate {
  status: ExecutionStatus
  stdout: string
  stderr: string
  exitCode?: number
}

export interface RunHandle {
  /** Best-effort: asks the backend to stop the program and stops watching it. */
  cancel(): void
}

const TERMINAL: ReadonlySet<ExecutionStatus> = new Set(['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'])
const POLL_INTERVAL_MS = 300
const POLL_MAX_ATTEMPTS = 300 // ~90s ceiling, matched to the backend's own execution timeout

export function runCode(language: string, sourceCode: string, stdin: string | undefined, onUpdate: (u: RunUpdate) => void): RunHandle {
  let cancelled = false
  let done = false // terminal reached (by socket OR poll) — stops the other path
  let pollStarted = false
  let executionId: string | null = null
  let stopSocket: (() => void) | null = null
  let stdout = ''
  let stderr = ''

  const emit = (status: ExecutionStatus, exitCode?: number) => onUpdate({ status, stdout, stderr, exitCode })

  async function loadFinalResult(id: string) {
    if (done) return
    const result = await api.getExecutionResult(id)
    done = true
    stdout = result.stdout ?? stdout
    stderr = result.stderr ?? stderr
    emit(result.status, result.exitCode ?? undefined)
  }

  async function pollUntilDone(id: string) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS && !cancelled && !done; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      if (cancelled || done) return
      const s = await api.getExecutionStatus(id)
      if (done) return
      if (TERMINAL.has(s.status)) {
        await loadFinalResult(id)
        return
      }
      emit(s.status)
    }
  }

  // Poll as a BACKSTOP even when the socket connects: fast programs can finish
  // before the socket subscribes, and the server doesn't replay missed events —
  // without this the UI would hang at "queued" forever. `done` dedupes the paths.
  const startPoll = () => {
    if (pollStarted || !executionId) return
    pollStarted = true
    void pollUntilDone(executionId)
  }

  void (async () => {
    emit('PENDING')
    let submitted: { executionId: string; status: ExecutionStatus }
    try {
      submitted = await api.execute(language, sourceCode, stdin)
    } catch (e) {
      stderr = e instanceof Error ? e.message : String(e)
      emit('FAILED')
      return
    }
    if (cancelled) return
    executionId = submitted.executionId

    if (TERMINAL.has(submitted.status)) {
      await loadFinalResult(executionId)
      return
    }
    emit(submitted.status)

    stopSocket = openExecutionSocket(executionId, useSession.getState().accessToken, {
      onStdout: (chunk) => {
        stdout += chunk
        emit('RUNNING')
      },
      onStderr: (chunk) => {
        stderr += chunk
        emit('RUNNING')
      },
      onStatus: (status) => { if (!done) emit(status) },
      onResult: (result) => {
        if (done) return
        done = true
        stdout = result.stdout ?? stdout
        stderr = result.stderr ?? stderr
        emit(result.status, result.exitCode ?? undefined)
      },
      onUnavailable: startPoll,
    })

    // Always run the polling backstop alongside the socket (see startPoll).
    startPoll()
  })()

  return {
    cancel() {
      if (cancelled) return
      cancelled = true
      stopSocket?.()
      if (executionId) api.cancelExecution(executionId).catch(() => {})
      emit('CANCELLED')
    },
  }
}
