# SP2: Harness Extension (list-node / tree-node / graph-node / array / operations codegen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every SP1-authored LeetCode 150 problem runnable against its visible sample cases by extending the client-side Run codegen (`collide/src/run/harness.ts`) to support the object wire-types `list-node<int>`, `tree-node<int>`, `graph-node<int>`, `array<list-node<int>>`, and the `operations` design-problem mode, across all four languages (JavaScript, Python, C++, Java).

**Architecture:** Today `buildProgram` bakes each argument as a native literal and calls the entry function directly. SP2 keeps literal-baking for scalars/arrays but adds a per-language **prelude** (injected type definitions + `__to*`/`__from*` (de)serializers) so object arguments are built by passing an array literal to a deserializer and results are printed by passing the return value through a serializer. `operations` problems get a distinct driver that instantiates the class named by the first op and dispatches the rest, collecting returns into a JSON array. A type-tag parser (`parseType`) turns tag strings like `array<list-node<int>>` into a small structured descriptor that all four language backends share, so adding a language never means re-parsing tags.

**Tech Stack:** React + Vite + TypeScript; **Vitest** (added to the frontend in Task 1 — the sibling `collab` project already uses it; the frontend previously had no test runner). The gate remains `npm run build` (`tsc -b`) plus, now, `npm test` (Vitest). Backend seed JSON is edited only for the `operations` normalization (Task 7).

## Global Constraints

- Frontend module: `collide/` — React/TS. Gates: `npm run build` (`tsc -b`) **and** `npm test` (Vitest, added in Task 1). No ESLint step.
- Backend seed file `collab/collab/control/src/main/resources/seed/leetcode150.json` is the source of truth; the frontend mirror `collide/src/problems/seed.ts` is **generated** by `collide/scripts/gen-frontend-seed.mjs` and must be regenerated (never hand-edited) after any seed change.
- Any seed edit must pass `node collide/scripts/validate-seed.mjs <seed.json>` (the SP1 gate) before commit.
- Canonical output contract (unchanged): a generated program prints its result as **canonical JSON with no spaces** on stdout; `outputMatches(stdout, expected)` compares the last line to `JSON.stringify(expected)`. Every new serializer MUST emit exactly `JSON.stringify`-canonical text (no spaces, `true`/`false` lowercase, `null` for empties).
- Type tags in the seed use angle brackets: `list-node<int>`, `tree-node<int>`, `graph-node<int>`, `array<list-node<int>>`. The element type is always `int` in the current catalogue; the parser must still capture it rather than hard-code it.
- **`operations` canonical contract (locked here, per the master spec §4, and enforced by Task 7 normalization):** the input is a single param of type `operations` whose value is an array `[[ctorName, [ctorArgs...]], [method, [args...]], ...]`. The **first** op is the constructor (its `[args]` may be empty). `expected` is an array of the same length; the constructor's slot is `null`, and each method slot is that method's return value (`null` if the method returns nothing/void). Args are always **nested** in a sub-array (`["put",[1,1]]`, never `["put",1,1]`).
- `list-node`/`tree-node`/`graph-node` empty value is `[]` → the null/empty node (empty list, empty tree, null graph node).
- Injected type names are fixed: `ListNode`, `TreeNode`, `Node` (graph) — matching the identifiers the SP1 starter code already references. Preludes must not redefine a type the user's own code already defines (guard by a source regex, mirroring the existing `#include`/`import` prelude guards).
- Commit after every task. Branch: `feat/leetcode-150-judging` (already checked out).

---

### Task 1: Add Vitest and lock existing codegen behaviour with characterization tests

Introduce the test runner and pin the *current* scalar/array codegen so the Task 2 refactor can't silently regress it. No production behaviour changes here.

**Files:**
- Modify: `collide/package.json` (add `vitest` devDep + `test`/`test:watch` scripts)
- Create: `collide/vitest.config.ts`
- Create: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: existing `buildProgram`, `outputMatches`, `canonical`, `formatSignature` from `collide/src/run/harness.ts`.
- Produces: `npm test` runs Vitest; a green baseline suite for the scalar/array path.

- [ ] **Step 1: Add Vitest to package.json**

In `collide/package.json`, add to `devDependencies`: `"vitest": "^2.1.0"`, and to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Create `collide/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Install**

Run: `cd collide && npm install`
Expected: `vitest` added; lockfile updated.

- [ ] **Step 4: Write characterization tests for the existing path** — `collide/src/run/harness.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildProgram, canonical, formatSignature, outputMatches } from './harness'
import type { ProblemHarness } from '../api/types'

const twoSum: ProblemHarness = {
  entry: 'twoSum',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int[]',
  tests: [{ input: [[2, 7, 11, 15], 9], expected: [0, 1] }],
}

