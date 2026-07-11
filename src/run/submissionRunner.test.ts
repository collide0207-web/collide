import { describe, it, expect, vi } from 'vitest'
import { pollSubmission } from './submissionRunner'
import type { SubmissionResult } from '../api/types'

describe('pollSubmission', () => {
  it('polls until terminal and reports the final verdict', async () => {
    const pending: SubmissionResult = { submissionId: 's1', problemSlug: 'two-sum', language: 'javascript', status: 'PENDING', passed: 0, total: 100, failingCaseIndex: -1, runtimeMs: 0, createdAt: '' }
    const done: SubmissionResult = { ...pending, status: 'AC', passed: 100, failingCaseIndex: -1 }
    const seq = [pending, pending, done]
    let i = 0
    const getSubmission = vi.fn(async () => seq[Math.min(i++, seq.length - 1)])
    const updates: SubmissionResult[] = []
    await pollSubmission('s1', getSubmission, (u) => updates.push(u), 0)
    expect(updates[updates.length - 1].status).toBe('AC')
    expect(getSubmission).toHaveBeenCalled()
  })
})
