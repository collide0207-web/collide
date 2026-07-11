/**
 * Drives one Submit to a terminal verdict: submit, then poll getSubmission until status leaves
 * PENDING. The Submit tier is authoritative/server-side (unlike Run's live WS stream), so a simple
 * poll is enough — verdicts are seconds-scale, not keystroke-scale.
 */
import { api } from '../api'
import type { SubmissionResult, SubmitInput } from '../api/types'

const POLL_INTERVAL_MS = 500
const POLL_MAX_ATTEMPTS = 240 // ~2 min ceiling

export interface SubmitHandle {
  cancel(): void
}

/** Pure poll loop, injectable for tests. Resolves once a terminal verdict is observed. */
export async function pollSubmission(
  submissionId: string,
  getSubmission: (id: string) => Promise<SubmissionResult>,
  onUpdate: (r: SubmissionResult) => void,
  intervalMs = POLL_INTERVAL_MS,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (isCancelled()) return
    const r = await getSubmission(submissionId)
    onUpdate(r)
    if (r.status !== 'PENDING') return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export function submitAndWait(slug: string, input: SubmitInput, onUpdate: (r: SubmissionResult) => void): SubmitHandle {
  let cancelled = false
  void (async () => {
    try {
      const { submissionId } = await api.submitSolution(slug, input)
      await pollSubmission(submissionId, api.getSubmission, onUpdate, POLL_INTERVAL_MS, () => cancelled)
    } catch (e) {
      onUpdate({
        submissionId: '', problemSlug: slug, language: input.language, status: 'RE',
        passed: 0, total: 0, failingCaseIndex: -1, runtimeMs: 0, createdAt: new Date().toISOString(),
      })
    }
  })()
  return { cancel() { cancelled = true } }
}
