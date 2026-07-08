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

function format(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
