import type { SubmissionResult, Verdict } from '../api/types'

const LABELS: Record<Verdict, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
}

export function verdictLabel(v: Verdict): string {
  return LABELS[v]
}

/** One-line human summary; never exposes a hidden input, only the failing index. */
export function verdictSummary(r: SubmissionResult): string {
  if (r.status === 'PENDING') return 'Judging…'
  if (r.status === 'AC') return `Accepted · ${r.passed} / ${r.total} · ${r.runtimeMs} ms`
  if (r.status === 'CE') return 'Compile Error'
  return `${verdictLabel(r.status)} · ${r.passed} / ${r.total} · on test ${r.failingCaseIndex}`
}

/** Verdict panel for the Submit tier. Server-authoritative; distinct from the Run sample-case view. */
export function VerdictPanel({ result }: { result: SubmissionResult | null }) {
  if (!result) return null
  const cls =
    result.status === 'AC' ? 'verdict-ac' : result.status === 'PENDING' ? 'verdict-pending' : 'verdict-fail'
  return (
    <div className={`verdict-panel ${cls}`}>
      <strong>{result.status === 'PENDING' ? 'Judging…' : verdictLabel(result.status as Verdict)}</strong>
      {result.status !== 'PENDING' && result.status !== 'CE' && (
        <span> {result.passed} / {result.total} passed</span>
      )}
      {result.status !== 'PENDING' && result.status !== 'AC' && result.status !== 'CE' && (
        <span> · failed on test {result.failingCaseIndex}</span>
      )}
    </div>
  )
}
