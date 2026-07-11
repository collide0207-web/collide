import { readFileSync } from 'node:fs'

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const JUDGE_RE = /^(exact|unordered|float:[0-9.eE+-]+|custom:[a-z0-9-]+)$/

/** Returns an array of "slug: message" error strings ([] when the seed is valid). */
export function validateSeed(problems) {
  const errors = []
  const slugs = new Set()
  if (!Array.isArray(problems)) return ['<root>: seed must be a JSON array']
  for (const p of problems) {
    const slug = p?.slug ?? '<no-slug>'
    const err = (m) => errors.push(`${slug}: ${m}`)
    for (const f of ['id', 'slug', 'title', 'difficulty', 'category']) {
      if (typeof p?.[f] !== 'string' || !p[f]) err(`missing/empty field "${f}"`)
    }
    if (slugs.has(slug)) err('duplicate slug')
    slugs.add(slug)
    if (p?.difficulty && !DIFFICULTIES.has(p.difficulty)) err(`bad difficulty "${p.difficulty}"`)
    if (p?.sheet && p.sheet !== 'leetcode150') err(`sheet must be "leetcode150"`)
    const h = p?.harness
    if (h) {
      if (typeof h.entry !== 'string' || !h.entry) err('harness.entry missing')
      if (!Array.isArray(h.params)) err('harness.params must be an array')
      if (!Array.isArray(h.tests) || h.tests.length === 0) err('harness needs >=1 sample test')
      if (h.judge && !JUDGE_RE.test(h.judge)) err(`bad judge spec "${h.judge}"`)
      if (Array.isArray(h.params) && Array.isArray(h.tests)) {
        for (const [i, t] of h.tests.entries()) {
          if (!Array.isArray(t?.input)) { err(`test[${i}].input must be an array`); continue }
          if (t.input.length !== h.params.length)
            err(`test[${i}] arity ${t.input.length} != ${h.params.length} params`)
        }
      }
      // Design problems (operations mode) carry a canonical op sequence:
      //   input[0] = [[Ctor,[args]], [method,[args]], ...]; expected is a same-length array.
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
    }
  }
  return errors
}

// CLI entry
const path = process.argv[2]
if (path) {
  const errors = validateSeed(JSON.parse(readFileSync(path, 'utf8')))
  if (errors.length) { errors.forEach((e) => console.error(e)); process.exit(1) }
  console.log('seed valid')
}
