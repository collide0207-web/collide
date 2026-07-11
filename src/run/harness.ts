/**
 * Test-runner codegen. Turns a problem's harness metadata + the user's `Solution`
 * into a complete, runnable program per language, so "Run" works LeetCode-style: the
 * user writes only the method, we generate the `main`/driver that builds the arguments
 * as native literals, calls the entry point, and prints the result as canonical JSON.
 *
 * Design notes:
 *  - Arguments are baked in as LITERALS (not parsed from stdin) — each Run recompiles
 *    anyway, so per-case codegen is free and avoids writing a JSON parser in C++/Java.
 *  - The generated driver is APPENDED after the user's code; language preludes
 *    (#include / import) live in the starter template itself, so compile-error line
 *    numbers still line up with what the user sees in the editor.
 *  - Output is canonical JSON with no spaces, matched against JSON.stringify(expected).
 */
import type { ExecutionStatus, ProblemHarness } from '../api/types'

/** Result of running one test case through the harness. `pass: null` = custom/no expected. */
export interface CaseResult {
  status: ExecutionStatus
  stdout: string
  stderr: string
  pass: boolean | null
}

export function hasHarness(h: ProblemHarness | null | undefined): h is ProblemHarness {
  return !!h && typeof h.entry === 'string' && Array.isArray(h.params)
}

export type TypeTag =
  | { kind: 'scalar' | 'list-node' | 'tree-node' | 'graph-node' | 'operations'; elem: string }
  | { kind: 'array'; of: TypeTag }

/** Parse a harness type tag. Scalars/plain arrays are `scalar` (their raw tag kept in `elem`,
 *  so existing literal codegen keeps switching on `int`/`int[]`/… unchanged). Object node types
 *  and the `operations` mode get their own kinds; `array<T>` wraps a parsed element type. */
export function parseType(tag: string): TypeTag {
  const t = tag.trim()
  if (t === 'operations') return { kind: 'operations', elem: '' }
  const arr = /^array<(.+)>$/.exec(t)
  if (arr) return { kind: 'array', of: parseType(arr[1]) }
  const node = /^(list-node|tree-node|graph-node)<(.+)>$/.exec(t)
  if (node) return { kind: node[1] as 'list-node' | 'tree-node' | 'graph-node', elem: node[2] }
  return { kind: 'scalar', elem: t }
}

/** Human-readable signature shown above the statement, e.g. `maxProfit(prices: int[]) → int`. */
export function formatSignature(h: ProblemHarness): string {
  const params = h.params.map((p) => `${p.name}: ${p.type}`).join(', ')
  return `${h.entry}(${params}) → ${h.returns}`
}

/** Canonical JSON text used both for expected-output display and match comparison. */
export function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** True if a program's stdout matches the expected value (tolerates trailing debug lines). */
export function outputMatches(stdout: string, expected: unknown): boolean {
  const want = canonical(expected)
  const trimmed = stdout.trim()
  if (trimmed === want) return true
  const lines = trimmed.split('\n')
  return lines[lines.length - 1]?.trim() === want
}

// --- literals -------------------------------------------------------------------

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Shared array/scalar syntax for JS & Python (differ only in bool casing). */
function bracketLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
    case 'double[]':
      return `[${asArr(v).join(',')}]`
    case 'string[]':
      return `[${asArr(v).map((x) => JSON.stringify(x)).join(',')}]`
    case 'int[][]':
      return `[${asArr(v).map((r) => `[${asArr(r).join(',')}]`).join(',')}]`
    default:
      return JSON.stringify(v)
  }
}

function jsLiteral(type: string, v: unknown): string {
  if (type === 'bool') return v ? 'true' : 'false'
  return bracketLiteral(type, v)
}

function pyLiteral(type: string, v: unknown): string {
  if (type === 'bool') return v ? 'True' : 'False'
  return bracketLiteral(type, v)
}

function cppLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'bool':
      return v ? 'true' : 'false'
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
    case 'double[]':
      return `{${asArr(v).join(',')}}`
    case 'string[]':
      return `{${asArr(v).map((x) => JSON.stringify(x)).join(',')}}`
    case 'int[][]':
      return `{${asArr(v).map((r) => `{${asArr(r).join(',')}}`).join(',')}}`
    default:
      return JSON.stringify(v)
  }
}

function javaLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'bool':
      return v ? 'true' : 'false'
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
      return `new int[]{${asArr(v).join(',')}}`
    case 'double[]':
      return `new double[]{${asArr(v).join(',')}}`
    case 'string[]':
      return `new String[]{${asArr(v).map((x) => JSON.stringify(x)).join(',')}}`
    case 'int[][]':
      return `new int[][]{${asArr(v).map((r) => `{${asArr(r).join(',')}}`).join(',')}}`
    default:
      return JSON.stringify(v)
  }
}

