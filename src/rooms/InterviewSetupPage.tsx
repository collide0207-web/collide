import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'
import { setInterviewQuestions, type Question, type TestCase } from '../collab/interview'

let seq = 0
const uid = () => `q${Date.now().toString(36)}-${seq++}`
const blankTest = (): TestCase => ({ args: '', expected: '' })
const blankQuestion = (): Question => ({ id: uid(), title: '', description: '', fnName: '', tests: [blankTest()], images: [] })

// Keep images small — they're inlined as base64 into the Yjs doc that syncs to
// every participant, so a few MB per image would bloat the whole document.
const MAX_IMAGE_BYTES = 1_500_000

type QErrors = { title?: string; description?: string; fnName?: string; tests: (string | undefined)[] }

/**
 * Full-page, interviewer-only setup shown before the room loads (route
 * /interview/setup). A master toggle decides whether the session has questions;
 * when on, the interviewer authors questions with a title, prompt, reference
 * images, a function name and example cases. Validated before the room is created.
 */
export function InterviewSetupPage() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const setMode = useSession((s) => s.setMode)

  const [enabled, setEnabled] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([blankQuestion()])
  const [errors, setErrors] = useState<Record<string, QErrors>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!user) {
    navigate('/login')
    return null
  }

  function patch(id: string, next: Partial<Question>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...next } : q)))
  }
  function patchTest(qid: string, idx: number, next: Partial<TestCase>) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === qid ? { ...q, tests: q.tests.map((t, i) => (i === idx ? { ...t, ...next } : t)) } : q,
      ),
    )
  }

  async function addImages(qid: string, files: FileList | null) {
    if (!files?.length) return
    const q = questions.find((x) => x.id === qid)
    if (!q) return
    const loaded: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setFormError(`"${file.name}" is not an image.`)
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFormError(`"${file.name}" is larger than 1.5 MB — please use a smaller image.`)
        continue
      }
      loaded.push(await readAsDataURL(file))
    }
    if (loaded.length) patch(qid, { images: [...q.images, ...loaded] })
  }

  function validate(): boolean {
    if (!enabled) return true
    const next: Record<string, QErrors> = {}
    let ok = true

    if (questions.length === 0) {
      setFormError('Add at least one question, or switch questions off.')
      return false
    }

    for (const q of questions) {
      const qe: QErrors = { tests: q.tests.map(() => undefined) }
      if (!q.title.trim()) { qe.title = 'Title is required.'; ok = false }
      if (!q.description.trim()) { qe.description = 'Description is required.'; ok = false }

      const hasTests = q.tests.some((t) => t.args.trim() || t.expected.trim())
      if (hasTests && !q.fnName.trim()) {
        qe.fnName = 'Function name is required when you add example cases.'
        ok = false
      }
      q.tests.forEach((t, i) => {
        const hasArgs = t.args.trim() !== ''
        const hasExp = t.expected.trim() !== ''
        if (!hasArgs && !hasExp) return // empty row is dropped, not an error
        if (!hasArgs || !hasExp) { qe.tests[i] = 'Both input and expected output are required.'; ok = false; return }
        const argErr = validateJson(t.args, true)
        const expErr = validateJson(t.expected, false)
        if (argErr || expErr) { qe.tests[i] = argErr || expErr; ok = false }
      })
      next[q.id] = qe
    }

    setErrors(next)
    setFormError(ok ? null : 'Please fix the highlighted fields.')
    return ok
  }

  async function submit() {
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      setMode('interview')
      const room = await api.createRoom('Interview session')
      if (enabled) {
        const cleaned = questions.map((q) => ({
          ...q,
          tests: q.tests.filter((t) => t.args.trim() || t.expected.trim()),
        }))
        setInterviewQuestions(room.id, cleaned)
      }
      navigate(`/room/${room.id}?mode=interview`)
    } catch {
      setFormError('Could not create the interview room. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="setup-wrap">
      <div className="mode-topbar">
        <div className="brand"><span className="brand-logo">◆</span> Collide</div>
        <div className="spacer" />
        <button className="btn-ghost" onClick={() => navigate('/home')}>← Back</button>
      </div>

      <div className="setup-body">
        <div className="setup-head">
          <div>
            <h1>Set up interview</h1>
            <p className="muted">Author the coding questions your candidate will see, or turn questions off for a free-form session.</p>
          </div>
          <label className="iv-toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{enabled ? 'Questions on' : 'Questions off'}</span>
          </label>
        </div>

        {enabled ? (
          <>
            <div className="iv-questions">
              {questions.map((q, qi) => {
                const e = errors[q.id]
                return (
                  <div key={q.id} className="iv-q">
                    <div className="iv-q-top">
                      <span className="iv-q-num">Question {qi + 1}</span>
                      {questions.length > 1 && (
                        <button className="iv-remove" onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} title="Remove question">×</button>
                      )}
                    </div>

                    <input
                      className={`iv-input ${e?.title ? 'invalid' : ''}`}
                      placeholder="Title (e.g. Two Sum)"
                      value={q.title}
                      onChange={(ev) => patch(q.id, { title: ev.target.value })}
                    />
                    {e?.title && <span className="iv-err">{e.title}</span>}

                    <textarea
                      className={`iv-input ${e?.description ? 'invalid' : ''}`}
                      placeholder="Question description / prompt…"
                      rows={4}
                      value={q.description}
                      onChange={(ev) => patch(q.id, { description: ev.target.value })}
                    />
                    {e?.description && <span className="iv-err">{e.description}</span>}

                    <input
                      className={`iv-input ${e?.fnName ? 'invalid' : ''}`}
                      placeholder="Function name to implement (e.g. twoSum)"
                      value={q.fnName}
                      onChange={(ev) => patch(q.id, { fnName: ev.target.value })}
                    />
                    {e?.fnName && <span className="iv-err">{e.fnName}</span>}

                    <div className="iv-images">
                      <div className="iv-tests-head"><span>Images</span><span className="iv-hint">optional · ≤ 1.5 MB each</span></div>
                      {q.images.length > 0 && (
                        <div className="iv-thumbs">
                          {q.images.map((src, ii) => (
                            <div key={ii} className="iv-thumb">
                              <img src={src} alt={`Question ${qi + 1} reference ${ii + 1}`} />
                              <button className="iv-remove" onClick={() => patch(q.id, { images: q.images.filter((_, i) => i !== ii) })} title="Remove image">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="iv-add-min">
                        + Add image
                        <input type="file" accept="image/*" multiple hidden onChange={(ev) => { addImages(q.id, ev.target.files); ev.target.value = '' }} />
                      </label>
                    </div>

                    <div className="iv-tests">
                      <div className="iv-tests-head"><span>Example cases</span><span className="iv-hint">args as JSON array → expected as JSON</span></div>
                      {q.tests.map((t, ti) => (
                        <div key={ti}>
                          <div className="iv-test-row">
                            <input className={`iv-input mono ${e?.tests[ti] ? 'invalid' : ''}`} placeholder="[2, 3]" value={t.args} onChange={(ev) => patchTest(q.id, ti, { args: ev.target.value })} />
                            <span className="iv-arrow">→</span>
                            <input className={`iv-input mono ${e?.tests[ti] ? 'invalid' : ''}`} placeholder="5" value={t.expected} onChange={(ev) => patchTest(q.id, ti, { expected: ev.target.value })} />
                            {q.tests.length > 1 && (
                              <button className="iv-remove" onClick={() => patch(q.id, { tests: q.tests.filter((_, i) => i !== ti) })} title="Remove case">×</button>
                            )}
                          </div>
                          {e?.tests[ti] && <span className="iv-err">{e.tests[ti]}</span>}
                        </div>
                      ))}
                      <button className="iv-add-min" onClick={() => patch(q.id, { tests: [...q.tests, blankTest()] })}>+ Add example</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button className="iv-add" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>+ Add question</button>
          </>
        ) : (
          <p className="iv-off-note">No questions — the interview room opens with the code editor, whiteboard and video call.</p>
        )}

        {formError && <div className="iv-form-error">{formError}</div>}

        <div className="iv-actions">
          <button className="btn-ghost" onClick={() => navigate('/home')}>Cancel</button>
          <button className="run-btn" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Start interview →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Validate a JSON string; args must parse to an array. Returns an error message or undefined. */
function validateJson(raw: string, mustBeArray: boolean): string | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (mustBeArray && !Array.isArray(parsed)) return 'Input must be a JSON array, e.g. [2, 3].'
    return undefined
  } catch {
    return mustBeArray ? 'Input is not valid JSON (e.g. [2, 3]).' : 'Expected output is not valid JSON.'
  }
}
