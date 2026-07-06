import { useState } from 'react'
import type { Question, TestCase } from '../collab/interview'

interface Props {
  onCancel: () => void
  /** withQuestions=false means the master toggle was OFF — enter with no questions. */
  onStart: (questions: Question[]) => void
}

let seq = 0
const uid = () => `q${Date.now().toString(36)}-${seq++}`

function blankTest(): TestCase {
  return { args: '', expected: '' }
}
function blankQuestion(): Question {
  return { id: uid(), description: '', fnName: '', tests: [blankTest()] }
}

/**
 * Interviewer-only setup shown before the room loads. A master toggle decides
 * whether the session has questions at all; when ON the interviewer authors any
 * number of questions, each with a function name + test cases (args → expected).
 */
export function InterviewSetup({ onCancel, onStart }: Props) {
  const [enabled, setEnabled] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([blankQuestion()])

  function patch(id: string, next: Partial<Question>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...next } : q)))
  }
  function patchTest(qid: string, idx: number, next: Partial<TestCase>) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, tests: q.tests.map((t, i) => (i === idx ? { ...t, ...next } : t)) }
          : q,
      ),
    )
  }

  function start() {
    if (!enabled) return onStart([])
    // Drop empty test rows; keep questions that have a prompt.
    const cleaned = questions
      .map((q) => ({ ...q, tests: q.tests.filter((t) => t.args.trim() || t.expected.trim()) }))
      .filter((q) => q.description.trim())
    onStart(cleaned)
  }

  return (
    <div className="iv-overlay" role="dialog" aria-modal="true">
      <div className="iv-modal">
        <div className="iv-head">
          <h2>Set up interview</h2>
          <label className="iv-toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{enabled ? 'Questions on' : 'Questions off'}</span>
          </label>
        </div>

        {enabled ? (
          <>
            <div className="iv-questions">
              {questions.map((q, qi) => (
                <div key={q.id} className="iv-q">
                  <div className="iv-q-top">
                    <span className="iv-q-num">Question {qi + 1}</span>
                    {questions.length > 1 && (
                      <button
                        className="iv-remove"
                        onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                        title="Remove question"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <textarea
                    className="iv-input"
                    placeholder="Question description / prompt…"
                    rows={3}
                    value={q.description}
                    onChange={(e) => patch(q.id, { description: e.target.value })}
                  />
                  <input
                    className="iv-input"
                    placeholder="Function name to implement (e.g. twoSum)"
                    value={q.fnName}
                    onChange={(e) => patch(q.id, { fnName: e.target.value })}
                  />

                  <div className="iv-tests">
                    <div className="iv-tests-head">
                      <span>Test cases</span>
                      <span className="iv-hint">args as JSON array → expected as JSON</span>
                    </div>
                    {q.tests.map((t, ti) => (
                      <div key={ti} className="iv-test-row">
                        <input
                          className="iv-input mono"
                          placeholder="[2, 3]"
                          value={t.args}
                          onChange={(e) => patchTest(q.id, ti, { args: e.target.value })}
                        />
                        <span className="iv-arrow">→</span>
                        <input
                          className="iv-input mono"
                          placeholder="5"
                          value={t.expected}
                          onChange={(e) => patchTest(q.id, ti, { expected: e.target.value })}
                        />
                        {q.tests.length > 1 && (
                          <button
                            className="iv-remove"
                            onClick={() =>
                              patch(q.id, { tests: q.tests.filter((_, i) => i !== ti) })
                            }
                            title="Remove test"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="iv-add-min"
                      onClick={() => patch(q.id, { tests: [...q.tests, blankTest()] })}
                    >
                      + Add test case
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="iv-add"
              onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}
            >
              + Add question
            </button>
          </>
        ) : (
          <p className="iv-off-note">
            No questions — the interview room opens with the code editor, whiteboard and video call.
          </p>
        )}

        <div className="iv-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="run-btn" onClick={start}>Start interview →</button>
        </div>
      </div>
    </div>
  )
}
