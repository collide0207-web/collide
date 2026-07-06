import { getRoomDoc } from './yjs'

/**
 * Interview questions live in the room's shared Yjs doc so the candidate sees
 * exactly what the interviewer set up — no separate backend. The interviewer
 * writes them once at setup (before entering); everyone reads/observes them live.
 *
 * We keep the whole question set as a single JSON value under a Y.Map field
 * (it's written once and rarely edited), which is simpler than modelling each
 * question as nested Yjs types and is plenty for this use.
 */

/** One test case: the candidate's function is called with `args` and its return
 *  value is compared against `expected`. Both are stored as JSON text the author
 *  types in the form (e.g. args `[2, 3]`, expected `5`). */
export interface TestCase {
  args: string
  expected: string
}

export interface Question {
  id: string
  /** Prompt shown to the candidate. */
  description: string
  /** Name of the function the candidate must implement (called by the tests). */
  fnName: string
  tests: TestCase[]
}

const MAP_KEY = 'interview'
const FIELD = 'questions'

export function setInterviewQuestions(roomId: string, questions: Question[]): void {
  const { doc } = getRoomDoc(roomId)
  doc.getMap(MAP_KEY).set(FIELD, questions)
}

export function getInterviewQuestions(roomId: string): Question[] {
  const { doc } = getRoomDoc(roomId)
  const q = doc.getMap(MAP_KEY).get(FIELD)
  return Array.isArray(q) ? (q as Question[]) : []
}

/** Subscribe to question changes (fires immediately with the current value). */
export function observeInterviewQuestions(
  roomId: string,
  cb: (questions: Question[]) => void,
): () => void {
  const { doc } = getRoomDoc(roomId)
  const map = doc.getMap(MAP_KEY)
  const handler = () => cb(getInterviewQuestions(roomId))
  map.observe(handler)
  cb(getInterviewQuestions(roomId))
  return () => map.unobserve(handler)
}
