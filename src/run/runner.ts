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
  let executionId: string | null = null
  let stopSocket: (() => void) | null = null
  let stdout = ''
  let stderr = ''

  const emit = (status: ExecutionStatus, exitCode?: number) => onUpdate({ status, stdout, stderr, exitCode })

  async function loadFinalResult(id: string) {
    const result = await api.getExecutionResult(id)
    stdout = result.stdout ?? stdout
    stderr = result.stderr ?? stderr
    emit(result.status, result.exitCode ?? undefined)
  }

  async function pollUntilDone(id: string) {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS && !cancelled; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      const s = await api.getExecutionStatus(id)
      if (TERMINAL.has(s.status)) {
        await loadFinalResult(id)
        return
      }
      emit(s.status)
    }
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
      onStatus: (status) => emit(status),
      onResult: (result) => {
        stdout = result.stdout ?? stdout
        stderr = result.stderr ?? stderr
        emit(result.status, result.exitCode ?? undefined)
      },
      onUnavailable: () => {
        void pollUntilDone(executionId!)
      },
    })
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
