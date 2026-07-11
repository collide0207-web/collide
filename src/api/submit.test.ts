import { describe, it, expect } from 'vitest'
import { mockApi } from './mockApi'

describe('mockApi submit', () => {
  it('returns a PENDING id then an AC result for non-empty source', async () => {
    const { submissionId, status } = await mockApi.submitSolution('two-sum', { language: 'javascript', sourceCode: 'x' })
    expect(status).toBe('PENDING')
    const result = await mockApi.getSubmission(submissionId)
    expect(result.status).toBe('AC')
    expect(result.passed).toBe(result.total)
    expect(result.failingCaseIndex).toBe(-1)
  })

  it('records the submission in history', async () => {
    const { submissionId } = await mockApi.submitSolution('two-sum', { language: 'javascript', sourceCode: 'x' })
    const hist = await mockApi.getSubmissions('two-sum')
    expect(hist.some((s) => s.submissionId === submissionId)).toBe(true)
  })
})