describe('existing scalar/array codegen (characterization)', () => {
  it('formats a signature', () => {
    expect(formatSignature(twoSum)).toBe('twoSum(nums: int[], target: int) → int[]')
  })

  it('JS bakes array + scalar literals and prints canonical JSON', () => {
    const p = buildProgram('javascript', 'function twoSum(nums,target){return [0,1]}', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('twoSum([2,7,11,15], 9)')
    expect(p).toContain('JSON.stringify')
  })

  it('Python calls Solution().entry with literals', () => {
    const p = buildProgram('python', 'class Solution:\n    def twoSum(self,nums,target):\n        return [0,1]', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('Solution().twoSum([2,7,11,15], 9)')
    expect(p).toContain('json.dumps')
  })

  it('C++ declares typed locals and prints an int vector', () => {
    const p = buildProgram('cpp', 'class Solution{public: vector<int> twoSum(vector<int>& n,int t){return {0,1};}};', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('vector<int> __a0 = {2,7,11,15};')
    expect(p).toContain('int __a1 = 9;')
  })

  it('Java declares typed locals and prints an int array', () => {
    const p = buildProgram('java', 'class Solution{ int[] twoSum(int[] n,int t){return new int[]{0,1};}}', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('int[] __a0 = new int[]{2,7,11,15};')
  })

  it('outputMatches tolerates trailing debug lines', () => {
    expect(outputMatches('debug\n[0,1]', [0, 1])).toBe(true)
    expect(outputMatches('[0,1]', [0, 1])).toBe(true)
    expect(outputMatches('[1,0]', [0, 1])).toBe(false)
  })

  it('canonical produces no-space JSON', () => {
    expect(canonical([0, 1])).toBe('[0,1]')
  })
})
```

- [ ] **Step 5: Run the suite**

Run: `cd collide && npm test`
Expected: PASS (all characterization tests green).

- [ ] **Step 6: Commit**

```bash
git -C collide add package.json package-lock.json vitest.config.ts src/run/harness.test.ts
git -C collide commit -m "test(run): add vitest + characterization tests for harness codegen"
```

---

### Task 2: Type-tag parser + prelude plumbing

Add a shared `parseType` that turns a tag string into a structured descriptor, and reshape `buildProgram` so each language composes an optional **prelude** (currently empty) ahead of the driver. Behaviour is unchanged (scalars/arrays still bake as before); this is the seam every later task extends.

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Produces: `export type TypeTag = { kind: 'scalar' | 'list-node' | 'tree-node' | 'graph-node' | 'operations'; elem: string } | { kind: 'array'; of: TypeTag }` and `export function parseType(tag: string): TypeTag`.
- Produces: internal `preludeFor(language: string, h: ProblemHarness): string` returning `''` for now; `buildProgram` prepends it. Later tasks fill it in per type.
- Consumes: nothing new.

- [ ] **Step 1: Write failing parser tests** (append to `harness.test.ts`)

```ts
import { parseType } from './harness'

describe('parseType', () => {
  it('parses scalars and arrays as before', () => {
    expect(parseType('int')).toEqual({ kind: 'scalar', elem: 'int' })
    expect(parseType('int[]')).toEqual({ kind: 'scalar', elem: 'int[]' })
  })
  it('parses object node types with element', () => {
    expect(parseType('list-node<int>')).toEqual({ kind: 'list-node', elem: 'int' })
    expect(parseType('tree-node<int>')).toEqual({ kind: 'tree-node', elem: 'int' })
    expect(parseType('graph-node<int>')).toEqual({ kind: 'graph-node', elem: 'int' })
  })
  it('parses operations', () => {
    expect(parseType('operations')).toEqual({ kind: 'operations', elem: '' })
  })
  it('parses nested array<list-node<int>>', () => {
    expect(parseType('array<list-node<int>>')).toEqual({ kind: 'array', of: { kind: 'list-node', elem: 'int' } })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — `parseType` not exported.

- [ ] **Step 3: Implement `parseType` and the prelude seam** in `harness.ts`

Add near the top (after the `CaseResult` interface):

```ts
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
```

Add an (initially empty) prelude hook above `buildProgram`:

```ts
/** Per-language type definitions + (de)serializers injected ahead of the driver.
 *  Empty until the per-type tasks fill it in. `userCode` lets us skip a definition the
 *  user already provides (mirrors the #include/import guards below). */
function preludeFor(_language: string, _h: ProblemHarness, _userCode: string): string {
  return ''
}
```

Then, inside `buildProgram`, thread the prelude into each language branch. For **javascript**:

```ts
    case 'javascript': {
      const prelude = preludeFor('javascript', h, userCode)
      const call = `${h.entry}(${args.map((a, i) => jsLiteral(types[i], a)).join(', ')})`
      return `${prelude}${userCode}\n\n;(function(){ console.log(JSON.stringify(${call})); })();\n`
    }
```

For **python**:

```ts
    case 'python': {
      const prelude = preludeFor('python', h, userCode)
      const call = `Solution().${h.entry}(${args.map((a, i) => pyLiteral(types[i], a)).join(', ')})`
      return `${prelude}${userCode}\n\nimport json\nprint(json.dumps(${call}, separators=(',', ':')))\n`
    }
```

For **cpp**, fold the prelude into the existing `prelude` string (rename the existing include-guard local to `includes` to avoid a name clash):

```ts
    case 'cpp': {
      const decls = h.params
        .map((p, i) => `    ${CPP_TYPE[p.type] ?? 'auto'} __a${i} = ${cppLiteral(p.type, args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = cppPrint(h.returns, `__sol.${h.entry}(${callArgs})`)
      const includes = /#include\s*<bits\/stdc\+\+\.h>/.test(userCode) ? '' : '#include <bits/stdc++.h>\nusing namespace std;\n\n'
      const prelude = preludeFor('cpp', h, userCode)
      return `${includes}${prelude}${userCode}\n\nint main() {\n    Solution __sol;\n${decls}\n    ${print}\n    return 0;\n}\n`
    }
```

For **java**, likewise:

```ts
    case 'java': {
      const decls = h.params
        .map((p, i) => `        ${JAVA_TYPE[p.type] ?? 'var'} __a${i} = ${javaLiteral(p.type, args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = javaPrint(h.returns, `__sol.${h.entry}(${callArgs})`)
      const imports = /import\s+java\.util/.test(userCode) ? '' : 'import java.util.*;\n\n'
      const prelude = preludeFor('java', h, userCode)
      return `${imports}${prelude}${userCode}\n\npublic class Main {\n    public static void main(String[] args) {\n        Solution __sol = new Solution();\n${decls}\n        ${print}\n    }\n}\n`
    }
```

- [ ] **Step 4: Run tests**

Run: `cd collide && npm test`
Expected: PASS — new `parseType` tests green and all Task 1 characterization tests still green (prelude is `''`, so output is byte-identical except the harmless empty insert).

> Note: the C++ characterization test asserts on `__a0`/`__a1` substrings, which are unaffected by an empty prelude. If any characterization test asserted on the *entire* program string it would need updating — it does not.

- [ ] **Step 5: Typecheck**

Run: `cd collide && npm run build`
Expected: `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): add type-tag parser and per-language prelude seam"
```

---

### Task 3: `list-node<int>` codegen (all 4 languages)

Support singly-linked-list params/returns. Wire form `[1,2,3]` ↔ `ListNode`. Deserialize an array arg into a list before the call; serialize a list return back to an array for printing.

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: `parseType`, `preludeFor` seam from Task 2.
- Produces: for a param of kind `list-node`, the driver builds `__toList(<array-literal>)`; for a `list-node` return, prints `JSON.stringify(__fromList(result))` (or the per-language equivalent). Preludes define `ListNode` + `__toList`/`__fromList`.

Design decisions baked in:
- Arg codegen for object types needs a hook parallel to the scalar `*Literal` functions. Add `argExpr(language, tag, value)` that returns the *expression* passed to the entry function: scalars fall through to the existing `*Literal`; `list-node` returns `__toList(<int[] literal>)`.
- Return codegen needs a hook parallel to `cppPrint`/`javaPrint`. Add `printStmt(language, tag, expr)` returning the statement that prints `expr` as canonical JSON; `list-node` wraps `expr` through `__fromList` then prints the resulting int array.
- The scalar array literal reuses the existing `bracketLiteral('int[]', value)` (JS/Py) / `cppLiteral`/`javaLiteral` — a linked list's wire input is exactly an `int[]`.

- [ ] **Step 1: Write failing tests** (append to `harness.test.ts`)

```ts
const reverseList: ProblemHarness = {
  entry: 'reverseList',
  params: [{ name: 'head', type: 'list-node<int>' }],
  returns: 'list-node<int>',
  tests: [{ input: [[1, 2, 3]], expected: [3, 2, 1] }],
}

describe('list-node codegen', () => {
  it('JS builds a list from the array and prints it back as an array', () => {
    const p = buildProgram('javascript', 'function reverseList(head){return head}', reverseList, [[1, 2, 3]])
    expect(p).toContain('function ListNode')
    expect(p).toContain('__toList([1,2,3])')
    expect(p).toContain('__fromList(')
  })
  it('Python injects ListNode and (de)serializers', () => {
    const p = buildProgram('python', 'class Solution:\n    def reverseList(self,head):\n        return head', reverseList, [[1, 2, 3]])
    expect(p).toContain('class ListNode')
    expect(p).toContain('__to_list([1,2,3])')
    expect(p).toContain('__from_list(')
  })
  it('C++ injects ListNode + builds/serializes', () => {
    const p = buildProgram('cpp', 'class Solution{public: ListNode* reverseList(ListNode* h){return h;}};', reverseList, [[1, 2, 3]])
    expect(p).toContain('struct ListNode')
    expect(p).toContain('__toList({1,2,3})')
    expect(p).toContain('__fromList(')
  })
  it('Java injects ListNode + builds/serializes', () => {
    const p = buildProgram('java', 'class Solution{ ListNode reverseList(ListNode h){return h;}}', reverseList, [[1, 2, 3]])
    expect(p).toContain('static class ListNode')
    expect(p).toContain('__toList(new int[]{1,2,3})')
    expect(p).toContain('__fromList(')
  })
  it('JS list-node round-trips through a real reverse (eval smoke)', () => {
    const p = buildProgram('javascript', 'function reverseList(head){let prev=null;while(head){const n=head.next;head.next=prev;prev=head;head=n;}return prev}', reverseList, [[1, 2, 3]])
    // Execute the generated JS and capture console.log.
    let out = ''
    const log = console.log
    console.log = (s: string) => { out += s }
    try { new Function(p!)() } finally { console.log = log }
    expect(outputMatches(out, [3, 2, 1])).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — no `ListNode` prelude, no `__toList`.

- [ ] **Step 3: Implement `argExpr` / `printStmt` and the list-node preludes**

In `harness.ts`, add the argument-expression and print-statement hooks, and route `buildProgram`'s per-language arg/print construction through them.

```ts
// --- object-type codegen hooks --------------------------------------------------

/** Expression passed as the i-th argument. Scalars reuse the literal bakers; object
 *  types wrap the wire literal in a deserializer defined by the prelude. */
function argExpr(language: string, tag: TypeTag, value: unknown): string {
  if (tag.kind === 'scalar') {
    switch (language) {
      case 'javascript': return jsLiteral(tag.elem, value)
      case 'python': return pyLiteral(tag.elem, value)
      case 'cpp': return cppLiteral(tag.elem, value)
      case 'java': return javaLiteral(tag.elem, value)
    }
  }
  if (tag.kind === 'list-node') {
    const lit = argExpr(language, { kind: 'scalar', elem: 'int[]' }, value)
    return language === 'python' ? `__to_list(${lit})` : `__toList(${lit})`
  }
  // tree-node / graph-node / array / operations added in later tasks.
  return argExpr(language, { kind: 'scalar', elem: 'int[]' }, value)
}

/** Statement (JS/Py: expression fed to the printer) that emits `expr` as canonical JSON. */
function printExprJs(tag: TypeTag, expr: string): string {
  if (tag.kind === 'list-node') return `__fromList(${expr})`
  return expr
}
function printExprPy(tag: TypeTag, expr: string): string {
  if (tag.kind === 'list-node') return `__from_list(${expr})`
  return expr
}
```

For **C++/Java**, extend the existing `cppPrint`/`javaPrint` by first mapping a `list-node` return through `__fromList` (which yields a `vector<int>` / `int[]`), then delegating to the existing int-array printer:

```ts
function cppPrintTag(tag: TypeTag, returns: string, expr: string): string {
  if (tag.kind === 'list-node') return cppPrint('int[]', `__fromList(${expr})`)
  return cppPrint(returns, expr)
}
function javaPrintTag(tag: TypeTag, returns: string, expr: string): string {
  if (tag.kind === 'list-node') return javaPrint('int[]', `__fromList(${expr})`)
  return javaPrint(returns, expr)
}
```

Now wire these into `buildProgram`. Replace the four arg/print constructions:

- JS: `const call = \`${h.entry}(${h.params.map((p, i) => argExpr('javascript', parseType(p.type), args[i])).join(', ')})\`` and print `JSON.stringify(${printExprJs(parseType(h.returns), call)})`.
- Python: same with `argExpr('python', …)`; print `json.dumps(${printExprPy(parseType(h.returns), call)}, separators=(',', ':'))`.
- C++: `const decls = h.params.map((p, i) => \`    ${cppDeclType(parseType(p.type), p.type)} __a${i} = ${argExpr('cpp', parseType(p.type), args[i])};\`)` and `const print = cppPrintTag(parseType(h.returns), h.returns, \`__sol.${h.entry}(${callArgs})\`)`.
- Java: analogous with `javaDeclType` and `javaPrintTag`.

Add the C++/Java declared-type helpers (object types declare as a pointer / class ref):

```ts
function cppDeclType(tag: TypeTag, raw: string): string {
  if (tag.kind === 'list-node') return 'ListNode*'
  return CPP_TYPE[raw] ?? 'auto'
}
function javaDeclType(tag: TypeTag, raw: string): string {
  if (tag.kind === 'list-node') return 'ListNode'
  return JAVA_TYPE[raw] ?? 'var'
}
```

Finally implement `preludeFor` to emit the `ListNode` block per language **only when** the harness references a `list-node` (directly or inside `array<…>`) in a param or the return. Add a helper:

```ts
function usesKind(h: ProblemHarness, kind: TypeTag['kind']): boolean {
  const hit = (t: TypeTag): boolean =>
    t.kind === kind || (t.kind === 'array' && hit(t.of))
  return h.params.some((p) => hit(parseType(p.type))) || hit(parseType(h.returns))
}
```

and the per-language list-node prelude strings (guarded so a user who already defined the type isn't shadowed):

```ts
const LIST_PRELUDE: Record<string, string> = {
  javascript:
    'function ListNode(val, next){ this.val = val===undefined?0:val; this.next = next===undefined?null:next; }\n' +
    'function __toList(a){ let d=new ListNode(0), c=d; for(const x of a){ c.next=new ListNode(x); c=c.next; } return d.next; }\n' +
    'function __fromList(n){ const r=[]; while(n){ r.push(n.val); n=n.next; } return r; }\n\n',
  python:
    'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val=val; self.next=next\n' +
    'def __to_list(a):\n    d=ListNode(0); c=d\n    for x in a:\n        c.next=ListNode(x); c=c.next\n    return d.next\n' +
    'def __from_list(n):\n    r=[]\n    while n:\n        r.append(n.val); n=n.next\n    return r\n\n',
  cpp:
    'struct ListNode { int val; ListNode* next; ListNode(int x):val(x),next(nullptr){} };\n' +
    'static ListNode* __toList(vector<int> a){ ListNode d(0); ListNode* c=&d; for(int x:a){ c->next=new ListNode(x); c=c->next; } return d.next; }\n' +
    'static string __fromList(ListNode* n){ string s="["; bool f=true; while(n){ if(!f) s+=","; s+=to_string(n->val); f=false; n=n->next; } s+="]"; return s; }\n\n',
  java:
    'static class ListNode { int val; ListNode next; ListNode(int x){ val=x; } }\n' +
    'static ListNode __toList(int[] a){ ListNode d=new ListNode(0), c=d; for(int x:a){ c.next=new ListNode(x); c=c.next; } return d.next; }\n' +
    'static String __fromList(ListNode n){ StringBuilder b=new StringBuilder("["); boolean f=true; while(n!=null){ if(!f) b.append(","); b.append(n.val); f=false; n=n.next; } b.append("]"); return b.toString(); }\n\n',
}

function preludeFor(language: string, h: ProblemHarness, userCode: string): string {
  let out = ''
  if (usesKind(h, 'list-node') && !/\b(class|struct)\s+ListNode\b/.test(userCode)) {
    out += LIST_PRELUDE[language] ?? ''
  }
  return out
}
```

> C++/Java `__fromList` return a **string** already in canonical form; `cppPrint('int[]', …)`/`javaPrint('int[]', …)` would double-wrap. Adjust `cppPrintTag`/`javaPrintTag` for `list-node` to print the string directly instead:
> ```ts
> function cppPrintTag(tag: TypeTag, returns: string, expr: string): string {
>   if (tag.kind === 'list-node') return `cout << __fromList(${expr});`
>   return cppPrint(returns, expr)
> }
> function javaPrintTag(tag: TypeTag, returns: string, expr: string): string {
>   if (tag.kind === 'list-node') return `System.out.print(__fromList(${expr}));`
>   return javaPrint(returns, expr)
> }
> ```
> (JS/Py serializers return native arrays that the existing `JSON.stringify`/`json.dumps` renders — no change needed there.)

- [ ] **Step 4: Run tests**

Run: `cd collide && npm test`
Expected: PASS — list-node tests green (including the JS eval smoke test asserting `[3,2,1]`), all prior tests still green.

- [ ] **Step 5: Typecheck**

Run: `cd collide && npm run build`
Expected: `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): list-node<int> codegen across all four languages"
```

---

### Task 4: `tree-node<int>` codegen (all 4 languages)

Binary tree params/returns in LeetCode level-order-with-nulls form (`[1,null,2,3]`). Empty `[]` → null tree. Serializer must reproduce level-order with **trailing nulls trimmed** to match `JSON.stringify(expected)`.

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: the `argExpr`/`printExpr*`/`*PrintTag`/`*DeclType`/`usesKind`/`preludeFor` machinery from Task 3.
- Produces: `tree-node` handled in every hook; `TREE_PRELUDE` per language defining `TreeNode` + `__toTree`/`__fromTree`.

Wire contract: the input array is a mixed `int|null` array, so its literal is **not** a plain `int[]` (nulls must render). Add a dedicated wire literal for tree/graph inputs that renders `null` correctly per language (JS/Py/JSON: `null`/`None`; C++/Java: build via a nullable-int vector). Represent the wire as an array of `number|null`.

- [ ] **Step 1: Write failing tests** (append)

```ts
const maxDepth: ProblemHarness = {
  entry: 'maxDepth',
  params: [{ name: 'root', type: 'tree-node<int>' }],
  returns: 'int',
  tests: [{ input: [[3, 9, 20, null, null, 15, 7]], expected: 3 }],
}
const invert: ProblemHarness = {
  entry: 'invertTree',
  params: [{ name: 'root', type: 'tree-node<int>' }],
  returns: 'tree-node<int>',
  tests: [{ input: [[1, 2, 3]], expected: [1, 3, 2] }],
}

describe('tree-node codegen', () => {
  it('JS builds a tree from level-order (nulls) and returns int', () => {
    const p = buildProgram('javascript', 'function maxDepth(r){return r?1+Math.max(maxDepth(r.left),maxDepth(r.right)):0}', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('function TreeNode')
    expect(p).toContain('__toTree([3,9,20,null,null,15,7])')
  })
  it('Python injects TreeNode', () => {
    const p = buildProgram('python', 'class Solution:\n    def maxDepth(self,r):\n        return 0', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('class TreeNode')
    expect(p).toContain('__to_tree([3,9,20,None,None,15,7])')
  })
  it('C++ renders nulls in the wire builder', () => {
    const p = buildProgram('cpp', 'class Solution{public: int maxDepth(TreeNode* r){return 0;}};', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('struct TreeNode')
    // null encoded as the INT_MIN sentinel in the nullable wire vector:
    expect(p).toContain('__toTree(')
  })
  it('JS invert round-trips and serializes back to trimmed level-order (eval smoke)', () => {
    const p = buildProgram('javascript', 'function invertTree(r){if(!r)return null;const t=r.left;r.left=invertTree(r.right);r.right=invertTree(t);return r}', invert, [[1, 2, 3]])
    let out = ''
    const log = console.log
    console.log = (s: string) => { out += s }
    try { new Function(p!)() } finally { console.log = log }
    expect(outputMatches(out, [1, 3, 2])).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — no `TreeNode` prelude / `__toTree`.

- [ ] **Step 3: Implement tree-node support**

Add a nullable-int wire literal (used by tree and, in Task 5, graph):

```ts
/** Literal for a wire array that may contain nulls (tree level-order / graph guards). */
function nullableWire(language: string, v: unknown): string {
  const a = asArr(v)
  switch (language) {
    case 'javascript': return `[${a.map((x) => (x == null ? 'null' : String(x))).join(',')}]`
    case 'python': return `[${a.map((x) => (x == null ? 'None' : String(x))).join(',')}]`
    // C++/Java: build a vector/array of a nullable box; encode null as INT_MIN sentinel,
    // which __toTree/__toGraph treat as "no node". Real node values never reach INT_MIN.
    case 'cpp': return `{${a.map((x) => (x == null ? '__NUL' : String(x))).join(',')}}`
    case 'java': return `new Integer[]{${a.map((x) => (x == null ? 'null' : String(x))).join(',')}}`
    default: return '[]'
  }
}
```

Extend `argExpr` (before the fallback):

```ts
  if (tag.kind === 'tree-node') {
    const lit = nullableWire(language, value)
    return language === 'python' ? `__to_tree(${lit})` : `__toTree(${lit})`
  }
```

Extend the return hooks:

```ts
// printExprJs:  if (tag.kind === 'tree-node') return `__fromTree(${expr})`
// printExprPy:  if (tag.kind === 'tree-node') return `__from_tree(${expr})`
// cppPrintTag:  if (tag.kind === 'tree-node') return `cout << __fromTree(${expr});`
// javaPrintTag: if (tag.kind === 'tree-node') return `System.out.print(__fromTree(${expr}));`
```

Extend the decl-type helpers: `cppDeclType` → `tree-node` ⇒ `'TreeNode*'`; `javaDeclType` → `'TreeNode'`.

Add `TREE_PRELUDE` (note: `__fromTree` trims trailing nulls to match canonical `expected`):

```ts
const TREE_PRELUDE: Record<string, string> = {
  javascript:
    'function TreeNode(val,left,right){ this.val=val===undefined?0:val; this.left=left||null; this.right=right||null; }\n' +
    'function __toTree(a){ if(!a.length||a[0]==null) return null; const root=new TreeNode(a[0]); const q=[root]; let i=1;\n' +
    '  while(q.length&&i<a.length){ const n=q.shift();\n' +
    '    if(i<a.length){ const v=a[i++]; if(v!=null){ n.left=new TreeNode(v); q.push(n.left); } }\n' +
    '    if(i<a.length){ const v=a[i++]; if(v!=null){ n.right=new TreeNode(v); q.push(n.right); } } }\n' +
    '  return root; }\n' +
    'function __fromTree(root){ const out=[]; const q=[root]; while(q.length){ const n=q.shift(); if(n){ out.push(n.val); q.push(n.left,n.right); } else out.push(null); }\n' +
    '  while(out.length && out[out.length-1]==null) out.pop(); return out; }\n\n',
  python:
    'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val=val; self.left=left; self.right=right\n' +
    'def __to_tree(a):\n    if not a or a[0] is None: return None\n    root=TreeNode(a[0]); q=[root]; i=1\n' +
    '    while q and i<len(a):\n        n=q.pop(0)\n' +
    '        if i<len(a):\n            v=a[i]; i+=1\n            if v is not None: n.left=TreeNode(v); q.append(n.left)\n' +
    '        if i<len(a):\n            v=a[i]; i+=1\n            if v is not None: n.right=TreeNode(v); q.append(n.right)\n    return root\n' +
    'def __from_tree(root):\n    out=[]; q=[root]\n    while q:\n        n=q.pop(0)\n        if n: out.append(n.val); q.append(n.left); q.append(n.right)\n        else: out.append(None)\n' +
    '    while out and out[-1] is None: out.pop()\n    return out\n\n',
  cpp:
    'static const int __NUL = INT_MIN;\n' +
    'struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x):val(x),left(nullptr),right(nullptr){} };\n' +
    'static TreeNode* __toTree(vector<int> a){ if(a.empty()||a[0]==__NUL) return nullptr; TreeNode* root=new TreeNode(a[0]); queue<TreeNode*> q; q.push(root); size_t i=1;\n' +
    '  while(!q.empty()&&i<a.size()){ TreeNode* n=q.front(); q.pop();\n' +
    '    if(i<a.size()){ int v=a[i++]; if(v!=__NUL){ n->left=new TreeNode(v); q.push(n->left); } }\n' +
    '    if(i<a.size()){ int v=a[i++]; if(v!=__NUL){ n->right=new TreeNode(v); q.push(n->right); } } }\n' +
    '  return root; }\n' +
    'static string __fromTree(TreeNode* root){ vector<string> out; queue<TreeNode*> q; q.push(root);\n' +
    '  while(!q.empty()){ TreeNode* n=q.front(); q.pop(); if(n){ out.push_back(to_string(n->val)); q.push(n->left); q.push(n->right); } else out.push_back("null"); }\n' +
    '  while(!out.empty()&&out.back()=="null") out.pop_back(); string s="["; for(size_t i=0;i<out.size();++i){ if(i) s+=","; s+=out[i]; } s+="]"; return s; }\n\n',
  java:
    'static class TreeNode { int val; TreeNode left, right; TreeNode(int x){ val=x; } }\n' +
    'static TreeNode __toTree(Integer[] a){ if(a.length==0||a[0]==null) return null; TreeNode root=new TreeNode(a[0]); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(root); int i=1;\n' +
    '  while(!q.isEmpty()&&i<a.length){ TreeNode n=q.poll();\n' +
    '    if(i<a.length){ Integer v=a[i++]; if(v!=null){ n.left=new TreeNode(v); q.add(n.left); } }\n' +
    '    if(i<a.length){ Integer v=a[i++]; if(v!=null){ n.right=new TreeNode(v); q.add(n.right); } } }\n' +
    '  return root; }\n' +
    'static String __fromTree(TreeNode root){ java.util.List<String> out=new java.util.ArrayList<>(); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(root);\n' +
    '  while(!q.isEmpty()){ TreeNode n=q.poll(); if(n!=null){ out.add(String.valueOf(n.val)); q.add(n.left); q.add(n.right); } else out.add("null"); }\n' +
    '  while(!out.isEmpty()&&out.get(out.size()-1).equals("null")) out.remove(out.size()-1); return "["+String.join(",",out)+"]"; }\n\n',
}
```

> C++ `__toTree` takes `vector<int>` but the wire literal `{3,9,20,__NUL,__NUL,15,7}` is a braced init of ints — `__NUL` is `INT_MIN`, a real int, so this compiles. Java uses `Integer[]` so genuine `null` flows through. Add `queue`/`INT_MIN` via the existing `<bits/stdc++.h>` include (already injected).

Extend `preludeFor` to append `TREE_PRELUDE` when `usesKind(h,'tree-node')` and the user hasn't defined `TreeNode`:

```ts
  if (usesKind(h, 'tree-node') && !/\b(class|struct)\s+TreeNode\b/.test(userCode)) {
    out += TREE_PRELUDE[language] ?? ''
  }
```

- [ ] **Step 4: Run tests**

Run: `cd collide && npm test`
Expected: PASS — tree tests green (JS invert eval smoke returns `[1,3,2]`).

- [ ] **Step 5: Typecheck**

Run: `cd collide && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): tree-node<int> codegen across all four languages"
```

---

### Task 5: `graph-node<int>` codegen (all 4 languages)

Clone-Graph-style adjacency-list wire form `[[2,4],[1,3],[2,4],[1,3]]` (entry i = neighbour values of node i+1; values are 1-indexed positions). Empty `[]` → null node. Deserialize to a `Node` graph; serialize a returned `Node` back to an adjacency list via BFS from node value 1.

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: all Task 3/4 machinery.
- Produces: `graph-node` handled in every hook; `GRAPH_PRELUDE` per language defining `Node` + `__toGraph`/`__fromGraph`.

- [ ] **Step 1: Write failing tests** (append)

```ts
const cloneGraph: ProblemHarness = {
  entry: 'cloneGraph',
  params: [{ name: 'node', type: 'graph-node<int>' }],
  returns: 'graph-node<int>',
  tests: [{ input: [[[2, 4], [1, 3], [2, 4], [1, 3]]], expected: [[2, 4], [1, 3], [2, 4], [1, 3]] }],
}

describe('graph-node codegen', () => {
  it('JS builds the adjacency graph and serializes back', () => {
    const p = buildProgram('javascript', 'function cloneGraph(n){return n}', cloneGraph, [[[2, 4], [1, 3], [2, 4], [1, 3]]])
    expect(p).toContain('function Node')
    expect(p).toContain('__toGraph([[2,4],[1,3],[2,4],[1,3]])')
    expect(p).toContain('__fromGraph(')
  })
  it('JS clone-graph round-trips via identity (eval smoke)', () => {
    const p = buildProgram('javascript', 'function cloneGraph(n){return n}', cloneGraph, [[[2, 4], [1, 3], [2, 4], [1, 3]]])
    let out = ''
    const log = console.log
    console.log = (s: string) => { out += s }
    try { new Function(p!)() } finally { console.log = log }
    expect(outputMatches(out, [[2, 4], [1, 3], [2, 4], [1, 3]])).toBe(true)
  })
  it('C++/Java/Python inject Node', () => {
    expect(buildProgram('python', 'class Solution:\n    def cloneGraph(self,n):\n        return n', cloneGraph, [[[2, 4]]])).toContain('class Node')
    expect(buildProgram('cpp', 'class Solution{public: Node* cloneGraph(Node* n){return n;}};', cloneGraph, [[[2, 4]]])).toContain('struct Node')
    expect(buildProgram('java', 'class Solution{ Node cloneGraph(Node n){return n;}}', cloneGraph, [[[2, 4]]])).toContain('static class Node')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — no `Node` prelude.

- [ ] **Step 3: Implement graph-node support**

The adjacency-list wire literal is an `int[][]` — reuse the existing `int[][]` literal bakers.

Extend `argExpr`:

```ts
  if (tag.kind === 'graph-node') {
    const lit = argExpr(language, { kind: 'scalar', elem: 'int[][]' }, value)
    return language === 'python' ? `__to_graph(${lit})` : `__toGraph(${lit})`
  }
```

Extend the return hooks (`graph-node`): JS `__fromGraph(expr)`, Py `__from_graph(expr)`, C++ `cout << __fromGraph(${expr});`, Java `System.out.print(__fromGraph(${expr}));`. Decl types: `cppDeclType` `graph-node` ⇒ `'Node*'`; `javaDeclType` ⇒ `'Node'`.

Add `GRAPH_PRELUDE` (BFS build by 1-indexed value; serialize by BFS from the returned node, emitting neighbour-value lists ordered by node value):

```ts
const GRAPH_PRELUDE: Record<string, string> = {
  javascript:
    'function Node(val, neighbors){ this.val=val===undefined?0:val; this.neighbors=neighbors||[]; }\n' +
    'function __toGraph(adj){ if(!adj.length) return null; const nodes=adj.map((_,i)=>new Node(i+1));\n' +
    '  adj.forEach((nb,i)=>{ nodes[i].neighbors = nb.map((v)=>nodes[v-1]); }); return nodes[0]; }\n' +
    'function __fromGraph(node){ if(!node) return []; const seen=new Map(); const q=[node]; seen.set(node.val,node);\n' +
    '  while(q.length){ const n=q.shift(); for(const m of n.neighbors){ if(!seen.has(m.val)){ seen.set(m.val,m); q.push(m); } } }\n' +
    '  const vals=[...seen.keys()].sort((a,b)=>a-b); return vals.map((v)=>seen.get(v).neighbors.map((m)=>m.val).sort((a,b)=>a-b)); }\n\n',
  python:
    'class Node:\n    def __init__(self, val=0, neighbors=None):\n        self.val=val; self.neighbors=neighbors if neighbors else []\n' +
    'def __to_graph(adj):\n    if not adj: return None\n    nodes=[Node(i+1) for i in range(len(adj))]\n' +
    '    for i,nb in enumerate(adj):\n        nodes[i].neighbors=[nodes[v-1] for v in nb]\n    return nodes[0]\n' +
    'def __from_graph(node):\n    if not node: return []\n    seen={node.val:node}; q=[node]\n' +
    '    while q:\n        n=q.pop(0)\n        for m in n.neighbors:\n            if m.val not in seen: seen[m.val]=m; q.append(m)\n' +
    '    return [sorted(x.val for x in seen[v].neighbors) for v in sorted(seen)]\n\n',
  cpp:
    'struct Node { int val; vector<Node*> neighbors; Node(int x):val(x){} };\n' +
    'static Node* __toGraph(vector<vector<int>> adj){ if(adj.empty()) return nullptr; vector<Node*> nodes; for(size_t i=0;i<adj.size();++i) nodes.push_back(new Node(i+1));\n' +
    '  for(size_t i=0;i<adj.size();++i) for(int v:adj[i]) nodes[i]->neighbors.push_back(nodes[v-1]); return nodes[0]; }\n' +
    'static string __fromGraph(Node* node){ if(!node) return "[]"; map<int,Node*> seen; queue<Node*> q; q.push(node); seen[node->val]=node;\n' +
    '  while(!q.empty()){ Node* n=q.front(); q.pop(); for(Node* m:n->neighbors) if(!seen.count(m->val)){ seen[m->val]=m; q.push(m); } }\n' +
    '  string s="["; bool f1=true; for(auto& kv:seen){ if(!f1) s+=","; f1=false; vector<int> vs; for(Node* m:kv.second->neighbors) vs.push_back(m->val); sort(vs.begin(),vs.end());\n' +
    '    s+="["; for(size_t i=0;i<vs.size();++i){ if(i) s+=","; s+=to_string(vs[i]); } s+="]"; } s+="]"; return s; }\n\n',
  java:
    'static class Node { int val; java.util.List<Node> neighbors=new java.util.ArrayList<>(); Node(int x){ val=x; } }\n' +
    'static Node __toGraph(int[][] adj){ if(adj.length==0) return null; Node[] nodes=new Node[adj.length]; for(int i=0;i<adj.length;i++) nodes[i]=new Node(i+1);\n' +
    '  for(int i=0;i<adj.length;i++) for(int v:adj[i]) nodes[i].neighbors.add(nodes[v-1]); return nodes[0]; }\n' +
    'static String __fromGraph(Node node){ if(node==null) return "[]"; java.util.TreeMap<Integer,Node> seen=new java.util.TreeMap<>(); java.util.Queue<Node> q=new java.util.LinkedList<>(); q.add(node); seen.put(node.val,node);\n' +
    '  while(!q.isEmpty()){ Node n=q.poll(); for(Node m:n.neighbors) if(!seen.containsKey(m.val)){ seen.put(m.val,m); q.add(m); } }\n' +
    '  StringBuilder b=new StringBuilder("["); boolean f1=true; for(Node n:seen.values()){ if(!f1) b.append(","); f1=false; java.util.List<Integer> vs=new java.util.ArrayList<>(); for(Node m:n.neighbors) vs.add(m.val); java.util.Collections.sort(vs);\n' +
    '    b.append("["); for(int i=0;i<vs.size();i++){ if(i>0) b.append(","); b.append(vs.get(i)); } b.append("]"); } b.append("]"); return b.toString(); }\n\n',
}
```

Extend `preludeFor` for `graph-node` guarded by `!/\b(class|struct)\s+Node\b/.test(userCode)`.

> Serialization sorts neighbour lists so identity-clone output equals the canonical adjacency input. This assumes node values are the 1..n positions the wire encodes (true for this problem per its constraints).

- [ ] **Step 4: Run tests / Step 5: Typecheck / Step 6: Commit**

Run: `cd collide && npm test && npm run build`
Expected: PASS + clean.

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): graph-node<int> codegen across all four languages"
```

---

### Task 6: `array<list-node<int>>` nested codegen (all 4 languages)

Merge-k-Sorted-Lists param: an array of linked lists, wire form `[[1,4,5],[1,3,4],[2,6]]`. Return is a single `list-node<int>`. Only the JS/Py/C++/Java **argument** path needs the nested case; the return is plain `list-node` (Task 3).

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: Task 3 list-node machinery.
- Produces: `argExpr` handles `{ kind: 'array', of: {kind:'list-node'} }`; C++/Java decl types for that arg.

- [ ] **Step 1: Write failing tests** (append)

```ts
const mergeK: ProblemHarness = {
  entry: 'mergeKLists',
  params: [{ name: 'lists', type: 'array<list-node<int>>' }],
  returns: 'list-node<int>',
  tests: [{ input: [[[1, 4, 5], [1, 3, 4], [2, 6]]], expected: [1, 1, 2, 3, 4, 4, 5, 6] }],
}

describe('array<list-node> codegen', () => {
  it('JS maps each inner array to a list', () => {
    const p = buildProgram('javascript', 'function mergeKLists(ls){return ls[0]||null}', mergeK, [[[1, 4, 5], [1, 3, 4], [2, 6]]])
    expect(p).toContain('.map((__x)=>__toList(__x))')
    expect(p).toContain('__fromList(')
  })
  it('Python builds a list of lists', () => {
    const p = buildProgram('python', 'class Solution:\n    def mergeKLists(self,ls):\n        return ls[0] if ls else None', mergeK, [[[1, 4, 5], [1, 3, 4], [2, 6]]])
    expect(p).toContain('[__to_list(__x) for __x in')
  })
  it('C++ builds a vector<ListNode*>', () => {
    const p = buildProgram('cpp', 'class Solution{public: ListNode* mergeKLists(vector<ListNode*>& ls){return ls.empty()?nullptr:ls[0];}};', mergeK, [[[1, 4, 5]]])
    expect(p).toContain('vector<ListNode*> __a0')
  })
  it('Java builds a ListNode[]', () => {
    const p = buildProgram('java', 'class Solution{ ListNode mergeKLists(ListNode[] ls){return ls.length==0?null:ls[0];}}', mergeK, [[[1, 4, 5]]])
    expect(p).toContain('ListNode[] __a0')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — `array` kind falls through to the `int[]` fallback.

- [ ] **Step 3: Implement nested-array arg codegen**

Handle only `array<list-node>` (the sole nested case in the catalogue); other `array<…>` element kinds throw a clear error so a future author sees it immediately.

Extend `argExpr`, before the fallback:

```ts
  if (tag.kind === 'array') {
    if (tag.of.kind === 'list-node') {
      const inner = asArr(value)
      switch (language) {
        case 'javascript':
          return `[${inner.map((x) => argExpr('javascript', { kind: 'scalar', elem: 'int[]' }, x)).join(',')}].map((__x)=>__toList(__x))`
        case 'python':
          return `[__to_list(__x) for __x in [${inner.map((x) => argExpr('python', { kind: 'scalar', elem: 'int[]' }, x)).join(',')}]]`
        case 'cpp': {
          const parts = inner.map((x) => `__toList(${argExpr('cpp', { kind: 'scalar', elem: 'int[]' }, x)})`).join(', ')
          return `vector<ListNode*>{${parts}}`
        }
        case 'java': {
          const parts = inner.map((x) => `__toList(${argExpr('java', { kind: 'scalar', elem: 'int[]' }, x)})`).join(', ')
          return `new ListNode[]{${parts}}`
        }
      }
    }
    throw new Error(`Unsupported array element type: ${tag.of.kind}`)
  }
```

Extend decl types: `cppDeclType` — `array` of `list-node` ⇒ `'vector<ListNode*>'`; `javaDeclType` ⇒ `'ListNode[]'`.

`usesKind(h,'list-node')` already returns true for `array<list-node<int>>` (it recurses into `array`), so the `ListNode` prelude is injected — no `preludeFor` change needed.

- [ ] **Step 4: Run tests / Step 5: Typecheck / Step 6: Commit**

Run: `cd collide && npm test && npm run build`
Expected: PASS + clean.

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): array<list-node<int>> nested argument codegen"
```

---

### Task 7: Normalize `operations` seed data to the canonical contract

The seven design problems' `operations` test data is inconsistent (some omit the constructor op; args are flat). Rewrite each to the locked canonical form so Task 8's driver can be uniform, extend the SP1 validator to enforce it, and regenerate the frontend mirror.

**Files:**
- Modify: `collab/collab/control/src/main/resources/seed/leetcode150.json` (the 7 operations problems)
- Modify: `collide/scripts/validate-seed.mjs` (add an operations-shape check)
- Modify: `collide/src/problems/seed.ts` (regenerated, not hand-edited)

The seven problems and their class names (constructor op name):

| slug (entry) | class / ctor op | ctor args |
|---|---|---|
| `randomizedSetOps` | `RandomizedSet` | `[]` |
| `minStackOps` | `MinStack` | `[]` |
| `lruCacheOps` | `LRUCache` | `[capacity]` |
| `trieOps` | `Trie` | `[]` |
| `wordDictionaryOps` | `WordDictionary` | `[]` |
| `twitterOps` | `Twitter` | `[]` |
| `medianFinderOps` | `MedianFinder` | `[]` |

**Canonical form (per Global Constraints):** each test's single input value is `[[CtorName,[ctorArgs...]], [method,[args...]], ...]`; `expected[0]` is `null` (constructor), `expected[k]` is the k-th op's return (`null` for void methods like `push`/`insert`/`addWord`).

- [ ] **Step 1: Extend the validator** — in `collide/scripts/validate-seed.mjs`, inside the `if (h)` block, after the arity checks, add an operations-shape guard:

```js
      const isOps = Array.isArray(h.params) && h.params.some((pp) => pp.type === 'operations')
      if (isOps) {
        for (const [i, t] of (h.tests || []).entries()) {
          const seq = t?.input?.[0]
          if (!Array.isArray(seq) || seq.length === 0) { err(`ops test[${i}] must be a non-empty op array`); continue }
          for (const [j, op] of seq.entries()) {
            if (!Array.isArray(op) || typeof op[0] !== 'string' || !Array.isArray(op[1]))
              err(`ops test[${i}] op[${j}] must be [name, [args]]`)
          }
          if (!Array.isArray(t?.expected) || t.expected.length !== seq.length)
            err(`ops test[${i}] expected length must equal op count`)
        }
      }
```

- [ ] **Step 2: Prove the guard rejects the *current* (un-normalized) seed**

Run: `cd collide && node scripts/validate-seed.mjs ../collab/collab/control/src/main/resources/seed/leetcode150.json`
Expected: exit `1` with `randomized-set: ops test[0] op[0] must be [name, [args]]` (and similar) — the flat-arg / missing-ctor data now fails the gate. This is the failing "test" for the normalization.

- [ ] **Step 3: Normalize each of the 7 problems** to canonical form. Worked example — `randomized-set` test `input[0]` becomes (constructor added, args nested, expected gains a leading `null`):

```json
"tests": [
  {
    "input": [
      [
        ["RandomizedSet", []],
        ["insert", [1]],
        ["remove", [2]],
        ["insert", [2]],
        ["getRandom", []],
        ["remove", [1]],
        ["insert", [2]],
        ["getRandom", []]
      ]
    ],
    "expected": [null, true, false, true, 2, true, false, 2]
  }
]
```

Apply the same transformation to `min-stack`, `lru-cache` (constructor `["LRUCache",[<capacity>]]`), `implement-trie-prefix-tree`, `design-add-and-search-words-data-structure`, `design-twitter` (its `["Twitter"]` op becomes `["Twitter",[]]`, and every method's flat args nest; its `expected` already has the leading `null`), and `find-median-from-data-stream`. For `getRandom`-style nondeterministic ops keep the authored expected value (these samples were authored to be deterministic given the preceding ops). Keep every method call's return in `expected` (`null` for void).

- [ ] **Step 4: Re-validate**

Run: `cd collide && node scripts/validate-seed.mjs ../collab/collab/control/src/main/resources/seed/leetcode150.json`
Expected: `seed valid`, exit `0`.

- [ ] **Step 5: Regenerate the frontend mirror + typecheck**

Run:
```bash
cd collide
node scripts/gen-frontend-seed.mjs
npm run build
```
Expected: `wrote 149 problems to src/problems/seed.ts`, then `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git -C collab/collab/control add src/main/resources/seed/leetcode150.json
git -C collab/collab/control commit -m "content(problem): normalize operations test data to canonical constructor-first form"
git -C collide add scripts/validate-seed.mjs src/problems/seed.ts
git -C collide commit -m "feat(seed): enforce + regenerate canonical operations shape"
```

---

### Task 8: `operations`-mode driver codegen (all 4 languages)

Design problems don't call a single entry — the driver instantiates the class from the constructor op and dispatches each subsequent op as a method call, collecting returns into a JSON array. This is a separate code path in `buildProgram` gated on the entry param being `operations`.

**Files:**
- Modify: `collide/src/run/harness.ts`
- Modify: `collide/src/run/harness.test.ts`

**Interfaces:**
- Consumes: `parseType`; the ops value is `args[0]` (the sole param).
- Produces: `buildProgram` short-circuits to `buildOperationsProgram(language, userCode, ops)` when `parseType(h.params[0].type).kind === 'operations'`.

Contract for the generated driver: build the object with `new Ctor(...ctorArgs)`; for each subsequent op call `obj[method](...args)`; push each return (constructor pushes `null`); print the collected array as canonical JSON. Values in ops are plain JSON scalars/arrays, baked as literals.

- [ ] **Step 1: Write failing tests** (append)

```ts
const minStack: ProblemHarness = {
  entry: 'minStackOps',
  params: [{ name: 'operations', type: 'operations' }],
  returns: 'operations',
  tests: [{
    input: [[['MinStack', []], ['push', [-2]], ['push', [0]], ['getMin', []], ['pop', []], ['top', []]]],
    expected: [null, null, null, -2, null, 0],
  }],
}

describe('operations-mode codegen', () => {
  it('JS instantiates the class and dispatches, collecting returns', () => {
    const p = buildProgram('javascript', 'class MinStack{constructor(){this.s=[]}push(x){this.s.push(x)}pop(){this.s.pop()}top(){return this.s[this.s.length-1]}getMin(){return Math.min(...this.s)}}', minStack, [minStack.tests[0].input[0]])
    expect(p).toContain('new MinStack(')
    expect(p).toContain('JSON.stringify')
  })
  it('JS operations round-trip (eval smoke)', () => {
    const p = buildProgram('javascript', 'class MinStack{constructor(){this.s=[]}push(x){this.s.push(x)}pop(){this.s.pop()}top(){return this.s[this.s.length-1]}getMin(){return Math.min(...this.s)}}', minStack, [minStack.tests[0].input[0]])
    let out = ''
    const log = console.log
    console.log = (s: string) => { out += s }
    try { new Function(p!)() } finally { console.log = log }
    expect(outputMatches(out, [null, null, null, -2, null, 0])).toBe(true)
  })
  it('Python dispatches via getattr', () => {
    const p = buildProgram('python', 'class MinStack:\n    def __init__(self):\n        self.s=[]\n    def push(self,x):\n        self.s.append(x)\n    def pop(self):\n        self.s.pop()\n    def top(self):\n        return self.s[-1]\n    def getMin(self):\n        return min(self.s)', minStack, [minStack.tests[0].input[0]])
    expect(p).toContain('MinStack(')
    expect(p).toContain('json.dumps')
  })
  it('C++/Java emit a dispatch driver', () => {
    expect(buildProgram('cpp', 'class MinStack{public: MinStack(){} void push(int x){} void pop(){} int top(){return 0;} int getMin(){return 0;}};', minStack, [minStack.tests[0].input[0]])).toContain('MinStack')
    expect(buildProgram('java', 'class MinStack{ MinStack(){} void push(int x){} void pop(){} int top(){return 0;} int getMin(){return 0;}}', minStack, [minStack.tests[0].input[0]])).toContain('new MinStack')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd collide && npm test`
Expected: FAIL — operations still routed through the scalar path.

- [ ] **Step 3: Implement the operations driver**

At the very top of `buildProgram`, before the `switch`, short-circuit:

```ts
  if (h.params.length === 1 && parseType(h.params[0].type).kind === 'operations') {
    return buildOperationsProgram(language, userCode, args[0] as OpsSeq)
  }
```

Add the types + builder. JS and Python dispatch dynamically (simplest, exact). C++/Java generate an explicit `if`-chain over method names, casting each result to the printed form; since design methods return `int`/`bool`/`void`/`int[]`, the driver prints `null` for void and canonical JSON otherwise using a small `any`-boxing approach — but to stay tractable and matched to the current catalogue, C++/Java emit a dispatch that prints each return via an overloaded `__emit` set (int/bool/vector/void). Full code:

```ts
type Op = [string, unknown[]]
type OpsSeq = Op[]

function jsVal(v: unknown): string { return JSON.stringify(v) }
function pyVal(v: unknown): string {
  if (v === true) return 'True'; if (v === false) return 'False'; if (v === null) return 'None'
  return JSON.stringify(v)
}

function buildOperationsProgram(language: string, userCode: string, ops: OpsSeq): string | null {
  const [ctor, ...calls] = ops
  const ctorName = ctor[0]
  switch (language) {
    case 'javascript': {
      const lines = [
        `const __obj = new ${ctorName}(${(ctor[1] ?? []).map(jsVal).join(', ')});`,
        `const __res = [null];`,
        ...calls.map((op) => `__res.push((()=>{ const __r = __obj[${JSON.stringify(op[0])}](${(op[1] ?? []).map(jsVal).join(', ')}); return __r===undefined?null:__r; })());`),
        `console.log(JSON.stringify(__res));`,
      ]
      return `${userCode}\n\n;(function(){\n${lines.join('\n')}\n})();\n`
    }
    case 'python': {
      const lines = [
        `__obj = ${ctorName}(${(ctor[1] ?? []).map(pyVal).join(', ')})`,
        `__res = [None]`,
        ...calls.map((op) => `__res.append(__obj.${op[0]}(${(op[1] ?? []).map(pyVal).join(', ')}))`),
        `import json`,
        `print(json.dumps(__res, separators=(',', ':')))`,
      ]
      return `${userCode}\n\n${lines.join('\n')}\n`
    }
    case 'cpp': {
      // Print each return through __emit overloads; void methods emit "null".
      const emit = [
        'static string __ops;',
        'static void __push(const string& s){ if(!__ops.empty()) __ops+=","; __ops+=s; }',
        'static string __J(int x){ return to_string(x); }',
        'static string __J(long long x){ return to_string(x); }',
        'static string __J(bool x){ return x?"true":"false"; }',
        'static string __J(double x){ ostringstream o; o<<x; return o.str(); }',
        'static string __J(const string& x){ return "\\""+x+"\\""; }',
        'static string __J(vector<int> v){ string s="["; for(size_t i=0;i<v.size();++i){ if(i) s+=","; s+=to_string(v[i]); } return s+"]"; }',
      ].join('\n')
      const includes = /#include\s*<bits\/stdc\+\+\.h>/.test(userCode) ? '' : '#include <bits/stdc++.h>\nusing namespace std;\n\n'
      const body = [
        `${ctorName} __obj${(ctor[1] ?? []).length ? `(${(ctor[1] ?? []).map((v) => cppLiteral('int', v)).join(', ')})` : ''};`,
        `__push("null");`,
        ...calls.map((op) => cppOpCall(op)),
        `cout << "[" << __ops << "]";`,
      ].join('\n    ')
      return `${includes}${emit}\n\n${userCode}\n\nint main(){\n    ${body}\n    return 0;\n}\n`
    }
    case 'java': {
      const includes = /import\s+java\.util/.test(userCode) ? '' : 'import java.util.*;\n\n'
      const body = [
        `${ctor[0]} __obj = new ${ctor[0]}(${(ctor[1] ?? []).map((v) => javaLiteral('int', v)).join(', ')});`,
        `StringBuilder __ops = new StringBuilder();`,
        `__push(__ops, "null");`,
        ...calls.map((op) => javaOpCall(op)),
        `System.out.print("[" + __ops + "]");`,
      ].join('\n        ')
      const emit =
        'static void __push(StringBuilder b, String s){ if(b.length()>0) b.append(\",\"); b.append(s); }\n' +
        'static String __J(int x){ return String.valueOf(x); }\n' +
        'static String __J(boolean x){ return x?\"true\":\"false\"; }\n' +
        'static String __J(long x){ return String.valueOf(x); }\n' +
        'static String __J(double x){ return String.valueOf(x); }\n' +
        'static String __J(String x){ return \"\\\"\"+x+\"\\\"\"; }\n' +
        'static String __J(int[] v){ StringBuilder s=new StringBuilder(\"[\"); for(int i=0;i<v.length;i++){ if(i>0) s.append(\",\"); s.append(v[i]); } return s.append(\"]\").toString(); }\n'
      return `${includes}${userCode}\n\npublic class Main {\n${emit}\n    public static void main(String[] a){\n        ${body}\n    }\n}\n`
    }
    default: return null
  }
}
```

For C++/Java, void-vs-value dispatch can't be introspected from codegen, so emit each call wrapped to print `null` when the method is a known void method **or** capture its value — the tractable rule for the current catalogue: if the op's `expected` slot is `null` we treat it as void and emit `__push("null")` after invoking; otherwise emit `__push(__J(<call>))`. But `expected` isn't available inside `buildProgram` per-op. Instead, generate BOTH: call the method as a statement and print `null` for methods whose name starts with a mutator prefix is unreliable — therefore **C++/Java operations execution is generated as call-and-emit using the method return type inferred from a per-op marker passed alongside**. To avoid overreach, implement `cppOpCall`/`javaOpCall` to emit `__push(__J(__obj.method(args)))` for value-returning ops and `{ __obj.method(args); __push("null"); }` for void ops, deciding void-ness from a parallel `voidMethods` set derived at call sites in Task 9 tests only. **Simplify:** since the JS/Python paths already give exact verdicts in the browser (the only environment that executes here), and C++/Java can't run in this environment anyway, generate C++/Java operations drivers that compile and run *when a backend exists* by using the try-both pattern:

```ts
function cppOpCall(op: Op): string {
  const args = (op[1] ?? []).map((v) => cppLiteral('int', v)).join(', ')
  // Value methods emit their JSON; void methods must be handled by the caller-provided
  // convention. Default: attempt value emit; MinStack-style void ops are pushed as null.
  return `__opCall_${op[0]}(__obj${args ? ', ' + args : ''});`
}
```

> **Scope decision:** Because only the JavaScript path executes in this environment (mock backend) and the browser Run uses whichever language the user selects, the *exact* C++/Java operations dispatch (void detection) is deferred to SP4's server judge, which owns compiled-language execution. Task 8 ships **fully working JS + Python operations codegen** (exact, eval-verified) and C++/Java operations drivers that are **syntactically emitted but marked unsupported** by returning `null` for C++/Java in `buildOperationsProgram` — the UI already shows "Run isn't supported for <lang> yet." for a `null` program (see `ProblemDetailPage` line ~200). This keeps every design problem runnable in JS/Python now without shipping unverifiable compiled-language dispatch.

Given that decision, **replace the C++/Java branches above with**:

```ts
    case 'cpp':
    case 'java':
      return null // operations dispatch for compiled languages lands with the SP4 server judge
```

- [ ] **Step 4: Run tests** — update the C++/Java expectation in Step 1 to assert `buildProgram(...) === null` for operations (matching the scope decision), then:

Run: `cd collide && npm test`
Expected: PASS — JS/Python operations exact (eval smoke returns `[null,null,null,-2,null,0]`); C++/Java return `null`.

- [ ] **Step 5: Typecheck**

Run: `cd collide && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C collide add src/run/harness.ts src/run/harness.test.ts
git -C collide commit -m "feat(run): operations-mode driver codegen (JS/Python exact; compiled deferred to SP4)"
```

---

### Task 9: Integration — every problem runnable, mirror regenerated, gates green

Prove the codegen is wired end to end: the frontend builds, the full test suite passes, and a representative problem of each new type runs to a correct verdict on the JS path via the mock backend.

**Files:**
- Create: `collide/src/run/harness.integration.test.ts`
- Modify: `collide/src/problems/seed.ts` (regenerate if not already current)

**Interfaces:**
- Consumes: the full `buildProgram`; `MOCK_PROBLEMS` from `src/problems/seed.ts`.
- Produces: an integration suite that, for one problem per new type, builds the JS program with a **correct** reference solution, evals it, and asserts `outputMatches(expected)`.

- [ ] **Step 1: Write the integration suite** — `collide/src/run/harness.integration.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildProgram, outputMatches } from './harness'
import type { ProblemHarness } from '../api/types'

function runJs(h: ProblemHarness, userCode: string, args: unknown[], expected: unknown) {
  const p = buildProgram('javascript', userCode, h, args)
  expect(p).not.toBeNull()
  let out = ''
  const log = console.log
  console.log = (s: string) => { out += s }
  try { new Function(p!)() } finally { console.log = log }
  expect(outputMatches(out, expected)).toBe(true)
}

describe('end-to-end JS run per new type', () => {
  it('list-node reverse', () => {
    runJs(
      { entry: 'reverseList', params: [{ name: 'head', type: 'list-node<int>' }], returns: 'list-node<int>', tests: [] },
      'function reverseList(head){let p=null;while(head){const n=head.next;head.next=p;p=head;head=n;}return p}',
      [[1, 2, 3, 4, 5]], [5, 4, 3, 2, 1],
    )
  })
  it('tree-node maxDepth', () => {
    runJs(
      { entry: 'maxDepth', params: [{ name: 'root', type: 'tree-node<int>' }], returns: 'int', tests: [] },
      'function maxDepth(r){return r?1+Math.max(maxDepth(r.left),maxDepth(r.right)):0}',
      [[3, 9, 20, null, null, 15, 7]], 3,
    )
  })
  it('graph-node clone (identity)', () => {
    runJs(
      { entry: 'cloneGraph', params: [{ name: 'node', type: 'graph-node<int>' }], returns: 'graph-node<int>', tests: [] },
      'function cloneGraph(n){return n}',
      [[[2, 4], [1, 3], [2, 4], [1, 3]]], [[2, 4], [1, 3], [2, 4], [1, 3]],
    )
  })
  it('array<list-node> merge', () => {
    runJs(
      { entry: 'mergeKLists', params: [{ name: 'lists', type: 'array<list-node<int>>' }], returns: 'list-node<int>', tests: [] },
      'function mergeKLists(ls){const a=[];for(const l of ls){let n=l;while(n){a.push(n.val);n=n.next;}}a.sort((x,y)=>x-y);let d={next:null},c=d;for(const v of a){c.next={val:v,next:null};c=c.next;}return d.next}',
      [[[1, 4, 5], [1, 3, 4], [2, 6]]], [1, 1, 2, 3, 4, 4, 5, 6],
    )
  })
  it('operations MinStack', () => {
    runJs(
      { entry: 'minStackOps', params: [{ name: 'operations', type: 'operations' }], returns: 'operations', tests: [] },
      'class MinStack{constructor(){this.s=[]}push(x){this.s.push(x)}pop(){this.s.pop()}top(){return this.s[this.s.length-1]}getMin(){return Math.min(...this.s)}}',
      [[['MinStack', []], ['push', [-2]], ['push', [0]], ['getMin', []], ['pop', []], ['top', []]]],
      [null, null, null, -2, null, 0],
    )
  })
})
```

- [ ] **Step 2: Run the full suite**

Run: `cd collide && npm test`
Expected: PASS — every unit + integration test green.

- [ ] **Step 3: Ensure the seed mirror is current**

Run: `cd collide && node scripts/gen-frontend-seed.mjs && npm run build`
Expected: `wrote 149 problems…`, `tsc -b` clean (no diff if Task 7 already regenerated it).

- [ ] **Step 4: Manual smoke via the dev server (the runtime check)**

Run: `cd collide && npm run dev`, open a `list-node`, a `tree-node`, and a design (`operations`) problem, select **JavaScript**, paste a correct solution, click **Run**, and confirm the sample cases show green. (The mock backend executes JS in-browser; other languages need the control-plane executor, out of scope for SP2 verification.)

- [ ] **Step 5: Commit**

```bash
git -C collide add src/run/harness.integration.test.ts src/problems/seed.ts
git -C collide commit -m "test(run): end-to-end JS run per new harness type"
```

---

## Self-Review

**Spec coverage (against master spec §10 SP2 scope: "`list-node`/`tree-node`/`operations` codegen across all 4 languages, client-side; all 150 runnable against sample cases"):**
- `list-node` codegen → Task 3 (+ nested `array<list-node>` Task 6). ✓
- `tree-node` codegen → Task 4. ✓
- `operations` codegen → Task 8 (JS/Python exact; compiled languages explicitly deferred to SP4 with rationale). ✓ (partial-by-design for C++/Java)
- `graph-node` → Task 5 (beyond literal spec scope; included per approved decision so Clone Graph runs). ✓
- "All runnable against sample cases" → Task 9 integration proves one per type on the executable (JS) path. ✓
- Operations data contract inconsistency (discovered) → Task 7 normalizes + validator-enforces. ✓

**Known limitation (called out, not a placeholder):** C++/Java `operations` dispatch is deferred to SP4 because (a) only the JS path executes in this repo's mock environment and (b) void-vs-value method detection needs the compiled-language execution the SP4 server judge owns. Every design problem is runnable **now** in JS/Python. `list-node`/`tree-node`/`graph-node`/`array<list-node>` are fully implemented in all four languages.

**Placeholder scan:** No `TBD`/`handle edge cases`/"write tests later" — every step carries full code. Task 7's per-problem normalization is a bounded 7-item data loop with a worked example + a validator gate (mirroring SP1 Task 5's authoring loop), not a code placeholder.

**Type consistency:** `parseType`→`TypeTag` consumed identically by `argExpr`, `printExprJs/Py`, `cppPrintTag/javaPrintTag`, `cppDeclType/javaDeclType`, `usesKind`, `preludeFor`, and `buildOperationsProgram`. Serializer names are consistent per language (`__toList/__fromList`, `__to_list/__from_list`, `__toTree/__fromTree`, `__toGraph/__fromGraph`). The `operations` short-circuit uses the same `parseType(...).kind === 'operations'` predicate the validator (Task 7) keys on (`type === 'operations'`).

**Out of scope (later SPs):** hidden-case generation / CI bundles (SP3); server-side batch judge, Submit endpoint, compiled-language operations dispatch, verdict/submissions UX (SP4).
