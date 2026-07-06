import { useEffect, useState } from 'react'
import { observeInterviewQuestions, type Question } from '../collab/interview'
import { getRoomDoc } from '../collab/yjs'
import { runTests, type TestOutcome } from '../run/runner'

interface Props {
  roomId: string
  /** The file currently focused in the editor — its source is run against tests. */
  activeFileId: string | null
}

/**
 * The interview question surface — shown in place of (and toggleable with) the
 * whiteboard. Reads the interviewer's questions live from Yjs and lets the
 * candidate run the active file against each question's test cases.
 */
export function QuestionPanel({ roomId, activeFileId }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [results, setResults] = useState<Record<string, TestOutcome[]>>({})
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => observeInterviewQuestions(roomId, setQuestions), [roomId])

  async function run(q: Question) {
    if (!activeFileId) {
      setResults((r) => ({ ...r, [q.id]: [] }))
      return
    }
    setRunning(q.id)
    const source = getRoomDoc(roomId).doc.getText(`file:${activeFileId}`).toString()
    const outcomes = await runTests(source, q.fnName, q.tests)
    setResults((r) => ({ ...r, [q.id]: outcomes }))
    setRunning(null)
  }

  if (questions.length === 0) {
    return (
      <div className="q-panel">
        <div className="q-empty">No questions were set up for this interview.</div>
      </div>
    )
  }

  return (
    <div className="q-panel">
      {questions.map((q, i) => {
        const outcomes = results[q.id]
        const passed = outcomes?.filter((o) => o.passed).length ?? 0
        return (
          <div key={q.id} className="q-card">
            <div className="q-card-head">
              <span className="q-num">Question {i + 1}</span>
              {q.tests.length > 0 && (
                <button
                  className="run-btn"
                  disabled={running === q.id || !activeFileId}
                  onClick={() => run(q)}
                  title={activeFileId ? 'Run your code against the tests' : 'Open a file first'}
                >
                  {running === q.id ? 'Running…' : '▶ Run tests'}
                </button>
              )}
            </div>
            <p className="q-desc">{q.description}</p>
            {q.fnName && (
              <p className="q-fn">
                Implement <code>{q.fnName}(…)</code>
              </p>
            )}

            {q.tests.length > 0 && (
              <div className="q-tests">
                {outcomes && (
                  <div className={`q-summary ${passed === outcomes.length ? 'ok' : 'fail'}`}>
                    {passed}/{outcomes.length} passed
                  </div>
                )}
                {(outcomes ?? q.tests.map((t) => ({ ...t, actual: '', passed: false }))).map(
                  (t, ti) => {
                    const done = !!outcomes
                    return (
                      <div
                        key={ti}
                        className={`q-test ${done ? (t.passed ? 'pass' : 'fail') : ''}`}
                      >
                        <span className="q-test-mark">{done ? (t.passed ? '✓' : '✗') : '•'}</span>
                        <code className="q-test-io">{t.args || '()'} → {t.expected}</code>
                        {done && !t.passed && (
                          <span className="q-test-actual">
                            got {'error' in t && t.error ? t.error : t.actual}
                          </span>
                        )}
                      </div>
                    )
                  },
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
