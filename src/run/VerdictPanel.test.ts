import { describe, it, expect } from 'vitest'
import { verdictLabel, verdictSummary } from './VerdictPanel'
import type { SubmissionResult } from '../api/types'

const base: SubmissionResult = {
  submissionId: 's', problemSlug: 'two-sum', language: 'javascript', status: 'AC',
  passed: 100, total: 100, failingCaseIndex: -1, runtimeMs: 12, createdAt: '',
}

describe('VerdictPanel helpers', () => {
  it('maps verdict codes to human labels', () => {
    expect(verdictLabel('AC')).toBe('Accepted')
    expect(verdictLabel('WA')).toBe('Wrong Answer')
    expect(verdictLabel('TLE')).toBe('Time Limit Exceeded')
    expect(verdictLabel('RE')).toBe('Runtime Error')
    expect(verdictLabel('CE')).toBe('Compile Error')
  })

  it('summarizes AC with passed/total and runtime', () => {
    expect(verdictSummary(base)).toContain('Accepted')
    expect(verdictSummary(base)).toContain('100 / 100')
  })

  it('summarizes WA with the failing test index but no hidden input', () => {
    const wa = verdictSummary({ ...base, status: 'WA', passed: 41, failingCaseIndex: 41 })
    expect(wa).toContain('Wrong Answer')
    expect(wa).toContain('41 / 100')
    expect(wa).toContain('on test 41')
  })
})
