/**
 * PLACEHOLDER runner. Frontend-only.
 *
 * For now "Run" evaluates JavaScript IN THE BROWSER so the button does something
 * visible. This is NOT the real execution path — it's a stand-in.
 *
 * LATER: replace runCode() with a call to the backend execution service
 * (POST /execute → E2B/Judge0) which runs code in a real sandbox and returns
 * stdout/stderr/exitCode. The OutputPanel UI stays exactly the same.
 */
export interface RunResult {
  lines: string[]
  error?: string
}

export async function runCode(source: string): Promise<RunResult> {
  const lines: string[] = []
  const originalLog = console.log
  // capture console.log output from the user's snippet
  console.log = (...args: unknown[]) =>
    lines.push(args.map((a) => format(a)).join(' '))
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(source)
    const ret = await fn()
    if (ret !== undefined) lines.push(`=> ${format(ret)}`)
    return { lines }
  } catch (e) {
    return { lines, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  } finally {
    console.log = originalLog
  }
}

/* ---------- Interview test cases ---------- */

export interface TestOutcome {
  args: string
  expected: string
  actual: string
  passed: boolean
  error?: string
}

/**
 * Run the candidate's `source` against a question's test cases. Each test calls
 * the function named `fnName` with the parsed `args` (a JSON array) and compares
 * the return value to the parsed `expected` (JSON).
 *
 * Like runCode(), this is the browser-only JS stand-in — real multi-language
 * validation belongs in the backend sandbox (see the note at the top of this file).
 */
export async function runTests(
  source: string,
  fnName: string,
  tests: { args: string; expected: string }[],
): Promise<TestOutcome[]> {
  let fn: unknown
  try {
    // Evaluate the source, then hand back the target function by name.
    // eslint-disable-next-line no-new-func
    fn = new Function(`${source}\n; return typeof ${fnName} === 'function' ? ${fnName} : undefined;`)()
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    return tests.map((t) => ({ ...t, actual: '', passed: false, error: msg }))
  }
  if (typeof fn !== 'function') {
    return tests.map((t) => ({
      ...t,
      actual: '',
      passed: false,
      error: `Function "${fnName}" is not defined`,
    }))
  }

  const outcomes: TestOutcome[] = []
  for (const t of tests) {
    try {
      const args = parseArgs(t.args)
      const expected = t.expected.trim() === '' ? undefined : JSON.parse(t.expected)
      const ret = await (fn as (...a: unknown[]) => unknown)(...args)
      const actual = format(ret)
      outcomes.push({ ...t, actual, passed: deepEqual(ret, expected) })
    } catch (e) {
      outcomes.push({
        ...t,
        actual: '',
        passed: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      })
    }
  }
  return outcomes
}

/** Args are authored as a JSON array (e.g. `[2, 3]`). Tolerate a bare single value. */
function parseArgs(raw: string): unknown[] {
  const text = raw.trim()
  if (text === '') return []
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function format(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