const CPP_TYPE: Record<string, string> = {
  int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'string',
  'int[]': 'vector<int>', 'double[]': 'vector<double>', 'string[]': 'vector<string>', 'int[][]': 'vector<vector<int>>',
}
const JAVA_TYPE: Record<string, string> = {
  int: 'int', long: 'long', double: 'double', bool: 'boolean', string: 'String',
  'int[]': 'int[]', 'double[]': 'double[]', 'string[]': 'String[]', 'int[][]': 'int[][]',
}

// --- result printers ------------------------------------------------------------

function cppPrint(returns: string, expr: string): string {
  switch (returns) {
    case 'bool':
      return `cout << (${expr} ? "true" : "false");`
    case 'string':
      return `cout << "\\"" << ${expr} << "\\"";`
    case 'int[]':
    case 'double[]': {
      return `{ auto __v = ${expr}; cout << "["; for (size_t __i = 0; __i < __v.size(); ++__i) { if (__i) cout << ","; cout << __v[__i]; } cout << "]"; }`
    }
    default:
      return `cout << (${expr});`
  }
}

function javaPrint(returns: string, expr: string): string {
  switch (returns) {
    case 'bool':
      return `System.out.print((${expr}) ? "true" : "false");`
    case 'string':
      return `System.out.print("\\"" + (${expr}) + "\\"");`
    case 'int[]':
    case 'double[]': {
      return `{ var __v = ${expr}; StringBuilder __sb = new StringBuilder("["); for (int __i = 0; __i < __v.length; __i++) { if (__i > 0) __sb.append(","); __sb.append(__v[__i]); } __sb.append("]"); System.out.print(__sb); }`
    }
    default:
      return `System.out.print(${expr});`
  }
}

// --- program builders -----------------------------------------------------------

/** Per-language type definitions + (de)serializers injected ahead of the driver.
 *  Empty until the per-type tasks fill it in. `userCode` lets us skip a definition the
 *  user already provides (mirrors the #include/import guards below). */
function preludeFor(_language: string, _h: ProblemHarness, _userCode: string): string {
  return ''
}

/**
 * Compose a complete runnable program: the user's code plus a generated driver that
 * calls `entry` with `args` (in param order) and prints the result as canonical JSON.
 * Returns null if the language isn't supported by the codegen yet.
 */
export function buildProgram(
  language: string,
  userCode: string,
  h: ProblemHarness,
  args: unknown[],
): string | null {
  const types = h.params.map((p) => p.type)

  switch (language) {
    case 'javascript': {
      const prelude = preludeFor('javascript', h, userCode)
      const call = `${h.entry}(${args.map((a, i) => jsLiteral(types[i], a)).join(', ')})`
      return `${prelude}${userCode}\n\n;(function(){ console.log(JSON.stringify(${call})); })();\n`
    }
    case 'python': {
      const prelude = preludeFor('python', h, userCode)
      const call = `Solution().${h.entry}(${args.map((a, i) => pyLiteral(types[i], a)).join(', ')})`
      return `${prelude}${userCode}\n\nimport json\nprint(json.dumps(${call}, separators=(',', ':')))\n`
    }
    case 'cpp': {
      const decls = h.params
        .map((p, i) => `    ${CPP_TYPE[p.type] ?? 'auto'} __a${i} = ${cppLiteral(p.type, args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = cppPrint(h.returns, `__sol.${h.entry}(${callArgs})`)
      // Guarantee the driver's includes even if the user's saved code stripped them
      // (a bare `class Solution` won't compile against the generated main otherwise).
      const includes = /#include\s*<bits\/stdc\+\+\.h>/.test(userCode) ? '' : '#include <bits/stdc++.h>\nusing namespace std;\n\n'
      const prelude = preludeFor('cpp', h, userCode)
      return `${includes}${prelude}${userCode}\n\nint main() {\n    Solution __sol;\n${decls}\n    ${print}\n    return 0;\n}\n`
    }
    case 'java': {
      const decls = h.params
        .map((p, i) => `        ${JAVA_TYPE[p.type] ?? 'var'} __a${i} = ${javaLiteral(p.type, args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = javaPrint(h.returns, `__sol.${h.entry}(${callArgs})`)
      // Imports must precede the class; prepend java.util if the user's code lacks it.
      const imports = /import\s+java\.util/.test(userCode) ? '' : 'import java.util.*;\n\n'
      const prelude = preludeFor('java', h, userCode)
      return `${imports}${prelude}${userCode}\n\npublic class Main {\n    public static void main(String[] args) {\n        Solution __sol = new Solution();\n${decls}\n        ${print}\n    }\n}\n`
    }
    default:
      return null
  }
}
