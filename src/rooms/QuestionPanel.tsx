import { useEffect, useState } from 'react'
import type { InterviewQuestion } from '../api/types'

interface Props {
  questions: InterviewQuestion[]
}

/**
 * Interview question surface — LeetCode-style. A thin sidebar navigator lists
 * every question; the selected one is shown in detail (title, prompt, reference
 * images, example cases). Questions are fetched by RoomPage and passed in.
 */
export function QuestionPanel({ questions }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)

  // Keep the selection valid if the question set changes under us.
  useEffect(() => {
    if (activeIdx >= questions.length && questions.length > 0) setActiveIdx(questions.length - 1)
  }, [questions.length, activeIdx])

  if (questions.length === 0) {
    return (
      <div className="q-panel">
        <div className="q-empty">No questions were set up for this interview.</div>
      </div>
    )
  }

  const q = questions[Math.min(activeIdx, questions.length - 1)]

  return (
    <div className="q-panel leet">
      <nav className="q-nav" aria-label="Questions">
        {questions.map((item, i) => (
          <button
            key={item.id}
            className={`q-nav-item ${i === activeIdx ? 'active' : ''}`}
            onClick={() => setActiveIdx(i)}
            title={item.title || `Question ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div className="q-detail">
        <h2 className="q-title">{q.title || `Question ${activeIdx + 1}`}</h2>
        <p className="q-desc">{q.description}</p>

        {q.images.length > 0 && (
          <div className="q-images">
            {q.images.map((src, i) => (
              <img key={i} src={src} alt={`Reference ${i + 1}`} className="q-image" />
            ))}
          </div>
        )}

        {q.fnName && (
          <p className="q-fn">Implement <code>{q.fnName}(…)</code></p>
        )}

        {q.tests.length > 0 && (
          <div className="q-examples">
            {q.tests.map((t, i) => (
              <div key={i} className="q-example">
                <span className="q-example-label">Example {i + 1}</span>
                <div className="q-example-row"><span>Input</span><code>{t.args || '()'}</code></div>
                <div className="q-example-row"><span>Output</span><code>{t.expected}</code></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
