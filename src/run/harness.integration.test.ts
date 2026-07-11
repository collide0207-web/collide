import { describe, expect, it } from 'vitest'
import { buildProgram, hasHarness, outputMatches, parseType } from './harness'
import type { ProblemHarness } from '../api/types'
import { MOCK_PROBLEMS } from '../problems/seed'

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
      [null, null, null, -2, null, -2],
    )
  })
})

describe('whole-catalogue codegen smoke (every seeded problem, every sample)', () => {
  const harnessed = MOCK_PROBLEMS.filter((p) => hasHarness(p.harness))

  it('covers the full LeetCode 150 catalogue', () => {
    expect(harnessed.length).toBeGreaterThan(140)
  })

  for (const p of harnessed) {
    it(`${p.slug}: buildProgram never throws for any sample × language`, () => {
      const h = p.harness as ProblemHarness
      const isOps = h.params.length === 1 && parseType(h.params[0].type).kind === 'operations'
      for (const t of h.tests) {
        for (const lang of ['javascript', 'python', 'cpp', 'java']) {
          const program = buildProgram(lang, p.starterCode[lang] ?? '', h, t.input)
          // JS/Python always produce a program; compiled ops are the only intended nulls.
          if (isOps && (lang === 'cpp' || lang === 'java')) {
            expect(program).toBeNull()
          } else {
            expect(program, `${p.slug}/${lang}`).not.toBeNull()
          }
        }
      }
    })
  }
})
